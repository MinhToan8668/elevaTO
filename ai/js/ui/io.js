// Cắt trang để gửi AI. PDF có chữ: gửi PDF con (nhẹ, AI đọc chữ gốc chính xác nhất).
// PDF con quá nặng (scan độ phân giải cao) hoặc ảnh chụp: gửi ảnh JPEG từng trang.

import { toBase64 } from '../ai.js';

// Gemini nhận tối đa ~20MB mỗi yêu cầu (sau base64 tăng 1/3) → giữ phần file dưới 13MB.
const MAX_INLINE = 13 * 1024 * 1024;

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

  async function pageParts(jobId, pages) {
    const m = ctx.media.get(jobId);
    if (!m) throw new Error('File gốc không còn trong trình duyệt — tải lại file');
    if (m.pdf) {
      const { subsetPdf } = await import('../pdf.js');
      const bytes = await subsetPdf(m.pdf.bytes, pages);
      if (bytes.length <= MAX_INLINE) return [{ inlineData: { mimeType: 'application/pdf', data: await toBase64(bytes) } }];
      return pageImages(jobId, pages, 1500, 0.7);
    }
    return pageImages(jobId, pages, 1800, 0.8);
  }

  return { pageImages, pageParts };
}
