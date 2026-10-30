# TeleUploader (macOS)

Gồm 3 công cụ: **TeleUploader** (đẩy lên Telegram + tìm/tải lại), **Video Sorter** (`./sort.sh`), **Disk Report** (`./disk.sh`). Nên cài thêm `brew install ffmpeg` để đọc ngày quay video chính xác.

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
| `./run.sh find "từ khoá"` | Tìm file trên Telegram theo tên, folder, `#hashtag` |
| `./run.sh get <ID or tên>` | Tải về `~/Downloads/TeleUploader`, tự ghép file đã split |
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

## 🎬 Video Sorter — `./sort.sh`
Đọc ngày quay gốc (metadata video/EXIF ảnh, thiếu thì lấy ngày tạo file), đổi tên và xếp:
```
~/Movies/Library/2026/10/2026-10-30_Vlog-Da-Lat/Raw/Video/2026-10-30_143012_Vlog-Da-Lat_001.mp4
                                               /Final/Video/...   (tên có final/export/render)
```
| Lệnh | Việc làm |
|---|---|
| `./sort.sh ~/Desktop/Quay -p "Vlog Đà Lạt"` | Xem trước, chưa đụng file |
| `./sort.sh ~/Desktop/Quay -p "Vlog Đà Lạt" --apply` | Thực hiện |
| `./sort.sh --cards -p "Event" --apply` | Lấy từ thẻ nhớ đang cắm (luôn **copy** + kiểm tra, không xoá thẻ) |
| `./sort.sh --undo` | Hoàn tác lần chạy gần nhất |

- File trùng (so nội dung, kể cả khác tên) được gom vào `_Trung_lap/`, thêm `--dups skip` nếu muốn để yên.
- File phụ đi kèm (`.SRT` của DJI, `.LRF`, `.THM`, `.XMP`…) đi theo file chính.
- Đổi thư mục đích/mẫu tên trong `config.yaml` → `video_sorter`.
- Muốn đẩy lên Telegram thì để `library` (hoặc 1 folder con) trong `folders` của TeleUploader.

## 🗂 Disk Report — `./disk.sh`
```bash
./disk.sh ~/Movies ~/Downloads ~/Desktop
```
Tạo trang HTML (tự mở) gồm: dung lượng trống, folder nặng nhất, file lớn nhất, file lâu không đụng, **file trùng** và **gợi ý file nên đẩy lên Telegram** (mặc định ≥ 300MB và không sửa trong 90 ngày, đổi bằng `--min-big 500 --old-days 180`). File đã up được đánh dấu.

`./disk.sh ~/Movies --queue` → chuyển các file gợi ý vào folder upload (hỏi xác nhận trước); TeleUploader up xong sẽ tự đưa vào Thùng rác.
