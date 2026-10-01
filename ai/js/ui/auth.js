// Đăng nhập / đăng ký: ai cũng dùng được màn hình chính, chỉ việc gọi AI và tải file mới cần tài khoản
// (ctx.canDo bật hộp đăng ký). Nút đăng nhập + menu tài khoản nằm ở góc trên.
// Phiên (token) lưu trong trình duyệt; máy chủ chỉ giữ bản băm và cho sống 30 ngày.

import { h, mount, $, toast } from './dom.js';
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
  // Việc người dùng đang định làm khi bị chặn — đăng nhập xong chạy tiếp luôn, không bắt bấm lại.
  let choLam = null;
  /**
   * Việc cần tài khoản (gọi AI, tải file). Chưa đăng nhập thì bật hộp đăng ký và trả false.
   * @param lam  (tuỳ chọn) chạy lại ngay sau khi đăng nhập thành công
   */
  ctx.canDo = (nhan, lam) => {
    if (session) return true;
    choLam = lam || null;
    openAuth(nhan);
    return false;
  };
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
    $('#authDlg')?.close();
    onLogin(me);
    toast(t('au.hello', { name: me.ten }));
    const lam = choLam; choLam = null;
    if (lam) setTimeout(lam, 0);                        // chạy tiếp việc đang dở trước khi bị chặn
  }

  renderGate(enter);
  const veGoc = renderAccount(ctx);
  store.on(veGoc);
  veGoc(store.get());                                   // vẽ ngay nút "Đăng nhập / Đăng ký" cho khách chưa có tài khoản
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

  // Ai cũng vào thẳng màn hình chính. Chỉ lúc gọi AI hoặc tải file mới cần tài khoản (xem ctx.canDo).
  if (session) {
    store.set({ user: session.me });
    onLogin(session.me);
    ctx.refreshQuota();                                 // kiểm tra phiên còn sống + cập nhật lượt
  } else if (flash) {
    openAuth(flash);
  }
}

// ─── Hộp đăng nhập / đăng ký (chỉ bật khi cần) ────────────

let setGateMsg = () => {};
let moHop = () => {};
let khoiPhucQuen = () => {};

/** Bật hộp đăng nhập kèm lời giải thích vì sao cần tài khoản. */
export function openAuth(nhan) { moHop(nhan); }

