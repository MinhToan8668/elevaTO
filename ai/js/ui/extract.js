// Bước 4: chọn gói dữ liệu / nhóm thuyết minh, chạy trích xuất từng file, hiện tiến độ.

import { h, mount, $, toast, keepFocus } from './dom.js';
import { PRESETS, NOTE_KEYS, uid, watch } from './store.js';
import { NOTE_TASKS } from '../core/prompts.js';
import { extractJob } from '../core/pipeline.js';
import { isSplittable, isFatal } from '../ai.js';

const HAS_TABLE = (j) => ['BS', 'IS', 'CF'].some((t) => j.types?.includes(t));

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
  const calls = todo.reduce((n, j) => n + 3 + s.noteGroups.filter((g) => j.notes?.[g]?.length).length, 0);
  const q = s.user?.luot;
  const left = q && q.han ? Math.max(0, q.han - q.dung) : null;
  const noTable = todo.filter((j) => !HAS_TABLE(j));
  let hint;
  if (!todo.length) hint = s.jobs.some((j) => j.status === 'done') ? 'Mọi file đã trích xuất. Đổi loại trang ở bước 2 để làm lại một file.' : 'Tải file PDF / ảnh ở bước 1.';
  else hint = `${todo.length} file · khoảng ${calls} lượt AI${left !== null ? ` (còn ${left} lượt hôm nay)` : ''}. Mỗi file mất 1–3 phút.`;
  const runBtn = h('button', { class: 'btn', id: 'runBtn', disabled: s.running || !todo.length || !s.user || noTable.length === todo.length, onclick: () => run(store, ctx) },
    s.running ? 'Đang trích xuất…' : 'Trích xuất bằng AI');
  const stopBtn = s.running ? h('button', { class: 'btn ghost', id: 'stopBtn', onclick: () => { ctx.stop = true; toast('Sẽ dừng sau file đang làm.'); } }, 'Dừng') : null;
  const row = $('#runRow');
  keepFocus(row, () => mount(row,
    h('div', { style: { flex: '0 0 auto', display: 'flex', gap: '10px' } }, runBtn, stopBtn),
    h('p', { class: 'priv', style: { flex: '1 1 300px', margin: 0 } }, hint,
      noTable.length ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, `${noTable.length} file chưa chọn trang bảng nào`) : null,
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
  const todo = s.jobs.filter((j) => j.kind !== 'xls' && j.status === 'ready' && HAS_TABLE(j));
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
      const io = { parts: (pages) => ctx.io.pageParts(j.id, pages), ai: client, isSplittable, isFatal };
      try {
        const ext = await extractJob({ name: j.name, types: j.types, notes: j.notes }, io, { noteGroups: store.get().noteGroups, onStep });
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
