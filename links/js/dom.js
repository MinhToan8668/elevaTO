// Tiện ích DOM dùng chung cho trang link và trình chỉnh sửa: tạo element, lưu trên máy, thông báo, sáng/tối.
// Không chứa logic của trang — chỗ đó là core.js.

export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Tạo element: h('a', { class: 'x', href: '…', onclick: fn }, 'chữ', conKhac).
 * Quy ước attrs: `class` → className · `html` → innerHTML (CHỈ dùng cho icon SVG tĩnh viết tay trong
 * icons.js, không bao giờ cho dữ liệu người dùng) · `onXxx` → addEventListener · còn lại là attribute
 * (true → attribute rỗng, null/false → bỏ qua).
 * `onXxx` phải là hàm: truyền chuỗi thì addEventListener ném lỗi ngay — ĐỪNG "sửa" thành setAttribute,
 * làm thế là biến onclick="…" thành mã chạy inline, đúng kiểu lỗ hổng XSS mà CSP đang chặn.
 */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== '') el.append(c);
  return el;
}

// Trình duyệt ở chế độ riêng tư (hoặc bộ nhớ đầy) ném lỗi khi đọc / ghi → mọi lời gọi ở đây đều im lặng
// trả về null thay vì làm sập trang.
export const store = {
  get(key, from = localStorage) {
    try { return JSON.parse(from.getItem(key) || 'null'); } catch (e) { return null; }
  },
  set(key, value, to = localStorage) {
    try { to.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
  del(key, from = localStorage) {
    try { from.removeItem(key); } catch (e) { /* không có gì để xoá */ }
  },
};

/** Thông báo ngắn ở đáy trang (#toast có role="status" nên trình đọc màn hình cũng nghe được). */
let toastT = 0;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), ms);
}

// Mọi trang elevaTO đọc khoá này trong <head> (ai/js/theme.js) → lưu chuỗi thô, KHÔNG phải JSON.
const THEME_KEY = 'elevato-theme';

/** Đổi sáng ↔ tối. Trả về giao diện mới. */
export function toggleTheme() {
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* chế độ riêng tư: chỉ đổi cho tab này */ }
  return next;
}
