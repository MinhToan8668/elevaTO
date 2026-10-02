// Quên mật khẩu: máy chủ gửi mã số qua email, người dùng nhập mã để đặt mật khẩu mới.

import { SO, so } from './caidat.js';
import {
  bamSHA, bangNhau, capPhien, chuanEmail, doiMK, emailHopLe, hoSo, khoaEmail, loi, ok,
} from './auth.js';
import { docCaiDat, ghiCaiDat, tkTheoKhoa, themDem, xoaCaiDat, xoaDem } from './db.js';
import { guiThu } from './mail.js';

const khoaMa = async (email) => `dl_${await bamSHA(`ma|${khoaEmail(email)}`)}`;
const khoaNghi = async (email) => `dln_${await bamSHA(`nghi|${khoaEmail(email)}`)}`;

/** Mã số lấy từ nguồn ngẫu nhiên của hệ thống (Math.random không dùng cho thứ đóng vai mật khẩu). */
export function maSoNgauNhien(soChuSo) {
  const b = crypto.getRandomValues(new Uint8Array(6));
  let n = 0;
  for (const v of b) n = n * 256 + v;
  const mod = 10 ** soChuSo;
  return String((n % mod) + mod).slice(1);               // giữ cả số 0 ở đầu
}

/** Mã + số lần nhập sai nằm CHUNG một bản ghi: hai bên không ghi đè nhau. */
async function docMa(db, email) {
  const raw = await docCaiDat(db, await khoaMa(email));
  if (!raw) return null;
  try { const o = JSON.parse(raw); return o && o.h ? o : null; } catch { return null; }
}
const ghiMa = async (db, email, o) => ghiCaiDat(db, await khoaMa(email), JSON.stringify(o), SO.MA_DL_PHUT * 60);

/**
 * Xin mã đặt lại mật khẩu. Luôn trả ok dù email có tài khoản hay không — không để ai dò
 * danh sách email đã đăng ký. Trần cả hệ thống chỉ đếm THƯ THẬT SỰ GỬI: nếu đếm cả email
 * không có tài khoản thì một người gửi 40 email bịa là chặn được mọi người khác cả tiếng.
 */
export async function quenMK(env, b, bao) {
  const email = chuanEmail(b.email);
  if (!emailHopLe(email)) return loi('email_sai', 'Email chưa đúng');
  const gio = Math.floor(Date.now() / 3600000);
  const kEmail = `dle_${await bamSHA(`${gio}|${khoaEmail(email)}`)}`;
  if (!await themDem(env.DB, kEmail, so(env, 'MA_DL_MOI_GIO'), 3700)) {
    return loi('cho', 'Đã gửi mã cho email này — kiểm tra hộp thư (cả thư rác), hoặc thử lại sau một giờ');
  }
  const tk = await tkTheoKhoa(env.DB, khoaEmail(email));
  if (!tk || tk.trangthai !== 'active') return ok({ daGui: true, phut: SO.MA_DL_PHUT });

  if (!await themDem(env.DB, `dlg_${gio}`, so(env, 'MA_DL_HE_THONG'), 3700)) {
    return loi('busy', 'Đang có quá nhiều yêu cầu, thử lại sau ít phút', { retryAfter: 300 });
  }
  const ma = maSoNgauNhien(SO.MA_DL_SO);
  await ghiMa(env.DB, email, { h: await bamSHA(`dl|${ma}`), n: 0 });
  await guiMaDatLai(env, tk, ma, bao);
  return ok({ daGui: true, phut: SO.MA_DL_PHUT });
}

async function guiMaDatLai(env, tk, ma, bao) {
  // Không nhắc tên người nhận: ai cũng đăng ký được nên tên trong hồ sơ chưa chắc là tên thật,
  // đưa vào thư là biến máy chủ thành chỗ gửi lời nhắn cho người lạ.
  const than = [
    'Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản elevaTO AI BCTC.', '',
    `Mã đặt lại: ${ma}`,
    `Mã có hiệu lực ${SO.MA_DL_PHUT} phút và chỉ dùng một lần.`, '',
    'Nếu không phải bạn yêu cầu thì bỏ qua email này — mật khẩu cũ vẫn dùng bình thường.', '',
    'elevaTO · Zalo 0376 292 148 · minhtoantowork@gmail.com',
  ].join('\n');
  try {
    await guiThu(env, { toi: String(tk.email), tieuDe: 'Đặt lại mật khẩu elevaTO AI BCTC', than });
  } catch (e) {
    // Không gửi được thì người dùng không nhận được gì mà vẫn tưởng đã gửi → báo quản trị.
    console.error(`guiMaDatLai: ${e}`);
    await bao?.('mail_loi', 1800, `⚠️ Không gửi được email đặt lại mật khẩu (${String(e.message || e).slice(0, 200)}). Người dùng cần đặt lại bằng /mkmoi.`);
  }
  await bao?.(`dl_${tk.ma}`, 300, `🔑 ${tk.email} xin mã đặt lại mật khẩu.`);
}

/**
 * Đổi mật khẩu bằng mã đã gửi qua email. Nhập sai quá số lần cho phép thì NGHỈ một lúc chứ
 * không huỷ mã — huỷ mã nghĩa là người lạ đoán bừa vài lần đã chặn được chủ tài khoản.
 * Mã 8 chữ số nên trong 15 phút chỉ đoán được vài chục lần, không đáng kể.
 */
export async function datLaiMKBangMa(env, b, baoThang) {
  const email = chuanEmail(b.email), ma = String(b.ma || '').replace(/\D/g, ''), mk = String(b.mk || '');
  if (!email || !ma) return loi('thieu', 'Nhập email và mã trong email');
  if (mk.length < SO.MK_TOI_THIEU || mk.length > 200) return loi('mk_ngan', `Mật khẩu cần ít nhất ${SO.MK_TOI_THIEU} ký tự`);
  const MA_SAI = loi('ma_sai', 'Mã chưa đúng hoặc đã hết hiệu lực — xin mã mới nếu cần');
  const kNghi = await khoaNghi(email);
  if (await docCaiDat(env.DB, kNghi)) return loi('cho', `Nhập sai nhiều lần — thử lại sau ${SO.MA_DL_NGHI} giây`);
  const o = await docMa(env.DB, email);
  if (!o) return MA_SAI;
  const dung = bangNhau(await bamSHA(`dl|${ma}`), o.h);
  if (!dung) {
    if (o.n + 1 >= SO.MA_DL_SAI) {
      await ghiMa(env.DB, email, { h: o.h, n: 0 });
      await ghiCaiDat(env.DB, kNghi, '1', SO.MA_DL_NGHI);
    } else await ghiMa(env.DB, email, { h: o.h, n: o.n + 1 });
    return MA_SAI;
  }
  await xoaCaiDat(env.DB, await khoaMa(email));
  await xoaCaiDat(env.DB, kNghi);
  const tk = await tkTheoKhoa(env.DB, khoaEmail(email));
  if (!tk || tk.trangthai !== 'active') return loi('bi_khoa', 'Tài khoản không dùng được — liên hệ elevaTO');
  await doiMK(env, tk, mk);
  // Đổi được mật khẩu rồi thì bỏ luôn khoá tạm do đăng nhập sai nhiều lần trước đó.
  await xoaDem(env.DB, `dn_${await bamSHA(khoaEmail(email))}`);
  await baoThang?.(`🔑 ${tk.email} đã tự đặt lại mật khẩu bằng mã gửi qua email.`);
  return ok({ token: await capPhien(env, tk), me: await hoSo(env, tk) });
}
