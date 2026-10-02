# Máy chủ elevaTO AI BCTC — Cloudflare Workers

## Trang link-in-bio dùng chung máy chủ này

Nội dung trang `links/` (link-in-bio gắn ở bio TikTok) cũng lưu ở đây, trong bảng `cai_dat` của D1:

| Đường | Việc |
|---|---|
| `GET /links` | Trang công khai đọc nội dung — không cần key, không nhớ đệm |
| `POST { action:'checkKey', key }` | Nút *Kiểm tra key* trong trình chỉnh sửa |
| `POST { action:'saveLinks', key, data }` | Nút *Đăng lên web* |

Key lấy bằng lệnh **`/linkkey`** của bot — chưa có thì tự sinh ngay lần hỏi đầu, cất trong D1.
Gõ sai 20 lần trong 15 phút thì nghỉ. Mã nguồn: `src/links.js`.

Nội dung có thể kèm ảnh nhúng nên được cắt thành nhiều dòng (300.000 ký tự mỗi dòng) — D1 giới hạn mỗi ô 1MB.

Sau mỗi lần triển khai, `tools/config-url.mjs` tự điền địa chỉ mới vào `ai/js/config.js`,
`links/js/backend.js` và khai báo `connect-src` trong CSP của `links/index.html` + `links/edit.html`.


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

## Cài đặt lần đầu

Làm một lần, khoảng 15 phút. Không phải cài gì vào máy, làm hết trên trình duyệt.
Cơ sở dữ liệu D1 và địa chỉ máy chủ trong `config.js` đều do workflow tự lo.

### 1. Tài khoản Cloudflare và Account ID

Đăng ký miễn phí ở **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**
(email + mật khẩu, không cần thẻ). Xác minh email rồi đăng nhập.

Lấy **Account ID**: vào trang bất kỳ trong dashboard, nhìn thanh địa chỉ:

```
https://dash.cloudflare.com/ab12cd34ef56.../workers
                             ^^^^^^^^^^^^^^^ đây là Account ID
```

Chuỗi 32 ký tự ngay sau `dash.cloudflare.com/` chính là nó. Chép ra để lát dán.

### 2. Tạo API token cho GitHub

1. Góc trên phải → ảnh đại diện → **My Profile** → **API Tokens**
   (hoặc vào thẳng [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)).
2. **Create Token**.
3. Tìm dòng **Edit Cloudflare Workers** → bấm **Use template**.
4. Màn hình Permissions hiện sẵn vài dòng. Bấm **+ Add more** rồi chọn:
   **Account** · **D1** · **Edit**
   *(thiếu dòng này thì workflow không tạo được cơ sở dữ liệu)*
5. Phần **Account Resources**: chọn **Include** · tài khoản của bạn.
   Phần **Zone Resources** cứ để nguyên mặc định.
6. **Continue to summary** → **Create Token**.
7. Màn hình cuối hiện token — **chép ngay**, đóng trang là không xem lại được nữa.

### 3. Dán hai secret vào GitHub

Mở repo trên GitHub → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Thêm hai cái:

| Name | Secret |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token vừa chép ở bước 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID ở bước 1 |

> Secret của GitHub không ai xem lại được, kể cả bạn — quên thì tạo token mới rồi ghi đè.

### 4. Bấm chạy lần đầu

Repo trên GitHub → tab **Actions** → chọn **Máy chủ AI (Cloudflare Workers)** ở cột trái →
**Run workflow** → **Run workflow**.

Khoảng một phút sau, ba bước hiện dấu tích xanh:

```
✔ Chuẩn bị cơ sở dữ liệu D1     ← tự tạo database "elevato-ai", không phải lập tay
✔ Dựng bảng D1                  ← tạo các bảng tài khoản, phiên, bộ đếm
✔ Triển khai Worker             ← đẩy code lên
```

Bấm vào bước **Triển khai Worker** để xem địa chỉ máy chủ ở dòng cuối:

```
https://elevato-ai.<tên-tài-khoản>.workers.dev
```

Mở địa chỉ đó bằng trình duyệt. Thấy `{"ok":true,"service":"elevaTO AI",...}` là máy chủ đã sống.

Phần `cai` trong câu trả lời cho biết **đã cài được những gì** — lúc này đang trống hết, đúng:

```json
{"ok":true,"service":"elevaTO AI","ban":"…","cai":{"ai":false,"bot":false,"mail":false}}
                                                        │          │           └ BREVO_KEY + MAIL_TU
                                                        │          └ TG_TOKEN + TG_SECRET + TG_ADMIN
                                                        └ GEMINI_KEYS
```

Mở lại địa chỉ này sau bước 5 để kiểm: cái nào còn `false` là secret đó chưa vào (nó chỉ báo
có hay chưa, không bao giờ in ra giá trị).

### 5. Cất key và token vào Cloudflare

Dashboard Cloudflare → **Workers & Pages** → trong **Overview** bấm **elevato-ai** →
**Settings** → mục **Variables and Secrets** → **Add**.

Mỗi dòng dưới đây là một lần bấm **Add**, chọn **Type: Secret**, điền **Variable name** và **Value**:

