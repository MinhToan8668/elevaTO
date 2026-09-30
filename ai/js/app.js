// elevaTO · AI BCTC — ghép các bước của trang.

import { h, mount, $, toast } from './ui/dom.js';
import { createStore, initialState, watch } from './ui/store.js';
import { initConnect } from './ui/connect.js';
import { initFiles } from './ui/files.js';
import { initExtract } from './ui/extract.js';
import { initReview } from './ui/review.js';
import { initExporter, applySession } from './ui/exporter.js';
import { createIO } from './ui/io.js';
import { serializeSession, parseSession } from './core/session.js';

const LS_SESSION = 'elevato-ai-session';

const store = createStore(initialState());
const ctx = { media: new Map(), stop: false };
ctx.io = createIO(ctx);
ctx.pageImages = (jobId, pages, width, quality) => ctx.io.pageImages(jobId, pages, width, quality);

offerRestore();
initConnect(store, ctx);
initFiles(store, ctx);
initExtract(store, ctx);
initReview(store, ctx);
initExporter(store);
autosave();
railSpy();

window.addEventListener('beforeunload', (e) => { if (store.get().running) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('unhandledrejection', (e) => { toast(`Lỗi: ${e.reason?.message || e.reason}`); });

// Phiên trước (chỉ số liệu đã trích, không có file gốc) — hỏi trước khi mở lại.
function offerRestore() {
  let data;
  try { const txt = localStorage.getItem(LS_SESSION); if (txt) data = parseSession(txt); } catch (e) { data = null; }
  if (!data || !data.sources.length) return;
  const box = $('#restore');
  const when = data.savedAt ? new Date(data.savedAt).toLocaleString('vi-VN') : '';
  mount(box, h('div', { class: 'banner' },
    h('span', {}, `Có phiên làm việc chưa xong${when ? ` (lưu lúc ${when})` : ''}: ${data.sources.length} nguồn dữ liệu.`),
    h('button', { class: 'btn sm', onclick: () => { applySession(store, data); mount(box); toast('Đã mở lại — xem ở bước 5.'); $('#s5').scrollIntoView({ behavior: 'smooth' }); } }, 'Mở lại'),
    h('button', { class: 'btn ghost sm', onclick: () => { try { localStorage.removeItem(LS_SESSION); } catch (e) { /* bỏ qua */ } mount(box); } }, 'Bỏ')));
}

function autosave() {
  let t, first = true;
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'segmentMap', 'segmentNames', 'noteGroups', 'preset'], (s) => {
    if (first) { first = false; return; }          // lúc mở trang: chưa ghi đè phiên cũ khi người dùng chưa chọn
    clearTimeout(t);
    t = setTimeout(() => {
      try {
        if (s.sources.length) localStorage.setItem(LS_SESSION, serializeSession(s));
        else localStorage.removeItem(LS_SESSION);
      } catch (e) { /* hết chỗ / bị chặn: vẫn còn nút "Lưu phiên" */ }
    }, 800);
  });
}

// Tô bước đang xem trên thanh bên trái.
function railSpy() {
  const links = [...document.querySelectorAll('.rail a')];
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('main > section.step').forEach((s) => io.observe(s));
}
