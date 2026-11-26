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
import { XLSX, JSZip, DOCX, bangKeVay, toXlsx, docx, KUNN_BODY, PDGN_BODY } from '../load.js';

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
  const vendor = await readFile(join(ROOT, 'vendor/xlsx-js-style.bundle.js')), zipLib = await readFile(join(ROOT, 'vendor/jszip.min.js'));
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ body: /jszip/.test(r.request().url()) ? zipLib : vendor, contentType: 'text/javascript' }));
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
  await page.locator('.home').waitFor();

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
  assert.match(await rows.nth(0).innerText(), /GN tiếp phần còn lại[\s\S]*8800123\(37\)\.26[\s\S]*400,000,000[\s\S]*\b0\b/);
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
  await page.locator('#custName', { hasText: 'SẢN XUẤT THỬ NGHIỆM' }).waitFor();   // địa chỉ trang giữ nguyên công ty đang mở
  await page.click('a.logo');
  const dash = page.locator('.ccard', { hasText: 'SẢN XUẤT THỬ NGHIỆM' });
  assert.match(await dash.innerText(), /2 KUNN trong sổ/);
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
  assert.match(await page.locator('#iSum').innerText(), /1 KUNN · 2 dòng · 8,000,000/);
  await page.click('#iSave');
  await page.locator('.kunn', { hasText: 'KUNN 99/2026' }).waitFor();
  await ctx.close();
});

test('thư mục chung: máy này ghi tệp JSON, máy khác ghi vào thì bấm Đồng bộ ngay là nhận', async () => {
  const { ctx, page } = await newPage();
  // showDirectoryPicker (hộp chọn thư mục thật) → thay bằng thư mục riêng của trình duyệt để test tự động
  await page.addInitScript(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('O_CHUNG_TEAM', { create: true }); });
  await page.goto(base + 'index.html');
  await page.locator('.home').waitFor();
  // dữ liệu trên máy trước khi kết nối
  await page.click('#bAddCo');
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
    const out = {}; for await (const [n, h] of d.entries()) if (h.kind === 'file' && n.endsWith('.json')) out[n] = JSON.parse(await (await h.getFile()).text()); return out;
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
  await page.locator('#coSw option', { hasText: 'Công ty Zeta' }).waitFor({ state: 'attached' });
  await page.click('[data-ctab="so"]');
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

  // trang đầu: Việc hôm nay ghi rõ việc của công ty nào → bấm vào đúng KUNN ở tab Theo dõi KUNN
  // trang đầu là dashboard tổng quan; việc hồ sơ gốc quá hạn nằm trong trang công ty
  await page.click('a.logo');
  await page.locator('.tile', { hasText: 'Đáo hạn 30 ngày tới' }).waitFor();
  assert.equal(await page.locator('.home .trow').count(), 0, 'trang đầu không liệt kê hồ sơ gốc quá hạn');
  await shot(page, '5-home');
  await page.locator('.ccard', { hasText: 'Công ty Kappa' }).click();
  const task = page.locator('.trow', { hasText: 'KUNN 5500777(9).26 quá hạn hồ sơ gốc' });
  await task.waitFor();
  await task.click();
  await page.locator('.ctabs a.act', { hasText: 'Theo dõi KUNN' }).waitFor();
  assert.match(await page.locator('.kdet').innerText(), /KUNN 5500777\(9\)\.26[\s\S]*Bổ sung bản gốc — hạn/);
  await page.locator('.kdet [data-gk]').first().check();               // tick nhận bản gốc từng chứng từ
  await page.locator('.kdet [data-gk]:checked').waitFor();
  // KUNN nhiều hóa đơn: danh sách bản gốc gập lại, tìm / lọc “chưa nhận” mà không cuộn dài phần ghi chú
  await page.evaluate(async () => { const S = window.BKAPP.S; const lines = [...Array(20)].map((_, i) => ({ id: 'gl' + i, ncc: i % 2 ? 'CÔNG TY TNHH THỬ A' : 'HẢI QUAN THỬ', so_hd: String(9100 + i), ngay_hd: '2026-10-01', tien_gn: 1e6, goc: i < 5 ? 'da_nhan' : 'chua' }));
    await S.store.putKunn({ id: 'kLong', customerId: S.cid, so_kunn: '5500777(30).26', ngay_gn: '2026-10-05', lines, updatedAt: Date.now() }); });
  await page.click('[data-kf="all"]');
  await page.locator('.kwrap tbody tr', { hasText: '5500777(30).26' }).click();
  const gd = page.locator('.kdet details.gocd');
  await gd.waitFor();
  assert.equal(await gd.getAttribute('open'), null, 'danh sách dài mặc định gập');
  assert.match(await gd.locator('summary').innerText(), /đã nhận 5\/20/);
  await gd.locator('summary').click();
  await gd.locator('[data-gocs]').selectOption('chua');
  assert.equal(await gd.locator('.gocls > label:visible').count(), 15);
  await gd.locator('[data-gocq]').fill('9119');
  assert.equal(await gd.locator('.gocls > label:visible').count(), 1);
  await gd.locator('.gocls > label:visible input').check();
  await page.locator('.kdet details.gocd summary', { hasText: 'đã nhận 6/20' }).waitFor();
  assert.notEqual(await page.locator('.kdet details.gocd').getAttribute('open'), null, 'mở rồi thì vẽ lại vẫn mở');
  // tab Sổ hóa đơn: biểu đồ, ô tổng — bấm để xem chi tiết
  await page.click('[data-ctab="so"]');
  await page.locator('svg.viz rect.go').first().click();
  await page.locator('#dSum', { hasText: 'KUNN' }).waitFor();
  assert.notEqual(await page.inputValue('#dM'), '');
  await page.locator('.modal [data-close]').first().click();
  await page.locator('.tile', { hasText: 'Còn lại chưa giải ngân' }).click();
  assert.match(await page.locator('#hB').innerText(), /Công ty Sigma\s+701[\s\S]*1,000[\s\S]*600[\s\S]*400/);
  await page.locator('.modal [data-close]').first().click();
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
  await page.click('[data-act="check"]');
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
  assert.match(await page.locator('#auGo').innerText(), /Duyệt dòng để áp dụng/);   // phải duyệt từng dòng
  await page.locator('#auB [data-dec][data-v="y"]').first().click();
  assert.match(await page.locator('#auGo').innerText(), /Áp dụng 1 dòng đã duyệt/);
  await page.click('#auGo');
  await page.locator('.modal').waitFor({ state: 'detached' });
  await page.click('[data-tab="kunn"]');
  if (!(await page.locator('[data-editl]').count())) await page.click('[data-toggle] >> text=KUNN K-NK');
  const body = await page.locator('.kunn', { hasText: 'K-NK' }).locator('tbody').innerText();
  assert.match(body, /KO-040124-4[\s\S]*1,757\.87[\s\S]*USD/);
  assert.doesNotMatch(body, /Đọc sai cột/);
  await page.locator('[data-act="audit"]').click();
  await page.locator('#auB', { hasText: 'Không thấy dòng nào' }).waitFor();
  await ctx.close();
});

test('AI tự rà việc gán cột khi tải file: đề xuất đổi cột + khối hàng USD → áp dụng', async () => {
  const f = join(dir, 'GAN_COT.xlsx');
  await writeFile(f, toXlsx({ 'Data': [
    ['BẢNG KÊ CHỨNG TỪ GIẢI NGÂN — KU số 77/2026 ngày 05/05/2026'],
    ['STT', 'NHÀ CUNG CẤP', 'SỐ HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN VAY', 'SỐ TIỀN HÓA ĐƠN'],          // 2 cột tiền ghi đảo vị trí quen thuộc
    [1, 'Công ty Alpha', '101', '01/05/2026', 400000, 1000000],
    [2, 'Công ty Beta', '102', '02/05/2026', 500000, 500000],
    [3, 'OMEGA LTD', 'OM-1', '03/05/2026', 1200.5, 1200.5],
  ] }));
  const { ctx, page } = await newPage();
  await page.addInitScript(() => localStorage.setItem('finlens_ai_settings_v1', JSON.stringify({ keys: [{ key: 'AIzaTEST-KEY-1234567890', on: true }], model: 'gemini-3.6-flash', active: 0 })));
  let prompt = '';
  await page.route(/aiplatform\.googleapis\.com|generativelanguage\.googleapis\.com/, async (r) => {
    prompt = JSON.parse(r.request().postData()).contents[0].parts[0].text;
    const reply = { ok: false, columns: { stt: 'A', ncc: 'B', so_hd: 'C', ngay_hd: 'D', tien_hd: 'F', tien_gn: 'E' }, unit: 'dong', currency_rows: [{ from: 5, to: 5, currency: 'USD' }],
      issues: [{ field: 'tien_gn', text: 'Hàng 5 là số tiền USD (có phần lẻ)' }], summary: 'Gán cột đúng; hàng 5 là ngoại tệ USD' };
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] }) });
  });
  await page.goto(base + 'index.html');
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f);
  await page.locator('.aibox', { hasText: 'hàng 5 là ngoại tệ USD' }).waitFor();          // AI tự chạy, không cần bấm
  assert.match(prompt, /CÔNG CỤ ĐANG GÁN:[\s\S]*tien_gn \(Số tiền giải ngân \(vay\)\) = E/);
  assert.match(prompt, /\[5\] A: 3 \| B: OMEGA LTD/);
  assert.match(await page.locator('.colchk').innerText(), /NGOẠI TỆ/, 'luật cũng báo số lẻ có thể là ngoại tệ');
  assert.equal(await page.locator('.aitab tr').count(), 1, 'tool đã gán đúng 2 cột tiền → chỉ còn mục khối hàng USD');
  assert.match(await page.locator('.aitab').innerText(), /Hàng 5–5: loại tiền → USD/);
  await page.locator('[data-cdall="y"]').click();
  await page.click('#cAIgo');
  await page.locator('.aibox', { hasText: 'đã áp dụng' }).waitFor();
  assert.match(await page.locator('.modal tbody').last().innerText(), /OM-1[\s\S]*1,200\.5/);
  await page.fill('#iNew', 'Công ty Xi');
  await page.click('#iSave');
  const k = page.locator('.kunn', { hasText: '77/2026' });
  await k.locator('table').waitFor();
  assert.match(await k.locator('tbody').innerText(), /OM-1[\s\S]*1,200\.5[\s\S]*USD/);
  await ctx.close();
});

