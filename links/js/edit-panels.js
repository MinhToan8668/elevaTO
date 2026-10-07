// Các phần của form chỉnh sửa: hồ sơ, giao diện kính, từng ô link, mạng xã hội, số liệu, chia sẻ, sao lưu.
// Mỗi phần đọc bản nháp hiện tại và gọi update() để sửa; renderForm() vẽ lại cả form.

import { $, h, store, toast } from './dom.js';
import { normalize, serialize, newId, hiddenReason, safeImg, glassIconFor,
  ACCENTS, ACCENT_LABELS, SOCIALS, ICON_LIBRARY, BACKGROUNDS, SKINS } from './core.js';
import * as iconify from './iconify.js';
import { svg, TILE_ICONS } from './icons.js';
import { field, toggle, segmented, iconPicker, swatches, iconBtn, panel, slider, imageField } from './edit-ui.js';
import { fileToDataUrl, pickFile, dataUrlKb } from './image.js';
import { ed, setDraft, setBrandField, replaceDraft, loadPublished, sendPreview, B, DRAFT_KEY } from './edit-state.js';
import { publishPanel } from './edit-publish.js';

/** Sửa bản nháp; rerender khi thay đổi làm form đổi cấu trúc (thêm / xoá dòng, bật tắt mục con…). */
function update(fn, { rerender = false } = {}) {
  setDraft(fn);
  if (rerender) renderForm();
}

/** Sửa thứ thuộc về RIÊNG thương hiệu đang mở (ô link, số liệu, giao diện, dòng giới thiệu…). */
function updateB(fn, { rerender = false } = {}) {
  setBrandField(fn);
  if (rerender) renderForm();
}

// Hai danh sách ô dùng chung một bộ thẻ: ô của thương hiệu đang mở, và ô ghim hiện ở mọi thương hiệu.
const DS_BRAND = { ten: 'links', doc: () => B().links, lay: (d) => d.brands[Math.min(ed.brand, d.brands.length - 1)].links };
const DS_GHIM = { ten: 'pinned', doc: () => ed.draft.pinned, lay: (d) => d.pinned };

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
  const b = B();
  const set = (k) => (v) => update((d) => { d.profile[k] = v; });
  const setB = (k) => (v) => updateB((x) => { x[k] = v; });
  return panel('Hồ sơ', 'Ảnh và tên dùng chung; handle với dòng giới thiệu theo từng thương hiệu', true,
    h('div', { class: 'cols' },
      field('Tên hiển thị', p.name, set('name'), { max: 80, hint: 'Dùng chung cho mọi thương hiệu' }),
      field('Handle', b.handle, setB('handle'), { placeholder: '@toanelevato', max: 60,
        hint: 'Riêng ' + b.label + ' — mỗi kênh một @handle' })),
    field('Giới thiệu ngắn', b.tagline, setB('tagline'), { multiline: true, rows: 2, max: 200, wide: true,
      hint: 'Riêng ' + b.label }),
    imageField('Ảnh đại diện', p.avatar, (v, re) => update((d) => { d.profile.avatar = v; }, { rerender: re }),
      { round: true, onPick: () => pick({ maxSide: 420, square: true }), sets: [{ label: 'Ảnh có sẵn', style: 'photo', items: { '../assets/instructor-sm.webp': 'Ảnh hiện tại' } }] }),
    field('Dòng trạng thái', b.status, setB('status'), { max: 80, placeholder: 'Ví dụ: Đang mở lịch Coffee Connect',
      hint: 'Để trống: tự hiện trạng thái cohort (nếu không có ô nổi bật nào đang hiện số chỗ).', wide: true }),
    toggle('Hiện dấu tích xanh cạnh tên', p.verified, set('verified')));
}

function statsPanel() {
  const st = B().stats;
  const rows = st.map((s, i) => h('div', { class: 'row' },
    field('Số', s.value, (v) => updateB((x) => { x.stats[i].value = v; }), { max: 16, placeholder: '2.5+' }),
    field('Nhãn', s.label, (v) => updateB((x) => { x.stats[i].label = v; }), { max: 40, placeholder: 'năm M&A' }),
    iconBtn('trash', 'Xoá dòng này', () => updateB((x) => { x.stats.splice(i, 1); }, { rerender: true }), 'danger')));
  const add = st.length < 4
    ? h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm số liệu</span>',
      onclick: () => updateB((x) => { x.stats.push({ value: '', label: '' }); }, { rerender: true }) })
    : null;
  return panel('Số liệu nổi bật', 'Tối đa 4 ô, riêng ' + B().label, false, ...rows, add);
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

