#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tạo bộ PDF mẫu nhiều kiểu trình bày (mỗi mẫu 1 bản có lớp text + 1 bản ảnh scan) để test rule.
Chạy: python tests/make_samples.py  -> tests/samples/*.pdf ; rồi:
      python quet_pdf.py tests/samples -o /tmp/dm.xlsx      (bản Python)
      node test_rules.js <fixtures.json> tests/expect.json  (bản JS, fixtures = text OCR đã lưu)
Cần font có tiếng Việt: DejaVuSans (Linux: fonts-dejavu; Windows: đổi FONT sang C:/Windows/Fonts/arial.ttf)."""
import sys
from pathlib import Path
import pymupdf

FONT = next((p for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf", "/Library/Fonts/Arial Unicode.ttf"] if Path(p).exists()), None)
FONT_B = next((p for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf", FONT or ""] if p and Path(p).exists()), FONT)
if not FONT:
    sys.exit("Không tìm thấy font tiếng Việt, sửa FONT trong file này.")
W, H = 595, 842
QH = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc"
DOCS = {
 "01_bctc_hop_nhat_2024": [((50, 50), "CÔNG TY CỔ PHẦN TẬP ĐOÀN TRƯỜNG HẢI", 11, True),
   ((50, 120), "Báo cáo tài chính hợp nhất\ncho năm tài chính kết thúc ngày 31 tháng 12 năm 2024\n(đã được kiểm toán)", 16, True),
   ((50, 300), "MỤC LỤC\nBáo cáo của Ban Tổng Giám đốc ......... 1\nBáo cáo kiểm toán độc lập ......... 3", 10, False)],
 "02_to_trinh": [((50, 50), "CÔNG TY CỔ PHẦN ĐẦU TƯ ĐỊA ỐC\nĐẠI QUANG MINH\nSố: 15/2025/TTr-ĐQM", 10, False),
   ((320, 50), QH + "\n\nTP. Hồ Chí Minh, ngày 08 tháng 05 năm 2025", 10, False), ((200, 160), "TỜ TRÌNH", 16, True),
   ((120, 185), "V/v: Phê duyệt phương án vay vốn tại Ngân hàng VIB", 11, False),
   ((50, 220), "Kính gửi: Hội đồng quản trị Công ty Cổ phần Đầu tư Địa ốc Đại Quang Minh\n\nCăn cứ Điều lệ Công ty; Căn cứ nhu cầu vốn cho dự án...", 11, False)],
 "03_cong_van": [((50, 50), "CÔNG TY CỔ PHẦN TẬP ĐOÀN TRƯỜNG HẢI\nSố: 123/CV-THACO\nV/v đề nghị giải ngân đợt 3", 10, False),
   ((320, 50), QH + "\n\nQuảng Nam, ngày 05 tháng 6 năm 2025", 10, False),
   ((50, 160), "Kính gửi: Ngân hàng TMCP Quốc tế Việt Nam (VIB) - Chi nhánh Quảng Nam\n\nCông ty Cổ phần Tập đoàn Trường Hải kính đề nghị Quý Ngân hàng giải ngân đợt 3 theo Hợp đồng tín dụng số 45/2025/HĐTD...", 11, False)],
 "04_bao_cao_kiem_tra_von": [((50, 50), "NGÂN HÀNG TMCP QUỐC TẾ VIỆT NAM\nChi nhánh Quảng Nam", 10, False),
   ((50, 130), "Báo cáo kiểm tra sử dụng vốn vay", 18, True),
   ((50, 170), "Khách hàng: Công ty Cổ phần Tập đoàn Trường Hải\nKỳ kiểm tra: Quý II/2025\nNgày kiểm tra: 15/07/2025\nCán bộ kiểm tra: Nguyễn Văn A", 11, False)],
 "05_hop_dong_thi_cong": [((50, 50), QH, 10, False), ((120, 130), "HỢP ĐỒNG THI CÔNG XÂY DỰNG\nSố: 08/2025/HĐXD/ĐQM-CTV", 15, True),
   ((50, 200), "Hôm nay, ngày 10 tháng 5 năm 2025, tại TP. Hồ Chí Minh, chúng tôi gồm:\nBÊN GIAO THẦU (Bên A): CÔNG TY CỔ PHẦN ĐẦU TƯ ĐỊA ỐC ĐẠI QUANG MINH\nĐịa chỉ: Số 10 Mai Chí Thọ, Thủ Thiêm\nBÊN NHẬN THẦU (Bên B): CÔNG TY TNHH XÂY DỰNG CỬU LONG\nĐịa chỉ: 25 Lê Lợi, Quận 1", 11, False)],
 "06_thong_bao_ngay_cuoi": [((50, 50), "CÔNG TY CỔ PHẦN ĐẦU TƯ ĐỊA ỐC ĐẠI QUANG MINH\nSố: 21/TB-ĐQM", 10, False), ((220, 130), "THÔNG BÁO", 16, True),
   ((100, 160), "Về việc thay đổi địa chỉ trụ sở chính", 11, False),
   ((50, 200), "Công ty Cổ phần Đầu tư Địa ốc Đại Quang Minh trân trọng thông báo tới Quý đối tác..." + "\n" * 24 + "TP. Hồ Chí Minh, ngày 03 tháng 07 năm 2025\nTỔNG GIÁM ĐỐC", 11, False)],
 "07_quyet_dinh_song_ngu": [((50, 50), "CÔNG TY TNHH THISO RETAIL\nTHISO RETAIL COMPANY LIMITED\nSố/No.: 09/2025/QĐ-TR", 10, False),
   ((320, 50), "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nSOCIALIST REPUBLIC OF VIETNAM\nĐộc lập - Tự do - Hạnh phúc\nTP. Hồ Chí Minh, ngày 20/02/2025", 10, False),
   ((200, 170), "QUYẾT ĐỊNH / DECISION", 15, True), ((100, 200), "Về việc bổ nhiệm Giám đốc Tài chính / On appointment of Chief Financial Officer", 10, False),
   ((50, 240), "HỘI ĐỒNG THÀNH VIÊN CÔNG TY TNHH THISO RETAIL\nQUYẾT ĐỊNH:\nĐiều 1. Bổ nhiệm bà Lê Thị Hoa giữ chức vụ Giám đốc Tài chính kể từ ngày 01/03/2025.", 11, False)],
 "08_khe_uoc_nhan_no": [((50, 50), "NGÂN HÀNG TMCP QUỐC TẾ VIỆT NAM", 10, False), ((150, 120), "KHẾ ƯỚC NHẬN NỢ\nSố: 01/2025/KUNN-VIB", 15, True),
   ((50, 180), "Kèm theo Hợp đồng tín dụng số 45/2025/HĐTD ngày 02/04/2025\nBên nhận nợ: Công ty Cổ phần Tập đoàn Trường Hải\nSố tiền nhận nợ: 50.000.000.000 đồng\nNgày nhận nợ: 12/06/2025", 11, False)],
 "09_gcn_dkdn": [((50, 50), "SỞ KẾ HOẠCH VÀ ĐẦU TƯ TP. HỒ CHÍ MINH\nPHÒNG ĐĂNG KÝ KINH DOANH", 10, False),
   ((100, 120), "GIẤY CHỨNG NHẬN ĐĂNG KÝ DOANH NGHIỆP\nCÔNG TY CỔ PHẦN", 15, True),
   ((50, 180), "Mã số doanh nghiệp: 0301234567\nĐăng ký lần đầu: ngày 12 tháng 3 năm 2010\nĐăng ký thay đổi lần thứ 8: ngày 20 tháng 5 năm 2024\n\n1. Tên công ty\nTên công ty viết bằng tiếng Việt: CÔNG TY CỔ PHẦN ĐẦU TƯ ĐỊA ỐC ĐẠI QUANG MINH", 11, False)],
 "10_bien_ban_hdqt": [((50, 50), "CÔNG TY CỔ PHẦN ĐẦU TƯ ĐỊA ỐC ĐẠI QUANG MINH\nSố: 03/2025/BB-HĐQT", 10, False), ((320, 50), QH, 10, False),
   ((120, 140), "BIÊN BẢN HỌP HỘI ĐỒNG QUẢN TRỊ", 15, True), ((100, 170), "V/v: Thông qua việc vay vốn tại VIB và tài sản bảo đảm", 11, False),
   ((50, 210), "Hôm nay, vào lúc 9h00 ngày 18 tháng 04 năm 2025, tại trụ sở Công ty...", 11, False)],
 "11_de_xuat_tin_dung_bang": [((50, 40), "VIB", 14, True), ((50, 80), "ĐỀ XUẤT CẤP TÍN DỤNG", 15, True),
   ((50, 120), "Đơn vị kinh doanh: Chi nhánh Quảng Nam        Ngày lập: 25/03/2025\nKhách hàng: Công ty Cổ phần Tập đoàn Trường Hải\nMã KH: 00123456        Xếp hạng: AA\nSản phẩm: Vay vốn lưu động        Hạn mức đề xuất: 500 tỷ đồng", 10, False)],
 "12_bao_cao_tai_tham_dinh": [((50, 40), "NGÂN HÀNG TMCP QUỐC TẾ VIỆT NAM\nKHỐI KHÁCH HÀNG DOANH NGHIỆP", 10, False), ((50, 100), "BÁO CÁO TÁI THẨM ĐỊNH", 16, True),
   ((50, 140), "Số: 12/2025_20250328_QN\nKhách hàng: CÔNG TY CỔ PHẦN TẬP ĐOÀN TRƯỜNG HẢI\nNgày: 28/03/2025", 10, False)],
}
out = Path(__file__).resolve().parent / "samples"
out.mkdir(exist_ok=True)
for name, blocks in DOCS.items():
    doc = pymupdf.open(); page = doc.new_page(width=W, height=H)
    page.insert_font(fontname="dv", fontfile=FONT); page.insert_font(fontname="dvb", fontfile=FONT_B)
    for (x, y), txt, size, bold in blocks:
        page.insert_text((x, y), txt, fontsize=size, fontname="dvb" if bold else "dv")
    doc.save(out / f"{name}_text.pdf")
    pix = page.get_pixmap(dpi=200); img = pymupdf.open(); p2 = img.new_page(width=W, height=H); p2.insert_image(p2.rect, pixmap=pix); img.save(out / f"{name}_scan.pdf")
print(f"{len(DOCS) * 2} file -> {out}")
