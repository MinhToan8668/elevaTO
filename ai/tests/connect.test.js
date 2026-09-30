import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialConnection, pickModel, API_RE } from '../js/ui/connect.js';

const A = 'https://script.google.com/macros/s/AKfycbOFFICIAL0123456789abcdef/exec';
const EVIL = 'https://script.google.com/macros/s/AKfycbATTACKER0123456789abcdef/exec';

test('link lạ (#api= máy chủ khác) KHÔNG lấy được mã đã lưu, không tự kết nối', () => {
  const r = initialConnection(`#api=${encodeURIComponent(EVIL)}`, { api: A, code: 'hv-secret' }, 'hv-secret');
  assert.equal(r.api, EVIL);
  assert.equal(r.code, '');
  assert.equal(r.auto, false);
  assert.equal(r.unknown, true);
});

test('link lạ kèm mã của kẻ gian: điền sẵn nhưng phải bấm tay, có cảnh báo', () => {
  const r = initialConnection(`#api=${encodeURIComponent(EVIL)}&code=hv-bait`, {}, '');
  assert.deepEqual([r.code, r.auto, r.unknown], ['hv-bait', false, true]);
});

test('link máy chủ chính thức hoặc đã từng kết nối → tự kết nối', () => {
  assert.equal(initialConnection(`#api=${encodeURIComponent(A)}&code=hv-1`, {}, '', A).auto, true);
  const r = initialConnection(`#api=${encodeURIComponent(A)}`, { api: A }, 'hv-sess');
  assert.deepEqual([r.code, r.auto], ['hv-sess', true]);
});

test('mở trang không có link: dùng máy chủ + mã đã lưu', () => {
  const r = initialConnection('', { api: A, code: 'hv-saved' }, '');
  assert.deepEqual([r.api, r.code, r.auto, r.fromHash], [A, 'hv-saved', true, false]);
  assert.equal(initialConnection('', {}, '').auto, false);
});

test('chỉ nhận link Apps Script /exec; model mặc định là flash mới nhất, không lite', () => {
  assert.ok(API_RE.test(A));
  for (const bad of ['https://evil.com/macros/s/AKfycbOFFICIAL0123456789abcdef/exec', 'http://script.google.com/macros/s/AKfycbOFFICIAL0123456789abcdef/exec', A + '?x=1']) assert.ok(!API_RE.test(bad), bad);
  assert.equal(pickModel([{ id: 'gemini-2.5-pro' }, { id: 'gemini-3.0-flash-lite' }, { id: 'gemini-3.0-flash' }, { id: 'gemini-3.1-flash-preview' }]), 'gemini-3.0-flash', 'bản chính thức trước bản preview');
  assert.equal(pickModel([{ id: 'gemini-2.5-flash' }, { id: 'gemini-3.0-flash' }, { id: 'gemini-3.0-flash-lite' }]), 'gemini-3.0-flash');
  assert.equal(pickModel([{ id: 'gemini-3.0-flash' }], 'gemini-3.0-flash'), 'gemini-3.0-flash');
});
