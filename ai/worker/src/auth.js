// Tài khoản, mật khẩu, phiên đăng nhập, hạn lượt mỗi ngày.

import { SO, so } from './caidat.js';
import { docCaiDat, docDem, giay, homNay, suaTK, themDem, tkTheoKhoa, xoaDem } from './db.js';

export const ok = (data) => ({ ok: true, data });
export const loi = (code, error, extra) => ({ ok: false, code, error, ...(extra || {}) });

// ─── Chuỗi & email ──────────────────────────────────────────

export const chuanEmail = (e) => String(e || '').trim().toLowerCase();
export const emailHopLe = (e) => e.length <= 120 && /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e);

/** Khoá so trùng: Gmail bỏ dấu chấm và +nhãn (an.nguyen+2@gmail.com = annguyen@gmail.com). */
export function khoaEmail(e) {
  const s = chuanEmail(e);
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  const ten = s.slice(0, at), mien = s.slice(at + 1);
  if (mien === 'gmail.com' || mien === 'googlemail.com') return `${ten.split('+')[0].replace(/\./g, '')}@gmail.com`;
  return s;
}

export const chuanTen = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 60).split(' ')
  .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');

// ─── Băm & so sánh ──────────────────────────────────────────

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const ngauNhien = (n = 16) => hex(bytes(n));

export async function bamSHA(s) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))));
}

/** Băm mật khẩu. Bản băm tự ghi kèm số vòng nên đổi BAM_VONG lúc nào cũng được. */
export async function bamMK(mk, vong, muoi = ngauNhien(16)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(mk)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(muoi), iterations: vong }, key, 256);
  return `pbkdf2$${vong}$${muoi}$${hex(bits)}`;
}

/** So sánh không sớm thoát: thời gian trả lời không phụ thuộc vào chỗ đầu tiên khác nhau.
 *  (Độ dài khác nhau thì trả lời ngay — bản băm luôn cùng một dạng nên độ dài không nói lên điều gì.) */
export function bangNhau(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let khac = 0;
  for (let i = 0; i < x.length; i++) khac |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return khac === 0;
}

/** Kiểm mật khẩu theo đúng số vòng đã ghi trong bản băm cũ. */
export async function dungMK(mk, luu) {
  const p = String(luu || '').split('$');
  if (p[0] !== 'pbkdf2' || p.length !== 4) return false;
  const vong = Math.min(Math.max(Number(p[1]) || 0, 1), 1e6);
  return bangNhau(await bamMK(mk, vong, p[2]), luu);
}

// ─── Vai trò & hạn lượt ─────────────────────────────────────

export function vaiTro(tk) {
  const v = String(tk.vaitro || '').trim().toLowerCase();
  if (v === 'gv' || v === 'admin') return 'gv';
  return v === 'hv' ? 'hv' : 'free';
}
export const laGV = (tk) => vaiTro(tk) === 'gv';

export const khoaLuot = (tk) => `Q_${tk.ma}_${homNay()}`;
export const daDung = (db, tk) => docDem(db, khoaLuot(tk));

export async function hanNgay(env, tk) {
  const rieng = Number(tk.luot_ngay);
  if (rieng > 0) return rieng;
  const hv = vaiTro(tk) === 'hv';
  const dat = Number(await docCaiDat(env.DB, hv ? 'AI_LUOT_HV' : 'AI_LUOT_FREE'));
  return dat > 0 ? dat : so(env, hv ? 'AI_LUOT_HV' : 'AI_LUOT_FREE');
}

export async function hoSo(env, tk) {
  const gv = laGV(tk);
  return {
    ten: String(tk.ten), email: String(tk.email), vaitro: vaiTro(tk),
    luot: { dung: await daDung(env.DB, tk), han: gv ? 0 : await hanNgay(env, tk) },
  };
}

// ─── Phiên đăng nhập ────────────────────────────────────────

export async function capPhien(env, tk) {
  const token = ngauNhien(32);
  const now = giay(), het = now + so(env, 'PHIEN_NGAY') * 86400;
  await env.DB.prepare('INSERT INTO phien (bam, ma, tao_luc, het_luc) VALUES (?1, ?2, ?3, ?4)')
    .bind(await bamSHA(token), tk.ma, now, het).run();
  // Chỉ giữ PHIEN_TOI_DA máy mới nhất — đăng nhập máy thứ tư thì máy cũ nhất bị đẩy ra.
  await env.DB.prepare(
    `DELETE FROM phien WHERE ma = ?1 AND bam NOT IN
       (SELECT bam FROM phien WHERE ma = ?1 ORDER BY tao_luc DESC LIMIT ?2)`,
  ).bind(tk.ma, so(env, 'PHIEN_TOI_DA')).run();
  await suaTK(env.DB, tk.ma, { dangnhap_cuoi: new Date().toISOString() });
  return token;
}

export async function tkTuToken(db, token) {
  if (typeof token !== 'string' || token.length < 32) return null;
  return db.prepare(
    `SELECT tk.* FROM phien p JOIN tai_khoan tk ON tk.ma = p.ma
      WHERE p.bam = ?1 AND p.het_luc > ?2 AND tk.trangthai = 'active'`,
  ).bind(await bamSHA(token), giay()).first();
}

export async function boPhien(db, token) {
  await db.prepare('DELETE FROM phien WHERE bam = ?1').bind(await bamSHA(token)).run();
}

export const boMoiPhien = (db, ma) => db.prepare('DELETE FROM phien WHERE ma = ?1').bind(ma).run();

// ─── Đăng ký ────────────────────────────────────────────────

/** Mã tài khoản E + 5 ký tự. Trùng thì thử lại — bảng có ràng buộc khoá chính nên không thể lọt. */
export function maMoi() {
  const bang = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `E${[...bytes(5)].map((v) => bang[v % bang.length]).join('')}`;
}

