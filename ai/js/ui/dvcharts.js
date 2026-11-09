// Biểu đồ SVG của phần định giá: football field theo giá / cổ phiếu, thác nước EV → vốn chủ, cột doanh thu &
// FCFF (năm actual / dự phóng). Vẽ thẳng SVG như ui/charts.js (CSP không cho nạp thư viện ngoài); màu lấy biến CSS
// nên tự đổi theo giao diện sáng / tối. Chỉ nhận số đã tính sẵn — không tính toán gì ở đây.

import { h } from './dom.js';

const W = 720;
const s = (tag, attrs = {}, ...kids) => h(tag, attrs, ...kids);
const fmtN = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 1 }));

/** Tách nhãn dài thành hai dòng ở khoảng trắng gần giữa nhất (nhãn trục của biểu đồ cột hẹp). */
function haiDong(t) {
  const str = String(t);
  if (str.length <= 12) return [str];
  const mid = str.length / 2;
  let best = -1;
  for (let i = 0; i < str.length; i++) if (str[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [str] : [str.slice(0, best), str.slice(best + 1)];
}

/** Thang chia "đẹp" 1 / 2 / 2,5 / 5 × 10^n. */
function nice(lo, hi, want = 5) {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / want, p = 10 ** Math.floor(Math.log10(Math.abs(raw)) || 0), n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 1e6; v += step) ticks.push(Math.round(v / step) * step);
  return { lo: a, hi: b, ticks };
}

/**
 * Football field ngang: mỗi phương pháp một thanh thấp → cao, chấm ở mức giữa; vạch dọc giá thị trường và giá mục tiêu.
 * @param rows [{ label, lo, mid, hi }] (đồng / cổ phiếu hoặc vốn chủ) · price giá thị trường · target giá mục tiêu
 */
export function footballChart(rows, { price = null, target = null, labels = {} } = {}) {
  const ok = rows.filter((r) => [r.lo, r.mid, r.hi].some(Number.isFinite));
  if (!ok.length) return null;
  const vals = ok.flatMap((r) => [r.lo, r.mid, r.hi]).concat([price, target]).filter(Number.isFinite);
  const sc = nice(Math.min(0, ...vals), Math.max(...vals));
  const L = 170, R = 36, T = 28, ROW = 30, H = T + ok.length * ROW + 34;
  const x = (v) => L + ((v - sc.lo) / (sc.hi - sc.lo)) * (W - L - R);
  // Nhãn giá thị trường / mục tiêu đặt về hai phía của vạch (thấp hơn → bên trái, cao hơn → bên phải) để không đè nhau.
  const traiGia = Number.isFinite(price) && Number.isFinite(target) ? price <= target : null;
  const vach = (v, cls, nhan, trai) => (Number.isFinite(v) ? s('g', {}, s('line', { x1: x(v), x2: x(v), y1: T - 8, y2: H - 30, class: cls }),
    s('text', { x: x(v) + (trai === null ? 0 : trai ? -5 : 5), y: T - 12, class: `lbl ${cls}-t`, 'text-anchor': trai === null ? 'middle' : trai ? 'end' : 'start' }, `${nhan} ${fmtN(v)}`)) : null);
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cv dvc', role: 'img', 'aria-label': labels.title || 'Football field' },
    sc.ticks.map((v) => s('g', {}, s('line', { x1: x(v), x2: x(v), y1: T - 4, y2: H - 30, class: 'grid' }),
      s('text', { x: x(v), y: H - 12, class: 'lbl', 'text-anchor': 'middle' }, fmtN(v)))),
    ok.map((r, i) => {
      const y = T + i * ROW + ROW / 2;
      const lo = Number.isFinite(r.lo) ? r.lo : r.mid, hi = Number.isFinite(r.hi) ? r.hi : r.mid;
      return s('g', {},
        s('text', { x: L - 10, y: y + 4, class: 'lbl ff2-name', 'text-anchor': 'end' }, r.label),
        s('rect', { x: Math.min(x(lo), x(hi)), y: y - 8, width: Math.max(3, Math.abs(x(hi) - x(lo))), height: 16, rx: 5, class: `ff2-bar${r.hl ? ' hl' : ''}` }),
        Number.isFinite(r.mid) ? s('circle', { cx: x(r.mid), cy: y, r: 5, class: 'ff2-mid' }) : null,
        s('title', {}, `${r.label}: ${[lo, r.mid, hi].filter(Number.isFinite).map(fmtN).join(' · ')}`));
    }),
    vach(price, 'ff2-price', labels.price || '', traiGia),
    vach(target, 'ff2-target', labels.target || '', traiGia === null ? null : !traiGia));
}

