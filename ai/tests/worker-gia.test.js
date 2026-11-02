import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giaCoPhieu } from '../worker/src/gia.js';

const ngay = (i) => Date.UTC(2026, 0, 1 + i) / 1000;
const gia = (sym) => (u) => {
  const s = new URL(u).searchParams.get('symbol');
  const n = 40;
  const t = Array.from({ length: n }, (_, i) => ngay(i));
  const c = s === 'VNINDEX' ? t.map((_, i) => 1200 + i) : s === sym ? t.map((_, i) => (i === 5 ? null : 40 + i * 0.1)) : [];
  return Promise.resolve(new Response(JSON.stringify({ s: 'ok', t: s === sym || s === 'VNINDEX' ? t : [], c })));
};

test('GET /gia ghép giá cổ phiếu với VN-Index theo ngày, bỏ phiên thiếu giá, trả giá gần nhất bằng đồng', async () => {
  const res = await giaCoPhieu(new Request('https://x/gia?ma=dgw&nam=5'), { fetchFn: gia('DGW'), now: Date.UTC(2026, 2, 1) });
  const b = await res.json();
  assert.equal(b.ok, true);
  assert.equal(b.data.ma, 'DGW');
  assert.equal(b.data.rows.length, 39, 'phiên giá null bị bỏ');
  assert.deepEqual(b.data.rows[0], ['2026-01-01', 40, 1200]);
  assert.equal(b.data.gia, Math.round((40 + 39 * 0.1) * 1000));
  assert.match(res.headers.get('cache-control'), /max-age/);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('mã sai / mã không có dữ liệu / nguồn lỗi → báo rõ, không nhớ đệm', async () => {
  const sai = await giaCoPhieu(new Request('https://x/gia?ma=<script>'));
  assert.equal(sai.status, 400);
  const khong = await (await giaCoPhieu(new Request('https://x/gia?ma=ZZZ'), { fetchFn: gia('DGW') })).json();
  assert.equal(khong.code, 'khong_co');
  const hong = await giaCoPhieu(new Request('https://x/gia?ma=DGW'), { fetchFn: () => Promise.resolve(new Response('x', { status: 503 })) });
  assert.equal((await hong.json()).code, 'upstream');
  assert.equal(hong.headers.get('cache-control'), 'no-store');
});
