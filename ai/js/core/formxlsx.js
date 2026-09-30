// "Form chuẩn hóa 2026": dựng file .xlsx có định dạng (tiêu đề, cố định dòng tiêu đề, số có dấu phân cách,
// dòng tổng in đậm) từ bộ dữ liệu — không cần file mẫu. Trả về { đường dẫn trong zip: nội dung XML };
// trình duyệt nén bằng JSZip, bài kiểm tra nén bằng zlib.

import { statementRows } from './table.js';
import { checkDataset } from './dataset.js';
import { numToCol } from './xlsx.js';

const SHEET = { BS: 'Tình hình tài chính', IS: 'Kết quả kinh doanh', CF: 'Lưu chuyển tiền tệ' };
const TITLE = { BS: 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH', IS: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', CF: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ' };
const HEAD_ROW = 4;

// Chỉ số kiểu ô trong styles.xml (cellXfs) — xem stylesXml().
const S = { title: 1, sub: 2, head: 3, code: 4, label: 5, labelB: 6, labelI: 7, num: 8, numB: 9, labelTot: 10, codeTot: 11, numTot: 12, text: 13, textB: 14 };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function periodTitle(p) {
  if (p.months === 12) return `Năm ${p.year}`;
  return `${p.months} tháng · ${String(p.endMonth).padStart(2, '0')}/${p.year}`;
}

/**
 * @param ds       bộ dữ liệu (dataset.js)
 * @param opts.keys  Set các dòng được tick (null = mọi dòng có số)
 * @param opts.unit  1 | 1e3 | 1e6 | 1e9 ; opts.unitLabel chữ đơn vị
 * @returns { [path]: string }
 */
export function buildFormXlsx(ds, { keys = null, unit = 1e6, unitLabel = 'triệu đồng', now = new Date() } = {}) {
  const sheets = [{ name: 'Tổng quan', xml: overviewSheet(ds, unitLabel, now) }];
  for (const st of ['BS', 'IS', 'CF']) {
    const rows = statementRows(ds, st).filter((r) => !keys || keys.has(r.key));
    if (rows.length) sheets.push({ name: SHEET[st], xml: statementSheet(ds, st, rows, unit, unitLabel) });
  }
  const files = {
    '[Content_Types].xml': contentTypes(sheets.length),
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
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
    '<fonts count="6">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +                                   // 0
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +                               // 1 đậm
      '<font><b/><sz val="15"/><color rgb="FF0E1613"/><name val="Calibri"/></font>' +       // 2 tiêu đề
      '<font><i/><sz val="10"/><color rgb="FF5D6B65"/><name val="Calibri"/></font>' +       // 3 chú thích
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +       // 4 chữ trắng
      '<font><sz val="10"/><color rgb="FF5D6B65"/><name val="Calibri"/></font>' +           // 5 mã số
    '</fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F8F0"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF06704F"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD7E0DC"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="15">' +
      xf(0, 0, 0) +                                                    // 0
      xf(2, 0, 0) +                                                    // 1 title
      xf(3, 0, 0) +                                                    // 2 sub
      xf(4, 3, 0, al('horizontal="center" vertical="center" wrapText="1"')) + // 3 head
      xf(5, 0, 1, al('horizontal="center"')) +                         // 4 code
      xf(0, 0, 1, al('wrapText="1" vertical="top"')) +                 // 5 label
      xf(1, 0, 1, al('wrapText="1" vertical="top"')) +                 // 6 label đậm
      xf(0, 0, 1, al('wrapText="1" vertical="top" indent="2"')) +      // 7 label thụt
      xf(0, 0, 1, '', 164) +                                           // 8 số
      xf(1, 0, 1, '', 164) +                                           // 9 số đậm
      xf(1, 2, 1, al('wrapText="1" vertical="top"')) +                 // 10 label tổng (nền xanh nhạt)
      xf(5, 2, 1, al('horizontal="center"')) +                         // 11 mã tổng
      xf(1, 2, 1, '', 164) +                                           // 12 số tổng
      xf(0, 0, 0, al('wrapText="1" vertical="top"')) +                 // 13 chữ
      xf(1, 0, 0) +                                                    // 14 chữ đậm
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

const cellStr = (ref, v, s) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
const cellNum = (ref, v, s) => (Number.isFinite(v) ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}"/>`);
const row = (r, cells, ht) => `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`;

function sheetXml({ cols, rowsXml, freeze, merges = [] }) {
  const pane = freeze ? `<pane xSplit="${freeze.x}" ySplit="${freeze.y}" topLeftCell="${numToCol(freeze.x + 1)}${freeze.y + 1}" activePane="bottomRight" state="frozen"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews>` +
    `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>';
}

function statementSheet(ds, st, rows, unit, unitLabel) {
  const last = numToCol(2 + ds.periods.length);
  const out = [
    row(1, [cellStr('A1', ds.company || 'Doanh nghiệp', S.title)], 22),
    row(2, [cellStr('A2', TITLE[st], S.textB)]),
    row(3, [cellStr('A3', `Đơn vị: ${unitLabel} · Mẫu Thông tư 99/2025/TT-BTC · Form chuẩn hóa 2026`, S.sub)]),
    row(HEAD_ROW, [cellStr(`A${HEAD_ROW}`, 'Mã số', S.head), cellStr(`B${HEAD_ROW}`, 'Chỉ tiêu', S.head),
      ...ds.periods.map((p, i) => cellStr(`${numToCol(3 + i)}${HEAD_ROW}`, periodTitle(p), S.head))], 30),
  ];
  rows.forEach((r, i) => {
    const n = HEAD_ROW + 1 + i;
    const tot = r.lvl === 0 || r.kind === 'total';
    const sub = !tot && (r.lvl <= 1 || r.kind === 'sub');
    const lab = tot ? S.labelTot : sub ? S.labelB : r.lvl >= 3 || r.kind === 'memo' ? S.labelI : S.label;
    out.push(row(n, [
      cellStr(`A${n}`, r.code, tot ? S.codeTot : S.code),
      cellStr(`B${n}`, r.label, lab),
      ...ds.periods.map((p, j) => cellNum(`${numToCol(3 + j)}${n}`, Number.isFinite(r.values[p.id]) ? Math.round(r.values[p.id] / unit * 1000) / 1000 : null, tot ? S.numTot : sub ? S.numB : S.num)),
    ]));
  });
  return sheetXml({ cols: [9, 58, ...ds.periods.map(() => 18)], rowsXml: out, freeze: { x: 2, y: HEAD_ROW }, merges: [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`] });
}

