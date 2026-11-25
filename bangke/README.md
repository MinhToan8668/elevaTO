# Bảng kê Giải ngân — theo dõi hóa đơn giải ngân & hồ sơ gốc

Gửi cho team **một file HTML** (`dist/BangKe_GiaiNgan.html`, tạo bằng `node build.mjs`) — mở bằng Chrome/Edge là chạy,
không đăng nhập, không máy chủ, không cần mạng (trừ khi dùng AI Gemini). `index.html` là bản nguồn để sửa & test.

## Làm được gì
- **Quản lý theo từng công ty** (giao diện kính mờ cùng kiểu PDF Studio, có chế độ sáng / tối):
  - Trang đầu: **Việc hôm nay** (mỗi việc ghi rõ của công ty nào, bấm là tới đúng chỗ) + thẻ từng công ty
    (dư nợ / hạn mức từ file Excel, việc tồn, số hồ sơ đang làm). Không cộng lẫn số liệu giữa các công ty.
  - Trang công ty: **Tổng quan · Hồ sơ giải ngân · Theo dõi KUNN · Sổ hóa đơn đã GN · Thông tin & mẫu Word**.
  - **Hồ sơ giải ngân**: thả toàn bộ file KH gửi (PDF scan, ảnh, Excel bảng kê, Word) → bảng kê đọc bằng bộ đọc
    bảng kê, các file khác **Gemini đọc** (tách nhiều chứng từ trong một PDF, nhận loại, lấy số / ngày / tiền /
    bên bán / tài khoản…). **Danh sách kiểm tra tự sinh theo đúng bộ chứng từ** của lần đó: giải ngân trùng / vượt
    (sổ hóa đơn), bảng kê ghi sai số / ngày / tiền so với chứng từ, MST bên mua, hóa đơn sau ngày GN hoặc > 90 ngày,
    hóa đơn trước ngày HĐMB, HĐMB hết hạn, tài khoản nhận tiền lệch (thông báo tiền điện ↔ UNC / TK đã dùng),
    tờ khai ↔ giấy nộp NSNN, CIC (hiệu lực 10 ngày, nợ nhóm 2), vượt hạn mức khả dụng, hạn HĐTD.
    Mục nào không áp dụng thì không hiện; bỏ qua được kèm lý do.
  - Bảng kê theo **PO / đơn đặt hàng / hợp đồng** (chưa có hóa đơn) cũng đọc được; bảng trình bày lạ thì AI đọc từng dòng.
  - Hồ sơ không cần nữa: nút 🗑 ở từng dòng / trong hồ sơ (hoàn tác bằng ↶). Việc cần làm của công ty ẩn được (✕).
  - Theo dõi KUNN: dòng tổng dư nợ; **ghi chú từng KUNN** — KH trả nợ 1 phần (trừ vào dư nợ hiển thị), gia hạn / đổi
    ngày trả (đáo hạn theo ngày mới), quá hạn đang xử lý, đã tất toán (thôi nhắc), ghi chú tự do.
  - **Bổ sung ngay trong mục kiểm tra**: thiếu hạn mức → nhập tại chỗ; thiếu / cũ CIC → thả file hoặc nhập tay ngày + nhóm nợ;
    thiếu giấy nộp NSNN, HĐMB / PO, chứng từ của một dòng → thả file đúng loại; dòng bảng kê sai → sửa dòng; TK lệch → dùng TK
    trên chứng từ. Mục đạt tick xanh, lỗi đỏ. Bảng kê sửa / thêm / xóa dòng được, mọi thay đổi ghi **Lịch sử thay đổi**,
    hoàn tác / làm lại bằng ↶ ↷. **Xem nhanh** file đã up (👁) không rời trang.
  - **Số KUNN**: gợi ý số tiếp theo theo số lớn nhất trong file Excel / sổ hóa đơn, chỉnh ±, chọn hậu tố (.26/.27), báo trùng.
  - **Gói tải lên**: tên từng file sửa được, tải lẻ từng file, kèm bảng kê Excel chuẩn; tên gói `HoSoGN_<KH>_KUNN_<số>_<ngày>.zip`.
  - Nút **🏢 Công ty** trên thanh đầu trang (Ctrl+K) để chuyển nhanh giữa các công ty.
  - Xem từng chứng từ: bản scan cạnh số liệu AI đọc, sửa tay → kiểm tra chạy lại.
  - **Dải mốc**: bấm một mốc → tool viền đỏ đúng chỗ cần làm và ghi việc phải làm. Mốc tự tick chỉ khi việc đã có thật
    (có file, hết lỗi + có bảng kê, có số KUNN, có bản KUNN / PDGN đã ký trong hồ sơ); các mốc còn lại bấm “Đã xong”,
    chỉ bấm được khi mốc trước đã xong; mốc không cần thì “Bỏ qua”. Chứng từ bổ sung sau GN có hạn.
  - Kết quả: soạn KUNN & PDGN (mẫu Word riêng công ty), ghi vào sổ hóa đơn, bảng kê Excel, **gói file tải lên hệ
    thống** đã đặt tên theo thứ tự (.zip).
  - **Sổ theo dõi KUNN tự lập, nhiều sheet** (mỗi công ty một sheet, tiêu đề cột tự đặt): tool gợi ý sheet theo tên
    viết tắt công ty, dò cột (số KUNN, ngày GN, đáo hạn, lãi suất, số tiền, đã trả, dư nợ; hàng nhóm “HMTD 2025”),
    cho xem trước, đổi sheet / cột, hoặc nhờ AI nhận cột. Cách đọc lưu theo công ty; file sửa (thêm dòng, chèn cột,
    dời tiêu đề) bấm **Đọc lại** vẫn đúng — tool tìm lại cột theo tên tiêu đề đã nhớ.
  - **Dư nợ đọc từ file Excel QUẢN LÝ GIẢI NGÂN** của công ty (sheet KHE_UOC, DANH_MUC, UBG — xem `giaingan/`):
    gốc còn lại, hạn mức, khả dụng, đáo hạn, thu nợ; thông tin công ty còn trống được lấy từ DANH_MUC. Tool chỉ đọc file.
  - File KH gửi lưu trên máy (IndexedDB) và thư mục chung (`BangKe_GiaiNgan/files/`), hồ sơ ở `hs_<id>.json`.
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
- **📝 Soạn KUNN & PDGN** (nút trong trang khách hàng / trong từng KUNN):
  - **Mẫu riêng từng KH**: nạp file Word KUNN và PDGN của KH — *bản lần trước đã điền cũng được*. Tool tự nhận các ô
    cần điền (số/ngày KUNN, HĐTD, số tiền + bằng chữ, tổng dư nợ, ngày GN, đáo hạn, lãi suất, ngày trả lãi, CIF, TTKD,
    QLKH, TestKey, CLTF, CIC, bảng thụ hưởng, bảng chứng từ…) và thay bằng `{{trường}}`; phần riêng của KH (TSBĐ, điều
    kiện…) giữ nguyên. Mẫu lưu trên máy + `BangKe_GiaiNgan/mau/<loại>_<id KH>.docx` ở thư mục chung. Có thể tự viết
    mẫu bằng Word với `{{so_kunn}}`, dòng bảng `{{ct.so}}` / `{{tth.ten}}` (`:gop` = gộp ô dọc cùng bên thụ hưởng).
  - Điền từ thông tin KH đã nhớ + KUNN + các dòng bảng kê; tự tính bằng chữ (như hàm DocSoTien), tổng dư nợ,
    đáo hạn (số ngày vay hoặc số tháng, cảnh báo rơi vào lễ Tết), ngày trả lãi đầu, CLTF khả dụng, **TestKey**
    (cùng công thức tool `giaingan/`, bảng key nạp riêng trên từng máy — không nằm trong file).
  - Giao diện giống bản Word: **chữ đỏ = tool điền** (bấm để sửa, áp dụng mọi chỗ), sửa tự do từng đoạn (nền vàng),
    Enter thêm đoạn, thêm/xóa dòng bảng (thanh nhỏ hiện ở lề trái trang khi rê chuột vào dòng), tick ô ☐ (cả ô tick
    kiểu cũ FORMCHECKBOX). **Thanh công cụ kiểu Word**: phông, cỡ chữ, đậm / nghiêng / gạch chân / gạch ngang, chỉ số
    trên/dưới, màu chữ, tô sáng, trả định dạng về như mẫu, căn trái/giữa/phải/đều, thụt lề, chèn/xóa dòng bảng,
    hàng **Công cụ bảng** (hiện khi con trỏ trong bảng): chèn/xóa dòng, cột, gộp ô phải / dưới, tách ô, căn chữ trên /
    giữa / dưới ô, chia đều cột, **tự khớp (AutoFit)**: vừa nội dung / vừa khổ trang / cố định độ rộng cột, tô nền ô, xóa bảng, kẻ / bỏ khung bảng (cả bảng, khung ngoài, từng ô, cả dòng), gõ "1. " / "a) " / "- " đầu đoạn tự
    thụt dòng treo và Enter tự ra số / gạch tiếp (Enter ở mục trống = kết thúc danh sách), số thứ tự của Word không xóa
    nhầm được và tự đánh lại khi thêm đoạn, bảng giữ đúng độ rộng cột của file gốc, tìm & thay (Ctrl+H), hoàn tác / làm lại (Ctrl+Z / Ctrl+Y), phóng to thu nhỏ (Ctrl + lăn chuột) — định dạng đổi
    được ghi vào file Word xuất ra. Kiểm tra: số tiền ≠ tổng chứng từ, bằng chữ sai, vượt khả dụng,
    chứng từ sau ngày GN / quá 90 ngày (đối chiếu công nợ), CIC quá 10 ngày, GN trước HĐTD / sau hạn HM, thiếu TK thụ
    hưởng, LS < FTP, ô còn trống; **🤖 AI rà soát** đối chiếu chéo KUNN ↔ PDGN.
  - **Xuất Word** (tùy chọn giữ chữ đỏ để soát), **Lưu** (nhớ thông tin KH cho lần sau, phần sửa tay theo KUNN).

