// Số liệu cho tab "Biểu đồ & chỉ số": gom dataset thành các biểu đồ và bảng chỉ số tài chính.
// Thuần tính toán, không đụng DOM — giao diện chỉ việc vẽ (xem js/ui/charts.js).
// Mọi con số do máy tính từ BCTC đã trích, AI không tham gia bước này.
//
// Ba cách xem kỳ (mode):
//   'period'  — đúng các kỳ đã trích (gồm cả kỳ lũy kế 6T / 9T)
//   'year'    — chỉ kỳ năm, để xem xu hướng dài
//   'quarter' — RIÊNG từng quý, suy bằng cách trừ hai kỳ lũy kế liền nhau (xem core/interim.js)
// và bộ chọn khoảng thời gian (span): 3 / 5 năm gần nhất hoặc tất cả — giống trang của các công ty
// chứng khoán, vì xem 12 kỳ một lúc thì cột nào cũng bé không đọc được.

import { computeTotals } from './statements.js';
import { periodLabel } from './table.js';
import { quarterDataset } from './interim.js';

const MAX_KY = 20;                     // trần cứng để một file phiên bị sửa tay không làm trang treo
export const MODES = ['period', 'year', 'quarter'];
export const SPANS = [3, 5, 0];        // 0 = tất cả

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const div = (a, b) => (a === null || b === null || !b ? null : a / b);
const pct = (a, b) => { const r = div(a, b); return r === null ? null : r * 100; };
const sum = (...xs) => xs.reduce((t, x) => t + (x || 0), 0);
const duong = (v) => (v !== null && v > 0 ? v : null);        // mẫu số phải dương mới có nghĩa
const NGAY = 365;

/**
 * Chỉ số hiện ở bảng dưới biểu đồ.
 *   fmt: 'x' số lần · '%' phần trăm · 'd' ngày
 *   group: nhóm để xếp bảng (rgroup.<group> trong từ điển)
 *   good: 'hi' càng cao càng tốt · 'lo' càng thấp càng tốt (dùng cho mũi tên xu hướng)
 * Tên và cách tính hiện trên trang lấy từ i18n: khoá `ratio.<key>` và `ratio.<key>.hint`.
 */
export const RATIO_ROWS = [
  { key: 'current', fmt: 'x', group: 'liq', good: 'hi' },
  { key: 'quick', fmt: 'x', group: 'liq', good: 'hi' },
  { key: 'cashRatio', fmt: 'x', group: 'liq', good: 'hi' },
  { key: 'defensiveDays', fmt: 'd', group: 'liq', good: 'hi' },
  { key: 'wcAsset', fmt: '%', group: 'liq', good: 'hi' },
  { key: 'gross', fmt: '%', group: 'prof', good: 'hi' },
  { key: 'ebitMargin', fmt: '%', group: 'prof', good: 'hi' },
  { key: 'ebitdaMargin', fmt: '%', group: 'prof', good: 'hi' },
  { key: 'ros', fmt: '%', group: 'prof', good: 'hi' },
  { key: 'roa', fmt: '%', group: 'prof', good: 'hi' },
  { key: 'roe', fmt: '%', group: 'prof', good: 'hi' },
  { key: 'de', fmt: 'x', group: 'lev', good: 'lo' },
  { key: 'debtAsset', fmt: '%', group: 'lev', good: 'lo' },
  { key: 'loanEquity', fmt: 'x', group: 'lev', good: 'lo' },
  { key: 'intCover', fmt: 'x', group: 'lev', good: 'hi' },
  { key: 'debtEbitda', fmt: 'x', group: 'lev', good: 'lo' },
  { key: 'assetTurn', fmt: 'x', group: 'eff', good: 'hi' },
  { key: 'dsi', fmt: 'd', group: 'eff', good: 'lo' },
  { key: 'dso', fmt: 'd', group: 'eff', good: 'lo' },
  { key: 'dpo', fmt: 'd', group: 'eff', good: 'lo' },
  { key: 'ccc', fmt: 'd', group: 'eff', good: 'lo' },
  { key: 'cfoRevenue', fmt: '%', group: 'eff', good: 'hi' },
];
export const RATIO_GROUPS = ['liq', 'prof', 'lev', 'eff'];

