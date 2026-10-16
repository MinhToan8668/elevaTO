// Tab "Biểu đồ & chỉ số" ở bước rà soát: vẽ SVG ngay trên trang, không dùng thư viện ngoài
// (CSP của trang không cho nạp script từ CDN, mà gói một thư viện vẽ vào repo thì nặng hơn cả
// phần việc nó làm). Màu lấy từ biến CSS nên tự đổi theo giao diện sáng / tối.
// Số do js/core/metrics.js tính từ BCTC đã trích — AI không tham gia.

import { h, mount, fmt } from './dom.js';
import { buildMetrics, RATIO_GROUPS, SPANS } from '../core/metrics.js';
import { assess, LEVELS } from '../core/analysis.js';
import { t } from '../i18n.js';

const COLORS = ['var(--em)', 'var(--blue)', 'var(--gold)', 'var(--red)', 'var(--line-3)', 'var(--muted2)'];
const W = 720, H = 320;
const PAD_T = 14, PAD_B = 44, PAD_L = 66, PAD_R_HEP = 16, PAD_R_RONG = 62;

// Lựa chọn của người dùng, giữ qua các lần vẽ lại (bảng số sửa một ô là cả tab vẽ lại).
// hidden: những đường đã tắt, theo từng biểu đồ — bấm vào chú giải để bật/tắt.
const ui = { mode: 'period', span: 0, hidden: {} };

const s = (tag, attrs = {}, ...kids) => h(tag, attrs, ...kids);

/** @returns phần tử của tab, hoặc lời nhắn nếu chưa có số. */
export function renderCharts(ds, unit, unitLabel, onRedraw) {
  const m = buildMetrics(ds, { mode: ui.mode, span: ui.span });
  ui.mode = m.mode;
  if (!m.periods.length) return h('p', { class: 'empty' }, t('ch.none'));
  if (!m.charts.length) return h('p', { class: 'empty' }, t('ch.thin'));
  const lai = () => onRedraw?.();
  const chon = (nhan, list, dang, dat) => h('div', { class: 'segx', role: 'group', 'aria-label': nhan },
    h('span', { class: 'segx-lbl' }, nhan),
    list.map(([v, l, tat]) => h('button', { type: 'button', 'aria-pressed': String(dang === v), disabled: tat, onclick: () => { dat(v); lai(); } }, l)));
  const suyRa = m.periods.filter((p) => p.derived).length;
  return h('div', {},
    h('p', { class: 'priv' }, t('ch.lead', { unit: unitLabel })),
    h('div', { class: 'bar' },
      chon(t('ch.mode'), [['period', t('ch.mode.period')], ['year', t('ch.mode.year')], ['quarter', t('ch.mode.quarter'), !m.modes.includes('quarter')]],
        m.mode, (v) => { ui.mode = v; }),
      chon(t('ch.span'), SPANS.map((v) => [v, v ? t('ch.span.y', { n: v }) : t('ch.span.all')]), m.span, (v) => { ui.span = v; })),
    suyRa ? h('p', { class: 'msg' }, t('ch.derived', { n: suyRa })) : null,
    h('div', { class: 'charts' }, m.charts.map((c) => card(c, m.periods, unit, unitLabel))),
    ratioTable(m, unit));
}

/** Tên biểu đồ / tên đường số theo ngôn ngữ đang chọn (metrics.js chỉ phát ra khoá). */
const chartTitle = (c) => t(`chart.${c.id}`);
const serName = (ser) => t(`ser.${ser.key}`);

// ─── Định dạng số ──────────────────────────────────────────

/** kieu: '' số tiền · '%' · 'd' ngày · 'x' số lần */
function soChu(v, kieu, unit) {
  if (!Number.isFinite(v)) return '—';
  if (kieu === '%') return `${v.toFixed(1)}%`;
  if (kieu === 'd') return t('ch.days', { v: Math.round(v) });
  if (kieu === 'x') return t('ch.times', { v: v.toFixed(2) });
  return fmt(v, unit);
}
/** Nhãn trục: số tiền chia theo đơn vị đang chọn, còn lại in thẳng. */
function soTruc(v, kieu, unit, buocNho) {
  if (v === 0) return '0';
  if (!kieu) return fmt(v, unit);
  const le = buocNho ? 1 : 0;
  return v.toLocaleString('vi-VN', { minimumFractionDigits: le, maximumFractionDigits: le });
}

