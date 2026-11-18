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
import { MAX_PHAN, taiLen, taiPhan, taiThang } from '../worker/src/taive.js';

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

function yeuCau(d, s, them = {}) {
  const form = new FormData();
  form.set('d', d);
  form.set('s', s);
  for (const [k, v] of Object.entries(them)) form.set(k, v);
  return new Request('https://w.example/taive', { method: 'POST', body: form });
}

/** Rút thư postMessage ra khỏi trang lỗi Worker trả cho trang upload. */
function thuTrongTrang(html) {
  const m = /parent\.postMessage\((\{.*?\}), '\*'\)/s.exec(html);
  assert.ok(m, `trang lỗi không có postMessage:\n${html}`);
  return JSON.parse(m[1]);
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

// ─── Trang upload gửi qua iframe ẩn (ui=1) ─────────────────────────────────
// Lỗi trả chữ trơn thì nằm im trong khung ẩn: người dùng bấm Tải thẳng, nút hiện "Đang
// xin…" rồi thôi, không có gì xảy ra. Nên với ui=1 Worker trả trang tự báo ngược lên.

test('ui=1: lỗi trả thành trang báo ngược lên trang upload, kèm đúng mã lần bấm', async () => {
  const ga = gaTelegram({});
  try {
    const { d } = await veTest();
    const res = await taiThang(yeuCau(d, await ky(d, 'bi-mat-khac-hoan-toan-dai-24'), { ui: '1', ma: 'tt-abc_123' }), ENV);
    assert.equal(res.status, 403, 'vẫn giữ mã lỗi thật');
    assert.match(res.headers.get('content-type'), /^text\/html; charset=utf-8/);
    const thu = thuTrongTrang(await res.text());
    assert.deepEqual(thu, { taive: 'loi', ma: 'tt-abc_123', msg: 'Vé tải không hợp lệ' });
    assert.equal(ga.goi.length, 0);
  } finally { ga.thoi(); }
});

test('ui=1: mọi nhánh lỗi đều báo ngược được — thiếu secret, vé hết hạn, thiếu vé', async () => {
  const { d, s } = await veTest();
  const thieu = await taiThang(yeuCau(d, s, { ui: '1', ma: 'a' }), { TAIVE_SECRET: BI_MAT });
  assert.equal(thieu.status, 503);
  assert.match(thuTrongTrang(await thieu.text()).msg, /UPLOAD_TG_TOKEN/);
  const cu = await veTest({ e: Date.now() - 1000 });
  const het = await taiThang(yeuCau(cu.d, cu.s, { ui: '1', ma: 'b' }), ENV);
  assert.match(thuTrongTrang(await het.text()).msg, /hết hạn/);
  const rong = await taiThang(yeuCau('', '', { ui: '1', ma: 'c' }), ENV);
  assert.equal(thuTrongTrang(await rong.text()).msg, 'Thiếu vé tải');
});

test('ui=1: mã lần bấm bị lọc, không chèn được mã độc vào trang lỗi', async () => {
  const { d } = await veTest();
  const ac = '"</script><script>alert(1)</script>';
  const res = await taiThang(yeuCau(d, 'sai', { ui: '1', ma: ac }), ENV);
  const html = await res.text();
  assert.equal((html.match(/<script>/g) || []).length, 1, 'chỉ đúng một thẻ script của Worker');
  assert.doesNotMatch(html, /alert\(1\)<\/script>/);
  assert.equal(thuTrongTrang(html).ma, 'scriptscriptalert1script', 'chỉ còn chữ, số, _ và -');
});

test('không có ui=1 thì lỗi vẫn là chữ trơn như cũ (gọi bằng curl, bài kiểm tra cũ)', async () => {
  const { d } = await veTest();
  const res = await taiThang(yeuCau(d, 'sai'), ENV);
  assert.equal(res.status, 403);
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  assert.equal(await res.text(), 'Vé tải không hợp lệ\n');
});

test('ui=1 mà vé đúng thì vẫn trả file như thường — cờ chỉ đổi cách báo lỗi', async () => {
  const ga = gaTelegram({ 'documents/p1.bin': 'abc', 'documents/p2.bin': 'defg' });
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s, { ui: '1', ma: 'x' }), ENV);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /^attachment/);
    assert.equal(await res.text(), 'abcdefg');
  } finally { ga.thoi(); }
});

