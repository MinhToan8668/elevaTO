// Lớp tính số cho tab "Biểu đồ & chỉ số": tám biểu đồ, 22 chỉ số, ba cách xem kỳ và bộ chọn khoảng.
// Mọi con số dưới đây tính tay từ bộ số mẫu — hỏng là hỏng thật, không phải đổi khoá.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMetrics, availableModes, RATIO_ROWS, RATIO_GROUPS, MODES, SPANS } from '../js/core/metrics.js';
import { VI } from '../js/i18n.vi.js';

const P = (id, year, months = 12, endMonth = months) => ({ id, year, months, endMonth });
const nam = (y, o) => ({
  'BS:100': o.tsNH, 'BS:110': o.tien, 'BS:120': o.dtNH, 'BS:130': o.phaiThu, 'BS:131': o.phaiThuKH,
  'BS:140': o.tonKho, 'BS:200': o.tsDH, 'BS:220': o.tscd, 'BS:280': o.tongTS,
  'BS:300': o.no, 'BS:310': o.noNH, 'BS:311': o.phaiTra, 'BS:321': o.vayNH, 'BS:330': o.noDH, 'BS:339': o.vayDH,
  'BS:400': o.vonChu, 'BS:440': o.tongTS,
  'IS:10': o.dt, 'IS:11': o.giaVon, 'IS:20': o.gop, 'IS:24': o.laiVay, 'IS:25': o.cpBan, 'IS:26': o.cpQL,
  'IS:50': o.lntt, 'IS:60': o.lnst,
  'CF:02': o.khauHao, 'CF:09': o.vld1, 'CF:10': o.vld2, 'CF:11': o.vld3,
  'CF:20': o.cfo, 'CF:21': o.capex, 'CF:30': o.cfi, 'CF:40': o.cff, 'CF:50': o.cfNet,
});
const Y24 = nam(2024, { tsNH: 600, tien: 100, dtNH: 20, phaiThu: 200, phaiThuKH: 180, tonKho: 150, tsDH: 400, tscd: 300,
  tongTS: 1000, no: 600, noNH: 400, phaiTra: 120, vayNH: 150, noDH: 200, vayDH: 100, vonChu: 400,
  dt: 2000, giaVon: 1500, gop: 500, laiVay: 40, cpBan: 100, cpQL: 150, lntt: 120, lnst: 100,
  khauHao: 60, vld1: -10, vld2: 5, vld3: -5, cfo: 90, capex: -70, cfi: -50, cff: -20, cfNet: 20 });
const Y25 = nam(2025, { tsNH: 800, tien: 150, dtNH: 30, phaiThu: 260, phaiThuKH: 230, tonKho: 190, tsDH: 400, tscd: 320,
  tongTS: 1200, no: 700, noNH: 500, phaiTra: 160, vayNH: 200, noDH: 200, vayDH: 120, vonChu: 500,
  dt: 2500, giaVon: 1900, gop: 600, laiVay: 60, cpBan: 120, cpQL: 180, lntt: 160, lnst: 130,
  khauHao: 80, vld1: -20, vld2: 10, vld3: -10, cfo: 140, capex: -90, cfi: -60, cff: -30, cfNet: 50 });
const ds = { periods: [P('FY2024', 2024), P('FY2025', 2025)], values: { FY2024: Y24, FY2025: Y25 } };

const gan = (a, b, msg) => assert.equal(Number(a).toFixed(3), Number(b).toFixed(3), msg);
const bd = (m, id) => m.charts.find((c) => c.id === id);
const duong = (m, id, i) => m.ratios.find((r) => r.key === id).values[i];

