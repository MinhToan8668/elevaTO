# AI CIC Analyzer v7.0 — Diễn biến tín dụng theo thời gian

File chạy độc lập: `cic/AI_CIC_Analyzer_v7.0.html` (mở trực tiếp trong trình duyệt, không cần server).
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

## v5.4 — Sửa lỗi ghép nhầm dữ liệu giữa các công ty
**Lỗi (có từ bản 4.1):** ở chế độ 1 KH, dán chỉ một báo cáo thì báo cáo kia của khách hàng TRƯỚC vẫn giữ trong bộ nhớ →
hồ sơ lưu S10A của công ty B kèm R20 của công ty A. Từ bản 5.0 cặp này được ghi vào kho diễn biến nên TSBĐ của A bị cộng vào B.
Trên tệp xuất của người dùng: 39 hồ sơ mang R20 của công ty khác (37 hồ sơ cùng mang R20 của một công ty); TSBĐ nhóm BAF
hiện 52.886 tỷ trong khi đúng là 1.879 tỷ. Nhóm THACO không bị ảnh hưởng.
- Chặn tại chỗ dán: dán một báo cáo của khách hàng khác thì báo cáo còn lại của khách trước tự bỏ; dán cả hai mà khác khách hàng thì báo lỗi, không xử lý.
- Chặn ở mọi đường ghi vào kho (dán 1 KH, Nhóm KH, Theo kỳ, nhập tệp, đồng bộ thư mục chung).
- Tự dọn khi mở tool: kho diễn biến, Lịch sử, mục tra nhanh theo MST, phiên đang mở; nhập tệp thì bỏ R20 ghép nhầm và báo danh sách.
- Bản tra chỉ có R20 (không S10A) không còn được chọn làm số dư nợ đại diện kỳ (trước đây làm dư nợ kỳ đó về 0); được gắn vào
  bản S10A cùng MST gần nhất (≤45 ngày).
- Kỳ có S10A nhưng không tra kèm R20: TSBĐ lấy theo R20 gần nhất trước đó của chính công ty (tối đa N tháng), ghi rõ ngày R20.
- Form nội bộ: một MST không thể gán vào hai dòng công ty. Phạm vi "Tất cả KH trong kho" có cảnh báo đang cộng dồn KH không liên quan.

## v5.5 — Sửa lỗi đọc nhóm nợ trên S10A
**Lỗi (có từ bản 4.1)**, tái hiện bằng báo cáo mẫu — bản cũ gán nhóm 2 cho cả 3 TCTD, đúng ra chỉ 1:
1. Dòng "Nợ cần chú ý" (hoặc dưới tiêu chuẩn / nghi ngờ / mất vốn) có **số tiền 0** vẫn gán nhóm nợ cho TCTD.
2. Vùng "Chi tiết nợ vay" không đóng khi báo cáo thiếu dòng kết thúc → đọc lấn sang mục "2.9 Nợ cần chú ý trong 12 tháng"
   và gán nhóm 2 cho TCTD cuối cùng.
3. Dòng ngoại bảng / trái phiếu thiếu cột thì đọc nhầm ngày báo cáo thành nhóm nợ.

Bản sửa: nhóm nợ chỉ gán khi dòng nhóm đó có số tiền > 0 (lưu cả số tiền theo nhóm); vùng nợ vay đóng khi sang mục khác;
nhóm nợ không hợp lệ quy về nhóm 1. (Từ 6.0, bản tra đã lưu trước đó được đối chiếu tự động với mục 2.9 / 2.7 của chính báo cáo.)
Mỗi cảnh báo nhóm nợ ghi ngày tra, ngày số liệu, số tiền ở nhóm đó. Tiêu đề mỗi kỳ ghi khoảng ngày số liệu và ngày tra.

## v6.0 — 4 tab dùng chung một nguồn dữ liệu, rà soát lại số dư nợ & TSBĐ
**Số liệu** (rà trên 142 khách hàng / 2.703 tài sản bảo đảm):
- **TSBĐ đã giải chấp vẫn bị cộng**: 11 tài sản có ngày giải chấp ≤ ngày tra R20 (vd. một KH có 9 tài sản tại một ngân hàng giải chấp
  10/09/2026, tra R20 05/10/2026). Nay tách sang danh sách "đã giải chấp", không cộng vào TSBĐ ở mọi tab, form và file xuất;
  tab TSBĐ của 1 KH liệt kê riêng để đối chiếu. Dữ liệu đã lưu được tự chuẩn hoá khi mở tool.
