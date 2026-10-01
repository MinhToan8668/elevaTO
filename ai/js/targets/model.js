// Đổ số BCTC (mã TT99, đơn vị đồng) vào sheet "03.Input_FS" của model elevaTO.
//
// Quy ước của model (xem hàng 2 & 7 của sheet): đơn vị TRIỆU đồng, chi phí KQKD nhập số ÂM,
// dòng (*) trên CĐKT âm, LCTT giữ dấu như BCTC. Chỉ ghi dòng nhập tay — dòng tổng là công thức.
// Mọi dòng BCTC phải có chỗ đứng trong model, nếu không dòng CHECK 93 (cân đối) sẽ lệch;
// dòng 48 KHÔNG được ghi vì 07.BS không đọc nó.
//
// Mỗi ô trả kèm nguồn: bctc | tm (thuyết minh) | lctt (suy từ LCTT) | uoc (số tạm, cần bổ sung) | md (mặc định).

import { computeTotals } from '../core/statements.js';
import { t } from '../i18n.js';

const M = 1e6;

// Nhóm TSCĐ trong model: dòng đầu mỗi khối; +0 nguyên giá, +1 hao mòn LK, +2 tăng trong năm, +3 khấu hao năm.
export const FA_CLASSES = [
  { cls: 'buildings', row: 150, label: 'Nhà cửa, vật kiến trúc', kind: 'tangible' },
  { cls: 'machinery', row: 155, label: 'Máy móc, thiết bị', kind: 'tangible' },
  { cls: 'transport', row: 160, label: 'Phương tiện vận tải', kind: 'tangible' },
  { cls: 'office', row: 165, label: 'Thiết bị, dụng cụ quản lý', kind: 'tangible' },
  { cls: 'other', row: 170, label: 'TSCĐ hữu hình khác (gồm thuê tài chính)', kind: 'tangible' },
  { cls: 'land', row: 175, label: 'Quyền sử dụng đất', kind: 'intangible' },
  { cls: 'software', row: 180, label: 'Phần mềm & TSCĐ vô hình khác', kind: 'intangible' },
];
const GOODWILL_ROW = 185;
export const SEGMENT_SLOTS = 5;              // dòng 132–136 (doanh thu), 140–144 (LN gộp)

