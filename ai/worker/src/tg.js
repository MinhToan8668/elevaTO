// Lớp vận chuyển dùng chung cho MỌI bot Telegram chạy trên Worker này.
//
// Có hai bot, cố ý tách: bot AI BCTC riêng một cõi, bot elevaTO lo cả trang khoá học lẫn
// trang link. Hai bot = hai token = hai webhook, nên mỗi bot một đường riêng (/tg/ai, /tg/el).
// Mọi thứ còn lại — gửi tin, đăng ký webhook, menu lệnh, lời chào, chặn người lạ — giống hệt
// nhau nên gom hết vào đây, mỗi bot chỉ khai phần việc của mình.

import { docCaiDat, ghiCaiDat } from './db.js';

export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Chat được ra lệnh. Dùng chung cho cả hai bot — cùng một người quản trị. */
export const tgAdmins = (env) => String(env.TG_ADMIN || '').split(/[\s,;]+/).filter(Boolean);
export const laChatQuanTri = (env, id) => tgAdmins(env).includes(String(id));

/**
 * @param ten   tên ngắn, dùng làm mốc nhớ trong D1 và một phần đường webhook
 * @param bien  tên biến môi trường chứa token
 * @param nhan  tên bot hiện trong lời chào
 * @param menu  [{ command, description }] — menu lệnh Telegram
 * @param lenh  async (env, lenh, arg, tin) → { text, nut } | null (null = im lặng)
 * @param nut   async (env, callbackQuery) → void, cho nút bấm (tuỳ chọn)
 */
export function taoBot({ ten, bien, nhan, menu, lenh, nut }) {
  const duong = `/tg/${ten}`;

  const token = (env) => String(env[bien] || '');
  const coCai = (env) => !!(token(env) && env.TG_SECRET && tgAdmins(env).length);

  async function api(env, method, payload) {
    const t = token(env);
    if (!t) return null;
    try {
      const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
      });
      return await r.json();
    } catch (e) {
      console.error(`Telegram ${ten}/${method}: ${String(e).split(t).join('***')}`);  // lỗi mạng hay kèm URL có token
      return null;
    }
  }

  function gui(env, chatId, text, banPhim) {
    const p = {
      chat_id: String(chatId), text: String(text).slice(0, 4000),
      parse_mode: 'HTML', disable_web_page_preview: true,
    };
    if (banPhim) p.reply_markup = { inline_keyboard: banPhim };
    return api(env, 'sendMessage', p);
  }

  /** @returns true nếu ít nhất một người nhận được — chưa bấm Start với bot thì Telegram từ chối. */
  async function bao(env, text, banPhim) {
    let den = false;
    for (const id of tgAdmins(env)) {
      const r = await gui(env, id, text, banPhim);
      if (r && r.ok) den = true;
      else if (r) console.error(`Telegram ${ten} từ chối gửi cho ${id}: ${r.description || ''}`);
    }
    return den;
  }

  /** Báo quản trị nhưng tối đa 1 lần mỗi `giay` giây cho cùng một loại việc. */
  const taoBao = (env) => async (loai, giay, text) => {
    const k = `bao_${ten}_${loai}`;
    if (await docCaiDat(env.DB, k)) return;
    await ghiCaiDat(env.DB, k, '1', giay);
    await bao(env, text);
  };

  /**
   * Nối bot: webhook → menu lệnh → lời chào. Chạy ngầm sau mỗi yêu cầu, không có bước gõ lệnh nào.
   * Ba mốc nhớ RIÊNG nhau: chưa bấm Start thì Telegram từ chối gửi, mà webhook thì đã đăng ký rồi —
   * gộp chung là lời chào mất vĩnh viễn, người dùng tưởng bot chết.
   */
  async function ngo(env, goc) {
    if (!token(env) || !env.TG_SECRET) return;
    const url = goc + duong;
    const dau = `${url}|${env.TG_SECRET.slice(0, 4)}`;
    if (await docCaiDat(env.DB, `tg_webhook_${ten}`) !== dau) {
      const r = await api(env, 'setWebhook', {
        url, secret_token: env.TG_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
      });
      if (!r || !r.ok) { console.error(`setWebhook ${ten}: ${(r && r.description) || 'không gọi được Telegram'}`); return; }
      await ghiCaiDat(env.DB, `tg_webhook_${ten}`, dau);
    }
    await ngoMenu(env);
    const admins = tgAdmins(env);
    if (!admins.length || await docCaiDat(env.DB, `tg_chao_${ten}`) === dau) return;
    if (await bao(env, `✅ Bot <b>${esc(nhan)}</b> đã kết nối (Cloudflare Workers).\nGõ /help để xem các lệnh.`)) {
      await ghiCaiDat(env.DB, `tg_chao_${ten}`, dau);
    }
  }

  /** Menu lệnh: nút "Menu" cạnh ô soạn tin và gõ "/" ra gợi ý. Chỉ đặt cho riêng chat quản trị. */
  async function ngoMenu(env) {
    const admins = tgAdmins(env);
    if (!admins.length || !menu.length) return;
    // Mốc nhớ lấy từ chính nội dung menu → sửa danh sách lệnh rồi push là tự đăng ký lại.
    const { bamSHA } = await import('./auth.js');
    const dau = await bamSHA(JSON.stringify(menu) + admins.join(','));
    if (await docCaiDat(env.DB, `tg_menu_${ten}`) === dau) return;
    let xong = true;
    for (const id of admins) {
      const r = await api(env, 'setMyCommands', { commands: menu, scope: { type: 'chat', chat_id: String(id) } });
      if (!r || !r.ok) xong = false;
    }
    if (xong) await ghiCaiDat(env.DB, `tg_menu_${ten}`, dau);
  }

  /**
   * Một tin Telegram gửi tới. Chỉ nhận NHẮN RIÊNG do đúng chat quản trị gõ — không nhận nhóm,
   * không nhận tin chuyển tiếp; người lạ nhắn thì im lặng, không tốn lượt gọi ra Telegram.
   */
  async function nhanTin(env, u) {
    try {
      if (u.callback_query) { if (nut) await nut(env, u.callback_query, { api, gui, bao }); return; }
      const m = u.message;
      if (!m || !m.chat || !m.from || typeof m.text !== 'string') return;
      if (m.chat.type !== 'private' || !laChatQuanTri(env, m.chat.id) || !laChatQuanTri(env, m.from.id)
          || m.forward_origin || m.forward_date) return;
      const phan = m.text.trim().split(/\s+/);
      const ten0 = phan[0].replace(/@.*$/, '').toLowerCase();
      const kq = await lenh(env, ten0, phan.slice(1), { tin: m, api, gui, bao });
      if (kq && kq.text) await gui(env, m.chat.id, kq.text, kq.nut);
    } catch (e) { console.error(`nhanTin ${ten}: ${e}`); }
  }

  return { ten, duong, nhan, menu, token, coCai, api, gui, bao, taoBao, ngo, nhanTin };
}
