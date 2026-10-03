// Trang khoá học: cấu hình hiện trên trang + nhận đăng ký.
// Gom từ backend/Code.gs (Apps Script) — Script Properties → bảng cai_dat, Google Sheet → bảng dang_ky.
//
// Ranh giới quan trọng giữ nguyên từ bản cũ: máy chủ CHỈ gửi cho trang những khối bot sửa được.
// Người dạy, liên hệ, thông tin công ty mẫu sống trong index.html — gửi kèm là bản lưu ở máy chủ
// sẽ đè lên file, sửa file bao nhiêu lần trang cũng không đổi mà chẳng có lỗi nào báo ra.

import { docCaiDat, ghiCaiDat } from './db.js';

const KHOA = 'SITE_CONFIG';

export function macDinh() {
  return {
    version: 1,
    updatedAt: '',
    cohort: { number: 7, status: 'open', openText: 'Sắp mở' },
    slots: { max: 10, base: 4, registered: 0 },
    pricing: {
      earlyBird: 3000000, regular: 4000000, selfPaced: 1500000, showSelfPaced: true,
      note: 'Học thử 1 buổi rồi mới quyết định đóng học phí.',
    },
    schedule: {
      days: 'Thứ 7 & CN', time: '9h–11h sáng',
      detail: 'Thứ 7 & Chủ Nhật, 9h00 – 11h00 (GMT+7, Việt Nam)',
      platform: 'MS Teams', sessions: 8, theory: 5, practice: 3, hoursPerSession: 2,
    },
    stats: { years: '2.5+', cohortsDone: 6, students: '50+' },
    announcement: { show: false, text: '' },
    media: {
      videoUrl: 'https://drive.google.com/file/d/1NW1h_XqO_85XHf_Gl3YDNL5pnr0FNwE7/view',
      videoTitle: 'Buổi học thử — Buổi 1: Phân tích Bảng cân đối kế toán',
      showSlides: true, showModel: true,
    },
  };
}

const laObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
/** Trộn bản lưu lên trên bản mặc định — thêm trường mới vào macDinh là bản đang chạy nhận ngay. */
function tronSau(goc, de) {
  const ra = { ...goc };
  for (const k of Object.keys(de || {})) {
    ra[k] = laObj(de[k]) && laObj(goc[k]) ? tronSau(goc[k], de[k]) : de[k];
  }
  return ra;
}

export async function docCauHinh(db) {
  const raw = await docCaiDat(db, KHOA);
  if (!raw) return macDinh();
  try { return tronSau(macDinh(), JSON.parse(raw)); } catch { return macDinh(); }
}

export async function ghiCauHinh(db, cfg) {
  const c = { ...cfg, updatedAt: new Date().toISOString() };
  await ghiCaiDat(db, KHOA, JSON.stringify(c));
  return c;
}

// ─── Định dạng ──────────────────────────────────────────────

export const cohortLabel = (n) => `Cohort ${String(Number(n) || 1).padStart(2, '0')}`;
export const tien = (n) => `${String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
export function tienNgan(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(Math.round(v / 1e5) / 10).toString().replace('.', ',')}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
}
/** Các phần ngày giờ theo giờ Việt Nam. */
function phanGio(d) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
}
/** dd/MM/yyyy HH:mm — dạng cho người đọc. */
export function gioVN(d = new Date()) {
  const p = phanGio(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
/** Mã đăng ký R + yyMMddHHmmss theo giờ Việt Nam, giữ y dạng của bản Apps Script. */
export function maDangKy(d = new Date()) {
  const p = phanGio(d);
  return `R${p.year.slice(2)}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

export const soDienThoai = (p) => String(p || '').replace(/\D/g, '');

// ─── Đăng ký ────────────────────────────────────────────────

/** Chỉ đếm đăng ký của cohort hiện tại, chưa bị từ chối. Gói tự học không chiếm suất lớp live. */
export async function demDangKy(db, nhan) {
  const r = await db.prepare(
    `SELECT COUNT(*) AS n FROM dang_ky
      WHERE cohort = ?1 AND trang_thai != 'rejected' AND COALESCE(nguon, '') NOT LIKE '%tuhoc%'`,
  ).bind(nhan).first();
  return Number(r ? r.n : 0);
}



/** Tìm theo mã đăng ký hoặc số điện thoại. */
export const timDangKy = (db, q) =>
  db.prepare('SELECT * FROM dang_ky WHERE id = ?1 OR sdt_so = ?2 LIMIT 1')
    .bind(String(q).trim(), soDienThoai(q)).first();

export const datTrangThai = (db, id, tt) =>
  db.prepare('UPDATE dang_ky SET trang_thai = ?2 WHERE id = ?1').bind(id, tt).run();

// ─── Cấu hình gửi cho trang ─────────────────────────────────