/** Đổi chỗ một dòng lên hoặc xuống. `ds` là một trong DS_BRAND / DS_GHIM, hoặc 'socials'. */
function move(ds, i, dir) {
  const lay = ds === 'socials' ? (d) => d.socials : ds.lay;
  const doc = ds === 'socials' ? ed.draft.socials : ds.doc();
  const j = i + dir;
  if (j < 0 || j >= doc.length) return;
  update((d) => { const a = lay(d); [a[i], a[j]] = [a[j], a[i]]; }, { rerender: true });
}

/* ── từng ô link ──────────────────────────────── */
const SIZE_LABEL = { feature: 'Nổi bật', wide: 'Ngang', half: 'Nửa ô' };

/** Dòng đầu của thẻ: chip icon, tên, cảnh báo ô đang ẩn, và các nút sắp xếp / nhân bản / xoá. */
function linkHead(l, i, open, ds) {
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
    ds === DS_GHIM ? ghimNoiHien(l, i) : null,
    h('div', { class: 'lc-tools' },
      iconBtn('up', 'Lên trên', () => move(ds, i, -1), i === 0 ? 'ghosted' : '', 'up|' + l.id),
      iconBtn('down', 'Xuống dưới', () => move(ds, i, 1), i === ds.doc().length - 1 ? 'ghosted' : '', 'down|' + l.id),
      iconBtn('copy', 'Nhân bản', () => update((d) => { ds.lay(d).splice(i + 1, 0, { ...structuredClone(l), id: newId(), title: l.title + ' (bản sao)' }); }, { rerender: true }), '', 'copy|' + l.id),
      iconBtn('trash', 'Xoá ô', () => { if (confirm('Xoá ô "' + (l.title || 'chưa đặt tên') + '"?')) update((d) => { ds.lay(d).splice(i, 1); }, { rerender: true }); }, 'danger')));
}

/** Ô ghim: mỗi thương hiệu một nút bật/tắt nằm ngay trên dòng đầu thẻ (không phải mở thẻ mới thấy).
 *  Lưu ngược thành danh sách nơi ẨN (hideIn), để thương hiệu thêm sau này mặc định vẫn thấy ô ghim. */
function ghimNoiHien(l, i) {
  if (ed.draft.brands.length < 2) return null;
  return h('div', { class: 'lc-brands', role: 'group', 'aria-label': 'Hiện ô này ở thương hiệu' },
    ...ed.draft.brands.map((b) => {
      const on = !l.hideIn.includes(b.id);
      return h('button', {
        type: 'button', class: 'bpill' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-fk': 'pin|' + l.id + '|' + b.id,
        title: (on ? 'Đang hiện ở ' : 'Đang ẩn ở ') + b.label + ' — bấm để ' + (on ? 'ẩn' : 'hiện'),
        onclick: () => update((d) => {
          const x = d.pinned[i];
          x.hideIn = on ? [...new Set([...x.hideIn, b.id])] : x.hideIn.filter((id) => id !== b.id);
        }, { rerender: true }),
      }, h('span', { 'aria-hidden': 'true', html: svg(on ? 'check' : 'close') }), b.label);
    }));
}

