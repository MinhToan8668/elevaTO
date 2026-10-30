// Tab M&A & định giá: LTM, EBITDA chuẩn hoá, cầu nối nợ ròng, vốn lưu động, Beneish / Altman, định giá
// bội số, sức vay nợ. Máy tính hết nên mỗi con số phải ra đúng bằng tay.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dealAnalysis, dealPeriods, measure, beneish, altmanEM, cleanInputs, DEFAULT_INPUTS } from '../js/core/deal.js';
import { serializeSession, parseSession } from '../js/core/session.js';
import { VI } from '../js/i18n.vi.js';
import { EN } from '../js/i18n.en.js';

const B = 1e9;
const KY = (id, year, months = 12, endMonth = 12) => ({ id, year, months, endMonth });
const ky = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * B]));
const nam = (x = 1) => ky({
  'BS:100': 600 * x, 'BS:110': 100, 'BS:121': 20, 'BS:123': 30, 'BS:131': 200 * x, 'BS:132': 20, 'BS:140': 150 * x,
  'BS:200': 400, 'BS:220': 300, 'BS:262': 50, 'BS:280': 1000 * x, 'BS:300': 500, 'BS:310': 300, 'BS:311': 120, 'BS:312': 30,
  'BS:313': 10, 'BS:321': 150, 'BS:339': 100, 'BS:400': 500, 'BS:420': 200, 'BS:429': 50,
  'IS:10': 1000 * x, 'IS:11': 700 * x, 'IS:20': 300 * x, 'IS:22': 20, 'IS:23': 30, 'IS:24': 25, 'IS:25': 50, 'IS:26': 60,
  'IS:30': 180, 'IS:31': 15, 'IS:32': 5, 'IS:40': 10, 'IS:50': 190, 'IS:60': 150, 'IS:61': 140,
  'CF:02': 40, 'CF:14': -25, 'CF:15': -30, 'CF:20': 160, 'CF:21': -60, 'CF:22': 10, 'CF:33': 200, 'CF:34': -220,
});

test('EBITDA chuẩn hoá bỏ đúng các khoản ngoài cốt lõi', () => {
  const m = measure(nam());
  assert.equal(m.ebitda, (190 + 25 + 40) * B);
  const adj = Object.fromEntries(m.adj.map((a) => [a.key, a.v / B]));
  assert.deepEqual(adj, { finIncome: -20, finCostOther: 5, otherProfit: -10 });
  assert.equal(m.adjEbitda, (255 - 20 + 5 - 10) * B);
});

test('nợ ròng, khoản tương đương nợ, tài sản ngoài hoạt động, vốn lưu động', () => {
  const m = measure(nam());
  assert.equal(m.debt, 250 * B);
  assert.equal(m.netDebt, (250 - 100 - 20 - 30) * B);
  assert.deepEqual(m.debtLike.map((x) => [x.key, x.v / B]), [['dividends', 10]]);
  assert.deepEqual(m.nonOp.map((x) => [x.key, x.v / B]), [['associatesInv', 50]]);
  assert.equal(m.tradeWc, (200 + 20 + 150 - 120 - 30) * B);
  assert.equal(m.capexNet, 50 * B);
  assert.equal(m.fcff, (160 + 25 - 50) * B);
  assert.equal(m.fcfe, (160 - 50 + 200 - 220) * B);
});

test('LTM = năm trước + lũy kế năm nay − lũy kế cùng kỳ năm trước; CĐKT lấy kỳ mới nhất', () => {
  const h1 = (x) => ({ ...nam(), 'IS:10': x * B, 'BS:110': 77 * B });
  const ds = { periods: [KY('FY2025', 2025), KY('Q2-2025', 2025, 6, 6), KY('Q2-2026', 2026, 6, 6)],
    values: { FY2025: nam(), 'Q2-2025': h1(400), 'Q2-2026': h1(500) } };
  const cols = dealPeriods(ds);
  assert.deepEqual(cols.map((c) => c.id), ['FY2025', 'Q2-2026', 'LTM']);
  const ltm = cols.find((c) => c.ltm);
  assert.equal(ltm.v['IS:10'], (1000 + 500 - 400) * B);
  assert.equal(ltm.v['BS:110'], 77 * B);
  const a = dealAnalysis(ds, {});
  assert.equal(a.base.id, 'LTM');
  assert.equal(a.valuation.annualized, false);
});

test('không ghép được LTM thì kỳ định giá là năm gần nhất', () => {
  const ds = { periods: [KY('FY2025', 2025), KY('Q2-2026', 2026, 6, 6)], values: { FY2025: nam(), 'Q2-2026': nam() } };
  const a = dealAnalysis(ds, {});
  assert.equal(a.base.id, 'FY2025');
  assert.ok(!a.cols.some((c) => c.ltm));
});

