import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnPeriods } from '../js/core/extract.js';
import { buildDataset, checkDataset } from '../js/core/dataset.js';
import { parseSession, serializeSession } from '../js/core/session.js';
import { gopYPrompt } from '../js/core/prompts.js';
import { docGopY, luuGopY } from '../js/core/gopy.js';

test('kỳ của từng cột theo tiêu đề cột: lũy kế, quý lẻ, quý liền trước cùng năm', () => {
  const k = columnPeriods({ tu_ngay_v: '2026-07-01', den_ngay_v: '2026-09-30', tu_ngay_p: '2026-04-01', den_ngay_p: '2026-06-30' });
  assert.equal(k.cur.id, 'Q3-2026');
  assert.equal(k.prev.id, 'Q2-2026', 'Quý II cùng năm, không phải cùng kỳ năm trước');
  const lk = columnPeriods({ tu_ngay_v: '01/01/2026', den_ngay_v: '30/09/2026', tu_ngay_p: '2025-01-01', den_ngay_p: '2025-09-30' });
  assert.deepEqual([lk.cur.id, lk.prev.id], ['9T-2026', '9T-2025']);
  assert.deepEqual(columnPeriods({}), { cur: null, prev: null }, 'thiếu ngày → để kỳ chung của file');
  assert.equal(columnPeriods({ tu_ngay_v: '2026-04-01', den_ngay_v: '2026-09-30' }).cur, null, '6 tháng không bắt đầu 01/01 → không nhận');
});

// BCTC quý 3/2026 kiểu BUS: KQKD lấy cột lũy kế 9 tháng, LCTT chỉ in "Quý III / Quý II" của năm nay.
const bus = () => ({
  id: 'b', kind: 'ext', ext: {
    file: 'BUS_Q3.pdf', company: 'Công ty TNHH Bus Thaco', units: {}, notes: {}, warnings: [],
    meta: { ngay_ket_thuc: '2026-09-30', so_thang: 9 },
    statements: {
      BS: { cur: { 'BS:280': 1000 }, prev: { 'BS:280': 900 } },
      IS: { cur: { 'IS:50': 291544 }, prev: { 'IS:50': 250000 } },
      CF: { cur: { 'CF:01': 27670 }, prev: { 'CF:01': 89730 },
        periods: columnPeriods({ tu_ngay_v: '2026-07-01', den_ngay_v: '2026-09-30', tu_ngay_p: '2026-04-01', den_ngay_p: '2026-06-30' }) },
    },
  },
});

test('LCTT quý in "Quý III / Quý II": số vào đúng Q3-2026 / Q2-2026, không còn báo lệch LNTT với KQKD 9 tháng', () => {
  const { ds } = buildDataset([bus()]);
  assert.equal(ds.values['Q3-2026']['CF:01'], 27670);
  assert.equal(ds.values['Q2-2026']['CF:01'], 89730);
  assert.equal(ds.values['9T-2026']['CF:01'], undefined, 'LCTT quý không bị đặt vào ô 9 tháng');
  assert.equal(ds.values['9T-2026']['IS:50'], 291544);
  const lech = Object.values(checkDataset(ds)).flat().filter((x) => /CF:01|LNTT|IS:50/.test(x.key || ''));
  assert.deepEqual(lech, []);
});

test('người dùng sửa tay ngày / số tháng của file → bỏ kỳ theo tiêu đề cột, dùng kỳ người dùng nhập', () => {
  const src = { ...bus(), meta: { ngay_ket_thuc: '2026-09-30', so_thang: 9 } };
  const { ds } = buildDataset([src]);
  assert.equal(ds.values['9T-2026']['CF:01'], 27670);
});

test('lưu phiên giữ kỳ của từng cột; kỳ lạ trong file phiên bị bỏ', () => {
  const s = { sources: [bus()], edits: [], ticks: null, unit: 1e6, segmentMap: {}, segmentNames: [], aiContext: {} };
  const back = parseSession(serializeSession(s));
  assert.equal(back.sources[0].ext.statements.CF.periods.prev.id, 'Q2-2026');
  const xau = JSON.parse(serializeSession(s));
  xau.data.sources[0].ext.statements.CF.periods = { cur: { id: '__proto__', year: 'x', months: 7, endMonth: 99 } };
  assert.equal(parseSession(JSON.stringify(xau)).sources[0].ext.statements.CF.periods, undefined);
});

test('góp ý: lưu trên máy, chỉ gửi kèm đúng bảng liên quan (cộng góp ý chung và về kỳ / cột)', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  luuGopY([{ text: 'LCTT in Quý III / Quý II cùng năm', vung: 'CF' }, { text: 'Cột lũy kế nằm bên phải', vung: 'KY' }, { text: '  ', vung: 'IS' }], st);
  const list = docGopY(st);
  assert.equal(list.length, 2, 'bỏ góp ý rỗng');
  assert.match(gopYPrompt(list, 'CF'), /Quý III \/ Quý II[\s\S]*lũy kế/);
  assert.doesNotMatch(gopYPrompt(list, 'IS'), /Quý III/, 'góp ý về LCTT không gửi cho KQKD');
  assert.match(gopYPrompt(list, 'IS'), /lũy kế/);
  assert.equal(gopYPrompt([], 'BS'), '');
});
