# quet-pdf — Quét PDF tiếng Việt → Danh mục tài liệu (Excel)

Đọc hàng loạt PDF hồ sơ pháp lý (scan hoặc có text), **OCR tiếng Việt trang đầu** bằng Tesseract,
nhận diện loại văn bản và trích **Số văn bản / Ngày / Tên / Nội dung**, xuất Excel theo form
"Danh mục tài liệu". Có thêm bản chạy trong trình duyệt (`danh-muc-tai-lieu.html`) không cần cài gì.

Kết quả thử trên 4 file mẫu (Điều lệ, Phụ lục sửa đổi điều lệ) + 1 file gộp 3 văn bản: 5 file / 6,7 giây.

## 1. Cài đặt (1 lần)

**Ubuntu / Debian / WSL**
```bash
sudo apt install tesseract-ocr tesseract-ocr-vie
pip install -r requirements.txt
```

**macOS**
```bash
brew install tesseract tesseract-lang     # tesseract-lang có sẵn gói vie
pip install -r requirements.txt
```

**Windows**
1. Cài Tesseract: https://github.com/UB-Mannheim/tesseract/wiki (khi cài tick thêm *Vietnamese* trong Additional language data).
2. Thêm thư mục cài (VD `C:\Program Files\Tesseract-OCR`) vào PATH, hoặc đặt biến môi trường
   `TESSDATA_PREFIX` trỏ tới thư mục `tessdata`.
3. `pip install -r requirements.txt`

Kiểm tra: `tesseract --list-langs` phải có `vie`. Nếu chưa có, tải
[vie.traineddata](https://github.com/tesseract-ocr/tessdata_best/raw/main/vie.traineddata) bỏ vào thư mục `tessdata`.

## 2. Dùng

```bash
# quét cả thư mục (đệ quy), ra danh-muc-tai-lieu.xlsx
python quet_pdf.py ./ho-so

# chọn file, đặt tên file ra và dòng mục
python quet_pdf.py a.pdf b.pdf -o "Danh muc I.1.xlsx" --section "I.1 PHÁP LÝ"

# lưu text OCR để soi / tìm kiếm
python quet_pdf.py ./ho-so --txt-dir ./text

# OCR 3 trang đầu (ngày của Điều lệ hay nằm ở trang 2-5)
python quet_pdf.py ./ho-so --pages 3

# 1 PDF gộp nhiều văn bản -> OCR hết, tự tách theo trang đầu văn bản
python quet_pdf.py gop.pdf --mode auto

# xuất thêm PDF có lớp text (tìm kiếm / copy được trong Acrobat)
python quet_pdf.py ./ho-so --searchable-dir ./pdf-text --pages all
```

Mặc định chỉ OCR **trang 1 mỗi file** (thông tin số/ngày/tên đều ở đó) nên rất nhanh; các trang sau
chỉ đọc text layer nếu có. Kết quả OCR được cache trong `.quet-pdf-cache/` — chạy lại không OCR lại.

Tùy chọn khác: `--dpi 400` (scan mờ), `--denoise` (scan nhiễu hạt, nền xám), `--psm 4` (văn bản nhiều cột),
`--lang vie+eng` (văn bản song ngữ), `--force-ocr` (bỏ qua text layer), `--json out.json`.

## 3. File Excel ra

- Sheet **Danh mục**: STT · Số văn bản · Ngày văn bản (kiểu ngày Excel) · Tên văn bản · Nội dung văn bản · Tờ số (để trống, điền tay).
- Sheet **Chi tiết**: file, trang, loại nhận diện, có OCR không, **nguồn ngày** và 500 ký tự text đầu để đối chiếu.

Cuối log liệt kê các dòng thiếu số / ngày / tên để kiểm tra tay.

Ngày văn bản lấy theo thứ tự ưu tiên: ngày ở phần tiêu đề (`..., ngày 17 tháng 01 năm 2025`) →
ngày trong **tên file** (`250117_...`, `20250117`, `17.01.2025`) → ngày đầu tiên trong nội dung (đánh dấu "kiểm tra!").
Ngày/số viết tay OCR thường không đọc được, nên đặt tên file có ngày là cách chắc nhất.

## 4. Loại văn bản nhận được (sửa trong `rules.py`)

GCN ĐKDN · CCCD · Phụ lục sửa đổi điều lệ · Nghị quyết ĐHĐCĐ / HĐQT / HĐTV · Biên bản họp · Giấy ủy quyền ·
Quyết định (bổ nhiệm) · Chứng chỉ năng lực XD · Danh sách cổ đông · Sổ đăng ký cổ đông · Điều lệ · Hợp đồng · Khác.

Nhận diện dựa trên **các dòng viết hoa ở đầu trang** (tiêu đề), so khớp không dấu nên OCR sai dấu vẫn bắt được.
Thêm loại mới: viết hàm `r_xxx(text) -> Fields` và thêm 1 dòng `Rule("Tên", ["tu khoa khong dau"], r_xxx)` vào `RULES`
(rule đứng trước thắng khi cùng vị trí).

## 5. Lưu ý kỹ thuật

- Tesseract mặc định bật OpenMP đa luồng; trên máy ít nhân / container điều đó làm 1 trang từ 2 giây thành hơn 60 giây.
  Script đặt `OMP_THREAD_LIMIT=1` và chạy song song theo trang bằng `--jobs` (mặc định = số nhân − 1).
- Trang OCR quá `--timeout` giây (mặc định 120) sẽ thử lại với `--psm 3`, vẫn quá thì bỏ trống.

## 6. Bản chạy trong trình duyệt

Mở `danh-muc-tai-lieu.html` bằng Chrome/Edge (cần mạng lần đầu để tải pdf.js, Tesseract.js và bộ tiếng Việt ~15 MB),
kéo thả PDF vào, sửa trực tiếp trên bảng rồi bấm **Xuất Excel**. Cùng bộ rule nhưng OCR chậm hơn bản Python
(~10–20 giây/trang), hợp khi chỉ có vài file.
