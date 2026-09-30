import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseAIJson, normCode, statementToValues, classifyPages, periodsFromMeta, noteToModel, matchLabel,
} from '../js/core/extract.js';
import { validate } from '../js/core/statements.js';
import { CHART } from '../js/chart2026.js';

const DNP = JSON.parse(readFileSync(new URL('./fixtures/dnp.json', import.meta.url)));

test('đọc JSON AI trả về: bỏ ```json, lấy khối JSON đầu tiên, báo lỗi rõ khi hỏng', () => {
  assert.deepEqual(parseAIJson('```json\n{"a":[1,2]}\n```'), { a: [1, 2] });
  assert.deepEqual(parseAIJson('Đây là kết quả: {"a":"}"} xong'), { a: '}' });
  assert.throws(() => parseAIJson('{"a":'), /không đọc được/);
});

test('chuẩn hoá mã số: bỏ dấu chấm/khoảng trắng, mã KQKD/LCTT 2 chữ số, chữ thường', () => {
  assert.equal(normCode('BS', ' 1 3 1 '), '131');
  assert.equal(normCode('IS', '1'), '01');
  assert.equal(normCode('CF', '5.'), '05');
  assert.equal(normCode('BS', '421A'), '421a');
  assert.equal(normCode('BS', 'V.01'), '');                 // cột "Thuyết minh" lọt vào → bỏ
  assert.equal(normCode('BS', ''), '');
});

test('khớp dòng thiếu mã số theo tên chỉ tiêu', () => {
  assert.equal(matchLabel('BS', '1. Phải thu ngắn hạn của khách hàng'), '131');
  assert.equal(matchLabel('BS', 'Tổng cộng tài sản'), '280');
  assert.equal(matchLabel('IS', '10. Chi phí bán hàng'), '25');
  assert.equal(matchLabel('BS', 'Dòng tào lao'), null);
});

// Giả lập đúng thứ AI trả cho một BCĐKT theo mẫu TT200, đơn vị triệu đồng, số âm trong ngoặc.
function fakeAiBS() {
  const cur = DNP.input['Q2-2026'], prv = DNP.input.FY2025;
  const toTT200 = Object.fromEntries(CHART.filter((i) => i.st === 'BS').map((i) => [i.code, i.tt200]));
  const fmt = (x) => { const m = Math.round(x / 1e6); const s = Math.abs(m).toLocaleString('de-DE'); return m < 0 ? `(${s})` : s; };
  const items = [];
  for (const [k, v] of Object.entries(cur)) {
    if (!k.startsWith('BS:')) continue;
    const code = k.slice(3);
    if (/[a-z]$/.test(code) && !/x$/.test(code)) continue;          // memo ¤ không in trên CĐKT
    if (!toTT200[code]) continue;                                    // mã mới của TT99: gộp riêng ở dưới
    let [cv, pv] = [v, prv[k] ?? 0];
    if (code === '320') { cv += cur['BS:313'] || 0; pv += prv['BS:313'] || 0; }   // TT200: cổ tức phải trả nằm trong 319
    items.push({ c: toTT200[code], n: 'x', v: fmt(cv), p: fmt(pv) });
  }
  // TT200 chỉ in tổng vay (320, 338), không tách tổ chức tín dụng / khác như TT99 (321a/b, 339a/b).
  const both = (a, b) => [(cur[a] || 0) + (cur[b] || 0), (prv[a] || 0) + (prv[b] || 0)];
  for (const [c, a, b2] of [['320', 'BS:321a', 'BS:321b'], ['338', 'BS:339a', 'BS:339b']]) {
    const [cv, pv] = both(a, b2);
    items.push({ c, n: 'Vay', v: fmt(cv), p: fmt(pv) });
  }
  items.push({ c: '270', n: 'TỔNG CỘNG TÀI SẢN', v: fmt(DNP.expect['Q2-2026']['BS:280']), p: fmt(DNP.expect.FY2025['BS:280']) });
  items.push({ c: '', n: 'Tổng cộng nguồn vốn', v: fmt(DNP.expect['Q2-2026']['BS:440']), p: fmt(DNP.expect.FY2025['BS:440']) });
  return { meta: { don_vi: 'Đơn vị tính: triệu đồng', ngay_ket_thuc: '2026-06-30', hop_nhat: true, ten_cong_ty: 'CTCP DNP Holding' }, items };
}

