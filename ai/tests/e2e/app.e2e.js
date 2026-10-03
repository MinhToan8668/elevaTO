// E2E: chạy trang thật trong Chromium, máy chủ AI được giả lập (không tốn lượt, không cần key).
//   cd ai && npm run e2e
// Tuỳ chọn: E2E_SHOTS=/thư/mục để chụp màn hình từng bước.
//           E2E_CHROME=/đường/dẫn/chrome để dùng Chromium có sẵn trên máy.
// Cần playwright (npm i -D playwright, hoặc bản cài toàn cục). Không cần mạng: thư viện nằm trong vendor/,
// máy chủ AI được giả lập, phông chữ nằm sẵn trong vendor/fonts.

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
// Máy chủ giả phải đứng ở ĐÚNG địa chỉ trang được phép gọi: CSP trong ai/index.html chỉ mở
// connect-src tới địa chỉ khai trong js/config.js. Lấy thẳng từ đó nên hai bên không lệch được —
// bài kiểm tra vì thế canh luôn cả CSP, chứ trước đây nó trỏ sang một địa chỉ bịa và lặng lẽ
// hỏng khi trang đổi máy chủ.
const API = /export const API = '([^']+)';/.exec(
  await readFile(new URL('../../js/config.js', import.meta.url), 'utf8'),
)[1];
const API_GOC = new URL(API).origin;

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
const UNG_HO = { bin: '970436', bank: 'Vietcombank', stk: '1012345678', chu_tk: 'NGUYEN HOANG TRIEU VO', loi_nhan: 'Ung ho elevaTO' };
const maDatLai = new Map();                 // email → mã 6 số máy chủ vừa gửi

function fakeAI(body) {
  const fail = (code, error) => ({ ok: false, code, error });
  if (body.action === 'ungho') return { ok: true, data: { ungho: UNG_HO } };
  if (body.action === 'quenmk') {
    if (accounts.has(body.email)) maDatLai.set(body.email, '24681357');
    return { ok: true, data: { daGui: true, phut: 15 } };
  }
  if (body.action === 'datlaimk') {
    const a = accounts.get(body.email);
    if (!a || maDatLai.get(body.email) !== body.ma) return fail('ma_sai', 'Mã chưa đúng hoặc đã hết hiệu lực — xin mã mới nếu cần');
    maDatLai.delete(body.email);
    a.mk = body.mk;
    a.token = TOKEN(`${a.email}-moi`);
    return { ok: true, data: { token: a.token, me: ME(a) } };
  }
  if (body.action === 'dangky') {
    if (accounts.has(body.email)) return fail('da_ton_tai', 'Email này đã có tài khoản — đăng nhập nhé');
    // Máy chủ thật đòi đủ các ô khai báo — bắt chước ở đây để E2E chứng minh trang có gửi đi.
    if (!(Number(body.tuoi) >= 12 && Number(body.tuoi) <= 100)) return fail('tuoi_sai', 'Tuổi chưa đúng');
    if (!String(body.nghe_nghiep || '').trim()) return fail('thieu', 'Cho biết nghề nghiệp');
    if (!String(body.muc_dich || '').trim()) return fail('thieu', 'Cho biết mục đích dùng');
    // Ai đăng ký cũng ở mức thường; học viên / giảng viên do quản trị xếp bằng bot Telegram.
    const a = { ten: body.ten, email: body.email, mk: body.mk, token: TOKEN(body.email), vaitro: 'free',
      khai: { tuoi: Number(body.tuoi), nghe_nghiep: body.nghe_nghiep, muc_dich: body.muc_dich } };
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
  // E2E_CHROME=/đường/dẫn/chrome khi máy đã có sẵn Chromium nhưng không đúng bản Playwright
  // muốn tải (hay máy không được ra mạng để tải). Bỏ trống thì dùng bản Playwright tự quản.
  browser = await pw.chromium.launch({
    ...(process.env.E2E_CHROME ? { executablePath: process.env.E2E_CHROME } : {}),
    env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  });
  tmp = await mkdtemp(join(tmpdir(), 'elevato-e2e-'));
});
after(async () => { await browser?.close(); server?.close(); });

