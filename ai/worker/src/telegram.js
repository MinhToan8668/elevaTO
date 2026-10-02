// Bot quản trị Telegram. Khác bản Apps Script: dùng WEBHOOK thay vì hỏi tin mỗi phút —
// Workers trả lời thẳng được nên Telegram đẩy tin sang ngay, không tốn lịch chạy, không trễ.
// Chỉ tin NHẮN RIÊNG do đúng chat quản trị (TG_ADMIN) gõ mới được ra lệnh.

import { bamSHA, boMoiPhien, doiMK, hanNgay, khoaLuot, laGV, vaiTro } from './auth.js';
import { demTK, docCaiDat, docDem, ghiCaiDat, suaTK, timTK, tkChoDuyet, tkMoiNhat, tkTheoMa } from './db.js';
import { thongKeAI } from './gemini.js';
import { anUngHo, datUngHo, thongTinUngHo } from './ungho.js';
import { linksKey } from './links.js';

export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TEN_VT = { free: 'Tài khoản thường', hv: 'Học viên', gv: 'Giảng viên' };
const TEN_TT = { active: 'đang dùng', cho: 'chờ duyệt', off: 'đã khoá' };

export const tgAdmins = (env) => String(env.TG_ADMIN || '').split(/[\s,;]+/).filter(Boolean);
const laChatQuanTri = (env, id) => tgAdmins(env).includes(String(id));

async function tgApi(env, method, payload) {
  const t = String(env.TG_TOKEN || '');
  if (!t) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
    });
    return await r.json();
  } catch (e) {
    console.error(`Telegram ${method}: ${String(e).split(t).join('***')}`);   // lỗi mạng hay kèm URL có token
    return null;
  }
}

export function tgGui(env, chatId, text, nut) {
  const p = { chat_id: String(chatId), text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true };
  if (nut) p.reply_markup = { inline_keyboard: nut };
  return tgApi(env, 'sendMessage', p);
}

/** @returns true nếu ít nhất một người nhận được — chưa bấm Start với bot thì Telegram từ chối. */
export async function baoQuanTri(env, text, nut) {
  let den = false;
  for (const id of tgAdmins(env)) {
    const r = await tgGui(env, id, text, nut);
    if (r && r.ok) den = true;
    else if (r) console.error(`Telegram từ chối gửi cho ${id}: ${r.description || ''}`);
  }
  return den;
}

/** Báo quản trị nhưng tối đa 1 lần mỗi `giay` giây cho cùng một loại việc. */
export function taoBao(env) {
  return async (loai, giay, text) => {
    if (await docCaiDat(env.DB, `bao_${loai}`)) return;
    await ghiCaiDat(env.DB, `bao_${loai}`, '1', giay);
    await baoQuanTri(env, text);
  };
}

// ─── Webhook ────────────────────────────────────────────────

/**
 * Menu lệnh Telegram: nút "Menu" cạnh ô soạn tin, và gõ "/" ra gợi ý.
 * Chỉ đặt cho riêng chat quản trị — người lạ mở bot sẽ không thấy menu lệnh họ không dùng được.
 * Tên lệnh phải khớp chayLenh bên dưới; mô tả ngắn, Telegram cắt chỗ dài.
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
  { command: 'linkkey', description: 'Key để sửa trang link-in-bio' },
  { command: 'help', description: 'Danh sách lệnh đầy đủ' },
];

/** Đăng ký menu lệnh. Nhớ theo nội dung menu nên sửa danh sách trên là tự đăng ký lại. */
async function ngoMenuLenh(env) {
  const admins = tgAdmins(env);
  if (!admins.length) return;
  const ban = await bamSHA(JSON.stringify(MENU_LENH) + admins.join(','));
  if (await docCaiDat(env.DB, 'tg_menu') === ban) return;
  let xong = true;
  for (const id of admins) {
    const r = await tgApi(env, 'setMyCommands', { commands: MENU_LENH, scope: { type: 'chat', chat_id: String(id) } });
    if (!r || !r.ok) xong = false;
  }
  if (xong) await ghiCaiDat(env.DB, 'tg_menu', ban);
}

/**
 * Đăng ký webhook nếu chưa đăng ký cho đúng địa chỉ này. Chạy ngầm sau mỗi yêu cầu
 * nên cài đặt không cần bước gõ lệnh nào: triển khai xong là bot sống.
 */
export async function ngoWebhook(env, url) {
  if (!env.TG_TOKEN || !env.TG_SECRET) return;
  const can = `${url}|${env.TG_SECRET.slice(0, 4)}`;
  if (await docCaiDat(env.DB, 'tg_webhook') !== can) {
    const r = await tgApi(env, 'setWebhook', {
      url, secret_token: env.TG_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
    });
    if (!r || !r.ok) { console.error(`setWebhook hỏng: ${(r && r.description) || 'không gọi được Telegram'}`); return; }
    await ghiCaiDat(env.DB, 'tg_webhook', can);
  }
  await ngoMenuLenh(env);
  // Lời chào ghi nhớ RIÊNG: chưa bấm Start với bot thì Telegram từ chối gửi, và webhook đã đăng ký
  // rồi nên nếu gộp chung thì người dùng vĩnh viễn không nhận được tin nào, tưởng bot chết.
  // Tách ra thì bấm Start xong, lượt truy cập sau là lời chào tới nơi.
  if (!tgAdmins(env).length || await docCaiDat(env.DB, 'tg_chao') === can) return;
  const den = await baoQuanTri(env, '✅ Bot <b>elevaTO AI BCTC</b> đã kết nối (Cloudflare Workers).\nGõ /help để xem các lệnh quản trị.');
  if (den) await ghiCaiDat(env.DB, 'tg_chao', can);
}