- ~~Nhóm nợ của bản tra đã lưu trước 5.5: nhóm 2 không có trong mục 2.9 → về nhóm 1.~~ **Sai, đã bỏ ở 6.2** (xem dưới).
- **Số thập phân kiểu VN** ("1.234,5") trước đây bị đọc thành 12345; nay đọc đúng 1234,5.
- **Tra theo MST** ưu tiên khớp đúng MST; chỉ khi không có mới khớp MST mẹ/chi nhánh (trước đây có thể lấy nhầm số của chi nhánh).
- **Kỳ lấy theo bảng 12 tháng của CIC** dùng dư nợ vay (không gồm thẻ) cho khớp với bản tra thật.
- **Tỷ giá** quy đổi ngoại tệ hiện trên thanh liên kết mọi tab, sửa được (nút 💱), áp cho mọi tab và file xuất.
- R20: lưu "Hình thức đảm bảo" (bảo lãnh hiện là "Bảo lãnh" thay vì N/A); KPI TSBĐ ở Diễn biến ghi số tài sản chưa có giá trị.

**Liên kết 4 tab**
- Mọi lần tra (1 KH, Nhóm KH, Theo kỳ, nhập tệp) tự vào kho — một nguồn dữ liệu cho cả 4 tab.
- Mỗi tab có thanh liên kết: 1 KH (các ngày tra trong kho, sang Diễn biến / Theo thời kỳ / nhóm theo dõi), Nhóm KH (chọn nhóm theo dõi +
  kỳ → **dựng nhóm từ kho** không cần dán lại), Theo thời kỳ (dựng lại từ đủ mọi bản tra trong kho), Diễn biến (mở 1 KH, Theo thời kỳ,
  phân tích Nhóm KH tại kỳ đang chọn).
- Đổi tab giữ khách hàng / nhóm đang xem.
- Nút **Dữ liệu** chung ở mọi tab: khách hàng & bản tra · nhóm theo dõi · thư mục chung · Lịch sử · Xuất/Nhập.
- **Xoá dữ liệu KH** xoá đồng bộ: kho diễn biến, hồ sơ 1 KH / Theo kỳ trong Lịch sử, gỡ khỏi hồ sơ Nhóm KH, mục tra nhanh, màn hình đang mở.
- Bỏ các thông báo kiểu "tool cũ".

**Giới hạn còn lại**: tool không lưu nguyên văn báo cáo, nên bản tra đã lưu chỉ sửa được bằng thông tin có sẵn trong chính bản đó;
719 tài sản không có giá trị trên R20 (CIC không ghi) không ước tính được.

## v6.1 — Nhóm KH hiện nhóm nợ đã chuẩn hoá ngay khi mở tool
Lỗi ở 6.0: bản tra đọc bằng bản trước 5.5 được chuẩn hoá nhóm nợ trong kho (Diễn biến đúng), nhưng phiên Nhóm KH / Theo kỳ /
1 KH khôi phục từ lần mở trước vẫn dùng bảng gộp cũ → Nhóm KH còn báo nhóm 2 trong khi Diễn biến không có. Nay sau khi chuẩn hoá,
tool tính lại và vẽ lại cả 3 màn, lưu lại cả 3 phiên; hồ sơ trong Lịch sử có bảng gộp lệch cũng được tính lại.

## v6.2 — Hoàn lại nhóm nợ bị hạ nhầm, Nhóm KH ghi rõ kỳ đang mở
**Lỗi do bản 6.0**: quy tắc "nhóm 2 phải có trong mục 2.9" hạ nhầm nợ nhóm 2 THẬT về nhóm 1. Ví dụ báo cáo ghi
"Dư nợ cần chú ý 890,741" tại một TCTD nhưng mục 2.9 trống. Nhóm KH (đọc lại báo cáo) báo N2, còn Diễn biến (kho đã bị hạ) không báo.
- Bỏ hẳn việc tự đổi nhóm nợ. Các dòng đã bị hạ (có dấu `_gFix`) tự hoàn lại nhóm 2 khi mở tool.
- Bản tra lưu khi tool chưa ghi số tiền theo nhóm: giữ đúng nhóm đã đọc, ghi "cần xác nhận số tiền trên báo cáo gốc". Mức cảnh báo không bị hạ.
- Thanh liên kết Nhóm KH ghi rõ **Đang mở: N công ty · ngày tra · ngày số liệu → kỳ** theo cùng quy ước Diễn biến.
  Ô chọn nhóm/kỳ chuyển sang mục "Mở kỳ khác từ kho", mặc định là nhóm khớp danh sách đang mở và kỳ của dữ liệu đang mở.
- Sang Diễn biến từ Nhóm KH thì chọn sẵn kỳ của dữ liệu đang mở.
- Câu "Có dư nợ nhóm ≥2 trong nhóm kỳ …" ghi tên công ty và nguồn (bản tra thật / kéo từ bản tra ngày …).