- **Hồ sơ giải ngân — bổ sung**: bảng kê theo PO (`Tên NCC | Số PO | Ngày | Số tiền PO | Số tiền GN`) đọc tự động; file
  Excel trình bày lạ → hộp **chọn cột tay** (sheet, hàng tiêu đề, cột nào là gì, xem trước số dòng); xem trước file Excel
  ngay trong trang chứng từ; nhận **Báo cáo CLTF (CL - KERNEL - TF)**: so hạn mức khả dụng với số tiền giải ngân, cảnh
  báo CLTF cũ. **Số KUNN**: chỉ số trong ngoặc tự +1 mỗi lần; số gốc và đuôi năm (đổi khi có gói giải ngân / HĐTD
  mới) sửa trực tiếp, tool nhớ cho công ty. Xóa file chứng từ khỏi hồ sơ ngay trong trang xem chứng từ.
- **Mốc hồ sơ** (chỉ các bước tool làm / theo dõi được): Nhận chứng từ → Kiểm tra → Có số KUNN → Soạn KUNN & PDGN (tự
  xong khi lưu / xuất Word) → **Đã giải ngân** (bấm 1 lần → KUNN chuyển sang tab Theo dõi KUNN để theo dõi đáo hạn và
  chứng từ bổ sung).
- **Chứng từ bổ sung bản gốc**: chọn chứng từ KH chỉ nộp bản sao (gợi ý từ chứng từ đã thả: hóa đơn, tiền điện, tờ
  khai…), Gốc/Sao, **số ngày theo yêu cầu ĐVKD** (đặt mặc định riêng từng công ty, không cố định 30 ngày) → hạn bổ
  sung. Danh sách tự điền vào bảng “Chứng từ bổ sung” của PDGN và dùng làm hạn hồ sơ gốc ở tab Theo dõi KUNN.