// locale: trang tự chọn ngôn ngữ theo trình duyệt khi người dùng chưa chọn — đặt rõ để bài kiểm tra không
// phụ thuộc ngôn ngữ mặc định của Chromium (en-US).
async function newPage({ configured = true, locale = 'vi-VN' } = {}) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 }, locale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route((u) => u.origin === API_GOC, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeAI(body)) });
  });
  // Test luôn gắn link máy chủ giả (hoặc để trống) thay cho link thật trong js/config.js.
  await page.route('**/ai/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `export const API = '${configured ? API : ''}';` }));
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

/** PDF BCTC giả, dựng bằng chính Chromium — chỉ dựng một lần cho cả bộ kiểm tra. */
let pdfCho = null;
function bctcPdf() {
  pdfCho ||= (async () => {
    const maker = await browser.newPage();
    await maker.setContent(reportHtml());
    const path = join(tmp, 'BCTC-2025.pdf');
    await writeFile(path, await maker.pdf({ format: 'A4' }));
    await maker.close();
    return path;
  })();
  return pdfCho;
}

test('luồng chính: đăng ký → tải PDF → nhận trang → trích xuất → sửa ô → xuất file → mở lại phiên', { timeout: 180_000 }, async () => {
  const pdfPath = await bctcPdf();
  const { page, errors } = await newPage();
  await page.goto(`${base}/ai/`);
  // Chưa đăng nhập vẫn vào thẳng màn hình chính, không có tường đăng nhập ở cửa.
  await page.waitForSelector('#app .step');
  assert.equal(await page.locator('#authDlg[open]').count(), 0, 'không tự bật hộp đăng nhập');
  assert.equal(await page.locator('input[type=url], #apiIn, #codeIn').count(), 0);
  assert.ok(await page.locator('.top .logo-light').evaluate((img) => img.naturalWidth > 0), 'logo elevaTO hiện được');
  assert.match(await page.locator('#acct button').innerText(), /Đăng nhập \/ Đăng ký/);
  await shot(page, '0-vao-thang');
  if (process.env.E2E_SHOTS) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, '0-vao-thang-toi', { fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, '0-vao-thang-mobile', { fullPage: false });
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // Tải file, chọn trang — vẫn chưa cần tài khoản.
  await page.setInputFiles('#fileInput', pdfPath);
  await page.waitForSelector('#fileList .file:has-text("máy nhận ra CĐKT, KQKD, LCTT")');
  await page.waitForSelector('#pageMaps details.pmap');
  assert.equal(aiCalls.length, 0, 'chưa gọi AI lần nào khi chưa đăng nhập');

  assert.equal(await page.evaluate(() => typeof window.XLSX), 'undefined', 'thư viện Excel chỉ nạp khi cần');
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

  // Bấm "Trích xuất bằng AI" mới hiện hộp đăng ký — đây là chỗ đầu tiên cần tài khoản.
  assert.equal(aiCalls.length, 0, 'chưa gọi AI lần nào khi chưa đăng nhập');
  await page.click('#runBtn');
  await page.waitForSelector('#authDlg[open]');
  assert.match(await page.locator('#authDlg .auth-why').innerText(), /cần tài khoản/);
  await shot(page, '0b-hoi-dang-ky', { fullPage: false });
  await page.fill('#liEmail', 'hv@elevato.vn');
  await page.fill('#liPass', 'sai-mat-khau');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#authDlg .msg.err:has-text("chưa đúng")');
  await dangKy(page, { ten: 'Học viên E2E', email: 'hv@elevato.vn' });
  await page.waitForSelector('#authDlg:not([open])', { state: 'attached' });
  assert.equal(await page.locator('#acct .acct-name').innerText(), 'Học viên E2E');
  assert.deepEqual(accounts.get('hv@elevato.vn').khai,
    { tuoi: 24, nghe_nghiep: 'Chuyên viên phân tích', muc_dich: 'Dựng model forecast' },
    'trang gửi đủ tuổi / nghề nghiệp / mục đích');
  assert.equal(accounts.get('hv@elevato.vn').vaitro, 'free', 'ai đăng ký cũng ở mức thường');
  // Liên hệ hỗ trợ luôn hiện ở chân trang.
  assert.match(await page.locator('.foot-ct').innerText(), /Zalo 0376 292 148[\s\S]*minhtoantowork@gmail\.com/);
  // Đăng ký xong tự chạy tiếp việc đang dở, không bắt bấm lại.
  await page.waitForSelector('#review .sum .pc', { timeout: 60_000 });

  // Tài khoản thường: thẻ Form chi tiết elevaTO bị khoá
  assert.equal(await page.locator('#exportBox .cardx.locked').count(), 1, 'form elevaTO khoá với tài khoản thường');

  // Nâng lên học viên (quản trị xếp bằng bot Telegram) → mở khoá, không phải tự phong lúc đăng ký
  accounts.get('hv@elevato.vn').vaitro = 'hv';
  await page.reload();
  await page.setInputFiles('#fileInput', pdfPath);
  await page.waitForSelector('#pageMaps .tile');
  await page.click('#runBtn');                                   // đã đăng nhập: chạy thẳng, không hỏi lại
  assert.equal(await page.locator('#authDlg[open]').count(), 0, 'đã đăng nhập thì không hỏi lại');
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
  // Tài khoản thử nghiệm là học viên nên có cả sheet thuyết minh; dòng Năm / Actual-Forecast
  // đẩy phần số liệu xuống dòng 7 (chỉ số 6 trong mảng 0-based).
  assert.deepEqual(Object.keys(book).slice(0, 4), ['Tổng quan', 'Tình hình tài chính', 'Kết quả kinh doanh', 'Lưu chuyển tiền tệ']);
  assert.ok(Object.keys(book).includes('Mảng kinh doanh'), Object.keys(book).join(' | '));
  const codes = (sheet) => book[sheet].slice(6).map((r) => r[0]).filter(Boolean).map(String);
  assert.deepEqual(codes('Kết quả kinh doanh'), ['60'], 'KQKD chỉ còn dòng được tick');
  assert.ok(codes('Tình hình tài chính').includes('111'), 'bảng khác không bị bỏ tick');
  assert.equal(book['Kết quả kinh doanh'][4][1], 'Actual / Forecast', 'bố cục theo sheet của model');

  // Form chi tiết elevaTO: tải thẳng, không cần đưa file model vào
  const mdl = await download(page, () => page.click('#exportBox button:has-text("Tải Form chi tiết elevaTO")'));
  assert.match(mdl.name, /Form chi tiet elevaTO\.xlsx$/);
  const mBook = await page.evaluate(async (b64) => {
    const wb = window.XLSX.read(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { type: 'array' });
    return Object.fromEntries(wb.SheetNames.map((n) => [n, window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })]));
  }, (await readFile(mdl.path)).toString('base64'));
  // Sao y sheet 03.Input_FS của model: giữ nguyên số dòng, đơn vị triệu đồng để dán thẳng vào model.
  assert.deepEqual(Object.keys(mBook), ['Tổng quan', '03.Input_FS'], Object.keys(mBook).join(' | '));
  const ifs = mBook['03.Input_FS'];
  assert.equal(ifs[3][1], 'Năm', 'dòng 4 của model là dòng Năm');
  assert.equal(ifs[7][1], 'Net revenue', 'dòng 8 của model là Net revenue');
  assert.ok(ifs[7].slice(2).some((v) => Number(v) === 500000), `doanh thu 500 tỷ → 500.000 triệu: ${JSON.stringify(ifs[7])}`);

  // Đơn vị không còn chọn ở phần xuất mà chọn ngay trong file (sheet Tổng quan của Form chuẩn hóa).
  assert.equal(await page.locator('#exportBox .unit-pick').count(), 0, 'đã bỏ ô chọn đơn vị ở phần xuất');
  // BCTC mẫu in "Đơn vị tính: VND" nên ô chọn đơn vị trong file mở ra ở đồng.
  assert.equal(book['Tổng quan'][4][1], 'đồng', 'ô chọn đơn vị nằm trong file');
  assert.match(await page.locator('#exportBox .cardx .fine-l').first().innerText(), /ô chọn đơn vị, đổi là mọi sheet tự tính lại/);

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
  await page.waitForSelector('#app .step');
  await page.click('#acct button');
  await page.waitForSelector('#authDlg[open]');
  assert.equal(await page.evaluate(() => localStorage.getItem('elevato-ai-phien')), null);
  await dangKy(page, { ten: 'Người Khác', email: 'khac@elevato.vn' });
  await page.waitForSelector('#app .step');
  assert.equal(await page.locator('#restore .banner').count(), 0, 'không mời mở phiên của tài khoản khác');
  assert.deepEqual(errors, [], 'không có lỗi JavaScript trên trang');
});

