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

/**
 * POST /taive với hai trường form: d (vé base64url) và s (chữ ký base64url).
 *
 * Dùng POST chứ không phải GET vì vé mang theo đường dẫn của mọi phần — file 800MB là
 * gần 9KB, dài quá cho một URL. Trang gửi bằng form trong iframe ẩn nên không bị chặn
 * cửa sổ bật lên và không để lại tab trắng.
 */
export async function taiThang(req, env) {
  if (!env.UPLOAD_TG_TOKEN) return loiText('Worker chưa cài UPLOAD_TG_TOKEN', 503);
  if (!env.TAIVE_SECRET) return loiText('Worker chưa cài TAIVE_SECRET', 503);

  let d = '';
  let s = '';
  try {
    const form = await req.formData();
    d = String(form.get('d') || '');
    s = String(form.get('s') || '');
  } catch {
    return loiText('Không đọc được yêu cầu', 400);
  }
  if (!d || !s) return loiText('Thiếu vé tải', 400);
  if (!(await kiemChuKy(env.TAIVE_SECRET, d, s))) return loiText('Vé tải không hợp lệ', 403);

  let ve;
  try {
    ve = JSON.parse(new TextDecoder().decode(b64urlBytes(d)));
  } catch {
    return loiText('Vé tải hỏng', 400);
  }
  const loi = veSai(ve);
  if (loi) return loiText(loi, 400);

  // Luồng đi ngay, phần được bơm vào dần ở nền. KHÔNG await bomCacPhan: Cloudflare giữ
  // Worker sống chừng nào trình duyệt còn đang nhận, nên cứ trả Response ra trước.
  const { readable, writable } = new TransformStream();
  bomCacPhan(ve.f, env.UPLOAD_TG_TOKEN, writable);

  return new Response(readable, {
    headers: {
      'content-type': 'application/octet-stream',
      // Biết trước dung lượng nên trình duyệt hiện được thanh tiến trình, và đứt giữa
      // chừng là nó biết file thiếu byte chứ không lưu nhầm bản cụt coi như xong.
      'content-length': String(ve.s),
      'content-disposition': `attachment; filename="${tenAscii(ve.n)}"; filename*=UTF-8''${encodeURIComponent(ve.n)}`,
      'cache-control': 'no-store',
      'accept-ranges': 'none',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Vé hợp lệ về mặt hình thức chưa — kiểm trước khi mở luồng, lúc còn báo lỗi tử tế được. */
function veSai(ve) {
  if (!ve || typeof ve !== 'object') return 'Vé tải hỏng';
  if (typeof ve.n !== 'string' || !ve.n) return 'Vé tải thiếu tên file';
  if (!Number.isFinite(ve.s) || ve.s <= 0) return 'Vé tải thiếu dung lượng';
  if (!Number.isFinite(ve.e) || ve.e < Date.now()) return 'Vé tải đã hết hạn — bấm Tải thẳng lại';
  if (!Array.isArray(ve.f) || !ve.f.length) return 'Vé tải không có phần nào';
  if (ve.f.length > MAX_PHAN) return `Vé tải có ${ve.f.length} phần, quá mức ${MAX_PHAN}`;
  for (const p of ve.f) {
    if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'string' || !p[0] || !p[1]) {
      return 'Vé tải có phần không hợp lệ';
    }
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
  let conDuPhong = DU_PHONG;
  try {
    for (let i = 0; i < phan.length; i++) {
      const [fid, duong] = phan[i];
      let res = await fetch(TG_FILE + token + '/' + duong);
      // 404/410 = đường dẫn hết hạn giữa chừng. Xin lại rồi tải tiếp, đừng bỏ cả bản tải.
      if (!res.ok && (res.status === 404 || res.status === 410) && conDuPhong >= 2) {
        conDuPhong -= 2;
        const moi = await duongMoi(token, fid);
        if (moi) res = await fetch(TG_FILE + token + '/' + moi);
      }
      if (!res.ok || !res.body) throw new Error(`phần ${i + 1}/${phan.length}: Telegram trả ${res.status}`);
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

async function duongMoi(token, fileId) {
  try {
    const r = await fetch(TG_API + token + '/getFile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    const j = await r.json();
    return j && j.ok && j.result ? j.result.file_path || '' : '';
  } catch {
    return '';
  }
}

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