/** Form quên mật khẩu: bước 1 xin mã qua email, bước 2 nhập mã + mật khẩu mới. */
function quenForm({ field, pw, off, lai }) {
  return h('form', { class: 'auth-form', id: 'resetForm', novalidate: true, hidden: true },
    field('qmEmail', t('au.email'), { type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'ban@email.com' }),
    h('div', { class: 'fld', id: 'qmStep2', hidden: true },
      h('label', { htmlFor: 'qmMa' }, t('au.code')),
      h('input', { id: 'qmMa', class: 'inp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', placeholder: '12345678' })),
    h('div', { id: 'qmStep2b', hidden: true }, pw('qmPass', t('au.pass.new'), 'new-password')),
    h('button', { class: 'btn big', type: 'submit', disabled: off }, t('au.sendCode')),
    h('p', { class: 'fine auth-back' },
      h('button', { type: 'button', class: 'auth-link', id: 'qmLai', onclick: lai }, t('au.resend')),
      ' · ',
      h('button', { type: 'button', class: 'auth-link', onclick: () => $('#tab-login').click() }, t('au.backLogin'))));
}

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
    h('p', { class: 'fine' }, h('button', { type: 'button', class: 'auth-link', disabled: off, onclick: () => moQuen() }, t('au.forgot'))));
  const signupForm = h('form', { class: 'auth-form', id: 'signupForm', novalidate: true, hidden: true },
    field('suTen', t('au.name'), { autocomplete: 'name', placeholder: t('au.name.ph'), maxlength: '60' }),
    field('suTuoi', t('au.age'), { type: 'number', min: '12', max: '100', inputmode: 'numeric', placeholder: '25' }),
    field('suEmail', t('au.email'), { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'ban@email.com' }),
    field('suSdt', t('au.phone'), { type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: t('au.phone.ph') }),
    field('suNN', t('au.job'), { placeholder: t('au.job.ph'), maxlength: '120' }),
    field('suMD', t('au.purpose'), { placeholder: t('au.purpose.ph'), maxlength: '300' }),
    pw('suPass', t('au.pass.new'), 'new-password'),
    // Ô bẫy bot: người thật không thấy, không điền.
    h('div', { class: 'trap', 'aria-hidden': 'true' }, h('label', {}, 'Website', h('input', { id: 'suWeb', tabindex: '-1', autocomplete: 'off' }))),
    h('button', { class: 'btn big', type: 'submit', disabled: off }, t('au.signup')),
    h('p', { class: 'fine' }, t('au.free')));

  const resetForm = quenForm({ field, pw, off, lai: () => datBuoc(1) });

  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': t('au.tabs.aria') });
  const tab = (key, label, form) => h('button', { type: 'button', id: `tab-${key}`, 'aria-controls': form.id, 'aria-pressed': String(key === 'login'), onclick: () => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.id === `tab-${key}`)));
    loginForm.hidden = key !== 'login'; signupForm.hidden = key !== 'signup'; resetForm.hidden = true;
    tabs.hidden = false;
    datBuoc(1);
    phu.textContent = t('au.welcome.sub');
    setGateMsg();
  } }, label);
  tabs.append(tab('login', t('au.login'), loginForm), tab('signup', t('au.signup'), signupForm));

  /**
   * Đưa form đặt lại về bước 1 (xin mã) hay bước 2 (nhập mã + mật khẩu mới).
   * Không có đường về bước 1 thì mã hết hạn là người dùng kẹt luôn, phải tải lại trang.
   */
  const datBuoc = (n) => {
    const b2 = n === 2;
    $('#qmStep2').hidden = !b2;
    $('#qmStep2b').hidden = !b2;
    $('#qmEmail').readOnly = b2;                       // bước 2 phải đúng email đã nhận mã
    if (!b2) { $('#qmMa').value = ''; $('#qmPass').value = ''; }
    $('#resetForm button[type=submit]').textContent = b2 ? t('au.setPass') : t('au.sendCode');
  };

  /** Hiện form đặt lại mật khẩu (ẩn hai tab để không rối), chưa đụng tới nội dung đã gõ. */
  const hienQuen = () => {
    loginForm.hidden = true; signupForm.hidden = true; resetForm.hidden = false; tabs.hidden = true;
    phu.textContent = t('au.forgot.sub');
    setGateMsg();
  };

  const moQuen = () => {
    hienQuen();
    datBuoc(1);
    $('#qmEmail').value = $('#liEmail').value.trim();
    $('#qmEmail').focus();
  };
  khoiPhucQuen = (buoc2) => { hienQuen(); datBuoc(buoc2 ? 2 : 1); };

  const busy = (form, on, label) => {
    const b = form.querySelector('button[type=submit]');
    if (on) b.dataset.nhan = b.textContent;            // nhớ nhãn đang có để trả lại đúng chữ đó
    b.disabled = on;
    b.textContent = on ? t('au.working') : (label || b.dataset.nhan || '');
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
    const body = { action: 'dangky', ten: $('#suTen').value.trim(), email: $('#suEmail').value.trim(), sdt: $('#suSdt').value.trim(),
      mk: $('#suPass').value, tuoi: Number($('#suTuoi').value), nghe_nghiep: $('#suNN').value.trim(), muc_dich: $('#suMD').value.trim(),
      website: $('#suWeb').value };
    if (!body.ten || !body.email || !body.sdt || !body.mk || !body.nghe_nghiep || !body.muc_dich) return setGateMsg('err', t('au.needAll'));
    if (!(body.tuoi >= 12 && body.tuoi <= 100)) return setGateMsg('err', t('au.badAge'));
    if (body.mk.length < 8) return setGateMsg('err', t('au.shortPass'));
    busy(signupForm, true, t('au.signup'));
    try {
      const d = await callApi(API, body);
      if (d.cho) { setGateMsg('ok', t('au.pending')); return; }
      enter(d.token, d.me);
    } catch (err) { setGateMsg('err', err.message); }
    finally { busy(signupForm, false, t('au.signup')); }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#qmEmail').value.trim();
    if (!email) return setGateMsg('err', t('au.needEmail'));
    const buoc2 = !$('#qmStep2').hidden;
    busy(resetForm, true);
    try {
      if (!buoc2) {
        const d = await callApi(API, { action: 'quenmk', email });
        datBuoc(2);
        setGateMsg('ok', t('au.codeSent', { phut: d.phut || 15 }));
        $('#qmMa').focus();
        return;
      }
      const ma = $('#qmMa').value.trim(), mk = $('#qmPass').value;
      if (!ma) return setGateMsg('err', t('au.needCode'));
      if (mk.length < 8) return setGateMsg('err', t('au.shortPass'));
      const d = await callApi(API, { action: 'datlaimk', email, ma, mk });
      enter(d.token, d.me);
    } catch (err) {
      // Mã chết (hết hạn / sai quá nhiều) thì đưa về bước 1 để xin mã mới ngay, khỏi tải lại trang.
      if (err.code === 'ma_sai') datBuoc(1);
      setGateMsg(err.code === 'cho' ? 'warn' : 'err', err.message);
    } finally { busy(resetForm, false); }
  });

  // Lý do phải có tài khoản — đặt ngay đầu hộp để người dùng hiểu vì sao bị chặn giữa chừng.
  const vhy = h('p', { class: 'auth-why' });
  const phu = h('p', { class: 'auth-sub' }, t('au.welcome.sub'));
  const cu = $('#authDlg');
  const dlg = h('dialog', { class: 'authdlg', id: 'authDlg', 'aria-label': t('au.card.aria') },
    h('button', { type: 'button', class: 'icon-btn sm auth-x', 'aria-label': t('vw.close'), onclick: () => dlg.close() }, '✕'),
    h('section', { class: 'auth-card' },
      h('h2', {}, t('au.welcome')),
      phu,
      vhy,
      off ? h('p', { class: 'msg warn' }, t('au.off')) : null,
      tabs, loginForm, signupForm, resetForm, msg));
  if (cu) cu.replaceWith(dlg); else document.body.append(dlg);

  moHop = (nhan) => {
    vhy.textContent = nhan || '';
    vhy.hidden = !nhan;
    if (!dlg.open) dlg.showModal();
    $('#liEmail')?.focus();
  };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // bấm ra ngoài thì đóng
  return dlg;
}