export async function dangKy(env, b) {
  if (b.website) return loi('thieu', 'Thiếu thông tin');                      // ô bẫy bot
  const ten = chuanTen(b.ten), email = chuanEmail(b.email), mk = String(b.mk || '');
  const sdt = String(b.sdt || '').replace(/\D/g, '');
  const tuoi = Math.round(Number(b.tuoi));
  const ngheNghiep = String(b.nghe_nghiep || '').trim().slice(0, 120);
  const mucDich = String(b.muc_dich || '').trim().slice(0, 300);
  if (!ten || !email || !mk || !sdt) return loi('thieu', 'Điền đủ họ tên, email, số điện thoại và mật khẩu');
  if (!emailHopLe(email)) return loi('email_sai', 'Email chưa đúng');
  if (sdt.length < 9 || sdt.length > 12) return loi('sdt_sai', 'Số điện thoại chưa đúng');
  if (mk.length < SO.MK_TOI_THIEU || mk.length > 200) return loi('mk_ngan', `Mật khẩu cần ít nhất ${SO.MK_TOI_THIEU} ký tự`);
  if (!(tuoi >= 12 && tuoi <= 100)) return loi('tuoi_sai', 'Tuổi chưa đúng');
  if (!ngheNghiep) return loi('thieu', 'Cho biết nghề nghiệp của bạn');
  if (!mucDich) return loi('thieu', 'Cho biết bạn định dùng công cụ để làm gì');

  // Đếm cả lần dò email đã có → không dò danh sách email được thoải mái.
  const gio = Math.floor(Date.now() / 3600000);
  if (!await themDem(env.DB, `dk_${gio}`, so(env, 'DK_MOI_GIO'), 3700)) {
    return loi('busy', 'Đang có quá nhiều đăng ký, thử lại sau ít phút', { retryAfter: 300 });
  }
  const k = khoaEmail(email);
  if (await tkTheoKhoa(env.DB, k)) return loi('da_ton_tai', 'Email này đã có tài khoản — đăng nhập nhé');

  const duyet = /^(1|true|co)$/i.test(String(await docCaiDat(env.DB, 'AI_CAN_DUYET') || ''));
  const tk = {
    ma: maMoi(), email, khoa_email: k, ten, sdt, mat_khau: await bamMK(mk, so(env, 'BAM_VONG')),
    vaitro: 'free', trangthai: duyet ? 'cho' : 'active', luot_ngay: 0,
    tuoi, nghe_nghiep: ngheNghiep, muc_dich: mucDich, tao_luc: new Date().toISOString(), dangnhap_cuoi: null,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO tai_khoan (ma, email, khoa_email, ten, sdt, mat_khau, vaitro, trangthai, luot_ngay,
                              tuoi, nghe_nghiep, muc_dich, tao_luc, dangnhap_cuoi)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`,
    ).bind(tk.ma, tk.email, tk.khoa_email, tk.ten, tk.sdt, tk.mat_khau, tk.vaitro, tk.trangthai, tk.luot_ngay,
      tk.tuoi, tk.nghe_nghiep, tk.muc_dich, tk.tao_luc, tk.dangnhap_cuoi).run();
  } catch (e) {
    // Hai lần gửi cùng lúc: ràng buộc khoa_email chặn bản thứ hai.
    if (/UNIQUE/i.test(String(e))) return loi('da_ton_tai', 'Email này đã có tài khoản — đăng nhập nhé');
    throw e;
  }
  return { ...ok(tk.trangthai === 'active' ? { token: await capPhien(env, tk), me: await hoSo(env, tk) } : { cho: true }), tkMoi: tk };
}

export async function dangNhap(env, b) {
  const email = chuanEmail(b.email), mk = String(b.mk || '');
  if (!email || !mk) return loi('thieu', 'Nhập email và mật khẩu');
  const khoa = `dn_${await bamSHA(khoaEmail(email))}`;
  // Giữ trước một lượt thử rồi mới kiểm mật khẩu → gửi song song cũng không vượt số lần cho phép.
  if (!await themDem(env.DB, khoa, so(env, 'DN_SAI_TOI_DA'), 600)) {
    return loi('khoa_tam', 'Sai mật khẩu nhiều lần — thử lại sau 10 phút');
  }
  const tk = await tkTheoKhoa(env.DB, khoaEmail(email));
  // Không có tài khoản vẫn băm như thường để thời gian trả lời không lộ email nào đã đăng ký.
  const dung = await dungMK(mk, tk ? tk.mat_khau : await bamMK('khong-co', so(env, 'BAM_VONG')));
  if (!tk || !dung) return loi('sai', 'Email hoặc mật khẩu chưa đúng');
  await xoaDem(env.DB, khoa);
  if (tk.trangthai === 'cho') return loi('cho_duyet', 'Tài khoản đang chờ elevaTO duyệt');
  if (tk.trangthai !== 'active') return loi('bi_khoa', 'Tài khoản đã bị khoá — liên hệ elevaTO');
  return ok({ token: await capPhien(env, tk), me: await hoSo(env, tk) });
}

/** Đổi mật khẩu và đẩy mọi máy đang đăng nhập ra. */
export async function doiMK(env, tk, mkMoi) {
  const mk = String(mkMoi || '');
  if (mk.length < SO.MK_TOI_THIEU || mk.length > 200) throw new Error(`Mật khẩu cần ít nhất ${SO.MK_TOI_THIEU} ký tự`);
  await suaTK(env.DB, tk.ma, { mat_khau: await bamMK(mk, so(env, 'BAM_VONG')) });
  await boMoiPhien(env.DB, tk.ma);
}
