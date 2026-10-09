import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { chayLenhEl } from '../worker/src/botel.js';
import { docCauHinh } from '../worker/src/khoahoc.js';
import { moCtx, moEnv } from './helpers/d1.js';

const SCHEMA = new URL('../worker/schema.sql', import.meta.url);
const API = 'https://elevato.workers.dev/';
const ADMIN = '111222333';

function moFetch() {
  const tg = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const than = init && init.body ? JSON.parse(init.body) : {};
    if (String(url).includes('api.telegram.org')) tg.push({ method: String(url).split('/').pop(), ...than });
    return new Response('{"ok":true,"result":{}}');
  };
  return { tg, nhan: () => tg.filter((x) => x.method === 'sendMessage').map((x) => x.text), thoi: () => { globalThis.fetch = that; } };
}

const env0 = (them) => moEnv(SCHEMA, { TG_EL_TOKEN: 'token-el', TG_ADMIN: ADMIN, TG_SECRET: 'bimat', ...them });

async function post(env, body) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify(body) }), env, ctx);
  await ctx.xong();
  return res.json();
}
async function cauHinh(env) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(`${API}?action=config`), env, ctx);
  await ctx.xong();
  return (await res.json()).config;
}
const NGUOI = { action: 'register', name: 'Nguyễn Văn A', phone: '0901 234 567', year: '1995', email: 'a@gmail.com', job: 'Kiểm toán', goal: 'Lên senior' };

// ─── Cấu hình trang ─────────────────────────────────────────

test('GET ?action=config trả cấu hình mặc định kèm phần máy tự tính', async () => {
  const c = await cauHinh(env0());
  assert.equal(c.computed.cohortLabel, 'Cohort 07');
  assert.equal(c.computed.nextCohortLabel, 'Cohort 08');
  assert.equal(c.computed.totalRegistered, 4, 'mới chỉ có 4 người ngoài hệ thống');
  assert.equal(c.computed.remaining, 6);
  assert.equal(c.computed.price.earlyBird, '3.000.000đ');
  assert.equal(c.computed.price.earlyBirdShort, '3M');
  assert.equal(c.computed.price.savePercent, 25);
  assert.equal(c.stats.cohortsDone, 6, 'suy ra từ số cohort, không lưu rời');
});

test('cấu hình gửi ra trang KHÔNG kèm các khối index.html tự giữ', async () => {
  // Gửi kèm là bản lưu ở máy chủ đè lên file, sửa file bao nhiêu lần trang cũng không đổi.
  const c = await cauHinh(env0());
  assert.equal(c.pricing.note, undefined);
  assert.equal(c.stats.students, undefined);
  assert.equal(c.schedule.platform, undefined);
  assert.equal(c.cohort.openText, undefined);
});

// ─── Đăng ký ────────────────────────────────────────────────

test('đăng ký: lưu lại, báo quản trị kèm nút duyệt, và trừ một suất', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const r = await post(env, NGUOI);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(r.id, /^R\d{12}$/);
    assert.equal(r.config.computed.totalRegistered, 5);
    assert.equal(r.config.computed.remaining, 5);
    const tin = f.nhan().join('\n');
    assert.match(tin, /Đăng ký mới — Cohort 07/);
    assert.match(tin, /Nguyễn Văn A/);
    assert.ok(f.tg.some((x) => JSON.stringify(x.reply_markup || '').includes('✅ Duyệt')), 'thiếu nút duyệt');
  } finally { f.thoi(); }
});

test('đăng ký trùng số điện thoại trong cùng cohort thì báo trùng, không ghi thêm', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await post(env, NGUOI);
    const lai = await post(env, { ...NGUOI, phone: '090-123-4567' });   // cùng số, gõ khác kiểu
    assert.equal(lai.duplicate, true);
    assert.equal(lai.config.computed.totalRegistered, 5, 'không cộng thêm');
  } finally { f.thoi(); }
});

