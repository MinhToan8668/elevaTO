// Công cụ upload phải từ chối cài vào dự án backend trang khoá học (dán nhầm là trang khoá học chết hẳn),
// và dán Code.gs bản mới không được bắt điền lại token — caiDat phải lấy bản đã cất trong Thuộc tính tập lệnh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PATH = new URL('../backend/Code.gs', import.meta.url).pathname;

function load(props) {
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; },
    }) },
    Utilities: { getUuid: () => 'uuid-moi' },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Logger: { log: () => {} },
    console: { error: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  return ctx;
}

test('cài vào dự án đã có cấu hình trang khoá học → dừng ngay, không đụng gì', () => {
  for (const props of [{ SITE_CONFIG: '{}' }, { TG_ADMIN_IDS: '123' }]) {
    const before = JSON.stringify(props);
    const ctx = load(props);
    assert.throws(() => ctx.caiDat(), /TRANG KHOÁ HỌC/);
    assert.equal(JSON.stringify(props), before);
  }
});

test('dự án mới (trống) → đi tiếp tới bước kiểm tra 3 dòng đầu file như cũ', () => {
  const ctx = load({});
  assert.throws(() => ctx.caiDat(), /Chưa điền TG_TOKEN/);
});

// Chạy caiDat qua được bước kiểm cấu hình: chặn các bước gọi Drive / Telegram phía sau lại.
function caiDatKho(ctx) {
  const goi = [];
  ctx.thuMucUpload = () => 'folder-1';
  ctx.datLichChuyen = () => {};
  ctx.guiTelegram = (t) => { goi.push(t); return { ok: true }; };
  ctx.caiDat();
  return goi;
}

const DA_CAT = { TG_BOT_TOKEN: 'tok-cu', TG_CHAT_ID: '123', WEBAPP_URL: 'https://script.google.com/macros/s/AAA/exec' };

test('dán Code.gs bản mới, để nguyên DAN_… ở đầu file → caiDat dùng bản đã cất, không bắt điền lại', () => {
  const props = { ...DA_CAT, UPLOAD_KEY: 'key-cu' };
  const ctx = load(props);
  const goi = caiDatKho(ctx);
  assert.equal(props.TG_BOT_TOKEN, 'tok-cu');
  assert.equal(props.TG_CHAT_ID, '123');
  assert.equal(props.UPLOAD_KEY, 'key-cu', 'key không đổi — link cũ vẫn dùng được');
  // Link trang lấy WEBAPP_URL từ bản đã cất chứ không phải chữ DAN_URL_EXEC ở đầu file.
  assert.match(goi[0], /#api=https%3A%2F%2Fscript\.google\.com%2Fmacros%2Fs%2FAAA%2Fexec&key=key-cu/);
  assert.doesNotMatch(ctx.linkTrang(), /DAN_/);
});

test('điền thẳng vào Thuộc tính tập lệnh (TG_BOT_TOKEN, TG_CHAT_ID, WEBAPP_URL) cũng đủ, khỏi đụng file', () => {
  const props = { ...DA_CAT };
  caiDatKho(load(props));
  assert.equal(props.UPLOAD_KEY, 'uuid-moi', 'lần đầu thì tạo key');
});

test('đã cất nhưng thiếu WEBAPP_URL → vẫn báo đúng chỗ thiếu', () => {
  const ctx = load({ TG_BOT_TOKEN: 'tok', TG_CHAT_ID: '1' });
  assert.throws(() => ctx.caiDat(), /WEBAPP_URL phải là URL Web App/);
});

test('Tải thẳng: để trống đầu file thì giữ bản đã cất; tatTaiThang mới xoá', () => {
  const props = { ...DA_CAT, TAIVE_WORKER_URL: 'https://x.workers.dev/taive', TAIVE_SECRET: 'a'.repeat(24) };
  const ctx = load(props);
  caiDatKho(ctx);
  assert.equal(props.TAIVE_WORKER_URL, 'https://x.workers.dev/taive');
  assert.equal(props.TAIVE_SECRET, 'a'.repeat(24));
  ctx.tatTaiThang();
  assert.equal(props.TAIVE_WORKER_URL, undefined);
  assert.equal(props.TAIVE_SECRET, undefined);
  // Cất mỗi một nửa (gõ tay thiếu) → chặn như điền thiếu ở đầu file.
  assert.throws(() => caiDatKho(load({ ...DA_CAT, TAIVE_WORKER_URL: 'https://x.workers.dev/taive' })), /CẢ WORKER_URL lẫn WORKER_SECRET/);
});
