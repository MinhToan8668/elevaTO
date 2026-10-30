// Cây chỉ tiêu BCTC: tính dòng tổng, kiểm tra số, chuẩn hoá dấu, quy đổi mã TT200 → TT99.
// Mọi số ở đây đã quy về ĐỒNG. Khoá dạng "BS:131", "IS:10", "CF:20".

import { CHART as CHART_DN } from '../chart2026.js';
import { CHART_TCTD } from '../chartTCTD.js';

// Cây doanh nghiệp (TT99) + cây ngân hàng (mã N…, xem chartTCTD.js): hai bộ mã không đụng nhau nên kiểm tra chung một lượt.
const CHART = [...CHART_DN, ...CHART_TCTD];
import { t } from '../i18n.js';

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
  cross('BS:280=440', best('BS:280'), best('BS:440'), t('ck.bsBalance'));
  if (opts.cashMatchesBS !== false) {
    cross('CF:70=BS:110', best('CF:70'), best('BS:110'), t('ck.cfCash'));
  }
  if (has(vals, 'BS:N300') || has(vals, 'BS:N600')) cross('BS:N300=N600', best('BS:N300'), best('BS:N600'), t('ck.bsBalance'));
  if (has(vals, 'CF:01') && best('IS:50') !== null) {
    cross('CF:01=IS:50', vals['CF:01'], best('IS:50'), t('ck.cfPbt'));
  }
  if (has(vals, 'IS:61') || has(vals, 'IS:62')) {
    cross('IS:60=61+62', best('IS:60'), (vals['IS:61'] || 0) + (vals['IS:62'] || 0), t('ck.isSplit'));
  }
  // Lỗi ở dòng sâu nhất lên trước: thường đó là chỗ AI đọc sai, các dòng cha chỉ lệch theo.
  return issues.sort((a, b) => (b.depth ?? -1) - (a.depth ?? -1));
}

// Trong tool, chi phí KQKD luôn lưu số DƯƠNG rồi trừ trong công thức (60 = 50 − 51 − 52).
// Mã 52 (thuế hoãn lại) nằm trong danh sách này vì nó có thể là khoản ĐƯỢC HOÀN — xem dưới.
const IS_EXPENSES = new Set(['02', '11', '23', '24', '25', '26', '32', '51', '52']);
// Dòng chắc chắn là chi phí, không bao giờ là khoản hoàn — dùng để đoán cách trình bày của báo cáo.
const CHAC_CHI_PHI = ['11', '25', '26'];

