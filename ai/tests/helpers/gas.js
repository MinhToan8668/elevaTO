// Nạp một file Apps Script (.gs) vào sandbox Node với các dịch vụ Google giả lập.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

// Google Sheets giả: mỗi sheet là mảng các dòng.
function fakeSheets() {
  const books = {};
  let n = 0;
  const sheetApi = (sh) => ({
    getName: () => sh.name,
    setName: (x) => { sh.name = x; },
    getLastRow: () => sh.rows.length,
    getLastColumn: () => Math.max(0, ...sh.rows.map((r) => r.length)),
    appendRow: (r) => { sh.rows.push([...r]); },
    setFrozenRows: () => {},
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      getValue: () => sh.rows[r - 1]?.[c - 1] ?? '',
      setValue: (v) => { (sh.rows[r - 1] ||= [])[c - 1] = v; },
      setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => { (sh.rows[r - 1 + i] ||= [])[c - 1 + j] = v; })),
      setFontWeight: function () { return this; },
    }),
    getDataRange: () => ({ getValues: () => sh.rows.map((r) => [...r]) }),
  });
  const bookApi = (b) => ({
    getId: () => b.id,
    getUrl: () => `https://docs.google.com/spreadsheets/d/${b.id}`,
    getSheets: () => b.sheets.map(sheetApi),
    getSheetByName: (name) => { const s = b.sheets.find((x) => x.name === name); return s ? sheetApi(s) : null; },
    insertSheet: (name) => { const s = { name, rows: [] }; b.sheets.push(s); return sheetApi(s); },
  });
  return {
    books,
    api: {
      create: (name) => { const id = `ss${++n}`; books[id] = { id, name, sheets: [{ name: 'Sheet1', rows: [] }] }; return bookApi(books[id]); },
      openById: (id) => { if (!books[id]) throw new Error('Không tìm thấy bảng tính ' + id); return bookApi(books[id]); },
    },
  };
}

const toSigned = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));

export function loadGas(path, opts = {}) {
  const props = { ...(opts.props || {}) };
  const cache = {};
  const calls = [];
  const logs = [];
  const sheets = fakeSheets();
  const triggers = [];
  const mails = [];                                  // thư MailApp đã gửi (mã đặt lại mật khẩu)
  let now = opts.now || Date.parse('2026-09-30T03:00:00Z');
  const resp = (code, body = '', headers = {}) => ({
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    getHeaders: () => headers,
  });
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; }, getProperties: () => ({ ...props }),
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache[k] && cache[k].exp > now ? cache[k].v : null),
      put: (k, v, ttl) => { cache[k] = { v: String(v), exp: now + (ttl || 600) * 1000 }; },
      remove: (k) => { delete cache[k]; },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    UrlFetchApp: { fetch: (url, o = {}) => { calls.push({ url, o }); return opts.fetch(url, o, resp); } },
    SpreadsheetApp: sheets.api,
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.fn })),
      deleteTrigger: (t) => { const i = triggers.findIndex((x) => x.fn === t.getHandlerFunction()); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => { const b = { timeBased: () => b, everyMinutes: (n) => { b.n = n; return b; }, create: () => { triggers.push({ fn, n: b.n }); return {}; } }; return b; },
    },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d) => new Date(d).toISOString().slice(0, 10),
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => toSigned(crypto.createHash(alg).update(String(s), 'utf8').digest()),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64url'),
    },
    MailApp: { sendEmail: (o) => { if (opts.mailThrow) throw new Error(opts.mailThrow); mails.push(o); } },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Logger: { log: (m) => logs.push(String(m)) },
    console: { error: (m) => logs.push(String(m)), log: () => {} },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path, 'utf8'), ctx, { filename: path });
  return {
    ctx, props, cache, calls, logs, triggers, mails, books: sheets.books,
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })),
    tick: (ms) => { now += ms; },
    run: (code) => vm.runInContext(code, ctx),
  };
}
