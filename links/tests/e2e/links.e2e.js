// E2E: chạy trang link + trình chỉnh sửa trong Chromium. Apps Script và GitHub API đều giả lập (không cần mạng).
//   cd links && npm run e2e        (cần playwright: cài cục bộ hoặc toàn cục)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
// Nội dung thật trong links/data.json do chủ trang đổi bất cứ lúc nào; test chạy trên bản mẫu cố định.
const MAU = join(ROOT, 'links/tests/fixtures/data.json');
// Nội dung trang nằm trên Worker; số chỗ cohort vẫn lấy từ backend khoá học (Apps Script).
// Lấy địa chỉ từ chính mã nguồn để bài kiểm tra không lệch khi lần triển khai sau đổi địa chỉ.
const WORKER = /BACKEND_URL = '([^']+)'/.exec(readFileSync(join(ROOT, 'links/js/backend.js'), 'utf8'))[1];
const CHUA_LUU = { ok: true, data: null, updatedAt: '' };
// Từ đời 2, cả nháp lẫn data.json là CẢ TRANG (nhiều thương hiệu). Phần lớn bài kiểm dưới đây
// quan tâm thương hiệu đầu tiên; bản mẫu trong fixtures vẫn để đời 1 để bài kiểm luôn đi qua
// đường nâng cấp dữ liệu cũ.
const b0 = (d) => (d && d.brands ? d.brands[0] : d);
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
    let file = path === '/links/data.json' ? MAU : join(ROOT, path);
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
  await p.route(WORKER + '/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(CHUA_LUU) }));
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

test('nhãn góc không bao giờ đè lên chữ, kể cả nhãn dài nhất', async () => {
  const p = await page();
  // Nhãn dài 12 ký tự — mức tối đa normalize() cho phép — đặt lên cả ba kiểu ô.
  const d = JSON.parse(await readFile(MAU, 'utf8'));
  d.links = d.links.map((l, i) => ({ ...l, hidden: false, badge: 'Sắp hết chỗ', size: ['feature', 'wide', 'half'][i % 3] }));
  await p.route(WORKER + '/links*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: d }) }));
  await p.goto(base + '/links/');
  await p.waitForSelector('#grid .badge');
  await p.waitForTimeout(400);
  const de = await p.evaluate(() => [...document.querySelectorAll('#grid .tile')].map((t) => {
    const b = t.querySelector('.badge');
    if (!b) return null;
    const B = b.getBoundingClientRect();
    return [...t.querySelectorAll('.ttl, .sub')]
      .map((e) => e.getBoundingClientRect())
      .filter((R) => R.width && R.right > B.left + 1 && R.left < B.right - 1 && R.bottom > B.top + 1 && R.top < B.bottom - 1)
      .map(() => t.querySelector('.ttl').textContent);
  }).filter(Boolean).flat());
  assert.deepEqual(de, [], 'nhãn đè lên chữ ở ô: ' + de.join(', '));
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('panel trang sửa vẫn đọc được dù chủ trang kéo kính trong suốt hẳn', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.panel.glass');
  // Trang sửa dùng chung links.css; mặt kính của nó phải độc lập với theme của trang link.
  const nen = await p.evaluate(() => {
    document.documentElement.style.setProperty('--tint', '0');
    const cs = getComputedStyle(document.querySelector('.panel.glass')).backgroundColor;
    return Number(/rgba?\([^)]*?([\d.]+)\)$/.exec(cs)?.[1] ?? 1);
  });
  assert.ok(nen >= 0.25, 'panel mờ quá, không đọc được: alpha ' + nen);
  await p.context().close();
});

// Khổ thật của iPhone/Android trong Safari/Chrome SAU KHI thanh công cụ thu lại — tức là khổ
// người xem thấy ngay từ cú vuốt đầu tiên. Lúc thanh công cụ còn mở, khung nhìn hụt gần 90px nên
// máy nhỏ vẫn phải vuốt một cái; đó là giới hạn của trình duyệt, không phải của trang.
// Đa số người xem vào từ bio TikTok nên khổ nào cũng phải vừa.
// Một trang phục vụ hai kênh TikTok: mỗi bio dán một link ?v= riêng nên trang mở ra đã đúng
// thương hiệu, công tắc chỉ để bắc cầu. Hai bên phải khác hẳn chất liệu chứ không chỉ khác màu.
test('hai thương hiệu: ?v= mở đúng bên, công tắc đổi cả lớp sơn, ô ghim hiện ở cả hai', async () => {
  const site = JSON.parse(await readFile(join(ROOT, 'links/data.json'), 'utf8'));
  const tmxk = site.brands.find((b) => b.skin === 'paper');
  assert.ok(tmxk, 'data.json phải có một thương hiệu dùng lớp sơn giấy');

  const p = await page();
  await p.route(/\/links\/data\.json/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(site) }));
  await p.goto(base + '/links/?v=' + tmxk.id);
  await p.waitForSelector('#grid .tile:not(.sk-tile)');
  await p.waitForTimeout(300);

  // Mở thẳng bằng ?v= → đã đúng lớp sơn ngay, không phải bấm gì.
  assert.equal(await p.evaluate(() => document.documentElement.dataset.skin), 'paper');
  assert.equal(await p.getAttribute('.logo-light', 'src'), tmxk.logo.light, 'logo phải đổi theo thương hiệu');
  assert.equal(await p.textContent('.foot-tag'), tmxk.footTag);

  const ghim = () => p.locator('#pinGrid .tile').count();
  const soGhim = await ghim();
  assert.ok(soGhim >= 1, 'ô ghim phải hiện');

  // Chất liệu phải khác hẳn, không chỉ khác màu nhấn: giấy thì không nhoè nền phía sau.
  const nhoeGiay = await p.evaluate(() => getComputedStyle(document.querySelector('#card')).backdropFilter);
  assert.match(nhoeGiay, /^none$/, 'lớp sơn giấy không được mượn kính mờ của elevaTO');

  // Gạt công tắc sang Finance: đổi lớp sơn, đổi link, ô ghim vẫn nguyên.
  await p.click('#brands button >> nth=0');
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.skin), 'glass');
  assert.ok(!new URL(p.url()).searchParams.get('v'), 'về thương hiệu đầu thì bỏ ?v= cho link gọn: ' + p.url());
  assert.equal(await ghim(), soGhim, 'ô ghim phải hiện ở MỌI thương hiệu');
  const nhoeKinh = await p.evaluate(() => getComputedStyle(document.querySelector('#card')).backdropFilter);
  assert.match(nhoeKinh, /blur/, 'elevaTO phải giữ nguyên kính mờ như cũ');

  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('trên điện thoại: cả trang vừa một màn, không phải lướt', async () => {
  // Mỗi máy đo hai trạng thái: thanh công cụ đang mở (khung nhìn hụt gần 90px, là lúc vừa mở
  // trang) và đã thu (sau cú vuốt đầu). Trạng thái "đang mở" mới là cái bắt được lỗi chật chỗ.
  const KHO = [['iPhone 13/14', 390, 664], ['iPhone 13/14 · đã thu', 390, 750],
    ['iPhone 15/16 Pro', 393, 671], ['iPhone 15/16 Pro · đã thu', 393, 759],
    ['iPhone 14 Plus', 428, 745], ['iPhone 14 Plus · đã thu', 428, 840],
    ['iPhone 16 Pro Max', 430, 790], ['iPhone 16 Pro Max · đã thu', 430, 880],
    ['Android · đã thu', 412, 732]];
  for (const [ten, width, height] of KHO) {
    const p = await page({ viewport: { width, height } });
    await p.goto(base + '/links/');
    await p.waitForSelector('.tile.feature .live');
    await p.waitForTimeout(400);
    const d = await p.evaluate(() => ({
      caTrang: Math.round(document.documentElement.scrollHeight), manHinh: innerHeight,
      dayChanTrang: Math.round(document.querySelector('.foot').getBoundingClientRect().bottom),
      soO: document.querySelectorAll('#grid .tile').length,
    }));
    assert.equal(d.soO, 5, ten);
    assert.ok(d.dayChanTrang <= d.manHinh, `${ten}: chân trang rơi khỏi màn: ${d.dayChanTrang} > ${d.manHinh}`);
    assert.ok(d.caTrang <= d.manHinh + 8, `${ten}: trang tràn ${d.caTrang - d.manHinh}px so với màn`);
    assert.deepEqual(p.errors, [], ten);
    await p.context().close();
  }
});

