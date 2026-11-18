// E2E: mở index.html thật trong Chromium, chế độ lưu trên máy (không cần Firebase), AI Gemini giả lập.
//   cd bangke && npm run e2e        (E2E_SHOTS=/thư/mục để chụp màn hình)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { XLSX, bangKeVay, toXlsx } from '../load.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '';
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) {
    return import(pathToFileURL(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href);
  }
}
let server, base, browser, dir;
before(async () => {
  server = http.createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
    try {
      const body = await readFile(join(ROOT, p));
      res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' }[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  const pw = await loadPlaywright();
  browser = await pw.chromium.launch(process.env.E2E_CHROME ? { executablePath: process.env.E2E_CHROME } : {});
  dir = await mkdtemp(join(tmpdir(), 'bangke-'));
});
after(async () => { await browser?.close(); server?.close(); });

async function newPage() {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const vendor = await readFile(join(ROOT, 'vendor/xlsx-js-style.bundle.js'));
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ body: vendor, contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  page.on('pageerror', (e) => { throw e; });
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}
const shot = async (page, n) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, n + '.png'), fullPage: false }); };

test('tải bảng kê → kiểm tra giải ngân nhầm → hồ sơ gốc → xuất Excel → còn dữ liệu khi mở lại', async () => {
  const f1 = join(dir, 'BANG_KE_VAY_KU1.xlsx');
  await writeFile(f1, toXlsx({ 'Bang ke': bangKeVay({ ku: '8800123(37).26', ngay: '24/03/2026', rows: [
    ['CÔNG TY TNHH THÉP HÒA BÌNH', 'HĐMB: 01/2025/HDMB/ABC-HB', '676', 46217, 1000000000, 400000000, 400000000],
    ['CÔNG TY TNHH PIN ĐIỆN SAO MAI', 'HĐMB: 02/01_2025/ABC-SM', '17517', 46217, 295378410, 295378410, 295378410],
  ] }) }));
  const f2 = join(dir, 'BANG_KE_VAY_KU2.xlsx');
  await writeFile(f2, toXlsx({ 'Bang ke': bangKeVay({ ku: '8800123(38).26', ngay: '02/04/2026', rows: [
    ['Công ty TNHH Thép Hòa Bình', 'HĐMB: 01/2025/HDMB/ABC-HB', '676', 46217, 1000000000, 600000000, 600000000],   // GN tiếp phần còn lại
    ['Công Ty TNHH Pin Điện Sao Mai', '', '17517', 46217, 295378410, 295378410, 295378410],                 // gửi nhầm HĐ đã GN đủ
  ] }) }));

  const { ctx, page } = await newPage();
  await page.goto(base + 'index.html');
  await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

  // ── bảng kê 1
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f1);
  await page.locator('.note.ok', { hasText: 'Không thấy hóa đơn nào' }).waitFor();
  assert.equal(await page.inputValue('#iNew'), 'CÔNG TY TNHH MTV SẢN XUẤT THỬ NGHIỆM', 'gợi ý tên KH từ dòng đầu file');
  assert.equal(await page.inputValue('[data-ki="so_kunn"]'), '8800123(37).26');
  assert.equal(await page.inputValue('[data-ki="ngay_gn"]'), '2026-03-24');
  await shot(page, '1-import');
  await page.click('#iSave');
  await page.locator('.kunn', { hasText: 'KUNN 8800123(37).26' }).waitFor();

  // ── bảng kê 2: phải bắt được hóa đơn đã giải ngân đủ
  await page.click('#bImp2');
  await page.setInputFiles('#iFile', f2);
  await page.locator('.note.err', { hasText: '1 dòng có dấu hiệu giải ngân nhầm' }).waitFor();
  const rows = page.locator('.modal tbody tr');
  assert.match(await rows.nth(0).innerText(), /GN tiếp phần còn lại[\s\S]*8800123\(37\)\.26[\s\S]*400\.000\.000[\s\S]*\b0\b/);
  assert.match(await rows.nth(1).innerText(), /ĐÃ GIẢI NGÂN ĐỦ trước đó/);
  await shot(page, '2-check');
  await page.click('#iSave');                // hộp xác nhận "vẫn lưu" được bấm OK
  await page.locator('.kunn', { hasText: 'KUNN 8800123(38).26' }).waitFor();
  assert.match(await page.locator('.tab', { hasText: 'Cảnh báo' }).innerText(), /Cảnh báo\s*1/);

  // ── theo dõi hóa đơn: HĐ 676 GN qua 2 KUNN = đủ
  await page.click('[data-tab="inv"]');
  const r676 = page.locator('tr', { hasText: '676' });
  assert.match(await r676.innerText(), /Đã GN đủ/);
  assert.match(await page.locator('tr', { hasText: '17517' }).innerText(), /VƯỢT tiền HĐ/);

  // ── hồ sơ gốc: đánh dấu nhận đủ KUNN 37
  await page.click('[data-tab="goc"]');
  await page.locator('tr', { hasText: '8800123(37).26' }).locator('[data-g]').click();
  await page.locator('tr', { hasText: '8800123(37).26' }).waitFor({ state: 'detached' });
  await page.click('[data-tab="kunn"]');
  await page.click('[data-toggle] >> text=KUNN 8800123(38).26');
  await page.locator('[data-thieu]').first().fill('Biên bản giao hàng');
  await page.locator('[data-thieu]').first().press('Tab');
  await page.locator('.kunn', { hasText: '8800123(38).26' }).locator('.pill', { hasText: 'Nhận thiếu' }).waitFor();
  await shot(page, '3-kunn');

  // ── xuất Excel
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bExport')]);
  const out = join(dir, 'out.xlsx');
  await dl.saveAs(out);
  const wb = XLSX.read(await readFile(out));
  assert.deepEqual(wb.SheetNames, ['Bảng kê tổng hợp', 'Theo dõi hóa đơn', 'Cảnh báo', 'Hồ sơ gốc chưa đủ']);
  const g = XLSX.utils.sheet_to_json(wb.Sheets['Bảng kê tổng hợp'], { header: 1, defval: '' });
  assert.equal(g[3][0], 'SỐ KUNN');
  assert.equal(g[4][0], '8800123(37).26');
  assert.equal(g[4][17], 'Đã nhận đủ');
  assert.ok(g.some((r) => r[16] === 'ĐÃ GIẢI NGÂN ĐỦ trước đó'));

  // ── mở lại trang: dữ liệu còn (IndexedDB), tổng quan có số liệu
  await page.reload();
  await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  const dash = page.locator('tr', { hasText: 'SẢN XUẤT THỬ NGHIỆM' });
  assert.match(await dash.innerText(), /\b2\b[\s\S]*1\.590\.756\.820/);
  await shot(page, '4-dashboard');
  await ctx.close();
});