- **Bỏ file**: ✕ ở từng chứng từ (bỏ file khỏi hồ sơ, hoàn tác được) và ✕ ở gói tải lên (chỉ bỏ khỏi gói, ↺ đưa lại).
  **CIC**: AI đọc mẫu báo cáo (S10A, R20…) và ngày tra cứu; tên file trong gói theo mẫu (09_CIC_S10A.pdf, 09_CIC_R20.pdf).
- **Diễn giải chứng từ giải ngân (PDGN)**: đoạn sau dòng “Chứng từ giải ngân:” thành trường riêng — tool viết sẵn từ
  bảng chứng từ (NCC, hợp đồng, PO / hóa đơn, ngày), **🤖 AI viết lại** theo văn phong mẫu, bạn sửa tiếp (sửa rồi thì giữ).
- **Đồng bộ hồ sơ ↔ theo dõi**: hồ sơ đã chuyển sang theo dõi, sửa gì (số KUNN, ngày, dòng bảng kê, chứng từ bổ sung) thì
  cập nhật đúng KUNN đó — không sinh KUNN lặp (bản lặp cũ tự dọn). Biểu đồ giải ngân ở Tổng quan công ty cũng tính cả KUNN
  trong file Excel. KUNN hồ sơ ghi lệch đuôi năm so với file Excel (cùng số trong ngoặc, cùng ngày) được ghép vào một dòng.
