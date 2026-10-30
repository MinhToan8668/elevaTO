# YouTube Blur Fill

Extension Chrome/Edge thay viền đen quanh video YouTube (khi tỉ lệ video không khớp màn hình, ví dụ video dọc, 4:3, 21:9...) bằng nền mờ lấy từ chính nội dung video.

## Cài đặt
1. Mở `chrome://extensions` (hoặc `edge://extensions`).
2. Bật **Developer mode**.
3. Bấm **Load unpacked** → chọn thư mục `youtube-ambient-blur`.
4. Mở/tải lại trang YouTube.

## Tuỳ chỉnh
- Độ mờ / độ sáng: sửa `filter` trong `style.css`.
- Tốc độ cập nhật: sửa `FPS` trong `content.js` (thấp hơn = nhẹ máy hơn).
