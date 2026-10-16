// Kỳ giữa niên độ (BCTC quý, bán niên): suy ra số của RIÊNG từng quý từ các cột lũy kế, và bắt lỗi
// khi một file bị đọc sai cột.
//
// BCTC quý Việt Nam (mẫu B 02a-DN) in số LŨY KẾ từ đầu năm: báo cáo quý 3 cho doanh thu 9 tháng, chứ
// không phải doanh thu riêng quý 3. Trích xuất lấy đúng cột lũy kế (xem prompts.js) nên bộ dữ liệu có
// các kỳ 3T / 6T / 9T / FY. Muốn vẽ biểu đồ theo quý như trang chứng khoán thì phải TRỪ hai kỳ lũy kế
// liền nhau:  Q3 = lũy kế 9 tháng − lũy kế 6 tháng.
//
// Chỉ TRỪ được dòng DÒNG TIỀN / KẾT QUẢ (KQKD, LCTT). Số dư trên CĐKT là số tại một thời điểm, quý nào
// lấy đúng số cuối quý ấy. Lãi trên cổ phiếu là tỷ lệ, trừ ra vô nghĩa nên bỏ.

import { mkPeriod } from './extract.js';
import { computeTotals, item } from './statements.js';
import { t, chartLabel } from '../i18n.js';

/** Dòng CĐKT: số tại thời điểm — lấy nguyên, không trừ. */
const diemThoiGian = (k) => k.startsWith('BS:');
/** Lãi cơ bản / lãi suy giảm trên cổ phiếu: tỷ lệ, không cộng dồn theo kỳ. */
const BO_KHI_TRU = new Set(['IS:70', 'IS:71']);
/** Tiền đầu kỳ / cuối kỳ trên LCTT cũng là số tại thời điểm, dù nằm trong bảng dòng tiền. */
const TIEN_DAU = 'CF:60', TIEN_CUOI = 'CF:70';

const soThuc = (v) => (Number.isFinite(v) ? v : null);

/**
 * Các kỳ của một năm, sắp theo số tháng tăng dần. Chỉ lấy kỳ có thể là LŨY KẾ từ đầu năm
 * (tháng kết thúc = số tháng, ví dụ 9 tháng kết thúc 30/9) — kỳ quý lẻ không nằm trong dãy này.
 */
function dayLuyKe(periods, year) {
  return periods
    .filter((p) => p.year === year && (p.months || 12) === (p.endMonth || 12))
    .sort((a, b) => (a.months || 12) - (b.months || 12));
}

/**
 * Bộ dữ liệu theo RIÊNG từng quý, suy từ các kỳ lũy kế.
 * Kỳ quý lẻ đã có trong bộ gốc (3 tháng, kết thúc giữa năm) được dùng thẳng.
 * @returns { periods, values, derived: Set<mã kỳ> }  derived = kỳ do trừ mà ra (để nói rõ trên giao diện)
 */
export function quarterDataset(ds) {
  const periods = [], values = {}, derived = new Set();
  const nguon = (ds.periods || []);
  const tong = Object.fromEntries(nguon.map((p) => [p.id, computeTotals(ds.values?.[p.id] || {})]));

  const nhan = (p, vals) => {
    if (!Object.keys(vals).length) return;
    if (!periods.some((x) => x.id === p.id)) periods.push(p);
    values[p.id] = { ...(values[p.id] || {}), ...vals };
  };

  // 1. Kỳ 3 tháng có sẵn (báo cáo chỉ in cột quý lẻ, hoặc chính là quý 1) — dùng nguyên.
  for (const p of nguon) if ((p.months || 12) === 3) nhan(p, tong[p.id]);

  // 2. Trừ hai kỳ lũy kế liền nhau trong cùng một năm.
  for (const year of [...new Set(nguon.map((p) => p.year))].sort()) {
    const day = dayLuyKe(nguon, year);
    for (let i = 0; i < day.length; i++) {
      const sau = day[i], truoc = i > 0 ? day[i - 1] : null;
      if ((sau.months || 12) === 3) continue;                           // quý 1 đã lấy ở bước 1
      if (!truoc || (sau.months || 12) - (truoc.months || 12) !== 3) continue;   // hụt kỳ giữa → không trừ bừa
      const q = mkPeriod(year, 3, sau.endMonth || sau.months);
      const A = tong[sau.id] || {}, B = tong[truoc.id] || {};
      const vals = {};
      for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
        if (BO_KHI_TRU.has(k)) continue;
        if (diemThoiGian(k) || k === TIEN_CUOI) { const v = soThuc(A[k]); if (v !== null) vals[k] = v; continue; }
        if (k === TIEN_DAU) { const v = soThuc(B[TIEN_CUOI]); if (v !== null) vals[k] = v; continue; }
        const a = soThuc(A[k]), b = soThuc(B[k]);
        if (a === null || b === null) continue;                          // thiếu một đầu thì để trống, đừng coi là 0
        vals[k] = a - b;
      }
      nhan(q, vals);
      if (Object.keys(vals).length) derived.add(q.id);
    }
  }
  periods.sort((a, b) => a.year * 100 + (a.endMonth || 12) - (b.year * 100 + (b.endMonth || 12)));
  return { periods, values, derived };
}

// ─── Bắt lỗi đọc sai cột ───────────────────────────────────

// Dòng LŨY KẾ không bao giờ giảm: doanh thu, giá vốn, chi phí bán hàng / quản lý đều là số cộng dồn
// không âm. Lũy kế 9 tháng nhỏ hơn lũy kế 6 tháng ⇒ ít nhất một file bị lấy cột quý lẻ thay cột lũy kế
// (hoặc bị nhập sai ngày kỳ). Lợi nhuận KHÔNG nằm trong danh sách này vì một quý lỗ làm lũy kế tụt
// xuống là chuyện bình thường.
const KHONG_GIAM = ['IS:01', 'IS:10', 'IS:11', 'IS:25', 'IS:26'];

/**
 * Soát các kỳ lũy kế trong cùng một năm.
 * @returns { [mã kỳ]: [{ key, kind: 'cumul', reported, computed, diff, prev }] }  gắn vào kỳ NGẮN hơn,
 *          vì kỳ ngắn mới là kỳ đáng nghi (kỳ dài hơn phải bao trùm nó).
 */
export function interimIssues(ds, { unit = 1 } = {}) {
  const out = {};
  const nguon = ds.periods || [];
  const tong = Object.fromEntries(nguon.map((p) => [p.id, computeTotals(ds.values?.[p.id] || {})]));
  const tol = Math.max(1000, Math.max(1, unit) * 2);
  for (const year of [...new Set(nguon.map((p) => p.year))]) {
    const day = dayLuyKe(nguon, year);
    for (let i = 1; i < day.length; i++) {
      const truoc = day[i - 1], sau = day[i];
      for (const k of KHONG_GIAM) {
        const a = soThuc(tong[sau.id]?.[k]), b = soThuc(tong[truoc.id]?.[k]);
        if (a === null || b === null) continue;
        if (Math.abs(a) + tol >= Math.abs(b)) continue;
        const it = item(...k.split(':'));
        (out[truoc.id] ||= []).push({ key: k, kind: 'cumul', reported: b, computed: a, diff: b - a, longer: sau,
          label: t('check.cumul', { label: it ? chartLabel(k, it.label) : k, months: sau.months }) });
      }
    }
  }
  return out;
}