// Định nghĩa dòng: dùng cho giao diện (nhãn, nhóm) và để kiểm tra không sót / trùng dòng.
export const MODEL_ROWS = [
  ...[[8, 'Doanh thu thuần'], [9, 'Giá vốn hàng bán (−)'], [12, 'Doanh thu tài chính'], [13, 'Chi phí lãi vay (−)'],
    [14, 'Chi phí tài chính khác (−)'], [16, 'Lãi/lỗ công ty liên doanh, liên kết'], [17, 'Chi phí bán hàng (−)'],
    [18, 'Chi phí quản lý doanh nghiệp (−)'], [20, 'Thu nhập khác (gồm lãi BĐSĐT)'], [21, 'Chi phí khác (−)'],
    [23, 'Thuế TNDN hiện hành (−)'], [24, 'Thuế TNDN hoãn lại'], [27, 'LNST của cổ đông không kiểm soát']]
    .map(([row, label]) => ({ row, label, group: 'KQKD' })),
  ...[[32, 'Tiền'], [33, 'Các khoản tương đương tiền'], [34, 'Đầu tư tài chính ngắn hạn'], [36, 'Phải thu khách hàng NH'],
    [37, 'Trả trước cho người bán NH'], [38, 'Phải thu về cho vay NH'], [39, 'Phải thu NH khác (+ TS ngắn hạn khác)'],
    [40, 'Dự phòng phải thu NH khó đòi (−)'], [42, 'Hàng tồn kho'], [43, 'Dự phòng giảm giá HTK (−)'],
    [45, 'Chi phí trả trước NH'], [46, 'Thuế GTGT được khấu trừ'], [47, 'Thuế phải thu Nhà nước'],
    [52, 'Phải thu dài hạn'], [54, 'TSCĐ hữu hình — nguyên giá (gồm thuê TC)'], [55, 'TSCĐ hữu hình — hao mòn (−)'],
    [57, 'TSCĐ vô hình — nguyên giá'], [58, 'TSCĐ vô hình — hao mòn (−)'], [59, 'Tài sản dở dang dài hạn'],
    [60, 'Đầu tư vào công ty LD, LK'], [61, 'Đầu tư tài chính dài hạn khác'], [62, 'Chi phí trả trước DH'],
    [63, 'Tài sản thuế TN hoãn lại'], [64, 'TS dài hạn khác (+ BĐSĐT, TS sinh học)'], [65, 'Lợi thế thương mại'],
    [71, 'Phải trả người bán NH'], [72, 'Người mua trả tiền trước NH'], [73, 'Thuế phải nộp Nhà nước'],
    [74, 'Phải trả người lao động'], [75, 'Chi phí phải trả NH'], [76, 'Doanh thu chưa thực hiện NH'],
    [77, 'Phải trả khác (+ cổ tức, dự phòng, quỹ KTPL…)'], [78, 'Vay và nợ thuê TC ngắn hạn'],
    [80, 'Vay và nợ thuê TC dài hạn'], [81, 'Thuế TN hoãn lại phải trả'], [82, 'Nợ dài hạn khác'],
    [85, 'Vốn góp của chủ sở hữu'], [86, 'Thặng dư vốn cổ phần'], [87, 'Cổ phiếu quỹ (−)'],
    [88, 'Quỹ đầu tư phát triển (+ vốn khác, quỹ khác)'], [89, 'LNST chưa phân phối'], [90, 'Lợi ích cổ đông không kiểm soát']]
    .map(([row, label]) => ({ row, label, group: 'CĐKT' })),
  ...[[98, 'Khấu hao TSCĐ'], [99, 'Các khoản dự phòng'], [100, '(Lãi) từ công ty LD, LK'], [101, 'Chi phí lãi vay'],
    [103, 'Biến động phải thu'], [104, 'Biến động hàng tồn kho'], [105, 'Biến động phải trả'], [106, 'Biến động chi phí trả trước'],
    [107, 'Tiền lãi vay đã trả'], [108, 'Thuế TNDN đã nộp'], [109, 'Thu/chi khác từ HĐKD (dòng cân)'],
    [112, 'Mua sắm TSCĐ (capex)'], [113, 'Thanh lý TSCĐ'], [114, 'Đầu tư góp vốn vào đơn vị khác'], [115, 'Thu/chi đầu tư khác (dòng cân)'],
    [118, 'Phát hành cổ phiếu'], [119, 'Mua lại cổ phiếu'], [122, 'Cổ tức đã trả'], [123, 'Thu/chi tài chính khác (dòng cân)'],
    [126, 'Tiền đầu kỳ'], [127, 'Ảnh hưởng tỷ giá']]
    .map(([row, label]) => ({ row, label, group: 'LCTT' })),
  ...Array.from({ length: SEGMENT_SLOTS }, (_, i) => ({ row: 132 + i, label: `Doanh thu mảng ${i + 1}`, group: 'Mảng' })),
  ...Array.from({ length: SEGMENT_SLOTS }, (_, i) => ({ row: 140 + i, label: `LN gộp mảng ${i + 1}`, group: 'Mảng' })),
  ...[...FA_CLASSES, { row: GOODWILL_ROW, label: 'Lợi thế thương mại' }].flatMap((c) => [
    { row: c.row, label: `${c.label} — nguyên giá`, group: 'TSCĐ' },
    { row: c.row + 1, label: `${c.label} — hao mòn LK (−)`, group: 'TSCĐ' },
    { row: c.row + 2, label: `${c.label} — tăng trong năm`, group: 'TSCĐ' },
    { row: c.row + 3, label: `${c.label} — khấu hao năm (−)`, group: 'TSCĐ' },
  ]),
  ...[[191, 'Vốn góp — phát hành thường'], [192, 'Vốn góp — cổ phiếu thưởng'], [193, 'Vốn góp — ESOP'],
    [194, 'Vốn góp — cổ tức bằng cổ phiếu'], [195, 'Vốn góp — giảm'], [196, 'Thặng dư — tăng'], [197, 'Thặng dư — giảm'],
    [198, 'Cổ phiếu quỹ — tăng (−)'], [199, 'Cổ phiếu quỹ — giảm'], [200, 'Quỹ ĐTPT — tăng'], [201, 'Quỹ ĐTPT — giảm'],
    [202, 'LNCPP — cổ tức công bố (−)'], [203, 'LNCPP — tăng khác'], [204, 'LNCPP — giảm khác (−)'],
    [205, 'LICĐKKS — thay đổi do hợp nhất']]
    .map(([row, label]) => ({ row, label, group: 'Vốn chủ' })),
  ...[[208, 'Vay NH — tiền vay'], [209, 'Vay NH — trả nợ (−)'], [210, 'Vay DH — tiền vay'], [211, 'Vay DH — trả nợ (−)']]
    .map(([row, label]) => ({ row, label, group: 'Nợ vay' })),
  ...[[214, 'Số cổ phiếu lưu hành (triệu cp)'], [215, 'Giá cổ phiếu (đồng)'], [216, 'Thuế suất TNDN'], [217, 'Số năm phân bổ LTTM']]
    .map(([row, label]) => ({ row, label, group: 'Tham số' })),
];

