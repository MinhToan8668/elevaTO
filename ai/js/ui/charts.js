// Tab "Biểu đồ & chỉ số" ở bước rà soát: vẽ SVG ngay trên trang, không dùng thư viện ngoài.
// Số do js/core/metrics.js tính từ BCTC đã trích — AI không tham gia.

import { h, fmt } from './dom.js';
import { buildMetrics } from '../core/metrics.js';

const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['var(--em)', 'var(--blue)', 'var(--gold)', 'var(--red)', 'var(--line-3)'];
const W = 560, H = 240, PAD = { t: 16, r: 14, b: 34, l: 62 };
const PLOT = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };

const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};

/** @returns phần tử của tab, hoặc lời nhắn nếu chưa có số. */
export function renderCharts(ds, unit, unitLabel) {
  const m = buildMetrics(ds);
  if (!m.periods.length) return h('p', { class: 'empty' }, 'Chưa có dữ liệu để vẽ biểu đồ.');
  if (!m.charts.length) return h('p', { class: 'empty' }, 'Số đã trích chưa đủ để vẽ biểu đồ — kiểm tra lại các bảng ở tab bên cạnh.');
  return h('div', {},
    h('p', { class: 'priv' }, `Biểu đồ và chỉ số do máy tính từ số đã trích (đơn vị ${unitLabel}). Sửa số ở các tab bên cạnh thì biểu đồ tự cập nhật.`),
    h('div', { class: 'charts' }, m.charts.map((c) => card(c, m.periods, unit, unitLabel))),
    ratioTable(m, unit));
}

function card(c, periods, unit, unitLabel) {
  const draw = { bars: barsChart, stack: stackChart, lines: linesChart }[c.kind];
  const money = c.unit !== '%';
  return h('figure', { class: 'chart' },
    h('figcaption', {}, h('b', {}, c.title), h('span', { class: 'priv' }, money ? unitLabel : '%')),
    draw(c, periods, money ? unit : 1, money),
    h('ul', { class: 'legend' }, c.series.map((ser, i) => h('li', {}, h('i', { style: { background: COLORS[i % COLORS.length] } }), ser.name))));
}

// ─── Khung, trục ───────────────────────────────────────────

/** Thang chia "đẹp": 1 / 2 / 2,5 / 5 × 10^n. */
function niceStep(span, want = 4) {
  const raw = span / want, p = 10 ** Math.floor(Math.log10(raw) || 0), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function scale(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  let hi = Math.max(0, ...nums), lo = Math.min(0, ...nums);
  if (hi === lo) hi = lo + 1;
  const step = niceStep(hi - lo);
  hi = Math.ceil(hi / step) * step; lo = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(v);
  return { lo, hi, ticks, y: (v) => PAD.t + PLOT.h - ((v - lo) / (hi - lo)) * PLOT.h };
}

function frame(sc, periods, unit) {
  const grid = sc.ticks.map((v) => s('g', {},
    s('line', { x1: PAD.l, x2: W - PAD.r, y1: sc.y(v), y2: sc.y(v), class: v === 0 ? 'ax0' : 'grid' }),
    s('text', { x: PAD.l - 8, y: sc.y(v) + 4, class: 'lbl', 'text-anchor': 'end' }, fmt(v, unit) || '0')));
  const xs = periods.map((p, i) => s('text', { x: PAD.l + PLOT.w * ((i + 0.5) / periods.length), y: H - 10, class: 'lbl', 'text-anchor': 'middle' }, p.label));
  return [grid, xs];
}

const svg = (...kids) => s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cv', role: 'img', preserveAspectRatio: 'xMidYMid meet' }, kids);
const band = (i, n) => ({ x: PAD.l + (PLOT.w * i) / n, w: PLOT.w / n });

// ─── Các kiểu biểu đồ ──────────────────────────────────────

function barsChart(c, periods, unit, money) {
  const sc = scale(c.series.flatMap((x) => x.values));
  const n = periods.length, k = c.series.length;
  const bars = periods.map((p, i) => {
    const b = band(i, n), bw = (b.w * 0.72) / k;
    return c.series.map((ser, j) => {
      const v = ser.values[i];
      if (!Number.isFinite(v)) return null;
      const x = b.x + b.w * 0.14 + bw * j, y0 = sc.y(0), y = sc.y(v);
      return s('rect', { x, y: Math.min(y, y0), width: Math.max(1, bw - 2), height: Math.max(1, Math.abs(y - y0)), rx: 3, fill: COLORS[j % COLORS.length] },
        s('title', {}, `${ser.name} · ${p.label}: ${fmt(v, unit)}${money ? '' : '%'}`));
    });
  });
  return svg(frame(sc, periods, unit), bars);
}

function stackChart(c, periods, unit, money) {
  const totals = periods.map((_, i) => c.series.reduce((t, ser) => t + Math.max(0, ser.values[i] || 0), 0));
  const sc = scale([0, ...totals]);
  const n = periods.length;
  const cols = periods.map((p, i) => {
    const b = band(i, n), bw = b.w * 0.46, x = b.x + (b.w - bw) / 2;
    let acc = 0;
    return c.series.map((ser, j) => {
      const v = Math.max(0, ser.values[i] || 0);
      if (!v) return null;
      const y = sc.y(acc + v), hgt = sc.y(acc) - y;
      acc += v;
      return s('rect', { x, y, width: bw, height: Math.max(1, hgt), fill: COLORS[j % COLORS.length] },
        s('title', {}, `${ser.name} · ${p.label}: ${fmt(v, unit)} (${Math.round((v / (totals[i] || 1)) * 100)}%)`));
    });
  });
  return svg(frame(sc, periods, unit), cols);
}

function linesChart(c, periods, unit, money) {
  const sc = scale(c.series.flatMap((x) => x.values));
  const n = periods.length;
  const cx = (i) => PAD.l + PLOT.w * ((i + 0.5) / n);
  const lines = c.series.map((ser, j) => {
    const pts = ser.values.map((v, i) => (Number.isFinite(v) ? [cx(i), sc.y(v)] : null)).filter(Boolean);
    if (!pts.length) return null;
    return s('g', {},
      pts.length > 1 ? s('polyline', { points: pts.map(([x, y]) => `${x},${y}`).join(' '), fill: 'none', stroke: COLORS[j % COLORS.length], 'stroke-width': 2.5, 'stroke-linejoin': 'round' }) : null,
      ser.values.map((v, i) => (Number.isFinite(v)
        ? s('circle', { cx: cx(i), cy: sc.y(v), r: 4, fill: COLORS[j % COLORS.length] }, s('title', {}, `${ser.name} · ${periods[i].label}: ${fmt(v, unit)}${money ? '' : '%'}`))
        : null)));
  });
  return svg(frame(sc, periods, unit), lines);
}

// ─── Bảng chỉ số ───────────────────────────────────────────

const show = (v, fmtKind) => (v === null ? '—' : fmtKind === '%' ? `${v.toFixed(1)}%` : `${v.toFixed(2)} lần`);

function ratioTable(m, unit) {
  return h('div', { class: 'gridwrap' },
    h('table', { class: 'k ratios' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Chỉ số'), m.periods.map((p) => h('th', { class: 'num' }, p.label)))),
      h('tbody', {}, m.ratios.map((r) => h('tr', {},
        h('td', {}, r.label, h('small', { class: 'priv' }, r.hint)),
        r.values.map((v) => h('td', { class: 'num' }, show(v, r.fmt))))))));
}
