import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../lib/giaingan.js';
import { loadApp } from './load.js';
const FAKE = JSON.parse(readFileSync(new URL('./bang_key_gia_lap.json', import.meta.url), 'utf8'));

test('lib: TestKey khớp với tiện ích HTML trên nhiều ngày / số tiền', () => {
  const { api, el } = loadApp(FAKE);
  for (const [ngay, tien, lt] of [['2026-10-15', 2027125382, 'VND'], ['2027-02-28', 999999999999, 'USD'], ['2026-01-01', 5, 'EUR'], ['2026-12-31', 35000000000.5, 'JPY']]) {
    el('cn').value = '123'; el('ngay').value = ngay; el('lt').value = lt; el('tien').value = String(tien); api.calc();
    const r = G.tinhTestKey({ maCN: '123', ngay, soTien: tien, loaiTien: lt }, FAKE);
    assert.equal(r.testKey, Number(el('tk').textContent), `${ngay} ${tien}`);
    assert.equal(r.ghi, `123/${r.testKey}`); assert.equal(r.chiTiet.length, 16);
  }
});
test('lib: báo lỗi rõ khi thiếu bảng key / số liệu sai', () => {
  assert.throws(() => G.tinhTestKey({ maCN: 1, ngay: '2026-01-01', soTien: 1 }, null), /Bảng key/);
  assert.throws(() => G.tinhTestKey({ maCN: 1, ngay: '2026-01-01', soTien: 'abc' }, FAKE), /Số tiền/);
  assert.throws(() => G.tinhTestKey({ maCN: 1, ngay: '2026-01-01', soTien: 1e12 }, FAKE), /12 chữ số/);
});
test('lib: đọc số, nhận số, định dạng', () => {
  assert.equal(G.docTien(2027125382), 'Hai tỷ không trăm hai mươi bảy triệu một trăm hai mươi lăm nghìn ba trăm tám mươi hai đồng');
  assert.equal(G.docTien(205), 'Hai trăm linh năm đồng');
  assert.equal(G.parseAmt('2,027,125,382.75'), 2027125382.75);
  assert.equal(G.fmt(1234567, 'us'), '1,234,567');
});
test('lib: đáo hạn rơi vào Tết → gợi ý ngày làm việc', () => {
  const nghi = G.docNgayNghi('04/02/2027 → 10/02/2027 Tết');
  const r = G.daoHan('2026-09-21', 137, nghi);
  assert.equal(G.iso(r.ngay), '2027-02-05'); assert.equal(r.nghi, 'Tết');
  assert.equal(G.iso(r.truoc.ngay), '2027-02-03'); assert.equal(G.iso(r.sau.ngay), '2027-02-11');
  assert.equal(G.daoHan('2026-10-15', 137).thu, 'Thứ Hai');
  assert.equal(G.iso(G.ngayTraLaiDau('2026-10-25', 25)), '2026-11-25');
  assert.equal(Math.round(G.laiDuKien(2027125382, 8.4, 137)), 63912764);
});
