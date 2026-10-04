import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePages, pagesText, fmt, safeName } from '../js/ui/dom.js';

test('ô nhập số trang: "3, 5-7, 12" → danh sách trong giới hạn file', () => {
  assert.deepEqual(parsePages('3, 5-7, 12', 10), [3, 5, 6, 7]);
  assert.deepEqual(parsePages('7–5;2 2', 10), [2, 5, 6, 7]);
  assert.deepEqual(parsePages('abc, 0, -1', 10), []);
});

test('hiển thị số trang gọn', () => {
  assert.equal(pagesText([3, 5, 6, 7, 12]), '3, 5–7, 12');
  assert.equal(pagesText([]), '');
});

test('số theo đơn vị hiển thị, số âm trong ngoặc như BCTC', () => {
  assert.equal(fmt(1234567890, 1), '1.234.567.890');
  assert.equal(fmt(-1234567890, 1e6), '(1.234,6)');
  assert.equal(fmt(undefined), '');
  assert.equal(fmt(-1, 1e9), '0');
});

test('tên file an toàn', () => {
  assert.equal(safeName('CTCP A/B: "Q2"'), 'CTCP A B Q2');
  assert.equal(safeName(''), 'elevaTO');
});