test('đăng ký: thiếu tên / số điện thoại sai / ô bẫy bot', async () => {
  const env = env0();
  assert.equal((await post(env, { ...NGUOI, name: '' })).error, 'missing_fields');
  assert.equal((await post(env, { ...NGUOI, phone: '123' })).error, 'invalid_phone');
  const bot = await post(env, { ...NGUOI, website: 'bot' });
  assert.deepEqual(bot, { ok: true, id: 'spam' }, 'trả ok để bot không biết bị chặn');
  assert.equal((await cauHinh(env)).computed.totalRegistered, 4, 'không có ai được ghi vào');
});

test('gói tự học không chiếm suất lớp live', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await post(env, { ...NGUOI, plan: 'selfpaced' });
    assert.equal((await cauHinh(env)).computed.totalRegistered, 4, 'vẫn 4 — gói tự học không tính');
  } finally { f.thoi(); }
});

test('đủ chỗ thì tự chuyển sang "đã đủ" và báo quản trị', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await chayLenhEl(env, '/slot', ['5']);                  // còn đúng 1 suất sau 4 người ngoài hệ thống
    const r = await post(env, NGUOI);
    assert.equal(r.config.computed.isFull, true);
    assert.equal((await docCauHinh(env.DB)).cohort.status, 'full');
    assert.match(f.nhan().join('\n'), /ĐÃ ĐỦ 5 NGƯỜI/);
  } finally { f.thoi(); }
});

// ─── Lệnh bot ───────────────────────────────────────────────

test('đọc số tiền: mọi kiểu gõ tắt người Việt hay dùng, và từ chối chuỗi không hiểu', async () => {
  const { docTien } = await import('../worker/src/botel.js');
  assert.equal(docTien('3000000'), 3000000);
  assert.equal(docTien('4.000.000'), 4000000, 'dấu chấm là ngăn nghìn');
  assert.equal(docTien('3tr'), 3000000);
  assert.equal(docTien('3M'), 3000000);
  assert.equal(docTien('3,5tr'), 3500000, 'dấu phẩy là phần lẻ');
  assert.equal(docTien('2tr5'), 2500000, 'đuôi sau tr là phần lẻ — bản cũ đọc thành 25 đồng');
  assert.equal(docTien('500k'), 500000);
  assert.equal(docTien('2k5'), 2500);
  // Không đọc được thì phải nói không đọc được, chứ vét chữ số còn lại là đặt nhầm giá mà không ai hay.
  for (const x of ['abc', '2tr5x', '', 'tr']) assert.ok(Number.isNaN(docTien(x)), `"${x}" phải là NaN`);
});

test('/slot, /giasom đổi cấu hình và trang thấy ngay; giá gõ tắt 3tr cũng hiểu', async () => {
  const env = env0();
  await chayLenhEl(env, '/slot', ['20']);
  assert.equal((await cauHinh(env)).slots.max, 20);
  await chayLenhEl(env, '/giasom', ['2tr5']);
  assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 2500000, 'chưa hiểu "2tr5"');
  const xau = await chayLenhEl(env, '/giasom', ['linh', 'tinh']);
  assert.match(xau.text, /Không đọc được/);
  assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 2500000, 'chuỗi lạ không được đổi giá');
  await chayLenhEl(env, '/giasom', ['3tr']);
  assert.equal((await cauHinh(env)).computed.price.earlyBird, '3.000.000đ');
  await chayLenhEl(env, '/giagoc', ['4.000.000']);
  assert.equal((await docCauHinh(env.DB)).pricing.regular, 4000000);
});

// Bình thường lệnh trơn được tg.js giữ lại để hỏi, không xuống tới đây. Vẫn canh nhánh này:
// "/video" trơn từng rơi vào nhánh xoá và làm mất mục học thử trên web.
test('lệnh trơn lọt xuống bộ định tuyến thì KHÔNG được xoá mất gì', async () => {
  const env = env0();
  const r = await chayLenhEl(env, '/giasom', []);
  assert.match(r.text, /Không đọc được/);
  assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 3000000, 'không được đổi gì');
  const v = await chayLenhEl(env, '/video', []);
  assert.match(v.text, /Video học thử đang dùng/);
  assert.ok((await docCauHinh(env.DB)).media.videoUrl, 'không được xoá video');
});

