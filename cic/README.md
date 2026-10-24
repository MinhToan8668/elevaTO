# AI CIC Analyzer v5.3 — Diễn biến tín dụng theo thời gian

File chạy độc lập: `cic/AI_CIC_Analyzer_v5.3.html` (mở trực tiếp trong trình duyệt, không cần server).
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

## v5.1 — quy ước chọn số liệu, in ấn, đồng bộ nhiều máy

### Quy ước chọn số liệu (tool tự áp dụng)
1. **Kỳ = tháng của ngày số liệu**, không phải ngày tra. Ngày số liệu là "Ngày báo cáo" TCTD gửi CIC, in trên S10A.
   Dư nợ vay thường trễ 1–2 tuần so với ngày tra; ngoại bảng chốt cuối tháng (tra đầu tháng có thể còn số của 2 tháng trước).
   Bản tra thuộc tháng chiếm phần lớn dư nợ vay (gia quyền theo số dư). Có tuỳ chọn xếp theo ngày tra.
2. Nhiều bản tra trong cùng tháng → bản có ngày số liệu muộn nhất là đại diện. Các bản khác vẫn giữ, xem ở "Theo lần tra".
3. Công ty không được tra trong tháng → nợ vay theo bảng 12 tháng của CIC; không có thì kéo bản trước đó tối đa N tháng
   (mặc định 3, chỉnh được); quá hạn thì để trống.
4. Mỗi ô ghi loại số và ngày số liệu. Mọi kỳ hiện độ phủ "x/y công ty". Nhận định có thêm phép so sánh **cùng tập công ty**
   để không nhầm tăng/giảm do thay đổi số công ty có dữ liệu.

### Quy trình gợi ý cho nhân viên
Mỗi nhóm một người phụ trách · tra cả nhóm trong một đợt, một ngày cố định mỗi tháng (gợi ý 10–15) · luôn kèm R20 ·
trước đợt mở tab **Lịch tra › Cần tra kỳ này › Copy MST** để giao việc · đồng nghiệp tra hộ dùng chung thư mục đồng bộ.

### Giao diện
- Bảng ma trận: cột tên, xu hướng, Δ, tỷ trọng **cố định bên trái**; các kỳ cuộn ngang, mặc định mở ở kỳ mới nhất.
- Biểu đồ khung cố định (6/12/24/Tất cả kỳ), kéo chuột / thanh trượt / ◀ ▶ để xem kỳ khác; trục Y tự co giãn theo khung.
- Tab **Lịch tra**: lưới công ty × kỳ, mỗi ô ghi ngày tra → ngày số liệu, in đậm bản đại diện; độ lệch ngày số liệu trong kỳ;
  danh sách công ty chưa tra kèm nút copy.
- **In PDF**: khổ A4 ngang, mỗi tab một trang, ma trận tự chia thành nhiều khối kỳ vừa trang (cột xu hướng/Δ lặp lại ở mỗi khối),
  biểu đồ hiện đủ mọi kỳ.

### Xuất theo nhóm
Quản lý dữ liệu › Xuất dữ liệu › **Xuất theo nhóm theo dõi**, hoặc Nhóm & kho › sửa nhóm › **Xuất tệp nhóm**:
một tệp gồm danh sách MST của nhóm và mọi bản tra theo ngày trong khoảng từ tháng – đến tháng.

### Đồng bộ nhiều máy qua thư mục chung
Nhóm & kho › **Thư mục chung**. Mọi người chọn cùng một thư mục nội bộ do ngân hàng quản lý (ổ mạng phòng, hoặc thư mục
SharePoint/OneDrive của đơn vị đã đồng bộ về máy). Cần Chrome hoặc Edge (File System Access API).
- Mỗi bản tra mới tự ghi thành `snap/<MST>/<MST>_<ngày>_<người tra>.json`; nhóm theo dõi ở `groups/<id>.json`.
  Tệp tách theo người tra nên không ghi đè lẫn nhau. Máy khác tự nhận khi mở tool, mỗi 5 phút, hoặc bấm "Đồng bộ ngay".
- Tuỳ chọn mã hoá AES-256-GCM, khoá dẫn xuất PBKDF2 (250.000 vòng) từ mật khẩu nhóm. Tool không lưu mật khẩu.
- Mặc định chỉ gửi công ty thuộc nhóm theo dõi. Không có máy chủ, tool không gửi dữ liệu khách hàng ra mạng.
- Cần IT / Quản trị rủi ro xác nhận thư mục nào được phép chứa dữ liệu CIC và ai được cấp quyền.

