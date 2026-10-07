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
  TG_AI_TOKEN: 'token-ai', TG_EL_TOKEN: 'token-el', TG_ADMIN: ADMIN, TG_SECRET: 'bimat', BREVO_KEY: 'brevo', MAIL_TU: 'gui@gmail.com',
  UPLOAD_TG_TOKEN: 'token-upload', TAIVE_SECRET: 'taive-bimat', ...them,
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
  const res = await worker.fetch(new Request(`${API}tg/ai`, {
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
    const xau = await worker.fetch(new Request(`${API}tg/ai`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'sai' }, body: '{}' }), env, moCtx());
    assert.equal(xau.status, 401);
    assert.equal((await lenh(env, '/help')).status, 200);
    assert.match(f.nhan().join('\n'), /elevaTO AI BCTC — Bảng điều khiển/);
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
    assert.deepEqual(dat.map((x) => x.url).sort(), [`${API}tg/ai`, `${API}tg/el`], 'mỗi bot một đường riêng');
    assert.ok(dat.every((x) => x.secret_token === 'bimat'));
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
    // Người xin không được biết, nhưng quản trị thì phải biết — nếu không, "bấm gửi, báo thành
    // công, chờ mãi không thư" là hộp đen không ai gỡ được.
    assert.match(f.nhan().join('\n'), /xin mã đặt lại mật khẩu cho <code>khong-co@gmail\.com<\/code> nhưng không có tài khoản/);
  } finally { f.thoi(); }
});

test('quên mật khẩu: tài khoản chờ duyệt / bị khoá thì báo quản trị đúng lý do', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, NGUOI);
    await env.DB.prepare("UPDATE tai_khoan SET trangthai = 'cho'").run();
    await goi(env, { action: 'quenmk', email: NGUOI.email });
    assert.match(f.nhan().at(-1), /CHỜ DUYỆT/);
    assert.equal(f.thu.length, 0);

    // Mốc nhớ chặn báo trùng trong 30 phút — xoá đi để thử tiếp ca bị khoá.
    await env.DB.prepare("DELETE FROM cai_dat WHERE khoa LIKE 'bao_%'").run();
    await env.DB.prepare("UPDATE tai_khoan SET trangthai = 'off'").run();
    await goi(env, { action: 'quenmk', email: NGUOI.email });
    assert.match(f.nhan().at(-1), /KHOÁ/);
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
  assert.deepEqual(await xem(moEnv(SCHEMA)), { ai: false, bot_ai: false, bot_el: false, mail: false, tai_thang: false,
    thieu: ['GEMINI_KEYS', 'TG_SECRET', 'TG_ADMIN', 'TG_AI_TOKEN', 'TG_EL_TOKEN', 'BREVO_KEY', 'MAIL_TU', 'UPLOAD_TG_TOKEN', 'TAIVE_SECRET'] });
  assert.deepEqual(await xem(env0({ GEMINI_KEYS: 'k' })), { ai: true, bot_ai: true, bot_el: true, mail: true, tai_thang: true, thieu: [] });
  // Tải thẳng cần đủ cả hai: token bot upload và khóa ký vé.
  assert.equal((await xem(env0({ UPLOAD_TG_TOKEN: '' }))).tai_thang, false, 'thiếu UPLOAD_TG_TOKEN');
  assert.equal((await xem(env0({ TAIVE_SECRET: '' }))).tai_thang, false, 'thiếu TAIVE_SECRET');
  // "mail: false" một mình không nói thiếu cái nào trong hai — phải kể tên ra.
  assert.deepEqual((await xem(env0({ GEMINI_KEYS: 'k', BREVO_KEY: '' }))).thieu, ['BREVO_KEY']);
  assert.deepEqual((await xem(env0({ GEMINI_KEYS: 'k', MAIL_TU: '' }))).thieu, ['MAIL_TU']);
  // Thiếu đúng một mảnh của bot thì vẫn phải báo bot: false.
  assert.equal((await xem(env0({ TG_SECRET: '' }))).bot_ai, false, 'thiếu TG_SECRET');
  assert.equal((await xem(env0({ TG_AI_TOKEN: '' }))).bot_ai, false, 'thiếu token bot AI');
  assert.equal((await xem(env0({ TG_EL_TOKEN: '' }))).bot_el, false, 'thiếu token bot elevaTO');
  assert.equal((await xem(env0({ TG_ADMIN: '' }))).bot_ai, false, 'thiếu TG_ADMIN');
  assert.equal((await xem(env0({ BREVO_KEY: '' }))).mail, false);
  // Không được lộ giá trị nào ra ngoài.
  const than = await (await worker.fetch(new Request(API), env0({ GEMINI_KEYS: 'key-that' }), moCtx())).text();
  assert.doesNotMatch(than, /key-that|token-ai|token-el|token-upload|bimat|brevo/);
});

