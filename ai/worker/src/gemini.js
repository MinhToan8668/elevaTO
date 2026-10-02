// Proxy Gemini: nhiều key, chuỗi model dự phòng, giữ nhịp và hạn lượt.
// Giữ đúng hành vi của bản Apps Script — chỉ đổi chỗ cất (Script Properties / Cache → D1).

import { GEMINI_API, GEN_KEYS, MIME_OK, so } from './caidat.js';
import { daDung, hanNgay, khoaLuot, laGV, loi, ok } from './auth.js';
import { botDem, dangNghi, datNghi, docCaiDat, ghiCaiDat, homNay, themDem, xoaDem } from './db.js';

/** Key lấy từ secret GEMINI_KEYS (nhiều key cách nhau bằng dấu phẩy, chấm phẩy hay xuống dòng). */
export function dsKey(env) {
  const out = [];
  String(env.GEMINI_KEYS || '').split(/[\s,;]+/).forEach((k) => { if (k && !out.includes(k)) out.push(k); });
  return out;
}

// Nghỉ: key hỏng thì nghỉ hẳn (mọi model); hết hạn mức (429) thì chỉ nghỉ ở model đó —
// Gemini miễn phí tính hạn mức riêng cho từng model.
const khoaNghi = (i, model) => `nghi_${i}${model ? `|${model}` : ''}`;
const keyNghi = (db, i, giay, model) => datNghi(db, khoaNghi(i, model), giay);
const keyDangNghi = async (db, i, model) =>
  (await dangNghi(db, khoaNghi(i))) || (!!model && await dangNghi(db, khoaNghi(i, model)));

async function keyRanh(env, model) {
  const ra = [];
  const keys = dsKey(env);
  for (let i = 0; i < keys.length; i++) if (!await keyDangNghi(env.DB, i, model)) ra.push({ i, key: keys[i] });
  return ra;
}

/** Đếm lỗi quá tải; đủ AI_QUA_TAI_LAN lần trong 2 phút mới cho model nghỉ. */
async function modelLoi(env, model) {
  const n = await themDem(env.DB, `qtn_${model}`, 1e9, 120);
  if (n < so(env, 'AI_QUA_TAI_LAN')) return;
  await xoaDem(env.DB, `qtn_${model}`);                 // đếm lại từ đầu sau khi model đã nghỉ một lượt
  await datNghi(env.DB, `qt_${model}`, so(env, 'AI_NGHI_QUA_TAI'));
}
const modelDangNghi = (db, model) => dangNghi(db, `qt_${model}`);

