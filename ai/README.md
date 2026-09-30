# elevaTO AI BCTC — trích xuất BCTC mẫu 2026 cho model forecast

Công cụ **riêng** (không dính landing page, không dính công cụ upload): tải BCTC lên → AI đọc →
rà soát số → điền thẳng vào model elevaTO (mẫu DGW) hoặc Form nội bộ 2026, hoặc tải bảng chuẩn hoá.

Trang: `https://minhtoan8668.github.io/elevaTO/ai/`

## Làm được gì

| Đầu vào | Cách đọc |
|---|---|
| PDF bản điện tử (có chữ) | Máy tự nhận trang CĐKT / KQKD / LCTT / thuyết minh, chỉ gửi đúng các trang đó cho AI |
| PDF scan, ảnh chụp | AI nhận diện trang (1 lượt / 12 trang) rồi đọc |
| Excel BCTC (có cột "Mã số"), file FinLens (sheet "Lưu trữ") | Đọc thẳng, **không tốn lượt AI** |

- **Theo mẫu Thông tư 99/2025/TT-BTC** (áp dụng từ 01/01/2026). BCTC cũ theo TT200 được tự quy đổi mã
  (tổng tài sản 270 → 280, doanh thu tài chính 21 → 22, …).
- **AI chỉ chép số**, không tự tính. Đổi đơn vị (đồng / nghìn / triệu), dấu âm, quy đổi mã và
  **kiểm tra cộng dồn** do máy làm: tổng tài sản = nguồn vốn, tiền cuối kỳ LCTT = tiền trên CĐKT, LNTT
  trên LCTT = trên KQKD, từng dòng tổng = cộng các dòng con. Ô lệch tô đỏ, bấm vào ô để sửa.
- **Nhiều file, nhiều kỳ**: mỗi BCTC có sẵn cột kỳ trước. Nên tải BCTC năm gần nhất + các năm trước
  (model cần ≥ 4 năm), thêm báo cáo quý mới nhất nếu có. Hai báo cáo cùng kỳ khác số → dùng số của báo cáo
  mới hơn (đã điều chỉnh hồi tố) và liệt kê chỗ khác nhau.
- **Chọn dữ liệu**: gói "Cho model elevaTO" (3 báo cáo + thuyết minh doanh thu/LN gộp theo mảng, TSCĐ
  theo nhóm, biến động vốn chủ, vay/trả nợ, lợi thế thương mại, số cổ phiếu, thuế suất), gói "Chỉ 3 báo cáo
  chính", hoặc tự tick. Ở bước 5 tick dòng nào thì bảng chuẩn hoá xuất dòng đó.
- **Xuất**:
  - Điền **model DGW**: sheet `03.Input_FS` (triệu đồng, chi phí mang dấu âm), đúng cột năm. Không đụng ô
    công thức, giữ nguyên biểu đồ; Excel tự tính lại khi mở. Tab "Xem trước model" cho thấy từng ô sẽ
    ghi và nguồn số (BCTC / thuyết minh / ước tính).
  - Điền **Form nội bộ 2026**: sheet `Lưu trữ`, mỗi kỳ một cột (đồng), F1 chuyển sang 4 kỳ gần nhất.
  - **Bảng chuẩn hoá** .xlsx các dòng đã tick, đơn vị tuỳ chọn.
  - **Lưu phiên** .json: làm tiếp lần sau / gửi người khác, không tốn lượt AI, không chứa thông tin đăng nhập.

## Tài khoản học viên

Giống Viral Studio bên TMXK: người dùng tự **tạo tài khoản** (họ tên, email, số điện thoại, mật khẩu) rồi
**đăng nhập** ngay trên trang — không có ô link máy chủ hay mã truy cập nào. Phiên đăng nhập giữ 30 ngày,
tối đa 3 máy cùng lúc. Mỗi tài khoản có số **lượt AI mỗi ngày** (mặc định 20).

Quản lý trong Google Sheet **"elevaTO AI — Tài khoản"** (tab `TaiKhoan`, do hàm `caiDat` tạo):

| Cột | Ý nghĩa |
|---|---|
| `trangthai` | `active` dùng được · `cho` chờ duyệt · `off` khoá (đăng xuất khỏi mọi máy) |
| `luot_ngay` | số lượt AI mỗi ngày của riêng người này; để trống = mặc định |
| `vaitro` | `hv` học viên · `admin` quản trị, không giới hạn lượt |

Muốn duyệt tay từng người trước khi cho dùng: thêm Script Property `AI_CAN_DUYET` = `1` (người mới sẽ ở
trạng thái `cho` cho tới khi bạn sửa thành `active`). Đổi lượt mặc định: Script Property `AI_LUOT_MAC_DINH`.
Học viên quên mật khẩu: sửa email + mật khẩu mới trong hàm `datLaiMatKhauHocVien` rồi Chạy, nhắn lại cho họ.

## Cài máy chủ AI (một lần, khoảng 10 phút)

1. Vào <https://script.google.com> → **Dự án mới**, đặt tên `elevaTO AI`
   (dự án riêng — không dùng chung dự án landing page hay upload).
2. Dán toàn bộ `Code.gs` (bản elevaTO gửi riêng, đã có sẵn key) vào `Code.gs`.
   Dùng bản trong repo thì dán key Gemini vào dòng `GEMINI_KEY_MOI` (nhiều key cách nhau dấu phẩy).
