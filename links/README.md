# elevaTO · Link in bio

Trang gom mọi thứ của elevaTO vào một màn hình, để gắn vào bio TikTok thay cho Beacons.

| | Địa chỉ |
|---|---|
| **Trang công khai** (dán vào bio) | `https://minhtoan8668.github.io/elevaTO/links/` |
| **Trình chỉnh sửa** (chỉ bạn dùng) | `https://minhtoan8668.github.io/elevaTO/links/edit.html` |

## Trang có gì

- **Danh thiếp**: ảnh, tên + tích xanh, một dòng giới thiệu, 3 con số nổi bật, icon mạng xã hội.
- **Ô nổi bật** (khoá học): hiện **số chỗ cohort trực tiếp** lấy từ cùng backend Apps Script với trang
  khoá học — đổi cohort / số chỗ bằng bot Telegram như cũ là trang này đổi theo. Nút "Giữ chỗ" mở thẳng
  form đăng ký (`../#dang-ky`).
- **Lưới ô (bento)**: 3 kiểu — *Nổi bật*, *Ngang cả hàng*, *Nửa hàng*. Mỗi ô có icon, màu nhấn, nhãn góc
  (Mới / Free / Hot…). Bấm vào là mở link; hoặc bật **thẻ chi tiết** để hiện vài gạch đầu dòng trước khi đi tới link.
- **Liquid Glass** kiểu iPhone: kính trong có viền bắt sáng, phản chiếu mép trên; sáng / tối dùng chung nút
  với công cụ AI (`ai/`). **Độ mờ (blur)**, **độ đục của kính** và **hình nền** (4 dải màu có sẵn hoặc ảnh tự
  chọn) chỉnh bằng thanh kéo trong trình chỉnh sửa.
