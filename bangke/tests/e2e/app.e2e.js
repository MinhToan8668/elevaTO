// E2E: chạy trong Chromium thật. Luồng chính chạy trên CHÍNH file gửi cho team (dist/BangKe_GiaiNgan.html, mở bằng
// file://, không mạng); AI Gemini giả lập; thư mục chung giả lập bằng thư mục riêng của trình duyệt (OPFS).
//   cd bangke && npm run e2e        (E2E_SHOTS=/thư/mục để chụp màn hình)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
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
  execFileSync(process.execPath, [join(ROOT, 'build.mjs')]);
});
const DIST = pathToFileURL(join(ROOT, 'dist/BangKe_GiaiNgan.html')).href;
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
  await page.route(/^https?:/, (r) => r.abort());          // file đóng gói phải chạy được khi không có mạng
  await page.goto(DIST);
  await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();

  // ── bảng kê 1
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f1);
  await page.locator('.verdict.ok', { hasText: 'ĐẠT — 2/2 hóa đơn hợp lệ' }).waitFor();
  assert.equal(await page.inputValue('#iNew'), 'CÔNG TY TNHH MTV SẢN XUẤT THỬ NGHIỆM', 'gợi ý tên KH từ dòng đầu file');
  assert.equal(await page.inputValue('[data-ki="so_kunn"]'), '8800123(37).26');
  assert.equal(await page.inputValue('[data-ki="ngay_gn"]'), '2026-03-24');
  await shot(page, '1-import');
  await page.click('#iSave');
  await page.locator('.kunn', { hasText: 'KUNN 8800123(37).26' }).waitFor();

  // ── bảng kê 2: phải bắt được hóa đơn đã giải ngân đủ
  await page.click('#bImp2');
  await page.setInputFiles('#iFile', f2);
  await page.locator('.verdict.err', { hasText: 'KHÔNG ĐẠT — 1/2 hóa đơn không được giải ngân' }).waitFor();
  assert.match(await page.locator('.vcard', { hasText: 'Đã giải ngân đủ trước đó' }).innerText(), /^1/);
  const rows = page.locator('.modal tbody tr');
  assert.match(await rows.nth(0).innerText(), /GN tiếp phần còn lại[\s\S]*8800123\(37\)\.26[\s\S]*400\.000\.000[\s\S]*\b0\b/);
  assert.match(await rows.nth(1).innerText(), /ĐÃ GIẢI NGÂN ĐỦ trước đó[\s\S]*không được GN lại/);
  await page.locator('.vcard', { hasText: 'Đã giải ngân đủ trước đó' }).click();     // lọc chỉ dòng lỗi
  assert.equal(await page.locator('.modal tbody tr').count(), 1);
  await page.locator('.vcard', { hasText: 'Đã giải ngân đủ trước đó' }).click();
  await shot(page, '2-check');
  await page.click('#iSave');                // hộp xác nhận "vẫn lưu" được bấm OK
  await page.locator('.kunn', { hasText: 'KUNN 8800123(38).26' }).waitFor();
  assert.match(await page.locator('.tab', { hasText: 'Cảnh báo' }).innerText(), /Cảnh báo\s*1/);

  // tra nhanh: hóa đơn 676 đã giải ngân đủ qua 2 KUNN; hóa đơn 999 chưa từng giải ngân
  await page.fill('#qInvT', '676');
  await page.press('#qInvT', 'Enter');
  assert.match(await page.locator('#lkR').innerText(), /676[\s\S]*ĐÃ GIẢI NGÂN ĐỦ[\s\S]*8800123\(37\)\.26[\s\S]*8800123\(38\)\.26/);
  await page.fill('#lkQ', '999');
  await page.locator('.verdict.ok', { hasText: 'Chưa thấy hóa đơn 999' }).waitFor();
  await page.locator('.modal [data-close]').first().click();

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
  if (!(await page.locator('.kunn', { hasText: '8800123(38).26' }).locator('[data-thieu]').count())) await page.click('[data-toggle] >> text=KUNN 8800123(38).26');   // nạp xong KUNN đã được mở sẵn
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

