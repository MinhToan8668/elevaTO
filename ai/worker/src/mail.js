// Gửi thư qua Brevo (api.brevo.com). Cloudflare Workers không tự gửi được thư như Apps Script,
// nên phần "mã đặt lại mật khẩu" đi qua một dịch vụ ngoài. Brevo cho xác minh thẳng một địa chỉ
// Gmail làm người gửi nên không cần tên miền riêng.

const BREVO = 'https://api.brevo.com/v3/smtp/email';

/** @returns true nếu Brevo nhận thư. Thiếu cấu hình hay lỗi mạng đều ném lỗi để chỗ gọi báo quản trị. */
export async function guiThu(env, { toi, tieuDe, than }) {
  const key = String(env.BREVO_KEY || '');
  const tuEmail = String(env.MAIL_TU || '');
  if (!key || !tuEmail) throw new Error('Chưa cài BREVO_KEY / MAIL_TU');
  const res = await fetch(BREVO, {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: String(env.MAIL_TEN || 'elevaTO AI BCTC'), email: tuEmail },
      to: [{ email: String(toi) }],
      subject: String(tieuDe),
      textContent: String(than),
    }),
  });
  if (res.ok) return true;
  // Thư Brevo từ chối hay kể rõ lý do (người gửi chưa xác minh, hết hạn mức…) — giữ lại để báo quản trị.
  const chi = (await res.text().catch(() => '')).slice(0, 200);
  throw new Error(`Brevo trả ${res.status}${chi ? ` — ${chi}` : ''}`);
}
