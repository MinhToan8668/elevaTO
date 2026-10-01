// Form chi tiết elevaTO: sheet 03.Input_FS sao y template, GIỮ NGUYÊN SỐ DÒNG để dán vào model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModelXlsx, DONG_PHU_THUOC } from '../js/core/modelxlsx.js';
import { INPUT_FS } from '../js/targets/sheets.js';
import { emptyDataset, addExtraction } from '../js/core/dataset.js';
import { readCells, sheetNames, sheetPathByName } from '../js/core/xlsx.js';

const nam = (y) => ({
  file: `BCTC ${y}.pdf`, company: 'CTCP Vĩnh Hoàn', meta: { ngay_ket_thuc: `${y}-12-31`, so_thang: 12 }, warnings: [],
  statements: {
    BS: { cur: { 'BS:111': 60e9, 'BS:112': 40e9, 'BS:141': 30e9, 'BS:280': 200e9, 'BS:411': 150e9, 'BS:400': 150e9 }, prev: {} },
    IS: { cur: { 'IS:10': 500e9, 'IS:11': 300e9, 'IS:60': 90e9 }, prev: {} },
    CF: { cur: { 'CF:20': 70e9, 'CF:60': 10e9 }, prev: {} },
  },
  // Dạng đã qua noteToModel (đơn vị đồng) — dataset lưu nguyên như vậy.
  notes: { debt: { stProceeds: 100e9, stRepay: 80e9, ltProceeds: 0, ltRepay: 0 } },
});
const ds = [2024, 2025].reduce((d, y) => addExtraction(d, nam(y)), emptyDataset());
const lay = (opts = {}) => {
  const f = buildModelXlsx(ds, opts);
  const wb = f['xl/workbook.xml'];
  return { f, wb, xml: f[sheetPathByName(wb, f['xl/_rels/workbook.xml.rels'], '03.Input_FS')] };
};

test('chỉ hai sheet: Tổng quan và 03.Input_FS đúng tên sheet của model', () => {
  const { f, wb } = lay();
  for (const p of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml']) assert.ok(f[p], p);
  assert.deepEqual(sheetNames(wb), ['Tổng quan', '03.Input_FS']);
});

test('số dòng giữ nguyên của model: mỗi dòng trong template nằm đúng dòng đó trong file', () => {
  const { xml } = lay();
  const co = new Set([...xml.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1])));
  for (const r of INPUT_FS) assert.ok(co.has(r.r), `thiếu dòng ${r.r} (${r.label.slice(0, 40)})`);
  const c = readCells(xml, []);
  // Nhãn ở cột B phải trùng template, trừ 5 ô mảng kinh doanh có thể đổi theo tên thật.
  for (const r of INPUT_FS.filter((x) => x.r > 5 && x.label && !x.ref && !(x.r >= 132 && x.r <= 136))) {
    assert.equal(c[`B${r.r}`], r.label, `nhãn dòng ${r.r}`);
  }
});

test('các dòng mà dòng TRẠNG THÁI và dòng CHECK liên năm dựa vào đều có trong template', () => {
  const theo = new Map(INPUT_FS.map((r) => [r.r, r.kind]));
  for (const r of DONG_PHU_THUOC) {
    assert.ok(theo.has(r), `template không còn dòng ${r} — công thức trong modelxlsx.js sẽ trỏ vào chỗ trống`);
    assert.ok(['input', 'calc', 'check'].includes(theo.get(r)), `dòng ${r} là ${theo.get(r)}, không phải dòng có số`);
  }
});

test('cột C trở đi là từng năm, theo đúng cột của model; dòng 4 là Năm, dòng 5 Actual/Forecast', () => {
  const c = readCells(lay().xml, []);
  assert.equal(c.B4, 'Năm');
  assert.equal(c.C4, '2024');
  assert.equal(c.D4, '2025');
  assert.equal(c.C5, '2024A');
  assert.equal(c.C8, 500000, 'doanh thu 500 tỷ → 500.000 triệu đồng, đúng đơn vị model');
  assert.equal(c.C9, -300000, 'giá vốn nhập số âm như model yêu cầu');
});

test('dòng tổng / dòng CHECK là công thức như template, có kèm giá trị tính sẵn', () => {
  const { xml } = lay();
  const f = (r) => new RegExp(`<c r="C${r}"[^>]*><f>([^<]+)</f><v>(-?[0-9.]+)</v>`).exec(xml);
  assert.deepEqual(f(10)?.slice(1), ['C8+C9', '200000'], 'GROSS PROFIT = doanh thu + giá vốn');
  assert.ok(f(49), 'TOTAL CURRENT ASSETS phải là công thức có giá trị tính sẵn');
  assert.match(f(93)[1], /^C67-C92$/, 'dòng CHECK cân đối giữ nguyên công thức của model');
});

test('dòng CHECK cần năm trước: cột đầu để 0, từ cột thứ hai so với cột liền trước', () => {
  const { xml } = lay();
  assert.match(xml, /<c r="C206"[^>]*><f>0<\/f>/, 'năm đầu không có năm trước để so');
  assert.match(xml, /<c r="D212"[^>]*><f>\(D78-C78\)-\(D208\+D209\)<\/f>/);
});

test('tên mảng kinh doanh thay cho nhãn mặc định, dòng LN gộp dùng lại cùng tên', () => {
  const c = readCells(lay({ segmentNames: ['Cá tra', 'Phụ phẩm', '', '', ''] }).xml, []);
  assert.equal(c.B132, 'Cá tra');
  assert.equal(c.B140, 'Cá tra', 'template lấy nhãn dòng 140 bằng công thức =$B$132');
  assert.equal(c.B133, 'Phụ phẩm');
  assert.equal(c.B134, 'Mảng doanh thu 3', 'ô chưa đặt tên thì giữ nhãn của template');
});

test('ô nhập tay tô vàng; số máy ước tính in nghiêng để rà lại', () => {
  const { xml } = lay();
  assert.match(xml, /<c r="C8" s="20"/, 'số lấy thẳng từ BCTC: ô nhập tay nền vàng');
  assert.ok(/ s="21"/.test(xml), 'phải có ít nhất một ô số do máy suy ra (in nghiêng)');
});

test('Tổng quan nêu rõ cách dán vào model và các lưu ý khi dựng số', () => {
  const { f, wb } = lay();
  const tq = f[sheetPathByName(wb, f['xl/_rels/workbook.xml.rels'], 'Tổng quan')];
  assert.match(tq, /GIỮ NGUYÊN SỐ DÒNG/);
  assert.match(tq, /triệu đồng/);
  assert.match(tq, /2024/);
});
