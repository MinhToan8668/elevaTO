# elevaTO AI BCTC — trích xuất BCTC mẫu 2026 cho model forecast

Công cụ **riêng** (không dính landing page, không dính công cụ upload): tải BCTC lên → xem từng trang, tick
trang cần lấy → AI tự nhận trang thuộc báo cáo nào và đọc số → rà soát, xem biểu đồ & chỉ số → xuất
**Form chuẩn hóa 2026** (.xlsx) hoặc điền thẳng vào **model elevaTO** (chỉ học viên / giảng viên).

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
- **Nhiều file, nhiều kỳ**: mỗi BCTC có sẵn cột kỳ trước. Nên tải BCTC năm gần nhất + các năm trước
  (model cần ≥ 4 năm), thêm báo cáo quý mới nhất nếu có. Hai báo cáo cùng kỳ khác số → dùng số của báo cáo
  mới hơn (đã điều chỉnh hồi tố) và liệt kê chỗ khác nhau.
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
- **Biểu đồ & chỉ số**: một tab ở bước rà soát vẽ doanh thu / lợi nhuận, cơ cấu tài sản, cơ cấu nguồn vốn,
  lưu chuyển tiền tệ, biên lợi nhuận, kèm bảng chỉ số (thanh toán hiện hành / nhanh, nợ trên vốn chủ, ROA,
  ROE, vòng quay tài sản…). Máy tự tính từ số đã trích, AI không tham gia. Ở bước rà soát tick dòng nào thì
  Form chuẩn hóa xuất dòng đó.
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

- `/thongke` cho biết chuỗi model đang dùng và model nào đang quá tải.
- Bot **hỏi tin mới mỗi phút** (lịch `hoiTelegram`, tạo tự động khi chạy `caiDat`) thay vì webhook, vì Apps
  Script trả 302 cho webhook. Có lệnh thì bot bám thêm ~40 giây để trả lời gần như tức thì.
- Chỉ **tin riêng do chính chat ID quản trị gõ** mới được xử lý (không nhận nhóm, không nhận tin chuyển tiếp);
  người lạ nhắn bot thì bot im lặng. Nút bấm kiểm tra cả chat lẫn người bấm.
- Key Gemini hỏng (401/403) → bot báo, tối đa 1 lần mỗi giờ. Ai xin mã đặt lại mật khẩu bot cũng báo.
- `/ungho` đáp lại **tên ngân hàng bot nhận ra** để bạn đối chiếu trước khi nó hiện lên trang — sai BIN là
  người ủng hộ quét QR không được. Bảng mã ngân hàng **sinh tự động** bằng `tools/banks.py` từ danh sách
  chính thức của NAPAS, đừng sửa tay (bot đáp lại tên lấy từ chính dòng đó nên gõ tay sai là không ai nhận ra).
- Tắt bot: chạy hàm `dungBot`. Bật lại: chạy `caiDat`.

## Cài máy chủ AI (một lần, khoảng 10 phút)

1. Vào <https://script.google.com> → **Dự án mới**, đặt tên `elevaTO AI`
   (dự án riêng — không dùng chung dự án landing page hay upload).
2. Dán toàn bộ `Code.gs` (bản elevaTO gửi riêng, đã có sẵn key, token bot và chat ID) vào `Code.gs`.
   Dùng bản trong repo thì dán key Gemini vào `GEMINI_KEY_MOI` (nhiều key cách nhau dấu phẩy), token
   @BotFather vào `TG_TOKEN_MOI`, chat ID của bạn vào `TG_CHAT_MOI`.
3. ⚙ **Cài đặt dự án** → tick *Hiển thị tệp kê khai "appsscript.json"* → mở `appsscript.json`, dán nội dung
   `ai/backend/appsscript.json`.
4. Mở bot trên Telegram, bấm **Start** (bot chỉ nhắn được cho người đã Start).
5. Chọn hàm **`caiDat`** → **Chạy** → cấp quyền (gọi ra ngoài, tạo bảng tính, tạo lịch chạy cho bot). Nhật ký in
   ra link bảng tài khoản và model sẽ dùng; bot nhắn thử "đã kết nối". Chạy xong có thể đổi các dòng key/token
   về `'DAN_…'` rồi Lưu (đã cất trong Script Properties).
6. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi với tư cách*: **Tôi**; *Ai có quyền truy cập*:
   **Bất kỳ ai** → Triển khai → chép link `…/exec`.
7. Dán link `/exec` vào `ai/js/config.js` (`API = '…'`) và đẩy lên GitHub (hoặc gửi link cho Claude làm hộ).
   Trước bước này trang hiện "đang được cài đặt" và chưa cho đăng nhập.
8. Tự đăng ký một tài khoản trên trang, rồi nhắn bot `/giangvien <email của bạn>` (hoặc sửa email trong hàm
   `taoQuanTri` → Chạy) để thành giảng viên.

