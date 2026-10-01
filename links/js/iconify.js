// Tìm icon trong thư viện Iconify (api.iconify.design, miễn phí, không cần tài khoản).
// Icon chọn xong được tải về và nhúng thẳng vào data.json (data URL), nên trang công khai không phụ thuộc Iconify.

import { utf8ToBase64 } from './core.js';

const API = 'https://api.iconify.design';
// Chỉ các bộ icon nhiều màu, nhìn "chuyên nghiệp" khi đặt trên ô màu (bộ đơn sắc dễ chìm trên nền tối).
export const ICON_SETS = ['fluent-emoji-flat', 'fluent-color', 'noto', 'streamline-color', 'flat-color-icons', 'logos', 'skill-icons', 'vscode-icons'];
const ID = /^[a-z0-9-]+:[a-z0-9-]+$/;
const MAX_SVG_BYTES = 60000;

const svgUrl = (id) => {
  if (!ID.test(id)) throw new Error('Tên icon không hợp lệ.');
  const [prefix, name] = id.split(':');
  return `${API}/${prefix}/${name}.svg`;
};

export function preview(id) {
  return svgUrl(id);
}

/** Danh sách id dạng "bộ:tên". */
export async function search(term, fetchFn = fetch) {
  const url = `${API}/search?query=${encodeURIComponent(term)}&limit=64&prefixes=${ICON_SETS.join(',')}`;
  let res;
  try { res = await fetchFn(url); } catch (e) { throw new Error('Không kết nối được Iconify. Kiểm tra mạng rồi thử lại.'); }
  if (!res.ok) throw new Error('Iconify báo lỗi ' + res.status + '.');
  const body = await res.json();
  return (Array.isArray(body.icons) ? body.icons : []).filter((id) => ID.test(id));
}

/** Tải SVG của icon → data URL để lưu vào trang. */
export async function get(id, fetchFn = fetch) {
  const url = svgUrl(id);
  let res;
  try { res = await fetchFn(url); } catch (e) { throw new Error('Không tải được icon. Thử lại.'); }
  if (!res.ok) throw new Error('Không tải được icon (' + res.status + ').');
  const text = await res.text();
  if (!/^\s*<svg[\s>]/i.test(text) || text.length > MAX_SVG_BYTES) throw new Error('Icon này không dùng được, chọn icon khác.');
  return 'data:image/svg+xml;base64,' + utf8ToBase64(text);
}
