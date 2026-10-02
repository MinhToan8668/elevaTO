import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { sachYeuCau } from '../worker/src/gemini.js';
import { moCtx, moEnv } from './helpers/d1.js';

const SCHEMA = new URL('../worker/schema.sql', import.meta.url);
const API = 'https://elevato-ai.workers.dev/';

const NGUOI = {
  action: 'dangky', ten: 'Người Dùng', email: 'nguoi@gmail.com', sdt: '0376292148',
  mk: 'matkhau123', tuoi: 30, nghe_nghiep: 'Kế toán', muc_dich: 'Đọc BCTC',
};
const YEU_CAU = { contents: [{ role: 'user', parts: [{ text: 'Đọc bảng này' }] }] };

/**
 * Thay fetch bằng bản giả: trả danh sách model, rồi trả lời generateContent theo kịch bản.
 * @param tra (model, i) → { status, body } cho lần gọi generateContent thứ i
 */
function moFetch(tra, { models = ['gemini-3-flash', 'gemini-3-flash-lite'] } = {}) {
  const goi = [];
  const that = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('pageSize=200')) {
      return new Response(JSON.stringify({ models: models.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) }), { status: 200 });
    }
    if (u.includes(':generateContent')) {
      const model = /models\/([^:]+):/.exec(u)[1];
      goi.push({ model, key: init.headers['x-goog-api-key'] });
      const r = tra(model, goi.length - 1);
      return new Response(JSON.stringify(r.body || {}), { status: r.status });
    }
    return new Response('{}', { status: 200 });                 // Telegram / Brevo
  };
  return { goi, thoi: () => { globalThis.fetch = that; } };
}

async function vaoVaGoi(env, body) {
  const ctx = moCtx();
  const res = await worker.fetch(new Request(API, { method: 'POST', body: JSON.stringify(body) }), env, ctx);
  await ctx.xong();
  return res.json();
}

async function taoNguoi(env, them = {}) {
  const r = await vaoVaGoi(env, { ...NGUOI, ...them });
  return r.data.token;
}

const OK_GEMINI = { candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 42 } };

// ─── Gọi Gemini ─────────────────────────────────────────────

test('generate: gọi Gemini, trả chữ và trừ một lượt', async () => {
  const env = moEnv(SCHEMA, { GEMINI_KEYS: 'key-1' });
  const token = await taoNguoi(env);
  const f = moFetch(() => ({ status: 200, body: OK_GEMINI }));
  try {
    const r = await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.data.text, '{"a":1}');
    assert.equal(r.data.tokens, 42);
    assert.equal(f.goi[0].model, 'gemini-3-flash', 'dùng model flash mới nhất trước');
    const toi = await vaoVaGoi(env, { action: 'toi', token });
    assert.equal(toi.data.me.luot.dung, 1);
  } finally { f.thoi(); }
});

test('hết lượt trong ngày thì báo quota và không gọi Gemini nữa', async () => {
  const env = moEnv(SCHEMA, { GEMINI_KEYS: 'key-1', AI_LUOT_FREE: '2', AI_RPM_MA: '9' });
  const token = await taoNguoi(env);
  const f = moFetch(() => ({ status: 200, body: OK_GEMINI }));
  try {
    assert.equal((await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU })).ok, true);
    assert.equal((await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU })).ok, true);
    const r = await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU });
    assert.equal(r.code, 'quota');
    assert.match(r.error, /hết 2 lượt/);
    assert.equal(f.goi.length, 2, 'lần thứ ba không được gọi Gemini');
  } finally { f.thoi(); }
});

test('quá nhịp mỗi phút của một tài khoản thì báo busy kèm số giây chờ, KHÔNG trừ lượt', async () => {
  const env = moEnv(SCHEMA, { GEMINI_KEYS: 'key-1', AI_RPM_MA: '1', AI_LUOT_FREE: '50' });
  const token = await taoNguoi(env);
  const f = moFetch(() => ({ status: 200, body: OK_GEMINI }));
  try {
    assert.equal((await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU })).ok, true);
    const r = await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU });
    assert.equal(r.code, 'busy');
    assert.ok(r.retryAfter >= 1 && r.retryAfter <= 60);
    assert.equal((await vaoVaGoi(env, { action: 'toi', token })).data.me.luot.dung, 1);
  } finally { f.thoi(); }
});

