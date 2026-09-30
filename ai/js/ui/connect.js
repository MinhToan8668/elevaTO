// Bước 1: kết nối máy chủ elevaTO AI (Apps Script). Link + mã có thể đến từ đường link được chia sẻ:
//   .../ai/#api=https://script.google.com/macros/s/XXX/exec&code=ABC
// Đọc xong thì xoá khỏi thanh địa chỉ để mã không nằm lại trong lịch sử / ảnh chụp màn hình.

import { h, mount, $ } from './dom.js';
import { createClient } from '../ai.js';

export const API_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/;
import { OFFICIAL_API } from '../config.js';

const LS = 'elevato-ai-conn';          // link máy chủ, model, (mã nếu người dùng chọn ghi nhớ)
const SS = 'elevato-ai-code';          // mã trong phiên trình duyệt (mất khi đóng tab)

const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
const loadSessionCode = () => { try { return sessionStorage.getItem(SS) || ''; } catch (e) { return ''; } };
function save(c, remember) {
  try {
    localStorage.setItem(LS, JSON.stringify({ api: c.api, model: c.model, remember: !!remember, code: remember ? c.code : undefined }));
    sessionStorage.setItem(SS, c.code || '');
  } catch (e) { /* trình duyệt chặn lưu trữ: bỏ qua */ }
}

/**
 * Link máy chủ + mã lúc mở trang.
 *  - Link có #api=… : chỉ dùng mã đi kèm trong link (hoặc mã đã lưu nếu CÙNG máy chủ) — link lạ không lấy được mã đã lưu.
 *  - Tự kết nối khi máy chủ là máy chủ chính thức / đã từng kết nối; máy chủ mới phải bấm tay.
 */
export function initialConnection(hash, saved, sessionCode, official = OFFICIAL_API) {
  const hp = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const savedCode = saved.code || sessionCode || '';
  const hApi = (hp.get('api') || '').trim(), hCode = (hp.get('code') || '').trim();
  if (!hApi) {
    const api = saved.api || official || '';
    return { api, code: hCode || (api && api === saved.api ? savedCode : ''), auto: !!api, fromHash: hp.has('code') };
  }
  const known = hApi === saved.api || (!!official && hApi === official);
  return { api: hApi, code: hCode || (hApi === saved.api ? savedCode : ''), auto: known, fromHash: true, unknown: !known };
}

/** Model mặc định: bản flash chính thức mới nhất (không lite). Bản preview hạn mức thấp, hay bị gỡ → chỉ dùng khi không có bản chính thức. */
export function pickModel(models, saved) {
  const ids = models.map((m) => m.id);
  if (saved && ids.includes(saved)) return saved;
  const ver = (id) => Number((/gemini-(\d+(?:\.\d+)?)/.exec(id) || [])[1] || 0);
  const score = (id) => ver(id) * 10 + (/flash/.test(id) ? 3 : 0) - (/lite/.test(id) ? 2 : 0) - (/preview|exp/.test(id) ? 50 : 0);
  return [...ids].sort((a, b) => score(b) - score(a))[0] || '';
}

