# Giải ngân — file QUẢN LÝ GIẢI NGÂN (Excel + VBA) và tiện ích TestKey / đáo hạn / số tiền bằng chữ

Thư mục này giữ **code và logic**. File Excel thật, bảng key TestKey và mọi số liệu khách hàng **không** nằm ở đây
vì repo công khai (GitHub Pages phát cả repo lên web). Ví dụ trong tài liệu và test đều là số giả.

| Phần | Ở đâu | Dùng để |
|---|---|---|
| File Excel **mẫu** | `excel/QUAN_LY_GIAI_NGAN_MAU.xlsx` | Đủ 14 sheet, công thức, dropdown, sheet BAT_DAU — **dữ liệu giả**, bảng key TestKey giả |
| Thư viện JS | `lib/giaingan.js` | Logic TestKey / số tiền bằng chữ / nhận số / đáo hạn + lễ Tết — để tích hợp vào tool khác |
| Tiện ích HTML | `tienich/index.html` | TestKey, ngày đáo hạn (thứ, lễ Tết), số tiền bằng chữ, lãi dự kiến, lịch sử — dùng cho mọi công ty |
| Module VBA | `vba/ModGiaiNgan.bas` | Macro của file `QUAN_LY_GIAI_NGAN_<KH>.xlsm`: xuất KUNN, Tờ trình, Bảng kê (Word), ghi sổ khế ước |
| Test | `tests/` | `npm test` (hàm thuần), `npm run e2e` (Chromium thật) — dùng **bảng key giả lập** |

Trang chạy online: `https://minhtoan8668.github.io/elevaTO/giaingan/tienich/` (sau khi merge vào `main`).

### Dùng file Excel mẫu
1. Tải `excel/QUAN_LY_GIAI_NGAN_MAU.xlsx`, mở Excel → Alt+F11 → File → Import File → `vba/ModGiaiNgan.bas` → **Save As** kiểu *Excel Macro-Enabled (.xlsm)*.
2. Điền sheet `DANH_MUC` (khách hàng, HĐTD, hạn mức, tài khoản), `UBG`, `STK`, `TSBD`, `DIEU_KIEN`; xoá các dòng mẫu ở `KHE_UOC`, `HOA_DON`, `THU_HUONG`.
3. Thay bảng key ở sheet `TESTKEY` (cột I, L, O, R) bằng bảng thật của đơn vị — **trên máy, không đưa lên repo**.
4. Đặt cạnh file các thư mục `Template/` (mẫu Word, tên ở `DANH_MUC` mục G) và `Output/`. Alt+F8 → `TaoNutBam`.

### Tích hợp logic vào tool khác (`lib/giaingan.js`)
```js
import { tinhTestKey, docTien, parseAmt, fmt, daoHan, docNgayNghi, ngayTraLaiDau, laiDuKien } from './giaingan/lib/giaingan.js';
const bang = JSON.parse(await file.text());               // bảng key thật: người dùng nạp, KHÔNG nhúng vào code
const r = tinhTestKey({ maCN: '123', ngay: '2026-10-15', soTien: '2.027.125.382', loaiTien: 'VND' }, bang);
r.testKey; r.ghi; r.chiTiet;                               // số · "123/xxxx" · 16 dòng thành phần
docTien(2027125382);                                        // "Hai tỷ không trăm hai mươi bảy triệu … đồng"
daoHan('2026-09-21', 137, docNgayNghi('04/02/2027 → 10/02/2027 Tết'));  // {ngay, thu, nghi, truoc, sau}
```
Không phụ thuộc DOM — chạy được trên trình duyệt (`<script type="module">`) và Node. Lỗi đầu vào ném `Error` có thông điệp tiếng Việt.

---

## 1. Tiện ích HTML (`tienich/index.html`)

Một file, mở bằng Chrome/Edge là chạy, không cần mạng. Bố cục 3 cột vừa một màn hình (≥1200px), hẹp hơn thì tự xuống 2 rồi 1 cột.

