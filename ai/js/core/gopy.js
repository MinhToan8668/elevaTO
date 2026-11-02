// Góp ý của người dùng về những chỗ AI đọc sai — lưu trên máy; prompts.js gopYPrompt gửi kèm MỌI lần đọc bảng sau đó,
// như một danh sách "lưu ý đã gặp" cho AI. Tool không tự sửa code của mình; góp ý tác động vào câu
// lệnh gửi AI, còn lỗi cần sửa code thì người dùng bấm sao chép gửi người phát triển.

const KEY = 'elevato-ai-gopy';
const TOI_DA = 30, DAI = 400;
export const VUNG = ['IS', 'BS', 'CF', 'KY', 'KHAC'];

const sach = (g) => ({
  text: String(g?.text || '').replace(/\s+/g, ' ').trim().slice(0, DAI),
  vung: VUNG.includes(g?.vung) ? g.vung : 'KHAC',
  file: String(g?.file || '').slice(0, 120),
  at: Number(g?.at) || Date.now(),
});

export function docGopY(store = globalThis.localStorage) {
  try { const a = JSON.parse(store?.getItem(KEY) || '[]'); return Array.isArray(a) ? a.map(sach).filter((g) => g.text) : []; } catch (e) { return []; }
}
export function luuGopY(list, store = globalThis.localStorage) {
  const out = list.map(sach).filter((g) => g.text).slice(-TOI_DA);
  try { store?.setItem(KEY, JSON.stringify(out)); } catch (e) { /* hết chỗ / bị chặn */ }
  return out;
}
