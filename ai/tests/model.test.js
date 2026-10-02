import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel, MODEL_ROWS } from '../js/targets/model.js';
import { computeTotals } from '../js/core/statements.js';

const DNP = JSON.parse(readFileSync(new URL('./fixtures/dnp.json', import.meta.url)));
const M = 1e6;

// Hai "năm" giả lập từ số DNP: 2025 = CĐKT 31/12/2025, 2026 = CĐKT 30/06/2026 (+ KQKD/LCTT 6 tháng).
const ds = {
  periods: [{ id: 'FY2025', year: 2025, months: 12 }, { id: 'FY2026', year: 2026, months: 12 }],
  values: {
    FY2025: { ...DNP.input.FY2025, ...DNP.expect.FY2025 },
    FY2026: { ...DNP.input['Q2-2026'], ...DNP.expect['Q2-2026'] },
  },
  notes: {},
};

// Mô phỏng đúng các công thức của sheet 03.Input_FS để kiểm tra kết quả "đổ" vào có cân không.
function sheet(out, year) {
  const c = out.byYear[year] || {};
  const r = (n) => (c[n] ? c[n].v : 0);
  const s = (a, b) => { let t = 0; for (let i = a; i <= b; i++) t += r(i); return t; };
  const x = {};
  x[10] = r(8) + r(9); x[15] = r(13) + r(14);
  x[19] = x[10] + r(12) + x[15] + r(16) + r(17) + r(18);
  x[22] = x[19] + r(20) + r(21); x[25] = r(23) + r(24); x[26] = x[22] + x[25]; x[28] = x[26] - r(27);
  x[31] = r(32) + r(33); x[49] = x[31] + r(34) + s(36, 40) + r(42) + r(43) + s(45, 48);
  x[66] = r(52) + r(54) + r(55) + r(57) + r(58) + s(59, 65); x[67] = x[49] + x[66];
  x[92] = s(71, 78) + s(80, 82) + s(85, 90); x[93] = x[67] - x[92];
  x[102] = x[22] + s(98, 101); x[110] = x[102] + s(103, 109); x[116] = s(112, 115);
  x[124] = s(118, 119) + (r(208) + r(210)) + (r(209) + r(211)) + s(122, 123);
  x[128] = x[110] + x[116] + x[124] + r(126) + r(127); x[129] = x[128] - x[31];
  x[138] = s(132, 136) - r(8);
  x[189] = Math.abs(r(150) + r(155) + r(160) + r(165) + r(170) - r(54)) + Math.abs(r(151) + r(156) + r(161) + r(166) + r(171) - r(55))
         + Math.abs(r(175) + r(180) - r(57)) + Math.abs(r(176) + r(181) - r(58));
  return x;
}

const out = buildModel(ds);

test('mọi dòng nhập của model đều có định nghĩa, không trùng dòng', () => {
  const rows = MODEL_ROWS.map((d) => d.row);
  assert.equal(new Set(rows).size, rows.length);
  for (const r of [8, 9, 32, 54, 78, 89, 98, 109, 112, 123, 126, 132, 140, 150, 185, 191, 202, 208, 214, 216]) {
    assert.ok(rows.includes(r), 'thiếu dòng ' + r);
  }
});

for (const y of [2025, 2026]) {
  test(`${y}: KQKD vào model ra đúng LNTT, LNST, LN công ty mẹ (triệu đồng)`, () => {
    const v = ds.values['FY' + y], x = sheet(out, y);
    assert.ok(Math.abs(x[22] - v['IS:50'] / M) < 0.01, `LNTT ${x[22]} ≠ ${v['IS:50'] / M}`);
    assert.ok(Math.abs(x[26] - v['IS:60'] / M) < 0.01);
    assert.ok(Math.abs(x[28] - v['IS:61'] / M) < 0.01);
    assert.equal(out.byYear[y][9].v, -v['IS:11'] / M);          // giá vốn nhập số âm
  });

  test(`${y}: CĐKT cân (dòng CHECK 93 = 0) — mọi dòng BCTC đều có chỗ trong model`, () => {
    const x = sheet(out, y);
    assert.ok(Math.abs(x[93]) < 0.01, 'CHECK 93 = ' + x[93]);
    const v = computeTotals(ds.values['FY' + y]);
    assert.ok(Math.abs(x[67] - v['BS:280'] / M) < 0.01);
    assert.equal(out.byYear[y][48], undefined, 'dòng 48 model không đọc → không được ghi');
  });

  test(`${y}: LCTT vào model khớp HĐKD, HĐĐT, HĐTC và tiền cuối kỳ`, () => {
    const v = ds.values['FY' + y], x = sheet(out, y);
    assert.ok(Math.abs(x[110] - v['CF:20'] / M) < 0.01, `HĐKD ${x[110]} ≠ ${v['CF:20'] / M}`);
    assert.ok(Math.abs(x[116] - v['CF:30'] / M) < 0.01);
    assert.ok(Math.abs(x[124] - v['CF:40'] / M) < 0.01);
    assert.ok(Math.abs(x[128] - v['CF:70'] / M) < 0.01);
  });

  test(`${y}: chưa có thuyết minh → số tạm vẫn làm các dòng CHECK 138 và 189 bằng 0, có cảnh báo`, () => {
    const x = sheet(out, y);
    assert.ok(Math.abs(x[138]) < 0.01);
    assert.ok(x[189] < 0.01, 'CHECK 189 = ' + x[189]);
    assert.equal(out.byYear[y][132].src, 'uoc');
    assert.equal(out.byYear[y][150].src, 'uoc');
    assert.ok(out.warnings.some((w) => /mảng/.test(w)));
    assert.ok(out.warnings.some((w) => /tài sản cố định/i.test(w)));
  });
}