### Bảng key TestKey — nạp riêng, không nằm trong file
- Lần đầu trên mỗi máy: ô TestKey hiện khung cam **“Chưa nạp bảng key”** → chọn file bảng key `.json` (giữ riêng, không gửi ra ngoài).
- File được kiểm cấu trúc rồi lưu vào `localStorage` (`tk_table`) của trình duyệt máy đó. Nút **“Gỡ bảng key khỏi máy này”** để xoá.
- Cấu trúc file:
  ```json
  { "day": {"1": 0, …, "31": 0},  "mon": {"1": 0, …, "12": 0},
    "cur": {"VND": 0, "USD": 0, …},  "dig": {"A0": 0, "A1": 0, …, "N9": 0} }
  ```
  `dig` dùng 12 chữ cái `ABCDEFGHIKMN` (bỏ J, L) cho 12 vị trí chữ số; mã thiếu tính là 0 (giống `IFERROR(VLOOKUP…,0)` trong Excel).

### Logic TestKey (giống sheet `TESTKEY` của file Excel)
```
TestKey = Mã chi nhánh (số)
        + key[ngày giải ngân]            (bảng day)
        + key[tháng giải ngân]           (bảng mon)
        + key[loại tiền]                 (bảng cur)
        + Σ key[chữ cái vị trí i + chữ số thứ i]   (bảng dig, số tiền làm tròn rồi đệm đủ 12 chữ số)
Ghi trên Tờ trình dạng  <mã CN>/<TestKey>
```
Số tiền có phần lẻ được **làm tròn** trước (Excel `TEXT(x,"000000000000")` cũng làm tròn). Từ 10^12 trở lên báo không hỗ trợ.

### Số tiền bằng chữ (port từ hàm `DocSoTien` trong VBA)
- Nhóm 3 chữ số, đơn vị `nghìn / triệu / tỷ / nghìn tỷ`; nhóm bằng 0 bỏ qua; nhóm không phải nhóm đầu có trăm = 0 đọc “không trăm”.
- Hàng chục: `mươi` + **mốt** (x1), **tư** (x4), **lăm** (x5); hàng chục = 1 đọc `mười`, `mười lăm`; hàng chục = 0 có hàng trăm đọc **linh** (205 = hai trăm linh năm).
- Viết hoa chữ đầu, kết thúc `đồng`.

### Nhập / chép số không lỗi dấu `.` `,`
- `parseAmt` nhận `2.027.125.382`, `2,027,125,382`, `2027125382`, có khoảng trắng, có phần lẻ `…,75` / `…​.75`:
  dấu xuất hiện cuối cùng mà phía sau **không phải đúng 3 chữ số** được hiểu là dấu thập phân, còn lại là dấu ngăn nghìn.
- Chọn định dạng **hiển thị & sao chép**: `1.234.567` · `1,234,567` · `1234567` (số liền, an toàn nhất khi dán vào Excel).
  Tool tự dò máy đang dùng dấu gì cho thập phân và cảnh báo nếu định dạng chọn bị ngược.

### Ngày đáo hạn
- Đáo hạn = ngày GN + số ngày vay; sửa ngày đáo hạn thì số ngày tự tính ngược. Hiển thị thứ trong tuần.
- Rơi vào thứ Bảy, Chủ nhật hoặc ngày lễ → cảnh báo kèm tên ngày lễ, gợi ý **ngày làm việc gần nhất trước và sau** (bỏ qua cả kỳ nghỉ Tết) và số ngày tương ứng.
- Danh sách ngày nghỉ sửa được (mỗi dòng `dd/mm/yyyy [→ dd/mm/yyyy] tên`), lưu `localStorage`. Tết âm lịch từ 2027 và Giỗ Tổ là **dự kiến** — sửa khi có thông báo chính thức.
- Ngày trả lãi đầu tiên: ngày N (mặc định 25) của tháng giải ngân nếu ngày GN < N, ngược lại tháng sau; cảnh báo nếu rơi vào ngày nghỉ.
- Lãi dự kiến = gốc × LS × số ngày / 365.

### Tóm tắt & lịch sử
- Tóm tắt gom: công ty, ngày GN, số tiền, bằng chữ, TestKey, số ngày, đáo hạn, LS → **Chép tất cả**.
- Lịch sử (≤200 dòng, `localStorage` `tk_his`): tìm theo công ty / số tiền (có hay không dấu) / TestKey / ngày.
  **Tick 1 dòng = hiển thị lại** số liệu lên các ô; tick nhiều dòng để **chép** (dạng bảng, dán thẳng Excel) hoặc **xoá**.
  Lưu trùng *ngày + số tiền + công ty* thì ghi đè dòng cũ.
