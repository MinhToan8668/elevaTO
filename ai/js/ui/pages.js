// Bước 2: chọn trang như FinLens — xem ảnh từng trang, bấm để xem trang lớn, tick trang cần trích xuất.
// AI tự nhận trang đã tick thuộc bảng nào (pipeline.planPicked); người dùng không phải chọn loại trang.

import { h, mount, $, pagesText } from './dom.js';
import { watch } from './store.js';
import { suggestPicks } from '../core/pipeline.js';

const SHORT = { BS: 'CĐKT', IS: 'KQKD', CF: 'LCTT', NOTES: 'Thuyết minh' };
const thumbCache = new Map();          // `${jobId}:${page}` → dataURL
const panels = new Map();              // jobId → { el, sig } — tick một trang không vẽ lại cả lưới
const lastClick = new Map();           // jobId → trang tick gần nhất (Shift + tick để chọn một dải)

export function initPages(store, ctx) {
  ctx.forgetThumbs = (id) => { for (const k of thumbCache.keys()) if (k.startsWith(`${id}:`)) thumbCache.delete(k); panels.delete(id); };
  ctx.setPicked = (id, picked, goiY) => {
    const j = store.get().jobs.find((x) => x.id === id);
    if (!j) return;
    const sorted = [...new Set(picked)].filter((p) => p >= 1 && p <= j.numPages).sort((a, b) => a - b);
    ctx.patchJob(id, { picked: sorted, goiY: goiY ? sorted : j.goiY, status: j.status === 'done' ? 'ready' : j.status });
  };
  // theoForm sửa trang đã chọn → store đổi → watch chạy lại và vẽ với state mới; lần này bỏ qua để không vẽ bằng state cũ.
  watch(store, ['jobs', 'running'], (s) => render(s, store, ctx));
}

const sigOf = (j, s) => JSON.stringify([j.numPages, j.scanned, j.status === 'reading', s.running, j.types?.length]);

function render(s, store, ctx) {
  const box = $('#pageMaps');
  const jobs = s.jobs.filter((j) => j.kind !== 'xls' && j.status !== 'error' && j.status !== 'reading');
  for (const id of panels.keys()) if (!jobs.some((j) => j.id === id)) panels.delete(id);
  if (!jobs.length) { mount(box, h('p', { class: 'empty' }, 'Chưa có file PDF / ảnh nào. File Excel không cần bước này.')); return; }
  const els = jobs.map((j, i) => {
    const sig = sigOf(j, s), had = panels.get(j.id);
    if (had && had.sig === sig) { had.sync(j); return had.el; }
    const p = panel(j, store, ctx, had ? had.el.open : i === jobs.length - 1);
    panels.set(j.id, { ...p, sig });
    return p.el;
  });
  const same = els.length === box.children.length && els.every((el, i) => box.children[i] === el);
  if (!same) mount(box, els);
  document.querySelector('.rail a[data-step="3"]').classList.toggle('done', jobs.some((j) => j.picked?.length));
}

