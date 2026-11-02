import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyKey, sameCompany, groupCompanies, pickCompany } from '../js/core/company.js';
import { buildDataset } from '../js/core/dataset.js';

test('tên công ty bỏ loại hình doanh nghiệp, dấu và hoa/thường trước khi so', () => {
  assert.equal(companyKey('CÔNG TY CỔ PHẦN SỮA VIỆT NAM'), 'sua viet nam');
  assert.equal(companyKey('CTCP Sữa Việt Nam và các công ty con'), 'sua viet nam');
  assert.equal(companyKey('Công ty TNHH MTV Thép Đông Á'), 'thep dong a');
  assert.ok(sameCompany('Công ty Cổ phần Sữa Việt Nam', 'CTCP SỮA VIỆT NAM'));
  assert.ok(sameCompany('Tập đoàn Hòa Phát', 'Công ty Cổ phần Tập đoàn Hòa Phát'));
  assert.ok(!sameCompany('Công ty Cổ phần Sữa Việt Nam', 'Công ty Cổ phần Bus Thaco'));
  assert.ok(sameCompany('', 'Bất kỳ'), 'thiếu tên một bên → không tách');
});

const ext = (file, company, end, cur) => ({ file, company, meta: { ngay_ket_thuc: end, so_thang: 12 }, statements: { BS: { cur, prev: {} } }, warnings: [], notes: {} });
const src = (id, e) => ({ id, kind: 'ext', ext: e });

test('BCTC của hai công ty khác nhau không bị gộp: chỉ dùng số của một công ty', () => {
  const sources = [
    src('a', ext('VNM_2025.pdf', 'Công ty Cổ phần Sữa Việt Nam', '2025-12-31', { 'BS:280': 100 })),
    src('b', ext('VNM_2024.pdf', 'CTCP SỮA VIỆT NAM', '2024-12-31', { 'BS:280': 90 })),
    src('c', ext('BUS_Q3.pdf', 'Công ty TNHH Bus Thaco', '2026-09-30', { 'BS:280': 7 })),
  ];
  const groups = groupCompanies(sources);
  assert.deepEqual(groups.map((g) => g.ids), [['a', 'b'], ['c']]);

  const r = buildDataset(sources);
  assert.equal(r.companies.length, 2);
  assert.deepEqual(r.skipped, ['c'], 'mặc định dùng công ty có nhiều file hơn');
  assert.deepEqual(r.ds.periods.map((p) => p.id), ['FY2024', 'FY2025']);
  assert.equal(r.ds.company, 'Công ty Cổ phần Sữa Việt Nam');

  const r2 = buildDataset(sources, [], { company: groups[1].key });
  assert.deepEqual(r2.skipped, ['a', 'b'], 'người dùng chọn công ty kia');
  assert.equal(r2.ds.values.FY2026?.['BS:280'], 7);

  const r3 = buildDataset(sources, [], { company: '*' });
  assert.deepEqual(r3.skipped, [], '"cùng một công ty" → gộp hết');
  assert.equal(r3.ds.periods.length, 3);
});

test('một công ty, hoặc nguồn không có tên công ty → không bỏ nguồn nào', () => {
  const sources = [
    src('a', ext('x.pdf', 'Công ty CP ABC', '2025-12-31', { 'BS:280': 1 })),
    src('b', ext('y.xlsx', '', '2024-12-31', { 'BS:280': 2 })),
  ];
  assert.equal(groupCompanies(sources).length, 1);
  assert.deepEqual(buildDataset(sources).skipped, []);
  assert.deepEqual(pickCompany([]).skip, new Set());
});

test('hai công ty, mỗi bên một file → dùng công ty của file tải lên trước', () => {
  const sources = [
    src('a', ext('VNM.pdf', 'Công ty Cổ phần Sữa Việt Nam', '2025-12-31', { 'BS:280': 100 })),
    src('b', ext('BUS.pdf', 'Công ty TNHH Bus Thaco', '2026-09-30', { 'BS:280': 7 })),
  ];
  assert.deepEqual(buildDataset(sources).skipped, ['b']);
});