/**
 * Thác nước: các bước cộng / trừ dồn từ 0, bước total vẽ từ 0 lên.
 * @param steps [{ label, v, total? }]
 */
export function waterfallChart(steps, { title = '' } = {}) {
  if (!steps.length) return null;
  let acc = 0;
  const bars = steps.map((st) => {
    const a0 = st.total ? 0 : acc, a1 = st.total ? st.v : acc + st.v;
    acc = st.total ? st.v : a1;
    return { ...st, a0, a1 };
  });
  const vals = bars.flatMap((b) => [b.a0, b.a1]);
  const sc = nice(Math.min(0, ...vals), Math.max(...vals));
  const T = 16, B = 52, H = 290, L = 60;
  const y = (v) => T + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - T - B);
  const bw = (W - L - 10) / bars.length;
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cv dvc', role: 'img', 'aria-label': title },
    sc.ticks.map((v) => s('g', {}, s('line', { x1: L, x2: W - 10, y1: y(v), y2: y(v), class: Math.abs(v) < 1e-9 ? 'ax0' : 'grid' }),
      s('text', { x: L - 6, y: y(v) + 4, class: 'lbl', 'text-anchor': 'end' }, fmtN(v)))),
    bars.map((b, i) => {
      const x0 = L + i * bw + bw * 0.15, w = bw * 0.7;
      const top = Math.min(y(b.a0), y(b.a1)), hh = Math.max(2, Math.abs(y(b.a1) - y(b.a0)));
      const cls = b.total ? 'wf-tot' : b.v >= 0 ? 'wf-up' : 'wf-down';
      return s('g', {},
        s('rect', { x: x0, y: top, width: w, height: hh, rx: 3, class: cls }),
        i < bars.length - 1 ? s('line', { x1: x0 + w, x2: x0 + bw, y1: y(b.a1), y2: y(b.a1), class: 'wf-link' }) : null,
        s('text', { x: x0 + w / 2, y: top - 5, class: 'lbl', 'text-anchor': 'middle' }, `${b.v < 0 ? '−' : ''}${fmtN(Math.abs(b.v))}`),
        s('text', { x: x0 + w / 2, y: H - B + 16, class: 'lbl wf-name', 'text-anchor': 'middle' },
          haiDong(b.label).map((d, k) => s('tspan', { x: x0 + w / 2, dy: k ? 13 : 0 }, d))),
        s('title', {}, `${b.label}: ${fmtN(b.v)}`));
    }));
}

/**
 * Doanh thu (cột, trục trái) và FCFF (đường, trục phải): hai đại lượng chênh nhau cả chục lần nên mỗi thứ một
 * trục; vạch 0 hai trục thẳng hàng để FCFF âm đọc được ngay. Năm actual tô mờ khác năm dự phóng.
 * @param cols [{ label, actual, rev, fcff }]
 */
