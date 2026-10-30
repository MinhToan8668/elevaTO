# TeleUploader (macOS)

Gồm 3 công cụ: **TeleUploader** (đẩy lên Telegram + tìm/tải lại), **Video Sorter** (`./sort.sh`), **Disk Report** (`./disk.sh`). Nên cài thêm `brew install ffmpeg` để đọc ngày quay video chính xác.

Tự động quét folder trên Mac → thống kê → upload lên Telegram theo cây thư mục → file > 2GB tự split → up xong tự chuyển file gốc vào **Thùng rác** (có thể *Put Back*).

## Cài đặt (1 lần)
Mở Terminal, chạy:
```bash
cd tele-uploader
./install.sh
```
Xong sẽ có **TeleUploader.app** trong `~/Applications` và app tự mở. Từ đó chỉ cần bấm đúp app (kéo vào Dock cho tiện).

Trong app → **Cài đặt**:
1. Vào https://my.telegram.org → *API development tools* → copy `api_id`, `api_hash` vào ô API → **Lưu cài đặt**.
2. Nhập số điện thoại → **Gửi mã** → nhập mã Telegram gửi về (và mật khẩu 2 bước nếu có).
3. Thêm folder cần upload, chọn nơi gửi tới (`me` = Saved Messages, hoặc `@kenh_cua_ban`) → **Lưu**.

### Các màn hình trong app
- **Tổng quan**: số file chờ, file cần split, tiến độ upload, công tắc *Tự động upload*, thông báo gần đây.
- **Upload**: hàng chờ, tiến độ từng file (tốc độ, thời gian còn lại), lịch sử đã up, nút Dừng.
- **Sắp xếp video**: chọn folder/thẻ nhớ → Xem trước → Thực hiện → (Hoàn tác nếu cần).
- **Cắt & gộp** (cần `brew install ffmpeg`):
  - *Cắt video*: mỗi đoạn N phút, mỗi đoạn khoảng N MB, hoặc lấy các khoảng thời gian (`0:10 - 1:25`). Không nén lại → nhanh, giữ nguyên chất lượng; điểm cắt có thể lệch 1–2 giây.
  - *Gộp video*: chọn nhiều video, sắp thứ tự bằng ↑↓. Video khác máy quay/độ phân giải thì bật *Chuyển đổi cho khớp* (nén lại H.264, dùng chip đồ hoạ của Mac).
  - *Chia / ghép file*: chia file bất kỳ thành `.part001`… và ghép lại (chọn 1 phần, app tự tìm đủ các phần).
- **Ổ cứng**: quét → xem file nên dọn, file trùng, folder nặng → tick chọn → *Đưa lên Telegram & dọn* hoặc *Thùng rác*.
- **Tìm & tải**: tìm file đã up, bấm Tải về (tự ghép file đã split).
- **🔔 Thông báo**: mọi việc xong/lỗi đều báo trong app và thông báo của macOS.

Muốn app tự mở khi bật máy: System Settings → General → Login Items → thêm TeleUploader.

> Không chạy song song app với `./run.sh watch` / `autostart.sh` (dùng chung phiên đăng nhập).

### Dùng bằng Terminal (tuỳ chọn)
Tất cả tính năng vẫn chạy được bằng lệnh như dưới đây.

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
