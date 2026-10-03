// Bot AI BCTC — RIÊNG một bot, không dính trang khoá học hay trang link (chúng dùng bot elevaTO,
// xem botel.js). Phần gửi tin / webhook / menu lệnh nằm chung ở tg.js.

import { bamSHA, boMoiPhien, doiMK, hanNgay, khoaLuot, laGV, vaiTro } from './auth.js';
import { demTK, docDem, suaTK, timTK, tkChoDuyet, tkMoiNhat, tkTheoMa } from './db.js';
import { thongKeAI } from './gemini.js';
import { esc, laChatQuanTri, taoBot, tgAdmins } from './tg.js';
import { anUngHo, datUngHo, thongTinUngHo } from './ungho.js';

export { esc, tgAdmins };

const TEN_VT = { free: 'Tài khoản thường', hv: 'Học viên', gv: 'Giảng viên' };
const TEN_TT = { active: 'đang dùng', cho: 'chờ duyệt', off: 'đã khoá' };

/**
 * Menu lệnh hiện trong Telegram: nút "Menu" cạnh ô soạn tin, và gõ "/" ra gợi ý.
 * Tên lệnh phải khớp chayLenh bên dưới — có bài kiểm tra đối chiếu hai chỗ này.
 */
const MENU_LENH = [
  { command: 'thongke', description: 'Số tài khoản, lượt AI hôm nay, key Gemini' },
  { command: 'cho', description: 'Tài khoản đang chờ duyệt' },
  { command: 'moi', description: '15 tài khoản đăng ký gần nhất' },
  { command: 'tim', description: 'Tra cứu tài khoản theo email hoặc tên' },
  { command: 'hocvien', description: 'Xếp học viên — điền được model elevaTO' },
  { command: 'giangvien', description: 'Xếp giảng viên — không giới hạn lượt' },
  { command: 'free', description: 'Về tài khoản thường' },
  { command: 'luot', description: 'Đặt số lượt AI mỗi ngày (0 = theo vai trò)' },
  { command: 'mo', description: 'Mở / duyệt tài khoản' },
  { command: 'khoa', description: 'Khoá tài khoản' },
  { command: 'mkmoi', description: 'Sinh mật khẩu mới rồi đọc cho bạn' },
  { command: 'matkhau', description: 'Đặt lại mật khẩu bạn tự chọn' },
  { command: 'ungho', description: 'Xem / đặt số tài khoản nhận ủng hộ' },
  { command: 'help', description: 'Danh sách lệnh đầy đủ' },
];

// ─── Mô tả & nút ────────────────────────────────────────────

function nutTaiKhoan(tk) {
  return [
    [{ text: '🎓 Học viên', callback_data: `vt|hv|${tk.ma}` }, { text: '👨‍🏫 Giảng viên', callback_data: `vt|gv|${tk.ma}` },
      { text: '👤 Thường', callback_data: `vt|free|${tk.ma}` }],
    [tk.trangthai === 'active' ? { text: '🔒 Khoá', callback_data: `tt|off|${tk.ma}` }
      : { text: '✅ Mở / duyệt', callback_data: `tt|active|${tk.ma}` }],
  ];
}

async function moTaTaiKhoan(env, tk) {
  let khai = '';
  if (tk.nghe_nghiep || tk.tuoi) {
    khai = `\n👤 ${esc(tk.nghe_nghiep || '—')}${tk.tuoi ? ` · ${esc(tk.tuoi)} tuổi` : ''}`;
  }
  if (tk.muc_dich) khai += `\n🎯 ${esc(tk.muc_dich)}`;
  const dung = await docDem(env.DB, khoaLuot(tk));
  return `<b>${esc(tk.ten)}</b> · <code>${esc(tk.ma)}</code>\n📧 ${esc(tk.email)}\n📱 ${esc(tk.sdt)}${khai}`
    + `\n🏷 ${TEN_VT[vaiTro(tk)]} · ${TEN_TT[tk.trangthai] || esc(tk.trangthai)}`
    + `\n🤖 Hôm nay ${dung}${laGV(tk) ? ' lượt (không giới hạn)' : `/${await hanNgay(env, tk)} lượt`}`;
}

