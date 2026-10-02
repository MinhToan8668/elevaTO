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

### Cách chính: máy chủ elevaTO (không cần token GitHub)

Trình chỉnh sửa lưu nội dung lên **backend Apps Script của trang khoá học** (`backend/Code.gs`, chung với
bot Telegram). Trang công khai đọc nội dung từ đó — bấm Đăng là trang **đổi ngay**. `data.json` trong repo
chỉ còn là bản dự phòng khi máy chủ chưa lưu gì hoặc không trả lời.

1. Nhắn bot Telegram quản trị lệnh **`/linkkey`** → bot gửi ADMIN_KEY.
2. Trình chỉnh sửa → mục **Đăng lên web** → dán key → **Kiểm tra key** → bấm **Đăng lên web**.

Nội dung nằm trong sheet ẩn `LinksData` của Google Sheet đăng ký (chia nhiều ô vì mỗi ô tối đa 50.000 ký tự).
Gõ sai key quá 20 lần trong 15 phút thì máy chủ tạm khoá việc lưu.

**Cập nhật Apps Script (làm một lần, sau khi có bản `backend/Code.gs` mới):**

1. Mở Google Sheet **elevaTO Đăng ký** → **Tiện ích mở rộng → Apps Script**.
2. Mở file `Code.gs`, chọn hết (Ctrl+A), dán toàn bộ nội dung `backend/Code.gs` mới, bấm 💾.
   Token bot và danh sách admin nằm trong Script Properties nên không mất.
3. **Triển khai → Quản lý bản triển khai** → bấm ✏️ ở bản đang chạy → *Phiên bản*: **Phiên bản mới** → **Triển khai**.
   Phải sửa bản đang có (đừng bấm "Bản triển khai mới") để giữ nguyên URL `/exec` mà trang đang gọi.
4. Nhắn bot `/linkkey` để kiểm tra — bot trả về key là xong.

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
├── js/backend.js     đọc / lưu nội dung qua backend Apps Script (backend/Code.gs)
├── js/github.js      đăng data.json qua GitHub API (cách phụ)
└── tests/            node --test (+ e2e Playwright)
```

Chạy test: `cd links && npm test` · `npm run e2e` (cần Playwright).

Link chỉ nhận `http(s)`, `mailto:`, `tel:`, `sms:` và đường dẫn tương đối — `javascript:` hay `data:` bị bỏ.

Trình chỉnh sửa dùng được bằng bàn phím: trong các nhóm chọn một (kiểu ô, hình nền, icon, màu nhấn) dùng
**Tab** để vào nhóm rồi **mũi tên / Home / End** để chọn — không phải bấm Tab qua từng nút.