test('vé ký đúng y kiểu Apps Script (base64 web-safe CÓ dấu = ở cuối) vẫn qua được', async () => {
  // Utilities.base64EncodeWebSafe giữ dấu '=' đệm, còn bài kiểm tra khác ký bằng base64url bỏ '='.
  // Hai bên lệch kiểu mà Worker không nhận thì MỌI vé thật đều "không hợp lệ".
  const ga = gaTelegram({ 'documents/p1.bin': 'abc', 'documents/p2.bin': 'defg' });
  try {
    const ve = { n: 'Modeling Buổi 2.mp4', s: 7, e: Date.now() + 600000,
      f: [['fid-1', 'documents/p1.bin'], ['fid-2', 'documents/p2.bin']] };
    const coDem = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    const d = coDem(Buffer.from(JSON.stringify(ve), 'utf8'));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(BI_MAT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const s = coDem(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(d))));
    assert.ok(s.endsWith('='), 'chữ ký HMAC-SHA256 dạng base64 luôn có một dấu = đệm');
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'abcdefg');
  } finally { ga.thoi(); }
});

// ─── Không bao giờ để trình duyệt lưu một bản cụt mà tưởng là xong ─────────────
// Thực tế: file 540MB, trình duyệt báo "Done" ở 81MB. Trên Cloudflare, Response bọc
// TransformStream bị VỨT content-length (gửi chunked) — đã thử trong workerd. Phải dùng
// FixedLengthStream: Cloudflare gửi đúng content-length và luồng thiếu byte thì lỗi.

test('trên Cloudflare dùng FixedLengthStream với đúng dung lượng trong vé', async () => {
  const ga = gaTelegram({ 'documents/p1.bin': 'abc', 'documents/p2.bin': 'defg' });
  const cu = globalThis.FixedLengthStream;
  const dung = [];
  globalThis.FixedLengthStream = class extends TransformStream { constructor(n) { super(); dung.push(n); } };
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(await res.text(), 'abcdefg');
    assert.deepEqual(dung, [7], 'phải mở FixedLengthStream đúng bằng dung lượng file');
  } finally {
    if (cu === undefined) delete globalThis.FixedLengthStream; else globalThis.FixedLengthStream = cu;
    ga.thoi();
  }
});

/** Telegram giả mà một phần trả lỗi (hoặc đứt mạng) vài lần đầu rồi mới được. */
function gaTelegramChapChon(phan, hongLan) {
  const that = globalThis.fetch;
  const goi = [];
  const dem = {};
  globalThis.fetch = async (url) => {
    goi.push(String(url));
    const duong = String(url).split(`/bot${TOKEN}/`)[1] || '';
    dem[duong] = (dem[duong] || 0) + 1;
    const kieu = (hongLan[duong] || [])[dem[duong] - 1];
    if (kieu === 'mang') throw new TypeError('network connection lost');
    if (kieu) return new Response('', { status: kieu });
    return new Response(phan[duong]);
  };
  return { goi, thoi: () => { globalThis.fetch = that; } };
}

test('Telegram trục trặc thoáng qua ở một phần (502, đứt mạng, 429) thì thử lại, file vẫn đủ', async () => {
  const ga = gaTelegramChapChon(
    { 'documents/p1.bin': 'abc', 'documents/p2.bin': 'defg' },
    { 'documents/p2.bin': [502, 'mang', 429] },
  );
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(await res.text(), 'abcdefg');
    assert.equal(ga.goi.filter((u) => u.endsWith('p2.bin')).length, 4, '3 lần hỏng + 1 lần được');
  } finally { ga.thoi(); }
});