test('thư mục chung: máy này ghi tệp JSON, máy khác ghi vào thì bấm Đồng bộ ngay là nhận', async () => {
  const { ctx, page } = await newPage();
  // showDirectoryPicker (hộp chọn thư mục thật) → thay bằng thư mục riêng của trình duyệt để test tự động
  await page.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('O_CHUNG_TEAM', { create: true }); });
  await page.goto(base + 'index.html');
  await page.getByRole('heading', { name: 'Tổng quan' }).waitFor();
  // dữ liệu trên máy trước khi kết nối
  await page.click('#bAddCust');
  await page.fill('#cfName', 'Công ty Delta');
  await page.click('#cfSave');
  await page.locator('#custName', { hasText: 'Công ty Delta' }).waitFor();
  await page.click('#bSettings');
  await page.fill('#skUser', 'Minh Toan');
  await page.dispatchEvent('#skUser', 'change');
  await page.click('[data-sy="pick"]');                      // hộp xác nhận "gửi toàn bộ dữ liệu lên" → OK
  await page.locator('#syncBox', { hasText: 'Đang kết nối: O_CHUNG_TEAM' }).waitFor();
  const files = async () => page.evaluate(async () => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('O_CHUNG_TEAM')).getDirectoryHandle('BangKe_GiaiNgan');
    const out = {}; for await (const [n, h] of d.entries()) out[n] = JSON.parse(await (await h.getFile()).text()); return out;
  });
  await page.waitForFunction(async () => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('O_CHUNG_TEAM')).getDirectoryHandle('BangKe_GiaiNgan');
    for await (const [n] of d.entries()) if (n.startsWith('kh_')) return true; return false;
  });
  let fs1 = await files();
  const kh = Object.values(fs1).find((f) => f.type === 'kh');
  assert.equal(kh.data.name, 'Công ty Delta');
  assert.equal(kh.by, 'Minh Toan');

  // "máy khác" ghi một KUNN mới + một khách hàng mới vào thư mục chung
  await page.evaluate(async (cid) => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('O_CHUNG_TEAM')).getDirectoryHandle('BangKe_GiaiNgan');
    const put = async (name, env) => { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(JSON.stringify(env)); await w.close(); };
    const now = Date.now() + 5000;
    await put('ku_remote1.json', { app: 'bangke-gn', v: 1, type: 'ku', by: 'Tram Anh', dev: 'mayB', at: now, data: { id: 'remote1', customerId: cid, so_kunn: 'KU-TU-MAY-B', ngay_gn: '2026-05-02', ngay_dh: '', so_tien: null, lines: [{ id: 'l1', ncc: 'Công ty Epsilon', so_hd: '88', ngay_hd: '2026-04-30', tien_hd: 100, tien_gn: 100, goc: 'chua', thieu: '', ghi_chu: '' }], updatedAt: now, updatedBy: 'Tram Anh' } });
    await put('kh_remote2.json', { app: 'bangke-gn', v: 1, type: 'kh', by: 'Tram Anh', dev: 'mayB', at: now, data: { id: 'remote2', name: 'Công ty Zeta', updatedAt: now } });
  }, kh.data.id);
  await page.click('[data-sy="pull"]');
  await page.locator('#syncBox', { hasText: 'Tram Anh' }).waitFor();
  await page.locator('.modal [data-close]').first().click();
  await page.locator('#cList', { hasText: 'Công ty Zeta' }).waitFor();
  await page.locator('.kunn', { hasText: 'KUNN KU-TU-MAY-B' }).waitFor();

  // sửa ở máy này → tệp KUNN trong thư mục chung được ghi lại
  await page.click('[data-toggle] >> text=KUNN KU-TU-MAY-B');
  await page.click('[data-allgoc]');
  await page.waitForFunction(async () => {
    const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('O_CHUNG_TEAM')).getDirectoryHandle('BangKe_GiaiNgan');
    const j = JSON.parse(await (await (await d.getFileHandle('ku_remote1.json')).getFile()).text());
    return j.by === 'Minh Toan' && j.data.lines[0].goc === 'da_nhan';
  });
  fs1 = await files();
  assert.ok(Object.keys(fs1).some((n) => n.startsWith('nk_')), 'nhật ký cũng được ghi ra thư mục');
  await ctx.close();
});