- **Icon cho từng ô** (trình chỉnh sửa → mở một ô → *Icon / ảnh của ô*):
  - **Bộ icon elevaTO** (mặc định): 16 icon vẽ riêng kiểu Liquid Glass trong `art/glass/` — khoá học, AI,
    slide, học thử, model, Zalo, CV, coffee, lịch, tin nhắn, email, tiền, sách, tên lửa, ngôi sao, điện thoại.
  - **Bộ icon cũ**: bộ vẽ ở bản trước, giữ lại trong `art/classic/`.
  - **Icon 3D**: 48 icon Fluent Emoji 3D của Microsoft có sẵn trong `art/3d/` (giấy phép MIT), hiện trên ô
    vuông bo góc tô theo màu nhấn của ô — giống icon app iPhone.
  - **Tìm icon**: tìm thẳng trong thư viện [Iconify](https://icon-sets.iconify.design/) (200.000+ icon, chỉ
    lấy các bộ nhiều màu). Icon chọn xong được nhúng vào `data.json`, trang không phụ thuộc Iconify.
  - **Ảnh từ máy**: tự cắt vuông, thu nhỏ, nén WebP rồi lưu luôn trong `data.json`. Ảnh đại diện, ảnh nền cũng vậy.
  - Muốn tự thiết kế: [Canva](https://www.canva.com/), [Flaticon](https://www.flaticon.com/),
    [Icons8](https://icons8.com/icons) → tải PNG về → *Ảnh từ máy*.
  - *Kiểu hiển thị*: "Icon trên nền màu" (hình trong suốt) hoặc "Ảnh lấp kín ô" (ảnh chụp, logo).
- Ô nào **chưa có link thì tự ẩn** — không bao giờ hiện link hỏng.

## Sửa trang

Mở `edit.html`. Mọi thay đổi hiện ngay trong khung điện thoại bên phải và được lưu nháp trên máy.
Bấm **Đăng lên web** để áp dụng.

### Cách chính: máy chủ elevaTO trên Cloudflare Workers (không cần token GitHub)

Trình chỉnh sửa lưu nội dung lên **Worker** (`ai/worker/src/links.js`, chung máy chủ với công cụ AI).
Trang công khai đọc từ đó — bấm Đăng là trang **đổi ngay**. `data.json` trong repo là bản dự phòng khi
máy chủ chưa lưu gì hoặc không trả lời.

1. Nhắn bot Telegram **elevaTO AI BCTC** lệnh **`/linkkey`** → bot gửi ADMIN_KEY (lần đầu hỏi thì tự sinh).
2. Trình chỉnh sửa → mục **Đăng lên web** → dán key → **Kiểm tra key** → bấm **Đăng lên web**.

Đúng bot nào: `/linkkey` ở bot **elevaTO AI BCTC** (máy chủ Cloudflare). Bot đăng ký khoá học là bot khác,
key của nó không mở được trang link.

Nội dung nằm trong bảng `cai_dat` của cơ sở dữ liệu D1, cắt thành nhiều dòng vì D1 giới hạn mỗi ô 1MB.
Gõ sai key quá 20 lần trong 15 phút thì máy chủ tạm khoá việc lưu.

Máy chủ tự cập nhật: đổi gì trong `ai/worker/` rồi đẩy lên `main` là GitHub Actions triển khai lại và tự
điền địa chỉ mới vào `links/js/backend.js` cùng khai báo `connect-src` trong CSP của hai trang — không phải
chép tay (xem `ai/worker/tools/config-url.mjs`).

**Vì sao đổi khỏi Apps Script:** đo được Apps Script trả lời mất ~4 giây. Trang vẽ bản dự phòng trước rồi
mới đổi sang nội dung thật, người xem thấy giao diện nhảy. Worker trả lời trong vài chục mili-giây.
Phần trang link trong `backend/Code.gs` vẫn còn nhưng không ai gọi nữa.

Số chỗ cohort trực tiếp trên ô nổi bật **vẫn** lấy từ backend Apps Script của trang khoá học (ô *URL Web App*
trong mục "Số chỗ cohort trực tiếp") — đó là nơi bot đăng ký ghi số, không liên quan Worker.

### Cách khác: GitHub token

Trong mục **Đăng lên web** mở **Cách khác: đăng qua GitHub bằng token** — trình chỉnh sửa ghi thẳng
`links/data.json` vào repo, GitHub Pages dựng lại trang sau khoảng một phút. Lưu ý: nếu máy chủ elevaTO đã có
nội dung, trang công khai ưu tiên bản trên máy chủ.

Tạo token (làm một lần):

1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**
   (hoặc mở thẳng <https://github.com/settings/personal-access-tokens/new>).
2. *Repository access*: **Only select repositories** → chọn `elevaTO`.
3. *Permissions → Repository permissions*: **Contents → Read and write**. Không cần quyền nào khác.
4. Dán token vào ô **Token GitHub**, bấm **Kiểm tra kết nối**.

Token / key chỉ nằm trong trình duyệt của bạn và mặc định mất khi đóng tab. Nếu bật "Nhớ … trên máy này",
chúng được lưu lại và mọi trang trên `minhtoan8668.github.io` đều đọc được — chỉ bật trên máy riêng.
Trang `edit.html` để công khai cũng không sao: không có key / token thì không lưu được gì.

Báo **"GitHub không nhận token này"** (lỗi 401) nghĩa là GitHub từ chối chuỗi đã dán: thường là dán nhầm
mật khẩu, copy thiếu ký tự (token đầy đủ bắt đầu bằng `github_pat_`, dài ~93 ký tự, GitHub chỉ hiện **một lần**
lúc tạo — bấm nút copy cạnh nó), hoặc token đã hết hạn / bị xoá.

Không muốn dùng token? Bấm **Sao lưu → Tải data.json**, rồi thay file `links/data.json` trong repo bằng file đó.

## Cấu trúc

```
links/
├── index.html        trang công khai
├── edit.html         trình chỉnh sửa
├── data.json         toàn bộ nội dung trang (trình chỉnh sửa ghi vào đây)
├── art/              bộ icon elevaTO (glass), icon 3D (3d), bộ cũ (classic), logo chữ cho chân trang
├── css/links.css     giao diện trang (edit.css: thêm cho trình chỉnh sửa)
├── fonts/            Plus Jakarta Sans (phông tiêu đề, OFL) — chữ thường dùng Be Vietnam Pro của ai/
├── js/core.js        logic thuần: lọc link an toàn, chuẩn hoá dữ liệu, số chỗ cohort
├── js/dom.js         tiện ích dùng chung cho cả hai trang: tạo element, lưu trên máy, thông báo, sáng/tối
├── js/icons.js       bộ icon SVG dùng chung
├── js/page.js        vẽ trang công khai
├── js/editor.js      trình chỉnh sửa — khởi động và nối các nút
│   ├── edit-state.js   bản nháp: lưu trên máy, đẩy sang khung xem trước, so với bản trên web
│   ├── edit-panels.js  nội dung form (hồ sơ, giao diện, từng ô link, sao lưu…)
│   ├── edit-publish.js đăng lên web: ADMIN_KEY / token GitHub
│   └── edit-ui.js      khối nhỏ: ô nhập, công tắc, nhóm chọn một, thanh kéo, chọn ảnh
│                       (image.js: nén ảnh từ máy · iconify.js: tìm icon)
├── js/backend.js     đọc / lưu nội dung qua Worker Cloudflare (ai/worker/src/links.js)
├── js/boot-theme.js  áp giao diện kính đã lưu trước nhịp vẽ đầu tiên (khỏi nháy lúc mới mở)
├── js/github.js      đăng data.json qua GitHub API (cách phụ)
└── tests/            node --test (+ e2e Playwright; fixtures/data.json là dữ liệu kiểm thử cố định)
```

Chạy test: `cd links && npm test` · `npm run e2e` (cần Playwright).

Link chỉ nhận `http(s)`, `mailto:`, `tel:`, `sms:` và đường dẫn tương đối — `javascript:` hay `data:` bị bỏ.

Trình chỉnh sửa dùng được bằng bàn phím: trong các nhóm chọn một (kiểu ô, hình nền, icon, màu nhấn) dùng
**Tab** để vào nhóm rồi **mũi tên / Home / End** để chọn — không phải bấm Tab qua từng nút.