/**
 * @param ds { periods:[{id, year, months}], values:{[id]:{key:đồng}}, notes:{[id]:{segments, fixedAssets, goodwill, equity, debt, shares, taxRate}} }
 * @param opts.segmentMap { [tên mảng trong thuyết minh]: ô 0..4 }
 * @returns { byYear: {[year]: {[row]: {v, src}}}, warnings: string[] }
 */
export function buildModel(ds, opts = {}) {
  const warn = new Set();
  const byYear = {};
  const years = ds.periods.filter((p) => p.months === 12).sort((a, b) => a.year - b.year);
  let prev = null;
  for (const p of years) {
    const vals = computeTotals(ds.values[p.id] || {});
    const notes = (ds.notes && ds.notes[p.id]) || {};
    const cells = {};
    fillStatements(cells, vals, warn);
    fillSegments(cells, vals, notes, opts.segmentMap, warn, p.year);
    fillFixedAssets(cells, vals, notes, warn, p.year);
    fillDebt(cells, vals, notes, warn);
    if (prev) fillEquity(cells, prev.cells, vals, notes, warn);
    fillParams(cells, notes, warn, p.year);
    byYear[p.year] = cells;
    prev = { cells };
  }
  return { byYear, warnings: [...warn] };
}

const put = (cells, row, v, src) => { if (Number.isFinite(v)) cells[row] = { v, src }; };

function getter(vals) {
  const g = (k) => (Number.isFinite(vals[k]) ? vals[k] : 0);
  const has = (k) => Number.isFinite(vals[k]);
  // LCTT trực tiếp dùng mã T01…; phần đầu tư / tài chính cùng số mã.
  const direct = !has('CF:20') && has('CF:T20');
  const cf = (code) => g(direct ? `CF:T${code}` : `CF:${code}`);
  return { g, has, cf, direct };
}

function fillStatements(cells, vals, warn) {
  const { g, has, cf, direct } = getter(vals);
  const S = (row, v) => put(cells, row, v / M, 'bctc');

  if (has('IS:10') || has('IS:01')) {
    S(8, g('IS:10')); S(9, -g('IS:11')); S(12, g('IS:22')); S(13, -g('IS:24'));
    S(14, -(g('IS:23') - g('IS:24'))); S(16, g('IS:27')); S(17, -g('IS:25')); S(18, -g('IS:26'));
    S(20, g('IS:31') + g('IS:21')); S(21, -g('IS:32')); S(23, -g('IS:51')); S(24, -g('IS:52')); S(27, g('IS:62'));
  }

  if (has('BS:280') || has('BS:100')) {
    S(32, g('BS:111')); S(33, g('BS:112')); S(34, g('BS:120'));
    S(36, g('BS:131')); S(37, g('BS:132')); S(38, g('BS:135x'));
    // Dòng 48 (TS ngắn hạn khác) model không đọc → gộp 164/165 và TS sinh học NH vào phải thu khác.
    S(39, g('BS:133') + g('BS:134') + g('BS:135') + g('BS:137') + g('BS:164') + g('BS:165') + g('BS:150'));
    S(40, g('BS:136')); S(42, g('BS:141')); S(43, g('BS:142'));
    S(45, g('BS:161')); S(46, g('BS:162')); S(47, g('BS:163'));
    S(52, g('BS:210'));
    S(54, g('BS:222') + g('BS:225')); S(55, g('BS:223') + g('BS:226'));
    S(57, g('BS:228')); S(58, g('BS:229'));
    S(59, g('BS:250')); S(60, g('BS:262')); S(61, g('BS:260') - g('BS:262'));
    S(62, g('BS:271')); S(63, g('BS:272'));
    S(64, g('BS:273') + g('BS:274') + g('BS:230') + g('BS:240'));
    S(65, g('BS:279'));
    S(71, g('BS:311')); S(72, g('BS:312')); S(73, g('BS:314')); S(74, g('BS:315')); S(75, g('BS:316'));
    S(76, g('BS:319'));
    S(77, g('BS:320') + g('BS:313') + g('BS:317') + g('BS:318') + g('BS:322') + g('BS:323') + g('BS:324') + g('BS:325'));
    S(78, g('BS:321'));
    S(80, g('BS:339')); S(81, g('BS:342')); S(82, g('BS:330') - g('BS:339') - g('BS:342'));
    S(85, g('BS:411')); S(86, g('BS:412')); S(87, g('BS:415'));
    S(88, g('BS:400') - g('BS:411') - g('BS:412') - g('BS:415') - g('BS:420') - g('BS:429'));
    S(89, g('BS:420')); S(90, g('BS:429'));
    if (g('BS:230') || g('BS:240') || g('BS:150')) warn.add(t('mw.investProp'));
  }

  const cfTotal = direct ? 'CF:T20' : 'CF:20';
  if (has(cfTotal) || has('CF:50') || has('CF:T50')) {
    if (direct) warn.add(t('mw.directCf'));
    const pbt = g('IS:50');
    const a = direct ? {} : {
      98: g('CF:02'), 99: g('CF:03'), 100: -g('IS:27'), 101: g('CF:06'), 103: g('CF:09'), 104: g('CF:10'),
      105: g('CF:11'), 106: g('CF:12'), 107: g('CF:14'), 108: g('CF:15'),
    };
    let sum = pbt;
    for (const [row, v] of Object.entries(a)) { S(+row, v); sum += v; }
    if (direct) for (const r of [98, 99, 100, 101, 103, 104, 105, 106, 107, 108]) S(r, 0);
    S(109, g(cfTotal) - sum);

    S(112, cf('21')); S(113, cf('22')); S(114, cf('25'));
    S(115, cf('30') - cf('21') - cf('22') - cf('25'));
    S(118, cf('31')); S(119, cf('32')); S(122, cf('36'));
    // Dòng 123 cân phần còn lại sau khi trừ vay / trả nợ (dòng 120/121 lấy từ mục H — xem fillDebt).
    cells._cfFinOther = cf('40') - cf('31') - cf('32') - cf('36');
    S(126, cf('60')); S(127, cf('61'));
  }
}

