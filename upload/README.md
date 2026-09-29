# elevaTO Upload — tải video lớn lên Google Drive

Công cụ **riêng**, tách hẳn khỏi landing page modeling:

- Không sửa `index.html`, không có nút hay link nào trên landing page.
- Chạy bằng **dự án Apps Script riêng**, không đụng `backend/Code.gs`, Sheet đăng ký
  hay bot quản trị. Nó chỉ dùng token bot để **nhắn** link cho bạn.

Mở trang → chọn video → **Tải lên**. Video vào thư mục **elevaTO Uploads** trên
Google Drive, xong bot Telegram nhắn link xem và link tải về. Chạy được trên máy
không vào được Telegram, vì trang chỉ nói chuyện với Google.

| File | Là gì |
|---|---|
| `index.html` | Trang tải lên, GitHub Pages phục vụ ở `https://minhtoan8668.github.io/elevaTO/upload/` |
| `backend/Code.gs` | Code dán vào dự án Apps Script riêng |
| `backend/appsscript.json` | Quyền của dự án đó: `drive.file` + gọi ra ngoài |

## Cài đặt — 5 bước

1. Vào **script.google.com → Dự án mới**, đặt tên `elevaTO Upload`.
2. Xoá code mẫu, dán `backend/Code.gs`. Vào **⚙️ Cài đặt dự án → Hiện tệp kê
   khai "appsscript.json"**, quay lại mở `appsscript.json`, dán `backend/appsscript.json`.
3. **Triển khai → Bản triển khai mới → Ứng dụng web** ·
   *Thực thi dưới dạng*: **Tôi** · *Ai có quyền truy cập*: **Bất kỳ ai** → Triển khai.
   Chép **URL ứng dụng web** (kết thúc bằng `/exec`).
4. Điền 3 dòng đầu `Code.gs`: `TG_TOKEN` (token bot, dùng chung bot cũ được),
   `TG_CHAT` (chat id của bạn), `WEBAPP_URL` (URL vừa chép) → 💾.
5. Chọn hàm `caiDat` → **Run** → cho phép quyền Google Drive. Bot nhắn cho bạn
   link trang **kèm sẵn key** — mở link đó một lần trên máy cần tải, trang tự nhớ.

Sửa code sau này: **Triển khai → Quản lý bản triển khai → bút chì → Phiên bản
mới**. Sửa bản cũ, đừng tạo bản mới — tạo mới là đổi URL `/exec`, phải chạy lại
`caiDat` để lấy link mới.

## Ghi chú

- Vì sao không gửi thẳng video vào bot: bot Telegram chỉ gửi được file **tối đa
  50MB**. Video lớn nằm trên Drive, bot chỉ chuyển link.
- Trang cắt file thành mảnh 4MB. Rớt mạng thì tự thử lại; đóng tab giữa chừng thì
  mở lại trang, chọn **đúng file đó** là tải tiếp từ chỗ dừng. Tối đa 2GB mỗi file.
- Key nằm sau dấu `#` trong link — phần đó trình duyệt không gửi lên máy chủ nào.
  **Token bot không bao giờ ra tới trình duyệt.** Sai key 20 lần thì khoá 10 phút.
- Lỡ để lộ link: chạy hàm `doiKey`, link cũ hết dùng, bot nhắn link mới.
- Quyền `drive.file` chỉ đụng được file do chính dự án này tạo, không đọc được
  file khác trong Drive của bạn.
- **Đừng chuyển trang sang HtmlService.** Trang HtmlService nào cũng cho người mở
  nó gọi *bất kỳ* hàm nào trong script qua `google.script.run`. Trang tĩnh gọi
  `doPost` thì chỉ mở đúng ba action `upload_start` / `upload_chunk` / `upload_status`.
