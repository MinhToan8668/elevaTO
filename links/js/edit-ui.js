// Các khối giao diện nhỏ của trình chỉnh sửa: ô nhập, công tắc, nút chọn. Không giữ trạng thái —
// mỗi khối nhận giá trị hiện tại và một hàm báo thay đổi.

import { h } from './dom.js';
import { safeImg } from './core.js';
import { svg } from './icons.js';

let uid = 0;
const nextId = () => 'f' + (uid += 1);

/** Ô nhập có nhãn. opts: { multiline, rows, placeholder, hint, type, max, wide, aria, inputmode } */
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

/**
 * Nhóm nút chọn một, theo đúng cách bàn phím của radiogroup (WAI-ARIA): chỉ nút đang chọn vào được
 * bằng Tab, rồi dùng mũi tên / Home / End để chuyển — thay vì phải Tab qua từng nút một.
 * @param options [[giá trị, nhãn], …]
 * @param build (nút, giá trị, nhãn) — vẽ thêm vào nút (icon, màu…); mặc định chỉ đặt nhãn làm chữ.
 */
function radioGroup({ label, cls, options, value, onChange, build }) {
  const wrap = h('div', { class: cls, role: 'radiogroup', 'aria-label': label });
  const btns = options.map(([v, text]) => {
    // data-fk: khoá để renderForm() tìm lại đúng nút này mà trả con trỏ bàn phím về sau khi vẽ lại.
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), 'data-fk': label + '|' + v });
    b.tabIndex = v === value ? 0 : -1;
    if (build) build(b, v, text); else b.append(text);
    // Bấm lại đúng ô đang chọn thì thôi — không thì form bị vẽ lại một lần chẳng để làm gì.
    b.addEventListener('click', () => { if (b.getAttribute('aria-checked') !== 'true') select(b, v); });
    wrap.append(b);
    return b;
  });
  // Giá trị hiện tại không có trong danh sách → vẫn phải có một nút vào được bằng Tab.
  if (btns.length && !btns.some((b) => b.tabIndex === 0)) btns[0].tabIndex = 0;

  function select(btn, v, focus = false) {
    btns.forEach((x) => { x.setAttribute('aria-checked', String(x === btn)); x.tabIndex = x === btn ? 0 : -1; });
    if (focus) btn.focus();
    onChange(v);
  }

  wrap.addEventListener('keydown', (e) => {
    // Alt+← là lệnh "quay lại" của trình duyệt, Ctrl/Cmd+mũi tên là lệnh của hệ điều hành — đừng nuốt mất.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const j = step ? (i + step + btns.length) % btns.length : (e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : -1);
    if (j < 0) return;
    e.preventDefault();
    select(btns[j], options[j][0], true);
  });
  return wrap;
}

/** Nhóm nút chọn một dạng thanh ngang. options: [[giá trị, nhãn], …] */
export function segmented(label, value, options, onChange) {
  return h('div', { class: 'fld' }, h('span', { class: 'lbl' }, label),
    radioGroup({ label, cls: 'segm', options, value, onChange }));
}

/** Chọn icon nét cho ô. icons: { tên: 'Nhãn tiếng Việt' } */
export function iconPicker(value, icons, onChange) {
  const group = radioGroup({
    label: 'Icon', cls: 'icons', options: Object.entries(icons), value, onChange,
    build: (b, name, text) => {
      b.innerHTML = svg(name);
      b.setAttribute('title', text);
      b.setAttribute('aria-label', text);
    },
  });
  return h('div', { class: 'fld wide' }, h('span', { class: 'lbl' }, 'Icon'), group);
}

