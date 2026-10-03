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

// Công cụ sửa 4 file: ai/js/config.js, links/js/backend.js và CSP của links/index.html + edit.html.
// Dựng đủ cả bốn trong cây tạm, mặc định lấy nội dung thật trong repo.
const REPO = new URL('../../', import.meta.url).pathname;
const doc = (d) => readFileSync(join(REPO, d), 'utf8');

function chay(diaChi, config, them = {}) {
  const thu = mkdtempSync(join(tmpdir(), 'cfgurl-'));
  mkdirSync(join(thu, 'ai/worker/tools'), { recursive: true });
  mkdirSync(join(thu, 'ai/js'), { recursive: true });
  mkdirSync(join(thu, 'links/js'), { recursive: true });
  cpSync(join(GOC, 'worker/tools/config-url.mjs'), join(thu, 'ai/worker/tools/config-url.mjs'));
  writeFileSync(join(thu, 'ai/js/config.js'), config ?? doc('ai/js/config.js'));
  writeFileSync(join(thu, 'links/js/backend.js'), them.backend ?? doc('links/js/backend.js'));
  writeFileSync(join(thu, 'links/index.html'), them.trang ?? doc('links/index.html'));
  writeFileSync(join(thu, 'links/edit.html'), them.sua ?? doc('links/edit.html'));
  writeFileSync(join(thu, 'index.html'), them.khoaHoc ?? doc('index.html'));
  const ra = execFileSync(process.execPath, [join(thu, 'ai/worker/tools/config-url.mjs'), diaChi], { encoding: 'utf8' });
  const lay = (d) => readFileSync(join(thu, d), 'utf8');
  return { ra: ra.trim(), config: lay('ai/js/config.js'), backend: lay('links/js/backend.js'),
    trang: lay('links/index.html'), sua: lay('links/edit.html'), khoaHoc: lay('index.html') };
}