test('kiểm tra dữ liệu đã nạp: phát hiện KUNN ngoại tệ chưa ghi loại tiền → gắn USD', async () => {
  const f = join(dir, 'CU.xlsx');
  const head = ['', 'SỐ KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐẾN HẠN', 'SỐ TIỀN', 'STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN (VNĐ)', 'SỐ TIỀN GIẢI  NGÂN (VNĐ)'];
  await writeFile(f, toXlsx({ 'Sheet2': [head,
    ['', 'KV-1', 45400, 45500, '', 1, 'Công ty A', 'HĐ 1', '11', 45390, 50000000, 50000000],
    ['', '', '', '', '', 2, 'Công ty A', '', '12', 45390, 80000000, 80000000],
    ['', 'KU-2', 45410, 45500, '', 1, 'OMEGA LTD', 'OM', 'INV-1', 45400, 1757.87, 1757.87],
    ['', '', '', '', '', 2, 'OMEGA LTD', '', 'INV-2', 45400, 920.5, 920.5],
  ] }));
  const { ctx, page } = await newPage();
  await page.goto(base + 'index.html');
  await page.click('#bImport');
  await page.setInputFiles('#iFile', f);
  await page.locator('#iSum', { hasText: '2 KUNN' }).waitFor();
  await page.fill('#iNew', 'Công ty Omi');
  await page.click('#iSave');
  await page.locator('#custName', { hasText: 'Công ty Omi' }).waitFor();
  await page.locator('[data-act="oldchk"]').click();
  await page.locator('#ocB', { hasText: 'Có thể là ngoại tệ' }).waitFor();
  assert.match(await page.locator('#ocB tbody').last().innerText(), /KU-2[\s\S]*Gắn loại tiền/);
  await page.locator('[data-open]').first().click();                        // xem chi tiết từng dòng bị ảnh hưởng
  assert.match(await page.locator('tr.sub').innerText(), /INV-1[\s\S]*Loại tiền: .*VND.* → USD[\s\S]*INV-2/);
  await page.locator('tr.sub [data-dec][data-v="n"]').last().click();         // không lấy dòng INV-2
  assert.match(await page.locator('[data-open]').first().innerText(), /1\/2 dòng/);
  await page.locator('#ocB [data-dec][data-v="y"]').first().click();          // duyệt đề xuất
  assert.match(await page.locator('#ocGo').innerText(), /Áp dụng 1 đề xuất đã duyệt/);
  await page.click('#ocGo');
  await page.locator('.modal').waitFor({ state: 'detached' });
  if (!(await page.locator('.kunn', { hasText: 'KU-2' }).locator('table').count())) await page.click('[data-toggle] >> text=KUNN KU-2');
  const kb = await page.locator('.kunn', { hasText: 'KU-2' }).locator('tbody').innerText();
  assert.match(kb, /INV-1[\s\S]*1,757\.87 USD/);
  assert.doesNotMatch(kb, /920,5 USD/, 'dòng không duyệt giữ nguyên');
  // hoàn tác / làm lại
  await page.click('#bUndo');
  await page.locator('.kunn', { hasText: 'KU-2' }).locator('tbody').filter({ hasNotText: 'USD' }).waitFor();
  await page.keyboard.press('Control+y');
  await page.locator('.kunn', { hasText: 'KU-2' }).locator('tbody', { hasText: '1,757.87 USD' }).waitFor();
  // không còn nút xóa ngoài danh sách; xóa nằm trong Sửa thông tin
  assert.equal(await page.locator('[data-cdel]').count(), 0);
  await page.click('#bEditC');
  await page.click('#cfDel');                     // hộp xác nhận → OK
  await page.locator('.home').waitFor();
  assert.equal(await page.locator('.ccard', { hasText: 'Công ty Omi' }).count(), 0);
  await ctx.close();
});