export function revFcffChart(cols, { names = ['', ''], title = '' } = {}) {
  const ok = cols.filter((c) => Number.isFinite(c.rev) || Number.isFinite(c.fcff));
  if (!ok.length) return null;
  const rv = ok.map((c) => c.rev).filter(Number.isFinite), fv = ok.map((c) => c.fcff).filter(Number.isFinite);
  const a = nice(Math.min(0, ...rv), Math.max(0, ...rv)), b = nice(Math.min(0, ...fv), Math.max(0, ...fv));
  // Đưa vạch 0 hai trục về cùng một độ cao: phần âm (tỷ lệ) lấy theo trục có phần âm lớn hơn.
  const am = (x) => (x.hi > x.lo ? -x.lo / (x.hi - x.lo) : 0);
  const p = Math.min(0.9, Math.max(am(a), am(b)));
  const keo = (x) => (x.hi > 0 ? { ...x, lo: Math.min(x.lo, (-p * x.hi) / (1 - p)) } : x);
  const sa = keo(a), sb = keo(b);
  const T = 26, B = 40, H = 280, L = 70, R = 64;
  const yA = (v) => T + (1 - (v - sa.lo) / (sa.hi - sa.lo)) * (H - T - B);
  const yB = (v) => T + (1 - (v - sb.lo) / (sb.hi - sb.lo)) * (H - T - B);
  const trong = (x) => x.ticks.filter((v) => v >= x.lo - 1e-9 && v <= x.hi + 1e-9);
  const bw = (W - L - R) / ok.length;
  const ranh = ok.findIndex((c) => !c.actual);
  const cx = (i) => L + i * bw + bw / 2;
  const diem = ok.map((c, i) => (Number.isFinite(c.fcff) ? [cx(i), yB(c.fcff), c] : null)).filter(Boolean);
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cv dvc', role: 'img', 'aria-label': title },
    trong(sa).map((v) => s('g', {}, s('line', { x1: L, x2: W - R, y1: yA(v), y2: yA(v), class: Math.abs(v) < 1e-9 ? 'ax0' : 'grid' }),
      s('text', { x: L - 6, y: yA(v) + 4, class: 'lbl', 'text-anchor': 'end' }, fmtN(v)))),
    fv.length ? trong(sb).map((v) => s('text', { x: W - R + 6, y: yB(v) + 4, class: 'lbl rf-ax2' }, fmtN(v))) : null,
    ranh > 0 ? s('rect', { x: L + ranh * bw, y: T - 10, width: W - R - (L + ranh * bw), height: H - T - B + 10, class: 'rf-fc' }) : null,
    ok.map((c, i) => s('g', {},
      Number.isFinite(c.rev) ? s('rect', { x: L + i * bw + bw * 0.2, y: Math.min(yA(0), yA(c.rev)), width: bw * 0.6, height: Math.max(1.5, Math.abs(yA(c.rev) - yA(0))), rx: 2, class: `rf-rev${c.actual ? ' a' : ''}` }) : null,
      s('text', { x: cx(i), y: H - B + 18, class: 'lbl', 'text-anchor': 'middle' }, c.label),
      s('title', {}, `${c.label}: ${names[0]} ${Number.isFinite(c.rev) ? fmtN(c.rev) : '—'} · ${names[1]} ${Number.isFinite(c.fcff) ? fmtN(c.fcff) : '—'}`))),
    diem.length > 1 ? s('polyline', { points: diem.map(([x, y]) => `${x},${y}`).join(' '), class: 'rf-line' }) : null,
    diem.map(([x, y, c]) => s('circle', { cx: x, cy: y, r: 4, class: `rf-dot${c.actual ? ' a' : ''}${c.fcff < 0 ? ' neg' : ''}` },
      s('title', {}, `${c.label}: ${names[1]} ${fmtN(c.fcff)}`))),
    s('g', {}, s('rect', { x: L, y: 4, width: 12, height: 12, rx: 3, class: 'rf-rev' }), s('text', { x: L + 18, y: 14, class: 'lbl' }, `${names[0]} (${names[2] || '◂'})`),
      s('line', { x1: L + 170, x2: L + 186, y1: 10, y2: 10, class: 'rf-line' }), s('circle', { cx: L + 178, cy: 10, r: 3.5, class: 'rf-dot' }),
      s('text', { x: L + 192, y: 14, class: 'lbl' }, `${names[1]} (${names[3] || '▸'})`)));
}

/** Màu ô bảng độ nhạy theo % chênh với giá thị trường: xanh khi cao hơn, đỏ khi thấp hơn. */
export function heatStyle(v, ref) {
  if (!Number.isFinite(v) || !Number.isFinite(ref) || !ref) return null;
  const d = Math.max(-0.5, Math.min(0.5, v / ref - 1));
  const a = Math.round(Math.abs(d) * 2 * 45);              // 0–45%
  return { background: `color-mix(in srgb, ${d >= 0 ? 'var(--em)' : 'var(--red)'} ${a}%, transparent)` };
}