function linkCard(l, i, ds) {
  const open = ed.openLink === l.id;
  const head = linkHead(l, i, open, ds);
  const card = h('div', { class: 'lc' + (open ? ' open' : '') + (hiddenReason(l) ? ' off' : '') }, head);
  if (!open) return card;

  const set = (k) => (v) => update((d) => { ds.lay(d)[i][k] = v; });
  const setRe = (k) => (v) => update((d) => { ds.lay(d)[i][k] = v; }, { rerender: true });
  const setDet = (k) => (v) => update((d) => { ds.lay(d)[i].details[k] = v; });
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
      (v, re, style) => update((d) => { const x = ds.lay(d)[i]; x.image = v; if (style) x.imageStyle = style; }, { rerender: re }),
      { sets: ICON_LIBRARY, iconify, style: l.imageStyle,
        onStyle: setRe('imageStyle'),
        onPick: () => pick({ maxSide: 256, square: true }),
        hint: 'Bộ icon elevaTO: vẽ riêng kiểu Liquid Glass. Icon 3D: Fluent Emoji của Microsoft. Bộ icon cũ: bản trước. Tìm icon: thư viện Iconify. Ảnh từ máy được tự cắt vuông, thu nhỏ. Bỏ ảnh thì ô dùng icon nét.',
        tools: [['Iconify', 'https://icon-sets.iconify.design/'], ['Canva', 'https://www.canva.com/'], ['Flaticon', 'https://www.flaticon.com/'],
          ['Icons8', 'https://icons8.com/icons'], ['Fluent Emoji 3D', 'https://github.com/microsoft/fluentui-emoji']] }),
    // Đổi icon nét / màu nhấn chỉ ảnh hưởng chip ở đầu thẻ → sửa tại chỗ, không vẽ lại cả form
    // (vẽ lại sẽ đóng mất ngăn chọn icon đang mở).
    field('Emoji', l.emoji, setRe('emoji'), { max: 8, placeholder: '✨',
      hint: 'Không có ảnh thì ô hiện emoji này (kiểu icon của trang TMXK). Để trống thì dùng icon nét.' }),
    l.image || l.emoji ? null : iconPicker(l.icon, TILE_ICONS, (v) => { set('icon')(v); chip.innerHTML = svg(v); }),
    isFeature ? field('Bộ công cụ (mỗi dòng: emoji | tên | link | nhãn)',
      l.tools.map((t) => [t.emoji, t.label, t.url, t.badge].join(' | ').replace(/( \| )+$/, '')).join('\n'),
      (v) => update((d) => {
        ds.lay(d)[i].tools = v.split('\n').map((r) => r.split('|').map((x) => x.trim()))
          .filter((c) => c[1]).map(([emoji = '', label = '', url = '', badge = '']) => ({ emoji, label, url, badge }));
      }),
      { multiline: true, rows: 4, wide: true,
        hint: 'Hiện thành lưới nút ngay trong ô, mỗi nút một link — như thẻ Viral Studio. Ví dụ: ⚡ | Hook viral | https://… | Mới' }) : null,
    swatches(l.accent, ACCENTS, ACCENT_LABELS, (v) => { set('accent')(v); chip.style.setProperty('--ac', ACCENTS[v]); }),
    isFeature ? h('div', { class: 'cols' },
      field('Chữ trên nút', l.cta, set('cta'), { max: 30, placeholder: 'Giữ chỗ' }),
      field('Link của nút', l.ctaUrl, set('ctaUrl'), { type: 'url', placeholder: 'Để trống = giống link ô', hint: '../#dang-ky mở thẳng form đăng ký' })) : null,
    isFeature ? toggle('Hiện số chỗ cohort trực tiếp', l.live, set('live'), 'Lấy từ bot Telegram, giống trang khoá học.') : null,
    segmented('Khi bấm vào ô', sheet ? 'sheet' : 'link', [['link', 'Mở link ngay'], ['sheet', 'Hiện thẻ chi tiết trước']],
      (v) => update((d) => { ds.lay(d)[i].details.enabled = v === 'sheet'; }, { rerender: true })),
    sheet ? field('Đoạn giới thiệu', l.details.text, setDet('text'), { multiline: true, rows: 3, max: 600, wide: true }) : null,
    sheet ? field('Gạch đầu dòng (mỗi dòng một ý)', l.details.bullets.join('\n'),
      (v) => update((d) => { ds.lay(d)[i].details.bullets = v.split('\n').map((x) => x.trim()).filter(Boolean); }),
      { multiline: true, rows: 4, wide: true }) : null,
    sheet ? field('Chữ trên nút trong thẻ', l.details.button, setDet('button'), { max: 30, placeholder: 'Mở link' }) : null,
    toggle('Tạm ẩn ô này', l.hidden, setRe('hidden'))));
  return card;
}

