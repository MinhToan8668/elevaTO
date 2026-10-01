// Bộ tính sẵn giá trị công thức: chỉ nhận đúng tập cú pháp mình sinh ra, ngoài tập đó trả null
// để Excel tự tính — thà ô trống hơn ghi sai số vào file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalFormulas } from '../js/core/fcalc.js';

const tinh = (cells, names) => evalFormulas(new Map(Object.entries(cells)), { names: names || {} });

test('cộng trừ, nhân chia, ngoặc, ô trỏ ô', () => {
  const r = tinh({ C1: { v: 10 }, C2: { v: 4 }, C3: { f: 'C1+C2' }, C4: { f: 'C1-C2*2' }, C5: { f: '(C1+C2)/2' }, C6: { f: 'C3+C5' } });
  assert.equal(r.get('C3'), 14);
  assert.equal(r.get('C4'), 2);
  assert.equal(r.get('C5'), 7);
  assert.equal(r.get('C6'), 21, 'ô công thức trỏ ô công thức khác');
});

test('SUM theo dải (kể cả viết ngược) và ABS', () => {
  const r = tinh({ C1: { v: 1 }, C2: { v: 2 }, C3: { v: 3 },
    C4: { f: 'SUM(C1:C3)' }, C5: { f: 'ABS(0-C4)' }, C6: { f: 'SUM(C3:C1)' }, C7: { f: 'SUM(C1,C3)+SUM(C2:C3)' } });
  assert.equal(r.get('C4'), 6);
  assert.equal(r.get('C5'), 6);
  assert.equal(r.get('C6'), 6, 'Excel nhận dải viết ngược và cộng như thường');
  assert.equal(r.get('C7'), 9);
});

test('cú pháp Excel hiểu khác mình thì trả null thay vì đoán sai', () => {
  const c = { A1: { v: 5 }, A2: { v: 9 }, A3: { v: 7 } };
  const r = tinh({ ...c,
    B1: { f: 'MAX(A1:A3)' },        // Excel = 9; cộng dải lại ra 21
    B2: { f: 'MIN(A1,A9)' },        // Excel bỏ qua ô trống → 5; ở đây ô trống là 0
    B3: { f: 'ABS(A1,A2)' },        // Excel báo lỗi
    B4: { f: 'A1:A3*2' },           // Excel #VALUE!
    B5: { f: 'SUM()' },             // Excel báo lỗi
    B6: { f: 'ABS(A1:A3)' } });     // dải không phải tham số của SUM
  for (const k of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']) assert.equal(r.get(k), null, k);
});

test('dải quá dài không quét: trả null thay vì treo tab', () => {
  assert.equal(tinh({ C1: { v: 1 }, C2: { f: 'SUM(C1:C1048576)' } }).get('C2'), null);
});

test('tên đã định nghĩa (DonVi) để đổi đơn vị', () => {
  const r = tinh({ C1: { f: '60000000000/DonVi' } }, { DonVi: 1e6 });
  assert.equal(r.get('C1'), 60000);
});

test('ô trống tính như 0, giống Excel', () => {
  assert.equal(tinh({ C1: { f: 'C9+5' } }).get('C1'), 5);
});

test('chia cho 0 trả null: Excel ra #DIV/0! nên ghi sẵn số nào cũng là ghi sai', () => {
  assert.equal(tinh({ C1: { v: 5 }, C2: { v: 0 }, C3: { f: 'C1/C2' } }).get('C3'), null);
});

test('dòng tỷ lệ IFERROR(…,"") tính được; mẫu số 0 thì để trống cho Excel', () => {
  const r = tinh({ C1: { v: 200 }, C2: { v: 500 }, C3: { f: 'IFERROR(C1/C2,"")' }, D1: { v: 0 }, D2: { f: 'IFERROR(C1/D1,"")' } });
  assert.equal(r.get('C3'), 0.4);
  assert.equal(r.get('D2'), null);
});

test('ngoài tập cú pháp nhận thì trả null, không đoán', () => {
  const r = tinh({ C1: { v: 1 }, C2: { f: 'IF(C1=0,"",C1)' }, C3: { f: 'VLOOKUP(C1,A1:B9,2)' }, C4: { f: 'LaiSuat*C1' } });
  assert.equal(r.get('C2'), null, 'IF có so sánh — chưa nhận');
  assert.equal(r.get('C3'), null, 'hàm chưa nhận');
  assert.equal(r.get('C4'), null, 'tên chưa định nghĩa');
});

test('công thức vòng trả null chứ không treo', () => {
  const r = tinh({ C1: { f: 'C2+1' }, C2: { f: 'C1+1' }, C3: { f: 'C3' } });
  assert.equal(r.get('C1'), null);
  assert.equal(r.get('C3'), null);
});

test('dải khác cột không nhận — mình chỉ sinh dải trong cùng một cột', () => {
  assert.equal(tinh({ C1: { v: 1 }, D1: { v: 2 }, C2: { f: 'SUM(C1:D1)' } }).get('C2'), null);
});
