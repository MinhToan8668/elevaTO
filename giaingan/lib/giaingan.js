// Logic dùng chung cho các tool giải ngân — không phụ thuộc DOM, chạy được trên trình duyệt (ES module / <script>) và Node.
//   import { tinhTestKey, docTien, parseAmt, daoHan } from './lib/giaingan.js';
// Bảng key TestKey KHÔNG nằm ở đây (repo công khai): truyền vào qua tham số `bang`.
//   bang = { day:{ "1".."31": số }, mon:{ "1".."12": số }, cur:{ VND:số, USD:số, … }, dig:{ "A0".."N9": số } }

export const CHU_VI_TRI = 'ABCDEFGHIKMN';          // 12 vị trí chữ số (bỏ J, L)

/** Kiểm tra cấu trúc bảng key. Trả về chuỗi lỗi, hoặc '' nếu hợp lệ. */
export function kiemTraBangKey(b) {
  if (!b || typeof b !== 'object') return 'Không phải object';
  for (const k of ['day', 'mon', 'cur', 'dig']) if (!b[k] || typeof b[k] !== 'object') return `Thiếu bảng "${k}"`;
  if (Object.keys(b.day).length < 28) return 'Bảng "day" thiếu ngày';
  if (Object.keys(b.mon).length !== 12) return 'Bảng "mon" phải đủ 12 tháng';
  return '';
}

/**
 * TestKey = mã CN + key[ngày] + key[tháng] + key[loại tiền] + Σ key[chữ cái vị trí i + chữ số thứ i]
 * (số tiền làm tròn, đệm đủ 12 chữ số; mã không có trong bảng tính là 0 — như IFERROR(VLOOKUP…,0) trong Excel).
 * @param {{maCN:string|number, ngay:Date|string, soTien:number|string, loaiTien?:string}} vao  ngay: Date hoặc 'yyyy-mm-dd'
 * @returns {{testKey:number, ghi:string, chiTiet:Array<{ten:string,giaTri:string,key:number}>}}
 */
export function tinhTestKey(vao, bang) {
  const loi = kiemTraBangKey(bang); if (loi) throw new Error('Bảng key: ' + loi);
  const d = typeof vao.ngay === 'string' ? parseIso(vao.ngay) : vao.ngay;
  if (!(d instanceof Date) || isNaN(d)) throw new Error('Ngày không hợp lệ');
  const tien = typeof vao.soTien === 'number' ? vao.soTien : parseAmt(vao.soTien);
  if (tien === null || tien < 0) throw new Error('Số tiền không hợp lệ');
  const tron = Math.round(tien);
  if (tron >= 1e12) throw new Error('Số tiền vượt 12 chữ số');
  const lt = (vao.loaiTien || 'VND').toUpperCase();
  const cn = String(vao.maCN ?? '').trim();
  const chiTiet = [
    { ten: 'Mã chi nhánh', giaTri: cn, key: Number(cn) || 0 },
    { ten: 'Ngày', giaTri: String(d.getDate()), key: Number(bang.day[d.getDate()]) || 0 },
    { ten: 'Tháng', giaTri: String(d.getMonth() + 1), key: Number(bang.mon[d.getMonth() + 1]) || 0 },
    { ten: 'Loại tiền', giaTri: lt, key: Number(bang.cur[lt]) || 0 },
  ];
  const so = String(tron).padStart(12, '0');
  for (let i = 0; i < 12; i++) {
    const ma = CHU_VI_TRI[i] + so[i];
    chiTiet.push({ ten: `Vị trí ${i + 1} (${CHU_VI_TRI[i]})`, giaTri: so[i], key: Number(bang.dig[ma]) || 0 });
  }
  const testKey = chiTiet.reduce((s, x) => s + x.key, 0);
  return { testKey, ghi: `${cn}/${testKey}`, chiTiet };
}

/** Nhận số dán kiểu 2.027.125.382 · 2,027,125,382 · 2027125382 · có phần lẻ ,75 / .75. Trả null nếu không đọc được. */
export function parseAmt(s) {
  s = String(s ?? '').trim().replace(/\s/g, ''); if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.'); let dec = '';
  if (lc >= 0 && ld >= 0) dec = lc > ld ? ',' : '.';
  else if (lc >= 0 && s.length - lc - 1 !== 3) dec = ',';
  else if (ld >= 0 && s.length - ld - 1 !== 3) dec = '.';
  let t = s;
  if (dec) { const th = dec === ',' ? '.' : ','; t = t.split(th).join('').replace(dec, '.'); } else t = t.replace(/[.,]/g, '');
  const n = Number(t); return isFinite(n) && n >= 0 ? n : null;
}

/** Định dạng số: 'vn' 1.234.567 · 'us' 1,234,567 · 'raw' 1234567 (làm tròn). */
export function fmt(n, kieu = 'vn') {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, kieu === 'vn' ? '.' : kieu === 'us' ? ',' : '');
  return (n < 0 ? '-' : '') + s;
}

const SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const DV = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
function doc3(x, dau) {
  const tr = Math.floor(x / 100), ch = Math.floor(x / 10) % 10, dv = x % 10; let s = '';
  if (x === 0) return '';
  if (tr > 0) s = SO[tr] + ' trăm'; else if (!dau) s = 'không trăm';
  if (ch > 1) { s += ' ' + SO[ch] + ' mươi'; if (dv === 1) s += ' mốt'; else if (dv === 4) s += ' tư'; else if (dv === 5) s += ' lăm'; else if (dv > 0) s += ' ' + SO[dv]; }
  else if (ch === 1) { s += ' mười'; if (dv === 5) s += ' lăm'; else if (dv > 0) s += ' ' + SO[dv]; }
  else if (dv > 0) { if (s) s += ' linh'; s += ' ' + SO[dv]; }
  return s.trim();
}
/** Số tiền bằng chữ, giống hàm DocSoTien trong VBA ("linh", "tư", "mốt", "lăm"). Phần lẻ được làm tròn. */
export function docTien(n, donVi = 'đồng') {
  n = Math.round(Number(n)); if (!isFinite(n) || n < 0) return '';
  if (n === 0) return 'Không ' + donVi;
  const g = []; while (n > 0) { g.push(n % 1000); n = Math.floor(n / 1000); }
  let s = ''; for (let i = g.length - 1; i >= 0; i--) { const t = doc3(g[i], i === g.length - 1); if (t) s += t + ' ' + DV[i] + ' '; }
  s = (s.trim() + ' ' + donVi).replace(/\s+/g, ' '); return s[0].toUpperCase() + s.slice(1);
}

// ---------------- ngày ----------------
export const THU = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export function parseIso(s) { const [a, b, c] = String(s).split('-').map(Number); return new Date(a, b - 1, c); }
export function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function vn(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
const cong = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const soNgay = (a, b) => Math.round((b - a) / 864e5);

/** Đọc danh sách ngày nghỉ dạng "dd/mm/yyyy [→ dd/mm/yyyy] tên" mỗi dòng → { 'yyyy-mm-dd': tên }. */
export function docNgayNghi(txt) {
  const m = {};
  String(txt || '').split(/\n/).forEach((l) => {
    const r = l.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*(?:→|->|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4}))?\s*(.*)$/);
    if (!r) return;
    const a = new Date(+r[3], r[2] - 1, +r[1]), b = r[4] ? new Date(+r[6], r[5] - 1, +r[4]) : a;
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) m[iso(d)] = r[7] || 'Ngày nghỉ';
  });
  return m;
}
export function laNgayNghi(d, nghi = {}) { return d.getDay() === 0 || d.getDay() === 6 || !!nghi[iso(d)]; }
export function ngayLamViec(d, buoc, nghi = {}) { let x = new Date(d); while (laNgayNghi(x, nghi)) x = cong(x, buoc); return x; }

/**
 * Ngày đáo hạn = ngày GN + số ngày vay; kèm thứ, cảnh báo ngày nghỉ và ngày làm việc gần nhất trước/sau.
 * @returns {{ngay:Date, thu:string, soNgay:number, nghi:string|null, truoc?:{ngay:Date,soNgay:number}, sau?:{ngay:Date,soNgay:number}}}
 */
export function daoHan(ngayGN, soNgayVay, nghi = {}) {
  const g = typeof ngayGN === 'string' ? parseIso(ngayGN) : ngayGN;
  const h = cong(g, Number(soNgayVay));
  const kq = { ngay: h, thu: THU[h.getDay()], soNgay: Number(soNgayVay), nghi: null };
  if (laNgayNghi(h, nghi)) {
    kq.nghi = nghi[iso(h)] || THU[h.getDay()];
    const tr = ngayLamViec(h, -1, nghi), sa = ngayLamViec(h, 1, nghi);
    kq.truoc = { ngay: tr, soNgay: soNgay(g, tr) }; kq.sau = { ngay: sa, soNgay: soNgay(g, sa) };
  }
  return kq;
}
/** Ngày trả lãi đầu tiên: ngày N của tháng GN nếu ngày GN < N, ngược lại tháng sau. */
export function ngayTraLaiDau(ngayGN, n = 25) {
  const g = typeof ngayGN === 'string' ? parseIso(ngayGN) : ngayGN;
  return g.getDate() < n ? new Date(g.getFullYear(), g.getMonth(), n) : new Date(g.getFullYear(), g.getMonth() + 1, n);
}
/** Lãi dự kiến = gốc × LS%/năm × số ngày / 365. */
export function laiDuKien(goc, laiSuatPhanTram, soNgayVay) { return goc * laiSuatPhanTram / 100 * soNgayVay / 365; }
