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
  - Xem từng chứng từ: bản scan cạnh số liệu AI đọc, sửa tay → kiểm tra chạy lại.
  - **Dải mốc** (nhận chứng từ → kiểm tra → xin số KUNN → gửi KH ký → nhận bản ký → GĐ TTKD ký PDGN → đưa lên hệ
    thống → đã giải ngân), bấm để đánh dấu, chuột phải để bỏ qua mốc. Chứng từ bổ sung sau GN có hạn.
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
    Enter thêm đoạn, thêm/xóa dòng bảng, tick ô ☐. Kiểm tra: số tiền ≠ tổng chứng từ, bằng chữ sai, vượt khả dụng,
    chứng từ sau ngày GN / quá 90 ngày (đối chiếu công nợ), CIC quá 10 ngày, GN trước HĐTD / sau hạn HM, thiếu TK thụ
    hưởng, LS < FTP, ô còn trống; **🤖 AI rà soát** đối chiếu chéo KUNN ↔ PDGN.
  - **Xuất Word** (tùy chọn giữ chữ đỏ để soát), **Lưu** (nhớ thông tin KH cho lần sau, phần sửa tay theo KUNN).

## Cài đặt (nút ⚙ hoặc Alt+F9)
- **API key Gemini**: nạp trong Cài đặt, lưu trên trình duyệt máy đó. Không ghi key vào file.
- **Thư mục chung (đồng bộ nhiều máy)** — như CIC Analyzer: cả team bấm **📁 Chọn thư mục chung** và chọn cùng một
  thư mục nội bộ (ổ mạng chung, thư mục OneDrive/Google Drive đồng bộ…). Tool tạo thư mục con `BangKe_GiaiNgan/`:
  `kh_<id>.json` (khách hàng), `ku_<id>.json` (mỗi KUNN kèm các dòng), `nk_<khách hàng>_<máy>.json` (nhật ký).
  Sửa ở máy nào thì tệp đó được ghi lại ngay; máy khác quét thư mục 30 giây/lần hoặc bấm **Đồng bộ ngay**, lấy bản
  có giờ sửa mới hơn. Xóa = ghi đánh dấu `deleted` để máy khác xóa theo. Mỗi lần mở file, trình duyệt có thể hỏi lại
  quyền → bấm “Kết nối lại” trên thanh trên cùng.
  Lưu ý: hai người cùng sửa **một KUNN** trong cùng ~30 giây thì bản lưu sau cùng thắng.
- **Sao lưu / Nạp sao lưu**: file `.json` toàn bộ dữ liệu (gộp theo bản sửa sau cùng).

## Kiểm thử
```bash
cd bangke && node build.mjs          # tạo dist/BangKe_GiaiNgan.html
cd bangke && node --test tests/*.test.js
cd bangke && node --test --test-concurrency=1 tests/e2e/app.e2e.js
```
Dữ liệu trong test là giả lập — **không** đưa bảng kê thật của khách hàng vào repo (repo công khai).
