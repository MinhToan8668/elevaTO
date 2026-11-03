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

test('ghi đè tham số từng năm: chỉ năm được ghi đè đổi, các năm khác dùng số chung; đánh dấu ô ghi đè', () => {
  const chung = { rev0: 1000, years: 3, growth: 0.1, fade: false, g: 0.03, margin: 0.1, da: 0.02, capex: 0.03, nwc: 0.2, tax: 0.2 };
  const a = projectFcff(chung);
  const b = projectFcff({ ...chung, byYear: { growth: [null, 0.3, null], tax: [0.1] } });
  gan(b[0].rev, a[0].rev, 1e-12, 'năm 1 doanh thu không đổi');
  gan(b[1].growth, 0.3, 1e-12, 'năm 2 tăng trưởng ghi đè');
  gan(b[0].nopat, b[0].ebit * 0.9, 1e-12, 'năm 1 thuế ghi đè 10%');
  gan(b[2].growth, 0.1, 1e-12, 'năm 3 dùng số chung');
  assert.deepEqual([b[0].ghiDe.tax, b[1].ghiDe.growth, b[2].ghiDe.growth], [true, true, false]);
  assert.deepEqual(cleanVal({ byYear: { growth: [null, 5, 0.2], xau: [1] } }).byYear, { growth: [null, null, 0.2] }, 'số lạ / khoá lạ bị bỏ');
});

import { evAt as evAt2, scenarioValuation, dcfValuation } from '../js/core/valuation.js';
import { PRESETS, applyPreset } from '../js/core/presets.js';

const base = { rev0: 1000, years: 3, growth: 0.1, fade: false, g: 0.03, margin: 0.1, da: 0.02, capex: 0.03, nwc: 0.2, tax: 0.2 };
test('dự phóng doanh thu: sản lượng × giá, cửa hàng × doanh thu/cửa hàng, nhập tay từng năm', () => {
  const vp = projectFcff({ ...base, revMode: 'volprice', rev: { vol: 0.05, price: 0.02 }, byYear: { price: [null, 0.1] } });
  gan(vp[0].rev, 1000 * 1.05 * 1.02, 1e-12, 'năm 1 = (1+5%)(1+2%)');
  gan(vp[1].growth, 1.05 * 1.1 - 1, 1e-12, 'năm 2 giá ghi đè 10%');
  const ch = projectFcff({ ...base, revMode: 'stores', rev: { stores0: 100, storesAdd: 10, perStore: 0.05 }, byYear: { storesAdd: [null, -5] } });
  gan(ch[0].rev, 110 * 10 * 1.05, 1e-9, 'năm 1: 110 cửa hàng × DT/cửa hàng 10 × 1,05');
  assert.equal(ch[1].stores, 105, 'năm 2 đóng 5 cửa hàng');
  const tay = projectFcff({ ...base, revMode: 'manual', rev: { manual: [1500, null] } });
  assert.equal(tay[0].rev, 1500);
  gan(tay[1].rev, 1650, 1e-12, 'năm không nhập tay thì dùng tăng trưởng');
});

test('giá trị cuối kỳ: Gordon, bội số thoát, bình quân hai cách', () => {
  const f = projectFcff(base);
  const g = evAt2(f, 0.12, 0.03), e = evAt2(f, 0.12, 0.03, { method: 'exit', exit: 8 }), b = evAt2(f, 0.12, 0.03, { method: 'blend', exit: 8 });
  gan(e.tv, f[2].ebitda * 8, 1e-12, 'exit = EBITDA năm cuối × bội số');
  gan(b.tv, (g.tv + e.tv) / 2, 1e-12, 'blend');
  assert.equal(evAt2(f, 0.12, 0.03, { method: 'exit', exit: 0 }), null);
});

