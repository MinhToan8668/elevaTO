// Số liệu cho tab Biểu đồ & chỉ số: gom từ dataset thành các biểu đồ và bảng chỉ số tài chính.
// Thuần tính toán, không đụng DOM — giao diện chỉ việc vẽ (xem js/ui/charts.js).
// Mọi con số do máy tính từ BCTC đã trích, AI không tham gia bước này.

import { computeTotals } from './statements.js';
import { periodLabel } from './table.js';

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const div = (a, b) => (a === null || !b ? null : a / b);
const pct = (a, b) => { const r = div(a, b); return r === null ? null : r * 100; };
const sum = (...xs) => xs.reduce((t, x) => t + (x || 0), 0);

/** Chỉ số hiện ở bảng dưới biểu đồ. fmt: 'x' số lần · '%' phần trăm. */
export const RATIO_ROWS = [
  { key: 'current', label: 'Thanh toán hiện hành', fmt: 'x', hint: 'Tài sản ngắn hạn / Nợ ngắn hạn' },
  { key: 'quick', label: 'Thanh toán nhanh', fmt: 'x', hint: '(Tài sản ngắn hạn − Hàng tồn kho) / Nợ ngắn hạn' },
  { key: 'de', label: 'Nợ / Vốn chủ sở hữu', fmt: 'x', hint: 'Nợ phải trả / Vốn chủ sở hữu' },
  { key: 'debtAsset', label: 'Nợ / Tổng tài sản', fmt: '%', hint: 'Nợ phải trả / Tổng tài sản' },
  { key: 'gross', label: 'Biên lợi nhuận gộp', fmt: '%', hint: 'Lợi nhuận gộp / Doanh thu thuần' },
  { key: 'ros', label: 'Biên lợi nhuận ròng (ROS)', fmt: '%', hint: 'Lợi nhuận sau thuế / Doanh thu thuần' },
  { key: 'roa', label: 'ROA', fmt: '%', hint: 'Lợi nhuận sau thuế / Tổng tài sản bình quân' },
  { key: 'roe', label: 'ROE', fmt: '%', hint: 'Lợi nhuận sau thuế / Vốn chủ sở hữu bình quân' },
  { key: 'assetTurn', label: 'Vòng quay tài sản', fmt: 'x', hint: 'Doanh thu thuần / Tổng tài sản bình quân' },
  { key: 'cfoRevenue', label: 'Dòng tiền kinh doanh / Doanh thu', fmt: '%', hint: 'LC thuần từ HĐKD / Doanh thu thuần' },
];

/**
 * @param ds dataset (periods + values)
 * @returns { periods: [{id,label}], charts: [{id,title,kind,unit?,series:[{name,values}]}], ratios: [{key,label,fmt,hint,values}] }
 */
export function buildMetrics(ds) {
  const periods = (ds.periods || []).map((p) => ({ id: p.id, label: periodLabel(p) }));
  const V = periods.map((p) => computeTotals(ds.values?.[p.id] || {}));
  const g = (i, key) => num(V[i][key]);
  const col = (key, f = (v) => v) => V.map((_, i) => { const v = g(i, key); return v === null ? null : f(v); });

  const charts = [];
  const add = (c) => { if (c.series.some((s) => s.values.some((v) => v !== null && v !== 0))) charts.push(c); };

  add({ id: 'revenue', title: 'Doanh thu & lợi nhuận', kind: 'bars', series: [
    { name: 'Doanh thu thuần', values: col('IS:10') },
    { name: 'Lợi nhuận gộp', values: col('IS:20') },
    { name: 'Lợi nhuận sau thuế', values: col('IS:60') },
  ] });

  const other = V.map((_, i) => {
    const tong = g(i, 'BS:280');
    if (tong === null) return null;
    return tong - sum(abs(g(i, 'BS:110')), abs(g(i, 'BS:130')), abs(g(i, 'BS:140')), abs(g(i, 'BS:220')));
  });
  add({ id: 'assets', title: 'Cơ cấu tài sản', kind: 'stack', series: [
    { name: 'Tiền', values: col('BS:110', Math.abs) },
    { name: 'Phải thu ngắn hạn', values: col('BS:130', Math.abs) },
    { name: 'Hàng tồn kho', values: col('BS:140', Math.abs) },
    { name: 'Tài sản cố định', values: col('BS:220', Math.abs) },
    { name: 'Tài sản khác', values: other },
  ] });

  add({ id: 'capital', title: 'Cơ cấu nguồn vốn', kind: 'stack', series: [
    { name: 'Nợ ngắn hạn', values: col('BS:310', Math.abs) },
    { name: 'Nợ dài hạn', values: col('BS:330', Math.abs) },
    { name: 'Vốn chủ sở hữu', values: col('BS:400') },
  ] });

  add({ id: 'cashflow', title: 'Lưu chuyển tiền tệ', kind: 'bars', series: [
    { name: 'Hoạt động kinh doanh', values: col('CF:20') },
    { name: 'Hoạt động đầu tư', values: col('CF:30') },
    { name: 'Hoạt động tài chính', values: col('CF:40') },
  ] });

  add({ id: 'margins', title: 'Biên lợi nhuận', kind: 'lines', unit: '%', series: [
    { name: 'Biên gộp', values: V.map((_, i) => pct(g(i, 'IS:20'), g(i, 'IS:10'))) },
    { name: 'Biên ròng', values: V.map((_, i) => pct(g(i, 'IS:60'), g(i, 'IS:10'))) },
  ] });

  const avg = (i, key) => {
    const cur = g(i, key);
    if (cur === null) return null;
    const prev = i > 0 ? g(i - 1, key) : null;
    return prev === null ? null : (cur + prev) / 2;      // kỳ đầu chưa đủ số bình quân → để trống
  };
  const R = {
    current: (i) => div(g(i, 'BS:100'), abs(g(i, 'BS:310'))),
    quick: (i) => { const ts = g(i, 'BS:100'); return ts === null ? null : div(ts - (abs(g(i, 'BS:140')) || 0), abs(g(i, 'BS:310'))); },
    de: (i) => div(abs(g(i, 'BS:300')), g(i, 'BS:400')),
    debtAsset: (i) => pct(abs(g(i, 'BS:300')), g(i, 'BS:280')),
    gross: (i) => pct(g(i, 'IS:20'), g(i, 'IS:10')),
    ros: (i) => pct(g(i, 'IS:60'), g(i, 'IS:10')),
    roa: (i) => pct(g(i, 'IS:60'), avg(i, 'BS:280')),
    roe: (i) => pct(g(i, 'IS:60'), avg(i, 'BS:400')),
    assetTurn: (i) => div(g(i, 'IS:10'), avg(i, 'BS:280')),
    cfoRevenue: (i) => pct(g(i, 'CF:20'), g(i, 'IS:10')),
  };
  const ratios = RATIO_ROWS.map((r) => ({ ...r, values: V.map((_, i) => { const v = R[r.key](i); return Number.isFinite(v) ? v : null; }) }));
  return { periods, charts, ratios };
}
