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

test('bấm lệnh trơn thì hiện giá trị đang dùng kèm dòng mẫu, KHÔNG xoá mất gì', async () => {
  const env = env0();
  const r = await chayLenhEl(env, '/giasom', []);
  assert.match(r.text, /Giá Early Bird đang là/);
  assert.match(r.text, /\/giasom 3000000/);
  assert.equal((await docCauHinh(env.DB)).pricing.earlyBird, 3000000, 'không được đổi gì');
  // /video trơn từng làm mất mục học thử trên web — nay chỉ hiện hướng dẫn.
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
  }
  assert.equal(new Set(MENU_EL.map((x) => x.command)).size, MENU_EL.length, 'không được trùng lệnh');

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
