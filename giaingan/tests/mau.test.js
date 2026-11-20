// File Excel mẫu trong repo công khai: chỉ được chứa dữ liệu giả.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
function unzipText(buf) {            // đọc mọi phần .xml trong file xlsx (zip) — không cần thư viện
  const out = []; let i = 0;
  while ((i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), i)) >= 0) {
    const m = buf.readUInt16LE(i + 8), cs = buf.readUInt32LE(i + 18), n = buf.readUInt16LE(i + 26), x = buf.readUInt16LE(i + 28);
    const name = buf.toString('utf8', i + 30, i + 30 + n), s = i + 30 + n + x, data = buf.subarray(s, s + cs);
    if (name.endsWith('.xml')) out.push(m === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8'));
    i = s + cs;
  }
  return out.join('\n');
}
test('file Excel mẫu không có VBA và không còn dấu vết dữ liệu khách hàng thật', () => {
  const buf = readFileSync(new URL('../excel/QUAN_LY_GIAI_NGAN_MAU.xlsx', import.meta.url));
  const xml = unzipText(buf);
  assert.ok(xml.length > 100000, 'đọc được nội dung');
  assert.ok(!buf.includes(Buffer.from('vbaProject')), 'không kèm vbaProject.bin');
  for (const bad of [/Kim T[ií]n/i, /KTLA/, /T[âa]y Ninh/, /05015588/, /1050807|1048227|9330780|1033732|1048233/, /hcm-filesrv|vib\.corp/i, /toan\.huynh/i])
    assert.ok(!bad.test(xml), `còn ${bad}`);
});
