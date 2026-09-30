// Bước 3: chọn gói dữ liệu / nhóm thuyết minh, chạy trích xuất từng file, hiện tiến độ.

import { h, mount, $, toast, keepFocus } from './dom.js';
import { FORMS, formOf, canUseModel, uid, watch } from './store.js';
import { extractJob, planPicked, needsMap } from '../core/pipeline.js';
import { isSplittable, isFatal } from '../ai.js';

const HAS_PICK = (j) => (j.picked?.length || 0) > 0;
// Trang đã tick mà máy chưa biết loại (hay nhóm thuyết minh) → AI phải nhận trang trước (12 trang / lượt).
const unknownPicked = (j) => (j.picked || []).filter((p) => needsMap(j, p)).length;

export function initExtract(store, ctx) {
  watch(store, ['preset', 'user', 'running'], (s) => renderPick(s, store));
  watch(store, ['jobs', 'preset', 'user', 'running'], (s) => renderRun(s, store, ctx));
}

/** Số lượt AI ước tính cho một file theo form đang dùng. */
function estimateCalls(j, form) {
  const groups = FORMS[form].notes, unknown = unknownPicked(j);
  if (!groups.length) return 3 + (unknown > 12 ? Math.ceil(unknown / 12) : 0);
  return Math.ceil(unknown / 12) + 3 + (unknown ? groups.length : groups.filter((g) => j.notes?.[g]?.some((p) => j.picked?.includes(p))).length);
}
const overCap = (j, form) => (j.picked?.length || 0) > FORMS[form].maxPages;

function renderPick(s, store) {
  const form = formOf(s), allowed = canUseModel(s.user);
  const card = (k, extra) => h('button', { class: `preset form-card${k === 'model' && !allowed ? ' locked' : ''}`, dataset: { form: k }, 'aria-pressed': String(form === k),
    disabled: s.running || (k === 'model' && !allowed), onclick: () => store.set({ preset: k }) },
    h('b', {}, FORMS[k].label, extra), h('small', {}, FORMS[k].desc));
  mount($('#pickBox'),
    h('div', { class: 'presets forms', role: 'group', 'aria-label': 'Loại form' },
      card('basic', h('span', { class: 'tag' }, 'Mọi tài khoản')),
      card('model', h('span', { class: 'tag em' }, allowed ? 'Học viên · Giảng viên' : '🔒 Chỉ học viên'))),
    !allowed ? h('p', { class: 'priv' }, 'Form riêng elevaTO dành cho học viên và giảng viên elevaTO. Bạn đã học elevaTO? Nhắn elevaTO email đăng ký để được mở quyền.') : null);
}

function renderRun(s, store, ctx) {
  const todo = s.jobs.filter((j) => j.kind !== 'xls' && j.status === 'ready');
  const form = formOf(s);
  const calls = todo.reduce((n, j) => n + estimateCalls(j, form), 0);
  const tooMany = todo.filter((j) => overCap(j, form));
  const q = s.user?.luot;
  const left = q && q.han ? Math.max(0, q.han - q.dung) : null;
  const noTable = todo.filter((j) => !HAS_PICK(j));
  let hint;
  if (!todo.length) hint = s.jobs.some((j) => j.status === 'done') ? 'Mọi file đã trích xuất. Đổi trang đã chọn ở bước 2 để làm lại một file.' : 'Tải file PDF / ảnh ở bước 1.';
  else hint = `${todo.length} file · khoảng ${calls} lượt AI${left !== null ? ` (còn ${left} lượt hôm nay)` : ''}. Mỗi file mất 1–3 phút.`;
  const runBtn = h('button', { class: 'btn', id: 'runBtn', disabled: s.running || !todo.length || !s.user || noTable.length === todo.length || tooMany.length > 0, onclick: () => run(store, ctx) },
    s.running ? 'Đang trích xuất…' : 'Trích xuất bằng AI');
  const stopBtn = s.running ? h('button', { class: 'btn ghost', id: 'stopBtn', onclick: () => { ctx.stop = true; toast('Sẽ dừng sau file đang làm.'); } }, 'Dừng') : null;
  document.querySelector('.rail a[data-step="4"]').classList.toggle('done', s.jobs.some((j) => j.status === 'done'));
  const row = $('#runRow');
  keepFocus(row, () => mount(row,
    h('div', { style: { flex: '0 0 auto', display: 'flex', gap: '10px' } }, runBtn, stopBtn),
    h('p', { class: 'priv', style: { flex: '1 1 300px', margin: 0 } }, hint,
      noTable.length ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, `${noTable.length} file chưa tick trang nào`) : null,
      tooMany.length ? h('span', { class: 'tag red', style: { marginLeft: '6px' } },
        `${FORMS[form].label} đọc tối đa ${FORMS[form].maxPages} trang mỗi file — bỏ bớt trang ở bước 2 cho: ${tooMany.map((j) => j.name).join(', ')}`) : null,
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
  const form = formOf(s), groups = FORMS[form].notes;
  const todo = s.jobs.filter((j) => j.kind !== 'xls' && j.status === 'ready' && HAS_PICK(j) && !overCap(j, form));
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
        const plan = await planPicked(j, j.picked, io, { onStep, notes: groups.length > 0 });
        const got = await extractJob({ name: j.name, types: plan.types, notes: plan.notes, shared: plan.shared }, io, { noteGroups: groups, onStep, exact: true });
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