test('hỏng mãi thì thôi, luồng đứt (không treo, không lặp vô hạn)', async () => {
  const ga = gaTelegramChapChon(
    { 'documents/p1.bin': 'abc', 'documents/p2.bin': 'defg' },
    { 'documents/p2.bin': [502, 502, 502, 502, 502, 502] },
  );
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s), ENV);
    await assert.rejects(res.text(), 'thiếu byte thì phải báo hỏng, không được coi như xong');
    assert.equal(ga.goi.filter((u) => u.endsWith('p2.bin')).length, 4, 'thử tối đa 3 lần');
  } finally { ga.thoi(); }
});

// ─── Vé có phần chưa có đường dẫn (Apps Script hỏi Telegram mãi bị "Gateway Timeout") ──────

test('phần để trống đường dẫn trong vé thì Worker tự xin bù bằng file_id rồi tải đủ', async () => {
  const goi = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    goi.push(String(url));
    const u = String(url);
    if (u.endsWith('/getFile')) {
      const { file_id } = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, result: { file_path: `documents/${file_id}.bin` } }));
    }
    if (u.endsWith('documents/p1.bin')) return new Response('abc');
    if (u.endsWith('documents/fid-2.bin')) return new Response('defg');
    return new Response('', { status: 404 });
  };
  try {
    const { d, s } = await veTest({ f: [['fid-1', 'documents/p1.bin'], ['fid-2', '']] });
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'abcdefg');
    assert.equal(goi.filter((u) => u.endsWith('/getFile')).length, 1, 'chỉ xin bù đúng phần thiếu');
  } finally { globalThis.fetch = that; }
});

test('thiếu đường dẫn nhiều tới mức hết lượt subrequest thì báo ngay, chưa mở luồng', async () => {
  const f = Array.from({ length: 30 }, (_, i) => [`fid-${i}`, i < 25 ? `documents/p${i}.bin` : '']);
  // 30 phần + 5 lượt xin bù = 35 ≤ 50 → nhận; nhưng 44 phần + 10 thiếu = 54 > 50 → từ chối.
  // Tải HẾT bản nhận được (mỗi phần 1 byte) để luồng nền không chạy dở chen sang bài sau.
  const that = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).endsWith('/getFile')
    ? new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/bu.bin' } }))
    : new Response('x'));
  try {
    const ok = await veTest({ f, s: 30 });
    const r = await taiThang(yeuCau(ok.d, ok.s, { ui: '1', ma: 'a' }), ENV);
    assert.equal(r.status, 200);
    assert.equal((await r.text()).length, 30);
  } finally { globalThis.fetch = that; }
  const nhieu = Array.from({ length: 44 }, (_, i) => [`fid-${i}`, i < 34 ? `documents/p${i}.bin` : '']);
  const v = await veTest({ f: nhieu, s: 44 });
  const res = await taiThang(yeuCau(v.d, v.s, { ui: '1', ma: 'b' }), ENV);
  assert.equal(res.status, 400);
  assert.match(thuTrongTrang(await res.text()).msg, /Telegram đang nghẽn, còn 10 phần/);
});

test('đường dẫn hết hạn (404) đã xin lại, lần thử sau dùng đường dẫn MỚI chứ không quay về cái cũ', async () => {
  const goi = [];
  const that = globalThis.fetch;
  let lanMoi = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    goi.push(u);
    if (u.endsWith('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/moi.bin' } }));
    if (u.endsWith('documents/p1.bin')) return new Response('abc');
    if (u.endsWith('documents/p2.bin')) return new Response('', { status: 404 });         // hết hạn
    if (u.endsWith('documents/moi.bin')) return ++lanMoi === 1 ? new Response('', { status: 502 }) : new Response('defg');
    return new Response('', { status: 404 });
  };
  try {
    const { d, s } = await veTest();
    const res = await taiThang(yeuCau(d, s), ENV);
    assert.equal(await res.text(), 'abcdefg');
    assert.equal(goi.filter((u) => u.endsWith('documents/p2.bin')).length, 1, 'không quay lại đường dẫn đã hết hạn');
    assert.equal(goi.filter((u) => u.endsWith('documents/moi.bin')).length, 2, '502 lần đầu rồi thử lại đúng đường dẫn mới');
  } finally { globalThis.fetch = that; }
});

