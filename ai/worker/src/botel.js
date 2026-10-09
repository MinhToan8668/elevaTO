// Bot elevaTO — lo CẢ trang khoá học lẫn trang link-in-bio (cố ý chung một bot; bot AI BCTC
// tách riêng, xem telegram.js). Gom từ backend/Code.gs.
//
// Khác bản Apps Script: chữ đậm / mã dùng thẻ HTML thay cú pháp Markdown, vì lớp gửi tin chung
// (tg.js) đặt parse_mode HTML cho cả hai bot.

import {
  cauHinhDayDu, cohortLabel, datTrangThai, docCauHinh, ghiCauHinh,
  gioVN, maDangKy, soDienThoai, tien, tienNgan, timDangKy,
} from './khoahoc.js';
import { linksKey } from './links.js';
import { esc, laChatQuanTri, taoBot } from './tg.js';

const b = (s) => `<b>${esc(s)}</b>`;
const ma = (s) => `<code>${esc(s)}</code>`;
const ng = (s) => `<i>${esc(s)}</i>`;

// Lệnh có kèm giá trị. Một bảng dùng chung cho bộ định tuyến, cho thẻ gợi ý khi bấm lệnh trơn,
// và cho nút +/- trên thẻ đó.
const SO_LENH = {
  cohort: { duong: ['cohort', 'number'], nhan: 'Cohort', vd: '/cohort 8', buoc: 1 },
  slot: { duong: ['slots', 'max'], nhan: 'Tổng số chỗ', vd: '/slot 12', buoc: 1 },
  base: { duong: ['slots', 'base'], nhan: 'Đăng ký ngoài hệ thống', vd: '/base 4', buoc: 1 },
  giasom: { duong: ['pricing', 'earlyBird'], nhan: 'Giá Early Bird', vd: '/giasom 3000000', buoc: 100000, tien: true },
  giagoc: { duong: ['pricing', 'regular'], nhan: 'Giá gốc', vd: '/giagoc 4000000', buoc: 100000, tien: true },
  giatuhoc: { duong: ['pricing', 'selfPaced'], nhan: 'Giá Self-paced', vd: '/giatuhoc 1500000', buoc: 100000, tien: true },
};
const BAT_TAT = {
  slide: { duong: ['media', 'showSlides'], nhan: 'Mục slide bài giảng' },
  model: { duong: ['media', 'showModel'], nhan: 'Mục model bàn giao' },
};

const lay = (o, d) => d.reduce((x, k) => (x == null ? x : x[k]), o);
const dat = (o, d, v) => { d.slice(0, -1).reduce((x, k) => x[k], o)[d.at(-1)] = v; };

/**
 * Thẻ cho thấy giá trị đang dùng. Bình thường lệnh trơn được tg.js giữ lại để hỏi nên thẻ này
 * ít khi hiện; nó là lối thoát khi giá trị gõ vào không đọc được.
 */
function goiY(dang, vd, chu, nut) {
  let t = `⚙️ ${dang}\n\nGõ ${ma(String(vd).split(' ')[0])} rồi trả lời câu bot hỏi, `
    + `hoặc gõ liền một dòng: ${ma(vd)}`;
  if (chu) t += `\n\n${ng(chu)}`;
  return { text: t, nut };
}

const docSo = (spec, v) => (spec.tien ? tien(v) : spec.duong[1] === 'number' ? `${v} (${cohortLabel(v)})` : String(v));
/**
 * Đọc số tiền: 3000000 · 3.000.000 · 3tr · 3M · 3,5tr · 2tr5 · 500k · 2k5.
 *
 * Dấu chấm là ngăn nghìn, dấu phẩy là phần lẻ (đúng lối Việt Nam). Đuôi số sau "tr"/"k" là
 * phần lẻ: 2tr5 = 2,5 triệu.
 *
 * Bản Apps Script cũ gặp chuỗi lạ thì vét lấy các chữ số còn lại, nên "/giasom 2tr5" lặng lẽ
 * đặt giá thành 25 đồng. Nay không đọc được thì trả NaN để chỗ gọi báo ra, chứ không đoán bừa.
 */
export function docTien(s) {
  const raw = String(s).toLowerCase().replace(/[\s.]/g, '').replace(/,/g, '.');
  const nhan = (m, he) => {
    const le = m[2] || m[3] || '';
    return Math.round((Number(m[1]) + (le ? Number(`0.${le}`) : 0)) * he);
  };
  let m = /^(\d+)(?:\.(\d+))?(?:tr|m)(\d*)$/.exec(raw);
  if (m) return nhan(m, 1e6);
  m = /^(\d+)(?:\.(\d+))?k(\d*)$/.exec(raw);
  if (m) return nhan(m, 1000);
  return /^\d+$/.test(raw) ? Number(raw) : NaN;
}

// ─── Lệnh ───────────────────────────────────────────────────

const MENU = [
  { command: 'status', description: '📊 Bảng tình hình cohort đang chạy' },
  { command: 'ds', description: '📋 Danh sách đăng ký của cohort này' },
  { command: 'xuat', description: '📥 Tải toàn bộ đăng ký về dạng file CSV' },
  { command: 'duyet', description: '✅ Duyệt một đăng ký (id hoặc số điện thoại)' },
  { command: 'tuchoi', description: '❌ Từ chối một đăng ký' },
  { command: 'cohort', description: '🔢 Đổi số cohort' },
  { command: 'cohortmoi', description: '🆕 Mở cohort mới, đếm lại từ 0' },
  { command: 'slot', description: '🪑 Tổng số chỗ của lớp' },
  { command: 'base', description: '➕ Số người đăng ký ngoài hệ thống' },
  { command: 'giasom', description: '🏷️ Giá Early Bird' },
  { command: 'giagoc', description: '💰 Giá gốc' },
  { command: 'giatuhoc', description: '🎧 Giá gói Self-paced' },
  { command: 'lich', description: '📅 Lịch học (ngày | giờ)' },
  { command: 'buoi', description: '🕐 Số buổi: tổng, lý thuyết, thực hành' },
  { command: 'kinhnghiem', description: '🎓 Số năm kinh nghiệm hiện trên trang' },
  { command: 'chiso', description: '🧮 Sửa 4 ô số liệu dưới đầu trang' },
  { command: 'mo', description: '🟢 Mở đăng ký' },
  { command: 'day', description: '🟡 Đánh dấu đã đủ chỗ' },
  { command: 'dong', description: '🔴 Đóng đăng ký' },
  { command: 'thongbao', description: '📢 Bật banner thông báo trên trang' },
  { command: 'xoathongbao', description: '🔕 Tắt banner thông báo' },
  { command: 'video', description: '🎬 Đặt link video học thử' },
  { command: 'xoavideo', description: '🙈 Ẩn video học thử' },
  { command: 'slide', description: '🖼️ Hiện / ẩn mục slide bài giảng' },
  { command: 'model', description: '📐 Hiện / ẩn mục model bàn giao' },
  { command: 'linkkey', description: '🔗 Key để sửa trang link-in-bio' },
  { command: 'menu', description: '⚙️ Danh sách lệnh đầy đủ' },
];