- **Hạn mức tín dụng** (tab Thông tin): mỗi lần cấp mới / cấp lại / điều chỉnh (HĐTD, phụ lục) là một mục — ngày hiệu
  lực, hạn duy trì, số / ngày HĐTD, tổng hạn mức và các **hạn mức con** (cho vay VND, cho vay ngoại tệ, L/C, bảo lãnh,
  chiết khấu…; tiền tệ + tỷ giá quy đổi; ghép với dòng HMTD của file Excel để thấy dư nợ / khả dụng từng hạn mức). Nhập
  số tiền kèm đơn vị: “300 tỷ”, “500 tr”, “2 tỷ 500 triệu”, “300.000.000.000 đ”. Tool lấy đúng mục theo **ngày giải
  ngân**: khả dụng, PDGN (hạn mức, cho vay, L/C, khả dụng từng dòng), soát GN trước hiệu lực / sau hạn duy trì / hạn mức
  sắp hết. Cảnh báo khi hạn mức nhỏ hơn dư nợ (thường do nhập sai đơn vị) và hạn mức ngoại tệ chưa có tỷ giá.
- **Gói lãi suất / UBG**: đọc từ sheet UBG của file Excel + thêm / sửa tay (ngày hiệu lực, lãi suất, kỳ hạn tối đa,
  hạn mức gói), ẩn gói không dùng. Hồ sơ chọn gói ở ô **Gói lãi suất** → lãi suất tự điền KUNN / PDGN, KUNN ghi gói;
  tool soát gói còn hiệu lực ngày GN, còn hạn mức gói (đã dùng theo file Excel + sổ), số ngày vay ≤ kỳ hạn tối đa; nhắc
  chọn gói khi có gói đang hiệu lực.
- **Lãi suất thả nổi**: mỗi KUNN có lịch điều chỉnh lãi suất (từ ngày, LS mới, ghi chú) ở khung chi tiết; **± Điều chỉnh
  lãi suất** hàng loạt cho KUNN đang vay (tất cả / theo gói / không theo gói, cộng trừ điểm % hoặc đặt bằng, xem trước,
  bỏ chọn từng KUNN). Bảng theo dõi hiện LS cũ → mới.
- **📦 Theo gói** (tab Theo dõi KUNN): mỗi gói lãi suất / UBG — đã giải ngân, dư nợ hiện tại, hạn mức gói, còn lại, danh
  sách KUNN; KUNN không theo gói tách riêng; **⬇ Xuất Excel** (sheet tổng hợp + chi tiết KUNN).
- **Nhắc hạn mức & gói** (trang đầu + việc cần làm của công ty): hạn mức sắp / đã hết hạn duy trì (≤ 60 ngày), hạn mức
  mới sắp hiệu lực, gói sắp hết hiệu lực (≤ 30 ngày), gói đã dùng ≥ 90% hạn mức gói.
- **＋ Thêm KUNN** (tab Theo dõi KUNN): KUNN chưa làm qua hồ sơ trên tool — nhập số KUNN, ngày GN, số tiền, số ngày vay
  (tự tính đáo hạn), gốc còn lại, gói / lãi suất, bên thụ hưởng, chứng từ bổ sung bản gốc + hạn; sửa lại được.