// ─── Tải từng phần: POST /taive/phan { d, s, i } ───────────────────────────────
// Trang tự tải từng phần, hỏng phần nào tải lại đúng phần đó, rồi ghép thành một file trên máy.

const xinPhan = (d, s, i) => new Request('https://w.example/taive/phan', {
  method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ d, s, i }),
});

test('trả đúng phần thứ i, có CORS để trang đọc được, có dung lượng', async () => {
  const ga = gaTelegram({ 'documents/p1.bin': 'abc', 'documents/p2.bin': 'defg' });
  try {
    const { d, s } = await veTest();
    const r1 = await taiPhan(xinPhan(d, s, 1), ENV);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('access-control-allow-origin'), '*');
    assert.equal(await r1.text(), 'defg');
    assert.equal(await (await taiPhan(xinPhan(d, s, 0), ENV)).text(), 'abc');
    assert.equal(ga.goi.length, 2, 'mỗi lần gọi chỉ tải đúng một phần');
  } finally { ga.thoi(); }
});

test('lỗi trả JSON có mã để trang biết phải làm gì (kèm CORS — không thì trang không đọc được)', async () => {
  const { d, s } = await veTest();
  const sai = await taiPhan(xinPhan(d, 'sai', 0), ENV);
  assert.equal(sai.status, 403);
  assert.equal(sai.headers.get('access-control-allow-origin'), '*');
  assert.equal((await sai.json()).ma, 'sai_ky');
  const cu = await veTest({ e: Date.now() - 1000 });
  const het = await taiPhan(xinPhan(cu.d, cu.s, 0), ENV);
  assert.equal(het.status, 410);
  assert.equal((await het.json()).ma, 'het_han', 'trang xin vé mới rồi tải tiếp từ phần đang dở');
  for (const i of [-1, 2, 1.5, 'x']) {
    assert.equal((await (await taiPhan(xinPhan(d, s, i), ENV)).json()).ma, 'hong', `i=${i}`);
  }
  assert.equal((await (await taiPhan(xinPhan(d, s, 0), { TAIVE_SECRET: BI_MAT })).json()).ma, 'cai_dat');
});

test('không còn trần 44 phần — mỗi lần gọi một phần, có đủ 50 lượt riêng', async () => {
  const f = Array.from({ length: 60 }, (_, i) => [`fid-${i}`, `documents/p${i}.bin`]);
  const ga = gaTelegram({ 'documents/p59.bin': 'z' });
  try {
    const { d, s } = await veTest({ f, s: 60 });
    const r = await taiPhan(xinPhan(d, s, 59), ENV);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'z');
  } finally { ga.thoi(); }
});

