// Đăng trang lên web. Cách chính: máy chủ elevaTO (Apps Script) với ADMIN_KEY lấy từ bot Telegram.
// Cách phụ: ghi thẳng links/data.json vào repo bằng token GitHub.

import { $, h, store, toast } from './dom.js';
import { serialize, cleanToken, tokenProblem } from './core.js';
import { field, toggle, panel } from './edit-ui.js';
import { ed, syncNow } from './edit-state.js';
import { DEFAULT_REPO, publish, checkAccess } from './github.js';
import { saveLinks, checkKey } from './backend.js';

const REPO_KEY = 'elevato-links-repo';
const TOKEN_KEY = 'elevato-links-token';
const ADMINKEY_KEY = 'elevato-links-adminkey';

const repoCfg = () => ({ ...DEFAULT_REPO, ...(store.get(REPO_KEY) || {}) });
// Mặc định key / token chỉ sống trong tab này (sessionStorage); "nhớ trên máy này" mới ghi vào localStorage.
const getToken = () => store.get(TOKEN_KEY, sessionStorage) || store.get(TOKEN_KEY) || '';
const getKey = () => store.get(ADMINKEY_KEY, sessionStorage) || store.get(ADMINKEY_KEY) || '';

function saveSecret(key, value, remember) {
  store.del(key);
  store.del(key, sessionStorage);
  if (!value) return;
  // Bộ nhớ đầy / chế độ riêng tư: nói ngay, không thì ô vẫn hiện key mà lúc bấm Đăng lại bảo "chưa có key".
  if (!store.set(key, value, remember ? localStorage : sessionStorage)) {
    toast('Trình duyệt không cho lưu — key / token chỉ dùng được cho lần đăng này.');
  }
}
const saveKey = (key, remember) => saveSecret(ADMINKEY_KEY, key, remember);
const saveToken = (token, remember) => saveSecret(TOKEN_KEY, token, remember);

const setStatus = (el, text, kind = '') => { el.textContent = text; el.className = 'gh-status ' + kind; };

/** Mục "Đăng lên web": cách chính là máy chủ elevaTO (Apps Script) với ADMIN_KEY; GitHub là cách phụ. */
export function publishPanel() {
  const keyInput = field('ADMIN_KEY', getKey(), (v) => saveKey(v.trim(), rememberKey.querySelector('input').checked),
    { type: 'password', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', wide: true });
  labelFor(keyInput, 'adminKeyInput');
  const rememberKey = toggle('Nhớ key trên máy này', Boolean(store.get(ADMINKEY_KEY)), (v) => saveKey(getKey(), v),
    'Tắt (khuyên dùng): key mất khi đóng tab. Key này cũng xem được danh sách đăng ký — chỉ bật trên máy riêng.');
  const st = h('p', { class: 'gh-status', id: 'keyStatus', role: 'status' });
  return panel('Đăng lên web', 'Lưu thẳng lên máy chủ elevaTO — trang đổi ngay', !getKey() && !getToken(),
    h('ol', { class: 'steps' },
      h('li', {}, 'Mở bot Telegram quản trị elevaTO, gõ ', h('b', {}, '/linkkey'), '.'),
      h('li', {}, 'Copy key bot gửi, dán vào ô dưới, bấm ', h('b', {}, 'Kiểm tra key'), '.'),
      h('li', {}, 'Bấm ', h('b', {}, 'Đăng lên web'), ' ở góc trên — trang link cập nhật ngay, không cần token GitHub.')),
    keyInput, rememberKey,
    h('div', { class: 'gh-row' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: testKey }, 'Kiểm tra key'),
      st),
    githubPanel());
}

/** Ô nhập do field() tạo chưa có id cố định — gắn id để nút "Đăng" biết đường đưa con trỏ về đây. */
function labelFor(fld, id) {
  fld.querySelector('input').id = id;
  fld.querySelector('label').setAttribute('for', id);
}

async function testKey() {
  const st = $('#keyStatus');
  const key = getKey();
  if (!key) { setStatus(st, 'Chưa có key — gõ /linkkey trong bot Telegram để lấy.', 'bad'); return; }
  setStatus(st, 'Đang kiểm tra…');
  try {
    await checkKey(key);
    setStatus(st, 'Key đúng ✓ — bấm “Đăng lên web” là trang cập nhật ngay.', 'ok');
  } catch (e) { setStatus(st, e.message, 'bad'); }
}

function githubPanel() {
  const r = repoCfg();
  const setRepo = (k) => (v) => store.set(REPO_KEY, { ...repoCfg(), [k]: v.trim() });
  const remembered = Boolean(store.get(TOKEN_KEY));
  const tokHint = h('small', { class: 'hint', id: 'tokenHint' });
  const showTokHint = (t) => {
    const problem = t ? tokenProblem(t) : '';
    tokHint.textContent = !t ? 'Dán token bắt đầu bằng github_pat_…' : problem || 'Đúng dạng token ✓ — bấm “Kiểm tra kết nối” để thử.';
    tokHint.className = 'hint ' + (!t ? '' : problem ? 'bad' : 'ok');
  };
  const tok = field('Token GitHub', getToken(), (v) => {
    const t = cleanToken(v);
    saveToken(t, remember.querySelector('input').checked);
    showTokHint(t);
  }, { type: 'password', placeholder: 'github_pat_…', wide: true });
  tok.append(tokHint);
  showTokHint(getToken());
  labelFor(tok, 'tokenInput');
  const remember = toggle('Nhớ token trên máy này', remembered, (v) => saveToken(getToken(), v),
    'Tắt (khuyên dùng): token mất khi đóng tab. Bật thì token nằm trong trình duyệt, mọi trang trên minhtoan8668.github.io đọc được — chỉ bật trên máy riêng và đặt hạn ngắn cho token.');
  const status = h('p', { class: 'gh-status', id: 'ghStatus', role: 'status' });
  return h('details', { class: 'sub', open: Boolean(getToken() && !getKey()) },
    h('summary', {}, 'Cách khác: đăng qua GitHub bằng token'),
    h('div', { class: 'p-body' },
      h('small', { class: 'hint block' }, 'Ghi thẳng file links/data.json trong repo; trang đổi sau khoảng 1 phút. Chỉ cần khi không dùng máy chủ elevaTO.'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Mở ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → tạo Fine-grained token'), '.'),
        h('li', {}, 'Repository access: ', h('b', {}, 'Only select repositories'), ' → chọn ', h('b', {}, r.repo), '.'),
        h('li', {}, 'Permissions → Repository → ', h('b', {}, 'Contents: Read and write'), '. Tạo token, copy dán vào dưới.')),
      tok, remember,
      h('div', { class: 'cols three' },
        field('Chủ repo', r.owner, setRepo('owner')),
        field('Repo', r.repo, setRepo('repo')),
        field('Nhánh', r.branch, setRepo('branch'))),
      h('div', { class: 'gh-row' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: testConnection }, 'Kiểm tra kết nối'),
        status)));
}