- Phím tắt: Enter = ô kế tiếp · Ctrl+S lưu · Ctrl+Shift+C chép tóm tắt · Esc làm mới.

---

## 2. File Excel QUẢN LÝ GIẢI NGÂN (bản 6.0) và module VBA

### Các sheet
| Sheet | Vai trò | Nhập tay? |
|---|---|---|
| `BAT_DAU` | Quy trình 8 bước, cột trạng thái ✔/✘/⚠ tự cập nhật, link nhảy tới ô cần nhập, bản đồ sheet, thuật ngữ | Không |
| `DASHBOARD` | Dư nợ, hạn mức, quá hạn / sắp đáo hạn, lịch đáo hạn 20 KƯ, doanh số theo gói UBG | Không |
| `GIAI_NGAN` | Nhập 1 đợt giải ngân + kết quả tự tính + checklist (dòng 53–67) + danh sách macro | Ô vàng |
| `HOA_DON` | Bảng kê chứng từ của đợt (tối đa 1.000 dòng) | Có |
| `THU_HUONG` | Bên thụ hưởng của đợt | Có |
| `KHE_UOC` | Sổ khế ước: tool tự ghi khi xuất KUNN; tay chỉ ghi thu nợ (J, K), gói (H), ghi chú (R) | Một phần |
| `UBG` | Danh mục **gói / phê duyệt UBG**: mã gói, số UBG, hiệu lực, LSCV / số ngày / mã LS mặc định, tổng mức | Khi có UBG mới |
| `DANH_MUC`, `STK`, `TSBD`, `DIEU_KIEN`, `TESTKEY` | Thông tin cố định, danh bạ TK, dòng TSBĐ, điều kiện TD, bảng key | Hiếm khi |
| `HUONG_DAN`, `LICH_SU` | Hướng dẫn (mục R = bản 6.0) / nhật ký xuất (ẩn) | Không |

### Sổ `KHE_UOC` (bản 6.0)
`A STT (công thức ROW()-4) · B Số KUNN · C Hạn mức · D Ngày GN · E Đáo hạn · F Số ngày · G Lãi suất · **H Gói / UBG** · I Gốc vay ·
J Đã thu · K Ngày thu · L Gốc còn lại · M Còn (ngày) · N Trạng thái · O Cảnh báo · P Bên thụ hưởng · Q Chứng từ · R Ghi chú · T Thứ tự đáo hạn`

- Thứ tự: HMTD 1 rồi HMTD 2; trong mỗi hạn mức theo hợp đồng rồi số thứ tự KUNN.
- Khi xuất KUNN, `GhiSoKheUoc` chèn dòng **ngay dưới khế ước cuối cùng cùng tiền tố hợp đồng** (`PREFIX_KUNN`), chép định dạng + công thức của dòng trên, xoá phần nhập tay — không rơi xuống cuối sổ (lỗi cũ làm KƯ mới nằm sau khối HMTD 2 và lộn thứ tự).
- Khế ước đã có (so phần trước dấu `)`, bỏ qua hậu tố năm `.26/.27`) → hỏi ghi đè hay giữ.
- Có khoá chặn: cột H phải là “Gói / UBG”, nếu không (file cũ) thì không ghi để tránh ghi lệch cột.
- `SapXepSoKheUoc`: sắp lại theo Hạn mức → Ngày GN → Số KUNN.

### Doanh số UBG cộng theo **gói**, không theo lãi suất
Lỗi cũ: doanh số cộng theo mức LSCV → nhiều gói cùng 8,20% bị gộp, gói có lãi suất riêng (pop-up) không có dòng nên không cộng.
Bản 6.0:
- `UBG!J2 = MATCH(GIAI_NGAN!C16, UBG!B5:B24, 0)` — gói của đợt đang làm.
- `UBG!K{r} = SUMIFS(KHE_UOC!I, KHE_UOC!H, B{r}) + (đợt đang làm nếu thuộc gói này và CHƯA có trong sổ)` — so mã dò `UBG!J3 = LEFT(KUNN, đến ")") & "*"` để xuất lại không cộng lặp.
- `GIAI_NGAN!C16` chọn gói (dropdown tên `DS_GOI_UBG`) → C8 số ngày, C10 lãi suất, C35 mã LS, C17–C20 số UBG / ngày / tổng mức / hiệu lực **tự theo gói**.
  Gõ đè C8/C10 khi đợt có điều kiện riêng: ô ghi chú báo ⚠ “đang gõ đè” nhưng doanh số vẫn vào đúng gói.
