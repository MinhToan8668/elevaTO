# Máy chủ elevaTO AI BCTC — Cloudflare Workers

Thay cho bản Google Apps Script (`ai/backend/Code.gs`). Cùng một giao thức, nên trang web chỉ
phải đổi đúng một dòng địa chỉ trong `ai/js/config.js`.

**Vì sao đổi:** Apps Script phải dán tay cả file code mỗi lần sửa, và key phải nằm ngay trong
file đó. Ở đây code đi thẳng từ GitHub lên máy chủ mỗi lần push, còn key nằm kín trong
Cloudflare — không ai phải gửi file có key cho ai nữa.

| | Apps Script (cũ) | Cloudflare Workers (mới) |
|---|---|---|
| Cập nhật code | dán tay vào trình soạn thảo | `git push` là xong |
| Key, token | nằm trong file code | secret của Cloudflare, không ai đọc được |
| Tài khoản người dùng | Google Sheet | cơ sở dữ liệu D1 (SQLite) |
| Bot Telegram | hỏi tin mỗi phút (trễ tới 1 phút) | webhook, trả lời ngay |
| Gửi email | MailApp của Gmail | Brevo |

---

## Cài đặt lần đầu (làm một lần, khoảng 20 phút)

### 1. Tài khoản Cloudflare