test('lọc địa chỉ từ đúng khối chữ wrangler in ra khi triển khai', () => {
  const thuc = [
    'Total Upload: 42.12 KiB / gzip: 9.80 KiB',
    'Uploaded elevato (3.21 sec)',
    'Deployed elevato triggers (0.52 sec)',
    '  https://elevato.minhtoan.workers.dev',
    'Current Version ID: 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  ].join('\n');
  assert.equal(locDiaChi(thuc), 'https://elevato.minhtoan.workers.dev');
});

test('bỏ dấu / ở cuối — trang tự nối đường dẫn, hai dấu / liền nhau là gọi hỏng', () => {
  assert.equal(locDiaChi('https://elevato.minhtoan.workers.dev/'), 'https://elevato.minhtoan.workers.dev');
  assert.equal(locDiaChi('  https://may-chu.cua-toi.com//  '), 'https://may-chu.cua-toi.com');
});

test('không có địa chỉ https thì trả rỗng để chỗ gọi báo lỗi', () => {
  assert.equal(locDiaChi('Deployed nhưng không in địa chỉ'), '');
  assert.equal(locDiaChi(''), '');
  assert.equal(locDiaChi(undefined), '');
});

test('chỉ sửa đúng dòng API, giữ nguyên phần chú thích phía trên', () => {
  const r = chay('https://elevato.minhtoan.workers.dev');
  assert.match(r.ra, /^DOI https:\/\/elevato\.minhtoan\.workers\.dev$/);
  assert.match(r.config, /^export const API = 'https:\/\/elevato\.minhtoan\.workers\.dev';$/m);
  assert.equal(r.config.split('\n').length, doc('ai/js/config.js').split('\n').length);
  assert.match(r.config, /DÒNG DƯỚI DO MÁY ĐIỀN/, 'phần chú thích phải còn nguyên');
  assert.doesNotMatch(r.config, /script\.google\.com/);
});

test('địa chỉ đã đúng sẵn ở mọi file thì báo GIU để workflow khỏi commit thừa', () => {
  const dc = 'https://elevato.minhtoan.workers.dev';
  const r = chay(dc, `// chú thích\nexport const API = '${dc}';\n`, {
    backend: `export const BACKEND_URL = '${dc}';\n`,
    trang: `<meta content="connect-src 'self' ${dc}">\n`,
    sua: `<meta content="connect-src 'self' ${dc}">\n`,
    khoaHoc: `  var API = '${dc}';\n`,
  });
  assert.equal(r.ra, `GIU ${dc}`);
  assert.equal(r.config, `// chú thích\nexport const API = '${dc}';\n`);
});

// Trang link gọi Worker nên địa chỉ phải đổi đồng thời ở nơi gọi lẫn CSP — lệch một chỗ là trình
// duyệt chặn, trang lặng lẽ quay về bản dự phòng.
test('đổi địa chỉ: sửa luôn links/js/backend.js, index.html và connect-src trong CSP của hai trang', () => {
  const dc = 'https://elevato-ai-moi.minhtoan.workers.dev';
  const r = chay(dc);
  assert.equal(r.ra, `DOI ${dc}`);
  assert.match(r.backend, new RegExp(`^export const BACKEND_URL = '${dc}';$`, 'm'));
  for (const [ten, html] of [['index.html', r.trang], ['edit.html', r.sua]]) {
    const csp = /connect-src ([^;"]*)/.exec(html);
    assert.ok(csp, ten + ' mất khai báo connect-src');
    assert.ok(csp[1].includes(dc), ten + ' chưa cho gọi địa chỉ mới: ' + csp[1]);
    assert.ok(csp[1].includes('script.google.com'), ten + ' mất quyền gọi backend khoá học (số chỗ cohort)');
  }
  assert.ok(!r.trang.includes('elevato-ai.minhtoantowork.workers.dev'), 'còn sót địa chỉ cũ trong CSP');
});

test('CSP chưa nhắc tới địa chỉ cũ thì để yên, không chèn bừa', () => {
  const dc = 'https://elevato-ai-moi.minhtoan.workers.dev';
  const r = chay(dc, undefined, { trang: `<meta content="connect-src 'self'">\n` });
  assert.equal(r.trang, `<meta content="connect-src 'self'">\n`);
  assert.match(r.backend, new RegExp(dc));
});

test('config.js không còn dòng API như mong đợi thì dừng, không ghi bừa', () => {
  try {
    chay('https://x.workers.dev', 'export const API = "nhay kep khac";\n');
    assert.fail('phải thoát với mã lỗi');
  } catch (e) {
    assert.match(String(e.stderr), /không còn dòng/);
  }
});

// Bài canh cả repo: 4 chỗ khai địa chỉ máy chủ phải trùng khớp.
// Lần đổi tên Worker vừa rồi lệch đúng kiểu này — script có sửa cả 4 file nhưng workflow chỉ
// `git add` một file, nên 3 file kia âm thầm giữ địa chỉ cũ và trang link sẽ chết khi xoá Worker cũ.
test('mọi chỗ trỏ tới máy chủ đều cùng một địa chỉ', () => {
  const doc = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const API = /^export const API = '([^']+)';$/m.exec(doc('ai/js/config.js'));
  const LINKS = /^export const BACKEND_URL = '([^']+)';$/m.exec(doc('links/js/backend.js'));
  const KH = /^\s*var API = '([^']+)';/m.exec(doc('index.html'));
  assert.ok(API && LINKS && KH, 'thiếu dòng khai báo địa chỉ');
  assert.equal(LINKS[1], API[1], 'links/js/backend.js lệch với ai/js/config.js');
  assert.equal(KH[1], API[1], 'index.html (trang khoá học) lệch với ai/js/config.js');

  for (const f of ['links/index.html', 'links/edit.html']) {
    const dc = [...doc(f).matchAll(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/g)].map((m) => m[0]);
    assert.ok(dc.length, `${f}: CSP không khai địa chỉ máy chủ nào`);
    for (const x of new Set(dc)) assert.equal(x, API[1], `${f}: CSP còn địa chỉ cũ`);
  }
});

// Và workflow phải commit ĐỦ các file ấy, nếu không sửa xong cũng rơi mất.
test('workflow commit đủ mọi file config-url.mjs sửa tới', () => {
  const yml = readFileSync(new URL('../../.github/workflows/worker.yml', import.meta.url), 'utf8');
  const add = /^\s*git add (.+)$/m.exec(yml);        // dòng lệnh thật, không phải chữ trong chú thích
  assert.ok(add, 'workflow không có bước git add');
  for (const f of ['ai/js/config.js', 'links/js/backend.js', 'links/index.html', 'links/edit.html', 'index.html']) {
    assert.ok(add[1].includes(f), `workflow quên git add ${f}`);
  }
  assert.doesNotMatch(add[1], /^-A|\s-A(\s|$)/, 'git add -A sẽ commit nhầm database_id vào wrangler.toml');
});
