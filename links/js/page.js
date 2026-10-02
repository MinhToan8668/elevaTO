// Trang link-in-bio công khai: đọc data.json → vẽ danh thiếp + lưới ô link.
// ?preview: chạy trong khung xem trước của trình chỉnh sửa, nhận bản nháp qua postMessage và không mở link thật.

import { normalize, visibleLinks, visibleSocials, safeUrl, safeImg, opensSheet, cohortInfo, ACCENTS } from './core.js';
import { $, h, store, toast, toggleTheme } from './dom.js';
import { svg } from './icons.js';
import { fetchLinks } from './backend.js';

const DATA_CACHE = 'elevato-links-v1';
const CFG_CACHE = 'elevato_cfg_v2';   // trang khoá học lưu cấu hình cohort ở khoá này (cùng origin) → dùng lại được ngay
const PREVIEW = new URLSearchParams(location.search).has('preview');
const LIVE_TIMEOUT_MS = 8000;

let data = null;
let cohort = null;

/* ── link ─────────────────────────────────────── */
const absUrl = (u) => { try { return new URL(u, location.href).href; } catch (e) { return u; } };

/** Link ra ngoài elevaTO thì mở tab mới; link trong trang (../#dang-ky…) thì đi luôn. */
function linkAttrs(url) {
  const href = safeUrl(url);
  let abs = null;
  try { abs = new URL(href, location.href); } catch (e) { /* link lạ: coi như trong trang */ }
  const newTab = Boolean(abs) && abs.origin !== location.origin && /^https?:$/.test(abs.protocol);
  return newTab ? { href, target: '_blank', rel: 'noopener' } : { href };
}

/* ── danh thiếp ───────────────────────────────── */
function renderCard(d) {
  const p = d.profile;
  const ava = $('#ava');
  const src = safeImg(p.avatar);
  ava.alt = p.name ? 'Ảnh ' + p.name : '';
  if (src) ava.src = src; else ava.removeAttribute('src');
  ava.closest('.ava-wrap').dataset.initials = initials(p.name);
  ava.closest('.ava-wrap').classList.toggle('noimg', !src);

  const name = $('#name');
  name.textContent = p.name;
  name.className = '';
  const ver = $('#verified');
  ver.hidden = !p.verified;
  ver.innerHTML = p.verified ? svg('verified', 'ver') : '';
  if (p.verified) ver.setAttribute('title', 'Tài khoản chính chủ');

  $('#handle').textContent = p.handle;
  $('#handle').hidden = !p.handle;
  $('#tagline').textContent = p.tagline;

  // Dòng trạng thái tự gõ được ưu tiên. Để trống thì lấy trạng thái cohort trực tiếp — trừ khi ô nổi bật
  // đã hiện đúng dòng đó, khỏi lặp lại hai lần trên cùng một màn hình.
  const liveTile = visibleLinks(d).some((l) => l.live);
  const statusTxt = p.status || (cohort && !liveTile ? cohort.label + ' · ' + cohort.status : '');
  const closed = !p.status && Boolean(cohort && !cohort.isOpen);
  $('#status').hidden = !statusTxt;
  $('#statusTxt').textContent = statusTxt;
  $('#status').classList.toggle('off', closed);
  $('#avaDot').hidden = !statusTxt || closed;

  const stats = $('#stats');
  stats.replaceChildren(...d.stats.map((s) => h('div', { class: 'stat' }, h('dt', {}, s.label), h('dd', {}, s.value))));
  stats.hidden = !d.stats.length;

  const socials = $('#socials');
  socials.replaceChildren(...visibleSocials(d).map((s) =>
    h('a', { class: 'soc lg', ...linkAttrs(s.href), 'aria-label': s.def.label, title: s.def.label, html: svg(s.def.icon) })));
  socials.hidden = !socials.children.length;
}

function initials(name) {
  return String(name || '·').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();
}

/* ── các ô link ───────────────────────────────── */
function chip(l) {
  const img = safeImg(l.image);
  if (!img) return h('span', { class: 'chip', html: svg(l.icon) });
  // "icon": hình trong suốt đặt giữa ô màu nhấn; "photo": ảnh lấp kín ô.
  return h('span', { class: l.imageStyle === 'icon' ? 'chip ico' : 'chip img' },
    h('img', { src: img, alt: '', loading: 'lazy', decoding: 'async' }));
}
const badge = (l) => (l.badge ? h('span', { class: 'badge' }, l.badge) : null);

function liveBlock(l) {
  if (!l.live || !cohort) return null;
  const left = cohort.isOpen ? `còn ${cohort.remaining}/${cohort.max} suất` : cohort.status;
  return h('div', { class: 'live' },
    h('div', { class: 'live-row' },
      h('span', { class: 'live-tag' + (cohort.isOpen ? '' : ' off') }, h('span', { class: 'pulse' }), cohort.label + ' · ' + cohort.status),
      cohort.earlyBird ? h('span', { class: 'live-price' }, 'Early bird ', h('b', {}, cohort.earlyBird)) : null),
    h('div', { class: 'meter', role: 'img', 'aria-label': `${cohort.total} trên ${cohort.max} chỗ đã được giữ` },
      h('i', { class: 'meter-fill', 'data-pct': String(cohort.percent) })),
    h('div', { class: 'live-row small' }, h('span', {}, left), cohort.schedule ? h('span', {}, cohort.schedule) : null));
}

