// File Excel mẫu (chế độ "đã có số liệu") phải đọc lại được bằng chính core/grid.js, không cần AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateRows } from '../js/ui/mode.js';
import { readGrid } from '../js/core/grid.js';

test('file mẫu điền số → đọc lại đúng kỳ và đúng mã', () => {
  const rows = templateRows([2024, 2025]);
  for (const r of rows) {
    if (r[1] === '111') r.push(100e9, 120e9);
    if (r[0] === 'KQKD' && r[1] === '01') r.push(500e9, 650e9);
  }
  const g = readGrid([{ name: 'Luu tru', rows }]);
  assert.equal(g.kind, 'storage');
  assert.deepEqual(g.periods.map((p) => p.period.id), ['FY2024', 'FY2025']);
  assert.equal(g.periods[1].values['BS:111'], 120e9);
  assert.equal(g.periods[0].values['IS:01'], 500e9);
});
