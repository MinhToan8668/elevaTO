// E2E: chạy trang thật trong Chromium, máy chủ AI được giả lập (không tốn lượt, không cần key).
//   cd ai && npm run e2e
// Tuỳ chọn: DGW_MODEL=/đường/dẫn/model.xlsx FORM_2026=/đường/dẫn/form.xlsx để thử điền file thật.
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
const API = 'https://script.google.com/macros/s/AKfycbE2E_TEST_DEPLOYMENT_ID_0123456789/exec';

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
const itemsOf = (st) => CHART.filter((i) => i.st === st && Number.isFinite(DATA[st][`${st}:${i.code}`]))
  .map((i) => ({ c: i.code, n: i.label, v: vn(DATA[st][`${st}:${i.code}`]), p: vn(DATA[st][`${st}:${i.code}`] * 0.9) }));

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

// ─── Máy chủ AI giả ────────────────────────────────────────
const aiCalls = [];
function fakeAI(body) {
  if (body.action === 'ping') return { ok: true, data: { name: 'Học viên E2E', quota: { used: 0, limit: 50 }, models: [{ id: 'gemini-2.5-flash' }, { id: 'gemini-3.0-flash' }, { id: 'gemini-3.0-flash-lite' }] } };
  const parts = body.contents[0].parts;
  const prompt = parts.find((p) => p.text).text;
  aiCalls.push({ model: body.model, mimes: parts.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType), prompt: prompt.slice(0, 40) });
  const meta = { don_vi: 'VND', ngay_ket_thuc: '31/12/2025', so_thang: '12', thong_tu: '99/2025/TT-BTC', ten_cong_ty: 'CTCP Thử Nghiệm', phuong_phap: 'gian_tiep' };
  let out;
  if (/TÌNH HÌNH TÀI CHÍNH/.test(prompt)) out = { meta, items: itemsOf('BS') };
  else if (/KẾT QUẢ HOẠT ĐỘNG/.test(prompt)) out = { meta, items: itemsOf('IS') };
  else if (/LƯU CHUYỂN TIỀN TỆ/.test(prompt)) out = { meta, items: itemsOf('CF') };
  else if (/BỘ PHẬN/.test(prompt)) out = { meta: { don_vi: 'VND' }, segments: [{ ten: 'Bán lẻ', doanh_thu: '400.000.000.000', loi_nhuan_gop: '150.000.000.000' }, { ten: 'Bán buôn', doanh_thu: '100.000.000.000', loi_nhuan_gop: '50.000.000.000' }] };
  else return { ok: false, code: 'bad', error: 'prompt lạ' };
  return { ok: true, data: { text: JSON.stringify(out), finishReason: 'STOP', tokens: 100 } };
}

// ─── Máy chủ tĩnh ─────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };
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

async function newPage() {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.route('https://script.google.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeAI(body)) });
  });
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