- **Tra soát mục đích & HĐMB**: tool tự soát HĐMB bên mua là KH, bên bán trùng NCC bảng kê (dòng không ghi số HĐMB được
  ghép theo bên bán), tổng hóa đơn (kể cả KUNN trước) không vượt giá trị HĐMB, hàng hóa trên hóa đơn khớp HĐMB và mục
  đích vay; **🤖 AI tra soát mục đích & HĐMB** đánh giá sâu (đúng mục đích, điều khoản thanh toán, ngày, tài khoản nhận,
  dấu hiệu bất thường) — kết quả vào danh sách kiểm tra, báo khi chứng từ đổi sau lần soát.
- **Bổ sung bản gốc** (một cột chung ở Theo dõi KUNN, lọc “Chờ bổ sung bản gốc”): KUNN có hồ sơ → theo danh sách chứng từ
  bổ sung của hồ sơ (tick đã nhận, **sửa hạn** ngay ở bảng theo dõi); KUNN nạp từ bảng kê cũ → theo từng hóa đơn, hạn
  nhận bản gốc sửa được.
- **⬇ Excel tổng hợp** (tab Theo dõi KUNN): 6 sheet — Theo dõi KUNN (đủ cột: ngày, đáo hạn, gốc, đã thu, còn lại, LS ban
  đầu / hiện tại, gói, bên thụ hưởng, bổ sung bản gốc, trạng thái, nguồn, ghi chú), Hạn mức (cả hạn mức con), Gói lãi
  suất, Lịch lãi suất, KUNN chưa có trong file Excel, Đã xóa.
- **KUNN chưa có trong file Excel** (tab Thông tin): KUNN thêm / ghi trong tool chưa có trong file theo dõi — 📋 sao chép
  hoặc ⬇ tải các dòng theo đúng thứ tự cột của sheet để dán vào file Excel; lần đọc lại tool tự ghép.
- **Đã giải ngân → theo dõi**: bấm “Đã giải ngân” trong hồ sơ → KUNN vào Theo dõi KUNN đủ số tiền, ngày GN, ngày đáo hạn
  (ngày GN + số ngày vay), lãi suất, gói; tính vào **dư nợ vay** (= file Excel + KUNN đã giải ngân trong tool, mỗi KUNN
  một lần). Lưu / xuất KUNN & PDGN thì hồ sơ tự lấy số KUNN, lãi suất, ngày đáo hạn, bảng “Chứng từ bổ sung” từ văn bản.
  Ngày đáo hạn hiện **thứ trong tuần**; rơi vào thứ 7, CN, ngày lễ thì báo đỏ + nút lùi / dời sang ngày làm việc.
- **Bảng theo dõi KUNN**: **🗑 Xóa KUNN** (của tool hoặc dòng từ file Excel) → KUNN chuyển sang mục **🗑 Đã xóa** (lưu vết
  ai xóa, lúc nào), không còn tính vào bảng theo dõi, dư nợ, đáo hạn — đọc lại file Excel cũng không hiện lại; **♻ Khôi
  phục** đưa về như cũ, **✕ Xóa hẳn** bỏ luôn. Mỗi KUNN có **lịch sử thay đổi**; ↶ hoàn tác ngay.
- **Sổ hóa đơn**: biểu đồ + bảng **tổng hợp giải ngân theo tháng** tính đủ mọi KUNN (có danh sách hóa đơn hoặc chỉ có trong
  file Excel theo dõi). Kiểm tra hóa đơn trùng / vượt cần danh sách hóa đơn của KUNN. Khi file Excel theo dõi có nhiều KUNN hơn, bấm
  **⬆ Thêm file bảng kê cũ** (chọn nhiều file / file tổng hợp nhiều KUNN, bỏ qua KUNN đã có).