/** Phần cài đặt nào đã có — cho đường GET báo lại, khỏi phải đoán khi bot im hay AI không chạy. */
export function tinhTrang(env) {
  return {
    ai: !!String(env.GEMINI_KEYS || '').trim(),
    bot: !!(env.TG_TOKEN && env.TG_SECRET && tgAdmins(env).length),
    mail: !!(env.BREVO_KEY && env.MAIL_TU),
  };
}

/** Một tin Telegram gửi tới. Luôn trả 200 cho Telegram, lỗi chỉ ghi log. */
export async function nhanTin(env, u) {
  try {
    if (u.callback_query) return await xuLyNut(env, u.callback_query);
    const m = u.message;
    if (!m || !m.chat || !m.from || typeof m.text !== 'string') return;
    if (m.chat.type !== 'private' || !laChatQuanTri(env, m.chat.id) || !laChatQuanTri(env, m.from.id)
        || m.forward_origin || m.forward_date) return;
    const text = m.text.trim(), phan = text.split(/\s+/);
    const lenh = phan[0].replace(/@.*$/, '').toLowerCase();
    let arg = phan.slice(1);
    if (lenh === '/matkhau') {
      // Tin chứa mật khẩu: xoá khỏi lịch sử Telegram ngay; mật khẩu lấy nguyên văn (giữ khoảng trắng bên trong).
      await tgApi(env, 'deleteMessage', { chat_id: String(m.chat.id), message_id: m.message_id });
      arg = [arg[0], text.replace(/^\S+\s+\S+\s+/, '')];
    }
    const kq = await chayLenh(env, lenh, arg);
    await tgGui(env, m.chat.id, kq.text, kq.nut);
  } catch (e) { console.error(`nhanTin: ${e}`); }
}

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
  if (!env.TG_TOKEN) return;
  const cho = tk.trangthai === 'cho';
  await baoQuanTri(env, `🆕 <b>Tài khoản AI BCTC mới</b>${cho ? ' — <b>chờ duyệt</b>' : ''}\n${await moTaTaiKhoan(env, tk)}`
    + '\n\nXếp vai trò để mở quyền điền model elevaTO:', nutTaiKhoan(tk));
}

// ─── Lệnh ───────────────────────────────────────────────────

const HELP = ['<b>Bot quản trị elevaTO AI BCTC</b>',
  '/thongke — số tài khoản, lượt AI hôm nay, key',
  '/cho — tài khoản đang chờ duyệt',
  '/linkkey — key để lưu trang link-in-bio từ trình chỉnh sửa',
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

/** Key của trang link-in-bio. Chưa có thì tự sinh ngay lần hỏi đầu. */
async function lenhLinkKey(env) {
  const key = await linksKey(env.DB);
  return { text: [
    '🔗 <b>Key lưu trang link-in-bio</b>', '', `<code>${esc(key)}</code>`, '',
    'Mở trang sửa → mục <b>Đăng lên web</b> → dán vào ô ADMIN_KEY → bấm <b>Kiểm tra key</b>.',
    '<i>Ai có key này cũng sửa được trang link, đừng gửi cho người khác.</i>',
  ].join('\n') };
}

export async function chayLenh(env, lenh, arg) {
  if (lenh === '/start' || lenh === '/help') return { text: HELP };
  if (lenh === '/thongke') return lenhThongKe(env);
  if (lenh === '/moi') return lenhMoi(env);
  if (lenh === '/mkmoi') return lenhMkMoi(env, arg[0]);
  if (lenh === '/ungho') return lenhUngHo(env, arg);
  if (lenh === '/linkkey') return lenhLinkKey(env);
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

async function xuLyNut(env, q) {
  const chat = q.message && q.message.chat && q.message.chat.id;
  if (!laChatQuanTri(env, chat) || !laChatQuanTri(env, q.from && q.from.id)) {
    await tgApi(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Không có quyền' });
    return;
  }
  const p = String(q.data || '').split('|');
  const tk = /^E[A-Z0-9]{5}$/.test(p[2] || '') ? await tkTheoMa(env.DB, p[2]) : null;
  if (!tk) { await tgApi(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Không tìm thấy tài khoản' }); return; }
  let bao;
  if (p[0] === 'vt' && TEN_VT[p[1]]) { await suaTK(env.DB, tk.ma, { vaitro: p[1] }); bao = TEN_VT[p[1]]; tk.vaitro = p[1]; }
  else if (p[0] === 'tt' && TEN_TT[p[1]] && p[1] !== 'cho') {
    await suaTK(env.DB, tk.ma, { trangthai: p[1] });
    if (p[1] === 'off') await boMoiPhien(env.DB, tk.ma);
    bao = TEN_TT[p[1]]; tk.trangthai = p[1];
  } else { await tgApi(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Nút không hợp lệ' }); return; }
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: q.id, text: `✔ ${bao}` });
  await tgApi(env, 'editMessageText', {
    chat_id: String(chat), message_id: q.message.message_id, parse_mode: 'HTML',
    text: await moTaTaiKhoan(env, tk), reply_markup: { inline_keyboard: nutTaiKhoan(tk) },
  });
}


export { MENU_LENH };