test('CHECK 129: tiền cuối kỳ LCTT = tiền CĐKT ở năm có LCTT cùng ngày', () => {
  assert.ok(Math.abs(sheet(out, 2026)[129]) < 0.01);
});

test('biến động vốn chủ: dòng cân đảm bảo CHECK 206 = 0 khi có năm trước', () => {
  const c = out.byYear[2026], p = out.byYear[2025];
  const r = (o, n) => (o[n] ? o[n].v : 0);
  let cap = r(p, 85), re = r(p, 89);
  for (let i = 191; i <= 195; i++) cap += r(c, i);
  re += sheet(out, 2026)[28];
  for (let i = 202; i <= 204; i++) re += r(c, i);
  assert.ok(Math.abs(cap - r(c, 85)) < 0.01);
  assert.ok(Math.abs(re - r(c, 89)) < 0.01);
  assert.equal(out.byYear[2025][202], undefined, 'năm đầu không có năm trước → không ghi biến động');
});

test('nợ vay: không có thuyết minh thì lấy tiền vay / trả nợ từ LCTT', () => {
  const v = ds.values.FY2026;
  assert.equal(out.byYear[2026][208].v, v['CF:33'] / M);
  assert.equal(out.byYear[2026][209].v, v['CF:34'] / M);
  assert.equal(out.byYear[2026][208].src, 'lctt');
});

test('thuyết minh mảng: ghép theo sơ đồ người dùng chọn, mảng dư gộp vào ô cuối', () => {
  const ds2 = structuredClone(ds);
  ds2.notes = { FY2026: { segments: [
    { name: 'Dược phẩm', revenue: 3e12, gross: 6e11 },
    { name: 'Nhựa', revenue: 2e12, gross: 3e11 },
    { name: 'Nước', revenue: 342859550467, gross: 1e11 },
  ] } };
  const o = buildModel(ds2, { segmentMap: { 'Dược phẩm': 0, 'Nhựa': 1, 'Nước': 1 } });
  const c = o.byYear[2026];
  assert.equal(c[132].v, 3e6); assert.equal(c[133].v, 2e6 + 342859.550467);
  assert.equal(c[134].v, 0); assert.equal(c[140].v, 6e5); assert.equal(c[132].src, 'tm');
  assert.ok(Math.abs(sheet(o, 2026)[138]) < 0.01);
});

test('thuyết minh TSCĐ theo nhóm được dùng khi có, và cảnh báo nếu không khớp CĐKT', () => {
  const ds2 = structuredClone(ds);
  const v = ds2.values.FY2026;
  ds2.notes = { FY2026: { fixedAssets: {
    tangible: [
      { cls: 'buildings', cost: v['BS:222'] - 100e9, accDep: v['BS:223'] + 10e9, additions: 5e9, depreciation: -3e9 },
      { cls: 'machinery', cost: 100e9, accDep: -10e9, additions: 1e9, depreciation: -1e9 },
    ],
    intangible: [{ cls: 'land', cost: v['BS:228'], accDep: v['BS:229'], additions: 0, depreciation: 0 }],
  } } };
  const o = buildModel(ds2);
  assert.equal(o.byYear[2026][155].v, 100e3);
  assert.equal(o.byYear[2026][155].src, 'tm');
  // Thuê tài chính (225/226) không có trong thuyết minh TSCĐ hữu hình → cộng vào nhóm "khác" để vẫn khớp dòng 54/55
  assert.ok(sheet(o, 2026)[189] < 0.01, 'CHECK 189 = ' + sheet(o, 2026)[189]);
});

test('đơn vị & tham số: cổ phiếu (triệu cp), thuế suất, số năm phân bổ LTTM', () => {
  const c = out.byYear[2026];
  assert.equal(c[216].v, 0.2);
  assert.equal(c[217].v, 10);
  assert.equal(c[214], undefined, 'chưa có số cổ phiếu thì để trống, không đoán');
});

// ─── Thuyết minh nhiều năm (ca thật: VHC chỉ trích thuyết minh của năm mới nhất) ───