function overviewSheet(ds, unitLabel, now) {
  const checks = checkDataset(ds);
  const out = [
    row(1, [cellStr('A1', 'FORM CHUẨN HÓA 2026 — BÁO CÁO TÀI CHÍNH', S.title)], 22),
    row(2, [cellStr('A2', ds.company || 'Doanh nghiệp', S.textB)]),
    row(3, [cellStr('A3', `Mẫu Thông tư 99/2025/TT-BTC · Đơn vị các sheet số liệu: ${unitLabel}`, S.sub)]),
    row(5, ['Kỳ', 'Số tháng', 'Nguồn (file BCTC)', 'Kiểm tra cộng dồn / đối chiếu'].map((t, i) => cellStr(`${numToCol(i + 1)}5`, t, S.head)), 24),
  ];
  ds.periods.forEach((p, i) => {
    const n = 6 + i;
    const files = [...new Set(Object.values(ds.src[p.id] || {}).map((x) => (x.manual ? 'sửa tay' : x.file)).filter(Boolean))].join('; ');
    const iss = checks[p.id] || [];
    out.push(row(n, [cellStr(`A${n}`, periodTitle(p), S.labelB), cellNum(`B${n}`, p.months, S.text), cellStr(`C${n}`, files, S.label),
      cellStr(`D${n}`, iss.length ? `${iss.length} chỗ lệch: ${iss.slice(0, 3).map((x) => x.label).join('; ')}` : '✓ Khớp', S.label)]));
  });
  let n = 7 + ds.periods.length;
  const notes = [
    'BCTC kỳ kết thúc từ năm 2025 trở về trước lập theo mẫu Thông tư 200/2014 được quy đổi sang mã số mẫu Thông tư 99/2025.',
    'Số âm hiển thị trong ngoặc. Chi phí trên KQKD ghi số dương như trên BCTC.',
    `Tạo bởi elevaTO · AI BCTC lúc ${now.toLocaleString('vi-VN')}.`,
  ];
  for (const t of notes) { out.push(row(n, [cellStr(`A${n}`, t, S.sub)])); n++; }
  return sheetXml({ cols: [22, 11, 48, 60], rowsXml: out, merges: ['A1:D1', 'A2:D2', 'A3:D3'] });
}