test('/mo /day /dong đổi trạng thái nhận đăng ký', async () => {
  const env = env0();
  for (const [lenh, tt] of [['/dong', 'closed'], ['/day', 'full'], ['/mo', 'open']]) {
    await chayLenhEl(env, lenh, []);
    assert.equal((await docCauHinh(env.DB)).cohort.status, tt, lenh);
  }
  assert.equal((await cauHinh(env)).computed.isClosed, false);
});

test('/cohortmoi tăng số cohort, đếm lại từ 0, giữ nguyên đăng ký cũ', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await post(env, NGUOI);
    await chayLenhEl(env, '/cohortmoi', []);
    const c = await cauHinh(env);
    assert.equal(c.computed.cohortLabel, 'Cohort 08');
    assert.equal(c.slots.base, 0);
    assert.equal(c.cohort.status, 'open');
    assert.equal(c.computed.totalRegistered, 0, 'đếm lại từ 0');
    assert.equal(c.stats.cohortsDone, 7);
    const cu = await env.DB.prepare("SELECT COUNT(*) AS n FROM dang_ky WHERE cohort = 'Cohort 07'").first();
    assert.equal(Number(cu.n), 1, 'đăng ký của cohort cũ vẫn còn nguyên');
  } finally { f.thoi(); }
});

test('/ds liệt kê đăng ký, /duyet và /tuchoi đổi trạng thái', async () => {
  const f = moFetch();
  try {
    const env = env0();
    const r = await post(env, NGUOI);
    assert.match((await chayLenhEl(env, '/ds', [])).text, /Nguyễn Văn A/);
    assert.match((await chayLenhEl(env, '/duyet', ['0901234567'])).text, /Đã duyệt/);
    const sau = await env.DB.prepare('SELECT trang_thai FROM dang_ky WHERE id = ?1').bind(r.id).first();
    assert.equal(sau.trang_thai, 'approved');
    await chayLenhEl(env, '/tuchoi', [r.id]);
    assert.equal((await env.DB.prepare('SELECT trang_thai FROM dang_ky WHERE id = ?1').bind(r.id).first()).trang_thai, 'rejected');
    assert.equal((await cauHinh(env)).computed.totalRegistered, 4, 'từ chối thì trả lại suất');
  } finally { f.thoi(); }
});

