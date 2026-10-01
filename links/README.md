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
Bấm **Đăng lên web** để áp dụng: trình chỉnh sửa ghi `links/data.json` vào repo, GitHub Pages dựng lại
trang sau khoảng một phút.

Lần đầu cần một token GitHub (làm một lần):

1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**
   (hoặc mở thẳng <https://github.com/settings/personal-access-tokens/new>).
2. *Repository access*: **Only select repositories** → chọn `elevaTO`.
3. *Permissions → Repository permissions*: **Contents → Read and write**. Không cần quyền nào khác.
4. Dán token vào mục **Đăng lên web** trong trình chỉnh sửa, bấm **Kiểm tra kết nối**.

Token chỉ nằm trong trình duyệt của bạn và mặc định mất khi đóng tab. Nếu bật "Nhớ token trên máy này",
token được lưu lại và mọi trang trên `minhtoan8668.github.io` đều đọc được — chỉ bật trên máy riêng, và đặt
hạn ngắn (vd. 30–90 ngày) khi tạo token. Trang `edit.html` để công khai cũng không sao: không có token thì
không ghi được gì.

Không muốn dùng token? Bấm **Sao lưu → Tải data.json**, rồi thay file `links/data.json` trong repo bằng file đó.

## Cấu trúc

```
links/
├── index.html        trang công khai
├── edit.html         trình chỉnh sửa
├── data.json         toàn bộ nội dung trang (trình chỉnh sửa ghi vào đây)
├── art/              icon 3D (art/3d), logo Zalo, logo chữ cho chân trang
├── css/links.css     giao diện trang (edit.css: thêm cho trình chỉnh sửa)
├── js/core.js        logic thuần: lọc link an toàn, chuẩn hoá dữ liệu, số chỗ cohort
├── js/page.js        vẽ trang
├── js/editor.js      trình chỉnh sửa (edit-ui.js: ô nhập, thanh kéo, chọn ảnh; image.js: nén ảnh từ máy;
│                     iconify.js: tìm icon)
├── js/github.js      đăng data.json qua GitHub API
└── tests/            node --test (+ e2e Playwright)
```

Chạy test: `cd links && npm test` · `npm run e2e` (cần Playwright).

Link chỉ nhận `http(s)`, `mailto:`, `tel:`, `sms:` và đường dẫn tương đối — `javascript:` hay `data:` bị bỏ.
