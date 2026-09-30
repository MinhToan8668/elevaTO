import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './helpers/gas.js';

const PATH = new URL('../backend/Code.gs', import.meta.url).pathname;
const KEY = 'AIzaTEST-secret-key-1234567890';
const MODELS = { models: [
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'], displayName: 'Gemini 3.8 Flash' },
  { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent', 'countTokens'] },
  { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] },
  { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
] };
const OK_BODY = { candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 120 } };

function setup(fetchImpl, props = {}) {
  const g = loadGas(PATH, {
    props: { GEMINI_KEY: KEY, AI_CODES: JSON.stringify({ 'hv-abc123': { name: 'Học viên A', perDay: 3 } }), ...props },
    fetch: fetchImpl || ((url, o, resp) => (url.includes('/models?') ? resp(200, MODELS) : resp(200, OK_BODY))),
  });
  return g;
}
const gen = (extra = {}) => ({ action: 'generate', code: 'hv-abc123', model: 'gemini-3.8-flash',
  contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { temperature: 0 }, ...extra });

test('ping: mã đúng → tên, hạn mức, danh sách model dùng được (lọc bỏ model không sinh văn bản)', () => {
  const g = setup();
  const r = g.post({ action: 'ping', code: 'hv-abc123' });
  assert.equal(r.ok, true);
  assert.equal(r.data.name, 'Học viên A');
  assert.deepEqual(r.data.quota, { used: 0, limit: 3 });
  assert.deepEqual(r.data.models.map((m) => m.id), ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview']);
});

test('generate: chuyển tiếp tới Gemini bằng key trên máy chủ, key không lộ ra phản hồi', () => {
  const g = setup();
  const r = g.post(gen());
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { text: '{"a":1}', finishReason: 'STOP', tokens: 120 });
  const call = g.calls.find((c) => c.url.includes(':generateContent'));
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(call.o.headers['x-goog-api-key'], KEY);
  assert.ok(!call.url.includes(KEY), 'key không được nằm trên URL');
  assert.ok(!JSON.stringify(r).includes(KEY));
  const sent = JSON.parse(call.o.payload);
  assert.deepEqual(sent.contents, gen().contents);
});

test('chỉ chuyển tiếp đúng các trường cho phép; chặn tools, cắt maxOutputTokens', () => {
  const g = setup();
  g.post(gen({ tools: [{ googleSearch: {} }], generationConfig: { temperature: 0, maxOutputTokens: 999999, responseMimeType: 'application/json', foo: 1 },
    systemInstruction: { parts: [{ text: 'sys' }] } }));
  const sent = JSON.parse(g.calls.find((c) => c.url.includes(':generateContent')).o.payload);
  assert.equal(sent.tools, undefined);
  assert.equal(sent.generationConfig.maxOutputTokens, 32768);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert.equal(sent.generationConfig.foo, undefined);
  assert.deepEqual(sent.systemInstruction, { parts: [{ text: 'sys' }] });
});

test('model lạ / không có trong danh sách → từ chối, không gọi Gemini', () => {
  const g = setup();
  for (const model of ['gemini-3.8-flash-tts', 'text-embedding-005', '../../evil', 'gemini-9-ultra']) {
    const r = g.post(gen({ model }));
    assert.equal(r.ok, false, model); assert.equal(r.code, 'bad');
  }
  assert.equal(g.calls.filter((c) => c.url.includes(':generateContent')).length, 0);
});

test('mã trùng tên thuộc tính có sẵn của object (constructor, __proto__…) KHÔNG được coi là mã đúng', () => {
  const g = setup();
  for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', ' constructor ']) {
    assert.equal(g.post({ action: 'ping', code }).code, 'key', code);
    assert.equal(g.post(gen({ code })).code, 'key', code);
  }
  assert.equal(g.calls.filter((c) => c.url.includes(':generateContent')).length, 0);
  const g2 = setup(undefined, { AI_CODES: '["hv-abc123"]' });
  assert.equal(g2.post({ action: 'ping', code: '0' }).code, 'key', 'AI_CODES hỏng dạng mảng');
});