// Bộ số tối thiểu của dealAnalysis để chạy dcfValuation.
const A = () => {
  const m = { rev: 1000e9, adjEbitda: 150e9, kh: 20e9, capexNet: 30e9, tradeWc: 200e9, debt: 100e9, laiVay: 8e9, equityParent: 800e9, netDebt: 50e9 };
  const y = (rev) => ({ months: 12, ltm: false, label: 'Năm', m: { ...m, rev, adjEbitda: rev * 0.15, kh: rev * 0.02, capexNet: rev * 0.03, tradeWc: rev * 0.2 }, v: { 'IS:50': 100, 'IS:60': 80 } });
  return { cols: [y(830e9), y(910e9), y(1000e9)], base: { months: 12, year: 2025, label: 'Năm 2025', m, v: {} },
    valuation: { shares: 100e6, netDebt: 50e9, debtLikeSum: 0, minority: 0, nonOpSum: 0, methods: [] }, inputs: { evEbitda: [5, 7, 9] } };
};

test('kịch bản Bear / Base / Bull: giá tăng dần, giá trị kỳ vọng theo xác suất', () => {
  const inp = { price: 50000, beta: 1, scen: { on: true, baseP: 50, bull: { growth: 0.03, margin: 0.01, wacc: -0.01, p: 25 }, bear: { growth: -0.03, margin: -0.01, wacc: 0.01, p: 25 } } };
  const s = scenarioValuation(A(), inp);
  const [bear, mid, bull] = s.rows;
  assert.ok(bear.price < mid.price && mid.price < bull.price, `${bear.price} < ${mid.price} < ${bull.price}`);
  gan(mid.price, dcfValuation(A(), inp).price, 1e-12, 'Base case = DCF chính');
  gan(s.expected.price, bear.price * 0.25 + mid.price * 0.5 + bull.price * 0.25, 1e-9, 'kỳ vọng');
  assert.equal(scenarioValuation(A(), { ...inp, scen: { on: false } }), null);
});

test('mẫu ngành: đặt cách dự phóng doanh thu, phương pháp giá trị cuối kỳ, trọng số; ngân hàng không dùng DCF', () => {
  assert.ok(PRESETS.length >= 8);
  const v = applyPreset({ price: 1, weights: {} }, 'retail');
  assert.equal(v.revMode, 'stores');
  assert.equal(v.price, 1, 'giữ số người dùng đã nhập');
  assert.equal(applyPreset({}, 'bank').weights.dcf, 0);
  for (const p of PRESETS) assert.equal(Object.values(p.weights).reduce((s, x) => s + x, 0), 100, `${p.id}: trọng số cộng 100`);
});

import { sotpValuation, cleanSotp } from '../js/core/sotp.js';

test('dự phóng theo mảng: mỗi mảng tăng riêng, tổng khớp doanh thu hợp nhất năm gốc (giữ tỷ lệ loại trừ nội bộ)', () => {
  const a = { ...A(), segments: [{ name: 'Bán lẻ', revenue: 700e9 }, { name: 'Phân phối', revenue: 400e9 }] };   // Σ 1.100 > 1.000 hợp nhất
  const inp = { revMode: 'segments', years: 2, segs: [{ name: 'Bán lẻ', rev0: null, g: 0.2, gy: [] }, { name: 'Phân phối', rev0: null, g: null, gy: [0.05] }], growth: 0.1, fade: false };
  const r = dcfValuation(a, inp);
  gan(r.segs.k, 1000 / 1100, 1e-12, 'hệ số khớp');
  gan(r.flows[0].segs[0], 700e9 * 1.2, 1e-12, 'mảng 1 năm 1');
  gan(r.flows[0].segs[1], 400e9 * 1.05, 1e-12, 'mảng 2 năm 1 = ghi đè 5%');
  gan(r.flows[1].segs[1], 400e9 * 1.05 * 1.1, 1e-12, 'mảng 2 năm 2 = tăng trưởng cả công ty');
  gan(r.flows[0].rev, (840e9 + 420e9) * (1000 / 1100), 1e-12, 'tổng × hệ số khớp');
  // Chưa nhập mảng nào: tự lấy theo thuyết minh, tăng trưởng như cả công ty → giống cách % tăng trưởng.
  const r2 = dcfValuation(a, { revMode: 'segments', years: 3, growth: 0.1, fade: false });
  gan(r2.flows[2].rev, dcfValuation(a, { revMode: 'growth', years: 3, growth: 0.1, fade: false }).flows[2].rev, 1e-9, 'mặc định = % tăng trưởng');
  assert.ok(dcfValuation(A(), { revMode: 'segments' }).issues.includes('noSegs'), 'không có mảng → báo');
});