function linksPanel(ds, tieuDe, phu, moSan) {
  const list = h('div', { class: 'lcs' }, ...ds.doc().map((l, i) => linkCard(l, i, ds)));
  const add = h('button', { type: 'button', class: 'add', html: svg('plus') + '<span>Thêm ô link</span>', onclick: () => {
    const id = newId();
    ed.openLink = id;
    update((d) => { ds.lay(d).push({ ...normalize({ brands: [{ links: [{}] }] }).brands[0].links[0], id, title: 'Ô mới', size: 'half', icon: 'link' }); }, { rerender: true });
  } });
  const sync = ds === DS_BRAND
    ? h('div', { class: 'gh-row' },
      h('button', { type: 'button', class: 'btn btn-ghost sm', onclick: useGlassIcons }, 'Dùng bộ icon elevaTO cho tất cả ô'),
      h('small', { class: 'hint' }, 'Đổi icon của mọi ô sang bộ elevaTO; chữ và link giữ nguyên.'))
    : null;
  return panel(tieuDe, phu, moSan, sync, list, add);
}

function useGlassIcons() {
  let n = 0;
  updateB((x) => {
    x.links.forEach((l) => {
      const icon = glassIconFor(l);
      if (icon && (l.image !== icon || l.imageStyle !== 'photo')) { l.image = icon; l.imageStyle = 'photo'; n += 1; }
    });
  }, { rerender: true });
  toast(n ? `Đã đổi icon ${n} ô sang bộ elevaTO. Bấm Đăng lên web để web cập nhật.` : 'Các ô đã dùng bộ icon elevaTO rồi.');
}

/* ── giao diện, cohort, chia sẻ ────────────────── */
function themePanel() {
  const t = B().theme;
  const setT = (k, re = false) => (v) => updateB((x) => { x.theme[k] = v; }, { rerender: re });
  return panel('Giao diện kính', 'Độ mờ, độ trong, hình nền', true,
    slider('Độ mờ của kính (blur)', t.blur, 0, 48, 'px', setT('blur'), '0 = kính trong suốt hẳn, càng lớn càng mờ như kính mờ iPhone.'),
    slider('Độ đục của kính', t.tint, 0, 95, '%', setT('tint'), '0 = trong suốt hẳn, chỉ còn vành mép bẻ sáng như kính thật. Cao = trắng/đen đặc hơn, chữ dễ đọc hơn.'),
    segmented('Hình nền', t.background, Object.entries(BACKGROUNDS), setT('background', true)),
    t.background === 'image'
      ? imageField('Ảnh nền', t.bgImage, (v, re) => updateB((x) => { x.theme.bgImage = v; }, { rerender: re }),
        { onPick: () => pick({ maxSide: 1600, quality: 0.78 }), hint: 'Ảnh phong cảnh, ảnh thành phố… kính trông đẹp nhất trên ảnh nhiều chi tiết.' })
      : null);
}