test('định giá bội số đi qua cầu nối và chia số cổ phiếu', () => {
  const ds = { periods: [KY('FY2025', 2025)], values: { FY2025: nam() }, notes: { FY2025: { shares: 10e6 } } };
  const a = dealAnalysis(ds, { evEbitda: [5, 6, 7] });
  const ev = a.valuation.methods.find((x) => x.key === 'evEbitda');
  const ebitda = 230 * B;
  const tru = 100 * B + 10 * B + 50 * B - 50 * B;            // nợ ròng + cổ tức phải trả + CĐKKS − đầu tư LDLK
  assert.equal(ev.ev[1], ebitda * 6);
  assert.equal(ev.equity[1], ebitda * 6 - tru);
  assert.equal(ev.perShare[1], (ebitda * 6 - tru) / 10e6);
  const pe = a.valuation.methods.find((x) => x.key === 'pe');
  assert.equal(pe.equity[0], 140 * B * DEFAULT_INPUTS.pe[0]);
  assert.equal(a.capacity.maxNet, ebitda * 3);
  assert.equal(a.capacity.headroom, ebitda * 3 - 100 * B);
  // DSCR: (230 − 30 thuế − 50 capex) / (25 lãi + max(0, 220 − 200) gốc ròng)
  assert.ok(Math.abs(a.capacity.dscr - 150 / 45) < 1e-9);
});

test('Beneish cần hai năm; doanh nghiệp tăng phải thu đột biến bị đẩy lên vùng nghi ngờ', () => {
  assert.equal(dealAnalysis({ periods: [KY('FY2025', 2025)], values: { FY2025: nam() } }, {}).quality.beneish, null);
  const xau = { ...nam(), 'BS:131': 600 * B, 'IS:10': 1600 * B, 'IS:20': 300 * B, 'CF:20': -200 * B };
  const r = beneish(xau, nam());
  assert.equal(r.zone, 'risk');
  assert.deepEqual(r.missing, []);
  const ok = beneish(nam(), nam());
  assert.ok(ok.score < -1.78);
});

test("Altman Z'' đúng công thức", () => {
  const z = altmanEM(nam());
  const x1 = (600 - 300) / 1000, x2 = 200 / 1000, x3 = 215 / 1000, x4 = 500 / 500;
  assert.ok(Math.abs(z.score - (3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4)) < 1e-9);
});

test('điều chỉnh tay cộng vào EBITDA định giá; thông số lạ bị lọc', () => {
  const ds = { periods: [KY('FY2025', 2025)], values: { FY2025: nam() } };
  const a = dealAnalysis(ds, { adjustments: [{ label: 'Lương chủ DN', amount: 20 * B }] });
  assert.equal(a.valuation.ebitda, 250 * B);
  const c = cleanInputs({ evEbitda: [1, 'x', -3], targetLev: 'abc', adjustments: 'no', __proto__: { x: 1 } });
  assert.deepEqual(c.evEbitda, [1, DEFAULT_INPUTS.evEbitda[1], DEFAULT_INPUTS.evEbitda[2]]);
  assert.equal(c.targetLev, DEFAULT_INPUTS.targetLev);
  assert.deepEqual(c.adjustments, []);
});

test('thông số định giá lưu cùng phiên', () => {
  const s = { sources: [], edits: [], ticks: null, unit: 1e6, segmentMap: {}, segmentNames: [], aiContext: {},
    dealInputs: { ...DEFAULT_INPUTS, evEbitda: [4, 6, 8], adjustments: [{ label: 'x', amount: 5 }] } };
  const back = parseSession(serializeSession(s));
  assert.deepEqual(back.dealInputs.evEbitda, [4, 6, 8]);
  assert.deepEqual(back.dealInputs.adjustments, [{ label: 'x', amount: 5 }]);
});

test('mọi khoá mô-đun phát ra đều có chữ ở cả hai ngôn ngữ', () => {
  const src = readFileSync(new URL('../js/core/deal.js', import.meta.url), 'utf8');
  const flags = [...src.matchAll(/bat\('(\w+)'/g)].map((m) => m[1]);
  const keys = [...src.matchAll(/\{ key: '(\w+)', v:/g)].map((m) => m[1]);
  assert.ok(flags.length >= 8 && keys.length >= 10);
  const can = [...flags.flatMap((f) => [`dl.flag.${f}`, `dl.flag.${f}.why`]),
    ...keys.map((k) => [`dl.adj.${k}`, `dl.dl.${k}`, `dl.no.${k}`].find((x) => x in VI) || `dl.?.${k}`)];
  for (const k of can) { assert.ok(k in VI, `thiếu ${k}`); assert.ok(k in EN, `thiếu EN ${k}`); }
});

test('chạy được trên BCTC thật (DNP) mà không ra NaN', () => {
  const f = JSON.parse(readFileSync(new URL('./fixtures/dnp.json', import.meta.url), 'utf8'));
  const ds = { periods: [KY('FY2025', 2025), KY('Q2-2026', 2026, 6, 6)], values: f.input };
  const a = dealAnalysis(ds, {});
  const nan = (x) => (typeof x === 'number' ? Number.isNaN(x) : x && typeof x === 'object' ? Object.values(x).some(nan) : false);
  assert.ok(!nan({ ...a, cols: a.cols.map((c) => c.m) }));
  assert.ok(a.base.m.adjEbitda > 0 && a.valuation.methods.length === 3);
});
