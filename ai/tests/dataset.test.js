import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDataset, addExtraction, checkDataset, setValue } from '../js/core/dataset.js';

const ext = (end, months, parts, extra = {}) => ({
  file: `BCTC ${end}.pdf`, company: 'CTCP ABC',
  meta: { ngay_ket_thuc: end, so_thang: months },
  statements: parts, notes: extra.notes || {}, warnings: [],
});

test('BCTC năm 2025 (có cột 2024) + BCTC năm 2024 (có cột 2023) → 3 năm, sắp theo thời gian', () => {
  let ds = emptyDataset();
  ds = addExtraction(ds, ext('2025-12-31', 12, {
    BS: { cur: { 'BS:111': 10 }, prev: { 'BS:111': 8 } },
    IS: { cur: { 'IS:10': 100 }, prev: { 'IS:10': 90 } },
  }));
  ds = addExtraction(ds, ext('2024-12-31', 12, {
    BS: { cur: { 'BS:111': 7 }, prev: { 'BS:111': 5 } },
    IS: { cur: { 'IS:10': 91 }, prev: { 'IS:10': 80 } },
  }));
  assert.deepEqual(ds.periods.map((p) => p.id), ['FY2023', 'FY2024', 'FY2025']);
  assert.equal(ds.company, 'CTCP ABC');
  assert.equal(ds.values.FY2023['IS:10'], 80);
  // 2024: báo cáo 2025 (mới hơn, số đã điều chỉnh lại) được ưu tiên, chỗ khác nhau được ghi lại
  assert.equal(ds.values.FY2024['BS:111'], 8);
  assert.equal(ds.values.FY2024['IS:10'], 90);
  assert.deepEqual(ds.conflicts.map((c) => [c.period, c.key, c.kept, c.other]), [['FY2024', 'BS:111', 8, 7], ['FY2024', 'IS:10', 90, 91]]);
  assert.equal(ds.src.FY2024['IS:10'].file, 'BCTC 2025-12-31.pdf');
  assert.equal(ds.src.FY2024['IS:10'].col, 'prev');
});

test('thêm lại đúng file cũ (thứ tự ngược) vẫn giữ số của báo cáo mới hơn', () => {
  let ds = emptyDataset();
  ds = addExtraction(ds, ext('2024-12-31', 12, { IS: { cur: { 'IS:10': 91 }, prev: {} } }));
  ds = addExtraction(ds, ext('2025-12-31', 12, { IS: { cur: { 'IS:10': 100 }, prev: { 'IS:10': 90 } } }));
  assert.equal(ds.values.FY2024['IS:10'], 90);
});

test('BCTC bán niên: CĐKT cột trước là cuối năm trước, KQKD cột trước là 6 tháng năm trước', () => {
  const ds = addExtraction(emptyDataset(), ext('2026-06-30', 6, {
    BS: { cur: { 'BS:111': 3 }, prev: { 'BS:111': 2 } },
    IS: { cur: { 'IS:10': 50 }, prev: { 'IS:10': 40 } },
  }));
  assert.deepEqual(ds.periods.map((p) => [p.id, p.months]), [['Q2-2025', 6], ['FY2025', 12], ['Q2-2026', 6]]);   // theo ngày kết thúc
  assert.deepEqual(ds.values.FY2025, { 'BS:111': 2 });
  assert.deepEqual(ds.values['Q2-2025'], { 'IS:10': 40 });
});

test('thuyết minh gắn vào kỳ hiện tại của báo cáo; sửa tay một ô được ghi nguồn "sửa tay"', () => {
  let ds = addExtraction(emptyDataset(), ext('2025-12-31', 12, { IS: { cur: { 'IS:10': 1 }, prev: {} } }, { notes: { debt: { stProceeds: 5 } } }));
  assert.deepEqual(ds.notes.FY2025.debt, { stProceeds: 5 });
  ds = setValue(ds, 'FY2025', 'IS:10', 2);
  assert.equal(ds.values.FY2025['IS:10'], 2);
  assert.equal(ds.src.FY2025['IS:10'].manual, true);
  ds = setValue(ds, 'FY2025', 'IS:10', null);
  assert.equal('IS:10' in ds.values.FY2025, false);
});

test('không có ngày kết thúc kỳ → báo lỗi rõ, không đoán', () => {
  assert.throws(() => addExtraction(emptyDataset(), ext('', 12, {})), /ngày kết thúc kỳ/);
});

test('kiểm tra cả bộ: từng kỳ + tiền đầu kỳ LCTT năm nay = tiền cuối năm trước trên CĐKT', () => {
  let ds = emptyDataset();
  ds = addExtraction(ds, ext('2025-12-31', 12, {
    BS: { cur: { 'BS:111': 10e9, 'BS:110': 10e9 }, prev: { 'BS:111': 8e9, 'BS:110': 8e9 } },
    CF: { cur: { 'CF:50': 2e9, 'CF:60': 7e9, 'CF:70': 9e9 }, prev: {} },
  }));
  const r = checkDataset(ds);
  const keys = r.FY2025.map((i) => i.key);
  assert.ok(keys.includes('CF:60=BS:110(năm trước)'));
  assert.ok(keys.includes('CF:70=BS:110'));
  assert.deepEqual(r.FY2024, []);
});

import { addPeriodValues } from '../js/core/dataset.js';
test('nạp thẳng kỳ từ file FinLens (đã có mã TT99)', () => {
  const ds = addPeriodValues(emptyDataset(), { file: 'finlens.xlsx', period: { id: 'Q2-2026', year: 2026, months: 6, endMonth: 6 }, values: { 'BS:111': 5, 'IS:10': 7 } });
  assert.deepEqual(ds.periods.map((p) => p.id), ['Q2-2026']);
  assert.deepEqual(ds.values['Q2-2026'], { 'BS:111': 5, 'IS:10': 7 });
});
