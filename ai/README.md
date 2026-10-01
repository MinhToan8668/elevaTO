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
  | Lấy gì | 3 báo cáo chính | 3 báo cáo + thuyết minh doanh thu/LN gộp theo mảng, TSCĐ theo nhóm, biến động vốn chủ, vay/trả nợ, lợi thế thương mại, số cổ phiếu, thuế suất |
  | Số trang mỗi file | tối đa 10 | cả file |
  | Lượt AI mỗi file | 3 | 3 + 1 mỗi nhóm thuyết minh (+ 1 mỗi 12 trang phải nhận diện) |
  | Xuất | Form chuẩn hóa 2026 (.xlsx) | thêm: điền thẳng vào model elevaTO |

  Form phổ thông **không tốn lượt nhận diện trang**: trang đã tick mà máy chưa rõ loại được gửi kèm luôn
  trong 3 lượt đọc bảng, AI tự tìm bảng cần đọc trong đó.
- **Biểu đồ & chỉ số**: một tab ở bước rà soát vẽ doanh thu / lợi nhuận, cơ cấu tài sản, cơ cấu nguồn vốn,
  lưu chuyển tiền tệ, biên lợi nhuận, kèm bảng chỉ số (thanh toán hiện hành / nhanh, nợ trên vốn chủ, ROA,
  ROE, vòng quay tài sản…). Máy tự tính từ số đã trích, AI không tham gia. Ở bước rà soát tick dòng nào thì
  Form chuẩn hóa xuất dòng đó.
- **Xuất** — hai tùy chọn, cộng lưu phiên:
  - **Form chuẩn hóa 2026** (.xlsx, mọi tài khoản): trang *Tổng quan* + *Tình hình tài chính*,
    *Kết quả kinh doanh*, *Lưu chuyển tiền tệ* theo mẫu TT99, mỗi kỳ một cột, đơn vị tuỳ chọn, dòng tổng in đậm.
  - **Điền vào model elevaTO** (chỉ **học viên / giảng viên**): chọn file model của khoá học, số điền vào sheet
    `03.Input_FS` (triệu đồng, chi phí mang dấu âm), đúng cột năm. Không đụng ô công thức, giữ nguyên biểu đồ;
    Excel tự tính lại khi mở. Tab "Xem trước model elevaTO" cho thấy từng ô sẽ ghi và nguồn số.
    Tài khoản thường thấy thẻ khoá "Chỉ dành cho học viên".
  - **Phiên làm việc** .json: làm tiếp lần sau / gửi người khác, không tốn lượt AI, không chứa thông tin đăng nhập.

## Tài khoản và vai trò

Người dùng tự **tạo tài khoản** (họ tên, email, số điện thoại, mật khẩu) rồi **đăng nhập** ngay trên trang —
không có ô link máy chủ hay mã truy cập nào. Phiên đăng nhập giữ 30 ngày, tối đa 3 máy cùng lúc.

| Vai trò (`vaitro`) | Lượt AI mỗi ngày | Điền model elevaTO |
|---|---|---|
| `free` — tài khoản thường (mặc định khi đăng ký) | 10 (`AI_LUOT_FREE`) | ✘ |
| `hv` — học viên | 40 (`AI_LUOT_HV`) | ✔ |
| `gv` — giảng viên | không giới hạn | ✔ |

Quản lý bằng **bot Telegram** (bên dưới) hoặc sửa tay trong Google Sheet **"elevaTO AI — Tài khoản"**
(tab `TaiKhoan`, do hàm `caiDat` tạo):

| Cột | Ý nghĩa |
|---|---|
| `vaitro` | `free` · `hv` · `gv` |
| `trangthai` | `active` dùng được · `cho` chờ duyệt · `off` khoá (đăng xuất khỏi mọi máy) |
| `luot_ngay` | số lượt AI mỗi ngày của riêng người này; để trống = theo vai trò |

Muốn duyệt từng người trước khi cho dùng: thêm Script Property `AI_CAN_DUYET` = `1` (người mới ở trạng thái
`cho` cho tới khi bạn bấm "Mở / duyệt" trên bot). Đổi lượt mặc định: Script Property `AI_LUOT_FREE`, `AI_LUOT_HV`.

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

- `/thongke` cho biết chuỗi model đang dùng và model nào đang quá tải.
- Bot **hỏi tin mới mỗi phút** (lịch `hoiTelegram`, tạo tự động khi chạy `caiDat`) thay vì webhook, vì Apps
  Script trả 302 cho webhook. Có lệnh thì bot bám thêm ~40 giây để trả lời gần như tức thì.
- Chỉ **tin riêng do chính chat ID quản trị gõ** mới được xử lý (không nhận nhóm, không nhận tin chuyển tiếp);
  người lạ nhắn bot thì bot im lặng. Nút bấm kiểm tra cả chat lẫn người bấm.
- Key Gemini hỏng (401/403) → bot báo, tối đa 1 lần mỗi giờ.
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
├── js/ui/auth.js                đăng nhập / đăng ký, menu tài khoản
├── js/chart2026.js              danh mục chỉ tiêu mẫu TT99 + cây cộng dồn + mã TT200 tương ứng
├── js/core/                     logic thuần (đọc số VN, kiểm tra, quy đổi, nhận trang, prompt, dữ liệu nhiều kỳ, Excel)
├── js/core/formxlsx.js          tạo file Form chuẩn hóa 2026 (.xlsx có định dạng)
├── js/core/metrics.js           chỉ số tài chính + số liệu biểu đồ (máy tính, không qua AI)
├── js/ui/charts.js              vẽ biểu đồ SVG (không dùng thư viện ngoài)
├── js/core/modelxlsx.js         tạo file Form chi tiết elevaTO (.xlsx)
├── js/targets/model.js          quy ba báo cáo + thuyết minh về đúng dòng sheet 03.Input_FS
├── backend/                     máy chủ Apps Script
├── vendor/                      pdf.js, pdf-lib, JSZip, SheetJS, phông Be Vietnam Pro (xem vendor/README.md)
└── tests/                       kiểm thử
```

Kiểm thử (Node 20+):

```bash
cd ai
npm test                 # kiểm thử đơn vị: đọc số, cây cộng dồn, quy đổi TT200, trích xuất, Excel, máy chủ, bot…
npm install && npm run e2e   # chạy trang thật trong Chromium, máy chủ AI giả lập
# xem giao diện từng bước: E2E_SHOTS=/thư/mục npm run e2e
```
