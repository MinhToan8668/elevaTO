// Nạp lõi BK thẳng từ index.html (công cụ là 1 file HTML duy nhất) + thư viện Excel trong vendor/.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const core = /<script id="bk-core">([\s\S]*?)<\/script>/.exec(html)[1];
export const BK = new Function(core + ';return BK;')();
// che module/require để thư viện chạy như trong trình duyệt (không đòi cpexcel.js)
export const XLSX = new Function('module', 'require', readFileSync(new URL('../vendor/xlsx-js-style.bundle.js', import.meta.url), 'utf8') + ';return XLSX;')();
export const grid = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });

// Bảng kê vay kiểu "khách gửi": tiêu đề công ty, dòng KU nhận nợ, bảng ở hàng 9, NCC/HĐMB chỉ ghi dòng đầu.
export function bangKeVay({ ku = '8800123(37).26', ngay = '24/03/2026', rows }) {
  return [
    ['CÔNG TY TNHH MTV SẢN XUẤT THỬ NGHIỆM', '', '', '', '', 'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
    [], [], [],
    ['BẢNG KÊ TÀI LIỆU CHỨNG MINH MỤC ĐÍCH SỬ DỤNG VỐN VAY'],
    ['', `                     Theo KU nhận nợ số ${ku} ngày ${ngay}`],
    ['', '', '', '', '', '', '', '', 'ĐVT: Đồng'], [],
    ['STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN', 'SỐ TIỀN VAY', 'TỔNG TIỀN VAY', 'Ghi chú'],
    ...rows.map((r, i) => [i + 1, ...r]),
    ['Tổng cộng', '', '', '', '', 0, 0, 0],
    ['Chúng tôi cam đoan các thông tin trên là đúng sự thật.'],
    ['', '', '', '', '', 'ĐẠI DIỆN CÔNG TY'],
  ];
}
export function toXlsx(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [n, g] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(g), n);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