test('BCĐKT mẫu TT200, đơn vị triệu, số trong ngoặc → mã TT99, đồng, cân đối', () => {
  const r = statementToValues('BS', fakeAiBS());
  assert.equal(r.regime, 'TT200');
  assert.equal(r.unit, 1e6);
  assert.deepEqual(r.unmapped, []);
  assert.equal(r.cur['BS:280'], Math.round(DNP.expect['Q2-2026']['BS:280'] / 1e6) * 1e6);
  assert.equal(r.cur['BS:223'], Math.round(DNP.input['Q2-2026']['BS:223'] / 1e6) * 1e6);
  assert.ok(r.cur['BS:223'] < 0);
  assert.equal(r.cur['BS:420'], Math.round(DNP.input['Q2-2026']['BS:420'] / 1e6) * 1e6);
  assert.equal(r.cur['BS:440'], r.cur['BS:280']);            // dòng không mã khớp theo tên
  assert.deepEqual(validate(r.cur, { unit: 1e6 }).filter((i) => i.kind === 'sum' && Math.abs(i.diff) > 5e7), []);
});

test('đơn vị không rõ → dùng đồng và báo cần xác nhận', () => {
  const ai = fakeAiBS(); ai.meta.don_vi = '';
  const r = statementToValues('BS', ai);
  assert.equal(r.unit, 1); assert.ok(r.warnings.some((w) => /đơn vị/i.test(w)));
});

test('LCTT trực tiếp → mã T01…; KQKD mã 1 chữ số → 01', () => {
  const cf = statementToValues('CF', { meta: { don_vi: 'VND', phuong_phap: 'truc_tiep' }, items: [
    { c: '1', n: 'Tiền thu từ bán hàng', v: '100', p: '90' }, { c: '20', n: 'Lưu chuyển tiền thuần từ HĐKD', v: '100', p: '90' },
    { c: '21', n: 'Tiền chi mua sắm TSCĐ', v: '(5)', p: '(4)' }] });
  assert.deepEqual(cf.cur, { 'CF:T01': 100, 'CF:T20': 100, 'CF:T21': -5 });
  const is = statementToValues('IS', { meta: { don_vi: 'đồng' }, items: [{ c: '1', n: 'Doanh thu', v: '1.000', p: '900' }, { c: '11', n: 'Giá vốn', v: '(600)', p: '(500)' }] });
  assert.deepEqual(is.cur, { 'IS:01': 1000, 'IS:11': 600 });            // giá vốn dương theo chuẩn
  assert.deepEqual(is.prev, { 'IS:01': 900, 'IS:11': 500 });
});

test('dòng không có số / số "-" bị bỏ qua, không thành 0', () => {
  const r = statementToValues('BS', { meta: { don_vi: 'đồng' }, items: [{ c: '131', n: 'x', v: '-', p: '' }, { c: '132', n: 'x', v: '5', p: '-' }] });
  assert.deepEqual(r.cur, { 'BS:132': 5 }); assert.deepEqual(r.prev, {});
});

test('kỳ báo cáo: năm → CĐKT & KQKD kỳ trước đều là năm trước; giữa niên độ → CĐKT kỳ trước là đầu năm', () => {
  assert.deepEqual(periodsFromMeta({ ngay_ket_thuc: '2025-12-31', so_thang: 12 }), {
    cur: { id: 'FY2025', year: 2025, months: 12, endMonth: 12 },
    prevBS: { id: 'FY2024', year: 2024, months: 12, endMonth: 12 },
    prevFlow: { id: 'FY2024', year: 2024, months: 12, endMonth: 12 },
  });
  const q = periodsFromMeta({ ngay_ket_thuc: '2026-06-30', so_thang: 6 });
  assert.deepEqual(q.cur, { id: 'Q2-2026', year: 2026, months: 6, endMonth: 6 });
  assert.deepEqual(q.prevBS, { id: 'FY2025', year: 2025, months: 12, endMonth: 12 });
  assert.deepEqual(q.prevFlow, { id: 'Q2-2025', year: 2025, months: 6, endMonth: 6 });
  assert.equal(periodsFromMeta({ ngay_ket_thuc: '30/06/2026' }).cur.id, 'Q2-2026');
  assert.equal(periodsFromMeta({}), null);
});

