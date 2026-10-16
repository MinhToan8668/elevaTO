// Kỳ giữa niên độ: suy số RIÊNG từng quý từ các cột lũy kế, và bắt lỗi khi một file bị đọc sai cột.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterDataset, interimIssues } from '../js/core/interim.js';

const P = (id, year, months, endMonth = months) => ({ id, year, months, endMonth });
const LUY_KE = [P('Q1-2025', 2025, 3), P('6T-2025', 2025, 6), P('9T-2025', 2025, 9), P('FY2025', 2025, 12)];
const ds = { periods: LUY_KE, values: {
  'Q1-2025': { 'IS:10': 100, 'IS:11': 70, 'BS:280': 1000, 'CF:60': 40, 'CF:70': 50, 'IS:70': 500 },
  '6T-2025': { 'IS:10': 250, 'IS:11': 180, 'BS:280': 1100, 'CF:60': 40, 'CF:70': 60, 'IS:70': 900 },
  '9T-2025': { 'IS:10': 400, 'IS:11': 290, 'BS:280': 1200, 'CF:60': 40, 'CF:70': 70 },
  FY2025: { 'IS:10': 600, 'IS:11': 440, 'BS:280': 1300, 'CF:60': 40, 'CF:70': 90 },
} };

test('riêng từng quý = trừ hai kỳ lũy kế liền nhau; quý 1 đã là số riêng nên dùng nguyên', () => {
  const q = quarterDataset(ds);
  assert.deepEqual(q.periods.map((p) => p.id), ['Q1-2025', 'Q2-2025', 'Q3-2025', 'Q4-2025']);
  assert.deepEqual(q.periods.map((p) => [p.months, p.endMonth]), [[3, 3], [3, 6], [3, 9], [3, 12]]);
  // Quý 1 lấy nguyên từ bộ gốc → không đánh dấu là số suy ra; ba quý sau thì có.
  assert.deepEqual([...q.derived].sort(), ['Q2-2025', 'Q3-2025', 'Q4-2025']);
  assert.deepEqual(q.periods.map((p) => q.values[p.id]['IS:10']), [100, 150, 150, 200]);
  assert.deepEqual(q.periods.map((p) => q.values[p.id]['IS:11']), [70, 110, 110, 150]);
});

test('số dư CĐKT là số tại thời điểm → lấy nguyên số cuối quý, không trừ', () => {
  const q = quarterDataset(ds);
  assert.deepEqual(q.periods.map((p) => q.values[p.id]['BS:280']), [1000, 1100, 1200, 1300]);
});

test('tiền đầu kỳ / cuối kỳ trên LCTT cũng là số tại thời điểm: đầu quý này = cuối quý trước', () => {
  const q = quarterDataset(ds);
  assert.deepEqual(q.periods.map((p) => q.values[p.id]['CF:70']), [50, 60, 70, 90]);
  assert.deepEqual(q.periods.map((p) => q.values[p.id]['CF:60']), [40, 50, 60, 70]);
});

test('lãi trên cổ phiếu là tỷ lệ → trừ ra vô nghĩa nên bỏ khỏi kỳ suy ra', () => {
  const q = quarterDataset(ds);
  assert.equal(q.values['Q1-2025']['IS:70'], 500, 'kỳ lấy nguyên thì vẫn còn');
  assert.equal(q.values['Q2-2025']['IS:70'], undefined);
});

test('hụt kỳ ở giữa thì không trừ bừa; thiếu số một đầu thì để trống chứ không coi là 0', () => {
  // Có 3T và 9T mà không có 6T → quý 2, quý 3 không suy được.
  const ho = quarterDataset({ periods: [P('Q1-2025', 2025, 3), P('9T-2025', 2025, 9)],
    values: { 'Q1-2025': { 'IS:10': 100 }, '9T-2025': { 'IS:10': 400 } } });
  assert.deepEqual(ho.periods.map((p) => p.id), ['Q1-2025']);
  // 6T có giá vốn, 3T không → quý 2 không có giá vốn, nhưng vẫn có doanh thu.
  const thieu = quarterDataset({ periods: [P('Q1-2025', 2025, 3), P('6T-2025', 2025, 6)],
    values: { 'Q1-2025': { 'IS:10': 100 }, '6T-2025': { 'IS:10': 250, 'IS:11': 180 } } });
  assert.equal(thieu.values['Q2-2025']['IS:10'], 150);
  assert.equal(thieu.values['Q2-2025']['IS:11'], undefined);
});

test('không có kỳ giữa niên độ nào thì không có gì để suy', () => {
  const chiNam = quarterDataset({ periods: [P('FY2024', 2024, 12), P('FY2025', 2025, 12)], values: { FY2024: { 'IS:10': 1 }, FY2025: { 'IS:10': 2 } } });
  assert.deepEqual(chiNam.periods, []);
  assert.deepEqual(quarterDataset({}).periods, []);
});

test('lũy kế không bao giờ giảm: 9 tháng nhỏ hơn 6 tháng là có file bị đọc cột quý lẻ', () => {
  // 9T doanh thu 120 < 6T doanh thu 250 ⇒ gần như chắc 9T bị lấy cột "quý này".
  const xau = { periods: [P('6T-2025', 2025, 6), P('9T-2025', 2025, 9)],
    values: { '6T-2025': { 'IS:10': 250e6, 'IS:60': 20e6 }, '9T-2025': { 'IS:10': 120e6, 'IS:60': 5e6 } } };
  const v = interimIssues(xau, { unit: 1e6 });
  // Lỗi gắn vào kỳ NGẮN hơn? Không — kỳ ngắn là kỳ phải được bao trùm, nên chỗ đáng nghi là 6T.
  assert.deepEqual(Object.keys(v), ['6T-2025']);
  const it = v['6T-2025'].find((x) => x.key === 'IS:10');
  assert.equal(it.kind, 'cumul');
  assert.equal(it.reported, 250e6);
  assert.equal(it.computed, 120e6);
  assert.equal(it.diff, 130e6);
  assert.equal(it.longer.id, '9T-2025');
  assert.match(it.label, /Doanh thu thuần/);
  assert.match(it.label, /9/, 'câu phải nói rõ đang so với kỳ lũy kế mấy tháng');
  // Lợi nhuận KHÔNG bị soát: một quý lỗ làm lũy kế tụt xuống là chuyện bình thường.
  assert.deepEqual(v['6T-2025'].filter((x) => x.key === 'IS:60'), []);
});

test('lũy kế tăng dần thì không báo gì; sai số làm tròn theo đơn vị in trên báo cáo được bỏ qua', () => {
  assert.deepEqual(interimIssues(ds, { unit: 1 }), {});
  const nhoHonChutIt = { periods: [P('6T-2025', 2025, 6), P('9T-2025', 2025, 9)],
    values: { '6T-2025': { 'IS:10': 250e6 }, '9T-2025': { 'IS:10': 250e6 - 1e6 } } };
  assert.deepEqual(interimIssues(nhoHonChutIt, { unit: 1e6 }), {}, 'lệch 1 triệu khi báo cáo in theo triệu → coi là làm tròn');
  assert.ok(Object.keys(interimIssues(nhoHonChutIt, { unit: 1 })).length, 'in theo đồng thì 1 triệu là lệch thật');
});
