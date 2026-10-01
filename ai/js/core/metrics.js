// Số liệu cho tab Biểu đồ & chỉ số: gom từ dataset thành các biểu đồ và bảng chỉ số tài chính.
// Thuần tính toán, không đụng DOM — giao diện chỉ việc vẽ (xem js/ui/charts.js).
// Mọi con số do máy tính từ BCTC đã trích, AI không tham gia bước này.

import { computeTotals } from './statements.js';
import { periodLabel } from './table.js';

const MAX_KY = 12;                     // vẽ tối đa bấy nhiêu kỳ gần nhất (file phiên có thể chứa nhiều kỳ lạ)
const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const div = (a, b) => (a === null || !b ? null : a / b);
const pct = (a, b) => { const r = div(a, b); return r === null ? null : r * 100; };
const sum = (...xs) => xs.reduce((t, x) => t + (x || 0), 0);

/**
 * Chỉ số hiện ở bảng dưới biểu đồ. fmt: 'x' số lần · '%' phần trăm.
 * Tên và cách tính hiện trên trang lấy từ i18n: khoá `ratio.<key>` và `ratio.<key>.hint`.
 */
export const RATIO_ROWS = [
  { key: 'current', fmt: 'x' }, { key: 'quick', fmt: 'x' }, { key: 'de', fmt: 'x' }, { key: 'debtAsset', fmt: '%' },
  { key: 'gross', fmt: '%' }, { key: 'ros', fmt: '%' }, { key: 'roa', fmt: '%' }, { key: 'roe', fmt: '%' },
  { key: 'assetTurn', fmt: 'x' }, { key: 'cfoRevenue', fmt: '%' },
];

/**
 * @param ds dataset (periods + values)
 * @returns { periods: [{id,label}], charts: [{id,title,kind,unit?,series:[{name,values}]}], ratios: [{key,label,fmt,hint,values}] }
 */