test('nhận diện trang từ chữ của PDF: tiêu đề, trang nối tiếp, mục lục, thuyết minh theo nhóm', () => {
  const pages = [
    'CÔNG TY CỔ PHẦN ABC\nBÁO CÁO TÀI CHÍNH HỢP NHẤT\nNăm 2025',
    'MỤC LỤC\nBáo cáo tình hình tài chính 5\nBáo cáo kết quả hoạt động kinh doanh 8\nBáo cáo lưu chuyển tiền tệ 9',
    'BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT\nTại ngày 31 tháng 12 năm 2025\nTÀI SẢN Mã số 100 110 111 112 120',
    '200 210 220 221 222 223 240 250 260 270 280 TỔNG CỘNG TÀI SẢN 300 310 311',
    'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH HỢP NHẤT\n01 02 10 11 20 21 22 23',
    'BÁO CÁO LƯU CHUYỂN TIỀN TỆ HỢP NHẤT (Theo phương pháp gián tiếp)\n01 02 03',
    '20 21 22 30 31 40 50 60 70',
    'THUYẾT MINH BÁO CÁO TÀI CHÍNH HỢP NHẤT\n1. Đặc điểm hoạt động',
    '12. TÀI SẢN CỐ ĐỊNH HỮU HÌNH\nNhà cửa vật kiến trúc Máy móc thiết bị Nguyên giá Khấu hao',
    '20. VAY VÀ NỢ THUÊ TÀI CHÍNH\nVay ngắn hạn',
    '25. VỐN CHỦ SỞ HỮU\na) Bảng đối chiếu biến động của vốn chủ sở hữu',
    '30. BÁO CÁO BỘ PHẬN\nDoanh thu thuần theo lĩnh vực kinh doanh',
    '',
  ];
  const r = classifyPages(pages);
  assert.deepEqual(r.types, ['OTHER', 'OTHER', 'BS', 'BS', 'IS', 'CF', 'CF', 'NOTES', 'NOTES', 'NOTES', 'NOTES', 'NOTES', 'UNKNOWN']);
  assert.deepEqual(r.notes.fixedAssets, [9]);
  assert.deepEqual(r.notes.debt, [10]);
  assert.deepEqual(r.notes.equity, [11]);
  assert.deepEqual(r.notes.segments, [12]);
  assert.equal(r.scanned, false);
  assert.equal(classifyPages(['', '', ' ']).scanned, true);
});

test('thuyết minh TSCĐ từ AI → dạng model (nguyên giá, hao mòn âm, tăng trong năm, khấu hao âm)', () => {
  const out = noteToModel('fixedAssets', { meta: { don_vi: 'triệu đồng' }, tangible: [
    { ten: 'Nhà cửa, vật kiến trúc', nhom: 'buildings', nguyen_gia_cuoi: '43.296', mua: '10', xdcb: '5', tang_khac: '-', hao_mon_cuoi: '(15.400)', khau_hao: '1.226' },
    { ten: 'Phương tiện vận tải', nhom: 'xe', nguyen_gia_cuoi: '100', hao_mon_cuoi: '(10)', khau_hao: '(2)' },
  ], intangible: [{ ten: 'Quyền sử dụng đất', nhom: 'land', nguyen_gia_cuoi: '58.926', hao_mon_cuoi: '-' }] });
  assert.deepEqual(out.tangible[0], { cls: 'buildings', name: 'Nhà cửa, vật kiến trúc', cost: 43296e6, accDep: -15400e6, additions: 15e6, depreciation: -1226e6 });
  assert.equal(out.tangible[1].cls, 'transport');              // "xe" không hợp lệ → đoán theo tên
  assert.deepEqual(out.intangible[0], { cls: 'land', name: 'Quyền sử dụng đất', cost: 58926e6, accDep: 0, additions: 0, depreciation: 0 });
});

