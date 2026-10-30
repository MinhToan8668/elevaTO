// Các lỗi bắt được khi chạy thật Gemini trên BCTC mẫu (tools/run-fixtures.mjs, tests/fixtures/bctc/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementToValues } from '../js/core/extract.js';
import { unitScale } from '../js/core/numbers.js';
import { validate } from '../js/core/statements.js';
import { addExtraction, emptyDataset, notesNamTruoc } from '../js/core/dataset.js';
import { periodsFromMeta } from '../js/core/extract.js';

const meta = { don_vi: 'ĐVT: VNĐ', ngay_ket_thuc: '2025-12-31', so_thang: 12 };

test('đơn vị "VNĐ" (chữ Đ) đọc ra đồng, không báo thiếu đơn vị', () => {
  assert.equal(unitScale('ĐVT: VNĐ'), 1);
  assert.equal(unitScale('Đơn vị tính: đ'), 1);
  assert.equal(unitScale('Triệu VND'), 1e6);
});

test('HAX 2025: mã in không có trong mẫu TT200 (AI đọc "149" thành "142") vẫn vào đúng dòng theo tên', () => {
  const r = statementToValues('BS', { meta, items: [
    { c: '140', n: 'IV. Hàng tồn kho', v: '1.457.135.245.689', p: '' },
    { c: '141', n: '1. Hàng tồn kho', v: '1.462.587.657.271', p: '' },
    { c: '142', n: '2. Dự phòng giảm giá hàng tồn kho (*)', v: '(5.452.411.582)', p: '' },
  ] });
  assert.equal(r.cur['BS:142'], -5452411582);
  assert.deepEqual(validate(r.cur).filter((x) => x.key === 'BS:140'), []);
  assert.ok(!r.warnings.some((w) => /đơn vị/i.test(w)), r.warnings.join('\n'));
});

test('HAX 2025: đề mục "2. Điều chỉnh cho các khoản" mang mã 02 không đè lên khấu hao', () => {
  const r = statementToValues('CF', { meta: { ...meta, phuong_phap: 'gian_tiep' }, items: [
    { c: '01', n: '1. Lợi nhuận trước thuế', v: '56.034.487.220', p: '' },
    { c: '02', n: '2. Điều chỉnh cho các khoản', v: '92.449.241.405', p: '' },
    { c: '03', n: '- Khấu hao tài sản cố định và BĐS đầu tư', v: '68.768.723.659', p: '' },
    { c: '05', n: '- Các khoản dự phòng', v: '-', p: '' },
    { c: '06', n: '- Lãi, lỗ từ hoạt động đầu tư', v: '(13.792.537.075)', p: '' },
    { c: '07', n: '- Chi phí lãi vay', v: '37.473.054.821', p: '' },
    { c: '08', n: '3. Lợi nhuận từ hoạt động kinh doanh trước thay đổi vốn lưu động', v: '148.483.728.625', p: '' },
  ] });
  assert.equal(r.cur['CF:02'], 68768723659);
  assert.equal(r.cur['CF:06'], 37473054821);
  assert.deepEqual(validate(r.cur).filter((x) => x.key === 'CF:08'), []);
});

test('thuyết minh thống kê theo từng năm: khối năm trước ghi vào kỳ năm trước, không đè thuyết minh thật', () => {
  const notes = {
    segments: [{ name: 'Ô tô', revenue: 100, gross: 10, prev: { name: 'Ô tô', revenue: 90, gross: 8 } }],
    equity: { dividends: 5, prev: { dividends: 4 } },
    fixedAssets: { tangible: [{ cls: 'buildings', name: 'Nhà cửa', cost: 50, accDep: -20, costOpen: 45, accDepOpen: -15 }], intangible: [] },
    debt: { stOpen: 30, stClose: 40, ltOpen: 7, ltClose: 6 },
  };
  const per = periodsFromMeta({ ngay_ket_thuc: '2025-12-31', so_thang: 12 });
  const [[p, tm]] = notesNamTruoc(notes, per);
  assert.equal(p.id, 'FY2024');
  assert.equal(tm.segments[0].revenue, 90);
  assert.equal(tm.equity.dividends, 4);
  assert.equal(tm.fixedAssets.tangible[0].cost, 45);
  assert.deepEqual(tm.debt, { stClose: 30, ltClose: 7 });

  let ds = addExtraction(emptyDataset(), { file: 'a.pdf', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, statements: {}, notes, warnings: [] });
  assert.deepEqual(ds.periods.map((x) => x.id), ['FY2024', 'FY2025']);
  assert.deepEqual(ds.notes.FY2024._muon.sort(), ['debt', 'equity', 'fixedAssets', 'segments']);
  // Nạp thêm BCTC 2024 có thuyết minh thật → thay phần suy ra.
  ds = addExtraction(ds, { file: 'b.pdf', meta: { ngay_ket_thuc: '2024-12-31', so_thang: 12 }, statements: {},
    notes: { segments: [{ name: 'Ô tô', revenue: 91 }] }, warnings: [] });
  assert.equal(ds.notes.FY2024.segments[0].revenue, 91);
  assert.ok(!ds.notes.FY2024._muon.includes('segments'));
  // Nạp lại 2025 không đè thuyết minh thật của 2024.
  ds = addExtraction(ds, { file: 'a.pdf', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, statements: {}, notes, warnings: [] });
  assert.equal(ds.notes.FY2024.segments[0].revenue, 91);
});

test('HAX 2024: chi phí in dương, riêng thuế hoãn lại in trong ngoặc (khoản được hoàn) → giữ âm, LNST khớp', () => {
  const r = statementToValues('IS', { meta, items: [
    { c: '10', n: 'Doanh thu thuần', v: '', p: '5.513.287.344.174' },
    { c: '11', n: 'Giá vốn hàng bán', v: '', p: '5.001.364.238.035' },
    { c: '20', n: 'Lợi nhuận gộp', v: '', p: '511.923.106.139' },
    { c: '50', n: 'Tổng lợi nhuận kế toán trước thuế', v: '', p: '258.356.507.150' },
    { c: '51', n: 'Chi phí thuế TNDN hiện hành', v: '', p: '56.813.711.223' },
    { c: '52', n: 'Chi phí thuế TNDN hoãn lại', v: '', p: '(2.026.879.993)' },
    { c: '60', n: 'Lợi nhuận sau thuế TNDN', v: '', p: '203.569.675.920' },
  ] });
  assert.equal(r.prev['IS:52'], -2026879993);
  assert.deepEqual(validate(r.prev).filter((x) => x.key === 'IS:60'), []);
});
