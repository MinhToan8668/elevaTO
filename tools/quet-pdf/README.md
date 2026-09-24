# quet-pdf — Quét PDF tiếng Việt → Danh mục tài liệu (Excel)

Đọc hàng loạt PDF hồ sơ pháp lý / hồ sơ tín dụng (scan hoặc có lớp text), OCR tiếng Việt **trang đầu**,
nhận diện loại văn bản và trích **Số văn bản / Ngày / Tên / Nội dung**, xuất Excel theo form "Danh mục tài liệu".

Ba cách dùng, **cùng một bộ rule**:

| File | Dùng khi | Cần cài |
|---|---|---|
| `danh-muc-tai-lieu-offline.html` (8,4 MB) | Mở bằng Chrome/Edge là chạy, **không cần mạng**, OCR nhúng sẵn | không |
| `danh-muc-tai-lieu.html` (0,1 MB) | Như trên nhưng tải thư viện + bộ tiếng Việt (~6 MB) từ CDN lần đầu | không |
| `quet_pdf.py` | Quét cả thư mục hàng trăm file, nhanh hơn (~1–3 giây/trang), cache OCR, xuất PDF tìm kiếm được | Python + Tesseract |

Đã test trên 29 file: 4 file scan thật (Điều lệ, Phụ lục sửa đổi điều lệ) + 12 mẫu nhiều kiểu trình bày
(tờ trình 2 cột, công văn không tiêu đề, báo cáo tiêu đề viết thường, hợp đồng, thông báo ngày ở cuối trang,
quyết định song ngữ, khế ước, GCN ĐKDN, biên bản, đề xuất dạng bảng, BCTTĐ, BCTC), mỗi mẫu 1 bản text + 1 bản scan.
Bản offline: 29 file trong 30 giây. Bản Python: 17 giây.

## 1. Bản trình duyệt

1. Mở file HTML bằng Chrome hoặc Edge. Kéo thả PDF vào ô (chọn được nhiều file).
2. Mặc định `1 file = 1 văn bản` và chỉ OCR **trang 1** (số / ngày / tên đều ở đó). PDF có lớp text sẽ đọc thẳng, không OCR.
   - `OCR N trang đầu`: tăng khi ngày nằm ở trang sau (Điều lệ thường ở trang 2–5).
   - `Luôn OCR`: bật khi PDF có lớp text nhưng font lỗi (tool cũng tự nhận biết lớp text không ra tiếng Việt).
   - `Tự động tách PDF gộp`: 1 PDF chứa nhiều văn bản, đọc mọi trang rồi tách theo trang có tiêu đề / quốc hiệu.
3. Ô vàng = chưa trích được, sửa trực tiếp trong bảng. Bấm `text` để xem chữ đọc được. `⤴ gộp` nhập dòng vào dòng trên.
4. Điền `Mục` (VD `I.1 PHÁP LÝ`) rồi bấm **Xuất Excel**. File có 2 sheet: **Danh mục** theo form và **Chi tiết** (file, trang, loại, nguồn ngày, text đầu trang) để đối chiếu.

## 2. Bản Python

```bash
# Ubuntu/Debian/WSL           # macOS                          # Windows: cài Tesseract (tick Vietnamese)
sudo apt install tesseract-ocr tesseract-ocr-vie    brew install tesseract tesseract-lang     # https://github.com/UB-Mannheim/tesseract/wiki
pip install -r requirements.txt
```

```bash
python quet_pdf.py ./ho-so                                   # quét cả thư mục -> danh-muc-tai-lieu.xlsx
python quet_pdf.py a.pdf b.pdf -o "Danh muc I.1.xlsx" --section "I.1 PHÁP LÝ"
python quet_pdf.py ./ho-so --pages 3                         # OCR 3 trang đầu mỗi file
python quet_pdf.py gop.pdf --mode auto                       # PDF gộp: OCR hết, tự tách văn bản
python quet_pdf.py ./ho-so --txt-dir ./text                  # lưu text OCR
python quet_pdf.py ./ho-so --searchable-dir ./pdf-text --pages all   # PDF có lớp text (tìm kiếm / copy được)
```

Tùy chọn khác: `--dpi 400` (scan mờ), `--denoise` (nền xám, nhiễu hạt), `--psm 6` (1 khối văn bản), `--lang vie+eng`,
`--force-ocr`, `--json out.json`, `--jobs N`. Kết quả OCR cache ở `.quet-pdf-cache/`, chạy lại không OCR lại.
Cuối log liệt kê dòng thiếu số / ngày / tên.

## 3. Cách tool trích thông tin (đa dạng kiểu trình bày)

