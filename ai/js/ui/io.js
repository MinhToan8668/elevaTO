// Cắt trang để gửi AI.
//   PDF có chữ  → gửi PDF con: nhẹ nhất, AI đọc thẳng chữ gốc nên số chính xác nhất.
//   PDF scan    → cũng gửi PDF con. Đã đo trên BCTC hợp nhất VHC 2025 (64 trang scan CCITT G4):
//                 3 trang CĐKT chỉ nặng 112 KB và Gemini đọc ra đủ 68 chỉ tiêu, trong khi ảnh JPEG
//                 cùng 3 trang nặng hơn khoảng 10 lần. Ảnh chỉ dùng khi lượt đọc đầu không ra số.
//   Ảnh chụp    → vốn đã là ảnh.

import { toBase64 } from '../ai.js';

// Gemini nhận tối đa ~20MB mỗi yêu cầu (sau base64 tăng 1/3) → giữ phần file dưới 13MB.
const MAX_INLINE = 13 * 1024 * 1024;
/** Ảnh gửi AI: đủ nét để đọc bảng số trong BCTC scan. */
export const CO_ANH = { width: 1800, quality: 0.8 };

/** @returns 'pdf' | 'anh' */
export function cachGui({ coPdf, cỡPdf, anh = false }) {
  if (!coPdf || anh) return 'anh';
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

  async function pageParts(jobId, pages, { anh = false } = {}) {
    const m = ctx.media.get(jobId);
    if (!m) throw new Error('File gốc không còn trong trình duyệt — tải lại file');
    if (m.pdf && !anh) {
      const { subsetPdf } = await import('../pdf.js');
      const bytes = await subsetPdf(m.pdf.bytes, pages);
      if (cachGui({ coPdf: true, cỡPdf: bytes.length }) === 'pdf') {
        return [{ inlineData: { mimeType: 'application/pdf', data: await toBase64(bytes) } }];
      }
    }
    return pageImages(jobId, pages, CO_ANH.width, CO_ANH.quality);
  }

  return { pageImages, pageParts };
}
