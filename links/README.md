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
- Giao diện kính mờ sáng / tối, dùng chung nút đổi giao diện với công cụ AI (`ai/`).
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

Token chỉ nằm trong trình duyệt của bạn (mặc định mất khi đóng tab; bật "Nhớ token trên máy này" nếu
là máy riêng). Trang `edit.html` để công khai cũng không sao: không có token thì không ghi được gì.

Không muốn dùng token? Bấm **Sao lưu → Tải data.json**, rồi thay file `links/data.json` trong repo bằng file đó.

## Cấu trúc

```
links/
├── index.html        trang công khai
├── edit.html         trình chỉnh sửa
├── data.json         toàn bộ nội dung trang (trình chỉnh sửa ghi vào đây)
├── css/links.css     giao diện trang (edit.css: thêm cho trình chỉnh sửa)
├── js/core.js        logic thuần: lọc link an toàn, chuẩn hoá dữ liệu, số chỗ cohort
├── js/page.js        vẽ trang
├── js/editor.js      trình chỉnh sửa (edit-ui.js: ô nhập, công tắc…)
├── js/github.js      đăng data.json qua GitHub API
└── tests/            node --test (+ e2e Playwright)
```

Chạy test: `cd links && npm test` · `npm run e2e` (cần Playwright).

Link chỉ nhận `http(s)`, `mailto:`, `tel:`, `sms:` và đường dẫn tương đối — `javascript:` hay `data:` bị bỏ.
