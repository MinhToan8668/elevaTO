// Bước 4 (phần rà soát): nguồn dữ liệu, kết quả kiểm tra từng kỳ, bảng số sửa được, tick dòng cần xuất.

import { h, mount, $, fmt, toast, keepFocus } from './dom.js';
import { watch, canUseModel } from './store.js';
import { statementRows, periodLabel } from '../core/table.js';
import { parseVN } from '../core/numbers.js';
import { item } from '../core/statements.js';
import { renderNotes, renderModel } from './notes.js';
import { renderCharts } from './charts.js';
import { t, unitLabel, chartLabel } from '../i18n.js';

export const UNITS = [1, 1e3, 1e6, 1e9];
/** [bội số, nhãn] theo ngôn ngữ đang chọn — gọi lúc vẽ, không giữ sẵn. */
export const unitOptions = () => UNITS.map((v) => [v, unitLabel(v)]);
const ALL_TABS = ['BS', 'IS', 'CF', 'CHART', 'TM', 'MODEL'];
// Tab xem trước model chỉ dành cho học viên / giảng viên.
let TABS = ALL_TABS;
const ui = { tab: 'BS', showEmpty: false, focus: null, nextEdit: null };

export function initReview(store, ctx) {
  watch(store, ['sources', 'edits', 'lang'], () => renderSources(store));
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'segmentMap', 'segmentNames', 'user', 'lang'], () => renderReview(store, ctx));
}

// ─── Nguồn dữ liệu ─────────────────────────────────────────

function renderSources(store) {
  const s = store.get();
  const { ds, errors } = store.data();
  const box = $('#sources');
  if (!s.sources.length) { mount(box, h('p', { class: 'empty' }, t('src.empty'))); return; }
  const setMeta = (id, patch) => store.set((st) => ({ sources: st.sources.map((x) => (x.id === id ? { ...x, meta: { ...x.meta, ...patch } } : x)) }));
  const rows = s.sources.map((src) => {
    const err = errors.find((e) => e.id === src.id);
    const file = src.ext?.file || src.file;
    const f = ds.files.find((x) => x.file === file);
    const periodTxt = src.kind === 'period' ? src.period.id : f ? f.period : '—';
    const cur = { ...(src.ext?.meta || {}), ...(src.meta || {}) };
    const dateIn = src.kind === 'ext' ? h('input', { type: 'date', value: isoDate(cur.ngay_ket_thuc), 'aria-label': t('src.date.aria', { file }),
      onchange: (e) => setMeta(src.id, { ngay_ket_thuc: e.target.value }) }) : null;
    const monIn = src.kind === 'ext' ? h('select', { 'aria-label': t('src.months.aria', { file }), onchange: (e) => setMeta(src.id, { so_thang: Number(e.target.value) || undefined }) },
      h('option', { value: '' }, t('src.months.auto')),
      [3, 6, 9, 12].map((m) => h('option', { value: String(m), selected: Number(cur.so_thang) === m }, t('src.months', { n: m })))) : null;
    return h('tr', {},
      h('td', {}, file, err ? h('div', { class: 'tag red' }, err.message) : null),
      h('td', {}, periodTxt),
      h('td', {}, dateIn, ' ', monIn),
      h('td', {}, h('button', { class: 'btn ghost sm', onclick: () => {
        if (!confirm(t('src.dropAsk', { file }))) return;
        store.set((st) => {
          const sources = st.sources.filter((x) => x.id !== src.id);
          const stillHas = (jobId) => sources.some((x) => x.jobId === jobId);
          // File PDF/ảnh quay về "chưa trích xuất" để trích lại được; file Excel không còn số nào thì bỏ khỏi danh sách.
          const jobs = st.jobs.filter((j) => !(j.id === src.jobId && j.kind === 'xls' && !stillHas(j.id)))
            .map((j) => (j.id === src.jobId && j.status === 'done' && !stillHas(j.id) ? { ...j, status: 'ready' } : j));
          return { sources, jobs };
        });
      } }, t('src.drop'))));
  });
  const warn = ds.warnings.length ? h('details', { class: 'msg warn' }, h('summary', {}, t('src.warn', { n: ds.warnings.length })), h('ul', {}, ds.warnings.map((w) => h('li', {}, w)))) : null;
  const conf = ds.conflicts.length ? h('details', { class: 'msg warn' }, h('summary', {}, t('src.conflict', { n: ds.conflicts.length })),
    h('ul', {}, ds.conflicts.slice(0, 200).map((c) => h('li', {}, t('src.conflictRow', {
      period: c.period, label: labelOf(c.key), kept: fmt(c.kept, 1e6), keptFile: c.keptFile, other: fmt(c.other, 1e6), otherFile: c.otherFile }))))) : null;
  keepFocus(box, () => mount(box,
    h('details', { class: 'pmap', open: errors.length > 0 || box.querySelector('details.pmap')?.open },
      h('summary', {}, h('h3', {}, t('src.h', { n: s.sources.length, k: ds.periods.length, ids: ds.periods.map((p) => p.id).join(', ') || '—' }))),
      h('table', { class: 'k' }, h('thead', {}, h('tr', {}, h('th', {}, t('src.file')), h('th', {}, t('src.period')), h('th', {}, t('src.date')), h('th', {}, ''))), h('tbody', {}, rows)),
      s.edits.length ? h('p', { class: 'priv' }, t('src.edits', { n: s.edits.length }), h('button', { class: 'btn ghost sm', onclick: () => { if (confirm(t('src.editsAsk'))) store.set({ edits: [] }); } }, t('src.editsDrop'))) : null),
    warn, conf));
}
const isoDate = (d) => { const s = String(d || ''); const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s) || /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return ''; return m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const labelOf = (key) => { const [st, code] = key.split(':'); const it = item(st, code); return it ? `${code} ${chartLabel(key, it.label)}` : key; };

