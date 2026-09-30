// Máy chủ trả lời thiếu / lạ thì trang phải báo bằng lời người đọc hiểu, không được ném lỗi kỹ thuật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, callApi, AIError, isSplittable, isFatal } from '../js/ai.js';

const API = 'https://vi-du/exec';
/** Giả lập fetch: trả lần lượt các đáp án đã xếp sẵn. */
function fakeFetch(...answers) {
  const calls = [];
  globalThis.fetch = async (url, o) => {
    calls.push(JSON.parse(o.body));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return { ok: a.status === undefined ? true : a.status < 400, status: a.status || 200, json: async () => a.body, text: async () => JSON.stringify(a.body) };
  };
  return calls;
}
const OK = (data) => ({ body: { ok: true, data } });
const LOI = (code, error, extra = {}) => ({ body: { ok: false, code, error, ...extra } });
const AI_OK = OK({ text: '{"items":[{"c":"100"}]}', finishReason: 'STOP', tokens: 10 });
const gen = (client) => client.json({ parts: [{ text: 'hi' }], schema: { type: 'OBJECT' } });

test('máy chủ trả ok nhưng thiếu dữ liệu → báo lời dễ hiểu, không ném TypeError', async () => {
  fakeFetch({ body: { ok: true } });
  const e = await gen(createClient({ api: API, token: 't' })).then(() => null, (x) => x);
  assert.ok(e instanceof AIError, `phải là AIError, nhận: ${e}`);
  assert.doesNotMatch(e.message, /undefined|Cannot read/i, e.message);
  assert.match(e.message, /thử lại/i);
});

test('kết quả bị cắt vì quá dài → mã truncated để trang tự chia nhỏ rồi gọi lại', async () => {
  fakeFetch(OK({ text: '{"items":[', finishReason: 'MAX_TOKENS' }));
  const e = await gen(createClient({ api: API, token: 't' })).then(() => null, (x) => x);
  assert.equal(e.code, 'truncated');
  assert.ok(isSplittable(e));
});

test('máy chủ bận → tự chờ rồi gọi lại, chờ đủ số lần vẫn bận thì báo bận (không phải lỗi lạ)', async () => {
  const waits = [];
  fakeFetch(LOI('busy', 'Gemini đang quá tải', { retryAfter: 1 }), LOI('busy', 'Gemini đang quá tải', { retryAfter: 1 }), AI_OK);
  const client = createClient({ api: API, token: 't', onWait: (s) => waits.push(s) });
  const r = await gen(client);
  assert.deepEqual(r, { items: [{ c: '100' }] });
  assert.deepEqual(waits, [2, 2], 'có báo cho người dùng biết đang chờ');
});

test('hết lượt / phiên hết hạn là lỗi dừng hẳn, không thử lại', async () => {
  fakeFetch(LOI('quota', 'Hôm nay đã dùng hết 10 lượt AI'));
  const e1 = await gen(createClient({ api: API, token: 't' })).then(() => null, (x) => x);
  assert.ok(isFatal(e1));
  let goiOnAuth = 0;
  fakeFetch(LOI('auth', 'Phiên đăng nhập đã hết'));
  const e2 = await gen(createClient({ api: API, token: 't', onAuth: () => goiOnAuth++ })).then(() => null, (x) => x);
  assert.equal(e2.code, 'auth');
  assert.equal(goiOnAuth, 1);
});

test('máy chủ trả chữ không phải JSON (trang lỗi của Google) → báo máy chủ trả lời lạ', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
  const e = await callApi(API, { action: 'toi' }).then(() => null, (x) => x);
  assert.equal(e.code, 'network');
  assert.doesNotMatch(e.message, /not json/);
});

test('Gemini từ chối khuôn JSON (400) → báo mã lỗi riêng, KHÔNG âm thầm bỏ khuôn rồi trả về rác', async () => {
  // Bỏ khuôn mà giữ nguyên câu lệnh thì AI không biết đặt tên trường, trả JSON lạ →
  // tool tưởng "không thấy bảng". Phải ném mã 'schema' để bên gọi thử lại bằng câu lệnh có tả cấu trúc.
  const calls = fakeFetch(LOI('upstream', 'Gemini báo lỗi 400 (INVALIDARGUMENT)'));
  const e = await gen(createClient({ api: API, token: 't' })).then(() => null, (x) => x);
  assert.equal(e.code, 'schema');
  assert.match(e.message, /khuôn/i);
  assert.equal(calls.length, 1, 'không tự gọi lại lần hai');
});
