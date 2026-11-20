// E2E: mở tienich/index.html bằng file:// trong Chromium thật, nạp bảng key GIẢ LẬP, tính, lưu và hiển thị lại lịch sử.
//   cd giaingan && npm run e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) {
    return import(pathToFileURL(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')).href);
  }
}
let browser;
before(async () => { const pw = await loadPlaywright(); browser = await pw.chromium.launch(process.env.E2E_CHROME ? { executablePath: process.env.E2E_CHROME } : {}); });
after(async () => { await browser?.close(); });

test('nạp bảng key → TestKey, chữ, lịch sử tick để hiển thị lại', async () => {
  const p = await browser.newPage({ viewport: { width: 1712, height: 767 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(pathToFileURL(join(ROOT, 'tienich/index.html')).href);
  assert.ok(await p.isVisible('#keyBox'));
  await p.setInputFiles('#keyFile', join(ROOT, 'tests/bang_key_gia_lap.json'));
  await p.waitForFunction(() => document.getElementById('keyBox').style.display === 'none');
  const add = async (ct, d, t) => { await p.fill('#cn', '123'); await p.fill('#ct', ct); await p.fill('#ngay', d); await p.fill('#tien', t); await p.click('#save'); };
  await add('Công ty A', '2026-10-15', '2.027.125.382');
  const tkA = await p.textContent('#tk');
  assert.match(await p.textContent('#chu'), /^Hai tỷ không trăm hai mươi bảy triệu/);
  await add('Công ty B', '2026-10-22', '20,000,000,000');
  assert.equal(await p.locator('#his tr[data-i]').count(), 2);
  await p.check('#his tr[data-i="1"] input');
  assert.equal(await p.inputValue('#ct'), 'Công ty A');
  assert.equal(await p.textContent('#tk'), tkA);
  await p.fill('#hisQ', '2027125382');
  assert.equal(await p.locator('#his tr[data-i]').count(), 1);
  const [h, vh] = await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
  assert.ok(h <= vh, `vừa một màn hình (${h} > ${vh})`);
  assert.deepEqual(errs, []);
});