// ─── Bảng rà soát ──────────────────────────────────────────

function renderReview(store, ctx) {
  TABS = canUseModel(store.get().user) ? ALL_TABS : ALL_TABS.filter((k) => k !== 'MODEL');
  if (!TABS.includes(ui.tab)) ui.tab = 'BS';
  const s = store.get();
  const { ds, checks } = store.data();
  const box = $('#review');
  document.querySelector('.rail a[data-step="5"]').classList.toggle('done', ds.periods.length > 0);
  if (!ds.periods.length) { mount(box); return; }
  // Đang ở tab báo cáo không có số (ví dụ file Excel chỉ có KQKD) → chuyển sang báo cáo đầu tiên có số.
  const hasSt = (st) => ds.periods.some((p) => Object.keys(ds.values[p.id] || {}).some((k) => k.startsWith(`${st}:`)));
  if (['BS', 'IS', 'CF'].includes(ui.tab) && !hasSt(ui.tab)) ui.tab = ['BS', 'IS', 'CF'].find(hasSt) || ui.tab;

  const pills = ds.periods.map((p) => {
    const iss = checks[p.id] || [];
    return h('button', { class: `pc ${iss.length ? 'bad' : 'ok'}`, title: iss.map((i) => t('rv.badTip', { label: i.label, d: fmt(i.diff, 1) })).join('\n'),
      onclick: () => { if (!iss.length) return; ui.tab = iss[0].key.split(':')[0]; ui.focus = { period: p.id, key: iss[0].key }; renderReview(store, ctx); } },
    iss.length ? t('rv.bad', { p: periodLabel(p), n: iss.length }) : t('rv.ok', { p: periodLabel(p) }));
  });
  const go = (k) => { ui.tab = k; renderReview(store, ctx); $(`#tab-${k}`)?.focus(); };
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('tab.aria'), onkeydown: (e) => {
    const i = TABS.indexOf(ui.tab);
    if (e.key === 'ArrowRight') go(TABS[(i + 1) % TABS.length]);
    if (e.key === 'ArrowLeft') go(TABS[(i + TABS.length - 1) % TABS.length]);
  } }, TABS.map((k) =>
    h('button', { role: 'tab', id: `tab-${k}`, 'aria-controls': 'tabpanel', 'aria-selected': String(ui.tab === k), tabindex: ui.tab === k ? '0' : '-1', onclick: () => go(k) }, t(`tab.${k}`))));
  const unitSel = h('select', { class: 'inp', style: { width: 'auto' }, 'aria-label': t('rv.unit.aria'), onchange: (e) => store.set({ unit: Number(e.target.value) }) },
    unitOptions().map(([v, l]) => h('option', { value: String(v), selected: s.unit === v }, l)));
  const bar = h('div', { class: 'bar' }, tabs, h('span', { class: 'sp' }),
    ['BS', 'IS', 'CF'].includes(ui.tab) ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: ui.showEmpty, onchange: (e) => { ui.showEmpty = e.target.checked; renderReview(store, ctx); } }), t('rv.showEmpty')) : null,
    unitSel);

  let body;
  if (ui.tab === 'CHART') body = renderCharts(ds, s.unit, unitLabel(s.unit));
  else if (ui.tab === 'TM') body = renderNotes(store);
  else if (ui.tab === 'MODEL') body = renderModel(store);
  else body = [crossIssues(ds, checks, ui.tab), grid(store, ui.tab), legend()];
  keepFocus(box, () => mount(box, h('div', { class: 'sum' }, pills), bar,
    h('div', { id: 'tabpanel', role: 'tabpanel', 'aria-labelledby': `tab-${ui.tab}` }, body)));
  // Đang sửa ô A mà bấm sang ô B: ô A lưu → bảng vẽ lại → mở tiếp ô B (không mất cú bấm).
  if (ui.nextEdit) {
    const n = ui.nextEdit; ui.nextEdit = null;
    box.querySelector(`td[data-k="${CSS.escape(n.key)}"][data-p="${CSS.escape(n.period)}"]`)?._edit?.();
  }

  if (ui.focus) {
    const f = ui.focus; ui.focus = null;
    const cell = box.querySelector(`td[data-k="${CSS.escape(f.key)}"][data-p="${CSS.escape(f.period)}"]`);
    cell?.scrollIntoView({ block: 'center' });
    cell?.focus();
  }
}

