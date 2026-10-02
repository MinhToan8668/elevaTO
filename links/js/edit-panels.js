// Các phần của form chỉnh sửa: hồ sơ, giao diện kính, từng ô link, mạng xã hội, số liệu, chia sẻ, sao lưu.
// Mỗi phần đọc bản nháp hiện tại và gọi update() để sửa; renderForm() vẽ lại cả form.

import { $, h, store, toast } from './dom.js';
import { normalize, serialize, newId, hiddenReason, safeImg, glassIconFor,
  ACCENTS, ACCENT_LABELS, SOCIALS, ICON_LIBRARY, BACKGROUNDS } from './core.js';
import * as iconify from './iconify.js';
import { svg, TILE_ICONS } from './icons.js';
import { field, toggle, segmented, iconPicker, swatches, iconBtn, panel, slider, imageField } from './edit-ui.js';
import { fileToDataUrl, pickFile, dataUrlKb } from './image.js';
import { ed, setDraft, replaceDraft, loadPublished, DRAFT_KEY } from './edit-state.js';
import { publishPanel } from './edit-publish.js';

/** Sửa bản nháp; rerender khi thay đổi làm form đổi cấu trúc (thêm / xoá dòng, bật tắt mục con…). */
function update(fn, { rerender = false } = {}) {
  setDraft(fn);
  if (rerender) renderForm();
}

/* ── ảnh từ máy ───────────────────────────────── */
const BIG_IMAGE_KB = 250;
async function pick(opts) {
  const file = await pickFile();
  if (!file) return '';
  try {
    const url = await fileToDataUrl(file, opts);
    const kb = dataUrlKb(url);
    toast(kb > BIG_IMAGE_KB ? `Ảnh hơi nặng (${kb} KB) — trang sẽ tải chậm hơn chút.` : `Đã thêm ảnh (${kb} KB).`);
    return url;
  } catch (e) {
    toast(e.message);
    return '';
  }
}

/* ── hồ sơ, số liệu, mạng xã hội ──────────────── */
function profilePanel() {
  const p = ed.draft.profile;
  const set = (k) => (v) => update((d) => { d.profile[k] = v; });
  return panel('Hồ sơ', 'Ảnh, tên, một dòng giới thiệu', true,
    h('div', { class: 'cols' },
      field('Tên hiển thị', p.name, set('name'), { max: 80 }),
      field('Handle', p.handle, set('handle'), { placeholder: '@toanelevato', max: 60 })),
    field('Giới thiệu ngắn', p.tagline, set('tagline'), { multiline: true, rows: 2, max: 200, wide: true }),
    imageField('Ảnh đại diện', p.avatar, (v, re) => update((d) => { d.profile.avatar = v; }, { rerender: re }),
      { round: true, onPick: () => pick({ maxSide: 420, square: true }), sets: [{ label: 'Ảnh có sẵn', style: 'photo', items: { '../assets/instructor-sm.webp': 'Ảnh hiện tại' } }] }),
    field('Dòng trạng thái', p.status, set('status'), { max: 80, placeholder: 'Ví dụ: Đang mở lịch Coffee Connect',
      hint: 'Để trống: tự hiện trạng thái cohort (nếu không có ô nổi bật nào đang hiện số chỗ).', wide: true }),
    toggle('Hiện dấu tích xanh cạnh tên', p.verified, set('verified')));
}

function statsPanel() {
  const rows = ed.draft.stats.map((s, i) => h('div', { class: 'row' },
    field('Số', s.value, (v) => update((d) => { d.stats[i].value = v; }), { max: 16, placeholder: '2.5+' }),
    field('Nhãn', s.label, (v) => update((d) => { d.stats[i].label = v; }), { max: 40, placeholder: 'năm M&A' }),
    iconBtn('trash', 'Xoá dòng này', () => update((d) => { d.stats.splice(i, 1); }, { rerender: true }), 'danger')));
  const add = ed.draft.stats.length < 4
    ? h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm số liệu</span>',
      onclick: () => update((d) => { d.stats.push({ value: '', label: '' }); }, { rerender: true }) })
    : null;
  return panel('Số liệu nổi bật', 'Tối đa 4 ô, hiện ngay dưới tên', false, ...rows, add);
}

