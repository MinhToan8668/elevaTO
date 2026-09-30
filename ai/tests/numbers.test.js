import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVN, unitScale } from '../js/core/numbers.js';

test('số kiểu Việt Nam: dấu chấm ngăn nghìn', () => {
  assert.equal(parseVN('1.234.567'), 1234567);
  assert.equal(parseVN('19.858.247.225.697'), 19858247225697);
});

test('ngoặc đơn là số âm, kể cả có khoảng trắng và dấu cách không ngắt', () => {
  assert.equal(parseVN('(5.740.487.316.484)'), -5740487316484);
  assert.equal(parseVN(' ( 1.234 ) '), -1234);
  assert.equal(parseVN('1 234 567'), 1234567);
  assert.equal(parseVN('-2.020.420.260'), -2020420260);
});

test('dấu phẩy ngăn nghìn kiểu Anh, và phần thập phân', () => {
  assert.equal(parseVN('1,234,567'), 1234567);
  assert.equal(parseVN('1,234,567.5'), 1234567.5);
  assert.equal(parseVN('1.234.567,5'), 1234567.5);
  assert.equal(parseVN('0,2'), 0.2);
  assert.equal(parseVN('12.5'), 12.5);
});

test('một nhóm 3 chữ số sau dấu chấm/phẩy là ngăn nghìn (BCTC in số nguyên)', () => {
  assert.equal(parseVN('1.234'), 1234);
  assert.equal(parseVN('1,234'), 1234);
});

test('ô trống, gạch ngang, chữ → null (không phải 0)', () => {
  for (const v of ['', '-', '—', '–', '  ', null, undefined, 'n/a', 'abc', '1.2.3x']) assert.equal(parseVN(v), null, String(v));
  assert.equal(parseVN('0'), 0);
});

test('số JS giữ nguyên, NaN/Infinity → null', () => {
  assert.equal(parseVN(42), 42);
  assert.equal(parseVN(-3.5), -3.5);
  assert.equal(parseVN(NaN), null);
  assert.equal(parseVN(Infinity), null);
});

test('đơn vị tính → hệ số nhân', () => {
  assert.equal(unitScale('VND'), 1);
  assert.equal(unitScale('Đơn vị tính: đồng'), 1);
  assert.equal(unitScale('Đơn vị: nghìn đồng'), 1e3);
  assert.equal(unitScale('ngàn VND'), 1e3);
  assert.equal(unitScale('Triệu đồng'), 1e6);
  assert.equal(unitScale('tỷ đồng'), 1e9);
  assert.equal(unitScale(''), null);
  assert.equal(unitScale(1e6), 1e6);
});
