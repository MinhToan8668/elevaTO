// Trình chỉnh sửa trang link-in-bio: sửa bản nháp (lưu trên máy), xem trước trực tiếp, đăng lên GitHub.

import { normalize, serialize, newId, hiddenReason, ACCENTS, SOCIALS } from './core.js';
import { svg, TILE_ICONS } from './icons.js';
import { h, field, toggle, segmented, iconPicker, swatches, iconBtn, panel } from './edit-ui.js';
import { DEFAULT_REPO, publish, checkAccess } from './github.js';

const $ = (s) => document.querySelector(s);
const DRAFT_KEY = 'elevato-links-draft';
const REPO_KEY = 'elevato-links-repo';
const TOKEN_KEY = 'elevato-links-token';
const PREVIEW_DEBOUNCE_MS = 150;

let draft = null;        // bản đang sửa (dạng chuẩn)
let published = '';      // nội dung data.json đang chạy trên web, để biết có thay đổi chưa đăng
let openLink = '';       // id ô đang mở rộng trong danh sách

/* ── lưu trữ trên máy ─────────────────────────── */
const ls = {
  get(k, s = localStorage) { try { return JSON.parse(s.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy / chế độ riêng tư */ } },
  del(k, s = localStorage) { try { s.removeItem(k); } catch (e) { /* bỏ qua */ } },
};
const repoCfg = () => ({ ...DEFAULT_REPO, ...(ls.get(REPO_KEY) || {}) });
const getToken = () => ls.get(TOKEN_KEY, sessionStorage) || ls.get(TOKEN_KEY) || '';

/* ── cập nhật bản nháp ────────────────────────── */
// Mỗi thay đổi tạo bản sao mới (không sửa đè object cũ), rồi lưu nháp + đẩy sang khung xem trước.
function update(fn, { rerender = false } = {}) {
  const next = structuredClone(draft);
  fn(next);
  draft = next;
  ls.set(DRAFT_KEY, draft);
  markDirty();
  schedulePreview();
  if (rerender) renderForm();
}

function markDirty() {
  const el = $('#dirty');
  const changed = serialize(draft) !== published;
  el.textContent = changed ? 'Có thay đổi chưa đăng · nháp đã lưu trên máy này' : 'Đang khớp với bản trên web';
  el.classList.toggle('on', changed);
}

let prevT = 0;
function schedulePreview() {
  clearTimeout(prevT);
  prevT = setTimeout(sendPreview, PREVIEW_DEBOUNCE_MS);
}
function sendPreview() {
  const w = $('#frame').contentWindow;
  if (w && draft) w.postMessage({ type: 'elevato-links:data', data: draft }, location.origin);
}

/* ── các phần của form ────────────────────────── */
function profilePanel() {
  const p = draft.profile;
  const set = (k) => (v) => update((d) => { d.profile[k] = v; });
  return panel('Hồ sơ', 'Ảnh, tên, một dòng giới thiệu', true,
    h('div', { class: 'cols' },
      field('Tên hiển thị', p.name, set('name'), { max: 80 }),
      field('Handle', p.handle, set('handle'), { placeholder: '@toanelevato', max: 60 })),
    field('Giới thiệu ngắn', p.tagline, set('tagline'), { multiline: true, rows: 2, max: 200, wide: true }),
    field('Ảnh đại diện (link ảnh)', p.avatar, set('avatar'), { type: 'url', hint: 'Link ảnh https://… hoặc ảnh có sẵn trong repo, ví dụ ../assets/instructor-sm.webp', wide: true }),
    field('Dòng trạng thái', p.status, set('status'), { max: 80, placeholder: 'Ví dụ: Đang mở lịch Coffee Connect',
      hint: 'Để trống: tự hiện trạng thái cohort (nếu không có ô nổi bật nào đang hiện số chỗ).', wide: true }),
    toggle('Hiện dấu tích xanh cạnh tên', p.verified, set('verified')));
}

function statsPanel() {
  const rows = draft.stats.map((s, i) => h('div', { class: 'row' },
    field('Số', s.value, (v) => update((d) => { d.stats[i].value = v; }), { max: 16, placeholder: '2.5+' }),
    field('Nhãn', s.label, (v) => update((d) => { d.stats[i].label = v; }), { max: 40, placeholder: 'năm M&A' }),
    iconBtn('trash', 'Xoá dòng này', () => update((d) => { d.stats.splice(i, 1); }, { rerender: true }), 'danger')));
  const add = draft.stats.length < 4
    ? h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm số liệu</span>',
      onclick: () => update((d) => { d.stats.push({ value: '', label: '' }); }, { rerender: true }) })
    : null;
  return panel('Số liệu nổi bật', 'Tối đa 4 ô, hiện ngay dưới tên', false, ...rows, add);
}

