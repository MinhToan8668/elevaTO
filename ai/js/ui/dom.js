// Tiện ích DOM nhỏ. Mọi chữ đưa vào trang qua textContent — không dùng innerHTML với dữ liệu,
// vì tên file, tên chỉ tiêu, nội dung AI trả về đều là dữ liệu ngoài.

/**
 * h('button', { class: 'btn', onclick: fn, disabled: true }, 'Chữ', h('b', {}, 'x'))
 * attrs: class, text, dataset {…}, on<event>, các thuộc tính DOM (value, checked, disabled, hidden, selected…) hoặc attribute thường.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in PROPS) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
const PROPS = { value: 1, checked: 1, disabled: 1, hidden: 1, selected: 1, multiple: 1, htmlFor: 1, title: 1 };

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Thay toàn bộ nội dung một phần tử. */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

const NF = {};
/** Số đồng → chuỗi theo đơn vị hiển thị (1 / 1e6 / 1e9), số âm trong ngoặc như BCTC. */
export function fmt(v, unit = 1) {
  if (!Number.isFinite(v)) return '';
  const digits = unit >= 1e9 ? 2 : unit >= 1e6 ? 1 : 0;
  NF[digits] ||= new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  const s = NF[digits].format(Math.abs(v / unit));
  if (s === '0') return '0';
  return v < 0 ? `(${s})` : s;
}

let toastTimer;
export function toast(msg, ms = 4200) {
  let el = $('#toast');
  if (!el) { el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function download(data, name, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Tên file an toàn cho mọi hệ điều hành. */
export const safeName = (s) => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'elevaTO';

/** "3, 5-7, 12" → [3,5,6,7,12] (lọc trong 1..max). */
export function parsePages(text, max) {
  const out = new Set();
  for (const part of String(text || '').split(/[,;\s]+/)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 200; i++) if (i >= 1 && i <= max) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** [3,5,6,7,12] → "3, 5–7, 12" */
export function pagesText(pages) {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    out.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]));
    i = j;
  }
  return out.join(', ');
}

/**
 * Vẽ lại một vùng mà không làm mất chỗ đang thao tác: giữ ô đang được focus (theo id / aria-label / data-k+p)
 * và vị trí cuộn của các vùng cuộn (.gridwrap, .thumbs).
 */
export function keepFocus(root, render) {
  const a = document.activeElement;
  const key = a && root.contains(a) ? focusKey(a) : null;
  const scrolls = [...root.querySelectorAll('.gridwrap, .thumbs')].map((el) => [el.className, el.scrollTop, el.scrollLeft]);
  render();
  scrolls.forEach(([cls, top, left], i) => {
    const el = root.querySelectorAll('.gridwrap, .thumbs')[i];
    if (el && el.className === cls) { el.scrollTop = top; el.scrollLeft = left; }
  });
  if (!key) return;
  const el = root.querySelector(key);
  if (el && !el.disabled) el.focus({ preventScroll: true });
}
function focusKey(el) {
  if (el.classList.contains('ed') && el.parentElement?.dataset.k) el = el.parentElement;   // ô đang sửa → ô bảng
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.dataset.k && el.dataset.p) return `[data-k="${CSS.escape(el.dataset.k)}"][data-p="${CSS.escape(el.dataset.p)}"]`;
  const label = el.getAttribute('aria-label');
  return label ? `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(label)}"]` : null;
}
