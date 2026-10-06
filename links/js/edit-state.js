// Bản nháp đang sửa: giữ trong bộ nhớ, lưu trên máy, đẩy sang khung xem trước, và so với bản đang chạy
// trên web để biết còn gì chưa đăng.

import { $, store } from './dom.js';
import { normalize, serialize } from './core.js';
import { fetchLinks } from './backend.js';

export const DRAFT_KEY = 'elevato-links-draft';
// Lưu nháp, so với bản trên web và gửi sang khung xem trước đều phải đi qua cả JSON của trang (có thể kèm
// ảnh nhúng cả MB). Gộp chúng vào một lượt sau mỗi 150ms thay vì làm lại sau từng ký tự gõ.
const SYNC_MS = 150;

/** Trạng thái của trình chỉnh sửa. `draft` luôn là bản mới nhất; chỉ việc lưu / gửi đi mới bị hoãn. */
export const ed = { draft: null, published: '', openLink: '', brand: 0 };

/** Thương hiệu đang sửa. Mọi panel thuộc về một thương hiệu đều đi qua đây. */
export function B() {
  return ed.draft.brands[Math.min(ed.brand, ed.draft.brands.length - 1)];
}

/** Sửa riêng thương hiệu đang mở (phần dùng chung thì cứ setDraft như cũ). */
export function setBrandField(fn) {
  setDraft((d) => { fn(d.brands[Math.min(ed.brand, d.brands.length - 1)]); });
}

/** Sửa bản nháp. Mỗi thay đổi tạo bản sao mới, không sửa đè object cũ. */
export function setDraft(fn) {
  const next = structuredClone(ed.draft);
  fn(next);
  ed.draft = next;
  scheduleSync();
}

/** Thay cả bản nháp (nạp file JSON, bỏ nháp…) — lưu ngay chứ không hoãn. */
export function replaceDraft(raw) {
  ed.draft = normalize(raw);
  syncNow();
}

let syncT = 0;
let pending = false;        // có thay đổi chưa kịp lưu không
let saveOk = true;          // lần lưu gần nhất có thành công không (bộ nhớ đầy / chế độ riêng tư)

function scheduleSync() {
  pending = true;
  clearTimeout(syncT);
  syncT = setTimeout(syncNow, SYNC_MS);
}

/** Chạy ngay lượt đồng bộ đang hoãn (đóng tab, vừa đăng xong, vừa nạp file…). */
export function syncNow() {
  clearTimeout(syncT);
  pending = false;
  if (!ed.draft) return;
  saveOk = store.set(DRAFT_KEY, ed.draft);
  markDirty();
  sendPreview();
}

/** Nói rõ nháp đang khác hay giống trang chạy trên web (thanh trên và chú thích dưới khung xem trước). */
export function markDirty() {
  const changed = serialize(ed.draft) !== ed.published;
  const note = saveOk ? ' · nháp đã lưu trên máy này' : ' · KHÔNG lưu được nháp trên máy (bộ nhớ đầy) — đăng lên web kẻo mất';
  setText($('#dirty'), changed ? 'Có thay đổi chưa đăng' + note : 'Đang khớp với bản trên web', changed);
  // Khung xem trước luôn là BẢN NHÁP → nói rõ khi nó khác trang đang chạy trên web.
  setText($('#prevNote'), changed
    ? 'Đang xem BẢN NHÁP trên máy này — khác trang đang chạy trên web. Bấm “Đăng lên web” để web giống hệt khung này.'
    : 'Khung này giống hệt trang đang chạy trên web.', changed);
}

// Hai ô này là vùng role="status": chỉ ghi khi chữ thật sự đổi, không thì trình đọc màn hình đọc lại
// cùng một câu sau mỗi lượt đồng bộ.
function setText(el, text, on) {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('on', on);
}

export function sendPreview() {
  const w = $('#frame').contentWindow;
  // Khung xem trước phải mở đúng thương hiệu đang sửa, không thì sửa một bên mà nhìn bên kia.
  if (w && ed.draft) w.postMessage({ type: 'elevato-links:data', data: ed.draft, brand: ed.brand }, location.origin);
}

/** Tải bản đang chạy trên web (máy chủ elevaTO trước, data.json dự phòng). Lỗi thì giữ `published` cũ. */
export async function loadPublished() {
  const live = await fetchLinks();
  if (live) { ed.published = serialize(live); return true; }
  try {
    const r = await fetch('data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    ed.published = serialize(await r.json());
    return true;
  } catch (e) {
    return false;
  }
}

// Đóng tab / chuyển sang tab khác giữa lúc đang hoãn → lưu nốt, không mất chữ vừa gõ.
// Chỉ lưu khi THẬT SỰ có thay đổi đang chờ: chỉ mở trang sửa rồi chuyển tab mà cũng ghi nháp thì lần sau
// mở lại sẽ thấy bản chụp cũ đè lên trang đang chạy trên web (và "Bỏ nháp" coi như vô tác dụng).
const flush = () => { if (pending) syncNow(); };
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