function socialsPanel() {
  const types = Object.entries(SOCIALS).map(([k, v]) => [k, v.label]);
  const rows = draft.socials.map((s, i) => {
    const sel = h('select', { class: 'inp', 'aria-label': 'Loại' }, ...types.map(([k, label]) => h('option', { value: k }, label)));
    sel.value = s.type;
    sel.addEventListener('change', () => update((d) => { d.socials[i].type = sel.value; }, { rerender: true }));
    return h('div', { class: 'row social' },
      h('span', { class: 'soc-ic', html: svg(SOCIALS[s.type].icon) }),
      h('div', { class: 'fld' }, sel),
      field('', s.url, (v) => update((d) => { d.socials[i].url = v; }), { placeholder: placeholderFor(s.type), aria: 'Link ' + SOCIALS[s.type].label }),
      iconBtn('up', 'Lên trên', () => move(draft.socials, i, -1, 'socials'), i === 0 ? 'ghosted' : ''),
      iconBtn('trash', 'Xoá', () => update((d) => { d.socials.splice(i, 1); }, { rerender: true }), 'danger'));
  });
  return panel('Mạng xã hội', 'Ô nào để trống sẽ tự ẩn', false, ...rows,
    h('small', { class: 'hint block' }, 'Gõ link đầy đủ, hoặc chỉ cần handle (@ten) / số điện thoại Zalo — trang tự đổi thành link.'),
    h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm mạng xã hội</span>',
      onclick: () => update((d) => { d.socials.push({ type: 'website', url: '' }); }, { rerender: true }) }));
}
function placeholderFor(type) {
  return { tiktok: '@financewithto', facebook: 'facebook.com/ten-cua-ban', linkedin: 'linkedin.com/in/ten', zalo: '09xx xxx xxx',
    email: 'ban@email.com', phone: '09xx xxx xxx', telegram: '@ten' }[type] || 'https://…';
}

function move(list, i, dir, key) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  update((d) => { const a = d[key]; [a[i], a[j]] = [a[j], a[i]]; }, { rerender: true });
}