test('SOTP: phần EV trừ nợ hợp nhất một lần, phần equity cộng thẳng, × sở hữu, trừ holding discount', () => {
  const a = A();
  const S = { items: [
    { name: 'Mảng A', kind: 'mult', basis: 'ev', metric: 100e9, mult: 8 },
    { name: 'Mảng B', kind: 'mult', basis: 'ev', metric: 50e9, mult: 6, own: 0.6 },
    { name: 'Cổ phần niêm yết', kind: 'value', basis: 'equity', value: 300e9, own: 0.2 },
  ], disc: 0.1 };
  const r = sotpValuation(a, S);
  gan(r.evSum, 800e9 + 180e9, 1e-12, 'Σ EV');
  gan(r.eqSum, 60e9, 1e-12, 'Σ equity');
  gan(r.less, 50e9, 1e-12, 'trừ net debt');
  gan(r.equity, (980e9 + 60e9 - 50e9) * 0.9, 1e-12, 'equity sau discount');
  gan(r.price, r.equity / 100e6, 1e-12, 'giá / cp');
  assert.equal(sotpValuation(a, { items: [] }).equity, null);
  assert.equal(sotpValuation(a, { items: [{ kind: 'value', basis: 'equity', value: 10e9 }] }).less, 0, 'chỉ có phần equity thì không trừ nợ');
  assert.equal(cleanSotp({ items: [{ kind: 'x', basis: 'y', own: 5 }] }).items[0].kind, 'mult');
});

test('giá mục tiêu: SOTP và phương pháp khác (RNAV…) vào bình quân gia quyền theo trọng số', () => {
  const a = A();
  const dcf = { equity: 1000e9, inputs: cleanVal({ price: 10000, weights: { dcf: 50, pe: 0, evEbitda: 0, pb: 0, evRev: 0, sotp: 25 }, others: [{ name: 'RNAV', ps: 20000, w: 25 }] }) };
  const b = blendedTarget(a, dcf, { sotp: 1200e9 });
  gan(b.equity, (1000e9 * 50 + 1200e9 * 25 + 2000e9 * 25) / 100, 1e-12, 'bình quân');
  assert.equal(b.rows.find((x) => x.key === 'o0').name, 'RNAV');
});

import { lboAnalysis, lboMaxEntry, lboGrid } from '../js/core/lbo.js';

test('module biên gộp & SG&A: EBIT = lợi nhuận gộp − SG&A; theo mảng thì biên gộp từng mảng', () => {
  const a = { ...A(), segments: [{ name: 'X', revenue: 600e9, gm: 0.3 }, { name: 'Y', revenue: 400e9, gm: 0.1 }] };
  const r = dcfValuation(a, { years: 2, growth: 0.1, fade: false, mods: { gm: true }, gmb: { gm: 0.2, sga: 0.05 } });
  gan(r.flows[0].gp, 1100e9 * 0.2, 1e-12, 'GP = rev × biên gộp');
  gan(r.flows[0].ebit, 1100e9 * (0.2 - 0.05), 1e-12, 'EBIT = GP − SG&A');
  const s = dcfValuation(a, { years: 1, growth: 0.1, fade: false, revMode: 'segments', mods: { gm: true }, gmb: { gm: 0.2, sga: 0.05 } });
  gan(s.flows[0].gp, (660e9 * 0.3 + 440e9 * 0.1), 1e-12, 'GP theo biên từng mảng');
  assert.ok(dcfValuation(A(), { mods: { gm: true } }).issues.includes('noGm'), 'không có biên gộp lịch sử → báo, tắt module');
});