/**
 * Bảng điều khiển. Mỗi lệnh có giá trị thì in kèm GIÁ TRỊ ĐANG CHẠY THẬT, không phải số ví dụ —
 * nhìn một lượt là biết web đang đặt gì. Bấm chữ lệnh thì bot hỏi rồi chờ trả lời.
 */
async function huongDan(env) {
  const c = await cauHinhDayDu(env.DB);
  const s = c.schedule;
  return [
    `⚙️ ${b('elevaTO — Bảng điều khiển')}`,
    ng('Mọi thay đổi ở đây tự động hiện lên web trong ~1 phút.'), '',
    `👉 Bấm lệnh nào cũng được. Lệnh cần giá trị thì bot ${b('hỏi')}, mình trả lời thẳng vào ô chat — khỏi nhớ cú pháp.`,
    `Quen tay rồi thì gõ liền một dòng cũng chạy: ${ma('/slot 12')}. Đang hỏi dở mà đổi ý thì ${ma('/huy')}.`, '',

    `📊 ${b('Xem')}`,
    `/status — tình trạng hiện tại (${esc(c.computed.cohortLabel)}, ${c.computed.totalRegistered}/${c.slots.max} chỗ)`,
    '/ds — danh sách đăng ký (/ds cho để lọc chờ duyệt)',
    '/xuat — tải toàn bộ đăng ký về dạng file CSV', '',

    `✅ ${b('Duyệt đăng ký')}`,
    '/duyet &lt;id hoặc sđt&gt; · /tuchoi &lt;id hoặc sđt&gt;',
    ng('Có người đăng ký là bot nhắn ngay kèm nút Duyệt / Từ chối — thường khỏi gõ lệnh.'), '',

    `🔢 ${b('Cohort & chỗ')}`,
    `/cohort ${ma(c.cohort.number)} — đổi sang ${esc(cohortLabel(Number(c.cohort.number) + 1))} khi gõ số kế tiếp`,
    `/slot ${ma(c.slots.max)} — tổng số chỗ mỗi cohort`,
    `/base ${ma(c.slots.base)} — số người đăng ký ngoài hệ thống`,
    '/cohortmoi — mở cohort kế tiếp (tự +1, đếm lại từ 0)',
    ng('Số cohort đã hoàn thành tự bằng số cohort hiện tại trừ 1.'), '',

    `💰 ${b('Học phí')}`,
    `/giasom ${ma(c.pricing.earlyBird)} — giá Early Bird`,
    `/giagoc ${ma(c.pricing.regular)} — giá gốc (giá gạch)`,
    `/giatuhoc ${ma(c.pricing.selfPaced)} — giá Self-paced`,
    ng('Gõ tắt đều hiểu: 3tr · 3M · 2tr5 · 3,5tr · 500k'), '',

    `📅 ${b('Lịch học & hồ sơ')}`,
    `/lich ${ma(`${s.days} | ${s.time}`)}`,
    `/buoi ${ma(`${s.sessions} ${s.theory} ${s.practice}`)} — tổng buổi, lý thuyết, thực hành`,
    `/kinhnghiem ${ma(c.stats.years)} — số năm kinh nghiệm hiện đầu trang`,
    '/chiso — sửa 4 ô số liệu dưới đầu trang (số, tiêu đề, dòng nhỏ từng ô)', '',

    `🚦 ${b('Trạng thái')}`,
    `/mo — đang mở đăng ký${c.cohort.status === 'open' ? ' ⬅️' : ''}`,
    `/day — đã đủ chỗ, chuyển sang waitlist${c.cohort.status === 'full' ? ' ⬅️' : ''}`,
    `/dong — đóng đăng ký${c.cohort.status === 'closed' ? ' ⬅️' : ''}`, '',

    `🎬 ${b('Nội dung trên web')}`,
    '/video &lt;link YouTube hoặc Drive&gt; — bật video học thử',
    `/xoavideo — ẩn video${c.media.videoUrl ? '' : ' (đang ẩn sẵn)'}`,
    `/slide ${ma(c.media.showSlides ? 'off' : 'on')} — mục slide bài giảng (đang ${c.media.showSlides ? 'hiện' : 'ẩn'})`,
    `/model ${ma(c.media.showModel ? 'off' : 'on')} — mục model bàn giao (đang ${c.media.showModel ? 'hiện' : 'ẩn'})`, '',

    `📢 ${b('Thông báo trên web')}`,
    '/thongbao &lt;nội dung&gt; — hiện banner đầu trang',
    `/xoathongbao — tắt banner${c.announcement.show ? `\n${ng(`Đang hiện: ${c.announcement.text}`)}` : ' (đang tắt)'}`, '',

    `🔗 ${b('Trang link-in-bio')}`,
    '/linkkey — key để lưu trang link từ trình chỉnh sửa',
  ].join('\n');
}

