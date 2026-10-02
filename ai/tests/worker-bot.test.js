import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { moCtx, moEnv } from './helpers/d1.js';

const SCHEMA = new URL('../worker/schema.sql', import.meta.url);
const API = 'https://elevato-ai.workers.dev/';
const ADMIN = '111222333';            // chat ID giả cho bài kiểm tra

const NGUOI = {
  action: 'dangky', ten: 'Người Dùng', email: 'nguoi@gmail.com', sdt: '0376292148',
  mk: 'matkhau123', tuoi: 30, nghe_nghiep: 'Kế toán', muc_dich: 'Đọc BCTC',
};

/** Bắt lại mọi lần Worker gọi ra ngoài (Telegram, Brevo) để soi nội dung. */
function moFetch() {
  const tg = [], thu = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const than = init && init.body ? JSON.parse(init.body) : {};
    if (u.includes('api.telegram.org')) { tg.push({ method: u.split('/').pop(), ...than }); return new Response('{"ok":true,"result":{}}'); }
    if (u.includes('api.brevo.com')) { thu.push(than); return new Response('{}', { status: 201 }); }
    return new Response('{}');
  };
  return { tg, thu, nhan: () => tg.filter((x) => x.method === 'sendMessage').map((x) => x.text), thoi: () => { globalThis.fetch = that; } };
}

const env0 = (them) => moEnv(SCHEMA, {
  TG_TOKEN: 'token-bot', TG_ADMIN: ADMIN, TG_SECRET: 'bimat', BREVO_KEY: 'brevo', MAIL_TU: 'gui@gmail.com', ...them,
});

async function goi(env, body) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify(body) }), env, ctx);
  await ctx.xong();
  return res.json();
}

/** Giả lập Telegram đẩy một tin của quản trị sang webhook. */
async function lenh(env, text, from = ADMIN) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(`${API}tg`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'bimat' },
    body: JSON.stringify({ update_id: 1, message: { message_id: 9, chat: { id: from, type: 'private' }, from: { id: from }, text } }),
  }), env, ctx);
  await ctx.xong();
  return res;
}

// ─── Webhook ────────────────────────────────────────────────

test('webhook Telegram: sai mã bí mật thì từ chối, đúng thì nhận', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const xau = await worker.fetch(new Request(`${API}tg`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'sai' }, body: '{}' }), env, moCtx());
    assert.equal(xau.status, 401);
    assert.equal((await lenh(env, '/help')).status, 200);
    assert.match(f.nhan().join('\n'), /Bot quản trị elevaTO/);
  } finally { f.thoi(); }
});

test('người lạ nhắn bot thì bot im lặng, không trả lời gì', async () => {
  const f = moFetch();
  try {
    await lenh(env0(), '/thongke', '999999');
    assert.deepEqual(f.nhan().filter((t) => /AI BCTC/.test(t)), []);
  } finally { f.thoi(); }
});

test('bot tự nối webhook một lần rồi thôi', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, { action: 'ungho' });
    await goi(env, { action: 'ungho' });
    const dat = f.tg.filter((x) => x.method === 'setWebhook');
    assert.equal(dat.length, 1, 'chỉ gọi setWebhook lần đầu');
    assert.equal(dat[0].url, `${API}tg`);
    assert.equal(dat[0].secret_token, 'bimat');
  } finally { f.thoi(); }
});

// ─── Lệnh quản trị ──────────────────────────────────────────

test('xếp vai trò học viên bằng lệnh, hạn lượt đổi theo ngay', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const token = (await goi(env, NGUOI)).data.token;
    assert.match(f.nhan().join('\n'), /Tài khoản AI BCTC mới/, 'đăng ký xong là báo quản trị');
    await lenh(env, '/hocvien nguoi@gmail.com');
    assert.match(f.nhan().join('\n'), /→ Học viên/);
    const toi = await goi(env, { action: 'toi', token });
    assert.equal(toi.data.me.vaitro, 'hv');
    assert.equal(toi.data.me.luot.han, 40);
    await lenh(env, '/giangvien nguoi@gmail.com');
    assert.equal((await goi(env, { action: 'toi', token })).data.me.luot.han, 0, 'giảng viên không giới hạn');
  } finally { f.thoi(); }
});