test('chưa cài máy chủ: hộp đăng nhập báo đang cài đặt, không cho đăng nhập', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage({ configured: false });
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');
  await page.click('#acct button');
  await page.waitForSelector('#authDlg[open]');
  await page.waitForSelector('#authDlg .msg.warn:has-text("đang được cài đặt")');
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
  await page.waitForSelector('#authDlg[open] .auth-why:has-text("Phiên đăng nhập đã hết")');
});

test('file Excel có cột Mã số: đọc không cần AI, thiếu ngày thì người dùng nhập ở bước 4', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage();
  accounts.set('xls@elevato.vn', { ten: 'Excel', email: 'xls@elevato.vn', mk: 'x', token: TOKEN('xls@elevato.vn') });
  await page.addInitScript((t) => localStorage.setItem('elevato-ai-phien', JSON.stringify({ token: t, me: { ten: 'Excel', email: 'xls@elevato.vn', luot: { dung: 0, han: 5 } } })), TOKEN('xls@elevato.vn'));
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');
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

test('thương hiệu: phông Be Vietnam Pro nằm trong repo, logo lớn căn giữa thanh đầu trang, đổi theo giao diện sáng/tối', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage();
  // Chặn mọi lời gọi ra ngoài: trang phải tự đủ phông chữ.
  await page.route((u) => !u.href.startsWith(base) && u.origin !== API_GOC, (r) => r.abort());
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');
  await page.evaluate(() => document.fonts.ready);
  // Kiểm cả nét thường lẫn nét đậm, với chữ có dấu tiếng Việt (bộ ký tự 'vietnamese') và chữ latin.
  const nap = await page.evaluate(() => ['400 15px "Be Vietnam Pro"', '800 15px "Be Vietnam Pro"']
    .flatMap((f) => [document.fonts.check(f, 'Tải báo cáo'), document.fonts.check(f, 'elevaTO')]));
  assert.deepEqual(nap, [true, true, true, true], 'phông Be Vietnam Pro phải nạp được từ vendor/fonts');
  assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /Be Vietnam Pro/);

  // Logo nằm trên thanh đầu trang, cỡ lớn và căn giữa thanh — không còn dải logo riêng giữa trang.
  assert.equal(await page.locator('.bband, .logo-xl').count(), 0, 'đã bỏ dải logo giữa trang');
  const lon = page.locator('.top .brand .logo-light');
  assert.ok(await lon.evaluate((img) => img.naturalWidth > 0), 'logo tải được');
  assert.ok(await lon.evaluate((img) => img.getBoundingClientRect().height >= 50), 'logo trên thanh phải to');
  // Khẩu hiệu nằm sẵn trong logo nên không viết thêm dòng chữ trùng lặp.
  assert.equal(await page.locator('.tagline').count(), 0);
  assert.match(await lon.getAttribute('alt'), /Fuel Your Financial Journey/);
  const [bw, pw] = await page.locator('.top .brand').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, document.documentElement.clientWidth / 2];
  });
  assert.ok(Math.abs(bw - pw) < 2, `logo phải căn giữa thanh đầu trang (${bw} vs ${pw})`);
  // Logo không được đè lên tên công cụ bên trái hay cụm nút bên phải.
  const cham = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const b = r('.top .brand'), p = r('.top .product'), c = r('.top-r');
    return [p && p.right > b.left, c && c.left < b.right];
  });
  assert.deepEqual(cham, [false, false], 'logo chen vào tên công cụ hoặc cụm nút');

  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await page.locator('.top .brand .logo-light').isVisible(), false, 'giao diện tối: ẩn logo bản sáng');
  assert.ok(await page.locator('.top .brand .logo-dark').isVisible(), 'giao diện tối: hiện logo bản tối');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.deepEqual(errors, []);
});

