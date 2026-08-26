# elevaTO — Hướng dẫn cài đặt

Sau khi làm xong 4 bước dưới đây, bạn **không bao giờ phải mở file code nữa**.
Đổi cohort, giá, số chỗ, lịch học, thông báo — tất cả làm bằng tin nhắn Telegram.

---

## Kiến trúc

```
        ┌──────────────┐   webhook    ┌─────────────────────┐
        │  Bot Telegram │ ───────────▶ │  Google Apps Script │
        │  (điều khiển) │ ◀─────────── │   backend/Code.gs   │
        └──────────────┘   thông báo   └──────────┬──────────┘
                                                  │
                                  ┌───────────────┼───────────────┐
                                  │               │               │
                          GET ?action=config   ghi đăng ký    Script Properties
                                  │            Google Sheet    (lưu config)
                                  ▼
                          ┌───────────────┐
                          │  index.html   │  ← hosting tĩnh (Netlify / GitHub Pages)
                          │ (không chứa   │
                          │  số liệu nào) │
                          └───────────────┘
```

Điểm mấu chốt: `index.html` **không hardcode** cohort / giá / số chỗ nữa.
Nó tải config từ Apps Script rồi render ra. Bot đổi config → web đổi theo.

---

> **Trạng thái:** backend đã được cài và nối vào trang. `index.html` đang trỏ tới
> Web App tại `AKfycbwHtZ-rxy…/exec`. Phần dưới giữ lại để tham khảo khi cần
> dựng lại từ đầu, đổi bot, hoặc chuyển sang tài khoản Google khác.

## Cài đặt — 4 bước

### Bước 1 — Tạo Google Sheet
Tạo một Google Sheet mới, đặt tên `elevaTO Đăng ký`.

### Bước 2 — Dán code
**Tiện ích mở rộng → Apps Script**, xoá hết code mẫu, dán toàn bộ `backend/Code.gs` vào, bấm 💾.

Sửa hai dòng đầu hàm `setup()` ở cuối file:

```js
var TOKEN = '<token từ @BotFather>';
var ADMIN = '<chat id của bạn, lấy từ @userinfobot>';
```

### Bước 3 — Triển khai
**Triển khai → Bản triển khai mới → Ứng dụng web**

| Mục | Chọn |
|---|---|
| Thực thi với tư cách | **Tôi** |
| Ai có quyền truy cập | **Bất kỳ ai** |

Cấu hình "Ai có quyền truy cập" phải là **Bất kỳ ai**. Để mặc định thì web
không đọc được cấu hình, trang vẫn chạy bằng số liệu dự phòng nhúng sẵn nên
trông vẫn bình thường — rất dễ tưởng đã xong.

### Bước 4 — Chạy `setup`
Chọn hàm `setup` ở thanh trên, bấm **Run**, cấp quyền khi Google hỏi.

Hàm này tự làm hết: lưu token, tạo sheet, nạp cấu hình, kiểm tra token,
tự tìm URL web app và tự nối webhook Telegram. Chạy lại nhiều lần cũng an
toàn, cấu hình đang có không bị ghi đè.

Xong thì bot nhắn cho bạn một tin xác nhận. Mở **Nhật ký** (Ctrl+Enter) để
lấy dòng:

```js
var API = 'https://script.google.com/macros/s/.../exec';
```

Trong `index.html`, tìm dòng bắt đầu bằng `var API =` (đang là
`PASTE_APPS_SCRIPT_WEB_APP_URL_HERE`) và thay bằng dòng đó. Lưu, deploy lại lên hosting.

**Xong.** Từ giờ mọi thay đổi đều qua Telegram.

### Hai hàm tiện ích

| Hàm | Dùng khi |
|---|---|
| `kiemTra()` | Xem tình trạng: token, webhook, số đăng ký, cấu hình hiện tại, ADMIN_KEY |
| `setWebhookThuCong()` | Khi `setup` báo không tự tìm được URL — dán URL `/exec` vào rồi Run |

---

## Bảng lệnh Telegram

Gõ `/menu` bất cứ lúc nào để xem lại.

