// Bước 4, tab "Thuyết minh" và "Xem trước model": số AI đọc từ thuyết minh, ghép mảng kinh doanh vào
// 5 ô của model, và bảng xem trước đúng các ô sẽ điền vào sheet 03.Input_FS.

import { h, fmt } from './dom.js';
import { periodLabel } from '../core/table.js';
import { buildModel, MODEL_ROWS, SEGMENT_SLOTS } from '../targets/model.js';
import { t, unitLabel, modelLabel, modelGroup } from '../i18n.js';

const M = 1e6;
const FA_KEYS = ['buildings', 'machinery', 'transport', 'office', 'other', 'land', 'software'];
const faName = (cls) => (FA_KEYS.includes(cls) ? t(`tm.fa.${cls}`) : cls);
const SRC_TONE = { bctc: 'em', tm: 'em', lctt: 'gold', uoc: 'gold', md: '' };

/** Tên mảng theo thứ tự xuất hiện qua các năm; mảng chưa được người dùng gán thì lấy ô theo thứ tự (quá 5 dồn ô 5). */
export function effectiveSegmentMap(ds, userMap = {}) {
  const names = [];
  for (const p of ds.periods) for (const sg of ds.notes[p.id]?.segments || []) if (!names.includes(sg.name)) names.push(sg.name);
  const map = {};
  names.forEach((n, i) => { map[n] = Number.isInteger(userMap[n]) ? userMap[n] : Math.min(i, SEGMENT_SLOTS - 1); });
  return { names, map };
}

/** Tên 5 ô mảng để ghi vào model: người dùng nhập, không thì tên mảng đầu tiên gán vào ô đó. */
export function effectiveSegmentNames(ds, userMap, userNames = []) {
  const { names, map } = effectiveSegmentMap(ds, userMap);
  return Array.from({ length: SEGMENT_SLOTS }, (_, i) => userNames[i] || names.find((n) => map[n] === i) || '');
}

export function renderNotes(store) {
  const s = store.get();
  const { ds } = store.data();
  const withNotes = ds.periods.filter((p) => ds.notes[p.id] && Object.keys(ds.notes[p.id]).length);
  if (!withNotes.length) return h('p', { class: 'msg warn' }, t('tm.none'));
  return [segmentsCard(store, s, ds), h('div', { class: 'cards', style: { marginTop: '14px' } }, withNotes.map((p) => periodCard(p, ds.notes[p.id])))];
}

function segmentsCard(store, s, ds) {
  const { names, map } = effectiveSegmentMap(ds, s.segmentMap);
  if (!names.length) return null;
  const years = ds.periods.filter((p) => ds.notes[p.id]?.segments?.length);
  const slotNames = effectiveSegmentNames(ds, s.segmentMap, s.segmentNames);
  const rows = names.map((n) => h('tr', {},
    h('td', {}, n),
    years.map((p) => { const sg = ds.notes[p.id].segments.find((x) => x.name === n); return h('td', {}, sg ? fmt(sg.revenue, M) : ''); }),
    h('td', {}, h('select', { 'aria-label': t('tm.seg.slot.aria', { name: n }), onchange: (e) => store.set({ segmentMap: { ...store.get().segmentMap, [n]: Number(e.target.value) } }) },
      Array.from({ length: SEGMENT_SLOTS }, (_, i) => h('option', { value: String(i), selected: map[n] === i }, t('tm.seg.slotN', { i: i + 1 })))))));
  const nameInputs = h('div', { class: 'groups' }, slotNames.map((n, i) => h('label', { class: 'grp' }, h('span', {}, t('tm.seg.name', { i: i + 1 })),
    h('input', { value: s.segmentNames[i] || '', placeholder: n || t('tm.seg.empty'), style: { width: '180px', fontFamily: 'inherit' }, onchange: (e) => {
      const next = [...store.get().segmentNames]; next[i] = e.target.value.trim().slice(0, 60); store.set({ segmentNames: next });
    } }))));
  return h('div', { class: 'cardx' },
    h('h3', {}, t('tm.seg.h')),
    h('p', {}, t('tm.seg.lead')),
    h('table', { class: 'k' }, h('thead', {}, h('tr', {}, h('th', {}, t('tm.seg.col', { unit: unitLabel(M) })), years.map((p) => h('th', {}, periodLabel(p))), h('th', {}, t('tm.seg.slot')))), h('tbody', {}, rows)),
    nameInputs);
}