function fillSegments(cells, vals, notes, segmentMap, warn, year) {
  const { g, has } = getter(vals);
  if (!has('IS:10')) return;
  const segs = Array.isArray(notes.segments) ? notes.segments.filter((s) => Number.isFinite(s.revenue)) : [];
  if (!segs.length) {
    put(cells, 132, g('IS:10') / M, 'uoc'); put(cells, 140, g('IS:20') / M, 'uoc');
    for (let i = 1; i < SEGMENT_SLOTS; i++) { put(cells, 132 + i, 0, 'uoc'); put(cells, 140 + i, 0, 'uoc'); }
    warn.add(`Chưa có thuyết minh doanh thu theo mảng: tạm để toàn bộ doanh thu vào mảng 1.`);
    return;
  }
  const rev = Array(SEGMENT_SLOTS).fill(0), gp = Array(SEGMENT_SLOTS).fill(0);
  segs.forEach((s, i) => {
    let slot = segmentMap && Number.isInteger(segmentMap[s.name]) ? segmentMap[s.name] : Math.min(i, SEGMENT_SLOTS - 1);
    slot = Math.max(0, Math.min(SEGMENT_SLOTS - 1, slot));
    rev[slot] += s.revenue;
    if (Number.isFinite(s.gross)) gp[slot] += s.gross;
  });
  // Doanh thu bộ phận có thể là doanh thu gộp / chưa loại trừ nội bộ → dồn chênh lệch vào ô cuối để CHECK 138 khớp.
  const gap = g('IS:10') - rev.reduce((a, b) => a + b, 0);
  if (Math.abs(gap) > Math.abs(g('IS:10')) * 1e-6 + 1) {
    rev[SEGMENT_SLOTS - 1] += gap;
    warn.add(`${year}: tổng doanh thu các mảng lệch doanh thu thuần ${(gap / M).toLocaleString('vi-VN')} triệu — đã dồn vào mảng ${SEGMENT_SLOTS}.`);
  }
  rev.forEach((v, i) => put(cells, 132 + i, v / M, 'tm'));
  gp.forEach((v, i) => put(cells, 140 + i, v / M, 'tm'));
}

