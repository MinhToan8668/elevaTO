// File .xlsx viết tay phải đúng lược đồ OOXML, nếu không Excel báo "We found a problem with some
// content" rồi đòi sửa file. openpyxl / LibreOffice / SheetJS đều đọc dễ dãi nên không bắt được —
// các bài dưới đây kiểm đúng những chỗ Excel soi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFormXlsx } from '../js/core/formxlsx.js';
import { buildModelXlsx } from '../js/core/modelxlsx.js';
import { soXml, esc } from '../js/core/xlsxout.js';
import { emptyDataset, addExtraction } from '../js/core/dataset.js';
import { computeTotals } from '../js/core/statements.js';

// ─── Thứ tự thẻ con theo ECMA-376 ───
const THU_TU = {
  workbook: ['fileVersion', 'fileSharing', 'workbookPr', 'workbookProtection', 'bookViews', 'sheets',
    'functionGroups', 'externalReferences', 'definedNames', 'calcPr', 'oleSize', 'customWorkbookViews',
    'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'],
  worksheet: ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr',
    'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate',
    'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks',
    'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties',
    'cellWatches', 'ignoredErrors', 'drawing', 'extLst'],
  styleSheet: ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs',
    'tableStyles', 'colors', 'extLst'],
};

/** Tên các thẻ con ngay dưới gốc, theo đúng thứ tự xuất hiện. */
function conTrucTiep(xml, goc) {
  const than = xml.split(`<${goc}`, 2)[1].split('>', 2)[1] ?? xml.slice(xml.indexOf(`<${goc}`));
  const out = [];
  let sau = 0;
  for (const m of than.matchAll(/<(\/?)([A-Za-z:]+)[^>]*?(\/?)>/g)) {
    const [, dong, ten, tu] = m;
    if (dong) { sau -= 1; continue; }
    if (sau === 0) out.push(ten);
    if (!tu) sau += 1;
  }
  return out;
}

const dsMau = (() => {
  const BS = computeTotals({ 'BS:111': 60e9, 'BS:112': 40e9, 'BS:141': 30e9, 'BS:221': 70e9, 'BS:311': 50e9, 'BS:411': 150e9 });
  const IS = computeTotals({ 'IS:01': 500e9, 'IS:11': 300e9, 'IS:25': 30e9, 'IS:51': 25e9 });
  // Có cả thuyết minh để các sheet chi tiết cũng đi qua bài kiểm lược đồ OOXML.
  const notes = {
    segments: [{ name: 'Xe du lịch', revenue: 300e9, gross: 120e9 }, { name: 'Xe tải', revenue: 200e9 }],
    fixedAssets: { tangible: [{ cls: 'machinery', name: 'Máy móc', cost: 80e9, accDep: -20e9, additions: 15e9, depreciation: -8e9 }],
      intangible: [{ cls: 'software', name: 'Phần mềm', cost: 10e9, accDep: -3e9, additions: 2e9, depreciation: -1e9 }] },
    goodwill: { cost: 25e9, accAmort: -5e9, additions: 0, amortization: -2.5e9 },
    equity: { capIssued: 10e9, dividends: 30e9 },
    debt: { stProceeds: 100e9, stRepay: 80e9, ltProceeds: 20e9, ltRepay: 5e9 },
    shares: 150e6, taxRate: 0.2,
  };
  let ds = emptyDataset();
  for (const y of [2024, 2025]) {
    ds = addExtraction(ds, { file: `BCTC ${y}.pdf`, company: 'CÔNG TY TRÁCH NHIỆM HỮU HẠN THACO AUTO',
      meta: { ngay_ket_thuc: `${y}-12-31`, so_thang: 12 }, warnings: [], notes,
      statements: { BS: { cur: BS, prev: {} }, IS: { cur: IS, prev: {} } } });
  }
  return ds;
})();

const caHaiForm = () => [
  ['Form chuẩn hóa', buildFormXlsx(dsMau, { unit: 1e6, details: true })],
  ['Form chuẩn hóa (đồng)', buildFormXlsx(dsMau, { unit: 1 })],
  ['Form chi tiết', buildModelXlsx(dsMau, { segmentNames: ['Xe du lịch', 'Xe tải', '', '', ''] })],
];

