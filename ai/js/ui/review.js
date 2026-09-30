// Bước 5 (phần rà soát): nguồn dữ liệu, kết quả kiểm tra từng kỳ, bảng số sửa được, tick dòng cần xuất.

import { h, mount, $, fmt, toast, keepFocus } from './dom.js';
import { watch } from './store.js';
import { statementRows, periodLabel } from '../core/table.js';
import { parseVN } from '../core/numbers.js';
import { item } from '../core/statements.js';
import { renderNotes, renderModel } from './notes.js';

export const UNITS = [[1, 'đồng'], [1e3, 'nghìn đồng'], [1e6, 'triệu đồng'], [1e9, 'tỷ đồng']];
const TABS = [['BS', 'Tình hình tài chính'], ['IS', 'Kết quả KD'], ['CF', 'Lưu chuyển tiền'], ['TM', 'Thuyết minh'], ['MODEL', 'Xem trước model']];
const ui = { tab: 'BS', showEmpty: false, focus: null, nextEdit: null };

export function initReview(store, ctx) {
  watch(store, ['sources', 'edits'], () => renderSources(store));
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'segmentMap', 'segmentNames'], () => renderReview(store, ctx));
}

// ─── Nguồn dữ liệu ─────────────────────────────────────────

function renderSources(store) {
  const s = store.get();
  const { ds, errors } = store.data();
  const box = $('#sources');
  if (!s.sources.length) { mount(box, h('p', { class: 'msg warn' }, 'Chưa có dữ liệu. Trích xuất ở bước 4, tải file Excel ở bước 2, hoặc mở lại phiên đã lưu.')); return; }
  const setMeta = (id, patch) => store.set((st) => ({ sources: st.sources.map((x) => (x.id === id ? { ...x, meta: { ...x.meta, ...patch } } : x)) }));
  const rows = s.sources.map((src) => {
    const err = errors.find((e) => e.id === src.id);
    const file = src.ext?.file || src.file;
    const f = ds.files.find((x) => x.file === file);
    const periodTxt = src.kind === 'period' ? src.period.id : f ? f.period : '—';
    const cur = { ...(src.ext?.meta || {}), ...(src.meta || {}) };
    const dateIn = src.kind === 'ext' ? h('input', { type: 'date', value: isoDate(cur.ngay_ket_thuc), 'aria-label': `Ngày kết thúc kỳ của ${file}`,
      onchange: (e) => setMeta(src.id, { ngay_ket_thuc: e.target.value }) }) : null;
    const monIn = src.kind === 'ext' ? h('select', { 'aria-label': `Số tháng của ${file}`, onchange: (e) => setMeta(src.id, { so_thang: Number(e.target.value) || undefined }) },
      h('option', { value: '' }, 'tự đoán'),
      [3, 6, 9, 12].map((m) => h('option', { value: String(m), selected: Number(cur.so_thang) === m }, `${m} tháng`))) : null;
    return h('tr', {},
      h('td', {}, file, err ? h('div', { class: 'tag red' }, err.message) : null),
      h('td', {}, periodTxt),
      h('td', {}, dateIn, ' ', monIn),
      h('td', {}, h('button', { class: 'btn ghost sm', onclick: () => {
        if (!confirm(`Bỏ dữ liệu của ${file}?`)) return;
        store.set((st) => {
          const sources = st.sources.filter((x) => x.id !== src.id);
          const stillHas = (jobId) => sources.some((x) => x.jobId === jobId);
          // File PDF/ảnh quay về "chưa trích xuất" để trích lại được; file Excel không còn số nào thì bỏ khỏi danh sách.
          const jobs = st.jobs.filter((j) => !(j.id === src.jobId && j.kind === 'xls' && !stillHas(j.id)))
            .map((j) => (j.id === src.jobId && j.status === 'done' && !stillHas(j.id) ? { ...j, status: 'ready' } : j));
          return { sources, jobs };
        });
      } }, 'Bỏ')));
  });
  const warn = ds.warnings.length ? h('details', { class: 'msg warn' }, h('summary', {}, `${ds.warnings.length} lưu ý khi đọc`), h('ul', {}, ds.warnings.map((w) => h('li', {}, w)))) : null;
  const conf = ds.conflicts.length ? h('details', { class: 'msg warn' }, h('summary', {}, `${ds.conflicts.length} số khác nhau giữa các báo cáo (đã dùng số của báo cáo mới hơn)`),
    h('ul', {}, ds.conflicts.slice(0, 200).map((c) => h('li', {}, `${c.period} · ${labelOf(c.key)}: giữ ${fmt(c.kept, 1e6)} tr (${c.keptFile}), bỏ ${fmt(c.other, 1e6)} tr (${c.otherFile})`)))) : null;
  keepFocus(box, () => mount(box,
    h('details', { class: 'pmap', open: errors.length > 0 || box.querySelector('details.pmap')?.open },
      h('summary', {}, h('h3', {}, `Nguồn dữ liệu (${s.sources.length}) · ${ds.periods.length} kỳ: ${ds.periods.map((p) => p.id).join(', ') || '—'}`)),
      h('table', { class: 'k' }, h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Kỳ'), h('th', {}, 'Ngày kết thúc / số tháng (sửa nếu sai)'), h('th', {}, ''))), h('tbody', {}, rows)),
      s.edits.length ? h('p', { class: 'priv' }, `${s.edits.length} ô đã sửa tay. `, h('button', { class: 'btn ghost sm', onclick: () => { if (confirm('Bỏ mọi số sửa tay?')) store.set({ edits: [] }); } }, 'Bỏ hết số sửa tay')) : null),
    warn, conf));
}
const isoDate = (d) => { const s = String(d || ''); const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s) || /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return ''; return m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const labelOf = (key) => { const [st, code] = key.split(':'); const it = item(st, code); return it ? `${code} ${it.label}` : key; };

// ─── Bảng rà soát ──────────────────────────────────────────

function renderReview(store, ctx) {
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
    return h('button', { class: `pc ${iss.length ? 'bad' : 'ok'}`, title: iss.map((i) => `${i.label}: lệch ${fmt(i.diff, 1)} đ`).join('\n'),
      onclick: () => { if (!iss.length) return; ui.tab = iss[0].key.split(':')[0]; ui.focus = { period: p.id, key: iss[0].key }; renderReview(store, ctx); } },
    `${periodLabel(p)}: ${iss.length ? `${iss.length} chỗ lệch` : '✓ khớp'}`);
  });
  const go = (k) => { ui.tab = k; renderReview(store, ctx); $(`#tab-${k}`)?.focus(); };
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Báo cáo', onkeydown: (e) => {
    const i = TABS.findIndex(([k]) => k === ui.tab);
    if (e.key === 'ArrowRight') go(TABS[(i + 1) % TABS.length][0]);
    if (e.key === 'ArrowLeft') go(TABS[(i + TABS.length - 1) % TABS.length][0]);
  } }, TABS.map(([k, label]) =>
    h('button', { role: 'tab', id: `tab-${k}`, 'aria-controls': 'tabpanel', 'aria-selected': String(ui.tab === k), tabindex: ui.tab === k ? '0' : '-1', onclick: () => go(k) }, label)));
  const unitSel = h('select', { class: 'inp', style: { width: 'auto' }, 'aria-label': 'Đơn vị hiển thị', onchange: (e) => store.set({ unit: Number(e.target.value) }) },
    UNITS.map(([v, l]) => h('option', { value: String(v), selected: s.unit === v }, l)));
  const bar = h('div', { class: 'bar' }, tabs, h('span', { class: 'sp' }),
    ['BS', 'IS', 'CF'].includes(ui.tab) ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: ui.showEmpty, onchange: (e) => { ui.showEmpty = e.target.checked; renderReview(store, ctx); } }), 'Hiện cả dòng trống') : null,
    unitSel);

  let body;
  if (ui.tab === 'TM') body = renderNotes(store);
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
  return h('div', { class: 'msg err' }, h('b', {}, 'Đối chiếu chưa khớp:'),
    h('ul', {}, list.map(({ p, i }) => h('li', {}, `${periodLabel(p)} — ${i.label}: ${fmt(i.reported, 1e6)} so với ${fmt(i.computed, 1e6)} triệu (lệch ${fmt(i.diff, 1)} đ)`))));
}

