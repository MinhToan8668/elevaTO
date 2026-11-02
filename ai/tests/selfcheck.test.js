// Tự kiểm chứng số trích được bằng công thức của mẫu biểu — số thật của KQKD VNM 2025 (báo cáo riêng, đồng).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementToValues } from '../js/core/extract.js';
import { reconcileByFormula, validate } from '../js/core/statements.js';

const it = (c, n, v, p) => ({ c, n, v, p });
// Như AI trả về cho trang KQKD có in kèm phần cuối LCTT: chi phí in số dương trơn, riêng "Lợi ích thuế TNDN
// hoãn lại" in trong ngoặc; ba dòng cuối là của LCTT (mã 40 / 50 / 60 trùng mã KQKD).
const VNM = {
  meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31', so_thang: 12, thong_tu: '200' },
  items: [
    it('10', 'Doanh thu thuần về bán hàng và cung cấp dịch vụ', '60.000.000.000.000', '58.000.000.000.000'),
    it('11', 'Giá vốn hàng bán', '36.438.639.852.083', '34.982.634.142.496'),
    it('20', 'Lợi nhuận gộp về bán hàng và cung cấp dịch vụ', '23.561.360.147.917', '23.017.365.857.504'),
    it('21', 'Doanh thu hoạt động tài chính', '1.632.198.937.753', '1.846.711.116.527'),
    it('22', 'Chi phí tài chính', '433.708.788.247', '560.095.970.564'),
    it('23', 'Trong đó: Chi phí lãi vay', '289.972.001.368', '227.618.556.891'),
    it('25', 'Chi phí bán hàng', '12.227.930.844.901', '12.046.762.642.558'),
    it('26', 'Chi phí quản lý doanh nghiệp', '1.155.129.339.145', '1.102.644.072.931'),
    it('30', 'Lợi nhuận thuần từ hoạt động kinh doanh', '11.376.790.113.377', '11.154.574.287.978'),
    it('31', 'Thu nhập khác', '116.653.846.969', '110.508.071.750'),
    it('32', 'Chi phí khác', '26.649.261.729', '21.592.652.515'),
    it('40', 'Kết quả từ hoạt động khác', '90.004.585.240', '88.915.419.235'),
    it('50', 'Lợi nhuận kế toán trước thuế', '11.466.794.698.617', '11.243.489.707.213'),
    it('51', 'Chi phí thuế TNDN hiện hành', '2.128.415.483.304', '2.058.534.807.543'),
    it('52', 'Lợi ích thuế TNDN hoãn lại', '(20.970.420.316)', '(77.458.923.279)'),
    it('60', 'Lợi nhuận sau thuế TNDN', '9.359.349.635.629', '9.262.413.822.949'),
    it('40', 'Lưu chuyển tiền thuần từ hoạt động tài chính', '(10.660.261.630.750)', '(7.319.608.463.250)'),
    it('50', 'Lưu chuyển tiền thuần trong năm', '(360.897.589.710)', '293.368.915.133'),
    it('60', 'Tiền và các khoản tương đương tiền đầu năm', '1.408.567.701.321', '1.114.767.562.295'),
  ],
};

test('VNM 2025: bỏ dòng LCTT lẫn vào KQKD, tự sửa dấu "lợi ích thuế hoãn lại" theo 60 = 50 − 51 − 52; số khớp bản in', () => {
  const r = statementToValues('IS', VNM);
  for (const side of ['cur', 'prev']) {
    const v = r[side];
    assert.equal(v['IS:40'], side === 'cur' ? 90004585240 : 88915419235, `${side}: 40 là lợi nhuận khác, không phải LCTT`);
    assert.equal(v['IS:50'], side === 'cur' ? 11466794698617 : 11243489707213);
    assert.equal(v['IS:60'], side === 'cur' ? 9359349635629 : 9262413822949);
    assert.ok(v['IS:52'] < 0, `${side}: lợi ích thuế hoãn lại là số âm (giảm chi phí thuế)`);
    assert.deepEqual(validate(v).filter((x) => x.key.startsWith('IS:')), [], `${side}: mọi dòng tổng KQKD khớp`);
  }
  const w = r.warnings.join('\n');
  assert.match(w, /Bỏ các dòng thuộc bảng khác/);
  assert.match(w, /Tự kiểm chứng theo công thức: dòng 60/);
});

test('tự kiểm chứng: chỉ sửa khi có đúng một cách đổi dấu khớp; thiếu dòng tổng con thì không đoán', () => {
  const T = 1e9;          // số tỷ đồng — lệch dưới 1.000 đồng coi là làm tròn, không sửa
  // 40 = 31 − 32 mà 32 bị đọc âm → đổi dấu 32
  const a = reconcileByFormula({ 'IS:31': 100 * T, 'IS:32': -30 * T, 'IS:40': 70 * T }, [], { unit: 1 });
  assert.equal(a['IS:32'], 30 * T);
  // Hai cách cùng khớp (31 = 32) → không đủ căn cứ, để nguyên
  const b = reconcileByFormula({ 'IS:31': 50 * T, 'IS:32': -50 * T, 'IS:40': 0 }, [], { unit: 1 });
  assert.equal(b['IS:32'], -50 * T);
  // Khớp sẵn → không đụng
  const c = { 'IS:31': 100 * T, 'IS:32': 30 * T, 'IS:40': 70 * T };
  assert.deepEqual(reconcileByFormula(c, [], { unit: 1 }), c);
  // 30 thiếu hẳn dòng 20 (không in, không cộng được) → không thử đổi dấu các dòng 22–26
  const d = { 'IS:22': 5 * T, 'IS:23': 3 * T, 'IS:25': 4 * T, 'IS:26': 2 * T, 'IS:30': 100 * T };
  assert.deepEqual(reconcileByFormula(d, [], { unit: 1 }), d);
  // LCTT: 50 = 20 + 30 + 40, dòng 40 đọc thiếu dấu âm → sửa
  const e = reconcileByFormula({ 'CF:20': 7690 * T, 'CF:30': 2608 * T, 'CF:40': 10660 * T, 'CF:50': -362 * T }, [], { unit: 1 });
  assert.equal(e['CF:40'], -10660 * T);
});