test('key hết hạn mức (429) thì sang key sau; mọi key hỏng thì trả lượt lại cho người dùng', async () => {
  const env = moEnv(SCHEMA, { GEMINI_KEYS: 'key-1, key-2', AI_LUOT_FREE: '5' });
  const token = await taoNguoi(env);
  const f = moFetch((model, i) => (i === 0
    ? { status: 429, body: { error: { details: [{ retryDelay: '20s' }] } } }
    : { status: 200, body: OK_GEMINI }));
  try {
    const r = await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(f.goi.map((x) => x.key), ['key-1', 'key-2']);
  } finally { f.thoi(); }

  const g = moFetch(() => ({ status: 429, body: {} }));
  try {
    const r = await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU });
    assert.equal(r.code, 'busy');
    assert.equal((await vaoVaGoi(env, { action: 'toi', token })).data.me.luot.dung, 1, 'Gemini chưa làm gì → trả lại lượt');
  } finally { g.thoi(); }
});

test('model quá tải (503) thì chuyển sang model sau trong chuỗi', async () => {
  const env = moEnv(SCHEMA, { GEMINI_KEYS: 'key-1', AI_LUOT_FREE: '5' });
  const token = await taoNguoi(env);
  const f = moFetch((model) => (model === 'gemini-3-flash' ? { status: 503, body: {} } : { status: 200, body: OK_GEMINI }));
  try {
    const r = await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(f.goi.map((x) => x.model), ['gemini-3-flash', 'gemini-3-flash-lite']);
  } finally { f.thoi(); }
});

test('Gemini chặn nội dung hay dừng vì an toàn thì trả mã blocked', async () => {
  const env = moEnv(SCHEMA, { GEMINI_KEYS: 'key-1', AI_LUOT_FREE: '5' });
  const token = await taoNguoi(env);
  const f = moFetch(() => ({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } }));
  try {
    assert.equal((await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU })).code, 'blocked');
  } finally { f.thoi(); }
});

test('chưa cài key Gemini thì báo setup chứ không báo lỗi khó hiểu', async () => {
  const env = moEnv(SCHEMA);
  const token = await taoNguoi(env);
  assert.equal((await vaoVaGoi(env, { action: 'generate', token, ...YEU_CAU })).code, 'setup');
});

// ─── Làm sạch yêu cầu ───────────────────────────────────────

test('sachYeuCau: bỏ trường lạ, chặn kiểu file lạ, kẹp các trần', () => {
  const env = {};
  const r = sachYeuCau(env, {
    contents: [{ role: 'user', parts: [{ text: 'a' }, { inlineData: { mimeType: 'image/jpeg', data: 'xx' } }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1e9, chenThem: 'khong duoc qua' },
    systemInstruction: { parts: [{ text: 'hệ thống' }] },
    khongLienQuan: 'bo di',
  });
  assert.deepEqual(Object.keys(r), ['contents', 'generationConfig', 'systemInstruction']);
  assert.equal(r.generationConfig.chenThem, undefined);
  assert.equal(r.generationConfig.maxOutputTokens, 32768);
  assert.equal(r.contents[0].parts.length, 2);

  assert.equal(sachYeuCau(env, { contents: [] }), null);
  assert.equal(sachYeuCau(env, { contents: [{ parts: [{ inlineData: { mimeType: 'application/zip', data: 'x' } }] }] }), null, 'kiểu file lạ');
  assert.equal(sachYeuCau(env, { contents: [{ parts: [{ text: 'x'.repeat(200001) }] }] }), null, 'quá dài');
  assert.equal(sachYeuCau(env, { contents: [{ parts: [{ text: 'a' }] }], generationConfig: { responseSchema: { x: 'y'.repeat(20001) } } }), null);
});

test('sachYeuCau: thinkingConfig bị kẹp về trần cho phép', () => {
  const r = sachYeuCau({}, {
    contents: [{ parts: [{ text: 'a' }] }],
    generationConfig: { thinkingConfig: { thinkingBudget: 1e6, thinkingLevel: 'HIGH' } },
  });
  assert.equal(r.generationConfig.thinkingConfig.thinkingBudget, 8192);
  assert.equal(r.generationConfig.thinkingConfig.thinkingLevel, undefined, 'mức không nằm trong danh sách thì bỏ');
});
