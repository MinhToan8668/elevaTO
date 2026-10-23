// AI nhận định: máy dựng bảng số gửi AI (không gửi BCTC), câu lệnh ép dùng đúng số, kết quả AI được lọc về
// đúng dạng giao diện cần dù AI trả thiếu / thừa / sai kiểu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAiReviewInput, aiReviewPrompt, sanitizeAiReview, aiReviewText, AI_REVIEW_SCHEMA, hashOf } from '../js/core/aireview.js';

const M = 1e6;
const KY = (id, year) => ({ id, year, months: 12, endMonth: 12 });
const nam = (o) => ({
  'BS:100': o.tsNH * M, 'BS:110': o.tien * M, 'BS:130': o.pt * M, 'BS:131': o.pt * M, 'BS:140': o.htk * M, 'BS:200': o.tsDH * M, 'BS:220': o.tsDH * M,
  'BS:280': o.ts * M, 'BS:300': o.no * M, 'BS:310': o.no * M, 'BS:311': (o.no - o.vay) * M, 'BS:321': o.vay * M, 'BS:400': o.vc * M, 'BS:440': o.ts * M,
  'IS:10': o.dt * M, 'IS:11': o.gv * M, 'IS:20': (o.dt - o.gv) * M, 'IS:24': o.lv * M, 'IS:26': o.cpq * M, 'IS:30': o.lntt * M, 'IS:50': o.lntt * M, 'IS:60': o.lnst * M,
  'CF:02': o.kh * M, 'CF:20': o.cfo * M, 'CF:21': -o.capex * M,
});
const ds = () => ({
  company: 'CTCP Thử Nghiệm',
  periods: [KY('FY2024', 2024), KY('FY2025', 2025)],
  values: {
    FY2024: nam({ tsNH: 600, tien: 150, pt: 150, htk: 200, tsDH: 400, ts: 1000, no: 400, vay: 100, vc: 600, dt: 1500, gv: 1050, lv: 15, cpq: 250, lntt: 190, lnst: 150, kh: 60, cfo: 200, capex: 80 }),
    FY2025: nam({ tsNH: 700, tien: 60, pt: 350, htk: 220, tsDH: 420, ts: 1120, no: 620, vay: 300, vc: 500, dt: 1400, gv: 1120, lv: 30, cpq: 240, lntt: -10, lnst: -20, kh: 65, cfo: -90, capex: 60 }),
  },
});

test('bảng số gửi AI: đúng kỳ, số theo tỷ đồng, 22 chỉ số có nhãn + mức, dấu hiệu và sức khoẻ máy đã chấm', () => {
  const b = buildAiReviewInput(ds());
  assert.ok(b);
  const i = b.input;
  assert.equal(i.company, 'CTCP Thử Nghiệm');
  assert.deepEqual(i.periods.map((p) => p.id), ['FY2024', 'FY2025']);
  assert.equal(i.latest, 'FY2025'); assert.equal(i.compared_with, 'FY2024');
  const rev = i.figures.find((f) => f.name === 'rev');
  assert.deepEqual(rev.values, [1.5, 1.4], 'doanh thu 1.500 / 1.400 triệu → 1,5 / 1,4 tỷ');
  assert.equal(i.figures.find((f) => f.name === 'capex').values[1], -0.06);
  assert.equal(i.ratios.length, 22);
  const de = i.ratios.find((r) => r.name === 'de');
  assert.equal(de.unit, 'lần'); assert.equal(de.values[1], 1.24); assert.ok(de.label && de.level);
  assert.ok(i.flags.some((f) => f.severity === 'cao'), 'lỗ + dòng tiền âm → có dấu hiệu mức cao');
  assert.ok(['Yếu', 'Rất yếu'].includes(i.health));
  assert.equal(i.sub_scores.length, 4);
  assert.ok(i.suggested_actions.length);
  assert.equal(buildAiReviewInput({ periods: [], values: {} }), null);
});

test('băm đổi khi số đổi, giữ nguyên khi chỉ vẽ lại', () => {
  const a = buildAiReviewInput(ds()).hash, b = buildAiReviewInput(ds()).hash;
  assert.equal(a, b);
  const d2 = ds(); d2.values.FY2025['IS:10'] = 1401 * M;
  assert.notEqual(buildAiReviewInput(d2).hash, a);
  assert.equal(hashOf('abc'), hashOf('abc'));
});

test('câu lệnh: dẫn JSON số liệu, nêu ngôn ngữ, khuôn bắt đủ 8 phần', () => {
  const b = buildAiReviewInput(ds());
  const p = aiReviewPrompt(b.input);
  assert.match(p, /TIẾNG VIỆT/);
  assert.ok(p.includes(JSON.stringify(b.input)));
  assert.match(aiReviewPrompt({ ...b.input, language: 'en' }), /ENGLISH/);
  assert.deepEqual(AI_REVIEW_SCHEMA.required, ['tong_quan', 'diem_manh', 'diem_yeu', 'xu_huong', 'rui_ro', 'de_xuat', 'cau_hoi', 'ket_luan']);
});

test('lọc kết quả AI: thiếu trường → rỗng, mức rủi ro lạ → tb, chuỗi dài bị cắt, mảng rác bỏ', () => {
  const r = sanitizeAiReview({ tong_quan: '  Ổn.  ', diem_manh: ['a', 7, ''], rui_ro: [{ tieu_de: 'Nợ', muc: 'rất cao', noi_dung: 'x' }, 'chuỗi trần'], cau_hoi: 'không phải mảng', ket_luan: 'k'.repeat(2000) });
  assert.equal(r.tong_quan, 'Ổn.');
  assert.deepEqual(r.diem_manh, ['a']);
  assert.deepEqual(r.diem_yeu, []); assert.deepEqual(r.cau_hoi, []);
  assert.deepEqual(r.rui_ro, [{ tieu_de: 'Nợ', muc: 'tb', noi_dung: 'x' }, { tieu_de: '', muc: 'tb', noi_dung: 'chuỗi trần' }]);
  assert.equal(r.ket_luan.length, 1200);
  assert.equal(sanitizeAiReview(null).tong_quan, '');
  const text = aiReviewText(r, { title: 'T', tong_quan: 'TQ', diem_manh: 'DM', diem_yeu: 'DY', xu_huong: 'XH', rui_ro: 'RR', de_xuat: 'DX', cau_hoi: 'CH', ket_luan: 'KL', muc: { cao: 'C', tb: 'TB', thap: 'T' } });
  assert.match(text, /^T\n\nTQ: Ổn\.\n\nDM:\n- a\n\nRR:\n- \[TB\] Nợ — x\n- \[TB\] chuỗi trần\n\nKL: k+$/);
});