test('thiếu TG_SECRET thì không đăng ký webhook (im lặng như đang gặp), có đủ thì đăng ký', async () => {
  const f = moFetch();
  try {
    await goi(env0({ TG_SECRET: '' }), { action: 'ungho' });
    assert.deepEqual(f.tg.filter((x) => x.method === 'setWebhook'), []);
    await goi(env0(), { action: 'ungho' });
    assert.equal(f.tg.filter((x) => x.method === 'setWebhook').length, 2, 'hai bot');
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
    assert.equal(tin.length, 2, 'cả hai bot chào ở lượt truy cập sau');
    assert.ok(tin.every((x) => /đã kết nối/.test(x)));

    await goi(env, { action: 'ungho' });
    assert.equal(tin.length, 2, 'đã chào rồi thì thôi, không nhắc lại mỗi lượt');
  } finally { globalThis.fetch = that; }
});

// ─── Menu lệnh ──────────────────────────────────────────────

test('menu lệnh: đăng ký cho riêng chat quản trị, một lần rồi thôi', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, { action: 'ungho' });
    const dat = f.tg.filter((x) => x.method === 'setMyCommands');
    assert.equal(dat.length, 2, 'mỗi bot một menu riêng');
    for (const d of dat) {
      assert.deepEqual(d.scope, { type: 'chat', chat_id: ADMIN }, 'người lạ không thấy menu lệnh của quản trị');
      assert.ok(d.commands.length >= 10);
    }
    await goi(env, { action: 'ungho' });
    assert.equal(f.tg.filter((x) => x.method === 'setMyCommands').length, 2, 'đăng ký rồi thì thôi');
  } finally { f.thoi(); }
});

