import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildFormXlsx } from '../js/core/formxlsx.js';
import { emptyDataset, addExtraction } from '../js/core/dataset.js';
import { readCells, sheetNames, sheetPathByName } from '../js/core/xlsx.js';

// Nạp SheetJS bản trình duyệt vào sandbox (thư mục ai/ là ES module nên không require được).
const sb = {}; vm.createContext(sb);
vm.runInContext(readFileSync(new URL('../vendor/sheetjs/xlsx.full.min.js', import.meta.url), 'utf8'), sb);
const XLSX = sb.XLSX;

const ds = addExtraction(emptyDataset(), {
  file: 'BCTC 2025.pdf', company: 'CTCP <ABC> & Co', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, warnings: [], notes: {},
  statements: {
    BS: { cur: { 'BS:111': 60e9, 'BS:112': 40e9, 'BS:280': 100e9, 'BS:411': 100e9, 'BS:440': 100e9 }, prev: { 'BS:111': 50e9 } },
    IS: { cur: { 'IS:01': 500e9, 'IS:11': 300e9 }, prev: {} },
  },
});

test('Form chuẩn hóa 2026: đủ sheet, số đúng đơn vị, không cần file mẫu, SheetJS mở được', () => {
  const files = buildFormXlsx(ds, { unit: 1e6, unitLabel: 'triệu đồng' });
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) assert.ok(files[f], f);
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  assert.deepEqual(sheetNames(wb), ['Tổng quan', 'Tình hình tài chính', 'Kết quả kinh doanh']);
  const bs = readCells(files[sheetPathByName(wb, rels, 'Tình hình tài chính')], []);
  const row = Object.entries(bs).find(([k, v]) => /^A\d+$/.test(k) && v === '111')[0].slice(1);
  assert.equal(bs[`C${row}`], 50000, 'cột năm trước');
  assert.equal(bs[`D${row}`], 60000);
  assert.match(files[sheetPathByName(wb, rels, 'Tổng quan')], /CTCP &lt;ABC&gt; &amp; Co/);
  // Đọc lại bằng SheetJS như Excel sẽ mở
  const zip = { ...files };
  const book = XLSX.read(zipFiles(zip), { type: 'buffer' });
  assert.deepEqual([...book.SheetNames], ['Tổng quan', 'Tình hình tài chính', 'Kết quả kinh doanh']);
  assert.equal(book.Sheets['Kết quả kinh doanh'].D5?.v ?? findVal(book.Sheets['Kết quả kinh doanh'], '01'), 500000);
});

test('chỉ các dòng được tick; dòng tổng in đậm; cố định dòng tiêu đề', () => {
  const files = buildFormXlsx(ds, { unit: 1, unitLabel: 'đồng', keys: new Set(['BS:111', 'BS:280']) });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  assert.deepEqual(sheetNames(wb), ['Tổng quan', 'Tình hình tài chính']);
  const xml = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  const codes = Object.entries(readCells(xml, [])).filter(([k]) => /^A\d+$/.test(k)).map(([, v]) => v);
  assert.ok(codes.includes('111') && codes.includes('280') && !codes.includes('112'), codes.join());
  assert.match(xml, /state="frozen"/);
  const bold = /<cellXfs[\s\S]*<\/cellXfs>/.exec(files['xl/styles.xml'])[0];
  assert.ok(bold.includes('fontId="1"'));
});

// ─── zip tối giản (store, không nén) để SheetJS đọc trong test ───
import { deflateRawSync, crc32 } from 'node:zlib';
function zipFiles(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8'), nm = Buffer.from(name, 'utf8'), comp = deflateRawSync(data), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
function findVal(sheet, code) {
  const r = Object.keys(sheet).find((k) => /^A\d+$/.test(k) && sheet[k].v === code);
  return sheet['D' + r.slice(1)]?.v;
}