/** Chọn màu nhấn. accents: { tên: '#hex' } · labels: { tên: 'Tên tiếng Việt' } */
export function swatches(value, accents, labels, onChange) {
  const group = radioGroup({
    label: 'Màu nhấn', cls: 'swatches', options: Object.keys(accents).map((k) => [k, labels[k] || k]), value, onChange,
    build: (b, name, text) => {
      b.style.setProperty('--sw', accents[name]);
      b.setAttribute('title', text);
      b.setAttribute('aria-label', text);
    },
  });
  return h('div', { class: 'fld' }, h('span', { class: 'lbl' }, 'Màu nhấn'), group);
}

/** Nút tròn nhỏ (lên / xuống / nhân bản / xoá). fk: khoá để giữ con trỏ bàn phím khi form vẽ lại. */
export function iconBtn(icon, label, onClick, cls = '', fk = '') {
  return h('button', { type: 'button', class: 'mini ' + cls, 'aria-label': label, title: label,
    'data-fk': fk || null, html: svg(icon), onclick: onClick });
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
 * opts: { sets: [{ label, style, items: {src: tên} }] — các bộ icon có sẵn, iconify: hàm tìm icon, onPick: tải từ máy,
 *         style: kiểu hiện tại, onStyle, round, hint, tools: [[tên, link], …] }
 */
export function imageField(label, value, onChange, opts = {}) {
  const isData = /^data:/.test(value || '');
  const thumb = h('span', { class: 'im-thumb' + (opts.round ? ' round' : '') + (opts.style === 'icon' && value ? ' ico' : '') });
  // Lọc qua safeImg: link ảnh gõ tay / nạp từ file JSON lạ không được biến ô xem trước thành nơi gọi ra ngoài.
  const setThumb = (v) => thumb.replaceChildren(safeImg(v) ? h('img', { src: safeImg(v), alt: '' }) : h('span', { html: svg('plus') }));
  setThumb(value);
  const url = field('', isData ? '' : value, (v) => { setThumb(v); onChange(v, false, 'photo'); },
    { type: 'url', placeholder: isData ? 'Đang dùng ảnh tải lên / icon đã chọn' : 'hoặc dán link ảnh https://…', aria: label + ' — link ảnh' });

  // Mỗi "ngăn" (bộ icon có sẵn, ô tìm icon) có một nút mở/đóng; mở ngăn này thì các ngăn khác đóng lại.
  const panes = [];
  const pane = (node) => { node.hidden = true; node.id = nextId(); panes.push(node); return node; };
  const toggleBtn = (text, node) => {
    const b = h('button', { type: 'button', class: 'btn btn-ghost sm', 'aria-expanded': 'false', 'aria-controls': node.id,
      onclick: () => {
        const show = node.hidden;
        panes.forEach((p) => { p.hidden = true; });
        node.hidden = !show;
        b.closest('.im-tools').querySelectorAll('[aria-expanded]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        b.setAttribute('aria-expanded', String(show));
        if (show) { const q = node.querySelector('input'); if (q) q.focus(); }
      } }, text);
    return b;
  };
  const grid = (entries, style) => h('div', { class: 'im-gallery' }, ...entries.map(([src, name]) =>
    h('button', { type: 'button', title: name, 'aria-label': name, class: style === 'icon' ? 'ico' : '', onclick: () => onChange(src, true, style) },
      h('img', { src, alt: '', loading: 'lazy' }))));

  const sets = (opts.sets || []).map((set) => ({ label: set.label, node: pane(grid(Object.entries(set.items), set.style)) }));
  let search = null;
  if (opts.iconify) {
    const results = h('div', { class: 'im-gallery' });
    const status = h('small', { class: 'hint', role: 'status' }, 'Gõ tiếng Anh: chart, money, robot, book, phone, coffee…');
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
    ...sets.map((set) => toggleBtn(set.label, set.node)),
    search ? toggleBtn('Tìm icon', search) : null,
    h('button', { type: 'button', class: 'btn btn-ghost sm', html: svg('download') + '<span>Ảnh từ máy</span>', onclick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { const v = await opts.onPick(); if (v) onChange(v, true, 'photo'); } finally { b.disabled = false; }
    } }),
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
