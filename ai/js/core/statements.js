// Cây chỉ tiêu BCTC: tính dòng tổng, kiểm tra số, chuẩn hoá dấu, quy đổi mã TT200 → TT99.
// Mọi số ở đây đã quy về ĐỒNG. Khoá dạng "BS:131", "IS:10", "CF:20".

import { CHART } from '../chart2026.js';

const BY_KEY = new Map(CHART.map((i) => [`${i.st}:${i.code}`, i]));
const TT200 = new Map();                 // "BS:270" (mã cũ) → "BS:280" (mã mới)
for (const i of CHART) if (i.tt200 && i.st !== 'CF') TT200.set(`${i.st}:${i.tt200}`, `${i.st}:${i.code}`);

export function item(st, code) { return BY_KEY.get(`${st}:${code}`) || null; }
export const keyOf = (i) => `${i.st}:${i.code}`;

const has = (vals, k) => typeof vals[k] === 'number' && Number.isFinite(vals[k]);

/**
 * Giá trị "tốt nhất" của một dòng: số in trên BCTC nếu có, không thì cộng từ dòng con.
 * computedOnly = true: với dòng tổng, luôn cộng từ con (dùng để kiểm tra), trừ khi không có
 * dòng con nào — lúc đó coi dòng tổng như một dòng chi tiết.
 * Trả { v, leaves } hoặc null nếu không có số nào bên dưới.
 */
function evalKey(vals, k, computedOnly, memo) {
  const memoKey = k + (computedOnly ? '#c' : '#b');
  if (memo.has(memoKey)) return memo.get(memoKey);
  const it = BY_KEY.get(k);
  let out = null;
  if (it && it.sum && (computedOnly || !has(vals, k))) {
    let v = 0, leaves = 0, any = false;
    for (const [code, sign] of it.sum) {
      const c = evalKey(vals, `${it.st}:${code}`, false, memo);
      if (c) { v += sign * c.v; leaves += c.leaves; any = true; }
    }
    if (any) out = { v, leaves };
  }
  if (!out && has(vals, k)) out = { v: vals[k], leaves: 1 };
  memo.set(memoKey, out);
  return out;
}

/** Bản sao có thêm mọi dòng tổng còn thiếu (giữ nguyên số đã in). */
export function computeTotals(vals) {
  const out = { ...vals }, memo = new Map();
  for (const it of CHART) {
    if (!it.sum) continue;
    const k = keyOf(it);
    if (has(out, k)) continue;
    const r = evalKey(vals, k, false, memo);
    if (r) out[k] = r.v;
  }
  return out;
}

// Sai số cho phép: mỗi số in trên BCTC làm tròn tới 1 đơn vị (đồng / nghìn / triệu),
// cộng n số thì lệch tối đa n/2 đơn vị.
// Ngưỡng bỏ qua chênh lệch — chỉ hai nguồn nhiễu chính đáng, không phải AI đọc sai:
//   - làm tròn theo đơn vị báo cáo (nghìn / triệu đồng),
//   - BCTC in bằng đồng vẫn hay lệch vài trăm đồng giữa dòng tổng và các dòng con
//     (gặp thật ở BCTC hợp nhất VHC 2024: LCTT từ HĐTC lệch đúng 1.000 đồng).
// Không dùng ngưỡng theo tỷ lệ: trên một dòng 500 tỷ, một phần triệu đã là 500 nghìn —
// đủ để giấu một lỗi đọc số thật.
const TOL_DONG = 1000;
const tolFor = (unit, leaves) => Math.max(Math.max(1, unit) * Math.max(2, Math.ceil(leaves / 2)), TOL_DONG);

/**
 * Kiểm tra một kỳ. Trả danh sách lệch (rỗng = sạch), mỗi mục:
 *   { key, kind: 'sum'|'cross', reported, computed, diff, label }
 * opts.unit: đơn vị in trên BCTC (1, 1e3, 1e6) để tính sai số làm tròn.
 * opts.cashMatchesBS: false khi LCTT và CĐKT không cùng ngày (khi đó bỏ đối chiếu tiền cuối kỳ).
 */