test('AI nhận dạng cột cho bảng kê không có tiêu đề quen thuộc', async () => {
  const f = join(dir, 'LA.xlsx');
  await writeFile(f, toXlsx({ 'Data': [
    ['Đề nghị giải ngân ngày 10/05/2026, giấy nhận nợ 99/2026'],
    ['#', 'Đơn vị', 'Chứng từ', 'Lập ngày', 'Giá trị', 'Xin vay'],
    [1, 'Công ty Alpha', 'AA-1', '01/05/2026', '5.000.000', '5.000.000'],
    [2, 'Công ty Beta', 'BB-2', '02/05/2026', '8.000.000', '3.000.000'],
  ] }));
  const { ctx, page } = await newPage();
  await page.addInitScript(() => localStorage.setItem('finlens_ai_settings_v1', JSON.stringify({ keys: [{ key: 'AIzaTEST-KEY-1234567890', on: true }], model: 'gemini-3.6-flash', active: 0 })));
  let prompt = '';
  const reply = { sheet: 'Data', header_row: 2, columns: { stt: 'A', ncc: 'B', so_hd: 'C', ngay_hd: 'D', tien_hd: 'E', tien_gn: 'F' }, kunn: { so_kunn: '99/2026', ngay_gn: '2026-05-10' }, note: 'Bảng không ghi chữ "hóa đơn"' };
  await page.route(/aiplatform\.googleapis\.com|generativelanguage\.googleapis\.com/, async (r) => {
    prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text;
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] }) });
  });
  await page.goto(base + 'index.html');
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f);
  await page.locator('.note.err', { hasText: 'Chưa đọc được dòng hóa đơn nào' }).waitFor();
  await page.fill('#iNew', 'Công ty Gamma');
  await page.click('#iAI');
  await page.locator('.note', { hasText: 'Bảng không ghi chữ' }).waitFor();
  assert.match(prompt, /\[3\] A: 1 \| B: Công ty Alpha/);
  assert.equal(await page.inputValue('[data-ki="so_kunn"]'), '99/2026');
  assert.equal(await page.locator('.modal tbody tr').count(), 2);
  assert.match(await page.locator('#iSum').innerText(), /1 KUNN · 2 dòng · 8\.000\.000/);
  await page.click('#iSave');
  await page.locator('.kunn', { hasText: 'KUNN 99/2026' }).waitFor();
  await ctx.close();
});