function crossIssues(ds, checks, st) {
  const list = ds.periods.flatMap((p) => (checks[p.id] || []).filter((i) => i.kind === 'cross' && i.key.includes(`${st}:`)).map((i) => ({ p, i })));
  if (!list.length) return null;
  return h('div', { class: 'msg err' }, h('b', {}, t('rv.cross')),
    h('ul', {}, list.map(({ p, i }) => h('li', {}, t('rv.crossRow', { p: periodLabel(p), label: i.label, reported: fmt(i.reported, 1e6), computed: fmt(i.computed, 1e6), d: fmt(i.diff, 1) })))));
}

function legend() {
  return h('div', { class: 'legend' },
    h('span', {}, h('i', { style: { background: 'var(--text)' } }), t('rv.lg.ai')),
    h('span', {}, h('i', { style: { background: 'var(--muted2)' } }), t('rv.lg.calc')),
    h('span', {}, h('i', { style: { background: 'var(--blue)' } }), t('rv.lg.man')),
    h('span', {}, h('i', { style: { background: 'var(--red)' } }), t('rv.lg.bad')),
    h('span', {}, t('rv.lg.tip')));
}

function grid(store, st) {
  const s = store.get();
  const { ds, checks } = store.data();
  const rows = statementRows(ds, st, { showEmpty: ui.showEmpty });
  // Mã không có trong mẫu 2026 (ví dụ LCTT trực tiếp T01…) vẫn hiện để người dùng thấy và dùng.
  const extra = new Set();
  for (const p of ds.periods) for (const k of Object.keys(ds.values[p.id] || {})) if (k.startsWith(`${st}:`) && !item(st, k.slice(3))) extra.add(k);
  for (const k of [...extra].sort()) rows.push({ key: k, code: k.slice(3), label: t('rv.outside'), lvl: 2, kind: 'input', values: Object.fromEntries(ds.periods.map((p) => [p.id, ds.values[p.id]?.[k]])) });

  const allKeys = allValueKeys(store);
  const ticked = s.ticks ? new Set(s.ticks) : new Set(allKeys);
  const setTicks = (next) => store.set({ ticks: next.size === allKeys.length && allKeys.every((k) => next.has(k)) ? null : [...next] });
  const bad = {};
  for (const p of ds.periods) for (const i of checks[p.id] || []) if (i.kind === 'sum') (bad[p.id] ||= {})[i.key] = i;

  const stKeys = rows.map((r) => r.key);
  const allHere = stKeys.every((k) => ticked.has(k));
  const head = h('tr', {},
    h('th', {}, h('input', { type: 'checkbox', checked: allHere, 'aria-label': t('rv.tickAll'), onchange: (e) => {
      const next = new Set(ticked); stKeys.forEach((k) => (e.target.checked ? next.add(k) : next.delete(k))); setTicks(next);
    } })),
    h('th', {}, t('rv.code')), h('th', {}, t('rv.label')), ds.periods.map((p) => h('th', {}, periodLabel(p))));
  const body = rows.map((r) => h('tr', { class: `lv${Math.min(r.lvl, 4)}${r.kind === 'memo' ? ' memo' : ''}` },
    h('td', { class: 't' }, h('input', { type: 'checkbox', checked: ticked.has(r.key), 'aria-label': t('rv.tick', { code: r.code }), onchange: (e) => {
      const next = new Set(ticked); if (e.target.checked) next.add(r.key); else next.delete(r.key); setTicks(next);
    } })),
    h('td', { class: 'c' }, r.code), h('td', { class: 'l' }, r.label),
    ds.periods.map((p) => cell(store, p, r, bad[p.id]?.[r.key]))));
  return h('div', { class: 'gridwrap' }, h('table', { class: 'g' }, h('thead', {}, head), h('tbody', {}, body)));
}

