// Đăng data.json lên repo qua GitHub API (Contents API). Không cần máy chủ: trình duyệt gọi thẳng api.github.com
// bằng token chủ trang tự tạo. GitHub Pages thấy commit mới thì tự dựng lại trang sau khoảng một phút.

import { utf8ToBase64, githubError } from './core.js';

const API = 'https://api.github.com';

export const DEFAULT_REPO = { owner: 'MinhToan8668', repo: 'elevaTO', branch: 'main', path: 'links/data.json' };

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
const enc = (s) => String(s).split('/').map(encodeURIComponent).join('/');
const contentsUrl = (r) => `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/contents/${enc(r.path)}`;

async function call(fetchFn, url, init) {
  let res;
  try { res = await fetchFn(url, init); } catch (e) { throw new Error(githubError(0)); }
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { status: res.status, ok: res.ok, body };
}

/** sha của file hiện có trên nhánh ('' nếu file chưa tồn tại). */
export async function currentSha(repo, token, fetchFn = fetch) {
  const r = await call(fetchFn, contentsUrl(repo) + '?ref=' + encodeURIComponent(repo.branch), { headers: headers(token), cache: 'no-store' });
  if (r.status === 404 && !(r.body && /resource not accessible/i.test(r.body.message || ''))) return '';
  if (!r.ok) throw new Error(githubError(r.status, r.body));
  return (r.body && r.body.sha) || '';
}

/** Kiểm tra token đọc được repo và nhánh — dùng cho nút "Kiểm tra kết nối". */
export async function checkAccess(repo, token, fetchFn = fetch) {
  // /user trả về tài khoản sở hữu token — để báo "token của @ai" và bắt lỗi 401 sớm, rõ ràng.
  const me = await call(fetchFn, `${API}/user`, { headers: headers(token) });
  if (!me.ok) throw new Error(githubError(me.status, me.body));
  const login = (me.body && me.body.login) || '';
  const r = await call(fetchFn, `${API}/repos/${enc(repo.owner)}/${enc(repo.repo)}/branches/${enc(repo.branch)}`, { headers: headers(token) });
  if (!r.ok) throw new Error(githubError(r.status, r.body));
  const meta = await call(fetchFn, `${API}/repos/${enc(repo.owner)}/${enc(repo.repo)}`, { headers: headers(token) });
  const canPush = Boolean(meta.body && meta.body.permissions && meta.body.permissions.push);
  return { login, canPush };
}

/** Ghi nội dung mới vào file. Gặp xung đột (có bản mới hơn) thì lấy sha mới và thử lại đúng một lần. */
export async function publish(repo, token, content, message, fetchFn = fetch) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sha = await currentSha(repo, token, fetchFn);
    const body = { message, content: utf8ToBase64(content), branch: repo.branch };
    if (sha) body.sha = sha;
    const r = await call(fetchFn, contentsUrl(repo), {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return { commit: r.body && r.body.commit ? r.body.commit.html_url : '' };
    if ((r.status === 409 || r.status === 422) && attempt === 0) continue;
    throw new Error(githubError(r.status, r.body));
  }
  throw new Error(githubError(409));
}
