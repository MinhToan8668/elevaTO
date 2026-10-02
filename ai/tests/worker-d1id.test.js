import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Chạy thật tools/d1-id.mjs trong một bản sao của worker/, với fetch bị thay bằng bản giả.
// Script này quyết định có tạo cơ sở dữ liệu mới hay không nên phải chắc: chạy lại không đẻ thêm DB.
const GOC = new URL('../worker/', import.meta.url).pathname;
const ID = '11111111-2222-3333-4444-555555555555';

function chay(toml, { danhSach = [], env = {} } = {}) {
  const thu = mkdtempSync(join(tmpdir(), 'd1id-'));
  cpSync(join(GOC, 'wrangler.toml'), join(thu, 'wrangler.toml'));
  cpSync(join(GOC, 'tools'), join(thu, 'tools'), { recursive: true });
  if (toml) writeFileSync(join(thu, 'wrangler.toml'), toml);

  // Bản fetch giả: ghi lại mọi lần gọi vào một file để bài kiểm tra đọc lại.
  const nhatKy = join(thu, 'goi.json');
  const mo = `
    import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url, init = {}) => {
      appendFileSync(${JSON.stringify(nhatKy)}, JSON.stringify({ url: String(url), method: init.method || 'GET' }) + '\\n');
      if (String(url).includes('?name=')) return new Response(JSON.stringify({ success: true, result: ${JSON.stringify(danhSach)} }));
      return new Response(JSON.stringify({ success: true, result: { uuid: ${JSON.stringify(ID)}, name: 'elevato' } }));
    };
    await import(${JSON.stringify(join(thu, 'tools/d1-id.mjs'))});
  `;
  writeFileSync(join(thu, 'mo.mjs'), mo);
  const ra = execFileSync(process.execPath, [join(thu, 'mo.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_API_TOKEN: 'tok', ...env },
  });
  let goi = [];
  try { goi = readFileSync(nhatKy, 'utf8').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x)); } catch { /* không gọi lần nào */ }
  return { ra, goi, toml: readFileSync(join(thu, 'wrangler.toml'), 'utf8') };
}

test('chưa có cơ sở dữ liệu thì tạo mới rồi điền id vào wrangler.toml', () => {
  const r = chay(null);
  assert.equal(r.goi.length, 2);
  assert.equal(r.goi[1].method, 'POST');
  assert.match(r.toml, new RegExp(`database_id = "${ID}"`));
  assert.match(r.ra, /Vừa tạo/);
});

test('đã có cơ sở dữ liệu cùng tên thì dùng lại, KHÔNG tạo thêm', () => {
  const r = chay(null, { danhSach: [{ uuid: ID, name: 'elevato' }] });
  assert.deepEqual(r.goi.map((x) => x.method), ['GET'], 'không được gọi POST tạo mới');
  assert.match(r.toml, new RegExp(`database_id = "${ID}"`));
});

test('Cloudflare lọc theo tên kiểu "chứa chuỗi" nên tên gần giống không được tính là trùng', () => {
  const r = chay(null, { danhSach: [{ uuid: 'khac', name: 'elevato-thu-nghiem' }] });
  assert.equal(r.goi.length, 2, 'phải tạo mới vì tên không khớp hẳn');
  assert.match(r.toml, new RegExp(`database_id = "${ID}"`));
});

test('wrangler.toml đã có id sẵn thì không gọi Cloudflare lần nào', () => {
  const san = readFileSync(join(GOC, 'wrangler.toml'), 'utf8').replace('DAN_DATABASE_ID_VAO_DAY', 'id-co-san');
  const r = chay(san);
  assert.deepEqual(r.goi, []);
  assert.match(r.toml, /database_id = "id-co-san"/);
  assert.match(r.ra, /giữ nguyên/);
});

test('thiếu secret thì báo đúng chỗ phải thêm, không gọi Cloudflare', () => {
  try {
    chay(null, { env: { CLOUDFLARE_API_TOKEN: '' } });
    assert.fail('phải thoát với mã lỗi');
  } catch (e) {
    assert.match(String(e.stderr), /Thiếu CLOUDFLARE_ACCOUNT_ID hoặc CLOUDFLARE_API_TOKEN/);
    assert.match(String(e.stderr), /Settings → Secrets and variables → Actions/);
  }
});
