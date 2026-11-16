/**
 * TẢI THẲNG — kéo file từ Telegram về thẳng máy, không đi vòng qua Google Drive.
 * ============================================================================
 *
 * Trang upload (upload/index.html) gửi file lên theo đường: máy → Drive → Telegram → xoá
 * khỏi Drive. Chiều VỀ trước đây cũng phải qua Drive: bot kéo từng phần từ Telegram, ghép
 * thành file gốc đặt tạm trên Drive rồi mới tải xuống. Phải làm vậy vì ở Việt Nam trình
 * duyệt không gọi được api.telegram.org, chỉ máy chủ Google gọi được.
 *
 * Cloudflare cũng gọi được Telegram, mà Cloudflare thì ở Việt Nam vào bình thường — nên
 * Worker thay được chỗ của Drive ở chiều về: nó tải lần lượt từng phần rồi NỐI THẲNG vào
 * một luồng trả về. Trình duyệt thấy đúng một file đang tải, không có bản tạm nào trên
 * Drive, không phải chờ ghép, không tốn dung lượng Drive.
 *
 * ── Vé ──────────────────────────────────────────────────────────────────────
 * Worker không có cơ sở dữ liệu nào về kho file — kho nằm trong Script Properties của
 * Apps Script. Nên Apps Script phát một "vé": JSON { n tên, s dung lượng, e hạn, f các
 * phần } mã base64url, ký HMAC-SHA256 bằng bí mật dùng chung. Trang POST vé sang đây,
 * Worker kiểm chữ ký rồi mới chịu tải.
 *
 * Nhờ thế Worker KHÔNG phải hỏi ngược Apps Script — tiết kiệm được một lượt subrequest,
 * mà subrequest chính là thứ hiếm nhất ở đây (xem dưới). Token bot nằm trong Secret của
 * Worker, không bao giờ ra tới trình duyệt.
 *
 * ── Vì sao mỗi lần chỉ tải được chừng ấy ────────────────────────────────────
 * Cloudflare gói Free cho 50 subrequest mỗi lần gọi. Mỗi phần 19MB tốn 1 lượt tải, nên
 * trần cứng là 50 phần. Chừa DU_PHONG để còn chỗ xin lại đường dẫn hết hạn (xem dưới),
 * còn MAX_PHAN phần ≈ 836MB. File to hơn thì vẫn dùng "Lấy về Drive" như cũ — Apps
 * Script không bị giới hạn này.
 *
 * ── Đường dẫn Telegram hết hạn ──────────────────────────────────────────────
 * getFile trả về đường dẫn chỉ bảo đảm sống 1 giờ. Vé phát ra là tải ngay nên gần như
 * luôn kịp, nhưng mạng chậm + file 800MB thì có thể quá giờ, và lúc ấy các phần CUỐI
 * chết — hỏng cả bản tải khi đã gần xong. Nên vé mang theo cả file_id: gặp 404/410 thì
 * Worker gọi getFile xin đường dẫn mới rồi tải tiếp. Mỗi lần như vậy tốn thêm 2 lượt
 * (lượt hỏng + getFile), DU_PHONG = 6 đủ cho 3 lần.
 */

const TG_API = 'https://api.telegram.org/bot';
const TG_FILE = 'https://api.telegram.org/file/bot';

/** Cloudflare gói Free: 50 subrequest mỗi lần gọi (gói Paid 10.000 — đổi hai số này là xong). */
export const CF_SUBREQ = 50;
export const DU_PHONG = 6;
export const MAX_PHAN = CF_SUBREQ - DU_PHONG;

