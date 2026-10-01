// Bộ ghi .xlsx tối giản dùng chung cho các file xuất ra (Form chuẩn hóa, Form chi tiết elevaTO).
// Trả về { đường dẫn trong zip: nội dung XML }; trình duyệt nén bằng JSZip, bài kiểm tra nén bằng zlib.
// Không dùng thư viện ngoài để file xuất ra luôn mở được bằng Excel/LibreOffice mà trang vẫn nhẹ.

import { numToCol } from './xlsx.js';
import { evalFormulas } from './fcalc.js';
import { t } from '../i18n.js';

// Ký tự XML 1.0 không cho phép (kể cả nửa cặp thay thế lạc lõng do OCR/AI trả về) phải bỏ hẳn,
// không thì Excel coi file hỏng và đòi sửa.
// Nửa cặp THẤP lạc lõng phải dò bằng lookbehind: bản cũ dùng (?:[^\ud800-\udbff]|^) nên "ăn" luôn
// ký tự đứng trước rồi trả nó lại, làm sót nửa cặp thứ hai khi có hai cái liền nhau.
const XAU_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
// Excel chịu tối đa 32.767 ký tự một ô; dài hơn là file bị coi như hỏng.
const O_TOI_DA = 32000;
export const esc = (s) => String(s ?? '').replace(XAU_XML, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Số ghi vào <v>: Excel không đọc được dạng mũ ("1e-7", "5e+21") nên luôn viết dạng thập phân.
 * Quá lớn / không hữu hạn thì coi như ô trống còn hơn làm hỏng cả file.
 */
export function soXml(v) {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) >= 1e15) return null;                   // ngoài khoảng Excel giữ đúng 15 chữ số
  const s = String(v);
  if (!/e/i.test(s)) return s;
  const r = v.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  return r === '-0' ? '0' : r;
}

/** Chỉ số kiểu ô trong styles.xml (cellXfs) — xem stylesXml(). */
export const S = {
  title: 1, sub: 2, head: 3, code: 4, label: 5, labelB: 6, labelI: 7,
  num: 8, numB: 9, labelTot: 10, codeTot: 11, numTot: 12, text: 13, textB: 14,
  numDo: 15, labelDo: 16, numCheck: 17,
  // Thêm cho bố cục theo model elevaTO: dải mục lớn, ô nhập tay (nền vàng), tỷ lệ %, ô chọn đơn vị.
  secHead: 18, subHead: 19, numIn: 20, numEst: 21, pct: 22, pctIn: 23,
  dec: 24, int: 25, labelIn: 26, unitCell: 27, pctB: 28,
};

/** Ô trống nhưng có nền/viền — dùng cho dải mục lớn trải ngang. */
export const cellBlank = (ref, s) => `<c r="${ref}" s="${s}"/>`;
export const cellStr = (ref, v, s) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v ?? '').slice(0, O_TOI_DA))}</t></is></c>`;
export const cellNum = (ref, v, s) => { const x = soXml(v); return x === null ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}"><v>${x}</v></c>`; };
/** Ô công thức: Excel tự tính lại khi mở, nhưng vẫn ghi sẵn giá trị để xem được ngay. */
export const cellFormula = (ref, f, v, s) => { const x = soXml(v); return `<c r="${ref}" s="${s}"><f>${esc(f)}</f>${x === null ? '' : `<v>${x}</v>`}</c>`; };
export const row = (r, cells, ht) => `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`;

// ─── Dựng ô theo hai bước: lên kế hoạch → tính sẵn giá trị công thức → ghi XML ───
// Cả ba bộ dựng sheet (form chuẩn hóa, form elevaTO, thuyết minh) đều dùng chung đoạn này.

/** Tên đã định nghĩa trong workbook, trỏ tới ô chọn đơn vị tiền. */
export const DV = 'DonVi';

/**
 * Số gốc (đồng) viết vào công thức: không bao giờ ở dạng mũ, bỏ số 0 thừa, không có "-0".
 * Ngoài khoảng Excel giữ đúng 15 chữ số thì trả null — để ô trống còn hơn ghi số đã sai.
 */
