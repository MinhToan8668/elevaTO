// Bước 3: chọn gói dữ liệu / nhóm thuyết minh, chạy trích xuất từng file, hiện tiến độ.

import { h, mount, $, toast, keepFocus } from './dom.js';
import { PRESETS, NOTE_KEYS, uid, watch } from './store.js';
import { NOTE_TASKS } from '../core/prompts.js';
import { extractJob, planPicked, needsMap } from '../core/pipeline.js';
import { isSplittable, isFatal } from '../ai.js';

const HAS_PICK = (j) => (j.picked?.length || 0) > 0;
// Trang đã tick mà máy chưa biết loại (hay nhóm thuyết minh) → AI phải nhận trang trước (12 trang / lượt).
const unknownPicked = (j) => (j.picked || []).filter((p) => needsMap(j, p)).length;

export function initExtract(store, ctx) {
  watch(store, ['preset', 'noteGroups', 'running'], (s) => renderPick(s, store));
  watch(store, ['jobs', 'noteGroups', 'user', 'running'], (s) => renderRun(s, store, ctx));
}

function renderPick(s, store) {
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Gói dữ liệu' }, Object.entries(PRESETS).map(([k, p]) =>
    h('button', { class: 'preset', 'aria-pressed': String(s.preset === k), disabled: s.running, onclick: () => {
      store.set({ preset: k, noteGroups: p.notes ? [...p.notes] : s.noteGroups });
    } }, h('b', {}, p.label), h('small', {}, p.desc))));
  const notes = h('div', { class: 'notes-pick' },
    h('div', { class: 'chk', style: { gridColumn: '1 / -1' } }, h('b', {}, 'Luôn lấy: '), 'Tình hình tài chính · Kết quả kinh doanh · Lưu chuyển tiền tệ — kỳ này và kỳ trước.'),
    NOTE_KEYS.map((k) => h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: s.noteGroups.includes(k), disabled: s.running, onchange: (e) => {
        const set = new Set(store.get().noteGroups);
        if (e.target.checked) set.add(k); else set.delete(k);
        store.set({ preset: 'custom', noteGroups: NOTE_KEYS.filter((x) => set.has(x)) });
      } }),
      h('span', {}, NOTE_TASKS[k].label))));
  mount($('#pickBox'), presets, notes);
}

function renderRun(s, store, ctx) {
  const todo = s.jobs.filter((j) => j.kind !== 'xls' && j.status === 'ready');
  const calls = todo.reduce((n, j) => n + Math.ceil(unknownPicked(j) / 12) + 3 + (unknownPicked(j) ? s.noteGroups.length : s.noteGroups.filter((g) => j.notes?.[g]?.some((p) => j.picked?.includes(p))).length), 0);
  const q = s.user?.luot;
  const left = q && q.han ? Math.max(0, q.han - q.dung) : null;
  const noTable = todo.filter((j) => !HAS_PICK(j));
  let hint;
  if (!todo.length) hint = s.jobs.some((j) => j.status === 'done') ? 'Mọi file đã trích xuất. Đổi trang đã chọn ở bước 2 để làm lại một file.' : 'Tải file PDF / ảnh ở bước 1.';
  else hint = `${todo.length} file · khoảng ${calls} lượt AI${left !== null ? ` (còn ${left} lượt hôm nay)` : ''}. Mỗi file mất 1–3 phút.`;
  const runBtn = h('button', { class: 'btn', id: 'runBtn', disabled: s.running || !todo.length || !s.user || noTable.length === todo.length, onclick: () => run(store, ctx) },
    s.running ? 'Đang trích xuất…' : 'Trích xuất bằng AI');
  const stopBtn = s.running ? h('button', { class: 'btn ghost', id: 'stopBtn', onclick: () => { ctx.stop = true; toast('Sẽ dừng sau file đang làm.'); } }, 'Dừng') : null;
  document.querySelector('.rail a[data-step="4"]').classList.toggle('done', s.jobs.some((j) => j.status === 'done'));
  const row = $('#runRow');
  keepFocus(row, () => mount(row,
    h('div', { style: { flex: '0 0 auto', display: 'flex', gap: '10px' } }, runBtn, stopBtn),
    h('p', { class: 'priv', style: { flex: '1 1 300px', margin: 0 } }, hint,
      noTable.length ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, `${noTable.length} file chưa tick trang nào`) : null,
      left !== null && calls > left ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, 'không đủ lượt hôm nay') : null)));
}

async function run(store, ctx) {
  const box = $('#progress');
  const waitLine = h('li', { class: 'wait', hidden: true }, h('i'), h('span'));
  const client = ctx.client((sec, msg) => {
    waitLine.hidden = false;
    waitLine.lastChild.textContent = `${msg || 'Máy chủ đang bận'} — tự thử lại sau ${sec} giây`;
    setTimeout(() => { waitLine.hidden = true; }, sec * 1000);
  });
  if (!client) return toast('Đăng nhập để trích xuất bằng AI');
  const s = store.get();
  const todo = s.jobs.filter((j) => j.kind !== 'xls' && j.status === 'ready' && HAS_PICK(j));
  ctx.stop = false;
  store.set({ running: true });
  mount(box, h('ul', { class: 'prog' }, waitLine));
  let ok = 0;
  try {
    for (const j of todo) {
      if (ctx.stop) break;
      const ul = h('ul', { class: 'prog' });
      box.append(h('p', { class: 'priv', style: { marginTop: '16px' } }, h('b', {}, j.name)), ul);
      const lines = {};
      const onStep = ({ key, state, label, error }) => {
        const li = lines[key] ||= ul.appendChild(h('li', {}, h('i'), h('span'), h('em')));
        li.className = state;
        if (label) li.children[1].textContent = label;
        li.children[2].textContent = state === 'split' ? 'dài quá, chia nhỏ' : error ? error.slice(0, 120) : '';
      };
      const io = { parts: (pages) => ctx.io.pageParts(j.id, pages), images: (pages) => ctx.pageImages(j.id, pages, 900, 0.6), ai: client, isSplittable, isFatal };
      try {
        // Trang đã tick: trang máy biết loại giữ nguyên, trang chưa rõ nhờ AI nhận bảng; chỉ gửi đúng các trang này.
        const plan = await planPicked(j, j.picked, io, { onStep });
        const got = await extractJob({ name: j.name, types: plan.types, notes: plan.notes }, io, { noteGroups: store.get().noteGroups, onStep, exact: true });
        const ext = { ...got, warnings: [...plan.warnings, ...got.warnings] };
        if (!Object.keys(ext.statements).length) throw new Error('Không đọc được bảng nào');
        if (!store.get().jobs.some((x) => x.id === j.id)) continue;          // file đã bị bỏ trong lúc chạy
        store.set((st) => {
          const old = st.sources.find((x) => x.jobId === j.id);
          return { sources: [...st.sources.filter((x) => x.jobId !== j.id), { id: uid('s'), jobId: j.id, kind: 'ext', ext, meta: old?.meta }] };
        });
        ctx.patchJob(j.id, { status: 'done' });
        ok++;
      } catch (e) {
        ul.append(h('li', { class: 'fail' }, h('i'), h('span', {}, e.message)));
        if (isFatal(e)) { toast(e.message, 8000); break; }
      }
    }
  } finally {
    store.set({ running: false });
    ctx.refreshQuota?.();
  }
  if (ok) {
    toast(`Xong ${ok} file — rà soát số ở bước 4.`);
    $('#s5').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