function panel(j0, store, ctx, isOpen) {
  let j = j0;

  const count = h('span', { class: 'tag em' });
  const found = h('span', { class: 'found' });
  const grid = h('div', { class: 'thumbs', role: 'group', 'aria-label': `Các trang của ${j.name}` });
  const tiles = [];

  const toggle = (n, on, shift) => {
    const cur = new Set(store.get().jobs.find((x) => x.id === j.id)?.picked || []);
    const from = lastClick.get(j.id);
    const range = shift && from ? [Math.min(from, n), Math.max(from, n)] : [n, n];
    for (let p = range[0]; p <= range[1]; p++) { if (on) cur.add(p); else cur.delete(p); }
    lastClick.set(j.id, n);
    ctx.setPicked(j.id, [...cur]);
  };

  for (let n = 1; n <= j.numPages; n++) {
    const img = h('button', { type: 'button', class: 'tile-img', 'aria-label': `Xem lớn trang ${n}`, dataset: { job: j.id, page: String(n) },
      onclick: (e) => openViewer(j.id, n, store, ctx, e.currentTarget) }, h('span', { class: 'pno' }, String(n)));
    const chk = h('input', { type: 'checkbox', 'aria-label': `Chọn trang ${n}`, disabled: store.get().running });
    chk.addEventListener('click', (e) => toggle(n, chk.checked, e.shiftKey));
    const tag = h('span', { class: 'tile-t' });
    const tile = h('div', { class: 'tile' }, img, h('label', { class: 'tile-chk' }, chk), tag);
    tiles.push({ tile, chk, tag });
    grid.append(tile);
  }
  lazyThumbs(grid, ctx);

  const sync = (nj) => {
    j = nj;
    const set = new Set(j.picked || []);
    tiles.forEach(({ tile, chk, tag }, i) => {
      const n = i + 1, on = set.has(n), t = j.scanned ? '' : SHORT[j.types?.[i]] || '';
      tile.classList.toggle('on', on);
      if (chk.checked !== on) chk.checked = on;
      tag.textContent = t;
      tag.hidden = !t;
      chk.setAttribute('aria-label', t ? `Chọn trang ${n} (${t})` : `Chọn trang ${n}`);
    });
    count.textContent = `Đã chọn ${set.size}/${j.numPages} trang`;
    count.classList.toggle('em', true);
    warn.hidden = true;
    const auto = ['BS', 'IS', 'CF'].map((t) => { const p = j.types.map((x, i) => (x === t ? i + 1 : 0)).filter(Boolean); return p.length ? `${SHORT[t]} ${pagesText(p)}` : ''; }).filter(Boolean);
    found.textContent = j.scanned ? (j.kind === 'img' ? 'Ảnh chụp — AI sẽ tự nhận bảng' : 'Bản scan — tick trang, AI sẽ tự nhận bảng') : auto.length ? `Máy nhận ra: ${auto.join(' · ')}` : '';
  };

  const warn = h('p', { class: 'msg warn', role: 'status', hidden: true });
  const bar = h('div', { class: 'pick-bar' },
    h('button', { type: 'button', class: 'btn ghost sm', hidden: j.scanned && j.kind !== 'img', disabled: store.get().running, onclick: () => ctx.setPicked(j.id, suggestPicks(j)) }, 'Chọn gợi ý'),
    h('button', { type: 'button', class: 'btn ghost sm', disabled: store.get().running, onclick: () => ctx.setPicked(j.id, Array.from({ length: j.numPages }, (_, i) => i + 1)) }, 'Chọn tất cả'),
    h('button', { type: 'button', class: 'btn ghost sm', disabled: store.get().running, onclick: () => ctx.setPicked(j.id, []) }, 'Bỏ chọn'),
    h('span', { class: 'priv' }, 'Bấm vào ảnh để xem trang lớn · Shift + tick để chọn một dải trang'));

  const el = h('details', { class: 'pmap', dataset: { id: j.id }, open: isOpen },
    h('summary', {}, h('h3', {}, j.name, ' ', count), found),
    bar, warn, grid,
    h('p', { class: 'priv' }, 'Tick trang ba báo cáo chính và các trang thuyết minh cần lấy (TSCĐ, vay, vốn chủ, doanh thu theo mảng…). Chọn càng đúng, AI đọc càng nhanh và ít tốn lượt.'));
  sync(j);
  return { el, sync };
}

function lazyThumbs(grid, ctx) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      paintThumb(en.target, ctx);
    }
  }, { rootMargin: '300px' });
  grid.querySelectorAll('.tile-img').forEach((el) => io.observe(el));
}

async function paintThumb(el, ctx) {
  const { job, page } = el.dataset;
  const key = `${job}:${page}`;
  const m = ctx.media.get(job);
  if (!m) return;
  try {
    let url = thumbCache.get(key);
    if (!url && m.urls) url = m.urls[page - 1];
    if (!url && m.pdf) {
      const { thumbnail } = await import('../pdf.js');
      url = await thumbnail(m.pdf.doc, Number(page), 220);
      thumbCache.set(key, url);
    }
    if (url) el.style.backgroundImage = `url("${url}")`;
  } catch (e) { el.classList.add('noimg'); el.title = `Không vẽ được trang: ${e.message}`; }
}