export async function baoTaiKhoanMoi(env, tk) {
  if (!BOT_AI.token(env)) return;
  const cho = tk.trangthai === 'cho';
  await BOT_AI.bao(env, `🆕 <b>Tài khoản AI BCTC mới</b>${cho ? ' — <b>chờ duyệt</b>' : ''}\n${await moTaTaiKhoan(env, tk)}`
    + '\n\nXếp vai trò để mở quyền điền model elevaTO:', nutTaiKhoan(tk));
}

// ─── Lệnh ───────────────────────────────────────────────────

const HELP = ['<b>Bot quản trị elevaTO AI BCTC</b>',
  '/thongke — số tài khoản, lượt AI hôm nay, key',
  '/cho — tài khoản đang chờ duyệt',
  '/tim &lt;email hoặc tên&gt; — tra cứu (kèm nút xếp vai trò)',
  '/hocvien &lt;email&gt; — xếp học viên (điền được model)',
  '/giangvien &lt;email&gt; — xếp giảng viên (không giới hạn lượt)',
  '/free &lt;email&gt; — về tài khoản thường',
  '/luot &lt;email&gt; &lt;số&gt; — số lượt AI mỗi ngày (0 = theo vai trò)',
  '/khoa &lt;email&gt; · /mo &lt;email&gt; — khoá / mở (duyệt) tài khoản',
  '/matkhau &lt;email&gt; &lt;mật khẩu mới&gt; — đặt lại mật khẩu (bot tự xoá tin có mật khẩu)',
  '/mkmoi &lt;email&gt; — bot tự sinh mật khẩu mạnh rồi đọc cho bạn',
  '/moi — 15 tài khoản đăng ký gần nhất',
  '/ungho — xem thông tin ủng hộ đang hiện trên trang',
  '/ungho &lt;ngân hàng&gt; &lt;số tk&gt; &lt;tên chủ tk&gt; — đặt số tài khoản nhận ủng hộ (vcb, tcb, mb… hoặc 6 số BIN)',
  '/ungho off — tạm ẩn phần ủng hộ trên trang'].join('\n');

const VT = { '/hocvien': 'hv', '/giangvien': 'gv', '/free': 'free' };
const TT = { '/khoa': 'off', '/mo': 'active', '/duyet': 'active' };

async function timMot(env, email) {
  const ds = await timTK(env.DB, String(email || '').trim(), 2);
  return (ds.results || [])[0] || null;
}

export async function chayLenh(env, lenh, arg, ctx = {}) {
  if (lenh === '/matkhau' && ctx.tin && ctx.api) {
    // Tin chứa mật khẩu: xoá khỏi lịch sử Telegram ngay; mật khẩu giữ nguyên khoảng trắng bên trong.
    await ctx.api(env, 'deleteMessage', { chat_id: String(ctx.tin.chat.id), message_id: ctx.tin.message_id });
    arg = [arg[0], ctx.tin.text.trim().replace(/^\S+\s+\S+\s+/, '')];
  }
  if (lenh === '/start' || lenh === '/help') return { text: HELP };
  if (lenh === '/thongke') return lenhThongKe(env);
  if (lenh === '/moi') return lenhMoi(env);
  if (lenh === '/mkmoi') return lenhMkMoi(env, arg[0]);
  if (lenh === '/ungho') return lenhUngHo(env, arg);
  if (lenh === '/cho') return lenhCho(env);
  if (lenh === '/tim') return lenhTim(env, arg);
  if (VT[lenh] || TT[lenh] || lenh === '/luot' || lenh === '/matkhau') {
    const tk = arg[0] ? await timMot(env, arg[0]) : null;
    if (!tk) return { text: `Không tìm thấy tài khoản ${esc(arg[0] || '')}. Gõ đúng email đã đăng ký.` };
    if (VT[lenh]) { await suaTK(env.DB, tk.ma, { vaitro: VT[lenh] }); return { text: `✔ ${esc(tk.email)} → ${TEN_VT[VT[lenh]]}` }; }
    if (TT[lenh]) {
      await suaTK(env.DB, tk.ma, { trangthai: TT[lenh] });
      if (TT[lenh] === 'off') await boMoiPhien(env.DB, tk.ma);
      return { text: `✔ ${esc(tk.email)} → ${TEN_TT[TT[lenh]]}` };
    }
    if (lenh === '/luot') {
      const n = Math.max(0, Math.floor(Number(arg[1])));
      if (!Number.isFinite(n)) return { text: 'Gõ /luot &lt;email&gt; &lt;số lượt mỗi ngày&gt;' };
      await suaTK(env.DB, tk.ma, { luot_ngay: n });
      return { text: `✔ ${esc(tk.email)}: ${n ? `${n} lượt AI mỗi ngày` : `theo vai trò (${await hanNgay(env, { ...tk, luot_ngay: 0 })} lượt)`}` };
    }
    try { await doiMK(env, tk, arg.slice(1).join(' ')); } catch (e) { return { text: `✘ ${esc(e.message)}` }; }
    return { text: `✔ Đã đặt mật khẩu mới cho ${esc(tk.email)} (các máy đang đăng nhập bị đăng xuất).` };
  }
  return { text: 'Không rõ lệnh. Gõ /help.' };
}

