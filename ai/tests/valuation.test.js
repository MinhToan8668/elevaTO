import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wacc, evAt, projectFcff, recommend, quickAnchors, blendedTarget, cleanVal, historyDrivers } from '../js/core/valuation.js';
import { mnaAnalysis, cleanMna } from '../js/core/mna.js';

const gan = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * tol, `${msg}: ${a} ≠ ${b}`);

// Số của model DGW_Model_new_version_elevaTO (sheet 15.DCF), đơn vị triệu đồng.
test('WACC theo CAPM, beta Blume, tỷ trọng theo giá thị trường — khớp model DGW (12,34%)', () => {
  const W = wacc({ rf: 0.0437, erp: 0.0813, beta: 1.3364, blume: true, extra: 0, kd: 0.07, tax: 0.1945,
    debt: 2899171.03, equityMkt: 44400 * 221.3202, equityBook: 3432384 });
  gan(W.betaAdj, 1.2243, 0.0005, 'beta Blume');
  gan(W.ke, 0.1432, 0.001, 'Ke');
  gan(W.kdSau, 0.0564, 0.002, 'Kd sau thuế');
  gan(W.wd, 0.2278, 0.002, 'tỷ trọng nợ');
  gan(W.wacc, 0.1234, 0.002, 'WACC');
  assert.equal(W.eBasis, 'market');
});

const FCFF = [336178.3494, 578792.5691, 817943.5746, 1088439.0607, 1347915.4249];   // 2026F–2030F
const flows = FCFF.map((fcff, i) => ({ t: i + 1, fcff }));
const W0 = 0.12336;                 // C29 của model (làm tròn 5 chữ số)

test('EV = PV FCFF + PV giá trị cuối kỳ (Gordon) và giá mục tiêu — khớp model DGW (EV 11.072.603 tr, 44.620 đ/cp)', () => {
  const r = evAt(flows, W0, 0.03);
  gan(r.pv, 2771108.9453, 0.002, 'PV FCFF');
  gan(r.tv, 14856746.566, 0.003, 'TV');
  gan(r.ev, 11072603.4239, 0.003, 'EV');
  const eq = r.ev + 1742001.99 - 2899171.03 - 39982.0157;
  gan(eq / 221.3202, 44620.6616, 0.004, 'giá mục tiêu');
  gan(r.pvTv / r.ev, 0.7497, 0.004, 'TV chiếm % EV');
  assert.equal(evAt(flows, 0.03, 0.03), null, 'WACC ≤ g → không tính');
});

test('bảng độ nhạy: góc WACC −1,5% / g −1,5% khớp model (47.233 đ/cp)', () => {
  const r = evAt(flows, W0 - 0.015, 0.015);
  gan((r.ev + 1742001.99 - 2899171.03 - 39982.0157) / 221.3202, 47233.1185, 0.005, 'ô góc');
});

test('dự phóng FCFF: tăng trưởng giảm dần về g, ΔNWC theo % doanh thu', () => {
  const f = projectFcff({ rev0: 1000, years: 5, growth: 0.15, fade: true, g: 0.03, margin: 0.1, da: 0.02, capex: 0.03, nwc: 0.2, tax: 0.2 });
  assert.equal(f.length, 5);
  gan(f[0].growth, 0.15, 1e-9, 'năm 1'); gan(f[4].growth, 0.03, 1e-9, 'năm cuối = g');
  gan(f[0].rev, 1150, 1e-9, 'doanh thu năm 1');
  gan(f[0].fcff, 1150 * 0.1 * 0.8 + 1150 * 0.02 - 1150 * 0.03 - (1150 - 1000) * 0.2, 1e-9, 'FCFF năm 1');
});

test('thang khuyến nghị như model: > 20% MUA … < −20% BÁN', () => {
  assert.deepEqual([0.25, 0.15, 0, -0.15, -0.3, null].map(recommend), ['buy', 'accumulate', 'hold', 'underperform', 'sell', null]);
});

test('định giá nhanh: EPV, P/B hợp lý, Graham — khớp 25.Quant_Checks', () => {
  const sh = 221.3202e6;
  const a = { base: { months: 12, v: {}, m: { equityParent: 15508.683 * sh } }, valuation: { shares: sh, earnings: 2476.0509 * sh, methods: [] } };
  const q = quickAnchors(a, { W: { ke: 0.1432 }, inputs: { g: 0.03, price: 44400 } });
  gan(q.epv, 17286.6135, 0.002, 'EPV');
  gan(q.justPb, (0.15965 - 0.03) / (0.1432 - 0.03), 0.01, 'P/B hợp lý');
  gan(q.graham, 29393.9872, 0.001, 'Graham');
});