export function soThuong(v) {
  if (!Number.isFinite(v) || Math.abs(v) >= 1e15) return null;
  const r = Math.round(v * 100) / 100;
  if (r === 0) return '0';
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Tính sẵn giá trị cho các ô công thức trong kế hoạch.
 * @param ke  [{ o: [{ ref, f?, v?, trong? }] }]
 * @param dv  đơn vị đang chọn (để tính được các công thức chia cho DonVi)
 */
export function tinhSanO(ke, dv) {
  const cells = new Map();
  for (const k of ke) for (const o of k.o || []) {
    if (o.trong) continue;
    cells.set(o.ref, o.f !== undefined ? { f: o.f } : { v: Number.isFinite(o.v) ? o.v : 0 });
  }
  return evalFormulas(cells, dv === undefined ? {} : { names: { [DV]: dv } });
}

/** Một ô đã lên kế hoạch → XML. Ô công thức kèm giá trị tính sẵn nếu tính được. */
export const ghiO = (o, san) => (o.trong ? cellBlank(o.ref, o.s)
  : o.f !== undefined ? cellFormula(o.ref, o.f, san.get(o.ref) ?? o.v ?? null, o.s)
    : cellNum(o.ref, o.v, o.s));

/** Nhãn cột cho một kỳ: "Năm 2025" hoặc "6T/2025" (kỳ chưa đủ 12 tháng). */
export function periodTitle(p) {
  if (p.months === 12) return t('period.year', { y: p.year });
  return t('period.part', { m: p.months, mm: String(p.endMonth).padStart(2, '0'), y: p.year });
}

export function sheetXml({ cols, rowsXml, freeze, merges = [], validations = [] }) {
  const pane = freeze ? `<pane xSplit="${freeze.x}" ySplit="${freeze.y}" topLeftCell="${numToCol(freeze.x + 1)}${freeze.y + 1}" activePane="bottomRight" state="frozen"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>` +
    `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    (validations.length ? `<dataValidations count="${validations.length}">${validations.map(dvXml).join('')}</dataValidations>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
}

/**
 * Danh sách chọn ngay trong ô (dropdown) — Excel yêu cầu <dataValidations> sau <mergeCells>.
 * Danh sách nằm trong một chuỗi đặt giữa dấu nháy kép và các mục cách nhau dấu phẩy, nên mục nào
 * có dấu nháy kép hoặc dấu phẩy sẽ phá cú pháp → bỏ hai ký tự đó. Excel còn giới hạn độ dài
 * (danh sách 255, promptTitle 32, prompt 255).
 */
function dvXml({ sqref, list, prompt }) {
  const muc = list.map((x) => String(x).replace(/["',]/g, ' ').trim()).filter(Boolean).join(',').slice(0, 255);
  return `<dataValidation type="list" allowBlank="0" showInputMessage="1" showErrorMessage="1" sqref="${esc(sqref)}"` +
    (prompt ? ` promptTitle="${esc(String(prompt.title).slice(0, 32))}" prompt="${esc(String(prompt.text).slice(0, 255))}"` : '') +
    `><formula1>&quot;${esc(muc)}&quot;</formula1></dataValidation>`;
}

/**
 * Gói các sheet thành bộ file .xlsx hoàn chỉnh.
 * @param sheets [{ name, xml }]
 * @param opts.unit  đơn vị cố định của file (quyết định số chữ số thập phân); null = người dùng
 *                   tự chọn đơn vị ngay trong file nên dùng định dạng co giãn được
 * @param opts.definedNames { [tên]: công thức } — ví dụ DonVi trỏ tới ô chọn đơn vị
 */
export function bookFiles(sheets, { unit = null, definedNames = {} } = {}) {
  const files = {
    '[Content_Types].xml': contentTypes(sheets.length),
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    // Thứ tự thẻ trong workbook.xml phải đúng theo lược đồ OOXML: <sheets> rồi mới tới <calcPr>.
    // Đặt ngược lại thì Excel báo "We found a problem with some content" và đòi sửa file.
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets>' + dnXml(definedNames) + '<calcPr fullCalcOnLoad="1"/></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': stylesXml(unit),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = s.xml; });
  return files;
}

/** <definedNames> phải nằm giữa <sheets> và <calcPr> theo lược đồ OOXML. */
function dnXml(names) {
  const ks = Object.keys(names);
  if (!ks.length) return '';
  return `<definedNames>${ks.map((k) => `<definedName name="${esc(k)}">${esc(names[k])}</definedName>`).join('')}</definedNames>`;
}

function contentTypes(n) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    Array.from({ length: n }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';
}

/** Phông, màu nền, viền — phần khai báo thuần, tách khỏi bảng kiểu ô cho dễ đọc. */
function bangVe() {
  return '<fonts count="9">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +                                   // 0
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +                               // 1 đậm
      '<font><b/><sz val="15"/><color rgb="FF0E1613"/><name val="Calibri"/></font>' +        // 2 tiêu đề
      '<font><i/><sz val="10"/><color rgb="FF5D6B65"/><name val="Calibri"/></font>' +        // 3 chú thích
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +        // 4 chữ trắng
      '<font><sz val="10"/><color rgb="FF5D6B65"/><name val="Calibri"/></font>' +            // 5 mã số
      '<font><b/><sz val="11"/><color rgb="FFB3261E"/><name val="Calibri"/></font>' +        // 6 đỏ đậm
      '<font><sz val="11"/><color rgb="FFB3261E"/><name val="Calibri"/></font>' +            // 7 đỏ
      '<font><i/><sz val="11"/><color rgb="FF8A6D1B"/><name val="Calibri"/></font>' +        // 8 số máy ước tính
    '</fonts>' +
    '<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      ['FFE3F8F0', 'FF06704F', 'FFFDECEA', 'FFFFF7D6', 'FFEEF3F1']                           // 2…6
        .map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('') +
    '</fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD7E0DC"/></bottom><diagonal/></border></borders>';
}

function stylesXml(unit) {
  // unit = null: người dùng đổi đơn vị ngay trong file nên số có thể lẻ ở đơn vị lớn → luôn một
  // chữ số thập phân, đúng như định dạng model elevaTO dùng. (Đừng dùng "#,##0.#": Excel vẫn in
  // dấu thập phân thành "60,000." dù không có phần lẻ — LibreOffice không lộ lỗi này.)
  const fmt = unit === null || unit >= 1e6 ? '#,##0.0;(#,##0.0);"–"' : '#,##0;(#,##0);"–"';
  const xf = (font, fill, border, extra = '', num = 0) =>
    `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${num ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1"${extra ? ` applyAlignment="1">${extra}</xf>` : '/>'}`;
  const al = (a) => `<alignment ${a}/>`;
  const wrap = al('wrapText="1" vertical="top"');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="4">' +
      `<numFmt numFmtId="164" formatCode="${esc(fmt)}"/>` +
      '<numFmt numFmtId="165" formatCode="0.0%"/>' +
      '<numFmt numFmtId="166" formatCode="#,##0.0"/>' +
      '<numFmt numFmtId="167" formatCode="#,##0"/>' +
    '</numFmts>' +
    bangVe() +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="29">' +
      xf(0, 0, 0) +                                                    // 0
      xf(2, 0, 0) +                                                    // 1 title
      xf(3, 0, 0) +                                                    // 2 sub
      xf(4, 3, 0, al('horizontal="center" vertical="center" wrapText="1"')) + // 3 head
      xf(5, 0, 1, al('horizontal="center"')) +                         // 4 code
      xf(0, 0, 1, wrap) +                                              // 5 label
      xf(1, 0, 1, wrap) +                                              // 6 label đậm
      xf(0, 0, 1, al('horizontal="left" wrapText="1" vertical="top" indent="2"')) +      // 7 label thụt
      xf(0, 0, 1, '', 164) +                                           // 8 số
      xf(1, 0, 1, '', 164) +                                           // 9 số đậm
      xf(1, 2, 1, wrap) +                                              // 10 label tổng (nền xanh nhạt)
      xf(5, 2, 1, al('horizontal="center"')) +                         // 11 mã tổng
      xf(1, 2, 1, '', 164) +                                           // 12 số tổng
      xf(0, 0, 0, wrap) +                                              // 13 chữ
      xf(1, 0, 0) +                                                    // 14 chữ đậm
      xf(6, 4, 1, '', 164) +                                           // 15 số lệch (đỏ, nền hồng)
      xf(7, 4, 1, wrap) +                                              // 16 nhãn dòng lệch
      xf(1, 2, 1, '', 164) +                                           // 17 số dòng kiểm tra
      xf(1, 6, 1, wrap) +                                              // 18 dải mục lớn (A. / B1. …)
      xf(1, 0, 1, wrap) +                                              // 19 mục con
      xf(0, 5, 1, '', 164) +                                           // 20 ô nhập tay (nền vàng)
      xf(8, 5, 1, '', 164) +                                           // 21 số do máy ước tính
      xf(0, 0, 1, '', 165) +                                           // 22 tỷ lệ %
      xf(0, 5, 1, '', 165) +                                           // 23 tỷ lệ % nhập tay
      xf(0, 5, 1, '', 166) +                                           // 24 số thập phân nhập tay
      xf(0, 5, 1, '', 167) +                                           // 25 số nguyên nhập tay
      xf(0, 0, 1, al('horizontal="left" wrapText="1" vertical="top" indent="1"')) +      // 26 nhãn dòng nhập tay
      xf(1, 5, 1, al('horizontal="center"')) +                         // 27 ô chọn đơn vị
      xf(1, 0, 1, '', 165) +                                           // 28 tỷ lệ % đậm
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