function linkCard(l, i) {
  const reason = hiddenReason(l);
  const open = openLink === l.id;
  const set = (k) => (v) => update((d) => { d.links[i][k] = v; });
  const setRe = (k) => (v) => update((d) => { d.links[i][k] = v; }, { rerender: true });
  const setDet = (k) => (v) => update((d) => { d.links[i].details[k] = v; });

  const head = h('div', { class: 'lc-head' },
    h('button', { type: 'button', class: 'lc-toggle', 'aria-expanded': String(open),
      onclick: () => { openLink = open ? '' : l.id; renderForm(); } },
      h('span', { class: 'chip sm', html: svg(l.icon) }),
      h('span', { class: 'lc-name' }, h('b', {}, l.title || 'Ô chưa đặt tên'),
        h('small', {}, { feature: 'Nổi bật', wide: 'Ngang', half: 'Nửa ô' }[l.size] + (l.url ? ' · ' + l.url : ''))),
      reason ? h('span', { class: 'warn' }, reason) : null),
    h('div', { class: 'lc-tools' },
      iconBtn('up', 'Lên trên', () => move(draft.links, i, -1, 'links'), i === 0 ? 'ghosted' : ''),
      iconBtn('down', 'Xuống dưới', () => move(draft.links, i, 1, 'links'), i === draft.links.length - 1 ? 'ghosted' : ''),
      iconBtn('copy', 'Nhân bản', () => update((d) => { d.links.splice(i + 1, 0, { ...structuredClone(l), id: newId(), title: l.title + ' (bản sao)' }); }, { rerender: true })),
      iconBtn('trash', 'Xoá ô', () => { if (confirm('Xoá ô "' + (l.title || 'chưa đặt tên') + '"?')) update((d) => { d.links.splice(i, 1); }, { rerender: true }); }, 'danger')));
  head.querySelector('.chip').style.setProperty('--ac', ACCENTS[l.accent]);

  const card = h('div', { class: 'lc' + (open ? ' open' : '') + (reason ? ' off' : '') }, head);
  if (!open) return card;

  const isFeature = l.size === 'feature';
  const sheet = l.details.enabled;
  card.append(h('div', { class: 'lc-body' },
    h('div', { class: 'cols' },
      field('Tiêu đề', l.title, (v) => { set('title')(v); head.querySelector('.lc-name b').textContent = v || 'Ô chưa đặt tên'; }, { max: 80 }),
      field('Nhãn góc', l.badge, set('badge'), { max: 12, placeholder: 'Mới / Free / Hot', hint: 'Để trống nếu không cần' })),
    field('Mô tả ngắn', l.subtitle, set('subtitle'), { max: 160, wide: true }),
    field('Link khi bấm', l.url, set('url'), { type: 'url', placeholder: 'https://…', wide: true,
      hint: 'Link bất kỳ: Google Drive, Zalo (https://zalo.me/09…), form, trang khác… Để trống thì ô tự ẩn.' }),
    segmented('Kiểu ô', l.size, [['feature', 'Nổi bật (to nhất)'], ['wide', 'Ngang cả hàng'], ['half', 'Nửa hàng']], setRe('size')),
    iconPicker(l.icon, TILE_ICONS, setRe('icon')),
    swatches(l.accent, ACCENTS, setRe('accent')),
    field('Ảnh thay cho icon (tuỳ chọn)', l.image, set('image'), { type: 'url', wide: true, placeholder: 'https://… hoặc ../assets/…' }),
    isFeature ? h('div', { class: 'cols' },
      field('Chữ trên nút', l.cta, set('cta'), { max: 30, placeholder: 'Giữ chỗ' }),
      field('Link của nút', l.ctaUrl, set('ctaUrl'), { type: 'url', placeholder: 'Để trống = giống link ô', hint: '../#dang-ky mở thẳng form đăng ký' })) : null,
    isFeature ? toggle('Hiện số chỗ cohort trực tiếp', l.live, set('live'), 'Lấy từ bot Telegram, giống trang khoá học.') : null,
    segmented('Khi bấm vào ô', sheet ? 'sheet' : 'link', [['link', 'Mở link ngay'], ['sheet', 'Hiện thẻ chi tiết trước']],
      (v) => update((d) => { d.links[i].details.enabled = v === 'sheet'; }, { rerender: true })),
    sheet ? field('Đoạn giới thiệu', l.details.text, setDet('text'), { multiline: true, rows: 3, max: 600, wide: true }) : null,
    sheet ? field('Gạch đầu dòng (mỗi dòng một ý)', l.details.bullets.join('\n'),
      (v) => update((d) => { d.links[i].details.bullets = v.split('\n').map((x) => x.trim()).filter(Boolean); }),
      { multiline: true, rows: 4, wide: true }) : null,
    sheet ? field('Chữ trên nút trong thẻ', l.details.button, setDet('button'), { max: 30, placeholder: 'Mở link' }) : null,
    toggle('Tạm ẩn ô này', l.hidden, setRe('hidden'))));
  return card;
}

function linksPanel() {
  const list = h('div', { class: 'lcs' }, ...draft.links.map(linkCard));
  const add = h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm ô link</span>', onclick: () => {
    const id = newId();
    openLink = id;
    update((d) => { d.links.push({ ...normalize({ links: [{}] }).links[0], id, title: 'Ô mới', size: 'half', icon: 'link' }); }, { rerender: true });
  } });
  return panel('Các ô link', 'Thứ tự trong danh sách = thứ tự trên trang', true, list, add);
}

