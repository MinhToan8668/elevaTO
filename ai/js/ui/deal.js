// Tab "M&A & định giá": EBITDA chuẩn hoá, cầu nối nợ ròng → giá trị vốn chủ, vốn lưu động, dòng tiền tự do,
// chất lượng lợi nhuận (Beneish, Altman, dồn tích), định giá bội số và sức vay nợ.
// Mọi con số do js/core/deal.js tính; tab này chỉ vẽ và nhận thông số người dùng nhập (bội số, đòn bẩy mục
// tiêu, điều chỉnh tay) — lưu vào store.dealInputs, đi cùng phiên làm việc.

import { h, fmt } from './dom.js';
import { dealAnalysis, cleanInputs, DEFAULT_INPUTS } from '../core/deal.js';
import { t, unitLabel } from '../i18n.js';

const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');
const lan = (x) => (Number.isFinite(x) ? t('ch.times', { v: x.toFixed(2) }) : '—');
const ZONE_TONE = { safe: 'em', grey: 'gold', risk: 'red' };

export function renderDeal(store) {
  const s = store.get();
  const { ds } = store.data();
  const inp = cleanInputs(s.dealInputs || DEFAULT_INPUTS);
  const a = dealAnalysis(ds, inp);
  if (!a) return h('p', { class: 'empty' }, t('ch.none'));
  const unit = s.unit, ul = unitLabel(unit);
  const money = (v) => (Number.isFinite(v) ? fmt(v, unit) || '0' : '—');
  const save = (patch) => store.set({ dealInputs: cleanInputs({ ...inp, ...patch }) });
  const ltm = a.cols.find((c) => c.ltm);

  return h('div', { class: 'deal' },
    h('p', { class: 'priv' }, t('dl.lead', { p: a.base.label, unit: ul }),
      ltm ? ' ' + t('dl.ltm', { p: ltm.label }) : ' ' + t('dl.noLtm')),
    flagBox(a, money),
    ebitdaTable(a, money, ul),
    manualAdj(inp, save, unit, money),
    wcTable(a, money),
    cashTable(a, money),
    quality(a),
    bridge(a, money),
    valuation(a, inp, save, money, ul),
    capacity(a, inp, save, money),
    h('p', { class: 'priv' }, t('dl.note')));
}

// ─── Khối nhỏ ──────────────────────────────────────────────

const sec = (key, ...kids) => h('section', { class: 'dl-sec' }, h('h3', {}, t(`dl.${key}.h`)), h('p', { class: 'priv', style: { marginTop: 0 } }, t(`dl.${key}.lead`)), ...kids);

/** Bảng nhiều kỳ: rows = [{ label, get(m), kind: 'money'|'pct'|'x', bold?, sub? }]. */
function multiTable(a, rows, money) {
  const show = (v, kind) => (kind === 'pct' ? pc(v) : kind === 'x' ? lan(v) : money(v));
  return h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), a.cols.map((c) => h('th', { class: `num${c.id === a.base.id ? ' dl-base' : ''}` }, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.bold ? 'dl-tot' : r.sub ? 'dl-sub' : '' },
      h('td', {}, r.label),
      a.cols.map((c) => h('td', { class: `num${c.id === a.base.id ? ' dl-base' : ''}` }, show(r.get(c.m), r.kind))))))));
}

function flagBox(a, money) {
  if (!a.flags.length) return h('p', { class: 'msg' }, t('dl.noFlag'));
  const so = (id, p) => {
    const f = {};
    for (const [k, v] of Object.entries(p)) f[k] = ['beneish', 'altman', 'overLevered', 'dscrLow'].includes(id) ? v.toFixed(2) : id === 'debtLike' || id === 'wcBelowPeg' ? money(v) : v.toFixed(1);
    return f;
  };
  return h('div', { class: 'fgrp sv-tb' },
    h('h4', {}, t('dl.flags'), h('span', { class: 'tag' }, String(a.flags.length))),
    h('ul', {}, a.flags.map((f) => h('li', {}, h('b', {}, t(`dl.flag.${f.id}`)), h('span', {}, t(`dl.flag.${f.id}.why`, so(f.id, f.params)))))));
}

function ebitdaTable(a, money) {
  const keys = [...new Set(a.cols.flatMap((c) => c.m.adj.map((x) => x.key)))];
  const rows = [
    { label: t('dl.rev'), get: (m) => m.rev },
    { label: t('dl.ebitda'), get: (m) => m.ebitda, bold: true },
    ...keys.map((k) => ({ label: t(`dl.adj.${k}`), get: (m) => m.adj.find((x) => x.key === k)?.v ?? null, sub: true })),
    { label: t('dl.adjEbitda'), get: (m) => m.adjEbitda, bold: true },
    { label: t('dl.adjMargin'), get: (m) => (m.rev ? m.adjEbitda / m.rev : null), kind: 'pct' },
  ];
  return sec('ebitda', multiTable(a, rows, money));
}

