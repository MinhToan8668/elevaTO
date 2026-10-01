import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetrics, RATIO_ROWS } from '../js/core/metrics.js';
import { VI } from '../js/i18n.vi.js';

const P = (id, year, months = 12) => ({ id, year, months, endMonth: months });
const ds = {
  periods: [P('FY2024', 2024), P('FY2025', 2025)],
  values: {
    FY2024: {
      'BS:100': 600, 'BS:110': 100, 'BS:130': 200, 'BS:140': 150, 'BS:200': 400, 'BS:220': 300, 'BS:280': 1000,
      'BS:300': 600, 'BS:310': 400, 'BS:330': 200, 'BS:400': 400, 'BS:440': 1000,
      'IS:10': 2000, 'IS:11': -1500, 'IS:20': 500, 'IS:23': -40, 'IS:50': 120, 'IS:60': 100,
      'CF:20': 90, 'CF:30': -50, 'CF:40': -20, 'CF:50': 20,
    },
    FY2025: {
      'BS:100': 800, 'BS:110': 150, 'BS:130': 260, 'BS:140': 190, 'BS:200': 400, 'BS:220': 320, 'BS:280': 1200,
      'BS:300': 700, 'BS:310': 500, 'BS:330': 200, 'BS:400': 500, 'BS:440': 1200,
      'IS:10': 2500, 'IS:11': -1900, 'IS:20': 600, 'IS:23': -60, 'IS:50': 160, 'IS:60': 130,
      'CF:20': 140, 'CF:30': -60, 'CF:40': -30, 'CF:50': 50,
    },
  },
};

test('biểu đồ: doanh thu & lợi nhuận, cơ cấu tài sản / nguồn vốn, dòng tiền — chỉ lấy kỳ có số', () => {
  const m = buildMetrics(ds);
  assert.deepEqual(m.periods.map((p) => p.label), ['Năm 2024', 'Năm 2025']);
  const rev = m.charts.find((c) => c.id === 'revenue');
  assert.equal(rev.kind, 'bars');
  // metrics.js chỉ phát ra khoá; tên hiển thị do i18n lo (xem tests/i18n.test.js).
  assert.deepEqual(rev.series.map((s) => [s.key, s.values]), [
    ['netRevenue', [2000, 2500]],
    ['grossProfit', [500, 600]],
    ['profitAfterTax', [100, 130]],
  ]);
  const asset = m.charts.find((c) => c.id === 'assets');
  assert.equal(asset.kind, 'stack');
  assert.deepEqual(asset.series.map((s) => s.key), ['cash', 'receivables', 'inventories', 'fixedAssets', 'otherAssets']);
  assert.deepEqual(asset.series.at(-1).values, [1000 - 100 - 200 - 150 - 300, 1200 - 150 - 260 - 190 - 320]);
  const cap = m.charts.find((c) => c.id === 'capital');
  assert.deepEqual(cap.series.map((s) => [s.key, s.values]), [['currentLiab', [400, 500]], ['nonCurrentLiab', [200, 200]], ['equity', [400, 500]]]);
  const cf = m.charts.find((c) => c.id === 'cashflow');
  assert.deepEqual(cf.series.map((s) => s.values), [[90, 140], [-50, -60], [-20, -30]]);
  const mg = m.charts.find((c) => c.id === 'margins');
  assert.equal(mg.kind, 'lines');
  assert.equal(mg.unit, '%');
  assert.deepEqual(mg.series[0].values, [25, 24]);            // biên gộp 500/2000, 600/2500
});

test('bảng chỉ số: thanh toán, đòn bẩy, sinh lời; dùng số bình quân khi có kỳ trước; kỳ thiếu số thì để trống', () => {
  const m = buildMetrics(ds);
  const val = (key, i) => m.ratios.find((r) => r.key === key).values[i];
  assert.equal(val('current', 1), 800 / 500);
  assert.equal(val('quick', 1), (800 - 190) / 500);
  assert.equal(val('de', 1), 700 / 500);
  assert.equal(val('gross', 1), 24);
  assert.equal(val('ros', 1), (130 / 2500) * 100);
  assert.equal(val('roe', 0), null, 'kỳ đầu chưa có số bình quân');
  assert.equal(val('roe', 1).toFixed(3), ((130 / ((400 + 500) / 2)) * 100).toFixed(3));
  assert.equal(val('roa', 1).toFixed(3), ((130 / ((1000 + 1200) / 2)) * 100).toFixed(3));
  assert.deepEqual(RATIO_ROWS.map((r) => r.key).sort(), m.ratios.map((r) => r.key).sort());
  const thieu = buildMetrics({ periods: [P('FY2025', 2025)], values: { FY2025: { 'IS:10': 100 } } });
  assert.equal(thieu.ratios.find((r) => r.key === 'current').values[0], null);
  assert.equal(thieu.charts.find((c) => c.id === 'assets'), undefined, 'không có số thì không vẽ biểu đồ');
});