test('vào lại trang: không để data.json đè lên nội dung chủ trang đã đăng trong lúc chờ máy chủ', async () => {
  // Apps Script mất vài giây, còn data.json nằm cùng máy chủ với trang nên về sau ~50ms. Nếu data.json
  // được vẽ đè lên bản đã lưu lần trước thì người xem quen thấy: đúng → nội dung cũ vài giây → đúng lại.
  const p = await page();
  const daDang = JSON.parse(await readFile(MAU, 'utf8'));
  daDang.links[1].title = 'Nội dung chủ trang đã đăng';
  await p.addInitScript((d) => localStorage.setItem('elevato-links-v1', JSON.stringify(d)), daDang);
  let traLoi = null;
  await p.route(WORKER + '/links*', async (r) => {
    traLoi = () => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: daDang }) });
  });
  await p.goto(base + '/links/');
  await p.waitForSelector('#grid .ttl');
  // data.json đã về từ lâu; máy chủ thì chưa. Nội dung phải vẫn là bản đã lưu.
  await p.waitForTimeout(600);
  const titles = await p.$$eval('#grid .ttl', (els) => els.map((e) => e.textContent));
  assert.ok(titles.includes('Nội dung chủ trang đã đăng'),
    'data.json đã đè lên bản đã lưu — người xem thấy nội dung cũ trong lúc chờ máy chủ: ' + JSON.stringify(titles));
  if (traLoi) await traLoi();
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('mới mở trang là kính đã đúng ngay, không hiện mặc định rồi mới nhảy sang bản thật', async () => {
  const p = await page();
  // Chặn mọi nguồn dữ liệu: những gì thấy được lúc này chính là nhịp vẽ đầu tiên.
  await p.route(/data\.json/, (r) => r.abort());
  await p.goto(base + '/links/');
  await p.waitForSelector('.bar');
  const cssTheme = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--blur').trim(), cs.getPropertyValue('--tint').trim()];
  });
  // CSS mặc định phản chiếu data.json THẬT trong repo, không phải bản mẫu của test.
  const d = JSON.parse(await readFile(join(ROOT, 'links/data.json'), 'utf8'));
  // CSS ghi ".4", JS ghi "0.4" — cùng một số, so bằng số.
  assert.equal(cssTheme[0], b0(d).theme.blur + 'px',
    'nhịp vẽ đầu dùng độ mờ khác data.json → người xem thấy giao diện nhảy sau 1-2 giây');
  assert.equal(Number(cssTheme[1]), b0(d).theme.tint / 100,
    'nhịp vẽ đầu dùng độ đục khác data.json → người xem thấy giao diện nhảy sau 1-2 giây');
  await p.context().close();
});