function tile(l, i) {
  const sheet = opensSheet(l);
  const text = h('span', { class: 'txt' }, h('b', { class: 'ttl' }, l.title), l.subtitle ? h('small', { class: 'sub' }, l.subtitle) : null);
  const arrow = h('span', { class: 'go', html: svg('arrow') });
  let el;

  if (l.size === 'feature') {
    // Ô nổi bật có 2 đích (cả ô + nút CTA) → không lồng <a> trong <a>: một lớp link phủ cả ô, nút CTA nằm trên nó.
    el = h('article', { class: 'tile lg feature' },
      sheet
        ? h('button', { class: 'cover', type: 'button', 'aria-label': l.title })
        : h('a', { class: 'cover', ...linkAttrs(l.url), 'aria-label': l.title }),
      h('div', { class: 'f-top' + (l.badge ? ' has-badge' : '') }, chip(l), text, badge(l)),
      liveBlock(l),
      l.cta ? h('a', { class: 'cta', ...linkAttrs(safeUrl(l.ctaUrl) || l.url) }, l.cta, h('span', { html: svg('arrow') })) : null);
  } else {
    const attrs = { class: `tile lg ${l.size}` };
    el = sheet
      ? h('button', { ...attrs, type: 'button', 'aria-haspopup': 'dialog' }, chip(l), text, arrow, badge(l))
      : h('a', { ...attrs, ...linkAttrs(l.url) }, chip(l), text, arrow, badge(l));
  }
  el.style.setProperty('--ac', ACCENTS[l.accent]);
  el.style.setProperty('--i', String(i));
  if (sheet) (el.querySelector('.cover') || el).addEventListener('click', () => openSheet(l));
  return el;
}

function renderGrid(d) {
  const links = visibleLinks(d);
  const grid = $('#grid');
  grid.replaceChildren(...links.map(tile));
  // Ô "half" lẻ cuối hàng → kéo rộng ra cho lưới khỏi hở một lỗ.
  let run = 0;
  for (const el of grid.children) {
    if (el.classList.contains('half')) run += 1;
    else { if (run % 2) el.previousElementSibling.classList.add('span'); run = 0; }
  }
  if (run % 2 && grid.lastElementChild) grid.lastElementChild.classList.add('span');
  // Thanh tiến độ chạy từ 0 lên khi vừa hiện.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    grid.querySelectorAll('.meter-fill').forEach((m) => m.style.setProperty('--p', String(Number(m.dataset.pct) / 100)));
  }));
  $('#err').hidden = Boolean(links.length);
  if (!links.length) $('#err').textContent = 'Chưa có link nào được bật.';
}

/** Màu thanh trạng thái của trình duyệt = màu thật ở đỉnh trang (--chrome trong links.css). */
function syncChrome() {
  const mau = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim();
  if (mau) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', mau));
}

