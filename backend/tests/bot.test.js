// Bot Telegram: chế độ webhook (tức thì) và lịch canh giữ cho nó không chết âm thầm.
// Chạy backend/Code.gs thật trong sandbox Node với các dịch vụ Google giả lập.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PATH = new URL('../Code.gs', import.meta.url).pathname;
const EXEC = 'https://script.google.com/macros/s/AKfycbwHtZ-rxyJuDxtDRIVaCSDZc-0t6R0Acsx4C16shB0WXXFCgm73smcHUDOhn6GlilPF/exec';
const NOW = Date.parse('2026-10-02T10:00:00Z');
const chainable = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => chainable(t)) });

/**
 * @param hookInfo kết quả getWebhookInfo giả lập
 * @param opts.setOk setWebhook có thành công không; opts.execOk /exec có trả 200 không
 */
function load(hookInfo, { setOk = true, execOk = true, triggers = [] } = {}) {
  const props = { ADMIN_KEY: 'k', TG_BOT_TOKEN: 'bot', TG_ADMIN_IDS: '42' };
  const sent = [];
  const list = triggers.map((fn) => ({ fn }));
  const sheets = [];
  const sheetApi = (sh) => ({
    getName: () => sh.name, getLastRow: () => sh.rows.length, appendRow: (r) => sh.rows.push(r),
    getRange: () => chainable({ getValues: () => [[]], setValues: () => {} }),
    getDataRange: () => ({ getValues: () => sh.rows.map((r) => [...r]) }),
  });
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; },
    }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => { const s = sheets.find((x) => x.name === n); return s ? sheetApi(s) : null; },
      insertSheet: (n) => { const s = { name: n, rows: [] }; sheets.push(s); return sheetApi(s); },
    }) },
    ScriptApp: {
      getProjectTriggers: () => list.map((t) => ({ getHandlerFunction: () => t.fn, t })),
      deleteTrigger: (h) => { const i = list.indexOf(h.t); if (i >= 0) list.splice(i, 1); },
      newTrigger: (fn) => { const b = { timeBased: () => b, everyMinutes: () => b, create: () => { list.push({ fn }); return {}; } }; return b; },
    },
    UrlFetchApp: { fetch: (url, o = {}) => {
      // /exec: Apps Script luôn chuyển hướng sang googleusercontent rồi mới trả nội dung.
      if (url === EXEC) {
        return chainable({
          getResponseCode: () => 302,
          getAllHeaders: () => ({ Location: execOk ? 'https://script.googleusercontent.com/macros/echo?x=1' : 'https://accounts.google.com/signin' }),
        });
      }
      const method = url.split('/').pop();
      sent.push({ method, body: JSON.parse(o.payload || '{}') });
      const result = method === 'getWebhookInfo' ? hookInfo : (method === 'getUpdates' ? [] : true);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: method === 'setWebhook' ? setOk : true, result }) };
    } },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Utilities: { formatDate: () => '02/10/2026 10:00', getUuid: () => 'uuid' },
    Logger: { log: () => {} },
    console: { error: () => {} },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  return { ctx, sent, props, triggers: list };
}

const tren = (list) => list.map((t) => t.fn).sort();
const daGui = (sent, method) => sent.filter((m) => m.method === method);
const nhan = (sent) => daGui(sent, 'sendMessage').map((m) => String(m.body.text)).join('\n');
const giay = (phut) => Math.floor(NOW / 1000) - phut * 60;

test('webhook đang chạy tốt → lịch canh không đụng gì', () => {
  const g = load({ url: EXEC, pending_update_count: 0 }, { triggers: ['canhWebhook'] });
  g.ctx.canhWebhook();
  assert.deepEqual(daGui(g.sent, 'setWebhook'), []);
  assert.deepEqual(tren(g.triggers), ['canhWebhook']);
});

test('Telegram báo lỗi cũ nhưng không có tin ùn → vẫn coi là bình thường', () => {
  const g = load({ url: EXEC, pending_update_count: 0, last_error_date: giay(5), last_error_message: 'Wrong response: 302' });
  g.ctx.canhWebhook();
  assert.deepEqual(daGui(g.sent, 'setWebhook'), []);
});

test('webhook hỏng (lỗi mới + tin ùn) → tự nối lại, báo admin, vẫn ở chế độ webhook', () => {
  const g = load({ url: EXEC, pending_update_count: 3, last_error_date: giay(2) }, { triggers: ['canhWebhook'] });
  g.ctx.canhWebhook();
  const set = daGui(g.sent, 'setWebhook');
  assert.equal(set.length, 1);
  assert.equal(set[0].body.url, EXEC);
  assert.equal(set[0].body.drop_pending_updates, false);     // đừng vứt tin chưa xử lý
  assert.match(nhan(g.sent), /tự nối lại/);
  assert.deepEqual(tren(g.triggers), ['canhWebhook']);
});

test('nối lại không được (/exec hỏng) → lùi về chế độ hỏi định kỳ, bot không câm', () => {
  const g = load({ url: EXEC, pending_update_count: 3, last_error_date: giay(2) },
    { execOk: false, triggers: ['canhWebhook'] });
  g.ctx.canhWebhook();
  assert.deepEqual(tren(g.triggers), ['hoiTelegram']);        // đổi lịch canh → lịch hỏi
  assert.match(nhan(g.sent), /hỏi định kỳ/);
  assert.ok(daGui(g.sent, 'deleteWebhook').length, 'phải ngắt webhook trước khi hỏi định kỳ');
});

test('webhook đã bị gỡ (đang chạy chế độ hỏi) → lịch canh tự dọn mình đi', () => {
  const g = load({ url: '', pending_update_count: 0 }, { triggers: ['canhWebhook', 'hoiTelegram'] });
  g.ctx.canhWebhook();
  assert.deepEqual(tren(g.triggers), ['hoiTelegram']);
  assert.deepEqual(daGui(g.sent, 'setWebhook'), []);
});

test('Telegram không trả lời (mạng lỗi) → để yên, chờ lượt sau', () => {
  const g = load(null, { triggers: ['canhWebhook'] });
  g.ctx.tgApi = () => null;
  g.ctx.canhWebhook();
  assert.deepEqual(tren(g.triggers), ['canhWebhook']);
});

test('noiWebhook: nối xong thì dựng lịch canh, gỡ lịch hỏi (tránh xử lý trùng)', () => {
  const g = load({ url: EXEC }, { triggers: ['hoiTelegram'] });
  g.ctx.noiWebhook();
  assert.deepEqual(tren(g.triggers), ['canhWebhook']);
  assert.equal(daGui(g.sent, 'setWebhook').length, 1);
});

test('batCheDoHoi: về chế độ hỏi thì gỡ lịch canh, chỉ còn đúng một lịch hỏi', () => {
  const g = load({ url: EXEC }, { triggers: ['canhWebhook', 'hoiTelegram', 'hoiTelegram'] });
  g.ctx.batCheDoHoi();
  assert.deepEqual(tren(g.triggers), ['hoiTelegram']);
});

test('dungBot: gỡ sạch mọi lịch, không còn gì tự nối webhook lại', () => {
  const g = load({ url: EXEC }, { triggers: ['canhWebhook', 'hoiTelegram'] });
  g.ctx.dungBot();
  assert.deepEqual(tren(g.triggers), []);
  assert.ok(daGui(g.sent, 'deleteWebhook').length);
});
