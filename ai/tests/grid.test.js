import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGrid } from '../js/core/grid.js';
import { validate } from '../js/core/statements.js';

const LT = JSON.parse(readFileSync(new URL('./fixtures/dnp_luutru.json', import.meta.url)));

test('file FinLens (sheet "Lưu trữ"): đọc thẳng mọi kỳ theo mã TT99, không cần AI', () => {
  const r = readGrid([LT]);
  assert.equal(r.kind, 'storage');
  assert.deepEqual(r.periods.map((p) => [p.period.id, p.period.months]), [['FY2023', 12], ['FY2024', 12], ['FY2025', 12], ['Q2-2026', 6]]);
  const q = r.periods.find((p) => p.period.id === 'Q2-2026').values;
  assert.equal(q['BS:111'], 325681837959);
  assert.equal(q['IS:01'], 5439173290986);
  assert.equal(r.periods[0].values['IS:01'], 2023, 'dữ liệu hỏng của FinLens vẫn được đọc nguyên trạng để bộ kiểm tra bắt');
});

test('bộ kiểm tra bắt được lỗi dữ liệu FinLens của DNP (CĐKT không cân vì số đặt nhầm ô)', () => {
  const q = readGrid([LT]).periods.find((p) => p.period.id === 'Q2-2026').values;
  const issues = validate(q, { cashMatchesBS: false });
  assert.ok(issues.some((i) => i.key === 'BS:280=440' && Math.abs(i.diff) > 1e13), JSON.stringify(issues.map((i) => i.key)));
});

// BCTC Excel thông thường: có cột Mã số, cột Thuyết minh, 2 cột số, dòng đơn vị tính.
const SIMPLE = { name: 'BCDKT', rows: [
  ['CÔNG TY CỔ PHẦN ABC'],
  ['BÁO CÁO TÌNH HÌNH TÀI CHÍNH'],
  ['Tại ngày 31 tháng 12 năm 2025'],
  [null, null, null, 'Đơn vị tính: VND'],
  ['TÀI SẢN', 'Mã số', 'Thuyết minh', '31/12/2025', '01/01/2025'],
  ['A. TÀI SẢN NGẮN HẠN', 100, null, 30, 25],
  ['I. Tiền và các khoản tương đương tiền', 110, 'V.01', 30, 25],
  ['1. Tiền', 111, null, '20', '(5)'],
  ['2. Các khoản tương đương tiền', 112, null, 10, 30],
  ['TỔNG CỘNG TÀI SẢN', 270, null, 30, 25],
  ['C. NỢ PHẢI TRẢ', 300, null, 10, 5],
  ['1. Phải trả người bán ngắn hạn', 311, null, 10, 5],
  ['D. VỐN CHỦ SỞ HỮU', 400, null, 20, 20],
  ['1. Vốn góp của chủ sở hữu', 411, null, 20, 20],
  ['TỔNG CỘNG NGUỒN VỐN', 440, null, 30, 25],
] };

test('BCTC Excel có cột "Mã số": nhận ra bảng, bỏ cột Thuyết minh, lấy 2 cột số, đơn vị, ngày', () => {
  const r = readGrid([SIMPLE]);
  assert.equal(r.kind, 'statements');
  const bs = r.statements.BS;
  assert.equal(bs.meta.don_vi, 'Đơn vị tính: VND');
  assert.equal(bs.meta.ngay_ket_thuc, '2025-12-31');
  assert.deepEqual(bs.items.find((i) => i.c === '111'), { c: '111', n: '1. Tiền', v: '20', p: '(5)' });
  assert.deepEqual(bs.items.find((i) => i.c === '110'), { c: '110', n: 'I. Tiền và các khoản tương đương tiền', v: '30', p: '25' });
  assert.equal(r.statements.IS, undefined);
});

test('không nhận ra bảng nào → báo rõ', () => {
  assert.throws(() => readGrid([{ name: 'x', rows: [['a', 'b'], [1, 2]] }]), /Không nhận ra/);
});
