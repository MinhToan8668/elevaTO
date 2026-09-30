import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeSession, parseSession } from '../js/core/session.js';

const state = {
  sources: [
    { id: 's1', jobId: 'j1', kind: 'ext', meta: { ngay_ket_thuc: '2025-12-31' }, ext: { file: 'a.pdf', company: 'ABC', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, statements: { IS: { cur: { 'IS:10': 5, 'CF:T01': 1 }, prev: {} } }, units: { IS: 1e6 }, notes: { segments: [{ name: 'A', revenue: 5 }] }, warnings: ['w'] } },
    { id: 's2', kind: 'period', file: 'b.xlsx', period: { id: 'FY2024', year: 2024, months: 12, endMonth: 12 }, values: { 'BS:111': 3 } },
  ],
  edits: [{ period: 'FY2025', key: 'IS:10', v: 6 }],
  ticks: ['IS:10'], unit: 1e6, segmentMap: { A: 1 }, segmentNames: ['Bán lẻ', '', '', '', ''], noteGroups: ['segments'], preset: 'custom',
  jobs: [{ id: 'j1' }], conn: { code: 'BÍ MẬT' },
};

test('lưu phiên → mở lại: giữ nguồn, số sửa tay, lựa chọn; KHÔNG lưu mã truy cập / file', () => {
  const txt = serializeSession(state);
  assert.ok(!txt.includes('BÍ MẬT'));
  const s = parseSession(txt);
  assert.deepEqual(s.sources, state.sources);
  assert.deepEqual(s.edits, state.edits);
  assert.deepEqual(s.ticks, ['IS:10']);
  assert.deepEqual(s.segmentMap, { A: 1 });
  assert.equal(s.unit, 1e6);
  assert.equal(s.jobs, undefined);
});

test('file phiên lạ / bị sửa: bỏ khoá độc hại và số không hợp lệ, không làm hỏng Object.prototype', () => {
  const file = JSON.parse(serializeSession(state));
  const bad = file.data;
  bad.sources[1].values = JSON.parse('{"__proto__": {"polluted": 1}, "BS:111": "9", "BS:112": 4, "<img>": 1}');
  bad.sources[0].ext.statements.IS.cur['constructor'] = 1;
  bad.edits.push({ period: 'FY2025', key: 'IS:10', v: 'x' }, { period: '__proto__', key: 'IS:11', v: 1 });
  bad.unit = 7;
  bad.segmentMap = { A: 9, B: 2 };
  const s = parseSession(JSON.stringify(file));
  assert.deepEqual(s.sources[1].values, { 'BS:112': 4 });
  assert.deepEqual(Object.keys(s.sources[0].ext.statements.IS.cur).sort(), ['CF:T01', 'IS:10']);
  assert.equal(s.edits.length, 1);
  assert.equal(s.unit, 1e6);
  assert.deepEqual(s.segmentMap, { B: 2 });
  assert.equal({}.polluted, undefined);
});

test('không phải file phiên elevaTO → báo lỗi rõ', () => {
  assert.throws(() => parseSession('{"a":1}'), /không phải file phiên/);
  assert.throws(() => parseSession('not json'), /không phải file phiên/);
});