function livePanel() {
  return panel('Số chỗ cohort trực tiếp', 'Đọc từ backend Apps Script của trang khoá học', false,
    toggle('Bật', draft.live.enabled, (v) => update((d) => { d.live.enabled = v; })),
    field('URL Web App (/exec)', draft.live.api, (v) => update((d) => { d.live.api = v; }), { type: 'url', wide: true,
      hint: 'Giống URL trong index.html của trang khoá học. Đổi cohort, số chỗ bằng bot Telegram như cũ.' }));
}

function metaPanel() {
  return panel('Khi chia sẻ link', 'Tiêu đề tab và mô tả', false,
    field('Tiêu đề', draft.meta.title, (v) => update((d) => { d.meta.title = v; }), { max: 120, wide: true }),
    field('Mô tả', draft.meta.description, (v) => update((d) => { d.meta.description = v; }), { multiline: true, rows: 2, max: 300, wide: true }));
}

function githubPanel() {
  const r = repoCfg();
  const setRepo = (k) => (v) => ls.set(REPO_KEY, { ...repoCfg(), [k]: v.trim() });
  const remembered = Boolean(ls.get(TOKEN_KEY));
  const tok = field('Token GitHub', getToken(), (v) => saveToken(v.trim(), remember.querySelector('input').checked),
    { type: 'password', placeholder: 'github_pat_…', wide: true });
  tok.querySelector('input').id = 'tokenInput';
  tok.querySelector('label').setAttribute('for', 'tokenInput');
  const remember = toggle('Nhớ token trên máy này', remembered, (v) => saveToken(getToken(), v),
    'Tắt (khuyên dùng): token mất khi đóng tab. Bật thì token nằm trong trình duyệt, mọi trang trên minhtoan8668.github.io đọc được — chỉ bật trên máy riêng và đặt hạn ngắn cho token.');
  const status = h('p', { class: 'gh-status', id: 'ghStatus', role: 'status' });
  return panel('Đăng lên web', 'Kết nối GitHub một lần', !getToken(),
    h('ol', { class: 'steps' },
      h('li', {}, 'Mở ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → tạo Fine-grained token'), '.'),
      h('li', {}, 'Repository access: ', h('b', {}, 'Only select repositories'), ' → chọn ', h('b', {}, r.repo), '.'),
      h('li', {}, 'Permissions → Repository → ', h('b', {}, 'Contents: Read and write'), '. Tạo token, copy dán vào dưới.')),
    tok, remember,
    h('div', { class: 'cols three' },
      field('Chủ repo', r.owner, setRepo('owner')),
      field('Repo', r.repo, setRepo('repo')),
      field('Nhánh', r.branch, setRepo('branch'))),
    h('div', { class: 'gh-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: testConnection }, 'Kiểm tra kết nối'),
      status));
}
function saveToken(token, remember) {
  ls.del(TOKEN_KEY); ls.del(TOKEN_KEY, sessionStorage);
  if (token) ls.set(TOKEN_KEY, token, remember ? localStorage : sessionStorage);
}
async function testConnection() {
  const st = $('#ghStatus');
  const token = getToken();
  if (!token) { st.textContent = 'Chưa có token.'; st.className = 'gh-status bad'; return; }
  st.textContent = 'Đang kiểm tra…'; st.className = 'gh-status';
  try {
    const { canPush } = await checkAccess(repoCfg(), token);
    st.textContent = canPush ? 'Kết nối được, có quyền ghi ✓' : 'Đọc được repo nhưng chưa có quyền ghi — bật Contents: Read and write.';
    st.className = 'gh-status ' + (canPush ? 'ok' : 'bad');
  } catch (e) { st.textContent = e.message; st.className = 'gh-status bad'; }
}

function backupPanel() {
  return panel('Sao lưu', 'Tải về / nạp lại file dữ liệu', false,
    h('div', { class: 'gh-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: exportJson }, 'Tải data.json'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => $('#importFile').click() }, 'Nạp file JSON'),
      h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: resetDraft }, 'Bỏ nháp, lấy bản trên web')));
}

