// Lộ trình định giá: trình bày tab "M&A & định giá" thành các BƯỚC nối nhau như một model bài bản
// (Quality of Earnings → working capital & FCF lịch sử → DCF → EV → equity bridge → định giá tương đối →
// target price → debt capacity → M&A). Đầu tab là sơ đồ các bước kèm công thức và số kết quả chính; mỗi bước
// có khung "mục đích · công thức" ở đầu và thanh "đầu vào ← / chuyển sang →" ở cuối, bấm là nhảy tới bước kia —
// người mới đọc từ trên xuống là thấy số đi từ đâu tới đâu. Câu chữ ở i18n: dv.step.<n>.t / .why / .f / .out.

import { h } from './dom.js';
import { t } from '../i18n.js';

/** Các bước và quan hệ đầu vào → đầu ra giữa chúng. */
export const STEPS = [
  { n: 1, from: [], to: [3, 5, 7] },        // Quality of Earnings → Normalised EBITDA
  { n: 2, from: [], to: [3] },              // Working capital & FCF lịch sử → tỷ lệ mặc định cho dự phóng
  { n: 3, from: [1, 2], to: [4] },          // DCF: dự phóng + WACC → EV
  { n: 4, from: [3], to: [5, 6, 7] },       // EV → equity bridge
  { n: 5, from: [1, 4], to: [6] },          // định giá tương đối: bội số + peer
  { n: 6, from: [3, 4, 5], to: [8] },       // target price & recommendation
  { n: 7, from: [1, 4], to: [] },           // debt capacity (góc nhìn ngân hàng)
  { n: 8, from: [6], to: [] },              // thương vụ M&A
];

export const stepId = (n) => `dv-step-${n}`;

/** Cuộn tới một bước; khối M&A là <details> thì mở ra. */
function toi(n) {
  const el = typeof document !== 'undefined' ? document.getElementById(stepId(n)) : null;
  if (!el) return;
  el.querySelectorAll('details.dv-mna').forEach((d) => { d.open = true; });
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const chip = (n, txt, cls) => h('button', { type: 'button', class: `dv-chip ${cls}`, onclick: () => toi(n) }, txt);

/** Bọc các khối của một bước: tiêu đề "Bước n", mục đích, công thức; cuối bước là thanh liên kết. */
export function stepWrap(n, ...kids) {
  const st = STEPS.find((x) => x.n === n);
  return h('div', { class: 'dv-step', id: stepId(n) },
    h('div', { class: 'dv-step-h' },
      h('span', { class: 'dv-badge' }, t('dv.step', { n })),
      h('div', {},
        h('h2', {}, t(`dv.step.${n}.t`)),
        h('p', { class: 'dv-why' }, t(`dv.step.${n}.why`)),
        h('code', { class: 'dv-formula' }, t(`dv.step.${n}.f`)))),
    ...kids,
    st && (st.from.length || st.to.length) ? h('div', { class: 'dv-links' },
      st.from.length ? h('span', { class: 'dv-lk' }, h('b', {}, t('dv.lk.in')),
        st.from.map((m) => chip(m, `← ${t('dv.step', { n: m })} · ${t(`dv.step.${m}.out`)}`, 'in'))) : null,
      st.to.length ? h('span', { class: 'dv-lk' }, h('b', {}, t('dv.lk.out', { x: t(`dv.step.${n}.out`) })),
        st.to.map((m) => chip(m, `→ ${t('dv.step', { n: m })} · ${t(`dv.step.${m}.t`)}`, 'out'))) : null) : null);
}

/**
 * Sơ đồ lộ trình ở đầu tab: mỗi bước một thẻ (số bước, tên, công thức, số kết quả chính), nối bằng mũi tên.
 * @param vals { [n]: chuỗi số kết quả chính của bước n } — tính sẵn ở deal.js
 */
export function roadmap(vals) {
  return h('section', { class: 'dl-sec dv-road' },
    h('h3', {}, t('dv.road.h')),
    h('p', { class: 'priv' }, t('dv.road.lead')),
    h('ol', { class: 'dv-flow' }, STEPS.map((st) => h('li', {},
      h('button', { type: 'button', class: `dv-node${st.n >= 7 ? ' side' : ''}`, onclick: () => toi(st.n) },
        h('span', { class: 'dv-badge' }, String(st.n)),
        h('b', {}, t(`dv.step.${st.n}.t`)),
        h('small', { class: 'dv-node-f' }, t(`dv.step.${st.n}.f`)),
        h('span', { class: 'dv-node-v' }, h('em', {}, t(`dv.step.${st.n}.out`)), ' ', vals[st.n] ?? '—'))))),
    h('p', { class: 'priv dv-road-note' }, t('dv.road.note')));
}