async function lenhStatus(env) {
  const c = await cauHinhDayDu(env.DB);
  const { results } = await env.DB.prepare(
    'SELECT trang_thai, COUNT(*) AS n FROM dang_ky WHERE cohort = ?1 GROUP BY trang_thai',
  ).bind(c.computed.cohortLabel).all();
  const dem = Object.fromEntries((results || []).map((r) => [r.trang_thai, Number(r.n)]));
  const day = Math.round(c.computed.percent / 10);
  const thanh = '█'.repeat(day) + '░'.repeat(10 - day);
  const tt = { open: '🟢 Đang mở đăng ký', full: '🟡 Đã đủ chỗ — nhận waitlist', closed: '🔴 Đã đóng' }[c.cohort.status] || c.cohort.status;

  const t = [
    `📊 ${b(c.computed.cohortLabel)} · ${tt}`, '',
    `${ma(thanh)} ${c.computed.percent}%`,
    `👥 ${b(`${c.computed.totalRegistered}/${c.slots.max}`)} chỗ · còn ${b(c.computed.remaining)} suất`,
    `   ├ ngoài hệ thống: ${c.slots.base}`,
    `   └ qua web: ${c.slots.registered}  (⏳ ${dem.pending || 0} chờ · ✅ ${dem.approved || 0} duyệt)`, '',
    `💰 Early Bird ${b(c.computed.price.earlyBird)}  (gốc <s>${esc(c.computed.price.regular)}</s>, tiết kiệm ${c.computed.price.savePercent}%)`,
    `   Self-paced: ${esc(c.computed.price.selfPaced)}${c.pricing.showSelfPaced ? '' : ` ${ng('(đang ẩn)')}`}`, '',
    `📅 ${esc(c.schedule.detail)}`,
    `📚 ${c.schedule.sessions} buổi (${c.schedule.theory} lý thuyết + ${c.schedule.practice} thực hành)`,
    `🎓 Đã hoàn thành: ${c.stats.cohortsDone} cohort`, '',
    `🎬 Video học thử: ${c.media.videoUrl ? '✅ đang bật' : '— chưa có'}`,
    `🖼 Slide: ${c.media.showSlides ? 'hiện' : 'ẩn'}  ·  Model: ${c.media.showModel ? 'hiện' : 'ẩn'}`,
    c.announcement.show ? `\n📢 Banner: ${ng(c.announcement.text)}` : '',
    '', ng(`Cập nhật lúc ${c.updatedAt || '—'}`),
  ].filter(String).join('\n');

  return { text: t, nut: [
    [{ text: '➖ chỗ', callback_data: 'set:slot:-1' }, { text: '➕ chỗ', callback_data: 'set:slot:1' },
      { text: '🔄', callback_data: 'st:' }],
    [{ text: '🟢 Mở', callback_data: 'stt:open' }, { text: '🟡 Đủ', callback_data: 'stt:full' },
      { text: '🔴 Đóng', callback_data: 'stt:closed' }],
  ] };
}

/** Nút ➖ ➕ nhích giá trị, gắn vào tin xác nhận để sửa tiếp khỏi phải gõ lại lệnh. */
const nutNhich = (cmd) => {
  const spec = SO_LENH[cmd];
  const n = spec.tien ? tienNgan(spec.buoc) : spec.buoc;
  return [[{ text: `➖ ${n}`, callback_data: `adj:${cmd}:-${spec.buoc}` },
    { text: `➕ ${n}`, callback_data: `adj:${cmd}:${spec.buoc}` }]];
};

async function datSo(env, cmd, args) {
  const spec = SO_LENH[cmd];
  const cfg = await docCauHinh(env.DB);
  const n = spec.tien ? docTien(args) : parseInt(String(args).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) {
    return { text: `⚠️ Không đọc được ${ma(args)}. ${spec.nhan} vẫn là ${b(docSo(spec, lay(cfg, spec.duong)))}.\n\n`
      + `Gõ ${ma(`/${cmd}`)} rồi trả lời lại.${spec.tien ? `\n${ng('Gõ tắt cũng được: 3tr · 3M · 2tr5 · 3,5tr · 500k')}` : ''}` };
  }
  dat(cfg, spec.duong, n);
  await ghiCauHinh(env.DB, cfg);
  return { text: `✅ ${spec.nhan} = ${b(docSo(spec, n))}\n\nWeb sẽ cập nhật trong ~1 phút.`, nut: nutNhich(cmd) };
}

async function datTT(env, st) {
  const cfg = await docCauHinh(env.DB);
  cfg.cohort.status = st;
  await ghiCauHinh(env.DB, cfg);
  return { text: { open: '🟢 Đã mở đăng ký.', full: '🟡 Đã đánh dấu đủ chỗ — web chuyển sang nhận waitlist.',
    closed: '🔴 Đã đóng đăng ký — nút đăng ký trên web bị vô hiệu hoá.' }[st] };
}

async function lenhDS(env, loc) {
  const cfg = await docCauHinh(env.DB);
  const nhan = cohortLabel(cfg.cohort.number);
  const f = String(loc || '').toLowerCase();
  const tt = f.startsWith('cho') ? 'pending' : f.startsWith('duyet') ? 'approved' : '';
  const { results } = tt
    ? await env.DB.prepare('SELECT * FROM dang_ky WHERE cohort = ?1 AND trang_thai = ?2 ORDER BY id LIMIT 25').bind(nhan, tt).all()
    : await env.DB.prepare('SELECT * FROM dang_ky WHERE cohort = ?1 ORDER BY id LIMIT 25').bind(nhan).all();
  const ds = results || [];
  if (!ds.length) return { text: `Chưa có đăng ký nào cho ${esc(nhan)}${tt ? ' ở mục này' : ''}.` };
  const icon = { pending: '⏳', approved: '✅', rejected: '❌' };
  return { text: [`📋 ${b(nhan)} — ${ds.length} đăng ký`, '', ...ds.map((r, i) =>
    `${i + 1}. ${icon[r.trang_thai] || '•'} ${b(r.ten)} · ${ma(r.sdt)}\n   ${esc(r.nghe || '—')} · ${ma(r.id)}`)].join('\n') };
}

// ─── Xuất CSV ───────────────────────────────────────────────

// Bản Apps Script ghi thẳng vào Google Sheet; Worker không có Sheet nên gửi hẳn file CSV.
const COT_XUAT = [
  ['id', 'Mã'], ['tao_luc', 'Thời điểm'], ['cohort', 'Cohort'], ['ten', 'Họ tên'],
  ['sdt', 'Điện thoại'], ['nam', 'Năm kinh nghiệm'], ['email', 'Email'], ['nghe', 'Công việc'],
  ['muc_tieu', 'Mục tiêu'], ['nguon', 'Nguồn'], ['trang_thai', 'Trạng thái'], ['ghi_chu', 'Ghi chú'],
];

