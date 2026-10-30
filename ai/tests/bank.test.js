// BCTC ngân hàng (mẫu B02/B03/B04-TCTD). Dữ liệu: lời đáp THẬT của Gemini khi đọc BCTC hợp nhất VCB 2025
// (tests/fixtures/bctc/VCB_…pdf, trang 8–9, 11–12, 13–14) — chép nguyên, kể cả chỗ AI để STT ở cột mã.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statementToValues } from '../js/core/extract.js';
import { isBankStatement } from '../js/core/bank.js';
import { validate } from '../js/core/statements.js';
import { CHART_TCTD } from '../js/chartTCTD.js';

const VCB = JSON.parse(readFileSync(new URL('./fixtures/vcb-2025-ai.json', import.meta.url)));
const M = 1e6;

test('nhận ra mẫu ngân hàng theo tên dòng, không nhầm với BCTC doanh nghiệp', () => {
  for (const st of ['BS', 'IS', 'CF']) assert.ok(isBankStatement(VCB[st].items), st);
  assert.ok(!isBankStatement([{ c: '100', n: 'A. Tài sản ngắn hạn' }, { c: '131', n: 'Phải thu ngắn hạn của khách hàng' }]));
});

test('VCB 2025 — CĐKT: đủ dòng, đúng mục cha, cộng dồn khớp hết', () => {
  const r = statementToValues('BS', VCB.BS);
  assert.equal(r.regime, 'TCTD');
  assert.equal(r.unit, 1e6);
  assert.equal(r.cur['BS:N300'], 2442279166 * M);
  assert.equal(r.cur['BS:N600'], 2442279166 * M);
  assert.equal(r.cur['BS:N162'], -24975679 * M, '"Dự phòng rủi ro cho vay khách hàng" vào đúng mục VI');
  assert.equal(r.prev['BS:N133'], -1000000 * M, '"Dự phòng rủi ro" trơn nằm dưới mục III');
  assert.equal(r.cur['BS:N203'], -10653087 * M, '"Khấu hao TSCĐ" (dòng b của TSCĐ hữu hình) là hao mòn');
  assert.equal(r.cur['BS:N208'], 5284812 * M, 'nguyên giá thứ hai thuộc TSCĐ vô hình');
  assert.equal(r.cur['BS:N500'], 224558726 * M, 'đề mục "VIII. Vốn chủ sở hữu" không số không chiếm chỗ dòng TỔNG');
  assert.equal(r.cur['BS:N450'], 87822642 * M, 'dòng a/b "lợi nhuận để lại" không đè dòng LNCPP');
  for (const side of ['cur', 'prev']) assert.deepEqual(validate(r[side], { unit: r.unit }), [], side);
});

test('VCB 2025 — KQKD: chi phí in ngoặc quy về dương, thuế hoãn lại đúng chiều, cộng dồn khớp', () => {
  const r = statementToValues('IS', VCB.IS);
  assert.equal(r.cur['IS:N02'], 46445074 * M);
  assert.equal(r.cur['IS:N91'], 3192186 * M);
  assert.equal(r.cur['IS:N08'], 978700 * M, 'năm nay thuế hoãn lại là chi phí');
  assert.equal(r.prev['IS:N08'], -143478 * M, 'năm trước là khoản được hoàn');
  assert.equal(r.cur['IS:N120'], 35197940 * M);
  for (const side of ['cur', 'prev']) assert.deepEqual(validate(r[side], { unit: r.unit }), [], side);
});

test('VCB 2025 — LCTT trực tiếp: dòng 01–22, đầu tư, tài chính và tiền cuối kỳ cộng khớp', () => {
  const r = statementToValues('CF', VCB.CF);
  assert.equal(r.cur['CF:N09'], 38419635 * M);
  assert.equal(r.cur['CF:N17'], -2952444 * M, '"Tài sản hoạt động khác" không bị đề mục "(Tăng)/giảm về tài sản hoạt động" chiếm');
  assert.equal(r.cur['CF:N25'], -641807 * M);
  assert.equal(r.cur['CF:NF4'], -3776798 * M);
  assert.equal(r.cur['CF:N70'], 541688802 * M);
  for (const side of ['cur', 'prev']) assert.deepEqual(validate(r[side], { unit: r.unit }), [], side);
});

test('danh mục ngân hàng: mã không trùng, mọi dòng con của công thức đều có thật, mọi dòng có tên tiếng Anh', () => {
  const keys = new Set();
  for (const i of CHART_TCTD) {
    const k = `${i.st}:${i.code}`;
    assert.ok(!keys.has(k), `trùng ${k}`);
    keys.add(k);
    assert.ok(i.en, k);
  }
  for (const i of CHART_TCTD) for (const [c] of i.sum || []) assert.ok(keys.has(`${i.st}:${c}`), `${i.code} → ${c}`);
});
