# Thư viện bên thứ ba (để sẵn trong repo, nạp khi cần)

Để trang chỉ chạy script cùng nguồn (CSP `script-src 'self'`), không phụ thuộc CDN.

| Thư mục | Thư viện | Phiên bản | Nguồn | Giấy phép |
|---|---|---|---|---|
| `pdfjs/` | pdf.js (bản legacy) + `wasm/` (OpenJPEG, JBIG2, QCMS), `cmaps/`, `standard_fonts/`, `iccs/` | 6.3.289 | npm `pdfjs-dist` | Apache-2.0 (giấy phép từng bộ giải mã trong `wasm/LICENSE_*`) |
| `pdf-lib/` | pdf-lib | 1.17.1 | npm `pdf-lib/dist` | MIT |
| `jszip/` | JSZip | 3.10.1 | npm `jszip/dist` | MIT (hoặc GPLv3) |
| `sheetjs/` | SheetJS CE (xlsx) | 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/ | Apache-2.0 |
| `qrcode/` | qrcode-generator (vẽ mã QR chuyển khoản ở phần Ủng hộ) | 1.4.4 | npm `qrcode-generator` | MIT (giấy phép ghi ngay đầu `qrcode.js`) |
| `fonts/` | Be Vietnam Pro (woff2, 2 bộ ký tự `vietnamese` + `latin`, các nét 400–800) | bản Google Fonts phục vụ ngày 2026-10-01 | https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro (tệp .woff2 ở `fonts.gstatic.com`) | SIL OFL 1.1 — xem `fonts/OFL.txt` |

SheetJS trên npm/cdnjs dừng ở 0.18.5 (có lỗi bảo mật CVE-2023-30533, CVE-2024-22363) — bản ở đây lấy từ CDN chính thức của SheetJS.
`wasm/` cần CSP `'wasm-unsafe-eval'` để giải mã ảnh của PDF scan (JPEG 2000 / JBIG2).

`fonts/be-vietnam-pro.css` do mình viết lại từ phản hồi của Google Fonts (giữ nguyên `unicode-range`), trỏ vào tệp .woff2 cạnh nó.
Không gọi ra Google Fonts nữa nên CSP siết lại thành `style-src 'self'; font-src 'self'`, và trang không rò địa chỉ IP người dùng sang bên thứ ba.
SHA-256 của các tệp phông (đối chiếu khi cập nhật):

```
  03d1b589cff172e1a670b3573e731d3380bc326f80cf83b0d3504e3188e2e074  bvp-400-latin.woff2
  dc085e2fba3414e5c5bf1e6172f921a9f81c5859946a4ed3d63c1e470d96a9e2  bvp-400-vietnamese.woff2
  b621f77d35f777023aa11ca524462d511b4b28a813adbc0e9d15a10fc61dfe4e  bvp-500-latin.woff2
  86341610cbe907eecf461c9159c168d5efb52bb1a33963813a08f520555d8e66  bvp-500-vietnamese.woff2
  9503dec2a7c532c8331e9600bcafea287a4fd208573b8668d85ab8d8de1863c7  bvp-600-latin.woff2
  97658c6f9a384f29a3005c3d96e2a0d1c810192cf68979071c290f5a377a9f99  bvp-600-vietnamese.woff2
  a193dd87699bd2e18ddf72dc271493ea82a23dad9f5c334d9f2a257b1e05fc30  bvp-700-latin.woff2
  4f58af2d1c3e28a9ba14c51c82db2751d78344b75bdcb34de24a1031ebe59da6  bvp-700-vietnamese.woff2
  7c5d0871188c09339a6eb46948420ed9b11f3d06ea3ff1c5d1cf41b06a3504e7  bvp-800-latin.woff2
  26b241d1d5f489c8a65c1a3c4cdcdb48dd114a9ed7e0c0180182191f087cbe96  bvp-800-vietnamese.woff2
```

`qrcode/qrcode.js` để nguyên bản npm, chỉ chạy như script thường (tạo biến toàn cục `qrcode`).
Nhờ nó mà mã QR ủng hộ dựng ngay trên máy người dùng: số tài khoản không đi qua dịch vụ sinh QR
bên thứ ba, và CSP vẫn giữ `script-src 'self'`.

```
  18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780  qrcode/qrcode.js
```