test('/lich, /buoi, /kinhnghiem, /thongbao, /slide đổi đúng chỗ', async () => {
  const env = env0();
  await chayLenhEl(env, '/lich', ['Thứ', '3', '&', '5', '|', '20h–22h']);
  const c1 = await docCauHinh(env.DB);
  assert.equal(c1.schedule.days, 'Thứ 3 & 5');
  assert.equal(c1.schedule.time, '20h–22h');
  assert.match(c1.schedule.detail, /^Thứ 3 & 5, 20h–22h \(GMT\+7/);
  await chayLenhEl(env, '/buoi', ['10', '6', '4']);
  assert.equal((await docCauHinh(env.DB)).schedule.sessions, 10);
  await chayLenhEl(env, '/kinhnghiem', ['3+']);
  assert.equal((await docCauHinh(env.DB)).stats.years, '3+');
  await chayLenhEl(env, '/thongbao', ['Khai', 'giảng', '15/09']);
  assert.deepEqual((await docCauHinh(env.DB)).announcement, { show: true, text: 'Khai giảng 15/09' });
  await chayLenhEl(env, '/xoathongbao', []);
  assert.equal((await docCauHinh(env.DB)).announcement.show, false);
  await chayLenhEl(env, '/slide', ['off']);
  assert.equal((await docCauHinh(env.DB)).media.showSlides, false);
});

test('/chiso: sửa từng ô số liệu, "." giữ nguyên, "mặc định" trả về tự động; trang nhận khối chiSo', async () => {
  const env = env0();
  // Lệnh trơn / số ô sai → bảng 4 ô hiện tại, ô chưa đặt ghi (tự động)
  const r0 = await chayLenhEl(env, '/chiso', []);
  assert.match(r0.text, /Ô 1/);
  assert.match(r0.text, /Năm kinh nghiệm/);
  assert.match(r0.text, /tự động/);
  assert.match((await chayLenhEl(env, '/chiso', ['9'])).text, /4 ô số liệu/);

  await chayLenhEl(env, '/chiso', '2 | 7 | Cohort đã xong | 60+ học viên — IB, PE'.split(' '));
  let c = await docCauHinh(env.DB);
  assert.deepEqual(c.chiSo[1], { so: '7', tieuDe: 'Cohort đã xong', phu: '60+ học viên — IB, PE' });
  assert.deepEqual(c.chiSo[0], { so: '', tieuDe: '', phu: '' }, 'ô khác không đổi');

  await chayLenhEl(env, '/chiso', '2 | . | . | 70+ học viên'.split(' '));
  c = await docCauHinh(env.DB);
  assert.deepEqual(c.chiSo[1], { so: '7', tieuDe: 'Cohort đã xong', phu: '70+ học viên' }, '"." giữ nguyên');

  await chayLenhEl(env, '/chiso', '2 | mặc định | . | .'.split(' '));
  assert.equal((await docCauHinh(env.DB)).chiSo[1].so, '', 'một trường về tự động');

  const web = await cauHinh(env);
  assert.equal(web.chiSo.length, 4, 'trang nhận đủ 4 ô');
  assert.equal(web.chiSo[1].phu, '70+ học viên');

  await chayLenhEl(env, '/chiso', ['2', 'mặc', 'định']);
  assert.deepEqual((await docCauHinh(env.DB)).chiSo[1], { so: '', tieuDe: '', phu: '' }, 'cả ô về tự động');
});

test('/status vẽ được bảng tình hình trên cơ sở dữ liệu thật', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await post(env, NGUOI);
    const r = await chayLenhEl(env, '/status', []);
    assert.match(r.text, /Cohort 07/);
    assert.match(r.text, /Đang mở đăng ký/);
    assert.match(r.text, /5\/10/);
    assert.match(r.text, /⏳ 1 chờ/);
    assert.ok(r.nut.length >= 2, 'thiếu nút bấm');
  } finally { f.thoi(); }
});

test('lệnh lạ thì chỉ sang /menu chứ không im lặng', async () => {
  const r = await chayLenhEl(env0(), '/khongcolenhnay', []);
  assert.match(r.text, /Không hiểu lệnh/);
  assert.match((await chayLenhEl(env0(), '/menu', [])).text, /Bảng điều khiển/);
});

// ─── Chuyển đăng ký cũ sang ─────────────────────────────────

test('/nhapdangky kéo đăng ký từ bản Apps Script, chạy lại không nhân đôi', async () => {
  const that = globalThis.fetch;
  const goi = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('script.google.com')) {
      goi.push(u);
      return new Response(JSON.stringify({ ok: true, regs: [
        { id: 'R250101120000', time: '01/01/2025 12:00', cohort: 'Cohort 06', name: 'Người Cũ', phone: "'0911111111", job: 'Kế toán', status: 'approved' },
        { id: 'R250102130000', time: '02/01/2025 13:00', cohort: 'Cohort 07', name: 'Người Mới', phone: '0922222222', status: 'pending' },
      ] }));
    }
    return new Response('{"ok":true,"result":{}}');
  };
  try {
    const env = env0();
    const EXEC = 'https://script.google.com/macros/s/ABC/exec';
    const r = await chayLenhEl(env, '/nhapdangky', [EXEC, 'key-quan-tri']);
    assert.match(r.text, /2 bản mới/);
    assert.match(goi[0], /action=regs&key=key-quan-tri/);
    // Số điện thoại bản cũ có dấu nháy chống Sheet đọc thành công thức — phải lọc khi so trùng.
    const cu = await env.DB.prepare("SELECT sdt_so FROM dang_ky WHERE id = 'R250101120000'").first();
    assert.equal(cu.sdt_so, '0911111111');
    // Đăng ký của cohort hiện tại được tính vào số chỗ; cohort cũ thì không.
    assert.equal((await cauHinh(env)).computed.totalRegistered, 5);

    const lai = await chayLenhEl(env, '/nhapdangky', [EXEC, 'key-quan-tri']);
    assert.match(lai.text, /0 bản mới/, 'chạy lại phải không nhân đôi');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM dang_ky').first();
    assert.equal(Number(n.n), 2);
  } finally { globalThis.fetch = that; }
});

