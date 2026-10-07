// Máy chủ elevaTO AI BCTC trên Cloudflare Workers.
//
// Giữ NGUYÊN giao thức của bản Apps Script cũ: một đường POST, thân là JSON { action, … },
// trả { ok:true, data } hoặc { ok:false, code, error, retryAfter? }. Trang web chỉ phải đổi
// địa chỉ trong js/config.js, không phải sửa gì khác.
//
//   dangky · dangnhap · toi · dangxuat · generate · ungho · quenmk · datlaimk   (trang AI BCTC)
//   links · checkKey · saveLinks                                                (trang link-in-bio)
//   register + GET ?action=config                                               (trang khoá học)
//
// Hai bot Telegram, mỗi bot một đường webhook riêng vì Telegram chỉ cho một webhook mỗi token:
//   /tg/ai  bot AI BCTC            (TG_AI_TOKEN)
//   /tg/el  bot khoá học + link    (TG_EL_TOKEN)
//
// Một đường nữa không theo giao thức JSON ở trên — POST /taive (xem src/taive.js): trang
// upload gửi một "vé" đã ký sang, Worker kéo các phần từ Telegram nối thành một luồng trả
// về máy, để file khỏi phải đi vòng qua Google Drive ở chiều tải xuống.
//   code: auth · sai · khoa_tam · cho_duyet · bi_khoa · thieu · email_sai · sdt_sai · mk_ngan
//         · da_ton_tai · quota · busy · timeout · blocked · bad · upstream · setup · ma_sai · cho

import { PHIEN_BAN, so } from './caidat.js';
import { boPhien, dangKy, dangNhap, hoSo, loi, ok, tkTuToken } from './auth.js';
import { don, giay, ghiCaiDat, docCaiDat } from './db.js';
import { goiGemini } from './gemini.js';
import { BOT_AI, baoTaiKhoanMoi } from './telegram.js';
import { BOT_EL, baoDangKyMoi } from './botel.js';
import { cauHinhChoWeb, cauHinhDayDu, nhanDangKy } from './khoahoc.js';
import { tgAdmins } from './tg.js';
import { quenMK, datLaiMKBangMa } from './quenmk.js';
import { thongTinUngHo } from './ungho.js';
import { linksChoWeb, linksKiemKey, linksLuu } from './links.js';
import { taiThang } from './taive.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-max-age': '86400',
};
const json = (obj, status = 200, them) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...them } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    for (const bot of BOT) if (url.pathname === bot.duong && req.method === 'POST') return tgWebhook(bot, req, env, ctx);
    // Tải thẳng file từ Telegram về máy, không qua Drive (trang upload). Đứng NGOÀI xuLy:
    // thân là form chứ không phải JSON, trả về luồng nhị phân chứ không phải {ok,data},
    // và không đụng tới D1 nên Worker chưa nối cơ sở dữ liệu vẫn chạy được.
    if (url.pathname === '/taive' && req.method === 'POST') return taiThang(req, env);
    // Nội dung trang link-in-bio: đọc công khai, không nhớ đệm — chủ trang bấm Đăng là đổi ngay.
    if (url.pathname === '/links' && req.method === 'GET') {
      if (!env.DB) return json(loi('setup', 'Máy chủ chưa nối cơ sở dữ liệu D1 (xem README của worker)'));
      return json(await linksChoWeb(env.DB), 200, { 'cache-control': 'no-store' });
    }
    if (req.method === 'GET') {
      ctx.waitUntil(nen(env, url));
      // Trang khoá học vẫn gọi đúng kiểu cũ của Apps Script: GET ?action=config
      if (url.searchParams.get('action') === 'config') {
        if (!env.DB) return json({ ok: false, error: 'setup' });
        return json({ ok: true, config: await cauHinhChoWeb(env.DB) }, 200, { 'cache-control': 'no-store' });
      }
      // `cai` chỉ nói phần nào ĐÃ cài, không bao giờ lộ giá trị — để lúc cài biết ngay thiếu gì
      // (bot im lặng vì thiếu TG_SECRET là ca rất dễ mất cả buổi đi dò).
      return json({ ok: true, service: 'elevaTO', ban: PHIEN_BAN, cai: tinhTrang(env) });
    }
    if (req.method !== 'POST') return json(loi('bad', 'Không rõ yêu cầu'), 405);
    ctx.waitUntil(nen(env, url));
    return json(await xuLy(req, env, ctx));
  },
};

const BOT = [BOT_AI, BOT_EL];

/**
 * Phần nào đã cài. Chỉ nói CÓ hay CHƯA, không bao giờ lộ giá trị.
 *
 * `thieu` kể tên những biến còn trống, vì "mail: false" một mình không cho biết thiếu cái nào —
 * mà mail cần tới hai biến. Chỉ là TÊN biến, không phải giá trị.
 */