test('module vốn lưu động theo ngày: AR theo doanh thu, tồn kho & phải trả theo giá vốn', () => {
  const r = dcfValuation(A(), { years: 1, growth: 0, fade: false, mods: { wcDays: true }, gmb: { gm: 0.25 }, wcd: { dso: 36.5, dio: 73, dpo: 36.5 } });
  const f = r.flows[0];
  gan(f.wcd.ar, 100e9, 1e-12, 'AR = 1.000 × 36,5 / 365');
  gan(f.wcd.inv, 150e9, 1e-12, 'tồn kho = giá vốn 750 × 73 / 365');
  gan(f.wcd.ap, 75e9, 1e-12, 'phải trả = 750 × 36,5 / 365');
  gan(f.wcd.other, 200e9, 1e-12, 'phần vốn lưu động khác theo % doanh thu lịch sử (fixture: chưa tách AR / tồn kho)');
  gan(f.nwc, 175e9 + 200e9, 1e-12, 'NWC = AR + tồn kho − phải trả + khác');
});

test('lịch TSCĐ: TSCĐ cũ khấu hao theo tuổi còn lại, capex mới nửa năm đầu; EBIT = EBITDA − khấu hao theo lịch', () => {
  const a = A(); a.base.m = { ...a.base.m, ppe: 500e9 };
  const r = dcfValuation(a, { years: 2, growth: 0, fade: false, margin: 0.1, da: 0.02, capex: 0.03, mods: { fa: true }, fa: { life0: 10, life: 5, amt: [100e9] } });
  const [f1, f2] = r.flows;
  gan(f1.fa.daOld, 50e9, 1e-12, 'TSCĐ cũ 500 / 10 năm');
  gan(f1.fa.daNew, 10e9, 1e-12, 'capex 100 / 5 năm × ½');
  gan(f1.capex, 100e9, 1e-12, 'capex nhập số tiền');
  gan(f1.ebitda, 1000e9 * 0.12, 1e-12, 'EBITDA = (EBIT margin + D&A%) × rev');
  gan(f1.ebit, 120e9 - 60e9, 1e-12, 'EBIT = EBITDA − khấu hao lịch');
  gan(f2.fa.daNew, 20e9 + 30e9 / 5 / 2, 1e-12, 'năm 2: lớp 1 cả năm + capex năm 2 nửa năm');
  gan(f2.fa.open, f1.fa.close, 1e-12, 'đầu kỳ = cuối kỳ trước');
});

test('doanh thu theo dự án: Σ giá trị × % ghi nhận + doanh thu nền', () => {
  const r = dcfValuation(A(), { years: 2, growth: 0, fade: false, revMode: 'projects', proj: { items: [{ name: 'P1', total: 2000e9, pct: [0.3, 0.7] }], core: 100e9, coreG: 0.1 } });
  gan(r.flows[0].rev, 600e9 + 110e9, 1e-12, 'năm 1');
  gan(r.flows[1].rev, 1400e9 + 121e9, 1e-12, 'năm 2');
});

test('LBO: nguồn = dùng vốn, trả nợ từ dòng tiền, IRR / MOIC; bội số vào tối đa đạt đúng IRR mục tiêu', () => {
  const a = A(); a.valuation = { ...a.valuation, ebitdaAnnual: 150e9 };
  const r = dcfValuation(a, { years: 5, growth: 0.05, fade: false, lbo: { entry: 8, exit: 8, sX: 3, mX: 1, fees: 0.02 } });
  const k = lboAnalysis(a, r);
  gan(k.uses, 150e9 * 8 * 1.02, 1e-12, 'uses');
  gan(k.senior0 + k.mezz0 + k.equity0, k.uses, 1e-12, 'sources = uses');
  assert.ok(k.rows[4].senior < k.senior0, 'nợ senior giảm dần');
  gan(k.moic, k.equityOut / k.equity0, 1e-12, 'MOIC');
  gan((1 + k.irr) ** 5, k.moic, 1e-9, 'IRR');
  const mx = lboMaxEntry(a, r, k);
  gan(lboAnalysis(a, r, { entry: mx.entry, exit: k.exit }).irr, r.inputs.lbo.irr, 1e-6, 'IRR tại bội số tối đa = mục tiêu');
  const gr = lboGrid(a, r, k);
  assert.ok(gr.irr[0][2] > gr.irr[4][2], 'vào rẻ hơn → IRR cao hơn');
});

