import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, get, preview, ICON_SETS } from '../js/iconify.js';

const reply = (status, body, text) => async () => ({ ok: status < 300, status, json: async () => body, text: async () => text });

test('search: chỉ hỏi các bộ icon nhiều màu, lọc id lạ', async () => {
  let asked = '';
  const ids = await search('money bag', async (url) => {
    asked = url;
    return reply(200, { icons: ['noto:money-bag', 'bad id', 'x:<script>'] })();
  });
  assert.deepEqual(ids, ['noto:money-bag']);
  assert.match(asked, /query=money%20bag/);
  assert.match(asked, new RegExp('prefixes=' + ICON_SETS.join(',')));
});

test('get: SVG hợp lệ → data URL base64; thứ không phải SVG bị từ chối', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
  const url = await get('noto:coin', reply(200, null, svg));
  assert.equal(Buffer.from(url.split(',')[1], 'base64').toString(), svg);
  assert.match(url, /^data:image\/svg\+xml;base64,/);
  await assert.rejects(get('noto:coin', reply(200, null, '<html>')), /không dùng được/);
  await assert.rejects(get('../evil', reply(200, null, svg)), /không hợp lệ/);
  await assert.rejects(get('noto:coin', async () => { throw new TypeError('offline'); }), /Thử lại/);
});

test('preview trỏ đúng file SVG của Iconify', () => {
  assert.equal(preview('fluent-emoji-flat:robot'), 'https://api.iconify.design/fluent-emoji-flat/robot.svg');
});