- **Tiêu đề**: tìm các khối dòng IN HOA hoặc dòng bắt đầu bằng từ khóa loại văn bản (báo cáo, tờ trình, hợp đồng, giấy…)
  trong 20 dòng đầu; bỏ qua tên công ty / cơ quan góc trên, quốc hiệu, `Số:`, ngày, `Kính gửi`, dòng nhãn `X: …`.
  Ưu tiên khối bắt đầu bằng từ khóa, rồi khối sau phần đầu trang. Tiêu đề IN HOA sai dấu được sửa bằng từ điển (`config.json`).
- **Loại văn bản**: khớp từ khóa (không dấu, gộp chữ lặp OCR) trên tiêu đề → ký hiệu trong số văn bản (`/CV-`, `/TB-`, `/TTr-`,
  `/QĐ-`, `/NQ-`, `/BB-`, `/HĐ…`, `/KUNN`) → 25 dòng đầu → tên file (`dkdn`, `cccd`, `bctc`, `guq`, `kunn`…).
- **Số văn bản**: dòng có `Số:` / `Số/No.:` trong 15 dòng đầu (rồi cả trang); chịu được số viết tay OCR lệch
  (`Số: .04../2025/PLSĐĐL` → `04/2025/PLSĐĐL`), số kiểu VIB (`12/2025_20250328_QN`, `1234567.01`); tên file có `so 12`, `hd 5`… dùng làm gợi ý.
- **Ngày**: nhãn riêng của loại (ngày lập, ngày kiểm tra, ngày nhận nợ, hôm nay ngày…) → 10 dòng đầu → `Địa danh, ngày … tháng … năm …`
  ở bất kỳ đâu (thông báo ký cuối trang) → ngày trong **tên file** (`250117_…`, `20250117`, `17.01.2025`) → ngày đầu tiên trong nội dung
  (đánh dấu *kiểm tra!*). Bỏ qua ngày của văn bản được dẫn chiếu (`… số 45/2025/HĐTD ngày …`), ngày cấp, ngày sinh, hết hạn.
- **Tên công ty**: gom mọi cụm `Công ty Cổ phần/TNHH + tên` ở phần đầu, chọn cụm lặp nhiều nhất, ưu tiên bản viết thường trong thân
  (OCR chữ hoa hay sai dấu); khớp `KNOWN_COMPANIES` thì dùng tên chuẩn / tên rút gọn.
- **Nội dung**: `V/v` / `Về việc` / `Trích yếu` → điều khoản sửa + vốn điều lệ (phụ lục điều lệ) → kỳ báo cáo (Quý II/2025) → công ty đối tác (hợp đồng) → tên công ty rút gọn.

Loại nhận được: GCN ĐKDN · CCCD · BCTC · BB UBTD · BCTTĐ · Đề nghị CTD · Đề xuất · Khế ước · Phụ lục điều lệ · Nghị quyết ĐHĐCĐ / HĐQT / HĐTV ·
Hợp đồng · Biên bản · Giấy ủy quyền · Quyết định · Chứng chỉ NLXD · Danh sách cổ đông · Sổ cổ đông · Điều lệ · Tờ trình · Công văn · Thông báo · Báo cáo · Khác.

## 4. Sửa / mở rộng

| Muốn | Sửa ở |
|---|---|
| Thêm tên công ty chuẩn, tiêu đề chuẩn, từ sửa dấu | `config.json` (`KNOWN_COMPANIES`, `TITLE_MAP`, `VN_WORDS`, `VN_PHRASES`) |
| Thêm loại văn bản / đổi cách trích | `rules.js` (hàm `R.xxx` + 1 dòng trong `RULES`) và bản Python tương ứng `rules.py` |
| Giao diện | `template.html` |

Sau khi sửa chạy `python build.py` để tạo lại 2 file HTML (bản offline nhúng thư viện trong `lib/`).

Test: `python tests/make_samples.py` tạo 24 PDF mẫu vào `tests/samples/`; `node test_rules.js <fixtures.json> tests/expect.json`
chạy rule JS trên text OCR đã lưu; bản Python chạy thẳng `python quet_pdf.py tests/samples`.

## 5. Lưu ý kỹ thuật

- Tesseract mặc định bật OpenMP đa luồng; trên máy ít nhân / container 1 trang có thể mất >60 giây thay vì 2 giây.
  `quet_pdf.py` đặt `OMP_THREAD_LIMIT=1` và chạy song song theo trang (`--jobs`).
- Trang OCR quá `--timeout` giây (mặc định 120) sẽ thử lại psm khác, vẫn quá thì bỏ trống.
- Số / ngày **viết tay** OCR thường không đọc được: đặt tên file có ngày (`250117_…`) là cách chắc nhất, tool sẽ lấy từ đó và ghi rõ nguồn.