test('sai mã → code key; sai nhiều lần → khoá mã lạ 10 phút, mã đúng vẫn dùng được (người lạ không khoá được cả lớp)', () => {
  const g = setup();
  assert.equal(g.post(gen({ code: 'sai' })).code, 'key');
  for (let i = 0; i < 20; i++) g.post({ action: 'ping', code: 'hv-x' + i });
  const r = g.post({ action: 'ping', code: 'hv-doan-tiep' });
  assert.equal(r.code, 'key'); assert.match(r.error, /quá nhiều lần/);
  assert.equal(g.post(gen()).ok, true, 'học viên có mã đúng không bị chặn');
  g.tick(11 * 60 * 1000);
  assert.doesNotMatch(g.post({ action: 'ping', code: 'hv-doan-tiep' }).error, /quá nhiều lần/);
});

test('giữ lượt TRƯỚC khi gọi Gemini (gọi song song không vượt hạn mức), lỗi thì trả lại lượt', () => {
  let usedDuringCall;
  const g = setup((url, o, resp) => {
    if (url.includes('/models?')) return resp(200, MODELS);
    usedDuringCall = g.post({ action: 'ping', code: 'hv-abc123' }).data.quota.used;
    return resp(200, OK_BODY);
  });
  assert.equal(g.post(gen()).ok, true);
  assert.equal(usedDuringCall, 1);
  assert.equal(g.post({ action: 'ping', code: 'hv-abc123' }).data.quota.used, 1);
});

test('mỗi mã có trần lượt/phút riêng: một người không chiếm hết nhịp của cả hệ thống', () => {
  const g = setup(undefined, { AI_CODES: JSON.stringify({ 'hv-aaa111': { name: 'A', perDay: 0 }, 'hv-bbb222': { name: 'B', perDay: 0 } }) });
  g.run('AI_RPM_MA = 2');
  assert.equal(g.post(gen({ code: 'hv-aaa111' })).ok, true);
  assert.equal(g.post(gen({ code: 'hv-aaa111' })).ok, true);
  const r = g.post(gen({ code: 'hv-aaa111' }));
  assert.equal(r.code, 'busy'); assert.ok(r.retryAfter > 0);
  assert.equal(g.post(gen({ code: 'hv-bbb222' })).ok, true);
});

test('không dùng máy chủ làm chat Gemini tự do: giới hạn độ dài chữ, chỉ dẫn hệ thống và mức "suy nghĩ"', () => {
  const g = setup();
  assert.equal(g.post(gen({ contents: [{ role: 'user', parts: [{ text: 'x'.repeat(300000) }] }] })).code, 'bad');
  assert.equal(g.post(gen({ systemInstruction: { parts: [{ text: 'y'.repeat(30000) }] } })).code, 'bad');
  g.post(gen({ generationConfig: { thinkingConfig: { thinkingBudget: 100000, includeThoughts: true, foo: 1 } } }));
  const sent = JSON.parse(g.calls.filter((c) => c.url.includes(':generateContent')).pop().o.payload);
  assert.deepEqual(sent.generationConfig.thinkingConfig, { thinkingBudget: 8192 });
});

test('hạn mức theo ngày: hết lượt → code quota; sang ngày mới được dùng tiếp', () => {
  const g = setup();
  for (let i = 0; i < 3; i++) assert.equal(g.post(gen()).ok, true);
  const r = g.post(gen());
  assert.equal(r.code, 'quota'); assert.match(r.error, /3 lượt/);
  assert.deepEqual(g.post({ action: 'ping', code: 'hv-abc123' }).data.quota, { used: 3, limit: 3 });
  g.tick(24 * 3600 * 1000);
  assert.equal(g.post(gen()).ok, true);
});