| Variable name | Value | Lấy ở đâu |
|---|---|---|
| `GEMINI_KEYS` | key Gemini (nhiều key cách nhau dấu phẩy) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key** |
| `TG_TOKEN` | token bot | Telegram → [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên → nhận token |
| `TG_ADMIN` | chat ID của bạn | Telegram → [@userinfobot](https://t.me/userinfobot) → bấm **Start** → nó đọc số Id |
| `TG_SECRET` | chuỗi ngẫu nhiên tự nghĩ, 20+ ký tự | gõ bừa cũng được, chỉ cần dài và không đoán ra |
| `BREVO_KEY` | API key gửi thư | bước 6 |
| `MAIL_TU` | địa chỉ gửi thư đã xác minh | bước 6 |

**Điền xong hết phải bấm `Deploy` ở cuối trang** — không bấm thì secret chưa có hiệu lực, và
máy chủ chạy y như chưa cài gì.

> Nhiều key Gemini thì tốt hơn một: hết hạn mức key này, máy chủ tự chuyển key khác. Cứ tạo
> 2–3 key trong AI Studio rồi dán cả vào một dòng, cách nhau dấu phẩy.

**Nhớ mở Telegram bấm Start với bot của bạn** — bot không nhắn được cho người chưa Start.
Rồi mở lại địa chỉ máy chủ một lần: bot sẽ tự nối webhook, tự đăng ký **menu lệnh** và nhắn
"✅ Bot elevaTO AI BCTC đã kết nối". Từ đó bấm nút **Menu** cạnh ô soạn tin (hoặc gõ `/`) là ra
danh sách lệnh kèm mô tả.

### 6. Gửi email (Brevo)

Workers không tự gửi được thư, nên mã đặt lại mật khẩu đi qua [Brevo](https://www.brevo.com)
— miễn phí 300 thư/ngày và **không cần tên miền riêng**:

1. Đăng ký ở [brevo.com](https://www.brevo.com) (chọn gói **Free**).
2. Menu trái → **Senders, Domains & Dedicated IPs** → tab **Senders** → **Add a sender**.
   Điền tên hiển thị và email `minhtoantowork@gmail.com`. Brevo gửi thư xác minh về hòm đó —
   bấm vào link trong thư là xong.
3. Góc trên phải → tên tài khoản → **SMTP & API** → tab **API Keys** →
   **Generate a new API key** → đặt tên → chép key.
4. Quay lại bước 5, cất `BREVO_KEY` = key vừa chép, `MAIL_TU` = `minhtoantowork@gmail.com`.

Chưa cài Brevo thì mọi thứ khác vẫn chạy, chỉ riêng "quên mật khẩu" là không gửi được thư —
lúc đó bot nhắn báo cho bạn và bạn cấp mật khẩu mới bằng lệnh `/mkmoi`.

### 7. Tự cho mình quyền giảng viên

Trang web **tự được trỏ sang máy chủ mới**: ngay sau khi triển khai, workflow lấy địa chỉ
workers.dev thật rồi sửa và commit vào `ai/js/config.js` giúp bạn. Chờ GitHub Pages dựng lại
(khoảng một phút) rồi mở trang.

Đăng ký một tài khoản trên trang. Bot nhắn báo có tài khoản mới kèm nút bấm — bấm
**👨‍🏫 Giảng viên**, hoặc gõ `/giangvien <email của bạn>`.

Xong. Từ đây sửa gì trong `ai/worker/` chỉ cần push.

---

### Hỏng ở đâu thì xem gì

| Hiện tượng | Nguyên nhân hay gặp |
|---|---|
| Actions đỏ ở bước **Chuẩn bị cơ sở dữ liệu D1** | token thiếu quyền **D1 Edit** (bước 2.4), hoặc Account ID sai |
| Actions đỏ ở bước **Triển khai Worker** | token không phải mẫu **Edit Cloudflare Workers** |
| Trang báo "đang được cài đặt" | GitHub Pages chưa dựng lại xong, hoặc workflow không đẩy được commit vào `ai/js/config.js` (xem cảnh báo ở cuối lượt chạy) |
| Trích xuất báo `setup` | chưa cất `GEMINI_KEYS` (bước 5) |
| Bot không nhắn gì | mở địa chỉ máy chủ xem `cai.bot`: `false` = thiếu `TG_TOKEN` / `TG_SECRET` / `TG_ADMIN`, hoặc quên bấm **Deploy** sau khi thêm secret. `true` mà vẫn im = chưa bấm **Start** với bot (bấm xong, mở lại trang là lời chào tới) |
| Quên mật khẩu không nhận được thư | chưa xác minh người gửi trên Brevo (bước 6.2) |

Xem nhật ký máy chủ: **Workers & Pages → elevato-ai → Logs → Begin log stream**.

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
npx wrangler d1 execute elevato-ai --local --file=schema.sql --yes
npx wrangler dev
```

Chạy ở máy dùng cơ sở dữ liệu riêng trong `.wrangler/`, không đụng tới dữ liệu thật.

Bộ kiểm tra chạy bằng SQLite thật, không cần Cloudflare:

```bash
cd ai && npm test          # tests/worker*.test.js
```

## Cấu trúc

```
worker/
├── wrangler.toml      tên Worker, nối D1, các biến chỉnh được
├── schema.sql         bảng D1 (tài khoản, phiên, bộ đếm, cài đặt)
├── tools/
│   ├── d1-id.mjs      tìm / tạo cơ sở dữ liệu D1 rồi điền id, chạy trong GitHub Actions
│   └── config-url.mjs điền địa chỉ vừa triển khai vào ai/js/config.js
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
