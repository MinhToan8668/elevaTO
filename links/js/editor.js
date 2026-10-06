// Trình chỉnh sửa trang link-in-bio: tải bản đang chạy trên web, mở bản nháp đã lưu trên máy, dựng form.
// Nội dung form nằm trong edit-panels.js · trạng thái nháp trong edit-state.js · đăng lên web trong edit-publish.js.

import { $, store, toast, toggleTheme } from './dom.js';
import { normalize, mergeDraft } from './core.js';
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
  if (!saved || saved.version >= 2 || saved.theme || !publishedText) return saved;
  const pub = JSON.parse(publishedText);
  // Bản trên web có thể đã là đời 2 (nhiều thương hiệu) trong khi nháp còn đời 1: gom ảnh của
  // MỌI thương hiệu và cả ô ghim, không thì nháp cũ không được điền ảnh và ô hiện ra trống trơn.
  const bs = pub.brands && pub.brands.length ? pub.brands : [pub];
  const imgById = new Map();
  for (const b of bs) for (const l of b.links || []) imgById.set(l.id, l.image);
  for (const l of pub.pinned || []) imgById.set(l.id, l.image);
  return {
    ...saved,
    theme: bs[0].theme,
    links: (saved.links || []).map((l) =>
      OLD_DEFAULT_IMAGES.includes(l.image || '') && imgById.get(l.id) ? { ...l, image: imgById.get(l.id) } : l),
  };
}

/**
 * Khung xem trước nạp index.html của chính trang công khai. Máy chủ cho HTML sống trong bộ nhớ đệm
 * khá lâu (GitHub Pages: 10 phút), nên ngay sau khi đổi index.html thì khung này vẫn vẽ theo bản cũ —
 * chủ trang tưởng code hỏng. Gắn dấu thời gian để mỗi lần mở trang sửa là lấy bản mới nhất.
 */
function loadPreview() {
  $('#frame').src = 'index.html?preview&t=' + Date.now();
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
  loadPreview();
  const ok = await loadPublished();
  const saved = store.get(DRAFT_KEY);
  if (!ok) toast(saved ? 'Không tải được bản trên web — đang sửa tiếp bản nháp trên máy.' : 'Không tải được data.json. Tải lại trang để thử lại.');
  ed.draft = normalize(upgradeDraft(saved, ed.published) || JSON.parse(ed.published || '{}'));
  if (saved && ed.published) ed.draft = mergeDraft(ed.draft, normalize(JSON.parse(ed.published)));
  if (saved) syncNow();          // nháp đời cũ vừa được nâng cấp → lưu lại bản đã chuẩn hoá
  renderForm();
  markDirty();
  sendPreview();
}

boot();