test('/nhapdangky: thiếu tham số, link lạ, hay key sai đều báo rõ chứ không im', async () => {
  const env = env0();
  assert.match((await chayLenhEl(env, '/nhapdangky', [])).text, /Gõ/);
  assert.match((await chayLenhEl(env, '/nhapdangky', ['https://ke-gian.com/exec', 'k'])).text, /phải là địa chỉ \/exec/);
  const that = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"ok":false,"error":"unauthorized"}');
  try {
    const r = await chayLenhEl(env, '/nhapdangky', ['https://script.google.com/macros/s/A/exec', 'sai']);
    assert.match(r.text, /Bản cũ từ chối.*unauthorized/s);
  } finally { globalThis.fetch = that; }
});

// ─── Bảng điều khiển & xuất CSV ─────────────────────────────

test('/menu in giá trị đang chạy thật, không phải số ví dụ', async () => {
  const env = env0();
  await chayLenhEl(env, '/slot', ['20']);
  await chayLenhEl(env, '/giasom', ['2tr5']);
  await chayLenhEl(env, '/lich', ['Thứ', '3', '&', '5', '|', '20h–22h']);
  await chayLenhEl(env, '/slide', ['off']);
  await chayLenhEl(env, '/dong', []);
  const t = (await chayLenhEl(env, '/menu', [])).text;
  for (const muc of ['📊 <b>Xem</b>', '✅ <b>Duyệt đăng ký</b>', '🔢 <b>Cohort &amp; chỗ</b>',
    '💰 <b>Học phí</b>', '📅 <b>Lịch học &amp; hồ sơ</b>', '🚦 <b>Trạng thái</b>',
    '🎬 <b>Nội dung trên web</b>', '📢 <b>Thông báo trên web</b>', '🔗 <b>Trang link-in-bio</b>']) {
    assert.ok(t.includes(muc), `menu thiếu mục ${muc}`);
  }
  assert.ok(t.includes('/slot <code>20</code>'), 'số chỗ phải là giá trị thật');
  assert.ok(t.includes('/giasom <code>2500000</code>'));
  assert.ok(t.includes('/lich <code>Thứ 3 &amp; 5 | 20h–22h</code>'));
  assert.ok(t.includes('/slide <code>on</code>'), 'đang ẩn thì gợi ý bật lại');
  assert.match(t, /\/dong — đóng đăng ký ⬅️/);
  assert.ok(!/\/mo — đang mở đăng ký ⬅️/.test(t), 'chỉ một trạng thái được đánh dấu');
  // Telegram cắt tin ở 4096 ký tự; lớp gửi tin cắt ở 4000.
  assert.ok(t.length < 4000, `menu dài ${t.length} ký tự, sẽ bị cắt`);
});

/** Bắt sendDocument: thân tin là multipart nên không parse JSON như các lệnh khác. */
function moFile() {
  const got = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.endsWith('/sendDocument')) {
      const fd = init.body;
      const f = fd.get('document');
      // Blob.text() theo chuẩn tự bỏ BOM, mà BOM chính là thứ cần kiểm — nên giải mã thủ công.
      const noiDung = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await f.arrayBuffer());
      got.push({ ten: f.name, noiDung, chuThich: fd.get('caption'), chat: fd.get('chat_id') });
      return new Response('{"ok":true,"result":{}}');
    }
    return new Response('{"ok":true,"result":{}}');
  };
  return { got, thoi: () => { globalThis.fetch = that; } };
}