/** Các cách xem kỳ thật sự có số — giao diện chỉ hiện nút của những cách này. */
export function availableModes(ds) {
  const has = (list) => list.length > 0;
  return MODES.filter((m) => (m === 'period' ? has(ds.periods || [])
    : m === 'year' ? has((ds.periods || []).filter((p) => (p.months || 12) === 12))
      : has(quarterDataset(ds).periods)));
}

/** Kỳ + số của một cách xem. */
function view(ds, mode) {
  if (mode === 'quarter') { const q = quarterDataset(ds); return { periods: q.periods, values: q.values, derived: q.derived }; }
  const periods = mode === 'year' ? (ds.periods || []).filter((p) => (p.months || 12) === 12) : (ds.periods || []);
  return { periods, values: ds.values || {}, derived: new Set() };
}

/**
 * @param ds dataset (periods + values)
 * @param opts { mode: 'period'|'year'|'quarter', span: 3|5|0 }
 * @returns { mode, span, modes, periods, charts, ratios, derived }
 *   charts: [{ id, kind: 'bars'|'stack'|'share'|'lines'|'combo', unit?: '%'|'d', series: [{ key, values, axis?, kind? }] }]
 *   ratios: [{ key, fmt, group, good, values }]
 */
export function buildMetrics(ds, { mode = 'period', span = 0 } = {}) {
  const modes = availableModes(ds);
  if (!modes.includes(mode)) mode = modes[0] || 'period';
  const v0 = view(ds, mode);
  let dsKy = v0.periods;
  if (span && dsKy.length) {
    const moi = Math.max(...dsKy.map((p) => p.year));
    dsKy = dsKy.filter((p) => p.year > moi - span);
  }
  dsKy = dsKy.slice(-MAX_KY);
  const periods = dsKy.map((p) => ({ id: p.id, label: periodLabel(p), year: p.year, months: p.months || 12,
    endMonth: p.endMonth || 12, derived: v0.derived.has(p.id) }));
  const V = dsKy.map((p) => computeTotals(v0.values[p.id] || {}));
  const nam = dsKy.map((p) => 12 / (p.months || 12));          // hệ số quy kỳ ngắn về mức một năm

  const g = (i, key) => (i === undefined || i < 0 ? null : num(V[i][key]));
  // LCTT phương pháp trực tiếp dùng mã CF:T… (xem extract.js) — đọc mã nào có số.
  const truc = V.map((_, i) => g(i, 'CF:20') === null && g(i, 'CF:T20') !== null);
  const cf = (i, code) => g(i, truc[i] ? `CF:T${code}` : `CF:${code}`);
  const col = (key, f = (x) => x) => V.map((_, i) => { const x = g(i, key); return x === null ? null : f(x); });

  /**
   * Kỳ ngay TRƯỚC kỳ i, dùng lấy số dư ĐẦU kỳ (đầu kỳ = cuối kỳ liền trước, đúng thời điểm).
   * Tìm kỳ kết thúc đúng `months` tháng trước kỳ i: kỳ năm → 31/12 năm trước; lũy kế 9T → 31/12 năm
   * trước; riêng quý 3 → 30/6 cùng năm. Không có kỳ ấy thì để trống, không ghép bừa kỳ gần nhất.
   */
  const viTri = (() => {
    const idx = new Map();
    dsKy.forEach((p, i) => {
      const k = `${p.year}-${p.endMonth || 12}`;
      const cu = idx.get(k);
      // Cùng ngày kết thúc mà hai độ dài kỳ (riêng quý 3 và lũy kế 9T) thì số dư CĐKT như nhau —
      // lấy kỳ DÀI hơn vì nó chắc chắn có bảng CĐKT đầy đủ.
      if (cu === undefined || (dsKy[cu].months || 12) < (p.months || 12)) idx.set(k, i);
    });
    return idx;
  })();
  const truocIdx = (i) => {
    const p = dsKy[i];
    let m = (p.endMonth || 12) - (p.months || 12), y = p.year;
    if (m <= 0) { m += 12; y -= 1; }
    const j = viTri.get(`${y}-${m}`);
    return j === undefined || j === i ? -1 : j;
  };
  /** Cùng kỳ năm trước (để tính tăng trưởng): cùng tháng kết thúc, cùng độ dài, năm trước. */
  const cungKyIdx = (i) => {
    const p = dsKy[i];
    const j = dsKy.findIndex((x) => x.year === p.year - 1 && (x.endMonth || 12) === (p.endMonth || 12) && (x.months || 12) === (p.months || 12));
    return j;
  };
  const avg = (i, key) => {
    const cur = g(i, key);
    if (cur === null) return null;
    const dau = g(truocIdx(i), key);
    return dau === null ? null : (cur + dau) / 2;
  };
  const nhanNam = (x, i) => (x === null ? null : x * nam[i]);
  const yoy = (key) => V.map((_, i) => {
    const j = cungKyIdx(i);
    if (j < 0) return null;
    const a = g(i, key), b = g(j, key);
    return a === null || b === null || !b ? null : ((a - b) / Math.abs(b)) * 100;
  });

  // ── Số dẫn xuất dùng nhiều lần ──────────────────────────
  const laiVay = (i) => abs(g(i, 'IS:24'));                       // chi phí lãi vay (tool lưu số dương)
  const khauHao = (i) => abs(cf(i, '02'));
  const ebit = (i) => { const l = g(i, 'IS:50'), v = laiVay(i); return l === null ? null : l + (v || 0); };
  const ebitda = (i) => { const e = ebit(i); return e === null ? null : e + (khauHao(i) || 0); };
  const vay = (i) => { const a = abs(g(i, 'BS:321')), b = abs(g(i, 'BS:339')); return a === null && b === null ? null : (a || 0) + (b || 0); };
  const thueHieuDung = (i) => { const l = g(i, 'IS:50'), s = g(i, 'IS:60'); return l !== null && s !== null && l > 0 ? Math.min(Math.max(1 - s / l, 0), 0.5) : 0.2; };

  const charts = [];
  const add = (c) => {
    if (!c.series.some((x) => x.values.some((x2) => x2 !== null && x2 !== 0))) return;
    // Cột chồng chỉ vẽ được phần dương: có phần âm thì nói rõ để người dùng không hiểu nhầm.
    if (c.kind === 'stack' || c.kind === 'share') {
      const am = c.series.filter((x) => x.values.some((x2) => x2 !== null && x2 < 0)).map((x) => x.key);
      if (am.length) c.negative = am;          // giao diện dịch tên khoản rồi mới ghép câu
    }
    charts.push(c);
  };

  // 1. Tăng trưởng doanh thu & lợi nhuận — cột số tiền, đường tốc độ tăng cùng kỳ năm trước (%)
  add({ id: 'growth', kind: 'combo', right: '%', series: [
    { key: 'netRevenue', kind: 'bar', values: col('IS:10') },
    { key: 'grossProfit', kind: 'bar', values: col('IS:20') },
    { key: 'profitAfterTax', kind: 'bar', values: col('IS:60') },
    { key: 'revenueYoY', kind: 'line', axis: 'right', values: yoy('IS:10') },
    { key: 'profitYoY', kind: 'line', axis: 'right', values: yoy('IS:60') },
  ] });

  // 2. Biên lợi nhuận: gộp / EBIT / EBITDA / ròng
  add({ id: 'margins', kind: 'lines', unit: '%', series: [
    { key: 'grossMargin', values: V.map((_, i) => pct(g(i, 'IS:20'), g(i, 'IS:10'))) },
    { key: 'ebitMargin', values: V.map((_, i) => pct(ebit(i), g(i, 'IS:10'))) },
    { key: 'ebitdaMargin', values: V.map((_, i) => pct(ebitda(i), g(i, 'IS:10'))) },
    { key: 'netMargin', values: V.map((_, i) => pct(g(i, 'IS:60'), g(i, 'IS:10'))) },
  ] });

  // 3. ROA & ROE (kỳ ngắn quy về mức một năm để so ngang với kỳ năm)
  add({ id: 'returns', kind: 'lines', unit: '%', series: [
    { key: 'roa', values: V.map((_, i) => pct(nhanNam(g(i, 'IS:60'), i), duong(avg(i, 'BS:280')))) },
    { key: 'roe', values: V.map((_, i) => pct(nhanNam(g(i, 'IS:60'), i), duong(avg(i, 'BS:400')))) },
  ] });

  // 4. Cơ cấu tài sản (cột chồng theo tỷ trọng)
  const tsKhac = V.map((_, i) => {
    const tong = g(i, 'BS:280');
    if (tong === null) return null;
    return tong - sum(abs(g(i, 'BS:110')), abs(g(i, 'BS:130')), abs(g(i, 'BS:140')), abs(g(i, 'BS:220')));
  });
  add({ id: 'assets', kind: 'share', series: [
    { key: 'cash', values: col('BS:110', Math.abs) },
    { key: 'receivables', values: col('BS:130', Math.abs) },
    { key: 'inventories', values: col('BS:140', Math.abs) },
    { key: 'fixedAssets', values: col('BS:220', Math.abs) },
    { key: 'otherAssets', values: tsKhac },
  ] });

  // 5. Cơ cấu nợ & vốn chủ
  add({ id: 'funding', kind: 'share', series: [
    { key: 'currentLiab', values: col('BS:310', Math.abs) },
    { key: 'nonCurrentLiab', values: col('BS:330', Math.abs) },
    { key: 'equity', values: col('BS:400') },
  ] });

  // 6. Vòng quay tiền mặt: số ngày tồn kho / phải thu / phải trả và chu kỳ tiền
  const giaVon = (i) => abs(g(i, 'IS:11'));
  const ngay = (soDu, dongTien) => V.map((_, i) => {
    const bq = duong(avg(i, soDu)), d = nhanNam(dongTien(i), i);
    return bq === null || d === null || d <= 0 ? null : (bq / d) * NGAY;
  });
  const dsi = ngay('BS:140', giaVon), dso = ngay('BS:131', (i) => g(i, 'IS:10')), dpo = ngay('BS:311', giaVon);
  add({ id: 'ccc', kind: 'combo', unit: 'd', series: [
    { key: 'dsi', kind: 'bar', values: dsi },
    { key: 'dso', kind: 'bar', values: dso },
    { key: 'dpo', kind: 'bar', values: dpo },
    { key: 'ccc', kind: 'line', values: V.map((_, i) => (dsi[i] === null || dso[i] === null || dpo[i] === null ? null : dsi[i] + dso[i] - dpo[i])) },
  ] });

  // 7. Khả năng thanh toán ngắn hạn
  const noNH = (i) => duong(abs(g(i, 'BS:310')));
  const quick = (i) => { const ts = g(i, 'BS:100'); return ts === null ? null : div(ts - (abs(g(i, 'BS:140')) || 0), noNH(i)); };
  const cashRatio = (i) => { const t2 = sum(abs(g(i, 'BS:110')), abs(g(i, 'BS:120'))); return t2 ? div(t2, noNH(i)) : null; };
  // Số ngày "cầm cự": tài sản sẵn sàng trả nợ (tiền + đầu tư NH + phải thu NH) chia cho chi phí hoạt
  // động bình quân MỘT NGÀY (giá vốn + chi phí bán hàng + quản lý, quy về mức một năm rồi chia 365).
  const defensiveDays = (i) => {
    const sanSang = sum(abs(g(i, 'BS:110')), abs(g(i, 'BS:120')), abs(g(i, 'BS:130')));
    const chiNam = nhanNam(sum(giaVon(i), abs(g(i, 'IS:25')), abs(g(i, 'IS:26'))), i);
    return !sanSang || !chiNam ? null : div(sanSang, chiNam / NGAY);
  };
  add({ id: 'liquidity', kind: 'lines', unit: 'x', series: [
    { key: 'current', values: V.map((_, i) => div(g(i, 'BS:100'), noNH(i))) },
    { key: 'quick', values: V.map((_, i) => quick(i)) },
    { key: 'cashRatio', values: V.map((_, i) => cashRatio(i)) },
  ] });

  // 8. Dòng tiền thuần: NOPAT + khấu hao − đầu tư TSCĐ ± thay đổi vốn lưu động
  // Thay đổi vốn lưu động lấy thẳng ba dòng điều chỉnh trên LCTT (mã 09/10/11) — số đã in sẵn, giữ
  // nguyên dấu, khỏi tự tính lại từ CĐKT rồi lệch dấu.
  const dVLD = (i) => { const xs = ['09', '10', '11'].map((c) => cf(i, c)); return xs.every((x) => x === null) ? null : sum(...xs); };
  const nopat = (i) => { const e = ebit(i); return e === null ? null : e * (1 - thueHieuDung(i)); };
  const capex = (i) => { const c = cf(i, '21'); return c === null ? null : -Math.abs(c); };
  const fcff = V.map((_, i) => {
    const xs = [nopat(i), khauHao(i), capex(i), dVLD(i)];
    return xs.some((x) => x === null) ? null : sum(...xs);
  });
  add({ id: 'fcf', kind: 'combo', series: [
    { key: 'nopat', kind: 'bar', values: V.map((_, i) => nopat(i)) },
    { key: 'depreciation', kind: 'bar', values: V.map((_, i) => khauHao(i)) },
    { key: 'capex', kind: 'bar', values: V.map((_, i) => capex(i)) },
    { key: 'deltaWC', kind: 'bar', values: V.map((_, i) => dVLD(i)) },
    { key: 'fcff', kind: 'line', values: fcff },
  ] });

  // ── Bảng chỉ số ─────────────────────────────────────────
  const R = {
    current: (i) => div(g(i, 'BS:100'), noNH(i)),
    quick,
    cashRatio,
    defensiveDays,
    wcAsset: (i) => { const ts = g(i, 'BS:100'); return ts === null ? null : pct(ts - (abs(g(i, 'BS:310')) || 0), ts); },
    gross: (i) => pct(g(i, 'IS:20'), g(i, 'IS:10')),
    ebitMargin: (i) => pct(ebit(i), g(i, 'IS:10')),
    ebitdaMargin: (i) => pct(ebitda(i), g(i, 'IS:10')),
    ros: (i) => pct(g(i, 'IS:60'), g(i, 'IS:10')),
    roa: (i) => pct(nhanNam(g(i, 'IS:60'), i), duong(avg(i, 'BS:280'))),
    roe: (i) => pct(nhanNam(g(i, 'IS:60'), i), duong(avg(i, 'BS:400'))),
    de: (i) => div(abs(g(i, 'BS:300')), duong(g(i, 'BS:400'))),
    debtAsset: (i) => pct(abs(g(i, 'BS:300')), g(i, 'BS:280')),
    loanEquity: (i) => div(vay(i), duong(g(i, 'BS:400'))),
    intCover: (i) => div(ebit(i), duong(laiVay(i))),
    debtEbitda: (i) => div(vay(i), duong(nhanNam(ebitda(i), i))),
    assetTurn: (i) => div(nhanNam(g(i, 'IS:10'), i), duong(avg(i, 'BS:280'))),
    dsi: (i) => dsi[i],
    dso: (i) => dso[i],
    dpo: (i) => dpo[i],
    ccc: (i) => (dsi[i] === null || dso[i] === null || dpo[i] === null ? null : dsi[i] + dso[i] - dpo[i]),
    cfoRevenue: (i) => pct(cf(i, '20'), g(i, 'IS:10')),
  };
  const ratios = RATIO_ROWS.map((r) => ({ ...r, values: V.map((_, i) => { const x = R[r.key](i); return Number.isFinite(x) ? x : null; }) }));
  return { mode, span, modes, periods, charts, ratios };
}
