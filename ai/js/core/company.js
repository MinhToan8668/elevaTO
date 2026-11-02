// Nhận ra các nguồn dữ liệu thuộc về những công ty khác nhau, để không gộp số của hai công ty vào
// một bộ dữ liệu (ví dụ tải nhầm BCTC VNM năm 2025 cùng BCTC BUS quý 3/2026 → bảng rà soát ra bốn kỳ
// lẫn lộn của hai công ty mà không ai báo).
//
// Chỉ dựa vào tên công ty AI đọc ở đầu báo cáo (meta.ten_cong_ty). Nguồn không có tên (file Excel
// FinLens, AI không đọc ra tên) không bị coi là công ty khác — luôn được gộp như trước.

// Từ chỉ loại hình doanh nghiệp: bỏ đi trước khi so, vì cùng một công ty có lúc ghi
// "Công ty Cổ phần Sữa Việt Nam", lúc ghi "CTCP Sữa Việt Nam".
const LOAI_HINH = [
  'cong ty co phan', 'cong ty trach nhiem huu han', 'cong ty tnhh', 'tong cong ty', 'cong ty', 'co phan', 'ctcp', 'tnhh',
  'trach nhiem huu han', 'mot thanh vien', 'hai thanh vien tro len', 'mtv', 'va cac cong ty con', 'va cong ty con',
  'bao cao tai chinh', 'hop nhat', 'rieng', 'joint stock company', 'joint stock', 'jsc', 'company limited', 'co ltd',
  'limited', 'ltd', 'corporation', 'corp', 'company', 'and its subsidiaries', 'and subsidiaries',
];
const RE_LOAI_HINH = new RegExp(`\\b(?:${LOAI_HINH.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'g');

/** "Công ty Cổ phần Sữa Việt Nam" → "sua viet nam". Rỗng nếu không còn gì để so. */
export function companyKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(RE_LOAI_HINH, ' ').replace(/\s+/g, ' ').trim();
}

/** Hai tên có phải cùng một công ty không (so sau khi bỏ loại hình doanh nghiệp, dấu, hoa/thường). */
export function sameCompany(a, b) {
  const x = companyKey(a), y = companyKey(b);
  if (!x || !y) return true;                       // thiếu tên một bên → không đủ căn cứ để tách
  if (x === y) return true;
  // Một tên nằm trọn trong tên kia ("hoa phat" ⊂ "tap doan hoa phat").
  if (x.length >= 3 && y.length >= 3 && (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `))) return true;
  // Phần lớn các chữ trùng nhau (AI đọc sót / thừa một chữ).
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  const chung = [...A].filter((w) => B.has(w)).length;
  return chung / Math.max(A.size, B.size) >= 0.6;
}

/**
 * Chia các nguồn theo công ty, giữ thứ tự nguồn được thêm vào.
 * @param sources [{ id, ext?: { company, file }, file? }]
 * @returns [{ key, name, ids: [id], files: [tên file] }] — chỉ các nguồn có tên công ty
 */
export function groupCompanies(sources) {
  const groups = [];
  for (const s of sources || []) {
    const name = String(s.ext?.company || '').trim();
    if (!companyKey(name)) continue;
    const file = s.ext?.file || s.file || '';
    const g = groups.find((x) => x.names.some((n) => sameCompany(n, name)));
    if (g) { g.ids.push(s.id); g.files.push(file); if (!g.names.includes(name)) g.names.push(name); }
    else groups.push({ key: companyKey(name), name, names: [name], ids: [s.id], files: [file] });
  }
  return groups.map(({ names, ...g }) => g);
}

/**
 * Chọn công ty dùng để dựng bộ dữ liệu khi có nhiều hơn một.
 * @param pick khoá công ty người dùng chọn; '*' = người dùng xác nhận là cùng một công ty, gộp hết
 * @returns { main: nhóm được dùng | null, skip: Set id nguồn bị bỏ ra }
 */
export function pickCompany(groups, pick = '') {
  if (groups.length < 2 || pick === '*') return { main: groups[0] || null, skip: new Set() };
  // Mặc định: công ty có nhiều file nhất; bằng nhau thì công ty của file tải lên trước.
  const main = groups.find((g) => g.key === pick) || groups.reduce((a, b) => (b.ids.length > a.ids.length ? b : a));
  return { main, skip: new Set(groups.filter((g) => g !== main).flatMap((g) => g.ids)) };
}
