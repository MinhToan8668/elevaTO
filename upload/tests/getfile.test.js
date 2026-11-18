// Xin vé Tải thẳng phải chịu được Telegram nghẽn. Thực tế: Apps Script gọi getFile cho cả 27 phần
// một lượt, một phần trả "Gateway Timeout" là bỏ luôn cả lần tải — người dùng thấy
// "Telegram không cho đường dẫn phần 1 (Gateway Timeout)".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PATH = new URL('../backend/Code.gs', import.meta.url).pathname;

/**
 * Nạp Code.gs với UrlFetchApp giả. kichBan(file_id, lanHoi) trả { ma, body } cho từng lần hỏi
 * getFile của một phần (lanHoi đếm từ 1, riêng cho phần đó).
 */
function nap(kichBan) {
  const dot = [], ngu = [], dem = {};
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
    Utilities: { sleep: (ms) => ngu.push(ms) },
    Logger: { log() {} }, console: { error() {} },
    UrlFetchApp: {
      fetchAll: (ds) => {
        dot.push(ds.length);
        return ds.map((y) => {
          const fid = JSON.parse(y.payload).file_id;
          dem[fid] = (dem[fid] || 0) + 1;
          const { ma, body } = kichBan(fid, dem[fid]);
          return { getResponseCode: () => ma, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) };
        });
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  return { ctx, dot, ngu, dem };
}

const OK = (fid) => ({ ma: 200, body: { ok: true, result: { file_path: `documents/${fid}.mp4` } } });
const IDS = Array.from({ length: 27 }, (_, i) => `f${i + 1}`);

test('hỏi theo từng đợt nhỏ, không dồn cả 27 phần vào một lượt', () => {
  const { ctx, dot } = nap(OK);
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong.length, 27);
  assert.ok(duong.every((d, i) => d === `documents/f${i + 1}.mp4`), 'đúng thứ tự từng phần');
  assert.ok(Math.max(...dot) <= 8, `đợt lớn nhất ${Math.max(...dot)} phần`);
});

test('Gateway Timeout ở một phần → hỏi lại phần đó ở vòng sau, vé vẫn đủ', () => {
  const { ctx, dem, ngu } = nap((fid, lan) => (fid === 'f1' && lan === 1
    ? { ma: 504, body: { ok: false, error_code: 504, description: 'Gateway Timeout' } } : OK(fid)));
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong[0], 'documents/f1.mp4');
  assert.equal(dem.f1, 2, 'chỉ hỏi lại đúng phần lỗi');
  assert.equal(dem.f2, 1);
  assert.deepEqual(ngu, [1500], 'chờ một chút trước khi hỏi lại');
});

test('trả về trang HTML lỗi (không phải JSON), 502, 429 có retry_after → đều coi là lỗi tạm', () => {
  const { ctx, ngu } = nap((fid, lan) => {
    if (lan > 1) return OK(fid);
    if (fid === 'f1') return { ma: 502, body: '<html>Bad Gateway</html>' };
    if (fid === 'f2') return { ma: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } } };
    return OK(fid);
  });
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong[0], 'documents/f1.mp4');
  assert.equal(duong[1], 'documents/f2.mp4');
  assert.deepEqual(ngu, [7000], 'Telegram bảo chờ 7 giây thì chờ đúng 7 giây');
});

test('lỗi THẬT (file_id sai) thì báo ngay, không chờ không thử lại', () => {
  const { ctx, ngu } = nap((fid) => (fid === 'f3'
    ? { ma: 400, body: { ok: false, error_code: 400, description: 'Bad Request: wrong file_id' } } : OK(fid)));
  assert.throws(() => ctx.xinDuongDan('tok', IDS), /phần 3 \(Bad Request: wrong file_id\)/);
  assert.deepEqual(ngu, []);
});

test('nghẽn mãi không hết → để trống phần đó cho Worker tự xin bù, KHÔNG bỏ cả lần tải', () => {
  const { ctx, dem, ngu } = nap((fid) => (fid === 'f5'
    ? { ma: 504, body: { ok: false, error_code: 504, description: 'Gateway Timeout' } } : OK(fid)));
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong[4], '');
  assert.equal(duong.filter(Boolean).length, 26);
  assert.equal(dem.f5, 4, 'hỏi tối đa 4 vòng');
  assert.deepEqual(ngu, [1500, 3000, 4500], 'chờ tăng dần, không chờ thừa sau vòng cuối');
});

test('cả đợt mất kết nối (fetchAll ném lỗi) → hỏi lại cả đợt ở vòng sau', () => {
  let lanGoi = 0;
  const { ctx } = nap(OK);
  const that = ctx.UrlFetchApp.fetchAll;
  ctx.UrlFetchApp.fetchAll = (ds) => { if (++lanGoi === 1) throw new Error('Address unavailable'); return that(ds); };
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.ok(duong.every(Boolean));
});