function fillFixedAssets(cells, vals, notes, warn, year) {
  const { g, has, cf } = getter(vals);
  if (!has('BS:222') && !has('BS:228') && !has('BS:220')) return;
  const cost54 = g('BS:222') + g('BS:225'), acc55 = g('BS:223') + g('BS:226');
  const cost57 = g('BS:228'), acc58 = g('BS:229');
  const fa = notes.fixedAssets;
  const zero = () => ({ cost: 0, accDep: 0, additions: 0, depreciation: 0 });
  const rows = Object.fromEntries(FA_CLASSES.map((c) => [c.cls, zero()]));
  let src = 'tm';

  if (fa && (fa.tangible?.length || fa.intangible?.length)) {
    for (const x of fa.tangible || []) add(rows[FA_CLASSES.some((c) => c.cls === x.cls && c.kind === 'tangible') ? x.cls : 'other'], x);
    for (const x of fa.intangible || []) add(rows[x.cls === 'land' ? 'land' : 'software'], x);
    // Phần CĐKT có mà thuyết minh không có (thường là TSCĐ thuê tài chính) → nhóm "khác" / "phần mềm & khác".
    const tangCost = sumOf(rows, 'tangible', 'cost'), tangAcc = sumOf(rows, 'tangible', 'accDep');
    rows.other.cost += cost54 - tangCost; rows.other.accDep += acc55 - tangAcc;
    const intCost = rows.land.cost + rows.software.cost, intAcc = rows.land.accDep + rows.software.accDep;
    rows.software.cost += cost57 - intCost; rows.software.accDep += acc58 - intAcc;
    const lease = g('BS:225');
    if (Math.abs(cost54 - tangCost - lease) > Math.max(1e9, Math.abs(cost54) * 0.001) || Math.abs(cost57 - intCost) > Math.max(1e9, Math.abs(cost57) * 0.001)) {
      warn.add(`${year}: thuyết minh TSCĐ không khớp CĐKT — phần chênh đã dồn vào nhóm "khác", nên kiểm tra lại.`);
    }
  } else {
    src = 'uoc';
    rows.buildings = { cost: cost54, accDep: acc55, additions: -cf('21'), depreciation: -g('CF:02') };
    rows.software = { cost: cost57, accDep: acc58, additions: 0, depreciation: 0 };
    warn.add(t('mw.noFaNote'));
  }
  for (const c of FA_CLASSES) {
    const x = rows[c.cls];
    put(cells, c.row, x.cost / M, src); put(cells, c.row + 1, x.accDep / M, src);
    put(cells, c.row + 2, x.additions / M, src); put(cells, c.row + 3, x.depreciation / M, src);
  }
  const gw = notes.goodwill;
  if (gw && Number.isFinite(gw.cost)) {
    put(cells, GOODWILL_ROW, gw.cost / M, 'tm'); put(cells, GOODWILL_ROW + 1, (gw.accAmort || 0) / M, 'tm');
    put(cells, GOODWILL_ROW + 2, (gw.additions || 0) / M, 'tm'); put(cells, GOODWILL_ROW + 3, (gw.amortization || 0) / M, 'tm');
  } else if (has('BS:279')) {
    put(cells, GOODWILL_ROW, g('BS:279') / M, 'uoc');
    for (let i = 1; i <= 3; i++) put(cells, GOODWILL_ROW + i, 0, 'uoc');
    if (g('BS:279')) warn.add(t('mw.noGwNote'));
  }
}

function add(t, x) {
  for (const k of ['cost', 'accDep', 'additions', 'depreciation']) t[k] += Number.isFinite(x[k]) ? x[k] : 0;
}
const sumOf = (rows, kind, k) => FA_CLASSES.filter((c) => c.kind === kind).reduce((a, c) => a + rows[c.cls][k], 0);

function fillDebt(cells, vals, notes, warn) {
  const { cf, has } = getter(vals);
  const d = notes.debt;
  let proceeds;
  if (d && [d.stProceeds, d.stRepay, d.ltProceeds, d.ltRepay].some(Number.isFinite)) {
    const v = (x) => (Number.isFinite(x) ? x : 0);
    put(cells, 208, v(d.stProceeds) / M, 'tm'); put(cells, 209, -Math.abs(v(d.stRepay)) / M, 'tm');
    put(cells, 210, v(d.ltProceeds) / M, 'tm'); put(cells, 211, -Math.abs(v(d.ltRepay)) / M, 'tm');
    proceeds = v(d.stProceeds) - Math.abs(v(d.stRepay)) + v(d.ltProceeds) - Math.abs(v(d.ltRepay));
  } else if (has('CF:33') || has('CF:34') || has('CF:T33')) {
    put(cells, 208, cf('33') / M, 'lctt'); put(cells, 209, cf('34') / M, 'lctt');
    put(cells, 210, 0, 'lctt'); put(cells, 211, 0, 'lctt');
    proceeds = cf('33') + cf('34');
    warn.add(t('mw.noDebtNote'));
  }
  if (Number.isFinite(cells._cfFinOther)) {
    put(cells, 123, (cells._cfFinOther - (proceeds || 0)) / M, 'bctc');
  }
  delete cells._cfFinOther;
}

