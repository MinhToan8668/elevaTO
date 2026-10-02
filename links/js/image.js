// Ảnh chọn từ máy → thu nhỏ + nén ngay trong trình duyệt → data URL nằm luôn trong data.json.
// Không cần chỗ lưu ảnh riêng: bấm "Đăng lên web" là ảnh đi cùng nội dung trang.

const TYPES = /^image\/(png|jpe?g|webp|gif|heic|heif|avif|bmp)$/i;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Trình duyệt không đọc được ảnh này. Thử ảnh JPG hoặc PNG.')); };
    img.src = url;
  });
}

/**
 * Thu nhỏ để cạnh dài nhất ≤ maxSide, cắt vuông nếu square, xuất WebP (máy không hỗ trợ thì JPEG).
 * @returns {Promise<string>} data URL
 */
export async function fileToDataUrl(file, { maxSide = 512, square = false, quality = 0.84 } = {}) {
  if (!file || !TYPES.test(file.type || '')) throw new Error('Chỉ nhận file ảnh (JPG, PNG, WebP…).');
  const img = await loadImage(file);
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Kích thước gần đúng (KB) của một data URL base64. */
export function dataUrlKb(u) {
  const i = u.indexOf(',');
  return i < 0 ? 0 : Math.round(((u.length - i - 1) * 3) / 4 / 1024);
}

/** Mở hộp chọn file ảnh của máy, trả về File (hoặc null nếu bấm huỷ). */
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => resolve(input.files[0] || null), { once: true });
    input.click();
  });
}
