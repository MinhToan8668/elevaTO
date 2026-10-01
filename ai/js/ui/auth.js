// Đăng nhập / đăng ký (kiểu Viral Studio của TMXK): màn chào + thẻ đăng nhập, menu tài khoản trên đầu trang.
// Phiên (token) lưu trong trình duyệt; máy chủ chỉ giữ bản băm và cho sống 30 ngày.

import { h, mount, $ } from './dom.js';
import { ROLE_KEY, watch } from './store.js';
import { t } from '../i18n.js';
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
  return l.han ? t('au.quota', { left: Math.max(0, l.han - l.dung), han: l.han }) : t('au.quotaFree');
}

export function initAuth(store, ctx, { onLogin }) {
  let session = readSession();

  ctx.client = (onWait) => (session ? createClient({ api: API, token: session.token, onWait, onAuth: () => ctx.logout(t('au.expired')) }) : null);
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
  // Đổi ngôn ngữ: vẽ lại màn đăng nhập và menu tài khoản (hai phần này không nằm trong vòng vẽ của bước).
  // Giữ nguyên những gì người dùng đang gõ dở và các ô đã tick — vẽ lại chỉ để đổi chữ.
  let langCu = store.get().lang;
  watch(store, ['lang'], (st) => {
    if (st.lang === langCu) return;
    langCu = st.lang;
    if (!session) {
      const giu = chupMan();
      renderGate(enter);
      datLaiMan(giu);
    }
    const chung = $('#sharedPc')?.checked;
    $('#acct').replaceChildren();                      // buộc renderAccount dựng lại với chữ mới
    renderAccount(ctx)(store.get());
    const o = $('#sharedPc');
    if (o && chung) o.checked = true;
  });
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
    const eye = h('button', { type: 'button', class: 'eye', 'aria-label': t('au.show.aria'), 'aria-pressed': 'false', disabled: off, onclick: () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.textContent = show ? t('au.hide') : t('au.show');
    } }, t('au.show'));
    return h('div', { class: 'fld' }, h('label', { htmlFor: id }, label), h('div', { class: 'pw' }, inp, eye));
  };

  const loginForm = h('form', { class: 'auth-form', id: 'loginForm', novalidate: true },
    field('liEmail', t('au.email'), { type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'ban@email.com' }),
    pw('liPass', t('au.pass'), 'current-password'),
    h('button', { class: 'btn big', type: 'submit', disabled: off }, t('au.login')),
    h('p', { class: 'fine' }, t('au.forgot')));
  const signupForm = h('form', { class: 'auth-form', id: 'signupForm', novalidate: true, hidden: true },
    field('suTen', t('au.name'), { autocomplete: 'name', placeholder: t('au.name.ph'), maxlength: '60' }),
    field('suEmail', t('au.email'), { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ban@email.com' }),
    field('suSdt', t('au.phone'), { type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: t('au.phone.ph') }),
    pw('suPass', t('au.pass.new'), 'new-password'),
    // Ô bẫy bot: người thật không thấy, không điền.
    h('div', { class: 'trap', 'aria-hidden': 'true' }, h('label', {}, 'Website', h('input', { id: 'suWeb', tabindex: '-1', autocomplete: 'off' }))),
    h('button', { class: 'btn big', type: 'submit', disabled: off }, t('au.signup')),
    h('p', { class: 'fine' }, t('au.free')));

  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': t('au.tabs.aria') });
  const tab = (key, label, form) => h('button', { type: 'button', id: `tab-${key}`, 'aria-controls': form.id, 'aria-pressed': String(key === 'login'), onclick: () => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.id === `tab-${key}`)));
    loginForm.hidden = key !== 'login'; signupForm.hidden = key !== 'signup';
    setGateMsg();
  } }, label);
  tabs.append(tab('login', t('au.login'), loginForm), tab('signup', t('au.signup'), signupForm));

  const busy = (form, on, label) => {
    const b = form.querySelector('button[type=submit]');
    b.disabled = on; b.textContent = on ? t('au.working') : label;
    b.setAttribute('aria-busy', String(on));
  };
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#liEmail').value.trim(), mk = $('#liPass').value;
    if (!email || !mk) return setGateMsg('err', t('au.needBoth'));
    busy(loginForm, true, t('au.login'));
    try {
      const d = await callApi(API, { action: 'dangnhap', email, mk });
      enter(d.token, d.me);
    } catch (err) { setGateMsg(err.code === 'cho_duyet' ? 'warn' : 'err', err.message); }
    finally { busy(loginForm, false, t('au.login')); }
  });
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { action: 'dangky', ten: $('#suTen').value.trim(), email: $('#suEmail').value.trim(), sdt: $('#suSdt').value.trim(), mk: $('#suPass').value, website: $('#suWeb').value };
    if (!body.ten || !body.email || !body.sdt || !body.mk) return setGateMsg('err', t('au.needAll'));
    if (body.mk.length < 8) return setGateMsg('err', t('au.shortPass'));
    busy(signupForm, true, t('au.signup'));
    try {
      const d = await callApi(API, body);
      if (d.cho) { setGateMsg('ok', t('au.pending')); return; }
      enter(d.token, d.me);
    } catch (err) { setGateMsg('err', err.message); }
    finally { busy(signupForm, false, t('au.signup')); }
  });

  mount($('#gate'),
    h('div', { class: 'gate-in' },
      h('section', { class: 'hero' },
        h('span', { class: 'eyebrow' }, t('au.eyebrow')),
        h('h1', {}, t('au.h1'), h('em', {}, t('au.h1.em'))),
        h('p', { class: 'hero-sub' }, t('au.sub')),
        h('ul', { class: 'feats' },
          feat('01', t('au.f1.t'), t('au.f1.d')),
          feat('02', t('au.f2.t'), t('au.f2.d')),
          feat('03', t('au.f3.t'), t('au.f3.d')))),
      h('section', { class: 'auth-card', 'aria-label': t('au.card.aria') },
        h('h2', {}, t('au.welcome')),
        h('p', { class: 'auth-sub' }, t('au.welcome.sub')),
        off ? h('p', { class: 'msg warn' }, t('au.off')) : null,
        tabs, loginForm, signupForm, msg)));
}

