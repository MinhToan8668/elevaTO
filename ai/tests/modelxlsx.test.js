// Form chi tiết elevaTO: file .xlsx xuất thẳng, không cần file model gốc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildModelXlsx } from '../js/core/modelxlsx.js';
import { emptyDataset, addExtraction } from '../js/core/dataset.js';
import { readCells, sheetNames, sheetPathByName } from '../js/core/xlsx.js';

const sb = {}; vm.createContext(sb);
vm.runInContext(readFileSync(new URL('../vendor/sheetjs/xlsx.full.min.js', import.meta.url), 'utf8'), sb);

const nam = (y) => ({
  file: `BCTC ${y}.pdf`, company: 'CTCP Vĩnh Hoàn', meta: { ngay_ket_thuc: `${y}-12-31`, so_thang: 12 }, warnings: [],
  statements: {
    BS: { cur: { 'BS:111': 60e9, 'BS:112': 40e9, 'BS:141': 30e9, 'BS:280': 200e9, 'BS:411': 150e9, 'BS:400': 150e9 }, prev: {} },
    IS: { cur: { 'IS:10': 500e9, 'IS:11': 300e9, 'IS:60': 90e9 }, prev: {} },
    CF: { cur: { 'CF:20': 70e9, 'CF:60': 10e9 }, prev: {} },
  },
  notes: { debt: { vay_ngan_han: { vay_trong_ky: 100e9, tra_trong_ky: 80e9 } },
    segments: [{ ten: 'Cá tra', doanh_thu: 400e9, loi_nhuan_gop: 80e9 }] },
});
const ds = [2024, 2025].reduce((d, y) => addExtraction(d, nam(y)), emptyDataset());

test('xuất thẳng được file model: có sheet theo từng nhóm dòng, mỗi năm một cột', () => {
  const files = buildModelXlsx(ds, { unit: 1e6, unitLabel: 'triệu đồng' });
  for (const f of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml']) assert.ok(files[f], f);
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const names = sheetNames(wb);
  assert.equal(names[0], 'Tổng quan');
  for (const t of ['Kết quả kinh doanh', 'Tình hình tài chính']) assert.ok(names.includes(t), names.join(' | '));
  const kq = readCells(files[sheetPathByName(wb, rels, 'Kết quả kinh doanh')], []);
  assert.equal(kq.C4, 'Năm 2024');
  assert.equal(kq.D4, 'Năm 2025');
  const dt = Object.entries(kq).find(([k, v]) => /^B\d+$/.test(k) && v === 'Doanh thu thuần');
  assert.ok(dt, 'phải có dòng Doanh thu thuần');
  assert.equal(Number(kq[`C${dt[0].slice(1)}`]), 500000, 'doanh thu 500 tỷ ghi 500.000 triệu đồng');
});

test('có sheet thuyết minh model cần, cột "Dòng model" trỏ đúng dòng 03.Input_FS; thiếu thuyết minh mảng thì dồn vào mảng 1', () => {
  const files = buildModelXlsx(ds, { unit: 1e6, unitLabel: 'triệu đồng' });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const names = sheetNames(wb);
  assert.ok(names.includes('Doanh thu theo mảng'), names.join(' | '));
  const mang = readCells(files[sheetPathByName(wb, rels, 'Doanh thu theo mảng')], []);
  const r = Object.keys(mang).filter((k) => /^A\d+$/.test(k) && Number(mang[k]) === 132)[0];
  assert.ok(r, 'dòng 132 của model = doanh thu mảng 1');
  assert.equal(Number(mang[`C${r.slice(1)}`]), 500000, 'chưa có thuyết minh bộ phận → toàn bộ doanh thu vào mảng 1');
  const tq = readCells(files[sheetPathByName(wb, rels, 'Tổng quan')], []);
  assert.ok(Object.values(tq).some((v) => typeof v === 'string' && /mảng 1/.test(v)), 'Tổng quan phải nêu lưu ý đó');
});

test('đơn vị hiển thị đổi được, không ảnh hưởng số gốc', () => {
  const lay = (unit) => {
    const f = buildModelXlsx(ds, { unit });
    const c = readCells(f[sheetPathByName(f['xl/workbook.xml'], f['xl/_rels/workbook.xml.rels'], 'Kết quả kinh doanh')], []);
    const r = Object.entries(c).find(([k, v]) => /^B\d+$/.test(k) && v === 'Doanh thu thuần')[0].slice(1);
    return Number(c[`C${r}`]);
  };
  assert.equal(lay(1e9) * 1000, lay(1e6));
});