test('/xuat gửi file CSV đủ đăng ký, mở bằng Excel không lỗi tiếng Việt', async () => {
  const f = moFile();
  try {
    const env = env0();
    const { BOT_EL } = await import('../worker/src/botel.js');
    await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify(NGUOI) }), env, moCtx());
    await env.DB.prepare('UPDATE dang_ky SET muc_tieu = ?1, nghe = ?2').bind('Muốn "lên senior", đổi nghề', '=2+5').run();
    const ctx = { tin: { chat: { id: Number(ADMIN) } }, guiFile: BOT_EL.guiFile };
    const r = await chayLenhEl(env, '/xuat', [], ctx);
    assert.equal(r.text, undefined, 'gửi file xong thì không nhắn thêm');
    assert.equal(f.got.length, 1);
    const { ten, noiDung, chuThich, chat } = f.got[0];
    assert.equal(chat, ADMIN);
    assert.match(ten, /^dangky-elevato-R\d{12}\.csv$/);
    assert.ok(noiDung.startsWith('﻿Mã,Thời điểm,Cohort,Họ tên,'), 'thiếu BOM hoặc dòng tiêu đề');
    const dong = noiDung.replace(/﻿/, '').trim().split('\r\n');
    assert.equal(dong.length, 2);
    assert.ok(dong[1].includes('Nguyễn Văn A'));
    assert.ok(dong[1].includes('"Muốn ""lên senior"", đổi nghề"'), 'chưa thoát dấu ngoặc kép và dấu phẩy');
    assert.ok(dong[1].includes("'=2+5"), 'chuỗi mở đầu bằng = phải chặn để Excel không tính như công thức');
    assert.match(chuThich, /1 đăng ký/);
    assert.match(chuThich, /⏳ chờ 1 · ✅ duyệt 0 · ❌ từ chối 0/);
  } finally { f.thoi(); }
});

test('/xuat lúc chưa có ai thì nói thẳng, không gửi file rỗng', async () => {
  const f = moFile();
  try {
    const r = await chayLenhEl(env0(), '/xuat', [], { tin: { chat: { id: 1 } }, guiFile: async () => ({ ok: true }) });
    assert.match(r.text, /Chưa có đăng ký nào/);
    assert.equal(f.got.length, 0);
  } finally { f.thoi(); }
});

test('menu bot elevaTO: đúng khuôn Telegram, lệnh nào cũng chạy, và khớp bảng điều khiển', async () => {
  const { MENU_EL } = await import('../worker/src/botel.js');
  for (const { command, description } of MENU_EL) {
    assert.match(command, /^[a-z0-9_]{1,32}$/, `tên lệnh "${command}" sai khuôn Telegram`);
    assert.ok(description.length >= 3 && description.length <= 256, `mô tả "${command}" dài sai`);
    // Tên lệnh chỉ được dùng a–z nên icon phải nằm ở đầu mô tả — đó là chỗ duy nhất
    // danh sách gợi ý "/" của Telegram hiện ra.
    assert.match(description, /^\p{Extended_Pictographic}/u, `/${command} thiếu icon đầu mô tả`);
  }
  assert.equal(new Set(MENU_EL.map((x) => x.command)).size, MENU_EL.length, 'không được trùng lệnh');
  const icon = MENU_EL.map((x) => x.description.match(/^\S+/)[0]);
  assert.equal(new Set(icon).size, icon.length, `icon bị trùng: ${icon.filter((x, i) => icon.indexOf(x) !== i)}`);

  const f = moFetch();
  try {
    const env = env0();
    for (const { command } of MENU_EL) {
      const kq = await chayLenhEl(env, `/${command}`, [], { tin: { chat: { id: Number(ADMIN) } }, guiFile: async () => ({ ok: true }) });
      assert.doesNotMatch(kq.text || '', /Không hiểu lệnh/, `/${command} không có trong bộ định tuyến`);
    }
    // Menu Telegram và bảng điều khiển phải kể cùng một bộ lệnh — sửa một chỗ là lộ ngay.
    const t = (await chayLenhEl(env, '/menu', [])).text;
    const trongBang = new Set((t.match(/(?<=^|\s)\/[a-z0-9_]+/g) || []).map((x) => x.slice(1)));
    for (const { command } of MENU_EL) {
      if (command === 'menu') continue;
      assert.ok(trongBang.has(command), `/${command} có trong menu Telegram mà thiếu trong bảng điều khiển`);
    }
    for (const c of trongBang) {
      assert.ok(MENU_EL.some((x) => x.command === c), `/${c} có trong bảng điều khiển mà thiếu trong menu Telegram`);
    }
  } finally { f.thoi(); }
});

