import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeTotals, validate, normalizeSigns, fromTT200, detectRegime, item,
} from '../js/core/statements.js';

const DNP = JSON.parse(readFileSync(new URL('./fixtures/dnp.json', import.meta.url)));
const TY = 1e9;

test('danh mục: mọi dòng tổng đều cộng từ mã có thật, không vòng lặp', () => {
  assert.equal(item('BS', '280').kind, 'total');
  assert.deepEqual(item('BS', '280').sum, [['100', 1], ['200', 1]]);
  assert.equal(item('IS', '24').kind, 'input');
  assert.equal(item('BS', '999'), null);
});

for (const per of DNP.periods) {
  test(`DNP ${per}: tính dòng tổng từ dòng chi tiết khớp đúng số trên BCTC`, () => {
    const all = computeTotals(DNP.input[per]);
    for (const [k, v] of Object.entries(DNP.expect[per])) {
      assert.ok(Math.abs(all[k] - v) < 1, `${k}: tính ${all[k]} ≠ BCTC ${v}`);
    }
  });

  test(`DNP ${per}: số sạch thì không có cảnh báo nào`, () => {
    const vals = { ...DNP.input[per], ...DNP.expect[per] };
    // Cột FY2025 của file DNP trộn CĐKT 31/12/2025 với LCTT 6 tháng 2025 → tiền cuối kỳ không cùng ngày.
    assert.deepEqual(validate(vals, { cashMatchesBS: per !== 'FY2025' }), []);
  });
}

test('lệch 1 tỷ ở phải thu khách hàng → chỉ khoanh dòng 130 (chỗ sai thật) + CĐKT không cân', () => {
  const vals = { ...DNP.input['Q2-2026'], ...DNP.expect['Q2-2026'] };
  vals['BS:131'] += TY;
  const issues = validate(vals);
  const codes = issues.map((i) => i.key);
  assert.ok(codes.includes('BS:130'));
  // 100 và 280 cộng từ số 130 đã in nên vẫn khớp — không báo đỏ cả chuỗi dòng cha.
  assert.ok(!codes.includes('BS:100'));
  assert.ok(!codes.includes('BS:280'));
  const i130 = issues.find((i) => i.key === 'BS:130');
  assert.equal(i130.reported, vals['BS:130']);
  assert.equal(i130.computed, vals['BS:130'] + TY);
});

test('thiếu dòng tổng trên BCTC thì tự điền, không coi là lỗi', () => {
  const vals = { ...DNP.input['Q2-2026'] };
  assert.deepEqual(validate(vals), []);
  assert.equal(Math.round(computeTotals(vals)['BS:280']), DNP.expect['Q2-2026']['BS:280']);
});

test('sai số làm tròn nhỏ (BCTC đơn vị triệu) không bị báo', () => {
  const vals = { ...DNP.input['Q2-2026'], ...DNP.expect['Q2-2026'] };
  vals['BS:100'] += 1e6;
  assert.deepEqual(validate(vals, { unit: 1e6 }).filter((i) => i.key === 'BS:100'), []);
  assert.equal(validate(vals, { unit: 1 }).filter((i) => i.key === 'BS:100').length, 1);
});

test('dòng tổng in ra tự mâu thuẫn: tài sản ≠ nguồn vốn', () => {
  const vals = { ...DNP.input['Q2-2026'], ...DNP.expect['Q2-2026'] };
  vals['BS:440'] += TY;
  vals['BS:400'] += TY; vals['BS:410'] += TY; vals['BS:420'] += TY;   // cộng dồn vẫn khớp, chỉ lệch cân đối
  const bal = validate(vals).find((i) => i.key === 'BS:280=440');
  assert.ok(bal);
  assert.equal(Math.round(bal.diff / TY), -1);
});

test('đối chiếu chéo: tiền cuối kỳ LCTT = tiền CĐKT, LNTT LCTT = LNTT KQKD, 60 = 61 + 62', () => {
  const base = () => ({ ...DNP.input['Q2-2026'], ...DNP.expect['Q2-2026'] });
  const v1 = base();
  v1['CF:61'] += 5e9; v1['CF:70'] += 5e9;             // LCTT tự khớp nhưng tiền cuối kỳ ≠ CĐKT
  assert.deepEqual(validate(v1).map((i) => i.key), ['CF:70=BS:110']);

  const v2 = base();
  v2['CF:61'] += 5e9;                                  // chỉ sai dòng con → bắt ở cộng dồn 70
  assert.deepEqual(validate(v2).map((i) => i.key), ['CF:70']);

  const v3 = base();
  v3['CF:01'] += 2e9; v3['CF:08'] += 2e9; v3['CF:20'] += 2e9; v3['CF:50'] += 2e9;
  v3['CF:70'] += 2e9;
  const k3 = validate(v3).map((i) => i.key);
  assert.ok(k3.includes('CF:01=IS:50'), k3.join());

  const v4 = base();
  v4['IS:62'] += 1e9;
  assert.deepEqual(validate(v4).map((i) => i.key), ['IS:60=61+62']);
});

test('chuẩn hoá dấu: chi phí KQKD luôn dương, dòng (*) trên CĐKT luôn âm, LCTT giữ nguyên', () => {
  const out = normalizeSigns({
    'IS:11': -500, 'IS:25': -7, 'IS:52': -3, 'IS:27': -9,
    'BS:223': 100, 'BS:142': -4, 'BS:131': 50, 'CF:21': -8, 'CF:02': 6,
  });
  assert.deepEqual(out, {
    'IS:11': 500, 'IS:25': 7, 'IS:52': -3, 'IS:27': -9,
    'BS:223': -100, 'BS:142': -4, 'BS:131': 50, 'CF:21': -8, 'CF:02': 6,
  });
});

test('quy đổi mã Thông tư 200 → Thông tư 99', () => {
  const out = fromTT200({
    'BS:270': 1000, 'BS:421': 30, 'BS:154': 2, 'BS:155': 3, 'BS:136': 4, 'BS:320': 5, 'BS:232': -6,
    'IS:21': 11, 'IS:22': 12, 'IS:23': 13, 'IS:24': 14, 'IS:25': 15,
    'CF:02': 20, 'CF:T01': 21,
  });
  assert.deepEqual(out.values, {
    'BS:280': 1000, 'BS:420': 30, 'BS:164': 2, 'BS:165': 3, 'BS:135': 4, 'BS:321': 5, 'BS:242': -6,
    'IS:22': 11, 'IS:23': 12, 'IS:24': 13, 'IS:27': 14, 'IS:25': 15,
    'CF:02': 20, 'CF:T01': 21,
  });
  assert.deepEqual(out.unmapped, []);
  assert.deepEqual(fromTT200({ 'BS:999': 1 }).unmapped, ['BS:999']);
});

test('nhận diện mẫu: TT99 có mã 280, TT200 tổng tài sản ở 270', () => {
  assert.equal(detectRegime({ 'BS:280': 10, 'BS:100': 4, 'BS:200': 6 }), 'TT99');
  assert.equal(detectRegime({ 'BS:270': 10, 'BS:100': 4, 'BS:200': 6 }), 'TT200');
  assert.equal(detectRegime({ 'BS:421': 5 }), 'TT200');
  assert.equal(detectRegime({ 'IS:27': 5, 'BS:420': 1 }), 'TT99');
  assert.equal(detectRegime({}), null);
});
