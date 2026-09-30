import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colToNum, numToCol, splitRef, patchSheetXml, readCells, parseSharedStrings, sheetPathByName, setFullCalcOnLoad,
  sheetNames, cellsToRows,
} from '../js/core/xlsx.js';

const SHEET = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr/><sheetData>` +
  `<row r="4" spans="1:9"><c r="B4" t="s"><v>0</v></c><c r="H4" s="3"><f>'02.Control'!H$10</f><v>2024</v></c><c r="I4" s="3"><f>'02.Control'!I$10</f><v>2025</v></c></row>` +
  `<row r="8"><c r="B8" t="s"><v>1</v></c><c r="H8" s="7"><v>22078832</v></c><c r="J8" s="9"/></row>` +
  `<row r="10"><c r="I10" s="5"><f>I8+I9</f><v>2543100</v></c></row>` +
  `<row r="12" hidden="1"/>` +
  `</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`;

test('đổi cột chữ ↔ số', () => {
  assert.equal(colToNum('A'), 1); assert.equal(colToNum('Z'), 26); assert.equal(colToNum('AA'), 27); assert.equal(colToNum('AC'), 29);
  assert.equal(numToCol(1), 'A'); assert.equal(numToCol(27), 'AA'); assert.equal(numToCol(703), 'AAA');
  assert.deepEqual(splitRef('AB12'), { col: 28, row: 12 });
});

test('đọc ô: số, chuỗi chia sẻ, giá trị đã tính của ô công thức', () => {
  const ss = parseSharedStrings('<sst><si><t>Năm</t></si><si><r><t>Net </t></r><r><t xml:space="preserve">revenue</t></r></si></sst>');
  assert.deepEqual(ss, ['Năm', 'Net revenue']);
  const cells = readCells(SHEET, ss);
  assert.equal(cells.B4, 'Năm'); assert.equal(cells.B8, 'Net revenue');
  assert.equal(cells.I4, 2025); assert.equal(cells.H8, 22078832); assert.equal(cells.J8, undefined);
});

test('ghi đè ô số có sẵn, điền ô trống giữ style, thêm ô mới đúng thứ tự cột', () => {
  const { xml, skipped } = patchSheetXml(SHEET, [
    { ref: 'H8', v: 1.5 }, { ref: 'J8', v: -20 }, { ref: 'I8', v: 26632000 }, { ref: 'C8', v: 7 },
  ]);
  assert.deepEqual(skipped, []);
  const row8 = xml.match(/<row r="8"[^>]*>.*?<\/row>/)[0];
  assert.equal(row8, '<row r="8"><c r="B8" t="s"><v>1</v></c><c r="C8"><v>7</v></c><c r="H8" s="7"><v>1.5</v></c><c r="I8"><v>26632000</v></c><c r="J8" s="9"><v>-20</v></c></row>');
  assert.equal(readCells(xml, [])['I8'], 26632000);
});

test('KHÔNG bao giờ ghi đè ô công thức — báo lại để người dùng biết', () => {
  const { xml, skipped } = patchSheetXml(SHEET, [{ ref: 'I10', v: 1 }, { ref: 'I4', v: 1999 }]);
  assert.deepEqual(skipped.sort(), ['I10', 'I4']);
  assert.ok(xml.includes('<f>I8+I9</f>'));
});

test('thêm dòng mới đúng thứ tự, mở rộng dòng tự đóng, chuỗi ghi dạng inline và được thoát ký tự', () => {
  const { xml } = patchSheetXml(SHEET, [{ ref: 'D9', v: 3 }, { ref: 'B12', v: 'R&D <mảng> "A"' }, { ref: 'C200', v: 0 }]);
  const order = [...xml.matchAll(/<row r="(\d+)"/g)].map((m) => +m[1]);
  assert.deepEqual(order, [4, 8, 9, 10, 12, 200]);
  assert.ok(xml.includes('<row r="12" hidden="1"><c r="B12" t="inlineStr"><is><t xml:space="preserve">R&amp;D &lt;mảng&gt; &quot;A&quot;</t></is></c></row>'));
  assert.ok(xml.includes('<row r="200"><c r="C200"><v>0</v></c></row>'));
  assert.ok(xml.endsWith('<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>'));
});

test('ô rỗng (null) thì xoá giá trị cũ nhưng giữ style', () => {
  const { xml } = patchSheetXml(SHEET, [{ ref: 'H8', v: null }]);
  assert.ok(xml.includes('<c r="H8" s="7"/>'));
});

test('số không hữu hạn bị từ chối, không làm hỏng file', () => {
  assert.throws(() => patchSheetXml(SHEET, [{ ref: 'H8', v: NaN }]), /không hợp lệ/);
  assert.throws(() => patchSheetXml(SHEET, [{ ref: 'H0', v: 1 }]), /không hợp lệ/);
});

test('tìm file XML của sheet theo tên, bật tính lại công thức khi mở', () => {
  const wb = '<workbook><sheets><sheet name="02.Control" sheetId="2" r:id="rId3"/><sheet name="03.Input_FS" sheetId="4" r:id="rId4"/></sheets><calcPr calcId="191029"/></workbook>';
  const rels = '<Relationships><Relationship Id="rId3" Type="x" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="x" Target="/xl/worksheets/sheet4.xml"/></Relationships>';
  assert.equal(sheetPathByName(wb, rels, '03.Input_FS'), 'xl/worksheets/sheet4.xml');
  assert.equal(sheetPathByName(wb, rels, '02.Control'), 'xl/worksheets/sheet3.xml');
  assert.equal(sheetPathByName(wb, rels, 'Không có'), null);
  assert.equal(setFullCalcOnLoad(wb).match(/<calcPr[^>]*>/)[0], '<calcPr calcId="191029" fullCalcOnLoad="1"/>');
  assert.ok(setFullCalcOnLoad('<workbook><sheets/></workbook>').includes('<calcPr fullCalcOnLoad="1"/></workbook>'));
  assert.equal(sheetPathByName(wb.replace('03.Input_FS', 'Lưu trữ &amp; A'), rels, 'Lưu trữ & A'), 'xl/worksheets/sheet4.xml');
});

test('đọc file Excel BCTC không cần SheetJS: tên sheet theo thứ tự, ô → mảng 2 chiều', () => {
  const wb = '<workbook><sheets><sheet name="CĐKT" sheetId="1" r:id="rId1"/><sheet name="A&amp;B" sheetId="2" r:id="rId2"/></sheets></workbook>';
  assert.deepEqual(sheetNames(wb), ['CĐKT', 'A&B']);
  assert.deepEqual(cellsToRows({ A1: 'x', C2: 5, B1: 'y' }), [['x', 'y'], [null, null, 5]]);
});

test('ô có tham chiếu lạ (không phải A1…) bị bỏ qua khi đọc', () => {
  const xml = '<sheetData><row r="1"><c r="__proto__" t="str"><v>x</v></c><c r="A1"><v>1</v></c></row></sheetData>';
  const cells = readCells(xml, []);
  assert.deepEqual(Object.keys(cells), ['A1']);
  assert.equal(Object.getPrototypeOf(cells), Object.prototype);
});

test('file XML hỏng: thực thể ký tự ngoài Unicode không làm lỗi, thiếu </c> không làm treo', () => {
  assert.equal(parseSharedStrings('<si><t>a&#99999999;b</t></si>')[0], 'a�b');
  const bad = '<sheetData><row r="1">' + '<c r="A1"><v>1</v>'.repeat(40000) + '</row></sheetData>';
  const t = Date.now();
  readCells(bad, []);
  assert.ok(Date.now() - t < 1000, `mất ${Date.now() - t} ms`);
});
