// Các khối giao diện nhỏ của trình chỉnh sửa: ô nhập, công tắc, nút chọn. Không giữ trạng thái —
// mỗi khối nhận giá trị hiện tại và một hàm báo thay đổi.

import { svg } from './icons.js';

let uid = 0;
const nextId = () => 'f' + (uid += 1);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;            // chỉ dùng cho icon SVG tĩnh
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== '') el.append(c);
  return el;
}

/** Ô nhập có nhãn. opts: { multiline, rows, placeholder, hint, type, max, list } */
export function field(label, value, onInput, opts = {}) {
  const id = nextId();
  const input = opts.multiline
    ? h('textarea', { id, class: 'inp', rows: opts.rows || 3, placeholder: opts.placeholder, maxlength: opts.max })
    : h('input', { id, class: 'inp', type: opts.type || 'text', placeholder: opts.placeholder, maxlength: opts.max,
      inputmode: opts.inputmode, autocomplete: 'off', spellcheck: opts.type === 'url' ? 'false' : null });
  if (!label) input.setAttribute('aria-label', opts.aria || opts.placeholder || '');
  input.value = value || '';
  input.addEventListener('input', () => onInput(input.value));
  const hint = opts.hint ? h('small', { class: 'hint' }, opts.hint) : null;
  return h('div', { class: 'fld' + (opts.wide ? ' wide' : '') }, label ? h('label', { for: id }, label) : null, input, hint);
}

export function toggle(label, checked, onChange, hint) {
  const id = nextId();
  const box = h('input', { id, type: 'checkbox', class: 'sw-in' });
  box.checked = Boolean(checked);
  box.addEventListener('change', () => onChange(box.checked));
  return h('div', { class: 'fld sw' },
    h('label', { for: id, class: 'sw-lbl' }, box, h('span', { class: 'sw-ui', 'aria-hidden': 'true' }), h('span', {}, label)),
    hint ? h('small', { class: 'hint' }, hint) : null);
}

/** Nhóm nút chọn một (như radio). options: [[value, label], …] */
export function segmented(label, value, options, onChange) {
  const wrap = h('div', { class: 'segm', role: 'radiogroup', 'aria-label': label });
  for (const [v, text] of options) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value) }, text);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onChange(v);
    });
    wrap.append(b);
  }
  return h('div', { class: 'fld' }, h('span', { class: 'lbl' }, label), wrap);
}

export function iconPicker(value, names, onChange) {
  const wrap = h('div', { class: 'icons', role: 'radiogroup', 'aria-label': 'Icon' });
  for (const n of names) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(n === value), title: n, 'aria-label': n, html: svg(n) });
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onChange(n);
    });
    wrap.append(b);
  }
  return h('div', { class: 'fld wide' }, h('span', { class: 'lbl' }, 'Icon'), wrap);
}

export function swatches(value, accents, onChange) {
  const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Màu nhấn' });
  for (const [name, hex] of Object.entries(accents)) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(name === value), title: name, 'aria-label': name });
    b.style.setProperty('--sw', hex);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      onChange(name);
    });
    wrap.append(b);
  }
  return h('div', { class: 'fld' }, h('span', { class: 'lbl' }, 'Màu nhấn'), wrap);
}

export function iconBtn(icon, label, onClick, cls = '') {
  return h('button', { type: 'button', class: 'mini ' + cls, 'aria-label': label, title: label, html: svg(icon), onclick: onClick });
}

/** Khung một phần của form, mở/đóng được. */
export function panel(title, desc, open, ...body) {
  return h('details', { class: 'panel glass', open },
    h('summary', {}, h('span', { class: 'p-t' }, h('b', {}, title), desc ? h('small', {}, desc) : null), h('span', { class: 'chev', 'aria-hidden': 'true' })),
    h('div', { class: 'p-body' }, ...body));
}

/** Thanh kéo có hiện số. */
export function slider(label, value, min, max, unit, onInput, hint) {
  const id = nextId();
  const out = h('output', { for: id, class: 'sl-val' }, value + unit);
  const input = h('input', { id, type: 'range', class: 'sl', min, max, step: 1 });
  input.value = String(value);
  const paint = () => input.style.setProperty('--p', ((input.value - min) / (max - min)) * 100 + '%');
  paint();
  input.addEventListener('input', () => { out.textContent = input.value + unit; paint(); onInput(Number(input.value)); });
  return h('div', { class: 'fld' }, h('div', { class: 'sl-head' }, h('label', { for: id }, label), out), input,
    hint ? h('small', { class: 'hint' }, hint) : null);
}

/**
 * Ô chọn ảnh: xem trước + các cách lấy ảnh. onChange(value, rerender, style) — style 'icon' (hình trong suốt
 * đặt trên ô màu) hoặc 'photo' (ảnh lấp kín ô).
 * opts: { presets: ảnh "photo" có sẵn, icons3d: icon 3D có sẵn, iconify: hàm tìm icon, onPick: tải từ máy,
 *         style: kiểu hiện tại, round, hint, tools: [[tên, link], …] }
 */