function legend() {
  return h('div', { class: 'legend' },
    h('span', {}, h('i', { style: { background: 'var(--text)' } }), 'số AI đọc / file'),
    h('span', {}, h('i', { style: { background: 'var(--muted2)' } }), 'máy tự cộng (BCTC không in)'),
    h('span', {}, h('i', { style: { background: 'var(--blue)' } }), 'số sửa tay'),
    h('span', {}, h('i', { style: { background: 'var(--red)' } }), 'không khớp tổng các dòng con'),
    h('span', {}, 'Nhập số: 1.234,5 hoặc (1.234) cho số âm · để trống rồi Enter để xoá ô'));
}

function grid(store, st) {
  const s = store.get();
  const { ds, checks } = store.data();
  const rows = statementRows(ds, st, { showEmpty: ui.showEmpty });
  // Mã không có trong mẫu 2026 (ví dụ LCTT trực tiếp T01…) vẫn hiện để người dùng thấy và dùng.
  const extra = new Set();
  for (const p of ds.periods) for (const k of Object.keys(ds.values[p.id] || {})) if (k.startsWith(`${st}:`) && !item(st, k.slice(3))) extra.add(k);
  for (const k of [...extra].sort()) rows.push({ key: k, code: k.slice(3), label: 'Chỉ tiêu ngoài mẫu (LCTT trực tiếp…)', lvl: 2, kind: 'input', values: Object.fromEntries(ds.periods.map((p) => [p.id, ds.values[p.id]?.[k]])) });

  const allKeys = allValueKeys(store);
  const ticked = s.ticks ? new Set(s.ticks) : new Set(allKeys);
  const setTicks = (next) => store.set({ ticks: next.size === allKeys.length && allKeys.every((k) => next.has(k)) ? null : [...next] });
  const bad = {};
  for (const p of ds.periods) for (const i of checks[p.id] || []) if (i.kind === 'sum') (bad[p.id] ||= {})[i.key] = i;

  const stKeys = rows.map((r) => r.key);
  const allHere = stKeys.every((k) => ticked.has(k));
  const head = h('tr', {},
    h('th', {}, h('input', { type: 'checkbox', checked: allHere, 'aria-label': 'Tick cả bảng', onchange: (e) => {
      const next = new Set(ticked); stKeys.forEach((k) => (e.target.checked ? next.add(k) : next.delete(k))); setTicks(next);
    } })),
    h('th', {}, 'Mã'), h('th', {}, 'Chỉ tiêu'), ds.periods.map((p) => h('th', {}, periodLabel(p))));
  const body = rows.map((r) => h('tr', { class: `lv${Math.min(r.lvl, 4)}${r.kind === 'memo' ? ' memo' : ''}` },
    h('td', { class: 't' }, h('input', { type: 'checkbox', checked: ticked.has(r.key), 'aria-label': `Chọn ${r.code}`, onchange: (e) => {
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
  const title = issue ? `In trên BCTC: ${fmt(issue.reported, 1)} · cộng dòng con: ${fmt(issue.computed, 1)} · lệch ${fmt(issue.diff, 1)} đ`
    : src?.manual ? 'Số sửa tay' : src ? `Từ ${src.file} (cột ${src.col === 'cur' ? 'kỳ này' : 'kỳ trước'})` : Number.isFinite(v) ? 'Máy tự cộng từ các dòng con' : '';
  const td = h('td', { class: cls, tabindex: '0', title, dataset: { k: r.key, p: p.id } }, fmt(v, s.unit));
  const edit = () => {
    ui.nextEdit = null;
    if (td.querySelector('input')) return;
    const initial = reported ? fmt(ds.values[p.id][r.key], s.unit) : '';
    const inp = h('input', { class: 'ed', value: initial, 'aria-label': `Sửa ${r.code} ${periodLabel(p)}` });
    let done = false;
    const commit = (save) => {
      if (done) return; done = true;
      const txt = inp.value.trim();
      // Không đổi gì thì không ghi: số hiển thị đã làm tròn theo đơn vị, ghi lại sẽ mất phần lẻ.
      if (!save || txt === initial) { td.textContent = fmt(v, s.unit); return; }
      const n = txt === '' ? null : parseVN(txt);
      if (txt !== '' && n === null) { toast(`"${txt}" không phải số`); td.textContent = fmt(v, s.unit); return; }
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