test('màu thanh trạng thái khớp màu đỉnh trang, và đổi theo nền đang chọn', async () => {
  const p = await page();
  await p.goto(base + '/links/');
  await p.waitForSelector('.tile.feature');
  const doc = () => p.evaluate(() => ({
    meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
    chrome: getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim(),
  }));
  const a1 = await doc();
  assert.ok(a1.meta.every((m) => m === a1.chrome), 'thẻ theme-color không khớp --chrome: ' + JSON.stringify(a1));
  assert.match(a1.chrome, /^#[0-9a-f]{6}$/);

  // Đổi nền (chủ trang chọn trong trình sửa) thì màu thanh trạng thái phải đổi theo.
  await p.evaluate(() => { document.documentElement.dataset.bg = 'sunset'; document.querySelector('#themeBtn').click(); document.querySelector('#themeBtn').click(); });
  const a2 = await doc();
  assert.notEqual(a2.chrome, a1.chrome, 'đổi nền mà màu thanh trạng thái đứng im');
  assert.ok(a2.meta.every((m) => m === a2.chrome));
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
  assert.equal(b0(sent).links.find((l) => l.id === 'zalo').url, 'https://zalo.me/0901234567');
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
  const ai = b0(await p.evaluate(() => JSON.parse(localStorage.getItem('elevato-links-draft')))).links.find((l) => l.id === 'ai');
  assert.equal(ai.imageStyle, 'icon');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('nháp cũ (trước khi có ảnh minh hoạ) được điền ảnh mới, giữ nguyên chữ đã sửa', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const old = JSON.parse(await readFile(MAU, 'utf8'));
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
  assert.equal(b0(draft).status, 'Minhtoantowork@gmail.com');
  assert.equal(b0(draft).links.find((l) => l.id === 'course').image, 'art/glass/course.svg');
  assert.equal(b0(draft).links.find((l) => l.id === 'ai').image, 'art/glass/ai.svg');
  assert.equal(b0(draft).theme.blur, 18);
  await p.context().close();
});

test('trình chỉnh sửa: nháp khác web thì báo rõ; một nút đổi mọi ô sang bộ icon elevaTO, giữ chữ đã sửa', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const draft = JSON.parse(await readFile(MAU, 'utf8'));
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
  assert.equal(b0(saved).links[0].image, 'art/glass/course.svg');
  assert.equal(b0(saved).links[1].title, 'AI đọc BCTC siêu nhanh');
  assert.ok(b0(saved).links.every((l) => l.imageStyle === 'photo'));
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
  const saved = JSON.parse(await readFile(MAU, 'utf8'));
  saved.links[1].title = 'AI đọc BCTC (bản trên máy chủ)';
  await p.route(WORKER + '/links*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: saved }) }));
  await p.goto(base + '/links/');
  await p.waitForSelector('#grid .ttl:has-text("bản trên máy chủ")');
  await p.context().close();

  // Máy chủ chưa có bản mới (trả "unknown action") → vẫn hiện data.json bình thường.
  const q = await page();
  await q.route(WORKER + '/links*', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":false,"code":"setup","error":"chưa nối D1"}' }));
  await q.goto(base + '/links/');
  await q.waitForSelector('#grid .ttl:has-text("AI đọc BCTC")');
  assert.deepEqual(q.errors, []);
  await q.context().close();
});

test('trình chỉnh sửa: lưu bằng ADMIN_KEY lên máy chủ elevaTO, không cần token GitHub', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  const posts = [];
  await p.route(WORKER + '/**', async (r) => {
    const req = r.request();
    if (req.method() !== 'POST') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(CHUA_LUU) });
    const body = JSON.parse(req.postData());
    posts.push({ body, type: req.headers()['content-type'] });
    const ok = body.key === 'dung-key';
    return r.fulfill({ contentType: 'application/json',
      body: JSON.stringify(ok ? { ok: true, updatedAt: '02/10/2026 10:00' } : { ok: false, code: 'auth', error: 'ADMIN_KEY không đúng' }) });
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
  assert.equal(b0(save.body.data).links.find((l) => l.id === 'zalo').url, 'https://zalo.me/0901234567');
  assert.equal(githubCalled, false);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('trình chỉnh sửa dùng được bằng bàn phím: mũi tên chọn trong nhóm, Tab không phải bấm 27 lần', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.click('.lc-toggle:has-text("AI đọc BCTC")');

  // Nhóm "Kiểu ô": chỉ nút đang chọn vào được bằng Tab (roving tabindex), các nút khác bị bỏ qua.
  const sizes = p.locator('.lc.open .segm[aria-label="Kiểu ô"] button');
  assert.deepEqual(await sizes.evaluateAll((els) => els.map((e) => e.tabIndex)), [-1, -1, 0]);

  // Mũi tên đổi lựa chọn và con trỏ bàn phím vẫn ở trong nhóm dù form được vẽ lại.
  await sizes.nth(2).focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => document.activeElement.dataset.fk === 'Kiểu ô|feature');
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-checked')), 'true');
  const frame = p.frames().find((f) => f.url().includes('preview'));
  await frame.waitForSelector('.tile.feature .ttl:has-text("AI đọc BCTC")');

  // Nhóm màu nhấn: Home / End chạy về đầu / cuối danh sách.
  await p.locator('.lc.open .swatches button[aria-checked="true"]').focus();
  await p.keyboard.press('End');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.fk), 'Màu nhấn|slate');
  await p.waitForFunction(() => {
    const d = JSON.parse(localStorage.getItem('elevato-links-draft'));
    return (d.brands ? d.brands[0] : d).links.find((l) => l.id === 'ai').accent === 'slate';
  });

  // Nút mở bộ icon nói rõ đang mở hay đóng; mở bộ khác thì bộ cũ đóng lại.
  const tools = p.locator('.lc.open .im-tools');
  await tools.locator('button:has-text("Icon 3D")').click();
  assert.equal(await tools.locator('button:has-text("Icon 3D")').getAttribute('aria-expanded'), 'true');
  await tools.locator('button:has-text("Bộ icon cũ")').click();
  assert.equal(await tools.locator('button:has-text("Icon 3D")').getAttribute('aria-expanded'), 'false');
  assert.equal(await tools.locator('button:has-text("Bộ icon cũ")').getAttribute('aria-expanded'), 'true');

  // Bỏ ảnh của ô → hiện bảng icon nét, nhãn là tiếng Việt (trình đọc màn hình đọc được), không phải tên khoá tiếng Anh.
  await tools.locator('button:has-text("Bỏ ảnh")').click();
  assert.equal(await p.getAttribute('.lc.open .icons button[data-fk="Icon|rocket"]', 'aria-label'), 'Tên lửa');
  assert.equal(await p.getAttribute('.lc.open .icons button[data-fk="Icon|rocket"]', 'title'), 'Tên lửa');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('gõ xong đóng/tải lại trang ngay: nháp vẫn còn (lưu nháp được gộp lại nên không chạy sau từng ký tự)', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.lc');

  // Gõ rồi tải lại ngay, không chờ lượt lưu đang hoãn — trang phải lưu nốt trước khi đóng.
  await p.fill('textarea.inp >> nth=0', 'Giới thiệu vừa gõ xong thì tải lại');
  await p.reload();
  await p.waitForSelector('.lc');
  assert.equal(await p.inputValue('textarea.inp >> nth=0'), 'Giới thiệu vừa gõ xong thì tải lại');
  assert.equal(b0(await p.evaluate(() => JSON.parse(localStorage.getItem('elevato-links-draft')))).tagline,
    'Giới thiệu vừa gõ xong thì tải lại');
  assert.match(await p.textContent('#dirty'), /chưa đăng/);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('chỉ mở trang sửa rồi chuyển tab, không sửa gì: không ghi nháp đè lên bản đang chạy trên web', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.lc');

  // Chuyển sang tab khác rồi quay lại, và mở thẻ một ô (chỉ xem, không sửa gì).
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.click('.lc-toggle:has-text("AI đọc BCTC")');
  assert.equal(await p.evaluate(() => localStorage.getItem('elevato-links-draft')), null,
    'chưa sửa gì thì không được tạo nháp — lần sau mở lại sẽ thấy bản chụp cũ đè lên trang trên web');

  // "Bỏ nháp, lấy bản trên web" rồi chuyển tab cũng không được dựng lại nháp.
  await p.fill('textarea.inp >> nth=0', 'sửa thử');
  await p.waitForFunction(() => localStorage.getItem('elevato-links-draft'));
  p.on('dialog', (d) => d.accept());
  await p.click('summary:has-text("Sao lưu")');
  await p.click('button:has-text("Bỏ nháp, lấy bản trên web")');
  await p.waitForFunction(() => localStorage.getItem('elevato-links-draft') === null);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => localStorage.getItem('elevato-links-draft')), null);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('ADMIN_KEY không bật "nhớ trên máy": chỉ nằm trong tab này, đóng tab là mất', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('#adminKeyInput', { state: 'attached' });
  await p.fill('#adminKeyInput', 'dung-key');
  assert.deepEqual(await p.evaluate(() => [localStorage.getItem('elevato-links-adminkey'), sessionStorage.getItem('elevato-links-adminkey')]),
    [null, '"dung-key"']);

  // Bật "nhớ" → chuyển sang localStorage và KHÔNG để lại bản sao ở chỗ cũ; tắt lại thì ngược lại.
  await p.click('.panel:has(#adminKeyInput) .sw-lbl:has-text("Nhớ key trên máy này")');
  assert.deepEqual(await p.evaluate(() => [localStorage.getItem('elevato-links-adminkey'), sessionStorage.getItem('elevato-links-adminkey')]),
    ['"dung-key"', null]);
  await p.click('.panel:has(#adminKeyInput) .sw-lbl:has-text("Nhớ key trên máy này")');
  assert.deepEqual(await p.evaluate(() => [localStorage.getItem('elevato-links-adminkey'), sessionStorage.getItem('elevato-links-adminkey')]),
    [null, '"dung-key"']);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('khung xem trước luôn nạp index.html mới nhất, không lấy bản cũ trong bộ nhớ đệm', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 } });
  await p.goto(base + '/links/edit.html');
  await p.waitForSelector('.lc');
  const src = await p.getAttribute('#frame', 'src');
  assert.match(src, /^index\.html\?preview&t=\d+$/, 'thiếu dấu thời gian → sửa index.html xong khung vẫn vẽ bản cũ');

  // Khung phải vẽ đúng bản index.html hiện tại: thanh đầu trang là một viên kính chung, không phải hai nút rời.
  const frame = p.frames().find((f) => f.url().includes('preview'));
  assert.equal(await frame.evaluate(() => document.querySelector('.bar-r').className), 'bar-r lg');
  assert.equal(await frame.evaluate(() => document.querySelectorAll('.bar-r .bar-div').length), 1);
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('đổi sáng / tối: lưu đúng dạng mà mọi trang elevaTO đọc được, khung xem trước đổi theo', async () => {
  const p = await page({ viewport: { width: 1400, height: 900 }, colorScheme: 'light' });
  await p.goto(base + '/links/edit.html');
  await p.click('#themeBtn');
  // ai/js/theme.js đọc chuỗi thô trong <head>, không phải JSON — lưu '"dark"' là mọi trang mất giao diện tối.
  assert.equal(await p.evaluate(() => localStorage.getItem('elevato-theme')), 'dark');
  const frame = p.frames().find((f) => f.url().includes('preview'));
  assert.equal(await frame.evaluate(() => document.documentElement.dataset.theme), 'dark');

  const q = await page({ colorScheme: 'light' });
  await q.goto(base + '/links/');
  await q.click('#themeBtn');
  assert.equal(await q.evaluate(() => localStorage.getItem('elevato-theme')), 'dark');
  await q.reload();
  assert.equal(await q.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await p.context().close();
  await q.context().close();
});

test('trang khoá học: /#dang-ky mở thẳng form đăng ký', async () => {
  const p = await page();
  await p.goto(base + '/#dang-ky');
  await p.waitForSelector('#modal.on');
  await p.context().close();
});