const O_MAN = ['liEmail', 'liPass', 'suTen', 'suEmail', 'suSdt', 'suPass'];

/** Chụp lại những gì người dùng đang gõ dở trên màn đăng nhập (trước khi vẽ lại vì đổi ngôn ngữ). */
function chupMan() {
  const msg = $('#gate .auth-msg .msg');
  return {
    o: Object.fromEntries(O_MAN.map((id) => [id, $(`#${id}`)?.value || ''])),
    tab: $('#signupForm')?.hidden === false ? 'signup' : 'login',
    msg: msg ? { kind: [...msg.classList].find((c) => c !== 'msg') || 'err', text: msg.textContent } : null,
  };
}

function datLaiMan(giu) {
  for (const [id, v] of Object.entries(giu.o)) { const el = $(`#${id}`); if (el && v) el.value = v; }
  if (giu.tab === 'signup') $('#tab-signup')?.click();
  if (giu.msg) setGateMsg(giu.msg.kind, giu.msg.text);
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
      h('summary', { 'aria-label': t('au.acct.aria', { name: me.ten }) }, h('span', { class: 'ava', 'aria-hidden': 'true' }, initials(me.ten)), h('span', { class: 'acct-name' }, me.ten)),
      h('div', { class: 'acct-pop' },
        h('b', {}, me.ten), h('small', {}, me.email),
        h('p', { class: 'acct-q' }, quotaText(me)),
        h('span', { class: `tag ${me.vaitro === 'free' ? '' : 'em'}` }, t(ROLE_KEY[me.vaitro] || ROLE_KEY.free)),
        h('label', { class: 'chk acct-shared' }, h('input', { type: 'checkbox', id: 'sharedPc' }), h('span', {}, t('au.shared'))),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => ctx.logout('', { clearWork: $('#sharedPc')?.checked }) }, t('au.logout'))));
    mount(box, menu);
  };
}

// Bấm ra ngoài / Esc thì đóng menu tài khoản.
function closeMenuOutside() {
  const close = () => document.querySelectorAll('details.acct[open]').forEach((d) => { d.open = false; });
  document.addEventListener('click', (e) => { if (!e.target.closest?.('details.acct')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
