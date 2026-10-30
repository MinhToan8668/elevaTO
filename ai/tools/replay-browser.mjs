// Chạy CHÍNH TRANG WEB trong Chromium trên một BCTC mẫu, nhưng thay Gemini bằng lời đáp thật đã lưu trong
// .cache/fixtures (do tools/run-fixtures.mjs ghi). Không tốn lượt, không cần key — để tái hiện lỗi chỉ xảy ra
// trên trang (tick trang → trích xuất → bảng rà soát) mà chạy pipeline trần không thấy.
//
//   node tools/replay-browser.mjs HAX BS=9-10,IS=11,CF=12 [ảnh.png]
//
// In ra số chỉ tiêu từng báo cáo theo kỳ trong bảng rà soát, các lưu ý, và chữ trên tab KQKD.

import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const AI = join(ROOT, 'ai');
const [loc, typesArg, shotPath] = process.argv.slice(2);
const file = (await readdir(join(AI, 'tests/fixtures/bctc'))).find((f) => f.endsWith('.pdf') && f.includes(loc));

// Trang đã biết loại → trả lời lượt nhận trang của AI.
const types = {};
for (const part of typesArg.split(',')) {
  const [k, r] = part.split('='); const [a, b] = r.split('-').map(Number);
  for (let p = a; p <= (b || a); p++) types[p] = k;
}
const picked = Object.keys(types).map(Number);

// Lời đáp thật đã lưu, xếp theo loại bảng (lấy bản mới nhất của đúng công ty).
const CONG_TY = { HAX: /Ô TÔ H/i, DGW: /THẾ GIỚI SỐ/i, Q3_2026: /THẾ GIỚI SỐ/i, VCB: /Ngân hàng/i };
const NAM = { Q3_2026: '2026-09-30' };
const raw = {};
const dir = join(AI, '.cache/fixtures');
const ds = [];
for (const f of await readdir(dir)) {
  if (/^[A-Z]/.test(f)) continue;
  const p = join(dir, f);
  const j = JSON.parse(await readFile(p, 'utf8'));
  let o; try { o = JSON.parse(j.text); } catch (e) { continue; }
  if (!o?.meta || !o.items) continue;
  const key = Object.keys(CONG_TY).find((k) => loc.includes(k)) || loc;
  if (!CONG_TY[key]?.test(o.meta.ten_cong_ty || '')) continue;
  const it = o.items;
  const st = it.some((i) => /tổng cộng tài sản|tổng tài sản có|tổng cộng nguồn vốn/i.test(i.n)) ? 'BS'
    : it.some((i) => /lưu chuyển tiền thuần/i.test(i.n)) ? 'CF' : 'IS';
  const ngay = NAM[key];
  // KQKD quý in ngang: AI có lúc ghi nhầm năm (2024-09-30) nhưng vẫn là báo cáo 9 tháng.
  if (ngay && o.meta.ngay_ket_thuc !== ngay && !(st === 'IS' && Number(o.meta.so_thang) === 9)) continue;
  if (!ngay && key === 'DGW' && o.meta.ngay_ket_thuc !== '2025-12-31') continue;
  ds.push({ st, o, f, items: it.length });
}
for (const st of ['BS', 'IS', 'CF']) raw[st] = ds.filter((x) => x.st === st).sort((a, b) => b.items - a.items)[0]?.o;
console.log('lời đáp dùng:', Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ? v.items.length + ' dòng' : 'KHÔNG CÓ'])));

