#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quet_pdf.py — Quét PDF tiếng Việt (scan hoặc có text) -> OCR -> tách văn bản
-> trích Số / Ngày / Tên / Nội dung -> xuất Excel "Danh mục tài liệu".
Cùng bộ rule với bản trình duyệt (rules.py là bản Python của rules.js, cấu hình chung config.json).

Ví dụ:
  python quet_pdf.py ./ho-so                       # quét cả thư mục, ra danh-muc-tai-lieu.xlsx
  python quet_pdf.py a.pdf b.pdf -o dm.xlsx --section "I.1 PHÁP LÝ"
  python quet_pdf.py ./ho-so --txt-dir ./text      # lưu thêm text OCR từng file
  python quet_pdf.py ./ho-so --searchable-dir ./pdf-text   # xuất PDF có lớp text tìm kiếm được
  python quet_pdf.py ./ho-so --pages 3             # OCR 3 trang đầu mỗi file (mặc định chỉ trang 1)
  python quet_pdf.py ./gop.pdf --mode auto         # PDF gộp nhiều văn bản: OCR hết, tự tách theo trang đầu

Yêu cầu: tesseract-ocr + tesseract-ocr-vie (xem README.md), pip install -r requirements.txt
"""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# QUAN TRỌNG: tesseract tự bật OpenMP đa luồng; trên máy ít nhân / container điều đó làm 1 trang
# từ ~2s thành >60s. Khóa 1 luồng/tiến trình và chạy song song nhiều trang bằng --jobs.
os.environ.setdefault("OMP_THREAD_LIMIT", "1")

import pymupdf  # noqa: E402
import pytesseract  # noqa: E402
from PIL import Image, ImageFilter, ImageOps  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rules  # noqa: E402

MIN_TEXT_CHARS = 40  # trang có ít hơn ngần này ký tự text layer -> coi là scan -> OCR


# ------------------------------------------------------------------ OCR
def render_page(page: pymupdf.Page, dpi: int, denoise: bool = False) -> Image.Image:
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    if denoise:  # scan nhiễu hạt / nền xám: lọc trung vị + nhị phân hóa
        img = ImageOps.autocontrast(img).filter(ImageFilter.MedianFilter(3)).point(lambda v: 255 if v > 150 else 0)
    return img


def ocr_image(img: Image.Image, lang: str, psm: int, timeout: int) -> str:
    """OCR 1 ảnh; quá thời gian thì thử lại psm 3 (tự động phân đoạn), vẫn quá thì trả về rỗng."""
    for p in (psm, 6 if psm != 6 else 3):
        try:
            return pytesseract.image_to_string(img, lang=lang, config=f"--psm {p}", timeout=timeout)
        except RuntimeError:  # pytesseract ném RuntimeError khi timeout
            continue
    return ""


def file_key(path: Path, dpi: int, lang: str, psm: int, denoise: bool, pages: str) -> str:
    h = hashlib.sha1()
    h.update(f"{dpi}|{lang}|{psm}|{denoise}|{pages}|{path.stat().st_size}|".encode())
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def page_texts(path: Path, a, log) -> list[dict]:
    """Trả về [{page, text, ocr}] cho từng trang; có cache theo nội dung file."""
    cache = a.cache_dir / (file_key(path, a.dpi, a.lang, a.psm, a.denoise, a.pages) + ".json")
    if cache.exists() and not a.no_cache:
        log(f"  cache: {path.name}")
        return json.loads(cache.read_text(encoding="utf-8"))

    doc = pymupdf.open(path)
    n = len(doc)
    out = [None] * n
    todo = []
    max_pages = n if a.pages == "all" else min(n, int(a.pages))
    for i, page in enumerate(doc):
        text = page.get_text("text") if not a.force_ocr else ""
        has_layer = len(text.strip()) >= MIN_TEXT_CHARS and rules.looks_vietnamese(text)  # lớp text hỏng font -> OCR lại
        if has_layer or a.no_ocr or i >= max_pages:
            out[i] = {"page": i + 1, "text": text, "ocr": False}
        else:
            todo.append(i)

    if todo:
        log(f"  OCR {len(todo)}/{n} trang ({a.jobs} luồng, {a.dpi} dpi, lang={a.lang})")
        # render tuần tự (pymupdf không thread-safe theo document), OCR song song (tesseract là process riêng)
        imgs = {i: render_page(doc[i], a.dpi, a.denoise) for i in todo}
        done = 0
        t0 = time.time()

        def work(i):
            return i, ocr_image(imgs[i], a.lang, a.psm, a.timeout)

        with ThreadPoolExecutor(max_workers=a.jobs) as ex:
            for i, text in ex.map(work, todo):
                out[i] = {"page": i + 1, "text": text, "ocr": True}
                done += 1
                if done % 5 == 0 or done == len(todo):
                    log(f"    {done}/{len(todo)} trang, {time.time() - t0:.0f}s")
    doc.close()
    a.cache_dir.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def make_searchable_pdf(path: Path, out_path: Path, a, log):
    """Ghép lớp text (ẩn) lên trang scan để PDF tìm kiếm / copy được."""
    src = pymupdf.open(path)
    dst = pymupdf.open()
    for i, page in enumerate(src):
        if len(page.get_text("text").strip()) >= MIN_TEXT_CHARS and not a.force_ocr:
            dst.insert_pdf(src, from_page=i, to_page=i)
            continue
        img = render_page(page, a.dpi, a.denoise)
        pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, lang=a.lang, config=f"--psm {a.psm}", extension="pdf", timeout=a.timeout * 2)
        dst.insert_pdf(pymupdf.open("pdf", pdf_bytes))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    dst.save(out_path, garbage=3, deflate=True)
    log(f"  -> PDF tìm kiếm được: {out_path}")


# ------------------------------------------------------------------ xử lý 1 file
def process_pdf(path: Path, a, log) -> list[dict]:
    pages = page_texts(path, a, log)
    if a.txt_dir:
        a.txt_dir.mkdir(parents=True, exist_ok=True)
        (a.txt_dir / (path.stem + ".txt")).write_text(
            "\n\n".join(f"===== Trang {p['page']}{' (OCR)' if p['ocr'] else ''} =====\n{p['text']}" for p in pages),
            encoding="utf-8")
    if a.searchable_dir:
        make_searchable_pdf(path, a.searchable_dir / path.name, a, log)

    rows = []
    for d in rules.split_documents(pages, a.mode):
        f = rules.extract_fields(d["text"], path.name)  # ngày: tiêu đề -> "địa danh, ngày" -> tên file -> nội dung (xem rules.py)
        rows.append({
            "so": f.so, "ngay": f.ngay.fmt() if f.ngay else "", "ten": f.ten, "noi_dung": f.noi_dung,
            "to_so": "", "loai": f.loai, "file": path.name,
            "trang": str(d["start"]) if d["start"] == d["end"] else f"{d['start']}-{d['end']}",
            "ocr": d["ocr"], "nguon_ngay": f.nguon_ngay if f.ngay else "", "text": d["text"],
        })
    return rows


# ------------------------------------------------------------------ Excel
def export_xlsx(rows: list[dict], out: Path, section: str):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Danh mục"
    thin = Side(style="thin", color="999999")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    ws.append(["DANH MỤC TÀI LIỆU"])
    ws.merge_cells("A1:F1")
    ws["A1"].font = Font(bold=True, size=14)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append(["STT", "Số văn bản", "Ngày văn bản", "Tên văn bản", "Nội dung văn bản", "Tờ số"])
    for c in ws[2]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="DDEBF7")
        c.border = border
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    if section:
        parts = section.split(" ", 1)
        ws.append([parts[0], parts[1] if len(parts) > 1 else ""])
        for c in ws[ws.max_row]:
            c.font = Font(bold=True)
    for i, r in enumerate(rows, 1):
        ngay = r["ngay"]
        m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", ngay or "")
        if m:
            import datetime
            ngay = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        ws.append([i, r["so"], ngay, r["ten"], r["noi_dung"], r["to_so"]])
        row = ws[ws.max_row]
        for c in row:
            c.border = border
            c.alignment = Alignment(vertical="top", wrap_text=True)
        row[2].number_format = "dd/mm/yyyy"
        row[0].alignment = Alignment(horizontal="center", vertical="top")
    for col, w in zip("ABCDEF", (6, 26, 14, 55, 55, 10)):
        ws.column_dimensions[col].width = w

    # Sheet 2: chi tiết để kiểm tra
    ws2 = wb.create_sheet("Chi tiết")
    ws2.append(["STT", "File", "Trang", "Loại nhận diện", "OCR", "Nguồn ngày", "Text 500 ký tự đầu"])
    for c in ws2[1]:
        c.font = Font(bold=True)
    for i, r in enumerate(rows, 1):
        ws2.append([i, r["file"], r["trang"], r["loai"], "x" if r["ocr"] else "", r["nguon_ngay"],
                    re.sub(r"\s+", " ", r["text"])[:500]])
    for i, w in enumerate((6, 40, 8, 16, 6, 22, 100), 1):
        ws2.column_dimensions[get_column_letter(i)].width = w
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)


# ------------------------------------------------------------------ main
def collect(inputs: list[str]) -> list[Path]:
    files = []
    for s in inputs:
        p = Path(s)
        if p.is_dir():
            files += sorted(q for q in p.rglob("*") if q.suffix.lower() == ".pdf")
        elif p.suffix.lower() == ".pdf":
            files.append(p)
        else:
            print(f"bỏ qua (không phải PDF): {p}", file=sys.stderr)
    return files


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="file PDF hoặc thư mục (quét đệ quy)")
    ap.add_argument("-o", "--out", default="danh-muc-tai-lieu.xlsx", help="file Excel đầu ra")
    ap.add_argument("--section", default="", help='dòng mục đầu bảng, VD: "I.1 PHÁP LÝ"')
    ap.add_argument("--pages", default="1",
                    help="số trang đầu mỗi file đem OCR (mặc định 1: thông tin nằm ở trang đầu). 'all' = OCR hết")
    ap.add_argument("--mode", choices=["file", "auto", "page"], default="file",
                    help="file: 1 file = 1 văn bản (mặc định); auto: tự tách văn bản trong PDF gộp (OCR hết trang); page: 1 trang = 1 văn bản")
    ap.add_argument("--lang", default="vie", help="ngôn ngữ tesseract (vie, vie+eng)")
    ap.add_argument("--dpi", type=int, default=300, help="độ phân giải render để OCR (300 chuẩn; 400 nếu scan mờ)")
    ap.add_argument("--psm", type=int, default=3, help="tesseract page segmentation mode (3: tự phân đoạn, hợp bố cục 2 cột; 6: 1 khối văn bản)")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1), help="số luồng OCR song song")
    ap.add_argument("--timeout", type=int, default=120, help="giây tối đa OCR 1 trang (quá thì thử psm 3, rồi bỏ trang)")
    ap.add_argument("--denoise", action="store_true", help="lọc nhiễu + nhị phân hóa ảnh trước khi OCR (scan xấu, nền xám)")
    ap.add_argument("--no-ocr", action="store_true", help="chỉ đọc text layer, không OCR")
    ap.add_argument("--force-ocr", action="store_true", help="OCR mọi trang kể cả có text layer")
    ap.add_argument("--txt-dir", type=Path, help="thư mục lưu text OCR (.txt) từng file")
    ap.add_argument("--searchable-dir", type=Path, help="thư mục xuất PDF có lớp text (tìm kiếm/copy được)")
    ap.add_argument("--cache-dir", type=Path, default=Path(".quet-pdf-cache"), help="cache OCR (xóa để OCR lại)")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--json", type=Path, help="xuất thêm JSON kết quả")
    a = ap.parse_args()

    if not shutil.which("tesseract"):
        sys.exit("Không tìm thấy tesseract. Cài: apt install tesseract-ocr tesseract-ocr-vie (xem README.md)")
    langs = pytesseract.get_languages(config="")
    for l in a.lang.split("+"):
        if l not in langs:
            sys.exit(f"Tesseract chưa có gói ngôn ngữ '{l}'. Có: {langs}. Cài: apt install tesseract-ocr-{l} "
                     f"hoặc tải {l}.traineddata vào thư mục tessdata.")

    if a.mode != "file":
        a.pages = "all"  # tách văn bản cần text của mọi trang
    if a.pages != "all" and not a.pages.isdigit():
        sys.exit("--pages phải là số hoặc 'all'")
    files = sorted(collect(a.inputs), key=natural_key)
    if not files:
        sys.exit("Không có file PDF nào.")
    log = lambda s: print(s, flush=True)
    rows = []
    for k, f in enumerate(files, 1):
        log(f"[{k}/{len(files)}] {f}")
        try:
            rs = process_pdf(f, a, log)
        except Exception as e:  # noqa: BLE001
            log(f"  LỖI: {e}")
            rs = [{"so": "", "ngay": "", "ten": f"(lỗi đọc file) {f.name}", "noi_dung": str(e), "to_so": "",
                   "loai": "lỗi", "file": f.name, "trang": "", "ocr": False, "nguon_ngay": "", "text": ""}]
        for r in rs:
            log(f"  + [{r['loai']}] tr.{r['trang']} | {r['so']} | {r['ngay']} | {r['ten']} | {r['noi_dung'][:60]}")
        rows += rs

    out = Path(a.out)
    export_xlsx(rows, out, a.section)
    log(f"\nXong: {len(rows)} dòng -> {out}")
    if a.json:
        a.json.write_text(json.dumps([{k: v for k, v in r.items() if k != 'text'} for r in rows],
                                     ensure_ascii=False, indent=1), encoding="utf-8")
        log(f"JSON -> {a.json}")
    thieu = [i + 1 for i, r in enumerate(rows) if not (r["so"] and r["ngay"] and r["ten"])]
    if thieu:
        log(f"Cần kiểm tra tay (thiếu số/ngày/tên): dòng {thieu}")


if __name__ == "__main__":
    main()
