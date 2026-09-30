// Nạp một file Apps Script (.gs) vào sandbox Node với các dịch vụ Google giả lập.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

export function loadGas(path, opts = {}) {
  const props = { ...(opts.props || {}) };
  const cache = {};
  const calls = [];
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
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: (d) => new Date(d).toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Logger: { log: () => {} },
    console: { error: () => {}, log: () => {} },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path, 'utf8'), ctx, { filename: path });
  return {
    ctx, props, cache, calls,
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } })),
    tick: (ms) => { now += ms; },
    run: (code) => vm.runInContext(code, ctx),
  };
}