test('LBO: không quét tiền trả nợ khi tiền mặt tích luỹ còn âm', () => {
  const a = A(); a.valuation = { ...a.valuation, ebitdaAnnual: 150e9 };
  const r = dcfValuation(a, { years: 5, growth: 0.05, fade: false, lbo: { entry: 10, sX: 6, mX: 2, sRate: 0.12, sAmort: 0.2 } });
  const k = lboAnalysis(a, r);
  for (const x of k.rows) if (x.cash < 0) assert.equal(x.sweep, 0, `năm ${x.t}: tiền âm mà vẫn quét`);
  assert.ok(k.issues.includes('shortfall'));
});

import { threeStatement } from '../js/core/threestmt.js';

// Năm gốc có đủ CĐKT (đồng) để chạy mô hình ba báo cáo.
const A3 = () => {
  const a = A();
  a.base.v = { 'BS:280': 2000e9, 'BS:110': 100e9, 'BS:131': 150e9, 'BS:140': 200e9, 'BS:311': 150e9, 'BS:400': 900e9, 'IS:60': 80e9, 'IS:61': 72e9, 'CF:36': -36e9 };
  a.base.m = { ...a.base.m, ppe: 600e9, debt: 400e9, minority: 50e9, cashLike: 0, tradeWc: 200e9 };
  return a;
};

test('ba báo cáo: CĐKT cân mọi năm, tiền cuối kỳ = tiền đầu kỳ + LCTT, vốn chủ = đầu kỳ + LNST − cổ tức', () => {
  const a = A3();
  for (const mods of [{}, { fa: true }, { gm: true, wcDays: true }]) {
    const r = dcfValuation(a, { years: 5, growth: 0.08, margin: 0.1, gmb: { gm: 0.25, sga: 0.1 }, wcd: { dso: 40, dio: 60, dpo: 45 }, mods, fs: { amort: 0.1, newDebt: [50e9], issue: [0, 20e9] } });
    const m = threeStatement(a, r);
    assert.ok(m.ok, `cân đối (${JSON.stringify(mods)}): ${m.years.map((y) => y.check).join(', ')}`);
    let truoc = m.base;
    for (const y of m.years) {
      gan(y.bs.cash, truoc.cash + y.cf.net, 1e-9, 'tiền');
      gan(y.bs.equityParent, truoc.equityParent + y.is.npatP + y.cf.div + y.cf.issue, 1e-9, 'vốn chủ');
      gan(y.bs.ppe, truoc.ppe - y.cf.capex - y.cf.da, 1e-9, 'TSCĐ');
      truoc = y.bs;
    }
  }
});

test('ba báo cáo: lãi vay trên dư nợ đầu năm; cổ tức theo tỷ lệ chi trả năm gốc; revolver khi thiếu tiền', () => {
  const a = A3();
  const r = dcfValuation(a, { years: 2, growth: 0, margin: 0.1, kd: 0.1 });
  const m = threeStatement(a, r);
  gan(-m.years[0].is.interest, 400e9 * 0.1, 1e-12, 'lãi vay năm 1');
  gan(m.fs.payout, 36 / 72, 1e-12, 'payout = cổ tức / LNST cty mẹ');
  gan(m.fs.nciPct, 8 / 80, 1e-12, 'tỷ lệ NCI');
  const r2 = dcfValuation(a, { years: 2, growth: 0, margin: 0.1, kd: 0.1, fs: { minCash: 5000e9 } });
  const m2 = threeStatement(a, r2);
  gan(m2.years[0].bs.cash, 5000e9, 1e-12, 'revolver kéo tiền lên mức tối thiểu');
  assert.ok(m2.years[0].bs.revolver > 0 && m2.ok);
});