function fillEquity(cells, prevCells, vals, notes, warn) {
  const { g, has } = getter(vals);
  if (!has('BS:411') || !prevCells[85]) return;
  const d = (row, cur) => cur / M - (prevCells[row] ? prevCells[row].v : 0);
  const e = notes.equity;
  const src = e ? 'tm' : 'uoc';
  const pos = (x) => Math.max(0, x), neg = (x) => Math.min(0, x);
  const dCap = d(85, g('BS:411'));
  if (e) {
    const v = (x) => (Number.isFinite(x) ? x / M : 0);
    put(cells, 191, v(e.capIssued), src); put(cells, 192, v(e.capBonus), src); put(cells, 193, v(e.capEsop), src);
    put(cells, 194, v(e.capStockDiv), src); put(cells, 195, -Math.abs(v(e.capDecrease)), src);
    put(cells, 196, v(e.premiumInc), src); put(cells, 197, -Math.abs(v(e.premiumDec)), src);
    put(cells, 198, -Math.abs(v(e.treasuryInc)), src); put(cells, 199, Math.abs(v(e.treasuryDec)), src);
    put(cells, 200, v(e.devFundInc), src); put(cells, 201, -Math.abs(v(e.devFundDec)), src);
    put(cells, 202, -Math.abs(v(e.dividends)), src);
    const gapCap = dCap - [191, 192, 193, 194, 195].reduce((a, r) => a + cells[r].v, 0);
    if (Math.abs(gapCap) > 1) { cells[191].v += gapCap; warn.add(t('mw.equityGap')); }
  } else {
    put(cells, 191, pos(dCap), src); put(cells, 192, 0, src); put(cells, 193, 0, src); put(cells, 194, 0, src); put(cells, 195, neg(dCap), src);
    const dPrem = d(86, g('BS:412')); put(cells, 196, pos(dPrem), src); put(cells, 197, neg(dPrem), src);
    const dTre = d(87, g('BS:415')); put(cells, 198, neg(dTre), src); put(cells, 199, pos(dTre), src);
    const dFund = d(88, cells[88] ? cells[88].v * M : 0);      // quỹ ĐTPT + vốn khác (dòng 88)
    put(cells, 200, pos(dFund), src); put(cells, 201, neg(dFund), src);
    put(cells, 202, (has('CF:36') ? g('CF:36') : 0) / M, has('CF:36') ? 'lctt' : 'uoc');
    warn.add(t('mw.noEquityNote'));
  }
  // LNCPP: CHECK 206 đòi  LNCPP đầu kỳ + LN công ty mẹ + (202 + 203 + 204) = LNCPP cuối kỳ.
  // Lấy tăng/giảm khác từ thuyết minh (nếu có), phần còn lệch dồn vào 203 (dương) hoặc 204 (âm).
  const parent = (g('IS:60') - g('IS:62')) / M;
  const baseInc = e && Number.isFinite(e.reOtherInc) ? e.reOtherInc / M : 0;
  const baseDec = e && Number.isFinite(e.reOtherDec) ? -Math.abs(e.reOtherDec) / M : 0;
  const gapRE = d(89, g('BS:420')) - parent - cells[202].v - baseInc - baseDec;
  put(cells, 203, baseInc + pos(gapRE), src); put(cells, 204, baseDec + neg(gapRE), src);
  put(cells, 205, (e && Number.isFinite(e.nciChange) ? e.nciChange / M : d(90, g('BS:429')) - g('IS:62') / M), src);
}

function fillParams(cells, notes, warn, year) {
  if (Number.isFinite(notes.shares) && notes.shares > 0) put(cells, 214, notes.shares / M, 'tm');
  else warn.add(`${year}: chưa có số cổ phiếu lưu hành — nhập tay dòng 214 (triệu cổ phiếu).`);
  if (Number.isFinite(notes.taxRate)) put(cells, 216, notes.taxRate, 'tm');
  else put(cells, 216, 0.2, 'md');
  put(cells, 217, 10, 'md');
}
