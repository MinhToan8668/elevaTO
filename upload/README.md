# elevaTO Upload — tải file lớn lên Google Drive

Công cụ **riêng**, tách hẳn khỏi landing page modeling:

- Không sửa `index.html`, không có nút hay link nào trên landing page.
- Chạy bằng **dự án Apps Script riêng**, không đụng `backend/Code.gs`, Sheet đăng ký
  hay bot quản trị. Nó chỉ dùng token bot để **nhắn** link cho bạn.

Mở trang → chọn một hoặc nhiều file (video, tài liệu, ảnh, file nén… mọi loại) →
**Tải lên**. Các file lần lượt vào thư mục **elevaTO Uploads** trên Google Drive.
Trang chạy được trên máy không vào được Telegram, vì nó chỉ nói chuyện với Google.

Sau đó, tuỳ ô **"Gửi file vào chat Telegram rồi xoá khỏi Drive"** trên trang:

- **Bật** (mặc định): trong vòng một phút bot gửi file vào chat Telegram. File trên
  19MB được cắt thành các phần `.001`, `.002`… Gửi đủ thì bản trên Drive vào Thùng
  rác (Drive tự xoá hẳn sau 30 ngày) và file vào **Kho** (xem dưới).
- **Tắt**: file ở lại Drive, bot chỉ nhắn link xem và link tải về.

**Kho file trên Telegram** (cuối trang upload): liệt kê file bot đã gửi. Bấm **Lấy về**
→ trong 1–2 phút bot kéo các phần từ Telegram, ghép thành file gốc đặt tạm trên Drive
→ nút **Tải về** hiện ra. Không cần vào Telegram, không phải ghép tay. Bản tạm tự vào
Thùng rác sau 24 giờ (`GIU_BAN_TAM_GIO`). Nút × bỏ file khỏi kho (tin nhắn Telegram vẫn còn).

Vì sao phần 19MB: bot gửi được file tới 50MB nhưng chỉ **tải về** được file tới 20MB.
File gửi bằng bản cũ (phần 45MB) và file gửi trước khi có kho **không lấy về được** —
tải chúng từ Telegram trên điện thoại rồi ghép bằng `ghep.html`.

Ghép các phần: tải đủ về máy, mở `ghep.html`
(`https://minhtoan8668.github.io/elevaTO/upload/ghep.html`) → chọn cả bộ → **Ghép và tải về**.
Trên Mac cũng được bằng Terminal: `cat 'ten-file.mp4'.0* > 'ten-file.mp4'`.

| File | Là gì |
|---|---|
| `index.html` | Trang tải lên, GitHub Pages phục vụ ở `https://minhtoan8668.github.io/elevaTO/upload/` |
| `ghep.html` | Trang ghép các phần `.001`, `.002`… thành file gốc, chạy ngay trên máy |
| `backend/Code.gs` | Code dán vào dự án Apps Script riêng |
| `backend/appsscript.json` | Quyền của dự án đó: `drive.file`, gọi ra ngoài, đặt lịch chạy |

> ⚠️ **Phải là dự án Apps Script MỚI, riêng.** Đừng dán vào dự án mở từ Google Sheet *elevaTO Đăng ký*
> (Tiện ích mở rộng → Apps Script) — đó là backend trang khoá học. Dán đè vào đó thì form đăng ký, số chỗ
> cohort và lệnh bot đều chết. `caiDat` giờ tự chặn nếu nhận ra đang ở dự án đó.
> Lỡ dán nhầm rồi: xem mục **Sự cố: backend trả về "elevaTO upload"** trong `SETUP.md`.

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
   `caiDat` cũng đặt lịch `chuyenTelegram` chạy mỗi phút để chuyển file vào chat
   (xem ở **⏰ Trình kích hoạt**). Chạy lại bao nhiêu lần cũng chỉ còn một lịch.

   Báo `403 … Google Drive API has not been used in project …`: Drive API chưa
   bật. Kiểm tra cột **Dịch vụ** bên trái đã có **Drive** chưa — chưa thì bấm
   **+ → Drive API → Thêm** (bản `appsscript.json` ở đây đã khai sẵn, dán đúng là
   có). Vẫn lỗi thì mở link trong thông báo → **Bật**, đợi 2–3 phút rồi chạy lại.

Sửa code sau này: **Triển khai → Quản lý bản triển khai → bút chì → Phiên bản
mới**. Sửa bản cũ, đừng tạo bản mới — tạo mới là đổi URL `/exec`, phải chạy lại
`caiDat` để lấy link mới.

## Ghi chú

- Vì sao file phải lên Drive trước: trình duyệt ở Việt Nam không gọi được Telegram,
  máy chủ Google thì gọi được — cả lúc gửi đi lẫn lúc lấy về.
- Kho lưu trong Script Properties: mỗi file một ô `TGLIB_<id>`, mã file_id các phần
  40 mã một ô `TGFID_<id>_<n>` (mỗi ô tối đa 9KB).
- Chuyển vào Telegram chạy nền: mỗi lượt ~4 phút, nhớ chỗ dừng, lượt sau làm tiếp —
  file 2GB cũng không chạm giới hạn 6 phút. Telegram lỗi 5 lần liên tiếp thì bot
  bỏ, **giữ file trên Drive** và nhắn link.
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
