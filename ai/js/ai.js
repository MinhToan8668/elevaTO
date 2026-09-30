// Gọi Gemini qua máy chủ trung gian elevaTO AI (Apps Script). Trình duyệt không bao giờ cầm key.

import { parseAIJson } from './core/extract.js';
import { SYSTEM } from './core/prompts.js';

export class AIError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
/** Lỗi nên chia nhỏ việc rồi làm lại (quá 60 giây / trả thiếu vì quá dài). */
export const isSplittable = (e) => e instanceof AIError && (e.code === 'timeout' || e.code === 'truncated');
/** Lỗi không thể tự khắc phục — dừng cả lượt, báo người dùng. */
export const isFatal = (e) => e instanceof AIError && ['key', 'quota', 'setup'].includes(e.code);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_BUSY_WAITS = 4;

export function createClient({ api, code, model, onWait } = {}) {
  async function post(body) {
    let r;
    try {
      // text/plain để trình duyệt không gửi preflight CORS (Apps Script không trả lời preflight).
      r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new AIError('network', 'Mất kết nối tới máy chủ AI — kiểm tra mạng rồi thử lại');
    }
    if (!r.ok) throw new AIError('network', `Máy chủ AI trả lỗi ${r.status}`);
    let j;
    try { j = await r.json(); } catch (e) { throw new AIError('network', 'Máy chủ AI trả về dữ liệu lạ — bản triển khai đã đúng chưa?'); }
    return j;
  }

  return {
    async ping() {
      const j = await post({ action: 'ping', code });
      if (!j.ok) throw new AIError(j.code, j.error);
      return j.data;
    },

    /**
     * @param parts   [{ text } | { inlineData: { mimeType, data } }]
     * @param schema  khuôn JSON (responseSchema)
     * @returns       đối tượng JSON AI trả
     */
    async json({ parts, schema, maxOutputTokens = 32768 }) {
      let busy = 0, useSchema = true;
      for (;;) {
        const generationConfig = { temperature: 0, responseMimeType: 'application/json', maxOutputTokens };
        if (useSchema && schema) generationConfig.responseSchema = schema;
        const j = await post({
          action: 'generate', code, model,
          contents: [{ role: 'user', parts }],
          systemInstruction: { parts: [{ text: SYSTEM }] },
          generationConfig,
        });
        if (j.ok) {
          if (j.data.finishReason === 'MAX_TOKENS') throw new AIError('truncated', 'Kết quả quá dài, bị cắt ngang');
          try { return parseAIJson(j.data.text); }
          catch (e) { throw new AIError('parse', e.message); }
        }
        if (j.code === 'busy' && busy < MAX_BUSY_WAITS) {
          busy++;
          const s = Math.min(Math.max(Number(j.retryAfter) || 10, 2), 90);
          onWait?.(s, j.error);
          await sleep(s * 1000);
          continue;
        }
        // Model cũ không nhận responseSchema → thử lại một lần chỉ với JSON thường.
        if (j.code === 'upstream' && /400/.test(j.error) && useSchema && schema) { useSchema = false; continue; }
        throw new AIError(j.code || 'upstream', j.error || 'Lỗi không rõ', { retryAfter: j.retryAfter });
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
    fr.onerror = () => fail(fr.error || new Error('Không đọc được file'));
    fr.readAsDataURL(blob);
  });
}