export function buildMetrics(ds) {
  const dsKy = (ds.periods || []).slice(-MAX_KY);
  const periods = dsKy.map((p) => ({ id: p.id, label: periodLabel(p) }));
  const viTri = Object.fromEntries(dsKy.map((p, i) => [p.id, i]));
  // Kỳ 6 tháng: số luỹ kế nhân 2 mới so được với kỳ năm (chỉ áp cho chỉ số lấy dòng tiền / lãi chia cho số dư).
  const nam = dsKy.map((p) => 12 / (p.months || 12));
  const V = periods.map((p) => computeTotals(ds.values?.[p.id] || {}));
  const g = (i, key) => num(V[i][key]);
  // LCTT phương pháp trực tiếp dùng mã CF:T… (xem extract.js) — đọc mã nào có số.
  const truc = V.map((_, i) => g(i, 'CF:20') === null && g(i, 'CF:T20') !== null);
  const cf = (i, code) => g(i, truc[i] ? `CF:T${code}` : `CF:${code}`);
  const col = (key, f = (v) => v) => V.map((_, i) => { const v = g(i, key); return v === null ? null : f(v); });

  const charts = [];
  const add = (c) => {
    if (!c.series.some((x) => x.values.some((v) => v !== null && v !== 0))) return;
    // Cột chồng chỉ vẽ được phần dương: có phần âm thì nói rõ để người dùng không hiểu nhầm.
    if (c.kind === 'stack') {
      const am = c.series.filter((x) => x.values.some((v) => v !== null && v < 0)).map((x) => x.key);
      if (am.length) c.negative = am;          // giao diện dịch tên khoản rồi mới ghép câu
    }
    charts.push(c);
  };

  add({ id: 'revenue', kind: 'bars', series: [
    { key: 'netRevenue', values: col('IS:10') },
    { key: 'grossProfit', values: col('IS:20') },
    { key: 'profitAfterTax', values: col('IS:60') },
  ] });

  const other = V.map((_, i) => {
    const tong = g(i, 'BS:280');
    if (tong === null) return null;
    return tong - sum(abs(g(i, 'BS:110')), abs(g(i, 'BS:130')), abs(g(i, 'BS:140')), abs(g(i, 'BS:220')));
  });
  add({ id: 'assets', kind: 'stack', series: [
    { key: 'cash', values: col('BS:110', Math.abs) },
    { key: 'receivables', values: col('BS:130', Math.abs) },
    { key: 'inventories', values: col('BS:140', Math.abs) },
    { key: 'fixedAssets', values: col('BS:220', Math.abs) },
    { key: 'otherAssets', values: other },
  ] });

  add({ id: 'capital', kind: 'stack', series: [
    { key: 'currentLiab', values: col('BS:310', Math.abs) },
    { key: 'nonCurrentLiab', values: col('BS:330', Math.abs) },
    { key: 'equity', values: col('BS:400') },
  ] });

  add({ id: 'cashflow', kind: 'bars', series: [
    { key: 'operating', values: V.map((_, i) => cf(i, '20')) },
    { key: 'investing', values: V.map((_, i) => cf(i, '30')) },
    { key: 'financing', values: V.map((_, i) => cf(i, '40')) },
  ] });

  add({ id: 'margins', kind: 'lines', unit: '%', series: [
    { key: 'grossMargin', values: V.map((_, i) => pct(g(i, 'IS:20'), g(i, 'IS:10'))) },
    { key: 'netMargin', values: V.map((_, i) => pct(g(i, 'IS:60'), g(i, 'IS:10'))) },
  ] });

  /**
   * Số dư bình quân = (đầu kỳ + cuối kỳ) / 2. Đầu kỳ phải đúng là cuối kỳ liền trước:
   * kỳ giữa niên độ lấy cột FY năm trước (31/12), kỳ năm lấy cột FY năm liền trước.
   * Thiếu cột đó (file chỉ có 1 kỳ, hoặc hụt năm) thì để trống, không ghép bừa.
   */
  const avg = (i, key) => {
    const cur = g(i, key);
    if (cur === null) return null;
    const j = viTri[`FY${dsKy[i].year - 1}`];            // kỳ năm lẫn kỳ giữa niên độ đều lấy số 31/12 năm trước
    if (j === undefined || j === i) return null;
    const dau = g(j, key);
    return dau === null ? null : (cur + dau) / 2;
  };
  const nhanNam = (v, i) => (v === null ? null : v * nam[i]);
  const duong = (v) => (v !== null && v > 0 ? v : null);       // mẫu số phải dương mới có nghĩa (vốn chủ âm → bỏ)
  const R = {
    current: (i) => div(g(i, 'BS:100'), abs(g(i, 'BS:310'))),
    quick: (i) => { const ts = g(i, 'BS:100'); return ts === null ? null : div(ts - (abs(g(i, 'BS:140')) || 0), abs(g(i, 'BS:310'))); },
    de: (i) => div(abs(g(i, 'BS:300')), duong(g(i, 'BS:400'))),
    debtAsset: (i) => pct(abs(g(i, 'BS:300')), g(i, 'BS:280')),
    gross: (i) => pct(g(i, 'IS:20'), g(i, 'IS:10')),
    ros: (i) => pct(g(i, 'IS:60'), g(i, 'IS:10')),
    roa: (i) => pct(nhanNam(g(i, 'IS:60'), i), duong(avg(i, 'BS:280'))),
    roe: (i) => pct(nhanNam(g(i, 'IS:60'), i), duong(avg(i, 'BS:400'))),
    assetTurn: (i) => div(nhanNam(g(i, 'IS:10'), i), duong(avg(i, 'BS:280'))),
    cfoRevenue: (i) => pct(cf(i, '20'), g(i, 'IS:10')),
  };
  const ratios = RATIO_ROWS.map((r) => ({ ...r, values: V.map((_, i) => { const v = R[r.key](i); return Number.isFinite(v) ? v : null; }) }));
  return { periods, charts, ratios };
}