const calls = [];
function fakeAI(body) {
  if (body.action !== 'generate') return { ok: true, data: { me: { ten: 'Thử', email: 'thu@x.vn', vaitro: 'gv', luot: { dung: 0, han: 999 } }, ungho: null } };
  const prompt = body.contents[0].parts.find((p) => p.text).text;
  const mimes = body.contents[0].parts.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType);
  let out;
  if (/Các ảnh đính kèm/.test(prompt)) {
    const nums = (/trang số ([\d, ]+)/.exec(prompt)?.[1] || '').split(',').map((x) => Number(x.trim())).filter(Boolean);
    out = nums.map((n) => ({ trang: n, loai: types[n] || 'OTHER', xoay: '0' }));
  } else if (/TÌNH HÌNH TÀI CHÍNH/.test(prompt) && !/KẾT QUẢ|LƯU CHUYỂN/.test(prompt.split('\n')[0])) out = raw.BS;
  else if (/KẾT QUẢ HOẠT ĐỘNG/.test(prompt.split('\n')[0])) out = raw.IS;
  else if (/LƯU CHUYỂN TIỀN TỆ/.test(prompt.split('\n')[0])) out = raw.CF;
  calls.push({ hoi: prompt.split('\n')[0].slice(0, 70), mimes, tra: out ? (Array.isArray(out) ? out.length + ' trang' : out.items.length + ' dòng') : 'lạ' });
  if (!out) return { ok: false, code: 'upstream', error: 'prompt lạ' };
  return { ok: true, data: { text: JSON.stringify(out), finishReason: 'STOP' } };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try {
    const f = p.endsWith('/') || p === '' ? join(p, 'index.html') : p;
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }).end(await readFile(join(ROOT, f)));
  } catch (e) { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const API = /export const API = '([^']+)';/.exec(await readFile(join(AI, 'js/config.js'), 'utf8'))[1];

let pw;
try { pw = await import('playwright'); } catch (e) { pw = await import(pathToFileURL(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href); }
const browser = await pw.chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'vi-VN' })).newPage();
const loi = [];
page.on('pageerror', (e) => loi.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') loi.push(m.text()); });
await page.route((u) => u.origin === new URL(API).origin, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeAI(JSON.parse(route.request().postData() || '{}'))) }));
await page.addInitScript(() => {
  sessionStorage.setItem('elevato-ai-view', 'work');
  localStorage.setItem('elevato-ai-phien', JSON.stringify({ token: 'E' + 'A'.repeat(70), me: { ten: 'Thử', email: 'thu@x.vn', vaitro: 'gv', luot: { dung: 0, han: 999 } } }));
  const dat = () => document.documentElement?.setAttribute('data-all-steps', ''); dat(); document.addEventListener('DOMContentLoaded', dat);
});
await page.goto(`${base}/ai/`);
await page.setInputFiles('#fileInput', join(AI, 'tests/fixtures/bctc', file));
await page.waitForSelector('#pageMaps .tile', { timeout: 60000 });
const chk = page.locator('#pageMaps .tile .tile-chk input');
for (let i = 0; i < await chk.count(); i++) {
  const on = await chk.nth(i).isChecked();
  if (on !== picked.includes(i + 1)) await chk.nth(i).click();
}
await page.click('#runBtn');
await page.waitForFunction(() => document.querySelector('#review .sum .pc') || document.querySelector('#progress li.fail'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(500);
console.log('tiến độ:', (await page.locator('#progress li').allInnerTexts()).filter(Boolean).join(' | '));
console.log('gọi AI:', calls);
console.log('kỳ:', await page.locator('#review .sum .pc').evaluateAll((b) => b.map((x) => x.textContent + (x.title ? ' → ' + x.title : ''))));
for (const [tab, ten] of [['BS', 'CĐKT'], ['IS', 'KQKD'], ['CF', 'LCTT']]) {
  await page.click(`#tab-${tab}`).catch(() => {});
  await page.waitForTimeout(200);
  const sel = await page.locator('#review [role=tab][aria-selected=true]').innerText().catch(() => '?');
  const rows = await page.locator('#review table.g tbody tr').count();
  const msg = await page.locator('#tabpanel .msg').allInnerTexts();
  console.log(`tab ${ten}: đang chọn "${sel}", ${rows} dòng`, msg.length ? '\n   ' + msg.join('\n   ').replace(/\n/g, ' ') : '');
}
console.log('lưu ý:', await page.locator('#review details.msg.warn li').allInnerTexts());
if (shotPath) await page.screenshot({ path: shotPath, fullPage: true });
if (loi.length) console.log('lỗi trang:', loi);
await browser.close(); server.close();
