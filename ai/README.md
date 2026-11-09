# elevaTO AI BCTC — trích xuất BCTC mẫu 2026 cho model forecast

Công cụ **riêng** (không dính landing page, không dính công cụ upload): tải BCTC lên → xem từng trang, tick
trang cần lấy → AI tự nhận trang thuộc báo cáo nào và đọc số → rà soát, xem biểu đồ & chỉ số, đọc phân tích
& đề xuất → xuất **Form chuẩn hóa 2026** (.xlsx) hoặc điền thẳng vào **model elevaTO**
(chỉ học viên / giảng viên).

Trang: `https://minhtoan8668.github.io/elevaTO/ai/` · giao diện **tiếng Việt / English**.

## Làm được gì

| Đầu vào | Cách đọc |
|---|---|
| PDF bản điện tử (có chữ) | Máy tự gợi ý trang CĐKT / KQKD / LCTT / thuyết minh; bạn tick lại tuỳ ý |
| PDF scan (kể cả fax CCITT đen trắng) | Gửi thẳng trang PDF cho AI đọc; đọc không ra số thì tự gửi lại bằng ảnh |
| Ảnh chụp từng trang | Gửi ảnh JPEG 1800px |
| Excel BCTC (có cột "Mã số"), file FinLens (sheet "Lưu trữ") | Đọc thẳng, **không tốn lượt AI** |

- **Chọn trang như FinLens**: mỗi file hiện lưới ảnh thu nhỏ các trang. Bấm ảnh để xem trang lớn (phóng to,
  ← / → chuyển trang, Space để tick). Tick ô góc trang để chọn, Shift + tick chọn cả dãy; nút "Chọn gợi ý",
  "Chọn tất cả", "Bỏ chọn". Chỉ những trang đã tick được gửi cho AI — trang máy chưa nhận ra thì AI tự xem
  trang đó thuộc CĐKT, KQKD, LCTT hay thuyết minh.
- **Trang in ngang tự xoay cho đứng**: báo cáo bộ phận và bảng biến động vốn chủ thường in ngang nhưng đóng
  cùng chiều với trang dọc, nên ảnh gửi AI bị nằm ngang và đọc sai số. Lượt nhận trang hỏi luôn chiều của
  từng trang và xoay cả ảnh nhỏ, trang xem lớn lẫn trang gửi AI; còn lệch thì bấm nút ⟳ ở góc trên khi xem
  trang lớn (0° → 90° → 180° → 270°).
- **Thuyết minh của một năm đủ dùng cho hai năm**: bảng thuyết minh năm sau gần như luôn in kèm số năm trước
  (TSCĐ: cột "số đầu năm"; báo cáo bộ phận và bảng biến động vốn chủ: khối "Năm trước"), nên chỉ cần trích
  thuyết minh của năm mới nhất là năm liền trước cũng có số thật thay vì số ước tính.
- **Theo mẫu Thông tư 99/2025/TT-BTC** (áp dụng từ 01/01/2026). BCTC có **ngày kết thúc kỳ từ năm 2025 trở về
  trước** luôn được hiểu là mẫu cũ TT200 và tự quy đổi mã sang mẫu mới (tổng tài sản 270 → 280, doanh thu tài
  chính 21 → 22, …), nên nhập chung một mẫu với BCTC 2026.
- **Đo trên BCTC thật** (hợp nhất đã kiểm toán, bản scan CCITT, 64 trang): ba báo cáo chính xong trong
  **12 giây / 3 lượt AI**, ra 68 + 23 + 31 chỉ tiêu, bộ kiểm tra cộng dồn **khớp hết** (tổng tài sản = nợ + vốn chủ;
  60 = 50 − 51 − 52). Ba trang CĐKT gửi đi chỉ nặng 112 KB vì gửi PDF chứ không gửi ảnh.
  Mọi thay đổi về cách gọi AI đều đo lại trên chính file này trước khi chốt.
- **AI chỉ chép số**, không tự tính. Đổi đơn vị (đồng / nghìn / triệu), dấu âm, quy đổi mã và
  **kiểm tra cộng dồn** do máy làm: tổng tài sản = nguồn vốn, tiền cuối kỳ LCTT = tiền trên CĐKT, LNTT
  trên LCTT = trên KQKD, từng dòng tổng = cộng các dòng con. Ô lệch tô đỏ, bấm vào ô để sửa.