function manualAdj(inp, save, unit, money) {
  const list = inp.adjustments;
  const sua = (i, patch) => save({ adjustments: list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const tong = list.reduce((s, x) => s + x.amount, 0);
  return h('details', { class: 'dl-adj', open: list.length > 0 },
    h('summary', {}, h('b', {}, t('dl.man.h')), ' ', h('span', { class: 'tag' }, list.length ? `${money(tong)} ${unitLabel(unit)}` : t('dl.man.none'))),
    h('p', { class: 'priv', style: { marginTop: '4px' } }, t('dl.man.lead', { unit: unitLabel(unit) })),
    list.map((x, i) => h('div', { class: 'dl-row' },
      h('input', { type: 'text', value: x.label, placeholder: t('dl.man.label'), maxlength: 120, onchange: (e) => sua(i, { label: e.target.value }) }),
      h('input', { type: 'number', step: 'any', value: String(x.amount / unit), onchange: (e) => sua(i, { amount: (+e.target.value || 0) * unit }) }),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => save({ adjustments: list.filter((_, j) => j !== i) }) }, '✕'))),
    h('button', { class: 'btn ghost sm', type: 'button', onclick: () => save({ adjustments: [...list, { label: t('dl.man.new'), amount: 0 }] }) }, t('dl.man.add')));
}

function wcTable(a, money) {
  const rows = [
    { label: t('dl.tradeWc'), get: (m) => m.tradeWc, bold: true },
    { label: t('dl.tradeWcPct'), get: (m) => (m.rev ? m.tradeWc / m.rev : null), kind: 'pct' },
    { label: t('dl.opWc'), get: (m) => m.opWc },
  ];
  return sec('wc', multiTable(a, rows, money),
    a.wcAvg !== null ? h('p', { class: 'msg' }, t('dl.wc.peg', { avg: pc(a.wcAvg), peg: money(a.wcPeg), cur: money(a.base.m.tradeWc) })) : null);
}

function cashTable(a, money) {
  const rows = [
    { label: t('dl.cfo'), get: (m) => m.cfo },
    { label: t('dl.capex'), get: (m) => (m.capexNet === null ? null : -m.capexNet) },
    { label: t('dl.fcff'), get: (m) => m.fcff, bold: true },
    { label: t('dl.fcfe'), get: (m) => m.fcfe },
    { label: t('dl.cashConv'), get: (m) => (m.ebitda ? m.cfo / m.ebitda : null), kind: 'pct' },
  ];
  return sec('cash', multiTable(a, rows, money));
}

function quality(a) {
  const q = a.quality;
  const card = (key, val, zone, extra) => h('div', { class: `hbox ${zone ? ZONE_TONE[zone] : ''}` },
    h('span', { class: 'hlbl' }, t(`dl.q.${key}`)),
    h('b', {}, val),
    zone ? h('span', { class: `tag ${ZONE_TONE[zone]}` }, t(`dl.zone.${zone}`)) : null,
    h('small', { class: 'priv', style: { marginTop: '2px' } }, extra || t(`dl.q.${key}.hint`)));
  const zConv = q.cashConv === null ? null : q.cashConv >= 0.8 ? 'safe' : q.cashConv >= 0.5 ? 'grey' : 'risk';
  const zAcc = q.accrual === null ? null : q.accrual <= 0.05 ? 'safe' : q.accrual <= 0.1 ? 'grey' : 'risk';
  const bn = q.beneish;
  return sec('q', h('div', { class: 'dl-cards' },
    card('cashConv', pc(q.cashConv), zConv),
    card('accrual', pc(q.accrual), zAcc),
    card('beneish', bn ? bn.score.toFixed(2) : '—', bn?.zone, bn ? (bn.missing.length ? t('dl.q.missing', { v: bn.missing.join(', ') }) : t('dl.q.beneish.hint')) : t('dl.q.need2y')),
    card('altman', q.altman ? q.altman.score.toFixed(2) : '—', q.altman?.zone)));
}

function bridge(a, money) {
  const v = a.valuation, m = a.base.m;
  const dong = (label, val, cls = '') => h('tr', { class: cls }, h('td', {}, label), h('td', { class: 'num' }, money(val)));
  return sec('bridge', h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t' }, h('tbody', {},
    dong(t('dl.debt'), m.debt),
    dong(t('dl.cash'), m.cash === null ? null : -m.cash, 'dl-sub'),
    dong(t('dl.cashLike'), m.cashLike === null ? null : -m.cashLike, 'dl-sub'),
    dong(t('dl.netDebt'), v.netDebt, 'dl-tot'),
    v.debtLike.map((x) => dong(t(`dl.dl.${x.key}`), x.v, 'dl-sub')),
    v.minority ? dong(t('dl.minority'), v.minority, 'dl-sub') : null,
    v.nonOp.map((x) => dong(t(`dl.no.${x.key}`), -x.v, 'dl-sub')),
    dong(t('dl.evToEq'), (v.netDebt || 0) + v.debtLikeSum + (v.minority || 0) - v.nonOpSum, 'dl-tot')))));
}

