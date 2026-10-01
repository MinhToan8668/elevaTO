import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publish, currentSha, checkAccess, DEFAULT_REPO } from '../js/github.js';

// fetch giả: trả lần lượt các phản hồi đã định, ghi lại mọi lời gọi.
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fn, calls };
}

test('publish: lấy sha hiện có rồi PUT nội dung base64 lên đúng nhánh', async () => {
  const { fn, calls } = fakeFetch([
    { status: 200, body: { sha: 'abc' } },
    { status: 200, body: { commit: { html_url: 'https://github.com/c/1' } } },
  ]);
  const res = await publish(DEFAULT_REPO, 'tok', '{"a":"Toàn"}\n', 'links: test', fn);
  assert.equal(res.commit, 'https://github.com/c/1');
  assert.equal(calls[0].url, 'https://api.github.com/repos/MinhToan8668/elevaTO/contents/links/data.json?ref=main');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[1].init.method, 'PUT');
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.sha, 'abc');
  assert.equal(body.branch, 'main');
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), '{"a":"Toàn"}\n');
});

test('publish: file chưa có (404) thì tạo mới, không gửi sha', async () => {
  const { fn, calls } = fakeFetch([{ status: 404, body: { message: 'Not Found' } }, { status: 201, body: {} }]);
  await publish(DEFAULT_REPO, 'tok', 'x', 'm', fn);
  assert.equal(JSON.parse(calls[1].init.body).sha, undefined);
});

test('publish: xung đột 409 thì lấy sha mới và thử lại đúng một lần', async () => {
  const { fn, calls } = fakeFetch([
    { status: 200, body: { sha: 'old' } }, { status: 409, body: {} },
    { status: 200, body: { sha: 'new' } }, { status: 200, body: {} },
  ]);
  await publish(DEFAULT_REPO, 'tok', 'x', 'm', fn);
  assert.equal(JSON.parse(calls[3].init.body).sha, 'new');
});

test('publish: token không đủ quyền → lỗi tiếng Việt, không thử lại', async () => {
  const { fn, calls } = fakeFetch([{ status: 200, body: { sha: 's' } }, { status: 403, body: { message: 'forbidden' } }]);
  await assert.rejects(publish(DEFAULT_REPO, 'tok', 'x', 'm', fn), /Contents: Read and write/);
  assert.equal(calls.length, 2);
});

test('currentSha: 404 vì token không được cấp repo không bị coi là "file chưa có"', async () => {
  const { fn } = fakeFetch([{ status: 404, body: { message: 'Resource not accessible by personal access token' } }]);
  await assert.rejects(currentSha(DEFAULT_REPO, 'tok', fn), /quyền ghi/);
});

test('mất mạng → báo kiểm tra mạng', async () => {
  const { fn } = fakeFetch([new TypeError('Failed to fetch')]);
  await assert.rejects(currentSha(DEFAULT_REPO, 'tok', fn), /mạng/);
});

test('checkAccess báo có quyền ghi hay không', async () => {
  const { fn } = fakeFetch([{ status: 200, body: {} }, { status: 200, body: { permissions: { push: false } } }]);
  assert.deepEqual(await checkAccess(DEFAULT_REPO, 'tok', fn), { canPush: false });
});