function tinhTrang(env) {
  const coAdmin = !!(env.TG_SECRET && tgAdmins(env).length);
  const can = {
    GEMINI_KEYS: !!String(env.GEMINI_KEYS || '').trim(),
    TG_SECRET: !!env.TG_SECRET, TG_ADMIN: !!tgAdmins(env).length,
    TG_AI_TOKEN: !!env.TG_AI_TOKEN, TG_EL_TOKEN: !!env.TG_EL_TOKEN,
    BREVO_KEY: !!env.BREVO_KEY, MAIL_TU: !!env.MAIL_TU,
    UPLOAD_TG_TOKEN: !!env.UPLOAD_TG_TOKEN, TAIVE_SECRET: !!env.TAIVE_SECRET,
  };
  return {
    ai: can.GEMINI_KEYS,
    bot_ai: coAdmin && can.TG_AI_TOKEN,
    bot_el: coAdmin && can.TG_EL_TOKEN,
    mail: can.BREVO_KEY && can.MAIL_TU,
    tai_thang: can.UPLOAD_TG_TOKEN && can.TAIVE_SECRET,
    thieu: Object.keys(can).filter((k) => !can[k]),
  };
}

/** Việc chạy ngầm sau khi đã trả lời: nối webhook từng bot và dọn dòng hết hạn. */
async function nen(env, url) {
  try {
    for (const bot of BOT) await bot.ngo(env, url.origin);
    const lan = Number(await docCaiDat(env.DB, 'don_luc') || 0);
    if (giay() - lan > 3600) { await ghiCaiDat(env.DB, 'don_luc', String(giay())); await don(env.DB); }
  } catch (e) { console.error(`nen: ${e}`); }
}

async function xuLy(req, env, ctx) {
  if (!env.DB) return loi('setup', 'Máy chủ chưa nối cơ sở dữ liệu D1 (xem README của worker)');
  const raw = await req.text();
  if (raw.length > so(env, 'AI_MAX_BODY')) return loi('bad', 'Yêu cầu quá lớn — chọn ít trang hơn');
  let b;
  try { b = JSON.parse(raw); } catch { return loi('bad', 'Yêu cầu không đọc được'); }
  if (!b || typeof b !== 'object') return loi('bad', 'Yêu cầu không đọc được');
  const bao = BOT_AI.taoBao(env);
  try {
    const a = String(b.action || '');
    if (a === 'dangky') {
      const r = await dangKy(env, b);
      if (r.tkMoi) { ctx.waitUntil(baoTaiKhoanMoi(env, r.tkMoi)); delete r.tkMoi; }
      return r;
    }
    if (a === 'dangnhap') return await dangNhap(env, b);
    if (a === 'ungho') return ok({ ungho: await thongTinUngHo(env.DB) });
    // Trang link-in-bio giữ nguyên giao thức cũ (ok/updatedAt ở ngoài cùng), xem src/links.js.
    if (a === 'links') return await linksChoWeb(env.DB);
    if (a === 'checkKey') return await linksKiemKey(env, b);
    if (a === 'saveLinks') return await linksLuu(env, b);
    if (a === 'quenmk') return await quenMK(env, b, bao);
    if (a === 'datlaimk') return await datLaiMKBangMa(env, b, (t) => BOT_AI.bao(env, t));
    // Trang khoá học: giữ nguyên giao thức cũ (ok/id/config ở ngoài cùng), xem src/khoahoc.js.
    if (a === 'register') {
      const r = await nhanDangKy(env, b);
      if (r.moi) ctx.waitUntil(baoDangKyMoi(env, r.moi, await cauHinhDayDu(env.DB)));
      if (r.day_du) ctx.waitUntil(BOT_EL.bao(env, `\u{1F389} <b>${r.day_du.computed.cohortLabel} ĐÃ ĐỦ ${r.day_du.slots.max} NGƯỜI!</b>\n\n`
        + `Web đã tự chuyển sang trạng thái đã đủ chỗ — người vào sau sẽ đăng ký waitlist ${r.day_du.computed.nextCohortLabel}.\n\n`
        + 'Khi muốn mở cohort mới, gõ /cohortmoi.'));
      return r.kq;
    }
    if (a === 'toi' || a === 'dangxuat' || a === 'generate') {
      if (a === 'dangxuat') { await boPhien(env.DB, b.token); return ok({}); }
      const tk = await tkTuToken(env.DB, b.token);
      if (!tk) return loi('auth', 'Phiên đăng nhập đã hết — đăng nhập lại');
      if (a === 'toi') return ok({ me: await hoSo(env, tk) });
      return await goiGemini(env, tk, b, bao);
    }
    return loi('bad', 'Không rõ yêu cầu');
  } catch (err) {
    console.error(`xuLy: ${err && err.stack ? err.stack : err}`);
    return loi('upstream', 'Máy chủ gặp lỗi, thử lại sau ít phút');
  }
}

/** Telegram đẩy tin sang. Trả 200 ngay, xử lý sau — Telegram gửi lại nếu chờ quá lâu. */
async function tgWebhook(bot, req, env, ctx) {
  if (!env.TG_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== env.TG_SECRET) {
    return new Response('no', { status: 401 });
  }
  let u;
  try { u = await req.json(); } catch { return new Response('ok'); }
  ctx.waitUntil(bot.nhanTin(env, u));
  return new Response('ok');
}
