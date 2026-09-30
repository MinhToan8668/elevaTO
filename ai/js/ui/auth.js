// Đăng nhập / đăng ký (kiểu Viral Studio của TMXK): màn chào + thẻ đăng nhập, menu tài khoản trên đầu trang.
// Phiên (token) lưu trong trình duyệt; máy chủ chỉ giữ bản băm và cho sống 30 ngày.

import { h, mount, $ } from './dom.js';
import { API } from '../config.js';
import { callApi, createClient } from '../ai.js';

const LS = 'elevato-ai-phien';

export function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    return s && typeof s.token === 'string' && s.me && typeof s.me === 'object' ? s : null;
  } catch (e) { return null; }
}
function saveSession(s) { try { if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); } catch (e) { /* trình duyệt chặn lưu trữ */ } }

/** Chữ viết tắt cho ảnh đại diện: "Nguyễn Văn An" → "NA". */
export function initials(ten) {
  const w = String(ten || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

/** "3/20 lượt AI hôm nay" · "Không giới hạn lượt AI" */
export function quotaText(me) {
  const l = me?.luot;
  if (!l) return '';
  return l.han ? `Còn ${Math.max(0, l.han - l.dung)}/${l.han} lượt AI hôm nay` : 'Không giới hạn lượt AI';
}

export function initAuth(store, ctx, { onLogin }) {
  let session = readSession();

  ctx.client = (onWait) => (session ? createClient({ api: API, token: session.token, onWait, onAuth: () => ctx.logout('Phiên đăng nhập đã hết — đăng nhập lại nhé') }) : null);
  ctx.refreshQuota = async () => {
    if (!session) return;
    try { setUser(await ctx.client().me()); } catch (e) { /* lỗi mạng: giữ số cũ */ }
  };
  /** Đăng xuất. clearWork: máy dùng chung → xoá luôn phiên làm việc tự lưu của tài khoản này trên máy. */
  ctx.logout = (msg, { clearWork = false } = {}) => {
    ctx.leaving = true;                                 // không hỏi "rời trang?" khi đang trích xuất
    const token = session?.token, email = session?.me?.email;
    saveSession(null);
    session = null;
    if (clearWork && email) { try { localStorage.removeItem(`elevato-ai-session:${String(email).toLowerCase()}`); } catch (e) { /* bỏ qua */ } }
    // keepalive: yêu cầu đăng xuất vẫn tới máy chủ dù trang tải lại ngay sau đó.
    if (token && API) callApi(API, { action: 'dangxuat', token }, { keepalive: true }).catch(() => {});
    if (msg) { try { sessionStorage.setItem('elevato-ai-msg', msg); } catch (e) { /* bỏ qua */ } }
    location.reload();                                  // xoá sạch dữ liệu đang mở trên trang
  };

  function setUser(me) {
    session = { ...session, me };
    saveSession(session);
    store.set({ user: me });
  }
  function enter(token, me) {
    session = { token, me };
    saveSession(session);
    store.set({ user: me });
    showApp(true);
    onLogin(me);
    $('#main').focus({ preventScroll: true });          // người dùng bàn phím / đọc màn hình không bị mất chỗ
  }

  renderGate(enter);
  store.on(renderAccount(ctx));
  closeMenuOutside();
  let flash = '';
  try { flash = sessionStorage.getItem('elevato-ai-msg') || ''; sessionStorage.removeItem('elevato-ai-msg'); } catch (e) { /* bỏ qua */ }

  if (session) {
    store.set({ user: session.me });
    showApp(true);
    onLogin(session.me);
    ctx.refreshQuota();                                 // kiểm tra phiên còn sống + cập nhật lượt
  } else {
    showApp(false);
    if (flash) setGateMsg('warn', flash);
  }
}

function showApp(on) {
  document.documentElement.dataset.view = on ? 'app' : 'gate';
  document.querySelector('.skip')?.setAttribute('href', on ? '#main' : '#gate');
  $('#gate').hidden = on;
  $('#app').hidden = !on;
  $('#acct').hidden = !on;
}

// ─── Màn chào + đăng nhập / đăng ký ───────────────────────

let setGateMsg = () => {};

function renderGate(enter) {
  const msg = h('div', { class: 'auth-msg', 'aria-live': 'polite' });
  setGateMsg = (kind, text) => mount(msg, text ? h('p', { class: `msg ${kind}` }, text) : null);
  const off = !API;

  const field = (id, label, attrs) => h('div', { class: 'fld' }, h('label', { htmlFor: id }, label), h('input', { id, class: 'inp', required: true, disabled: off, ...attrs }));
  const pw = (id, label, autocomplete) => {
    const inp = h('input', { id, class: 'inp', type: 'password', required: true, minlength: '8', autocomplete, disabled: off });
    const eye = h('button', { type: 'button', class: 'eye', 'aria-label': 'Hiện mật khẩu', 'aria-pressed': 'false', disabled: off, onclick: () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.textContent = show ? 'Ẩn' : 'Hiện';
    } }, 'Hiện');
    return h('div', { class: 'fld' }, h('label', { htmlFor: id }, label), h('div', { class: 'pw' }, inp, eye));
  };

  const loginForm = h('form', { class: 'auth-form', id: 'loginForm', novalidate: true },
    field('liEmail', 'Email', { type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'ban@email.com' }),
    pw('liPass', 'Mật khẩu', 'current-password'),
    h('button', { class: 'btn big', type: 'submit', disabled: off }, 'Đăng nhập'),
    h('p', { class: 'fine' }, 'Quên mật khẩu? Nhắn elevaTO để được đặt lại.'));
  const signupForm = h('form', { class: 'auth-form', id: 'signupForm', novalidate: true, hidden: true },
    field('suTen', 'Họ và tên', { autocomplete: 'name', placeholder: 'Nguyễn Văn An', maxlength: '60' }),
    field('suEmail', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ban@email.com' }),
    field('suSdt', 'Số điện thoại', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '09xx xxx xxx' }),
    pw('suPass', 'Mật khẩu (ít nhất 8 ký tự)', 'new-password'),
    // Ô bẫy bot: người thật không thấy, không điền.
    h('div', { class: 'trap', 'aria-hidden': 'true' }, h('label', {}, 'Website', h('input', { id: 'suWeb', tabindex: '-1', autocomplete: 'off' }))),
    h('button', { class: 'btn big', type: 'submit', disabled: off }, 'Tạo tài khoản'),
    h('p', { class: 'fine' }, 'Miễn phí. Mỗi ngày có sẵn lượt AI để trích xuất BCTC.'));

  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': 'Đăng nhập hoặc đăng ký' });
  const tab = (key, label, form) => h('button', { type: 'button', id: `tab-${key}`, 'aria-controls': form.id, 'aria-pressed': String(key === 'login'), onclick: () => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.id === `tab-${key}`)));
    loginForm.hidden = key !== 'login'; signupForm.hidden = key !== 'signup';
    setGateMsg();
  } }, label);
  tabs.append(tab('login', 'Đăng nhập', loginForm), tab('signup', 'Tạo tài khoản', signupForm));

  const busy = (form, on, label) => {
    const b = form.querySelector('button[type=submit]');
    b.disabled = on; b.textContent = on ? 'Đang xử lý…' : label;
    b.setAttribute('aria-busy', String(on));
  };
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#liEmail').value.trim(), mk = $('#liPass').value;
    if (!email || !mk) return setGateMsg('err', 'Nhập email và mật khẩu.');
    busy(loginForm, true, 'Đăng nhập');
    try {
      const d = await callApi(API, { action: 'dangnhap', email, mk });
      enter(d.token, d.me);
    } catch (err) { setGateMsg(err.code === 'cho_duyet' ? 'warn' : 'err', err.message); }
    finally { busy(loginForm, false, 'Đăng nhập'); }
  });
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { action: 'dangky', ten: $('#suTen').value.trim(), email: $('#suEmail').value.trim(), sdt: $('#suSdt').value.trim(), mk: $('#suPass').value, website: $('#suWeb').value };
    if (!body.ten || !body.email || !body.sdt || !body.mk) return setGateMsg('err', 'Điền đủ họ tên, email, số điện thoại và mật khẩu.');
    if (body.mk.length < 8) return setGateMsg('err', 'Mật khẩu cần ít nhất 8 ký tự.');
    busy(signupForm, true, 'Tạo tài khoản');
    try {
      const d = await callApi(API, body);
      if (d.cho) { setGateMsg('ok', 'Đã tạo tài khoản. elevaTO sẽ duyệt sớm — bạn đăng nhập lại sau khi được duyệt nhé.'); return; }
      enter(d.token, d.me);
    } catch (err) { setGateMsg('err', err.message); }
    finally { busy(signupForm, false, 'Tạo tài khoản'); }
  });

  mount($('#gate'),
    h('div', { class: 'gate-in' },
      h('section', { class: 'hero' },
        h('span', { class: 'eyebrow' }, 'Công cụ AI cho học viên elevaTO'),
        h('h1', {}, 'Từ BCTC tới model forecast ', h('em', {}, 'trong vài phút')),
        h('p', { class: 'hero-sub' }, 'Tải báo cáo tài chính (PDF, ảnh chụp hay Excel), AI đọc đúng mẫu Thông tư 99/2025 và điền thẳng vào model của bạn.'),
        h('ul', { class: 'feats' },
          feat('01', 'Đọc mọi dạng BCTC', 'PDF điện tử, bản scan, ảnh chụp, file Excel — kể cả báo cáo cũ theo TT200.'),
          feat('02', 'Số được kiểm tra chéo', 'AI chỉ chép số; máy tính tự cộng dồn, đối chiếu và tô đỏ chỗ lệch để bạn sửa.'),
          feat('03', 'Điền thẳng vào model', 'Model elevaTO, Form nội bộ 2026 hoặc bảng chuẩn hoá — giữ nguyên công thức, biểu đồ.'))),
      h('section', { class: 'auth-card', 'aria-label': 'Đăng nhập' },
        h('h2', {}, 'Chào mừng bạn'),
        h('p', { class: 'auth-sub' }, 'Đăng nhập hoặc tạo tài khoản miễn phí để bắt đầu.'),
        off ? h('p', { class: 'msg warn' }, 'Công cụ đang được cài đặt — quay lại sau ít phút nhé.') : null,
        tabs, loginForm, signupForm, msg)));
}

