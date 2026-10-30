// Gọi máy chủ elevaTO AI (Apps Script): tài khoản + Gemini. Trình duyệt không bao giờ cầm key.

import { parseAIJson } from './core/extract.js';
import { SYSTEM } from './core/prompts.js';
import { t } from './i18n.js';
import { directGenerate } from './direct.js';

export class AIError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
/** Lỗi nên chia nhỏ việc rồi làm lại (quá 60 giây / trả thiếu vì quá dài). */
export const isSplittable = (e) => e instanceof AIError && (e.code === 'timeout' || e.code === 'truncated');
/** Lỗi không thể tự khắc phục — dừng cả lượt, báo người dùng. */
export const isFatal = (e) => e instanceof AIError && ['auth', 'quota', 'setup'].includes(e.code);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_BUSY_WAITS = 4;

/** Gửi một yêu cầu tới máy chủ. Trả data khi ok, ném AIError khi lỗi. */
export async function callApi(api, body, { keepalive = false } = {}) {
  if (!api) throw new AIError('setup', t('e.setup'));
  let r;
  try {
    // text/plain để trình duyệt không gửi preflight CORS (Apps Script không trả lời preflight).
    r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), keepalive });
  } catch (e) {
    throw new AIError('network', t('e.network'));
  }
  if (!r.ok) throw new AIError('network', t('e.busy', { code: r.status }));
  let j;
  try { j = await r.json(); } catch (e) { throw new AIError('network', t('e.odd')); }
  if (!j || !j.ok) throw new AIError(j?.code || 'upstream', j?.error || t('e.unknown'), { retryAfter: j?.retryAfter });
  return j.data;
}

/**
 * @param api     link /exec của máy chủ (js/config.js)
 * @param token   phiên đăng nhập
 * @param onWait  (giây, lời nhắn) khi máy chủ báo bận và trang tự chờ
 * @param onAuth  gọi khi phiên hết hạn (để trang đưa về màn đăng nhập)
 */
export function createClient({ api, token, onWait, onAuth, direct = false } = {}) {
  const call = async (body) => {
    if (direct) {
      if (body.action !== 'generate') return { me: null };
      const { action, ...req } = body;
      try { return await directGenerate(req); } catch (e) { throw new AIError(e.code || 'upstream', e.message, { retryAfter: e.retryAfter }); }
    }
    try { return await callApi(api, { ...body, token }); }
    catch (e) { if (e.code === 'auth') onAuth?.(e); throw e; }
  };
  return {
    me: async () => (await call({ action: 'toi' })).me,

    /**
     * @param parts   [{ text } | { inlineData: { mimeType, data } }]
     * @param schema  khuôn JSON (responseSchema)
     * @param system  câu lệnh hệ thống riêng (mặc định: SYSTEM "chỉ chép số" của phần trích xuất;
     *                phần AI nhận định gửi câu lệnh khác vì ở đó AI phải VIẾT chứ không chép)
     * @returns       đối tượng JSON AI trả
     */
    async json({ parts, schema, maxOutputTokens = 32768, system = SYSTEM }) {
      let busy = 0;
      for (;;) {
        const generationConfig = { temperature: 0, responseMimeType: 'application/json', maxOutputTokens };
        // Chép số không cần suy nghĩ dài: để mặc định thì token "suy nghĩ" ăn vào maxOutputTokens và CĐKT ngân hàng
        // (60+ dòng, hai trang) bị cắt MAX_TOKENS ngay cả khi đã chia đôi — gặp thật ở VCB 2025.
        if (system === SYSTEM) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
        if (schema) generationConfig.responseSchema = schema;
        let d;
        try {
          d = await call({
            action: 'generate',
            contents: [{ role: 'user', parts }],
            systemInstruction: { parts: [{ text: system }] },
            generationConfig,
          });
        } catch (e) {
          if (e.code === 'busy' && busy < MAX_BUSY_WAITS) {
            busy++;
            const s = Math.min(Math.max(Number(e.retryAfter) || 10, 2), 90);
            onWait?.(s, e.message);
            await sleep(s * 1000);
            continue;
          }
          // Gemini từ chối khuôn JSON (400). KHÔNG âm thầm bỏ khuôn rồi gọi lại: câu lệnh không tả
          // tên trường nên AI sẽ trả JSON lạ, và tool tưởng "không thấy bảng". Báo mã riêng để bên gọi
          // thử lại bằng câu lệnh CÓ tả cấu trúc (xem prompts.js → moTaKhuon).
          if (e.code === 'upstream' && /400/.test(e.message) && schema) {
            throw new AIError('schema', t('e.schema'));
          }
          throw e;
        }
        // Máy chủ đáng lẽ luôn trả { text, finishReason }. Thiếu thì báo bằng lời người đọc hiểu,
        // đừng để lọt TypeError ("Cannot read properties of undefined") ra tận giao diện.
        if (!d || typeof d.text !== 'string') throw new AIError('upstream', t('e.thin'));
        if (d.finishReason === 'MAX_TOKENS') throw new AIError('truncated', t('e.truncated'));
        try { return parseAIJson(d.text); }
        catch (e) { throw new AIError('parse', e.message); }
      }
    },
  };
}

/** File/Blob → base64 (không có tiền tố data:). */
export function toBase64(blobOrBytes) {
  const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes]);
  return new Promise((ok, fail) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1] || '');
    fr.onerror = () => fail(fr.error || new Error(t('e.readFile')));
    fr.readAsDataURL(blob);
  });
}
