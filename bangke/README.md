# Bảng kê Giải ngân — theo dõi hóa đơn giải ngân & hồ sơ gốc

Một file `index.html` (như AI FinLens / CIC Analyzer): mở là dùng, không đăng nhập.
Trang chạy tại `https://minhtoan8668.github.io/elevaTO/bangke/`.

## Làm được gì
- **Tải bảng kê khách hàng gửi** (.xls/.xlsx/.csv, mỗi khách một kiểu): tự tìm sheet, hàng tiêu đề, cột
  (nhà cung cấp, số/ngày hóa đơn, tiền hóa đơn, tiền vay…), số KUNN & ngày trong dòng “Theo KU nhận nợ số … ngày …”.
  Bảng lạ → **✨ AI nhận dạng cột** (Gemini đọc 45 hàng đầu, chọn cột) hoặc **✨ AI đọc toàn bộ** (bảng lộn xộn).
  Cũng nạp được **bảng kê tổng hợp nhiều KUNN** đang theo dõi bằng Excel (cột KUNN chỉ ghi ở dòng đầu khối,
  cột “chứng từ thiếu” → trạng thái hồ sơ gốc).
- **Kiểm tra trước khi giải ngân**: mỗi hóa đơn = nhà cung cấp (MST hoặc tên đã chuẩn hóa) + số HĐ + ngày HĐ
  (số HĐ điện tử đánh lại mỗi năm nên không so mỗi số). Báo: hóa đơn mới · GN tiếp phần còn lại ·
  **đã giải ngân đủ trước đó** (gửi nhầm) · **vượt tiền hóa đơn** · kê trùng trong file · nghi trùng (cùng số, khác ngày).
- **Theo dõi hóa đơn**: lũy kế giải ngân qua các KUNN, còn lại bao nhiêu.
- **Hồ sơ gốc**: từng dòng Chưa nhận / Nhận thiếu (ghi chứng từ thiếu) / Đã nhận đủ; hạn mặc định N ngày sau
  giải ngân hoặc hạn bổ sung riêng từng KUNN; danh sách quá hạn.
- **Xuất Excel**: bảng kê tổng hợp (bố cục như file đang theo dõi + lũy kế, còn lại, kiểm tra, hồ sơ gốc),
  theo dõi hóa đơn, cảnh báo, hồ sơ gốc chưa đủ; xuất kết quả kiểm tra một bảng kê; tổng quan mọi khách hàng.
- **Nhật ký** ai sửa gì, lúc nào.

## Cài đặt (nút ⚙ hoặc Alt+F9)
- **API key Gemini**: dùng chung kho key với AI FinLens (cùng trình duyệt nạp 1 lần là đủ). Không ghi key vào file.
- **Đồng bộ team** (như CIC Analyzer — Firebase dự án `cic-analyzer`, không màn hình đăng nhập): cả team nhập cùng
  **mã nhóm**. Dữ liệu nằm ở `bk_teams/<SHA-256 của mã nhóm>/customers/{kh}/kunn|log`, cập nhật tức thì cho mọi người.
  Để trống mã nhóm = dữ liệu chỉ lưu trên trình duyệt máy đó (IndexedDB).
  Việc chủ dự án Firebase làm **một lần**:
  1. Firebase Console → Authentication → Sign-in method → bật **Anonymous**.
  2. Firestore → Rules, thêm vào trong `match /databases/{database}/documents { … }`:
     ```
     match /bk_teams/{team}/{document=**} {
       allow read, write: if request.auth != null;
     }
     ```
- **Sao lưu / Nạp sao lưu**: file `.json` toàn bộ dữ liệu (gộp theo bản sửa sau cùng) — dùng để chuyển máy
  hoặc gửi cho người chưa vào nhóm.

## Kiểm thử
```bash
cd bangke && node --test tests/*.test.js
cd bangke && node --test --test-concurrency=1 tests/e2e/app.e2e.js
```
Dữ liệu trong test là giả lập — **không** đưa bảng kê thật của khách hàng vào repo (repo công khai).
