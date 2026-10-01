// E2E: chạy trang link + trình chỉnh sửa trong Chromium. Apps Script và GitHub API đều giả lập (không cần mạng).
//   cd links && npm run e2e        (cần playwright: cài cục bộ hoặc toàn cục)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const COHORT = { ok: true, config: { cohort: { number: 7, status: 'open', openText: 'Sắp mở' }, slots: { max: 10, base: 4, registered: 1 },
  pricing: { earlyBird: 3000000 }, schedule: { days: 'Thứ 7 & CN', time: '9h–11h' } } };

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) {
    const g = execSync('npm root -g').toString().trim();
    return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
  }
}

let server, base, browser;
before(async () => {
  server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, path);
    if (file.endsWith('/')) file += 'index.html';
    try {
      const buf = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch (e) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.route(/script\.google\.com/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(COHORT) }));
  return p;
}

test('trang link: danh thiếp, ô nổi bật có số chỗ trực tiếp, ô thiếu link tự ẩn', async () => {
  const p = await page();
  await p.goto(base + '/links/');
  await p.waitForSelector('.tile.feature .live');
  assert.equal(await p.textContent('#name'), 'Minh Toàn');
  assert.match(await p.textContent('.tile.feature .live'), /Cohort 07 · Sắp mở.*còn 5\/10 suất/s);
  const titles = await p.$$eval('#grid .ttl', (els) => els.map((e) => e.textContent));
  assert.ok(titles.includes('AI đọc BCTC'));
  assert.ok(!titles.includes('Zalo Minh nhé'), 'ô chưa có link không được hiện');
  assert.equal(await p.getAttribute('.tile.feature .cta', 'href'), '../#dang-ky');
  assert.equal(await p.getAttribute('#socials a', 'href'), 'https://www.tiktok.com/@financewithto');
  assert.equal(await p.getAttribute('#socials a', 'target'), '_blank');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('màn 320px không bị tràn ngang, cả sáng lẫn tối', async () => {
  for (const colorScheme of ['light', 'dark']) {
    const p = await page({ viewport: { width: 320, height: 640 }, colorScheme });
    await p.goto(base + '/links/');
    await p.waitForSelector('.tile.feature');
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, colorScheme);
    await p.context().close();
  }
});

test('ô có thẻ chi tiết: bấm mở thẻ, có gạch đầu dòng và nút tới đúng link; Esc đóng', async () => {
  const p = await page();
  await p.goto(base + '/links/');
  await p.click('button.tile:has-text("Modeling Slides")');
  await p.waitForSelector('#sheet[open]');
  assert.equal(await p.$$eval('#sheetList li', (l) => l.length), 4);
  assert.equal(await p.getAttribute('#sheetGo', 'href'), '../#slides');
  await p.keyboard.press('Escape');
  await p.waitForSelector('#sheet:not([open])', { state: 'attached' });
  await p.context().close();
});

test('trình chỉnh sửa: sửa → xem trước đổi theo → Đăng lên web gửi đúng data.json lên GitHub', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  let put = null;
  await p.route('https://api.github.com/**', async (r) => {
    const req = r.request();
    if (req.method() === 'GET') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sha: 'sha1' }) });
    put = JSON.parse(req.postData());
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ commit: { html_url: 'x' } }) });
  });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.lc');
  assert.match(await p.textContent('#dirty'), /khớp/);

  // Điền link Zalo cho ô đang ẩn → ô hiện ra trong khung xem trước.
  await p.click('.lc-toggle:has-text("Zalo Minh nhé")');
  await p.fill('.lc.open input[type="url"] >> nth=0', 'https://zalo.me/0901234567');
  const frame = p.frameLocator('#frame');
  await frame.locator('#grid .ttl', { hasText: 'Zalo Minh nhé' }).waitFor();
  assert.match(await p.textContent('#dirty'), /chưa đăng/);

  // Chưa có token → mở phần kết nối GitHub thay vì gửi.
  await p.click('#publishBtn');
  await p.waitForSelector('#tokenInput:visible');
  assert.equal(put, null);

  await p.fill('#tokenInput', 'github_pat_test');
  await p.click('#publishBtn');
  await p.waitForFunction(() => /khớp/.test(document.querySelector('#dirty').textContent));
  assert.equal(put.sha, 'sha1');
  assert.equal(put.branch, 'main');
  const sent = JSON.parse(Buffer.from(put.content, 'base64').toString('utf8'));
  assert.equal(sent.links.find((l) => l.id === 'zalo').url, 'https://zalo.me/0901234567');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('trang khoá học: /#dang-ky mở thẳng form đăng ký', async () => {
  const p = await page();
  await p.goto(base + '/#dang-ky');
  await p.waitForSelector('#modal.on');
  await p.context().close();
});