test('tám biểu đồ, đúng kiểu vẽ và đúng khoá đường số', () => {
  const m = buildMetrics(ds);
  assert.deepEqual(m.charts.map((c) => c.id), ['growth', 'margins', 'returns', 'assets', 'funding', 'ccc', 'liquidity', 'fcf']);
  assert.deepEqual(m.periods.map((p) => p.label), ['Năm 2024', 'Năm 2025']);
  assert.deepEqual(m.charts.map((c) => c.kind), ['combo', 'lines', 'lines', 'share', 'share', 'combo', 'lines', 'combo']);
  // metrics.js chỉ phát ra khoá; tên hiển thị do i18n lo (xem tests/i18n.test.js).
  for (const c of m.charts) {
    assert.ok(VI[`chart.${c.id}`], `thiếu tên biểu đồ ${c.id}`);
    for (const s of c.series) assert.ok(VI[`ser.${s.key}`], `thiếu tên đường ${s.key}`);
  }
});

test('biểu đồ tăng trưởng: cột số tiền + đường tốc độ tăng cùng kỳ năm trước trên trục phải', () => {
  const g = bd(buildMetrics(ds), 'growth');
  assert.equal(g.right, '%');
  assert.deepEqual(g.series.map((s) => [s.key, s.kind, s.values]), [
    ['netRevenue', 'bar', [2000, 2500]],
    ['grossProfit', 'bar', [500, 600]],
    ['profitAfterTax', 'bar', [100, 130]],
    ['revenueYoY', 'line', [null, 25]],                      // (2500 − 2000) / 2000
    ['profitYoY', 'line', [null, 30]],                       // (130 − 100) / 100
  ]);
  assert.deepEqual(g.series.filter((s) => s.kind === 'line').map((s) => s.axis), ['right', 'right']);
});

test('biên lợi nhuận: gộp / EBIT / EBITDA / ròng — EBIT cộng lại lãi vay, EBITDA cộng thêm khấu hao', () => {
  const mg = bd(buildMetrics(ds), 'margins');
  assert.equal(mg.unit, '%');
  const v = (key) => mg.series.find((s) => s.key === key).values[1];
  gan(v('grossMargin'), 24);                                 // 600 / 2500
  gan(v('ebitMargin'), ((160 + 60) / 2500) * 100);           // LNTT + lãi vay
  gan(v('ebitdaMargin'), ((160 + 60 + 80) / 2500) * 100);    // + khấu hao trên LCTT
  gan(v('netMargin'), (130 / 2500) * 100);
});

test('cơ cấu tài sản / nguồn vốn: cột chồng theo tỷ trọng, phần "khác" là số dư còn lại', () => {
  const m = buildMetrics(ds);
  const a = bd(m, 'assets');
  assert.deepEqual(a.series.map((s) => s.key), ['cash', 'receivables', 'inventories', 'fixedAssets', 'otherAssets']);
  assert.deepEqual(a.series.at(-1).values, [1000 - 100 - 200 - 150 - 300, 1200 - 150 - 260 - 190 - 320]);
  const f = bd(m, 'funding');
  assert.deepEqual(f.series.map((s) => [s.key, s.values]), [['currentLiab', [400, 500]], ['nonCurrentLiab', [200, 200]], ['equity', [400, 500]]]);
});

test('vòng quay tiền mặt: số ngày tồn kho / phải thu / phải trả trên số dư bình quân, chu kỳ là đường', () => {
  const c = bd(buildMetrics(ds), 'ccc');
  assert.equal(c.unit, 'd');
  const v = (key) => c.series.find((s) => s.key === key).values[1];
  const dsi = (((150 + 190) / 2) / 1900) * 365, dso = (((180 + 230) / 2) / 2500) * 365, dpo = (((120 + 160) / 2) / 1900) * 365;
  gan(v('dsi'), dsi); gan(v('dso'), dso); gan(v('dpo'), dpo);
  gan(v('ccc'), dsi + dso - dpo);
  assert.equal(c.series.at(-1).kind, 'line');
});