test('mọi lệnh trong menu đều là lệnh bot chạy thật, và đúng khuôn Telegram đòi', async () => {
  const { MENU_LENH, chayLenh } = await import('../worker/src/telegram.js');
  for (const { command, description } of MENU_LENH) {
    assert.match(command, /^[a-z0-9_]{1,32}$/, `tên lệnh "${command}" sai khuôn Telegram`);
    assert.ok(description.length >= 3 && description.length <= 256, `mô tả "${command}" dài sai`);
    assert.match(description, /^\p{Extended_Pictographic}/u, `/${command} thiếu icon đầu mô tả`);
  }
  assert.equal(new Set(MENU_LENH.map((x) => x.command)).size, MENU_LENH.length, 'không được trùng lệnh');
  const icon = MENU_LENH.map((x) => x.description.match(/^\S+/)[0]);
  assert.equal(new Set(icon).size, icon.length, `icon bị trùng: ${icon.filter((x, i) => icon.indexOf(x) !== i)}`);

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

// ─── Hỏi từng bước ──────────────────────────────────────────

/** Giả lập quản trị bấm một nút trên tin của bot. */
async function nut(env, data) {
  const ctx = moCtx();
  await worker.fetch(new Request(`${API}tg/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'bimat' },
    body: JSON.stringify({ update_id: 2, callback_query: { id: 'cb1', from: { id: ADMIN }, data,
      message: { message_id: 5, chat: { id: ADMIN, type: 'private' } } } }),
  }), env, ctx);
  await ctx.xong();
}
const cuoiTin = (f) => f.tg.filter((x) => x.method === 'sendMessage').at(-1);

test('/ungho chưa đặt gì thì bot hỏi từng câu thay vì bắt gõ cú pháp', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await lenh(env, '/ungho');
    const h = cuoiTin(f);
    assert.match(h.text, /Ngân hàng nào\?.*bước 1\/3/s);
    assert.equal(h.reply_markup.force_reply, true);
    assert.doesNotMatch(h.text, /&lt;/, 'không được hiện cú pháp &lt;ngân hàng&gt; nữa');

    await lenh(env, 'vcb');
    assert.match(cuoiTin(f).text, /Số tài khoản là bao nhiêu\?.*bước 2\/3/s);
    await lenh(env, '1012345678');
    assert.match(cuoiTin(f).text, /Tên chủ tài khoản\?.*bước 3\/3/s);
    await lenh(env, 'NGUYEN VAN A');

    const { thongTinUngHo } = await import('../worker/src/ungho.js');
    const o = await thongTinUngHo(env.DB);
    assert.deepEqual([o.bin, o.bank, o.stk, o.chu_tk], ['970436', 'Vietcombank', '1012345678', 'NGUYEN VAN A']);

    // Đã có số rồi thì /ungho là lệnh XEM — hiện thẻ kèm nút, không hỏi lại.
    await lenh(env, '/ungho');
    const the = cuoiTin(f);
    assert.match(the.text, /Thông tin ủng hộ đang hiện trên trang/);
    assert.ok(!the.reply_markup.force_reply, 'đã có số rồi mà vẫn hỏi lại');
    assert.deepEqual(the.reply_markup.inline_keyboard[0].map((x) => x.callback_data), ['hoi:ungho', 'an:ungho']);
  } finally { f.thoi(); }
});

test('nút ✏️ mở lại cuộc hỏi, nút 🙈 ẩn phần ủng hộ', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const { datUngHo, thongTinUngHo } = await import('../worker/src/ungho.js');
    await datUngHo(env.DB, 'vcb', '1012345678', 'NGUYEN VAN A');

    await nut(env, 'hoi:ungho');
    assert.match(cuoiTin(f).text, /Ngân hàng nào\?/);
    await lenh(env, 'tcb'); await lenh(env, '9988776655'); await lenh(env, 'TRAN THI B');
    const o = await thongTinUngHo(env.DB);
    assert.deepEqual([o.bank, o.stk, o.chu_tk], ['Techcombank', '9988776655', 'TRAN THI B']);

    await nut(env, 'an:ungho');
    assert.equal(await thongTinUngHo(env.DB), null);
    assert.ok(f.tg.some((x) => x.method === 'editMessageText' && /Đã ẩn/.test(x.text)));
  } finally { f.thoi(); }
});

test('/matkhau hỏi hai bước và xoá tin chứa mật khẩu khỏi lịch sử', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await goi(env, NGUOI);
    await lenh(env, '/matkhau');
    assert.match(cuoiTin(f).text, /Đổi mật khẩu cho email nào\?/);
    await lenh(env, NGUOI.email);
    await lenh(env, 'mat khau co dau cach');
    assert.ok(f.tg.some((x) => x.method === 'deleteMessage'), 'tin chứa mật khẩu phải bị xoá');
    assert.match(cuoiTin(f).text, /Đã đặt mật khẩu mới/);
    // Khoảng trắng bên trong mật khẩu phải giữ nguyên thì mới đăng nhập được.
    assert.equal((await goi(env, { action: 'dangnhap', email: NGUOI.email, mk: 'mat khau co dau cach' })).ok, true);
  } finally { f.thoi(); }
});

test('bảng câu hỏi bot AI: lệnh nào cũng có thật, câu nào cũng đủ chữ', async () => {
  const { HOI_AI, MENU_LENH, chayLenh } = await import('../worker/src/telegram.js');
  const f = moFetch();
  try {
    const env = env0();
    for (const [lenh, spec] of Object.entries(HOI_AI)) {
      assert.match(lenh, /^\/[a-z0-9_]+$/, `khoá "${lenh}" phải là tên lệnh`);
      for (const b of spec.buoc) assert.ok(b.hoi && b.hoi.length >= 5, `${lenh}: thiếu câu hỏi`);
      assert.ok(MENU_LENH.some((x) => `/${x.command}` === lenh), `${lenh} có câu hỏi mà thiếu trong menu`);
      assert.doesNotMatch((await chayLenh(env, lenh, ['x'])).text || '', /Không rõ lệnh/, `${lenh} không có trong chayLenh`);
    }
    for (const c of ['tim', 'hocvien', 'giangvien', 'free', 'luot', 'mo', 'khoa', 'mkmoi', 'matkhau', 'ungho']) {
      assert.ok(HOI_AI[`/${c}`], `/${c} cần giá trị mà chưa có câu hỏi`);
    }
  } finally { f.thoi(); }
});

test('điền nhầm số thẻ Visa thay vì số tài khoản thì bot cảnh báo, chứ không lặng lẽ dựng QR chết', async () => {
  const { giongSoThe } = await import('../worker/src/ungho.js');
  // Số thẻ thử nghiệm công khai của Visa / Mastercard.
  assert.equal(giongSoThe('4111111111111111'), 'Visa');
  assert.equal(giongSoThe('5555555555554444'), 'Mastercard');
  // Không được bắt nhầm: số tài khoản thường, và thẻ nội địa NAPAS thì nằm ngoài phạm vi.
  assert.equal(giongSoThe('1012345678'), '');
  assert.equal(giongSoThe('1234567890123456'), '', '16 chữ số nhưng trượt Luhn thì là số tài khoản');
  assert.equal(giongSoThe('9704000000000018'), '');

  const f = moFetch();
  try {
    const env = env0();
    await lenh(env, '/ungho vcb 4111111111111111 NGUYEN VAN A');
    assert.match(cuoiTin(f).text, /trông giống <b>số thẻ Visa<\/b>/);
    // Vẫn lưu — có ngân hàng cấp số tài khoản 16 chữ số thật, chặn nhầm còn tệ hơn.
    const { thongTinUngHo } = await import('../worker/src/ungho.js');
    assert.equal((await thongTinUngHo(env.DB)).stk, '4111111111111111');

    await lenh(env, '/ungho vcb 1012345678 NGUYEN VAN A');
    assert.doesNotMatch(cuoiTin(f).text, /số thẻ/, 'số tài khoản bình thường mà cũng kêu');
  } finally { f.thoi(); }
});