test('ghi KUNN mới vào file bảng kê tổng hợp có sẵn (bỏ qua KUNN đã có) + dashboard có biểu đồ', async () => {
  const master = join(dir, 'BANG_KE_TONG_HOP.xlsx');
  const head = ['', 'SỐ KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐẾN HẠN', 'SỐ TIỀN', 'STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN (VNĐ)', 'SỐ TIỀN GIẢI  NGÂN (VNĐ)', 'TỔNG (VNĐ)', '', 'CHỨNG TỪ THIẾU CẦN BỔ SUNG'];
  await writeFile(master, toXlsx({
    'Ghi chu': [['Bảng theo dõi nội bộ']],
    'Sheet2': [head,
      ['', '5500777(1).25', 45700, 45850, 300, 1, 'Công ty Omega', 'HĐ 01', '11', 45690, 300, 300, 300, '', 'ok'],
      ['', '', '', '', '', 2, 'Công ty Omega', '', '12', 45690, 50, 50, '', '', 'ok']],
  }));
  const f = join(dir, 'TONG_HOP_MOI.xlsx');
  await writeFile(f, toXlsx({ 'Sheet2': [head,
    ['', '5500777(1).25', 45700, 45850, 300, 1, 'Công ty Omega', 'HĐ 01', '11', 45690, 300, 300, 300, '', 'ok'],
    ['', '5500777(9).26', 46100, 46280, 900, 1, 'Công ty Sigma', 'HĐ 07', '701', 46090, 1000, 600, 600, '', 'Biên bản giao hàng'],
    ['', '', '', '', '', 2, 'Công ty Sigma', '', '702', 46091, 300, 300, '', '', ''],
  ] }));
  const { ctx, page } = await newPage();
  await page.goto(base + 'index.html');
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f);
  await page.locator('#iSum', { hasText: '2 KUNN' }).waitFor();
  await page.fill('#iNew', 'Công ty Kappa');
  await page.click('#iSave');
  await page.locator('.kunn', { hasText: '5500777(9).26' }).waitFor();
  // tile + biểu đồ ở trang khách hàng
  assert.match(await page.locator('.tiles').innerText(), /Hồ sơ gốc đã nhận đủ\s*50%/);
  assert.equal(await page.locator('svg.viz rect[data-tip]').count(), 12);

  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bMaster')]);
  await fc.setFiles(master);
  await page.locator('.note.ok', { hasText: 'Sẽ thêm 1 KUNN · 2 dòng' }).waitFor();
  assert.match(await page.locator('.modal').innerText(), /Bỏ qua 1 KUNN đã có sẵn/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#mGo')]);
  assert.match(dl.suggestedFilename(), /^BANG_KE_TONG_HOP_capnhat_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const out = join(dir, 'master_out.xlsx'); await dl.saveAs(out);
  const wb = XLSX.read(await readFile(out));
  assert.deepEqual(wb.SheetNames, ['Ghi chu', 'Sheet2'], 'giữ nguyên các sheet');
  const g = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, { header: 1, raw: true, defval: '' });
  assert.equal(g.length, 5, 'dòng cũ giữ nguyên + 2 dòng mới');
  assert.deepEqual(g[1].slice(1, 3), ['5500777(1).25', 45700]);
  assert.deepEqual([g[3][1], g[3][2], g[3][4], g[3][6], g[3][8], g[3][11], g[3][14]], ['5500777(9).26', 46100, 900, 'Công ty Sigma', '701', 600, 'Biên bản giao hàng']);
  assert.deepEqual([g[4][1], g[4][5], g[4][8], g[4][9], g[4][11], g[4][14]], ['', 2, '702', 46091, 300, 'chưa nhận']);

  // dashboard tổng quan
  await page.click('#navAll');
  await page.locator('.panel h3', { hasText: 'Việc cần làm' }).waitFor();
  const t = await page.locator('.tiles').innerText();
  assert.match(t, /Khách hàng theo dõi\s*1/);
  assert.match(t, /KUNN quá hạn hồ sơ gốc\s*1/);
  assert.equal(await page.locator(".todo li").count(), 1);
  assert.match(await page.locator('.legend').first().innerText(), /Quá hạn\s+1\s+50%/);
  await shot(page, '5-dashboard');
  // bấm ô "KUNN quá hạn" → danh sách KUNN → bấm dòng → mở đúng KUNN ở bảng chi tiết từng hóa đơn
  await page.locator('.tile', { hasText: 'KUNN quá hạn hồ sơ gốc' }).click();
  await page.locator('#dSum', { hasText: '1 KUNN' }).waitFor();
  assert.match(await page.locator('#dB').innerText(), /Công ty Kappa\s+5500777\(9\)\.26/);
  await page.locator('#dB tr').first().click();
  await page.locator('#custName', { hasText: 'Công ty Kappa' }).waitFor();
  await page.locator('.kunn', { hasText: '5500777(9).26' }).locator('table').waitFor();
  assert.match(await page.locator('.kunn', { hasText: '5500777(9).26' }).locator('tbody').innerText(), /Công ty Sigma[\s\S]*701[\s\S]*702/);
  // bấm cột tháng trên biểu đồ → KUNN của tháng đó
  await page.click('#navAll');
  await page.locator('svg.viz rect.go').first().click();
  await page.locator('#dSum', { hasText: 'KUNN' }).waitFor();
  assert.notEqual(await page.inputValue('#dM'), '');
  await page.locator('.modal [data-close]').first().click();
  // ô "Còn lại chưa giải ngân" → danh sách hóa đơn GN 1 phần
  await page.locator('.tile', { hasText: 'Còn lại chưa giải ngân' }).click();
  assert.match(await page.locator('#hB').innerText(), /Công ty Sigma\s+701[\s\S]*1\.000[\s\S]*600[\s\S]*400/);
  await page.locator('.modal [data-close]').first().click();
  // việc cần làm → mở khách hàng
  await page.locator('.todo li').first().click();
  await page.locator('#custName', { hasText: 'Công ty Kappa' }).waitFor();
  await ctx.close();
});

