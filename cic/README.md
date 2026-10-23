# AI CIC Analyzer v5.0 — Diễn biến tín dụng theo thời gian

File chạy độc lập: `cic/AI_CIC_Analyzer_v5.0.html` (mở trực tiếp trong trình duyệt, không cần server).
Toàn bộ tính năng của bản 4.1 (1 KH · Nhóm KH · Theo thời kỳ · Lịch sử · Quản lý dữ liệu) giữ nguyên;
bản 5.0 thêm chế độ thứ tư **Diễn biến**.

## Vấn đề bản 4.1
Lịch sử tra cứu chỉ giữ **một bản mới nhất cho mỗi mã số thuế** — bản tra cũ bị xoá khi lưu bản mới, nên
muốn xem diễn biến phải tự lưu file định kỳ rồi dán lại theo "Theo thời kỳ" (chỉ 1 công ty / lần).

## Bản 5.0 làm gì
- **Kho bản tra theo thời gian** (IndexedDB riêng `cic_timeline_db`): mọi báo cáo S10A/R20 đi qua tool
  (dán 1 KH, thêm vào nhóm, dán nhiều kỳ, nhập tệp) được ghi thêm theo khoá `MST | ngày tra`, không bao giờ
  ghi đè bản cũ. Lần đầu mở, tool tự gom tất cả báo cáo đang có trong Lịch sử vào kho.
- **Hỏi xác nhận** khi có bản tra mới: "Đưa N bản tra vào diễn biến?" kèm tên nhóm bị ảnh hưởng; tick
  "Từ nay tự động" để khỏi hỏi lại (đổi lại trong *Nhóm & kho*).
- **Nhóm theo dõi** = danh sách MST cố định (thêm / bớt bất cứ lúc nào, dán MST hàng loạt, hoặc bấm
  *Lưu nhóm theo dõi* ngay ở chế độ Nhóm KH). Tra CIC công ty trong nhóm → diễn biến nhóm tự cập nhật.
- **Màn hình Diễn biến**: chọn nhóm / công ty / tất cả; mốc **theo tháng** (đại diện = bản tra mới nhất
  trong tháng) hoặc **theo lần tra**; khoảng *Từ – Đến* + nút nhanh 3T/6T/12T/24T; chỉ tiêu Tổng dư nợ /
  Nợ vay / Ngoại bảng / Trái phiếu; ẩn tạm từng thành viên bằng chip.
  - Biểu đồ cột chồng theo **TCTD** (Big4 đánh ★, Top N + Khác) / theo **công ty** / theo **cơ cấu kỳ hạn**,
    đường tổng; bấm cột → bảng chi tiết kỳ (TCTD, Δ so kỳ trước, tỷ trọng, nguồn số liệu, mở lại đúng báo cáo).
  - Bảng **TCTD × kỳ**, **Công ty × kỳ** (Δ từng kỳ, Δ đầu→cuối, tỷ trọng, sparkline; nhãn BIG4 / "lớn" ≥10%).
  - **TSBĐ theo thời gian**: theo loại tài sản, theo TCTD nhận bảo đảm, tỷ lệ TSBĐ/nợ vay, và bảng
    **biến động** (tài sản mới / không còn / đổi định giá) giữa kỳ đầu và kỳ cuối có R20.
  - **Nhận định tự động**: tăng/giảm, TCTD tăng–giảm mạnh, TCTD mới/rút, mức tập trung & Big4, cơ cấu kỳ hạn,
    TSBĐ, nhóm nợ, công ty biến động, độ phủ dữ liệu.
- **Tháng không có bản tra**: mặc định lấy *nợ vay* từ bảng "12 tháng" in trên báo cáo CIC gần nhất (chính xác
  nhưng không có chi tiết TCTD → hiện thành cột xám nhạt "Không rõ TCTD"); hoặc kéo bản tra gần nhất; hoặc bỏ trống.
  Ngoại bảng / TP / TSBĐ chỉ được kéo từ bản tra **trước** kỳ đó, không lấy của tương lai.
- **Xuất Excel theo khoảng thời gian** (Từ tháng – Đến tháng, theo tháng / lần tra): Tổng hợp, TCTD × kỳ,
  Công ty × kỳ, TSBĐ × kỳ, Biến động TSBĐ, Nhận định, Nguồn dữ liệu. PNG biểu đồ, In PDF.
- **Tệp dữ liệu (Quản lý dữ liệu) nâng lên `_ver: 2`**: kèm `cic.snapshots` (mọi bản tra theo ngày) và
  `cic.groups` (nhóm theo dõi). Tệp bản 1 vẫn nhập được (mỗi KH thành 1 bản tra theo ngày tra cứu).

## Lưu ý dữ liệu
Dữ liệu CIC là dữ liệu khách hàng — **không commit** tệp JSON xuất ra vào repo này (repo công khai).
File mẫu để thử được gửi riêng ngoài repo.