/**
 * Một ô CSV. Bọc ngoặc kép khi có dấu phẩy / ngoặc kép / xuống dòng, và cả khi chuỗi mở đầu bằng
 * = + - @ — Excel coi những ký tự đó là công thức, nên thêm dấu nháy đơn chặn trước.
 */
export function oCsv(v) {
  const s = v == null ? '' : String(v);
  const an = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(an) ? `"${an.replace(/"/g, '""')}"` : an;
}

/** Toàn bộ bảng đăng ký thành CSV. Dấu BOM ở đầu để Excel mở ra đúng tiếng Việt. */
export function lamCsv(ds) {
  const dong = [COT_XUAT.map((c) => c[1]).join(',')];
  for (const r of ds) dong.push(COT_XUAT.map((c) => oCsv(r[c[0]])).join(','));
  return `﻿${dong.join('\r\n')}\r\n`;
}

async function lenhXuat(env, ctx) {
  const { results } = await env.DB.prepare('SELECT * FROM dang_ky ORDER BY id').all();
  const ds = results || [];
  if (!ds.length) return { text: 'Chưa có đăng ký nào để xuất.' };
  if (!ctx.guiFile || !ctx.tin) return { text: `Có ${b(ds.length)} đăng ký, nhưng không gửi được file từ đây.` };
  const dem = ds.reduce((a, r) => ({ ...a, [r.trang_thai]: (a[r.trang_thai] || 0) + 1 }), {});
  const gui = await ctx.guiFile(env, ctx.tin.chat.id, `dangky-elevato-${maDangKy()}.csv`, lamCsv(ds),
    [`📦 ${b(`${ds.length} đăng ký`)} · xuất lúc ${esc(gioVN())}`,
      `⏳ chờ ${dem.pending || 0} · ✅ duyệt ${dem.approved || 0} · ❌ từ chối ${dem.rejected || 0}`,
      '', ng('Mở bằng Excel hoặc Google Sheets đều được.')].join('\n'));
  return gui ? {} : { text: 'Gửi file không thành công, thử lại giúp t nha.' };
}

async function duyet(env, args, tt, cmd) {
  if (!args) {
    const ds = await lenhDS(env, 'cho');
    return { text: `Cần kèm id hoặc số điện thoại, ví dụ ${ma(`${cmd} 0901234567`)}.\nDưới đây là các đăng ký đang chờ:\n\n${ds.text}` };
  }
  const r = await timDangKy(env.DB, args);
  if (!r) return { text: `Không tìm thấy đăng ký ${ma(args)}.` };
  await datTrangThai(env.DB, r.id, tt);
  return { text: `${tt === 'approved' ? '✅ Đã duyệt ' : '❌ Đã từ chối '}${b(r.ten)} · ${ma(r.sdt)}` };
}

/** Thông báo đăng ký mới cho quản trị, kèm nút duyệt / từ chối. */
export async function baoDangKyMoi(env, r, c) {
  const d = [`🔔 ${b(`Đăng ký mới — ${c.computed.cohortLabel}`)}`, '',
    `👤 ${b(r.ten)}`, `📱 ${ma(r.sdt)}`, `🎂 ${esc(r.nam || '—')}`, `💼 ${esc(r.nghe || '—')}`];
  if (r.email) d.push(`✉️ ${esc(r.email)}`);
  if (String(r.nguon).includes('tuhoc')) d.push(`📦 Gói: ${b('Tự học (self-paced)')} — không tính vào số chỗ lớp live`);
  if (r.muc_tieu) d.push(`🎯 ${ng(`"${r.muc_tieu}"`)}`);
  d.push('', `📅 ${esc(c.schedule.detail)}`, `🕐 ${esc(r.tao_luc)}`, '',
    `📊 ${b(`${c.computed.totalRegistered}/${c.slots.max} chỗ`)} · còn ${b(c.computed.remaining)} suất`);
  await BOT_EL.bao(env, d.join('\n'), [[
    { text: '✅ Duyệt', callback_data: `ok:${r.id}` }, { text: '❌ Từ chối', callback_data: `no:${r.id}` }]]);
}