test('thuyết minh mảng, vay, vốn chủ, tham số → dạng model', () => {
  const seg = noteToModel('segments', { meta: { don_vi: 'đồng' }, segments: [{ ten: 'Dược', doanh_thu: '3.000', loi_nhuan_gop: '600' }, { ten: 'Nhựa', doanh_thu: '2.000', gia_von: '(1.700)' }] });
  assert.deepEqual(seg, [{ name: 'Dược', revenue: 3000, gross: 600 }, { name: 'Nhựa', revenue: 2000, gross: 300 }]);
  const debt = noteToModel('debt', { meta: { don_vi: 'đồng' }, vay_ngan_han: { vay_trong_ky: '100', tra_trong_ky: '(80)' }, vay_dai_han: { vay_trong_ky: '', tra_trong_ky: '5' } });
  assert.deepEqual(debt, { stProceeds: 100, stRepay: 80, ltProceeds: 0, ltRepay: 5 });
  const eq = noteToModel('equity', { meta: { don_vi: 'đồng' }, esop: '20', co_tuc_tien: '(110)', lncpp_giam_khac: '7' });
  assert.equal(eq.capEsop, 20); assert.equal(eq.dividends, 110); assert.equal(eq.reOtherDec, 7); assert.equal(eq.capIssued, undefined);
  const par = noteToModel('params', { so_co_phieu_luu_hanh: '221.320.100', thue_suat_tndn: '20%' });
  assert.deepEqual(par, { shares: 221320100, taxRate: 0.2 });
});

test('ngày kết thúc ≤ 2025 nhưng AI ghi Thông tư 99 / mã giống mẫu mới → vẫn theo TT200 nhưng cảnh báo kiểm tra lại ngày kỳ', () => {
  const bs = { meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31', thong_tu: '99/2025/TT-BTC' },
    items: [{ c: '280', n: 'TỔNG CỘNG TÀI SẢN', v: '10', p: '8' }] };
  const r = statementToValues('BS', bs);
  assert.equal(r.regime, 'TT200');
  assert.match(r.warnings.join('\n'), /kiểm tra lại ngày kết thúc kỳ/);
  const plain = statementToValues('BS', { meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31' }, items: [{ c: '270', n: 'TỔNG CỘNG TÀI SẢN', v: '10', p: '8' }, { c: '421', n: 'LNST', v: '1', p: '1' }] });
  assert.doesNotMatch(plain.warnings.join('\n'), /ngày kết thúc kỳ/, 'BCTC 2025 bình thường không cảnh báo');
  const span = statementToValues('BS', { meta: { don_vi: 'VND', ngay_ket_thuc: '01/01/2025 - 31/03/2026' }, items: [{ c: '280', n: 'TỔNG', v: '1', p: '1' }] });
  assert.equal(span.regime, 'TT99', 'khoảng ngày: lấy năm của ngày cuối');
});

test('BCTC kỳ kết thúc năm 2025 trở về trước luôn đọc theo mẫu cũ TT200 (kể cả AI ghi nhầm thông tư) rồi quy đổi sang mẫu 2026', () => {
  const bs = { meta: { don_vi: 'VND', ngay_ket_thuc: '31/12/2025', thong_tu: '99/2025/TT-BTC' },
    items: [{ c: '110', n: 'Tiền', v: '10', p: '8' }, { c: '270', n: 'TỔNG CỘNG TÀI SẢN', v: '10', p: '8' }, { c: '421', n: 'LNST chưa phân phối', v: '3', p: '1' }] };
  const r = statementToValues('BS', bs);
  assert.equal(r.regime, 'TT200');
  assert.equal(r.cur['BS:280'], 10);
  assert.equal(r.cur['BS:420'], 3);
  const is = { meta: { don_vi: 'VND', ngay_ket_thuc: '2024-12-31' }, items: [{ c: '21', n: 'Doanh thu hoạt động tài chính', v: '5', p: '' }, { c: '22', n: 'Chi phí tài chính', v: '2', p: '' }] };
  const ri = statementToValues('IS', is);
  assert.equal(ri.regime, 'TT200');
  assert.deepEqual([ri.cur['IS:22'], ri.cur['IS:23']], [5, 2]);
  // Báo cáo 2026 theo mẫu mới giữ nguyên mã
  const bs26 = { meta: { don_vi: 'VND', ngay_ket_thuc: '30/06/2026' }, items: [{ c: '280', n: 'TỔNG CỘNG TÀI SẢN', v: '10', p: '8' }] };
  assert.equal(statementToValues('BS', bs26).regime, 'TT99');
});
