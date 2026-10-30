# TeleUploader (macOS)

Tự động quét folder trên Mac → thống kê → upload lên Telegram theo cây thư mục → file > 2GB tự split → up xong tự chuyển file gốc vào **Thùng rác** (có thể *Put Back*).

## Cài đặt (1 lần)
```bash
cd tele-uploader
./install.sh
```
1. Vào https://my.telegram.org → *API development tools* → lấy `api_id`, `api_hash`.
2. Mở `config.yaml`, điền `api_id`, `api_hash`, `folders` (các folder cần up), `target` (`me` = Saved Messages, hoặc `@kenh_cua_ban`).
3. Đăng nhập: `./run.sh login` (nhập số điện thoại + mã OTP Telegram gửi về).

> Dùng tài khoản Telegram (không phải bot) vì bot chỉ up được 50MB. Thường 2GB/file, Premium 4GB/file (`premium: true`).

## Sử dụng
| Lệnh | Việc làm |
|---|---|
| `./run.sh scan` | Thống kê theo folder & loại file, xuất CSV vào `reports/` |
| `./run.sh upload --dry-run` | Xem trước caption, không up |
| `./run.sh upload` | Up 1 lượt |
| `./run.sh watch` | Chạy liên tục, cứ thả file vào folder là tự up |
| `./run.sh history` | Lịch sử đã up |
| `./autostart.sh on` / `off` | Tự chạy `watch` khi mở Mac |

## Logic sắp xếp trên Telegram
- Up lần lượt theo folder → tên file, nên tin nhắn xếp đúng cây thư mục.
- Caption mỗi file: `📁 Folder / Sub`, tên file, dung lượng, ngày, hashtag `#Folder #Sub #video` → bấm hashtag trong Telegram để lọc theo folder/loại.
- Cuối mỗi lượt gửi 1 tin **📊 Tổng kết**, gom theo folder, có link tới từng file (với kênh/nhóm).

## File lớn
- File > 1950MB (Premium: 3900MB) được cắt thành `ten.mp4.part001`, `.part002`… trong `_split_tmp/`, up xong tự xoá phần cắt.
- Ghép lại sau khi tải về: `cat "ten.mp4".part* > "ten.mp4"`.
- Cần ổ trống ≥ dung lượng file để cắt.

## An toàn
- Chỉ chuyển vào Thùng rác **sau khi** mọi phần đã up thành công; lỗi thì giữ nguyên file, lượt sau thử lại.
- Bỏ qua file vừa sửa < 120 giây (đang copy/tải dở), file ẩn, `.tmp`, `.crdownload`…
- Ghi nhớ file đã up trong `state.db` → không up trùng.
- Lần đầu chạy, macOS sẽ hỏi quyền cho Terminal điều khiển **Finder** (để move to Trash) — bấm *OK*. Nếu folder nằm trong Documents/Desktop/Downloads, cấp *Full Disk Access* cho Terminal (System Settings → Privacy & Security).
- `config.yaml` và `*.session` chứa thông tin đăng nhập — đừng chia sẻ.
