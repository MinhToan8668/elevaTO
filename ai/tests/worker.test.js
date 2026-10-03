import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { moCtx, moEnv } from './helpers/d1.js';

const SCHEMA = new URL('../worker/schema.sql', import.meta.url);
const env0 = (them) => moEnv(SCHEMA, them);

const API = 'https://elevato-ai.workers.dev/';
async function goi(env, body, ctx = moCtx()) {
  const res = await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify(body) }), env, ctx);
  await ctx.xong();
  return res.json();
}

const NGUOI = {
  action: 'dangky', ten: 'nguyễn văn a', email: 'An.Nguyen+bctc@Gmail.com', sdt: '0376 292 148',
  mk: 'matkhau123', tuoi: 30, nghe_nghiep: 'Phân tích tài chính', muc_dich: 'Đọc BCTC',
};

// ─── Đăng ký & đăng nhập ────────────────────────────────────

test('đăng ký: chuẩn hoá tên, cấp phiên, và vào được bằng chính mật khẩu đó', async () => {
  const env = env0();
  const r = await goi(env, NGUOI);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.me.ten, 'Nguyễn Văn A');
  assert.equal(r.data.me.vaitro, 'free');
  assert.equal(r.data.me.luot.han, 10);
  assert.ok(r.data.token.length >= 64);

  const toi = await goi(env, { action: 'toi', token: r.data.token });
  assert.equal(toi.data.me.email, 'an.nguyen+bctc@gmail.com');

  const dn = await goi(env, { action: 'dangnhap', email: 'an.nguyen+bctc@gmail.com', mk: 'matkhau123' });
  assert.equal(dn.ok, true, JSON.stringify(dn));
});

test('đăng ký: Gmail bỏ dấu chấm và +nhãn vẫn là một người', async () => {
  const env = env0();
  assert.equal((await goi(env, NGUOI)).ok, true);
  const lai = await goi(env, { ...NGUOI, email: 'annguyen@gmail.com' });
  assert.equal(lai.code, 'da_ton_tai', JSON.stringify(lai));
});

test('đăng ký: thiếu trường, email sai, mật khẩu ngắn đều báo đúng mã lỗi', async () => {
  const env = env0();
  assert.equal((await goi(env, { ...NGUOI, ten: '' })).code, 'thieu');
  assert.equal((await goi(env, { ...NGUOI, email: 'khong-phai-email' })).code, 'email_sai');
  assert.equal((await goi(env, { ...NGUOI, mk: 'ngan' })).code, 'mk_ngan');
  assert.equal((await goi(env, { ...NGUOI, sdt: '12' })).code, 'sdt_sai');
  assert.equal((await goi(env, { ...NGUOI, tuoi: 5 })).code, 'tuoi_sai');
  assert.equal((await goi(env, { ...NGUOI, nghe_nghiep: '' })).code, 'thieu');
  assert.equal((await goi(env, { ...NGUOI, website: 'bot' })).code, 'thieu', 'ô bẫy bot');
});

test('đăng nhập: sai mật khẩu quá số lần cho phép thì khoá tạm', async () => {
  const env = env0();
  await goi(env, NGUOI);
  const sai = { action: 'dangnhap', email: NGUOI.email, mk: 'sai-roi-ban-oi' };
  for (let i = 0; i < 5; i++) assert.equal((await goi(env, sai)).code, 'sai', `lần ${i + 1}`);
  assert.equal((await goi(env, sai)).code, 'khoa_tam');
  // Khoá tạm tính theo email, nên mật khẩu đúng cũng phải chờ.
  assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: NGUOI.mk })).code, 'khoa_tam');
});

test('đăng nhập: email chưa đăng ký trả đúng câu như sai mật khẩu (không lộ ai đã đăng ký)', async () => {
  const env = env0();
  const a = await goi(env, { action: 'dangnhap', email: 'khong-co@gmail.com', mk: 'matkhau123' });
  assert.equal(a.code, 'sai');
  await goi(env, NGUOI);
  const b = await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: 'khac-roi-nhe' });
  assert.equal(b.error, a.error);
});

test('phiên: chỉ giữ 3 máy mới nhất, đăng xuất bỏ đúng một phiên', async () => {
  const env = env0();
  await goi(env, NGUOI);
  const vao = async () => (await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: NGUOI.mk })).data.token;
  const t = [await vao(), await vao(), await vao(), await vao()];
  assert.equal((await goi(env, { action: 'toi', token: t[0] })).code, 'auth', 'máy cũ nhất bị đẩy ra');
  assert.equal((await goi(env, { action: 'toi', token: t[3] })).ok, true);
  await goi(env, { action: 'dangxuat', token: t[3] });
  assert.equal((await goi(env, { action: 'toi', token: t[3] })).code, 'auth');
  assert.equal((await goi(env, { action: 'toi', token: t[2] })).ok, true, 'đăng xuất máy này không đá máy khác');
});

test('tài khoản chờ duyệt / bị khoá không vào được', async () => {
  const env = env0();
  await env.DB.prepare("INSERT INTO cai_dat (khoa, gia_tri) VALUES ('AI_CAN_DUYET', '1')").run();
  const r = await goi(env, NGUOI);
  assert.deepEqual(r.data, { cho: true });
  assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: NGUOI.mk })).code, 'cho_duyet');
  await env.DB.prepare("UPDATE tai_khoan SET trangthai = 'off'").run();
  assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: NGUOI.mk })).code, 'bi_khoa');
});

// ─── Yêu cầu không hợp lệ ───────────────────────────────────

test('thân yêu cầu hỏng / hành động lạ / thiếu token đều trả lỗi gọn, không sập', async () => {
  const env = env0();
  const res = await worker.fetch(new Request(API, { method: 'POST', body: 'khong-phai-json' }), env, moCtx());
  assert.equal((await res.json()).code, 'bad');
  assert.equal((await goi(env, { action: 'khong-co-that' })).code, 'bad');
  assert.equal((await goi(env, { action: 'toi', token: 'ngan' })).code, 'auth');
  assert.equal((await goi(env, { action: 'generate', token: 'x'.repeat(64) })).code, 'auth');
});

test('GET trả tên dịch vụ và số bản, OPTIONS trả tiêu đề CORS', async () => {
  const env = env0();
  const g = await worker.fetch(new Request(API), env, moCtx());
  const d = await g.json();
  assert.equal(d.service, 'elevaTO');
  assert.match(d.ban, /^\d{4}-\d{2}-\d{2}$/);
  const o = await worker.fetch(new Request(API, { method: 'OPTIONS' }), env, moCtx());
  assert.equal(o.status, 204);
  assert.equal(o.headers.get('access-control-allow-origin'), '*');
});

test('chưa nối cơ sở dữ liệu thì báo setup; thân quá dài thì từ chối trước khi đọc', async () => {
  const khongDB = await worker.fetch(new Request(API, { method: 'POST', body: '{"action":"ungho"}' }), {}, moCtx());
  assert.equal((await khongDB.json()).code, 'setup');

  const env = env0({ AI_MAX_BODY: '20' });
  const r = await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify({ action: 'ungho', x: 'y'.repeat(100) }) }), env, moCtx());
  const d = await r.json();
  assert.equal(d.code, 'bad');
  assert.match(d.error, /quá lớn/);
});