## v6.3 — Dán lại báo cáo thì kho Diễn biến nhận bản đọc mới
**Lỗi (có từ 5.0)**: kho giữ một bản cho mỗi MST + ngày tra; dán lại ĐÚNG báo cáo đó (cùng giờ tra) thì kho giữ bản đọc cũ, bỏ bản vừa dán.
Nên sau khi sửa bộ đọc, dán lại S10A chỉ sửa được Nhóm KH / 1 KH, còn Diễn biến vẫn dùng số đọc cũ (vd. nhóm 2 đã bị hạ nhầm).
Nay cùng một báo cáo thì bản đọc mới (có số tiền theo nhóm) luôn thay bản đọc cũ — áp cho dán tay, nhập tệp và thư mục chung.
Kiểm tra đầu-cuối: kho có bản 24/08 bị hạ nhầm về N1 (cả khi mất dấu hoàn lại) → dán lại S10A có ngắt trang giữa TCTD →
Nhóm KH, 1 KH và Diễn biến kỳ 08/2026 đều N2, số tiền nhóm 2 = 890.741.

## v6.4 — Tự đối soát số liệu ở mọi phạm vi, một định nghĩa nhóm nợ
**Nhóm nợ hiện tại** = nhóm cao nhất của nợ vay, ngoại bảng, trái phiếu tại ngày số liệu báo cáo — dùng chung cho 1 KH, Nhóm KH,
Theo kỳ, Diễn biến. Trước đây Nhóm KH gộp cả lịch sử nợ xấu 5 năm (mục 2.7) và bỏ qua nhóm của ngoại bảng / trái phiếu, 1 KH bỏ qua
ngoại bảng / trái phiếu. Lịch sử nợ xấu 5 năm vẫn báo riêng.

**Đối soát tự động** (chạy mỗi lần xem, cho mọi nhóm / công ty / lần tra):
- Diễn biến: mỗi ô (công ty × kỳ) được tính lại độc lập từ chính bản tra nguồn — nợ vay, ngoại bảng, trái phiếu, nhóm nợ; tổng kỳ =
  Σ công ty; Σ theo TCTD + "không rõ TCTD" = nợ vay kỳ. Khung xanh "✓ Đối soát số liệu: N ô khớp" hoặc khung đỏ liệt kê từng chỗ lệch.
- Mỗi bản tra: ngắn + trung + dài + khác = dòng "Tổng cộng dư nợ" từng TCTD; Σ TCTD = dòng "Tổng cộng các TCTD"; có số tiền nhóm ≥2 thì
  nhóm nợ phải khớp; nhóm ≥2 chưa có số tiền theo nhóm thì ghi "cần xác nhận".
- Nhóm KH / 1 KH: số đang mở so với kho Diễn biến cùng MST + ngày tra; huy hiệu "✓ số liệu khớp kho" hoặc "⚠ N chỗ lệch".

Đối soát ngoài (bộ tính viết riêng, không dùng hàm tính của tool) trên dữ liệu thật: 0 chỗ lệch ở mọi ô, cả hai chế độ lấp tháng.

## v6.5 — TSBĐ dùng chung trong nhóm: loại trùng & mức bảo đảm theo cụm
**Vấn đề**: một tài sản bảo đảm cho khoản vay của nhiều công ty trong nhóm thì nằm trên R20 của từng công ty đó. Cộng thẳng R20 các công ty
thì tài sản đó bị tính nhiều lần (Nhóm ABC kỳ 10/2026: 666 dòng tài sản nhưng chỉ 326 tài sản khác nhau, 60 tài sản dùng cho ≥2 công ty —
TSBĐ nhóm bị cộng trùng 22.167 tỷ, 18%).

**Loại trùng** — TSBĐ cấp nhóm (KPI Nhóm KH, Diễn biến: KPI, bảng theo loại / theo TCTD, tỷ lệ TSBĐ/nợ vay, Excel) tính mỗi tài sản một lần:
khoá = mã tài sản CIC (thiếu mã → mô tả + chủ sở hữu); giá trị lấy theo báo cáo có ngày cập nhật mới nhất (báo cáo khác ngày có thể định giá
khác nhau — ghi rõ). TSBĐ theo từng công ty giữ nguyên như R20 của công ty đó.