## Cài đặt (nút ⚙ hoặc Alt+F9)
- **API key Gemini**: nạp trong Cài đặt, lưu trên trình duyệt máy đó. Không ghi key vào file.
- **Thư mục chung (đồng bộ nhiều máy)** — như CIC Analyzer: cả team bấm **📁 Chọn thư mục chung** và chọn cùng một
  thư mục nội bộ (ổ mạng chung, thư mục OneDrive/Google Drive đồng bộ…). Tool tạo thư mục con `BangKe_GiaiNgan/`:
  `kh_<id>.json` (khách hàng), `ku_<id>.json` (mỗi KUNN kèm các dòng), `nk_<khách hàng>_<máy>.json` (nhật ký).
  Sửa ở máy nào thì tệp đó được ghi lại ngay; máy khác quét thư mục 30 giây/lần hoặc bấm **Đồng bộ ngay**, lấy bản
  có giờ sửa mới hơn. Xóa = ghi đánh dấu `deleted` để máy khác xóa theo. Mỗi lần mở file, trình duyệt có thể hỏi lại
  quyền → bấm “Kết nối lại” trên thanh trên cùng.
  Lưu ý: hai người cùng sửa **một KUNN** trong cùng ~30 giây thì bản lưu sau cùng thắng.
  Bản ghi **công ty** (ghi chú KUNN, lịch lãi suất, hạn mức, gói, KUNN đã xóa, việc đã ẩn) được **gộp** khi hai máy
  cùng sửa — không còn bản sau đè bản trước. File đính kèm thêm lúc chưa kết nối được giữ lại và đẩy lên khi kết nối lại;
  **Gửi toàn bộ** gửi cả file. Lịch nghỉ lễ và hạn hồ sơ gốc mặc định (Cài đặt) dùng chung cả team qua `cfg_team.json`.
- **Sao lưu / Nạp sao lưu**: gói `.zip` gồm dữ liệu, file đính kèm (scan hóa đơn…), mẫu Word, lịch nghỉ; nạp lại được
  cả gói `.zip` lẫn file `.json` cũ (gộp theo bản sửa sau cùng).

## Lãi suất của hồ sơ
- “Điều kiện khoản vay” ở đầu hồ sơ có **Gói lãi suất** (nếu công ty có gói / UBG) và ô **Lãi suất %/năm**; dòng dưới ghi rõ
  nguồn: theo gói nào (kèm hiệu lực), theo gói nhưng đã sửa tay (có nút “↺ theo gói”), nhập tay cho hồ sơ, hoặc đang dùng
  lãi suất mặc định công ty (tab Thông tin).
- Lãi suất dùng chung với bản soạn KUNN & PDGN: mở soạn là thấy; sửa trong bản soạn rồi Lưu / Xuất Word là hồ sơ cập nhật.
  KUNN theo dõi lấy lãi suất này làm lãi suất ban đầu.
- Số KUNN trùng: khung báo nói rõ trùng với hồ sơ nào (có link mở) hay KUNN nào; chỉ khóa nút soạn / ghi sổ khi số đang
  thuộc hồ sơ khác. Trùng KUNN nhập tay / sổ hóa đơn thì ghi sổ sẽ gắn hồ sơ vào KUNN đó.

## TestKey
- **Nạp bảng key**: Cài đặt → 5. TestKey → “🔑 Nạp bảng key / logic TestKey”, hoặc bấm “Nạp bảng key TestKey” ở ô TestKey của
  hồ sơ. Chọn thẳng file HTML công cụ TestKey cũ (tool đọc khối bảng key trong file, **không chạy mã trong file**), hoặc file
  `.json`. Có logic / bảng key mới dạng khác thì chọn file đó — AI (Gemini) đọc hiểu và trích bảng key, báo nếu cách tính
  khác cách tool tính.
- Trước khi dùng có hộp **xem trước & thử tính** (mã CN, ngày, số tiền, loại tiền → TestKey) để so với công cụ cũ.
- Bảng key **chỉ lưu trên máy này** (không đưa lên thư mục chung, không có trong repo). Bảng thiếu key nào (vd A2..A9 — số
  tiền ≥ 200 tỷ) thì gặp số tiền đó tool báo “nhập TestKey tay”, không tự tính sai. Loại tiền “VNĐ” được hiểu là VND.

## CIC đặt tên rõ ràng
- Mỗi CIC hiện “CIC <mẫu> · <đối tượng tra>”, dòng dưới: vai trò (KH vay / người đại diện / bảo lãnh…) hoặc DN / cá nhân,
  MST / CCCD, ngày tra, nhóm nợ. Mẫu (S10A, R20…) đọc từ báo cáo, báo cáo không ghi thì lấy từ tên file.