export function validate(vals, opts = {}) {
  const unit = opts.unit || 1;
  const memo = new Map();
  const issues = [];
  for (const it of CHART) {
    if (!it.sum) continue;
    const k = keyOf(it);
    if (!has(vals, k)) continue;
    const c = evalKey(vals, k, true, memo);
    if (!c || c.leaves === 1 && !it.sum.some(([code]) => evalKey(vals, `${it.st}:${code}`, false, memo))) continue;
    const diff = vals[k] - c.v;
    if (Math.abs(diff) > tolFor(unit, c.leaves)) {
      issues.push({ key: k, kind: 'sum', reported: vals[k], computed: c.v, diff, label: it.label, depth: it.lvl });
    }
  }

  const best = (k) => { const r = evalKey(vals, k, false, memo); return r ? r.v : null; };
  const cross = (key, a, b, label) => {
    if (a === null || b === null) return;
    const diff = a - b;
    if (Math.abs(diff) > tolFor(unit, 4)) issues.push({ key, kind: 'cross', reported: a, computed: b, diff, label });
  };
  cross('BS:280=440', best('BS:280'), best('BS:440'), 'Tổng tài sản ≠ tổng nguồn vốn');
  if (opts.cashMatchesBS !== false) {
    cross('CF:70=BS:110', best('CF:70'), best('BS:110'), 'Tiền cuối kỳ trên LCTT ≠ tiền trên CĐKT');
  }
  if (has(vals, 'CF:01') && best('IS:50') !== null) {
    cross('CF:01=IS:50', vals['CF:01'], best('IS:50'), 'LNTT trên LCTT ≠ LNTT trên KQKD');
  }
  if (has(vals, 'IS:61') || has(vals, 'IS:62')) {
    cross('IS:60=61+62', best('IS:60'), (vals['IS:61'] || 0) + (vals['IS:62'] || 0), 'LNST ≠ phần công ty mẹ + cổ đông không kiểm soát');
  }
  // Lỗi ở dòng sâu nhất lên trước: thường đó là chỗ AI đọc sai, các dòng cha chỉ lệch theo.
  return issues.sort((a, b) => (b.depth ?? -1) - (a.depth ?? -1));
}

// Trong tool, chi phí KQKD luôn lưu số DƯƠNG rồi trừ trong công thức (60 = 50 − 51 − 52).
// Mã 52 (thuế hoãn lại) nằm trong danh sách này vì nó có thể là khoản ĐƯỢC HOÀN — xem dưới.
const IS_EXPENSES = new Set(['02', '11', '23', '24', '25', '26', '32', '51', '52']);
// Dòng chắc chắn là chi phí, không bao giờ là khoản hoàn — dùng để đoán cách trình bày của báo cáo.
const CHAC_CHI_PHI = ['11', '25', '26'];

/**
 * Chi phí KQKD → dương; dòng có (*) trên CĐKT (dự phòng, hao mòn, cổ phiếu quỹ) → âm; LCTT giữ nguyên.
 *
 * BCTC Việt Nam có hai lối trình bày chi phí, phải phân biệt mới ra đúng số:
 *   a) In trong ngoặc, ví dụ "(9.980.708.521.338)" — dấu in chính là phần đóng góp vào dòng tổng.
 *      Khi đó dòng chi phí in KHÔNG ngoặc là khoản ĐƯỢC HOÀN (hay gặp ở thuế hoãn lại, mã 52)
 *      và phải giữ dấu âm, nếu lấy trị tuyệt đối sẽ trừ nhầm hai lần.
 *   b) In số dương trơn — lấy trị tuyệt đối cho chắc, vì AI đôi khi tự thêm dấu âm.
 */
export function normalizeSigns(vals) {
  const trongNgoac = CHAC_CHI_PHI.some((c) => typeof vals[`IS:${c}`] === 'number' && vals[`IS:${c}`] < 0);
  const out = {};
  for (const [k, v] of Object.entries(vals)) {
    const [st, code] = k.split(':');
    const it = BY_KEY.get(k);
    if (typeof v !== 'number') { out[k] = v; continue; }
    if (st === 'IS' && IS_EXPENSES.has(code)) out[k] = trongNgoac ? -v : Math.abs(v);
    else if (st === 'BS' && it && it.label.includes('(*)')) out[k] = -Math.abs(v);
    else out[k] = v;
  }
  return out;
}

/** Đổi khoá mã TT200 sang TT99. LCTT giữ nguyên mã. Trả { values, unmapped }. */
export function fromTT200(vals) {
  const values = {}, unmapped = [];
  for (const [k, v] of Object.entries(vals)) {
    const st = k.split(':')[0];
    const to = st === 'CF' ? k : TT200.get(k);
    if (to && BY_KEY.has(to)) values[to] = v;
    else unmapped.push(k);
  }
  return { values, unmapped };
}

/** 'TT99' | 'TT200' | null, đoán theo các mã có mặt. */
export function detectRegime(vals) {
  if (has(vals, 'BS:280') || has(vals, 'IS:27')) return 'TT99';
  if (has(vals, 'BS:421')) return 'TT200';
  if (has(vals, 'BS:270') && has(vals, 'BS:100') && has(vals, 'BS:200')) {
    const tt200 = Math.abs(vals['BS:270'] - vals['BS:100'] - vals['BS:200']) <= Math.abs(vals['BS:270']) * 1e-6 + 2;
    return tt200 ? 'TT200' : 'TT99';
  }
  return null;
}
