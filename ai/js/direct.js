// CHẾ ĐỘ THỬ KHÔNG ĐĂNG NHẬP: trình duyệt gọi thẳng Gemini bằng key người dùng nạp (Alt+F9), không qua
// máy chủ elevaTO — dùng khi mạng (thường là mạng công ty) chặn *.workers.dev.
// Key chỉ lưu trong localStorage của máy này, dùng chung kho với AI FinLens / e-Invoice (cùng github.io).
// Bật / tắt cả chế độ ở NO_LOGIN; tắt thì trang quay lại đăng nhập + máy chủ như cũ.

export const NO_LOGIN = true;
export const GUEST_NAME = 'Chế độ thử';
export const keyBtnLabel = () => (hasKey() ? 'API key' : 'Nạp API key');

const LS = 'finlens_ai_settings_v1';
const LS_GW = 'elevato_ai_gateway';
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const GATEWAYS = [
  (m, k) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(k)}`,
  (m, k) => `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent?key=${encodeURIComponent(k)}`,
];

function settings() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(LS)); } catch (e) { o = null; }
  if (!o || !Array.isArray(o.keys)) o = { keys: [], model: '', active: 0 };
  return o;
}
function save(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* bị chặn */ } }
const keys = () => settings().keys.filter((k) => k && k.key && k.on !== false).map((k) => k.key.trim());
export const hasKey = () => keys().length > 0;

class DirectError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/** Cùng đầu ra với máy chủ elevaTO: { text, finishReason }. */
export async function directGenerate(body) {
  const ks = keys();
  if (!ks.length) { openKeySettings(); throw new DirectError('setup', 'Chưa có API key Gemini — bảng nạp key vừa mở (Alt+F9), nạp xong bấm chạy lại.'); }
  const model = settings().model || MODELS[0];
  let gw = 0;
  try { gw = Number(localStorage.getItem(LS_GW)) || 0; } catch (e) { /* bỏ qua */ }
  const payload = JSON.stringify(body);
  let last = null;
  for (let ki = 0; ki < ks.length; ki++) {
    for (let g = 0; g < GATEWAYS.length; g++) {
      const gi = (gw + g) % GATEWAYS.length;
      let r;
      try { r = await fetch(GATEWAYS[gi](model, ks[ki]), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }); }
      catch (e) { last = new DirectError('network', 'Không kết nối được tới Google AI — mạng có thể chặn.'); continue; }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        try { localStorage.setItem(LS_GW, String(gi)); } catch (e) { /* bỏ qua */ }
        const c = j.candidates?.[0];
        return { text: (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join(''), finishReason: c?.finishReason || '' };
      }
      const msg = j?.error?.message || `HTTP ${r.status}`;
      if (r.status === 429) { last = new DirectError('busy', `Key hết lượt: ${msg}`); last.retryAfter = 20; break; }
      if (/has not been used|SERVICE_DISABLED|BILLING|prohibited/i.test(msg)) { last = new DirectError('upstream', msg); continue; }
      if ([400, 401, 403].includes(r.status) && /API key|API_KEY|PERMISSION|expired|invalid/i.test(msg)) { last = new DirectError('upstream', `Key bị từ chối: ${msg}`); break; }
      throw new DirectError('upstream', `Gemini ${r.status}: ${msg}`);
    }
  }
  throw last || new DirectError('upstream', 'Gemini không trả lời');
}

/** Bảng nạp key (Alt+F9): mỗi dòng một key + chọn model. */
export function openKeySettings() {
  const o = settings();
  document.getElementById('dk-modal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'dk-modal';
  wrap.className = 'dk-modal';
  wrap.innerHTML = `<div class="dk-box" role="dialog" aria-modal="true" aria-label="Cài đặt Gemini API key">
    <h3>Gemini API key (Alt+F9)</h3>
    <p class="priv">Chế độ thử không cần đăng nhập: trình duyệt gọi thẳng Google bằng key của bạn. Key chỉ lưu trên máy này (dùng chung với AI FinLens / e-Invoice). Lấy key miễn phí tại aistudio.google.com.</p>
    <label>Key — mỗi dòng một key, key đầu hết lượt thì tự chuyển key sau<textarea id="dk-keys" rows="4" placeholder="AIza..."></textarea></label>
    <label>Model<select id="dk-model">${MODELS.map((m) => `<option ${m === (o.model || MODELS[0]) ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <div class="bar"><button class="btn" id="dk-save" type="button">Lưu</button><button class="btn ghost" id="dk-x" type="button">Đóng</button><span class="priv" id="dk-n">${o.keys.length} key đã nạp</span></div>
  </div>`;
  document.body.append(wrap);
  const ta = wrap.querySelector('#dk-keys');
  ta.value = o.keys.map((k) => k.key).join('\n');
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('#dk-x').onclick = close;
  wrap.querySelector('#dk-save').onclick = () => {
    const list = ta.value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const cu = new Map(o.keys.map((k) => [k.key, k]));
    save({ ...o, keys: list.map((k) => cu.get(k) || { key: k, name: '', on: true }), model: wrap.querySelector('#dk-model').value, active: 0 });
    close();
  };
  ta.focus();
}

if (NO_LOGIN && typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.altKey && e.key === 'F9') { e.preventDefault(); openKeySettings(); } });
}