test('thứ tự thẻ đúng lược đồ OOXML — <sheets> phải đứng trước <calcPr>', () => {
  for (const [ten, files] of caHaiForm()) {
    for (const [path, xml] of Object.entries(files)) {
      const goc = /<(workbook|worksheet|styleSheet)[ >]/.exec(xml)?.[1];
      if (!goc) continue;
      const bang = THU_TU[goc];
      const con = conTrucTiep(xml, goc).filter((k) => bang.includes(k));
      const viTri = con.map((k) => bang.indexOf(k));
      assert.deepEqual(viTri, [...viTri].sort((a, b) => a - b), `${ten} · ${path}: sai thứ tự ${con.join(', ')}`);
    }
  }
  // Chốt riêng chỗ từng làm Excel đòi sửa file.
  const wb = buildFormXlsx(dsMau, {})['xl/workbook.xml'];
  assert.ok(wb.indexOf('<sheets>') < wb.indexOf('<calcPr'), '<calcPr> phải nằm sau <sheets>');
});

test('thuộc tính count khớp số thẻ con thật (Excel có kiểm)', () => {
  for (const [ten, files] of caHaiForm()) {
    for (const [path, xml] of Object.entries(files)) {
      for (const m of xml.matchAll(/<(numFmts|fonts|fills|borders|cellStyleXfs|cellXfs|cellStyles|mergeCells) count="(\d+)">([\s\S]*?)<\/\1>/g)) {
        const [, the, soGhi, than] = m;
        const con = { numFmts: 'numFmt', fonts: 'font', fills: 'fill', borders: 'border',
          cellStyleXfs: 'xf', cellXfs: 'xf', cellStyles: 'cellStyle', mergeCells: 'mergeCell' }[the];
        const thuc = [...than.matchAll(new RegExp(`<${con}[ />]`, 'g'))].length;
        assert.equal(Number(soGhi), thuc, `${ten} · ${path}: <${the} count="${soGhi}"> nhưng có ${thuc} <${con}>`);
      }
    }
  }
});