test('dòng tiền thuần cho doanh nghiệp: NOPAT + khấu hao − đầu tư ± thay đổi vốn lưu động', () => {
  const f = bd(buildMetrics(ds), 'fcf');
  const v = (key) => f.series.find((s) => s.key === key).values[1];
  const nopat = (160 + 60) * (1 - (1 - 130 / 160));          // thuế hiệu dụng suy từ LNTT → LNST
  gan(v('nopat'), nopat);
  gan(v('depreciation'), 80);
  gan(v('capex'), -90);                                      // luôn là số âm, dù LCTT in dấu nào
  gan(v('deltaWC'), -20 + 10 - 10);
  gan(v('fcff'), nopat + 80 - 90 + (-20 + 10 - 10));
});

test('bảng chỉ số: đủ 22 dòng, nhóm nào cũng có dòng, mọi giá trị khớp số tính tay', () => {
  const m = buildMetrics(ds);
  assert.deepEqual(RATIO_ROWS.map((r) => r.key), m.ratios.map((r) => r.key));
  assert.equal(RATIO_ROWS.length, 22);
  for (const gr of RATIO_GROUPS) assert.ok(RATIO_ROWS.some((r) => r.group === gr), `nhóm ${gr} không có dòng nào`);
  assert.deepEqual([...new Set(RATIO_ROWS.map((r) => r.group))].sort(), [...RATIO_GROUPS].sort());
  for (const r of RATIO_ROWS) assert.ok(['x', '%', 'd'].includes(r.fmt) && ['hi', 'lo'].includes(r.good), r.key);

  gan(duong(m, 'current', 1), 800 / 500);
  gan(duong(m, 'quick', 1), (800 - 190) / 500);
  gan(duong(m, 'cashRatio', 1), (150 + 30) / 500);
  gan(duong(m, 'defensiveDays', 1), (150 + 30 + 260) / ((1900 + 120 + 180) / 365));
  gan(duong(m, 'wcAsset', 1), ((800 - 500) / 800) * 100);
  gan(duong(m, 'gross', 1), 24);
  gan(duong(m, 'ros', 1), (130 / 2500) * 100);
  gan(duong(m, 'roa', 1), (130 / ((1000 + 1200) / 2)) * 100);
  gan(duong(m, 'roe', 1), (130 / ((400 + 500) / 2)) * 100);
  gan(duong(m, 'de', 1), 700 / 500);
  gan(duong(m, 'debtAsset', 1), (700 / 1200) * 100);
  gan(duong(m, 'loanEquity', 1), (200 + 120) / 500);
  gan(duong(m, 'intCover', 1), (160 + 60) / 60);
  gan(duong(m, 'debtEbitda', 1), (200 + 120) / (160 + 60 + 80));
  gan(duong(m, 'assetTurn', 1), 2500 / ((1000 + 1200) / 2));
  gan(duong(m, 'cfoRevenue', 1), (140 / 2500) * 100);
  assert.equal(duong(m, 'roe', 0), null, 'kỳ đầu chưa có số đầu kỳ nên không có số bình quân');

  const thieu = buildMetrics({ periods: [P('FY2025', 2025)], values: { FY2025: { 'IS:10': 100 } } });
  assert.equal(duong(thieu, 'current', 0), null);
  assert.equal(bd(thieu, 'assets'), undefined, 'không có số thì không vẽ biểu đồ');
});

