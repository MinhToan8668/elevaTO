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
  await p.waitForSelector('#adminKeyInput:visible');
  await p.click('summary:has-text("Cách khác: đăng qua GitHub")');
  assert.equal(put, null);

  await p.fill('#tokenInput', 'github_pat_' + 'A1b2C3d4E5'.repeat(8) + '_xy');
  await p.click('#publishBtn');
  await p.waitForFunction(() => /khớp/.test(document.querySelector('#dirty').textContent));
  assert.equal(put.sha, 'sha1');
  assert.equal(put.branch, 'main');
  const sent = JSON.parse(Buffer.from(put.content, 'base64').toString('utf8'));
  assert.equal(sent.links.find((l) => l.id === 'zalo').url, 'https://zalo.me/0901234567');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('ảnh minh hoạ của các ô và logo chân trang tải được', async () => {
  const p = await page();
  await p.goto(base + '/links/');
  await p.waitForSelector('#grid .chip.img img, #grid .chip.ico img');
  await p.waitForFunction(() => [...document.querySelectorAll('#grid .chip.ico img, #grid .chip.img img, .foot img.wm-light')].every((i) => i.complete && i.naturalWidth > 0));
  assert.equal(await p.textContent('.foot-tag'), 'Fuel Your Financial Journey');
  await p.context().close();
});

test('trình chỉnh sửa: kéo độ mờ / độ đục, đổi nền → khung xem trước đổi theo; ảnh đại diện chọn từ máy', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('input.sl');
  await p.locator('input.sl').nth(0).fill('6');
  await p.locator('input.sl').nth(1).fill('20');
  await p.click('.segm button:has-text("Đêm")');
  const frame = p.frames().find((f) => f.url().includes('preview'));
  await frame.waitForFunction(() => document.documentElement.dataset.bg === 'midnight');
  assert.deepEqual(await frame.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--blur').trim(), cs.getPropertyValue('--tint').trim()];
  }), ['6px', '0.2']);

  // Ảnh PNG thật trong repo → cắt vuông, nén thành data URL và hiện trong xem trước.
  const png = await readFile(join(ROOT, 'apple-touch-icon.png'));
  const chooser = p.waitForEvent('filechooser');
  await p.click('.fld:has(> .lbl:text("Ảnh đại diện")) button:has-text("Ảnh từ máy")');
  await (await chooser).setFiles({ name: 'ava.png', mimeType: 'image/png', buffer: png });
  await frame.waitForFunction(() => document.querySelector('#ava').src.startsWith('data:image/'));
  const draft = await p.evaluate(() => JSON.parse(localStorage.getItem('elevato-links-draft')));
  assert.match(draft.profile.avatar, /^data:image\/(webp|jpeg);base64,/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('trình chỉnh sửa: chọn icon 3D có sẵn và tìm icon Iconify cho một ô', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const svgIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#f59e0b"/></svg>';
  await p.route('https://api.iconify.design/**', (r) => (r.request().url().includes('/search')
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ icons: ['noto:coin', 'fluent-color:money-16'] }) })
    : r.fulfill({ contentType: 'image/svg+xml', body: svgIcon })));
  await p.goto(base + '/links/edit.html');
  await p.click('.lc-toggle:has-text("AI đọc BCTC")');
  await p.click('.lc.open button:has-text("Icon 3D")');
  await p.click('.lc.open .im-gallery button.ico[title="Tên lửa"]');
  const frame = p.frames().find((f) => f.url().includes('preview'));
  await frame.waitForSelector('.tile .chip.ico img[src="art/3d/rocket.webp"]');

  await p.click('.lc.open button:has-text("Tìm icon")');
  await p.fill('.lc.open input[type=search]', 'coin');
  await p.keyboard.press('Enter');
  await p.click('.lc.open .im-search button[title="noto:coin"]');
  await frame.waitForSelector('.tile .chip.ico img[src^="data:image/svg+xml;base64,"]');
  const ai = (await p.evaluate(() => JSON.parse(localStorage.getItem('elevato-links-draft')))).links.find((l) => l.id === 'ai');
  assert.equal(ai.imageStyle, 'icon');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('nháp cũ (trước khi có ảnh minh hoạ) được điền ảnh mới, giữ nguyên chữ đã sửa', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const old = JSON.parse(await readFile(join(ROOT, 'links/data.json'), 'utf8'));
  delete old.theme;
  old.profile.status = 'Minhtoantowork@gmail.com';
  old.links = old.links.map((l) => ({ ...l, image: l.id === 'course' ? '../assets/model/dashboard-thumb.webp' : '' }));
  await p.addInitScript((d) => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('elevato-links-draft', JSON.stringify(d));
  }, old);
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.lc');
  const draft = await p.evaluate(() => JSON.parse(localStorage.getItem('elevato-links-draft')));
  assert.equal(draft.profile.status, 'Minhtoantowork@gmail.com');
  assert.equal(draft.links.find((l) => l.id === 'course').image, 'art/glass/course.svg');
  assert.equal(draft.links.find((l) => l.id === 'ai').image, 'art/glass/ai.svg');
  assert.equal(draft.theme.blur, 18);
  await p.context().close();
});