Đăng ký miễn phí ở [dash.cloudflare.com](https://dash.cloudflare.com). Vào trang chủ, bên phải
có **Account ID** — chép lại, lát nữa dùng.

### 2. Tạo cơ sở dữ liệu D1

Trong Cloudflare: **Storage & Databases → D1 → Create database**, đặt tên đúng là **`elevato-ai`**.
Tạo xong, trang chi tiết có **Database ID** — chép và dán vào `ai/worker/wrangler.toml`,
thay chỗ `DAN_DATABASE_ID_VAO_DAY`, rồi commit.

> Database ID không phải thứ bí mật (phải có token mới dùng được), nên để trong repo không sao.

### 3. Tạo API token cho GitHub

**My Profile → API Tokens → Create Token → dùng mẫu "Edit Cloudflare Workers"**.
Trong phần Permissions, bấm **+ Add more** và thêm **Account → D1 → Edit**. Tạo xong chép token
(chỉ hiện một lần).

Vào GitHub: **Settings → Secrets and variables → Actions → New repository secret**, thêm hai cái:

| Tên | Giá trị |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token vừa tạo |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID ở bước 1 |

### 4. Đẩy lần đầu

Push bất kỳ thay đổi nào trong `ai/worker/` (hoặc vào tab **Actions** của repo, chọn
*Máy chủ AI (Cloudflare Workers)* → **Run workflow**). Xong sẽ có địa chỉ dạng:

```
https://elevato-ai.<tên-tài-khoản>.workers.dev
```

Mở bằng trình duyệt, thấy `{"ok":true,"service":"elevaTO AI",...}` là máy chủ đã sống
(chưa cài key nên chưa trích xuất được — bước sau).

### 5. Cất các giá trị bí mật

Cloudflare: **Workers & Pages → elevato-ai → Settings → Variables and Secrets → Add**,
chọn loại **Secret** cho từng cái:

| Tên | Là gì | Lấy ở đâu |
|---|---|---|
| `GEMINI_KEYS` | key Gemini, nhiều key cách nhau dấu phẩy | [Google AI Studio](https://aistudio.google.com/apikey) |
| `TG_TOKEN` | token bot Telegram | nhắn [@BotFather](https://t.me/BotFather) → `/newbot` |
| `TG_ADMIN` | chat ID của bạn (nhiều người: cách nhau dấu phẩy) | nhắn [@userinfobot](https://t.me/userinfobot) |
| `TG_SECRET` | chuỗi ngẫu nhiên tự nghĩ (20+ ký tự) | để Telegram chứng minh tin là thật |
| `BREVO_KEY` | API key gửi thư | bước 6 |
| `MAIL_TU` | địa chỉ gửi thư đã xác minh | bước 6 |

Nhiều key Gemini thì tốt hơn một: hết hạn mức key này, máy chủ tự chuyển key khác.

Cất xong, mở lại địa chỉ máy chủ một lần — bot sẽ tự nối webhook và nhắn cho bạn
"✅ Bot elevaTO AI BCTC đã kết nối". Nhớ bấm **Start** với bot trước.

### 6. Gửi email (Brevo)

Workers không tự gửi được thư, nên mã đặt lại mật khẩu đi qua [Brevo](https://www.brevo.com)
(miễn phí 300 thư/ngày, **không cần tên miền riêng**):

1. Đăng ký, vào **Senders, Domains & Dedicated IPs → Senders → Add a sender**, điền
   `minhtoantowork@gmail.com`. Brevo gửi thư xác minh — bấm vào là xong.
2. **SMTP & API → API Keys → Generate a new API key**.
3. Cất `BREVO_KEY` = key đó, `MAIL_TU` = địa chỉ vừa xác minh (bước 5).

Chưa cài Brevo thì mọi thứ khác vẫn chạy, chỉ riêng "quên mật khẩu" là không gửi được thư —
lúc đó bot sẽ nhắn báo cho bạn và bạn cấp mật khẩu mới bằng lệnh `/mkmoi`.

### 7. Trỏ trang web sang máy chủ mới

Sửa `ai/js/config.js`:

```js
export const API = 'https://elevato-ai.<tên-tài-khoản>.workers.dev';
```

Commit, push. Xong.

---

## Từ đây về sau

Sửa gì trong `ai/worker/` rồi `git push` — GitHub Actions tự dựng bảng và đẩy lên. Không dán tay gì nữa.

Đổi hạn mức mà không cần sửa code: mở `wrangler.toml`, sửa `[vars]`, push.

| Biến | Mặc định | Nghĩa |
|---|---|---|
| `AI_LUOT_FREE` | 10 | lượt AI mỗi ngày của tài khoản thường |
| `AI_LUOT_HV` | 40 | lượt AI mỗi ngày của học viên (giảng viên không giới hạn) |
| `BAM_VONG` | 15000 | số vòng băm mật khẩu — xem phần dưới |
| `AI_MODEL` | *(trống)* | ép dùng một model cụ thể, trống thì tự chọn bản flash mới nhất |

Các lệnh của bot (`/thongke`, `/tim`, `/hocvien`, `/luot`, `/mkmoi`, `/ungho`…) giữ nguyên như
bản cũ — gõ `/help` trong Telegram để xem đủ.

### Gói Free đủ chưa? — đọc kỹ chỗ này

Gói Workers **Free** chỉ cho **10 mili giây CPU** mỗi yêu cầu. Chờ Gemini trả lời thì KHÔNG tính
(đó là chờ mạng, không phải CPU), nên phần lớn mọi thứ chạy thoải mái. Nhưng có hai chỗ ăn CPU thật:

**1. Đọc gói dữ liệu gửi lên.** Trang gửi trang BCTC dưới dạng JSON, máy chủ phải đọc ra để kiểm
trước khi chuyển cho Gemini.

| Cách gửi | Nặng cỡ nào | Gói Free |
|---|---|---|
| **PDF con** (mặc định, kể cả bản scan) | 3 trang ≈ 112 KB | thoải mái |
| **Ảnh JPEG** (dùng khi PDF đọc không ra số) | 8 trang ≈ 3 MB | **có thể vượt 10 ms** |

Trang luôn thử PDF trước nên đường thường dùng vẫn chạy ngon trên gói Free. Hay phải dùng ảnh
(BCTC scan khó đọc, ảnh chụp điện thoại) thì nên bật gói **Workers Paid — 5 đô/tháng, 30 giây CPU**.

**2. Băm mật khẩu khi đăng nhập.** Đo thật bằng WebCrypto (PBKDF2-SHA256, lấy 256 bit):

| Số vòng | CPU mỗi lần đăng nhập |
|---|---|
| 5 000 | 1,6 ms |
| **15 000** (mặc định) | **4,2 ms** |
| 30 000 | 6,5 ms |
| 100 000 | 19 ms — **vượt trần gói Free** |

Nên `BAM_VONG` để mặc định 15 000: còn thừa chỗ trong 10 ms cho phần còn lại của yêu cầu.
Lên gói Paid thì đổi thành `"200000"` cho chắc ăn hơn — **người đang có tài khoản vẫn đăng nhập
bình thường**, vì mỗi bản băm tự ghi kèm số vòng của chính nó.

Nếu đăng nhập hay trích xuất báo lỗi lạ và nhật ký Cloudflare ghi *"Exceeded CPU limit"* thì đúng là
chạm trần này: hạ `BAM_VONG`, hoặc bật gói Paid.

Các hạn mức miễn phí còn lại đều thừa thãi với quy mô này: 100 000 lượt gọi/ngày, D1 5 GB và
100 000 dòng ghi/ngày (một lượt trích xuất ghi 3 dòng).

---

## Chạy thử ở máy

```bash
cd ai/worker
npm install
npx wrangler d1 execute elevato-ai --local --file=schema.sql
npx wrangler dev
```

Bộ kiểm tra chạy bằng SQLite thật, không cần Cloudflare:

```bash
cd ai && npm test          # tests/worker*.test.js
```

## Cấu trúc

```
worker/
├── wrangler.toml      tên Worker, nối D1, các biến chỉnh được
├── schema.sql         bảng D1 (tài khoản, phiên, bộ đếm, cài đặt)
└── src/
    ├── index.js       bộ định tuyến: một đường POST { action, … } + webhook Telegram
    ├── caidat.js      hằng số và trần
    ├── db.js          D1: bộ đếm nguyên tử, cài đặt, tài khoản
    ├── auth.js        đăng ký, đăng nhập, phiên, băm mật khẩu, hạn lượt
    ├── gemini.js      proxy Gemini: nhiều key, chuỗi model dự phòng, giữ nhịp
    ├── telegram.js    webhook + lệnh quản trị
    ├── quenmk.js      mã đặt lại mật khẩu
    ├── mail.js        gửi thư qua Brevo
    └── ungho.js       số tài khoản nhận ủng hộ + bảng BIN ngân hàng
```
