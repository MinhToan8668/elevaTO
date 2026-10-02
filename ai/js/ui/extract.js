// Bước 3: chọn gói dữ liệu / nhóm thuyết minh, chạy trích xuất từng file, hiện tiến độ.

import { h, mount, $, toast, keepFocus } from './dom.js';
import { NOTE_KEYS, uid, watch } from './store.js';
import { extractJob, planPicked, needsMap } from '../core/pipeline.js';
import { isSplittable, isFatal } from '../ai.js';
import { t } from '../i18n.js';

const HAS_PICK = (j) => (j.picked?.length || 0) > 0;
// Trang đã tick mà máy chưa biết loại (hay nhóm thuyết minh) → AI phải nhận trang trước (12 trang / lượt).
const unknownPicked = (j) => (j.picked || []).filter((p) => needsMap(j, p)).length;

export function initExtract(store, ctx) {
  watch(store, ['jobs', 'user', 'running', 'lang'], (s) => renderRun(s, store, ctx));
}

/** Số lượt AI ước tính cho một file: 3 bảng chính + mỗi nhóm thuyết minh tìm thấy + nhận diện trang lạ. */
function estimateCalls(j) {
  const unknown = unknownPicked(j);
  const nhom = unknown ? NOTE_KEYS.length : NOTE_KEYS.filter((g) => j.notes?.[g]?.some((p) => j.picked?.includes(p))).length;
  return Math.ceil(unknown / 12) + 3 + nhom;
}

function renderRun(s, store, ctx) {
  const todo = s.jobs.filter((j) => j.kind !== 'xls' && j.status === 'ready');
  const calls = todo.reduce((n, j) => n + estimateCalls(j), 0);
  const q = s.user?.luot;
  const left = q && q.han ? Math.max(0, q.han - q.dung) : null;
  const noTable = todo.filter((j) => !HAS_PICK(j));
  let hint;
  if (!todo.length) hint = t(s.jobs.some((j) => j.status === 'done') ? 'run.allDone' : 'run.noFiles');
  else hint = t('run.est', { n: todo.length, calls, left: left !== null ? t('run.left', { n: left }) : '' });
  // Chưa đăng nhập vẫn bấm được: bấm xong mới hiện hộp đăng ký, đỡ cụt hứng giữa chừng.
  const runBtn = h('button', { class: 'btn', id: 'runBtn', disabled: s.running || !todo.length || noTable.length === todo.length,
    onclick: () => { const go = () => run(store, ctx); if (ctx.canDo(t('au.why.run'), go)) go(); } },
    t(s.running ? 'run.going' : 'run.go'));
  const stopBtn = s.running ? h('button', { class: 'btn ghost', id: 'stopBtn', onclick: () => { ctx.stop = true; toast(t('run.stopping')); } }, t('run.stop')) : null;
  document.querySelector('.rail a[data-step="3"]').classList.toggle('done', s.jobs.some((j) => j.status === 'done'));
  const row = $('#runRow');
  keepFocus(row, () => mount(row,
    h('div', { style: { flex: '0 0 auto', display: 'flex', gap: '10px' } }, runBtn, stopBtn),
    h('p', { class: 'priv', style: { flex: '1 1 300px', margin: 0 } }, hint,
      noTable.length ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, t('run.noPick', { n: noTable.length })) : null,
      left !== null && calls > left ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, t('run.noQuota')) : null)));
}

async function run(store, ctx) {
  const box = $('#progress');
  const waitLine = h('li', { class: 'wait', hidden: true }, h('i'), h('span'));
  const client = ctx.client((sec, msg) => {
    waitLine.hidden = false;
    waitLine.lastChild.textContent = t('run.retry', { msg: msg || t('run.busy'), sec });
    setTimeout(() => { waitLine.hidden = true; }, sec * 1000);
  });
  if (!client) return toast(t('run.needLogin'));
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
        li.children[2].textContent = state === 'split' ? t('run.split') : error ? error.slice(0, 120) : '';
      };
      // Góc quay đọc lại từ store mỗi lần gửi: người dùng xoay tay ở bước 2, hoặc lượt nhận trang
      // vừa phát hiện trang in ngang (patchJob ngay dưới) — cả hai phải ăn vào lượt đọc bảng sau đó.
      const rot = () => store.get().jobs.find((x) => x.id === j.id)?.rot || {};
      // Bản scan: gửi ảnh cả lúc đọc bảng lẫn lúc nhận diện trang (gửi PDF scan hay ra kết quả rỗng).
      const io = { parts: (pages, o) => ctx.io.pageParts(j.id, pages, { anh: !!o?.anh, rot: rot() }),
        images: (pages) => ctx.pageImages(j.id, pages, 900, 0.6, rot()), ai: client, isSplittable, isFatal };
      try {
        // Trang đã tick: trang máy biết loại giữ nguyên, trang chưa rõ nhờ AI nhận bảng; chỉ gửi đúng các trang này.
        const plan = await planPicked(j, j.picked, io, { onStep });
        // Trang AI thấy nằm ngang: nhớ vào file để lượt đọc bảng gửi ảnh đã quay, và bước 2 hiện đúng chiều.
        const them = Object.entries(plan.rot || {}).filter(([p, q]) => rot()[p] !== q);
        if (them.length) ctx.patchJob(j.id, { rot: { ...rot(), ...Object.fromEntries(them) } });
        const got = await extractJob({ name: j.name, scanned: j.scanned, types: plan.types, notes: plan.notes, shared: plan.shared }, io, { noteGroups: NOTE_KEYS, onStep, exact: true });
        const ext = { ...got, warnings: [...plan.warnings, ...got.warnings] };
        // Không đọc nổi bảng nào: hiện lời chỉ dẫn (AI vừa xem các trang đó là trang gì) thay vì câu cụt.
        if (!Object.keys(ext.statements).length) {
          throw new Error(got.goiY || t('run.noTable'));
        }
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
    toast(t('run.ok', { n: ok }));
    $('#s5').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
