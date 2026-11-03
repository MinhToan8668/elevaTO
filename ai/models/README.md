# Model định giá elevaTO (Excel)

Hai file model gốc mà tab **M&A & định giá** của AI BCTC port lại logic:

- `DGW_Model_new_version_elevaTO.xlsx` — model ba báo cáo tích hợp + định giá (DGW, đơn vị triệu VND):
  02.Control (năm actual cuối, kịch bản, số năm dự phóng, kiểm tra) · 03.Input_FS (nơi duy nhất nhập BCTC) ·
  04.Drivers (actual → "APPLIED" = bình quân 3 năm / kịch bản / ghi đè) · 05.Revenue (theo mảng) · 06.IS · 07.BS (tiền là
  số cân) · 08.CF (gián tiếp từ biến động BS, FCFF) · 09.WC · 10.FA_SCHED · 11.Debt · 12.Equity · 13.Tax_JV · 14.Ratios ·
  15.DCF · 16.Comps · 17.Valuation · 18–25 (review, playbook, beta, template ngành, quant).
- `DGW_Consolidated_kha_c_version_1.xlsx` — model hợp nhất (Consolidation / Goodwill / NCI) dùng cho phần M&A.

Số của file đầu được dùng làm chuẩn kiểm tra trong `ai/tests/valuation.test.js` (fixture `ai/tests/fixtures/dgw-3s.json`):
app dựng lại 2026F–2030F khớp từng dòng 06.IS, 07.BS, 08.CF, WACC, EV và giá mục tiêu 44.620 đ.