// ─── Trần 44 phần chỉ dành cho luồng MỘT LẦN ─────────────────────────────────────
// Tải từng phần (Chrome/Edge ghép trên máy) mỗi phần một lần gọi Worker riêng, không vướng trần
// 50 subrequest — Apps Script không được chặn file lớn ở đường này.

function napKho(props, n) {
  // Đúng khoá Code.gs dùng: TGLIB_<id> cho kho, file_id gói 40 mã một ô TGFID_<id>_<ô>.
  const all = { ...props, TGLIB_a1: JSON.stringify({ id: 'a1', name: 'Buoi 9.mp4', size: n * 19 * 1048576, parts: n, date: 1 }) };
  for (let o = 0; o * 40 < n; o++) all[`TGFID_a1_${o}`] = JSON.stringify(Array.from({ length: Math.min(40, n - o * 40) }, (_, k) => `f${o * 40 + k}`));
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => all[k] ?? null, getProperties: () => all, setProperty() {}, deleteProperty() {},
    }) },
    Utilities: {
      sleep() {}, base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      newBlob: (s) => ({ getBytes: () => [...Buffer.from(s)] }), computeHmacSha256Signature: () => [1, 2, 3],
    },
    Logger: { log() {} }, console: { error() {} },
    UrlFetchApp: { fetchAll: (ds) => ds.map((y) => ({ getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true, result: { file_path: `documents/${JSON.parse(y.payload).file_id}.mp4` } }) })) },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  ctx.kiemKey = () => {};
  return ctx;
}
const CAI = { UPLOAD_KEY: 'k', TG_BOT_TOKEN: 'tok', TAIVE_WORKER_URL: 'https://w.example/taive', TAIVE_SECRET: 'x'.repeat(24) };

test('file 60 phần: danh sách vẫn cho Tải thẳng (từng phần), chỉ tắt cờ một luồng', () => {
  const ctx = napKho(CAI, 60);
  const [it] = ctx.khoDanhSach('k');
  assert.equal(it.thang, true, 'Chrome/Edge tải từng phần được — phải hiện nút');
  assert.equal(it.thang1, false, 'một luồng vướng trần 44 phần');
  const [nho] = napKho(CAI, 29).khoDanhSach('k');
  assert.equal(nho.thang1, true);
});

test('xin vé từng phần cho file 60 phần được; xin vé một luồng thì vẫn bị chặn', () => {
  const ctx = napKho(CAI, 60);
  const ve = ctx.khoVeTaiThang('k', 'a1', true);
  const ruot = JSON.parse(Buffer.from(ve.d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  assert.equal(ruot.f.length, 60);
  assert.throws(() => ctx.khoVeTaiThang('k', 'a1', false), /tối đa 44/);
});

// ─── Lỗi Google Drive phải nói được LÝ DO ─────────────────────────────────────────
// Người dùng thấy "Lỗi: Drive 403" trơn. 403 hay nhất là Drive đầy — mà file trong Thùng rác vẫn
// tính dung lượng — nên câu báo phải nói thẳng để biết đường dọn.

test('loiDrive: Drive đầy / giới hạn tốc độ / lỗi khác đều có lý do', () => {
  const { ctx } = nap(OK);
  const res = (ma, body) => ({ getResponseCode: () => ma, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  assert.match(ctx.loiDrive(res(403, { error: { code: 403, errors: [{ reason: 'storageQuotaExceeded' }], message: 'The user has exceeded their Drive storage quota' } })), /Drive đã đầy.*Thùng rác/);
  assert.match(ctx.loiDrive(res(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } })), /giới hạn tốc độ/);
  assert.equal(ctx.loiDrive(res(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } })), 'Drive 403 (insufficientPermissions)');
  assert.equal(ctx.loiDrive(res(500, '<html>lỗi</html>')), 'Drive 500', 'thân không phải JSON vẫn không vỡ');
});

// ─── Gửi thẳng lên Telegram (không qua Drive): vé ký ở đây, Worker kiểm và gửi ────────────────
import { createHmac } from 'node:crypto';
import { taiLen } from '../../ai/worker/src/taive.js';