3. ⚙ **Cài đặt dự án** → tick *Hiển thị tệp kê khai "appsscript.json"* → mở `appsscript.json`, dán nội dung
   `ai/backend/appsscript.json`.
4. Chọn hàm **`caiDat`** → **Chạy** → cấp quyền (Google hỏi quyền gọi ra ngoài + tạo bảng tính). Nhật ký in ra
   link bảng tài khoản và model sẽ dùng. Chạy xong có thể đổi dòng key về `'DAN_KEY_GEMINI'` rồi Lưu
   (key đã cất trong Script Properties).
5. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi với tư cách*: **Tôi**; *Ai có quyền truy cập*:
   **Bất kỳ ai** → Triển khai → chép link `…/exec`.
6. Dán link `/exec` vào `ai/js/config.js` (`API = '…'`) và đẩy lên GitHub (hoặc gửi link cho Claude làm hộ).
   Trước bước này trang hiện "đang được cài đặt" và chưa cho đăng nhập.
7. Tự đăng ký một tài khoản trên trang, rồi sửa email trong hàm `taoQuanTri` → Chạy để có quyền quản trị.

Sửa `Code.gs` sau này: **Triển khai → Quản lý triển khai → ✎ → Phiên bản mới** để giữ nguyên link.
Thêm key: sửa Script Property `GEMINI_KEYS` (mỗi dòng một key) hoặc dán vào `GEMINI_KEY_MOI` rồi chạy lại `caiDat`.

### Bảo vệ

- Mật khẩu băm 1500 vòng có muối + "tiêu" riêng trong Script Properties; bảng chỉ giữ bản băm của mật khẩu
  và của phiên. Sai mật khẩu 5 lần → khoá tạm 10 phút; có ô bẫy bot và trần số đăng ký mỗi giờ.
- Mỗi tài khoản có hạn mức lượt/ngày (giữ lượt trước khi gọi Gemini, lỗi thì trả lại) và tối đa `AI_RPM_MA` (8)
  lượt/phút; cả hệ thống tối đa `AI_RPM` (12) lượt/phút.
- Nhiều key Gemini: key nào hết hạn mức phút (429) thì nghỉ, máy chủ chuyển ngay sang key khác.
- Model do máy chủ chọn (bản flash chính thức mới nhất; đổi bằng Script Property `AI_MODEL`); trang không đổi được.
- Máy chủ chỉ chuyển tiếp nội dung trích xuất (PDF / ảnh / chữ có giới hạn độ dài), không cho dùng công cụ.
- Trang chỉ chạy script của chính nó (CSP `script-src 'self'`, thư viện trong `vendor/`), không dùng `innerHTML`
  với dữ liệu; phiên làm việc tự lưu theo từng tài khoản (máy dùng chung không lộ số của người khác).

### Giới hạn

- Gemini miễn phí giới hạn số lượt mỗi phút / mỗi ngày theo key. Máy chủ giữ tối đa `AI_RPM` (12) lượt/phút
  cho cả hệ thống, `AI_RPM_MA` (8) lượt/phút mỗi tài khoản; quá thì trang tự chờ rồi thử lại. Một BCTC thường tốn 3 lượt (3 bảng) + 1 lượt mỗi
  nhóm thuyết minh.
- Apps Script chỉ chờ một lượt gọi tối đa ~60 giây: bảng dài quá thì trang tự chia đôi rồi gọi lại.
- Gemini bản miễn phí có thể dùng dữ liệu gửi lên để cải thiện dịch vụ — chỉ dùng cho BCTC đã công bố.
- Model: máy chủ lấy danh sách model Gemini hiện có (tự cập nhật khi Google ra model mới) và dùng bản *flash*
  chính thức mới nhất.

## Mã nguồn

```
ai/
├── index.html, css/app.css      giao diện (5 bước)
├── js/app.js, js/ui/*           các bước giao diện, trạng thái, lưu phiên
├── js/ai.js                     gọi máy chủ AI (chờ khi bận, chia nhỏ khi quá giờ)
├── js/pdf.js, js/libs.js        đọc chữ, ảnh thu nhỏ, cắt trang PDF; nạp thư viện trong vendor/ khi cần
├── js/config.js                 link /exec của máy chủ AI
├── js/ui/auth.js                đăng nhập / đăng ký, menu tài khoản
├── js/chart2026.js              danh mục chỉ tiêu mẫu TT99 + cây cộng dồn + mã TT200 tương ứng
├── js/core/                     logic thuần (đọc số VN, kiểm tra, quy đổi, nhận trang, prompt, dữ liệu nhiều kỳ, Excel)
├── js/targets/                  điền model DGW / Form 2026 (sửa thẳng XML trong file .xlsx)
├── backend/                     máy chủ Apps Script
├── vendor/                      pdf.js, pdf-lib, JSZip, SheetJS (xem vendor/README.md)
└── tests/                       kiểm thử
```

Kiểm thử (Node 20+):

```bash
cd ai
npm test                 # kiểm thử đơn vị: đọc số, cây cộng dồn, quy đổi TT200, trích xuất, điền Excel, máy chủ…
npm install && npm run e2e   # chạy trang thật trong Chromium, máy chủ AI giả lập
# thử điền file thật: DGW_MODEL=model.xlsx FORM_2026=form.xlsx npm run e2e
```
