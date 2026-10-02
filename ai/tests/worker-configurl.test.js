import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { locDiaChi } from '../worker/tools/config-url.mjs';

// Chạy thật tools/config-url.mjs trong bản sao của cây thư mục: nó sửa file thật nên phải chắc
// nó chỉ đụng đúng dòng API và nhận ra địa chỉ trong cả khối chữ wrangler in ra.
const GOC = new URL('../', import.meta.url).pathname;

function chay(diaChi, config) {
  const thu = mkdtempSync(join(tmpdir(), 'cfgurl-'));
  mkdirSync(join(thu, 'worker/tools'), { recursive: true });
  mkdirSync(join(thu, 'js'), { recursive: true });
  cpSync(join(GOC, 'worker/tools/config-url.mjs'), join(thu, 'worker/tools/config-url.mjs'));
  writeFileSync(join(thu, 'js/config.js'), config ?? readFileSync(join(GOC, 'js/config.js'), 'utf8'));
  const ra = execFileSync(process.execPath, [join(thu, 'worker/tools/config-url.mjs'), diaChi], { encoding: 'utf8' });
  return { ra: ra.trim(), config: readFileSync(join(thu, 'js/config.js'), 'utf8') };
}

test('lọc địa chỉ từ đúng khối chữ wrangler in ra khi triển khai', () => {
  const thuc = [
    'Total Upload: 42.12 KiB / gzip: 9.80 KiB',
    'Uploaded elevato-ai (3.21 sec)',
    'Deployed elevato-ai triggers (0.52 sec)',
    '  https://elevato-ai.minhtoan.workers.dev',
    'Current Version ID: 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  ].join('\n');
  assert.equal(locDiaChi(thuc), 'https://elevato-ai.minhtoan.workers.dev');
});

test('bỏ dấu / ở cuối — trang tự nối đường dẫn, hai dấu / liền nhau là gọi hỏng', () => {
  assert.equal(locDiaChi('https://elevato-ai.minhtoan.workers.dev/'), 'https://elevato-ai.minhtoan.workers.dev');
  assert.equal(locDiaChi('  https://may-chu.cua-toi.com//  '), 'https://may-chu.cua-toi.com');
});

test('không có địa chỉ https thì trả rỗng để chỗ gọi báo lỗi', () => {
  assert.equal(locDiaChi('Deployed nhưng không in địa chỉ'), '');
  assert.equal(locDiaChi(''), '');
  assert.equal(locDiaChi(undefined), '');
});

test('chỉ sửa đúng dòng API, giữ nguyên phần chú thích phía trên', () => {
  const r = chay('https://elevato-ai.minhtoan.workers.dev');
  assert.match(r.ra, /^DOI https:\/\/elevato-ai\.minhtoan\.workers\.dev$/);
  assert.match(r.config, /^export const API = 'https:\/\/elevato-ai\.minhtoan\.workers\.dev';$/m);
  assert.equal(r.config.split('\n').length, readFileSync(join(GOC, 'js/config.js'), 'utf8').split('\n').length);
  assert.match(r.config, /DÒNG DƯỚI DO MÁY ĐIỀN/, 'phần chú thích phải còn nguyên');
  assert.doesNotMatch(r.config, /script\.google\.com/);
});

test('địa chỉ đã đúng sẵn thì báo GIU để workflow khỏi commit thừa', () => {
  const dc = 'https://elevato-ai.minhtoan.workers.dev';
  const r = chay(dc, `// chú thích\nexport const API = '${dc}';\n`);
  assert.equal(r.ra, `GIU ${dc}`);
  assert.equal(r.config, `// chú thích\nexport const API = '${dc}';\n`);
});

test('config.js không còn dòng API như mong đợi thì dừng, không ghi bừa', () => {
  try {
    chay('https://x.workers.dev', 'export const API = "nhay kep khac";\n');
    assert.fail('phải thoát với mã lỗi');
  } catch (e) {
    assert.match(String(e.stderr), /không còn dòng/);
  }
});