test('phần trống đường dẫn / đường dẫn hết hạn / Telegram chập — vẫn lấy được phần đó', async () => {
  const goi = [];
  const that = globalThis.fetch;
  let lan = 0;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    goi.push(u);
    if (u.endsWith('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: `documents/${JSON.parse(init.body).file_id}.bin` } }));
    if (u.endsWith('documents/cu.bin')) return new Response('', { status: 404 });
    if (u.endsWith('documents/fid-b.bin')) return ++lan === 1 ? new Response('', { status: 502 }) : new Response('BB');
    if (u.endsWith('documents/fid-a.bin')) return new Response('AA');
    return new Response('', { status: 404 });
  };
  try {
    const { d, s } = await veTest({ f: [['fid-a', ''], ['fid-b', 'documents/cu.bin']], s: 4 });
    assert.equal(await (await taiPhan(xinPhan(d, s, 0), ENV)).text(), 'AA', 'trống đường dẫn → xin bù');
    assert.equal(await (await taiPhan(xinPhan(d, s, 1), ENV)).text(), 'BB', 'hết hạn → xin mới; 502 → thử lại');
  } finally { globalThis.fetch = that; }
});

test('Telegram hỏng hẳn phần đó → 502 mã telegram, trang thử lại sau', async () => {
  const ga = gaTelegramChapChon({ 'documents/p1.bin': 'abc' }, { 'documents/p1.bin': [500, 500, 500, 500] });
  try {
    const { d, s } = await veTest();
    const r = await taiPhan(xinPhan(d, s, 0), ENV);
    assert.equal(r.status, 502);
    assert.equal((await r.json()).ma, 'telegram');
  } finally { ga.thoi(); }
});

test('Telegram nói chắc không có / không cho (token sai, file_id sai) → mã telegram_hong, khỏi thử lại', async () => {
  const goi = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    goi.push(u);
    if (u.endsWith('/getFile')) return new Response(JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: wrong file_id' }), { status: 400 });
    if (u.endsWith('documents/p1.bin')) return new Response('', { status: 404 });     // hết hạn → xin lại → 400 vĩnh viễn
    if (u.endsWith('documents/p2.bin')) return new Response('', { status: 401 });     // token Worker không phải bot đã gửi file
    return new Response('', { status: 404 });
  };
  try {
    const { d, s } = await veTest();
    const r0 = await taiPhan(xinPhan(d, s, 0), ENV);
    assert.equal(r0.status, 502);
    assert.equal((await r0.json()).ma, 'telegram_hong');
    const r1 = await taiPhan(xinPhan(d, s, 1), ENV);
    assert.equal((await r1.json()).ma, 'telegram_hong');
    assert.equal(goi.filter((u) => u.endsWith('p2.bin')).length, 1, '401 không thử lại');
    // Thông báo lỗi không được lộ token bot (đường dẫn Telegram chứa token).
    const { d: d2, s: s2 } = await veTest({ f: [['fid-x', '']], s: 1 });
    const r2 = await taiPhan(xinPhan(d2, s2, 0), ENV);
    const j2 = await r2.json();
    assert.equal(j2.ma, 'telegram_hong', 'getFile trả 400 cho phần trống đường dẫn → vĩnh viễn');
    assert.doesNotMatch(JSON.stringify(j2), new RegExp(TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { globalThis.fetch = that; }
});

// ─── Gửi thẳng lên Telegram: POST /tailen?d&s&i, thân = byte của phần i ─────────────

async function veGui(sua = {}) {
  const ve = { k: 'up', id: 'u1', n: 'Buổi 3.mp4', s: 10, p: 3, ps: 4, c: '-100123', e: Date.now() + 600000, ...sua };
  const d = b64url(Buffer.from(JSON.stringify(ve), 'utf8'));
  return { d, s: await ky(d) };
}
const guiPhan = (d, s, i, than) => new Request(`https://w.example/tailen?d=${d}&s=${encodeURIComponent(s)}&i=${i}`, {
  method: 'POST', body: than, headers: { 'content-length': String(than.length) },
});
/** Telegram giả cho sendDocument: ghi lại mọi thứ nhận được, trả file_id theo kịch bản. */
function gaGui(traLoi = () => ({ ok: true })) {
  const that = globalThis.fetch;
  const nhan = [];
  globalThis.fetch = async (url, init) => {
    const f = init.body;   // FormData
    const doc = f.get('document');
    const ban = { url: String(url), chat: f.get('chat_id'), caption: f.get('caption'), ten: doc.name, bytes: new Uint8Array(await doc.arrayBuffer()) };
    nhan.push(ban);
    const kb = traLoi(ban, nhan.length);
    if (kb.ok) return new Response(JSON.stringify({ ok: true, result: { message_id: 70 + nhan.length, document: { file_id: `FID-${nhan.length}` } } }));
    return new Response(JSON.stringify({ ok: false, ...kb }), { status: kb.error_code || 500 });
  };
  return { nhan, thoi: () => { globalThis.fetch = that; } };
}

test('gửi thẳng: đúng chat trong vé, tên .001/.002 như cũ, đúng từng byte, trả file_id', async () => {
  const ga = gaGui();
  try {
    const { d, s } = await veGui();
    const r = await taiLen(guiPhan(d, s, 1, new Uint8Array([5, 6, 7, 8])), ENV);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await r.json(), { ok: true, fid: 'FID-1', mid: 71 });
    const [b] = ga.nhan;
    assert.match(b.url, /\/bot123456:FAKE-TOKEN\/sendDocument$/);
    assert.equal(b.chat, '-100123');
    assert.equal(b.ten, 'Buổi 3.mp4.002');
    assert.equal(b.caption, 'Buổi 3.mp4 — phần 2/3');
    assert.deepEqual([...b.bytes], [5, 6, 7, 8]);
    // Phần cuối ngắn hơn (10 = 4 + 4 + 2).
    assert.equal((await taiLen(guiPhan(d, s, 2, new Uint8Array([1, 2])), ENV)).status, 200);
    // File một phần thì giữ nguyên tên.
    const mot = await veGui({ s: 3, p: 1, ps: 4 });
    await taiLen(guiPhan(mot.d, mot.s, 0, new Uint8Array([1, 2, 3])), ENV);
    assert.equal(ga.nhan.at(-1).ten, 'Buổi 3.mp4');
  } finally { ga.thoi(); }
});

test('gửi thẳng: sai dung lượng / sai chữ ký / vé hết hạn / vé TẢI VỀ / số phần lạ → từ chối, không gửi gì', async () => {
  const ga = gaGui();
  try {
    const { d, s } = await veGui();
    const ma = async (req) => (await (await taiLen(req, ENV)).json()).ma;
    assert.equal(await ma(guiPhan(d, s, 0, new Uint8Array(3))), 'hong', 'phần 1 phải đủ 4 byte');
    assert.equal(await ma(guiPhan(d, 'sai', 0, new Uint8Array(4))), 'sai_ky');
    const cu = await veGui({ e: Date.now() - 1 });
    assert.equal(await ma(guiPhan(cu.d, cu.s, 0, new Uint8Array(4))), 'het_han');
    const taiVe = await veTest();   // vé tải về ký cùng bí mật — không được dùng để gửi
    assert.equal(await ma(guiPhan(taiVe.d, taiVe.s, 0, new Uint8Array(4))), 'hong');
    for (const i of [-1, 3, 'x']) assert.equal(await ma(guiPhan(d, s, i, new Uint8Array(4))), 'hong', `i=${i}`);
    const sai = await veGui({ p: 9 });   // số phần không khớp dung lượng / cỡ phần
    assert.equal(await ma(guiPhan(sai.d, sai.s, 0, new Uint8Array(4))), 'hong');
    const to = await veGui({ ps: 30 * 1048576, s: 10, p: 1 });   // phần > 20MB thì bot không tải về được
    assert.equal(await ma(guiPhan(to.d, to.s, 0, new Uint8Array(10))), 'hong');
    assert.equal(ga.nhan.length, 0, 'không gửi gì lên Telegram');
  } finally { ga.thoi(); }
});

test('gửi thẳng: Telegram bảo chờ (429) → mã cham + số giây; từ chối hẳn (400/403) → telegram_hong; 5xx → telegram', async () => {
  const kb = [{ error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } },
    { error_code: 400, description: 'Bad Request: chat not found' }, { error_code: 403, description: 'Forbidden: bot was kicked' },
    { error_code: 502, description: 'Bad Gateway' }];
  const ga = gaGui((_, lan) => kb[lan - 1]);
  try {
    const { d, s } = await veGui();
    const r1 = await taiLen(guiPhan(d, s, 0, new Uint8Array(4)), ENV);
    assert.equal(r1.status, 429);
    assert.deepEqual(await r1.json(), { ok: false, ma: 'cham', sau: 7, loi: 'Too Many Requests' });
    assert.equal((await (await taiLen(guiPhan(d, s, 0, new Uint8Array(4)), ENV)).json()).ma, 'telegram_hong');
    assert.equal((await (await taiLen(guiPhan(d, s, 0, new Uint8Array(4)), ENV)).json()).ma, 'telegram_hong');
    const r4 = await (await taiLen(guiPhan(d, s, 0, new Uint8Array(4)), ENV)).json();
    assert.equal(r4.ma, 'telegram');
    assert.doesNotMatch(JSON.stringify(r4), /FAKE-TOKEN/, 'không lộ token bot');
  } finally { ga.thoi(); }
});