// ─── Hỏi từng bước ──────────────────────────────────────────

/** Giả lập Telegram đẩy một tin của quản trị sang webhook bot elevaTO. */
async function tin(env, text, id = 9) {
  const ctx = moCtx();
  await worker.fetch(new Request(`${API}tg/el`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'bimat' },
    body: JSON.stringify({ update_id: id, message: { message_id: id, chat: { id: ADMIN, type: 'private' }, from: { id: ADMIN }, text } }),
  }), env, ctx);
  await ctx.xong();
}
const cuoi = (f) => f.tg.filter((x) => x.method === 'sendMessage').at(-1);

test('gõ lệnh trơn thì bot hỏi rồi chờ trả lời, không bắt nhớ cú pháp', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await tin(env, '/giasom');
    const hoi = cuoi(f);
    assert.match(hoi.text, /Giá Early Bird là bao nhiêu\?/);
    assert.match(hoi.text, /Đang là <b>3\.000\.000đ<\/b>/, 'câu hỏi phải kèm giá trị đang chạy');
    assert.equal(hoi.reply_markup.force_reply, true, 'thiếu force_reply nên Telegram không mở sẵn ô trả lời');
    assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 3000000, 'mới hỏi thôi, chưa được đổi gì');

    await tin(env, '2tr5', 10);
    assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 2500000);
    assert.match(cuoi(f).text, /Giá Early Bird = <b>2\.500\.000đ<\/b>/);
    // Trả lời xong là xong — gõ tiếp một số nữa không được tính là câu trả lời lần hai.
    await tin(env, '9tr', 11);
    assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 2500000, 'việc đã xong mà vẫn còn nuốt tin');
  } finally { f.thoi(); }
});

test('lệnh nhiều bước hỏi lần lượt, có đánh số bước', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await tin(env, '/lich');
    assert.match(cuoi(f).text, /Học vào những ngày nào\?.*bước 1\/2/s);
    await tin(env, 'Thứ 3 & 5', 10);
    assert.match(cuoi(f).text, /Mấy giờ\?.*bước 2\/2/s);
    await tin(env, '20h–22h', 11);
    const c = await docCauHinh(env.DB);
    assert.equal(c.schedule.days, 'Thứ 3 & 5');
    assert.equal(c.schedule.time, '20h–22h');
    assert.match(c.schedule.detail, /^Thứ 3 & 5, 20h–22h/);
  } finally { f.thoi(); }
});

test('/huy bỏ câu đang hỏi dở, và lệnh mới cũng bỏ', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await tin(env, '/giasom');
    await tin(env, '/huy', 10);
    assert.match(cuoi(f).text, /Đã bỏ/);
    await tin(env, '2tr5', 11);
    assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 3000000, 'huỷ rồi mà vẫn nhận câu trả lời');
    assert.match(cuoi(f).text, /Không hiểu lệnh/);

    // Đang hỏi giá mà gõ lệnh khác: bỏ câu cũ, hỏi câu mới.
    await tin(env, '/giasom', 12);
    await tin(env, '/slot', 13);
    assert.match(cuoi(f).text, /Tổng số chỗ là bao nhiêu\?/);
    await tin(env, '20', 14);
    const c = await docCauHinh(env.DB);
    assert.equal(c.slots.max, 20);
    assert.equal(c.pricing.earlyBird, 3000000, 'câu trả lời chạy nhầm sang lệnh đã bỏ');
  } finally { f.thoi(); }
});

