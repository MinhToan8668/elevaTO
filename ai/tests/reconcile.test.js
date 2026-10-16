// Đối chiếu ngược: số cộng từ THUYẾT MINH phải khớp dòng trên ba bảng chính.
// Thuyết minh là chỗ AI đọc sai nhiều nhất mà không có gì tự phát hiện (model vẫn điền được, biểu đồ
// vẫn vẽ được, chỉ là sai số), nên mỗi bảng phải có một dòng để soi lại.
// Mọi số trong bài này tính theo ĐỒNG, ghi bằng đơn vị triệu cho dễ đọc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../js/core/reconcile.js';
import { VI } from '../js/i18n.vi.js';
import { EN } from '../js/i18n.en.js';

const M = 1e6;
const P = { id: 'FY2025', year: 2025, months: 12, endMonth: 12 };
const mo = (values, notes) => reconcile({ periods: [P], values: { FY2025: values }, notes: { FY2025: notes } }, { unit: 1 });
const ids = (v) => (v.FY2025 || []).map((x) => x.id);
const lay = (v, id) => (v.FY2025 || []).find((x) => x.id === id);

// Mọi khoá kiểm tra mà mô-đun phát ra đều phải có câu giải thích ở cả hai ngôn ngữ.
const MOI_KHOA = ['segRevenue', 'segGross', 'faCostT', 'faDepT', 'faNetT', 'faCostI', 'faDepI', 'faNetI',
  'faRoll', 'depCF', 'debtNH', 'debtDH', 'debtRollNH', 'debtRollDH', 'debtCF', 'debtCFRepay',
  'eqDividends', 'eqIssued', 'goodwill'];

test('mỗi chỗ kiểm tra có câu giải thích ở cả tiếng Việt và tiếng Anh', () => {
  for (const id of MOI_KHOA) assert.ok(VI[`rc.${id}`] && EN[`rc.${id}`], `thiếu rc.${id}`);
});

test('không có thuyết minh thì không đối chiếu gì; khớp thì không báo gì', () => {
  assert.deepEqual(reconcile({ periods: [P], values: { FY2025: { 'IS:10': 100 * M } } }), {});
  assert.deepEqual(mo({ 'IS:10': 1000 * M, 'IS:20': 300 * M },
    { segments: [{ name: 'A', revenue: 600 * M, gross: 200 * M }, { name: 'B', revenue: 400 * M, gross: 100 * M }] }), {});
});

test('doanh thu các mảng cộng lại lệch doanh thu thuần → báo mức "để biết" (có thể do loại trừ nội bộ)', () => {
  const v = mo({ 'IS:10': 1000 * M, 'IS:20': 300 * M },
    { segments: [{ name: 'A', revenue: 600 * M, gross: 100 * M }, { name: 'B', revenue: 200 * M, gross: 100 * M }] });
  assert.deepEqual(ids(v), ['segRevenue', 'segGross']);
  const r = lay(v, 'segRevenue');
  assert.equal(r.severity, 'info');
  assert.equal(r.reported, 1000 * M);
  assert.equal(r.computed, 800 * M);
  assert.equal(r.diff, -200 * M);
  // Lệch 1% trở xuống thì bỏ qua: bảng bộ phận hay in đơn vị thô hơn và có loại trừ nội bộ.
  assert.deepEqual(ids(mo({ 'IS:10': 1000 * M }, { segments: [{ name: 'A', revenue: 995 * M }] })), []);
});

test('nguyên giá / hao mòn / giá trị còn lại TSCĐ hữu hình và vô hình soi vào đúng mã của nó', () => {
  const fa = { tangible: [{ name: 'Nhà', cost: 500 * M, accDep: -200 * M }, { name: 'Máy', cost: 300 * M, accDep: -100 * M }],
    intangible: [{ name: 'Đất', cost: 100 * M, accDep: -10 * M }] };
  // Hữu hình: 222 = 800, 223 = −300, 221 = 500. Vô hình: 228 = 100, 229 = −10, 227 = 90.
  const dung = { 'BS:222': 800 * M, 'BS:223': -300 * M, 'BS:221': 500 * M, 'BS:228': 100 * M, 'BS:229': -10 * M, 'BS:227': 90 * M };
  assert.deepEqual(ids(mo(dung, { fixedAssets: fa })), []);
  const v = mo({ ...dung, 'BS:222': 900 * M, 'BS:221': 600 * M, 'BS:229': -40 * M }, { fixedAssets: fa });
  assert.deepEqual(ids(v).sort(), ['faCostT', 'faDepI', 'faNetT']);
  assert.equal(lay(v, 'faCostT').severity, 'warn', 'nguyên giá lệch thì gần như chắc là đọc sai');
  assert.equal(lay(v, 'faCostT').computed, 800 * M);
  assert.equal(lay(v, 'faDepI').computed, 10 * M, 'hao mòn so theo trị tuyệt đối, khỏi lệ thuộc dấu');
});

