// Nội dung trang link-in-bio trên Worker: đọc công khai, ghi bằng key, cắt mảnh khi nội dung lớn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { linksKey } from '../worker/src/links.js';
import { chayLenhEl } from '../worker/src/botel.js';
import { moCtx, moEnv } from './helpers/d1.js';

const SCHEMA = new URL('../worker/schema.sql', import.meta.url);
const API = 'https://elevato-ai.workers.dev';
const env0 = () => moEnv(SCHEMA, { TG_ADMIN: '42' });

async function doc(env) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(`${API}/links`), env, ctx);
  await ctx.xong();
  return { res, body: await res.json() };
}
async function gui(env, body) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify(body) }), env, ctx);
  await ctx.xong();
  return res.json();
}

const TRANG = { profile: { name: 'Minh Toàn' }, links: [{ id: 'a', title: 'Khoá học', url: '../' }], theme: { blur: 0 } };

test('chưa lưu lần nào → trang đọc được data:null (trang tự dùng data.json)', async () => {
  const { res, body } = await doc(env0());
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, data: null, updatedAt: '' });
  assert.equal(res.headers.get('cache-control'), 'no-store', 'đệm lại là bấm Đăng xong trang không đổi ngay');
  assert.equal(res.headers.get('access-control-allow-origin'), '*', 'trang nằm khác tên miền với Worker');
});

test('lưu đúng key → đọc lại nguyên vẹn, có mốc thời gian giờ Việt Nam', async () => {
  const env = env0();
  const key = await linksKey(env.DB);
  const luu = await gui(env, { action: 'saveLinks', key, data: TRANG });
  assert.equal(luu.ok, true, JSON.stringify(luu));
  assert.match(luu.updatedAt, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  const { body } = await doc(env);
  assert.deepEqual(body.data, TRANG);
  assert.equal(body.updatedAt, luu.updatedAt);
});

test('nội dung lớn bị cắt nhiều mảnh; lưu bản ngắn hơn thì xoá sạch mảnh thừa', async () => {
  const env = env0();
  const key = await linksKey(env.DB);
  const to = { ...TRANG, profile: { name: 'x', avatar: 'data:image/webp;base64,' + 'A'.repeat(700000) } };
  assert.equal((await gui(env, { action: 'saveLinks', key, data: to })).ok, true);
  const so = env.DB._sqlite.prepare("SELECT COUNT(*) n FROM cai_dat WHERE khoa LIKE 'links_m%'").get().n;
  assert.ok(so >= 3, 'phải cắt làm nhiều mảnh, đang có ' + so);
  assert.deepEqual((await doc(env)).body.data, to);

  assert.equal((await gui(env, { action: 'saveLinks', key, data: TRANG })).ok, true);
  assert.deepEqual((await doc(env)).body.data, TRANG, 'mảnh thừa của bản cũ còn sót lại');
  assert.equal(env.DB._sqlite.prepare("SELECT COUNT(*) n FROM cai_dat WHERE khoa LIKE 'links_m%'").get().n, 1);
});

test('sai key thì không ghi được; dò key nhiều lần thì bị khoá tạm', async () => {
  const env = env0();
  const sai = await gui(env, { action: 'saveLinks', key: 'khong-phai-key', data: TRANG });
  assert.equal(sai.code, 'auth', JSON.stringify(sai));
  assert.equal((await doc(env)).body.data, null, 'sai key mà vẫn ghi được');

  const key = await linksKey(env.DB);
  for (let i = 0; i < 25; i += 1) await gui(env, { action: 'checkKey', key: 'doan' + i });
  assert.equal((await gui(env, { action: 'checkKey', key })).code, 'khoa_tam', 'đúng key vẫn phải bị chặn khi đang khoá');
});

test('checkKey: đúng key → ok; key rỗng → không lọt', async () => {
  const env = env0();
  assert.deepEqual(await gui(env, { action: 'checkKey', key: await linksKey(env.DB) }), { ok: true });
  assert.equal((await gui(env, { action: 'checkKey', key: '' })).code, 'auth');
});

test('dữ liệu không đúng dạng trang link, hoặc quá lớn → từ chối', async () => {
  const env = env0();
  const key = await linksKey(env.DB);
  assert.equal((await gui(env, { action: 'saveLinks', key, data: { links: 'x' } })).code, 'bad');
  assert.equal((await gui(env, { action: 'saveLinks', key, data: null })).code, 'bad');
  const khong = { ...TRANG, profile: { name: 'x'.repeat(2000001) } };
  assert.equal((await gui(env, { action: 'saveLinks', key, data: khong })).code, 'qua_lon');
});

test('bot elevaTO: /linkkey đưa key cho quản trị, và hỏi lại vẫn ra đúng key đó', async () => {
  const env = env0();
  const r = await chayLenhEl(env, '/linkkey', []);
  const key = await linksKey(env.DB);
  assert.ok(r.text.includes(key), 'bot không gửi key');
  assert.ok((await chayLenhEl(env, '/linkkey', [])).text.includes(key), 'mỗi lần hỏi lại sinh key mới');
  assert.ok((await chayLenhEl(env, '/menu', [])).text.includes('/linkkey'), 'thiếu dòng trong /menu');
});

test('dùng được cả đường POST action:links (phòng khi trang gọi kiểu cũ)', async () => {
  const env = env0();
  await gui(env, { action: 'saveLinks', key: await linksKey(env.DB), data: TRANG });
  const r = await gui(env, { action: 'links' });
  assert.deepEqual(r.data, TRANG);
});