export function initConnect(store, ctx) {
  const saved = load();
  const init = initialConnection(location.hash, saved, loadSessionCode());
  const { api, code } = init;
  if (init.fromHash) history.replaceState(null, '', location.pathname + location.search);
  store.set({ conn: { ...store.get().conn, api, code, model: saved.model || '' } });

  const box = $('#connectBox');
  const apiIn = h('input', { class: 'inp', id: 'apiIn', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: api, autocomplete: 'off', spellcheck: 'false' });
  const codeIn = h('input', { class: 'inp', id: 'codeIn', type: 'password', placeholder: 'Mã truy cập', value: code, autocomplete: 'off' });
  const remember = h('input', { type: 'checkbox', id: 'rememberIn', checked: !!saved.remember });
  const btn = h('button', { class: 'btn', id: 'connectBtn', onclick: () => connect(apiIn.value.trim(), codeIn.value.trim()) }, 'Kết nối');
  const msg = h('div');
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  mount(box,
    h('div', { class: 'row' },
      h('div', {}, h('label', { class: 'f', htmlFor: 'apiIn' }, 'Link máy chủ AI'), apiIn),
      h('div', { style: { flex: '0 1 220px' } }, h('label', { class: 'f', htmlFor: 'codeIn' }, 'Mã truy cập'), codeIn),
      h('div', { style: { flex: '0 0 auto' } }, btn)),
    h('label', { class: 'chk', style: { marginTop: '10px' } }, remember, h('span', {}, 'Ghi nhớ mã trên máy này (đừng chọn nếu dùng máy chung)')),
    msg);
  if (init.unknown) {
    setMsg('warn', `Link này trỏ tới máy chủ ${shortApi(api)} — chưa từng kết nối. Chỉ bấm "Kết nối" nếu link do elevaTO gửi: máy chủ sẽ nhận mã và các trang BCTC bạn trích xuất.`);
  }

  const sel = $('#modelSel');
  sel.addEventListener('change', () => {
    const conn = { ...store.get().conn, model: sel.value };
    store.set({ conn }); save(conn, load().remember);
  });

  async function connect(a, c) {
    if (!API_RE.test(a)) return setMsg('err', 'Link chưa đúng: phải có dạng https://script.google.com/macros/s/…/exec (link "Ứng dụng web" khi Deploy).');
    if (!c) return setMsg('err', 'Nhập mã truy cập được cấp.');
    btn.disabled = true;
    store.set({ conn: { ...store.get().conn, api: a, code: c, status: 'wait', error: '' } });
    try {
      const d = await createClient({ api: a, code: c }).ping();
      const model = pickModel(d.models || [], store.get().conn.model);
      const conn = { api: a, code: c, status: 'on', name: d.name || '', quota: d.quota || null, models: d.models || [], model, error: '' };
      store.set({ conn }); save(conn, remember.checked);
      setMsg('ok', `Đã kết nối${conn.name ? ` — xin chào ${conn.name}` : ''}. ${quotaText(conn.quota)}`);
      if (!conn.models.length) setMsg('warn', 'Máy chủ chưa lấy được danh sách model — kiểm tra key Gemini trên máy chủ (chạy caiDat).');
    } catch (e) {
      store.set({ conn: { ...store.get().conn, status: 'bad', error: e.message } });
      setMsg('err', e.message);
    } finally { btn.disabled = false; }
  }
  function setMsg(kind, text) { mount(msg, h('p', { class: `msg ${kind}` }, text)); }

  ctx.refreshQuota = async () => {
    const c = store.get().conn;
    if (c.status !== 'on') return;
    try { const d = await createClient(c).ping(); store.set({ conn: { ...store.get().conn, quota: d.quota } }); } catch (e) { /* chỉ để cập nhật số lượt */ }
  };
  ctx.client = (onWait) => {
    const c = store.get().conn;
    return c.status === 'on' ? createClient({ api: c.api, code: c.code, model: c.model, onWait }) : null;
  };

  store.on(renderHeader);
  renderHeader(store.get());
  if (init.auto && api && code && API_RE.test(api)) connect(api, code);
}

const shortApi = (a) => { const m = /\/s\/([\w-]+)\/exec/.exec(a); return m ? `…/s/${m[1].slice(0, 6)}…${m[1].slice(-6)}` : a; };

const quotaText = (q) => (q && q.limit ? `Hôm nay đã dùng ${q.used}/${q.limit} lượt AI.` : q ? 'Không giới hạn lượt.' : '');

let lastConn;
function renderHeader(s) {
  if (s.conn === lastConn) return;
  lastConn = s.conn;
  const c = s.conn;
  $('#connDot').className = 'dot' + (c.status === 'on' ? ' on' : c.status === 'bad' ? ' bad' : '');
  $('#connText').textContent = c.status === 'on'
    ? `${c.name || 'Đã kết nối'}${c.quota && c.quota.limit ? ` · ${c.quota.used}/${c.quota.limit} lượt` : ''}`
    : c.status === 'wait' ? 'Đang kết nối…' : c.status === 'bad' ? 'Lỗi kết nối' : 'Chưa kết nối';
  const sel = $('#modelSel');
  sel.hidden = !(c.status === 'on' && c.models.length);
  if (!sel.hidden) mount(sel, c.models.map((m) => h('option', { value: m.id, selected: m.id === c.model }, m.id)));
  document.querySelector('.rail a[data-step="1"]').classList.toggle('done', c.status === 'on');
}
