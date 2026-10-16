// Tab "Phân tích & đề xuất" ở bước rà soát: sức khoẻ tài chính, dấu hiệu bất thường, việc cần làm.
// Toàn bộ kết luận do js/core/analysis.js tính bằng công thức — AI không viết chữ nào ở đây, nên đọc
// bằng tiếng Việt hay tiếng Anh cũng ra đúng một nhận định.
//
// Cũng ở đây: bảng đối chiếu NGƯỢC thuyết minh ↔ ba bảng chính (js/core/reconcile.js), vì đó là chỗ
// người dùng cần xem trước khi tin vào phần phân tích bên dưới.

import { h, fmt } from './dom.js';
import { analyze, LEVELS, SEVERITIES } from '../core/analysis.js';
import { reconcile } from '../core/reconcile.js';
import { periodLabel } from '../core/table.js';
import { t, unitLabel } from '../i18n.js';

const SUBS = ['liq', 'prof', 'lev', 'asset'];
const tone = (muc) => LEVELS[muc]?.tone || '';
const chip = (muc) => h('span', { class: `tag ${tone(muc)}` }, t(`level.${muc}`));

/**
 * Một con số của nhận định → chuỗi. core/analysis.js gắn sẵn kiểu cho từng số (xem `money`/`pc`/… ở đó):
 *   '' số tiền (theo đơn vị đang chọn) · '%' tỷ lệ · 'pp' điểm phần trăm · 'x' số lần · 'd' ngày · 'n' số đếm
 */
function soCau({ n, k }, unit) {
  if (k === 'n') return String(n);
  if (!Number.isFinite(n)) return '—';
  if (k === '%') return `${n.toFixed(1)}%`;
  if (k === 'pp') return t('an.pp', { v: n.toFixed(1) });
  if (k === 'x') return t('ch.times', { v: n.toFixed(2) });
  if (k === 'd') return t('ch.days', { v: Math.round(n) });
  return `${fmt(n, unit)} ${unitLabel(unit)}`;
}

const dich = (khoa, params, unit) => t(khoa, Object.fromEntries(Object.entries(params || {}).map(([k, v]) => [k, soCau(v, unit)])));

/** @returns phần tử của tab, hoặc lời nhắn nếu chưa đủ số. */
export function renderAnalysis(ds, unit) {
  const a = analyze(ds);
  if (!a) return h('p', { class: 'empty' }, t('ch.none'));
  const ky = a.periods[a.last];
  const soSanh = a.prev >= 0 ? a.periods[a.prev] : null;
  return h('div', {},
    h('p', { class: 'priv' }, t('an.lead', { p: ky.label, prev: soSanh ? soSanh.label : t('an.noPrev') })),
    h('div', { class: 'health' },
      h('div', { class: `hbox ${tone(a.health)}` }, h('span', { class: 'hlbl' }, t('an.health')), h('b', {}, t(`level.${a.health}`))),
      h('ul', { class: 'hsubs' }, a.subs.map((x) => h('li', {}, h('span', {}, t(`sub.${x.key}`)), chip(x.level))))),
    flagList(a, unit),
    adviceList(a, unit),
    h('p', { class: 'priv' }, t('an.note')));
}

function flagList(a, unit) {
  if (!a.flags.length) return h('p', { class: 'msg' }, t('an.noFlag'));
  const khoi = SEVERITIES.map((sv) => {
    const list = a.flags.filter((f) => f.severity === sv);
    if (!list.length) return null;
    return h('div', { class: `fgrp sv-${sv}` },
      h('h4', {}, t(`sev.${sv}`), h('span', { class: 'tag' }, String(list.length))),
      h('ul', {}, list.map((f) => h('li', {},
        h('b', {}, t(`flag.${f.id}`)),
        h('span', {}, dich(`flag.${f.id}.why`, f.params, unit))))));
  });
  return h('section', { class: 'flags' }, h('h3', {}, t('an.flags')), khoi);
}

function adviceList(a, unit) {
  return h('section', { class: 'advice' }, h('h3', {}, t('an.advice')),
    h('ol', {}, a.advice.map((x) => h('li', {},
      h('b', {}, t(`adv.${x.id}`)),
      h('span', {}, dich(`adv.${x.id}.how`, x.params, unit))))));
}

// ─── Đối chiếu ngược thuyết minh ───────────────────────────

/** @returns bảng lệch giữa thuyết minh và ba bảng chính, hoặc null nếu khớp hết / chưa có thuyết minh. */
export function renderReconcile(ds, unit) {
  const rc = reconcile(ds, { unit });
  const ids = Object.keys(rc);
  if (!ids.length) return null;
  const n = ids.reduce((a, k) => a + rc[k].length, 0);
  const nang = ids.reduce((a, k) => a + rc[k].filter((x) => x.severity === 'warn').length, 0);
  const rows = ds.periods.flatMap((p) => (rc[p.id] || []).map((x) => h('tr', { class: x.severity === 'warn' ? 'bad' : '' },
    h('td', {}, periodLabel(p)),
    h('td', {}, t(`rc.${x.id}`), x.name ? h('small', { class: 'priv' }, x.name) : null),
    h('td', { class: 'num' }, fmt(x.reported, unit)),
    h('td', { class: 'num' }, fmt(x.computed, unit)),
    h('td', { class: 'num' }, fmt(x.diff, unit)))));
  return h('details', { class: 'msg warn', open: nang > 0 },
    h('summary', {}, t('rc.h', { n, warn: nang, unit: unitLabel(unit) })),
    h('p', {}, t('rc.lead')),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k' },
      h('thead', {}, h('tr', {}, h('th', {}, t('src.period')), h('th', {}, t('rc.item')), h('th', { class: 'num' }, t('rc.stmt')), h('th', { class: 'num' }, t('rc.note')), h('th', { class: 'num' }, t('rc.diff')))),
      h('tbody', {}, rows))));
}