test('soạn KUNN & PDGN: nạp Word cũ của KH → tự nhận trường → điền từ bảng kê → sửa tay → xuất Word → lưu, mở lại', async () => {
  const fx = join(dir, 'BK_HS.xlsx');
  await writeFile(fx, toXlsx({ 'Bang ke': bangKeVay({ ku: '5500777(3).26', ngay: '19/11/2026', rows: [
    ['CÔNG TY TNHH MỚI X', 'HĐ 9', '101', '01/11/2026', 600000000, 600000000, 900000000],
    ['CÔNG TY TNHH MỚI X', 'HĐ 9', '102', '02/11/2026', 300000000, 300000000, ''],
    ['CÔNG TY TNHH MỚI Y', '', '7', '03/11/2026', 100000000, 100000000, 100000000],
  ] }) }));
  const fk = join(dir, 'KUNN_lan_truoc.docx'), fp = join(dir, 'PDGN_lan_truoc.docx');
  await writeFile(fk, await docx(KUNN_BODY)); await writeFile(fp, await docx(PDGN_BODY));
  const { ctx, page } = await newPage();
  await page.goto(base + 'index.html');
  await page.click('#bImport');
  await page.setInputFiles('#iFile', fx);
  await page.fill('#iNew', 'Công ty TNHH Thử nghiệm An Bình');
  await page.click('#iSave');
  await page.locator('#custName', { hasText: 'An Bình' }).waitFor();
  await page.click('#bHs');
  await page.locator('[data-pick]', { hasText: '5500777(3).26' }).click();
  await page.locator('.hs-empty', { hasText: 'Chưa có mẫu KUNN' }).waitFor();
  // nạp KUNN lần trước → mẫu riêng KH (hộp xác nhận: OK = mẫu riêng)
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.hs-empty [data-tplload]')]);
  await fc.setFiles(fk);
  await page.locator('.dpage .df[data-f="so_kunn"]', { hasText: '5500777(3).26' }).waitFor();
  const kunn = page.locator('.dpage[data-kind="kunn"]');
  assert.match(await kunn.innerText(), /CÔNG TY TNHH THỬ NGHIỆM AN BÌNH/, 'thông tin KH lấy từ bản cũ');
  assert.match(await kunn.innerText(), /Bằng số: 1,000,000,000 VND/, 'số tiền = tổng bảng kê mới');
  assert.match(await kunn.innerText(), /Một tỷ đồng/);
  assert.doesNotMatch(await kunn.innerText(), /Công ty Cũ B/, 'bảng thụ hưởng theo bảng kê mới');
  assert.equal(await kunn.locator('table.lt tbody tr').count(), 3, 'tiêu đề + 2 bên thụ hưởng');
  assert.match(await page.locator('.hs-ck').innerText(), /“CÔNG TY TNHH MỚI X” chưa có số tài khoản/);
  // nhập dư nợ trước → tổng dư nợ + bằng chữ tự tính
  await page.fill('[data-v="du_no_truoc"]', '4,000,000,000'); await page.press('[data-v="du_no_truoc"]', 'Tab');
  await kunn.locator('.df[data-f="tong_du_no_chu"]', { hasText: 'Năm tỷ đồng' }).waitFor();
  // bấm vào chữ đỏ để sửa trường ngay trên văn bản
  await kunn.locator('.df[data-f="lai_suat"]').click();
  await page.fill('.fpop input', '9.2'); await page.click('.fpop [data-ok]');
  await kunn.locator('.df[data-f="lai_suat"]', { hasText: '9.2' }).waitFor();
  assert.equal(await page.inputValue('[data-v="lai_suat"]'), '9.2');
  // nhập TK bên thụ hưởng ở bảng bên trái
  await page.fill('[data-l="tth|0|tk"]', '0123456789'); await page.press('[data-l="tth|0|tk"]', 'Tab');
  await kunn.locator('.df', { hasText: '0123456789' }).waitFor();
  // sửa ở khung trái cũng hoàn tác được (↶ / ↷ của bản soạn)
  await page.click('[data-w="undo"]');
  assert.equal(await page.inputValue('[data-l="tth|0|tk"]'), '', 'hoàn tác TK ở khung trái');
  assert.equal(await kunn.locator('.df', { hasText: '0123456789' }).count(), 0);
  await page.click('[data-w="redo"]');
  assert.equal(await page.inputValue('[data-l="tth|0|tk"]'), '0123456789');
  await kunn.locator('.df', { hasText: '0123456789' }).waitFor();
  // thêm bên thụ hưởng tay (vd nộp thuế / kho bạc) → có dòng mới, giữ lại, vào văn bản
  const nTth = await page.locator('[data-l^="tth|"][data-l$="|ten"]').count();
  await page.click('[data-ladd="tth"]');
  await page.locator(`[data-l="tth|${nTth}|ten"]`).waitFor();
  await page.fill(`[data-l="tth|${nTth}|ten"]`, 'Kho bạc Nhà nước Thử'); await page.press(`[data-l="tth|${nTth}|ten"]`, 'Tab');
  await page.fill(`[data-l="tth|${nTth}|tk"]`, '7111222333'); await page.press(`[data-l="tth|${nTth}|tk"]`, 'Tab');
  assert.equal(await page.inputValue(`[data-l="tth|${nTth}|ten"]`), 'Kho bạc Nhà nước Thử');
  await kunn.locator('.df', { hasText: '7111222333' }).waitFor();
  await page.click(`[data-ldel="tth|${nTth}"]`);
  await page.locator(`[data-l="tth|${nTth}|ten"]`).waitFor({ state: 'detached' });
  // sửa tay một đoạn + thêm đoạn mới (Enter)
  const p = kunn.locator('.dp', { hasText: 'Tài sản bảo đảm riêng' });
  await p.click(); await page.keyboard.press('End'); await page.keyboard.type(' Bổ sung thêm.');
  await page.keyboard.press('Enter'); await page.keyboard.type('Đoạn mới gõ tay.');
  await kunn.locator('.dp.ed', { hasText: 'Đoạn mới gõ tay.' }).waitFor();
  // thanh công cụ kiểu Word: bôi đen → đậm, cỡ 14, căn giữa; hoàn tác / làm lại; tìm & thay
  const np = kunn.locator('.dp', { hasText: 'Đoạn mới gõ tay.' });
  await np.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.click('[data-w="bold"]');
  assert.equal(await np.evaluate((el) => getComputedStyle(el.querySelector('span[style*="bold"]') || el).fontWeight), '700');
  await page.selectOption('#wSize', '14');
  await page.click('[data-w="jc:center"]');
  assert.equal(await np.evaluate((el) => getComputedStyle(el).textAlign), 'center');
  await page.keyboard.press('Control+z');
  assert.notEqual(await kunn.locator('.dp', { hasText: 'Đoạn mới gõ tay.' }).evaluate((el) => getComputedStyle(el).textAlign), 'center', 'hoàn tác bỏ căn giữa');
  await page.click('[data-w="redo"]');
  assert.equal(await kunn.locator('.dp', { hasText: 'Đoạn mới gõ tay.' }).evaluate((el) => getComputedStyle(el).textAlign), 'center', 'làm lại');
  await page.click('[data-w="find"]');
  await page.fill('#wfQ', 'Bổ sung thêm'); await page.fill('#wfR', 'Bổ sung thêm nữa');
  await page.click('[data-w="fall"]');
  await kunn.locator('.dp', { hasText: 'Bổ sung thêm nữa.' }).waitFor();
  await page.click('[data-w="fclose"]');
  assert.match(await page.locator('#hsStat').innerText(), /đoạn đã sửa/);
  // thêm 1 dòng vào bảng thông tin KH bằng thanh dòng
  await kunn.locator('table:not(.lt) tr', { hasText: 'Đại diện' }).hover();
  await page.click('.rowbar [data-rb="down"]');
  assert.equal(await kunn.locator('table:not(.lt)').first().locator('tr').count(), 5);
  // thêm cột bên phải ô đang đứng, gõ vào ô mới; thêm rồi xóa 1 cột nữa
  await kunn.locator('.dp', { hasText: /^Đại diện$/ }).click();
  await page.click('[data-w="col:right"]');
  const t1 = kunn.locator('table:not(.lt)').first();
  assert.equal(await t1.locator('tr').first().locator('td').count(), 3);
  await t1.locator('tr', { hasText: 'TRẦN VĂN MẪU' }).locator('td').nth(1).locator('.dp').click();
  await page.keyboard.type('Cột mới');
  await page.click('[data-w="col:left"]');
  assert.equal(await t1.locator('tr').first().locator('td').count(), 4);
  await t1.locator('tr', { hasText: 'TRẦN VĂN MẪU' }).locator('td').nth(1).locator('.dp').click();
  await page.click('[data-w="col:del"]');
  assert.equal(await t1.locator('tr').first().locator('td').count(), 3);
  // kẻ khung: bỏ hết khung bảng
  await kunn.locator('.dp', { hasText: /^Đại diện$/ }).click();
  await page.selectOption('#wBd', 'none');
  assert.equal(await t1.locator('td').first().evaluate((x) => getComputedStyle(x).borderTopStyle), 'none');
  // công cụ ô: gộp phải → tách ô; căn giữa dọc; chia đều cột
  await kunn.locator('.dp', { hasText: /^Địa chỉ$/ }).click();
  await page.locator('#wTbl:not([hidden])').waitFor();
  await page.click('[data-w="merge:right"]');
  assert.equal(await t1.locator('tr', { hasText: 'Địa chỉ' }).locator('td').count(), 2);
  await kunn.locator('.dp', { hasText: /^Địa chỉ$/ }).click();
  await page.click('[data-w="split"]');
  assert.equal(await t1.locator('tr', { hasText: 'Địa chỉ' }).locator('td').count(), 3);
  await kunn.locator('.dp', { hasText: /^Địa chỉ$/ }).click();
  await page.click('[data-w="va:center"]');
  await page.click('[data-w="dist"]');
  // kéo mép phải ô → cột rộng ra; kéo mép dưới → hàng cao hơn
  const rDc = t1.locator('tr', { hasText: 'Địa chỉ' }), c0 = rDc.locator('td').first();
  let bb = await c0.boundingBox(); const w0 = bb.width;
  await page.mouse.move(bb.x + bb.width - 1, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width + 40, bb.y + bb.height / 2, { steps: 6 }); await page.mouse.up();
  assert.ok((await c0.boundingBox()).width > w0 + 20, 'kéo rộng cột');
  bb = await c0.boundingBox(); const h0 = bb.height;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height - 1); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height + 30, { steps: 6 }); await page.mouse.up();
  assert.ok((await c0.boundingBox()).height > h0 + 20, 'kéo cao hàng');
  // quét chọn 2 ô cùng dòng → in đậm cả vùng → gộp → hoàn tác / làm lại
  const qa = await rDc.locator('td').nth(0).boundingBox(), qb = await rDc.locator('td').nth(1).boundingBox();
  await page.mouse.move(qa.x + 12, qa.y + 8); await page.mouse.down(); await page.mouse.move(qb.x + 12, qb.y + 8, { steps: 6 }); await page.mouse.up();
  assert.equal(await t1.locator('td.csel').count(), 2, 'quét chọn 2 ô');
  await page.click('[data-w="bold"]');
  assert.match(await rDc.locator('td').first().innerHTML(), /bold|<b>/, 'in đậm cả vùng');
  await page.click('[data-w="merge:right"]');
  assert.equal(await rDc.locator('td').count(), 2, 'gộp vùng ô đã chọn');
  await page.click('[data-w="undo"]');
  assert.equal(await t1.locator('tr', { hasText: 'Địa chỉ' }).locator('td').count(), 3, 'hoàn tác gộp');
  await page.click('[data-w="redo"]');
  assert.equal(await t1.locator('tr', { hasText: 'Địa chỉ' }).locator('td').count(), 2, 'làm lại gộp');
  await page.keyboard.press('Control+z');   // Ctrl+Z khi con trỏ không ở trong ô chữ → hoàn tác của bản soạn
  assert.equal(await t1.locator('tr', { hasText: 'Địa chỉ' }).locator('td').count(), 3, 'Ctrl+Z hoàn tác gộp');
  await kunn.locator('.dp', { hasText: /^Địa chỉ$/ }).click(); await page.click('[data-w="dist"]');
  // AutoFit: bảng thụ hưởng vừa khổ trang
  await kunn.locator('table.lt td').first().locator('.dp').first().click();
  await page.selectOption('#wFit', 'window');
  assert.equal(await kunn.locator('table.lt').evaluate((x) => x.style.width), '100%');
  // gõ "1. " đầu đoạn → thụt dòng treo, Enter ra "2. "
  await kunn.locator('.dp', { hasText: 'Đoạn mới gõ tay.' }).click(); await page.keyboard.press('End');
  await page.keyboard.press('Enter'); await page.keyboard.type('1. Mục một');
  const li = kunn.locator('.dp', { hasText: '1. Mục một' });
  assert.ok(parseFloat(await li.evaluate((x) => getComputedStyle(x).textIndent)) < 0, 'thụt dòng treo');
  await page.keyboard.press('Enter'); await page.keyboard.type('Mục hai');
  await kunn.locator('.dp', { hasText: '2. Mục hai' }).waitFor();
  // PDGN
  await page.click('[data-hk="pdgn"]');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.hs-empty [data-tplload]')]);
  await fc2.setFiles(fp);
  const pdgn = page.locator('.dpage[data-kind="pdgn"]');
  await pdgn.locator('.df[data-f="cif"]', { hasText: '00123456' }).waitFor();
  const ctT = pdgn.locator('table.lt');
  assert.equal(await ctT.locator('tbody tr').count(), 5, 'tiêu đề + 3 chứng từ + tổng');
  assert.match(await ctT.innerText(), /101[\s\S]*900,000,000[\s\S]*102[\s\S]*TỔNG CỘNG[\s\S]*1,000,000,000/);
  assert.match(await pdgn.innerText(), /đồng ý ngày 19\/11\/2026/);
  await pdgn.locator('.dc').first().click();
  assert.equal(await pdgn.locator('.dc').first().innerText(), '☐');
  // ô tick kiểu cũ (FORMCHECKBOX) hiện đúng, không lộ mã trường; bảng không bị bẻ chữ từng ký tự
  assert.doesNotMatch(await pdgn.innerText(), /FORMCHECKBOX/);
  const lcb = pdgn.locator('.dp', { hasText: 'Không đồng ý' }).locator('.dc');
  assert.equal(await lcb.innerText(), '☐');
  await lcb.click(); assert.equal(await lcb.innerText(), '☒');
  const cif = await pdgn.locator('.df[data-f="cif"]').boundingBox();
  assert.ok(cif.height < 30, 'ô CIF không bị co cột');
  // xuất Word PDGN rồi KUNN, đọc lại file
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#hsExp')]);
  const zp = await JSZip.loadAsync(await readFile(await d1.path()));
  const xp = await zp.file('word/document.xml').async('string');
  assert.match(xp, /w14:checked w14:val="0"/);
  assert.match(xp, /<w:default w:val="0"\/><w:checked w:val="1"\/>/, 'ô tick kiểu cũ được tick');
  assert.match(xp, /<w:vMerge w:val="restart"\/>/);
  assert.doesNotMatch(xp, /\{\{/, 'không còn trường chưa thay');
  await page.click('[data-hk="kunn"]');
  await page.check('#hsRed');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#hsExp')]);
  assert.match(d2.suggestedFilename(), /^KUNN_5500777_3\.26_/);
  const xk = await (await JSZip.loadAsync(await readFile(await d2.path()))).file('word/document.xml').async('string');
  const tk = []; DOCX.walk(DOCX.parse(xk).blocks, (q) => tk.push(DOCX.ptext(q)));
  assert.ok(tk.includes('Tài sản bảo đảm riêng của khách hàng An Bình. Bổ sung thêm nữa.') && tk.includes('Đoạn mới gõ tay.'));
  const pm = /<w:p>(<w:pPr>[\s\S]*?<\/w:pPr>)?((?:(?!<w:p>)[\s\S])*?)Đoạn mới gõ tay\./.exec(xk);
  assert.match(pm[1] || '', /<w:jc w:val="center"\/>/, 'căn giữa ghi vào Word');
  assert.match(pm[2], /<w:b\/>[\s\S]*<w:sz w:val="28"\/>/, 'đậm + cỡ 14 ghi vào Word');
  assert.ok(tk.includes('Lãi suất tại thời điểm giải ngân: 9.2%/năm.'));
  const kt = DOCX.parse(xk).blocks.find((x) => x.t === 'tbl');
  assert.equal((kt.pre.match(/<w:gridCol /g) || []).length, 3, 'lưới cột có cột mới');
  assert.equal(new Set([...kt.pre.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => m[1])).size, 1, 'chia đều cột');
  assert.match(xk, /<w:vAlign w:val="center"\/>/);
  assert.match(xk, /<w:tblW w:w="5000" w:type="pct"\/>/, 'AutoFit vừa khổ trang ghi vào Word');
  assert.ok(kt.rows.every((r) => r.cells.length === 3));
  assert.ok(tk.includes('Cột mới'));
  assert.ok(tk.includes('2. Mục hai'));
  assert.match(xk, /<w:ind w:left="\d+"[^>]*w:hanging="\d+"\/>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>(?:(?!<w:p>)[\s\S])*1\. Mục một/, 'thụt dòng treo ghi vào Word');
  assert.match(xk, /<w:tcBorders><w:top w:val="nil"\/>/, 'bỏ khung ghi vào Word');
  assert.ok(tk.includes('Bằng chữ: Năm tỷ đồng.'));
  assert.match(xk, /<w:color w:val="FF0000"\/>/, 'bản soát giữ chữ đỏ');
  // lưu → đóng → mở lại: phần sửa tay và số liệu còn nguyên
  await page.click('#hsSave');
  await page.locator('.toast div', { hasText: 'Đã lưu hồ sơ' }).waitFor();
  await page.click('#hsClose');
  await page.click('#bHs');
  assert.match(await page.locator('[data-pick]', { hasText: '5500777(3).26' }).innerText(), /✓/, 'danh sách đánh dấu KUNN đã soạn');
  await page.locator('[data-pick]', { hasText: '5500777(3).26' }).click();
  await page.locator('.dpage[data-kind="kunn"] .dp', { hasText: 'Đoạn mới gõ tay.' }).waitFor();
  assert.equal(await page.inputValue('[data-v="lai_suat"]'), '9.2');
  assert.match(await page.locator('.dpage[data-kind="kunn"]').innerText(), /0123456789/, 'TK thụ hưởng được nhớ');
  await shot(page, '9-soan-kunn');
  await ctx.close();
});