test('chọn ngôn ngữ Anh / Việt: đổi tại chỗ, nhớ lựa chọn, tên chỉ tiêu và file Excel đổi theo', { timeout: 120_000 }, async () => {
  // Trình duyệt tiếng Anh: chưa chọn gì thì trang tự mở bằng tiếng Anh.
  const en = await newPage({ locale: 'en-US' });
  await en.page.goto(`${base}/ai/`);
  await en.page.waitForSelector('#app .step');
  assert.equal(await en.page.locator('#langSel').inputValue(), 'en', 'tự nhận ngôn ngữ trình duyệt');
  assert.match(await en.page.locator('#acct button').innerText(), /Sign in \/ Sign up/);
  await en.context.close();

  const { page, errors, context } = await newPage();
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');
  assert.equal(await page.locator('#langSel').inputValue(), 'vi', 'trình duyệt tiếng Việt → tiếng Việt');
  await page.click('#acct button');
  await page.waitForSelector('#authDlg[open]');
  assert.equal(await page.locator('#authDlg .auth-card h2').innerText(), 'Chào mừng bạn');

  await page.selectOption('#langSel', 'en');
  assert.equal(await page.locator('#authDlg .auth-card h2').innerText(), 'Welcome', 'đổi ngay, không nạp lại trang');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('.skip').innerText(), 'Skip to content', 'chữ trong HTML tĩnh cũng đổi');
  assert.equal(await page.locator('.rail a[data-step="2"] .t').innerText(), 'Upload statements');

  // Nhớ lựa chọn sang lần mở sau.
  await page.reload();
  await page.waitForSelector('#app .step');
  assert.equal(await page.locator('#langSel').inputValue(), 'en', 'lựa chọn đã lưu thắng ngôn ngữ trình duyệt');
  await page.click('#acct button');
  await page.waitForSelector('#authDlg[open]');
  assert.equal(await page.locator('#authDlg .auth-card h2').innerText(), 'Welcome');
  await shot(page, '5-dang-nhap-en');

  await dangKy(page, { ten: 'Nguyen Van An', email: 'en@elevato.vn', nn: 'Equity analyst', md: 'Building a forecast model' });
  await page.waitForSelector('#app .step');
  assert.equal(await page.locator('#h5').innerText(), 'Review & export');

  // Nạp số từ file Excel (không tốn lượt AI): bảng rà soát và file xuất ra đều bằng tiếng Anh.
  await page.setInputFiles('#fileInput', await bsXlsx(page));
  await page.waitForSelector('#sources input[type=date]');
  await page.locator('#sources input[type=date]').fill('2025-12-31');
  await page.locator('#sources input[type=date]').dispatchEvent('change');
  await page.waitForSelector('td.v[data-k="BS:280"][data-p="FY2025"]');
  assert.equal(await page.locator('#tab-BS').innerText(), 'Financial position',
    'TT99 đổi tên "Bảng cân đối kế toán" thành "Báo cáo tình hình tài chính" — bản Anh không lùi về "Balance sheet"');
  assert.equal(await page.locator('tr:has(td.c:text-is("280")) td.l').first().innerText(), 'TOTAL ASSETS',
    'tên chỉ tiêu BCTC cũng theo ngôn ngữ đã chọn');

  await shot(page, '5-ra-soat-en');
  const f = await download(page, () => page.click('#exportBox .cardx button.btn'));
  assert.match(f.name, /Standard 2026 form\.xlsx$/, 'tên file theo ngôn ngữ');
  const o = await readXlsxCell(page, f.path, 'Financial position', /^A[23]$/);
  assert.equal(o.A2, 'STATEMENT OF FINANCIAL POSITION');
  assert.match(o.A3, /^Unit as chosen on the Overview sheet/, 'đơn vị chọn trong file, chú thích cũng theo ngôn ngữ');
  const ov = await readXlsxCell(page, f.path, 'Overview', /^[AB]5$/);
  assert.equal(ov.A5, 'Display currency unit');
  assert.equal(ov.B5, 'million VND', 'nạp từ file Excel nên đơn vị mặc định là triệu đồng');

  // Trang PDF: nút trong bảng chọn trang nằm trong bộ nhớ đệm riêng — phải đổi chữ theo.
  await page.setInputFiles('#fileInput', await bctcPdf());
  await page.waitForSelector('#pageMaps details.pmap');
  assert.equal(await page.locator('#pageMaps .pick-bar button').first().innerText(), 'Suggested pages');

  // Quay lại tiếng Việt: bảng đang mở đổi ngay, không mất số.
  await page.selectOption('#langSel', 'vi');
  assert.equal(await page.locator('#tab-BS').innerText(), 'Tình hình tài chính');
  assert.equal(await page.locator('#pageMaps .pick-bar button').first().innerText(), 'Chọn gợi ý');
  assert.equal(await page.locator('tr:has(td.c:text-is("280")) td.l').first().innerText(), 'TỔNG CỘNG TÀI SẢN');
  assert.ok(await page.locator('td.v[data-k="BS:280"][data-p="FY2025"]').isVisible());
  assert.deepEqual(errors, []);
  await context.close();
});

