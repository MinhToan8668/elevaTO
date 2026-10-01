// elevaTO · AI BCTC — ghép các bước của trang.

import { h, mount, $, toast } from './ui/dom.js';
import { createStore, initialState, watch } from './ui/store.js';
import { initAuth } from './ui/auth.js';
import { initFiles } from './ui/files.js';
import { initPages } from './ui/pages.js';
import { initExtract } from './ui/extract.js';
import { initReview } from './ui/review.js';
import { initExporter, applySession } from './ui/exporter.js';
import { createIO } from './ui/io.js';
import { serializeSession, parseSession } from './core/session.js';
import { t, locale, LANGS, getLang, setLang, initialLang } from './i18n.js';

// Phiên làm việc tự lưu theo từng tài khoản: máy dùng chung không lộ số của người khác.
const sessionKey = (user) => `elevato-ai-session:${String(user?.email || '').toLowerCase()}`;

const store = createStore({ ...initialState(), lang: initialLang() });
const ctx = { media: new Map(), stop: false };
ctx.io = createIO(ctx);
ctx.pageImages = (jobId, pages, width, quality) => ctx.io.pageImages(jobId, pages, width, quality);

setLang(store.get().lang);
initTheme();
initLangPicker();
initFiles(store, ctx);
initPages(store, ctx);
initExtract(store, ctx);
initReview(store, ctx);
initExporter(store);
railSpy();
initAuth(store, ctx, { onLogin: (me) => { offerRestore(me); autosave(me); } });

window.addEventListener('beforeunload', (e) => { if (store.get().running && !ctx.leaving) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('unhandledrejection', (e) => { toast(t('app.err', { msg: e.reason?.message || e.reason })); });

// Phiên trước (chỉ số liệu đã trích, không có file gốc) — hỏi trước khi mở lại.
function offerRestore(user) {
  const LS_SESSION = sessionKey(user);
  let data;
  try { const txt = localStorage.getItem(LS_SESSION); if (txt) data = parseSession(txt); } catch (e) { data = null; }
  if (!data || !data.sources.length) return;
  const box = $('#restore');
  const when = data.savedAt ? t('ss.when', { d: new Date(data.savedAt).toLocaleString(locale()) }) : '';
  mount(box, h('div', { class: 'banner' },
    h('span', {}, t('ss.banner', { when, n: data.sources.length })),
    h('button', { class: 'btn sm', onclick: () => { if (!applySession(store, data)) return; mount(box); toast(t('ss.opened')); $('#s5').scrollIntoView({ behavior: 'smooth' }); } }, t('ss.open')),
    h('button', { class: 'btn ghost sm', onclick: () => { try { localStorage.removeItem(LS_SESSION); } catch (e) { /* bỏ qua */ } mount(box); } }, t('ss.drop'))));
}

function autosave(user) {
  const LS_SESSION = sessionKey(user);
  let t, first = true;
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'segmentMap', 'segmentNames'], (s) => {
    if (first) { first = false; return; }
    // Chỉ ghi khi đã có dữ liệu; không bao giờ tự xoá — phiên cũ chỉ mất khi người dùng bấm "Bỏ" ở banner
    // hoặc có dữ liệu mới thay thế.
    if (!s.sources.length) return;
    clearTimeout(t);
    t = setTimeout(() => {
      try { localStorage.setItem(LS_SESSION, serializeSession(store.get())); } catch (e) { /* hết chỗ / bị chặn: vẫn còn nút "Lưu phiên" */ }
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

// Nút sáng / tối: nhớ lựa chọn; chưa chọn thì theo máy.
function initTheme() {
  const btn = $('#themeBtn');
  const cur = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const paint = () => btn.setAttribute('aria-pressed', String(cur() === 'dark'));
  btn.addEventListener('click', () => {
    const next = cur() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('elevato-theme', next); } catch (e) { /* bỏ qua */ }
    paint();
  });
  paint();
}

// Chọn ngôn ngữ: đổi tại chỗ, mọi phần giao diện vẽ lại (state.lang nằm trong watch của ui/*.js).
function initLangPicker() {
  const sel = $('#langSel');
  mount(sel, LANGS.map(([v, l]) => h('option', { value: v, selected: getLang() === v }, l)));
  sel.addEventListener('change', () => {
    store.set({ lang: setLang(sel.value) });
  });
}