- Kiểm tra CIC theo **từng đối tượng** (CIC mới nhất của mỗi người / DN): hết hiệu lực, nợ nhóm 2+, thiếu ngày / nhóm nợ
  báo kèm tên đối tượng; cùng mẫu + đối tượng + ngày có nhiều bản → nhắc bỏ file trùng. Ngày CIC trong KUNN / PDGN lấy CIC
  của chính KH vay. Tên file trong gói tải lên: `09_CIC_S10A_<tên>`.
- CIC đọc trước bản này chưa có đối tượng: bấm “AI đọc lại” ở file đó, hoặc mở chứng từ nhập tay.

## Thu nợ & lịch sử quá hạn
- KUNN quá đáo hạn mà KH đã trả: ở khung chi tiết KUNN (tab Theo dõi KUNN) bấm **✓ Đã trả đúng hạn** (quên đánh dấu — không
  tính quá hạn) hoặc chọn ngày trả thực tế rồi **✓ KH đã trả hết ngày này**. Nhiều KUNN cùng lúc: nút **✓ Đánh dấu đã thu nợ**
  trên thanh lọc (mặc định ngày trả = ngày đáo hạn, sửa từng dòng được). Bấm nhầm: nút **↶ Hoàn tác** ngay trên thông báo,
  nút **↺ Bỏ đánh dấu đã trả** trong khung chi tiết, hoặc ↶ / ↷ (Ctrl+Z / Ctrl+Y) trên thanh trên cùng.
- Tool tự ghi **lịch sử quá hạn**: trả sau ngày đáo hạn (ngày trả lấy từ ghi chú hoặc cột ngày thu của file Excel), đang
  quá hạn, quá hạn rồi mới gia hạn. Chip **⏰ Lịch sử quá hạn** cho số lần quá hạn, đang quá hạn, lâu nhất, trung bình,
  tỷ lệ trả đúng hạn; ô “Quá hạn trả nợ” ở Tổng quan công ty; sheet “Lich su qua han” trong Excel tổng hợp.
- Lần nào do quên đánh dấu / số liệu sai thì bấm **Không tính** và ghi lý do — vẫn lưu vết (ai, lý do), không cộng vào thống kê;
  **↺ Tính lại** để bỏ. Lý do quá hạn thật ghi bằng ghi chú “Quá hạn — đang xử lý”.
- Hồ sơ ↔ bản soạn KUNN & PDGN: ngày GN, số ngày vay, gói / lãi suất, số KUNN, chứng từ bổ sung dùng chung; trường dùng chung
  có dấu “↔ hồ sơ” trong bản soạn, Lưu / Xuất Word là hồ sơ cập nhật theo.

## Quy tắc tool tự giữ (soát toàn diện 11/2026)
- **Hồ sơ ↔ KUNN theo dõi**: mọi thay đổi ở hồ sơ (ngày GN, số ngày vay, lãi suất, gói, dòng bảng kê, chứng từ bổ sung)
  tự cập nhật KUNN trong một bước hoàn tác; ngày GN / số KUNN / lãi suất / đáo hạn / bảng “Chứng từ bổ sung” sửa trong
  trình soạn KUNN & PDGN ghi về hồ sơ khi Lưu / Xuất. Trạng thái bản gốc, “chứng từ thiếu”, ngày nhận đã ghi ở Sổ hóa đơn
  không bị hồ sơ ghi đè. Hạn bổ sung của KUNN = hạn **sớm nhất** còn chờ.
- **KUNN chưa giải ngân** (hồ sơ mới mở soạn thảo, chưa bấm “Đã giải ngân”) không tính vào giải ngân tháng / năm, biểu đồ,
  báo cáo theo gói (hiện riêng “chờ GN”), “Chưa có trong file Excel”, soát trùng hóa đơn (chỉ nhắc “đang ở hồ sơ khác”),
  lọc “Đã tất toán”. Xóa hồ sơ thì KUNN chưa giải ngân xóa cùng; KUNN đã giải ngân giữ lại.
- **Không đè KUNN của hồ sơ khác**: số KUNN đang thuộc hồ sơ / KUNN khác (kể cả đã xóa chưa xóa hẳn) → nút Ghi sổ / Soạn
  khóa, bảng kê KH gửi có số cũ không tự điền, gợi ý số tiếp theo bỏ qua số đã xóa. KUNN đã xóa khỏi theo dõi không tự
  sống lại khi mở hồ sơ — phải khôi phục ở mục Đã xóa. Thêm KUNN nhập tay trùng số → mở dòng đã có, không tạo bản thứ hai.