| Lệnh | Tác dụng |
|---|---|
| `/status` | Tình trạng hiện tại: cohort, số chỗ, giá, lịch — kèm nút bấm nhanh |
| `/cohort 8` | Đổi sang Cohort 08 (web đổi ở **tất cả** vị trí cùng lúc) |
| `/slot 12` | Đổi tổng số chỗ mỗi cohort |
| `/base 4` | Số người đã đăng ký ngoài hệ thống (bạn tự nhận qua inbox) |
| `/cohortmoi` | Mở cohort kế tiếp: tự +1 số, reset bộ đếm, +1 cohort đã hoàn thành |
| `/giasom 3000000` | Giá Early Bird — nhận cả `3tr` hoặc `3M` |
| `/giagoc 4000000` | Giá gốc (giá gạch ngang, % tiết kiệm tự tính) |
| `/giatuhoc 1500000` | Giá gói Self-paced |
| `/lich Thứ 3 & Thứ 5 \| 20h–22h tối` | Đổi lịch học |
| `/buoi 10 6 4` | Tổng buổi / lý thuyết / thực hành |
| `/mo` `/day` `/dong` | Mở đăng ký · Đánh dấu đủ chỗ · Đóng đăng ký |
| `/thongbao Khai giảng 15/09` | Hiện banner xanh đầu trang web |
| `/xoathongbao` | Tắt banner |
| `/video <link>` | Bật mục **Học thử** — nhận link YouTube hoặc Google Drive |
| `/xoavideo` | Ẩn mục học thử |
| `/slide on` · `/slide off` | Hiện/ẩn mục slide bài giảng |
| `/model on` · `/model off` | Hiện/ẩn mục model bàn giao |
| `/ds` | Danh sách đăng ký (`/ds cho` = lọc chờ duyệt) |
| `/duyet 0901234567` | Duyệt theo SĐT hoặc mã đăng ký |
| `/tuchoi 0901234567` | Từ chối |
| `/sheet` | Link Google Sheet |

Mỗi đăng ký mới bot gửi kèm 2 nút **✅ Duyệt / ❌ Từ chối** — bấm là xong.

---

## Ghi chú vận hành

**Web cập nhật sau bao lâu?** Ngay lập tức với người mới vào trang. Người đang mở
sẵn tab cũ sẽ thấy khi F5. Trang cache config trong trình duyệt để hiện ngay,
rồi ngầm tải bản mới — nên không bao giờ bị chớp trắng.

**Nếu Apps Script sập hoặc mất mạng?** Trang vẫn chạy bình thường bằng bản
config cache, hoặc bản `FALLBACK` nhúng sẵn trong `index.html`. Không bao giờ
trắng trang.

**Xem danh sách đăng ký trên web:** mở `https://<web>/?admin=<ADMIN_KEY>`
(key hiện trong Nhật ký sau khi chạy `setup`, hoặc chạy `kiemTra`). Bảng này **chỉ để xem** —
duyệt vẫn làm trên Telegram.

**Chống trùng:** cùng một số điện thoại đăng ký lại trong cùng cohort sẽ được
báo "đã có trong danh sách", không ghi thêm dòng vào Sheet.

**Video học thử.** Trang chỉ nạp iframe khi người xem bấm nút play — trước đó chỉ là một
mặt tiền tĩnh, nên trang nhẹ và người xem biết rõ phải bấm vào đâu. Gõ `/video <link>` là xong — trang tự nhận diện YouTube hay Google Drive
và nhúng đúng kiểu. Link YouTube nhận cả 3 dạng (`youtu.be/...`, `watch?v=...`, `/embed/...`).
Với Google Drive, video phải để quyền **"Bất kỳ ai có đường liên kết"** thì người xem mới thấy.
Chưa đặt link thì mục này tự ẩn, không để lại khoảng trống trên trang.

**Nội dung phần "Modeling là gì"** nằm ở mảng `CORE` trong `index.html` — bốn ý cốt lõi,
mỗi ý một slide. Mỗi mục có `f` (tên file ảnh), `k` (nhãn nhỏ), `t` (tiêu đề), `d` (đoạn giải
thích) và `n` (câu ghi chú viền xanh). Muốn thêm ý thứ năm thì thêm một mục vào mảng — bố cục
tự xen kẽ trái/phải.

Thư mục `assets/slides/` còn 14 ảnh slide khác đã xuất sẵn nhưng chưa dùng (five-inputs, nopat,
working-cap, wacc, two-stages, forecast-pl, forecast-bs, practice-q, practice-a, recap...).
Muốn đưa ý nào lên trang thì thêm vào mảng `CORE`, không phải xuất lại ảnh.

**Ảnh slide và ảnh model** nằm trong `assets/slides/` và `assets/model/`. Mỗi ảnh có 2 bản:
`<tên>.webp` (bản lớn, mở khi bấm vào) và `<tên>-thumb.webp` (bản nhỏ trong lưới). Muốn thay
hoặc thêm ảnh: bỏ file vào đúng thư mục rồi sửa mảng `SLIDES` / `MODELSHOTS` trong `index.html`.
Ảnh hiện tại trích từ bộ slide Module 1 và từ file model DGW v4.

**Đổi nội dung không do bot quản lý** (tên bài học, câu hỏi FAQ, phần "Vấn đề thật"):
sửa mảng `MODULES` và `FAQS` trong `index.html`. Đây là nội dung giáo trình,
hiếm khi đổi nên để trong code cho gọn.

**Chuỗi `{{...}}` trong FAQ** được thay bằng giá trị thật lúc render — ví dụ
`{{computed.price.earlyBird}}` sẽ ra `3.000.000đ`. Nhờ vậy câu trả lời FAQ
không bao giờ lệch giá so với bảng học phí.