// ─── Xem trang lớn ────────────────────────────────────────

let viewer = null;

function openViewer(jobId, page, store, ctx, from) {
  viewer ||= buildViewer(store, ctx);
  viewer.show(jobId, page, from);
}

const MAX_PX = 3200;                   // canvas rộng nhất (đủ nét khi phóng 150% trên màn dpr 2)
const NAV_DELAY = 120;                 // bấm ← / → liên tục: chỉ vẽ trang dừng lại

function buildViewer(store, ctx) {
  const title = h('b', { id: 'vwTitle' });
  const pos = h('span', { class: 'vw-pos' });
  const stage = h('div', { class: 'vw-stage', tabindex: '0' });
  const pick = h('button', { type: 'button', class: 'btn', id: 'vwPick', 'aria-pressed': 'false' });
  const zoomTxt = h('span', { class: 'vw-zoom' });
  const prev = h('button', { type: 'button', class: 'btn ghost', id: 'vwPrev', onclick: () => go(-1) }, '‹ Trang trước');
  const next = h('button', { type: 'button', class: 'btn ghost', id: 'vwNext', onclick: () => go(1) }, 'Trang sau ›');
  const dlg = h('dialog', { class: 'viewer', 'aria-labelledby': 'vwTitle' },
    h('div', { class: 'vw-head' }, title, pos, h('span', { class: 'sp' }),
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Thu nhỏ', onclick: () => zoom(-0.25) }, '−'), zoomTxt,
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Phóng to', onclick: () => zoom(0.25) }, '+'),
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Đóng', onclick: () => dlg.close() }, '✕')),
    stage,
    h('div', { class: 'vw-foot' }, prev, pick, next));
  document.body.append(dlg);

  let jobId = '', page = 1, scale = 1, token = 0, back = null, timer = 0, hold = null, shown = null, drawnPx = 0;
  const job = () => store.get().jobs.find((x) => x.id === jobId);

  /** Chữ, nút, trạng thái chọn — không vẽ lại trang (giữ nguyên chỗ đang cuộn). */
  function chrome() {
    const j = job();
    if (!j) { if (dlg.open) dlg.close(); return null; }
    title.textContent = j.name;
    pos.textContent = `Trang ${page} / ${j.numPages}`;
    zoomTxt.textContent = `${Math.round(scale * 100)}%`;
    const on = (j.picked || []).includes(page);
    pick.textContent = on ? '✓ Đã chọn trang này' : 'Chọn trang này';
    pick.setAttribute('aria-pressed', String(on));
    pick.classList.toggle('ghost', !on);
    pick.disabled = store.get().running;
    const lost = [prev, next].includes(document.activeElement);
    prev.disabled = page <= 1; next.disabled = page >= j.numPages;
    if (lost && document.activeElement?.disabled) stage.focus();
    return j;
  }

  function release() {
    hold?.task?.cancel?.();
    hold = null;
    if (shown instanceof HTMLCanvasElement) { shown.width = 0; shown.height = 0; }   // Safari giữ bộ nhớ canvas nếu không trả
    shown = null; drawnPx = 0;
  }

  async function paint() {
    const j = chrome();
    if (!j) return;
    const my = ++token;
    const m = ctx.media.get(jobId);
    if (!m) return;
    release();
    mount(stage, h('p', { class: 'priv' }, 'Đang vẽ trang…'));
    try {
      if (m.urls) {
        shown = h('img', { src: m.urls[page - 1], alt: `Trang ${page}`, style: { width: `${scale * 100}%` } });
        mount(stage, shown);
        return;
      }
      const { renderPage } = await import('../pdf.js');
      const px = wantPx();
      const my2 = (hold = {});
      const canvas = await renderPage(m.pdf.doc, page, px, my2);
      if (my !== token) { canvas.width = 0; canvas.height = 0; return; }
      canvas.style.width = `${scale * 100}%`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Trang ${page}`);
      shown = canvas; drawnPx = px;
      mount(stage, canvas);
    } catch (e) { if (my === token) mount(stage, h('p', { class: 'msg err' }, `Không vẽ được trang: ${e.message}`)); }
  }
  const wantPx = () => Math.min(MAX_PX, Math.round((stage.clientWidth || 900) * scale * (window.devicePixelRatio || 1)));

  function go(d) {
    const j = job(); if (!j) return;
    const to = Math.min(j.numPages, Math.max(1, page + d));
    if (to === page) return;
    page = to; stage.scrollTop = 0; stage.scrollLeft = 0;
    token++; release();
    chrome();
    mount(stage, h('p', { class: 'priv' }, 'Đang vẽ trang…'));
    clearTimeout(timer);
    timer = setTimeout(paint, NAV_DELAY);
  }
  function zoom(d) {
    scale = Math.min(3, Math.max(0.5, scale + d));
    chrome();
    if (!shown) return;
    const top = stage.scrollTop / (stage.scrollHeight || 1);
    shown.style.width = `${scale * 100}%`;
    stage.scrollTop = top * stage.scrollHeight;
    if (shown instanceof HTMLCanvasElement && wantPx() > drawnPx * 1.1) {       // phóng to quá độ nét đang có → vẽ lại nét hơn
      clearTimeout(timer);
      timer = setTimeout(() => sharpen(top), NAV_DELAY * 2);
    }
  }
  async function sharpen(top) {
    const m = ctx.media.get(jobId);
    if (!m?.pdf) return;
    const my = ++token, px = wantPx(), my2 = (hold = {});
    try {
      const { renderPage } = await import('../pdf.js');
      const canvas = await renderPage(m.pdf.doc, page, px, my2);
      if (my !== token) { canvas.width = 0; canvas.height = 0; return; }
      canvas.style.width = `${scale * 100}%`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Trang ${page}`);
      const old = shown;
      shown = canvas; drawnPx = px;
      mount(stage, canvas);
      stage.scrollTop = top * stage.scrollHeight;
      if (old instanceof HTMLCanvasElement) { old.width = 0; old.height = 0; }
    } catch { /* bản cũ vẫn hiện, chỉ kém nét */ }
  }
  function togglePick() {
    const j = job(); if (!j || store.get().running) return;
    const cur = new Set(j.picked || []);
    if (cur.has(page)) cur.delete(page); else cur.add(page);
    ctx.setPicked(jobId, [...cur]);
    chrome();
  }
  pick.addEventListener('click', togglePick);
  dlg.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const wide = stage.scrollWidth > stage.clientWidth + 1;              // đang phóng to: ← / → để cuộn ngang
    if (e.key === 'ArrowRight' && !wide) { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' && !wide) { e.preventDefault(); go(-1); }
    if (e.key === 'PageDown') { e.preventDefault(); go(1); }
    if (e.key === 'PageUp') { e.preventDefault(); go(-1); }
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) togglePick(); }
  });
  dlg.addEventListener('close', () => {
    clearTimeout(timer); token++; release(); mount(stage);
    const tile = back && document.body.contains(back) ? back
      : document.querySelector(`.tile-img[data-job="${CSS.escape(jobId)}"][data-page="${page}"]`);
    tile?.focus?.();
  });
  // File bị xoá / hết phiên khi đang xem → đóng; tick ở lưới hoặc đang trích xuất → cập nhật nút.
  watch(store, ['jobs', 'running'], () => { if (dlg.open) chrome(); });

  return {
    show(id, p, from) {
      back = from || null;
      jobId = id; page = p; scale = 1;
      if (!dlg.open) dlg.showModal();
      stage.focus();
      clearTimeout(timer);
      paint();
    },
  };
}
