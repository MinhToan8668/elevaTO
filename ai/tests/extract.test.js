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
  // Sáu tháng kết thúc 30/06 là LŨY KẾ nửa năm, không phải riêng quý 2 — mã kỳ phải khác
  // mã của ba tháng cùng ngày đó, nếu không hai kỳ đè lên nhau khi nạp cả báo cáo quý và bán niên.
  assert.deepEqual(q.cur, { id: '6T-2026', year: 2026, months: 6, endMonth: 6 });
  assert.deepEqual(q.prevBS, { id: 'FY2025', year: 2025, months: 12, endMonth: 12 });
  assert.deepEqual(q.prevFlow, { id: '6T-2025', year: 2025, months: 6, endMonth: 6 });
  assert.equal(periodsFromMeta({ ngay_ket_thuc: '30/06/2026' }).cur.id, '6T-2026');
  // Ba tháng kết thúc 30/09 là riêng quý 3; chín tháng cùng ngày đó là lũy kế — hai mã khác nhau.
  assert.equal(periodsFromMeta({ ngay_ket_thuc: '30/09/2026', so_thang: 3 }).cur.id, 'Q3-2026');
  assert.equal(periodsFromMeta({ ngay_ket_thuc: '30/09/2026', so_thang: 9 }).cur.id, '9T-2026');
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
  assert.deepEqual(out.tangible[0], { cls: 'buildings', name: 'Nhà cửa, vật kiến trúc', cost: 43296e6, accDep: -15400e6, additions: 15e6, depreciation: -1226e6, disposals: 0 });
  assert.equal(out.tangible[1].cls, 'transport');              // "xe" không hợp lệ → đoán theo tên
  assert.deepEqual(out.intangible[0], { cls: 'land', name: 'Quyền sử dụng đất', cost: 58926e6, accDep: 0, additions: 0, depreciation: 0, disposals: 0 });
});

