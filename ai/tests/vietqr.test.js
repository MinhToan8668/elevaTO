// Nội dung mã QR chuyển khoản VietQR: sai một ký tự là app ngân hàng không quét được,
// nên khoá lại cấu trúc trường và mã kiểm tra CRC.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vietQrPayload, crc16, khongDau } from '../js/core/vietqr.js';

/** Tách chuỗi EMVCo thành { mã: nội dung } để kiểm từng trường. */
function tach(s) {
  const out = {};
  for (let i = 0; i < s.length;) {
    const ma = s.slice(i, i + 2), n = Number(s.slice(i + 2, i + 4));
    out[ma] = s.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return out;
}

test('CRC-16/CCITT-FALSE khớp bộ thử chuẩn', () => {
  assert.equal(crc16('123456789'), '29B1');
  assert.equal(crc16('A'), 'B915');
  assert.equal(crc16(''), 'FFFF');
});

test('bỏ dấu tiếng Việt, bỏ ký tự ngoài ASCII in được', () => {
  assert.equal(khongDau('Nguyễn Hoàng Triều'), 'Nguyen Hoang Trieu');
  assert.equal(khongDau('Đỗ Ưng'), 'Do Ung');
  assert.equal(khongDau('ủng hộ — elevaTO'), 'ung ho  elevaTO');
  assert.equal(khongDau('abc\u0000\u001f'), 'abc');
});

test('QR dùng nhiều lần: không có số tiền, mã khởi tạo 11', () => {
  const s = vietQrPayload({ bin: '970436', stk: '1234567890' });
  const f = tach(s);
  assert.equal(f['00'], '01', 'phiên bản EMVCo');
  assert.equal(f['01'], '11', 'QR dùng nhiều lần');
  assert.equal(f['53'], '704', 'VND');
  assert.equal(f['58'], 'VN');
  assert.equal(f['54'], undefined, 'không ghi số tiền');
  const dv = tach(f['38']);
  assert.equal(dv['00'], 'A000000727', 'GUID của NAPAS');
  assert.equal(dv['02'], 'QRIBFTTA', 'chuyển tới số tài khoản');
  assert.deepEqual(tach(dv['01']), { '00': '970436', '01': '1234567890' });
});

test('có số tiền thì mã khởi tạo là 12 và có trường 54', () => {
  const f = tach(vietQrPayload({ bin: '970422', stk: '0376292148', soTien: 50000 }));
  assert.equal(f['01'], '12');
  assert.equal(f['54'], '50000');
});

test('lời nhắn nằm trong trường 62/08, đã bỏ dấu', () => {
  const f = tach(vietQrPayload({ bin: '970436', stk: '1234567890', loiNhan: 'Ủng hộ elevaTO' }));
  assert.deepEqual(tach(f['62']), { '08': 'Ung ho elevaTO' });
});

test('CRC nằm ở cuối, tính trên cả "6304" phía trước', () => {
  const s = vietQrPayload({ bin: '970436', stk: '1234567890' });
  assert.match(s.slice(-8, -4), /^6304$/);
  assert.equal(s.slice(-4), crc16(s.slice(0, -4)));
  assert.match(s.slice(-4), /^[0-9A-F]{4}$/);
});

test('thiếu / sai BIN hoặc số tài khoản thì trả rỗng, không dựng QR sai', () => {
  assert.equal(vietQrPayload({ bin: '97043', stk: '1012345678' }), '', 'BIN phải đủ 6 chữ số');
  assert.equal(vietQrPayload({ bin: '970436', stk: '123' }), '', 'số tài khoản ngắn hơn 6');
  assert.equal(vietQrPayload({ bin: '970436', stk: '1'.repeat(20) }), '', 'số tài khoản dài hơn 19');
  assert.equal(vietQrPayload({ bin: '970436' }), '');
  assert.equal(vietQrPayload({}), '');
  assert.equal(vietQrPayload(), '');
});

test('độ dài ghi trong mã luôn khớp nội dung, kể cả lời nhắn dài', () => {
  // Lời nhắn nằm trong trường 62 bọc trường 08: cắt sai chỗ là độ dài khai báo lệch nội dung,
  // CRC vẫn hợp lệ nên app ngân hàng đọc ra sai mà không báo gì.
  for (const n of [1, 60, 94, 95, 96, 120, 300]) {
    const s = vietQrPayload({ bin: '970436', stk: '1012345678', loiNhan: 'y'.repeat(n) });
    assert.ok(s, `lời nhắn ${n} ký tự`);
    const f = tach(s);
    assert.equal(f['62'].length, Number(/^..(\d\d)/.exec(s.slice(s.indexOf('62', 0)))?.[1] ?? f['62'].length), 'độ dài trường 62');
    const g = tach(f['62']);
    assert.equal(g['08'].length, Number(f['62'].slice(2, 4)), `trường 08 khai ${f['62'].slice(2, 4)} nhưng dài ${g['08'].length}`);
    assert.ok(g['08'].length <= 95);
  }
});

test('số tiền vô lý bị bỏ qua chứ không ghi vào QR', () => {
  for (const v of [0, -5, NaN, Infinity, 'nhiều']) {
    assert.equal(tach(vietQrPayload({ bin: '970436', stk: '123', soTien: v }))['54'], undefined, String(v));
  }
});