/** Model sinh văn bản dùng được (bỏ TTS, ảnh, âm thanh, embedding…). */
export async function danhSachModel(env) {
  const nho = await docCaiDat(env.DB, 'ai_models');
  if (nho) { try { return JSON.parse(nho); } catch { /* hỏng thì hỏi lại */ } }
  const ranh = await keyRanh(env);
  if (!ranh.length) return [];
  let res;
  try {
    res = await fetch(`${GEMINI_API}?pageSize=200`, { headers: { 'x-goog-api-key': ranh[0].key } });
  } catch { return []; }
  if (!res.ok) { await ghiCaiDat(env.DB, 'ai_models', '[]', 30); return []; }   // hỏng thì nhớ 30 giây, đỡ hỏi dồn
  const data = await res.json().catch(() => ({}));
  const list = (data.models || []).filter((m) => {
    const id = String(m.name || '').replace(/^models\//, '');
    return /^gemini-[\w.-]+$/.test(id)
      && !/(tts|embed|image|audio|live|veo|imagen|robotics|computer-use|transcribe|omni|customtools)/.test(id)
      && (m.supportedGenerationMethods || []).includes('generateContent');
  }).map((m) => String(m.name).replace(/^models\//, ''));
  await ghiCaiDat(env.DB, 'ai_models', JSON.stringify(list), so(env, 'AI_MODEL_TTL'));
  return list;
}

/**
 * Chuỗi model dùng lần lượt: AI_MODEL (nếu có), các bản flash chính thức mới → cũ, cuối là flash-lite mới nhất.
 * Model này quá tải / hết hạn mức thì chuyển ngay model sau.
 */
export async function dsModelDung(env) {
  const list = await danhSachModel(env);
  const rieng = String(await docCaiDat(env.DB, 'AI_MODEL') || env.AI_MODEL || '');
  const ver = (id) => { const m = /^gemini-(\d+(?:\.\d+)?)/.exec(id); return m ? Number(m[1]) : 0; };
  const moiTruoc = (a, b) => ver(b) - ver(a);
  const flash = list.filter((id) => /^gemini-\d+(\.\d+)?-flash$/.test(id)).sort(moiTruoc);
  const lite = list.filter((id) => /^gemini-\d+(\.\d+)?-flash-lite$/.test(id)).sort(moiTruoc);
  let chuoi = [];
  if (rieng && list.includes(rieng)) chuoi.push(rieng);
  flash.forEach((id) => { if (!chuoi.includes(id)) chuoi.push(id); });
  chuoi = chuoi.slice(0, so(env, 'AI_SO_MODEL') - (lite.length ? 1 : 0));
  if (lite.length && !chuoi.includes(lite[0])) chuoi.push(lite[0]);
  if (!chuoi.length) chuoi = list.filter((id) => /flash/.test(id)).slice(0, so(env, 'AI_SO_MODEL'));
  return chuoi;
}

// ─── Hạn lượt & nhịp ────────────────────────────────────────

const hetLuot = async (env, tk) =>
  loi('quota', `Hôm nay đã dùng hết ${await hanNgay(env, tk)} lượt AI — mai dùng tiếp, hoặc liên hệ elevaTO xin thêm`);

/** Nhịp gọi trong phút hiện tại, cho cả hệ thống và từng tài khoản. Trả số giây phải chờ (0 = được gọi). */
async function giuNhip(env, tk) {
  const now = Date.now(), phut = Math.floor(now / 60000);
  const cho = Math.max(1, 60 - Math.floor((now % 60000) / 1000));
  if (!laGV(tk) && !await themDem(env.DB, `rpm_${tk.ma}_${phut}`, so(env, 'AI_RPM_MA'), 120)) return cho;
  const tran = so(env, 'AI_RPM') * Math.max(1, dsKey(env).length);
  if (!await themDem(env.DB, `rpm_${phut}`, tran, 120)) return cho;
  return 0;
}

/** Giữ 1 lượt TRƯỚC khi gọi Gemini. Trả khoá bộ đếm để trả lại đúng ngày đó, hoặc '' nếu hết lượt. */
async function giuLuot(env, tk) {
  if (laGV(tk)) return 'gv';
  const k = khoaLuot(tk);
  return await themDem(env.DB, k, await hanNgay(env, tk), 2 * 86400) ? k : '';
}

// ─── Gọi ────────────────────────────────────────────────────

export async function goiGemini(env, tk, b, bao) {
  if (!dsKey(env).length) return loi('setup', 'Máy chủ chưa cài key Gemini (xem README của worker)');
  const body = sachYeuCau(env, b);
  if (!body) return loi('bad', 'Yêu cầu sai dạng hoặc quá dài');
  if (!laGV(tk) && await daDung(env.DB, tk) >= await hanNgay(env, tk)) return hetLuot(env, tk);
  const models = await dsModelDung(env);
  if (!models.length) return loi('busy', 'Chưa lấy được danh sách model Gemini — thử lại sau ít phút', { retryAfter: 30 });

  const cho = await giuNhip(env, tk);
  if (cho) return loi('busy', `Hệ thống đang đông, chờ ${cho} giây`, { retryAfter: cho });
  const khoa = await giuLuot(env, tk);
  if (!khoa) return hetLuot(env, tk);
  const r = await goiLanLuot(env, models, body, bao) || {};
  if (r.traLai && khoa !== 'gv') await botDem(env.DB, khoa);    // chỉ trả lượt khi Gemini chưa làm gì
  // Không bao giờ trả { ok: true } rỗng: trang đọc thiếu trường sẽ hỏng.
  return r.kq || loi('upstream', 'Máy chủ không nhận được kết quả từ Gemini, thử lại sau ít phút');
}

/**
 * Thử lần lượt từng model, mỗi model thử các key đang rảnh:
 * 429 → cặp key + model đó nghỉ, thử key kế; 401/403 → key nghỉ hẳn; 503/500 → model nghỉ vài phút, sang model sau.
 */
async function goiLanLuot(env, models, body, bao) {
  let cuoi = null, dem = 0;
  let ranh = [];
  for (const m of models) if (!await modelDangNghi(env.DB, m)) ranh.push(m);
  if (!ranh.length) ranh = models.slice(0, 1);                   // mọi model đang nghỉ: vẫn thử model đầu một lần
  for (const model of ranh) {
    const keys = await keyRanh(env, model);
    for (const { i, key } of keys) {
      if (dem++ >= so(env, 'AI_THU_TOI_DA')) return hetCach(cuoi);
      const r = await goiMotKey(env, model, body, key, bao);
      if (r.nghi) { await keyNghi(env.DB, i, r.nghi, r.moiModel ? null : model); cuoi = r; continue; }
      if (r.boModel) { if (r.quaTai) await modelLoi(env, model); cuoi = r; break; }   // sang model sau
      return r;
    }
  }
  return hetCach(cuoi);
}

const hetCach = (cuoi) => ({
  kq: loi('busy', 'Gemini đang quá tải hoặc hết hạn mức phút này', { retryAfter: (cuoi && cuoi.cho) || 30 }),
  traLai: true,
});

/** { kq, traLai } = kết quả trả trang (traLai: Gemini chưa làm gì → trả lượt); { nghi: giây } = key tạm nghỉ. */
async function goiMotKey(env, model, body, key, bao) {
  let res;
  try {
    res = await fetch(`${GEMINI_API}/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
    });
  } catch (err) {
    if (/timeout|timed out/i.test(String(err))) return { kq: loi('timeout', 'Gemini chạy quá lâu — cần chia nhỏ phần này') };
    return { kq: loi('upstream', 'Không kết nối được Gemini, thử lại sau ít phút'), traLai: true };
  }
  const code = res.status;
  const data = await res.json().catch(() => ({}));
  if (code === 429) { const s = hoiLai(data) || 60; return { nghi: s, cho: s }; }
  const err = data.error || {};
  // Model này không dùng được (tên sai / chưa mở) → bỏ model, giữ key.
  if ((code === 404 || code === 403) && String(err.message || '').includes(model)) return { boModel: true, cho: 10 };
  if (code === 401 || code === 403 || (code === 400 && keyHong(err))) {
    await bao?.('key_hong', 3600, `⚠️ <b>Key Gemini bị từ chối</b> (HTTP ${code}) — kiểm tra lại key trong Google AI Studio. Máy chủ đang dùng tạm key khác nếu có.`);
    return { nghi: 3600, cho: 30, moiModel: true };
  }
  if (code === 503 || code === 500 || code === 504) return { boModel: true, quaTai: true, cho: hoiLai(data) || 10 };
  if (code !== 200) {
    const st = err.status ? ` (${String(err.status).replace(/[^A-Z_]/g, '')})` : '';
    return { kq: loi('upstream', `Gemini báo lỗi ${code}${st}`) };
  }
  if (data.promptFeedback && data.promptFeedback.blockReason) return { kq: loi('blocked', 'Gemini từ chối nội dung này') };
  const cand = (data.candidates || [])[0];
  if (!cand) return { kq: loi('upstream', 'Gemini không trả kết quả') };
  const fr = cand.finishReason || '';
  if (/SAFETY|RECITATION|PROHIBITED|BLOCKLIST|SPII/.test(fr)) return { kq: loi('blocked', `Gemini dừng vì ${fr}`) };
  const text = ((cand.content && cand.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  return { kq: ok({ text, finishReason: fr, tokens: (data.usageMetadata || {}).totalTokenCount || 0 }) };
}

/** Key thật sự hỏng: Gemini nói rõ API_KEY_INVALID / API_KEY_SERVICE_BLOCKED, không đoán theo chữ trong yêu cầu. */
function keyHong(err) {
  for (const d of err.details || []) if (/^API_KEY_/.test(String(d.reason || ''))) return true;
  return /^(api key not valid|api_key_invalid)/i.test(String(err.message || ''));
}

function hoiLai(data) {
  for (const d of (data && data.error && data.error.details) || []) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d.retryDelay || ''));
    if (m) return Math.ceil(Number(m[1]));
  }
  return 0;
}

/** Chỉ giữ đúng những gì cần để trích xuất: nội dung, cấu hình sinh, chỉ dẫn hệ thống. */
export function sachYeuCau(env, b) {
  if (!Array.isArray(b.contents) || !b.contents.length || b.contents.length > 20) return null;
  const contents = [];
  let chu = 0;
  for (const c of b.contents) {
    if (!c || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 300) return null;
    const parts = [];
    for (const p0 of c.parts) {
      const p = p0 || {};
      if (typeof p.text === 'string') { chu += p.text.length; parts.push({ text: p.text }); }
      else if (p.inlineData && MIME_OK.includes(p.inlineData.mimeType) && typeof p.inlineData.data === 'string') {
        parts.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
      } else return null;
    }
    contents.push({ role: c.role === 'model' ? 'model' : 'user', parts });
  }
  if (chu > so(env, 'AI_MAX_TEXT')) return null;
  const out = { contents };
  const gc = b.generationConfig || {}, cfg = {};
  for (const k of GEN_KEYS) if (gc[k] !== undefined) cfg[k] = gc[k];
  cfg.maxOutputTokens = Math.min(Number(cfg.maxOutputTokens) || so(env, 'AI_MAX_OUT'), so(env, 'AI_MAX_OUT'));
  if (JSON.stringify([cfg.responseSchema || null, cfg.responseJsonSchema || null]).length > so(env, 'AI_MAX_SCHEMA')) return null;
  if (cfg.thinkingConfig !== undefined) {
    const tc = cfg.thinkingConfig || {}, t = {};
    if (tc.thinkingBudget !== undefined) t.thinkingBudget = Math.max(0, Math.min(Number(tc.thinkingBudget) || 0, so(env, 'AI_MAX_THINK')));
    if (/^(minimal|low|medium)$/i.test(String(tc.thinkingLevel || ''))) t.thinkingLevel = String(tc.thinkingLevel).toLowerCase();
    cfg.thinkingConfig = t;
  }
  out.generationConfig = cfg;
  if (b.systemInstruction && Array.isArray(b.systemInstruction.parts)) {
    const sys = b.systemInstruction.parts.filter((p) => p && typeof p.text === 'string').map((p) => ({ text: p.text }));
    if (sys.reduce((n, p) => n + p.text.length, 0) > so(env, 'AI_MAX_SYS')) return null;
    out.systemInstruction = { parts: sys };
  }
  return out;
}

/** Số liệu cho lệnh /thongke của bot. */
export async function thongKeAI(env) {
  // Khoá lượt có dạng Q_<mã>_<YYYY-MM-DD> → so 10 ký tự cuối, khỏi phải thoát ký tự _ trong LIKE.
  const r = await env.DB.prepare(
    "SELECT COALESCE(SUM(so), 0) AS n FROM dem WHERE substr(khoa, 1, 2) = 'Q_' AND substr(khoa, -10) = ?1",
  ).bind(homNay()).first();
  const keys = dsKey(env);
  let nghi = 0;
  for (let i = 0; i < keys.length; i++) if (await dangNghi(env.DB, khoaNghi(i))) nghi++;
  const chuoi = await dsModelDung(env);
  const qt = [];
  for (const m of chuoi) if (await modelDangNghi(env.DB, m)) qt.push(m);
  return { luot: Number(r ? r.n : 0), soKey: keys.length, nghi, chuoi, qt };
}