test('thuyết minh mảng, vay, vốn chủ, tham số → dạng model', () => {
  const seg = noteToModel('segments', { meta: { don_vi: 'đồng' }, segments: [{ ten: 'Dược', doanh_thu: '3.000', loi_nhuan_gop: '600' }, { ten: 'Nhựa', doanh_thu: '2.000', gia_von: '(1.700)' }] });
  assert.deepEqual(seg, [{ name: 'Dược', revenue: 3000, gross: 600 }, { name: 'Nhựa', revenue: 2000, gross: 300 }]);
  const debt = noteToModel('debt', { meta: { don_vi: 'đồng' }, vay_ngan_han: { vay_trong_ky: '100', tra_trong_ky: '(80)' }, vay_dai_han: { vay_trong_ky: '', tra_trong_ky: '5' } });
  assert.deepEqual(debt, { stProceeds: 100, stRepay: 80, ltProceeds: 0, ltRepay: 5 });
  // Có in số dư đầu / cuối năm thì giữ lại để đối chiếu với mã 321 / 339 (core/reconcile.js).
  const debt2 = noteToModel('debt', { meta: { don_vi: 'đồng' }, vay_ngan_han: { dau_nam: '50', vay_trong_ky: '100', tra_trong_ky: '(80)', cuoi_nam: '70' } });
  assert.equal(debt2.stOpen, 50); assert.equal(debt2.stClose, 70);
  assert.ok(!('ltOpen' in debt2), 'không in thì không mọc khoá rỗng');
  const eq = noteToModel('equity', { meta: { don_vi: 'đồng' }, nam_nay: [
    { ten: 'Tại ngày 01/01/2025', von_gop: '1.000', lncpp: '500' },
    { ten: '- Phát hành cổ phiếu cho người lao động (ESOP)', von_gop: '20' },
    { ten: '- Chia cổ tức bằng tiền', lncpp: '(110)' },
    { ten: '- Trích quỹ khen thưởng, phúc lợi', lncpp: '(7)' },
    { ten: 'Tại ngày 31/12/2025', von_gop: '1.020', lncpp: '383' },
  ] });
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

test('bộ phận: khối "Năm trước" của bảng vào trường prev (HAX trang 34)', () => {
  const seg = noteToModel('segments', { meta: { don_vi: 'VND' }, segments: [
    { ten: 'Kinh doanh Xe Ô tô', doanh_thu: '5.000', gia_von: '(4.400)', loi_nhuan_gop: '600',
      doanh_thu_truoc: '4.000', gia_von_truoc: '(3.500)', loi_nhuan_gop_truoc: '500' },
    { ten: 'Dịch vụ sửa chữa, bán phụ tùng và khác', doanh_thu: '1.000', gia_von_truoc: '(700)', doanh_thu_truoc: '900' },
  ] });
  assert.deepEqual(seg[0].prev, { name: 'Kinh doanh Xe Ô tô', revenue: 4000, gross: 500 });
  assert.deepEqual(seg[1].prev, { name: 'Dịch vụ sửa chữa, bán phụ tùng và khác', revenue: 900, gross: 200 });
  assert.equal(seg[1].gross, undefined, 'năm nay không in giá vốn lẫn lãi gộp thì để trống');
  const mot = noteToModel('segments', { meta: { don_vi: 'VND' }, segments: [{ ten: 'Một mảng', doanh_thu: '100', doanh_thu_truoc: '' }] });
  assert.equal('prev' in mot[0], false, 'bảng chỉ in một năm thì không có prev');
});

test('vốn chủ: ma trận hai năm của HAX (phụ lục 01) → đúng dòng model, cộng nhiều dòng vào một dòng', () => {
  // Số chép từ BCTC hợp nhất HAX 2025 đã kiểm toán, phụ lục số 01.
  const eq = noteToModel('equity', { meta: { don_vi: 'VND' },
    nam_truoc: [
      { ten: 'Tại ngày 01/01/2024', von_gop: '934.275.650.000', thang_du: '30.524.927.236', lncpp: '150.223.013.451', lickks: '48.980.301.766' },
      { ten: 'Tăng trong năm', von_gop: '140.121.160.000', lncpp: '124.973.224.111', lickks: '241.263.696.699' },
      { ten: '- Lãi trong năm', lncpp: '124.973.224.111', lickks: '78.596.451.809' },
      { ten: '- Cổ đông không kiểm soát tăng vốn góp tại công ty con', lickks: '134.500.222.500' },
      { ten: 'Ảnh hưởng từ việc thay đổi tỷ lệ lợi ích cổ đông không kiểm soát trong năm', lickks: '28.167.022.390' },
      { ten: '- Bổ sung từ chia cổ tức bằng cổ phiếu từ lợi nhuận sau thuế và từ thặng dư vốn cổ phần', von_gop: '140.121.160.000' },
      { ten: 'Giảm trong năm', thang_du: '(30.524.927.236)', lncpp: '(146.196.648.784)', lickks: '(2.900.846.105)' },
      { ten: '- Chia cổ tức bằng cổ phiếu từ lợi nhuận sau thuế và từ thặng dư vốn cổ phần', thang_du: '(30.524.927.236)', lncpp: '(109.596.232.764)' },
      { ten: 'Ảnh hưởng từ việc thay đổi tỷ lệ lợi ích cổ đông không kiểm soát trong năm', lncpp: '(8.551.944.893)' },
      { ten: '- Chia cổ tức bằng tiền', lncpp: '(28.028.269.500)', lickks: '(2.858.908.000)' },
      { ten: '- Trích quỹ khen thưởng, phúc lợi', lncpp: '(20.201.627)', lickks: '(41.938.105)' },
      { ten: 'Tại ngày 31/12/2024', von_gop: '1.074.396.810.000', lncpp: '128.999.588.778', lickks: '287.343.152.360' },
    ],
    nam_nay: [
      { ten: 'Tại ngày 01/01/2025', von_gop: '1.074.396.810.000', lncpp: '128.999.588.778', lickks: '287.343.152.360' },
      { ten: 'Tăng trong năm', lncpp: '6.171.109.675', lickks: '38.253.319.314' },
      { ten: '- Lãi trong năm', lncpp: '5.619.381.333', lickks: '33.464.389.461' },
      { ten: '- Hợp cộng tài sản thuần của công ty con từ việc công ty mẹ nắm quyền kiểm soát', lickks: '4.788.929.853' },
      { ten: '- Ảnh hưởng của sự thay đổi tỷ lệ lợi ích CĐKKS phát sinh trong năm', lncpp: '551.728.342' },
      { ten: 'Giảm trong năm', lncpp: '(109.957.743.795)', lickks: '(57.122.119.707)' },
      { ten: 'Ảnh hưởng từ việc thay đổi tỷ lệ lợi ích cổ đông không kiểm soát trong năm', lickks: '(971.728.342)' },
      { ten: 'Giá phí khoản đầu tư vào công ty con cấp 2 của cổ đông không kiểm soát', lickks: '(33.160.594.425)' },
      { ten: '- Chia cổ tức bằng tiền', lncpp: '(107.439.681.000)', lickks: '(22.952.299.000)' },
      { ten: '- Trích khen thưởng ban điều hành', lncpp: '(2.500.000.000)' },
      { ten: '- Trích quỹ khen thưởng, phúc lợi', lncpp: '(18.062.795)', lickks: '(37.497.940)' },
      { ten: 'Tại ngày 31/12/2025', von_gop: '1.074.396.810.000', lncpp: '25.212.954.658', lickks: '268.474.351.967' },
    ] });

  // Năm nay: cổ tức tiền đứng riêng, hai dòng trích quỹ gộp vào "LNCPP giảm khác".
  assert.equal(eq.dividends, 107439681000);
  assert.equal(eq.reOtherDec, 2500000000 + 18062795);
  assert.equal(eq.reOtherInc, 551728342);
  assert.equal(eq.capIssued, undefined, 'vốn góp không đổi trong năm');
  // LICĐKKS giữ dấu và cộng dồn: khớp đúng chênh lệch số dư trừ lãi của cổ đông không kiểm soát.
  assert.equal(eq.nciChange, 4788929853 - 971728342 - 33160594425 - 22952299000 - 37497940);
  assert.equal(eq.nciChange, 268474351967 - 287343152360 - 33464389461);

  // Năm trước: cổ tức bằng cổ phiếu ghi vào vốn góp, phần đối ứng vào thặng dư và LNCPP.
  const p = eq.prev;
  assert.equal(p.capStockDiv, 140121160000);
  assert.equal(p.premiumDec, 30524927236);
  assert.equal(p.reOtherDec, 109596232764 + 8551944893 + 20201627);
  assert.equal(p.dividends, 28028269500);
  assert.equal(p.nciChange, 134500222500 + 28167022390 - 2858908000 - 41938105);
  assert.equal(p.nciChange, 287343152360 - 48980301766 - 78596451809);
});

test('vốn chủ: bảng không tách chi tiết thì lấy dòng "Tăng/Giảm trong năm"', () => {
  const eq = noteToModel('equity', { meta: { don_vi: 'VND' }, nam_nay: [
    { ten: 'Số dư đầu năm', von_gop: '1.000' },
    { ten: 'Tăng trong năm', von_gop: '200' },
    { ten: 'Giảm trong năm', lncpp: '(50)' },
    { ten: 'Số dư cuối năm', von_gop: '1.200' },
  ] });
  assert.equal(eq.capIssued, 200);
  assert.equal(eq.reOtherDec, 50);
  const mot = noteToModel('equity', { meta: { don_vi: 'VND' }, nam_nay: [{ ten: '- Chia cổ tức bằng tiền', lncpp: '(100)' }] });
  assert.equal('prev' in mot, false, 'bảng chỉ in một năm thì không có prev');
});

test('bỏ cột / dòng tổng của bảng thuyết minh (Cộng, Tổng cộng, Loại trừ)', () => {
  const seg = noteToModel('segments', { meta: { don_vi: 'VND' }, segments: [
    { ten: 'Xe ô tô', doanh_thu: '5.000' }, { ten: 'Loại trừ nội bộ', doanh_thu: '(200)' },
    { ten: 'Cộng', doanh_thu: '4.800' },
  ] });
  assert.deepEqual(seg.map((s) => s.name), ['Xe ô tô']);
  const fa = noteToModel('fixedAssets', { meta: { don_vi: 'VND' }, tangible: [
    { ten: 'Nhà cửa, vật kiến trúc', nguyen_gia_cuoi: '100', hao_mon_cuoi: '20' },
    { ten: 'Tổng cộng', nguyen_gia_cuoi: '100', hao_mon_cuoi: '20' },
  ], intangible: [{ ten: 'Tổng', nguyen_gia_cuoi: '5', hao_mon_cuoi: '1' }] });
  assert.deepEqual(fa.tangible.map((x) => x.name), ['Nhà cửa, vật kiến trúc']);
  assert.deepEqual(fa.intangible, []);
  const giu = noteToModel('segments', { meta: { don_vi: 'VND' }, segments: [{ ten: 'Tổng hợp cơ khí', doanh_thu: '1' }] });
  assert.deepEqual(giu.map((s) => s.name), ['Tổng hợp cơ khí'], 'tên có chữ "Tổng" nhưng không phải dòng tổng thì giữ');
});

// ─── Số thật từ BCTC hợp nhất HAX 2025 đã kiểm toán ───

test('bộ phận: bảng hai năm của HAX (trang 34) — bỏ cột "Cộng", giữ cả năm trước', () => {
  const seg = noteToModel('segments', { meta: { don_vi: 'VND' }, segments: [
    { ten: 'Kinh doanh Xe Ô tô', doanh_thu: '4.114.081.231.685', gia_von: '3.857.001.390.036', loi_nhuan_gop: '257.079.841.649',
      doanh_thu_truoc: '4.945.304.179.048', gia_von_truoc: '4.555.729.599.839', loi_nhuan_gop_truoc: '389.574.579.209' },
    { ten: 'Kinh doanh dịch vụ sửa chữa, bán phụ tùng và khác', doanh_thu: '536.500.510.420', gia_von: '438.721.526.041', loi_nhuan_gop: '97.778.984.379',
      doanh_thu_truoc: '567.983.165.126', gia_von_truoc: '445.634.638.196', loi_nhuan_gop_truoc: '122.348.526.930' },
    { ten: 'Cộng', doanh_thu: '4.650.581.742.105', loi_nhuan_gop: '354.858.826.028', doanh_thu_truoc: '5.513.287.344.174' },
  ] });
  assert.equal(seg.length, 2);
  assert.equal(seg[0].revenue + seg[1].revenue, 4650581742105, 'tổng hai mảng đúng bằng dòng Cộng in trên bảng');
  assert.equal(seg[0].gross + seg[1].gross, 354858826028);
  assert.equal(seg[0].prev.revenue + seg[1].prev.revenue, 5513287344174);
  assert.equal(seg[0].prev.gross + seg[1].prev.gross, 511923106139);
});

test('TSCĐ: bảng của HAX (trang 25) — "Tăng trong năm" trong khối hao mòn là khấu hao năm', () => {
  const fa = noteToModel('fixedAssets', { meta: { don_vi: 'VND' }, tangible: [
    { ten: 'Nhà cửa, vật kiến trúc', nhom: 'buildings', nguyen_gia_dau: '243.439.059.314', mua: '54.223.073.451',
      giam_khac: '(24.696.189.929)', nguyen_gia_cuoi: '272.965.942.836',
      hao_mon_dau: '103.864.639.518', khau_hao: '24.028.873.361', hao_mon_cuoi: '126.528.547.095' },
    { ten: 'Tài sản khác', nhom: 'other', nguyen_gia_dau: '2.871.960.172', mua: '340.693.889',
      giam_khac: '(553.551.987)', nguyen_gia_cuoi: '2.659.102.074',
      hao_mon_dau: '2.318.335.678', khau_hao: '122.398.764', hao_mon_cuoi: '2.292.013.342' },
    { ten: 'Cộng', nguyen_gia_dau: '637.849.733.342', nguyen_gia_cuoi: '537.908.755.779', hao_mon_dau: '188.721.710.386', hao_mon_cuoi: '209.428.869.757' },
  ] });
  assert.equal(fa.tangible.length, 2, 'cột "Cộng" không phải một nhóm tài sản');
  const nha = fa.tangible[0];
  assert.equal(nha.cost, 272965942836);
  assert.equal(nha.accDep, -126528547095, 'hao mòn in dương trên bảng, vào model phải là số âm');
  assert.equal(nha.additions, 54223073451);
  assert.equal(nha.depreciation, -24028873361);
  assert.equal(nha.costOpen, 243439059314, 'giữ cột đầu năm để tách nhóm cho năm trước');
  assert.equal(nha.accDepOpen, -103864639518);
});

// ─── [v2026-10] Hiểu ngữ cảnh BCTC: quy ước dấu, thuật ngữ đồng nghĩa, mã in lệch mẫu ───

test('tên gọi khác mẫu nhưng cùng bản chất → đúng mã; viết tắt và "và/&" không làm lệch', () => {
  assert.equal(matchLabel('BS', 'Phải thu khách hàng'), '131');
  assert.equal(matchLabel('BS', 'Tài sản cố định hữu hình'), '221');          // danh mục ghi "TSCĐ hữu hình"
  assert.equal(matchLabel('BS', 'Tiền và các khoản tương đương tiền'), '110'); // danh mục ghi "Tiền & các khoản…"
  assert.equal(matchLabel('BS', 'Vay và nợ thuê tài chính ngắn hạn'), '321');
  assert.equal(matchLabel('IS', 'Giá vốn dịch vụ cung cấp'), '11');
  assert.equal(matchLabel('IS', '11. Lỗ khác'), '40');
  assert.equal(matchLabel('CF', 'Tiền thu từ đi vay'), '33');
  assert.equal(matchLabel('CF', '(Tăng) giảm hàng tồn kho'), '10');
  assert.equal(matchLabel('CF', 'Lợi nhuận đã trả cho chủ sở hữu'), '36');
  assert.equal(matchLabel('BS', '- Nguyên giá'), null, 'tên trùng nhiều dòng vẫn không đoán');
});

// Số thật của BCTC riêng THILOGI 31/12/2024 (kiểm toán EY): KQKD in chi phí trong ngoặc, bắt đầu từ mã 10;
// CĐKT in "Tài sản cố định vô hình" ở mã 221–223 và "hữu hình" ở 227–229 (ngược mẫu TT200).
test('THILOGI 2024: KQKD chi phí trong ngoặc → dương, thiếu 01 thì suy từ 10; 221/227 in ngược → xếp lại theo tên kèm nguyên giá/hao mòn', () => {
  const is = statementToValues('IS', { meta: { don_vi: 'VND', ngay_ket_thuc: '2024-12-31' }, items: [
    { c: '10', n: 'Doanh thu thuần về cung cấp dịch vụ', v: '1.927.538.418.715', p: '1.119.263.713.782' },
    { c: '11', n: 'Giá vốn dịch vụ cung cấp', v: '(1.862.374.210.744)', p: '(1.064.290.294.166)' },
    { c: '20', n: 'Lợi nhuận gộp về cung cấp dịch vụ', v: '65.164.207.971', p: '54.973.419.616' },
    { c: '21', n: 'Doanh thu hoạt động tài chính', v: '62.326.962.584', p: '103.924.509.710' },
    { c: '22', n: 'Chi phí tài chính', v: '(7.985.204.384)', p: '(11.272.369.675)' },
    { c: '23', n: '- Trong đó: Chi phí lãi vay', v: '(7.486.824.531)', p: '(11.204.472.442)' },
    { c: '25', n: 'Chi phí bán hàng', v: '(15.719.747.512)', p: '(10.348.371.195)' },
    { c: '26', n: 'Chi phí quản lý doanh nghiệp', v: '(14.927.708.995)', p: '(10.297.048.150)' },
    { c: '30', n: 'Lợi nhuận thuần từ hoạt động kinh doanh', v: '88.858.509.664', p: '126.980.140.306' },
    { c: '31', n: 'Thu nhập khác', v: '1.695.983.185', p: '312.028.769' },
    { c: '32', n: 'Chi phí khác', v: '(1.743.195.544)', p: '(362.627.329)' },
    { c: '40', n: 'Lỗ khác', v: '(47.212.359)', p: '(50.598.560)' },
    { c: '50', n: 'Tổng lợi nhuận kế toán trước thuế', v: '88.811.297.305', p: '126.929.541.746' },
    { c: '51', n: 'Chi phí thuế TNDN hiện hành', v: '(2.631.504.088)', p: '(1.732.530.242)' },
    { c: '60', n: 'Lợi nhuận sau thuế TNDN', v: '86.179.793.217', p: '125.197.011.504' },
  ] });
  assert.equal(is.regime, 'TT200');
  assert.equal(is.cur['IS:11'], 1862374210744, 'giá vốn về dương');
  assert.equal(is.cur['IS:24'], 7486824531, 'lãi vay 23 (TT200) → 24, dương');
  assert.equal(is.cur['IS:22'], 62326962584, 'doanh thu tài chính 21 → 22, giữ nguyên');
  assert.equal(is.cur['IS:51'], 2631504088, 'thuế hiện hành dương');
  assert.equal(is.cur['IS:40'], -47212359, 'lỗ khác vẫn âm (không phải chi phí)');
  assert.equal(is.cur['IS:01'], 1927538418715, 'không in 01 → lấy bằng 10');
  assert.equal(is.prev['IS:01'], 1119263713782);
  assert.deepEqual(validate(is.cur, { unit: 1 }), [], 'cộng dồn KQKD khớp hết');
  assert.match(is.warnings.join('\n'), /trong ngoặc/);
  assert.match(is.warnings.join('\n'), /không in dòng 01/);

  const bs = statementToValues('BS', { meta: { don_vi: 'VND', ngay_ket_thuc: '2024-12-31' }, items: [
    { c: '220', n: 'I. Tài sản cố định', v: '2.378.014.155', p: '229.948.331' },
    { c: '221', n: '1. Tài sản cố định vô hình', v: '2.229.532.496', p: '48.100.000' },
    { c: '222', n: 'Nguyên giá', v: '2.644.164.545', p: '48.100.000' },
    { c: '223', n: 'Khấu hao lũy kế', v: '(414.632.049)', p: '-' },
    { c: '227', n: '2. Tài sản cố định hữu hình', v: '148.481.659', p: '181.848.331' },
    { c: '228', n: 'Nguyên giá', v: '200.200.000', p: '200.200.000' },
    { c: '229', n: 'Giá trị hao mòn lũy kế', v: '(51.718.341)', p: '(18.351.669)' },
    { c: '270', n: 'TỔNG CỘNG TÀI SẢN', v: '1.696.188.119.064', p: '1.485.749.762.798' },
    { c: '110', n: 'I. Tiền', v: '1.878.256.654', p: '1.874.312.077' },
    { c: '111', n: '1. Tiền', v: '1.878.256.654', p: '1.874.312.077' },
    { c: '421', n: '2. Lợi nhuận sau thuế chưa phân phối', v: '34.960.260.251', p: '438.025.444' },
  ] });
  assert.equal(bs.cur['BS:221'], 148481659, 'hữu hình về đúng 221');
  assert.equal(bs.cur['BS:222'], 200200000); assert.equal(bs.cur['BS:223'], -51718341);
  assert.equal(bs.cur['BS:227'], 2229532496, 'vô hình về đúng 227');
  assert.equal(bs.cur['BS:228'], 2644164545); assert.equal(bs.cur['BS:229'], -414632049);
  assert.equal(bs.prev['BS:223'], -18351669); assert.equal(bs.prev['BS:229'], undefined);
  assert.equal(bs.cur['BS:110'], 1878256654, 'dòng tổng "I. Tiền" giữ mã 110, không bị xếp vào 111');
  assert.equal(bs.cur['BS:111'], 1878256654);
  assert.equal(bs.cur['BS:420'], 34960260251);
  assert.equal(bs.warnings.filter((w) => /không khớp mẫu/.test(w)).length, 6, 'báo rõ 6 dòng đã xếp lại theo tên');
  assert.deepEqual(validate(bs.cur, { unit: 1 }).filter((i) => i.key.startsWith('BS:22')), [], 'khối TSCĐ cộng dồn khớp');
});

test('báo cáo in mọi thứ dương (chi phí, dự phòng, tiền chi): máy tự nhận quy ước bằng cộng dồn', () => {
  const is = statementToValues('IS', { meta: { don_vi: 'triệu đồng', ngay_ket_thuc: '2025-12-31' }, items: [
    { c: '01', n: 'Doanh thu bán hàng và cung cấp dịch vụ', v: '2.100', p: '' }, { c: '02', n: 'Các khoản giảm trừ', v: '100', p: '' },
    { c: '10', n: 'Doanh thu thuần', v: '2.000', p: '' }, { c: '11', n: 'Giá vốn hàng bán', v: '1.900', p: '' },
    { c: '20', n: 'Lợi nhuận gộp', v: '100', p: '' }, { c: '50', n: 'Tổng lợi nhuận kế toán trước thuế', v: '93', p: '' },
    { c: '51', n: 'Chi phí thuế TNDN hiện hành', v: '(18)', p: '' }, { c: '60', n: 'Lợi nhuận sau thuế', v: '75', p: '' },
  ] });
  assert.equal(is.cur['IS:11'], 1900e6);
  assert.equal(is.cur['IS:51'], 18e6, 'thuế in ngược dấu với chi phí khác → đổi để 60 = 50 − 51');
  assert.match(is.warnings.join('\n'), /Thuế TNDN/);
  const bs = statementToValues('BS', { meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31' }, items: [
    { c: '140', n: 'IV. Hàng tồn kho', v: '100', p: '' }, { c: '141', n: '1. Hàng tồn kho', v: '110', p: '' },
    { c: '149', n: '2. Dự phòng giảm giá hàng tồn kho (*)', v: '10', p: '' }, { c: '270', n: 'TỔNG CỘNG TÀI SẢN', v: '100', p: '' },
  ] });
  assert.equal(bs.cur['BS:142'], -10); assert.match(bs.warnings.join('\n'), /Dự phòng/);
  const cf = statementToValues('CF', { meta: { don_vi: 'triệu đồng', ngay_ket_thuc: '2025-12-31' }, items: [
    { c: '21', n: 'Tiền chi mua sắm, xây dựng TSCĐ', v: '40', p: '' }, { c: '27', n: 'Thu lãi cho vay, cổ tức', v: '2', p: '' },
    { c: '30', n: 'Lưu chuyển tiền thuần từ HĐĐT', v: '(38)', p: '' },
    { c: '33', n: 'Tiền vay nhận được', v: '500', p: '' }, { c: '34', n: 'Tiền chi trả nợ gốc vay', v: '390', p: '' },
    { c: '36', n: 'Cổ tức đã trả', v: '10', p: '' }, { c: '40', n: 'Lưu chuyển tiền thuần từ HĐTC', v: '100', p: '' },
  ] });
  assert.deepEqual([cf.cur['CF:21'], cf.cur['CF:34'], cf.cur['CF:36'], cf.cur['CF:33']], [-40e6, -390e6, -10e6, 500e6]);
  assert.match(cf.warnings.join('\n'), /tiền chi mã 21/);
  assert.deepEqual(validate(cf.cur, { unit: 1e6 }), []);
});
