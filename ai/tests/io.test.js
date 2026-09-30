// Chọn cách gửi trang cho AI: PDF con (bản có chữ) hay ảnh JPEG (bản scan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cachGui, CO_ANH } from '../js/ui/io.js';

test('PDF có chữ: gửi PDF con — AI đọc chữ gốc, chính xác nhất và nhẹ nhất', () => {
  assert.equal(cachGui({ coPdf: true, scanned: false, cỡPdf: 2e6 }), 'pdf');
});

test('PDF scan: gửi ẢNH, không gửi PDF — Gemini đọc ảnh trang scan đáng tin hơn hẳn', () => {
  assert.equal(cachGui({ coPdf: true, scanned: true, cỡPdf: 2e6 }), 'anh');
});

test('PDF con quá nặng (scan độ phân giải cao) → vẫn phải chuyển sang ảnh', () => {
  assert.equal(cachGui({ coPdf: true, scanned: false, cỡPdf: 40e6 }), 'anh');
});

test('ảnh chụp từ điện thoại: vốn đã là ảnh', () => {
  assert.equal(cachGui({ coPdf: false, scanned: true, cỡPdf: 0 }), 'anh');
});

test('ảnh gửi AI phải đủ nét để đọc bảng số: cạnh dài tối thiểu 1600px', () => {
  assert.ok(CO_ANH.width >= 1600, `đang để ${CO_ANH.width}px`);
  assert.ok(CO_ANH.quality >= 0.75, `đang để chất lượng ${CO_ANH.quality}`);
});
