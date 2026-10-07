/**
 * Tải thẳng (ai/worker/src/taive.js): Worker nối các phần từ Telegram thành một luồng về máy.
 *
 * Bài ở đây canh đúng hai thứ không được sai:
 *   • vé phải có chữ ký đúng — Worker cầm token bot, ai gửi vé cũng tải được là hỏng;
 *   • các phần phải nối ĐÚNG THỨ TỰ và đủ byte — sai một chỗ là file tải về hỏng lặng lẽ,
 *     mở ra mới biết.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PHAN, taiThang } from '../worker/src/taive.js';

const BI_MAT = 'bi-mat-dung-chung-dai-hon-24-ky-tu';
const TOKEN = '123456:FAKE-TOKEN';
const ENV = { UPLOAD_TG_TOKEN: TOKEN, TAIVE_SECRET: BI_MAT };

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function ky(d, biMat = BI_MAT) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(biMat), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(d))));
}

/** Vé mặc định: hai phần, tên có dấu tiếng Việt. */
async function veTest(sua = {}) {
  const ve = {
    n: 'Báo cáo tài chính.pdf',
    s: 7,
    e: Date.now() + 600000,
    f: [['fid-1', 'documents/p1.bin'], ['fid-2', 'documents/p2.bin']],
    ...sua,
  };
  const d = b64url(Buffer.from(JSON.stringify(ve), 'utf8'));
  return { d, s: await ky(d) };
}

function yeuCau(d, s) {
  const form = new FormData();
  form.set('d', d);
  form.set('s', s);
  return new Request('https://w.example/taive', { method: 'POST', body: form });
}

/** Thay fetch toàn cục: mỗi đường dẫn trả về đúng mấy byte đã hẹn. Trả về nhật ký đã gọi gì. */
function gaTelegram(phan, { hong = new Set() } = {}) {
  const that = globalThis.fetch;
  const goi = [];
  globalThis.fetch = async (url) => {
    goi.push(String(url));
    const duong = String(url).split(`/bot${TOKEN}/`)[1] || '';
    if (duong === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/moi.bin' } }));
    if (hong.has(duong)) return new Response('', { status: 404 });
    const b = phan[duong];
    return b ? new Response(b) : new Response('', { status: 404 });
  };
  return { goi, thoi: () => { globalThis.fetch = that; } };
}

test('vé đúng chữ ký: các phần nối đúng thứ tự, header đặt tên file có dấu', async () => {
  const ga = gaTelegram({
    'documents/p1.bin': new Uint8Array([1, 2, 3]),
    'documents/p2.bin': new Uint8Array([4, 5, 6, 7]),
  });
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-length'), '7');
    const cd = res.headers.get('content-disposition');
    assert.match(cd, /^attachment;/);
    // Bản ASCII không được mang ký tự lạ, bản có dấu đi kèm ở filename*
    assert.match(cd, /filename="B_o c_o t_i ch_nh\.pdf"/);
    assert.match(cd, /filename\*=UTF-8''B%C3%A1o%20c%C3%A1o/);
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
  } finally { ga.thoi(); }
});

test('sai chữ ký thì từ chối — Worker cầm token bot, không thể ai gửi vé cũng tải được', async () => {
  const ga = gaTelegram({});
  try {
    const { d } = await veTest();
    const res = await taiThang(yeuCau(d, await ky(d, 'bi-mat-khac-hoan-toan-dai-24')), ENV);
    assert.equal(res.status, 403);
    assert.equal(ga.goi.length, 0, 'chưa kiểm xong chữ ký mà đã gọi Telegram');
  } finally { ga.thoi(); }
});

test('đổi ruột vé mà giữ chữ ký cũ thì từ chối', async () => {
  const ga = gaTelegram({});
  try {
    const { s } = await veTest();
    const { d } = await veTest({ n: 'file-khac.zip' });
    assert.equal((await taiThang(yeuCau(d, s), ENV)).status, 403);
    assert.equal(ga.goi.length, 0);
  } finally { ga.thoi(); }
});

test('vé hết hạn thì từ chối', async () => {
  const { d, s } = await veTest({ e: Date.now() - 1000 });
  const res = await taiThang(yeuCau(d, s), ENV);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /hết hạn/);
});

test('vé nhiều phần hơn mức Worker gánh nổi thì từ chối ngay, không tải dở dang', async () => {
  const f = Array.from({ length: MAX_PHAN + 1 }, (_, i) => [`fid-${i}`, `documents/p${i}.bin`]);
  const { d, s } = await veTest({ f });
  const res = await taiThang(yeuCau(d, s), ENV);
  assert.equal(res.status, 400);
  assert.match(await res.text(), new RegExp(String(MAX_PHAN)));
});

test('đường dẫn hết hạn giữa chừng: xin lại rồi tải tiếp, không bỏ cả bản tải', async () => {
  const ga = gaTelegram({
    'documents/p1.bin': new Uint8Array([1, 2, 3]),
    'documents/moi.bin': new Uint8Array([4, 5, 6, 7]),
  }, { hong: new Set(['documents/p2.bin']) });
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
    assert.ok(ga.goi.some((u) => u.endsWith('/getFile')), 'phải gọi getFile xin đường dẫn mới');
  } finally { ga.thoi(); }
});

test('phần tải hỏng hẳn: luồng đứt, trình duyệt nhận thiếu byte chứ không lưu file cụt coi như xong', async () => {
  const ga = gaTelegram({ 'documents/p1.bin': new Uint8Array([1, 2, 3]) });
  try {
    const { d, s } = await veTest({ f: [['fid-1', 'documents/p1.bin'], ['fid-2', 'documents/mat.bin']] });
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(res.headers.get('content-length'), '7');
    await assert.rejects(() => res.arrayBuffer());
  } finally { ga.thoi(); }
});

test('Worker chưa cài secret thì nói thẳng, không im lặng trả file rỗng', async () => {
  const { d, s } = await veTest();
  assert.equal((await taiThang(yeuCau(d, s), { TAIVE_SECRET: BI_MAT })).status, 503);
  assert.equal((await taiThang(yeuCau(d, s), { UPLOAD_TG_TOKEN: TOKEN })).status, 503);
});