test('trình chỉnh sửa: nháp khác web thì báo rõ; một nút đổi mọi ô sang bộ icon elevaTO, giữ chữ đã sửa', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const draft = JSON.parse(await readFile(join(ROOT, 'links/data.json'), 'utf8'));
  draft.links = draft.links.map((l) => ({ ...l, image: 'art/3d/laptop.webp', imageStyle: 'icon' }));
  draft.links[1].title = 'AI đọc BCTC siêu nhanh';
  await p.addInitScript((d) => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('elevato-links-draft', JSON.stringify(d));
  }, draft);
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('#prevNote.on');
  await p.click('button:has-text("Dùng bộ icon elevaTO cho tất cả ô")');
  const frame = p.frames().find((f) => f.url().includes('preview'));
  await frame.waitForSelector('.tile .chip.img img[src="art/glass/ai.svg"]');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('elevato-links-draft')));
  assert.equal(saved.links[0].image, 'art/glass/course.svg');
  assert.equal(saved.links[1].title, 'AI đọc BCTC siêu nhanh');
  assert.ok(saved.links.every((l) => l.imageStyle === 'photo'));
  await p.context().close();
});

test('trình chỉnh sửa: dán nhầm mật khẩu thì báo ngay; token bị GitHub từ chối thì nói rõ lý do', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.route('https://api.github.com/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' }));
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('#tokenInput', { state: 'attached' });
  await p.click('summary:has-text("Cách khác: đăng qua GitHub")');
  await p.fill('#tokenInput', 'MatKhauCuaToi@123');
  assert.match(await p.textContent('#tokenHint'), /không phải token/);
  await p.click('button:has-text("Kiểm tra kết nối")');
  assert.match(await p.textContent('#ghStatus'), /không phải token/);

  await p.fill('#tokenInput', '  github_pat_' + 'A1b2C3d4E5'.repeat(8) + '_xy\n');
  assert.match(await p.textContent('#tokenHint'), /Đúng dạng token/);
  await p.click('button:has-text("Kiểm tra kết nối")');
  await p.waitForFunction(() => /không nhận token/.test(document.querySelector('#ghStatus').textContent));
  await p.context().close();
});

test('máy chủ elevaTO: trang ưu tiên nội dung đã lưu trên Apps Script, dự phòng data.json', async () => {
  const p = await page();
  const saved = JSON.parse(await readFile(join(ROOT, 'links/data.json'), 'utf8'));
  saved.links[1].title = 'AI đọc BCTC (bản trên máy chủ)';
  await p.route(/script\.google\.com.*action=links/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: saved }) }));
  await p.goto(base + '/links/');
  await p.waitForSelector('#grid .ttl:has-text("bản trên máy chủ")');
  await p.context().close();

  // Máy chủ chưa có bản mới (trả "unknown action") → vẫn hiện data.json bình thường.
  const q = await page();
  await q.route(/script\.google\.com.*action=links/, (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":false,"error":"unknown action"}' }));
  await q.goto(base + '/links/');
  await q.waitForSelector('#grid .ttl:has-text("AI đọc BCTC")');
  assert.deepEqual(q.errors, []);
  await q.context().close();
});

test('trình chỉnh sửa: lưu bằng ADMIN_KEY lên máy chủ elevaTO, không cần token GitHub', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const posts = [];
  await p.route(/script\.google\.com/, async (r) => {
    const req = r.request();
    if (req.method() !== 'POST') return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"data":null}' });
    const body = JSON.parse(req.postData());
    posts.push({ body, type: req.headers()['content-type'] });
    const ok = body.key === 'dung-key';
    return r.fulfill({ contentType: 'application/json',
      body: JSON.stringify(ok ? { ok: true, updatedAt: '02/10/2026 10:00' } : { ok: false, error: 'unauthorized' }) });
  });
  let githubCalled = false;
  await p.route('https://api.github.com/**', (r) => { githubCalled = true; return r.abort(); });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.lc');

  // Chưa có key → bấm Đăng thì mở ô ADMIN_KEY.
  await p.click('#publishBtn');
  await p.waitForSelector('#adminKeyInput:visible');

  await p.fill('#adminKeyInput', 'sai-key');
  await p.click('button:has-text("Kiểm tra key")');
  await p.waitForFunction(() => /không đúng/.test(document.querySelector('#keyStatus').textContent));
  await p.fill('#adminKeyInput', 'dung-key');
  await p.click('button:has-text("Kiểm tra key")');
  await p.waitForFunction(() => /Key đúng/.test(document.querySelector('#keyStatus').textContent));

  await p.click('.lc-toggle:has-text("Zalo Minh nhé")');
  await p.fill('.lc.open input[type="url"] >> nth=0', 'https://zalo.me/0901234567');
  await p.click('#publishBtn');
  await p.waitForFunction(() => /khớp/.test(document.querySelector('#dirty').textContent));
  const save = posts.find((x) => x.body.action === 'saveLinks');
  assert.equal(save.body.key, 'dung-key');
  assert.match(save.type, /^text\/plain/);
  assert.equal(save.body.data.links.find((l) => l.id === 'zalo').url, 'https://zalo.me/0901234567');
  assert.equal(githubCalled, false);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('trang khoá học: /#dang-ky mở thẳng form đăng ký', async () => {
  const p = await page();
  await p.goto(base + '/#dang-ky');
  await p.waitForSelector('#modal.on');
  await p.context().close();
});
