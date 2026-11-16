// Xin vé Tải thẳng phải chịu được Telegram nghẽn. Thực tế: Apps Script gọi getFile cho cả 27 phần
// một lượt, một phần trả "Gateway Timeout" là bỏ luôn cả lần tải — người dùng thấy
// "Telegram không cho đường dẫn phần 1 (Gateway Timeout)".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PATH = new URL('../backend/Code.gs', import.meta.url).pathname;

/**
 * Nạp Code.gs với UrlFetchApp giả. kichBan(file_id, lanHoi) trả { ma, body } cho từng lần hỏi
 * getFile của một phần (lanHoi đếm từ 1, riêng cho phần đó).
 */
function nap(kichBan) {
  const dot = [], ngu = [], dem = {};
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
    Utilities: { sleep: (ms) => ngu.push(ms) },
    Logger: { log() {} }, console: { error() {} },
    UrlFetchApp: {
      fetchAll: (ds) => {
        dot.push(ds.length);
        return ds.map((y) => {
          const fid = JSON.parse(y.payload).file_id;
          dem[fid] = (dem[fid] || 0) + 1;
          const { ma, body } = kichBan(fid, dem[fid]);
          return { getResponseCode: () => ma, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) };
        });
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(PATH, 'utf8'), ctx, { filename: PATH });
  return { ctx, dot, ngu, dem };
}

const OK = (fid) => ({ ma: 200, body: { ok: true, result: { file_path: `documents/${fid}.mp4` } } });
const IDS = Array.from({ length: 27 }, (_, i) => `f${i + 1}`);

test('hỏi theo từng đợt nhỏ, không dồn cả 27 phần vào một lượt', () => {
  const { ctx, dot } = nap(OK);
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong.length, 27);
  assert.ok(duong.every((d, i) => d === `documents/f${i + 1}.mp4`), 'đúng thứ tự từng phần');
  assert.ok(Math.max(...dot) <= 8, `đợt lớn nhất ${Math.max(...dot)} phần`);
});

test('Gateway Timeout ở một phần → hỏi lại phần đó ở vòng sau, vé vẫn đủ', () => {
  const { ctx, dem, ngu } = nap((fid, lan) => (fid === 'f1' && lan === 1
    ? { ma: 504, body: { ok: false, error_code: 504, description: 'Gateway Timeout' } } : OK(fid)));
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong[0], 'documents/f1.mp4');
  assert.equal(dem.f1, 2, 'chỉ hỏi lại đúng phần lỗi');
  assert.equal(dem.f2, 1);
  assert.deepEqual(ngu, [1500], 'chờ một chút trước khi hỏi lại');
});

test('trả về trang HTML lỗi (không phải JSON), 502, 429 có retry_after → đều coi là lỗi tạm', () => {
  const { ctx, ngu } = nap((fid, lan) => {
    if (lan > 1) return OK(fid);
    if (fid === 'f1') return { ma: 502, body: '<html>Bad Gateway</html>' };
    if (fid === 'f2') return { ma: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7 } } };
    return OK(fid);
  });
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong[0], 'documents/f1.mp4');
  assert.equal(duong[1], 'documents/f2.mp4');
  assert.deepEqual(ngu, [7000], 'Telegram bảo chờ 7 giây thì chờ đúng 7 giây');
});

test('lỗi THẬT (file_id sai) thì báo ngay, không chờ không thử lại', () => {
  const { ctx, ngu } = nap((fid) => (fid === 'f3'
    ? { ma: 400, body: { ok: false, error_code: 400, description: 'Bad Request: wrong file_id' } } : OK(fid)));
  assert.throws(() => ctx.xinDuongDan('tok', IDS), /phần 3 \(Bad Request: wrong file_id\)/);
  assert.deepEqual(ngu, []);
});

test('nghẽn mãi không hết → để trống phần đó cho Worker tự xin bù, KHÔNG bỏ cả lần tải', () => {
  const { ctx, dem, ngu } = nap((fid) => (fid === 'f5'
    ? { ma: 504, body: { ok: false, error_code: 504, description: 'Gateway Timeout' } } : OK(fid)));
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.equal(duong[4], '');
  assert.equal(duong.filter(Boolean).length, 26);
  assert.equal(dem.f5, 4, 'hỏi tối đa 4 vòng');
  assert.deepEqual(ngu, [1500, 3000, 4500], 'chờ tăng dần, không chờ thừa sau vòng cuối');
});

test('cả đợt mất kết nối (fetchAll ném lỗi) → hỏi lại cả đợt ở vòng sau', () => {
  let lanGoi = 0;
  const { ctx } = nap(OK);
  const that = ctx.UrlFetchApp.fetchAll;
  ctx.UrlFetchApp.fetchAll = (ds) => { if (++lanGoi === 1) throw new Error('Address unavailable'); return that(ds); };
  const duong = ctx.xinDuongDan('tok', IDS);
  assert.ok(duong.every(Boolean));
});