**Cụm bảo đảm** — tài sản thế chấp tại TCTD X bảo đảm cho dư nợ tại X của các công ty có tài sản đó trên R20. Nối tài sản ↔ (công ty, TCTD);
mỗi thành phần liên thông là một cụm. Mức bảo đảm = Σ giá trị tài sản của cụm (không trùng) / Σ (vay + ngoại bảng) tại TCTD đó của mọi công ty
trong cụm. Đỏ < 100%, vàng < 130%, xanh ≥ 130%; cụm chỉ có tài sản chưa định giá ghi "Chưa định giá". Gộp thận trọng vì CIC không cho biết
tài sản phân bổ cho hợp đồng nào; dư nợ cụm gồm cả phần tín chấp tại TCTD đó. Hiện ở Nhóm KH (dưới KPI), Diễn biến › Tài sản bảo đảm (theo kỳ
đang chọn), đánh giá rủi ro nhóm, sheet "TSBD dung chung" trong file Excel Diễn biến và form nội bộ.

Kiểm tra: bộ tính viết riêng bằng Python trên đúng các bản tra tool dùng — 4 kỳ, 261 cụm: TSBĐ cộng thẳng, TSBĐ không trùng, giá trị /
dư nợ / số tài sản / số công ty từng cụm đều khớp.

## v6.6 — Nhóm nợ chỉ theo bản tra thật, bản tra luôn vào kho
**Lỗi**: tháng không có bản tra thật thì tool kéo bản trước (≤ N tháng) — kéo cả NHÓM NỢ. Vd. kho chỉ có bản 24/08 (SCB nhóm 2) của một
công ty, chưa có bản tháng 9–10 → kỳ 09, 10 vẫn báo nhóm 2 dù báo cáo thực tế tháng 9–10 là nhóm 1.
- Ô không có bản tra thật (kéo / CIC 12 tháng): không gán nhóm nợ; nhóm nợ của bản trước chỉ ghi ở chú thích. Nhóm nợ xấu nhất của kỳ,
  nhóm nợ theo TCTD và cảnh báo nhóm nợ chỉ tính từ bản tra thật. Cảnh báo công ty ghi "Bản tra gần nhất dd/mm … ghi nợ nhóm 2 — cần
  tra CIC kỳ … để xác nhận".
- Đánh giá nhóm nêu đích danh công ty chưa có bản tra ở kỳ cuối và ngày bản gần nhất.
- Bảng Công ty × kỳ: cột Nhóm nợ = nhóm của bản tra thật mới nhất (kèm "từng N2 kỳ …" nếu trong khoảng có nhóm cao hơn).
- **Lỗi bước chạy thử trước khi ghi kho**: dán lại cùng báo cáo bị coi là "không mới" nên bản đọc mới không vào kho (sửa ở 6.3 chỉ chạy qua
  một số đường). Nay dùng cùng quy tắc với bước ghi; thêm công ty vào Nhóm KH / dán 1 KH / dán Theo kỳ là ghi kho ngay.

## v7.0 — Chỉ dùng bản tra thật, không suy diễn
Quy tắc mới: **bản tra của công ty tới đâu tính tới đó, của tháng nào là của tháng đó**. Tool không tự lấp số:
- Diễn biến: tháng không có bản tra → để trống. Bỏ "kéo bản tháng trước" và "nợ vay theo bảng CIC 12 tháng" (2 ô chọn này ẩn đi).
- TSBĐ: chỉ R20 của chính lần tra, hoặc R20 tra riêng **cùng kỳ** của chính công ty; không mượn R20 tháng khác.
- Nhóm KH dựng từ kho: chỉ bản tra đúng kỳ; công ty thiếu được liệt kê (kèm ngày tra và kỳ số liệu của bản gần nhất), không tính vào số nhóm.
- Form nội bộ: công ty không tra trong kỳ để trống.
- Tổng của kỳ = Σ công ty có bản tra trong kỳ. So sánh giữa 2 kỳ (KPI Tổng dư nợ, TSBĐ) chỉ trên công ty có bản tra ở cả 2 kỳ, ghi "cùng N/M cty";
  số TCTD / tỷ trọng Big4 không so khi độ phủ khác. Tỷ trọng công ty tính trên Σ dư nợ theo bản tra mới nhất của từng công ty.
- Tổng quan có khung **Còn thiếu bản tra** theo kỳ (công ty nào, kỳ nào) để tra bổ sung.

**Ẩn / hiện thông báo** ở Tổng quan (đèn đánh giá, còn thiếu bản tra, đối soát số liệu, bản tra cần xác nhận): nút "Ẩn" thu khung
còn một dòng icon + tiêu đề + số tóm tắt; "Hiện" để mở lại. Tool nhớ lựa chọn.

## Lưu ý dữ liệu
Dữ liệu CIC là dữ liệu khách hàng — **không commit** tệp JSON xuất ra vào repo này (repo công khai).
File mẫu để thử được gửi riêng ngoài repo.