test('gõ liền một dòng vẫn chạy thẳng, không hỏi lại', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await tin(env, '/giasom 2tr5');
    assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 2500000);
    assert.ok(!f.tg.some((x) => x.reply_markup && x.reply_markup.force_reply), 'đã có giá trị rồi còn hỏi');
  } finally { f.thoi(); }
});

test('việc hỏi dở tự hết hạn, không nằm lại trong cơ sở dữ liệu mãi', async () => {
  const f = moFetch();
  try {
    const env = env0();
    await tin(env, '/slot');
    const r = await env.DB.prepare("SELECT khoa, het_luc FROM cai_dat WHERE khoa LIKE 'cho_%'").first();
    assert.equal(r.khoa, `cho_el_${ADMIN}`);
    assert.ok(Number(r.het_luc) > 0, 'thiếu hạn nên việc dở nằm lại mãi');
    await tin(env, '12', 10);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cai_dat WHERE khoa LIKE 'cho_%'").first().then((x) => Number(x.n)), 0,
      'trả lời xong phải dọn');
  } finally { f.thoi(); }
});

test('/huy có trong menu Telegram dù bot không tự khai', async () => {
  const { BOT_EL } = await import('../worker/src/botel.js');
  const { MENU_EL } = await import('../worker/src/botel.js');
  assert.ok(!MENU_EL.some((x) => x.command === 'huy'), 'bot không cần tự khai /huy');
  assert.ok(BOT_EL.menu.some((x) => x.command === 'huy'), 'lớp vận chuyển phải tự gắn /huy vào menu');
});

test('bảng câu hỏi: lệnh nào cũng có thật, câu nào cũng đủ chữ, và phủ hết lệnh cần giá trị', async () => {
  const { HOI_EL, MENU_EL } = await import('../worker/src/botel.js');
  const f = moFetch();
  try {
    const env = env0();
    for (const [lenh, spec] of Object.entries(HOI_EL)) {
      assert.match(lenh, /^\/[a-z0-9_]+$/, `khoá "${lenh}" phải là tên lệnh`);
      assert.ok(spec.buoc.length >= 1 && spec.buoc.length <= 5, `${lenh}: số bước lạ`);
      for (const b of spec.buoc) assert.ok(b.hoi && b.hoi.length >= 5, `${lenh}: thiếu câu hỏi`);
      if (spec.buoc.length > 1 && !spec.ghep) {
        assert.ok(spec.buoc.every((b) => !/ /.test(b.vd || '')), `${lenh}: nhiều bước mà không có ghep thì mỗi câu chỉ được một từ`);
      }
      assert.doesNotMatch((await chayLenhEl(env, lenh, ['x'])).text || '', /Không hiểu lệnh/, `${lenh} không có trong bộ định tuyến`);
    }
    // Lệnh nào cần giá trị mà không có trong bảng thì người dùng lại phải tự nhớ cú pháp.
    const CAN_GIA_TRI = ['cohort', 'slot', 'base', 'giasom', 'giagoc', 'giatuhoc',
      'lich', 'buoi', 'kinhnghiem', 'chiso', 'thongbao', 'video', 'duyet', 'tuchoi'];
    for (const c of CAN_GIA_TRI) {
      assert.ok(HOI_EL[`/${c}`], `/${c} cần giá trị mà chưa có câu hỏi`);
      assert.ok(MENU_EL.some((x) => x.command === c), `/${c} có câu hỏi mà thiếu trong menu`);
    }
  } finally { f.thoi(); }
});