test('kỳ giữa niên độ: ROA / ROE / vòng quay / nợ trên EBITDA quy về một năm; biên lợi nhuận thì không', () => {
  const y = P('FY2025', 2025);
  const q = P('6T-2026', 2026, 6, 6);
  const m = buildMetrics({ periods: [y, q], values: {
    FY2025: { 'BS:400': 1000, 'BS:280': 2000, 'IS:60': 200, 'IS:10': 3000 },
    '6T-2026': { 'BS:400': 1100, 'BS:280': 2200, 'IS:60': 120, 'IS:10': 1600, 'IS:50': 150, 'IS:24': 10, 'BS:321': 400, 'CF:02': 40 },
  } });
  gan(duong(m, 'roe', 1), ((120 * 2) / ((1000 + 1100) / 2)) * 100, 'LNST 6 tháng × 2');
  gan(duong(m, 'roa', 1), ((120 * 2) / ((2000 + 2200) / 2)) * 100);
  gan(duong(m, 'assetTurn', 1), (1600 * 2) / ((2000 + 2200) / 2));
  gan(duong(m, 'debtEbitda', 1), 400 / ((150 + 10 + 40) * 2));
  assert.match(VI['ratio.roe.hint'], /quy về một năm|năm hoá/i, 'cách tính ghi dưới tên chỉ số phải nói rõ việc quy về một năm');
  gan(duong(m, 'ros', 1), (120 / 1600) * 100, 'tỷ lệ giữa hai dòng cùng kỳ → không quy đổi');
});

test('LCTT lập theo phương pháp trực tiếp (mã CF:T20…) vẫn tính được dòng tiền', () => {
  const m = buildMetrics({ periods: [P('FY2025', 2025)],
    values: { FY2025: { 'CF:T20': 70, 'CF:T21': -30, 'CF:T30': -20, 'CF:T40': 10, 'IS:10': 700, 'IS:50': 60 } } });
  gan(duong(m, 'cfoRevenue', 0), 10);
  gan(bd(m, 'fcf').series.find((s) => s.key === 'capex').values[0], -30);
});

test('số dư bình quân: kỳ lũy kế lấy số đầu năm, riêng quý lấy cuối quý trước, thiếu kỳ thì để trống', () => {
  const v = { 'BS:400': 1000, 'BS:280': 2000, 'IS:60': 200, 'IS:10': 3000 };
  const m = buildMetrics({ periods: [P('FY2025', 2025), P('6T-2026', 2026, 6, 6), P('9T-2026', 2026, 9, 9)],
    values: { FY2025: v, '6T-2026': { ...v, 'BS:400': 1100, 'IS:60': 120 }, '9T-2026': { ...v, 'BS:400': 1200, 'IS:60': 180 } } });
  gan(duong(m, 'roe', 2), ((180 * (12 / 9)) / ((1000 + 1200) / 2)) * 100, 'lũy kế 9T ghép với 31/12/2025');
  // Riêng quý 3 (ba tháng kết thúc 30/9) thì số đầu kỳ là 30/6 cùng năm, không phải cuối năm trước.
  const rq = buildMetrics({ periods: [P('6T-2026', 2026, 6, 6), P('Q3-2026', 2026, 3, 9)],
    values: { '6T-2026': { ...v, 'BS:400': 1100 }, 'Q3-2026': { ...v, 'BS:400': 1300, 'IS:60': 60 } } });
  gan(duong(rq, 'roe', 1), ((60 * 4) / ((1100 + 1300) / 2)) * 100);
  // Thiếu năm ở giữa: không bịa số bình quân
  const ho = buildMetrics({ periods: [P('FY2022', 2022), P('FY2024', 2024)], values: { FY2022: v, FY2024: v } });
  assert.equal(duong(ho, 'roe', 1), null);
});

test('vốn chủ sở hữu âm → không tính ROE / nợ trên vốn chủ; cột chồng báo rõ khoản nào âm', () => {
  const m = buildMetrics({ periods: [P('FY2025', 2025)],
    values: { FY2025: { 'BS:400': -50, 'BS:300': 300, 'BS:310': 300, 'BS:280': 250, 'IS:60': -80, 'IS:10': 500 } } });
  assert.equal(duong(m, 'roe', 0), null);
  assert.equal(duong(m, 'de', 0), null);
  assert.equal(duong(m, 'loanEquity', 0), null);
  assert.deepEqual(bd(m, 'funding').negative, ['equity'], 'cột chồng chỉ vẽ phần dương → phải nói rõ khoản nào âm');
});