function renderForm() {
  const form = $('#form');
  const y = form.scrollTop;
  const openState = [...form.querySelectorAll('details.panel')].map((d) => d.open);
  form.replaceChildren(profilePanel(), linksPanel(), socialsPanel(), statsPanel(), livePanel(), metaPanel(), githubPanel(), backupPanel());
  // Giữ nguyên phần nào đang mở / đang đóng sau khi vẽ lại.
  if (openState.length) form.querySelectorAll('details.panel').forEach((d, i) => { d.open = openState[i]; });
  form.scrollTop = y;
}

/* ── đăng, sao lưu ────────────────────────────── */
async function doPublish() {
  const token = getToken();
  if (!token) {
    toast('Cần kết nối GitHub trước — dán token ở mục "Đăng lên web".');
    const ghPanel = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('#tokenInput'));
    if (ghPanel) { ghPanel.open = true; ghPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    setTimeout(() => $('#tokenInput') && $('#tokenInput').focus(), 400);
    return;
  }
  // Chặn lỡ tay đăng một trang trống đè lên trang thật (ví dụ khi data.json không tải được).
  if (!draft.links.length && !confirm('Trang đang không có ô link nào. Vẫn đăng lên web?')) return;
  const btn = $('#publishBtn');
  btn.disabled = true;
  btn.textContent = 'Đang đăng…';
  const content = serialize(draft);
  try {
    await publish(repoCfg(), token, content, 'links: cập nhật trang link-in-bio');
    published = content;
    markDirty();
    toast('Đã đăng ✓ Trang cập nhật sau khoảng 1 phút.');
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đăng lên web';
  }
}

function exportJson() {
  const blob = new Blob([serialize(draft)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'data.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function importJson(file) {
  try {
    const raw = JSON.parse(await file.text());
    draft = normalize(raw);
    ls.set(DRAFT_KEY, draft);
    renderForm(); markDirty(); sendPreview();
    toast('Đã nạp file. Bấm Đăng lên web để áp dụng.');
  } catch (e) {
    toast('File không đúng định dạng JSON.');
  }
}

async function resetDraft() {
  if (!confirm('Bỏ mọi thay đổi chưa đăng và lấy lại bản đang chạy trên web?')) return;
  // Tải được bản trên web rồi mới xoá nháp — mạng lỗi giữa chừng thì không mất gì.
  if (!(await loadPublished())) { toast('Không tải được bản trên web. Nháp vẫn giữ nguyên, thử lại sau.'); return; }
  ls.del(DRAFT_KEY);
  draft = normalize(JSON.parse(published));
  renderForm(); markDirty(); sendPreview();
}

/* ── khung chung ──────────────────────────────── */
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 3600);
}

function setTab(prev) {
  $('#tabEdit').setAttribute('aria-selected', String(!prev));
  $('#tabPrev').setAttribute('aria-selected', String(prev));
  document.body.classList.toggle('show-prev', prev);
}

/** Tải bản đang chạy trên web. Lỗi thì giữ nguyên `published` cũ và trả false. */
async function loadPublished() {
  try {
    const r = await fetch('data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    published = serialize(await r.json());
    return true;
  } catch (e) {
    return false;
  }
}

async function boot() {
  $('#themeBtn .i-sun').outerHTML = svg('sun', 'i-sun');
  $('#themeBtn .i-moon').outerHTML = svg('moon', 'i-moon');
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('elevato-theme', next); } catch (e) { /* bỏ qua */ }
    const fr = $('#frame').contentDocument;
    if (fr) fr.documentElement.setAttribute('data-theme', next);
  });
  $('#publishBtn').addEventListener('click', doPublish);
  $('#tabEdit').addEventListener('click', () => setTab(false));
  $('#tabPrev').addEventListener('click', () => setTab(true));
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'elevato-links:ready') sendPreview();
  });
  const ok = await loadPublished();
  const saved = ls.get(DRAFT_KEY);
  if (!ok) toast(saved ? 'Không tải được bản trên web — đang sửa tiếp bản nháp trên máy.' : 'Không tải được data.json. Tải lại trang để thử lại.');
  draft = normalize(saved || JSON.parse(published || '{}'));
  renderForm();
  markDirty();
  sendPreview();
}

boot();