function periodCard(p, n) {
  const parts = [h('h3', {}, t('tm.card', { p: periodLabel(p) }))];
  const kv = (title, pairs) => {
    const rows = pairs.filter(([, v]) => v !== undefined && v !== null);
    if (!rows.length) return;
    parts.push(h('table', { class: 'k' }, h('thead', {}, h('tr', {}, h('th', { colspan: '2' }, title))),
      h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, typeof v === 'number' ? fmt(v, M) : String(v)))))));
  };
  if (n.fixedAssets) {
    const all = [...(n.fixedAssets.tangible || []).map((x) => ({ ...x, t: t('tm.fa.tangible') })), ...(n.fixedAssets.intangible || []).map((x) => ({ ...x, t: t('tm.fa.intangible') }))];
    parts.push(h('table', { class: 'k' },
      h('thead', {}, h('tr', {}, h('th', {}, t('tm.fa', { unit: unitLabel(M) })), h('th', {}, t('tm.fa.cost')), h('th', {}, t('tm.fa.acc')), h('th', {}, t('tm.fa.add')), h('th', {}, t('tm.fa.dep')))),
      h('tbody', {}, all.map((x) => h('tr', {}, h('td', { title: x.name }, `${x.t} · ${faName(x.cls)}`),
        h('td', {}, fmt(x.cost, M)), h('td', {}, fmt(x.accDep, M)), h('td', {}, fmt(x.additions, M)), h('td', {}, fmt(x.depreciation, M)))))));
  }
  const u = unitLabel(M);
  if (n.debt) kv(t('tm.debt', { unit: u }), ['stProceeds', 'stRepay', 'ltProceeds', 'ltRepay'].map((k) => [t(`tm.debt.${k}`), n.debt[k]]));
  if (n.equity) kv(t('tm.equity', { unit: u }), Object.entries(n.equity));
  if (n.goodwill) kv(t('tm.gw', { unit: u }), ['cost', 'accAmort', 'additions', 'amortization'].map((k) => [t(`tm.gw.${k}`), n.goodwill[k]]));
  kv(t('tm.params'), [[t('tm.shares'), n.shares !== undefined ? n.shares.toLocaleString('vi-VN') : undefined], [t('tm.taxRate'), n.taxRate !== undefined ? `${Math.round(n.taxRate * 1000) / 10}%` : undefined]]);
  return h('div', { class: 'cardx' }, parts);
}

export function renderModel(store) {
  const s = store.get();
  const { ds } = store.data();
  const { map } = effectiveSegmentMap(ds, s.segmentMap);
  const built = buildModel(ds, { segmentMap: map });
  const years = Object.keys(built.byYear).map(Number).sort();
  if (!years.length) return h('p', { class: 'msg warn' }, t('md.needYear'));
  let group = '';
  const rows = [];
  for (const d of MODEL_ROWS) {
    if (!years.some((y) => built.byYear[y][d.row])) continue;
    if (d.group !== group) { group = d.group; rows.push(h('tr', { class: 'lv0' }, h('td', { colspan: String(years.length + 2) }, modelGroup(group)))); }
    rows.push(h('tr', {}, h('td', { class: 'c' }, String(d.row)), h('td', { class: 'l' }, modelLabel(d.row, d.label)),
      years.map((y) => {
        const c = built.byYear[y][d.row];
        if (!c) return h('td', { class: 'v' });
        const lbl = t(`md.src.${c.src}`), tone = SRC_TONE[c.src] ?? '';
        // Chữ trên nhãn lấy từ từ điển, KHÔNG cắt lbl[0] — tiếng Anh sẽ ra chữ khác với phần chú thích.
        const txt = d.row === 216 ? `${Math.round(c.v * 1000) / 10}%` : d.row >= 214 ? String(c.v) : fmt(c.v, 1);
        return h('td', { class: `v${tone === 'gold' ? ' est' : ''}`, title: lbl }, txt, ' ', h('span', { class: `tag ${tone}` }, t(`md.tag.${c.src}`)));
      })));
  }
  return [
    h('p', { class: 'priv' }, t('md.lead', { unit: unitLabel(M) })),
    built.warnings.length ? h('details', { class: 'msg warn' }, h('summary', {}, t('md.warn', { n: built.warnings.length })), h('ul', {}, built.warnings.map((w) => h('li', {}, w)))) : null,
    h('div', { class: 'gridwrap' }, h('table', { class: 'g' },
      h('thead', {}, h('tr', {}, h('th', {}, t('md.row')), h('th', {}, t('md.item')), years.map((y) => h('th', {}, String(y))))),
      h('tbody', {}, rows))),
  ];
}
