// Đọc số theo cách BCTC Việt Nam in ra.
//   "1.234.567" (chấm ngăn nghìn) · "(1.234)" = âm · "1,234,567" (kiểu Anh) · "-" / ô trống = không có số.
// Trả null khi không có số — KHÔNG trả 0, vì "không có dòng này" khác "dòng này bằng 0".

const EMPTY = /^[-–—]?$|^n\/?a$/i;

export function parseVN(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/[\s  ]/g, '');
  if (EMPTY.test(s)) return null;

  let neg = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) { neg = true; s = paren[1]; }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const n = toPlain(s);
  if (n === null) return null;
  return neg ? -n : n;
}

// Bỏ dấu ngăn nghìn, đổi dấu thập phân về ".".
function toPlain(s) {
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let digits;
  if (dots && commas) {
    // Dấu xuất hiện sau cùng là dấu thập phân: "1.234,5" (VN) hoặc "1,234.5" (Anh).
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    if (!groupedOk(s.split(dec)[0], thou) || s.split(dec).length !== 2) return null;
    digits = s.split(dec)[0].split(thou).join('') + '.' + s.split(dec)[1];
  } else if (dots || commas) {
    const sep = dots ? '.' : ',';
    const parts = s.split(sep);
    // Nhiều dấu, hoặc đúng một nhóm 3 chữ số phía sau → ngăn nghìn (BCTC in số nguyên).
    if (parts.length > 2 || parts[1].length === 3) {
      if (!groupedOk(s, sep)) return null;
      digits = parts.join('');
    } else {
      digits = parts[0] + '.' + parts[1];
    }
  } else {
    digits = s;
  }
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  return Number(digits);
}

function groupedOk(s, sep) {
  const g = s.split(sep);
  return /^\d{1,3}$/.test(g[0]) && g.slice(1).every((x) => /^\d{3}$/.test(x));
}

// "Đơn vị tính: triệu đồng" → 1e6. Không nhận ra thì null (để hỏi lại người dùng, không đoán).
export function unitScale(u) {
  if (typeof u === 'number') return Number.isFinite(u) && u > 0 ? u : null;
  const s = String(u || '').toLowerCase().normalize('NFC');
  if (!s.trim()) return null;
  if (/t[ỷỉ]/.test(s)) return 1e9;
  if (/tri[ệe]u|million/.test(s)) return 1e6;
  if (/ngh[ìi]n|ng[àa]n|thousand/.test(s)) return 1e3;
  if (/đ[ồo]ng|vnd|dong/.test(s)) return 1;
  return null;
}