// Dòng TIỀN CHI của LCTT theo từng khối: phải mang dấu âm thì cộng thẳng mới ra dòng tổng.
// Mỗi mục: [mã dòng tổng, các mã trong khối, các mã là tiền chi]. Khối T… là phương pháp trực tiếp.
const CF_CHI = [
  ['30', ['21', '22', '23', '24', '25', '26', '27'], ['21', '23', '25']],
  ['40', ['31', '32', '33', '34', '35', '36'], ['32', '34', '35', '36']],
  ['20', ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17'], ['14', '15', '17']],
  ['T20', ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07'], ['T02', 'T03', 'T04', 'T05', 'T07']],
  ['T30', ['T21', 'T22', 'T23', 'T24', 'T25', 'T26', 'T27'], ['T21', 'T23', 'T25']],
  ['T40', ['T31', 'T32', 'T33', 'T34', 'T35', 'T36'], ['T32', 'T34', 'T35', 'T36']],
];

/**
 * Chi phí KQKD → dương; dòng có (*) trên CĐKT (dự phòng, hao mòn, cổ phiếu quỹ) → âm; dòng tiền chi LCTT → âm.
 *
 * Mỗi công ty có QUY ƯỚC TRÌNH BÀY RIÊNG và AI chỉ chép đúng dấu như in, nên máy phải tự đoán quy ước
 * bằng phép cộng dồn chứ không tin dấu của từng dòng:
 *   a) KQKD in chi phí trong ngoặc, ví dụ "(9.980.708.521.338)" — dấu in chính là phần đóng góp vào dòng
 *      tổng (10 + 11 = 20). Khi đó dòng chi phí in KHÔNG ngoặc là khoản ĐƯỢC HOÀN (hay gặp ở thuế hoãn lại,
 *      mã 52) và phải giữ dấu âm, nếu lấy trị tuyệt đối sẽ trừ nhầm hai lần.
 *   b) KQKD in chi phí số dương trơn (10 − 11 = 20) — lấy trị tuyệt đối cho chắc, vì AI đôi khi tự thêm dấu âm.
 *   Quy ước được quyết bằng "doanh thu thuần − giá vốn = lãi gộp" (hoặc thu nhập khác − chi phí khác = lợi
 *   nhuận khác); không có dòng tổng để thử thì mới nhìn dấu của các dòng chắc chắn là chi phí (11, 25, 26).
 *   Thuế TNDN (51/52) kiểm riêng: nhiều báo cáo in thuế ngược dấu với chi phí khác — thử cả hai chiều với
 *   50 − thuế = 60, chiều nào khớp thì theo.
 *   c) CĐKT: dự phòng / hao mòn / cổ phiếu quỹ in dương hay in ngoặc đều quy về ÂM (cộng thẳng ra dòng tổng).
 *   d) LCTT: dòng tiền chi in dương (không ngoặc) mà khối không cộng ra dòng tổng → đổi âm từng khối
 *      (thử đổi cả khối trước, không khớp thì thử từng dòng).
 *
 * @param fixes mảng để ghi lại chỗ đã đổi dấu: { kind: 'IS'|'TAX'|'BS'|'CF', codes: [...] } — hiện cho người dùng soát.
 * @param opts.unit đơn vị in trên BCTC (để tính sai số làm tròn khi thử cộng dồn)
 */
export function normalizeSigns(vals, fixes = null, opts = {}) {
  const unit = opts.unit || 1;
  const num = (k) => (typeof vals[k] === 'number' && Number.isFinite(vals[k]) ? vals[k] : null);
  const near = (a, b, n) => Math.abs(a - b) <= tolFor(unit, n);
  const ghi = (kind, codes) => { if (fixes && codes.length) fixes.push({ kind, codes }); };

  // KQKD: quy ước chi phí quyết bằng cộng dồn, không có dòng tổng thì theo dấu chi phí lớn.
  let trongNgoac = null;
  for (const [a, b, c] of [['IS:10', 'IS:11', 'IS:20'], ['IS:31', 'IS:32', 'IS:40']]) {
    const x = num(a), y = num(b), z = num(c);
    if (x === null || y === null || z === null || y === 0) continue;
    const duong = near(x - y, z, 2), ngoac = near(x + y, z, 2);
    if (duong !== ngoac) { trongNgoac = ngoac; break; }
  }
  if (trongNgoac === null) trongNgoac = CHAC_CHI_PHI.some((c) => num(`IS:${c}`) !== null && num(`IS:${c}`) < 0);

  const out = {};
  const daDoi = { IS: [], BS: [], TAX: [] };
  for (const [k, v] of Object.entries(vals)) {
    const [st, code] = k.split(':');
    const it = BY_KEY.get(k);
    if (typeof v !== 'number') { out[k] = v; continue; }
    if (st === 'IS' && IS_EXPENSES.has(code)) {
      out[k] = trongNgoac ? -v : Math.abs(v);
      // Báo cáo in chi phí dương mà riêng thuế in âm: thực chất là thuế ngược dấu (hay gặp), báo riêng cho rõ.
      if (out[k] !== v) (!trongNgoac && (code === '51' || code === '52') ? daDoi.TAX : daDoi.IS).push(code);
    }
    else if (st === 'BS' && it && it.label.includes('(*)')) { out[k] = -Math.abs(v); if (v > 0) daDoi.BS.push(code); }
    else out[k] = v;
  }
  ghi('IS', daDoi.IS);
  ghi('BS', daDoi.BS);
  ghi('TAX', daDoi.TAX);

  // Thuế TNDN: chọn dấu của 51 / 52 sao cho 60 = 50 − 51 − 52. Hay gặp: in thuế ngược dấu với chi phí khác, hoặc
  // chi phí in dương mà RIÊNG thuế hoãn lại in trong ngoặc vì là khoản được hoàn (HAX 2024: "(2.026.879.993)").
  const n50 = num('IS:50'), n60 = num('IS:60');
  const thue = ['51', '52'].filter((c) => typeof out[`IS:${c}`] === 'number' && out[`IS:${c}`] !== 0);
  if (n50 !== null && n60 !== null && thue.length) {
    const tru = (dau) => thue.reduce((s, c, i) => s + dau[i] * out[`IS:${c}`], 0);
    const khop = (dau) => near(n50 - tru(dau), n60, 3);
    if (!khop(thue.map(() => 1))) {
      // Ưu tiên đảo cả hai (in ngược dấu đồng loạt), rồi mới đảo riêng từng dòng.
      const thu = thue.length === 2 ? [[-1, -1], [1, -1], [-1, 1]] : [[-1]];
      const dau = thu.find(khop);
      if (dau) {
        const doi = thue.filter((c, i) => dau[i] === -1);
        for (const c of doi) out[`IS:${c}`] = -out[`IS:${c}`];
        ghi('TAX', doi);
      }
    }
  }

  // LCTT: từng khối, dòng tiền chi in dương mà khối không cộng ra tổng → đổi âm.
  const daDoiCF = [];
  for (const [tong, khoi, chi] of CF_CHI) {
    const L = typeof out[`CF:${tong}`] === 'number' ? out[`CF:${tong}`] : null;
    if (L === null) continue;
    const val = (c) => (typeof out[`CF:${c}`] === 'number' ? out[`CF:${c}`] : null);
    const cong = (lat) => khoi.reduce((s, c) => { const x = val(c); return x === null ? s : s + (lat.has(c) ? -x : x); }, 0);
    const n = khoi.filter((c) => val(c) !== null).length;
    if (!n || near(cong(new Set()), L, n)) continue;
    const ung = chi.filter((c) => val(c) !== null && val(c) > 0);
    if (!ung.length) continue;
    let chon = null;
    if (near(cong(new Set(ung)), L, n)) chon = ung;
    else for (const c of ung) { if (near(cong(new Set([c])), L, n)) { chon = [c]; break; } }
    if (chon) { for (const c of chon) out[`CF:${c}`] = -out[`CF:${c}`]; daDoiCF.push(...chon); }
  }
  ghi('CF', daDoiCF);
  return out;
}

/** Khoá TT99 tương ứng của một khoá TT200 ("BS:270" → "BS:280"); không có thì null. LCTT giữ nguyên. */
export function toTT99Key(k) {
  const st = k.split(':')[0];
  if (st === 'CF') return BY_KEY.has(k) ? k : null;
  return TT200.get(k) || null;
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
