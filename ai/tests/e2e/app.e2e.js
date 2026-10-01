// E2E: chạy trang thật trong Chromium, máy chủ AI được giả lập (không tốn lượt, không cần key).
//   cd ai && npm run e2e
// Tuỳ chọn: MODEL_XLSX=/đường/dẫn/model.xlsx để thử điền model elevaTO thật.
// Cần playwright (npm i -D playwright, hoặc bản cài toàn cục). Không cần mạng: thư viện nằm trong vendor/,
// máy chủ AI và Google Fonts được giả lập.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { execSync } from 'node:child_process';   // tìm playwright cài toàn cục
import { pathToFileURL, fileURLToPath } from 'node:url';
import { CHART } from '../../js/chart2026.js';
import { computeTotals } from '../../js/core/statements.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));   // gốc repo (trang nằm ở /ai/)
const API = 'https://script.google.com/macros/s/AKfycbE2E_TEST_DEPLOYMENT_ID_0123456789/exec';   // máy chủ giả

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) {
    const g = execSync('npm root -g').toString().trim();
    return import(pathToFileURL(join(g, 'playwright', 'index.mjs')).href);
  }
}

// ─── Số liệu BCTC giả, tự khớp mọi dòng tổng ───────────────
const IN = {
  BS: { 111: 60e9, 112: 40e9, 131: 50e9, 136: -2e9, 141: 30e9, 222: 100e9, 223: -40e9, 311: 70e9, 411: 100e9, 420: 68e9 },
  IS: { '01': 500e9, 11: 300e9, 22: 10e9, 23: 20e9, 24: 15e9, 25: 30e9, 26: 40e9, 31: 2e9, 32: 1e9, 51: 25e9 },
};
const withKeys = (st, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${st}:${String(k).padStart(st === 'BS' ? 3 : 2, '0')}`, v]));
const BS = computeTotals(withKeys('BS', IN.BS));
const IS = computeTotals(withKeys('IS', IN.IS));
IS['IS:61'] = IS['IS:60']; IS['IS:62'] = 0;
const CF = computeTotals({ 'CF:01': IS['IS:50'], 'CF:02': 10e9, 'CF:09': 30e9 - IS['IS:50'] - 10e9, 'CF:21': -15e9, 'CF:36': -5e9, 'CF:60': 90e9, 'CF:61': 0 });
const DATA = { BS, IS, CF };

const vn = (v) => { const s = Math.abs(Math.round(v)).toLocaleString('de-DE'); return v < 0 ? `(${s})` : s; };
// BCTC năm 2025 thật in mã theo mẫu cũ TT200 (công cụ phải tự quy đổi sang mẫu 2026).
const itemsOf = (st) => CHART.filter((i) => i.st === st && Number.isFinite(DATA[st][`${st}:${i.code}`]))
  .map((i) => ({ c: st === 'CF' ? i.code : (i.tt200 || i.code), n: i.label, v: vn(DATA[st][`${st}:${i.code}`]), p: vn(DATA[st][`${st}:${i.code}`] * 0.9) }));

const TITLES = { BS: 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH', IS: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', CF: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ' };
function reportHtml() {
  const table = (st) => `<section><h1>${TITLES[st]}</h1><p>Năm 2025 · Đơn vị tính: VND</p><table>` +
    itemsOf(st).map((r) => `<tr><td>${r.n}</td><td>${r.c}</td><td>${r.v}</td><td>${r.p}</td></tr>`).join('') + '</table></section>';
  return `<html><head><meta charset="utf-8"><style>section{page-break-after:always;font:11px sans-serif} td{padding:1px 6px}</style></head><body>
    <section><h2>CÔNG TY CỔ PHẦN THỬ NGHIỆM</h2><p>Báo cáo tài chính hợp nhất đã được kiểm toán cho năm tài chính kết thúc ngày 31 tháng 12 năm 2025</p></section>
    ${table('BS')}${table('IS')}${table('CF')}
    <section><h1>THUYẾT MINH BÁO CÁO TÀI CHÍNH</h1><h3>30. BÁO CÁO BỘ PHẬN</h3><p>Bán lẻ 400.000.000.000 · Bán buôn 100.000.000.000</p></section>
  </body></html>`;
}

// ─── Máy chủ elevaTO AI giả (tài khoản + Gemini) ─────────
const aiCalls = [];
const accounts = new Map();                 // email → { ten, mk, token }
const ME = (a) => ({ ten: a.ten, email: a.email, vaitro: a.vaitro || 'free', luot: { dung: aiCalls.length, han: 50 } });
const TOKEN = (email) => `EABCDE.${Buffer.from(email).toString('hex').padEnd(64, '0').slice(0, 64)}`;
function fakeAI(body) {
  const fail = (code, error) => ({ ok: false, code, error });
  if (body.action === 'dangky') {
    if (accounts.has(body.email)) return fail('da_ton_tai', 'Email này đã có tài khoản — đăng nhập nhé');
    const a = { ten: body.ten, email: body.email, mk: body.mk, token: TOKEN(body.email) };
    accounts.set(body.email, a);
    return { ok: true, data: { token: a.token, me: ME(a) } };
  }
  if (body.action === 'dangnhap') {
    const a = accounts.get(body.email);
    if (!a || a.mk !== body.mk) return fail('sai', 'Email hoặc mật khẩu chưa đúng');
    return { ok: true, data: { token: a.token, me: ME(a) } };
  }
  const a = [...accounts.values()].find((x) => x.token === body.token);
  if (!a) return fail('auth', 'Phiên đăng nhập đã hết — đăng nhập lại');
  if (body.action === 'toi') return { ok: true, data: { me: ME(a) } };
  if (body.action === 'dangxuat') { a.token = TOKEN(a.email + 'x'); return { ok: true, data: {} }; }
  const parts = body.contents[0].parts;
  const prompt = parts.find((p) => p.text).text;
  aiCalls.push({ model: body.model, token: body.token, mimes: parts.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType), prompt: prompt.slice(0, 40) });
  const meta = { don_vi: 'VND', ngay_ket_thuc: '31/12/2025', so_thang: '12', thong_tu: '200/2014/TT-BTC', ten_cong_ty: 'CTCP Thử Nghiệm', phuong_phap: 'gian_tiep' };
  let out;
  if (/TÌNH HÌNH TÀI CHÍNH/.test(prompt)) out = { meta, items: itemsOf('BS') };
  else if (/KẾT QUẢ HOẠT ĐỘNG/.test(prompt)) out = { meta, items: itemsOf('IS') };
  else if (/LƯU CHUYỂN TIỀN TỆ/.test(prompt)) out = { meta, items: itemsOf('CF') };
  else if (/BỘ PHẬN/.test(prompt)) out = { meta: { don_vi: 'VND' }, segments: [{ ten: 'Bán lẻ', doanh_thu: '400.000.000.000', loi_nhuan_gop: '150.000.000.000' }, { ten: 'Bán buôn', doanh_thu: '100.000.000.000', loi_nhuan_gop: '50.000.000.000' }] };
  else return fail('bad', 'prompt lạ');
  return { ok: true, data: { text: JSON.stringify(out), finishReason: 'STOP', tokens: 100 } };
}

// ─── Máy chủ tĩnh ─────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml' };
let server, base, browser, pw, tmp;

before(async () => {
  server = http.createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) { res.writeHead(403).end(); return; }
    try {
      const file = p.endsWith('/') || p === '' ? join(p, 'index.html') : p;
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
    } catch (e) { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  pw = await loadPlaywright();
  // Không có locale UTF-8 thì Chromium trên Linux đổi tên file tải về có dấu thành "download".
  browser = await pw.chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  tmp = await mkdtemp(join(tmpdir(), 'elevato-e2e-'));
});
after(async () => { await browser?.close(); server?.close(); });

async function newPage({ configured = true } = {}) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.route('https://script.google.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeAI(body)) });
  });
  // Test luôn gắn link máy chủ giả (hoặc để trống) thay cho link thật trong js/config.js.
  await page.route('**/ai/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `export const API = '${configured ? API : ''}';` }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return { page, errors, context };
}

// E2E_SHOTS=thư_mục → chụp màn hình các bước (xem giao diện, không ảnh hưởng kết quả test).
async function shot(page, name, opts = {}) {
  if (!process.env.E2E_SHOTS) return;
  await page.screenshot({ path: join(process.env.E2E_SHOTS, `${name}.png`), fullPage: true, ...opts });
}

async function download(page, click) {
  const [d] = await Promise.all([page.waitForEvent('download'), click()]);
  const path = join(tmp, d.suggestedFilename());
  await d.saveAs(path);
  return { name: d.suggestedFilename(), path };
}

test('luồng chính: đăng ký → tải PDF → nhận trang → trích xuất → sửa ô → xuất file → mở lại phiên', { timeout: 180_000 }, async () => {
  // PDF BCTC giả dựng bằng chính Chromium
  const maker = await browser.newPage();
  await maker.setContent(reportHtml());
  const pdfPath = join(tmp, 'BCTC-2025.pdf');
  await writeFile(pdfPath, await maker.pdf({ format: 'A4' }));
  await maker.close();

  const { page, errors } = await newPage();
  await page.goto(`${base}/ai/`);
  // Chưa đăng nhập: chỉ thấy màn chào + đăng nhập, không có ô link máy chủ / mã truy cập nào.
  await page.waitForSelector('#gate .auth-card');
  assert.equal(await page.locator('#app').isVisible(), false);
  assert.equal(await page.locator('input[type=url], #apiIn, #codeIn').count(), 0);
  assert.ok(await page.locator('.logo-light').evaluate((img) => img.naturalWidth > 0), 'logo elevaTO hiện được');
  await shot(page, '0-dang-nhap');
  if (process.env.E2E_SHOTS) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, '0-dang-nhap-toi', { fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, '0-dang-nhap-mobile', { fullPage: false });
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.fill('#liEmail', 'hv@elevato.vn');
  await page.fill('#liPass', 'sai-mat-khau');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#gate .msg.err:has-text("chưa đúng")');
  await page.click('#tab-signup');
  await page.fill('#suTen', 'Học viên E2E');
  await page.fill('#suEmail', 'hv@elevato.vn');
  await page.fill('#suSdt', '0901234567');
  await page.fill('#suPass', 'mat-khau-123');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#app:not([hidden])');
  assert.equal(await page.locator('#acct .acct-name').innerText(), 'Học viên E2E');
  assert.equal(await page.evaluate(() => typeof window.XLSX), 'undefined', 'thư viện Excel chỉ nạp khi cần');

  await page.setInputFiles('#fileInput', pdfPath);
  await page.waitForSelector('#fileList .file:has-text("máy nhận ra CĐKT, KQKD, LCTT")', { timeout: 30_000 });
  assert.equal(await page.locator('#pageMaps .tile').count(), 5);
  // Máy tick sẵn 3 bảng chính + trang thuyết minh nhận ra được (2–5), trang bìa không tick
  assert.deepEqual(await page.locator('#pageMaps .tile').evaluateAll((ts) => ts.map((t) => t.classList.contains('on'))), [false, true, true, true, true]);
  assert.match(await page.locator('#pageMaps .found').innerText(), /CĐKT 2 · KQKD 3 · LCTT 4/);
  await page.waitForFunction(() => [...document.querySelectorAll('#pageMaps .tile-img')].every((el) => el.style.backgroundImage || el.classList.contains('noimg')));
  const noimg = await page.locator('#pageMaps .tile-img.noimg').evaluateAll((els) => els.map((e) => e.title));
  assert.deepEqual(noimg, [], 'ảnh thu nhỏ vẽ được mọi trang');
  await shot(page, '1-trang');
  if (process.env.E2E_SHOTS) await page.locator('#pageMaps .thumbs').screenshot({ path: join(process.env.E2E_SHOTS, '1b-thumbs.png') });

  // Xem trang lớn: bấm ảnh trang 1, sang trang 2 bằng phím →, bỏ chọn rồi chọn lại, Esc để đóng
  await page.locator('#pageMaps .tile-img').first().click();
  await page.waitForSelector('dialog.viewer[open] .vw-stage canvas');
  assert.equal(await page.locator('.vw-pos').innerText(), 'Trang 1 / 5');
  assert.equal(await page.locator('#vwPick').getAttribute('aria-pressed'), 'false');
  await shot(page, '1c-xem-trang', { fullPage: false });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.vw-pos').textContent === 'Trang 2 / 5');
  await page.waitForSelector('dialog.viewer[open] .vw-stage canvas');
  await page.evaluate(() => { window.__cv = document.querySelector('.vw-stage canvas'); });
  await page.click('#vwPick');
  await page.waitForFunction(() => !document.querySelectorAll('#pageMaps .tile')[1].classList.contains('on'));
  await page.click('#vwPick');
  await page.waitForFunction(() => document.querySelectorAll('#pageMaps .tile')[1].classList.contains('on'));
  assert.ok(await page.evaluate(() => document.querySelector('.vw-stage canvas') === window.__cv), 'tick không vẽ lại trang (giữ chỗ đang cuộn)');
  await page.click('[aria-label="Phóng to"]');
  assert.equal(await page.locator('.vw-zoom').innerText(), '125%');
  assert.equal(await page.evaluate(() => document.querySelector('.vw-stage canvas').style.width), '125%');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.viewer:not([open])', { state: 'attached' });
  assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('#pageMaps .tile-img')), 'đóng xem trang → quay về ảnh trang đã bấm');

  // Tài khoản thường: thẻ Form chi tiết elevaTO bị khoá
  assert.equal(await page.locator('#exportBox .cardx.locked').count(), 1, 'form elevaTO khoá với tài khoản thường');

  // Nâng lên học viên → mở khoá
  accounts.get('hv@elevato.vn').vaitro = 'hv';
  await page.reload();
  await page.setInputFiles('#fileInput', pdfPath);
  await page.waitForSelector('#pageMaps .tile');

  await page.click('#runBtn');
  await page.waitForSelector('#review .sum .pc', { timeout: 60_000 });
  assert.equal(await page.locator('#exportBox .cardx.locked').count(), 0, 'học viên xuất được form elevaTO');
  assert.ok(aiCalls.length >= 4, `gọi AI ${aiCalls.length} lần`);
  assert.ok(aiCalls.every((c) => c.token === TOKEN('hv@elevato.vn') && c.model === undefined && c.mimes.every((m) => m === 'application/pdf')), JSON.stringify(aiCalls));

  const pills = await page.locator('#review .sum .pc').allInnerTexts();
  assert.deepEqual(pills, ['Năm 2024: ✓ khớp', 'Năm 2025: ✓ khớp'], 'số AI chép khớp mọi dòng tổng');
  await shot(page, '2-ra-soat');
  // Tab Biểu đồ & chỉ số: vẽ SVG từ số đã trích, có bảng chỉ số
  await page.click('#review [role=tab]:has-text("Biểu đồ")');
  await page.waitForSelector('#tabpanel .chart svg.cv rect');
  const titles = await page.locator('#tabpanel .chart figcaption b').allInnerTexts();
  assert.ok(titles.includes('Doanh thu & lợi nhuận') && titles.includes('Cơ cấu tài sản'), titles.join());
  assert.ok((await page.locator('#tabpanel table.ratios tbody tr').count()) >= 8);
  assert.match(await page.locator('#tabpanel table.ratios tbody tr:has-text("Nợ / Vốn chủ") td.num').last().innerText(), /lần$/);
  await shot(page, '2b-bieu-do');
  await page.click('#review [role=tab]:has-text("Tình hình tài chính")');

  const cell = page.locator('td.v[data-k="BS:111"][data-p="FY2025"]');
  assert.equal(await cell.innerText(), '60.000');                         // triệu đồng

  // Sửa tay một ô → CĐKT lệch → ô tổng báo đỏ, số sửa tay tô xanh
  await cell.click();
  await page.locator('td.v[data-k="BS:111"] input.ed').fill('61.000');
  await page.keyboard.press('Enter');
  await page.waitForSelector('td.v.man[data-k="BS:111"][data-p="FY2025"]');
  assert.match(await page.locator('#review .sum .pc').nth(1).innerText(), /lệch/);
  // Đang sửa ô này mà bấm sang ô khác: ô cũ lưu, ô mới mở luôn (không mất cú bấm), bảng không nhảy về đầu.
  await page.locator('td.v[data-k="BS:111"][data-p="FY2025"]').click();
  await page.locator('td.v[data-k="BS:111"] input.ed').fill('60.000');
  await page.locator('td.v[data-k="BS:112"][data-p="FY2025"]').click();
  await page.waitForSelector('td.v[data-k="BS:112"][data-p="FY2025"] input.ed');
  await page.keyboard.press('Escape');
  // Sửa ô cuối bảng rồi Enter: bảng vẽ lại nhưng giữ chỗ cuộn và focus ở đúng ô (dùng bàn phím được tiếp).
  await page.setViewportSize({ width: 1360, height: 500 });
  await page.locator('td.v[data-k="BS:420"][data-p="FY2025"]').click();
  const top = await page.locator('#review .gridwrap').evaluate((el) => el.scrollTop);
  assert.ok(top > 0, 'bảng dài hơn khung, ô cuối nằm dưới');
  await page.locator('td.v[data-k="BS:420"] input.ed').fill('68.000,5');
  await page.keyboard.press('Enter');
  await page.waitForSelector('td.v.man[data-k="BS:420"][data-p="FY2025"]');
  assert.equal(await page.locator('#review .gridwrap').evaluate((el) => el.scrollTop), top, 'giữ vị trí cuộn');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'BS:420', 'focus ở lại ô vừa sửa');
  await page.keyboard.press('Enter');
  await page.locator('td.v[data-k="BS:420"] input.ed').fill('68.000');
  await page.keyboard.press('Enter');
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.waitForFunction(() => document.querySelectorAll('#review .sum .pc.ok').length === 2);

  // Thuyết minh: 2 mảng → ô 1, 2 của model
  await page.click('#review .tabs button:has-text("Thuyết minh")');
  assert.equal(await page.locator('#review table.k select').count(), 2);
  await page.click('#review .tabs button:has-text("Xem trước model")');
  assert.match(await page.locator('#review table.g').innerText(), /Doanh thu mảng 1[^\n]*400\.000 T/);
  await shot(page, '3-model');
  if (process.env.E2E_SHOTS) { await page.click('#themeBtn'); await shot(page, '3-model-toi', { fullPage: false }); await page.click('#themeBtn'); }
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, '4-mobile', { fullPage: false });
  await page.setViewportSize({ width: 1360, height: 900 });

  // Tick bỏ bớt dòng rồi tải bảng chuẩn hoá
  await page.click('#review .tabs button:has-text("Kết quả KD")');
  await page.locator('#review table.g thead input[type=checkbox]').uncheck();
  await page.locator('#review tr:has(td.c:text-is("60")) input[type=checkbox]').check();
  const table = await download(page, () => page.click('#exportBox button:has-text("Tải Form chuẩn hóa 2026")'));
  assert.match(table.name, /Form chuan hoa 2026\.xlsx$/);
  await page.addScriptTag({ url: '/ai/vendor/sheetjs/xlsx.full.min.js' });
  const book = await page.evaluate(async (b64) => {
    const wb = window.XLSX.read(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { type: 'array' });
    return Object.fromEntries(wb.SheetNames.map((n) => [n, window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })]));
  }, (await readFile(table.path)).toString('base64'));
  assert.deepEqual(Object.keys(book), ['Tổng quan', 'Tình hình tài chính', 'Kết quả kinh doanh', 'Lưu chuyển tiền tệ']);
  const codes = (sheet) => book[sheet].slice(4).map((r) => r[0]).filter(Boolean).map(String);
  assert.deepEqual(codes('Kết quả kinh doanh'), ['60'], 'KQKD chỉ còn dòng được tick');
  assert.ok(codes('Tình hình tài chính').includes('111'), 'bảng khác không bị bỏ tick');

  // Form chi tiết elevaTO: tải thẳng, không cần đưa file model vào
  const mdl = await download(page, () => page.click('#exportBox button:has-text("Tải Form chi tiết elevaTO")'));
  assert.match(mdl.name, /Form chi tiet elevaTO\.xlsx$/);
  const mBook = await page.evaluate(async (b64) => {
    const wb = window.XLSX.read(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { type: 'array' });
    return Object.fromEntries(wb.SheetNames.map((n) => [n, window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })]));
  }, (await readFile(mdl.path)).toString('base64'));
  assert.ok(Object.keys(mBook).includes('Kết quả kinh doanh'), Object.keys(mBook).join(' | '));
  const kq = mBook['Kết quả kinh doanh'].slice(4);
  const dt = kq.find((r) => r[1] === 'Doanh thu thuần');
  assert.ok(dt && dt.slice(2).some((v) => Number(v) === 500000), `doanh thu 500.000 triệu: ${JSON.stringify(dt)}`);

  // Đổi đơn vị trong file: số đổi theo, số gốc trên trang giữ nguyên
  await page.selectOption('#exportBox .unit-pick select', '1000000000');
  const ty = await download(page, () => page.click('#exportBox button:has-text("Tải Form chi tiết elevaTO")'));
  const tyBook = await page.evaluate(async (b64) => {
    const wb = window.XLSX.read(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets['Kết quả kinh doanh'], { header: 1 });
  }, (await readFile(ty.path)).toString('base64'));
  const dtTy = tyBook.slice(4).find((r) => r[1] === 'Doanh thu thuần');
  assert.ok(dtTy.slice(2).some((v) => Number(v) === 500), `đơn vị tỷ đồng: ${JSON.stringify(dtTy)}`);

  // Tải lại trang → mở lại phiên tự lưu, không gọi thêm AI
  await page.waitForTimeout(1000);                                   // autosave (0,8 giây)
  const before = aiCalls.length;
  await page.reload();
  await page.click('h2#h3');                                           // thao tác khác trước khi chọn "Mở lại"
  await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(() => localStorage.getItem('elevato-ai-session:hv@elevato.vn')), 'phiên cũ không bị xoá khi chưa chọn');
  await page.click('#restore button:has-text("Mở lại")');
  await page.waitForSelector('td.v[data-k="BS:111"][data-p="FY2025"]');
  assert.equal(aiCalls.length, before);

  // Đăng xuất → về màn đăng nhập; đăng nhập lại người khác không thấy phiên làm việc của người trước.
  await page.click('#acct summary');
  await page.click('#acct button:has-text("Đăng xuất")');
  await page.waitForSelector('#gate .auth-card');
  assert.equal(await page.evaluate(() => localStorage.getItem('elevato-ai-phien')), null);
  await page.click('#tab-signup');
  await page.fill('#suTen', 'Người Khác'); await page.fill('#suEmail', 'khac@elevato.vn');
  await page.fill('#suSdt', '0912345678'); await page.fill('#suPass', 'mat-khau-456');
  await page.click('#signupForm button[type=submit]');
  await page.waitForSelector('#app:not([hidden])');
  assert.equal(await page.locator('#restore .banner').count(), 0, 'không mời mở phiên của tài khoản khác');
  assert.deepEqual(errors, [], 'không có lỗi JavaScript trên trang');
});

test('chưa cài máy chủ: màn chào báo đang cài đặt, không cho đăng nhập', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage({ configured: false });
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#gate .msg.warn:has-text("đang được cài đặt")');
  assert.equal(await page.locator('#loginForm button[type=submit]').isDisabled(), true);
  assert.deepEqual(errors, []);
});

test('phiên hết hạn khi đang dùng → tự về màn đăng nhập kèm lời nhắn', { timeout: 60_000 }, async () => {
  const { page } = await newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;                       // chỉ gieo phiên cũ ở lần mở đầu
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('elevato-ai-phien', JSON.stringify({ token: 'EZZZZZ.' + '0'.repeat(64), me: { ten: 'Cũ', email: 'cu@x.vn', luot: { dung: 0, han: 5 } } }));
  });
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#gate .msg.warn:has-text("Phiên đăng nhập đã hết")');
});

test('file Excel có cột Mã số: đọc không cần AI, thiếu ngày thì người dùng nhập ở bước 4', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage();
  accounts.set('xls@elevato.vn', { ten: 'Excel', email: 'xls@elevato.vn', mk: 'x', token: TOKEN('xls@elevato.vn') });
  await page.addInitScript((t) => localStorage.setItem('elevato-ai-phien', JSON.stringify({ token: t, me: { ten: 'Excel', email: 'xls@elevato.vn', luot: { dung: 0, han: 5 } } })), TOKEN('xls@elevato.vn'));
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app:not([hidden])');
  await page.addScriptTag({ url: '/ai/vendor/sheetjs/xlsx.full.min.js' });
  const b64 = await page.evaluate((items) => {
    const aoa = [['CÔNG TY ABC'], ['BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH'], ['Đơn vị tính: triệu đồng'], ['Chỉ tiêu', 'Mã số', 'Thuyết minh', 'Năm nay', 'Năm trước'],
      ...items.map((i) => [i.n, i.c, '', i.v, i.p])];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'KQKD');
    const u8 = new Uint8Array(window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    let s = ''; u8.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s);
  }, itemsOf('IS').map((i) => ({ ...i, v: i.v.replace(/\.000\.000$/, ''), p: i.p.replace(/\.000\.000$/, '') })));
  const xls = join(tmp, 'kqkd.xlsx');
  await writeFile(xls, Buffer.from(b64, 'base64'));
  await page.setInputFiles('#fileInput', xls);
  await page.waitForSelector('#fileList .file:has-text("Không cần AI")');
  await page.waitForSelector('#sources .tag.red:has-text("ngày kết thúc")');
  await page.locator('#sources input[type=date]').fill('2025-12-31');
  await page.locator('#sources input[type=date]').dispatchEvent('change');
  await page.waitForSelector('td.v[data-k="IS:10"][data-p="FY2025"]');
  assert.equal(await page.locator('td.v[data-k="IS:10"][data-p="FY2025"]').innerText(), '500.000');
  assert.equal(await page.locator('td.v[data-k="IS:11"][data-p="FY2024"]').innerText(), '270.000', 'giá vốn: số dương, cột năm trước');
  assert.deepEqual(errors, []);
});

async function readXlsxCell(page, path, sheet, refRe) {
  const b64 = (await readFile(path)).toString('base64');
  return page.evaluate(async ({ b64, sheet, re }) => {
    const x = await import('/ai/js/core/xlsx.js');
    const zip = await window.JSZip.loadAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const wb = await zip.file('xl/workbook.xml').async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const ss = zip.file('xl/sharedStrings.xml');
    const cells = x.readCells(await zip.file(x.sheetPathByName(wb, rels, sheet)).async('string'), ss ? x.parseSharedStrings(await ss.async('string')) : []);
    const rx = new RegExp(re);
    return Object.fromEntries(Object.entries(cells).filter(([k]) => rx.test(k)));
  }, { b64, sheet, re: refRe.source });
}