test('thuyết minh TSCĐ một năm đủ tách nhóm cho cả năm trước (cột "số đầu năm")', () => {
  const ds2 = structuredClone(ds);
  const v = ds2.values.FY2026, u = ds2.values.FY2025;
  // Bảng biến động của năm 2026 in luôn số đầu năm — đó chính là số cuối năm 2025.
  ds2.notes = { FY2026: { fixedAssets: {
    tangible: [
      { cls: 'buildings', name: 'Nhà cửa, vật kiến trúc', cost: v['BS:222'] - 100e9, accDep: v['BS:223'] + 10e9,
        additions: 5e9, depreciation: -3e9, costOpen: u['BS:222'] - 60e9, accDepOpen: u['BS:223'] + 6e9 },
      { cls: 'machinery', name: 'Máy móc và thiết bị', cost: 100e9, accDep: -10e9,
        additions: 1e9, depreciation: -1e9, costOpen: 60e9, accDepOpen: -6e9 },
    ],
    intangible: [{ cls: 'land', name: 'Quyền sử dụng đất', cost: v['BS:228'], accDep: v['BS:229'],
      additions: 0, depreciation: 0, costOpen: u['BS:228'], accDepOpen: u['BS:229'] }],
  } } };
  const o = buildModel(ds2);
  const c25 = o.byYear[2025];
  assert.equal(c25[155].v, 60e3, '2025 phải có dòng Máy móc riêng, không dồn hết vào Nhà cửa');
  assert.equal(c25[150].v, (u['BS:222'] - 60e9) / M);
  assert.equal(c25[150].src, 'tm', 'nguyên giá lấy từ thuyết minh, không phải số ước tính');
  assert.equal(c25[152].src, 'uoc', 'capex chia theo tỷ trọng nên là số ước tính');
  // Vẫn khớp CĐKT ở cả hai năm.
  assert.ok(Math.abs(sheet(o, 2025)[189]) < 0.01, 'CHECK 189 năm 2025 = ' + sheet(o, 2025)[189]);
  assert.ok(Math.abs(sheet(o, 2026)[189]) < 0.01, 'CHECK 189 năm 2026 = ' + sheet(o, 2026)[189]);
  assert.ok(o.warnings.some((w) => /2025/.test(w) && /đầu năm/.test(w)), o.warnings.join(' | '));
  assert.ok(!o.warnings.some((w) => /Chưa có thuyết minh tài sản cố định/.test(w)), 'đã có thuyết minh thì đừng báo thiếu');
});

test('cảnh báo thiếu thuyết minh phải nói rõ NĂM NÀO thiếu', () => {
  const ds2 = structuredClone(ds);
  ds2.notes = { FY2026: { segments: [{ name: 'Một mảng', revenue: ds2.values.FY2026['IS:10'], gross: 1e11 }] } };
  const o = buildModel(ds2);
  const seg = o.warnings.find((w) => /doanh thu theo mảng/.test(w));
  assert.ok(seg, o.warnings.join(' | '));
  assert.match(seg, /2025/, 'phải nêu năm thiếu');
  assert.doesNotMatch(seg, /2026/, 'năm đã có thuyết minh thì không nằm trong danh sách thiếu');
});

test('năm nào cũng có thuyết minh thì không còn câu "chưa có thuyết minh" nào', () => {
  const ds2 = structuredClone(ds);
  const n = (p) => ({
    segments: [{ name: 'Một mảng', revenue: ds2.values[p]['IS:10'], gross: 1e11 }],
    debt: { stProceeds: 1e11, stRepay: 5e10, ltProceeds: 0, ltRepay: 0 },
    equity: { capIssued: 0, dividends: 0 },
    fixedAssets: { tangible: [{ cls: 'buildings', name: 'Nhà cửa', cost: ds2.values[p]['BS:222'], accDep: ds2.values[p]['BS:223'], additions: 0, depreciation: 0 }], intangible: [] },
    goodwill: { cost: ds2.values[p]['BS:279'] || 0, accAmort: 0, additions: 0, amortization: 0 },
  });
  ds2.notes = { FY2025: n('FY2025'), FY2026: n('FY2026') };
  const o = buildModel(ds2);
  assert.deepEqual(o.warnings.filter((w) => /Chưa có thuyết minh/.test(w)), []);
});

test('không mượn cột "đầu năm" khi hai năm không liền kề', () => {
  const ds2 = structuredClone(ds);
  ds2.periods = [{ id: 'FY2025', year: 2023, months: 12 }, { id: 'FY2026', year: 2026, months: 12 }];
  const v = ds2.values.FY2026;
  ds2.notes = { FY2026: { fixedAssets: {
    tangible: [{ cls: 'buildings', name: 'Nhà cửa', cost: v['BS:222'], accDep: v['BS:223'],
      additions: 0, depreciation: 0, costOpen: 1e12, accDepOpen: -1e11 }],
    intangible: [],
  } } };
  const o = buildModel(ds2);
  // Cột đầu năm của thuyết minh 2026 là số cuối năm 2025, không phải 2023 → không được dùng.
  assert.notEqual(o.byYear[2023][150].v, 1e6, 'không được lấy số đầu năm 2026 cho năm 2023');
  assert.equal(o.byYear[2023][150].src, 'uoc');
  assert.ok(o.warnings.some((w) => /Chưa có thuyết minh tài sản cố định.*2023/.test(w)), o.warnings.join(' | '));
});
