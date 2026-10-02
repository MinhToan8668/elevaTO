// Phần trang link-in-bio trong backend Apps Script của trang khoá học (backend/Code.gs):
// chạy file .gs thật trong sandbox Node với Sheet / Properties / Cache giả lập.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PATH = new URL('../../backend/Code.gs', import.meta.url).pathname;
const KEY = '0b7c1e2a-4f5d-4c3b-9a8e-112233445566';

const chainable = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => chainable(t)) });

function load() {
  const props = { ADMIN_KEY: KEY, TG_BOT_TOKEN: 'bot', TG_ADMIN_IDS: '42' };
  const cache = {};
  const sent = [];
  const sheets = [];
  const sheetApi = (sh) => ({
    getName: () => sh.name,
    getLastRow: () => sh.rows.length,
    appendRow: (r) => sh.rows.push([...r]),
    hideSheet: () => { sh.hidden = true; },
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => sh.rows.map((r) => [...r]) }),
    // Các hàm định dạng (setFontWeight, setBackground…) không quan trọng ở đây: gọi gì cũng trả lại chính nó.
    getRange: (r, c, nr = 1, nc = 1) => chainable({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      setValues: (vs) => vs.forEach((row, i) => row.forEach((v, j) => {
        // Sheet thật đổi chuỗi trông như số thành số — mô phỏng để chắc tiền tố "~" có tác dụng.
        const cell = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
        (sh.rows[r - 1 + i] ||= [])[c - 1 + j] = cell;
      })),
    }),
  });
  const book = {
    getSheetByName: (n) => { const s = sheets.find((x) => x.name === n); return s ? sheetApi(s) : null; },
    insertSheet: (n) => { const s = { name: n, rows: [] }; sheets.push(s); return sheetApi(s); },
  };
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; },
    }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    UrlFetchApp: { fetch: (url, o) => { sent.push({ url, body: JSON.parse(o.payload || '{}') }); return { getContentText: () => '{"ok":true,"result":{}}', getResponseCode: () => 200 }; } },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Utilities: { formatDate: () => '02/10/2026 10:00', getUuid: () => 'uuid' },
    Logger: { log: (m) => { if (process.env.GASLOG) console.log(m); } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  return {
    ctx, props, cache, sent, sheets,
    get: (p) => JSON.parse(ctx.doGet({ parameter: p })),
    post: (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } })),
  };
}

const PAGE = { profile: { name: 'Minh Toàn' }, links: [{ id: 'a', title: 'Giá 3000000', url: '../' }], meta: { title: '=SUM(A1)' } };

test('chưa lưu lần nào → trang đọc được data: null (trang tự dùng data.json)', () => {
  const g = load();
  assert.deepEqual(g.get({ action: 'links' }), { ok: true, data: null, updatedAt: '' });
});

test('lưu đúng key → đọc lại nguyên vẹn; sheet được ẩn', () => {
  const g = load();
  assert.deepEqual(g.post({ action: 'saveLinks', key: KEY, data: PAGE }), { ok: true, updatedAt: '02/10/2026 10:00' });
  const r = g.get({ action: 'links' });
  assert.deepEqual(r.data, PAGE);
  assert.equal(r.updatedAt, '02/10/2026 10:00');
  assert.equal(g.sheets.find((s) => s.name === 'LinksData').hidden, true);
});

test('nội dung lớn (ảnh nhúng) được chia nhiều ô; lưu bản ngắn hơn thì xoá phần thừa', () => {
  const g = load();
  const big = { ...PAGE, profile: { name: 'x', avatar: 'data:image/webp;base64,' + 'A'.repeat(130000) } };
  g.post({ action: 'saveLinks', key: KEY, data: big });
  const sh = g.sheets.find((s) => s.name === 'LinksData');
  assert.ok(sh.rows.length >= 3);
  assert.ok(sh.rows.every((r) => String(r[0]).length <= 45001));
  assert.deepEqual(g.get({ action: 'links' }).data, big);
  g.post({ action: 'saveLinks', key: KEY, data: PAGE });
  assert.deepEqual(g.get({ action: 'links' }).data, PAGE);
});

test('ô có nội dung trông như số / công thức không bị Sheet đổi (nhờ tiền tố ~)', () => {
  const g = load();
  // Cắt sao cho một ô bắt đầu bằng chuỗi toàn số.
  const page = { ...PAGE, meta: { title: 'x'.repeat(45000 - '{"profile":{"name":"Minh Toàn"},"links":[{"id":"a","title":"Giá 3000000","url":"../"}],"meta":{"title":"'.length) + '12345' } };
  g.post({ action: 'saveLinks', key: KEY, data: page });
  assert.deepEqual(g.get({ action: 'links' }).data, page);
});

test('sai key → không lưu; dò key quá nhiều lần → tạm khoá', () => {
  const g = load();
  assert.deepEqual(g.post({ action: 'saveLinks', key: 'sai', data: PAGE }), { ok: false, error: 'unauthorized' });
  assert.equal(g.get({ action: 'links' }).data, null);
  for (let i = 0; i < 25; i += 1) g.post({ action: 'checkKey', key: 'sai' + i });
  assert.deepEqual(g.post({ action: 'checkKey', key: KEY }), { ok: false, error: 'locked' });
});

test('checkKey: đúng key → ok', () => {
  const g = load();
  assert.deepEqual(g.post({ action: 'checkKey', key: KEY }), { ok: true });
  assert.deepEqual(g.post({ action: 'checkKey', key: '' }), { ok: false, error: 'unauthorized' });
});

test('dữ liệu không đúng dạng trang link hoặc quá lớn → từ chối', () => {
  const g = load();
  assert.equal(g.post({ action: 'saveLinks', key: KEY, data: { links: 'x' } }).error, 'invalid');
  assert.equal(g.post({ action: 'saveLinks', key: KEY, data: null }).error, 'invalid');
  const huge = { ...PAGE, meta: { title: 'x'.repeat(2000001) } };
  assert.equal(g.post({ action: 'saveLinks', key: KEY, data: huge }).error, 'too_large');
});

test('bot: /linkkey gửi key cho admin; /menu có dòng hướng dẫn', () => {
  const g = load();
  g.ctx.handleTelegram({ message: { chat: { id: 42 }, text: '/linkkey' } });
  assert.ok(g.sent.some((m) => String(m.body.text).includes(KEY)));
  g.ctx.handleTelegram({ message: { chat: { id: 42 }, text: '/menu' } });
  assert.ok(g.sent.some((m) => String(m.body.text).includes('/linkkey')));
});

test('người lạ nhắn /linkkey → không nhận được key', () => {
  const g = load();
  g.ctx.handleTelegram({ message: { chat: { id: 999 }, text: '/linkkey' } });
  assert.ok(g.sent.every((m) => !String(m.body.text).includes(KEY)));
});

test('các API cũ của trang khoá học vẫn chạy', () => {
  const g = load();
  assert.equal(g.get({ action: 'config' }).ok, true);
  assert.equal(g.get({ action: 'regs', key: 'sai' }).error, 'unauthorized');
});
