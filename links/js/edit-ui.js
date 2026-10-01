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
 * Ô chọn ảnh: xem trước + "Chọn ảnh từ máy" + "Ảnh có sẵn" + dán link.
 * opts: { presets: {src: label}, base: tiền tố để hiện ảnh có sẵn, onPick: async () => dataUrl, hint, round }
 */
export function imageField(label, value, onChange, opts = {}) {
  const isData = /^data:/.test(value || '');
  const thumb = h('span', { class: 'im-thumb' + (opts.round ? ' round' : '') });
  const setThumb = (v) => {
    thumb.replaceChildren(v ? h('img', { src: (opts.resolve ? opts.resolve(v) : v), alt: '' }) : h('span', { html: svg('plus') }));
  };
  setThumb(value);
  const url = field('', isData ? '' : value, (v) => { setThumb(v); onChange(v, false); },
    { type: 'url', placeholder: isData ? 'Đang dùng ảnh tải lên từ máy' : 'hoặc dán link ảnh https://…', aria: label + ' — link ảnh' });
  const gallery = opts.presets
    ? h('div', { class: 'im-gallery', hidden: true }, ...Object.entries(opts.presets).map(([src, name]) =>
      h('button', { type: 'button', title: name, 'aria-label': name, onclick: () => onChange(src, true) },
        h('img', { src: opts.resolve ? opts.resolve(src) : src, alt: '' }))))
    : null;
  const tools = h('div', { class: 'im-tools' },
    h('button', { type: 'button', class: 'btn btn-ghost sm', html: svg('download') + '<span>Chọn ảnh từ máy</span>', onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { const v = await opts.onPick(); if (v) onChange(v, true); } finally { b.disabled = false; }
    } }),
    gallery ? h('button', { type: 'button', class: 'btn btn-ghost sm', onclick: () => { gallery.hidden = !gallery.hidden; } }, 'Ảnh có sẵn') : null,
    value ? h('button', { type: 'button', class: 'btn btn-ghost sm danger', onclick: () => onChange('', true) }, 'Bỏ ảnh') : null);
  return h('div', { class: 'fld wide' }, h('span', { class: 'lbl' }, label),
    h('div', { class: 'im' }, thumb, h('div', { class: 'im-r' }, tools, url)),
    gallery, opts.hint ? h('small', { class: 'hint' }, opts.hint) : null);
}