test('lỗi Gemini không tính vào hạn mức; 429 → code busy kèm số giây chờ', () => {
  const g = setup((url, o, resp) => (url.includes('/models?') ? resp(200, MODELS)
    : resp(429, { error: { code: 429, message: 'Resource exhausted', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }] } })));
  const r = g.post(gen());
  assert.equal(r.code, 'busy'); assert.equal(r.retryAfter, 17);
  assert.deepEqual(g.post({ action: 'ping', code: 'hv-abc123' }).data.quota.used, 0);
});

test('quá 60 giây (UrlFetch hết giờ) → code timeout để trang chia nhỏ việc', () => {
  const g = setup((url, o, resp) => { if (url.includes('/models?')) return resp(200, MODELS); throw new Error('Exception: Timeout: https://generativelanguage.googleapis.com/...'); });
  const r = g.post(gen());
  assert.equal(r.code, 'timeout');
  assert.ok(!JSON.stringify(r).includes('generativelanguage'));
});

test('Gemini chặn nội dung / trả rỗng / cắt vì hết token → báo rõ lý do', () => {
  const g1 = setup((url, o, resp) => (url.includes('/models?') ? resp(200, MODELS) : resp(200, { promptFeedback: { blockReason: 'SAFETY' } })));
  assert.equal(g1.post(gen()).code, 'blocked');
  const g2 = setup((url, o, resp) => (url.includes('/models?') ? resp(200, MODELS)
    : resp(200, { candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] })));
  const r2 = g2.post(gen());
  assert.equal(r2.ok, true); assert.equal(r2.data.finishReason, 'MAX_TOKENS');
  const g3 = setup((url, o, resp) => (url.includes('/models?') ? resp(200, MODELS) : resp(400, { error: { message: 'API key not valid. key=AIzaTEST' } })));
  const r3 = g3.post(gen());
  assert.equal(r3.code, 'upstream'); assert.ok(!JSON.stringify(r3).includes('AIza'));
});

test('chống dồn: quá số yêu cầu mỗi phút cho cả hệ thống → busy, phút sau chạy tiếp', () => {
  const g = setup(undefined, { AI_CODES: JSON.stringify({ 'hv-abc123': { name: 'A', perDay: 999 } }) });
  g.run('AI_RPM = 3');
  for (let i = 0; i < 3; i++) assert.equal(g.post(gen()).ok, true);
  const r = g.post(gen());
  assert.equal(r.code, 'busy'); assert.ok(r.retryAfter > 0 && r.retryAfter <= 60);
  g.tick(61 * 1000);
  assert.equal(g.post(gen()).ok, true);
});

test('yêu cầu quá lớn / sai dạng → bad, không gọi Gemini', () => {
  const g = setup();
  assert.equal(g.post(gen({ contents: 'x' })).code, 'bad');
  assert.equal(g.post(gen({ contents: [{ role: 'user', parts: [{ text: 'x'.repeat(46 * 1024 * 1024) }] }] })).code, 'bad');
  assert.equal(g.post({ action: 'lala', code: 'hv-abc123' }).code, 'bad');
  assert.equal(JSON.parse(g.ctx.doPost({ postData: { contents: '{bad' } })).code, 'bad');
});

test('quản trị: thêm mã, xoá mã, mã quản trị không giới hạn lượt', () => {
  const g = setup();
  g.run("themMa('Học viên B', 5)");
  const codes = JSON.parse(g.props.AI_CODES);
  const b = Object.entries(codes).find(([, v]) => v.name === 'Học viên B');
  assert.ok(b && b[1].perDay === 5 && /^[a-z0-9-]{10,}$/.test(b[0]));
  g.run(`xoaMa('${b[0]}')`);
  assert.equal(JSON.parse(g.props.AI_CODES)[b[0]], undefined);
  const g2 = setup(undefined, { ADMIN_CODE: 'admin-xyz789' });
  for (let i = 0; i < 10; i++) assert.equal(g2.post(gen({ code: 'admin-xyz789' })).ok, true);
});

test('chưa cài key → báo rõ, không gọi ra ngoài', () => {
  const g = setup(undefined, { GEMINI_KEY: '' });
  const r = g.post(gen());
  assert.equal(r.code, 'setup');
  assert.equal(g.calls.length, 0);
});