test('kiểm tra xong nạp luôn: bỏ các dòng lỗi, chỉ nạp dòng hợp lệ, mở thẳng KUNN vừa nạp', async () => {
  const f1 = join(dir, 'KU_A.xlsx'), f2 = join(dir, 'KU_B.xlsx');
  await writeFile(f1, toXlsx({ 'Bang ke': bangKeVay({ ku: 'KU-A', ngay: '01/03/2026', rows: [['CÔNG TY TNHH LAMBDA', 'HĐ 1', '501', 46050, 1000, 1000, 1000]] }) }));
  await writeFile(f2, toXlsx({ 'Bang ke': bangKeVay({ ku: 'KU-B', ngay: '01/04/2026', rows: [
    ['CÔNG TY TNHH LAMBDA', 'HĐ 1', '501', 46050, 1000, 1000, 1000],      // đã GN đủ ở KU-A → lỗi
    ['CÔNG TY TNHH LAMBDA', '', '502', 46060, 700, 700, 700],             // mới
  ] }) }));
  const { ctx, page } = await newPage();
  await page.goto(base + 'index.html');
  await page.click('#bCheck');
  await page.setInputFiles('#iFile', f1);
  await page.locator('.verdict.ok').waitFor();
  await page.fill('#iNew', 'Công ty Mu');
  await page.locator('[data-save="all"]').click();                       // ĐẠT → nạp luôn từ khung kết luận
  await page.locator('.kunn', { hasText: 'KUNN KU-A' }).locator('table').waitFor();
  await page.click('#bCheck');
  await page.setInputFiles('#iFile', f2);
  await page.locator('.verdict.err', { hasText: 'KHÔNG ĐẠT — 1/2' }).waitFor();
  assert.match(await page.locator('[data-save="skip"]').innerText(), /Nạp 1 dòng hợp lệ \(700\), bỏ 1 dòng lỗi/);
  await page.locator('[data-save="skip"]').click();
  const k = page.locator('.kunn', { hasText: 'KUNN KU-B' });
  await k.locator('table').waitFor();                                     // mở thẳng KUNN vừa nạp
  const body = await k.locator('tbody').innerText();
  assert.match(body, /502/);
  assert.doesNotMatch(body, /501/, 'dòng lỗi không được nạp');
  assert.match(await page.locator('.tab', { hasText: 'Cảnh báo' }).innerText(), /Cảnh báo\s*0/);
  // sửa tay một dòng
  await k.locator('[data-editl]').first().click();
  await page.fill('#elSo', '503');
  await page.fill('#elGn', '650');
  await page.click('#elSave');
  await page.locator('.kunn', { hasText: 'KUNN KU-B' }).locator('tbody', { hasText: '503' }).waitFor();
  assert.match(await page.locator('.kunn', { hasText: 'KUNN KU-B' }).locator('tbody').innerText(), /503[\s\S]*700[\s\S]*650/);
  await ctx.close();
});

