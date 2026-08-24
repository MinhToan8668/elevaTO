# elevaTO — Hướng dẫn cài đặt

Sau khi làm xong 6 bước dưới đây, bạn **không bao giờ phải mở file code nữa**.
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

## Bước 1 — Tạo Google Sheet + Apps Script

1. Tạo một Google Sheet mới, đặt tên `elevaTO Đăng ký`.
2. Menu **Tiện ích mở rộng → Apps Script**.
3. Xoá hết code mẫu, dán **toàn bộ nội dung `backend/Code.gs`** vào.
4. Bấm 💾 lưu.

## Bước 2 — Tạo bot Telegram & lấy Chat ID

1. Nhắn [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên → **copy token**
   (dạng `8692249468:AAF...`).
2. Nhắn [@userinfobot](https://t.me/userinfobot) → nó trả về **Chat ID** của bạn
   (dạng `5116087301`).

> ⚠️ Token cũ trong file HTML trước đây đã bị lộ công khai trên GitHub.
> **Hãy tạo bot mới, hoặc vào BotFather → `/revoke` để đổi token cũ.**
> Token mới chỉ nằm trong Apps Script, không bao giờ xuất hiện trong HTML.

## Bước 3 — Nạp cấu hình vào Apps Script

Trong trình soạn thảo Apps Script, sửa hàm `setup()` ở cuối file:

```js
'TG_BOT_TOKEN': '8692249468:AAF...',   // token từ BotFather
'TG_ADMIN_IDS': '5116087301',          // Chat ID của bạn (nhiều người: '111,222')
```

Chọn hàm `setup` ở thanh trên → bấm **Run** → cấp quyền khi Google hỏi.
Mở **Nhật ký (Logs)**, copy lại dòng `ADMIN_KEY = ...` (dùng ở bước 6).

## Bước 4 — Deploy Web App

1. **Triển khai → Bản triển khai mới → Loại: Ứng dụng web**
2. Cấu hình:
   - *Thực thi với tư cách*: **Tôi**
   - *Ai có quyền truy cập*: **Bất kỳ ai** ← bắt buộc, nếu không web không đọc được config
3. Bấm **Triển khai** → copy **URL Ứng dụng web** (kết thúc bằng `/exec`).

## Bước 5 — Nối bot với backend

Quay lại Apps Script, sửa hàm `setWebhook()`:

```js
var url = 'https://script.google.com/macros/s/AKfy.../exec';   // URL vừa copy
```

Chọn hàm `setWebhook` → **Run**. Log trả về `{"ok":true,...}` là thành công.

Vào Telegram nhắn bot `/menu` — nếu hiện bảng lệnh là xong phần backend.

## Bước 6 — Nối landing page

Mở `index.html`, tìm dòng **duy nhất** cần sửa (dòng 776):

```js
var API = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE';
```

Thay bằng URL `/exec` ở bước 4. Lưu, deploy lên Netlify / GitHub Pages.

**Xong.** Từ giờ mọi thay đổi đều qua Telegram.

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
(key lấy ở bước 3, hoặc chạy hàm `showAdminKey`). Bảng này **chỉ để xem** —
duyệt vẫn làm trên Telegram.

**Chống trùng:** cùng một số điện thoại đăng ký lại trong cùng cohort sẽ được
báo "đã có trong danh sách", không ghi thêm dòng vào Sheet.

**Video học thử.** Gõ `/video <link>` là xong — trang tự nhận diện YouTube hay Google Drive
và nhúng đúng kiểu. Link YouTube nhận cả 3 dạng (`youtu.be/...`, `watch?v=...`, `/embed/...`).
Với Google Drive, video phải để quyền **"Bất kỳ ai có đường liên kết"** thì người xem mới thấy.
Chưa đặt link thì mục này tự ẩn, không để lại khoảng trống trên trang.

**Nội dung phần slide** nằm ở mảng `MODULE1` trong `index.html`. Mỗi phần (A–E) có tiêu đề,
một đoạn ý chốt, và danh sách slide kèm câu tóm tắt riêng. Câu tóm tắt này là thứ học viên
đọc lướt để nắm bài mà không cần mở từng slide — nên viết nó cho ra ý, đừng chỉ đặt nhãn.

**Ảnh slide và ảnh model** nằm trong `assets/slides/` và `assets/model/`. Mỗi ảnh có 2 bản:
`<tên>.webp` (bản lớn, mở khi bấm vào) và `<tên>-thumb.webp` (bản nhỏ trong lưới). Muốn thay
hoặc thêm ảnh: bỏ file vào đúng thư mục rồi sửa mảng `SLIDES` / `MODELSHOTS` trong `index.html`.
Ảnh hiện tại được trích từ bộ slide Module 1 và từ file model DGW.

**Đổi nội dung không do bot quản lý** (tên bài học, câu hỏi FAQ, phần "Vấn đề thật"):
sửa mảng `MODULES` và `FAQS` trong `index.html`. Đây là nội dung giáo trình,
hiếm khi đổi nên để trong code cho gọn.

**Chuỗi `{{...}}` trong FAQ** được thay bằng giá trị thật lúc render — ví dụ
`{{computed.price.earlyBird}}` sẽ ra `3.000.000đ`. Nhờ vậy câu trả lời FAQ
không bao giờ lệch giá so với bảng học phí.
