// Nạp thư viện trong vendor/ khi cần (không nạp sẵn lúc mở trang, không dùng CDN).

import { t } from './i18n.js';

const pending = new Map();

function loadScript(file, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  const src = new URL(`../vendor/${file}`, import.meta.url).href;
  if (!pending.has(src)) {
    pending.set(src, new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => (window[globalName] ? ok(window[globalName]) : fail(new Error(`Thư viện ${globalName} nạp lỗi`)));
      s.onerror = () => { pending.delete(src); s.remove(); fail(new Error(`Không tải được thư viện ${globalName} — kiểm tra mạng rồi thử lại`)); };
      document.head.append(s);
    }));
  }
  return pending.get(src);
}

export const loadJSZip = () => loadScript('jszip/jszip.min.js', 'JSZip');
export const loadPdfLib = () => loadScript('pdf-lib/pdf-lib.min.js', 'PDFLib');
export const loadXLSX = () => loadScript('sheetjs/xlsx.full.min.js', 'XLSX');

/**
 * Mở file .xlsx (zip). Kiểm tra dung lượng GIẢI NÉN trước khi đọc: file nén 1MB có thể bung ra vài GB
 * (zip bomb) làm treo tab. JSZip tự đối chiếu dung lượng thật khi giải nén nên không khai man được.
 */
export async function openZip(buf, { maxTotal = 400e6, maxEntry = 150e6 } = {}) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(buf);
  let total = 0;
  for (const f of Object.values(zip.files)) {
    const n = Number(f._data?.uncompressedSize) || 0;
    total += n;
    if (n > maxEntry || total > maxTotal) throw new Error(t('e.zipBomb'));
  }
  return zip;
}