const BI_MAT = 'bi-mat-thu-dai-hon-24-ky-tu-xx';
function napGui(them = {}) {
  const all = { UPLOAD_KEY: 'k', TG_BOT_TOKEN: 'tok', TG_CHAT_ID: '-100777', TAIVE_WORKER_URL: 'https://w.example/taive', TAIVE_SECRET: BI_MAT, ...them };
  const nhan = [];
  const b64 = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => all[k] ?? null, getProperties: () => all,
      setProperty: (k, v) => { all[k] = String(v); }, setProperties: (o) => Object.assign(all, o), deleteProperty: (k) => { delete all[k]; },
    }) },
    Utilities: {
      sleep() {}, getUuid: () => '0123abcd-4567-89ef-0123-456789abcdef',
      base64EncodeWebSafe: b64,
      base64DecodeWebSafe: (s) => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')],
      newBlob: (x) => ({ getBytes: () => [...Buffer.from(x)], getDataAsString: () => Buffer.from(x).toString('utf8') }),
      computeHmacSha256Signature: (d, k) => [...createHmac('sha256', k).update(d).digest()],
    },
    Logger: { log() {} }, console: { error() {} },
    UrlFetchApp: { fetch: (u, o) => { nhan.push(JSON.parse(o.payload).text); return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' }; } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  ctx.kiemKey = () => {};
  ctx.guiTelegram = (t) => nhan.push(t);
  return { ctx, all, nhan };
}
const ruotVe = (d) => JSON.parse(Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

test('vé gửi: đúng số phần 19MB, chat, đường /tailen; tên bẩn được làm sạch', () => {
  const { ctx } = napGui();
  const v = ctx.guiVe('k', { name: 'a/b\u0001c.mp4', size: 540 * 1048576 });
  assert.equal(v.url, 'https://w.example/tailen');
  assert.equal(v.parts, 29);
  assert.equal(v.ps, 19 * 1048576);
  const r = ruotVe(v.d);
  assert.deepEqual([r.k, r.n, r.s, r.p, r.c], ['up', 'a b c.mp4', 540 * 1048576, 29, '-100777']);
  assert.ok(r.e > Date.now() + 3600000, 'vé đủ dài cho file lớn mạng chậm');
  assert.throws(() => ctx.guiVe('k', { name: 'x', size: 0 }), /không hợp lệ/);
  assert.throws(() => ctx.guiVe('k', { name: 'x', size: 3 * 1024 ** 3 }), /lớn quá/);
  assert.throws(() => napGui({ TAIVE_SECRET: null }).ctx.guiVe('k', { name: 'x', size: 5 }), /Chưa cài Worker/);
});

test('vé Apps Script ký được Worker nhận thật (cùng bí mật, cùng kiểu base64)', async () => {
  const { ctx } = napGui();
  const v = ctx.guiVe('k', { name: 'Buổi 3.mp4', size: 10 });
  const goc = globalThis.fetch;
  let gui;
  globalThis.fetch = async (u, o) => { gui = o.body; return new Response(JSON.stringify({ ok: true, result: { message_id: 5, document: { file_id: 'FID_abcdefghij' } } })); };
  try {
    const q = new URL(v.url); q.searchParams.set('d', v.d); q.searchParams.set('s', v.s); q.searchParams.set('i', '0');
    const res = await taiLen(new Request(q, { method: 'POST', body: new Uint8Array(10), headers: { 'content-length': '10' } }),
      { UPLOAD_TG_TOKEN: 'tok', TAIVE_SECRET: BI_MAT });
    const j = await res.json();
    assert.equal(res.status, 200, JSON.stringify(j));
    assert.equal(j.fid, 'FID_abcdefghij');
    assert.equal(gui.get('chat_id'), '-100777');
  } finally { globalThis.fetch = goc; }
});

test('gửi xong: ghi vào kho + mã từng phần (đủ cho Tải thẳng), làm lại không ghi đôi; vé giả bị chặn', () => {
  const { ctx, all, nhan } = napGui();
  const v = ctx.guiVe('k', { name: 'Lớp.mp4', size: 45 * 19 * 1048576 });
  const fids = Array.from({ length: 45 }, (_, i) => `FID_phan_${String(i).padStart(3, '0')}`);
  assert.throws(() => ctx.guiXong('k', v.d, v.s, fids.slice(1)), /Thiếu mã file/);
  assert.throws(() => ctx.guiXong('k', v.d, v.s.slice(0, -3) + 'AAA', fids), /không hợp lệ/);
  assert.throws(() => ctx.guiXong('k', v.d, v.s, fids.map((f, i) => (i === 3 ? 'x y' : f))), /Thiếu mã file/);
  const r = ctx.guiXong('k', v.d, v.s, fids);
  assert.equal(r.id, v.id);
  const kho = JSON.parse(all['TGLIB_' + v.id]);
  assert.deepEqual([kho.name, kho.parts, kho.size], ['Lớp.mp4', 45, 45 * 19 * 1048576]);
  for (let i = 0; i < 45; i++) assert.equal(ctx.docFid(v.id, i), fids[i]);
  assert.equal(nhan.length, 1);
  ctx.guiXong('k', v.d, v.s, fids);
  assert.equal(nhan.length, 1, 'gửi lại câu xong không nhắn đôi');
  const [it] = ctx.khoDanhSach('k');
  assert.equal(it.id, v.id);
  assert.equal(it.thang, true, 'file gửi thẳng tải thẳng được ngay');
  // vé tải ký bằng cùng bí mật không được dùng làm vé gửi
  const veTai = ctx.khoVeTaiThang('k', v.id, true);
  assert.throws(() => ctx.guiXong('k', veTai.d, veTai.s, fids), /hỏng/);
});