const loiText = (msg, status) =>
  new Response(`${msg}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

const escHtml = (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Lỗi cho yêu cầu đến từ trang upload (form gửi vào một iframe ẩn).
 *
 * Trả chữ trơn như loiText thì nó nằm im trong khung ẩn — người dùng chỉ thấy bấm xong không
 * có gì xảy ra. Nên trả một trang nhỏ tự báo NGƯỢC lên trang cha bằng postMessage, kèm `ma`
 * của đúng lần bấm để trang biết lỗi thuộc file nào.
 *
 * targetOrigin '*': thư chỉ chứa câu báo lỗi (không có vé, không có token), còn trang cha tự
 * kiểm nguồn gửi và `ma` trước khi tin. `<` trong JSON đổi thành \u003c để chuỗi không thể
 * tự đóng thẻ <script>.
 */
function loiTrang(msg, status, ma) {
  const thu = JSON.stringify({ taive: 'loi', ma, msg }).replace(/</g, '\\u003c');
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Tải thẳng</title><p>${escHtml(msg)}</p>` +
      `<script>parent.postMessage(${thu}, '*')</script>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    },
  );
}

/**
 * POST /taive với hai trường form: d (vé base64url) và s (chữ ký base64url).
 *
 * Dùng POST chứ không phải GET vì vé mang theo đường dẫn của mọi phần — file 800MB là
 * gần 9KB, dài quá cho một URL. Trang gửi bằng form trong iframe ẩn nên không bị chặn
 * cửa sổ bật lên và không để lại tab trắng.
 */
export async function taiThang(req, env) {
  let d = '';
  let s = '';
  // ui=1: trang upload gửi qua iframe ẩn → lỗi phải báo ngược lên trang (xem loiTrang).
  // `ma` chỉ giữ chữ, số, _ và - : nó đi thẳng vào thư postMessage.
  let ma = null;
  try {
    const form = await req.formData();
    d = String(form.get('d') || '');
    s = String(form.get('s') || '');
    if (form.get('ui') === '1') ma = String(form.get('ma') || '').replace(/[^\w-]/g, '').slice(0, 40);
  } catch {
    return loiText('Không đọc được yêu cầu', 400);
  }
  const loi = (msg, status) => (ma === null ? loiText(msg, status) : loiTrang(msg, status, ma));

  if (!env.UPLOAD_TG_TOKEN) return loi('Worker chưa cài UPLOAD_TG_TOKEN', 503);
  if (!env.TAIVE_SECRET) return loi('Worker chưa cài TAIVE_SECRET', 503);
  if (!d || !s) return loi('Thiếu vé tải', 400);
  if (!(await kiemChuKy(env.TAIVE_SECRET, d, s))) return loi('Vé tải không hợp lệ', 403);

  let ve;
  try {
    ve = JSON.parse(new TextDecoder().decode(b64urlBytes(d)));
  } catch {
    return loi('Vé tải hỏng', 400);
  }
  const sai = veSai(ve);
  if (sai) return loi(sai, 400);

  // Luồng đi ngay, phần được bơm vào dần ở nền. KHÔNG await bomCacPhan: Cloudflare giữ
  // Worker sống chừng nào trình duyệt còn đang nhận, nên cứ trả Response ra trước.
  //
  // PHẢI là FixedLengthStream, không phải TransformStream. Đã thử trong workerd: với
  // TransformStream, Cloudflare VỨT header content-length tự đặt và gửi kiểu chunked — trình
  // duyệt không biết file nặng bao nhiêu, luồng đứt giữa chừng thì nó báo "Done" với một bản
  // cụt (file 540MB về được 81MB mà tưởng xong). FixedLengthStream thì Cloudflare tự gửi đúng
  // content-length, và ghi thiếu / thừa byte là luồng lỗi → trình duyệt báo tải hỏng.
  // Nó cũng là luồng gốc của runtime: pipeTo chép byte ngoài JavaScript, không ăn CPU.
  const { readable, writable } = typeof FixedLengthStream === 'function'
    ? new FixedLengthStream(ve.s)
    : new TransformStream();   // chỉ khi chạy bài kiểm tra trên Node — Node không có FixedLengthStream
  bomCacPhan(ve.f, env.UPLOAD_TG_TOKEN, writable);

  return new Response(readable, {
    headers: {
      'content-type': 'application/octet-stream',
      // Trên Cloudflare dòng này thừa (FixedLengthStream tự đặt), giữ cho Node và bài kiểm tra.
      'content-length': String(ve.s),
      'content-disposition': `attachment; filename="${tenAscii(ve.n)}"; filename*=UTF-8''${encodeURIComponent(ve.n)}`,
      'cache-control': 'no-store',
      'accept-ranges': 'none',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Vé hợp lệ về mặt hình thức chưa — kiểm trước khi mở luồng, lúc còn báo lỗi tử tế được. */
function veSai(ve, { motPhan = false } = {}) {
  if (!ve || typeof ve !== 'object') return 'Vé tải hỏng';
  if (typeof ve.n !== 'string' || !ve.n) return 'Vé tải thiếu tên file';
  if (!Number.isFinite(ve.s) || ve.s <= 0) return 'Vé tải thiếu dung lượng';
  if (!Number.isFinite(ve.e) || ve.e < Date.now()) return 'Vé tải đã hết hạn — bấm Tải thẳng lại';
  if (!Array.isArray(ve.f) || !ve.f.length) return 'Vé tải không có phần nào';
  // Tải từng phần: mỗi lần gọi chỉ một phần, có đủ 50 lượt riêng — trần số phần và ngân sách
  // dưới đây chỉ dành cho luồng một lần.
  if (!motPhan && ve.f.length > MAX_PHAN) return `Vé tải có ${ve.f.length} phần, quá mức ${MAX_PHAN}`;
  for (const p of ve.f) {
    // Đường dẫn được phép TRỐNG: Apps Script hỏi Telegram mãi không được (Telegram nghẽn) thì để
    // trống, Worker tự xin bù bằng file_id. file_id thì bắt buộc.
    if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'string' || !p[0]) {
      return 'Vé tải có phần không hợp lệ';
    }
  }
  // Mỗi phần thiếu đường dẫn tốn thêm 1 subrequest. Không đủ lượt thì báo NGAY, trước khi mở
  // luồng — lúc này còn trả được trang lỗi tử tế, mở luồng rồi mới hụt thì chỉ còn cách cắt ngang.
  const thieu = ve.f.filter((p) => !p[1]).length;
  if (!motPhan && ve.f.length + thieu > CF_SUBREQ) {
    return `Telegram đang nghẽn, còn ${thieu} phần chưa lấy được đường dẫn — bấm lại sau ít phút, hoặc dùng Lấy về Drive`;
  }
  return '';
}

/**
 * Tải lần lượt từng phần, nối vào luồng trả về.
 *
 * pipeTo là việc của bản thân runtime, không phải vòng lặp JavaScript chép từng byte —
 * quan trọng vì gói Free chỉ cho 10ms CPU, mà chép tay 800MB thì bao nhiêu cũng không đủ.
 */
async function bomCacPhan(phan, token, writable) {
  // Mỗi phần tốn đúng 1 subrequest; phần còn lại của 50 lượt để dành cho thử lại. File ít
  // phần thì dư nhiều lượt — đừng tự bó vào DU_PHONG khi còn chỗ.
  const quy = { con: CF_SUBREQ - phan.length };
  try {
    for (let i = 0; i < phan.length; i++) {
      const res = await layMotPhan(phan[i], token, quy, `${i + 1}/${phan.length}`);
      await res.body.pipeTo(writable, { preventClose: true });
    }
    await writable.close();
  } catch (err) {
    console.error(`taiThang: ${err && err.stack ? err.stack : err}`);
    // Cắt luồng: trình duyệt nhận thiếu byte so với content-length nên báo tải hỏng,
    // thà vậy còn hơn lưu một file cụt mà tưởng là xong.
    try { await writable.abort(err); } catch { /* luồng đã đóng rồi thì thôi */ }
  }
}

/**
 * Lấy MỘT phần từ Telegram, chịu được trục trặc: đường dẫn trống thì xin bù bằng file_id,
 * 404/410 (hết hạn) thì xin đường dẫn mới, đứt mạng / 429 / 5xx thì chờ rồi thử lại.
 * `quy.con` là số subrequest còn được tiêu ngoài lượt tải chính của phần này (bị trừ dần).
 * Chỉ thử lại được khi CHƯA đưa byte nào ra ngoài — nên hàm trả Response chưa đọc thân.
 * @returns Response ok có thân; không lấy được thì ném lỗi.
 */
async function layMotPhan([fid, duong], token, quy, ten) {
  const tai = async (d) => {
    try { return await fetch(TG_FILE + token + '/' + d); }
    catch (err) { return { ok: false, status: 0, loi: err }; }   // đứt mạng: coi như một mã lỗi
  };
  const vinhVien = (msg) => { const e = new Error(msg); e.vinhVien = true; return e; };
  const getFile = { ma: 0 };
  // Vé để trống đường dẫn (Apps Script hỏi Telegram không được): xin bù bằng file_id.
  let hienTai = duong;
  for (let lan = 0; !hienTai && lan < 2 && quy.con >= 1; lan++) {
    if (lan) await new Promise((r) => setTimeout(r, 1500));
    quy.con -= 1;
    hienTai = await duongMoi(token, fid, getFile);
    if (LOI_VINH_VIEN.has(getFile.ma)) throw vinhVien(`phần ${ten}: Telegram không cho đường dẫn (${getFile.ma})`);
  }
  if (!hienTai) throw new Error(`phần ${ten}: Telegram không cho đường dẫn`);
  let res = await tai(hienTai);
  for (let lan = 0; !res.ok && lan < 3; lan++) {
    if ((res.status === 404 || res.status === 410) && quy.con >= 2) {
      // Đường dẫn hết hạn giữa chừng. Xin lại rồi tải tiếp, đừng bỏ cả bản tải.
      quy.con -= 2;
      const moi = await duongMoi(token, fid, getFile);
      if (!moi && LOI_VINH_VIEN.has(getFile.ma)) throw vinhVien(`phần ${ten}: Telegram không còn file này (${getFile.ma})`);
      if (!moi) break;
      hienTai = moi;   // lần thử sau (nếu có) dùng đường dẫn MỚI, không quay về cái đã hết hạn
      res = await tai(hienTai);
    } else if ((res.status === 0 || res.status === 429 || res.status >= 500) && quy.con >= 1) {
      // Telegram trục trặc thoáng qua (đứt mạng, bận, lỗi máy chủ): chờ chút rồi thử lại.
      quy.con -= 1;
      await new Promise((r) => setTimeout(r, 800 * (lan + 1)));
      res = await tai(hienTai);
    } else break;
  }
  if (!res.ok || !res.body) {
    // 401/403 = token của Worker không phải bot đã gửi file (đổi bot, dán nhầm token).
    const e = new Error(`phần ${ten}: Telegram trả ${res.status}`);
    if (res.status === 401 || res.status === 403) e.vinhVien = true;
    throw e;
  }
  return res;
}

// ─── Tải từng phần ─────────────────────────────────────────────────────────────

/** CORS cho đường tải từng phần: trang upload đọc thân bằng fetch() từ github.io. */
const CORS_PHAN = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const loiPhan = (ma, loi, status) => new Response(JSON.stringify({ ok: false, ma, loi }), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS_PHAN },
});

/**
 * TẢI TỪNG PHẦN — POST /taive/phan, thân JSON { d, s, i } (gửi dạng text/plain cho khỏi
 * preflight). Trả đúng phần thứ i của vé (≤19MB).
 *
 * Vì sao có đường này: một luồng 550MB thì Mac ngủ, đổi Wi-Fi, Telegram chập một phần… là
 * hỏng cả bản tải, phải làm lại từ đầu. Trang tự tải từng phần một, phần nào hỏng thì tải lại
 * RIÊNG phần đó rồi ghi thẳng xuống đĩa thành một file (File System Access trên Chrome) — nên
 * không bao giờ phải làm lại từ đầu. Mỗi lần gọi là một yêu cầu ngắn có đủ 50 subrequest riêng,
 * nên cũng hết trần 44 phần.
 *
 * Vé hết hạn → ma 'het_han' (410): trang xin vé mới rồi tải tiếp từ phần đang dở.
 */
export async function taiPhan(req, env) {
  if (!env.UPLOAD_TG_TOKEN || !env.TAIVE_SECRET) return loiPhan('cai_dat', 'Worker chưa cài UPLOAD_TG_TOKEN / TAIVE_SECRET', 503);
  let b;
  try { b = JSON.parse(await req.text()); } catch { return loiPhan('hong', 'Không đọc được yêu cầu', 400); }
  const d = String((b && b.d) || ''), s = String((b && b.s) || ''), i = Number(b && b.i);
  if (!d || !s) return loiPhan('hong', 'Thiếu vé tải', 400);
  if (!(await kiemChuKy(env.TAIVE_SECRET, d, s))) return loiPhan('sai_ky', 'Vé tải không hợp lệ', 403);
  let ve;
  try { ve = JSON.parse(new TextDecoder().decode(b64urlBytes(d))); } catch { return loiPhan('hong', 'Vé tải hỏng', 400); }
  if (ve && Number.isFinite(ve.e) && ve.e < Date.now()) return loiPhan('het_han', 'Vé tải đã hết hạn', 410);
  const sai = veSai(ve, { motPhan: true });
  if (sai) return loiPhan('hong', sai, 400);
  if (!Number.isInteger(i) || i < 0 || i >= ve.f.length) return loiPhan('hong', 'Số phần không hợp lệ', 400);

  let res;
  try {
    res = await layMotPhan(ve.f[i], env.UPLOAD_TG_TOKEN, { con: CF_SUBREQ - 1 }, `${i + 1}/${ve.f.length}`);
  } catch (err) {
    console.error(`taiPhan: ${err && err.message ? err.message : err}`);
    // telegram_hong: thử lại cũng vô ích — trang bỏ đường này, chuyển Lấy về Drive (Apps Script
    // dùng token riêng của nó nên vẫn lấy được). telegram: trục trặc tạm, trang thử lại sau.
    return loiPhan(err && err.vinhVien ? 'telegram_hong' : 'telegram', String(err && err.message ? err.message : err), 502);
  }
  // Chuyền thẳng thân của Telegram qua FixedLengthStream: byte đi ngoài JavaScript (không ăn
  // CPU) và Cloudflare gửi đúng content-length để trang biết phần về đủ hay thiếu.
  const len = Number(res.headers.get('content-length'));
  let than = res.body;
  if (Number.isFinite(len) && len > 0 && typeof FixedLengthStream === 'function') {
    const { readable, writable } = new FixedLengthStream(len);
    res.body.pipeTo(writable).catch(() => { /* đứt giữa chừng: trang thấy thiếu byte và tải lại phần này */ });
    than = readable;
  }
  return new Response(than, {
    headers: {
      'content-type': 'application/octet-stream',
      ...(Number.isFinite(len) && len > 0 ? { 'content-length': String(len) } : {}),
      'cache-control': 'no-store',
      ...CORS_PHAN,
    },
  });
}

/**
 * Xin đường dẫn mới cho một phần. Trả '' nếu không được; `ghi.ma` (nếu truyền) nhận mã lỗi
 * Telegram trả về để bên gọi biết lỗi là VĨNH VIỄN (400/401/403/404: file_id sai, token sai /
 * đã đổi bot) hay tạm thời (mất kết nối, 429, 5xx).
 */
async function duongMoi(token, fileId, ghi) {
  try {
    const r = await fetch(TG_API + token + '/getFile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    const j = await r.json();
    if (j && j.ok && j.result && j.result.file_path) return j.result.file_path;
    if (ghi) ghi.ma = (j && j.error_code) || r.status;
    return '';
  } catch {
    return '';
  }
}

/** Telegram nói chắc là không có / không cho: thử lại bao nhiêu cũng vậy. */
const LOI_VINH_VIEN = new Set([400, 401, 403, 404]);

async function kiemChuKy(biMat, d, s) {
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(biMat), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    return await crypto.subtle.verify('HMAC', key, b64urlBytes(s), new TextEncoder().encode(d));
  } catch {
    return false;
  }
}

export function b64urlBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Bản dự phòng của tên file cho trình duyệt cũ: chỉ ASCII in được, và không có dấu " —
 * một dấu nháy lọt vào là vỡ cả header Content-Disposition. Bản có dấu tiếng Việt đi
 * bằng filename*=UTF-8'' ngay bên cạnh.
 */
function tenAscii(ten) {
  const sach = String(ten).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_').trim();
  return sach || 'file';
}
