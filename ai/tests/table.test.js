import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementRows, tableAOA, periodLabel } from '../js/core/table.js';

const ds = {
  company: 'CTCP ABC',
  periods: [{ id: 'FY2024', year: 2024, months: 12 }, { id: 'FY2025', year: 2025, months: 12 }, { id: 'Q2-2026', year: 2026, months: 6 }],
  values: { FY2024: { 'BS:111': 5e9 }, FY2025: { 'BS:111': 8e9, 'BS:112': 2e9, 'IS:10': 3e9 }, 'Q2-2026': {} },
};

test('dòng hiển thị: có số ở ít nhất một kỳ, dòng tổng tự tính', () => {
  const rows = statementRows(ds, 'BS');
  const k = rows.map((r) => r.key);
  assert.ok(k.includes('BS:111') && k.includes('BS:110') && k.includes('BS:280'));
  assert.ok(!k.includes('BS:131'));
  assert.equal(rows.find((r) => r.key === 'BS:110').values.FY2025, 10e9);
  assert.ok(statementRows(ds, 'BS', { showEmpty: true }).length > 100);
});

test('bảng tải về: chỉ dòng được tick, đổi đơn vị tỷ, nhãn kỳ', () => {
  const aoa = tableAOA(ds, { keys: new Set(['BS:111', 'IS:10']), unit: 1e9, unitLabel: 'tỷ đồng' });
  assert.deepEqual(aoa[0], ['CTCP ABC']);
  assert.deepEqual(aoa[4], ['Mã số', 'Chỉ tiêu', 'Năm 2024', 'Năm 2025', '6T/2026']);
  assert.deepEqual(aoa[5], ['111', '1. Tiền', 5, 8, null]);
  assert.equal(aoa.filter((r) => r[0] === 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ').length, 0);
  assert.equal(periodLabel({ year: 2025, months: 12 }), 'Năm 2025');
});