test('AI rà soát bảng kê đã lưu: tìm dòng lệch cột, AI đề xuất sửa, áp dụng vào sổ', async () => {
  const head = ['', 'SỐ KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐẾN HẠN', 'SỐ TIỀN', 'STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN (VNĐ)', 'SỐ TIỀN GIẢI  NGÂN (VNĐ)'];
  const f = join(dir, 'TH_LECH.xlsx');
  await writeFile(f, toXlsx({ 'Sheet2': [head,
    ['', 'K-NK', 45400, 45500, '', 1, 'Công ty A', 'HĐ 1', '11', 45390, 1000, 1000],
    ['', '', '', '', '', 2, 'KOREA CO', 'KO-30/2023', 118679.68, 106206820640, 1757.87, 'KO-040124-4'],
  ] }));
  const { ctx, page } = await newPage();
  await page.addInitScript(() => localStorage.setItem('finlens_ai_settings_v1', JSON.stringify({ keys: [{ key: 'AIzaTEST-KEY-1234567890', on: true }], model: 'gemini-3.6-flash', active: 0 })));
  let prompt = '';
  await page.route(/aiplatform\.googleapis\.com|generativelanguage\.googleapis\.com/, async (r) => {
    prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text;
    const items = [{ id: '0', ok: false, so_hd: 'KO-040124-4', ngay_hd: '2024-04-01', tien_hd: 1757.87, tien_gn: 1757.87, loai_tien: 'USD', ly_do: 'Số invoice nằm ở cột giải ngân; 118679.68 là trị giá hợp đồng USD; 106206820640 là số tờ khai', tin_cay: 0.9 }];
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] }, finishReason: 'STOP' }] }) });
  });
  await page.goto(base + 'index.html');
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f);
  await page.locator('#iSum', { hasText: '2 dòng' }).waitFor();
  await page.fill('#iNew', 'Công ty Nu');
  await page.click('#iSave');
  await page.locator('#custName', { hasText: 'Công ty Nu' }).waitFor();
  await page.locator('[data-act="audit"]').click();
  await page.locator('.au-sum', { hasText: 'Lệch cột' }).waitFor();
  assert.match(await page.locator('#auB tbody').innerText(), /KO-040124-4/, 'hiện dữ liệu gốc trong file');
  await page.click('#auAI');
  await page.locator('.diff', { hasText: 'KO-040124-4' }).waitFor();
  const one = prompt.slice(prompt.indexOf('### id=0'));
  assert.match(one, /RAW hàng trên: .*F: 1 \| G: Công ty A[\s\S]*RAW dòng này: F: 2 \| G: KOREA CO/, 'gửi AI dữ liệu gốc dòng + hàng kề: ' + one.slice(0, 300));
  assert.match(prompt, /Tiêu đề cột của file: .*HÓA ĐƠN/);
  assert.match(await page.locator('#auGo').innerText(), /Áp dụng 1 dòng/);      // tin cậy 90% → tự tick
  await page.click('#auGo');
  await page.locator('.modal').waitFor({ state: 'detached' });
  await page.click('[data-tab="kunn"]');
  if (!(await page.locator('[data-editl]').count())) await page.click('[data-toggle] >> text=KUNN K-NK');
  const body = await page.locator('.kunn', { hasText: 'K-NK' }).locator('tbody').innerText();
  assert.match(body, /KO-040124-4[\s\S]*1\.757,87[\s\S]*USD/);
  assert.doesNotMatch(body, /Đọc sai cột/);
  await page.locator('[data-act="audit"]').click();
  await page.locator('#auB', { hasText: 'Không thấy dòng nào' }).waitFor();
  await ctx.close();
});