async function chayLenh(env, lenh, arg, ctx = {}) {
  const args = arg.join(' ').trim();
  const c = lenh.replace(/^\//, '');
  if (['start', 'menu', 'help'].includes(c)) return { text: await huongDan(env) };
  if (['status', 'trangthai'].includes(c)) return lenhStatus(env);
  if (c === 'slots' || SO_LENH[c]) return datSo(env, c === 'slots' ? 'slot' : c, args);
  if (['kinhnghiem', 'nam'].includes(c)) return lenhNam(env, args);
  if (c === 'lich') return lenhLich(env, args);
  if (c === 'buoi') return lenhBuoi(env, args);
  if (c === 'chiso') return lenhChiSo(env, args);
  const csm = c.match(/^cs([1-4])(so|td|phu)$/);
  if (csm) {                                         // một phần của một ô, từ bảng nút /chiso
    const vi = PHAN_CS.findIndex((x) => x[0] === csm[2]);
    const phan = ['.', '.', '.']; phan[vi] = args || '.';
    return lenhChiSo(env, `${csm[1]} | ${phan.join(' | ')}`);
  }
  if (c === 'mo') return datTT(env, 'open');
  if (['day', 'dayroi'].includes(c)) return datTT(env, 'full');
  if (c === 'dong') return datTT(env, 'closed');
  if (c === 'thongbao') return lenhThongBao(env, args, false);
  if (c === 'xoathongbao') return lenhThongBao(env, '', true);
  if (c === 'cohortmoi') return lenhCohortMoi(env);
  if (c === 'video') return lenhVideo(env, args, false);
  if (c === 'xoavideo') return lenhVideo(env, '', true);
  if (BAT_TAT[c]) return lenhBatTat(env, c, args);
  if (['ds', 'dsdangky'].includes(c)) return lenhDS(env, args);
  if (['xuat', 'sheet'].includes(c)) return lenhXuat(env, ctx);
  if (c === 'duyet') return duyet(env, args, 'approved', '/duyet');
  if (c === 'tuchoi') return duyet(env, args, 'rejected', '/tuchoi');
  if (['linkkey', 'trangsua'].includes(c)) return lenhLinkKey(env);
  if (c === 'nhapdangky') return lenhNhapDangKy(env, arg);
  return { text: `Không hiểu lệnh ${ma(lenh)}. Gõ /menu để xem danh sách lệnh.` };
}

async function lenhNam(env, v) {
  const cfg = await docCauHinh(env.DB);
  if (!v) return goiY(`Số năm kinh nghiệm đang là ${b(cfg.stats.years)}`, '/kinhnghiem 3+', 'Viết sao hiện y vậy: 3 · 3+ · 2.5+ đều được');
  if (!/^[0-9]+([.,][0-9]+)?\+?$/.test(v)) return goiY(`Không đọc được ${ma(v)}`, '/kinhnghiem 3+', 'Chỉ nhận số, có thể kèm dấu + ở cuối');
  cfg.stats.years = v;
  await ghiCauHinh(env.DB, cfg);
  return { text: `✅ Kinh nghiệm = ${b(v)} năm\n\nWeb sẽ cập nhật trong ~1 phút.` };
}

async function lenhLich(env, args) {
  const cfg = await docCauHinh(env.DB);
  if (!args) {
    return goiY(`Lịch học đang là ${b(`${cfg.schedule.days} · ${cfg.schedule.time}`)}`,
      `/lich ${cfg.schedule.days} | ${cfg.schedule.time}`, 'Ngày và giờ ngăn cách bởi dấu gạch đứng');
  }
  const p = args.split('|');
  cfg.schedule.days = p[0].trim();
  if (p[1]) cfg.schedule.time = p[1].trim();
  cfg.schedule.detail = `${cfg.schedule.days}, ${cfg.schedule.time} (GMT+7, Việt Nam)`;
  await ghiCauHinh(env.DB, cfg);
  return { text: `✅ Lịch học: ${b(`${cfg.schedule.days} · ${cfg.schedule.time}`)}` };
}

async function lenhBuoi(env, args) {
  const cfg = await docCauHinh(env.DB);
  const n = String(args).match(/\d+/g);
  if (!n || n.length < 3) {
    const s = cfg.schedule;
    return goiY(`Đang là ${b(`${s.sessions} buổi`)} (${s.theory} lý thuyết + ${s.practice} thực hành)`,
      `/buoi ${s.sessions} ${s.theory} ${s.practice}`, 'Ba số theo thứ tự: tổng, lý thuyết, thực hành');
  }
  cfg.schedule.sessions = +n[0]; cfg.schedule.theory = +n[1]; cfg.schedule.practice = +n[2];
  await ghiCauHinh(env.DB, cfg);
  return { text: `✅ ${n[0]} buổi (${n[1]} lý thuyết + ${n[2]} thực hành)` };
}

// ─── /chiso: 4 ô số liệu dưới đầu trang ─────────────────────
// Mặc định mỗi ô lấy từ cấu hình khác (năm kinh nghiệm, số cohort, số buổi, giá Early Bird) — đó là
// chữ hiện khi một trường để trống. Đặt chữ riêng thì ô hiện y vậy, kể cả khi các số kia đổi.
const O_MAC_DINH = [
  (c) => [c.stats.years, 'Năm kinh nghiệm', 'M&A thực chiến'],
  (c) => [String(c.stats.cohortsDone), 'Cohort đã hoàn thành', `${c.stats.students} học viên — IB, PE, Corp Finance, Big4`],
  (c) => [String(c.schedule.sessions), `Buổi học (${c.schedule.hoursPerSession} tiếng/buổi)`, `${c.schedule.theory} lý thuyết + ${c.schedule.practice} thực hành`],
  (c) => [c.computed.price.earlyBirdShort, 'Early Bird', 'giá ưu đãi cho waitlist'],
];
const GIU = /^[.·\-–—]$/;                        // "." hoặc "-" = giữ nguyên trường này
const MAC_DINH_CHU = /^(mặc định|mac dinh|macdinh|tự động|tu dong|auto|reset|xoá|xoa)$/i;

/** Danh sách 4 ô như trên trang lúc này — ô tự động ghi (tự động) để biết cái nào đã đặt riêng. */
async function bangChiSo(env) {
  const c = await cauHinhDayDu(env.DB);
  const ds = Array.isArray(c.chiSo) ? c.chiSo : [];
  return O_MAC_DINH.map((f, i) => {
    const goc = f(c); const x = ds[i] || {};
    const tr = (v, g) => (String(v || '').trim() ? b(v) : `${esc(g)} ${ng('(tự động)')}`);
    return `${b(`Ô ${i + 1}`)}: ${tr(x.so, goc[0])}
   ${tr(x.tieuDe, goc[1])}
   ${tr(x.phu, goc[2])}`;
  }).join('\n');
}

// Bảng điền: mỗi ô số liệu một hàng nút [con số] [tiêu đề] [dòng nhỏ] [↺]. Bấm nút nào thì bot hỏi đúng
// phần đó (cuộc hỏi /csNso · /csNtd · /csNphu, tg.js mở qua callback hoi:…), điền xong bảng hiện lại.
const PHAN_CS = [['so', 'so', 'Con số'], ['td', 'tieuDe', 'Tiêu đề'], ['phu', 'phu', 'Dòng nhỏ']];
const ngan = (t, n = 22) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
async function bangNutChiSo(env) {
  const c = await cauHinhDayDu(env.DB);
  const ds = Array.isArray(c.chiSo) ? c.chiSo : [];
  return O_MAC_DINH.map((f, i) => {
    const goc = f(c); const x = ds[i] || {};
    return [
      ...PHAN_CS.map(([ma1, k], j) => {
        const v = String(x[k] || '').trim();
        return { text: `${v ? '✍️ ' : ''}${ngan(v || goc[j], j === 0 ? 10 : 22)}`, callback_data: `hoi:cs${i + 1}${ma1}` };
      }),
      { text: '↺', callback_data: `csr:${i + 1}` },
    ];
  });
}
async function theChiSo(env, dau) {
  return {
    text: `${dau ? `${dau}\n\n` : ''}📊 ${b('4 ô số liệu dưới đầu trang')}\n\n${await bangChiSo(env)}\n\n`
      + `👇 ${b('Bấm vào ô muốn sửa')} — mỗi hàng là một ô trên trang, từ trái qua: con số · tiêu đề · dòng nhỏ.\n`
      + `✍️ = đã đặt chữ riêng · ↺ = trả cả hàng về tự động.\n${ng('Web cập nhật trong ~1 phút sau khi sửa.')}`,
    nut: await bangNutChiSo(env),
  };
}

async function lenhChiSo(env, args) {
  const vd = '/chiso 2 | 7 | Cohort đã hoàn thành | 60+ học viên — IB, PE, Big4';
  if (!String(args).trim()) return theChiSo(env);
  // "2 | 7 | …" hoặc "2 mặc định": số ô là từ đầu tiên, phần còn lại tách theo dấu gạch đứng.
  const m = String(args).trim().match(/^(\d+)\s*\|?\s*([\s\S]*)$/);
  const p = m ? [m[1], ...(m[2] ? m[2].split('|').map((x) => x.trim()) : [])] : [String(args).trim()];
  const so = Number(p[0]);
  if (!args || !Number.isInteger(so) || so < 1 || so > 4) {
    return goiY(`4 ô số liệu dưới đầu trang:\n\n${await bangChiSo(env)}`, vd,
      'Thứ tự: số ô (1–4) | con số | tiêu đề | dòng nhỏ. Gõ "." để giữ nguyên một phần, "mặc định" để trả về tự động — vd /chiso 2 mặc định');
  }
  const cfg = await docCauHinh(env.DB);
  const ds = (Array.isArray(cfg.chiSo) ? cfg.chiSo : []).slice(0, 4);
  while (ds.length < 4) ds.push({ so: '', tieuDe: '', phu: '' });
  const o = { so: '', tieuDe: '', phu: '', ...ds[so - 1] };
  const sau = p.slice(1);
  if (sau.length === 1 && MAC_DINH_CHU.test(sau[0])) {
    ds[so - 1] = { so: '', tieuDe: '', phu: '' };
  } else {
    ['so', 'tieuDe', 'phu'].forEach((k, i) => {
      const v = sau[i];
      if (v === undefined || v === '' || GIU.test(v)) return;
      o[k] = MAC_DINH_CHU.test(v) ? '' : v.slice(0, k === 'phu' ? 80 : 40);
    });
    ds[so - 1] = o;
  }
  cfg.chiSo = ds;
  await ghiCauHinh(env.DB, cfg);
  return theChiSo(env, `✅ Đã sửa ô ${so}.`);
}

async function lenhThongBao(env, text, xoa) {
  const cfg = await docCauHinh(env.DB);
  if (!String(text || '').trim() && !xoa) {
    const a = cfg.announcement;
    return goiY(a.show ? `Banner đang hiện:\n${ng(a.text)}` : `Web ${b('không có')} banner nào`,
      '/thongbao Khai giảng 15/09', 'Muốn tắt banner thì dùng /xoathongbao');
  }
  cfg.announcement.text = text;
  cfg.announcement.show = !!text;
  await ghiCauHinh(env.DB, cfg);
  return { text: text ? `📢 Banner đã bật:\n${ng(text)}` : '✅ Đã tắt banner thông báo.' };
}

async function lenhCohortMoi(env) {
  const cfg = await docCauHinh(env.DB);
  const cu = cohortLabel(cfg.cohort.number);
  cfg.cohort.number = Number(cfg.cohort.number) + 1;
  cfg.cohort.status = 'open';
  cfg.slots.base = 0;
  await ghiCauHinh(env.DB, cfg);          // cohortsDone tự suy ra, không cộng tay ở đây
  const st = await lenhStatus(env);
  return { text: `🚀 Đã mở ${b(cohortLabel(cfg.cohort.number))}\n\n`
    + `• ${esc(cu)} vẫn còn nguyên trong cơ sở dữ liệu (không mất dữ liệu)\n`
    + '• Bộ đếm reset về 0, trạng thái 🟢 mở\n'
    + `• Số cohort đã hoàn thành: ${Math.max(0, cfg.cohort.number - 1)}\n\n`
    + `Web tự cập nhật — ${b('không cần sửa dòng code nào.')}\n\n${st.text}`, nut: st.nut };
}

async function lenhVideo(env, url, xoa) {
  const cfg = await docCauHinh(env.DB);
  const u = String(url || '').trim();
  // Bấm "/video" trơn trong menu chỉ gửi đúng chữ đó. Trước đây nó rơi vào nhánh xoá và làm mất
  // luôn mục học thử trên web — nay chỉ hiện hướng dẫn.
  if (!u && !xoa) {
    return goiY(cfg.media.videoUrl ? `Video học thử đang dùng:\n${ma(cfg.media.videoUrl)}` : `Web ${b('chưa có')} video học thử`,
      '/video https://drive.google.com/file/d/XXXX/view', 'Muốn gỡ video khỏi web thì dùng /xoavideo');
  }
  if (u && !/^https?:\/\//i.test(u)) {
    return { text: `Link phải bắt đầu bằng http:// hoặc https://\n\nVí dụ:\n${ma('/video https://youtu.be/abc123xyz90')}` };
  }
  cfg.media.videoUrl = u;
  await ghiCauHinh(env.DB, cfg);
  if (!u) return { text: '✅ Đã ẩn mục video học thử trên web.' };
  const loai = u.includes('youtu') ? 'YouTube' : u.includes('drive.google') ? 'Google Drive' : 'link nhúng';
  return { text: `🎬 Đã bật video học thử (${loai}).\n\nWeb sẽ hiện mục ${b('Học thử')} trong ~1 phút.\n\n`
    + ng('Lưu ý: video trên Google Drive phải để quyền "Bất kỳ ai có đường liên kết" thì người xem mới thấy.') };
}

async function lenhBatTat(env, cmd, args) {
  const spec = BAT_TAT[cmd];
  const a = String(args || '').trim().toLowerCase();
  let on;
  if (['on', 'bat', 'bật', '1', 'hien', 'hiện'].includes(a)) on = true;
  else if (['off', 'tat', 'tắt', '0', 'an', 'ẩn'].includes(a)) on = false;
  else {
    // Bật/tắt thì một cái nút là đủ, không cần hỏi han gì.
    const dang = lay(await docCauHinh(env.DB), spec.duong);
    return { text: `⚙️ ${spec.nhan} đang ${b(dang ? 'hiện' : 'ẩn')} trên web.`,
      nut: [[{ text: dang ? '🙈 Ẩn đi' : '👁 Hiện lên', callback_data: `tog:${cmd}` }]] };
  }
  return datBatTat(env, cmd, on);
}

async function datBatTat(env, cmd, on) {
  const spec = BAT_TAT[cmd];
  const cfg = await docCauHinh(env.DB);
  dat(cfg, spec.duong, on);
  await ghiCauHinh(env.DB, cfg);
  return { text: `${on ? '👁 Đã hiện ' : '🙈 Đã ẩn '}${spec.nhan} trên web.` };
}

/**
 * Kéo đăng ký cũ từ bản Apps Script sang (chạy một lần lúc chuyển máy chủ).
 *   /nhapdangky <link /exec> <ADMIN_KEY>
 * Bản cũ đã có sẵn đường xuất `?action=regs&key=…`, nên Worker tự gọi lấy về — khỏi copy paste
 * hàng trăm dòng qua Telegram. Mã đăng ký là khoá chính nên chạy lại bao nhiêu lần cũng không nhân đôi.
 */
async function lenhNhapDangKy(env, arg) {
  const [url, key] = arg;
  if (!url || !key) {
    return { text: `Gõ ${ma('/nhapdangky <link /exec của Apps Script> <ADMIN_KEY>')}\n\n`
      + `Lấy ADMIN_KEY bằng cách chạy hàm ${ma('xemAdminKey')} trong trình soạn thảo Apps Script.` };
  }
  if (!/^https:\/\/script\.google\.com\//.test(url)) return { text: 'Link phải là địa chỉ /exec của Apps Script.' };
  let d;
  try {
    const res = await fetch(`${url}?action=regs&key=${encodeURIComponent(key)}`, { redirect: 'follow' });
    d = await res.json();
  } catch (e) { return { text: `✘ Không gọi được bản cũ: ${esc(String(e.message || e).slice(0, 150))}` }; }
  if (!d || !d.ok) return { text: `✘ Bản cũ từ chối: ${esc(String((d && d.error) || 'không rõ'))}. Kiểm tra lại ADMIN_KEY.` };
  const ds = Array.isArray(d.regs) ? d.regs : [];
  if (!ds.length) return { text: 'Bản cũ không có đăng ký nào.' };

  let them = 0;
  for (const r of ds) {
    const id = String(r.id || '').trim();
    if (!id) continue;
    const kq = await env.DB.prepare(
      `INSERT OR IGNORE INTO dang_ky (id, tao_luc, cohort, ten, sdt, sdt_so, nam, email, nghe, muc_tieu, nguon, trang_thai, ghi_chu)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
    ).bind(id, String(r.time || ''), String(r.cohort || ''), String(r.name || ''), String(r.phone || ''),
      soDienThoai(r.phone), String(r.year || ''), String(r.email || ''), String(r.job || ''),
      String(r.goal || ''), String(r.source || ''), String(r.status || 'pending'), String(r.note || '')).run();
    if (kq && kq.meta && kq.meta.changes) them++;
  }
  const st = await lenhStatus(env);
  return { text: `📥 Bản cũ có ${ds.length} đăng ký — ${b(`${them} bản mới`)} đã nhập, ${ds.length - them} bản đã có sẵn.\n\n${st.text}`, nut: st.nut };
}

/** Key của trang link-in-bio. Chưa có thì tự sinh ngay lần hỏi đầu. */
async function lenhLinkKey(env) {
  const key = await linksKey(env.DB);
  return { text: `🔑 ${b('ADMIN_KEY của trang link')}\n\n${ma(key)}\n\n`
    + 'Mở trang sửa, dán key vào ô trên cùng. Trình duyệt nhớ key nên chỉ phải dán một lần.\n\n'
    + ng('Lộ key thì ai cũng sửa được trang link — đừng gửi cho ai.') };
}

// ─── Nút bấm ────────────────────────────────────────────────

async function xuLyNut(env, q, { api, gui }) {
  const chat = q.message && q.message.chat && q.message.chat.id;
  if (!laChatQuanTri(env, chat) || !laChatQuanTri(env, q.from && q.from.id)) {
    await api(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Không có quyền' });
    return;
  }
  const p = String(q.data || '').split(':');
  const dap = (t) => api(env, 'answerCallbackQuery', { callback_query_id: q.id, text: t });

  if (p[0] === 'ok' || p[0] === 'no') {
    const r = await timDangKy(env.DB, p[1]);
    if (!r) return dap('Không tìm thấy');
    await datTrangThai(env.DB, r.id, p[0] === 'ok' ? 'approved' : 'rejected');
    await dap(p[0] === 'ok' ? 'Đã duyệt' : 'Đã từ chối');
    return api(env, 'editMessageReplyMarkup', {
      chat_id: String(chat), message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: `${p[0] === 'ok' ? '✅ Đã duyệt — ' : '❌ Đã từ chối — '}${r.ten}`, callback_data: 'noop' }]] },
    });
  }
  if (p[0] === 'adj' || p[0] === 'set') {
    const spec = SO_LENH[p[1]];
    if (!spec) return dap('Nút không hợp lệ');
    const cfg = await docCauHinh(env.DB);
    const moi = Math.max(0, Number(lay(cfg, spec.duong)) + Number(p[2] || 0));
    dat(cfg, spec.duong, moi);
    await ghiCauHinh(env.DB, cfg);
    await dap(`${spec.nhan}: ${docSo(spec, moi)}`);
    const st = await lenhStatus(env);
    return gui(env, chat, st.text, st.nut);
  }
  if (p[0] === 'csr') {
    const r = await lenhChiSo(env, `${p[1]} mặc định`);
    await dap(`Ô ${p[1]} về tự động`);
    return gui(env, chat, r.text, r.nut);
  }
  if (p[0] === 'stt') { await datTT(env, p[1]); await dap('Đã đổi'); const st = await lenhStatus(env); return gui(env, chat, st.text, st.nut); }
  if (p[0] === 'st') { await dap('Đã làm mới'); const st = await lenhStatus(env); return gui(env, chat, st.text, st.nut); }
  if (p[0] === 'tog') { const r = await datBatTat(env, p[1], !lay(await docCauHinh(env.DB), BAT_TAT[p[1]].duong)); await dap('Đã đổi'); return gui(env, chat, r.text); }
  return dap('');
}

// ─── Hỏi từng bước ──────────────────────────────────────────
//
// Gõ lệnh trơn thì bot hỏi, mình trả lời — khỏi phải nhớ cú pháp. Gõ kèm giá trị
// (/slot 12) vẫn chạy thẳng như cũ, nhanh hơn khi đã quen tay.

const hoiSo = (cmd) => ({
  buoc: [{
    hoi: `${SO_LENH[cmd].nhan} là bao nhiêu?`,
    vd: SO_LENH[cmd].vd.split(' ').slice(1).join(' '),
    goi: async (env) => {
      const spec = SO_LENH[cmd];
      return `Đang là ${b(docSo(spec, lay(await docCauHinh(env.DB), spec.duong)))}.`
        + (spec.tien ? `\n${ng('Gõ tắt cũng được: 3tr · 3M · 2tr5 · 3,5tr · 500k')}` : '');
    },
  }],
});

const dangLa = (lay1) => async (env) => `Đang là ${b(lay1(await docCauHinh(env.DB)))}.`;

const HOI = {
  ...Object.fromEntries(Object.keys(SO_LENH).map((c) => [`/${c}`, hoiSo(c)])),
  '/slots': hoiSo('slot'),
  '/lich': {
    buoc: [
      { hoi: 'Học vào những ngày nào?', vd: 'Thứ 3 & 5', goi: dangLa((c) => c.schedule.days) },
      { hoi: 'Mấy giờ?', vd: '20h–22h', goi: dangLa((c) => c.schedule.time) },
    ],
    ghep: (d) => `${d[0]} | ${d[1]}`,          // lenhLich tách ngày với giờ bằng dấu gạch đứng
  },
  '/buoi': {
    buoc: [
      { hoi: 'Tổng cộng bao nhiêu buổi?', vd: '8', goi: dangLa((c) => `${c.schedule.sessions} buổi`) },
      { hoi: 'Trong đó mấy buổi lý thuyết?', vd: '5' },
      { hoi: 'Mấy buổi thực hành?', vd: '3' },
    ],
  },
  '/kinhnghiem': { buoc: [{ hoi: 'Số năm kinh nghiệm hiện trên trang?', vd: '3+', goi: dangLa((c) => `${c.stats.years} năm`) }] },
  // Một câu hỏi cho từng phần của từng ô — mở từ bảng nút của /chiso (callback hoi:cs1so …).
  ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => PHAN_CS.map(([ma1, k, nhan]) => [`/cs${n}${ma1}`, {
    buoc: [{
      hoi: `${nhan} của ô ${n}? Gõ "mặc định" để về tự động.`,
      vd: ma1 === 'so' ? '7' : ma1 === 'td' ? 'Cohort đã hoàn thành' : '60+ học viên — IB, PE',
      goi: async (env) => {
        const c = await cauHinhDayDu(env.DB);
        const v = String(((c.chiSo || [])[n - 1] || {})[k] || '').trim();
        const goc = O_MAC_DINH[n - 1](c)[PHAN_CS.findIndex((x) => x[0] === ma1)];
        return v ? `Đang đặt riêng: ${b(v)}` : `Đang tự động: ${b(goc)}`;
      },
    }],
  }]))),
  '/thongbao': {
    buoc: [{
      hoi: 'Banner đầu trang ghi gì?',
      vd: 'Khai giảng 15/09',
      goi: async (env) => {
        const a = (await docCauHinh(env.DB)).announcement;
        return a.show ? `Đang hiện: ${ng(a.text)}` : ng('Web đang không có banner nào.');
      },
    }],
  },
  '/video': {
    buoc: [{
      hoi: 'Dán link video học thử (YouTube hoặc Google Drive).',
      vd: 'https://youtu.be/abc123',
      goi: async (env) => {
        const u = (await docCauHinh(env.DB)).media.videoUrl;
        return u ? `Đang dùng: ${ma(u)}` : ng('Web chưa có video học thử.');
      },
    }],
  },
  '/duyet': { buoc: [{ hoi: 'Duyệt ai? Gõ id hoặc số điện thoại.', vd: '0901234567', goi: (env) => goiCho(env) }] },
  '/tuchoi': { buoc: [{ hoi: 'Từ chối ai? Gõ id hoặc số điện thoại.', vd: '0901234567', goi: (env) => goiCho(env) }] },
  '/nhapdangky': {
    buoc: [
      { hoi: 'Dán link /exec của bản Apps Script cũ.', vd: 'https://script.google.com/macros/s/…/exec' },
      { hoi: 'ADMIN_KEY của bản cũ?', vd: 'AKxxxxxxxx', goi: ng('Lấy bằng cách chạy hàm xemAdminKey trong trình soạn thảo Apps Script.') },
    ],
  },
};

/** Gợi ý kèm câu hỏi /duyet · /tuchoi: liệt kê luôn những ai đang chờ, khỏi phải gõ /ds trước. */
async function goiCho(env) {
  const ds = await lenhDS(env, 'cho');
  return ds.text;
}

/** Bot elevaTO: trang khoá học + trang link. Token riêng (TG_EL_TOKEN), webhook riêng (/tg/el). */
export const BOT_EL = taoBot({
  ten: 'el', bien: 'TG_EL_TOKEN', nhan: 'elevaTO', menu: MENU, lenh: chayLenh, nut: xuLyNut, hoi: HOI,
});

export { MENU as MENU_EL, chayLenh as chayLenhEl, HOI as HOI_EL };