// ─── Thang chia ────────────────────────────────────────────

/** Thang chia "đẹp": 1 / 2 / 2,5 / 5 × 10^n. */
function niceStep(span, want = 4) {
  const raw = span / want, p = 10 ** Math.floor(Math.log10(raw) || 0), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function scale(values, { t: top, h: height }) {
  const nums = values.filter((v) => Number.isFinite(v));
  let hi = Math.max(0, ...nums), lo = Math.min(0, ...nums);
  if (hi === lo) hi = lo + 1;
  const step = niceStep(hi - lo);
  hi = Math.ceil(hi / step) * step; lo = Math.floor(lo / step) * step;
  const ticks = [];
  // Cộng dồn sẽ lệch dần và mốc 0 mất nét đậm → tính lại từ lo mỗi vòng.
  for (let i = 0; lo + i * step <= hi + step / 1e6; i++) ticks.push(lo + i * step);
  return { lo, hi, step, ticks, y: (v) => top + height - ((v - lo) / (hi - lo)) * height };
}

// ─── Một thẻ biểu đồ ───────────────────────────────────────

function card(c, periods, unit, unitLabel) {
  const an = (ui.hidden[c.id] ||= new Set());
  const hien = c.series.filter((ser) => !an.has(ser.key));
  const kieu = c.kind === 'share' ? '%' : (c.unit || '');
  const mau = Object.fromEntries(c.series.map((ser, i) => [ser.key, COLORS[i % COLORS.length]]));
  const wrap = h('div', { class: 'cvwrap' });
  const tip = h('div', { class: 'cvtip', hidden: true, role: 'status', 'aria-live': 'polite' });
  mount(wrap, plot(c, hien, periods, unit, kieu, mau, tip), tip);
  return h('figure', { class: 'chart' },
    h('figcaption', {}, h('b', {}, chartTitle(c)),
      h('span', { class: 'priv' }, kieu === '%' ? '%' : kieu === 'd' ? t('ch.unit.days') : kieu === 'x' ? t('ch.unit.times') : unitLabel)),
    wrap,
    c.negative ? h('p', { class: 'msg warn' }, t('chart.negative', { list: c.negative.map((k) => t(`ser.${k}`).toLowerCase()).join(', ') })) : null,
    h('ul', { class: 'legend' }, c.series.map((ser) => h('li', {},
      h('button', { type: 'button', class: `lgb${an.has(ser.key) ? ' off' : ''}`, 'aria-pressed': String(!an.has(ser.key)),
        title: t('ch.toggle', { name: serName(ser) }),
        onclick: (e) => {
          if (an.has(ser.key)) an.delete(ser.key); else an.add(ser.key);
          // Vẽ lại đúng một thẻ, không dựng lại cả tab — giữ nguyên chỗ cuộn và các thẻ khác.
          const moi = card(c, periods, unit, unitLabel);
          e.target.closest('figure.chart').replaceWith(moi);
        } },
      h('i', { style: { background: mau[ser.key] } }), serName(ser))))),
    dataTable(c, periods, unit, kieu));
}

/**
 * Khung vẽ. Gộp mọi kiểu vào một hàm vì chúng dùng chung trục, lưới, dải chạm chuột:
 *   bars   cột cạnh nhau · stack cột chồng · share cột chồng theo tỷ trọng 100%
 *   lines  đường · combo  cột + đường (đường có axis:'right' thì đi trục phải)
 */
function plot(c, hien, periods, unit, kieu, mau, tip) {
  const phai = hien.filter((x) => x.axis === 'right');
  const trai = hien.filter((x) => x.axis !== 'right');
  const padR = phai.length ? PAD_R_RONG : PAD_R_HEP;
  const box = { t: PAD_T, h: H - PAD_T - PAD_B, x: PAD_L, w: W - PAD_L - padR };
  const chong = c.kind === 'stack' || c.kind === 'share';
  const n = periods.length;

  // Giá trị vẽ: biểu đồ tỷ trọng quy mỗi kỳ về 100%.
  const tongKy = periods.map((_, i) => trai.reduce((a, ser) => a + Math.max(0, ser.values[i] || 0), 0));
  const val = (ser, i) => {
    const v = ser.values[i];
    if (!Number.isFinite(v)) return null;
    if (c.kind !== 'share') return v;
    return tongKy[i] ? (Math.max(0, v) / tongKy[i]) * 100 : null;
  };

  const scT = scale(chong ? [0, ...periods.map((_, i) => trai.reduce((a, ser) => a + Math.max(0, val(ser, i) || 0), 0))]
    : trai.flatMap((x) => x.values), box);
  const scP = phai.length ? scale(phai.flatMap((x) => x.values), box) : null;
  const kieuP = phai.length ? (c.right || '') : '';

  // ── lưới + trục ──
  const buocNho = !!kieu && scT.step < 1;
  const luoi = scT.ticks.map((v) => s('g', {},
    s('line', { x1: box.x, x2: box.x + box.w, y1: scT.y(v), y2: scT.y(v), class: Math.abs(v) < scT.step / 1e6 ? 'ax0' : 'grid' }),
    s('text', { x: box.x - 8, y: scT.y(v) + 4, class: 'lbl', 'text-anchor': 'end' }, soTruc(v, kieu, unit, buocNho))));
  const luoiP = scP ? scP.ticks.map((v) => s('text', { x: box.x + box.w + 8, y: scP.y(v) + 4, class: 'lbl', 'text-anchor': 'start' },
    soTruc(v, kieuP || 'x', unit, scP.step < 1))) : null;
  // Nhiều kỳ thì nhãn trục ngang chen nhau → in cách quãng, kỳ mới nhất luôn có nhãn.
  const buocNhan = Math.ceil(n / 9);
  const nhanX = periods.map((p, i) => ((n - 1 - i) % buocNhan ? null
    : s('text', { x: box.x + box.w * ((i + 0.5) / n), y: H - PAD_B + 20, class: 'lbl', 'text-anchor': 'middle' }, p.label)));

  const band = (i) => ({ x: box.x + (box.w * i) / n, w: box.w / n });

  // ── cột ──
  const cot = hien.filter((x) => (c.kind === 'bars' || chong ? true : x.kind === 'bar'));
  let veCot = null;
  if (cot.length && chong) {
    veCot = periods.map((p, i) => {
      const b = band(i), bw = Math.min(b.w * 0.56, 68), x = b.x + (b.w - bw) / 2;
      let acc = 0;
      return cot.map((ser) => {
        const v = Math.max(0, val(ser, i) || 0);
        if (!v) return null;
        const y = scT.y(acc + v), hg = scT.y(acc) - y;
        acc += v;
        return s('rect', { x, y, width: bw, height: Math.max(1, hg), fill: mau[ser.key] });
      });
    });
  } else if (cot.length) {
    veCot = periods.map((p, i) => {
      const b = band(i), bw = (b.w * 0.74) / cot.length;
      return cot.map((ser, j) => {
        const v = ser.values[i];
        if (!Number.isFinite(v)) return null;
        const x = b.x + b.w * 0.13 + bw * j, y0 = scT.y(0), y = scT.y(v);
        return s('rect', { x, y: Math.min(y, y0), width: Math.max(1, bw - 2), height: Math.max(1, Math.abs(y - y0)), rx: 2, fill: mau[ser.key] });
      });
    });
  }

  // ── đường ──
  const cx = (i) => box.x + box.w * ((i + 0.5) / n);
  const duong = hien.filter((x) => (c.kind === 'lines' ? true : x.kind === 'line')).map((ser) => {
    const sc = ser.axis === 'right' && scP ? scP : scT;
    const pts = ser.values.map((v, i) => (Number.isFinite(v) ? [cx(i), sc.y(v)] : null));
    const co = pts.filter(Boolean);
    if (!co.length) return null;
    return s('g', {},
      co.length > 1 ? s('polyline', { points: co.map(([x, y]) => `${x},${y}`).join(' '), fill: 'none', stroke: mau[ser.key],
        'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': ser.axis === 'right' ? '6 4' : null }) : null,
      co.map(([x, y]) => s('circle', { cx: x, cy: y, r: 3.5, fill: 'var(--surface)', stroke: mau[ser.key], 'stroke-width': 2 })));
  });

  // ── dải chạm chuột: một ô cho mỗi kỳ, hiện bảng nhỏ đủ mọi đường của kỳ đó ──
  const noi = s('g', { class: 'hit' });
  const cham = periods.map((p, i) => {
    const b = band(i);
    const o = s('rect', { x: b.x, y: box.t, width: b.w, height: box.h, fill: 'transparent', class: 'hitr' });
    const vao = (ev) => {
      mount(noi, s('rect', { x: b.x, y: box.t, width: b.w, height: box.h, class: 'hitbg' }));
      mount(tip, h('b', {}, p.label), h('table', {}, hien.map((ser) => h('tr', {},
        h('td', {}, h('i', { style: { background: mau[ser.key] } }), serName(ser)),
        h('td', { class: 'num' }, soChu(ser.values[i], ser.axis === 'right' ? (kieuP || 'x') : kieu, unit))))));
      tip.hidden = false;
      // Vị trí tính theo tỷ lệ trong khung vẽ: SVG co giãn theo bề rộng nên không dùng được toạ độ viewBox.
      const giua = (b.x + b.w / 2) / W;
      tip.style.left = `${giua * 100}%`;
      tip.style.transform = `translate(${giua > 0.72 ? '-100%' : giua < 0.28 ? '0' : '-50%'}, 0)`;
      if (ev?.type === 'focus') o.setAttribute('data-on', '1');
    };
    const ra = () => { mount(noi); tip.hidden = true; o.removeAttribute('data-on'); };
    o.addEventListener('pointerenter', vao);
    o.addEventListener('pointermove', vao);
    o.addEventListener('pointerleave', ra);
    o.addEventListener('focus', vao);
    o.addEventListener('blur', ra);
    o.setAttribute('tabindex', '0');
    o.setAttribute('role', 'img');
    o.append(s('title', {}, `${p.label}: ${hien.map((ser) => `${serName(ser)} ${soChu(ser.values[i], ser.axis === 'right' ? (kieuP || 'x') : kieu, unit)}`).join(' · ')}`));
    return o;
  });

  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cv', preserveAspectRatio: 'xMidYMid meet', 'aria-label': t('ch.byPeriod', { title: chartTitle(c) }) },
    luoi, luoiP, nhanX, noi, veCot, duong, cham);
}