- **Dư nợ hợp nhất** (file Excel + KUNN trong tool + ghi chú trả nợ) dùng ở mọi nơi: Tổng quan, thẻ công ty, vòng hạn mức,
  tab KUNN (khả dụng theo toàn công ty), Excel tổng hợp. Ghi chú “Trả 1 phần / Tất toán” vẫn có tác dụng sau khi đọc lại
  file Excel chưa cập nhật; sửa KUNN nhập tay không làm mất ghi chú.
- **Việc cần làm**: nhắc bổ sung bản gốc theo hạn dd/mm/yyyy (kể cả hồ sơ đã giải ngân), đáo hạn theo bảng theo dõi (đã
  áp gia hạn / tất toán, gồm KUNN chỉ có trong tool); ẩn ✕ một lần là xong (khóa không đổi theo ngày).
- **Kiểm tra hồ sơ**: hồ sơ đã giải ngân không báo lại vượt hạn mức / gói theo dư nợ hôm nay; giải ngân một phần hóa đơn
  / HĐMB / PO không bị báo lệch tiền (chỉ báo khi vay vượt giá trị); CIC đọc “Nhóm 2” dạng chữ, thiếu ngày / nhóm thì
  không kết luận đạt; MST bên mua mất số 0 đầu không báo sai, hóa đơn xuất cho chi nhánh chỉ nhắc; CLTF in ngày làm việc
  liền trước là được; dòng thiếu NCC / lệch cột báo “chưa soát được”; số KUNN trùng sổ báo lỗi riêng.
- **Bảng kê thả vào hồ sơ** áp đơn vị tiền trong file (ĐVT triệu / nghìn / ngoại tệ) như luồng Nạp bảng kê; dòng ghi
  “VND” cũng được quy đổi. Hủy “Thay bằng N dòng” thì file chỉ lưu kèm, không thành bảng kê thứ hai; bỏ file bảng kê thì
  hỏi xóa luôn các dòng đã đọc.
- **Trình soạn**: tab chưa mở vẫn được cập nhật (xuất “cả KUNN + PDGN” đúng); hoàn tác không làm bảng lệch danh sách;
  bảng dựng lại ghép theo tên (ct / tth / bs), báo khi phần sửa tay trong bảng bị bỏ; đoạn đã sửa tay giữ nền vàng sau
  khi mở lại và in đỏ khi “Xuất kèm chữ đỏ”; ô tự tính trong bảng không cho gõ đè; Enter khi bôi đen thay vùng chọn;
  “Xóa định dạng” trả cả thụt lề danh sách; dòng Bên thụ hưởng thêm tay giữ lại; cột “Số tiền” học từ mẫu có dữ liệu;
  học mẫu không xóa các mục sau bảng chứng từ khi bảng không có dòng Tổng; bằng chữ viết “tư / ngàn / lẻ / chẵn” không
  báo sai; mở lại bản đã lưu lấy dư nợ / CLTF / bảng chứng từ mới nếu sổ đã đổi (TK thụ hưởng giữ).
- **Giao diện**: vẽ lại trang không mất chữ đang gõ / ô đang chọn; ô ngày không nhận năm gõ dở; khung xem PDF giữ trang
  khi lưu trường; Ctrl+K không mở trên trình soạn; lịch đáo hạn nhiều KUNN/ngày hiện danh sách; dòng hồ sơ mở bằng Enter;
  hộp xóa khách hàng nói đúng (hoàn tác được, gồm hồ sơ giải ngân); hoàn tác ghi nhật ký vào đúng công ty; nạp bảng kê
  hoàn tác một bước; tên file xuất không thừa gạch dưới; “Ghi vào file bảng kê có sẵn” chèn trước dòng TỔNG.

## Kiểm thử
```bash
cd bangke && node build.mjs          # tạo dist/BangKe_GiaiNgan.html
cd bangke && node --test tests/*.test.js
cd bangke && node --test --test-concurrency=1 tests/e2e/app.e2e.js
```
Dữ liệu trong test là giả lập — **không** đưa bảng kê thật của khách hàng vào repo (repo công khai).