test('luồng chính: kết nối qua link → tải PDF → nhận trang → trích xuất → sửa ô → xuất file → mở lại phiên', { timeout: 180_000 }, async () => {
  // PDF BCTC giả dựng bằng chính Chromium
  const maker = await browser.newPage();
  await maker.setContent(reportHtml());
  const pdfPath = join(tmp, 'BCTC-2025.pdf');
  await writeFile(pdfPath, await maker.pdf({ format: 'A4' }));
  await maker.close();

  const { page, errors } = await newPage();
  let pings = 0;
  page.on('request', (r) => { if (r.url().startsWith('https://script.google.com/') && /"ping"/.test(r.postData() || '')) pings++; });
  await page.goto(`${base}/ai/#api=${encodeURIComponent(API)}&code=HV-E2E`);
  // Máy chủ lạ (chưa từng kết nối, không phải máy chủ chính thức): điền sẵn, cảnh báo, chờ người dùng bấm.
  await page.waitForSelector('#connectBox .msg.warn:has-text("chưa từng kết nối")');
  assert.equal(pings, 0, 'không tự gửi mã tới máy chủ lạ');
  await page.click('#connectBtn');
  await page.waitForFunction(() => document.querySelector('#connText').textContent.includes('Học viên E2E'));
  assert.equal(new URL(page.url()).hash, '', 'mã truy cập không nằm lại trên thanh địa chỉ');
  assert.equal(await page.locator('#modelSel').inputValue(), 'gemini-3.0-flash', 'model mặc định: flash mới nhất, không lite');
  assert.equal(await page.evaluate(() => typeof window.XLSX), 'undefined', 'thư viện Excel chỉ nạp khi cần');

  await page.setInputFiles('#fileInput', pdfPath);
  await page.waitForSelector('#fileList .file:has-text("tìm thấy CĐKT, KQKD, LCTT")', { timeout: 30_000 });
  const sum = await page.locator('#pageMaps details summary').innerText();
  assert.match(sum, /CĐKT: 2/); assert.match(sum, /KQKD: 3/); assert.match(sum, /LCTT: 4/);
  assert.equal(await page.locator('#pageMaps .th').count(), 5);
  await page.waitForFunction(() => [...document.querySelectorAll('#pageMaps .img')].every((el) => el.style.backgroundImage || el.classList.contains('noimg')));
  const noimg = await page.locator('#pageMaps .img.noimg').evaluateAll((els) => els.map((e) => e.title));
  assert.deepEqual(noimg, [], 'ảnh thu nhỏ vẽ được mọi trang');
  await shot(page, '1-trang');
  if (process.env.E2E_SHOTS) await page.locator('#pageMaps .thumbs').screenshot({ path: join(process.env.E2E_SHOTS, '1b-thumbs.png') });
  assert.match(await page.locator('#pageMaps .grp:has-text("mảng") input').inputValue(), /^5$/);

  await page.click('#runBtn');
  await page.waitForSelector('#review .sum .pc', { timeout: 60_000 });
  assert.ok(aiCalls.length >= 4, `gọi AI ${aiCalls.length} lần`);
  assert.ok(aiCalls.every((c) => c.model === 'gemini-3.0-flash' && c.mimes.every((m) => m === 'application/pdf')), JSON.stringify(aiCalls));

  const pills = await page.locator('#review .sum .pc').allInnerTexts();
  assert.deepEqual(pills, ['Năm 2024: ✓ khớp', 'Năm 2025: ✓ khớp'], 'số AI chép khớp mọi dòng tổng');
  await shot(page, '2-ra-soat');
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
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, '4-mobile', { fullPage: false });
  await page.setViewportSize({ width: 1360, height: 900 });

  // Tick bỏ bớt dòng rồi tải bảng chuẩn hoá
  await page.click('#review .tabs button:has-text("Kết quả KD")');
  await page.locator('#review table.g thead input[type=checkbox]').uncheck();
  await page.locator('#review tr:has(td.c:text-is("60")) input[type=checkbox]').check();
  const table = await download(page, () => page.click('#exportBox button:has-text("Tải bảng .xlsx")'));
  assert.match(table.name, /mau 2026\.xlsx$/);
  const rows = await page.evaluate(async (b64) => {
    const wb = window.XLSX.read(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  }, (await readFile(table.path)).toString('base64'));
  const at = (t) => rows.findIndex((r) => String(r[0]).startsWith(t));
  const codes = (from, to) => rows.slice(from + 2, to).map((r) => r[0]).filter(Boolean).map(String);
  assert.deepEqual(codes(at('BÁO CÁO KẾT QUẢ'), at('BÁO CÁO LƯU CHUYỂN')), ['60'], 'KQKD chỉ còn dòng được tick');
  assert.ok(codes(at('BÁO CÁO TÌNH HÌNH'), at('BÁO CÁO KẾT QUẢ')).includes('111'), 'bảng khác không bị bỏ tick');

  if (process.env.DGW_MODEL) {
    const inputs = page.locator('#exportBox input[type=file]');
    const [d] = await Promise.all([page.waitForEvent('download'), inputs.nth(0).setInputFiles(process.env.DGW_MODEL)]);
    const out = join(tmp, d.suggestedFilename()); await d.saveAs(out);
    await page.waitForSelector('#exportBox .msg.ok');
    const v = await readXlsxCell(page, out, '03.Input_FS', /^[A-Z]+8$/);
    assert.ok(Object.values(v).includes(500000), `doanh thu 500.000 triệu ghi vào dòng 8: ${JSON.stringify(v)}`);
  }
  if (process.env.FORM_2026) {
    const inputs = page.locator('#exportBox input[type=file]');
    const [d] = await Promise.all([page.waitForEvent('download'), inputs.nth(1).setInputFiles(process.env.FORM_2026)]);
    const out = join(tmp, d.suggestedFilename()); await d.saveAs(out);
    const v = await readXlsxCell(page, out, 'Lưu trữ', /^[A-Z]+6$/);
    assert.ok(Object.values(v).includes('FY-2025'), JSON.stringify(v));
  }

  // Lưu phiên → tải lại trang → mở lại, không gọi thêm AI
  const sess = await download(page, () => page.click('#exportBox button:has-text("Lưu phiên")'));
  assert.ok(!(await readFile(sess.path, 'utf8')).includes('HV-E2E'), 'file phiên không chứa mã truy cập');
  await page.waitForTimeout(1000);                                   // autosave (0,8 giây)
  const before = aiCalls.length;
  await page.reload();
  await page.click('#pickBox .preset:has-text("Chỉ 3 báo cáo")');       // thao tác khác trước khi chọn "Mở lại"
  await page.waitForTimeout(1000);
  assert.ok(await page.evaluate(() => localStorage.getItem('elevato-ai-session')), 'phiên cũ không bị xoá khi chưa chọn');
  await page.click('#restore button:has-text("Mở lại")');
  await page.waitForSelector('td.v[data-k="BS:111"][data-p="FY2025"]');
  assert.equal(aiCalls.length, before);
  assert.deepEqual(errors, [], 'không có lỗi JavaScript trên trang');
});

test('file Excel có cột Mã số: đọc không cần AI, thiếu ngày thì người dùng nhập ở bước 5', { timeout: 60_000 }, async () => {
  const { page, errors } = await newPage();
  await page.goto(`${base}/ai/`);
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