// ─── Bảng số kèm biểu đồ ───────────────────────────────────

/** Đọc được bằng trình đọc màn hình, và xem nhanh khi không phân biệt được màu. */
function dataTable(c, periods, unit, kieu) {
  return h('details', { class: 'chart-data' },
    h('summary', {}, t('ch.data')),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k' },
      h('thead', {}, h('tr', {}, h('th', {}, t('ch.item')), periods.map((p) => h('th', { class: 'num' }, p.label)))),
      h('tbody', {}, c.series.map((ser) => h('tr', {}, h('td', {}, serName(ser)),
        ser.values.map((v) => h('td', { class: 'num' }, soChu(v, ser.axis === 'right' ? (c.right || 'x') : kieu, unit)))))))));
}

// ─── Bảng chỉ số ───────────────────────────────────────────

function ratioTable(m, unit) {
  const rows = [];
  for (const gr of RATIO_GROUPS) {
    const list = m.ratios.filter((r) => r.group === gr);
    if (!list.some((r) => r.values.some((v) => v !== null))) continue;
    rows.push(h('tr', { class: 'rgrp' }, h('th', { colspan: String(m.periods.length + 2) }, t(`rgroup.${gr}`))));
    for (const r of list) {
      const moi = [...r.values].reverse().find((v) => v !== null) ?? null;
      const muc = assess(r.key, moi);
      rows.push(h('tr', {},
        h('td', {}, t(`ratio.${r.key}`), h('small', { class: 'priv' }, t(`ratio.${r.key}.hint`))),
        r.values.map((v) => h('td', { class: 'num' }, soChu(v, r.fmt, unit))),
        h('td', {}, muc ? h('span', { class: `tag ${LEVELS[muc].tone}` }, t(`level.${muc}`)) : null)));
    }
  }
  if (!rows.length) return null;
  return h('div', { class: 'gridwrap' },
    h('table', { class: 'k ratios' },
      h('thead', {}, h('tr', {}, h('th', {}, t('ch.ratio')), m.periods.map((p) => h('th', { class: 'num' }, p.label)), h('th', {}, t('ch.level')))),
      h('tbody', {}, rows)));
}