/** File .xlsx có bảng cân đối kế toán, dựng ngay trong trang bằng SheetJS đã nhúng sẵn. */
async function bsXlsx(page) {
  await page.addScriptTag({ url: '/ai/vendor/sheetjs/xlsx.full.min.js' });
  const b64 = await page.evaluate((items) => {
    const aoa = [['CÔNG TY ABC'], ['BÁO CÁO TÌNH HÌNH TÀI CHÍNH'], ['Đơn vị tính: triệu đồng'],
      ['Chỉ tiêu', 'Mã số', 'Thuyết minh', 'Năm nay', 'Năm trước'],
      ...items.map((i) => [i.n, i.c, '', i.v, i.p])];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(aoa), 'CDKT');
    const u8 = new Uint8Array(window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    let s = ''; u8.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s);
  }, itemsOf('BS').map((i) => ({ ...i, v: i.v.replace(/\.000\.000$/, ''), p: i.p.replace(/\.000\.000$/, '') })));
  const path = join(tmp, 'cdkt-en.xlsx');
  await writeFile(path, Buffer.from(b64, 'base64'));
  return path;
}

test('ủng hộ: nút ở góc mở hộp có số tài khoản và mã QR dựng ngay trên máy', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage();
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');

  await page.click('#donateBtn');
  await page.waitForSelector('#ugDlg[open]');
  const than = page.locator('#ugDlg .ug-body');
  await than.locator('text=Vietcombank').waitFor();
  await than.locator('text=1012345678').waitFor();
  await than.locator('text=NGUYEN HOANG TRIEU VO').waitFor();

  // Mã QR vẽ bằng thư viện trong repo, không gọi dịch vụ sinh QR nào ra ngoài.
  const qr = page.locator('#ugDlg .ug-qr');
  await qr.waitFor();
  const co = await qr.evaluate((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let den = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 128) den += 1;
    return { w: cv.width, den };
  });
  assert.ok(co.w >= 100 && co.den > 500, JSON.stringify(co));

  // Chọn mức tiền → QR phải vẽ lại (nội dung khác vì thêm trường số tiền) và KHÔNG nhỏ đi.
  const anh = () => qr.evaluate((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
    return { w: cv.width, h };
  });
  const truoc = await anh();
  await page.click('#ugDlg .ug-amt button >> nth=0');
  await page.waitForFunction((cu) => {
    const cv = document.querySelector('#ugDlg .ug-qr');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
    return h !== cu;
  }, truoc.h);
  const sau = await anh();
  assert.ok(sau.w >= truoc.w - 1, `ô QR nhỏ dần qua mỗi lần vẽ: ${truoc.w} → ${sau.w}`);
  assert.equal(await page.locator('#ugDlg .ug-amt button').first().getAttribute('aria-pressed'), 'true');

  // Bấm lại mức đang chọn là bỏ số tiền, QR trở về như cũ.
  await page.click('#ugDlg .ug-amt button >> nth=0');
  await page.waitForFunction((cu) => {
    const cv = document.querySelector('#ugDlg .ug-qr');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i]) >>> 0;
    return h === cu;
  }, truoc.h);

  // Nút tải mã QR: ảnh phải vẽ lại ở cỡ lớn chứ không chụp lại canvas 240px đang hiện —
  // ảnh tải về hay bị phóng to, gửi qua chat hay in ra, lấy bản nhỏ là máy quét đọc trượt.
  const tep = await download(page, () => page.click('#ugDlg .ug-tai'));
  assert.equal(tep.name, 'elevato-qr.png');
  const png = await readFile(tep.path);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'không phải file PNG');
  const rong = png.readUInt32BE(16), cao = png.readUInt32BE(20);   // IHDR: rộng ở byte 16, cao ở 20
  assert.equal(rong, cao, 'ảnh QR phải vuông');
  assert.ok(rong >= 900, `ảnh tải về mới ${rong}px, quá nhỏ để in hay phóng to`);

  // Chọn mức tiền rồi tải lại: tên file mang theo số tiền để khỏi lẫn giữa mấy bản.
  await page.click('#ugDlg .ug-amt button >> nth=0');
  const tep2 = await download(page, () => page.click('#ugDlg .ug-tai'));
  assert.equal(tep2.name, 'elevato-qr-50k.png');

  // Không phải đăng nhập mới xem được, và không có yêu cầu nào ra miền lạ.
  assert.equal(await page.locator('#acct button').count(), 1);
  assert.deepEqual(errors, []);
});