function feat(n, title, text) {
  return h('li', {}, h('span', { class: 'fn' }, n), h('div', {}, h('b', {}, title), h('p', {}, text)));
}

// ─── Menu tài khoản trên đầu trang ────────────────────────

function renderAccount(ctx) {
  let last;
  return (s) => {
    if (s.user === last) return;
    const prev = last;
    last = s.user;
    const box = $('#acct');
    if (!s.user) { mount(box); return; }
    const me = s.user;
    // Chỉ đổi số lượt (sau mỗi lần trích xuất): sửa tại chỗ, menu đang mở không bị đóng.
    const q = box.querySelector('.acct-q');
    if (q && prev && prev.email === me.email && prev.ten === me.ten && prev.vaitro === me.vaitro) { q.textContent = quotaText(me); return; }
    const menu = h('details', { class: 'acct' },
      h('summary', { 'aria-label': `Tài khoản ${me.ten}` }, h('span', { class: 'ava', 'aria-hidden': 'true' }, initials(me.ten)), h('span', { class: 'acct-name' }, me.ten)),
      h('div', { class: 'acct-pop' },
        h('b', {}, me.ten), h('small', {}, me.email),
        h('p', { class: 'acct-q' }, quotaText(me)),
        me.vaitro === 'admin' ? h('span', { class: 'tag em' }, 'Quản trị') : null,
        h('label', { class: 'chk acct-shared' }, h('input', { type: 'checkbox', id: 'sharedPc' }), h('span', {}, 'Máy dùng chung — xoá dữ liệu đang làm khi đăng xuất')),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => ctx.logout('', { clearWork: $('#sharedPc')?.checked }) }, 'Đăng xuất')));
    mount(box, menu);
  };
}

// Bấm ra ngoài / Esc thì đóng menu tài khoản.
function closeMenuOutside() {
  const close = () => document.querySelectorAll('details.acct[open]').forEach((d) => { d.open = false; });
  document.addEventListener('click', (e) => { if (!e.target.closest?.('details.acct')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