test('bảng biến động TSCĐ phải tự khớp: đầu kỳ + tăng − giảm = cuối kỳ, báo rõ nhóm nào lệch', () => {
  const ok = { tangible: [{ name: 'Máy', costOpen: 300 * M, additions: 120 * M, disposals: 20 * M, cost: 400 * M }] };
  assert.deepEqual(ids(mo({}, { fixedAssets: ok })), []);
  const v = mo({}, { fixedAssets: { tangible: [{ name: 'Máy móc thiết bị', costOpen: 300 * M, additions: 120 * M, disposals: 20 * M, cost: 500 * M }] } });
  assert.deepEqual(ids(v), ['faRoll']);
  assert.equal(lay(v, 'faRoll').name, 'Máy móc thiết bị');
  assert.equal(lay(v, 'faRoll').computed, 400 * M);
  assert.equal(lay(v, 'faRoll').reported, 500 * M);
  // Không in số đầu kỳ thì không có gì để tự khớp — đừng bịa ra lỗi.
  assert.deepEqual(ids(mo({}, { fixedAssets: { tangible: [{ name: 'Máy', cost: 500 * M }] } })), []);
});

test('khấu hao trong kỳ ở thuyết minh so với dòng khấu hao trên LCTT', () => {
  const fa = { tangible: [{ name: 'Nhà', depreciation: -60 * M }, { name: 'Máy', depreciation: -40 * M }] };
  assert.deepEqual(ids(mo({ 'CF:02': 100 * M }, { fixedAssets: fa })), []);
  const v = mo({ 'CF:02': 150 * M }, { fixedAssets: fa });
  assert.deepEqual(ids(v), ['depCF']);
  assert.equal(lay(v, 'depCF').severity, 'info', 'thanh lý làm hao mòn lệch chính đáng → chỉ để biết');
});

test('dư nợ vay cuối kỳ soi vào mã 321 / 339; bảng biến động vay phải tự khớp', () => {
  const d = { stOpen: 100 * M, stProceeds: 500 * M, stRepay: 400 * M, stClose: 200 * M,
    ltOpen: 50 * M, ltProceeds: 0, ltRepay: 20 * M, ltClose: 30 * M };
  assert.deepEqual(ids(mo({ 'BS:321': 200 * M, 'BS:339': 30 * M }, { debt: d })), []);
  const v = mo({ 'BS:321': 250 * M, 'BS:339': 30 * M }, { debt: { ...d, stClose: 300 * M } });
  assert.deepEqual(ids(v).sort(), ['debtNH', 'debtRollNH']);
  assert.equal(lay(v, 'debtNH').severity, 'warn');
  assert.equal(lay(v, 'debtRollNH').computed, 200 * M, '100 + 500 − 400');
});

test('tiền vay nhận / trả gốc trong kỳ so với hai dòng trên LCTT', () => {
  const d = { stProceeds: 500 * M, stRepay: 400 * M, ltProceeds: 100 * M, ltRepay: 60 * M };
  assert.deepEqual(ids(mo({ 'CF:33': 600 * M, 'CF:34': -460 * M }, { debt: d })), []);
  const v = mo({ 'CF:33': 900 * M, 'CF:34': -460 * M }, { debt: d });
  assert.deepEqual(ids(v), ['debtCF']);
  assert.equal(lay(v, 'debtCF').computed, 600 * M);
});

test('cổ tức & vốn góp thêm trên bảng biến động vốn chủ so với LCTT; KHÔNG đối chiếu tổng vốn chủ', () => {
  const eq = { dividends: 110 * M, capIssued: 50 * M, premiumInc: 20 * M };
  assert.deepEqual(ids(mo({ 'CF:36': -110 * M, 'CF:31': 70 * M }, { equity: eq })), []);
  const v = mo({ 'CF:36': -300 * M, 'CF:31': 70 * M }, { equity: eq });
  assert.deepEqual(ids(v), ['eqDividends']);
  assert.equal(lay(v, 'eqDividends').severity, 'info', 'số đã quyết nghị khác số đã trả → chỉ để biết');
  // Cổ tức bằng cổ phiếu chỉ chuyển cột trong chính vốn chủ → cộng các cột lại là đếm hai lần,
  // nên cố tình KHÔNG có chỗ kiểm tra nào đối chiếu tổng vốn chủ.
  assert.deepEqual(MOI_KHOA.filter((x) => /^eq/.test(x)), ['eqDividends', 'eqIssued']);
});

test('lợi thế thương mại còn lại soi vào mã 279', () => {
  assert.deepEqual(ids(mo({ 'BS:279': 90 * M }, { goodwill: { cost: 100 * M, accAmort: -10 * M } })), []);
  const v = mo({ 'BS:279': 50 * M }, { goodwill: { cost: 100 * M, accAmort: -10 * M } });
  assert.deepEqual(ids(v), ['goodwill']);
  assert.equal(lay(v, 'goodwill').computed, 90 * M);
});

test('sai số làm tròn theo đơn vị in trên báo cáo được bỏ qua', () => {
  const ds = { periods: [P], values: { FY2025: { 'BS:321': 200 * M } }, notes: { FY2025: { debt: { stClose: 215 * M } } } };
  assert.deepEqual(reconcile(ds, { unit: 1e6 }), {}, 'lệch 15 triệu khi thuyết minh in theo triệu → coi là làm tròn');
  assert.deepEqual(Object.keys(reconcile(ds, { unit: 1 })), ['FY2025']);
});

test('nhiều kỳ: mỗi kỳ chỉ đối chiếu thuyết minh của chính nó', () => {
  const P24 = { id: 'FY2024', year: 2024, months: 12, endMonth: 12 };
  const v = reconcile({ periods: [P24, P],
    values: { FY2024: { 'BS:321': 100 * M }, FY2025: { 'BS:321': 200 * M } },
    notes: { FY2025: { debt: { stClose: 900 * M } } } }, { unit: 1 });
  assert.deepEqual(Object.keys(v), ['FY2025']);
});