/**
 * Mật khẩu tạm: dễ đọc qua Telegram, bỏ các ký tự dễ nhìn lẫn (0/O, 1/l/I).
 * Bỏ byte rơi vào phần dư để không lệch về mấy ký tự đầu bảng.
 */
export function mkNgauNhien() {
  const bang = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const tran = 256 - (256 % bang.length);
  let out = '';
  while (out.length < 14) {
    for (const v of crypto.getRandomValues(new Uint8Array(32))) {
      if (out.length >= 14) break;
      if (v < tran) out += bang[v % bang.length];
    }
  }
  return out;
}

async function lenhThongKe(env) {
  const { results } = await demTK(env.DB);
  const dem = { free: 0, hv: 0, gv: 0, cho: 0, off: 0 };
  let tong = 0;
  for (const r of results || []) {
    const n = Number(r.n);
    tong += n;
    dem[vaiTro(r)] += n;
    if (r.trangthai === 'cho') dem.cho += n;
    if (r.trangthai === 'off') dem.off += n;
  }
  const a = await thongKeAI(env);
  return { text: `📊 <b>AI BCTC</b>\nTài khoản: ${tong} (học viên ${dem.hv} · giảng viên ${dem.gv} · thường ${dem.free}`
    + ` · chờ duyệt ${dem.cho} · khoá ${dem.off})\nLượt AI hôm nay: ${a.luot}\nKey Gemini: ${a.soKey}`
    + `${a.nghi ? ` (đang nghỉ ${a.nghi})` : ''}\nModel: ${esc(a.chuoi.join(' → ') || '—')}`
    + `${a.qt.length ? `\nĐang quá tải: ${esc(a.qt.join(', '))}` : ''}` };
}

async function lenhCho(env) {
  const { results } = await tkChoDuyet(env.DB, 11);
  const ds = results || [];
  if (!ds.length) return { text: 'Không có tài khoản nào chờ duyệt.' };
  for (const x of ds.slice(0, 10)) await baoQuanTri(env, await moTaTaiKhoan(env, x), nutTaiKhoan(x));
  return { text: `Có ${ds.length > 10 ? 'hơn 10' : ds.length} tài khoản chờ duyệt.` };
}

async function lenhTim(env, arg) {
  const q = arg.join(' ').toLowerCase();
  if (!q) return { text: 'Gõ /tim &lt;email hoặc tên&gt;' };
  const { results } = await timTK(env.DB, q, 15);
  const kq = results || [];
  if (!kq.length) return { text: `Không tìm thấy tài khoản nào khớp "${esc(q)}".` };
  if (kq.length === 1) return { text: await moTaTaiKhoan(env, kq[0]), nut: nutTaiKhoan(kq[0]) };
  return { text: `Tìm thấy ${kq.length}:\n${kq.map((x) => `• ${esc(x.ten)} — ${esc(x.email)} (${TEN_VT[vaiTro(x)]})`).join('\n')}` };
}

async function lenhMoi(env) {
  const { results } = await tkMoiNhat(env.DB, 15);
  const ds = results || [];
  if (!ds.length) return { text: 'Chưa có tài khoản nào.' };
  return { text: `<b>${ds.length} tài khoản mới nhất</b>\n${ds.map((x) =>
    `• ${esc(x.ten)} — <code>${esc(x.email)}</code> (${TEN_VT[vaiTro(x)]} · ${TEN_TT[x.trangthai] || esc(x.trangthai)})`).join('\n')}`
    + '\n\nGõ /tim &lt;email&gt; để mở nút xếp vai trò.' };
}