function socialsPanel() {
  const types = Object.entries(SOCIALS).map(([k, v]) => [k, v.label]);
  const rows = ed.draft.socials.map((s, i) => {
    const sel = h('select', { class: 'inp', 'aria-label': 'Loại' }, ...types.map(([k, label]) => h('option', { value: k }, label)));
    sel.value = s.type;
    sel.addEventListener('change', () => update((d) => { d.socials[i].type = sel.value; }, { rerender: true }));
    return h('div', { class: 'row social' },
      h('span', { class: 'soc-ic', html: svg(SOCIALS[s.type].icon) }),
      h('div', { class: 'fld' }, sel),
      field('', s.url, (v) => update((d) => { d.socials[i].url = v; }), { placeholder: placeholderFor(s.type), aria: 'Link ' + SOCIALS[s.type].label }),
      iconBtn('up', 'Lên trên', () => move('socials', i, -1), i === 0 ? 'ghosted' : ''),
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

/** Đổi chỗ một dòng trong danh sách (links / socials) lên hoặc xuống. */
function move(key, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= ed.draft[key].length) return;
  update((d) => { const a = d[key]; [a[i], a[j]] = [a[j], a[i]]; }, { rerender: true });
}

/* ── từng ô link ──────────────────────────────── */
const SIZE_LABEL = { feature: 'Nổi bật', wide: 'Ngang', half: 'Nửa ô' };

/** Dòng đầu của thẻ: chip icon, tên, cảnh báo ô đang ẩn, và các nút sắp xếp / nhân bản / xoá. */
function linkHead(l, i, open) {
  const chip = safeImg(l.image)
    ? h('span', { class: 'chip sm ' + (l.imageStyle === 'icon' ? 'ico' : 'img') }, h('img', { src: safeImg(l.image), alt: '' }))
    : h('span', { class: 'chip sm', html: svg(l.icon) });
  chip.style.setProperty('--ac', ACCENTS[l.accent]);
  const reason = hiddenReason(l);
  return h('div', { class: 'lc-head' },
    h('button', { type: 'button', class: 'lc-toggle', 'aria-expanded': String(open), 'data-fk': 'lc|' + l.id,
      onclick: () => { ed.openLink = open ? '' : l.id; renderForm(); } },
      chip,
      h('span', { class: 'lc-name' }, h('b', {}, l.title || 'Ô chưa đặt tên'),
        h('small', {}, SIZE_LABEL[l.size] + (l.url ? ' · ' + l.url : ''))),
      reason ? h('span', { class: 'warn' }, reason) : null),
    h('div', { class: 'lc-tools' },
      iconBtn('up', 'Lên trên', () => move('links', i, -1), i === 0 ? 'ghosted' : '', 'up|' + l.id),
      iconBtn('down', 'Xuống dưới', () => move('links', i, 1), i === ed.draft.links.length - 1 ? 'ghosted' : '', 'down|' + l.id),
      iconBtn('copy', 'Nhân bản', () => update((d) => { d.links.splice(i + 1, 0, { ...structuredClone(l), id: newId(), title: l.title + ' (bản sao)' }); }, { rerender: true }), '', 'copy|' + l.id),
      iconBtn('trash', 'Xoá ô', () => { if (confirm('Xoá ô "' + (l.title || 'chưa đặt tên') + '"?')) update((d) => { d.links.splice(i, 1); }, { rerender: true }); }, 'danger')));
}

function linkCard(l, i) {
  const open = ed.openLink === l.id;
  const head = linkHead(l, i, open);
  const card = h('div', { class: 'lc' + (open ? ' open' : '') + (hiddenReason(l) ? ' off' : '') }, head);
  if (!open) return card;

  const set = (k) => (v) => update((d) => { d.links[i][k] = v; });
  const setRe = (k) => (v) => update((d) => { d.links[i][k] = v; }, { rerender: true });
  const setDet = (k) => (v) => update((d) => { d.links[i].details[k] = v; });
  const chip = head.querySelector('.chip');
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
    imageField('Icon / ảnh của ô', l.image,
      (v, re, style) => update((d) => { d.links[i].image = v; if (style) d.links[i].imageStyle = style; }, { rerender: re }),
      { sets: ICON_LIBRARY, iconify, style: l.imageStyle,
        onStyle: setRe('imageStyle'),
        onPick: () => pick({ maxSide: 256, square: true }),
        hint: 'Bộ icon elevaTO: vẽ riêng kiểu Liquid Glass. Icon 3D: Fluent Emoji của Microsoft. Bộ icon cũ: bản trước. Tìm icon: thư viện Iconify. Ảnh từ máy được tự cắt vuông, thu nhỏ. Bỏ ảnh thì ô dùng icon nét.',
        tools: [['Iconify', 'https://icon-sets.iconify.design/'], ['Canva', 'https://www.canva.com/'], ['Flaticon', 'https://www.flaticon.com/'],
          ['Icons8', 'https://icons8.com/icons'], ['Fluent Emoji 3D', 'https://github.com/microsoft/fluentui-emoji']] }),
    // Đổi icon nét / màu nhấn chỉ ảnh hưởng chip ở đầu thẻ → sửa tại chỗ, không vẽ lại cả form
    // (vẽ lại sẽ đóng mất ngăn chọn icon đang mở).
    l.image ? null : iconPicker(l.icon, TILE_ICONS, (v) => { set('icon')(v); chip.innerHTML = svg(v); }),
    swatches(l.accent, ACCENTS, ACCENT_LABELS, (v) => { set('accent')(v); chip.style.setProperty('--ac', ACCENTS[v]); }),
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
  const list = h('div', { class: 'lcs' }, ...ed.draft.links.map(linkCard));
  const add = h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm ô link</span>', onclick: () => {
    const id = newId();
    ed.openLink = id;
    update((d) => { d.links.push({ ...normalize({ links: [{}] }).links[0], id, title: 'Ô mới', size: 'half', icon: 'link' }); }, { rerender: true });
  } });
  const sync = h('button', { type: 'button', class: 'btn btn-ghost sm', onclick: useGlassIcons },
    'Dùng bộ icon elevaTO cho tất cả ô');
  return panel('Các ô link', 'Thứ tự trong danh sách = thứ tự trên trang', true,
    h('div', { class: 'gh-row' }, sync, h('small', { class: 'hint' }, 'Đổi icon của mọi ô sang bộ elevaTO; chữ và link giữ nguyên.')),
    list, add);
}