// Người dùng hay kéo cả chục BCTC nhiều năm vào một lượt. Mỗi file tốn một lượt AI và làm trang
// nặng, mà BCTC đã kiểm toán vốn in sẵn hai năm nên hai file là đủ bốn năm model cần.
test('mở tối đa 2 báo cáo một lúc, và nút xoá hết để nhập công ty khác', { timeout: 120_000 }, async () => {
  const pdf = await bctcPdf();
  const { page, errors } = await newPage();
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');

  // Thả ba file một lượt: chỉ hai cái đầu vào, cái thứ ba phải báo rõ là bị bỏ chứ không im.
  await page.setInputFiles('#fileInput', [pdf, pdf, pdf]);
  await page.waitForFunction(() => document.querySelectorAll('#fileList li').length === 2);
  await page.locator('#toast:has-text("bỏ qua 1 file")').waitFor();
  assert.match(await page.locator('#fileBar .fine').innerText(), /Còn 0 chỗ/);

  // Đã đầy thì thêm nữa cũng không vào.
  await page.setInputFiles('#fileInput', pdf);
  await page.locator('#toast:has-text("bỏ qua 1 file")').waitFor();
  assert.equal(await page.locator('#fileList li').count(), 2, 'đã đầy mà vẫn nhận thêm file');

  // Xoá hết → danh sách trống, bảng chọn trang cũng trống theo.
  page.once('dialog', (d) => d.accept());
  await page.click('#fileBar button');
  await page.waitForFunction(() => document.querySelectorAll('#fileList li').length === 0);
  assert.equal(await page.locator('#fileBar button').count(), 0, 'xoá hết rồi mà thanh công cụ còn');
  assert.equal(await page.locator('#pageMaps .pmap').count(), 0, 'bảng chọn trang chưa dọn theo');

  // Xoá xong vẫn nhận công ty mới bình thường.
  await page.setInputFiles('#fileInput', pdf);
  await page.waitForFunction(() => document.querySelectorAll('#fileList li').length === 1);
  assert.match(await page.locator('#fileBar .fine').innerText(), /Còn 1 chỗ/);
  assert.deepEqual(errors, []);
});