test('giá mục tiêu gia quyền: bỏ phương pháp thiếu số, chia lại trọng số', () => {
  const a = { valuation: { shares: 100, methods: [{ key: 'pe', equity: [0, 2000, 0] }, { key: 'pb', equity: [0, 1000, 0] }] } };
  const r = blendedTarget(a, { equity: 3000, inputs: { weights: { dcf: 50, pe: 25, evEbitda: 15, pb: 10 }, price: 20 } });
  gan(r.equity, (3000 * 50 + 2000 * 25 + 1000 * 10) / 85, 1e-9, 'bình quân gia quyền');
  assert.equal(r.rows.find((x) => x.key === 'evEbitda').used, false);
  assert.equal(r.rec, 'buy', 'giá ~25,4 so với 20 → +27%');
});

test('thông số: ô bỏ trống quay về tự tính, số lạ bị bỏ', () => {
  const v = cleanVal({ growth: '', margin: 0.08, beta: -3, years: 40, weights: { dcf: 999 } });
  assert.equal(v.growth, null); assert.equal(v.margin, 0.08); assert.equal(v.beta, 1); assert.equal(v.years, 5); assert.equal(v.weights.dcf, 50);
});

test('tham số mặc định = trung bình 3 năm actual gần nhất, tăng trưởng = CAGR', () => {
  const y = (rev, ebitda, kh, debt, laiVay) => ({ m: { rev, adjEbitda: ebitda, kh, capexNet: rev * 0.01, tradeWc: rev * 0.2, debt, laiVay }, v: { 'IS:50': 100, 'IS:60': 80 } });
  const h = historyDrivers([y(500, 50, 5, 200, 5), y(1000, 100, 10, 200, 16), y(1100, 110, 11, 200, 16), y(1210, 121, 12.1, 200, 16)]);
  gan(h.growth, 0.1, 1e-9, 'CAGR 3 năm gần nhất');
  gan(h.margin, 0.09, 1e-9, 'biên EBIT'); gan(h.tax, 0.2, 1e-9, 'thuế'); gan(h.kd, 0.08, 1e-9, 'lãi vay / nợ bình quân');
  assert.equal(h.n, 3);
});

// Số của model DGW_Consolidated (sheet Consolidation_Model / Goodwill): mua 55% ADG giá 528.000 tr.
test('M&A: lợi thế thương mại theo phần sở hữu, phân bổ 10 năm, năm đầu hợp nhất 6 tháng — khớp model ADG', () => {
  const fv = 157397.8909 / 0.55;
  const r = mnaAnalysis({ npat: 1000000, shares: 167.224443, price: 55000, netDebt: 0, ebitda: 0, tax: 0.2 },
    { stake: 0.55, price: 528000, equity: fv, npat: 60000, months: 6, gwYears: 10, cash: 1, cashYield: 0 });
  gan(r.goodwill, 370602.1091, 1e-6, 'lợi thế thương mại');
  gan(r.gwAmort, 37060.2109, 1e-6, 'phân bổ một năm');
  gan(r.gwAmort * 6 / 12, 18530.1055, 1e-6, 'phân bổ năm đầu (6 tháng)');
  gan(r.nci, 0.45 * fv, 1e-9, 'NCI');
  assert.equal(r.control, true);
});

test('M&A: EPS tăng/pha loãng có tính chi phí vốn; giá hoà vốn cho EPS không đổi', () => {
  const acq = { npat: 1000, shares: 100, price: 100, netDebt: 500, ebitda: 400, tax: 0.2 };
  const deal = { stake: 1, price: 800, equity: 400, npat: 80, months: 12, gwYears: 10, cash: 0.5, debt: 0.25, shares: 0.25, kd: 0.1, cashYield: 0.05 };
  const r = mnaAnalysis(acq, deal);
  const fin = 200 * 0.1 * 0.8 + 400 * 0.05 * 0.8;
  gan(r.npatAfter, 1000 + 80 - 40 - fin, 1e-9, 'LNST sau thương vụ');
  gan(r.newShares, 2, 1e-9, 'cổ phiếu phát hành');
  gan(r.epsAfter, r.npatAfter / 102, 1e-9, 'EPS sau');
  const hv = mnaAnalysis(acq, { ...deal, price: r.breakeven });
  gan(hv.epsAfter, hv.epsBefore, 1e-9, 'tại giá hoà vốn EPS không đổi');
  assert.ok(mnaAnalysis(acq, { ...deal, price: 300 }).issues.includes('bargain'), 'giá < phần tài sản thuần → mua giá rẻ');
  assert.ok(mnaAnalysis(acq, { ...deal, stake: 0.3 }).issues.includes('associate'));
  assert.equal(cleanMna({ cash: 0.6, debt: 0.6 }).cash, 0.5, 'cơ cấu nguồn tiền tự quy về 100%');
});
