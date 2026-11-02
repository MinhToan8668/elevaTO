import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compsAnalysis, peerMultiples, quantile, parsePeers } from '../js/core/comps.js';

const gan = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * tol, `${msg}: ${a} ≠ ${b}`);
const ty = 1e9;
// Peer của model DGW (sheet 16.Comps), số tiền tỷ đồng; EBITDA / LNST = doanh thu × biên như model.
const P = [
  ['FPT Retail (FRT)', 185000, 1, 136214832, 1850, 5420, 35000, 0.032, 0.018],
  ['Thế Giới Di Động (MWG)', 77000, 1, 1462238655, 25600, 22800, 140000, 0.051, 0.023],
  ['Petrosetco (PET)', 26000, 1, 108000000, 900, 4100, 18000, 0.024, 0.011],
  ['Central Retail (CRC)', 22.1, 728.5, 6030814700, 12400, 45600, 450000, 0.085, 0.031],
  ['Harvey Norman (HVN)', 5.12, 16840, 1246006590, 4500, 12800, 180000, 0.112, 0.075],
  ['TD SYNNEX (SNX)', 124.8, 25350, 88460000, 28500, 105000, 2800000, 0.021, 0.009],
  ['Ingram Micro (INGM)', 22.35, 25350, 210000000, 15200, 98000, 4800000, 0.018, 0.006],
  ['DKSH Holding', 62.4, 29860, 64807026, 18600, 24500, 320000, 0.045, 0.032],
].map(([name, price, fx, shares, cash, debt, rev, em, nm]) => ({ name, price, fx, shares, cash: cash * ty, debt: debt * ty, rev: rev * ty, ebitda: rev * em * ty, npat: rev * nm * ty }));

test('bội số từng peer như 16.Comps: EV = vốn hoá + nợ − tiền, quy đổi tỷ giá', () => {
  const m = peerMultiples(P[3]);                 // Central Retail, giá THB × tỷ giá
  gan(m.cap / ty, 97095.212, 1e-6, 'vốn hoá');
  gan(m.ev / ty, 130295.212, 1e-6, 'EV');
  gan(m.evEbitda, 3.4064, 1e-4, 'EV/EBITDA');
  gan(m.pe, 6.9602, 1e-4, 'P/E');
});

test('trung vị / trung bình nhóm peer khớp model (EV/Rev 0,3648 · EV/EBITDA 7,4279 · P/E 11,4489)', () => {
  const r = compsAnalysis(P);
  gan(r.stats.evRev.median, 0.3648, 1e-3, 'EV/Rev trung vị');
  gan(r.stats.evEbitda.median, 7.4279, 1e-4, 'EV/EBITDA trung vị');
  gan(r.stats.pe.median, 11.4489, 1e-4, 'P/E trung vị');
  gan(r.stats.evEbitda.mean, 10.1638, 1e-4, 'EV/EBITDA trung bình');
  assert.equal(r.stats.pb.n, 0, 'không nhập vốn chủ → không có P/B');
});

test('giá ngầm định của DGW theo trung vị peer khớp model (EV/EBITDA 23.772 đ, P/E 28.348 đ, EV/Rev 38.667 đ)', () => {
  const sh = 221320169, cash = 1742.002 * ty, debt = 2899.171 * ty;
  const r = compsAnalysis(P, { rev: 26632 * ty, ebitda: 864.095 * ty, npat: 548 * ty, shares: sh, bridge: (ev) => ev - debt + cash });
  const gia = Object.fromEntries(r.implied.map((x) => [x.key, x.price]));
  gan(gia.evEbitda, 23772.1818, 2e-4, 'EV/EBITDA');
  gan(gia.pe, 28348.0182, 2e-4, 'P/E');
  gan(gia.evRev, 38666.8198, 2e-3, 'EV/Rev');
});

test('peer bỏ tick, bội số âm / phi lý không vào thống kê; tứ phân vị kiểu Excel', () => {
  const r = compsAnalysis([...P.slice(0, 3), { name: 'Lỗ', price: 10000, shares: 1e8, rev: 1e12, ebitda: -1e10, npat: -5e9 }, { ...P[3], off: true }]);
  assert.equal(r.stats.evEbitda.n, 3);
  gan(quantile([1, 2, 3, 4], 0.25), 1.75, 1e-12, 'Q1');
});

test('dán bảng từ Excel: tab hoặc ;, số kiểu Việt / Anh, bỏ dòng tiêu đề', () => {
  const ds = parsePeers('Tên\tGiá\tTỷ giá\tSố CP\nFRT\t185.000\t1\t136214832\t1.850\t5.420\t35.000\t1.120\t630\t3.500\nCRC;22.1;728.5;6030814700;12400;45600;450000;38250;13950;', ty);
  assert.equal(ds.length, 2);
  assert.equal(ds[0].price, 185000);
  assert.equal(ds[0].cash, 1850 * ty);
  assert.equal(ds[1].fx, 728.5);
  assert.equal(ds[1].equity, null);
});

import { blendedTarget } from '../js/core/valuation.js';
test('giá mục tiêu gia quyền dùng được EV/Doanh thu theo trung vị peer khi có trọng số', () => {
  const a = { valuation: { shares: 100, methods: [{ key: 'pe', equity: [0, 2000, 0] }] } };
  const r = blendedTarget(a, { equity: 3000, inputs: { weights: { dcf: 50, pe: 25, evEbitda: 0, pb: 0, evRev: 25 }, price: 30 } }, { evRev: 1000 });
  assert.equal(r.equity, (3000 * 50 + 2000 * 25 + 1000 * 25) / 100);
  assert.equal(blendedTarget(a, { equity: 3000, inputs: { weights: { dcf: 50, pe: 25, evEbitda: 0, pb: 0, evRev: 25 }, price: 30 } }).rows.find((x) => x.key === 'evRev').used, false);
});