## v5.2 — Xuất form nội bộ Dư nợ & TSBĐ theo công ty trong tập đoàn
Diễn biến › **Form nội bộ** (hoặc Nhóm & kho › sửa nhóm › Xuất form nội bộ).
- Hai sheet theo format nội bộ: **Deb Inventory (F)** (mỗi kỳ STL / MLT / Khác / Off Bal. / Bonds / Total exposure, cột
  Credit limit) và **Collateral Inventory (F)** (KPT / HTK / MMTB / GTCG / BĐS / QTS / PTVT / CP / Bảo lãnh / Total), cùng thứ
  tự dòng: nhóm con › công ty › từng TCTD. Đơn vị tỷ đồng. Dòng Total / Grand total là **công thức** (đã kèm sẵn kết quả).
- **Khung form**: nạp form cũ (.xlsx) một lần → tool đọc nhóm con, thứ tự công ty, thứ tự ngân hàng, hạn mức; khớp tên công
  ty với MST (bỏ dấu, mở rộng viết tắt SX/TM/DV/MTV/GNVC…; chọn tay được nếu sai) và khớp nhãn ngân hàng ("VP Bank", "ABB",
  "Siam Comercial"…). Khung lưu vào nhóm theo dõi (đồng bộ qua thư mục chung). Không có khung thì tự dựng theo cột "Nhóm con".
- Chọn nhiều kỳ dư nợ (mỗi kỳ một khối cột) và một kỳ TSBĐ. Công ty không tra trong kỳ: kéo bản gần nhất (tối đa N tháng) hoặc để trống.
- Cột **Remark**: nguồn số từng kỳ của mỗi công ty (ngày tra · ngày số liệu · kéo bản cũ), "TCTD mới so với form",
  "Không có số trên CIC ở các kỳ đã chọn", nhóm nợ ≥2, trái phiếu ("Bond ACB: 1,500"), TSBĐ của bên thứ ba.
- Công ty trong nhóm nhưng chưa có trong form → thêm ở nhóm con "Khác" cuối file. Credit limit lấy từ ô HMTD trong tool.
- Kèm sheet **TSBĐ chi tiết** (từng tài sản, mã loại R20 → cột form) và **Ghi chú & nguồn**.
- Quy đổi loại TSBĐ R20: 01 → BĐS · 02 → PTVT · 03, 04, 06–11 → GTCG · 05 → CP · 12–14 → MMTB · 15–17 → HTK ·
  21 (quyền đòi nợ) → KPT · còn lại → QTS. "Bảo lãnh" không có trên R20, để nhập tay.

## v5.3 — So sánh cân bằng, Quay lại/Tiến tới, đèn đánh giá xanh/vàng/đỏ
- **So sánh các kỳ**: "Giữ nguyên tất cả công ty" hoặc "Cân bằng: chỉ công ty có bản tra thật ở mọi kỳ đang xem".
  Ở chế độ cân bằng, tổng, biểu đồ và Δ so cùng một tập công ty; danh sách công ty bị ẩn và kỳ còn thiếu hiện ngay đầu trang.
  Không công ty nào đủ thì tool gợi ý thu hẹp số kỳ.
- **◀ Quay lại / Tiến tới ▶** (Alt + ← / →) giữa các màn xem: nhóm → công ty → về nhóm, kèm đường dẫn nhóm › công ty.
- **Đèn đánh giá** ở đầu Tổng quan và tab **Đánh giá rủi ro**: mỗi cảnh báo ghi đích danh công ty · TCTD · kỳ, bấm để tới đúng chỗ;
  chấm màu cạnh tên công ty ở chip và bảng.
  - Đỏ (công ty): nợ nhóm 3–5 / lịch sử nợ xấu; dư nợ tăng ≥60%; TSBĐ giảm ≥60% khi nợ vay không giảm.
  - Vàng: nợ nhóm 2 / nợ cần chú ý 12 tháng / chậm trả thẻ; dư nợ tăng ≥30% hoặc giảm ≥50%; thêm ≥3 TCTD; dư nợ tại một TCTD
    tăng gấp đôi; tỷ trọng ngắn hạn tăng ≥20 điểm; ngoại bảng tăng ≥50%; TSBĐ < 30% nợ vay; ≥10 TCTD; ≥5 TCTD **chưa cho vay
    công ty nào trong nhóm** tra cứu CIC trong 30 ngày; số liệu cũ ≥2 tháng.
  - Cả nhóm: đỏ khi có công ty nợ xấu (rủi ro lây chéo) hoặc công ty đỏ chiếm ≥5% dư nợ nhóm; vàng khi có công ty vàng, dư nợ nhóm
    (cùng tập công ty) tăng ≥30%, một TCTD chiếm ≥40% dư nợ nhóm, hoặc kỳ cuối chưa tra đủ công ty.
  - Mọi ngưỡng chỉnh được trong tab Đánh giá rủi ro › Chỉnh ngưỡng. Thay đổi dưới 1 tỷ không tính.

## Lưu ý dữ liệu
Dữ liệu CIC là dữ liệu khách hàng — **không commit** tệp JSON xuất ra vào repo này (repo công khai).
File mẫu để thử được gửi riêng ngoài repo.