test('khoá tài khoản là đá luôn các máy đang đăng nhập', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const token = (await goi(env, NGUOI)).data.token;
    await lenh(env, '/khoa nguoi@gmail.com');
    assert.equal((await goi(env, { action: 'toi', token })).code, 'auth');
    assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: NGUOI.mk })).code, 'bi_khoa');
    await lenh(env, '/mo nguoi@gmail.com');
    assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: NGUOI.mk })).ok, true);
  } finally { f.thoi(); }
});

test('/luot đặt riêng số lượt mỗi ngày, 0 là quay về theo vai trò', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const token = (await goi(env, NGUOI)).data.token;
    await lenh(env, '/luot nguoi@gmail.com 99');
    assert.equal((await goi(env, { action: 'toi', token })).data.me.luot.han, 99);
    await lenh(env, '/luot nguoi@gmail.com 0');
    assert.equal((await goi(env, { action: 'toi', token })).data.me.luot.han, 10);
  } finally { f.thoi(); }
});

test('/mkmoi đặt mật khẩu mới, đọc ra cho quản trị và đá hết máy cũ', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const token = (await goi(env, NGUOI)).data.token;
    await lenh(env, '/mkmoi nguoi@gmail.com');
    const tin = f.nhan().at(-1);                      // tin mới nhất; tin báo tài khoản mới cũng có thẻ <code>
    const mk = /<code>([^<]+)<\/code>/.exec(tin);
    assert.ok(mk, tin);
    assert.equal(mk[1].length, 14);
    assert.equal((await goi(env, { action: 'toi', token })).code, 'auth');
    assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: mk[1] })).ok, true);
  } finally { f.thoi(); }
});

test('/matkhau xoá luôn tin chứa mật khẩu khỏi lịch sử Telegram', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, NGUOI);
    await lenh(env, '/matkhau nguoi@gmail.com mat khau co dau cach');
    assert.ok(f.tg.some((x) => x.method === 'deleteMessage'), 'phải gọi deleteMessage');
    assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: 'mat khau co dau cach' })).ok, true);
  } finally { f.thoi(); }
});

test('/tim và /thongke chạy được trên cơ sở dữ liệu thật', async () => {
  const f = moFetch();
  try {
    const env = env0({ GEMINI_KEYS: 'k1' });
    await goi(env, NGUOI);
    await lenh(env, '/tim nguoi@gmail.com');
    assert.match(f.nhan().join('\n'), /Người Dùng/);
    await lenh(env, '/thongke');
    assert.match(f.nhan().join('\n'), /Tài khoản: 1 .*thường 1/s);
  } finally { f.thoi(); }
});

test('/ungho đặt số tài khoản, trang đọc được ngay; /ungho off thì ẩn', async () => {
  const f = moFetch();
  try {
    const env = env0();
    assert.equal((await goi(env, { action: 'ungho' })).data.ungho, null);
    await lenh(env, '/ungho vcb 1012345678 NGUYEN VAN A');
    const u = (await goi(env, { action: 'ungho' })).data.ungho;
    assert.equal(u.bin, '970436');
    assert.equal(u.bank, 'Vietcombank');
    assert.equal(u.stk, '1012345678');
    assert.equal(u.chu_tk, 'NGUYEN VAN A');
    await lenh(env, '/ungho sai-ngan-hang 123456 A');
    assert.match(f.nhan().join('\n'), /Chưa rõ ngân hàng/);
    await lenh(env, '/ungho off');
    assert.equal((await goi(env, { action: 'ungho' })).data.ungho, null);
  } finally { f.thoi(); }
});

// ─── Quên mật khẩu ──────────────────────────────────────────

