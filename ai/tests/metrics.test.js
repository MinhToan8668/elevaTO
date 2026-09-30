import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetrics, RATIO_ROWS } from '../js/core/metrics.js';

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
  assert.deepEqual(rev.series.map((s) => [s.name, s.values]), [
    ['Doanh thu thuần', [2000, 2500]],
    ['Lợi nhuận gộp', [500, 600]],
    ['Lợi nhuận sau thuế', [100, 130]],
  ]);
  const asset = m.charts.find((c) => c.id === 'assets');
  assert.equal(asset.kind, 'stack');
  assert.deepEqual(asset.series.map((s) => s.name), ['Tiền', 'Phải thu ngắn hạn', 'Hàng tồn kho', 'Tài sản cố định', 'Tài sản khác']);
  assert.deepEqual(asset.series.at(-1).values, [1000 - 100 - 200 - 150 - 300, 1200 - 150 - 260 - 190 - 320]);
  const cap = m.charts.find((c) => c.id === 'capital');
  assert.deepEqual(cap.series.map((s) => [s.name, s.values]), [['Nợ ngắn hạn', [400, 500]], ['Nợ dài hạn', [200, 200]], ['Vốn chủ sở hữu', [400, 500]]]);
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

test('kỳ quý: nhãn theo số tháng; không có kỳ nào thì không có biểu đồ', () => {
  const q = buildMetrics({ periods: [{ id: 'Q2-2026', year: 2026, months: 6, endMonth: 6 }], values: { 'Q2-2026': { 'IS:10': 50, 'IS:20': 10, 'IS:60': 5 } } });
  assert.deepEqual(q.periods.map((p) => p.label), ['6T/2026']);
  assert.ok(q.charts.some((c) => c.id === 'revenue'));
  assert.deepEqual(buildMetrics({ periods: [], values: {} }).charts, []);
});
