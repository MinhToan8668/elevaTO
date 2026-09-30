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
  - **Lưu phiên** .json: làm tiếp lần sau / gửi người khác, không tốn lượt AI, không chứa mã truy cập.

## Cài máy chủ AI (một lần, khoảng 10 phút)

Key Gemini nằm trên máy chủ Apps Script của bạn, **không bao giờ ra tới trình duyệt**. Học viên dùng
**mã truy cập** riêng, mỗi mã có giới hạn lượt/ngày; thu hồi được bất cứ lúc nào.

1. Lấy key miễn phí tại **Google AI Studio** → *Get API key*.
2. Vào <https://script.google.com> → **Dự án mới**, đặt tên `elevaTO AI`
   (dự án riêng — không dùng chung dự án landing page hay upload).
3. Dán toàn bộ `ai/backend/Code.gs` vào `Code.gs`.
4. ⚙ **Cài đặt dự án** → tick *Hiển thị tệp kê khai "appsscript.json"* → mở `appsscript.json`,
   dán nội dung `ai/backend/appsscript.json`.
5. Ở dòng `var GEMINI_KEY_MOI = 'DAN_KEY_GEMINI';` thay bằng key của bạn → **Lưu** → chọn hàm
   **`caiDat`** → **Chạy** → cấp quyền. Nhật ký in ra danh sách model và **mã quản trị** (không giới hạn
   lượt — chỉ bạn dùng). Chạy xong đổi dòng key về `'DAN_KEY_GEMINI'` rồi Lưu (key đã cất trong
   Script Properties).
6. **Triển khai → Triển khai mới → Ứng dụng web**: *Thực thi với tư cách*: **Tôi**; *Ai có quyền truy cập*:
   **Bất kỳ ai** → Triển khai → chép link `…/exec`.
7. Tạo mã cho học viên: sửa tên + số lượt trong hàm `taoMaHocVien` → Chạy → mã hiện trong nhật ký
   (dạng `hv-…`). Xem mã và số lượt đã dùng: chạy `xemMa`. Thu hồi: dán mã vào `xoaMaHocVien` → Chạy.
8. Gửi học viên link có sẵn máy chủ + mã (mở là kết nối luôn, mã tự xoá khỏi thanh địa chỉ):

   ```
   https://minhtoan8668.github.io/elevaTO/ai/#api=<link /exec>&code=<mã>
   ```

Sửa `Code.gs` sau này: **Triển khai → Quản lý triển khai → ✎ → Phiên bản mới** để giữ nguyên link.

### Giới hạn

- Gemini miễn phí giới hạn số lượt mỗi phút / mỗi ngày theo key. Máy chủ giữ tối đa `AI_RPM` (12) lượt/phút
  cho cả hệ thống; quá thì trang tự chờ rồi thử lại. Một BCTC thường tốn 3 lượt (3 bảng) + 1 lượt mỗi
  nhóm thuyết minh.
- Apps Script chỉ chờ một lượt gọi tối đa ~60 giây: bảng dài quá thì trang tự chia đôi rồi gọi lại.
- Gemini bản miễn phí có thể dùng dữ liệu gửi lên để cải thiện dịch vụ — chỉ dùng cho BCTC đã công bố.
- Model: trang lấy danh sách model Gemini hiện có từ máy chủ (tự cập nhật khi Google ra model mới),
  mặc định bản *flash* mới nhất; đổi được ở góc phải trên.

## Mã nguồn

```
ai/
├── index.html, css/app.css      giao diện (5 bước)
├── js/app.js, js/ui/*           các bước giao diện, trạng thái, lưu phiên
├── js/ai.js                     gọi máy chủ AI (chờ khi bận, chia nhỏ khi quá giờ)
├── js/pdf.js                    đọc chữ, ảnh thu nhỏ, cắt trang PDF (pdf.js bản legacy trong vendor/)
├── js/chart2026.js              danh mục chỉ tiêu mẫu TT99 + cây cộng dồn + mã TT200 tương ứng
├── js/core/                     logic thuần (đọc số VN, kiểm tra, quy đổi, nhận trang, prompt, dữ liệu nhiều kỳ, Excel)
├── js/targets/                  điền model DGW / Form 2026 (sửa thẳng XML trong file .xlsx)
├── backend/                     máy chủ Apps Script
└── tests/                       kiểm thử
```

Kiểm thử (Node 20+):

```bash
cd ai
npm test                 # kiểm thử đơn vị: đọc số, cây cộng dồn, quy đổi TT200, trích xuất, điền Excel, máy chủ…
npm install && npm run e2e   # chạy trang thật trong Chromium, máy chủ AI giả lập
# thử điền file thật: DGW_MODEL=model.xlsx FORM_2026=form.xlsx npm run e2e
```