test('quên mật khẩu: nhận mã qua email, đổi được mật khẩu và vào luôn', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, NGUOI);
    const xin = await goi(env, { action: 'quenmk', email: NGUOI.email });
    assert.equal(xin.data.daGui, true);
    assert.equal(f.thu.length, 1);
    assert.equal(f.thu[0].to[0].email, 'nguoi@gmail.com');
    const ma = /Mã đặt lại: (\d{8})/.exec(f.thu[0].textContent);
    assert.ok(ma, f.thu[0].textContent);

    assert.equal((await goi(env, { action: 'datlaimk', email: NGUOI.email, ma: '00000000', mk: 'matkhaumoi1' })).code, 'ma_sai');
    const r = await goi(env, { action: 'datlaimk', email: NGUOI.email, ma: ma[1], mk: 'matkhaumoi1' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await goi(env, { action: 'toi', token: r.data.token })).ok, true);
    assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: 'matkhaumoi1' })).ok, true);
    assert.equal((await goi(env, { action: 'datlaimk', email: NGUOI.email, ma: ma[1], mk: 'matkhaukhac1' })).code, 'ma_sai', 'mã chỉ dùng một lần');
  } finally { f.thoi(); }
});

test('quên mật khẩu: email chưa đăng ký vẫn trả "đã gửi" nhưng không gửi thư nào', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const r = await goi(env, { action: 'quenmk', email: 'khong-co@gmail.com' });
    assert.equal(r.data.daGui, true);
    assert.equal(f.thu.length, 0);
  } finally { f.thoi(); }
});

test('quên mật khẩu: nhập sai mã quá số lần thì nghỉ, nhưng KHÔNG huỷ mã', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, NGUOI);
    await goi(env, { action: 'quenmk', email: NGUOI.email });
    const ma = /Mã đặt lại: (\d{8})/.exec(f.thu[0].textContent)[1];
    for (let i = 0; i < 5; i++) await goi(env, { action: 'datlaimk', email: NGUOI.email, ma: '00000000', mk: 'matkhaumoi1' });
    assert.equal((await goi(env, { action: 'datlaimk', email: NGUOI.email, ma, mk: 'matkhaumoi1' })).code, 'cho');
    // Nghỉ hết hạn thì mã CŨ vẫn dùng được — không để người lạ đoán bừa vài lần là chặn được chủ tài khoản.
    await env.DB.prepare("DELETE FROM cai_dat WHERE khoa LIKE 'dln_%'").run();
    assert.equal((await goi(env, { action: 'datlaimk', email: NGUOI.email, ma, mk: 'matkhaumoi1' })).ok, true);
  } finally { f.thoi(); }
});

test('quên mật khẩu: xin quá nhiều lần một giờ thì phải chờ', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, NGUOI);
    for (let i = 0; i < 3; i++) assert.equal((await goi(env, { action: 'quenmk', email: NGUOI.email })).ok, true);
    assert.equal((await goi(env, { action: 'quenmk', email: NGUOI.email })).code, 'cho');
    assert.equal(f.thu.length, 3);
  } finally { f.thoi(); }
});

test('Brevo lỗi thì báo quản trị chứ không im lặng', async () => {
  const that = globalThis.fetch;
  const tin = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.brevo.com')) return new Response('nguoi gui chua xac minh', { status: 400 });
    if (u.includes('api.telegram.org')) { tin.push(JSON.parse(init.body).text || ''); return new Response('{"ok":true,"result":{}}'); }
    return new Response('{}');
  };
  try {
    const env = env0();
    await goi(env, NGUOI);
    assert.equal((await goi(env, { action: 'quenmk', email: NGUOI.email })).data.daGui, true);
    assert.match(tin.join('\n'), /Không gửi được email đặt lại mật khẩu.*Brevo trả 400/s);
  } finally { globalThis.fetch = that; }
});

// ─── Cài đặt còn thiếu ──────────────────────────────────────

test('GET báo phần nào đã cài — bot im vì thiếu TG_SECRET là ca rất dễ mất cả buổi đi dò', async () => {
  const xem = async (env) => (await (await worker.fetch(new Request(API), env, moCtx())).json()).cai;
  assert.deepEqual(await xem(moEnv(SCHEMA)), { ai: false, bot: false, mail: false });
  assert.deepEqual(await xem(env0({ GEMINI_KEYS: 'k' })), { ai: true, bot: true, mail: true });
  // Thiếu đúng một mảnh của bot thì vẫn phải báo bot: false.
  assert.equal((await xem(env0({ TG_SECRET: '' }))).bot, false, 'thiếu TG_SECRET');
  assert.equal((await xem(env0({ TG_TOKEN: '' }))).bot, false, 'thiếu TG_TOKEN');
  assert.equal((await xem(env0({ TG_ADMIN: '' }))).bot, false, 'thiếu TG_ADMIN');
  assert.equal((await xem(env0({ BREVO_KEY: '' }))).mail, false);
  // Không được lộ giá trị nào ra ngoài.
  const than = await (await worker.fetch(new Request(API), env0({ GEMINI_KEYS: 'key-that' }), moCtx())).text();
  assert.doesNotMatch(than, /key-that|token-bot|bimat|brevo/);
});

