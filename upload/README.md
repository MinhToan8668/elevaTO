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

**Kho file trên Telegram** (cuối trang upload): liệt kê file bot đã gửi, tải về được hai
đường — đường nào cũng không cần vào Telegram và không phải ghép tay.

- **Tải thẳng** — file đi từ Telegram về máy luôn, **không đặt bản nào trên Drive**, bấm là
  tải ngay. Cần cài Cloudflare Worker (mục **Tải thẳng** dưới đây); chưa cài thì nút không hiện.
  Tối đa **44 phần ≈ 836MB** mỗi file.
- **Lấy về Drive** — đường cũ, chậm hơn nhưng **không giới hạn dung lượng**: trong 1–2 phút
  bot kéo các phần từ Telegram, ghép thành file gốc đặt tạm trên Drive → nút **Tải từ Drive**
  hiện ra. Bản tạm tự vào Thùng rác sau 24 giờ (`GIU_BAN_TAM_GIO`).

Nút × bỏ file khỏi kho (tin nhắn Telegram vẫn còn).

## Tải thẳng — không qua Drive

Lý do chiều về phải vòng qua Drive: ở Việt Nam trình duyệt không gọi được
`api.telegram.org`. Cloudflare thì gọi được, mà Cloudflare ở Việt Nam vào bình thường — nên
Worker thay được chỗ của Drive: nó tải lần lượt từng phần rồi **nối thẳng vào một luồng**
trả về máy. Trình duyệt thấy đúng một file đang tải, có thanh tiến trình, không có bản tạm
nào trên Drive, không phải chờ ghép, không tốn dung lượng Drive.

Cài 3 bước (Worker `elevato` đã dựng sẵn — xem `ai/worker/README.md`):

1. Nghĩ một chuỗi ngẫu nhiên dài ≥24 ký tự làm bí mật dùng chung.
2. Cloudflare → Worker `elevato` → **Settings → Variables and Secrets**, thêm hai **Secret**:
   `UPLOAD_TG_TOKEN` = token bot của trang upload, `TAIVE_SECRET` = chuỗi vừa nghĩ → **Deploy**.
3. Trong `backend/Code.gs` điền `WORKER_URL` = `https://<worker của bạn>/taive` và
   `WORKER_SECRET` = đúng chuỗi ấy → chạy lại `caiDat` (hoặc thêm `TAIVE_WORKER_URL`,
   `TAIVE_SECRET` vào **Thuộc tính tập lệnh** rồi chạy `caiDat`). Cũng chỉ điền một lần.

Kiểm tra: mở địa chỉ Worker, trong `cai` phải thấy `tai_thang: true`.
Muốn tắt: chạy hàm `tatTaiThang` (để trống hai dòng đầu file không tắt — nó giữ bản đã cất).

| Vì sao tối đa 44 phần | |
|---|---|
| Cloudflare gói Free cho **50 subrequest** mỗi lần gọi, mỗi phần 19MB tốn 1 lượt tải | trần cứng 50 phần |
| Chừa 6 lượt để Worker xin lại được đường dẫn Telegram hết hạn giữa chừng (mỗi lần tốn 2) | còn **44 phần ≈ 836MB** |

Lên gói Paid ($5/tháng) là 10.000 subrequest: sửa `CF_SUBREQ` trong `ai/worker/src/taive.js`
và `TAI_THANG_PHAN` trong `backend/Code.gs` cho khớp nhau là tải thẳng được file 2GB.

Đường dẫn file của Telegram chỉ bảo đảm sống **1 giờ**, nên vé tải hết hạn sau 50 phút
(`VE_SONG_PHUT`). Tải quá lâu mà đứt thì bấm **Tải thẳng** lại — vé mới, đường dẫn mới.
Rớt mạng giữa chừng phải tải lại từ đầu (Worker chưa làm `Range`).

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
   (`WORKER_URL` / `WORKER_SECRET` để trống cũng được — xem mục **Tải thẳng**.)
   Không muốn đụng file thì vào **⚙️ Cài đặt dự án → Thuộc tính tập lệnh → Thêm thuộc tính**,
   điền `TG_BOT_TOKEN`, `TG_CHAT_ID`, `WEBAPP_URL` — `caiDat` đọc được cả hai chỗ.
5. Chọn hàm `caiDat` → **Run** → cho phép quyền Google Drive. Bot nhắn cho bạn
   link trang **kèm sẵn key** — mở link đó một lần trên máy cần tải, trang tự nhớ.
   `caiDat` cũng đặt lịch `chuyenTelegram` chạy mỗi phút để chuyển file vào chat
   (xem ở **⏰ Trình kích hoạt**). Chạy lại bao nhiêu lần cũng chỉ còn một lịch.
   **Chỉ điền một lần**: `caiDat` cất hết vào Thuộc tính tập lệnh. Về sau dán `Code.gs` bản
   mới cứ để nguyên chữ `DAN_…` ở đầu file rồi chạy `caiDat` — nó lấy bản đã cất. Dòng nào
   điền lại thì ghi đè bản cũ.

   Báo `403 … Google Drive API has not been used in project …`: Drive API chưa
   bật. Kiểm tra cột **Dịch vụ** bên trái đã có **Drive** chưa — chưa thì bấm
   **+ → Drive API → Thêm** (bản `appsscript.json` ở đây đã khai sẵn, dán đúng là
   có). Vẫn lỗi thì mở link trong thông báo → **Bật**, đợi 2–3 phút rồi chạy lại.

Sửa code sau này: dán đè `Code.gs` (để nguyên đầu file), chạy `caiDat`, rồi
**Triển khai → Quản lý bản triển khai → bút chì → Phiên bản mới**. Sửa bản cũ, đừng
tạo bản mới — tạo mới là đổi URL `/exec`, phải điền `WEBAPP_URL` mới và chạy lại
`caiDat` để lấy link mới.

## Ghi chú

- Vì sao file phải lên Drive trước: trình duyệt ở Việt Nam không gọi được Telegram,
  máy chủ Google thì gọi được. Chiều về thì **Tải thẳng** đi qua Cloudflare nên bỏ được
  Drive, còn chiều lên vẫn phải vòng — Worker không nhận nổi file 2GB đẩy lên.
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
  `doPost` thì chỉ mở đúng mấy action liệt kê trong `doPost`, không hơn.