test('hồ sơ giải ngân theo công ty: đọc file Excel quản lý GN → thả chứng từ → AI đọc → kiểm tra tự sinh → xử lý lệch → mốc → sổ hóa đơn → gói tải lên', async () => {
  const fb = join(dir, 'bang_ke_hs.xlsx');
  await writeFile(fb, toXlsx({ 'Bang ke': bangKeVay({ ku: '1000001(9).26', ngay: '26/11/2026', rows: [
    ['CÔNG TY TNHH HÓA DẦU MẪU', 'HĐMB 77/2026', '830', '04/11/2026', 1116900000, 1116900000, 1116900000],
    ['ĐIỆN LỰC MẪU', '', 'PA0001', '13/11/2026', 303166541, 303166541, 303166541],
  ] }) }));
  const fp = join(dir, 'scan.pdf');
  await writeFile(fp, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const { ctx, page } = await newPage();
  await page.addInitScript(() => { localStorage.setItem('finlens_ai_settings_v1', JSON.stringify({ keys: [{ key: 'AIzaTEST-KEY-1234567890', on: true }], model: 'gemini-3.6-flash', active: 0 })); window.showOpenFilePicker = undefined; });
  let sent = null;
  await page.route(/aiplatform\.googleapis\.com|generativelanguage\.googleapis\.com/, async (r) => {
    const body = r.request().postData() || '';
    if (/Tra soát bộ chứng từ giải ngân/.test(body)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tom_tat: 'Hóa đơn 830 mua hạt nhựa đúng mục đích.', issues: [{ muc_do: 'dat', van_de: 'Hóa đơn 830 đúng mục đích vay', chi_tiet: '', so_chung_tu: '830' }, { muc_do: 'can_xem', van_de: 'Chưa có HĐMB để đối chiếu điều khoản thanh toán', chi_tiet: 'Bổ sung HĐMB', so_chung_tu: '' }] }) }] }, finishReason: 'STOP' }] }) });
    sent = JSON.parse(body);
    const docs = { docs: [
      { loai: 'hoa_don', trang: '1', conf: 0.95, f: { so: '830', ngay: '04/11/2026', ben_ban: 'Công ty TNHH Hóa Dầu Mẫu', mst_mua: '0303640880', tien: '1116900000' } },
      { loai: 'tien_dien', trang: '2', conf: 0.9, f: { so: 'PA0001', ngay: '13/11/2026', ben_ban: 'Điện lực Mẫu', tien: '303166541', tk_nhan: '118000048033', ngan_hang: 'VietinBank' } },
      { loai: 'unc', trang: '3', conf: 0.9, f: { ngay: '25/11/2026', ben_ban: 'Điện lực Mẫu', tien: '303166541', tk_nhan: '0351000998999', ngan_hang: 'VCB' } },
      { loai: 'cic', trang: '4', conf: 0.5, f: { ngay: '24/11/2026', nhom_no: '1' } }] };
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(docs) }] }, finishReason: 'STOP' }] }) });
  });
  await page.goto(base + 'index.html');
  await page.click('#bAddCo');
  await page.fill('#cfName', 'CTCP An Bình Thử'); await page.fill('#cfMst', '0303640880');
  await page.click('#cfSave');
  await page.locator('.ctabs a.act', { hasText: 'Tổng quan' }).waitFor();
  // file Excel quản lý giải ngân (mẫu trong giaingan/) → dư nợ, hạn mức, thông tin công ty
  await page.click('[data-ctab="info"]');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#xlPick')]);
  await fc.setFiles(join(ROOT, '../giaingan/excel/QUAN_LY_GIAI_NGAN_MAU.xlsx'));
  await page.locator('.xlbox', { hasText: 'KUNN còn dư nợ' }).waitFor();
  assert.equal(await page.inputValue('[data-pf="ma_ttkd"]'), '123', 'thông tin công ty lấy từ sheet DANH_MUC');
  // hồ sơ mới: thả bảng kê + bản scan cùng lúc
  await page.click('[data-ctab="tong"]');
  await page.setInputFiles('#dzNew input', [fb, fp]);
  await page.locator('.dline', { hasText: 'Hóa đơn GTGT 830' }).waitFor();
  assert.equal(sent.contents[0].parts[1].inline_data.mime_type, 'application/pdf', 'PDF gửi kèm cho AI đọc');
  const mid = page.locator('.hscol.mid');
  await mid.locator('.ck.s3', { hasText: 'Số tài khoản nhận tiền Điện lực Mẫu không khớp' }).waitFor();
  assert.match(await mid.innerText(), /118000048033 — VietinBank, UNC \/ lệnh chi ghi 0351000998999/);
  // số TK bên thụ hưởng AI đọc trên chứng từ → dùng để điền bảng Bên thụ hưởng của PDGN (bảng kê không có TK)
  const bm = await page.evaluate(() => { const B = window.BKAPP, c = B.cust(B.S.cid), h = B.S.store.hosoOf(c.id)[0]; return B.bankMemo({ ...c, hs: { ...(c.hs || {}), tk: {} } }, h); });
  assert.ok(Object.values(bm).some((x) => x.tk === '118000048033' && /VietinBank/.test(x.nh) && /đọc từ/.test(x.src)), JSON.stringify(bm));
  assert.match(await mid.locator('.okl').first().textContent(), /2\/2 dòng bảng kê khớp số, ngày, tiền với chứng từ/);
  assert.doesNotMatch(await mid.innerText(), /tờ khai|NSNN/i, 'không có tờ khai thì không soát NSNN');
  assert.match(await page.locator('.kbar').innerText(), /1,420,066,541 đ[\s\S]*Đáo hạn[\s\S]*137 ngày/);
  await shot(page, '10-hoso');
  // TestKey: nạp file HTML công cụ TestKey cũ (bảng key GIẢ) → xem trước, thử tính → dùng → ô TestKey của hồ sơ tự tính
  const fakeT = { day: Object.fromEntries([...Array(31)].map((_, i) => [i + 1, 10 + i])), mon: Object.fromEntries([...Array(12)].map((_, i) => [i + 1, 200 + i])), cur: { VND: 5 },
    dig: Object.fromEntries('ABCDEFGHIKMN'.split('').flatMap((ch, p) => [...Array(10)].map((_, d) => [ch + d, d ? p * 10 + d : 0]))) };
  const tkf = join(await mkdtemp(join(tmpdir(), 'tk-')), 'TestKey_cu.html');
  await writeFile(tkf, `<!doctype html><html><body><script>\nconst T=${JSON.stringify(fakeT)};\nconst LET='ABCDEFGHIKMN';\n</script></body></html>`);
  const [tkc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-tkload]')]);
  await tkc.setFiles(tkf);
  await page.locator('#kpOk').waitFor();
  assert.match(await page.locator('.modal').innerText(), /TestKey_cu\.html[\s\S]*đọc trực tiếp bảng key/);
  await page.fill('#kpCn', '880'); await page.fill('#kpD', '2026-11-25'); await page.fill('#kpT', '1.000.000.005');
  assert.equal(await page.locator('#kpK').innerText(), '880/1265');
  await page.click('#kpOk');
  await page.locator('.kbar', { hasText: '123/' }).waitFor();
  // Cài đặt → 5. TestKey: bấm được (trước đây trùng id ô API key), nạp bảng key từ file Excel (GIẢ)
  await page.click('#bSettings');
  await page.locator('.modal', { hasText: 'Đã nạp bảng key từ TestKey_cu.html' }).waitFor();
  await page.click('input#skKey'); assert.equal(await page.locator('#skTk').count(), 1, 'bấm ô API key không đóng Cài đặt');
  const LT = 'ABCDEFGHIKMN'.split('');
  const tkx = join(await mkdtemp(join(tmpdir(), 'tkx-')), 'BangKey.xlsx');
  await writeFile(tkx, toXlsx({ Key: [['Ngày', 'Key', '', 'Tháng', 'Key', '', 'Loại tiền', 'Key'], ...[...Array(31)].map((_, i) => [i + 1, 10 + i, '', i < 12 ? i + 1 : '', i < 12 ? 200 + i : '', '', i === 0 ? 'VND' : '', i === 0 ? 5 : '']),
    [], ['Vị trí', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9], ...LT.map((ch, p) => [ch, ...[...Array(10)].map((_, d) => (d ? p * 10 + d : 0))])] }));
  const [tkx2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#skTk')]);
  await tkx2.setFiles(tkx);
  await page.locator('#kpOk').waitFor();
  assert.match(await page.locator('.modal').innerText(), /BangKey\.xlsx[\s\S]*đọc bảng key trong file Excel/);
  await page.fill('#kpCn', '880'); await page.fill('#kpD', '2026-11-25'); await page.fill('#kpT', '1.000.000.005');
  assert.equal(await page.locator('#kpK').innerText(), '880/1265');
  await page.click('#kpOk');
  await page.locator('.modal', { hasText: 'Đã nạp bảng key từ BangKey.xlsx' }).waitFor();
  await page.locator('.modal [data-close]').first().click();
  // xem chứng từ: sửa số AI đọc → kiểm tra chạy lại
  await page.locator('.dline', { hasText: 'Thông báo tiền điện' }).click();
  await page.locator('.dview').waitFor();
  await page.fill('[data-df="tk_nhan"]', '0351000998999');
  await page.click('#dSave');
  await page.goBack();
  await page.locator('.hs3').waitFor();
  assert.equal(await page.locator('.ck.s3').count(), 0, 'hết lỗi sau khi sửa');
  // sửa dòng bảng kê ngay trong hồ sơ → lưu vết; xem nhanh file đã up
  await page.locator('details.okl', { hasText: 'Bảng kê ·' }).locator('summary').evaluate((e) => { e.parentElement.open = true; });
  await page.locator('[data-fxline]').first().click();
  await page.fill('[data-lf="ghi_chu"]', 'đã đối chiếu');
  await page.click('#lfSave');
  await page.locator('.trail li', { hasText: 'Sửa dòng 830: Ghi chú: — → đã đối chiếu' }).waitFor({ state: 'attached' });
  await page.locator('[data-fprev]').first().click();
  await page.locator('#pvT', { hasText: '1/2' }).waitFor();
  await page.click('#pvN');
  await page.locator('#pvT', { hasText: '2/2' }).waitFor();
  await page.locator('.modal [data-close]').first().click();
  // chọn công ty nhanh: Ctrl+K
  await page.keyboard.press('Control+k');
  await page.fill('#cpQ', 'An Bình');
  await page.press('#cpQ', 'Enter');
  await page.locator('.ctabs a.act', { hasText: 'Tổng quan' }).waitFor();
  await page.goBack();
  await page.locator('.hs3').waitFor();
  // mốc: nhập số KUNN → mốc “Xin số KUNN” tự xong; bấm mốc gửi KH ký
  // số KUNN: chỉ số trong ngoặc tự tăng; số gốc / đuôi năm sửa được và nhớ cho công ty
  await page.fill('[data-knpre]', '2000002'); await page.press('[data-knpre]', 'Tab');
  await page.locator('.toast div', { hasText: 'Đã nhớ số gốc KUNN “2000002”' }).waitFor();
  assert.equal(await page.inputValue('[data-knn]'), '1', 'số gốc mới → số trong ngoặc bắt đầu lại');
  await page.fill('[data-knpre]', '1000001'); await page.press('[data-knpre]', 'Tab');
  await page.locator('.toast div', { hasText: 'Đã nhớ số gốc KUNN “1000001”' }).waitFor();
  await page.fill('[data-knn]', '9'); await page.press('[data-knn]', 'Tab');
  await page.fill('[data-knsuf]', '.26'); await page.press('[data-knsuf]', 'Tab');
  await page.locator('[data-knuse]', { hasText: '1000001(9).26' }).click();
  assert.equal(await page.inputValue('#hsKunn'), '1000001(9).26');
  await page.locator('.ms.done', { hasText: 'Xin số KUNN' }).waitFor();
  // gói lãi suất / UBG từ sheet UBG của file Excel: chọn gói → lãi suất theo gói, tool soát hạn mức gói
  assert.equal(await page.locator('#hsGoi option').count(), 4, 'lãi suất thông thường + 3 gói hiệu lực ngày 26/11/2026');
  await page.selectOption('#hsGoi', 'Gói ưu đãi – UBG 002');
  await page.locator('.hs3', { hasText: 'Gói ưu đãi – UBG 002 8.2%: còn' }).waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.BKAPP.S.store.hosoOf(window.BKAPP.S.cid)[0].ls), '8.2');
  // ô lãi suất: hiện theo gói nào; sửa tay → báo đã sửa tay, có nút trả về theo gói
  assert.equal(await page.inputValue('#hsLs'), '8.2');
  assert.match(await page.locator('.kb-ls').innerText(), /theo gói Gói ưu đãi – UBG 002/);
  await page.fill('#hsLs', '8,5'); await page.dispatchEvent('#hsLs', 'change');
  await page.locator('.kb-ls', { hasText: 'đã sửa tay (gói ghi 8.2%)' }).waitFor();
  await page.locator('.kbar').scrollIntoViewIfNeeded(); await shot(page, '10b-laisuat');
  assert.equal(await page.evaluate(() => window.BKAPP.S.store.hosoOf(window.BKAPP.S.cid)[0].ls), '8.5');
  await page.click('[data-lsgoi]');
  await page.locator('.kb-ls', { hasText: 'theo gói Gói ưu đãi – UBG 002' }).filter({ hasNotText: 'sửa tay' }).waitFor();
  // 🤖 AI tra soát mục đích vay & phù hợp HĐMB → kết quả vào danh sách kiểm tra
  await page.click('#hsAiMd');
  await page.locator('.ck', { hasText: 'AI: Chưa có HĐMB để đối chiếu điều khoản thanh toán' }).waitFor();
  // mốc chỉ còn các bước tool làm / theo dõi được; bấm mốc → viền đỏ chỗ cần làm
  assert.deepEqual(await page.locator('[data-ms]').evaluateAll((xs) => xs.map((x) => x.dataset.ms)), ['nhan', 'kiem_tra', 'so_kunn', 'soan', 'giai_ngan']);
  await page.click('[data-ms="soan"]');
  await page.locator('#oxKunn.focus-red').waitFor();
  // chứng từ bổ sung bản gốc: gợi ý từ chứng từ đã thả, số ngày theo yêu cầu ĐVKD → hạn
  await page.locator('.ck', { hasText: 'Chưa chọn chứng từ phải bổ sung bản gốc' }).locator('[data-fx="bssug"]').click();
  await page.locator('#oxBs .bsr2').first().waitFor();
  assert.match(await page.locator('#oxBs').innerText(), /chưa có số ngày/);
  await page.fill('#oxBs [data-bsf="0|ngay"]', '15'); await page.press('#oxBs [data-bsf="0|ngay"]', 'Tab');
  await page.locator('#oxBs .bsr2', { hasText: 'hạn 11/12/2026' }).first().waitFor();
  if (SHOTS) { await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; document.getElementById('oxBs').scrollIntoView({ block: 'center' }); }); await shot(page, '10c-bosung'); }
  assert.equal(await page.locator('.ms.done', { hasText: 'Đã giải ngân' }).count(), 0);
  // ghi vào sổ hóa đơn → tab Theo dõi KUNN thấy KUNN mới
  await page.click('#hsLedger');
  await page.locator('.obox', { hasText: 'Đã ghi' }).waitFor();
  // bỏ 1 file khỏi gói rồi đưa lại
  const nPk = await page.locator('#oxUp .pkr').count();
  await page.locator('#oxUp [data-pkx]').first().click();
  await page.locator('#oxUp .pksk [data-pkback]').waitFor();
  assert.equal(await page.locator('#oxUp .pkr').count(), nPk - 1);
  await page.locator('#oxUp [data-pkback]').first().click();
  await page.locator('#oxUp .pksk').waitFor({ state: 'detached' });
  const [dz] = await Promise.all([page.waitForEvent('download'), page.click('#hsZip')]);
  const zz = await JSZip.loadAsync(await readFile(await dz.path()));
  assert.deepEqual(Object.keys(zz.files).sort(), ['03_BANG_KE.xlsx', '03_BANG_KE_CHUAN_1000001_9.26.xlsx', '04_UNC_LENH_CHI.pdf']);
  assert.match(dz.suggestedFilename(), /^HoSoGN_.*_KUNN_1000001_9_?\.26_26112026\.zip$/);
  // ghi sổ lại / sửa hồ sơ → cập nhật đúng KUNN đó, không sinh bản lặp (bản lặp cũ được dọn)
  await page.click('#hsLedger');
  await page.evaluate(async () => { const { S } = window.BKAPP; const k = S.store.kunnsOf(S.cid).find((x) => x.so_kunn === '1000001(9).26'); await S.store.putKunn({ ...structuredClone(k), id: 'dup1', updatedAt: 1 }); });
  await page.click('[data-ctab="kunn"]');
  await page.click('[data-kf="all"]');
  assert.match(await page.locator('.kwrap').innerText(), /1000001\(9\)\.26/);
  assert.equal(await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).count(), 1, 'không lặp KUNN');
  await page.waitForFunction(() => window.BKAPP.S.store.kunnsOf(window.BKAPP.S.cid).filter((x) => x.so_kunn === '1000001(9).26').length === 1);
  assert.match(await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).innerText(), /hạn 11\/12\/2026/, 'chứng từ bổ sung hiện ở bảng theo dõi');
  // đổi hạn nhận bản gốc ngay ở bảng theo dõi
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).click();
  await page.fill('.kdet [data-kbh]', '2026-12-20');
  await page.locator('.kwrap tbody tr', { hasText: 'hạn 20/12/2026' }).waitFor();
  // ghi chú KUNN: KH trả 1 phần → dư nợ giảm, có dòng tổng
  await page.click('[data-kf="live"]');
  const tot0 = await page.locator('.kwrap tfoot').innerText();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).click();
  await page.selectOption('#knT', 'tra_1_phan');
  await page.fill('#knA', '1,000,000,000'); await page.fill('#knX', 'KH trả trước hạn');
  await page.click('#knAdd');
  await page.locator('.kn', { hasText: 'KH trả nợ 1 phần' }).waitFor();
  assert.match(await page.locator('.kdet').innerText(), /dư nợ còn ≈ 4,480,500,000 đ/);
  assert.notEqual(await page.locator('.kwrap tfoot').innerText(), tot0, 'dòng tổng cập nhật theo ghi chú');
  // lãi suất thả nổi: điều chỉnh 1 KUNN, rồi hàng loạt (+0.25 điểm %) — bảng hiện LS cũ → mới
  await page.click('[data-kf="live"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).click();
  await page.fill('#lsD', '2026-11-01'); await page.fill('#lsV', '8.6'); await page.fill('#lsN', 'điều chỉnh định kỳ');
  await page.click('#lsAdd');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).locator('b', { hasText: '8.6%' }).waitFor();
  await page.click('#lsBulk');
  await page.fill('#lbD', '2026-11-15'); await page.selectOption('#lbM', 'add'); await page.fill('#lbV', '0.25');
  await page.locator('#lbP tr', { hasText: '1000001(4).26' }).locator('td', { hasText: '8.85%' }).waitFor();
  await page.click('#lbOk');
  await page.locator('.toast div', { hasText: 'Điều chỉnh lãi suất' }).first().waitFor();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).locator('b', { hasText: '8.85%' }).waitFor();
  // quên làm hồ sơ trên tool → thêm KUNN nhập tay vào theo dõi (số ngày vay → tự tính đáo hạn), sửa lại được
  await page.click('#kAdd');
  await page.fill('#kfSo', '1000001(15).26'); await page.fill('#kfNg', '2026-11-10'); await page.fill('#kfTien', '2,500,000,000');
  await page.fill('#kfSnv', '90');
  assert.equal(await page.inputValue('#kfDh'), '2027-02-08');
  await page.selectOption('#kfGoi', 'Gói ưu đãi – UBG 002');
  assert.equal(await page.inputValue('#kfLs'), '8.2');
  await page.fill('#kfBs', 'Hóa đơn GTGT'); await page.fill('#kfBsH', '2026-12-10');
  await page.click('#kfOk');
  const mr = page.locator('.kwrap tbody tr', { hasText: '1000001(15).26' });
  await mr.waitFor();
  assert.match(await mr.innerText(), /10\/11\/2026[\s\S]*08\/02\/2027[\s\S]*2,500,000,000 đ[\s\S]*Chờ 1 bản gốc/);
  await page.click('[data-kedit]');
  await page.fill('#kfCon', '1,500,000,000'); await page.click('#kfOk');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(15).26' }).filter({ hasText: '1,500,000,000 đ' }).waitFor();
  await page.locator('.kdet [data-kmx]').check();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(15).26' }).filter({ hasText: 'Đã nhận đủ' }).waitFor();
  // KUNN quá hạn mà KH đã trả: đánh dấu đúng hạn (quên tick) → không tính; trả trễ → lưu lịch sử quá hạn; bỏ qua có lý do
  const isoAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  for (const so of ['1000001(16).26', '1000001(17).26']) {
    await page.click('#kAdd');
    await page.fill('#kfSo', so); await page.fill('#kfNg', isoAgo(100)); await page.fill('#kfTien', '1,000,000,000'); await page.fill('#kfSnv', '30');
    await page.click('#kfOk');
    await page.locator('.kwrap tbody tr', { hasText: so }).filter({ hasText: 'quá 70 ngày' }).waitFor();
  }
  await page.click('#kThu');
  await page.locator('#tbOk').waitFor();
  await page.locator('tr', { hasText: '1000001(16).26' }).locator('[data-tb]').check();
  await page.click('#tbOk');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(16).26' }).filter({ hasText: 'đúng hạn' }).waitFor();
  // bấm nhầm → ↶ Hoàn tác ngay trên thông báo; bỏ đánh dấu trong khung chi tiết (cũng hoàn tác được)
  await page.locator('.toast div', { hasText: '1000001(16).26' }).locator('.tact').click();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(16).26' }).filter({ hasText: 'quá 70 ngày' }).waitFor();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(16).26' }).click();
  await page.click('[data-tt="due"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(16).26' }).filter({ hasText: 'đúng hạn' }).waitFor();
  await page.click('[data-ttun]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(16).26' }).filter({ hasText: 'quá 70 ngày' }).waitFor();
  await page.locator('.toast div', { hasText: 'Bỏ đánh dấu đã trả KUNN 1000001(16).26' }).locator('.tact').click();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(16).26' }).filter({ hasText: 'đúng hạn' }).waitFor();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(17).26' }).click();
  await page.fill('#ttD', isoAgo(60));
  await page.click('[data-tt="ngay"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(17).26' }).filter({ hasText: 'trễ 10 ngày' }).waitFor();
  await page.click('[data-kf="qh"]');
  assert.match(await page.locator('.tile', { hasText: 'Số lần quá hạn' }).innerText(), /1 lần/);
  await shot(page, 'qh_lichsu');
  const qrow = page.locator('tr[data-qhr="1000001(17).26"]');
  assert.match(await qrow.innerText(), /10[\s\S]*đã trả trễ/);
  assert.equal(await page.locator('tr[data-qhr="1000001(16).26"]').count(), 0, 'trả đúng hạn (quên tick) không tính quá hạn');
  await qrow.locator('[data-qhskip]').click();
  await page.locator('tr[data-qhr="1000001(17).26"] [data-qhun]').waitFor();
  assert.match(await page.locator('.tile', { hasText: 'Số lần quá hạn' }).innerText(), /0 lần/);
  await page.click('[data-kf="all"]');
  // Excel tổng hợp đầy đủ (7 sheet)
  const [tx] = await Promise.all([page.waitForEvent('download'), page.click('#kXls')]);
  assert.match(tx.suggestedFilename(), /^TongHop_.*\.xlsx$/);
  const wbt = XLSX.read(await readFile(await tx.path()));
  assert.deepEqual(wbt.SheetNames, ['Theo doi KUNN', 'Han muc', 'Goi lai suat', 'Lich lai suat', 'Chua co trong Excel', 'Lich su qua han', 'Da xoa']);
  const tk1 = XLSX.utils.sheet_to_json(wbt.Sheets['Theo doi KUNN'], { header: 1, defval: '' });
  assert.ok(tk1.some((r) => r[0] === '1000001(15).26' && r[14] === 'Nhập tay'), 'KUNN nhập tay có trong tổng hợp');
  // KUNN thêm trong tool chưa có trong file Excel → tải dòng để ghi vào file (không báo lỗi)
  await page.click('[data-ctab="info"]');
  assert.match(await page.locator('.tile', { hasText: 'Chưa có trong file Excel' }).innerText(), /\d/);
  const [xo] = await Promise.all([page.waitForEvent('download'), page.click('#xlDl')]);
  const xr = XLSX.utils.sheet_to_json(XLSX.read(await readFile(await xo.path())).Sheets['KUNN them'], { header: 1, defval: '' });
  assert.ok(xr.some((r) => r.includes('1000001(15).26')), 'dòng KUNN nhập tay để dán vào file Excel');
  await page.click('[data-ctab="kunn"]');
  // báo cáo theo gói + xuất Excel
  await page.click('[data-kf="goi"]');
  await page.locator('.goic', { hasText: 'Gói ưu đãi – UBG 002' }).waitFor();
  const [rx] = await Promise.all([page.waitForEvent('download'), page.click('#goiX')]);
  assert.match(rx.suggestedFilename(), /^BaoCao_GoiLaiSuat_.*\.xlsx$/);
  const wbx = XLSX.read(await readFile(await rx.path()));
  assert.deepEqual(wbx.SheetNames, ['Tong hop', 'Chi tiet KUNN']);
  // xóa KUNN (của tool / dòng từ file Excel) → mục “Đã xóa” lưu vết → khôi phục / xóa hẳn
  await page.click('[data-kf="all"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).click();
  await page.click('[data-kdel]');
  await page.locator('.toast div', { hasText: 'Đã xóa KUNN 1000001(9).26' }).waitFor();
  assert.doesNotMatch(await page.locator('.kwrap tbody').innerText(), /1000001\(9\)\.26/);
  await page.click('[data-kf="del"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).click();
  await page.click('[data-krestore]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).waitFor();
  assert.match(await page.locator('.kdet').innerText(), /Lịch sử thay đổi/);
  await page.click('[data-kf="live"]');
  const dn0 = await page.locator('.kwrap tfoot').innerText();
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).click();
  await page.click('[data-kdel]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).waitFor({ state: 'detached' });
  assert.notEqual(await page.locator('.kwrap tfoot').innerText(), dn0, 'dư nợ không còn tính KUNN đã xóa');
  await page.click('[data-kf="del"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).click();
  await page.click('[data-krestore]');
  await page.click('[data-kf="live"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(4).26' }).waitFor();
  assert.equal(await page.locator('.kwrap tfoot').innerText(), dn0, 'khôi phục → dư nợ như cũ');
  // xóa hẳn
  await page.click('[data-kf="all"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).click();
  await page.click('[data-kdel]');
  await page.click('[data-kf="del"]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).click();
  await page.click('[data-kpurge]');
  await page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' }).waitFor({ state: 'detached' });
  // xóa hồ sơ không cần nữa (hoàn tác được)
  await page.click('[data-ctab="hoso"]');
  await page.locator('[data-hsdel]').first().click();
  await page.locator('.hsrow').first().waitFor({ state: 'detached' });
  await page.click('#bUndo');
  await page.locator('.hsrow').first().waitFor();
  // file Excel trình bày lạ: tool không tự nhận → hộp chọn cột tay; xem trước Excel ngay trong trang chứng từ
  const fw = join(dir, 'bang_ke_la.xlsx');
  await writeFile(fw, toXlsx({ 'Data': [['Đơn vị nhận', 'Mã CT', 'Khoản chi'], ['Công ty Lạ', 'CT-01', 150000000], ['Công ty Lạ', 'CT-02', 50000000]] }));
  await page.locator('.hsrow').first().click();
  await page.setInputFiles('#dzAdd input', fw);
  await page.locator('.modal h2', { hasText: 'Chọn cột bảng kê' }).waitFor();
  await page.selectOption('[data-pk="ncc"]', '0');
  await page.selectOption('[data-pk="so_hd"]', '1');
  await page.selectOption('[data-pk="tien_gn"]', '2');
  await page.locator('#pkP', { hasText: 'Đọc được 2 dòng' }).waitFor();
  await page.click('#pkOk');
  await page.locator('.hs3', { hasText: 'CT-02' }).waitFor();
  // hạn mức theo thời gian: thêm dòng hạn mức mới (cấp lại) → khả dụng tính theo hạn mức mới
  await page.click('[data-ctab="info"]');
  await page.click('#hmAdd');
  await page.locator('#cxHm tbody tr').first().waitFor();
  await page.fill('#cxHm [data-hmf$="|hm_tong"]', '150,000'); await page.press('#cxHm [data-hmf$="|hm_tong"]', 'Tab');
  await page.locator('#cxHm .pill', { hasText: 'đang áp dụng' }).waitFor();
  await page.waitForFunction(() => (window.BKAPP.cust(window.BKAPP.S.cid).hmHist || [])[0]?.hm_tong === 150000e6);
  // hạn mức con: lấy sẵn các HMTD từ file Excel; thêm L/C bằng USD (tỷ giá quy đổi)
  assert.equal(await page.locator('#cxHm .hml tbody tr').count(), 2, 'HMTD 1, HMTD 2 từ file Excel');
  await page.click('#cxHm [data-hmladd]');
  await page.locator('#cxHm .hml tbody tr').nth(2).waitFor();
  const lr = page.locator('#cxHm .hml tbody tr').nth(2);
  await lr.locator('[data-hml$="|tien_te"]').selectOption('USD');
  await page.locator('#cxHm .hml tbody tr').nth(2).locator('[data-hml$="|ty_gia"]').waitFor();
  await page.locator('#cxHm .hml tbody tr').nth(2).locator('[data-hml$="|han_muc"]').fill('5,000,000'); await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.BKAPP.cust(window.BKAPP.S.cid).hmHist[0].lines[2].han_muc === 5e6);
  await page.locator('#cxHm .hml tbody tr').nth(2).locator('[data-hml$="|ty_gia"]').fill('25,000'); await page.keyboard.press('Tab');
  await page.locator('#cxHm .hml tbody tr').nth(2).filter({ hasText: '125 tỷ' }).waitFor();
  assert.equal(await page.evaluate(() => window.BKAPP.cust(window.BKAPP.S.cid).hmHist[0].hm_lc), 125e9, 'L/C quy đổi VND');
  const den20 = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  await page.fill('#cxHm [data-hmf$="|den_ngay"]', den20); await page.press('#cxHm [data-hmf$="|den_ngay"]', 'Tab');
  await page.waitForFunction((d) => window.BKAPP.cust(window.BKAPP.S.cid).hmHist[0].den_ngay === d, den20);
  assert.equal(await page.evaluate(() => { const c = window.BKAPP.cust(window.BKAPP.S.cid); return [c.hmHist.length, c.hmHist[0].hm_tong, c.hs.hm_tong]; }).then((x) => JSON.stringify(x)), JSON.stringify([1, 150000e6, '150,000']));
  assert.match(await page.locator('#cxGoi').innerText(), /Gói ưu đãi – UBG 002[\s\S]*file Excel/);
  // sổ hóa đơn chỉ có KUNN đã nạp bảng kê → nạp nhiều bảng kê cũ cùng lúc
  const o1 = join(dir, 'cu_1.xlsx'), o2 = join(dir, 'cu_2.xlsx');
  await writeFile(o1, toXlsx({ 'Bang ke': bangKeVay({ ku: '1000001(1).26', ngay: '01/03/2026', rows: [['CÔNG TY TNHH CŨ 1', 'HĐ 1', '901', '01/02/2026', 500, 500, 500]] }) }));
  await writeFile(o2, toXlsx({ 'Bang ke': bangKeVay({ ku: '1000001(2).26', ngay: '01/04/2026', rows: [['CÔNG TY TNHH CŨ 2', 'HĐ 2', '902', '01/03/2026', 700, 700, 700]] }) }));
  await page.click('[data-ctab="so"]');
  assert.match(await page.locator('.mtab').innerText(), /Tổng hợp giải ngân theo tháng[\s\S]*từ file Excel/, 'dashboard sổ hóa đơn gồm cả KUNN trong file Excel');
  assert.match(await page.locator('.tile', { hasText: 'Tổng đã giải ngân' }).innerText(), /từ file Excel/);
  // bấm ô tổng → danh sách chi tiết đủ KUNN như số tổng (gồm KUNN chỉ có trong file Excel)
  const tTot = await page.locator('.tile', { hasText: 'Tổng đã giải ngân' }).innerText(), nTot = +(/(\d+) KUNN/.exec(tTot) || [])[1];
  await page.locator('.tile', { hasText: 'Giải ngân 12 tháng gần nhất' }).click();
  await page.locator('#dSum').waitFor();
  await page.selectOption('#dM', '');
  assert.match(await page.locator('#dSum').innerText(), new RegExp(`^${nTot} KUNN[\\s\\S]*chỉ có trong file Excel`), 'danh sách đủ ' + nTot + ' KUNN');
  assert.ok(await page.locator('#dB tr', { hasText: 'Chỉ có trong file Excel' }).count() > 0);
  await page.locator('.modal [data-close]').first().click();
  const [fcb] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bBulk')]);
  await fcb.setFiles([o1, o2]);
  await page.locator('.modal', { hasText: 'Đã thêm 2 KUNN' }).waitFor();
  await page.locator('.modal [data-close]').first().click();
  // trang đầu: thẻ công ty có dư nợ / hạn mức từ file Excel
  // đáo hạn rơi vào thứ Bảy → gợi ý ngày làm việc; bấm Đã giải ngân → KUNN vào theo dõi có đáo hạn, dư nợ
  await page.click('[data-ctab="hoso"]');
  await page.locator('.hsrow').first().click();
  // soạn KUNN & PDGN → lưu: hồ sơ lấy lãi suất / số ngày vay theo văn bản
  await page.click('#hsSoan');
  await page.locator('[data-v="lai_suat"]').waitFor({ state: 'attached' });
  await page.evaluate(() => document.querySelectorAll('details.hg').forEach((d) => { d.open = true; }));
  // bên thụ hưởng: số TK / ngân hàng tự điền từ chứng từ AI đã đọc (bảng kê không có TK), khung trái dạng thẻ
  assert.ok(await page.locator('.lcard').count() >= 2, 'danh sách dạng thẻ');
  if (SHOTS) { await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; document.querySelector('.lcards').scrollIntoView({ block: 'start' }); }); await shot(page, '10d-soan-side'); }
  await page.fill('[data-v="lai_suat"]', '9.1'); await page.press('[data-v="lai_suat"]', 'Tab');
  await page.click('#hsSave');
  await page.locator('.toast div', { hasText: 'Hồ sơ cập nhật theo KUNN / PDGN' }).waitFor();
  await page.click('#hsClose');
  assert.equal(await page.evaluate(() => window.BKAPP.S.store.hosoOf(window.BKAPP.S.cid)[0].ls), '9.1');
  await page.fill('#hsSnv', '9'); await page.press('#hsSnv', 'Tab');
  await page.locator('.kbar', { hasText: 'Thứ 7' }).waitFor();
  await page.locator('.dhfix [data-snv="11"]').click();
  await page.locator('.kbar', { hasText: '07/12/2026' }).waitFor();
  await page.click('[data-ms="giai_ngan"]'); await page.click('[data-msok="giai_ngan"]');
  await page.locator('.toast div', { hasText: 'đã chuyển sang tab Theo dõi KUNN' }).waitFor();
  await page.click('[data-ctab="kunn"]'); await page.click('[data-kf="live"]');
  const gr = page.locator('.kwrap tbody tr', { hasText: '1000001(9).26' });
  assert.match(await gr.innerText(), /07\/12\/2026[\s\S]*Thứ 2[\s\S]*200,000,000 đ/, 'đáo hạn + thứ + dư nợ vay');
  assert.match(await page.locator('.kwrap thead').innerText(), /Dư nợ vay \(gốc\)/);
  await page.click('a.logo');
  // trang đầu: nhắc gói lãi suất sắp hết hiệu lực / gần hết hạn mức gói
  await page.locator('.cra', { hasText: 'An Bình Thử' }).filter({ hasText: 'hết hạn duy trì' }).first().waitFor();
  assert.match(await page.locator('.ccard', { hasText: 'An Bình Thử' }).innerText(), /Dư nợ [\d,]+ tr \/ 150,000 tr/);
  await ctx.close();
});