async function testConnection() {
  const st = $('#ghStatus');
  const token = getToken();
  const problem = tokenProblem(token);
  if (problem) { setStatus(st, problem, 'bad'); return; }
  setStatus(st, 'Đang kiểm tra…');
  const repo = repoCfg();
  try {
    const { login, canPush } = await checkAccess(repo, token);
    const who = login ? `Token của @${login}` : 'Token hợp lệ';
    let msg;
    if (canPush) {
      msg = `${who} · có quyền ghi vào ${repo.owner}/${repo.repo} ✓ — giờ bấm “Đăng lên web” được rồi.`;
    } else if (login && login.toLowerCase() !== repo.owner.toLowerCase()) {
      msg = `${who}, không phải chủ repo ${repo.owner}. Đăng nhập GitHub bằng tài khoản ${repo.owner} rồi tạo token (Resource owner = ${repo.owner}).`;
    } else {
      msg = `${who} nhưng chưa có quyền ghi — khi tạo token chọn repo ${repo.repo} và bật Contents: Read and write.`;
    }
    setStatus(st, msg, canPush ? 'ok' : 'bad');
  } catch (e) { setStatus(st, e.message, 'bad'); }
}

/** Mở mục "Đăng lên web" và đưa con trỏ vào ô còn thiếu. */
function openPublishPanel(focusId) {
  const pnl = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('#adminKeyInput'));
  if (pnl) { pnl.open = true; pnl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (focusId === 'tokenInput') { const sub = pnl && pnl.querySelector('details.sub'); if (sub) sub.open = true; }
  setTimeout(() => { const el = $('#' + focusId); if (el) el.focus(); }, 400);
}

export async function doPublish() {
  const key = getKey();
  const token = getToken();
  if (!key && (!token || tokenProblem(token))) {
    if (token) { toast(tokenProblem(token)); openPublishPanel('tokenInput'); return; }
    toast('Dán ADMIN_KEY ở mục "Đăng lên web" trước — lấy key bằng lệnh /linkkey trong bot Telegram.');
    openPublishPanel('adminKeyInput');
    return;
  }
  // Chặn lỡ tay đăng một trang trống đè lên trang thật (ví dụ khi data.json không tải được).
  if (!ed.draft.links.length && !confirm('Trang đang không có ô link nào. Vẫn đăng lên web?')) return;
  const btn = $('#publishBtn');
  btn.disabled = true;
  btn.textContent = 'Đang đăng…';
  const content = serialize(ed.draft);
  try {
    if (key) {
      await saveLinks(key, JSON.parse(content));
      toast('Đã lưu ✓ Trang link đã cập nhật — mở lại trang là thấy.', 3600);
    } else {
      await publish(repoCfg(), token, content, 'links: cập nhật trang link-in-bio');
      toast('Đã đăng ✓ Trang cập nhật sau khoảng 1 phút.', 3600);
    }
    ed.published = content;
    syncNow();          // lưu nốt lượt đang hoãn + cập nhật dòng "đang khớp với bản trên web"
  } catch (e) {
    toast(e.message, 3600);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đăng lên web';
  }
}
