// Trang link-in-bio công khai: đọc data.json → vẽ danh thiếp + lưới ô link.
// ?preview: chạy trong khung xem trước của trình chỉnh sửa, nhận bản nháp qua postMessage và không mở link thật.

import { normalize, serialize, visibleLinks, visibleSocials, safeUrl, safeImg, opensSheet, cohortInfo,
  brandDoc, brandIndex, mergeDraft, emoji3d, ACCENTS } from './core.js';
import { $, h, store, toast, toggleTheme } from './dom.js';
import { svg } from './icons.js';
import { fetchLinks } from './backend.js';

const DATA_CACHE = 'elevato-links-v1';
const CFG_CACHE = 'elevato_cfg_v2';   // trang khoá học lưu cấu hình cohort ở khoá này (cùng origin) → dùng lại được ngay
const PREVIEW = new URLSearchParams(location.search).has('preview');
const LIVE_TIMEOUT_MS = 8000;

let site = null;        // cả trang: phần dùng chung + mọi thương hiệu
let data = null;        // thương hiệu đang mở, ở dạng phẳng mà phần vẽ bên dưới quen dùng
let cur = 0;
let cohort = null;                   // cohort của thương hiệu đang mở
const cohorts = new Map();           // id thương hiệu → cohort đã lấy, đổi tab qua lại không gọi lại

// Mỗi kênh TikTok dán một link riêng (…/links/?v=finance, ?v=content) nên trang mở ra đã đúng
// thương hiệu — công tắc chỉ để người tò mò bắc cầu sang bên kia, không ai mất thêm một cú bấm.
const BRAND_PARAM = 'v';

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
const anh = (src) => h('img', { src, alt: '', loading: 'lazy', decoding: 'async' });

