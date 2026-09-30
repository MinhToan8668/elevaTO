// Cắt trang để gửi AI.
//   PDF có chữ  → gửi PDF con: nhẹ nhất, AI đọc thẳng chữ gốc nên số chính xác nhất.
//   PDF scan    → gửi ẢNH JPEG từng trang. Gửi PDF scan cho Gemini rất hay ra kết quả rỗng
//                 (gặp thật với BCTC kiểm toán bản scan: cùng trang đó, gửi ảnh thì AI đọc được,
//                 gửi PDF thì không thấy bảng nào), nên bản scan luôn đi đường ảnh.
//   Ảnh chụp    → vốn đã là ảnh.

import { toBase64 } from '../ai.js';

// Gemini nhận tối đa ~20MB mỗi yêu cầu (sau base64 tăng 1/3) → giữ phần file dưới 13MB.
const MAX_INLINE = 13 * 1024 * 1024;
/** Ảnh gửi AI: đủ nét để đọc bảng số trong BCTC scan. */
export const CO_ANH = { width: 1800, quality: 0.8 };

/** @returns 'pdf' | 'anh' */
export function cachGui({ coPdf, scanned, cỡPdf }) {
  if (!coPdf || scanned) return 'anh';
  return cỡPdf <= MAX_INLINE ? 'pdf' : 'anh';
}

export function createIO(ctx) {
  async function pageImages(jobId, pages, width = 1600, quality = 0.8) {
    const m = ctx.media.get(jobId);
    if (!m) throw new Error('File gốc không còn trong trình duyệt — tải lại file');
    const { pageJpeg, imageJpeg } = await import('../pdf.js');
    const out = [];
    for (const n of pages) {
      const data = m.pdf ? await pageJpeg(m.pdf.doc, n, width, quality) : await imageJpeg(m.images[n - 1], Math.max(width, 1200), quality);
      out.push({ inlineData: { mimeType: 'image/jpeg', data } });
    }
    return out;
  }

  async function pageParts(jobId, pages, { scanned = false } = {}) {
    const m = ctx.media.get(jobId);
    if (!m) throw new Error('File gốc không còn trong trình duyệt — tải lại file');
    if (m.pdf && !scanned) {
      const { subsetPdf } = await import('../pdf.js');
      const bytes = await subsetPdf(m.pdf.bytes, pages);
      if (cachGui({ coPdf: true, scanned, cỡPdf: bytes.length }) === 'pdf') {
        return [{ inlineData: { mimeType: 'application/pdf', data: await toBase64(bytes) } }];
      }
    }
    return pageImages(jobId, pages, CO_ANH.width, CO_ANH.quality);
  }

  return { pageImages, pageParts };
}