test('tên sheet hợp lệ: không rỗng, ≤31 ký tự, không ký tự cấm, không trùng nhau', () => {
  for (const [ten, files] of caHaiForm()) {
    const names = [...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(names.length, `${ten}: không có sheet nào`);
    assert.equal(new Set(names).size, names.length, `${ten}: tên sheet trùng nhau — ${names.join(', ')}`);
    for (const n of names) {
      assert.ok(n.length >= 1 && n.length <= 31, `${ten}: tên sheet "${n}" dài ${n.length} ký tự`);
      assert.doesNotMatch(n, /[:\\/?*[\]]/, `${ten}: tên sheet "${n}" có ký tự Excel cấm`);
      assert.doesNotMatch(n, /^'|'$/, `${ten}: tên sheet "${n}" không được mở/đóng bằng dấu nháy`);
    }
  }
});

test('số trong <v> luôn là thập phân, không bao giờ ở dạng mũ', () => {
  assert.equal(soXml(1e-7), '0.0000001');
  assert.equal(soXml(1234.5), '1234.5');
  assert.equal(soXml(-0.0000001), '-0.0000001');
  assert.equal(soXml(5e21), null, 'quá lớn thì để ô trống còn hơn hỏng file');
  assert.equal(soXml(NaN), null);
  assert.equal(soXml(Infinity), null);
  for (const [ten, files] of caHaiForm()) {
    for (const [path, xml] of Object.entries(files)) {
      for (const m of xml.matchAll(/<v>([^<]*)<\/v>/g)) {
        assert.match(m[1], /^-?\d+(\.\d+)?$/, `${ten} · ${path}: <v>${m[1]}</v> không phải số thập phân`);
      }
    }
  }
});

test('ký tự XML không hợp lệ bị bỏ, kể cả nửa cặp thay thế lạc lõng', () => {
  assert.equal(esc('A\u0007B'), 'AB');
  assert.equal(esc('A\ud800B'), 'AB', 'nửa cặp cao lạc lõng');
  assert.equal(esc('A\udc00B'), 'AB', 'nửa cặp thấp lạc lõng');
  // Bản cũ dò nửa cặp thấp bằng cách "ăn" ký tự đứng trước nên sót cái thứ hai → Excel đòi sửa file.
  assert.equal(esc('\udc00\udc00'), '', 'hai nửa cặp thấp liền nhau');
  assert.equal(esc('a\udc00\udc01'), 'a');
  assert.equal(esc('\u0001\udc00'), '', 'ký tự điều khiển ngay trước nửa cặp thấp');
  assert.equal(esc('x\u0000\udc00'), 'x');
  assert.equal(esc('Chữ 𝒜 ổn'), 'Chữ 𝒜 ổn', 'cặp thay thế hợp lệ phải giữ nguyên');
  assert.equal(esc('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
});

test('ô chữ bị cắt về dưới trần 32.767 ký tự của Excel', () => {
  const dai = 'a'.repeat(40000);
  const xml = buildFormXlsx({ ...dsMau, company: dai }, {})['xl/worksheets/sheet1.xml'];
  const t = /<t xml:space="preserve">(a+)<\/t>/.exec(xml);
  assert.ok(t && t[1].length <= 32767, `ô chữ dài ${t ? t[1].length : 0} ký tự`);
});

test('ô chọn đơn vị: danh sách và lời nhắc trong giới hạn Excel chấp nhận', () => {
  const tq = buildFormXlsx(dsMau, {})['xl/worksheets/sheet1.xml'];
  const dv = /<formula1>&quot;([^<]*)&quot;<\/formula1>/.exec(tq);
  assert.ok(dv, 'phải có danh sách đơn vị');
  assert.doesNotMatch(dv[1], /&quot;|'/, 'mục trong danh sách không được chứa dấu nháy');
  assert.ok(dv[1].length <= 255, 'Excel chỉ nhận danh sách tối đa 255 ký tự');
  // Quá giới hạn là Excel coi file hỏng — bản dịch mới dài hơn cũng không được vượt.
  assert.ok((/ promptTitle="([^"]*)"/.exec(tq) || [, ''])[1].length <= 32, 'promptTitle tối đa 32 ký tự');
  assert.ok((/ prompt="([^"]*)"/.exec(tq) || [, ''])[1].length <= 255, 'prompt tối đa 255 ký tự');
});

test('công thức không bao giờ bắt đầu bằng dấu "=" (Excel từ chối mở)', () => {
  for (const [ten, files] of caHaiForm()) {
    for (const [path, xml] of Object.entries(files)) {
      for (const m of xml.matchAll(/<f>([^<]*)<\/f>/g)) {
        assert.doesNotMatch(m[1], /^=/, `${ten} · ${path}: <f>${m[1]}</f>`);
      }
    }
  }
});

test('mã ô trong <c r="…"> khớp số dòng của <row r="…"> chứa nó', () => {
  for (const [ten, files] of caHaiForm()) {
    for (const [path, xml] of Object.entries(files)) {
      if (!xml.includes('<sheetData>')) continue;
      const dong = [];
      for (const m of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        dong.push(Number(m[1]));
        for (const c of m[2].matchAll(/<c r="([A-Z]+)(\d+)"/g)) {
          assert.equal(Number(c[2]), Number(m[1]), `${ten} · ${path}: ô ${c[1]}${c[2]} nằm trong <row r="${m[1]}">`);
        }
      }
      assert.deepEqual(dong, [...dong].sort((a, b) => a - b), `${ten} · ${path}: số dòng không tăng dần`);
      assert.equal(new Set(dong).size, dong.length, `${ten} · ${path}: trùng số dòng`);
    }
  }
});

test('công thức chỉ trỏ tới dòng có thật trong cùng sheet', () => {
  for (const [ten, files] of caHaiForm()) {
    for (const [path, xml] of Object.entries(files)) {
      if (!xml.includes('<sheetData>')) continue;
      const co = new Set([...xml.matchAll(/<row r="(\d+)"/g)].map((m) => m[1]));
      for (const m of xml.matchAll(/<f>([^<]+)<\/f>/g)) {
        for (const ref of m[1].matchAll(/([A-Z]+)(\d+)/g)) {
          assert.ok(co.has(ref[2]), `${ten} · ${path}: công thức "${m[1]}" trỏ tới dòng ${ref[2]} không tồn tại`);
        }
      }
    }
  }
});
