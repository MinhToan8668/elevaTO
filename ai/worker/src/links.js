// Nội dung trang link-in-bio (links/): ai cũng đọc được, chỉ chủ trang mới ghi được.
//
// Giữ NGUYÊN giao thức của bản Apps Script cũ để trang không phải sửa gì ngoài địa chỉ:
//   GET  /links                      → { ok:true, data, updatedAt }   (data = null khi chưa lưu lần nào)
//   POST { action:'checkKey', key }  → { ok:true } hoặc { ok:false, code, error }
//   POST { action:'saveLinks', key, data } → { ok:true, updatedAt }
//
// Cả trang là một JSON, có thể kèm ảnh nhúng dạng data URL, nên cắt thành nhiều dòng trong
// bảng cai_dat: D1 giới hạn mỗi ô 1MB.

import { docCaiDat, docDem, ghiCaiDat, themDem } from './db.js';
import { loi } from './auth.js';

const MANH = 300000;        // ký tự mỗi dòng — tiếng Việt 3 byte/ký tự vẫn dưới trần 1MB của D1
const TOI_DA = 2000000;     // cả trang tối đa bấy nhiêu ký tự (~7 dòng)
const SAI_TOI_DA = 20;      // gõ sai key bấy nhiêu lần thì nghỉ
const SAI_SONG = 900;       // …trong 15 phút

const K_SO = 'links_so';    // số mảnh đang lưu
const K_LUC = 'links_luc';  // lưu lần cuối lúc nào
const K_KEY = 'links_key';  // key cho trang sửa (bot gửi bằng lệnh /linkkey)
const K_SAI = 'links_sai';  // bộ đếm gõ sai key
const manh = (i) => `links_m${i}`;

/** Giờ Việt Nam dạng dd/MM/yyyy HH:mm — giống hệt bản Apps Script để trang sửa hiện quen mắt. */
export function lucVN(luc = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(luc).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const datCau = (db, khoa, giaTri) => db.prepare(
  `INSERT INTO cai_dat (khoa, gia_tri, het_luc) VALUES (?1, ?2, 0)
     ON CONFLICT(khoa) DO UPDATE SET gia_tri = ?2, het_luc = 0`).bind(khoa, String(giaTri));

/** Nội dung đã lưu, hoặc null nếu chưa lưu lần nào / dữ liệu hỏng. */
export async function linksDoc(db) {
  const n = Number(await docCaiDat(db, K_SO) || 0);
  if (!(n > 0)) return null;
  // Đọc tuần tự chứ không gom batch: nội dung thường chỉ một mảnh, nhiều lắm là bảy,
  // và truy vấn D1 nằm cùng máy nên rẻ. Gom batch thì phải dựa vào việc D1 trả results
  // cho câu SELECT trong batch — một chi tiết dễ khác nhau giữa các bản.
  let txt = '';
  for (let i = 0; i < n; i += 1) txt += (await docCaiDat(db, manh(i))) || '';
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (e) { console.error(`linksDoc: ${e}`); return null; }
}

/** Ghi nội dung mới, xoá nốt mảnh thừa của bản cũ dài hơn. Trả về thời điểm đã ghi. */
export async function linksGhi(db, txt) {
  const cu = Number(await docCaiDat(db, K_SO) || 0);
  const manhs = [];
  for (let i = 0; i < txt.length; i += MANH) manhs.push(txt.slice(i, i + MANH));
  if (!manhs.length) manhs.push('');
  const luc = lucVN();
  const lenh = manhs.map((m, i) => datCau(db, manh(i), m));
  for (let i = manhs.length; i < cu; i += 1) lenh.push(db.prepare('DELETE FROM cai_dat WHERE khoa = ?1').bind(manh(i)));
  lenh.push(datCau(db, K_SO, manhs.length), datCau(db, K_LUC, luc));
  await db.batch(lenh);
  return luc;
}

/** Key của trang sửa; chưa có thì tự sinh. Chỉ bot quản trị mới đọc ra được (lệnh /linkkey). */
export async function linksKey(db) {
  const co = await docCaiDat(db, K_KEY);
  if (co) return co;
  const moi = crypto.randomUUID();
  await ghiCaiDat(db, K_KEY, moi);
  return moi;
}

/** 'ok' | 'sai' | 'khoa' — đếm số lần sai để người lạ không dò key được. */
async function kiemKey(db, key) {
  if (await docDem(db, K_SAI) >= SAI_TOI_DA) return 'khoa';
  const that = await linksKey(db);
  const dua = String(key == null ? '' : key);
  if (dua && dua === that) return 'ok';
  await themDem(db, K_SAI, Number.MAX_SAFE_INTEGER, SAI_SONG);
  return 'sai';
}

const loiKey = (q) => (q === 'khoa'
  ? loi('khoa_tam', 'Nhập sai key nhiều lần quá — nghỉ 15 phút rồi thử lại.')
  : loi('auth', 'ADMIN_KEY không đúng. Nhắn bot Telegram lệnh /linkkey để lấy key, rồi dán lại.'));

/** GET /links — trang công khai gọi cái này. */
export async function linksChoWeb(db) {
  return { ok: true, data: await linksDoc(db), updatedAt: (await docCaiDat(db, K_LUC)) || '' };
}

export async function linksKiemKey(env, b) {
  const q = await kiemKey(env.DB, b.key);
  return q === 'ok' ? { ok: true } : loiKey(q);
}

export async function linksLuu(env, b) {
  const q = await kiemKey(env.DB, b.key);
  if (q !== 'ok') return loiKey(q);
  const d = b.data;
  if (!d || typeof d !== 'object' || !Array.isArray(d.links) || !d.profile) {
    return loi('bad', 'Dữ liệu trang không đúng dạng — tải lại trang sửa rồi thử lại.');
  }
  const txt = JSON.stringify(d);
  if (txt.length > TOI_DA) {
    return loi('qua_lon', 'Trang nặng quá (ảnh tải lên quá lớn). Bỏ bớt ảnh hoặc dùng ảnh nhỏ hơn.');
  }
  return { ok: true, updatedAt: await linksGhi(env.DB, txt) };
}
