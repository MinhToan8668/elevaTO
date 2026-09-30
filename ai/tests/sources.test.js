import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../js/core/dataset.js';
import { gridToSources } from '../js/core/grid.js';

const ext = (file, end, months, parts) => ({ file, company: 'CTCP ABC', meta: { ngay_ket_thuc: end, so_thang: months }, statements: parts, notes: {}, warnings: [] });

test('dựng lại bộ dữ liệu từ danh sách nguồn + số sửa tay (đổi ngày / xoá file không phải gọi lại AI)', () => {
  const sources = [
    { id: 'a', kind: 'ext', ext: ext('2025.pdf', '2025-12-31', 12, { IS: { cur: { 'IS:10': 100 }, prev: { 'IS:10': 90 } } }) },
    { id: 'b', kind: 'period', file: 'luu-tru.xlsx', period: { id: 'FY2023', year: 2023, months: 12, endMonth: 12 }, values: { 'IS:10': 70 } },
  ];
  const edits = [{ period: 'FY2025', key: 'IS:10', v: 101 }];
  const { ds, errors } = buildDataset(sources, edits);
  assert.deepEqual(errors, []);
  assert.deepEqual(ds.periods.map((p) => p.id), ['FY2023', 'FY2024', 'FY2025']);
  assert.equal(ds.values.FY2025['IS:10'], 101);
  assert.equal(ds.src.FY2025['IS:10'].manual, true);
  assert.equal(ds.values.FY2023['IS:10'], 70);
  // Bỏ nguồn a → kỳ 2024/2025 biến mất, số sửa tay cho kỳ không còn nguồn vẫn giữ (người dùng tự xoá nếu muốn)
  const r2 = buildDataset(sources.slice(1), edits);
  assert.deepEqual(r2.ds.periods.map((p) => p.id), ['FY2023']);
  assert.equal(r2.ds.values.FY2025['IS:10'], 101);
});

test('nguồn lỗi (thiếu ngày) không làm hỏng nguồn khác, báo lỗi kèm id', () => {
  const sources = [
    { id: 'x', kind: 'ext', ext: ext('scan.pdf', '', 12, { IS: { cur: { 'IS:10': 1 }, prev: {} } }) },
    { id: 'y', kind: 'ext', ext: ext('2025.pdf', '2025-12-31', 12, { IS: { cur: { 'IS:10': 5 }, prev: {} } }) },
  ];
  const { ds, errors } = buildDataset(sources, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, 'x');
  assert.match(errors[0].message, /ngày kết thúc/);
  assert.equal(ds.values.FY2025['IS:10'], 5);
});

test('ngày / số tháng người dùng nhập đè lên meta của AI', () => {
  const sources = [{ id: 'x', kind: 'ext', meta: { ngay_ket_thuc: '2026-06-30', so_thang: 6 }, ext: ext('scan.pdf', '', 12, { IS: { cur: { 'IS:10': 1 }, prev: {} } }) }];
  const { ds, errors } = buildDataset(sources, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(ds.periods.map((p) => p.id), ['Q2-2026']);
});

test('Excel sheet "Lưu trữ" → mỗi kỳ một nguồn', () => {
  const grid = { kind: 'storage', periods: [{ period: { id: 'FY2025', year: 2025, months: 12, endMonth: 12 }, values: { 'IS:10': 9 } }] };
  const s = gridToSources('f.xlsx', grid);
  assert.deepEqual(s, [{ kind: 'period', file: 'f.xlsx', period: grid.periods[0].period, values: { 'IS:10': 9 } }]);
});

test('Excel có cột Mã số → một nguồn ext, quy đổi đơn vị + dấu như kết quả AI', () => {
  const grid = { kind: 'statements', statements: {
    IS: { meta: { don_vi: 'Đơn vị tính: triệu đồng', ngay_ket_thuc: '2025-12-31', ten_cong_ty: 'CTCP ABC' },
      items: [{ c: '10', n: 'Doanh thu thuần', v: '1.000', p: '900' }, { c: '11', n: 'Giá vốn', v: '(600)', p: '(500)' }, { c: '27', n: 'Lãi lỗ LDLK', v: '1', p: '' }] },
  } };
  const [s] = gridToSources('kqkd.xlsx', grid);
  assert.equal(s.kind, 'ext');
  assert.equal(s.ext.file, 'kqkd.xlsx');
  assert.equal(s.ext.company, 'CTCP ABC');
  assert.deepEqual(s.ext.meta, { ngay_ket_thuc: '2025-12-31', so_thang: undefined });
  assert.equal(s.ext.statements.IS.cur['IS:10'], 1e9);
  assert.equal(s.ext.statements.IS.cur['IS:11'], 6e8);
  assert.equal(s.ext.statements.IS.prev['IS:11'], 5e8);
  assert.deepEqual(s.ext.units, { IS: 1e6 });
});

test('sai số kiểm tra theo đơn vị in lớn nhất trong các nguồn', () => {
  const e = ext('a.pdf', '2025-12-31', 12, { BS: { cur: { 'BS:111': 1e6 }, prev: {} } });
  const { unit } = buildDataset([{ id: 'a', kind: 'ext', ext: { ...e, units: { BS: 1e6, IS: 1 } } }], []);
  assert.equal(unit, 1e6);
  assert.equal(buildDataset([], []).unit, 1);
});
