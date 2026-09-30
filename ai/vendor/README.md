# Thư viện bên thứ ba (để sẵn trong repo, nạp khi cần)

Để trang chỉ chạy script cùng nguồn (CSP `script-src 'self'`), không phụ thuộc CDN.

| Thư mục | Thư viện | Phiên bản | Nguồn | Giấy phép |
|---|---|---|---|---|
| `pdfjs/` | pdf.js (bản legacy) + `wasm/` (OpenJPEG, JBIG2, QCMS), `cmaps/`, `standard_fonts/`, `iccs/` | 6.3.289 | npm `pdfjs-dist` | Apache-2.0 (giấy phép từng bộ giải mã trong `wasm/LICENSE_*`) |
| `pdf-lib/` | pdf-lib | 1.17.1 | npm `pdf-lib/dist` | MIT |
| `jszip/` | JSZip | 3.10.1 | npm `jszip/dist` | MIT (hoặc GPLv3) |
| `sheetjs/` | SheetJS CE (xlsx) | 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/ | Apache-2.0 |

SheetJS trên npm/cdnjs dừng ở 0.18.5 (có lỗi bảo mật CVE-2023-30533, CVE-2024-22363) — bản ở đây lấy từ CDN chính thức của SheetJS.
`wasm/` cần CSP `'wasm-unsafe-eval'` để giải mã ảnh của PDF scan (JPEG 2000 / JBIG2).