function useGlassIcons() {
  let n = 0;
  update((d) => {
    d.links.forEach((l) => {
      const icon = glassIconFor(l);
      if (icon && (l.image !== icon || l.imageStyle !== 'photo')) { l.image = icon; l.imageStyle = 'photo'; n += 1; }
    });
  }, { rerender: true });
  toast(n ? `Đã đổi icon ${n} ô sang bộ elevaTO. Bấm Đăng lên web để web cập nhật.` : 'Các ô đã dùng bộ icon elevaTO rồi.');
}

/* ── giao diện, cohort, chia sẻ ────────────────── */
function themePanel() {
  const t = ed.draft.theme;
  const setT = (k, re = false) => (v) => update((d) => { d.theme[k] = v; }, { rerender: re });
  return panel('Giao diện kính', 'Độ mờ, độ trong, hình nền', true,
    slider('Độ mờ của kính (blur)', t.blur, 0, 48, 'px', setT('blur'), '0 = kính trong suốt hẳn, càng lớn càng mờ như kính mờ iPhone.'),
    slider('Độ đục của kính', t.tint, 5, 95, '%', setT('tint'), 'Thấp = trong, nhìn rõ nền phía sau. Cao = trắng/đen đặc hơn, chữ dễ đọc hơn.'),
    segmented('Hình nền', t.background, Object.entries(BACKGROUNDS), setT('background', true)),
    t.background === 'image'
      ? imageField('Ảnh nền', t.bgImage, (v, re) => update((d) => { d.theme.bgImage = v; }, { rerender: re }),
        { onPick: () => pick({ maxSide: 1600, quality: 0.78 }), hint: 'Ảnh phong cảnh, ảnh thành phố… kính trông đẹp nhất trên ảnh nhiều chi tiết.' })
      : null);
}