- `XoaDuLieuDotGiaiNgan` → `TraLaiCongThucTheoGoi` trả công thức cho C8/C9/C10/C35 và xoá C16 để đợt sau phải chọn lại gói.
- Thêm UBG mới = thêm 1 dòng ở sheet `UBG` (mã gói duy nhất); dropdown tự có thêm.

### Ô quan trọng ở `GIAI_NGAN`
| Ô | Nội dung |
|---|---|
| C6 / C7 / C8 / C9 / C10 | Ngày GN · Số tiền (= tổng bảng kê) · Số ngày vay · Đáo hạn · Lãi suất |
| C11 / C12 / C15 | Ngày CIC (hiệu lực 10 ngày) · Ngày sao kê GDBĐ (30 ngày) · Giá trị TSBĐ |
| C16 → C20 | Gói / UBG → số UBG, ngày, tổng mức, hiệu lực |
| C33 / C37 | Khoá số thứ tự KUNN · Số KUNN = `PREFIX(` số `)HẬU_TỐ` |
| C13 / C39 / C43 | Dư nợ trước (đã loại KƯ đang xuất lại) · Dư nợ sau · Hạn mức còn |
| C51 | Doanh số luỹ kế của gói (triệu) |
| C53–C65 / C67 | Checklist (C53 = module VBA đúng bản, gọi `PhienBanSo()`) / Kết luận |

### Module VBA — các macro
| Macro | Việc |
|---|---|
| `XuatHoSoGiaiNgan`, `Xuat_KUNN`, `Xuat_ToTrinh`, `Xuat_BangKe`, `Xuat_UNC_neu_can` | Đổ token `{{…}}` vào mẫu Word trong `Template/`, lưu vào `Output/`; xuất KUNN thì khoá số + ghi sổ + nhật ký |
| `GhiSoKheUoc`, `SapXepSoKheUoc` | Ghi / sắp sổ khế ước như trên |
| `MoKhoaSoKUNN`, `XoaDuLieuDotGiaiNgan`, `TraLaiCongThucTheoGoi` | Sang đợt mới |
| `TaoNutBam` | Vẽ nút bấm trên `GIAI_NGAN` (cột F) và `BAT_DAU` |
| `KiemTraMoiTruong`, `PhienBan`, `PhienBanSo` | Chẩn đoán |
| `DocSoTien` (UDF) | Số tiền bằng chữ, dùng trong công thức Excel |

Token mới bản 6.0: `{{GOI_UBG}}`. Các ô UBG dời chỗ: `SO_UBG`←C17, `NGAY_UBG`←C18, `UBG_TONG_MUC`←C19, `UBG_HIEU_LUC`←C20, `GN_LUY_KE_TR`←C51.

### Lưu ý khi sửa module (các lỗi đã gặp)
- File `.bas` phải là **ASCII + CRLF** (VBA không đọc Unicode) — chuỗi tiếng Việt viết bằng `ChrW(&H…)`.
- Mọi `Const` / biến cấp module phải nằm **trước** hàm đầu tiên (lỗi “Only comments may appear after End Sub”).
- `Shape.TextFrame` không có `WordWrap` (lỗi 438) — chỉ `TextFrame2` mới có.
- Import thì **Remove** module cũ trước, nếu không VBA tạo `ModGiaiNgan1` và hai bản đánh nhau (“Variable not defined” / “Ambiguous name”).
- Dropdown trỏ tới sheet khác phải dùng **Defined Name** (`DS_…`), không trỏ thẳng — openpyxl xoá phần mở rộng x14 khi lưu.

---

## Kiểm thử
```bash
cd giaingan && npm test       # lib + file mẫu không chứa dữ liệu thật + hàm thuần: đọc số, nhận số dán, TestKey (bảng key giả), đáo hạn + lễ Tết, ngày trả lãi
cd giaingan && npm run e2e    # Chromium thật: nạp bảng key giả → tính → lưu lịch sử → tick hiển thị lại → vừa 1 màn hình
```
`tests/bang_key_gia_lap.json` là **số ngẫu nhiên**, chỉ để test — không phải bảng key thật.