function livePanel() {
  return panel('Số chỗ cohort trực tiếp', 'Đọc từ backend Apps Script của trang khoá học', false,
    toggle('Bật', B().live.enabled, (v) => updateB((x) => { x.live.enabled = v; })),
    field('URL Web App (/exec)', B().live.api, (v) => updateB((x) => { x.live.api = v; }), { type: 'url', wide: true,
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

/* ── chọn thương hiệu đang sửa ────────────────── */
/** Thanh chọn thương hiệu, luôn nằm trên cùng form. Đổi thương hiệu thì khung xem trước nhảy theo. */
function brandBar() {
  const bs = ed.draft.brands;
  const tabs = h('div', { class: 'bbar' }, ...bs.map((b, i) => h('button', {
    type: 'button', class: 'bb' + (i === ed.brand ? ' on' : ''), 'aria-pressed': String(i === ed.brand),
    'data-fk': 'brand|' + b.id,
    onclick: () => { if (i === ed.brand) return; ed.brand = i; ed.openLink = ''; renderForm(); sendPreview(); },
  }, h('b', {}, b.label), h('small', {}, SKINS[b.skin].split('—')[0].trim()))));
  const cur = B();
  // Lớp sơn trong nháp khác bản đang chạy trên web → nói rõ và cho trả về bằng một nút. Lớp sơn đổi cả
  // giao diện, lỡ tay bấm nhầm (nhất là Finance sang "giấy & lime") thì khung xem trước sai hẳn.
  let goc = null;
  try { goc = normalize(JSON.parse(ed.published || '{}')).brands.find((b) => b.id === cur.id) || null; } catch { goc = null; }
  const lechSon = goc && goc.skin !== cur.skin
    ? h('div', { class: 'warn-row' },
      h('span', {}, 'Lớp sơn của ' + cur.label + ' đang khác bản trên web (' + SKINS[goc.skin].split('—')[0].trim() + ').'),
      h('button', { type: 'button', class: 'btn btn-ghost sm', 'data-fk': 'skin-back',
        onclick: () => updateB((x) => { x.skin = goc.skin; }, { rerender: true }) }, 'Trả về như trên web'))
    : null;
  const paper = cur.skin === 'paper';
  return panel('Thương hiệu', 'Mỗi kênh TikTok một link bio riêng (…/links/?v=' + cur.id + ')', true,
    tabs,
    h('div', { class: 'cols' },
      field('Tên trên công tắc', cur.label, (v) => updateB((x) => { x.label = v; }, { rerender: true }),
        { max: 16, hint: 'Chữ người xem thấy trên công tắc' }),
      // Đổi mã thì mang theo cả các ô ghim đang ẩn ở thương hiệu này, không thì chúng hiện lại.
      field('Mã trong link (?v=…)', cur.id, (v) => update((d) => {
        const b = d.brands[ed.brand];
        const cu = b.id;
        b.id = v;
        for (const l of d.pinned) l.hideIn = l.hideIn.map((x) => (x === cu ? v : x));
      }, { rerender: true }),
        { max: 20, hint: 'Chỉ chữ thường, số và gạch nối' })),
    segmented('Lớp sơn', cur.skin, Object.entries(SKINS), (v) => updateB((x) => { x.skin = v; }, { rerender: true })),
    lechSon,
    h('div', { class: 'cols' },
      field('Logo cho nền sáng', cur.logo.light, (v) => updateB((x) => { x.logo.light = v; }),
        { max: 300, placeholder: paper ? 'art/tmxk/lockup-sang.svg' : '', hint: 'Để trống = dùng logo elevaTO' }),
      field('Logo cho nền tối', cur.logo.dark, (v) => updateB((x) => { x.logo.dark = v; }),
        { max: 300, placeholder: paper ? 'art/tmxk/lockup-toi.svg' : '', hint: 'Để trống = dùng logo elevaTO' })),
    field('Dòng chân trang', cur.footTag, (v) => updateB((x) => { x.footTag = v; }),
      { max: 60, wide: true, placeholder: 'Fuel Your Financial Journey' }),
    h('small', { class: 'hint' }, 'Lớp sơn đổi cả chất liệu, bo góc và phông chữ — không chỉ màu nhấn. '
      + 'Dán link này vào bio kênh tương ứng: ' + location.origin + location.pathname.replace(/edit\.html$/, '')
      + (ed.brand === 0 ? '' : '?v=' + cur.id)));
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
  form.replaceChildren(brandBar(), profilePanel(), themePanel(),
    linksPanel(DS_BRAND, 'Các ô của ' + B().label, 'Thứ tự trong danh sách = thứ tự trên trang', true),
    linksPanel(DS_GHIM, 'Ô ghim', 'Dùng chung giữa các thương hiệu — bấm tên thương hiệu trên mỗi ô để bật / tắt ô đó ở bên ấy', false),
    socialsPanel(), statsPanel(), livePanel(), metaPanel(), publishPanel(), backupPanel());
  // Giữ nguyên phần nào đang mở / đang đóng sau khi vẽ lại.
  if (openState.length) form.querySelectorAll('details.panel').forEach((d, i) => { d.open = openState[i]; });
  if (fk) {
    const again = form.querySelector('[data-fk="' + CSS.escape(fk) + '"]');
    if (again) again.focus({ preventScroll: true });
  }
  form.scrollTop = y;
}