export async function cauHinhDayDu(db, cfg) {
  const c = cfg || await docCauHinh(db);
  const nhan = cohortLabel(c.cohort.number);
  const registered = await demDangKy(db, nhan);
  c.slots.registered = registered;
  const total = Number(c.slots.base) + registered;
  const remaining = Math.max(0, Number(c.slots.max) - total);
  // Cohort 08 đang chạy thì đã xong 7 cohort. Suy ra thay vì lưu rời, để đổi số cohort là con số
  // này đi theo, không bao giờ lệch nhau.
  c.stats.cohortsDone = Math.max(0, Number(c.cohort.number) - 1);
  c.computed = {
    cohortLabel: nhan,
    nextCohortLabel: cohortLabel(Number(c.cohort.number) + 1),
    totalRegistered: total,
    remaining,
    isFull: remaining <= 0 || c.cohort.status === 'full',
    isClosed: c.cohort.status === 'closed',
    percent: Math.min(100, Math.round((total / Math.max(1, Number(c.slots.max))) * 100)),
    price: {
      earlyBird: tien(c.pricing.earlyBird), earlyBirdShort: tienNgan(c.pricing.earlyBird),
      regular: tien(c.pricing.regular), regularShort: tienNgan(c.pricing.regular),
      selfPaced: tien(c.pricing.selfPaced), selfPacedShort: tienNgan(c.pricing.selfPaced),
      saveAmount: tien(Math.max(0, c.pricing.regular - c.pricing.earlyBird)),
      savePercent: c.pricing.regular > 0
        ? Math.round(((c.pricing.regular - c.pricing.earlyBird) / c.pricing.regular) * 100) : 0,
    },
    scheduleShort: `${c.schedule.days} · ${c.schedule.time}`,
  };
  return c;
}

/** Bản rút gọn gửi ra trang — bỏ những khối index.html tự giữ (xem ghi chú đầu file). */
export async function cauHinhChoWeb(db, cfg) {
  const c = await cauHinhDayDu(db, cfg);
  delete c.dummy;
  delete c.pricing.note;
  delete c.stats.students;
  delete c.schedule.platform;
  delete c.cohort.openText;
  return c;
}

/**
 * Nhận một đăng ký từ trang.
 * @returns { kq, moi } — moi là bản ghi vừa tạo (để báo Telegram), không có khi trùng hoặc lỗi.
 */
export async function nhanDangKy(env, d) {
  if (String(d.website || '').trim()) return { kq: { ok: true, id: 'spam' } };   // ô bẫy bot
  const ten = String(d.name || '').trim();
  const sdt = String(d.phone || '').trim();
  if (!ten || !sdt) return { kq: { ok: false, error: 'missing_fields' } };
  const so = soDienThoai(sdt);
  if (so.length < 9) return { kq: { ok: false, error: 'invalid_phone' } };

  const cfg = await docCauHinh(env.DB);
  const nhan = cohortLabel(cfg.cohort.number);
  const trung = await env.DB.prepare('SELECT id FROM dang_ky WHERE cohort = ?1 AND sdt_so = ?2 LIMIT 1')
    .bind(nhan, so).first();
  if (trung) {
    return { kq: { ok: true, duplicate: true, config: await cauHinhChoWeb(env.DB), message: 'Số điện thoại này đã có trong danh sách rồi nhé!' } };
  }

  // Gói học: web gửi plan:'selfpaced' kèm source 'web-tuhoc'. Chuẩn hoá để dù client gửi kiểu nào,
  // cột nguồn cũng nhận ra gói tự học (nó không chiếm suất lớp live).
  let nguon = String(d.source || 'web');
  if (d.plan === 'selfpaced' && !nguon.includes('tuhoc')) nguon += '-tuhoc';

  const id = maDangKy();
  const moi = {
    id, tao_luc: gioVN(), cohort: nhan, ten, sdt, sdt_so: so,
    nam: String(d.year || ''), email: String(d.email || ''), nghe: String(d.job || ''),
    muc_tieu: String(d.goal || ''), nguon, trang_thai: 'pending', ghi_chu: '',
  };
  await env.DB.prepare(
    `INSERT INTO dang_ky (id, tao_luc, cohort, ten, sdt, sdt_so, nam, email, nghe, muc_tieu, nguon, trang_thai, ghi_chu)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`,
  ).bind(moi.id, moi.tao_luc, moi.cohort, moi.ten, moi.sdt, moi.sdt_so, moi.nam, moi.email,
    moi.nghe, moi.muc_tieu, moi.nguon, moi.trang_thai, moi.ghi_chu).run();

  const day = await cauHinhDayDu(env.DB);
  let day_du = null;
  // Đủ chỗ → tự chuyển sang "full" và báo quản trị.
  if (day.computed.remaining <= 0 && cfg.cohort.status === 'open') {
    cfg.cohort.status = 'full';
    await ghiCauHinh(env.DB, cfg);
    day_du = day;
  }
  return { kq: { ok: true, id, config: await cauHinhChoWeb(env.DB) }, moi, day_du };
}
