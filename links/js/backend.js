// Nối trang link với máy chủ elevaTO trên Cloudflare Workers (mã nguồn ở ai/worker/src/links.js).
// Trang công khai đọc nội dung ở đây; trình chỉnh sửa lưu vào đây bằng ADMIN_KEY — không cần token GitHub.
//
// Trước đây dùng Apps Script, nhưng đo được nó trả lời mất ~4 giây: trang vẽ bản dự phòng rồi mới
// đổi sang nội dung thật, người xem thấy giao diện nhảy. Worker trả lời trong vài chục mili-giây.
//
// Gửi Content-Type text/plain cho POST để trình duyệt khỏi hỏi CORS trước — bớt một vòng đi về;
// Worker đọc thân yêu cầu dạng chữ rồi tự phân tích JSON nên không quan tâm nhãn này.

// DÒNG DƯỚI DO MÁY ĐIỀN: sau mỗi lần triển khai, GitHub Actions lấy địa chỉ workers.dev thật rồi
// tự sửa và commit (xem ai/worker/tools/config-url.mjs). Sửa cả CSP trong index.html / edit.html.
export const BACKEND_URL = 'https://elevato.minhtoantowork.workers.dev';
const LINKS_URL = BACKEND_URL + '/links';
const TIMEOUT_MS = 8000;

// Mã lỗi → câu tiếng Việt. Worker tự trả câu tiếng Việt rồi, bảng này để lời văn trong trang
// không đổi theo máy chủ, và để các mã của bản Apps Script cũ vẫn hiểu được.
const MESSAGES = {
  auth: 'ADMIN_KEY không đúng. Nhắn bot Telegram “elevaTO AI BCTC” lệnh /linkkey để lấy key, rồi dán lại.',
  unauthorized: 'ADMIN_KEY không đúng. Nhắn bot Telegram “elevaTO AI BCTC” lệnh /linkkey để lấy key, rồi dán lại.',
  khoa_tam: 'Nhập sai key nhiều lần quá — máy chủ tạm khoá 15 phút. Lấy đúng key bằng /linkkey rồi thử lại sau.',
  locked: 'Nhập sai key nhiều lần quá — máy chủ tạm khoá 15 phút. Lấy đúng key bằng /linkkey rồi thử lại sau.',
  bad: 'Dữ liệu trang không đúng dạng — tải lại trang sửa rồi thử lại.',
  invalid: 'Dữ liệu trang không đúng dạng — tải lại trang sửa rồi thử lại.',
  qua_lon: 'Trang nặng quá (ảnh tải lên quá lớn). Bỏ bớt ảnh hoặc dùng ảnh nhỏ hơn.',
  too_large: 'Trang nặng quá (ảnh tải lên quá lớn). Bỏ bớt ảnh hoặc dùng ảnh nhỏ hơn.',
  setup: 'Máy chủ chưa nối cơ sở dữ liệu D1 — xem ai/worker/README.md.',
  busy: 'Máy chủ đang bận — đợi vài giây rồi bấm lại.',
  internal: 'Máy chủ gặp lỗi, thử lại sau ít phút.',
  upstream: 'Máy chủ gặp lỗi, thử lại sau ít phút.',
};

async function call(url, init, fetchFn) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : 0;
  try {
    const res = await fetchFn(url, { ...init, signal: ctl ? ctl.signal : undefined });
    return await res.json();
  } catch (e) {
    throw new Error('Không kết nối được máy chủ elevaTO. Kiểm tra mạng rồi thử lại.');
  } finally {
    clearTimeout(timer);
  }
}

function fail(body) {
  const code = String((body && (body.code || body.error)) || '');
  if (MESSAGES[code]) return new Error(MESSAGES[code]);
  // Mã lạ: máy chủ đã kèm sẵn câu giải thích thì dùng luôn, hơn là bắt chủ trang đoán mã.
  const msg = body && body.error ? String(body.error) : '';
  return new Error(msg || 'Máy chủ báo lỗi' + (code ? ': ' + code : '') + '.');
}

/** Nội dung trang đã lưu trên máy chủ, hoặc null (chưa lưu lần nào / máy chủ chưa có bản mới / lỗi mạng). */
export async function fetchLinks(fetchFn = fetch) {
  try {
    const body = await call(LINKS_URL + '?t=' + Date.now(), { cache: 'no-store' }, fetchFn);
    return body && body.ok && body.data && typeof body.data === 'object' ? body.data : null;
  } catch (e) {
    return null;
  }
}

function post(payload, fetchFn) {
  return call(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }, fetchFn);
}

/** Kiểm tra ADMIN_KEY. Sai thì ném lỗi tiếng Việt. */
export async function checkKey(key, fetchFn = fetch) {
  const body = await post({ action: 'checkKey', key }, fetchFn);
  if (!body || !body.ok) throw fail(body);
  return true;
}

/** Lưu nội dung trang. Trả về thời điểm máy chủ ghi nhận. */
export async function saveLinks(key, data, fetchFn = fetch) {
  const body = await post({ action: 'saveLinks', key, data }, fetchFn);
  if (!body || !body.ok) throw fail(body);
  return { updatedAt: body.updatedAt || '' };
}
