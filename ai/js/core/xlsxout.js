// Bộ ghi .xlsx tối giản dùng chung cho các file xuất ra (Form chuẩn hóa, Form chi tiết elevaTO).
// Trả về { đường dẫn trong zip: nội dung XML }; trình duyệt nén bằng JSZip, bài kiểm tra nén bằng zlib.
// Không dùng thư viện ngoài để file xuất ra luôn mở được bằng Excel/LibreOffice mà trang vẫn nhẹ.

import { numToCol } from './xlsx.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Chỉ số kiểu ô trong styles.xml (cellXfs) — xem stylesXml(). */
export const S = {
  title: 1, sub: 2, head: 3, code: 4, label: 5, labelB: 6, labelI: 7,
  num: 8, numB: 9, labelTot: 10, codeTot: 11, numTot: 12, text: 13, textB: 14,
  numDo: 15, labelDo: 16, numCheck: 17,
};

export const cellStr = (ref, v, s) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
export const cellNum = (ref, v, s) => (Number.isFinite(v) ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}"/>`);
/** Ô công thức: Excel tự tính lại khi mở, nhưng vẫn ghi sẵn giá trị để xem được ngay. */
export const cellFormula = (ref, f, v, s) => `<c r="${ref}" s="${s}"><f>${esc(f)}</f>${Number.isFinite(v) ? `<v>${v}</v>` : ''}</c>`;
export const row = (r, cells, ht) => `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`;

export function sheetXml({ cols, rowsXml, freeze, merges = [] }) {
  const pane = freeze ? `<pane xSplit="${freeze.x}" ySplit="${freeze.y}" topLeftCell="${numToCol(freeze.x + 1)}${freeze.y + 1}" activePane="bottomRight" state="frozen"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>` +
    `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
}

/** Gói các sheet thành bộ file .xlsx hoàn chỉnh. @param sheets [{ name, xml }] */
export function bookFiles(sheets, unit) {
  const files = {
    '[Content_Types].xml': contentTypes(sheets.length),
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><calcPr fullCalcOnLoad="1"/><sheets>' +
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': stylesXml(unit),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = s.xml; });
  return files;
}

function contentTypes(n) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    Array.from({ length: n }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';
}

function stylesXml(unit) {
  const fmt = unit >= 1e6 ? '#,##0.0;(#,##0.0);"–"' : '#,##0;(#,##0);"–"';
  const xf = (font, fill, border, extra = '', num = 0) =>
    `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${num ? ' applyNumberFormat="1"' : ''} applyFont="1" applyFill="1" applyBorder="1"${extra ? ` applyAlignment="1">${extra}</xf>` : '/>'}`;
  const al = (a) => `<alignment ${a}/>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="${esc(fmt)}"/></numFmts>` +
    '<fonts count="8">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +                                   // 0
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +                               // 1 đậm
      '<font><b/><sz val="15"/><color rgb="FF0E1613"/><name val="Calibri"/></font>' +       // 2 tiêu đề
      '<font><i/><sz val="10"/><color rgb="FF5D6B65"/><name val="Calibri"/></font>' +       // 3 chú thích
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +       // 4 chữ trắng
      '<font><sz val="10"/><color rgb="FF5D6B65"/><name val="Calibri"/></font>' +           // 5 mã số
      '<font><b/><sz val="11"/><color rgb="FFB3261E"/><name val="Calibri"/></font>' +       // 6 đỏ đậm
      '<font><sz val="11"/><color rgb="FFB3261E"/><name val="Calibri"/></font>' +           // 7 đỏ
    '</fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F8F0"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF06704F"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD7E0DC"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="18">' +
      xf(0, 0, 0) +                                                    // 0
      xf(2, 0, 0) +                                                    // 1 title
      xf(3, 0, 0) +                                                    // 2 sub
      xf(4, 3, 0, al('horizontal="center" vertical="center" wrapText="1"')) + // 3 head
      xf(5, 0, 1, al('horizontal="center"')) +                         // 4 code
      xf(0, 0, 1, al('wrapText="1" vertical="top"')) +                 // 5 label
      xf(1, 0, 1, al('wrapText="1" vertical="top"')) +                 // 6 label đậm
      xf(0, 0, 1, al('horizontal="left" wrapText="1" vertical="top" indent="2"')) +      // 7 label thụt
      xf(0, 0, 1, '', 164) +                                           // 8 số
      xf(1, 0, 1, '', 164) +                                           // 9 số đậm
      xf(1, 2, 1, al('wrapText="1" vertical="top"')) +                 // 10 label tổng (nền xanh nhạt)
      xf(5, 2, 1, al('horizontal="center"')) +                         // 11 mã tổng
      xf(1, 2, 1, '', 164) +                                           // 12 số tổng
      xf(0, 0, 0, al('wrapText="1" vertical="top"')) +                 // 13 chữ
      xf(1, 0, 0) +                                                    // 14 chữ đậm
      xf(6, 4, 1, '', 164) +                                           // 15 số lệch (đỏ, nền hồng)
      xf(7, 4, 1, al('wrapText="1" vertical="top"')) +                 // 16 nhãn dòng lệch
      xf(1, 2, 1, '', 164) +                                           // 17 số dòng kiểm tra
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