export function imageField(label, value, onChange, opts = {}) {
  const isData = /^data:/.test(value || '');
  const thumb = h('span', { class: 'im-thumb' + (opts.round ? ' round' : '') + (opts.style === 'icon' && value ? ' ico' : '') });
  const setThumb = (v) => thumb.replaceChildren(v ? h('img', { src: v, alt: '' }) : h('span', { html: svg('plus') }));
  setThumb(value);
  const url = field('', isData ? '' : value, (v) => { setThumb(v); onChange(v, false, 'photo'); },
    { type: 'url', placeholder: isData ? 'Đang dùng ảnh tải lên / icon đã chọn' : 'hoặc dán link ảnh https://…', aria: label + ' — link ảnh' });

  const panes = [];
  const pane = (node) => { node.hidden = true; panes.push(node); return node; };
  const toggleBtn = (text, node) => h('button', { type: 'button', class: 'btn btn-ghost sm', onclick: () => {
    const show = node.hidden;
    panes.forEach((p) => { p.hidden = true; });
    node.hidden = !show;
    if (show) { const q = node.querySelector('input'); if (q) q.focus(); }
  } }, text);
  const grid = (entries, style) => h('div', { class: 'im-gallery' }, ...entries.map(([src, name]) =>
    h('button', { type: 'button', title: name, 'aria-label': name, class: style === 'icon' ? 'ico' : '', onclick: () => onChange(src, true, style) },
      h('img', { src, alt: '', loading: 'lazy' }))));

  const icons = opts.icons3d ? pane(grid(Object.entries(opts.icons3d), 'icon')) : null;
  const photos = opts.presets ? pane(grid(Object.entries(opts.presets), 'photo')) : null;
  let search = null;
  if (opts.iconify) {
    const results = h('div', { class: 'im-gallery' });
    const status = h('small', { class: 'hint' }, 'Gõ tiếng Anh: chart, money, robot, book, phone, coffee…');
    const q = h('input', { class: 'inp', type: 'search', placeholder: 'Tìm trong 200.000+ icon (Iconify)', 'aria-label': 'Tìm icon' });
    const run = async () => {
      const term = q.value.trim();
      if (!term) return;
      status.textContent = 'Đang tìm…';
      try {
        const list = await opts.iconify.search(term);
        results.replaceChildren(...list.map((id) => h('button', { type: 'button', title: id, 'aria-label': id, class: 'ico', onclick: async () => {
          status.textContent = 'Đang lấy icon…';
          try { onChange(await opts.iconify.get(id), true, 'icon'); } catch (e) { status.textContent = e.message; }
        } }, h('img', { src: opts.iconify.preview(id), alt: '', loading: 'lazy' }))));
        status.textContent = list.length ? `${list.length} icon — bấm để chọn.` : 'Không thấy icon nào. Thử từ khác (tiếng Anh).';
      } catch (e) { status.textContent = e.message; }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    search = pane(h('div', { class: 'im-search' },
      h('div', { class: 'row' }, q, h('button', { type: 'button', class: 'btn btn-em sm', onclick: run }, 'Tìm')), status, results));
  }

  const tools = h('div', { class: 'im-tools' },
    icons ? toggleBtn('Icon 3D', icons) : null,
    search ? toggleBtn('Tìm icon', search) : null,
    h('button', { type: 'button', class: 'btn btn-ghost sm', html: svg('download') + '<span>Ảnh từ máy</span>', onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { const v = await opts.onPick(); if (v) onChange(v, true, 'photo'); } finally { b.disabled = false; }
    } }),
    photos ? toggleBtn('Ảnh có sẵn', photos) : null,
    value ? h('button', { type: 'button', class: 'btn btn-ghost sm danger', onclick: () => onChange('', true, opts.style) }, 'Bỏ ảnh') : null);

  const styleSel = value && opts.onStyle
    ? segmented('Kiểu hiển thị', opts.style, [['icon', 'Icon trên nền màu'], ['photo', 'Ảnh lấp kín ô']], opts.onStyle)
    : null;
  const toolLinks = opts.tools
    ? h('small', { class: 'hint' }, 'Tự thiết kế icon rồi tải lên: ',
      ...opts.tools.flatMap(([name, href], i) => [i ? ' · ' : '', h('a', { href, target: '_blank', rel: 'noopener' }, name)]))
    : null;
  return h('div', { class: 'fld wide' }, h('span', { class: 'lbl' }, label),
    h('div', { class: 'im' }, thumb, h('div', { class: 'im-r' }, tools, url)),
    ...panes, styleSel, opts.hint ? h('small', { class: 'hint' }, opts.hint) : null, toolLinks);
}