function chip(l) {
  const img = safeImg(l.image);
  // Emoji có sẵn bản 3D trong art/3d → hiện hình đó: emoji gõ tay mỗi máy vẽ một kiểu (Windows ra
  // hình dẹt xấu), hình 3D thì máy nào cũng y như nhau và cùng bộ với các icon 3D khác trên trang.
  const e3 = img ? '' : emoji3d(l.emoji);
  if (e3) return h('span', { class: 'chip ico' }, anh(e3));
  if (!img && l.emoji) return h('span', { class: 'chip emo', 'aria-hidden': 'true' }, l.emoji);
  if (!img) return h('span', { class: 'chip', html: svg(l.icon) });
  // "icon": hình trong suốt đặt giữa ô màu nhấn; "photo": ảnh lấp kín ô.
  return h('span', { class: l.imageStyle === 'icon' ? 'chip ico' : 'chip img' }, anh(img));
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

/** Lưới nút công cụ trong một ô. Nằm TRÊN lớp link phủ cả ô, nên bấm nút nào đi đúng công cụ đó. */
function toolsBlock(l) {
  const tools = l.tools.filter((t) => safeUrl(t.url));
  if (!tools.length) return null;
  const box = h('div', { class: 'tools' }, ...tools.map((t) => h('a', { class: 'tool', ...linkAttrs(t.url) },
    t.emoji ? h('i', { 'aria-hidden': 'true' }, emoji3d(t.emoji) ? anh(emoji3d(t.emoji)) : t.emoji) : null,
    h('span', {}, t.label),
    t.badge ? h('b', {}, t.badge) : null)));
  // Số cột chia hết cho số nút để hàng cuối không lẻ một nút: tối đa 3 cột trên điện thoại, 6 trên máy tính.
  box.style.setProperty('--cot', String(Math.min(tools.length, 3)));
  box.style.setProperty('--cot-rong', String(Math.min(tools.length, 6)));
  return box;
}

function tile(l, i) {
  const sheet = opensSheet(l);
  const text = h('span', { class: 'txt' }, h('b', { class: 'ttl' }, l.title), l.subtitle ? h('small', { class: 'sub' }, l.subtitle) : null);
  const arrow = h('span', { class: 'go', html: svg('arrow') });
  let el;

  if (l.size === 'feature') {
    // Ô nổi bật có 2 đích (cả ô + nút CTA) → không lồng <a> trong <a>: một lớp link phủ cả ô, nút CTA nằm trên nó.
    const tools = toolsBlock(l);
    const live = liveBlock(l);
    // Có cả số chỗ lẫn nút CTA → dòng "còn x suất · lịch học" và nút đứng chung một hàng cuối (links.css,
    // .with-meta), không để nút nằm riêng một hàng chừa trống cả góc phải.
    el = h('article', { class: 'tile lg feature' + (tools ? ' has-tools' : '') + (live && l.cta ? ' with-meta' : '') },
      sheet
        ? h('button', { class: 'cover', type: 'button', 'aria-label': l.title })
        : h('a', { class: 'cover', ...linkAttrs(l.url), 'aria-label': l.title }),
      h('div', { class: 'f-top' }, chip(l), text, badge(l)),
      live,
      tools,
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

/* ── công tắc thương hiệu ─────────────────────── */
/** Thương hiệu mở sẵn: lấy theo ?v= trong link, không có thì cái đầu tiên. */
function pickBrand() {
  const v = new URLSearchParams(location.search).get(BRAND_PARAM);
  return v ? brandIndex(site, v) : 0;
}

// Dấu hiệu nhỏ của từng thương hiệu trên công tắc — đúng logo thật, không phải icon minh hoạ:
// mũi tên đôi của elevaTO (assets/logo-mark.svg) và ba viên gạch + viên đỉnh lime của TMXK.
// Vẽ thẳng vào trang (không dùng <img>) để CSS đổi màu viên gạch theo nền sáng/tối/đang chọn.
const MARK = {
  glass: '<svg viewBox="272.4 149.1 32 31.5" aria-hidden="true"><path class="m-a" d="M293.44 160l-18.03-.8c-3.48-.16-4.07 6.62.06 6.74l11.21.3-.85 11.29c-.26 3.44 6.44 3.8 6.63.31z"/><path class="m-a" d="M304.11 150.14l-18.03-.8c-3.48-.15-4.07 6.63.06 6.74l11.22.3-.86 11.29c-.26 3.44 6.44 3.8 6.63.31z"/></svg>',
  paper: '<svg viewBox="2 6 60 52" aria-hidden="true"><g transform="rotate(-9 32 17)"><rect class="m-top" x="19" y="11" width="26" height="12" rx="3"/><path class="m-play" d="M30 14.4v5.2a1 1 0 0 0 1.52.86l4.6-2.6a1 1 0 0 0 0-1.72l-4.6-2.6A1 1 0 0 0 30 14.4z"/></g><rect class="m-b" x="19" y="28" width="26" height="12" rx="3"/><rect class="m-b" x="4" y="44" width="26" height="12" rx="3"/><rect class="m-b" x="34" y="44" width="26" height="12" rx="3"/></svg>',
};
const brandMark = (b) => MARK[b.skin] || MARK.glass;

function renderBrands() {
  const box = $('#brands');
  box.hidden = site.brands.length < 2;
  if (box.hidden) { box.replaceChildren(); return; }
  // CSP của trang là style-src 'self' → KHÔNG gán được thuộc tính style="...".
  // Đặt qua CSSOM thì được, và cũng là cách duy nhất chạy trong khung xem trước.
  const thumb = h('span', { class: 'sw-thumb', 'aria-hidden': 'true' });
  thumb.style.setProperty('width', 'calc(' + (100 / site.brands.length) + '% - 4px)');
  thumb.style.setProperty('transform', 'translateX(calc(' + (cur * 100) + '% + ' + (cur * 2) + 'px))');
  box.replaceChildren(
    thumb,
    ...site.brands.map((b, i) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(i === cur), id: 'brand-' + b.id,
      onclick: () => setBrand(i),
      'data-skin': b.skin,
    }, h('span', { class: 'sw-mk', html: brandMark(b) }), h('span', { class: 'sw-tx' }, b.label))));
  box.style.setProperty('--n', String(site.brands.length));
}

function setBrand(i) {
  if (i === cur || !site.brands[i]) return;
  cur = i;
  data = brandDoc(site, cur);
  cohort = cohorts.get(data.id) || null;
  // Link đổi theo để ai copy thanh địa chỉ cũng ra đúng thương hiệu đang xem.
  const u = new URL(location.href);
  if (cur === 0) u.searchParams.delete(BRAND_PARAM); else u.searchParams.set(BRAND_PARAM, site.brands[cur].id);
  if (!PREVIEW) history.replaceState(null, '', u);
  render();
  loadCohort();
  $('#brands').querySelector('[aria-selected="true"]').focus();
}

/** Ô ghim: hiện ở MỌI thương hiệu, nên nằm riêng một khu dưới lưới chính. */
function renderPinned(d) {
  // Mỗi ô ghim tự chọn thương hiệu nào hiện nó (hideIn) — vd. CV chỉ hợp với Finance.
  const links = visibleLinks({ links: d.pinned.filter((l) => !l.hideIn.includes(d.id)) });
  const sec = $('#pinned');
  sec.hidden = !links.length;
  $('#main').classList.toggle('no-pin', !links.length);
  $('#pinGrid').replaceChildren(...links.map(tile));
}

/** Logo và dòng chân trang theo thương hiệu. Để trống thì GIỮ NGUYÊN thứ có sẵn trong index.html
 *  (logo elevaTO) — thương hiệu nào không khai logo riêng thì không bị đụng tới. */
const GOC = new Map();
function renderMark(d) {
  const dat = (sel) => {
    const el = $(sel);
    if (el && !GOC.has(sel)) GOC.set(sel, el.getAttribute('src') || '');
    return el;
  };
  const dat2 = (sel, src) => {
    const el = dat(sel);
    if (el) el.src = safeImg(src) || GOC.get(sel);
  };
  dat2('.logo-light', d.logo.light);
  dat2('.logo-dark', d.logo.dark);
  dat2('.wm-light', d.logo.light);
  dat2('.wm-dark', d.logo.dark);
  const tag = $('.foot-tag');
  if (tag) {
    if (!GOC.has('.foot-tag')) GOC.set('.foot-tag', tag.textContent);
    tag.textContent = d.footTag || GOC.get('.foot-tag');
    // Câu chữ ký này cũng được viết tay lên danh thiếp TMXK ở màn rộng (links.css, .who::after).
    $('.who').dataset.note = tag.textContent;
  }
  const brand = $('.brand');
  if (brand) brand.setAttribute('aria-label', d.label + ' — trang chủ');
}

/** Màu thanh trạng thái của trình duyệt = màu thật ở đỉnh trang (--chrome trong links.css). */
function syncChrome() {
  const mau = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim();
  if (mau) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', mau));
}

/** Độ mờ, độ trong của kính và nền trang — lấy từ data.theme. */
// Phông riêng của TMXK nặng ~190KB nên chỉ nạp khi người xem thật sự mở thương hiệu dùng lớp
// sơn "giấy" — mở thẳng tab Finance thì không tải gì thêm.
let fontPaper = false;
function loadSkinFonts(skin) {
  // Chữ "Content" trên công tắc luôn viết bằng phông TMXK, kể cả khi đang đứng ở Finance → trang có
  // thương hiệu "giấy" là nạp. Trình duyệt chỉ tải đúng mặt chữ có dùng (unicode-range), nên lúc đứng
  // ở Finance chỉ tốn một file Bricolage latin (~77KB, font-display: swap nên không chặn vẽ);
  // phông viết tay để dành tới khi mở tab Content.
  if (site?.brands.some((b) => b.skin === 'paper')) skin = 'paper';
  if (skin !== 'paper' || fontPaper) return;
  fontPaper = true;
  document.head.append(h('link', { rel: 'stylesheet', href: 'fonts/tmxk-fonts.css' }));
}

function applyTheme(t, skin) {
  const root = document.documentElement;
  root.dataset.skin = skin;
  loadSkinFonts(skin);
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
  applyTheme(data.theme, data.skin);
  if (data.meta.title) document.title = data.meta.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc && data.meta.description) desc.setAttribute('content', data.meta.description);
  renderBrands();
  renderMark(data);
  renderCard(data);
  renderGrid(data);
  renderPinned(data);
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
const daGoiCohort = new Set();       // thương hiệu nào đã hỏi máy chủ cấu hình rồi
let daVe = '';                       // nội dung đang hiện, dạng chuẩn
function apply(raw) {
  const json = serialize(raw);
  if (json === daVe) return;         // y hệt thứ đang hiện → khỏi vẽ lại, khỏi nháy
  daVe = json;
  if (!PREVIEW) store.set(DATA_CACHE, raw);
  site = normalize(raw);
  cur = Math.min(cur || pickBrand(), site.brands.length - 1);
  data = brandDoc(site, cur);
  render();
  loadCohort();
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

  // data.json nằm cùng máy chủ với trang nên về sau ~50ms, còn Apps Script mất vài giây. Nếu để
  // data.json vẽ đè lên bản đã lưu lần trước thì người xem quen thấy: đúng → nội dung cũ (vài giây)
  // → đúng trở lại. Bản lưu luôn mới bằng hoặc hơn data.json, nên chỉ dùng data.json khi chưa có gì.
  let fromBackend = false;
  const fileP = loadFile().catch(() => null);
  // Bản trên máy chủ có thể soạn từ trước khi trang có nhiều thương hiệu (chỉ một thương hiệu, chưa có
  // ô ghim). Đem vẽ thẳng thì tab Content biến mất dù repo đã có. Ghép thêm những thương hiệu / ô ghim
  // mà máy chủ chưa biết từ data.json — chữ chủ trang đã đăng giữ nguyên. data.json về rất nhanh (cùng
  // máy chủ với trang) nên chờ nó không làm chậm gì.
  const backend = fetchLinks().then(async (raw) => {
    if (!raw) return raw;
    const f = await fileP;
    fromBackend = true;
    apply(f ? mergeDraft(normalize(raw), normalize(f)) : raw);
    return raw;
  });
  const file = fileP.then((raw) => { if (raw && !fromBackend && !cached) apply(raw); return raw; });
  const [b, f] = await Promise.all([backend, file]);
  // Máy chủ KHÔNG có gì → data.json mới là nguồn đúng, kể cả khi máy người xem đã có bản lưu cũ.
  // Thiếu dòng này thì ai từng mở trang một lần sẽ thấy bản cũ mãi mãi: bản lưu vẽ trước, data.json
  // bị chặn vì "đã có bản lưu rồi", mà máy chủ thì chẳng trả về gì để sửa lại.
  // apply() tự bỏ qua khi nội dung y hệt, nên không gây vẽ lại thừa.
  if (!b && f) apply(f);
  if (b || f || data) return;
  $('#grid').replaceChildren();
  const err = $('#err');
  err.hidden = false;
  err.replaceChildren('Chưa tải được trang. ', h('a', { href: '../' }, 'Mở trang elevaTO'), ' hoặc thử tải lại.');
  $('#main').removeAttribute('aria-busy');
}

/** Mỗi thương hiệu một máy chủ cấu hình riêng → một khoá lưu riêng, không thì số chỗ của lớp này
 *  hiện trên ô của lớp kia. Thương hiệu đầu tiên (elevaTO) vẫn mượn được khoá chung mà trang khoá
 *  học ghi sẵn cùng origin, nên số chỗ có ngay từ nhịp vẽ đầu. */
const cfgKey = (d, i) => (i === 0 ? CFG_CACHE : CFG_CACHE + ':' + d.id);

async function loadCohort() {
  if (!data || !data.live.enabled) return;
  const khoa = cfgKey(data, cur);
  const id = data.id;
  const cached = store.get(khoa);
  if (cached && !cohort) { cohort = cohortInfo(cached); cohorts.set(id, cohort); render(); }
  const api = safeUrl(data.live.api);
  if (!/^https:\/\/script\.google\.com\//.test(api)) return;
  if (daGoiCohort.has(id)) return;     // mỗi thương hiệu chỉ hỏi máy chủ một lần cho mỗi lượt mở trang
  daGoiCohort.add(id);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIVE_TIMEOUT_MS);
  try {
    const r = await fetch(api + '?action=config&t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
    const d = await r.json();
    if (!d || !d.ok || !d.config) return;
    store.set(khoa, d.config);
    const info = cohortInfo(d.config);
    cohorts.set(id, info);
    if (data && data.id === id) { cohort = info; render(); }   // đổi tab giữa chừng thì khỏi vẽ đè
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
      site = normalize(m.data);
      cur = Math.min(Math.max(0, Math.trunc(m.brand) || 0), site.brands.length - 1);
      data = brandDoc(site, cur);
      render();
      if (firstLive) loadCohort();
    });
    window.parent.postMessage({ type: 'elevato-links:ready' }, location.origin);
  }

  loadData();
}

boot();