function valuation(a, inp, save, money, ul) {
  const v = a.valuation;
  const o = (key, i) => h('input', { type: 'number', step: '0.1', min: '0', class: 'dl-mult', value: String(inp[key][i]),
    onchange: (e) => { const x = inp[key].slice(); x[i] = +e.target.value; save({ [key]: x }); } });
  const cs = v.shares ? 3 : 0;
  const rows = ['evEbitda', 'pe', 'pb'].map((key) => {
    const m = v.methods.find((x) => x.key === key);
    return h('tr', {},
      h('td', {}, t(`dl.m.${key}`), h('small', { class: 'priv dl-blk' }, t(`dl.m.${key}.base`))),
      [0, 1, 2].map((i) => h('td', { class: 'num' }, o(key, i))),
      [0, 1, 2].map((i) => h('td', { class: 'num' }, m ? money(m.equity[i]) : '—')),
      cs ? [0, 1, 2].map((i) => h('td', { class: 'num' }, m && Number.isFinite(m.perShare[i]) ? Math.round(m.perShare[i]).toLocaleString('vi-VN') : '—')) : null);
  });
  const head = h('tr', {}, h('th', {}, t('dl.m.method')),
    ['lo', 'mid', 'hi'].map((k) => h('th', { class: 'num' }, t('dl.m.mult') + ' ' + t(`dl.${k}`))),
    ['lo', 'mid', 'hi'].map((k) => h('th', { class: 'num' }, t('dl.m.eq') + ' ' + t(`dl.${k}`))),
    cs ? ['lo', 'mid', 'hi'].map((k) => h('th', { class: 'num' }, t('dl.m.ps') + ' ' + t(`dl.${k}`))) : null);
  return sec('val',
    v.annualized ? h('p', { class: 'msg warn' }, t('dl.annualized')) : null,
    h('p', { class: 'priv' }, t('dl.val.base', { ebitda: money(v.ebitdaAnnual), e: money(v.earnings), unit: ul }),
      v.shares ? ' ' + t('dl.val.shares', { n: Math.round(v.shares).toLocaleString('vi-VN') }) : ' ' + t('dl.val.noShares')),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t' }, h('thead', {}, head), h('tbody', {}, rows))),
    football(v, money, ul));
}

/** "Football field": mỗi phương pháp một thanh từ mức thấp đến mức cao, vạch ở mức giữa. */
function football(v, money, ul) {
  const ms = v.methods;
  if (!ms.length) return null;
  const all = ms.flatMap((m) => m.equity);
  const lo = Math.min(0, ...all), hi = Math.max(...all);
  if (!(hi > lo)) return null;
  const x = (n) => `${((n - lo) / (hi - lo)) * 100}%`;
  return h('div', { class: 'ff', role: 'img', 'aria-label': t('dl.ff') },
    h('h4', {}, t('dl.ff'), h('small', { class: 'priv' }, ` (${ul})`)),
    ms.map((m) => h('div', { class: 'ff-row' },
      h('span', { class: 'ff-lbl' }, t(`dl.m.${m.key}`)),
      h('div', { class: 'ff-track' },
        lo < 0 ? h('i', { class: 'ff-zero', style: { left: x(0) } }) : null,
        h('i', { class: 'ff-bar', style: { left: x(m.equity[0]), width: `calc(${x(m.equity[2])} - ${x(m.equity[0])})` } }),
        h('i', { class: 'ff-mid', style: { left: x(m.equity[1]) } })),
      h('span', { class: 'ff-v' }, `${money(m.equity[0])} – ${money(m.equity[2])}`))));
}

function capacity(a, inp, save, money) {
  const c = a.capacity;
  const o = h('input', { type: 'number', step: '0.1', min: '0.5', class: 'dl-mult', value: String(inp.targetLev), onchange: (e) => save({ targetLev: +e.target.value }) });
  if (!c) return sec('cap', h('label', { class: 'dl-lev' }, t('dl.cap.target'), ' ', o), h('p', { class: 'msg' }, t('dl.cap.none')));
  const tone = c.headroom === null ? '' : c.headroom >= 0 ? 'em' : 'red';
  return sec('cap',
    h('label', { class: 'dl-lev' }, t('dl.cap.target'), ' ', o),
    h('div', { class: 'dl-cards' },
      h('div', { class: 'hbox' }, h('span', { class: 'hlbl' }, t('dl.cap.lev')), h('b', {}, lan(c.lev))),
      h('div', { class: 'hbox' }, h('span', { class: 'hlbl' }, t('dl.cap.max')), h('b', {}, money(c.maxNet))),
      h('div', { class: `hbox ${tone}` }, h('span', { class: 'hlbl' }, t('dl.cap.room')), h('b', {}, money(c.headroom))),
      h('div', { class: `hbox ${c.dscr === null ? '' : c.dscr >= 1.2 ? 'em' : 'red'}` }, h('span', { class: 'hlbl' }, t('dl.cap.dscr')), h('b', {}, lan(c.dscr)),
        h('small', { class: 'priv', style: { marginTop: '2px' } }, t('dl.cap.dscr.hint')))));
}