test('sổ theo dõi KUNN tự lập nhiều sheet: chọn sheet của công ty, xem trước, lưu cách đọc; file sửa (chèn cột) đọc lại vẫn đúng', async () => {
  const head = ['Số KUNN', 'Ngày GN', 'Ngày đáo hạn', 'Lãi suất', 'Số tiền GN', 'Đã trả', 'Dư nợ'];
  const rows = [['HMTD 2025'], ['1050807(1).26', 46217, 46353, 0.0835, 10933435095, 10933435095, 0], ['1050807(5).26', 46226, 46363, 0.0835, 7533742585, 0, 7533742585]];
  const f1 = join(dir, 'TONG_HOP_KHA_TIN.xlsx');
  await writeFile(f1, toXlsx({ 'Tổng hợp Kha Tín Group': [['Tổng hợp']], KES: [head, ['9990001(1).26', 46200, 46300, 0.08, 100000000, 0, 100000000]], KTLA: [['THEO DÕI KUNN'], head, ...rows], 'Dòng tiền': [['x']] }));
  const f2 = join(dir, 'TONG_HOP_KHA_TIN_sua.xlsx');
  await writeFile(f2, toXlsx({ KES: [head], KTLA: [['THEO DÕI KUNN'], ['Cập nhật'], ['Ghi chú', ...head], ...rows.map((r) => ['', ...r]), ['', '1050807(10).26', 46260, 46420, 0.0835, 6969976665, 0, 6969976665]] }));
  const { ctx, page } = await newPage();
  await page.addInitScript(() => { window.showOpenFilePicker = undefined; });
  await page.goto(base + 'index.html');
  await page.click('#bAddCo'); await page.fill('#cfName', 'Công ty TNHH Kha Tín Long An'); await page.click('#cfSave');
  await page.locator('.ctabs a.act', { hasText: 'Tổng quan' }).waitFor();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.tile', { hasText: 'Dư nợ vay hiện tại' }).click()]);   // bấm ô dư nợ là chọn file
  await fc.setFiles(f1);
  await page.locator('.chip.on', { hasText: 'KTLA' }).waitFor();                 // tự gợi ý đúng sheet của công ty
  assert.match(await page.locator('#lgPrev').innerText(), /2 KUNN · 1 còn dư nợ · dư nợ 7,533,742,585 đ/);
  await page.locator('.chip', { hasText: 'KES' }).click();
  await page.locator('#lgPrev', { hasText: '1 KUNN' }).waitFor();
  await page.locator('.chip', { hasText: 'KTLA' }).click();
  await page.fill('#lgHm', '20,000');
  await page.click('#lgSave');
  await page.locator('.tile', { hasText: 'Dư nợ vay hiện tại' }).filter({ hasText: '7.5 tỷ' }).waitFor();
  assert.match(await page.locator('.tile', { hasText: 'Hạn mức còn khả dụng' }).innerText(), /12\.5 tỷ/);
  // file đã sửa: chèn cột, dời tiêu đề, thêm KUNN → Đọc lại
  await page.click('[data-ctab="info"]');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#xlRe')]);
  await fc2.setFiles(f2);
  await page.locator('.xlbox', { hasText: '3 dòng · 2 KUNN còn dư nợ' }).waitFor();
  assert.match(await page.locator('.xlbox').innerText(), /Sheet KTLA/);
  // file kiểu sổ tự lập: SỐ DƯ ghi “-” / 0 = đã trả hết; cột ghi chú thu nợ → ngày thu; ghi chú khó → AI đọc
  const f3 = join(dir, 'SO_THU.xlsx');
  await writeFile(f3, toXlsx({ Sheet1: [['KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐÁO HẠN', 'SỐ TIỀN', 'SỐ DƯ', 'Ghi chú'],
    ['9000001(1).23', '03/07/2023', '15/12/2023', 6100000000, '-', 'Trả nợ trước hạn ngày 15/11'],
    ['9000001(4).23', '29/08/2023', '12/02/2024', 4400000000, 0, 'Trả nợ trước hạn ngày 3/1/24'],
    ['9000001(9).23', '12/09/2023', '13/03/2024', 1500000000, '-', 'KH chuyển khoản hết sau Tết'],
    ['9000004(1).26', '14/08/2026', '12/02/2027', 12700000000, 12700000000, ''],
    ['9000004(2).25', '01/07/2025', '12/08/2025', 1200000000, 1200000000, 'THU ĐÚNG HẠN'],
    ['9000004(3).25', '05/07/2025', '30/09/2025', 3000000000, 3000000000, '2 tỷ ngày 10.8.25, 1 tỷ ngày 2.10.25']] }));
  await page.click('a.logo'); await page.click('#bAddCo'); await page.fill('#cfName', 'Công ty Sổ Thử'); await page.click('#cfSave');
  await page.locator('.ctabs a.act', { hasText: 'Tổng quan' }).waitFor();
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.tile', { hasText: 'Dư nợ vay hiện tại' }).click()]);
  await fc3.setFiles(f3);
  await page.locator('#lgPrev', { hasText: '6 KUNN · 1 còn dư nợ · dư nợ 12,700,000,000 đ' }).waitFor();
  assert.match(await page.locator('#lgPrev').innerText(), /Trả nợ trước hạn ngày 15\/11[\s\S]*→ ✓ KH đã trả hết 15\/11\/2023 · trước hạn 30 ngày/);
  { const tx = await page.locator('#lgPrev').innerText(); assert.match(tx, /THU ĐÚNG HẠN[\s\S]*→ ✓ KH đã trả hết 12\/08\/2025 · đúng hạn/); assert.match(tx, /→ ✓ KH đã trả hết 02\/10\/2025 · trễ 2 ngày[\s\S]*Lần 1: 10\/08\/2025 · 2,000,000,000/); }
  if (SHOTS) { await page.locator('[data-pf="paid"]').click(); await page.evaluate(() => { document.getElementById('toast').innerHTML = ''; document.getElementById('lgPrev').scrollIntoView(); }); await shot(page, '11-so-ghichu'); await page.locator('[data-pf=""]').click(); }
  await page.click('#lgSave');
  await page.locator('.tile', { hasText: 'Dư nợ vay hiện tại' }).filter({ hasText: '12.7 tỷ' }).waitFor();
  await page.evaluate(() => localStorage.setItem('finlens_ai_settings_v1', JSON.stringify({ keys: [{ key: 'AIzaTEST-KEY-1234567890', on: true }], model: 'gemini-3.6-flash', active: 0 })));
  await page.route(/aiplatform\.googleapis\.com|generativelanguage\.googleapis\.com/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ so: '9000001(9).23', loai: 'tat_toan', ngay_thu: '20/02/2024', so_tien: null, gia_han_den: '', tom_tat: 'Trả hết sau Tết' }] }) }] }, finishReason: 'STOP' }] }) }));
  await page.click('[data-ctab="info"]');
  await page.click('#xlAiNote');
  await page.locator('.toast div', { hasText: 'AI đọc xong 5 ghi chú' }).waitFor();
  await page.click('[data-ctab="kunn"]'); await page.click('[data-kf="all"]');
  await page.locator('.kwrap tbody tr', { hasText: '9000001(9).23' }).filter({ hasText: 'đã trả 20/02/2024' }).waitFor();
  await page.locator('.kwrap tbody tr', { hasText: '9000001(1).23' }).filter({ hasText: 'đã trả 15/11/2023' }).waitFor();
  await ctx.close();
});
