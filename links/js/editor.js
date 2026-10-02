// Trình chỉnh sửa trang link-in-bio: tải bản đang chạy trên web, mở bản nháp đã lưu trên máy, dựng form.
// Nội dung form nằm trong edit-panels.js · trạng thái nháp trong edit-state.js · đăng lên web trong edit-publish.js.

import { $, store, toast, toggleTheme } from './dom.js';
import { normalize } from './core.js';
import { svg } from './icons.js';
import { ed, DRAFT_KEY, loadPublished, markDirty, sendPreview, syncNow } from './edit-state.js';
import { renderForm, importJson } from './edit-panels.js';
import { doPublish } from './edit-publish.js';

/** Màn hẹp chỉ hiện được một bên: chuyển giữa form và khung xem trước. */
function setTab(prev) {
  $('#tabEdit').setAttribute('aria-pressed', String(!prev));
  $('#tabPrev').setAttribute('aria-pressed', String(prev));
  document.body.classList.toggle('show-prev', prev);
}

/**
 * Nháp lưu từ bản trước (chưa có mục theme) → điền ảnh minh hoạ mới của bản trên web cho các ô
 * trùng id mà nháp chưa có ảnh riêng. Chữ, link, thứ tự… chủ trang đã sửa thì giữ nguyên.
 */
const OLD_DEFAULT_IMAGES = ['', '../assets/model/dashboard-thumb.webp', '../assets/slides/course-map-thumb.webp'];
export function upgradeDraft(saved, publishedText) {
  if (!saved || saved.theme || !publishedText) return saved;
  const pub = JSON.parse(publishedText);
  const imgById = new Map((pub.links || []).map((l) => [l.id, l.image]));
  return {
    ...saved,
    theme: pub.theme,
    links: (saved.links || []).map((l) =>
      OLD_DEFAULT_IMAGES.includes(l.image || '') && imgById.get(l.id) ? { ...l, image: imgById.get(l.id) } : l),
  };
}

function bindChrome() {
  $('#themeBtn .i-sun').outerHTML = svg('sun', 'i-sun');
  $('#themeBtn .i-moon').outerHTML = svg('moon', 'i-moon');
  $('#themeBtn').addEventListener('click', () => {
    const next = toggleTheme();
    // Khung xem trước là iframe cùng origin → đổi giao diện luôn cho nó, khỏi phải tải lại.
    const fr = $('#frame').contentDocument;
    if (fr) fr.documentElement.setAttribute('data-theme', next);
  });
  $('#publishBtn').addEventListener('click', doPublish);
  $('#tabEdit').addEventListener('click', () => setTab(false));
  $('#tabPrev').addEventListener('click', () => setTab(true));
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importJson(f);
    e.target.value = '';
  });
  // Khung xem trước vừa tải xong → gửi bản nháp sang. Kiểm cả nguồn gửi: origin là cả
  // minhtoan8668.github.io nên chỉ xét origin thì trang khác cùng tên miền cũng gọi được.
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== $('#frame').contentWindow) return;
    if (e.data && e.data.type === 'elevato-links:ready') sendPreview();
  });
}

async function boot() {
  bindChrome();
  const ok = await loadPublished();
  const saved = store.get(DRAFT_KEY);
  if (!ok) toast(saved ? 'Không tải được bản trên web — đang sửa tiếp bản nháp trên máy.' : 'Không tải được data.json. Tải lại trang để thử lại.');
  ed.draft = normalize(upgradeDraft(saved, ed.published) || JSON.parse(ed.published || '{}'));
  if (saved) syncNow();          // nháp đời cũ vừa được nâng cấp → lưu lại bản đã chuẩn hoá
  renderForm();
  markDirty();
  sendPreview();
}

boot();