- **Máy tự hiểu quy ước trình bày của từng công ty** (logic lấy từ bản nâng cấp AI FinLens v3.2): AI chép đúng dấu
  như in, còn quy ước thì máy suy bằng cộng dồn — KQKD in chi phí trong ngoặc hay in dương quyết bằng
  "doanh thu thuần − giá vốn = lãi gộp"; thuế TNDN in ngược dấu thử cả hai chiều với "LNTT − thuế = LNST";
  dự phòng / hao mòn in dương quy về âm; dòng tiền chi của LCTT in dương mà khối không cộng ra tổng thì
  đổi âm đúng dòng. **Tên gọi khác mẫu nhưng cùng bản chất** ("Phải thu khách hàng", "Giá vốn dịch vụ cung
  cấp", "Lỗ khác", "Tiền thu từ đi vay"…) có bảng đồng nghĩa hơn 150 tên và bộ đồng nhất viết tắt (TSCĐ,
  BĐSĐT, HĐKD…). **Mã in lệch mẫu** (ví dụ BCTC THILOGI 2024 in "Tài sản cố định vô hình" ở mã 221, "hữu
  hình" ở 227) được xếp lại theo tên, kéo theo cả dòng nguyên giá / hao mòn; dòng tổng không bao giờ bị
  đổi mã. BCTC dịch vụ không in dòng 01 thì doanh thu bán hàng lấy bằng doanh thu thuần + giảm trừ. Mọi
  chỗ máy tự đổi dấu / đổi mã / suy số đều ghi thành cảnh báo ở bước rà soát để người dùng soát lại.
- **Nhiều file, nhiều kỳ**: mỗi BCTC có sẵn cột kỳ trước. Nên tải BCTC năm gần nhất + các năm trước
  (model cần ≥ 4 năm), thêm báo cáo quý mới nhất nếu có. Hai báo cáo cùng kỳ khác số → dùng số của báo cáo
  mới hơn (đã điều chỉnh hồi tố) và liệt kê chỗ khác nhau.
- **Tự kiểm chứng số trích được bằng công thức của mẫu biểu** (`reconcileByFormula` ở `js/core/statements.js`,
  `lechCongThuc` ở `js/core/pipeline.js`):
  1. Dòng lạc bảng (AI chép lẫn dòng LCTT "Lưu chuyển tiền thuần…", "Tiền… đầu năm" vào KQKD vì mã 40 / 50 / 60 trùng)
     bị loại theo tên, câu lệnh cũng dặn chỉ chép dòng của đúng bảng.
  2. Sau quy ước dấu chung, mỗi dòng tổng có số in (60 = 50 − 51 − 52, 40 = 31 − 32, 50 = 20 + 30 + 40 của LCTT…)
     mà không khớp thì thử đổi dấu 1–2 dòng con; chỉ sửa khi có ĐÚNG MỘT cách khớp số in, và ghi rõ đã đổi dòng nào
     (ví dụ VNM 2025: "Lợi ích thuế TNDN hoãn lại (20.970.420.316)" là khoản giảm chi phí thuế).
  3. Vẫn còn dòng tổng lệch → AI đọc lại bảng đó một lần, câu lệnh liệt kê đúng dòng / cột lệch bao nhiêu; lần nào
     ít chỗ lệch hơn thì giữ. Còn lệch thì ô đỏ + lưu ý để người dùng soát. Kiểm bằng số thật VNM ở `tests/selfcheck.test.js`.
- **Bảng bị cắt cuối thì đọc kèm trang sau**: đọc xong mà thiếu dòng chốt (CĐKT 440, KQKD 60, LCTT 70) — thường do
  phần cuối bảng (ví dụ khối hoạt động tài chính của LCTT) nằm ở trang kế tiếp chưa được gửi — máy đọc lại một
  lần kèm trang ngay sau trang cuối; vẫn thiếu thì báo trong "lưu ý khi đọc".
- **Kỳ của từng cột theo tiêu đề cột** (KQKD, LCTT): AI ghi khoảng ngày thật của mỗi cột số (`tu_ngay_v`…`den_ngay_p`),
  máy xếp số vào đúng kỳ theo hai ngày đó thay vì mặc định "cột thứ hai là cùng kỳ năm trước". Báo cáo quý in
  "Quý III / Quý II" cùng năm → số vào Q3 và Q2 năm nay, không còn báo lệch LNTT giữa LCTT và KQKD. Sửa tay
  ngày / số tháng của file ở *Nguồn dữ liệu* thì máy bỏ kỳ theo tiêu đề cột, dùng kỳ bạn nhập.
- **File không mất khi tải lại trang**: PDF / ảnh đang mở và các trang đã tick được giữ trong IndexedDB của trình
  duyệt (chỉ trên máy, không gửi đi), nên tab bị trình duyệt cho ngủ rồi tải lại vẫn còn nguyên. "Bỏ" / "Xoá hết"
  là xoá luôn.
- **Góp ý chỗ đọc chưa đúng** (*Nguồn dữ liệu* → 💬): ghi chỗ AI đọc sai theo phần (KQKD / CĐKT / LCTT / chọn cột-kỳ /
  chung). Góp ý lưu trên máy và được gửi kèm câu lệnh đọc bảng liên quan ở MỌI lần trích xuất sau; có nút trích
  xuất lại ngay file đó và nút sao chép để gửi người phát triển sửa logic.
- **Không mất bảng vì nhận nhầm trang**: trang đã tick mà AI xem ảnh nhỏ không nhận ra vẫn được gửi kèm cho cả
  ba bảng. Bảng nào không được trang nào, hoặc đọc ra mà không có dòng tổng nào (KQKD: 01/10/20/30/50/60…),
  thì máy đọc lại một lần trên cả các trang bảng đã tick để AI tự tìm — như FinLens. PDF có chữ: trang bảng
  không có tiêu đề được nhận theo các dòng đặc trưng (giá vốn, lợi nhuận gộp…), không mặc định là trang tiếp
  của bảng trước.
- **Không gộp nhầm hai công ty**: mỗi file mang tên công ty AI đọc ở đầu báo cáo. Tên khác nhau (sau khi bỏ
  "Công ty cổ phần / TNHH / CTCP…", dấu và hoa thường) thì máy coi là hai công ty, báo đỏ ở phần *Nguồn dữ liệu*
  và chỉ dùng số của một công ty (mặc định công ty có nhiều file hơn). Chọn được công ty kia, hoặc bấm
  "Đây là cùng một công ty" khi AI đọc tên lệch (tên tiếng Anh, tên viết tắt). File không có tên công ty
  (Excel FinLens) luôn được gộp như trước. Cột **Dùng** ở *Nguồn dữ liệu*: bỏ tick một file là không dùng số
  của file đó; tick file của công ty kia là chuyển sang công ty đó. Logic ở `js/core/company.js`.
- **Hai form** (chọn ở bước 3):

  | | Form phổ thông | Form riêng elevaTO |
  |---|---|---|
  | Ai dùng được | mọi tài khoản | học viên · giảng viên |
  | Lấy gì | 3 báo cáo chính (học viên / giảng viên có thêm sheet thuyết minh) | 3 báo cáo + thuyết minh doanh thu/LN gộp theo mảng, TSCĐ theo nhóm, biến động vốn chủ, vay/trả nợ, lợi thế thương mại, số cổ phiếu, thuế suất |
  | Số trang mỗi file | tối đa 10 | cả file |
  | Lượt AI mỗi file | 3 | 3 + 1 mỗi nhóm thuyết minh (+ 1 mỗi 12 trang phải nhận diện) |
  | Xuất | Form chuẩn hóa 2026 (.xlsx) | thêm: điền thẳng vào model elevaTO |

  Form phổ thông **không tốn lượt nhận diện trang**: trang đã tick mà máy chưa rõ loại được gửi kèm luôn
  trong 3 lượt đọc bảng, AI tự tìm bảng cần đọc trong đó.
- **Báo cáo quý / bán niên đọc đúng cột**: mẫu B 02a-DN in BỐN cột số (riêng quý và lũy kế từ đầu năm,
  mỗi loại hai cột cho năm nay / năm trước). Câu lệnh buộc AI lấy **cặp lũy kế** và ghi lại cờ `cot_luy_ke`
  cùng số tháng của từng cột, nên bộ dữ liệu có đúng các kỳ 3T / 6T / 9T / FY thay vì lẫn một quý lẻ vào
  giữa dãy lũy kế. Mã kỳ phân biệt hẳn hai thứ cùng kết thúc một ngày: `Q3-2025` là RIÊNG ba tháng, `9T-2025`
  là lũy kế chín tháng. Nạp cả báo cáo quý lẫn bán niên vào một phiên cũng không còn kỳ nào đè lên kỳ nào.
  Nếu lũy kế chín tháng nhỏ hơn lũy kế sáu tháng thì chắc chắn một file bị đọc sai cột — bước rà soát báo ra.
- **Biểu đồ & chỉ số**: một tab ở bước rà soát vẽ 8 biểu đồ kiểu trang phân tích của công ty chứng khoán —
  tăng trưởng doanh thu & lợi nhuận (cột tiền + đường tốc độ tăng cùng kỳ năm trước), biên lợi nhuận
  gộp/EBIT/EBITDA/ròng, ROA & ROE, cơ cấu tài sản và cơ cấu nợ & vốn chủ theo tỷ trọng, vòng quay tiền mặt
  (số ngày tồn kho / phải thu / phải trả + chu kỳ tiền), khả năng thanh toán ngắn hạn, và dòng tiền thuần
  cho doanh nghiệp (NOPAT + khấu hao − đầu tư ± thay đổi vốn lưu động). Trỏ chuột vào một kỳ là hiện bảng
  nhỏ đủ mọi đường của kỳ đó; bấm chú giải để tắt / bật một đường; Tab bằng bàn phím cũng đọc được từng kỳ.
  Bảng số của từng biểu đồ chỉ hiện khi **phóng to** (bấm vào biểu đồ hoặc nút ⤢); nút **PNG** tải ảnh biểu đồ (có tên, đơn vị,
  chú giải, đúng màu giao diện đang dùng), nút **Excel** tải số liệu của biểu đồ theo đơn vị đang xem.
  Ba cách xem kỳ — **theo kỳ đã trích / chỉ kỳ năm / riêng từng quý** — và bộ chọn 3 năm / 5 năm / tất cả.
  "Riêng từng quý" do máy suy ra bằng cách **trừ hai kỳ lũy kế liền nhau** (quý 3 = lũy kế 9 tháng − lũy kế
  6 tháng); số dư trên CĐKT là số tại một thời điểm nên lấy nguyên, không trừ. Kỳ nào do suy ra đều được
  nói rõ ngay trên tab. Kèm bảng **22 chỉ số** chia bốn nhóm (thanh toán · sinh lời · cơ cấu vốn & đòn bẩy ·
  hiệu quả sử dụng tài sản), mỗi dòng có cách tính và mức xếp hạng. Kỳ giữa niên độ được quy về mức một năm
  trước khi so với kỳ năm. Máy tự tính từ số đã trích, AI không tham gia. Ở bước rà soát tick dòng nào thì
  Form chuẩn hóa xuất dòng đó.
- **Phân tích & đề xuất** (tab mới): chấm **sức khoẻ tài chính** và bốn điểm thành phần (khả năng thanh toán,
  hiệu quả kinh doanh, cơ cấu vốn & đòn bẩy, chất lượng tài sản), bắt **32 dấu hiệu bất thường** chia ba mức
  (cần xử lý ngay / cần theo dõi / ghi nhận để biết) — vốn chủ âm, vốn lưu động ròng âm, dòng tiền kinh doanh
  âm nhiều kỳ liền, nợ trên vốn chủ quá cao, biên gộp tụt, phải thu phình nhanh hơn doanh thu, tài sản dài hạn
  tài trợ bằng nợ ngắn hạn, lợi nhuận đến từ hoạt động tài chính / thu nhập khác, vay thêm khi dòng tiền âm… —
  rồi suy ra **việc nên làm**, mỗi mục nêu đúng con số đang có vấn đề. Logic ngưỡng và bộ quy tắc lấy từ bộ
  phân tích AI FinLens, chuyển sang mã chỉ tiêu TT99 và sang bộ dữ liệu nhiều kỳ của tool.
  Ngưỡng là mức chung của doanh nghiệp Việt Nam (không theo ngành) và **cố định trong mã**: máy tính, máy xếp
  hạng, AI không viết chữ nào — nên cùng một kết luận đọc tiếng Việt hay tiếng Anh đều như nhau.
- **AI nhận định** (cuối tab *Phân tích & đề xuất*, tốn 1 lượt AI): bấm nút là máy gửi đúng bảng số đã tính
  (các dòng chính theo tỷ đồng, 22 chỉ số kèm mức xếp hạng, dấu hiệu bất thường, sức khoẻ, việc gợi ý) cho
  Gemini để viết lời — tổng quan, điểm mạnh / yếu, xu hướng qua các kỳ (đúng các biểu đồ), rủi ro theo mức,
  đề xuất, 5–8 câu hỏi cần làm rõ với doanh nghiệp và kết luận. AI **không xem BCTC, không tự tính**; câu lệnh
  bắt mỗi nhận xét dẫn đúng con số và kỳ, nên đối chiếu được với bảng số bên trên. Viết bằng ngôn ngữ đang
  chọn; sửa ô hay thêm file sau khi AI viết thì nhận định được đánh dấu lỗi thời để bấm "Viết lại"; có nút
  sao chép ra văn bản thuần để dán vào tờ trình. Ngay trên nút có khối **Bối cảnh doanh nghiệp** (tuỳ chọn, 5 ô:
  ngành & mô hình kinh doanh, khách hàng / nhà cung cấp / thị trường, sự kiện trong kỳ, thông tin hỏi được từ
  doanh nghiệp, lưu ý của người phân tích) — những điều BCTC không nói mà người trong ngành hoặc đi hỏi công ty
  mới biết. AI dùng bối cảnh để diễn giải con số (tồn kho lớn có thể là bình thường với bất động sản), không
  dùng để thay số, và phải chỉ ra khi lời giải thích của doanh nghiệp mâu thuẫn với số liệu. Bối cảnh lưu cùng
  phiên làm việc; đổi bối cảnh thì nhận định cũ cũng được đánh dấu lỗi thời.
- **M&A & định giá** (tab mới, máy tính hết, không tốn lượt AI): góc nhìn thẩm định giao dịch và tín dụng doanh nghiệp.
  **LTM** tự ghép (năm gần nhất + lũy kế năm nay − lũy kế cùng kỳ năm trước) khi có báo cáo quý; **EBITDA chuẩn hoá**
  (bỏ thu nhập tài chính, lãi/lỗ liên doanh liên kết, lợi nhuận khác, lãi BĐS đầu tư; cộng lại chi phí tài chính ngoài
  lãi vay) cộng **điều chỉnh tay** từng khoản; **cầu nối EV → vốn chủ** (nợ vay, tiền & tương đương tiền, khoản tương
  đương nợ, lợi ích CĐKKS, tài sản ngoài hoạt động); **vốn lưu động** thương mại / hoạt động và mức peg bình quân;
  **FCFF / FCFE**; **chất lượng lợi nhuận** (CFO/EBITDA, dồn tích Sloan, Beneish M-score, Altman Z'' thị trường mới nổi);
  **định giá bội số** EV/EBITDA, P/E, P/B ba mức kèm football field và giá mỗi cổ phiếu (khi có số cổ phiếu ở thuyết
  minh); **sức vay nợ** theo nợ ròng / EBITDA mục tiêu và DSCR xấp xỉ. Bội số và điều chỉnh lưu cùng phiên.
  Logic ở `js/core/deal.js`, kiểm ở `tests/deal.test.js`.
  **Định giá & M&A theo model elevaTO** (học từ model DGW: sheet 15.DCF, 16.Comps, 17.Valuation, 25.Quant_Checks và
  model hợp nhất Consolidation_Model / Goodwill / NCI), kiểm bằng chính số của model ở `tests/valuation.test.js`:
  - **DCF – FCFF**: WACC = Wd × Kd(1 − t) + We × Ke, Ke = Rf + β Blume (⅔β + ⅓) × ERP (+ phần bù riêng), tỷ trọng
    theo giá thị trường khi có giá × số cổ phiếu. FCFF = EBIT × (1 − t) + khấu hao − capex thuần − Δ vốn lưu động,
    dự phóng 1–10 năm, tăng trưởng giảm dần về g. Tham số để trống = trung bình 3 năm actual gần nhất (tự trượt);
    lãi vay tự tính không thấp hơn Rf + 1%. Giá trị cuối kỳ Gordon, đối chiếu bội số EV/EBITDA lúc thoát (bội số
    ngầm định và g ngầm định), cảnh báo TV > 75% EV, g > Rf, g ≥ WACC, WACC thấp bất thường; **bảng độ nhạy 7 × 7**
    WACC × g (± 1,5 điểm %, bước 0,5) như model.
    **Bảng dự phóng** như sheet 04.Drivers: cột các năm actual (A, tối đa 5 năm, đúng các tỷ lệ máy dùng làm mặc định)
    đứng cạnh cột dự phóng (F, đặt nhãn theo năm); 6 tham số (tăng trưởng, biên EBIT, khấu hao, capex, vốn lưu động,
    thuế suất) **sửa được riêng từng năm** — ô trống dùng số chung, ô ghi đè tô vàng, nút bỏ hết ghi đè; dòng công thức
    giải thích từng dòng. Thuế suất suy từ BCTC ngoài 5–35% thì dùng 20% và báo rõ.
  - **Lộ trình định giá** (`js/ui/dvguide.js`): cả tab trình bày thành 8 bước nối nhau như một model bài bản —
    ① Quality of Earnings → ② Working capital & FCF lịch sử → ③ DCF (3.1 Model setup · 3.2 Forecast drivers ·
    3.3 WACC · 3.4 FCFF → EV · 3.5 Sensitivity) → ④ EV → equity bridge → ⑤ Relative valuation (multiples & peers)
    → ⑥ Target price & recommendation; thêm ⑦ Debt capacity và ⑧ M&A. Đầu tab là sơ đồ các bước (công thức + số
    kết quả chính, bấm để nhảy tới); mỗi bước có mục đích, công thức và thanh "Đầu vào ← / chuyển sang →".
  - **Forecast modules bật / tắt** (`js/ui/dvparts.js`, `projectFcff` ở `js/core/valuation.js`): *Gross margin & SG&A*
    (EBIT = gross profit − SG&A, biên gộp riêng từng mảng / dự án — mặc định theo báo cáo bộ phận), *Working capital by
    days* (DSO theo revenue, DIO / DPO theo COGS + phần khác), *Fixed asset schedule* (TSCĐ hiện có khấu hao theo tuổi
    còn lại, capex mới — nhập số tiền từng năm được — theo thời gian sử dụng, nửa năm đầu; EBIT = EBITDA − khấu hao
    theo lịch). Thiếu số lịch sử thì máy báo và tạm tắt module. Sơ đồ *model wiring* cho thấy module nào đang chạy vào
    dòng nào. Cách dự phóng doanh thu thứ 6 *theo dự án* (giá trị × % ghi nhận từng năm + doanh thu nền) cho bất
    động sản / xây dựng. Mẫu ngành tự bật module hợp ngành (sản xuất, bán lẻ: cả ba; tiện ích: lịch TSCĐ…).
  - **Mô hình ba báo cáo tích hợp** (`js/core/model3.js`, `js/ui/dv3s.js`, mục 3.6) — port đúng model elevaTO, chạy
    trên 03.Input_FS các năm actual mà app dựng từ BCTC: *04.Drivers* mỗi dòng CĐKT một driver (phải thu = DSO × doanh
    thu, tồn kho gộp = DIO × giá vốn, dự phòng HTK = % tồn kho gộp, phải trả = DPO × giá vốn, chi phí trả trước NH % giá
    vốn, các khoản khác % doanh thu, XDCB dở dang / đầu tư dài hạn khác theo mức bình quân), mặc định = bình quân 3 năm
    actual gần nhất, ghi đè cả giai đoạn hoặc từng năm; *10.FA_SCHED* theo 7 nhóm TSCĐ (capex nhập theo nhóm — trống thì
    capex % doanh thu × tỷ trọng tăng TSCĐ lịch sử; khấu hao = MIN(nguyên giá cuối / số năm sử dụng, giá trị còn lại);
    số năm sử dụng = TB nguyên giá / TB khấu hao, chặn trong khung [min; max] **trích từ thuyết minh chính sách kế
    toán** — nhóm thuyết minh mới *Thời gian khấu hao TSCĐ* (`livesFrom` ở `js/core/extract.js`: khung năm theo nhóm,
    tỷ lệ %/năm đổi ra năm, đất không thời hạn = 0; chưa trích thì khung chung TT45/2013) + lợi thế thương mại phân bổ 10 năm; *11.Debt* vay ngắn
    hạn = % giá vốn, vay dài hạn theo lịch, lãi trên dư nợ đầu kỳ; *12.Equity* cổ tức = tỷ lệ × LNST cty mẹ năm trước,
    NCI theo tỷ lệ, phát hành theo bình quân; *13.Tax_JV_Sched* thuế = thuế suất hiệu dụng × LNTT, thuế đã nộp theo cuộn số dư thuế phải nộp, vị thế thuế hoãn
    lại, đầu tư công ty liên kết = đầu kỳ + đầu tư mới + phần lãi (bình quân 3 năm) − cổ tức nhận về (phần lãi trừ khỏi
    CFO, đầu tư & cổ tức vào CFI); *08.CF* gián tiếp từ biến động CĐKT, tiền là số cân, revolver khi thiếu
    tiền. **FCFF = CFO + lãi vay × (1 − t) + capex + Δ đầu tư NH → DCF** (mặc định; chọn được "driver đơn giản").
    Kiểm bằng chính số của model DGW (`tests/fixtures/dgw-3s.json`): DSO / DIO / DPO, phải thu, tồn kho, phải trả, vay
    NH, khấu hao gồm lợi thế thương mại, TSCĐ thuần 2026F–2027F khớp file Excel.
  - **Khớp model elevaTO tới từng dòng** (kiểm bằng `tests/fixtures/dgw-3s.json`, file gốc ở `ai/models/`): KQKD như
    06.IS (lợi nhuận gộp theo mảng − chi phí bán hàng, QLDN, chi phí tài chính khác theo % doanh thu + thu nhập tài chính
    = lợi suất × tiền đầu kỳ − lãi vay + LDLK + thu nhập / chi phí khác; thuế suất hiệu dụng; EBIT = LNTT + lãi vay), vay
    NH gộp (tiền vay = MAX(giá vốn × tỷ lệ vay mới, Δ dư nợ)), lãi suất ghi đè từng năm, số cổ phiếu tăng theo ESOP (mệnh
    giá 10.000 đ); WACC với Kd năm dự phóng đầu và thuế năm actual cuối; cầu nối EV + tiền − nợ vay − NCI (chọn được
    "đầy đủ"); trọng số giá mục tiêu như 17.Valuation; kịch bản Base / Bull / Bear theo từng mảng, từng năm (tăng trưởng &
    biên gộp, ghi chú căn cứ) với công tắc kịch bản áp dụng. Dựng lại DGW 2026F–2030F khớp KQKD, LCTT, FCFF, tiền, vay,
    tổng tài sản, vốn chủ, EV và giá mục tiêu 44.620 đ.
  - **LBO** (`js/core/lbo.js`, bước 9): dùng EBITDA, capex, ΔNWC, thuế đã dự phóng; sources & uses, nợ senior (trả
    góp + cash sweep) / mezzanine, lịch nợ và credit stats, IRR / MOIC, bảng IRR entry × exit, bội số vào tối đa để đạt
    IRR mục tiêu → giá / cổ phiếu đưa sang football field và weight "LBO" của target price.
  - **Doanh thu theo mảng & SOTP** (`js/ui/dvparts.js`, `js/core/sotp.js`): cách dự phóng thứ 5 "theo từng mảng kinh
    doanh" (revenue build-up) — mỗi mảng doanh thu năm gốc (mặc định theo thuyết minh báo cáo bộ phận) và tăng trưởng
    riêng, ghi đè được từng năm; tổng các mảng khớp revenue hợp nhất (giữ tỷ lệ loại trừ nội bộ năm gốc).
    **Sum-of-the-parts**: mỗi phần (mảng, công ty con, cổ phần niêm yết, quỹ đất…) định giá bằng multiple × chỉ tiêu
    hoặc nhập thẳng giá trị (DCF / RNAV riêng), × tỷ lệ sở hữu; phần basis EV trừ một lần net debt + debt-like + NCI
    hợp nhất, trừ holding discount. SOTP và **phương pháp khác** (RNAV, DDM, consensus… nhập giá / cổ phiếu) có weight
    riêng trong target price và hiện trên football field. Thêm mẫu ngành tập đoàn đa ngành (theo mảng + SOTP 50%).
    Ô nhập gom theo nhóm có tiêu đề (Market data, Cost of equity, Deal terms, Funding structure…), nhãn nằm trên ô.
  - **Bảng điều khiển định giá** (`js/ui/dvcharts.js`, SVG vẽ tay): thẻ số chính (giá mục tiêu gia quyền, upside,
    khuyến nghị, giá DCF kèm tỷ trọng giá trị cuối kỳ, WACC / g, giá trị kỳ vọng theo kịch bản); **football field**
    (DCF lấy dải hình chữ thập từ bảng độ nhạy: WACC ± 0,5 ở g gốc và g ± 0,5 ở WACC gốc; DCF bội số thoát, bội số thấp /
    giữa / cao, trung vị peer, EPV, Graham, kịch bản; phương pháp ra giá trị âm không vẽ mà ghi chú bên dưới) với vạch
    giá thị trường và giá mục tiêu — chỉ còn một football field (bỏ bản trùng ở bước 5); **thác nước** EV → vốn chủ theo
    đúng cầu nối đang dùng; **doanh thu (cột, trục trái) & FCFF (đường, trục phải)** các năm actual cạnh năm dự phóng.
    Bảng độ nhạy tô màu theo % chênh với giá thị trường. Thẻ số gắn nhãn khi đang chạy kịch bản Bull / Bear, kèm nhãn
    cảnh báo (WACC thấp bất thường, terminal value > 75% EV, TV phải chuyển sang Gordon, có năm FCFF âm).
  - **Trình bày theo lộ trình 9 bước** (`js/ui/dvguide.js`): mỗi bước thu gọn được (mặc định mở DCF và target price,
    bấm thẻ trên sơ đồ là bước đó tự mở). Ở chế độ mô hình ba báo cáo tích hợp: sơ đồ nối mô hình đổi theo (driver
    C1 → 10.FA_SCHED → 07.BS → 08.CF), bảng dự phóng 3.4 khoá các dòng biên EBIT / D&A / capex / thuế ("từ 3.6"), giữ
    tăng trưởng và biên gộp sửa được, thêm dòng EBITDA hoạt động. Bước 4 hiện cầu nối đang dùng (như 15.DCF hoặc đầy
    đủ), cách còn lại để tham khảo kèm chênh lệch. Bảng target price ghi nguồn bội số (trung vị peer / mặc định) và lý
    do phương pháp bị loại (thiếu số, giá trị âm, bội số mặc định chưa có peer chỉ để tham khảo). Màn hình hẹp: sơ đồ
    2 cột gọn, biểu đồ cuộn ngang.
  - **Thiết lập mô hình** (`js/core/presets.js`, từ sheet 19.Playbook): **10 mẫu ngành** (chung, phân phối, bán lẻ
    chuỗi, sản xuất, tiêu dùng, tiện ích, công nghệ, xây dựng, bất động sản, ngân hàng) — mỗi mẫu đặt cách dự phóng
    doanh thu, cách tính giá trị cuối kỳ, trọng số giá mục tiêu và hiện ghi chú "dự phóng thế nào · định giá ưu tiên
    · bẫy hay gặp"; sửa tiếp được mọi thứ. **4 cách dự phóng doanh thu**: % tăng trưởng; sản lượng × giá bán; số cửa
    hàng × doanh thu / cửa hàng; nhập tay từng năm (theo kế hoạch / tiến độ bàn giao) — tham số của từng cách cũng
    sửa riêng được từng năm trong bảng dự phóng. **3 cách tính giá trị cuối kỳ**: Gordon, bội số EV/EBITDA lúc thoát,
    bình quân hai cách. **Scenario analysis Bear / Base / Bull** (như 02.Control): chênh lệch tăng trưởng, biên EBIT,
    WACC và xác suất; ra giá từng kịch bản và expected value (probability-weighted).
  - **Giá mục tiêu gia quyền & khuyến nghị**: DCF 50% · P/E 25% · EV/EBITDA 15% · P/B 10% (sửa được; phương pháp
    thiếu số thì chia lại), thang MUA / TÍCH LUỸ / NẮM GIỮ / KÉM KHẢ QUAN / BÁN theo ±10% / ±20%.
  - **Định giá nhanh**: EPV = EPS / Ke, P/B hợp lý = (ROE − g)/(Ke − g), Graham number, g ngầm định trong giá thị
    trường; thêm **Piotroski F-score** vào khối chất lượng lợi nhuận.
  - **Hồi quy beta** (`js/core/beta.js`, như sheet 20.Beta_Data): dán từ Excel hoặc chọn file CSV (Ngày · Giá cổ
    phiếu · VN-Index, giá đóng cửa hoặc lợi suất); β = SLOPE theo phiên / tuần / tháng, kèm R², số quan sát, β Blume;
    bấm "Dùng beta" là điền vào WACC. Kiểm bằng chuỗi 1.250 phiên của model DGW (β = 1,3364).
    **Tự tải giá từ sàn**: gõ mã, chọn 1–5 năm, bấm "Tải giá từ sàn" — máy chủ (`GET /gia`, `worker/src/gia.js`) lấy giá
    đóng cửa đã điều chỉnh của mã và VN-Index từ VNDirect, trang hồi quy ngay và gợi ý dùng giá đóng cửa gần nhất
    làm giá thị trường.
  - **So sánh cùng ngành – peer** (`js/core/comps.js`, như sheet 16.Comps): nhập từng peer hoặc dán bảng từ Excel
    (Tên · Giá · Tỷ giá · Số CP · Tiền · Nợ vay · Doanh thu · EBITDA · LNST · Vốn chủ); máy tính vốn hoá, EV = vốn hoá
    + nợ − tiền, EV/Doanh thu, EV/EBITDA, P/E, P/B; trung vị / trung bình / tứ phân vị 25–75% (bỏ bội số âm hoặc
    > 200 lần); dòng của chính công ty theo giá thị trường; giá ngầm định theo trung vị peer (so với DCF). Nút "Dùng
    tứ phân vị làm dải bội số" đặt mức thấp / giữa / cao của tab bội số; EV/Doanh thu theo trung vị peer vào được giá
    mục tiêu gia quyền (trọng số mặc định 0). Kiểm bằng số peer của model DGW ở `tests/comps.test.js`.
  - **Thương vụ mua cổ phần** (`js/core/mna.js`): lợi thế thương mại theo phần sở hữu (VAS 11; âm = lãi mua giá rẻ),
    phân bổ ≤ 10 năm, NCI, hợp nhất theo số tháng năm mua, P/E · P/B · EV/EBITDA đã trả, chi phí nguồn tiền
    (tiền mặt / vay / phát hành cổ phiếu), **EPS trước / sau** (cả năm và năm mua), **giá mua hoà vốn EPS**, nợ
    ròng / EBITDA sau thương vụ, giá trị tạo thêm so với định giá riêng mục tiêu. Sở hữu 20–50% / < 20% được
    báo là công ty liên kết / khoản đầu tư (không hợp nhất).
- **Đối chiếu ngược thuyết minh** (hiện ở cả tab *Thuyết minh* và tab *Phân tích*): thuyết minh là bảng ma trận
  in nhỏ, hay kéo dài sang trang sau — chỗ AI đọc sai nhiều nhất mà không có gì tự phát hiện. **19 chỗ kiểm
  tra** cộng số thuyết minh rồi so với đúng dòng trên ba bảng chính: nguyên giá / hao mòn / giá trị còn lại
  TSCĐ hữu hình & vô hình (mã 221–229), bảng biến động TSCĐ có tự khớp (đầu kỳ + tăng − giảm = cuối kỳ),
  khấu hao so dòng trên LCTT, dư nợ vay ngắn / dài hạn (mã 321 / 339) và biến động vay, tiền vay nhận & trả
  gốc, cổ tức và vốn góp thêm so LCTT, doanh thu & lợi nhuận gộp theo mảng, lợi thế thương mại (mã 279).
  Chỗ gần như chắc chắn đọc sai được tô đậm để sửa trước khi xuất file.
- **Xuất** — hai file .xlsx, dựng thẳng trong trình duyệt, không cần đưa file mẫu nào vào:
  - **Form chuẩn hóa 2026** (mọi tài khoản): trang *Tổng quan* + *Tình hình tài chính*, *Kết quả kinh doanh*,
    *Lưu chuyển tiền tệ* theo mẫu TT99. Bố cục bám các sheet trình bày của model elevaTO: dòng *Năm*, dòng
    *Actual / Forecast*, dải mục lớn, dòng tổng in đậm, kèm dòng tỷ lệ suy ra (tăng trưởng doanh thu, biên LN
    gộp / LN thuần HĐKD / LNST). Cuối mỗi báo cáo có dòng KIỂM TRA phải bằng 0.
    **Đơn vị chọn ngay trong file**: sheet *Tổng quan* có ô dropdown đồng / nghìn / triệu / tỷ, mọi ô số là công
    thức chia cho tên đã định nghĩa `DonVi` nên đổi một ô là cả file tự tính lại.
    Học viên / giảng viên có thêm các sheet thuyết minh: *Mảng kinh doanh*, *TSCĐ & LTTM*, *Vốn chủ sở hữu*,
    *Vay & tham số*.
  - **Form chi tiết elevaTO** (chỉ **học viên / giảng viên**): **sao y sheet `03.Input_FS` của model**, giữ
    nguyên số dòng — chọn vùng số liệu dán thẳng vào ô cùng dòng, cùng cột của model là khớp, không lệch dòng
    nào. Đơn vị cố định triệu đồng (đúng đơn vị model dùng), chi phí mang dấu âm, ô nhập tay nền vàng, số máy
    ước tính in nghiêng, dòng tổng và dòng CHECK là công thức như trong model.
    Bố cục lấy từ chính file template qua `tools/doc-template.py` → `js/targets/sheets.js`, không chép tay;
    template đổi thì chạy lại là file xuất ra đổi theo. Tài khoản thường thấy thẻ khoá "Chỉ dành cho học viên".
  - **Phiên làm việc** tự lưu trên máy theo tài khoản — mở lại trang là hỏi có muốn làm tiếp không.

## Tài khoản và vai trò

**Không có tường đăng nhập ở cửa.** Ai mở trang cũng vào thẳng màn hình chính, tải BCTC lên, xem và tick trang
thoải mái. Chỉ hai việc cần tài khoản, và lúc đó mới hiện hộp đăng ký ngay tại chỗ:

| Việc | Vì sao cần tài khoản |
|---|---|
| **Trích xuất bằng AI** | Mỗi tài khoản có lượt AI riêng mỗi ngày. Mở cho khách vãng lai thì ai cũng rút cạn hạn mức Gemini. |
| **Tải file .xlsx** | Để biết ai đang dùng công cụ. |

Đăng ký xong thì **chạy tiếp đúng việc đang dở**, không bắt bấm lại. Nút “Đăng nhập / Đăng ký” luôn nằm ở góc
trên bên phải.

Lúc đăng ký hỏi: họ tên, **tuổi**, email, số điện thoại, **bạn là học viên / giảng viên / người dùng**, và
**định dùng công cụ để làm gì**. Mọi thông tin này lưu vào Google Sheet và hiện luôn trong tin báo Telegram.

> Ô “bạn là ai” chỉ là **tự khai**. Ai đăng ký cũng ở mức tài khoản thường — chọn “giảng viên” không tự mở
> được Form chi tiết elevaTO. Vai trò thật do bạn xếp bằng bot Telegram (xem mục dưới). Nếu tin người dùng tự
> khai thì Form chi tiết coi như mở cho tất cả mọi người.

| Vai trò | Lượt AI mỗi ngày | Form chi tiết elevaTO |
|---|---|---|
| Tài khoản thường (`free`) | có hạn | ✗ |
| Học viên (`hv`) | nhiều hơn | ✓ |
| Giảng viên (`gv`) | không giới hạn | ✓ |

## Ủng hộ

Nút **Ủng hộ** ở góc trên (cạnh nút đăng nhập) mở hộp có số tài khoản và **mã QR chuyển khoản theo chuẩn
VietQR của NAPAS**. Mã QR dựng ngay trên máy người dùng bằng thư viện trong `vendor/qrcode/`, **không gọi
dịch vụ sinh QR bên ngoài** — số tài khoản không đi qua bên thứ ba và trang vẫn giữ CSP `script-src 'self'`.
Có mức gợi ý 50k / 100k / 200k / 500k; chọn mức thì QR dựng lại kèm sẵn số tiền.

Số tài khoản **không viết cứng trong trang**: đặt bằng bot Telegram (`/ungho`), máy chủ trả về cho trang.
Chưa đặt thì hộp vẫn mở nhưng chỉ hiện lời cảm ơn và cách liên hệ. Không ủng hộ thì vẫn dùng đủ tính năng.

## Quên mật khẩu

Ở hộp đăng nhập bấm **Quên mật khẩu?** → nhập email đã đăng ký → máy chủ gửi **mã 6 số** qua email → nhập mã
và mật khẩu mới là vào luôn, mọi máy đang đăng nhập bị đăng xuất.

- Mã **8 chữ số**, sống **15 phút**, chỉ dùng **một lần**.
- Nhập sai **5 lần** thì **nghỉ 60 giây** chứ không huỷ mã — huỷ mã nghĩa là người lạ đoán bừa vài lần
  đã chặn được chủ tài khoản. Mã 8 số nên trong 15 phút chỉ đoán được vài chục lần, không đáng kể.
- Mỗi email xin tối đa **3 mã mỗi giờ**. Trần gửi thư của cả hệ thống chỉ đếm **thư thật sự gửi**: email
  không có tài khoản thì không tốn gì, nên không ai gửi vài chục email bịa để chặn người khác đặt lại mật khẩu.
- Email chưa đăng ký vẫn nhận câu trả lời "đã gửi" (không để ai dò danh sách email đã đăng ký).
- Gần hết hạn mức gửi thư trong ngày của Gmail thì ngừng gửi và bot Telegram báo bạn, để đặt lại tay bằng `/mkmoi`.
- Đổi được mật khẩu thì mọi máy đang đăng nhập bị đăng xuất, và bỏ luôn khoá tạm do đăng nhập sai nhiều lần.

## Bot Telegram quản trị

Có tài khoản mới → bot nhắn bạn kèm nút **🎓 Học viên · 👨‍🏫 Giảng viên · 👤 Thường · 🔒 Khoá / ✅ Mở**.
Lệnh (gõ trong tin nhắn riêng với bot):

| Lệnh | Việc |
|---|---|
| `/thongke` | số tài khoản theo vai trò, lượt AI hôm nay, số key, model đang dùng |
| `/cho` | tài khoản đang chờ duyệt (kèm nút) |
| `/tim <email hoặc tên>` | tra cứu, kèm nút xếp vai trò |
| `/hocvien <email>` · `/giangvien <email>` · `/free <email>` | xếp vai trò |
| `/luot <email> <số>` | lượt AI mỗi ngày riêng cho người này (0 = theo vai trò) |
| `/khoa <email>` · `/mo <email>` | khoá (đăng xuất mọi máy) / mở hoặc duyệt |
| `/matkhau <email> <mật khẩu mới>` | đặt lại mật khẩu; bot tự xoá tin chứa mật khẩu |
| `/mkmoi <email>` | bot tự sinh mật khẩu mạnh rồi đọc cho bạn (bỏ ký tự dễ nhìn lẫn) |
| `/moi` | 15 tài khoản đăng ký gần nhất |
| `/ungho` | xem thông tin ủng hộ đang hiện trên trang |
| `/ungho <ngân hàng> <số tk> <tên chủ tk>` | đặt số tài khoản nhận ủng hộ (`vcb`, `tcb`, `mb`… hoặc 6 số BIN của NAPAS) |
| `/ungho off` | tạm ẩn phần ủng hộ trên trang |

- Bot tự đăng ký **menu lệnh**: bấm nút **Menu** cạnh ô soạn tin, hoặc gõ `/` là ra danh sách có mô tả.
  Menu chỉ đặt cho riêng chat quản trị — người lạ mở bot không thấy. Sửa danh sách trong `MENU_LENH`
  (`worker/src/telegram.js`) rồi push là bot tự đăng ký lại.
- `/thongke` cho biết chuỗi model đang dùng và model nào đang quá tải.
- Chỉ **tin riêng do chính chat ID quản trị gõ** mới được xử lý (không nhận nhóm, không nhận tin chuyển tiếp);
  người lạ nhắn bot thì bot im lặng. Nút bấm kiểm tra cả chat lẫn người bấm.
- Key Gemini hỏng (401/403) → bot báo, tối đa 1 lần mỗi giờ. Ai xin mã đặt lại mật khẩu bot cũng báo.
- `/ungho` đáp lại **tên ngân hàng bot nhận ra** để bạn đối chiếu trước khi nó hiện lên trang — sai BIN là
  người ủng hộ quét QR không được. Bảng mã ngân hàng **sinh tự động** bằng `tools/banks.py` từ danh sách
  chính thức của NAPAS, đừng sửa tay (bot đáp lại tên lấy từ chính dòng đó nên gõ tay sai là không ai nhận ra).
- Bot dùng **webhook**: Telegram đẩy tin sang ngay nên lệnh trả lời tức thì. Worker tự nối webhook ở lượt
  truy cập đầu sau khi triển khai, không phải gõ lệnh gì.

## Cài máy chủ AI (một lần, khoảng 15 phút)

Máy chủ chạy trên **Cloudflare Workers**, mã nguồn trong [`ai/worker/`](worker/). Đẩy lên bằng GitHub
Actions: sửa gì trong `ai/worker/` rồi `git push` là máy chủ tự cập nhật — **không phải dán tay code
vào đâu nữa**, và key không bao giờ nằm trong repo.

Các bước cài lần đầu viết đầy đủ, từng cú bấm, trong **[ai/worker/README.md](worker/README.md)**:
tạo tài khoản Cloudflare → lấy API token → dán 2 secret vào GitHub → bấm chạy workflow → cất key
Gemini / token bot / Brevo vào Cloudflare. Chỉ có vậy: **cơ sở dữ liệu D1 workflow tự tạo**, và
**địa chỉ máy chủ workflow tự điền vào `ai/js/config.js`** sau mỗi lần triển khai.

Cuối cùng tự đăng ký một tài khoản trên trang, rồi nhắn bot `/giangvien <email của bạn>` để thành
giảng viên.

> `ai/backend/` là bản Apps Script cũ, giữ lại để còn chỗ quay về trong lúc chuyển. Bản mới chạy ổn thì dọn đi.

### Bảo vệ

- Mật khẩu băm PBKDF2-SHA256 có muối riêng từng người; cơ sở dữ liệu chỉ giữ bản băm của mật khẩu và của
  token phiên. Sai mật khẩu 5 lần → khoá tạm 10 phút; có ô bẫy bot và trần số đăng ký mỗi giờ.
- Mỗi tài khoản có hạn mức lượt/ngày theo vai trò (giữ lượt trước khi gọi Gemini, lỗi thì trả lại) và tối đa
  `AI_RPM_MA` (6) lượt/phút; mỗi key tối đa `AI_RPM` (12) lượt/phút.
- Nhiều key Gemini: key nào hết hạn mức phút (429) thì nghỉ, máy chủ chuyển ngay sang key khác.
- Model do máy chủ chọn, trang không đổi được. Máy chủ giữ **chuỗi model dự phòng** (bản flash chính thức mới
  → cũ, cuối cùng flash-lite): model nào quá tải (HTTP 503) thì nghỉ 5 phút và máy chủ chuyển ngay sang model
  sau **trong cùng một lượt** — mỗi model có hạn mức miễn phí riêng nên ít khi báo "quá tải". Muốn cố định một
  model: biến `AI_MODEL` trong `worker/wrangler.toml`.
- Máy chủ chỉ chuyển tiếp nội dung trích xuất (PDF / ảnh / chữ có giới hạn độ dài), không cho dùng công cụ.
- Trang chỉ chạy script của chính nó (CSP `script-src 'self'` + `'wasm-unsafe-eval'` cho bộ giải ảnh scan của pdf.js,
  thư viện trong `vendor/`), không dùng `innerHTML`
  với dữ liệu; phiên làm việc tự lưu theo từng tài khoản (máy dùng chung không lộ số của người khác).

### Giới hạn

- Gemini miễn phí giới hạn số lượt mỗi phút / mỗi ngày theo **từng model**. Máy chủ giữ tối đa `AI_RPM` (12)
  lượt/phút mỗi key, `AI_RPM_MA` (6) lượt/phút mỗi tài khoản; hết hạn mức ở model này thì đổi key rồi đổi
  model (tối đa `AI_THU_TOI_DA` = 8 lần gọi cho một lượt), quá nữa thì trang tự chờ rồi thử lại.
  Một BCTC tốn 3 lượt ở Form phổ thông; Form riêng elevaTO thêm 1 lượt mỗi nhóm thuyết minh và 1 lượt mỗi
  12 trang AI phải tự nhận diện.
- Một lượt gọi Gemini chờ có hạn: bảng dài quá thì trang tự chia đôi rồi gọi lại.
- Gemini bản miễn phí có thể dùng dữ liệu gửi lên để cải thiện dịch vụ — chỉ dùng cho BCTC đã công bố.
- Nhật ký lỗi của máy chủ che token bot.
- Model: máy chủ lấy danh sách model Gemini hiện có (tự cập nhật khi Google ra model mới) và dùng bản *flash*
  chính thức mới nhất.

## Ngôn ngữ Anh / Việt

Nút chọn ngôn ngữ nằm cạnh nút sáng/tối trên đầu trang. Chưa chọn thì trang tự lấy ngôn ngữ của trình duyệt
(tiếng Việt nếu trình duyệt là tiếng Việt, còn lại tiếng Anh); đã chọn thì nhớ trên máy.

Đổi ngôn ngữ **không nạp lại trang và không mất số đang làm**: `lang` nằm trong state, mọi phần giao diện
đang theo dõi nó nên tự vẽ lại.

Dịch luôn cả phần số liệu, không chỉ nút bấm:

| Nội dung | Nguồn |
|---|---|
| Chữ trên giao diện | `js/i18n.vi.js` / `js/i18n.en.js` (cùng một bộ khoá) |
| Chữ nằm sẵn trong HTML | thuộc tính `data-t` / `data-t-attr` trong `index.html` |
| Tên 237 chỉ tiêu BCTC | `js/chart2026.js` (tiếng Việt) + `js/chart2026.en.js` |
| Tên 141 dòng model forecast | `js/targets/model.js` + `js/targets/model.en.js` |
| Nhãn trong file .xlsx xuất ra | cùng bộ khoá trên — xuất bằng ngôn ngữ đang chọn, kể cả tên file và tên sheet |

Câu lệnh gửi cho Gemini (`js/core/prompts.js`) **luôn giữ tiếng Việt** vì nó đọc BCTC Việt Nam — đổi ngôn ngữ
giao diện không đụng tới chất lượng trích xuất.

Tiếng Anh cần phân biệt số ít / số nhiều, nên `t()` nhận thêm dạng `{n|page|pages}` (tiếng Việt viết hai vế
giống nhau). Số **luôn** hiển thị theo cách viết Việt Nam (`1.234,5`) ở cả hai ngôn ngữ, vì ô sửa tay đọc số
bằng `parseVN`; chỉ ngày giờ mới theo ngôn ngữ.

Một chỗ **cố ý giữ nguyên**: các lưu ý sinh ra lúc trích xuất (`sources[].ext.warnings`) được lưu dưới dạng
câu đã dịch vào phiên làm việc, nên mở lại phiên cũ sẽ thấy chúng bằng ngôn ngữ lúc trích xuất. Đó là biên bản
của lần chạy đó, không phải chữ của giao diện.

`tests/i18n.test.js` canh: hai từ điển đủ khoá như nhau và cùng bộ biến `{…}`, mọi chỉ tiêu / dòng model đều
có tên tiếng Anh, mọi khoá `data-t` trong HTML đều có thật, chữ trên nhãn nguồn số của bảng model khớp phần
chú thích, và **không còn chuỗi tiếng Việt viết cứng** trong `js/` (trừ prompts và hai tệp dữ liệu gốc).

## Mã nguồn

```
ai/
├── index.html, css/app.css      giao diện (3 bước, nền kính mờ sáng/tối, phông Be Vietnam Pro)
├── js/app.js, js/ui/*           các bước giao diện, trạng thái, lưu phiên
├── js/i18n.js + i18n.{vi,en}.js chọn ngôn ngữ Anh / Việt (xem mục dưới)
├── js/ai.js                     gọi máy chủ AI (chờ khi bận, chia nhỏ khi quá giờ)
├── js/pdf.js, js/libs.js        đọc chữ, ảnh thu nhỏ, cắt trang PDF; nạp thư viện trong vendor/ khi cần
├── js/ui/pages.js               lưới trang để tick + xem trang lớn
├── js/config.js                 địa chỉ máy chủ AI
├── js/ui/auth.js                đăng nhập / đăng ký / quên mật khẩu, menu tài khoản
├── js/ui/donate.js              hộp Ủng hộ; js/core/vietqr.js dựng nội dung mã QR VietQR
├── js/chart2026.js              danh mục chỉ tiêu mẫu TT99 + cây cộng dồn + mã TT200 tương ứng
├── js/core/                     logic thuần (đọc số VN, kiểm tra, quy đổi, nhận trang, prompt, dữ liệu nhiều kỳ, Excel)
├── js/core/xlsxout.js           bộ ghi .xlsx viết tay (kiểu ô, tên đã định nghĩa, danh sách chọn trong ô)
├── js/core/formxlsx.js          Form chuẩn hóa 2026; js/core/notesxlsx.js các sheet thuyết minh
├── js/core/fcalc.js             tính sẵn giá trị ô công thức để trình xem không tự tính cũng thấy số
├── js/core/metrics.js           chỉ số tài chính + số liệu biểu đồ (máy tính, không qua AI)
├── js/core/interim.js           kỳ lũy kế → riêng từng quý, và bắt lỗi đọc sai cột báo cáo quý
├── js/core/reconcile.js         đối chiếu ngược số thuyết minh với ba bảng chính
├── js/core/analysis.js          ngưỡng xếp hạng, dấu hiệu bất thường, chấm sức khoẻ, đề xuất
├── js/ui/charts.js              vẽ biểu đồ SVG (không dùng thư viện ngoài)
├── js/ui/analysis.js            tab Phân tích & đề xuất + bảng đối chiếu thuyết minh
├── js/core/modelxlsx.js         Form chi tiết elevaTO — sao y sheet 03.Input_FS, giữ nguyên số dòng
├── js/targets/model.js          quy ba báo cáo + thuyết minh về đúng dòng sheet 03.Input_FS
├── js/targets/sheets.js         bố cục 03.Input_FS, SINH TỰ ĐỘNG từ template (đừng sửa tay)
├── tools/doc-template.py        đọc file model elevaTO (.xlsx) → sinh js/targets/sheets.js
├── tools/banks.py               lấy bảng mã ngân hàng NAPAS → bảng BANK trong worker/src/ungho.js
├── worker/                      máy chủ Cloudflare Workers (xem worker/README.md)
├── backend/                     máy chủ Apps Script — BẢN CŨ, giữ tạm trong lúc chuyển
├── vendor/                      pdf.js, pdf-lib, JSZip, SheetJS, qrcode, phông Be Vietnam Pro (xem vendor/README.md)
└── tests/                       kiểm thử
```

Kiểm thử (Node 20+):

```bash
cd ai
npm test                 # kiểm thử đơn vị: đọc số, cây cộng dồn, quy đổi TT200, trích xuất, Excel, máy chủ, bot…
npm install && npm run e2e   # chạy trang thật trong Chromium, máy chủ AI giả lập
# xem giao diện từng bước: E2E_SHOTS=/thư/mục npm run e2e
```

Template model elevaTO đổi (thêm / bớt / đổi thứ tự dòng trong `03.Input_FS`) thì sinh lại bố cục:

```bash
cd ai
python3 tools/doc-template.py /đường/dẫn/elevaTO_Model_Template.xlsx > js/targets/sheets.js
npm test                 # bài kiểm tra chốt mọi dòng của template đều nằm đúng dòng đó trong file xuất ra
```
