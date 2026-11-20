// Nạp lõi BK thẳng từ index.html (công cụ là 1 file HTML duy nhất) + thư viện Excel trong vendor/.
import { readFileSync } from "node:fs";
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const core = /<script id="bk-core">([\s\S]*?)<\/script>/.exec(html)[1];
const doc = /<script id="bk-doc">([\s\S]*?)<\/script>/.exec(html)[1];
export const { BK, DOCX } = new Function(core + doc + ';return { BK, DOCX };')();
// JSZip (đọc/ghi .docx) — chạy như trong trình duyệt
globalThis.self = globalThis;
export const JSZip = new Function('module', 'exports', 'define', readFileSync(new URL('../vendor/jszip.min.js', import.meta.url), 'utf8') + ';return self.JSZip;')();
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

// ── file Word giả lập (không dùng mẫu thật của ngân hàng / khách hàng — repo công khai)
const R = (t, b) => `<w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r>`;
export const P = (...runs) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${runs.map((x) => (Array.isArray(x) ? R(...x) : R(x))).join('')}</w:p>`;
export const TC = (t, extra = '') => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/>${extra}</w:tcPr>${P(t)}</w:tc>`;
export const TR = (...cells) => `<w:tr>${cells.map((c) => (c.startsWith('<w:tc>') ? c : TC(c))).join('')}</w:tr>`;
export const TBL = (...rows) => `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid>${'<w:gridCol w:w="2000"/>'.repeat(Math.max(...rows.map((r) => (r.match(/<w:tc>/g) || []).length)))}</w:tblGrid>${rows.join('')}</w:tbl>`;
export const docXml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418"/></w:sectPr></w:body></w:document>`;
export async function docx(body) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  z.file('word/document.xml', docXml(body));
  return z.generateAsync({ type: 'nodebuffer' });
}
const CB = (on) => `<w:sdt><w:sdtPr><w:id w:val="1"/><w14:checkbox><w14:checked w14:val="${on ? 1 : 0}"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:t>${on ? '☒' : '☐'}</w:t></w:r></w:sdtContent></w:sdt>`;
// KUNN đã điền của "lần trước" (số liệu giả)
export const KUNN_BODY = [
  P('Số:', [' '], '5500777(', '2).26'), P('Ngày: 05/10/2026'),
  P(['ĐƠN ĐỀ NGHỊ GIẢI NGÂN KIÊM KHẾ ƯỚC NHẬN NỢ', true]),
  TBL(TR('Công ty', 'CÔNG TY TNHH THỬ NGHIỆM AN BÌNH'), TR('Địa chỉ', '12 Đường Số 1, TP. Thử'), TR('Đại diện', 'TRẦN VĂN MẪU'), TR('Chức danh', 'GIÁM ĐỐC')),
  P('Căn cứ Hợp đồng tín dụng số 5500777.26 ngày 01/09/2026 (“Hợp đồng”), Bên được cấp tín dụng đề nghị giải ngân:'),
  P('Bằng số: 1,000,000,000 VND.'), P('Bằng chữ: Một tỷ đồng'),
  P('Bằng số: 5,000,000,000 VND.'), P('Bằng chữ: Năm tỷ đồng.'),
  P('Ngày giải ngân: 05/10/2026'), P('Thời hạn vay: Từ ngày tiếp theo Ngày giải ngân đến ngày 05/04/2027'),
  TBL(TR('STT', 'Tên bên thụ hưởng', 'Số tài khoản', 'Ngân hàng'), TR('1', 'Công ty Cũ A', '111', 'NH X'), TR('2', 'Công ty Cũ B', '222', 'NH Y')),
  P('Lãi suất tại thời điểm giải ngân: 8.5%/năm.'), P('Mức lãi suất này được cố định trong suốt Thời hạn vay.'),
  P('Ngày trả lãi: hàng tháng vào ngày 25, ngày trả lãi đầu tiên là ngày 25/10/2026.'),
  P('Tài sản bảo đảm riêng của khách hàng An Bình.'),
].join('');
export const PDGN_BODY = [
  TBL(TR(TC('PHÊ DUYỆT KIÊM ĐỀ NGHỊ THỰC HIỆN GIẢI NGÂN'))),
  TBL(TR('Tên KH', 'CÔNG TY TNHH THỬ NGHIỆM AN BÌNH', 'CIF', '00123456'), TR('Tên TTKD', 'CN Thử', 'Mã TTKD', '123'), TR('Profit Center', '111', 'TestKey', '123/9999'), TR('', '', 'KUNN số', '5500777(2).26')),
  TBL(TR('Hình thức', '', 'Hạn mức được cấp(1)', 'Số dư tại ngày 05/10/2026 (2)', 'Thu nợ (3)', 'Số dư khả dụng'), TR('Cấp theo hạn mức', 'Cho vay', '10,000', '4,000', '0', '6,000'), TR('', 'L/C', '10,000', '0', '', '6,000'), TR('Tổng cộng', '', '10,000', '4,000', '0', '6,000'), TR('Ngày hết hạn duy trì hạn mức', '', '', '01/09/2027')),
  TBL(TR('CIC', `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p>${CB(true)}${R('Đạt')}</w:p></w:tc>`, 'Theo CIC QHTD ngày 01/10/2026, KH không có nợ nhóm 2')),
  TBL(TR('Số tiền', '1,000,000,000'), TR('Ngày giải ngân', '05/10/2026'), TR('Thời hạn cho vay', '6 tháng (từ ngày tiếp theo ngày giải ngân đến ngày 05/04/2027)')),
  TBL(TR('STT', 'BÊN THỤ HƯỞNG', 'HỢP ĐỒNG', 'SỐ CHỨNG TỪ', 'NGÀY CHỨNG TỪ', 'SỐ TIỀN HỢP ĐỒNG/ HÓA ĐƠN (VND)', 'SỐ TIỀN THANH TOÁN (VND)'),
    TR('1', TC('Công ty Cũ A', '<w:vMerge w:val="restart"/>'), 'HĐ 1', '10', '01/10/2026', '600,000,000', TC('1,000,000,000', '<w:vMerge w:val="restart"/>')),
    TR('2', TC('', '<w:vMerge/>'), 'HĐ 1', '11', '02/10/2026', '400,000,000', TC('', '<w:vMerge/>')),
    TR(TC('TỔNG CỘNG', '<w:gridSpan w:val="5"/>'), '1,000,000,000', '1,000,000,000')),
  P('Giám đốc TTKD đồng ý ngày 05/10/2026'),
].join('');
