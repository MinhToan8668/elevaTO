// Nối trang link với backend Apps Script của trang khoá học (backend/Code.gs, cùng bot Telegram).
// Trang công khai đọc nội dung ở đây; trình chỉnh sửa lưu vào đây bằng ADMIN_KEY — không cần token GitHub.
// Gửi Content-Type text/plain để trình duyệt không hỏi CORS trước (Apps Script không trả lời được bước đó).

export const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwHtZ-rxyJuDxtDRIVaCSDZc-0t6R0Acsx4C16shB0WXXFCgm73smcHUDOhn6GlilPF/exec';
const TIMEOUT_MS = 8000;

const MESSAGES = {
  unauthorized: 'ADMIN_KEY không đúng. Nhắn bot Telegram lệnh /linkkey để lấy key, rồi dán lại.',
  locked: 'Nhập sai key nhiều lần quá — máy chủ tạm khoá 15 phút. Lấy đúng key bằng /linkkey rồi thử lại sau.',
  invalid: 'Dữ liệu trang không đúng dạng — tải lại trang sửa rồi thử lại.',
  too_large: 'Trang nặng quá (ảnh tải lên quá lớn). Bỏ bớt ảnh hoặc dùng ảnh nhỏ hơn.',
  busy: 'Máy chủ đang bận — đợi vài giây rồi bấm lại.',
  'unknown action': 'Máy chủ Apps Script chưa có bản mới. Dán backend/Code.gs mới vào Apps Script rồi Triển khai → Quản lý bản triển khai → sửa → Phiên bản mới (xem links/README.md).',
  internal: 'Máy chủ gặp lỗi — xem sheet Log trong Google Sheet.',
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
  const code = body && body.error ? String(body.error) : '';
  return new Error(MESSAGES[code] || 'Máy chủ báo lỗi' + (code ? ': ' + code : '') + '.');
}

/** Nội dung trang đã lưu trên máy chủ, hoặc null (chưa lưu lần nào / máy chủ chưa có bản mới / lỗi mạng). */
export async function fetchLinks(fetchFn = fetch) {
  try {
    const body = await call(BACKEND_URL + '?action=links&t=' + Date.now(), { cache: 'no-store' }, fetchFn);
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
