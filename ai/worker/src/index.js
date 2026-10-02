// Máy chủ elevaTO AI BCTC trên Cloudflare Workers.
//
// Giữ NGUYÊN giao thức của bản Apps Script cũ: một đường POST, thân là JSON { action, … },
// trả { ok:true, data } hoặc { ok:false, code, error, retryAfter? }. Trang web chỉ phải đổi
// địa chỉ trong js/config.js, không phải sửa gì khác.
//
//   dangky · dangnhap · toi · dangxuat · generate · ungho · quenmk · datlaimk
//   links · checkKey · saveLinks  (trang link-in-bio — xem src/links.js)
//   code: auth · sai · khoa_tam · cho_duyet · bi_khoa · thieu · email_sai · sdt_sai · mk_ngan
//         · da_ton_tai · quota · busy · timeout · blocked · bad · upstream · setup · ma_sai · cho

import { PHIEN_BAN, so } from './caidat.js';
import { boPhien, dangKy, dangNhap, hoSo, loi, ok, tkTuToken } from './auth.js';
import { don, giay, ghiCaiDat, docCaiDat } from './db.js';
import { goiGemini } from './gemini.js';
import { baoQuanTri, baoTaiKhoanMoi, ngoWebhook, nhanTin, taoBao } from './telegram.js';
import { quenMK, datLaiMKBangMa } from './quenmk.js';
import { thongTinUngHo } from './ungho.js';
import { linksChoWeb, linksKiemKey, linksLuu } from './links.js';

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
    if (url.pathname === '/tg' && req.method === 'POST') return tgWebhook(req, env, ctx);
    // Nội dung trang link-in-bio: đọc công khai, không nhớ đệm — chủ trang bấm Đăng là đổi ngay.
    if (url.pathname === '/links' && req.method === 'GET') {
      if (!env.DB) return json(loi('setup', 'Máy chủ chưa nối cơ sở dữ liệu D1 (xem README của worker)'));
      return json(await linksChoWeb(env.DB), 200, { 'cache-control': 'no-store' });
    }
    if (req.method === 'GET') {
      ctx.waitUntil(nen(env, url));
      return json({ ok: true, service: 'elevaTO AI', ban: PHIEN_BAN });
    }
    if (req.method !== 'POST') return json(loi('bad', 'Không rõ yêu cầu'), 405);
    ctx.waitUntil(nen(env, url));
    return json(await xuLy(req, env, ctx));
  },
};

/** Việc chạy ngầm sau khi đã trả lời: nối webhook Telegram và dọn dòng hết hạn. */
async function nen(env, url) {
  try {
    await ngoWebhook(env, `${url.origin}/tg`);
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
  const bao = taoBao(env);
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
    if (a === 'datlaimk') return await datLaiMKBangMa(env, b, (t) => baoQuanTri(env, t));
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
async function tgWebhook(req, env, ctx) {
  if (!env.TG_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== env.TG_SECRET) {
    return new Response('no', { status: 401 });
  }
  let u;
  try { u = await req.json(); } catch { return new Response('ok'); }
  ctx.waitUntil(nhanTin(env, u));
  return new Response('ok');
}