function livePanel() {
  return panel('Số chỗ cohort trực tiếp', 'Đọc từ backend Apps Script của trang khoá học', false,
    toggle('Bật', ed.draft.live.enabled, (v) => update((d) => { d.live.enabled = v; })),
    field('URL Web App (/exec)', ed.draft.live.api, (v) => update((d) => { d.live.api = v; }), { type: 'url', wide: true,
      hint: 'Giống URL trong index.html của trang khoá học. Đổi cohort, số chỗ bằng bot Telegram như cũ.' }));
}

function metaPanel() {
  return panel('Khi chia sẻ link', 'Tiêu đề tab và mô tả', false,
    field('Tiêu đề', ed.draft.meta.title, (v) => update((d) => { d.meta.title = v; }), { max: 120, wide: true }),
    field('Mô tả', ed.draft.meta.description, (v) => update((d) => { d.meta.description = v; }), { multiline: true, rows: 2, max: 300, wide: true }));
}

/* ── sao lưu ──────────────────────────────────── */
function backupPanel() {
  return panel('Sao lưu', 'Tải về / nạp lại file dữ liệu', false,
    h('div', { class: 'gh-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: exportJson }, 'Tải data.json'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => $('#importFile').click() }, 'Nạp file JSON'),
      h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: resetDraft }, 'Bỏ nháp, lấy bản trên web')));
}

function exportJson() {
  const blob = new Blob([serialize(ed.draft)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'data.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function importJson(file) {
  try {
    replaceDraft(JSON.parse(await file.text()));
    renderForm();
    toast('Đã nạp file. Bấm Đăng lên web để áp dụng.');
  } catch (e) {
    toast('File không đúng định dạng JSON.');
  }
}

async function resetDraft() {
  if (!confirm('Bỏ mọi thay đổi chưa đăng và lấy lại bản đang chạy trên web?')) return;
  // Tải được bản trên web rồi mới xoá nháp — mạng lỗi giữa chừng thì không mất gì.
  if (!(await loadPublished())) { toast('Không tải được bản trên web. Nháp vẫn giữ nguyên, thử lại sau.'); return; }
  replaceDraft(JSON.parse(ed.published));
  store.del(DRAFT_KEY);        // không còn nháp nữa: mở lại trang là lấy thẳng bản trên web
  renderForm();
}

/* ── vẽ lại cả form ───────────────────────────── */
export function renderForm() {
  const form = $('#form');
  const y = form.scrollTop;
  const openState = [...form.querySelectorAll('details.panel')].map((d) => d.open);
  // Nhiều nút (chọn kiểu ô, mở thẻ một ô, chuyển thứ tự…) vẽ lại cả form → nhớ nút đang đứng để trả con trỏ
  // bàn phím về, không thì mỗi lần bấm là phải Tab lại từ đầu form.
  const focused = document.activeElement;
  const fk = focused && focused.dataset ? focused.dataset.fk || '' : '';
  form.replaceChildren(profilePanel(), themePanel(), linksPanel(), socialsPanel(), statsPanel(),
    livePanel(), metaPanel(), publishPanel(), backupPanel());
  // Giữ nguyên phần nào đang mở / đang đóng sau khi vẽ lại.
  if (openState.length) form.querySelectorAll('details.panel').forEach((d, i) => { d.open = openState[i]; });
  if (fk) {
    const again = form.querySelector('[data-fk="' + CSS.escape(fk) + '"]');
    if (again) again.focus({ preventScroll: true });
  }
  form.scrollTop = y;
}