async function lenhMkMoi(env, email) {
  const tk = email ? await timMot(env, email) : null;
  if (!tk) return { text: `Không tìm thấy tài khoản ${esc(email || '')}. Gõ đúng email đã đăng ký.` };
  if (tk.trangthai !== 'active') return { text: `Tài khoản ${esc(tk.email)} đang ${TEN_TT[tk.trangthai] || esc(tk.trangthai)} — /mo trước đã.` };
  const mk = mkNgauNhien();
  await doiMK(env, tk, mk);
  return { text: `✔ Mật khẩu mới của ${esc(tk.email)}: <code>${esc(mk)}</code>\n`
    + 'Gửi cho họ rồi XOÁ tin này (Telegram lưu lịch sử chat). Các máy đang đăng nhập đã bị đăng xuất.' };
}

async function lenhUngHo(env, arg) {
  if (!arg.length) {
    const o = await thongTinUngHo(env.DB);
    if (!o) {
      return { text: 'Chưa đặt số tài khoản nhận ủng hộ — trang đang ẩn phần đó.\n'
        + 'Đặt bằng: /ungho &lt;ngân hàng&gt; &lt;số tk&gt; &lt;tên chủ tk&gt;\nVí dụ: /ungho vcb 1012345678 NGUYEN VAN A' };
    }
    return { text: `💛 <b>Thông tin ủng hộ đang hiện trên trang</b>\n🏦 ${esc(o.bank)} (BIN ${esc(o.bin)})`
      + `\n🔢 <code>${esc(o.stk)}</code>\n👤 ${esc(o.chu_tk || '—')}\n📝 ${esc(o.loi_nhan)}`
      + '\n\nĐổi: /ungho &lt;ngân hàng&gt; &lt;số tk&gt; &lt;tên chủ tk&gt; · Ẩn: /ungho off' };
  }
  if (/^(off|tat|an)$/i.test(arg[0])) {
    await anUngHo(env.DB);
    return { text: '✔ Đã ẩn phần ủng hộ trên trang.' };
  }
  try {
    const d = await datUngHo(env.DB, arg[0], arg[1], arg.slice(2).join(' '));
    return { text: `✔ Trang sẽ hiện: <b>${esc(d.bank)}</b> (BIN ${esc(d.bin)})\n🔢 <code>${esc(d.stk)}</code>`
      + `\n👤 ${esc(d.chu_tk || '—')}\n\nXem lại tên ngân hàng xem có đúng không nhé — sai BIN là người ủng hộ quét QR không được.` };
  } catch (e) { return { text: `✘ ${esc(e.message)}` }; }
}

async function xuLyNut(env, q, { api }) {
  const chat = q.message && q.message.chat && q.message.chat.id;
  if (!laChatQuanTri(env, chat) || !laChatQuanTri(env, q.from && q.from.id)) {
    await api(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Không có quyền' });
    return;
  }
  const p = String(q.data || '').split('|');
  const tk = /^E[A-Z0-9]{5}$/.test(p[2] || '') ? await tkTheoMa(env.DB, p[2]) : null;
  if (!tk) { await api(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Không tìm thấy tài khoản' }); return; }
  let bao;
  if (p[0] === 'vt' && TEN_VT[p[1]]) { await suaTK(env.DB, tk.ma, { vaitro: p[1] }); bao = TEN_VT[p[1]]; tk.vaitro = p[1]; }
  else if (p[0] === 'tt' && TEN_TT[p[1]] && p[1] !== 'cho') {
    await suaTK(env.DB, tk.ma, { trangthai: p[1] });
    if (p[1] === 'off') await boMoiPhien(env.DB, tk.ma);
    bao = TEN_TT[p[1]]; tk.trangthai = p[1];
  } else { await api(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Nút không hợp lệ' }); return; }
  await api(env, 'answerCallbackQuery', { callback_query_id: q.id, text: `✔ ${bao}` });
  await api(env, 'editMessageText', {
    chat_id: String(chat), message_id: q.message.message_id, parse_mode: 'HTML',
    text: await moTaTaiKhoan(env, tk), reply_markup: { inline_keyboard: nutTaiKhoan(tk) },
  });
}


/** Bot AI BCTC. Token riêng (TG_AI_TOKEN), webhook riêng (/tg/ai). */
export const BOT_AI = taoBot({
  ten: 'ai', bien: 'TG_AI_TOKEN', nhan: 'elevaTO AI BCTC',
  menu: MENU_LENH, lenh: chayLenh, nut: xuLyNut,
});

export { MENU_LENH };
