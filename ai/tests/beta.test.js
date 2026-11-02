import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { regressBeta, parseSeries } from '../js/core/beta.js';

test('hồi quy beta từ chuỗi lợi suất ngày của model DGW (sheet 20.Beta_Data) — khớp SLOPE = 1,3364', async () => {
  const txt = await readFile(new URL('./fixtures/dgw-beta.tsv', import.meta.url), 'utf8');
  const r = regressBeta(txt);
  assert.equal(r.kind, 'return');
  assert.ok(Math.abs(r.beta - 1.3364) < 0.0005, `beta ${r.beta}`);
  assert.ok(r.n > 1200);
  assert.ok(r.r2 > 0 && r.r2 < 1);
  assert.ok(r.from < r.to, 'tự sắp theo ngày tăng dần');
});

test('dữ liệu giá đóng cửa (số lớn, chấm ngăn nghìn): tự tính lợi suất; beta của chuỗi dựng sẵn = 1,5', () => {
  const dong = ['Ngày\tDGW\tVN-Index'];
  let p = 40000, x = 1200;
  for (let i = 0; i < 60; i++) {
    const m = (i % 2 ? 0.01 : -0.008) + (i % 7) * 0.001;
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    dong.push(`${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}\t${p.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}\t${x.toFixed(2)}`);
    p *= 1 + 1.5 * m; x *= 1 + m;
  }
  const r = regressBeta(dong.reverse().join('\n'));          // dán ngược (mới nhất ở trên) vẫn được
  assert.equal(r.kind, 'price');
  assert.ok(Math.abs(r.beta - 1.5) < 0.02, `beta ${r.beta}`);
  assert.equal(regressBeta(dong.slice(0, 10).join('\n')), null, 'dưới 20 quan sát → không tính');
  assert.equal(parseSeries('a\tb\tc').rows.length, 0);
});

import { regressRows } from '../js/core/beta.js';
test('dữ liệu tải từ sàn (dãy số, giá có 3 số lẻ như 21.523 nghìn đồng) hồi quy đúng, không bị hiểu nhầm chấm ngăn nghìn', () => {
  const rows = [];
  let p = 21.523, x = 1200.25;
  for (let i = 0; i < 80; i++) {
    const m = (i % 3 ? 0.006 : -0.009) + (i % 5) * 0.0007;
    rows.push([new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), +p.toFixed(3), +x.toFixed(2)]);
    p *= 1 + 0.8 * m; x *= 1 + m;
  }
  const r = regressRows(rows.reverse());
  assert.ok(Math.abs(r.beta - 0.8) < 0.02, `beta ${r.beta}`);
  assert.equal(regressRows([]), null);
});