export function allValueKeys(store) {
  const { ds } = store.data();
  const keys = new Set();
  for (const st of ['BS', 'IS', 'CF']) for (const r of statementRows(ds, st)) keys.add(r.key);
  return [...keys];
}

function cell(store, p, r, issue) {
  const s = store.get();
  const { ds } = store.data();
  const v = r.values[p.id];
  const reported = Number.isFinite(ds.values[p.id]?.[r.key]);
  const src = ds.src[p.id]?.[r.key];
  const cls = ['v', src?.manual ? 'man' : '', !reported && Number.isFinite(v) ? 'calc' : '', issue ? 'bad' : ''].filter(Boolean).join(' ');
  const title = issue ? t('rv.cellBad', { reported: fmt(issue.reported, 1), computed: fmt(issue.computed, 1), d: fmt(issue.diff, 1) })
    : src?.manual ? t('rv.cellMan') : src ? t('rv.cellFrom', { file: src.file, col: t(src.col === 'cur' ? 'rv.colCur' : 'rv.colPrev') }) : Number.isFinite(v) ? t('rv.cellCalc') : '';
  const td = h('td', { class: cls, tabindex: '0', title, dataset: { k: r.key, p: p.id } }, fmt(v, s.unit));
  const edit = () => {
    ui.nextEdit = null;
    if (td.querySelector('input')) return;
    const initial = reported ? fmt(ds.values[p.id][r.key], s.unit) : '';
    const inp = h('input', { class: 'ed', value: initial, 'aria-label': t('rv.edit.aria', { code: r.code, p: periodLabel(p) }) });
    let done = false;
    const commit = (save) => {
      if (done) return; done = true;
      const txt = inp.value.trim();
      // Không đổi gì thì không ghi: số hiển thị đã làm tròn theo đơn vị, ghi lại sẽ mất phần lẻ.
      if (!save || txt === initial) { td.textContent = fmt(v, s.unit); return; }
      const n = txt === '' ? null : parseVN(txt);
      if (txt !== '' && n === null) { toast(t('rv.notNumber', { txt })); td.textContent = fmt(v, s.unit); return; }
      const nv = n === null ? null : Math.round(n * s.unit);
      store.set((st) => ({ edits: [...st.edits.filter((e) => !(e.period === p.id && e.key === r.key)), { period: p.id, key: r.key, v: nv }] }));
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
    td.replaceChildren(inp);
    inp.focus(); inp.select();
  };
  td._edit = edit;
  td.addEventListener('mousedown', () => { if (!td.querySelector('input') && document.activeElement?.classList.contains('ed')) ui.nextEdit = { key: r.key, period: p.id }; });
  td.addEventListener('click', edit);
  td.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); edit(); } });
  return td;
}