/** Độ mờ, độ trong của kính và nền trang — lấy từ data.theme. */
function applyTheme(t) {
  const root = document.documentElement;
  root.style.setProperty('--blur', t.blur + 'px');
  root.style.setProperty('--tint', String(t.tint / 100));
  root.dataset.bg = t.background;
  const img = t.background === 'image' ? safeImg(t.bgImage) : '';
  document.body.classList.toggle('has-bgimg', Boolean(img));
  // url("…") trong CSS: chặn dấu nháy / xuống dòng để chuỗi không thoát khỏi url().
  $('#bgImg').style.setProperty('background-image', img ? 'url("' + img.replace(/["\\\n\r]/g, encodeURIComponent) + '")' : 'none');
  syncChrome();
}

function render() {
  if (!data) return;
  applyTheme(data.theme);
  if (data.meta.title) document.title = data.meta.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc && data.meta.description) desc.setAttribute('content', data.meta.description);
  renderCard(data);
  renderGrid(data);
  $('#main').removeAttribute('aria-busy');
  document.body.classList.add('ready');
}

/* ── thẻ chi tiết ─────────────────────────────── */
let sheetUrl = '';
function openSheet(l) {
  const dlg = $('#sheet');
  sheetUrl = l.url;
  $('#sheetIc').replaceWith(Object.assign(chip(l), { id: 'sheetIc' }));
  $('#sheetIc').style.setProperty('--ac', ACCENTS[l.accent]);
  dlg.style.setProperty('--ac', ACCENTS[l.accent]);
  $('#sheetTitle').textContent = l.title;
  $('#sheetSub').textContent = l.subtitle;
  const img = safeImg(l.image);
  $('#sheetImg').hidden = !img || l.size !== 'feature';
  if (img) $('#sheetImg').src = img;
  $('#sheetText').textContent = l.details.text;
  $('#sheetText').hidden = !l.details.text;
  $('#sheetList').replaceChildren(...l.details.bullets.map((b) => h('li', {}, h('span', { html: svg('check') }), b)));
  const go = $('#sheetGo');
  const a = linkAttrs(l.url);
  go.href = a.href;
  if (a.target) { go.target = a.target; go.rel = a.rel; } else { go.removeAttribute('target'); }
  go.replaceChildren(l.details.button || 'Mở link', h('span', { html: svg('arrow') }));
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
function closeSheet() {
  const dlg = $('#sheet');
  if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
}

/* ── chia sẻ ──────────────────────────────────── */
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    // Trình duyệt trong app (TikTok, Zalo…) hay chặn clipboard API → cách cũ.
    const ta = h('textarea', { readonly: true, class: 'offscreen' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}
async function share() {
  const url = location.href.split(/[?#]/)[0];
  const title = data ? data.meta.title || data.profile.name : document.title;
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  toast((await copy(url)) ? 'Đã copy link trang' : url);
}

/* ── tải dữ liệu ──────────────────────────────── */
// Nội dung trang: ưu tiên bản lưu trên máy chủ Apps Script (trình chỉnh sửa lưu vào đó, đổi ngay),
// data.json trong repo là bản dự phòng khi máy chủ chưa có gì hoặc không trả lời.
let cohortStarted = false;
function apply(raw) {
  if (!PREVIEW) store.set(DATA_CACHE, raw);
  data = normalize(raw);
  render();
  if (!cohortStarted) { cohortStarted = true; loadCohort(); }
}

async function loadFile() {
  const r = await fetch('data.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function loadData() {
  const cached = PREVIEW ? null : store.get(DATA_CACHE);
  if (cached) apply(cached);

  if (PREVIEW) {
    // Khung xem trước: trình chỉnh sửa gửi bản nháp sang; data.json chỉ để có gì hiện trong lúc chờ.
    try { const raw = await loadFile(); if (!data) apply(raw); } catch (e) { /* đợi bản nháp */ }
    return;
  }

  let fromBackend = false;
  const backend = fetchLinks().then((raw) => { if (raw) { fromBackend = true; apply(raw); } return raw; });
  const file = loadFile().then((raw) => { if (!fromBackend) apply(raw); return raw; }).catch(() => null);
  const [b, f] = await Promise.all([backend, file]);
  if (b || f || data) return;
  $('#grid').replaceChildren();
  const err = $('#err');
  err.hidden = false;
  err.replaceChildren('Chưa tải được trang. ', h('a', { href: '../' }, 'Mở trang elevaTO'), ' hoặc thử tải lại.');
  $('#main').removeAttribute('aria-busy');
}

async function loadCohort() {
  if (!data || !data.live.enabled) return;
  const cached = store.get(CFG_CACHE);
  if (cached && !cohort) { cohort = cohortInfo(cached); render(); }
  const api = safeUrl(data.live.api);
  if (!/^https:\/\/script\.google\.com\//.test(api)) return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
  try {
    const r = await fetch(api + '?action=config&t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
    const d = await r.json();
    if (!d || !d.ok || !d.config) return;
    store.set(CFG_CACHE, d.config);
    cohort = cohortInfo(d.config);
    render();
  } catch (e) {
    /* mạng lỗi → giữ số đã lưu, hoặc dùng dòng trạng thái tĩnh */
  } finally {
    clearTimeout(timer);
  }
}

/* ── khởi động ────────────────────────────────── */
function boot() {
  $('#themeBtn .i-sun').outerHTML = svg('sun', 'i-sun');
  $('#themeBtn .i-moon').outerHTML = svg('moon', 'i-moon');
  $('#shareBtn').innerHTML = svg('share');
  $('#sheetX').innerHTML = svg('close');
  $('#themeBtn').addEventListener('click', () => { toggleTheme(); syncChrome(); });
  $('#shareBtn').addEventListener('click', share);
  $('#sheetX').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSheet(); });
  $('#sheetCopy').addEventListener('click', async () => toast((await copy(absUrl(sheetUrl))) ? 'Đã copy link' : absUrl(sheetUrl)));
  $('#ava').addEventListener('error', () => $('#ava').closest('.ava-wrap').classList.add('noimg'));

  // Ánh sáng chạy theo con trỏ trên ô (chỉ máy có chuột).
  if (matchMedia('(hover: hover)').matches) {
    $('#grid').addEventListener('pointermove', (e) => {
      const t = e.target.closest('.tile');
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      t.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
    });
  }

  if (PREVIEW) {
    document.documentElement.classList.add('preview');
    // Trong khung xem trước: bấm link chỉ báo đích đến, không rời trang.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.closest('.foot, .bar')) return;
      e.preventDefault();
      toast('→ ' + a.getAttribute('href'));
    }, true);
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data || {};
      if (m.type !== 'elevato-links:data') return;
      const firstLive = !data || !data.live.enabled;
      data = normalize(m.data);
      render();
      if (firstLive) loadCohort();
    });
    window.parent.postMessage({ type: 'elevato-links:ready' }, location.origin);
  }

  loadData();
}

boot();