test('ba cách xem kỳ: theo kỳ đã trích, chỉ kỳ năm, riêng từng quý (trừ hai kỳ lũy kế)', () => {
  const v = (dt, lnst, von) => ({ 'IS:10': dt, 'IS:60': lnst, 'BS:400': von, 'BS:280': von * 2 });
  const d = { periods: [P('FY2024', 2024), P('Q1-2025', 2025, 3, 3), P('6T-2025', 2025, 6, 6)],
    values: { FY2024: v(4000, 200, 1000), 'Q1-2025': v(900, 50, 1050), '6T-2025': v(2000, 130, 1100) } };
  assert.deepEqual(MODES, ['period', 'year', 'quarter']);
  assert.deepEqual(availableModes(d), ['period', 'year', 'quarter']);
  assert.deepEqual(buildMetrics(d, { mode: 'period' }).periods.map((p) => p.id), ['FY2024', 'Q1-2025', '6T-2025']);
  assert.deepEqual(buildMetrics(d, { mode: 'year' }).periods.map((p) => p.id), ['FY2024']);
  const q = buildMetrics(d, { mode: 'quarter' });
  assert.deepEqual(q.periods.map((p) => p.id), ['Q1-2025', 'Q2-2025']);
  // Quý 2 = lũy kế 6 tháng − lũy kế 3 tháng; và phải đánh dấu là số do máy suy ra.
  assert.deepEqual(bd(q, 'growth').series[0].values, [900, 1100]);
  assert.deepEqual(q.periods.map((p) => p.derived), [false, true]);
  // Chỉ có kỳ năm thì không có nút "theo quý".
  assert.deepEqual(availableModes({ periods: [P('FY2024', 2024)], values: { FY2024: v(1, 1, 1) } }), ['period', 'year']);
  // Xin cách xem không có số thì tự rơi về cách đầu tiên còn dùng được.
  assert.equal(buildMetrics({ periods: [P('FY2024', 2024)], values: { FY2024: v(1, 1, 1) } }, { mode: 'quarter' }).mode, 'period');
});

test('bộ chọn khoảng: 3 / 5 năm gần nhất hoặc tất cả; trần cứng 20 kỳ cho file phiên bị sửa tay', () => {
  assert.deepEqual(SPANS, [3, 5, 0]);
  const periods = Array.from({ length: 30 }, (_, i) => P(`FY${2000 + i}`, 2000 + i));
  const values = Object.fromEntries(periods.map((p, i) => [p.id, { 'IS:10': 100 + i, 'BS:280': 1000 }]));
  assert.deepEqual(buildMetrics({ periods, values }, { span: 3 }).periods.map((p) => p.year), [2027, 2028, 2029]);
  assert.equal(buildMetrics({ periods, values }, { span: 5 }).periods.length, 5);
  const het = buildMetrics({ periods, values }, { span: 0 });
  assert.equal(het.periods.length, 20);
  assert.equal(het.periods.at(-1).label, 'Năm 2029');
  assert.equal(het.charts[0].series[0].values.length, 20);
  assert.equal(het.ratios[0].values.length, 20);
});

test('nhãn kỳ: lũy kế ghi theo số tháng, riêng quý ghi số quý; không có kỳ nào thì không có biểu đồ', () => {
  const d = { periods: [P('6T-2026', 2026, 6, 6), P('Q3-2026', 2026, 3, 9)],
    values: { '6T-2026': { 'IS:10': 50, 'IS:20': 10, 'IS:60': 5 }, 'Q3-2026': { 'IS:10': 30, 'IS:20': 6, 'IS:60': 3 } } };
  assert.deepEqual(buildMetrics(d).periods.map((p) => p.label), ['6T/2026', 'Quý 3/2026']);
  assert.ok(bd(buildMetrics(d), 'growth'));
  assert.deepEqual(buildMetrics({ periods: [], values: {} }).charts, []);
});
