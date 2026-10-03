// Lớp vận chuyển dùng chung cho MỌI bot Telegram chạy trên Worker này.
//
// Có hai bot, cố ý tách: bot AI BCTC riêng một cõi, bot elevaTO lo cả trang khoá học lẫn
// trang link. Hai bot = hai token = hai webhook, nên mỗi bot một đường riêng (/tg/ai, /tg/el).
// Mọi thứ còn lại — gửi tin, đăng ký webhook, menu lệnh, lời chào, chặn người lạ — giống hệt
// nhau nên gom hết vào đây, mỗi bot chỉ khai phần việc của mình.

import { docCaiDat, ghiCaiDat, xoaCaiDat } from './db.js';

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
 * @param hoi   { '/lenh': { buoc: [...], ghep?, khi? } } — lệnh nào hỏi từng bước (xem HOI_HAN)
 */
export function taoBot({ ten, bien, nhan, menu: menu0, lenh, nut, hoi = {} }) {
  const duong = `/tg/${ten}`;
  // Có hỏi đáp thì phải có đường thoát, nên /huy tự gắn vào menu — bot không tự khai.
  const menu = Object.keys(hoi).length
    ? [...menu0, { command: 'huy', description: '✖️ Bỏ câu đang hỏi dở' }] : menu0;

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

  /** Gửi một file (Telegram đòi multipart, không nhận JSON như các lệnh khác). */
  async function guiFile(env, chatId, ten, noiDung, chuThich) {
    const t = token(env);
    if (!t) return null;
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (chuThich) { fd.append('caption', String(chuThich).slice(0, 1000)); fd.append('parse_mode', 'HTML'); }
    fd.append('document', new Blob([noiDung], { type: 'text/csv;charset=utf-8' }), ten);
    try {
      const r = await fetch(`https://api.telegram.org/bot${t}/sendDocument`, { method: 'POST', body: fd });
      return await r.json();
    } catch (e) { console.error(`Telegram ${ten}/sendDocument: ${String(e).split(t).join('***')}`); return null; }
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

  // ─── Hỏi từng bước ────────────────────────────────────────
  //
  // Gõ "/giasom" trơn thì bot HỎI "Giá Early Bird là bao nhiêu?" rồi chờ trả lời, chứ không bắt
  // người dùng tự nhớ cú pháp "/giasom <số tiền>". Việc đang hỏi dở nhớ trong D1 (Worker không
  // giữ trí nhớ giữa hai yêu cầu), tự hết hạn sau HOI_HAN giây.
  const HOI_HAN = 900;
  const khoaCho = (chatId) => `cho_${ten}_${chatId}`;

  async function docCho(env, chatId) {
    try {
      const o = JSON.parse((await docCaiDat(env.DB, khoaCho(chatId))) || 'null');
      return o && hoi[o.lenh] && Array.isArray(o.da) ? o : null;
    } catch { return null; }
  }
  const xoaCho = (env, chatId) => xoaCaiDat(env.DB, khoaCho(chatId));

  /** Hỏi bước thứ `i`. force_reply để Telegram mở sẵn bàn phím và trích dẫn câu hỏi. */
  async function hoiBuoc(env, chatId, ten0, i, da) {
    const spec = hoi[ten0];
    const b = spec.buoc[i];
    const dem = spec.buoc.length > 1 ? ` <i>(bước ${i + 1}/${spec.buoc.length})</i>` : '';
    const goi = typeof b.goi === 'function' ? await b.goi(env) : b.goi;
    await ghiCaiDat(env.DB, khoaCho(chatId), JSON.stringify({ lenh: ten0, da, luc: Date.now() }), HOI_HAN);
    return api(env, 'sendMessage', {
      chat_id: String(chatId),
      text: `❓ ${esc(b.hoi)}${dem}${goi ? `\n${goi}` : ''}\n\n<i>Trả lời thẳng vào ô chat, hoặc /huy để bỏ.</i>`,
      parse_mode: 'HTML',
      reply_markup: { force_reply: true, input_field_placeholder: String(b.vd || '').slice(0, 64) },
    });
  }

  /** Bắt đầu hỏi lệnh `ten0` từ bước đầu. Dùng cho cả nút bấm (ctx.hoiTu). */
  const hoiTu = (env, chatId, ten0) => (hoi[ten0] ? hoiBuoc(env, chatId, ten0, 0, []) : null);

  /** Nhận câu trả lời; đủ bước thì chạy lệnh thật. */
  async function tiepCho(env, m, dang) {
    const spec = hoi[dang.lenh];
    const b = spec.buoc[dang.da.length];
    // Bước nhạy cảm (mật khẩu) thì xoá tin trả lời khỏi lịch sử Telegram ngay.
    if (b.xoa) await api(env, 'deleteMessage', { chat_id: String(m.chat.id), message_id: m.message_id });
    const da = [...dang.da, m.text.trim()];
    if (da.length < spec.buoc.length) return hoiBuoc(env, m.chat.id, dang.lenh, da.length, da);
    await xoaCho(env, m.chat.id);
    const chuoi = spec.ghep ? spec.ghep(da) : da.join(' ');
    const kq = await lenh(env, dang.lenh, chuoi.split(/\s+/).filter(Boolean),
      { tin: m, api, gui, bao, guiFile, dap: da });
    if (kq && kq.text) await gui(env, m.chat.id, kq.text, kq.nut);
    return null;
  }

  /**
   * Một tin Telegram gửi tới. Chỉ nhận NHẮN RIÊNG do đúng chat quản trị gõ — không nhận nhóm,
   * không nhận tin chuyển tiếp; người lạ nhắn thì im lặng, không tốn lượt gọi ra Telegram.
   */
  async function nhanTin(env, u) {
    try {
      if (u.callback_query) {
        const q = u.callback_query;
        const chat = q.message && q.message.chat && q.message.chat.id;
        const d = String(q.data || '');
        // Nút "✏️ Đổi" trên các thẻ thông tin: mở đúng cuộc hỏi của lệnh đó.
        if (d.startsWith('hoi:') && laChatQuanTri(env, chat) && laChatQuanTri(env, q.from && q.from.id)
            && hoi[`/${d.slice(4)}`]) {
          await api(env, 'answerCallbackQuery', { callback_query_id: q.id });
          await hoiTu(env, chat, `/${d.slice(4)}`);
          return;
        }
        if (nut) await nut(env, q, { api, gui, bao, hoiTu });
        return;
      }
      const m = u.message;
      if (!m || !m.chat || !m.from || typeof m.text !== 'string') return;
      if (m.chat.type !== 'private' || !laChatQuanTri(env, m.chat.id) || !laChatQuanTri(env, m.from.id)
          || m.forward_origin || m.forward_date) return;
      const phan = m.text.trim().split(/\s+/);
      const ten0 = phan[0].replace(/@.*$/, '').toLowerCase();

      if (ten0.startsWith('/')) {
        if (ten0 === '/huy' || ten0 === '/thoi') {
          const dang = await docCho(env, m.chat.id);
          await xoaCho(env, m.chat.id);
          await gui(env, m.chat.id, dang ? `✖️ Đã bỏ <code>${esc(dang.lenh)}</code>.` : 'Không có câu nào đang hỏi dở.');
          return;
        }
        await xoaCho(env, m.chat.id);                 // gõ lệnh mới là bỏ việc đang hỏi dở
        const spec = hoi[ten0];
        // Chỉ hỏi khi người dùng gõ lệnh trơn — gõ kèm giá trị thì cứ chạy thẳng như cũ.
        if (spec && phan.length === 1 && (!spec.khi || await spec.khi(env))) {
          await hoiTu(env, m.chat.id, ten0);
          return;
        }
      } else {
        const dang = await docCho(env, m.chat.id);
        if (dang) { await tiepCho(env, m, dang); return; }
      }

      const kq = await lenh(env, ten0, phan.slice(1), { tin: m, api, gui, bao, guiFile });
      if (kq && kq.text) await gui(env, m.chat.id, kq.text, kq.nut);
    } catch (e) { console.error(`nhanTin ${ten}: ${e}`); }
  }

  return { ten, duong, nhan, menu, token, coCai, api, gui, guiFile, bao, taoBao, ngo, nhanTin, hoiTu };
}
