// Đọc PDF trong trình duyệt: chữ từng trang (để nhận diện trang), ảnh thu nhỏ, cắt trang gửi AI.
// pdf.js (bản legacy, chạy được cả trình duyệt chưa cập nhật) và pdf-lib để sẵn trong vendor/.

import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { loadPdfLib } from './libs.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const V = (p) => new URL(`../vendor/pdfjs/${p}`, import.meta.url).href;

export async function openPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // pdf.js giữ quyền sở hữu buffer truyền vào → đưa bản sao, giữ bản gốc để cắt trang.
  // wasm: giải mã ảnh JPEG 2000 / JBIG2 của bản scan (thiếu thì trang scan hiện trắng);
  // cmaps + standard_fonts: đọc đúng chữ của PDF dùng font CID / font chuẩn không nhúng.
  const doc = await pdfjs.getDocument({
    data: bytes.slice(), isEvalSupported: false,
    wasmUrl: V('wasm/'), cMapUrl: V('cmaps/'), cMapPacked: true, standardFontDataUrl: V('standard_fonts/'), iccUrl: V('iccs/'),
  }).promise;
  return { doc, bytes, numPages: doc.numPages };
}

export async function pageTexts(doc, onProgress) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  return out;
}

/** Vẽ một trang ra canvas. `hold` (tuỳ chọn) nhận `hold.task` để người gọi huỷ lần vẽ đã lỗi thời. */
export async function renderPage(doc, n, width, hold) { return render(doc, n, width, hold); }

async function render(doc, n, width, hold) {
  const page = await doc.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, viewport: vp });
  if (hold) hold.task = task;
  try { await task.promise; } catch (e) { canvas.width = 0; canvas.height = 0; throw e; } finally { page.cleanup(); }
  return canvas;
}

export async function thumbnail(doc, n, width = 150) {
  return (await render(doc, n, width)).toDataURL('image/jpeg', 0.6);
}

/** Trang → JPEG base64 (cho bản scan / file quá nặng). */
export async function pageJpeg(doc, n, width = 1500, quality = 0.75) {
  return (await render(doc, n, width)).toDataURL('image/jpeg', quality).split(',')[1];
}

/** PDF mới chỉ gồm các trang đã chọn (đánh số từ 1). */
export async function subsetPdf(bytes, pages) {
  const PDFLib = await loadPdfLib();
  const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFLib.PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

/** Ảnh chụp → JPEG base64, thu nhỏ cạnh dài về tối đa maxSide (ảnh điện thoại thường 4000px, 5MB). */
export async function imageJpeg(file, maxSide = 2000, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}
