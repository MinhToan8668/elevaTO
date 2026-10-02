// Lớp dữ liệu: D1 (SQLite) thay cho Google Sheet + Script Properties của bản Apps Script.
// Không dùng KV: mọi thứ cần đếm đúng (lượt, nhịp, số lần sai) đều phải nhất quán ngay,
// mà KV của Cloudflare chỉ nhất quán dần. Bảng `dem` và `cai_dat` lo luôn phần nhớ tạm.

export const giay = () => Math.floor(Date.now() / 1000);

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD — mốc tính lượt AI mỗi ngày. */
export const homNay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

// ─── Bộ đếm có hạn dùng ─────────────────────────────────────

/**
 * Cộng 1 vào bộ đếm, nhưng CHỈ KHI còn dưới trần. Một câu lệnh duy nhất nên hai yêu cầu
 * gửi cùng lúc không thể cùng vượt trần (bản Apps Script phải dùng LockService cho việc này).
 * @returns số đếm sau khi cộng, hoặc 0 nếu đã chạm trần
 */
export async function themDem(db, khoa, tran, songGiay) {
  const het = giay() + songGiay;
  const r = await db.prepare(
    `INSERT INTO dem (khoa, so, het_luc) VALUES (?1, 1, ?3)
       ON CONFLICT(khoa) DO UPDATE SET so = CASE WHEN dem.het_luc <= ?4 THEN 1 ELSE dem.so + 1 END, het_luc = ?3
       WHERE dem.het_luc <= ?4 OR dem.so < ?2
     RETURNING so`,
  ).bind(khoa, tran, het, giay()).first();
  return r ? Number(r.so) : 0;
}

/** Số đếm hiện tại (0 nếu chưa có hoặc đã hết hạn). */
export async function docDem(db, khoa) {
  const r = await db.prepare('SELECT so FROM dem WHERE khoa = ?1 AND het_luc > ?2').bind(khoa, giay()).first();
  return r ? Number(r.so) : 0;
}

/** Bớt 1 (trả lại lượt đã giữ). Không bao giờ xuống dưới 0. */
export async function botDem(db, khoa) {
  await db.prepare('UPDATE dem SET so = so - 1 WHERE khoa = ?1 AND so > 0').bind(khoa).run();
}

export async function xoaDem(db, khoa) {
  await db.prepare('DELETE FROM dem WHERE khoa = ?1').bind(khoa).run();
}

// ─── Cài đặt & nhớ tạm ──────────────────────────────────────

export async function docCaiDat(db, khoa) {
  const r = await db.prepare('SELECT gia_tri FROM cai_dat WHERE khoa = ?1 AND (het_luc = 0 OR het_luc > ?2)')
    .bind(khoa, giay()).first();
  return r ? String(r.gia_tri) : null;
}

export async function ghiCaiDat(db, khoa, giaTri, songGiay = 0) {
  await db.prepare(
    `INSERT INTO cai_dat (khoa, gia_tri, het_luc) VALUES (?1, ?2, ?3)
       ON CONFLICT(khoa) DO UPDATE SET gia_tri = ?2, het_luc = ?3`,
  ).bind(khoa, String(giaTri), songGiay ? giay() + songGiay : 0).run();
}

export async function xoaCaiDat(db, khoa) {
  await db.prepare('DELETE FROM cai_dat WHERE khoa = ?1').bind(khoa).run();
}

/** Có đang trong thời gian "nghỉ" không (key Gemini hỏng, model quá tải, mã đặt lại bị khoá…). */
export const dangNghi = async (db, khoa) => (await docCaiDat(db, khoa)) !== null;
export const datNghi = (db, khoa, songGiay) => ghiCaiDat(db, khoa, '1', Math.max(5, Math.min(songGiay, 21600)));

/** Dọn các dòng đã hết hạn. Gọi thưa thôi (xem don() trong index.js) để không tốn ghi mỗi yêu cầu. */
export async function don(db) {
  const t = giay();
  await db.batch([
    db.prepare('DELETE FROM dem WHERE het_luc <= ?1').bind(t - 86400),
    db.prepare('DELETE FROM cai_dat WHERE het_luc > 0 AND het_luc <= ?1').bind(t),
    db.prepare('DELETE FROM phien WHERE het_luc <= ?1').bind(t),
  ]);
}

// ─── Tài khoản ──────────────────────────────────────────────

export const tkTheoKhoa = (db, khoaEmail) =>
  db.prepare('SELECT * FROM tai_khoan WHERE khoa_email = ?1').bind(khoaEmail).first();

export const tkTheoMa = (db, ma) =>
  db.prepare('SELECT * FROM tai_khoan WHERE ma = ?1').bind(String(ma).toUpperCase()).first();

/** Sửa vài cột của một tài khoản. Chỉ nhận đúng tên cột có thật, không ghép chuỗi từ dữ liệu ngoài. */
const COT_SUA = ['email', 'khoa_email', 'ten', 'sdt', 'mat_khau', 'vaitro', 'trangthai', 'luot_ngay', 'dangnhap_cuoi'];
export async function suaTK(db, ma, sua) {
  const cot = Object.keys(sua).filter((k) => COT_SUA.includes(k));
  if (!cot.length) return;
  const dat = cot.map((k, i) => `${k} = ?${i + 2}`).join(', ');
  await db.prepare(`UPDATE tai_khoan SET ${dat} WHERE ma = ?1`).bind(ma, ...cot.map((k) => sua[k])).run();
}

export const demTK = (db) => db.prepare(
  `SELECT vaitro, trangthai, COUNT(*) AS n FROM tai_khoan GROUP BY vaitro, trangthai`).all();

export const tkMoiNhat = (db, n) =>
  db.prepare('SELECT * FROM tai_khoan ORDER BY tao_luc DESC LIMIT ?1').bind(n).all();

export const tkChoDuyet = (db, n) =>
  db.prepare("SELECT * FROM tai_khoan WHERE trangthai = 'cho' ORDER BY tao_luc LIMIT ?1").bind(n).all();

/** Tìm theo email hoặc tên (dùng cho lệnh /tim của bot). */
export const timTK = (db, q, n) =>
  db.prepare('SELECT * FROM tai_khoan WHERE email LIKE ?1 OR LOWER(ten) LIKE ?1 ORDER BY tao_luc DESC LIMIT ?2')
    .bind(`%${String(q).toLowerCase()}%`, n).all();