test('kỳ giữa niên độ: ROA / ROE / vòng quay quy về một năm để so được với kỳ năm', () => {
  const y = { id: 'FY2025', year: 2025, months: 12, endMonth: 12 };
  const q = { id: 'Q2-2026', year: 2026, months: 6, endMonth: 6 };
  const m = buildMetrics({ periods: [y, q], values: {
    FY2025: { 'BS:400': 1000, 'BS:280': 2000, 'IS:60': 200, 'IS:10': 3000 },
    'Q2-2026': { 'BS:400': 1100, 'BS:280': 2200, 'IS:60': 120, 'IS:10': 1600 },
  } });
  const val = (key, i) => m.ratios.find((r) => r.key === key).values[i];
  assert.equal(val('roe', 1).toFixed(2), ((120 * 2) / ((1000 + 1100) / 2) * 100).toFixed(2), 'LNST 6 tháng × 2');
  assert.equal(val('roa', 1).toFixed(2), ((120 * 2) / ((2000 + 2200) / 2) * 100).toFixed(2));
  assert.equal(val('assetTurn', 1).toFixed(3), ((1600 * 2) / ((2000 + 2200) / 2)).toFixed(3));
  assert.match(VI['ratio.roe.hint'], /quy về một năm|năm hoá/i, 'cách tính ghi dưới tên chỉ số phải nói rõ việc quy về một năm');
  // biên lợi nhuận là tỷ lệ giữa hai dòng cùng kỳ → không quy đổi
  assert.equal(val('ros', 1), (120 / 1600) * 100);
});

test('LCTT lập theo phương pháp trực tiếp (mã CF:T20…) vẫn vẽ được biểu đồ dòng tiền', () => {
  const m = buildMetrics({ periods: [P('FY2025', 2025)], values: { FY2025: { 'CF:T20': 70, 'CF:T30': -20, 'CF:T40': 10, 'IS:10': 700 } } });
  const cf = m.charts.find((c) => c.id === 'cashflow');
  assert.deepEqual(cf.series.map((x) => x.values), [[70], [-20], [10]]);
  assert.equal(m.ratios.find((r) => r.key === 'cfoRevenue').values[0], 10);
});

test('số dư bình quân: kỳ giữa niên độ lấy số đầu năm (cột FY năm trước), kỳ năm chỉ ghép với đúng năm liền trước', () => {
  const vals = { 'BS:400': 1000, 'BS:280': 2000, 'IS:60': 200, 'IS:10': 3000 };
  // Q3 sau Q2: số đầu kỳ phải là 31/12 năm trước, không phải Q2
  const q = buildMetrics({ periods: [P('FY2025', 2025), { id: 'Q2-2026', year: 2026, months: 6, endMonth: 6 }, { id: 'Q3-2026', year: 2026, months: 9, endMonth: 9 }],
    values: { FY2025: vals, 'Q2-2026': { ...vals, 'BS:400': 1100, 'IS:60': 120 }, 'Q3-2026': { ...vals, 'BS:400': 1200, 'IS:60': 180 } } });
  const roe = q.ratios.find((r) => r.key === 'roe').values;
  assert.equal(roe[2].toFixed(2), ((180 * (12 / 9)) / ((1000 + 1200) / 2) * 100).toFixed(2), 'Q3 ghép với FY2025');
  // Thiếu năm ở giữa: không bịa số bình quân
  const gap = buildMetrics({ periods: [P('FY2022', 2022), P('FY2024', 2024)], values: { FY2022: vals, FY2024: vals } });
  assert.equal(gap.ratios.find((r) => r.key === 'roe').values[1], null);
});

test('vốn chủ sở hữu âm → không tính ROE / nợ trên vốn chủ; biểu đồ cột chồng báo có phần âm', () => {
  const m = buildMetrics({ periods: [P('FY2025', 2025)], values: { FY2025: { 'BS:400': -50, 'BS:300': 300, 'BS:310': 300, 'BS:280': 250, 'IS:60': -80, 'IS:10': 500 } } });
  assert.equal(m.ratios.find((r) => r.key === 'roe').values[0], null);
  assert.equal(m.ratios.find((r) => r.key === 'de').values[0], null);
  const cap = m.charts.find((c) => c.id === 'capital');
  assert.deepEqual(cap.negative, ['equity'], 'cột chồng chỉ vẽ phần dương → báo rõ khoản nào âm');
});

test('nhiều kỳ bất thường (file phiên bị sửa) → chỉ vẽ 12 kỳ gần nhất', () => {
  const periods = Array.from({ length: 30 }, (_, i) => ({ id: `FY${2000 + i}`, year: 2000 + i, months: 12, endMonth: 12 }));
  const values = Object.fromEntries(periods.map((p, i) => [p.id, { 'IS:10': 100 + i, 'BS:280': 1000 }]));
  const m = buildMetrics({ periods, values });
  assert.equal(m.periods.length, 12);
  assert.equal(m.periods.at(-1).label, 'Năm 2029');
  assert.equal(m.charts[0].series[0].values.length, 12);
  assert.equal(m.ratios[0].values.length, 12);
});

test('kỳ quý: nhãn theo số tháng; không có kỳ nào thì không có biểu đồ', () => {
  const q = buildMetrics({ periods: [{ id: 'Q2-2026', year: 2026, months: 6, endMonth: 6 }], values: { 'Q2-2026': { 'IS:10': 50, 'IS:20': 10, 'IS:60': 5 } } });
  assert.deepEqual(q.periods.map((p) => p.label), ['6T/2026']);
  assert.ok(q.charts.some((c) => c.id === 'revenue'));
  assert.deepEqual(buildMetrics({ periods: [], values: {} }).charts, []);
});