test('thiếu TG_SECRET thì không đăng ký webhook (im lặng như đang gặp), có đủ thì đăng ký', async () => {
  const f = moFetch();
  try {
    await goi(env0({ TG_SECRET: '' }), { action: 'ungho' });
    assert.deepEqual(f.tg.filter((x) => x.method === 'setWebhook'), []);
    await goi(env0(), { action: 'ungho' });
    assert.equal(f.tg.filter((x) => x.method === 'setWebhook').length, 1);
  } finally { f.thoi(); }
});

test('chưa bấm Start với bot: webhook vẫn đăng ký, và lời chào tự gửi lại khi Start xong', async () => {
  const that = globalThis.fetch;
  let choPhep = false;
  const tin = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url), than = init && init.body ? JSON.parse(init.body) : {};
    if (!u.includes('api.telegram.org')) return new Response('{}');
    if (u.endsWith('/sendMessage')) {
      if (!choPhep) return new Response('{"ok":false,"description":"Forbidden: bot can\'t initiate conversation with a user"}');
      tin.push(than.text);
      return new Response('{"ok":true,"result":{}}');
    }
    return new Response('{"ok":true,"result":{}}');
  };
  try {
    const env = env0();
    await goi(env, { action: 'ungho' });
    assert.deepEqual(tin, [], 'chưa Start thì chưa nhận được gì');
    await goi(env, { action: 'ungho' });
    assert.deepEqual(tin, [], 'vẫn chưa Start');

    choPhep = true;                                   // người dùng vừa bấm Start
    await goi(env, { action: 'ungho' });
    assert.equal(tin.length, 1, 'lời chào phải tới nơi ở lượt truy cập sau');
    assert.match(tin[0], /đã kết nối/);

    await goi(env, { action: 'ungho' });
    assert.equal(tin.length, 1, 'đã chào rồi thì thôi, không nhắc lại mỗi lượt');
  } finally { globalThis.fetch = that; }
});

// ─── Menu lệnh ──────────────────────────────────────────────

test('menu lệnh: đăng ký cho riêng chat quản trị, một lần rồi thôi', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, { action: 'ungho' });
    const dat = f.tg.filter((x) => x.method === 'setMyCommands');
    assert.equal(dat.length, 1);
    assert.deepEqual(dat[0].scope, { type: 'chat', chat_id: ADMIN }, 'người lạ không thấy menu lệnh của quản trị');
    assert.ok(dat[0].commands.length >= 10);
    await goi(env, { action: 'ungho' });
    assert.equal(f.tg.filter((x) => x.method === 'setMyCommands').length, 1, 'đăng ký rồi thì thôi');
  } finally { f.thoi(); }
});

test('mọi lệnh trong menu đều là lệnh bot chạy thật, và đúng khuôn Telegram đòi', async () => {
  const { MENU_LENH, chayLenh } = await import('../worker/src/telegram.js');
  for (const { command, description } of MENU_LENH) {
    assert.match(command, /^[a-z0-9_]{1,32}$/, `tên lệnh "${command}" sai khuôn Telegram`);
    assert.ok(description.length >= 3 && description.length <= 256, `mô tả "${command}" dài sai`);
  }
  assert.equal(new Set(MENU_LENH.map((x) => x.command)).size, MENU_LENH.length, 'không được trùng lệnh');

  // Gõ lệnh trong menu mà bot trả "Không rõ lệnh" là menu nói dối.
  const env = env0();
  const f = moFetch();
  try {
    for (const { command } of MENU_LENH) {
      const kq = await chayLenh(env, `/${command}`, []);
      assert.doesNotMatch(kq.text, /Không rõ lệnh/, `/${command} không có trong chayLenh`);
    }
  } finally { f.thoi(); }
});