Sửa `Code.gs` sau này: dán bản mới → **Triển khai → Quản lý triển khai → ✎ → Phiên bản: Phiên bản mới →
Triển khai** để giữ nguyên link `/exec`, rồi chạy lại `caiDat` một lần (nếu Google hỏi quyền mới thì cấp).
Thêm key: sửa Script Property `GEMINI_KEYS` (mỗi dòng một key) hoặc dán vào `GEMINI_KEY_MOI` rồi chạy lại `caiDat`.

### Bảo vệ

- Mật khẩu băm 1500 vòng có muối + "tiêu" riêng trong Script Properties; bảng chỉ giữ bản băm của mật khẩu
  và của phiên. Sai mật khẩu 5 lần → khoá tạm 10 phút; có ô bẫy bot và trần số đăng ký mỗi giờ.
- Mỗi tài khoản có hạn mức lượt/ngày theo vai trò (giữ lượt trước khi gọi Gemini, lỗi thì trả lại) và tối đa
  `AI_RPM_MA` (6) lượt/phút; mỗi key tối đa `AI_RPM` (12) lượt/phút.
- Nhiều key Gemini: key nào hết hạn mức phút (429) thì nghỉ, máy chủ chuyển ngay sang key khác.
- Model do máy chủ chọn, trang không đổi được. Máy chủ giữ **chuỗi model dự phòng** (bản flash chính thức mới
  → cũ, cuối cùng flash-lite): model nào quá tải (HTTP 503) thì nghỉ 5 phút và máy chủ chuyển ngay sang model
  sau **trong cùng một lượt** — mỗi model có hạn mức miễn phí riêng nên ít khi báo "quá tải". Muốn cố định một
  model: Script Property `AI_MODEL`.
- Máy chủ chỉ chuyển tiếp nội dung trích xuất (PDF / ảnh / chữ có giới hạn độ dài), không cho dùng công cụ.
- Trang chỉ chạy script của chính nó (CSP `script-src 'self'` + `'wasm-unsafe-eval'` cho bộ giải ảnh scan của pdf.js,
  thư viện trong `vendor/`), không dùng `innerHTML`
  với dữ liệu; phiên làm việc tự lưu theo từng tài khoản (máy dùng chung không lộ số của người khác).

### Giới hạn

- Gemini miễn phí giới hạn số lượt mỗi phút / mỗi ngày theo **từng model**. Máy chủ giữ tối đa `AI_RPM` (12)
  lượt/phút mỗi key, `AI_RPM_MA` (6) lượt/phút mỗi tài khoản; hết hạn mức ở model này thì đổi key rồi đổi
  model (tối đa `AI_THU_TOI_DA` = 5 lần gọi cho một lượt), quá nữa thì trang tự chờ rồi thử lại.
  Một BCTC tốn 3 lượt ở Form phổ thông; Form riêng elevaTO thêm 1 lượt mỗi nhóm thuyết minh và 1 lượt mỗi
  12 trang AI phải tự nhận diện.
- Apps Script chỉ chờ một lượt gọi tối đa ~60 giây: bảng dài quá thì trang tự chia đôi rồi gọi lại.
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
├── js/config.js                 link /exec của máy chủ AI
├── js/ui/auth.js                đăng nhập / đăng ký / quên mật khẩu, menu tài khoản
├── js/ui/donate.js              hộp Ủng hộ; js/core/vietqr.js dựng nội dung mã QR VietQR
├── js/chart2026.js              danh mục chỉ tiêu mẫu TT99 + cây cộng dồn + mã TT200 tương ứng
├── js/core/                     logic thuần (đọc số VN, kiểm tra, quy đổi, nhận trang, prompt, dữ liệu nhiều kỳ, Excel)
├── js/core/xlsxout.js           bộ ghi .xlsx viết tay (kiểu ô, tên đã định nghĩa, danh sách chọn trong ô)
├── js/core/formxlsx.js          Form chuẩn hóa 2026; js/core/notesxlsx.js các sheet thuyết minh
├── js/core/fcalc.js             tính sẵn giá trị ô công thức để trình xem không tự tính cũng thấy số
├── js/core/metrics.js           chỉ số tài chính + số liệu biểu đồ (máy tính, không qua AI)
├── js/ui/charts.js              vẽ biểu đồ SVG (không dùng thư viện ngoài)
├── js/core/modelxlsx.js         Form chi tiết elevaTO — sao y sheet 03.Input_FS, giữ nguyên số dòng
├── js/targets/model.js          quy ba báo cáo + thuyết minh về đúng dòng sheet 03.Input_FS
├── js/targets/sheets.js         bố cục 03.Input_FS, SINH TỰ ĐỘNG từ template (đừng sửa tay)
├── tools/doc-template.py        đọc file model elevaTO (.xlsx) → sinh js/targets/sheets.js
├── tools/banks.py               lấy bảng mã ngân hàng NAPAS → khối var BANK trong backend/Code.gs
├── backend/                     máy chủ Apps Script
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
