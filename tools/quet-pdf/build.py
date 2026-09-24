#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ghép template.html + rules.js (+ lib/) thành 2 file:
   danh-muc-tai-lieu.html          (online: tải pdf.js / Tesseract.js / bộ tiếng Việt từ CDN lần đầu)
   danh-muc-tai-lieu-offline.html  (nhúng sẵn tất cả, ~8 MB, không cần mạng)
Chạy: python build.py"""
from pathlib import Path
here = Path(__file__).resolve().parent
tpl = (here / "template.html").read_text(encoding="utf-8")
rules = "var CONFIG = " + (here / "config.json").read_text(encoding="utf-8").strip() + ";\n" + (here / "rules.js").read_text(encoding="utf-8")
lib = here / "lib"

ONLINE_LIBS = """<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>"""
ONLINE_OCR = """pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let ocrWorker = null;
async function getOcrWorker(onStatus) {
  if (ocrWorker) return ocrWorker;
  onStatus('Đang tải bộ OCR tiếng Việt (lần đầu ~6 MB)...');
  ocrWorker = await Tesseract.createWorker('vie', 1, {
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/vie/4.0.0_best_int',
    workerPath: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
  });
  return ocrWorker;
}"""
OFFLINE_OCR = """const blobUrl = (id, type) => URL.createObjectURL(new Blob([document.getElementById(id).textContent], { type }));
pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl('lib-pdfworker', 'application/javascript');
function b64ToBytes(b64) { const bin = atob(b64), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
let ocrWorker = null;
async function getOcrWorker(onStatus) {
  if (ocrWorker) return ocrWorker;
  onStatus('Đang khởi động bộ OCR tiếng Việt (nhúng sẵn, không cần mạng)...');
  const vie = b64ToBytes(document.getElementById('lib-vie').textContent.trim());
  ocrWorker = await Tesseract.createWorker([{ code: 'vie', data: vie }], 1, {
    workerPath: blobUrl('lib-tessworker', 'application/javascript'), // worker đã gộp sẵn core wasm
    workerBlobURL: false, cacheMethod: 'none', gzip: true,
  });
  return ocrWorker;
}"""

def build(out, libs, ocr, subtitle):
    html = tpl.replace("{{LIBS}}", libs).replace("{{OCR_INIT}}", ocr).replace("{{SUBTITLE}}", subtitle).replace("{{RULES}}", rules)
    (here / out).write_text(html, encoding="utf-8")
    print(f"{out}: {len(html.encode('utf-8')) / 1e6:.1f} MB")

build("danh-muc-tai-lieu.html", ONLINE_LIBS, ONLINE_OCR,
      "Rule-based · chạy trong trình duyệt · OCR tiếng Việt (Tesseract.js, tải lần đầu) · bản Python nhanh hơn: quet_pdf.py")

def inline(fn): return (lib / fn).read_text(encoding="utf-8")
off_libs = "\n".join([
    f"<script>{inline('pdf.min.js')}</script>",
    f"<script>{inline('tesseract.min.js')}</script>",
    f"<script>{inline('xlsx.full.min.js')}</script>",
    f'<script type="text/plain" id="lib-pdfworker">{inline("pdf.worker.min.js")}</script>',
    f'<script type="text/plain" id="lib-tessworker">{inline("tesseract-worker-with-core.js")}</script>',
    f'<script type="text/plain" id="lib-vie">{inline("vie.traineddata.gz.b64")}</script>',
])
build("danh-muc-tai-lieu-offline.html", off_libs, OFFLINE_OCR, "Offline · không cần mạng · OCR tiếng Việt nhúng sẵn")