// Đa số người xem vào bằng điện thoại. Thanh đầu trang AI từng nhồi logo + sáng/tối + ngôn ngữ
// + ủng hộ + đăng nhập thành 441px trên màn 390px: trang cuộn ngang được và nút đăng nhập bị đẩy
// lòi ra ngoài mép. Bài này canh cả BỐN trang, ở ba khổ máy hay gặp nhất.
test('điện thoại: không trang nào cuộn ngang, và nút bấm đủ to cho ngón tay', { timeout: 120_000 }, async () => {
  const KHO = [[390, 844, 'iPhone 12'], [375, 667, 'iPhone SE'], [360, 740, 'Android nhỏ']];
  const TRANG = ['/ai/', '/', '/links/', '/links/edit.html'];
  const { page } = await newPage();
  for (const [w, h, may] of KHO) {
    await page.setViewportSize({ width: w, height: h });
    for (const duong of TRANG) {
      await page.goto(base + duong);
      await page.waitForLoadState('networkidle');
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const be = [];
        for (const el of document.querySelectorAll('button,a,select,[role="button"]')) {
          const b = el.getBoundingClientRect();
          // Bỏ qua phần tử ẩn, và link nằm GIỮA CÂU CHỮ — WCAG 2.5.8 miễn cho loại đó vì
          // kích thước bị chiều cao dòng quyết định, nới ra là vỡ đoạn văn.
          if (!b.width || !b.height) continue;
          if (el.tagName === 'A' && getComputedStyle(el).display.startsWith('inline')
              && el.parentElement && el.parentElement.textContent.trim() !== el.textContent.trim()) continue;
          if (b.height < 24 || b.width < 24) be.push(`${el.tagName.toLowerCase()}.${el.className || '—'} ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
        return { tran: de.scrollWidth - de.clientWidth, be: [...new Set(be)] };
      });
      assert.equal(r.tran, 0, `${duong} @ ${may} ${w}px: cuộn ngang ${r.tran}px`);
      assert.deepEqual(r.be, [], `${duong} @ ${may} ${w}px: nút nhỏ hơn 24px`);
    }
  }
});

test('quên mật khẩu: xin mã qua email, nhập mã là đổi được mật khẩu và vào luôn', { timeout: 90_000 }, async () => {
  const { page, errors } = await newPage();
  await page.goto(`${base}/ai/`);
  await page.waitForSelector('#app .step');
  await page.click('#acct button');
  await page.waitForSelector('#authDlg[open]');
  await dangKy(page, { ten: 'Quên Mật Khẩu', email: 'quen@elevato.vn', mk: 'mat-khau-cu-1' });
  await page.waitForSelector('#acct .acct-name');

  // Đăng xuất rồi đi lại bằng đường quên mật khẩu.
  await page.click('#acct summary');
  await page.click('#acct button:has-text("Đăng xuất")');
  await page.waitForSelector('#acct button:has-text("Đăng nhập")');
  await page.click('#acct button');
  await page.waitForSelector('#authDlg[open]');
  await page.fill('#liEmail', 'quen@elevato.vn');
  await page.click('#loginForm .auth-link');
  await page.waitForSelector('#resetForm:not([hidden])');
  assert.equal(await page.locator('#qmEmail').inputValue(), 'quen@elevato.vn', 'mang sẵn email đã gõ ở ô đăng nhập');

  await page.click('#resetForm button[type=submit]');
  await page.waitForSelector('#authDlg .msg.ok:has-text("15 phút")');
  await page.waitForSelector('#qmStep2:not([hidden])');

  // Nhập sai mã → báo lỗi và đưa về bước 1 để xin mã mới, không bắt tải lại trang.
  await page.fill('#qmMa', '11111111');
  await page.fill('#qmPass', 'mat-khau-moi-1');
  await page.click('#resetForm button[type=submit]');
  await page.waitForSelector('#authDlg .msg.err');
  await page.locator('#qmStep2').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#resetForm button[type=submit]').innerText(), 'Gửi mã về email');
  assert.equal(await page.locator('#qmEmail').isEditable(), true, 'về bước 1 thì sửa lại email được');

  // Xin mã mới rồi nhập đúng.
  await page.click('#resetForm button[type=submit]');
  await page.waitForSelector('#qmStep2:not([hidden])');
  assert.equal(await page.locator('#qmEmail').isEditable(), false, 'bước 2 khoá email đã nhận mã');
  await page.fill('#qmMa', '24681357');
  await page.fill('#qmPass', 'mat-khau-moi-1');
  await page.click('#resetForm button[type=submit]');
  await page.waitForSelector('#acct .acct-name');
  assert.equal(accounts.get('quen@elevato.vn').mk, 'mat-khau-moi-1');
  assert.deepEqual(errors, []);
});

/** Điền và gửi form đăng ký trong hộp thoại. */
async function dangKy(page, { ten, email, sdt = '0901234567', mk = 'mat-khau-123', tuoi = '24',
  nn = 'Chuyên viên phân tích', md = 'Dựng model forecast' }) {
  await page.click('#tab-signup');
  await page.fill('#suTen', ten);
  await page.fill('#suTuoi', tuoi);
  await page.fill('#suEmail', email);
  await page.fill('#suSdt', sdt);
  await page.fill('#suNN', nn);
  await page.fill('#suMD', md);
  await page.fill('#suPass', mk);
  await page.click('#signupForm button[type=submit]');
}

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
