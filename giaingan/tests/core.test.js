import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp } from './load.js';
const FAKE = JSON.parse(readFileSync(new URL('./bang_key_gia_lap.json', import.meta.url), 'utf8'));

test('file công cụ KHÔNG chứa bảng key (repo công khai)', () => {
  const html = readFileSync(new URL('../tienich/index.html', import.meta.url), 'utf8');
  assert.ok(!/"dig"\s*:\s*\{/.test(html) && !/const T=\{/.test(html));
});

test('đọc số tiền bằng chữ đúng quy tắc DocSoTien', () => {
  const { api } = loadApp();
  const cases = {
    0: 'Không đồng', 15: 'Mười lăm đồng', 21: 'Hai mươi mốt đồng', 24: 'Hai mươi tư đồng', 101: 'Một trăm linh một đồng',
    205: 'Hai trăm linh năm đồng', 1000005: 'Một triệu không trăm linh năm đồng', 1050000: 'Một triệu không trăm năm mươi nghìn đồng',
    2000000000: 'Hai tỷ đồng', 2027125382: 'Hai tỷ không trăm hai mươi bảy triệu một trăm hai mươi lăm nghìn ba trăm tám mươi hai đồng',
  };
  for (const [n, w] of Object.entries(cases)) assert.equal(api.docTien(Number(n)), w, n);
});

test('nhận số dán từ máy dùng dấu chấm hoặc dấu phẩy', () => {
  const { api } = loadApp();
  for (const s of ['2.027.125.382', '2,027,125,382', '2027125382', ' 2 027 125 382 ']) assert.equal(api.parseAmt(s), 2027125382, s);
  assert.equal(api.parseAmt('2.027.125.382,75'), 2027125382.75);
  assert.equal(api.parseAmt('2,027,125,382.75'), 2027125382.75);
  assert.equal(api.parseAmt('abc'), null);
  api.setNF('vn'); assert.equal(api.fmt(1234567), '1.234.567');
  api.setNF('us'); assert.equal(api.fmt(1234567), '1,234,567');
  api.setNF('raw'); assert.equal(api.fmt(1234567.6), '1234568');
});

test('TestKey = mã CN + key ngày + key tháng + key loại tiền + tổng key 12 chữ số', () => {
  const { api, el } = loadApp(FAKE);
  el('cn').value = '123'; el('ngay').value = '2026-10-15'; el('lt').value = 'VND'; el('tien').value = '2.027.125.382';
  api.calc();
  const digits = '002027125382'; let s = 0;
  for (let i = 0; i < 12; i++) s += FAKE.dig['ABCDEFGHIKMN'[i] + digits[i]] || 0;
  assert.equal(Number(el('tk').textContent), 123 + FAKE.day['15'] + FAKE.mon['10'] + FAKE.cur.VND + s);
});

test('chưa nạp bảng key thì không ra TestKey', () => {
  const { api, el } = loadApp(null);
  el('cn').value = '123'; el('ngay').value = '2026-10-15'; el('tien').value = '1000'; api.calc();
  assert.equal(el('tk').textContent, '–');
  assert.match(el('tkNote').textContent, /Chưa nạp bảng key/);
});

test('ngày đáo hạn, thứ, ngày nghỉ lễ Tết', () => {
  const { api, el } = loadApp();
  api.applyHol();
  el('ngay').value = '2026-10-15'; el('songay').value = '137'; api.fromDays();
  assert.equal(el('dh').value, '2027-03-01'); assert.match(el('dhTxt').textContent, /^Thứ Hai, 01\/03\/2027/);
  el('ngay').value = '2026-09-21'; el('songay').value = '137'; api.fromDays();       // 05/02/2027 rơi vào Tết
  assert.match(el('dhNote').textContent, /ngày nghỉ \(Tết Nguyên đán/);
  assert.equal(api.iso(api.lamViec(api.pd('2027-02-05'), 1)), '2027-02-11');
  assert.equal(api.iso(api.lamViec(api.pd('2027-02-05'), -1)), '2027-02-03');
  assert.equal(api.iso(api.ngayTraLaiDau(api.pd('2026-10-15'), 25)), '2026-10-25');
  assert.equal(api.iso(api.ngayTraLaiDau(api.pd('2026-10-26'), 25)), '2026-11-25');
});