const O_MAN = ['liEmail', 'liPass', 'suTen', 'suTuoi', 'suEmail', 'suSdt', 'suNN', 'suMD', 'suPass', 'qmEmail', 'qmMa', 'qmPass'];

/** Chụp lại những gì người dùng đang gõ dở trên màn đăng nhập (trước khi vẽ lại vì đổi ngôn ngữ). */
function chupMan() {
  const msg = $('#authDlg .auth-msg .msg');
  return {
    o: Object.fromEntries(O_MAN.map((id) => [id, $(`#${id}`)?.value || ''])),
    tab: $('#resetForm')?.hidden === false ? 'reset' : $('#signupForm')?.hidden === false ? 'signup' : 'login',
    buoc2: $('#qmStep2')?.hidden === false,
    msg: msg ? { kind: [...msg.classList].find((c) => c !== 'msg') || 'err', text: msg.textContent } : null,
  };
}

function datLaiMan(giu) {
  for (const [id, v] of Object.entries(giu.o)) { const el = $(`#${id}`); if (el && v) el.value = v; }
  if (giu.tab === 'signup') $('#tab-signup')?.click();
  if (giu.tab === 'reset') khoiPhucQuen(giu.buoc2);
  if (giu.msg) setGateMsg(giu.msg.kind, giu.msg.text);
}

// ─── Menu tài khoản trên đầu trang ────────────────────────

function renderAccount(ctx) {
  let last;
  return (s) => {
    if (s.user === last) return;
    const prev = last;
    last = s.user;
    const box = $('#acct');
    if (!s.user) { mount(box, h('button', { class: 'btn sm', type: 'button', onclick: () => openAuth('') }, t('au.signinUp'))); return; }
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
