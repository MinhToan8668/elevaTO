// Mô hình ba báo cáo TÍCH HỢP — port đúng logic model elevaTO (sheet 04.Drivers mục C2–C3, 07.BS, 08.CF, 10.FA_SCHED,
// 11.Debt_Sched, 12.Equity_Sched) trên dữ liệu 03.Input_FS mà app đã dựng từ BCTC (targets/model.js → buildModel):
//
//   04.Drivers  mỗi dòng CĐKT một driver: phải thu = DSO × doanh thu / 365; tồn kho gộp = DIO × giá vốn / 365; dự phòng
//               HTK = % tồn kho gộp; phải trả NB = DPO × giá vốn / 365; chi phí trả trước NH = % giá vốn; các khoản khác
//               % doanh thu; XDCB dở dang, đầu tư dài hạn khác = mức bình quân. Mặc định mọi driver = BÌNH QUÂN 3 NĂM
//               ACTUAL GẦN NHẤT ("→ APPLIED"); ghi đè cả giai đoạn (cột AB) hoặc từng năm.
//   10.FA_SCHED theo từng nhóm TSCĐ: nguyên giá cuối = đầu + capex nhập theo nhóm; khấu hao = MIN(nguyên giá cuối /
//               số năm sử dụng, giá trị còn lại); số năm sử dụng = TB nguyên giá / TB khấu hao các năm actual, chặn
//               [min; max]; lợi thế thương mại phân bổ đều (mặc định 10 năm, VAS).
//   11.Debt     vay ngắn hạn = % giá vốn (vốn vay tài trợ vòng quay hàng); vay dài hạn = đầu + vay mới − trả; lãi vay
//               = lãi suất × dư nợ ĐẦU KỲ (không tham chiếu vòng).
//   12.Equity   vốn góp + phát hành; LNST chưa phân phối + LNST cty mẹ − cổ tức tiền (= tỷ lệ × LNST cty mẹ NĂM TRƯỚC);
//               NCI + phần LNST của NCI.
//   07.BS       tiền = số cân (plug) từ 08.CF → bảng cân đối luôn cân.
//   08.CF       gián tiếp, mỗi dòng từ biến động CĐKT; FCFF = CFO + lãi vay × (1 − t) + capex + Δ đầu tư tài chính NH
//               → đưa sang 15.DCF.
// KQKD dùng chính dòng dự phóng của phần DCF (doanh thu, giá vốn, EBIT). Máy tính, AI không tham gia.

const M = 1e6;
const num = (v) => (Number.isFinite(v) ? v : null);
const avg = (xs) => { const a = xs.filter((x) => Number.isFinite(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };

// Driver vốn lưu động & tài sản / nợ khác: key, dòng 03.Input_FS, cơ sở, nhóm trên LCTT (08.CF).
//   basis: rev (% doanh thu) · cogs (% giá vốn) · dso (ngày theo doanh thu) · dcogs (ngày theo giá vốn) · inv (% tồn kho gộp)
//          · level (mức bình quân, đồng) · flat (giữ số dư năm gốc)
export const BS_DRIVERS = [
  { k: 'stInv', row: 34, side: 'A', basis: 'rev', cf: 'stInv' },
  { k: 'ar', row: 36, side: 'A', basis: 'dso', cf: 'rec' },
  { k: 'prepay', row: 37, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'loanRec', row: 38, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'otherRec', row: 39, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'provRec', row: 40, side: 'A', basis: 'rev', cf: 'prov' },
  { k: 'inv', row: 42, side: 'A', basis: 'dcogs', cf: 'inv' },
  { k: 'invProv', row: 43, side: 'A', basis: 'inv', cf: 'prov' },
  { k: 'stPrepaid', row: 45, side: 'A', basis: 'cogs', cf: 'prepaid' },
  { k: 'vat', row: 46, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'taxRec', row: 47, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'otherCa', row: 48, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'ltRec', row: 52, side: 'A', basis: 'rev', cf: 'rec' },
  { k: 'cip', row: 59, side: 'A', basis: 'level', cf: 'invOther' },
  { k: 'otherLtInv', row: 61, side: 'A', basis: 'level', cf: 'invOther' },
  { k: 'ltPrepaid', row: 62, side: 'A', basis: 'rev', cf: 'prepaid' },
  { k: 'dta', row: 63, side: 'A', basis: 'rev', cf: 'other' },
  { k: 'otherLt', row: 64, side: 'A', basis: 'rev', cf: 'invOther' },
  { k: 'ap', row: 71, side: 'L', basis: 'dcogs', cf: 'pay' },
  { k: 'advCust', row: 72, side: 'L', basis: 'rev', cf: 'pay' },
  { k: 'taxPay', row: 73, side: 'L', basis: 'rev', cf: 'tax' },          // vào dòng "thuế đã nộp" (lịch thuế, 13.Tax)
  { k: 'empPay', row: 74, side: 'L', basis: 'rev', cf: 'pay' },
  { k: 'accrued', row: 75, side: 'L', basis: 'rev', cf: 'pay' },
  { k: 'unearned', row: 76, side: 'L', basis: 'rev', cf: 'pay' },
  { k: 'otherPay', row: 77, side: 'L', basis: 'rev', cf: 'pay' },
  { k: 'dtl', row: 81, side: 'L', basis: 'flat', cf: 'other' },
  { k: 'otherLtL', row: 82, side: 'L', basis: 'rev', cf: 'pay' },
];
// Driver tài chính (cũng bình quân 3 năm, ghi đè được): vay NH / giá vốn, tỷ lệ cổ tức, NCI / LNST, phát hành cổ phiếu.
export const FIN_DRIVERS = [
  { k: 'stDebt', basis: 'cogs' }, { k: 'stNew', basis: 'cogs' }, { k: 'payout', basis: 'pct' }, { k: 'nci', basis: 'pct' }, { k: 'issue', basis: 'level' },
  { k: 'assocProfit', basis: 'level' },               // phần lãi / lỗ công ty liên doanh, liên kết (13.Tax_JV_Sched mục D)
];
// Driver KQKD (04.Drivers mục C1) — cũng bình quân 3 năm actual, ghi đè được: chi phí bán hàng, QLDN, chi phí tài chính khác,
// thu nhập / chi phí khác theo % doanh thu; lợi suất tiền (trên tiền ĐẦU KỲ); lãi suất bình quân (trên dư nợ ĐẦU KỲ);
// thuế suất hiệu dụng.
export const PL_DRIVERS = [
  { k: 'selling', basis: 'rev' }, { k: 'ga', basis: 'rev' }, { k: 'otherFin', basis: 'rev' }, { k: 'otherInc', basis: 'rev' },
  { k: 'otherExp', basis: 'rev' }, { k: 'yield', basis: 'pct' }, { k: 'intRate', basis: 'pct' }, { k: 'taxRate', basis: 'pct' },
];
// Nhóm TSCĐ (như targets/model.js FA_CLASSES): dòng đầu khối +0 nguyên giá, +1 hao mòn LK, +2 tăng, +3 khấu hao.
export const FA_CLS = [
  // Khung số năm sử dụng [min; max] (khung trích khấu hao TT45/2013); model chặn theo khung ghi ở thuyết minh của từng
  // công ty — sửa trực tiếp ở ô "áp dụng" nếu khác.
  { cls: 'buildings', row: 150, min: 5, max: 50 }, { cls: 'machinery', row: 155, min: 3, max: 15 },
  { cls: 'transport', row: 160, min: 6, max: 10 }, { cls: 'office', row: 165, min: 3, max: 8 },
  { cls: 'other', row: 170, min: 3, max: 10 }, { cls: 'land', row: 175, min: 0, max: 0 },
  { cls: 'software', row: 180, min: 3, max: 8 },
];

// fcffMode: 'std' (chuẩn) — lãi tiền gửi = lãi suất gửi × (tiền + ĐTNH) đầu kỳ, vào LNTT nhưng KHÔNG vào FCFF (giá trị của
// tiền đã cộng ở cầu nối); ĐTNH giữ nguyên số dư, coi như tiền; phần thu nhập tài chính còn lại (chiết khấu thanh toán, tỷ
// giá…) theo % doanh thu, giữ trong EBIT / FCFF. 'excel' — như model: thu nhập tài chính = lợi suất × tiền đầu kỳ, nằm
// trong FCFF; ĐTNH theo % doanh thu, biến động vào FCFF (08.CF dòng 25).
export const DEFAULT_FS = { src: 'model', fcffMode: 'std', depRate: null, finOp: null, cashRate: null, minCash: null, stRate: null, ltRate: null, stRateY: [], ltRateY: [], ltNew: [], ltRepay: [], drv: {}, capex: {}, life: {},
  gwYears: null, assocNew: [], assocDiv: 0 };

const tl = (v, lo, hi, d) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : d);
const mang = (arr, lo, hi) => (Array.isArray(arr) ? arr : []).slice(0, 10).map((v) => tl(v, lo, hi, null));

/** Làm sạch giả định của mô hình ba báo cáo (lưu ở dealInputs.val.fs). */
export function cleanFs(x) {
  const o = x && typeof x === 'object' ? x : {};
  const drv = {};
  for (const d of [...BS_DRIVERS, ...FIN_DRIVERS, ...PL_DRIVERS]) {
    const v = o.drv?.[d.k];
    if (!v || typeof v !== 'object') continue;
    const all = tl(v.all, -1e18, 1e18, null), y = mang(v.y, -1e18, 1e18);
    if (all !== null || y.some((z) => z !== null)) drv[d.k] = { all, y };
  }
  const capex = {}, life = {};
  for (const c of FA_CLS) {
    const a = mang(o.capex?.[c.cls], 0, 1e18);
    if (a.some((z) => z !== null)) capex[c.cls] = a;
    const l = tl(o.life?.[c.cls], 0, 100, null);
    if (l !== null) life[c.cls] = l;
  }
  return {
    src: o.src === 'simple' ? 'simple' : 'model',
    fcffMode: o.fcffMode === 'excel' ? 'excel' : 'std', depRate: tl(o.depRate, 0, 0.3, null), finOp: tl(o.finOp, -0.5, 0.5, null),
    cashRate: tl(o.cashRate, 0, 1, null), minCash: tl(o.minCash, 0, 1e18, null),
    stRate: tl(o.stRate, 0, 0.5, null), ltRate: tl(o.ltRate, 0, 0.5, null), stRateY: mang(o.stRateY, 0, 0.5), ltRateY: mang(o.ltRateY, 0, 0.5),
    ltNew: mang(o.ltNew, 0, 1e18), ltRepay: mang(o.ltRepay, 0, 1e18), drv, capex, life, gwYears: tl(o.gwYears, 1, 50, null),
    assocNew: mang(o.assocNew, -1e18, 1e18), assocDiv: tl(o.assocDiv, 0, 1, 0),
  };
}

/** 03.Input_FS các năm actual (đồng) từ buildModel: { years: [năm], cells: { năm: { dòng: đồng } } }. */
export function inputFsFrom(byYear) {
  const years = Object.keys(byYear || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const cells = {};
  // Dòng 214–217 là tham số (triệu cổ phiếu, giá, thuế suất, số năm) — không phải số tiền triệu đồng.
  for (const y of years) cells[y] = Object.fromEntries(Object.entries(byYear[y]).map(([r, x]) => [r, Number.isFinite(x?.v) ? (+r >= 214 ? x.v : x.v * M) : null]));
  return { years, cells };
}

/** Các dòng tính ra (như công thức 03.Input_FS) của một năm actual. */
export function actualRow(c) {
  const g = (r) => num(c[r]) ?? 0;
  const rev = g(8), cogs = -g(9);
  const pbt = g(8) + g(9) + g(12) + g(13) + g(14) + g(16) + g(17) + g(18) + g(20) + g(21);
  const npat = pbt + g(23) + g(24);
  const assets = g(32) + g(33) + g(34) + g(36) + g(37) + g(38) + g(39) + g(40) + g(42) + g(43) + g(45) + g(46) + g(47) + g(48)
    + g(52) + g(54) + g(55) + g(57) + g(58) + g(59) + g(60) + g(61) + g(62) + g(63) + g(64) + g(65);
  const liab = g(71) + g(72) + g(73) + g(74) + g(75) + g(76) + g(77) + g(78) + g(80) + g(81) + g(82);
  const equity = g(85) + g(86) + g(87) + g(88) + g(89) + g(90);
  return { rev, cogs, gp: rev - cogs, interest: g(13), pbt, tax: g(23) + g(24), npat, nci: g(27), npatP: npat - g(27), cash: g(32) + g(33), assets, liab, equity };
}

/** Tỷ lệ actual của một driver trong một năm (null khi thiếu số). */
function tyLe(d, c, cPrev) {
  const g = (r) => num(c[r]);
  const A = actualRow(c);
  if (d.k === 'stDebt') return A.cogs ? (g(78) ?? 0) / A.cogs : null;
  if (d.k === 'payout') { const p = cPrev ? actualRow(cPrev).npatP : null; return p > 0 && g(122) !== null ? -g(122) / p : null; }
  if (d.k === 'nci') return A.npat ? (g(27) ?? 0) / A.npat : null;
  if (d.k === 'issue') return g(118) ?? 0;
  if (d.k === 'assocProfit') return g(16) ?? 0;
  if (d.k === 'stNew') return A.cogs && g(208) !== null ? Math.abs(g(208)) / A.cogs : null;
  const pRev = (r, sign = 1) => (A.rev && g(r) !== null ? (sign * g(r)) / A.rev : null);
  if (d.k === 'selling') return pRev(17, -1);
  if (d.k === 'ga') return pRev(18, -1);
  if (d.k === 'otherFin') return pRev(14, -1);
  if (d.k === 'otherInc') return pRev(20);
  if (d.k === 'otherExp') return pRev(21, -1);
  if (d.k === 'yield') { const c0 = cPrev ? actualRow(cPrev).cash : null; return c0 && g(12) !== null ? g(12) / c0 : null; }
  // Lãi suất ngoài [0; 30%] (nợ đầu kỳ gần 0) và thuế suất năm lỗ / ngoài [0; 50%] không đưa vào bình quân.
  if (d.k === 'intRate') { const n0 = cPrev ? (num(cPrev[78]) ?? 0) + (num(cPrev[80]) ?? 0) : null; const x = n0 > 0 && g(13) !== null ? -g(13) / n0 : null; return x !== null && x >= 0 && x <= 0.3 ? x : null; }
  if (d.k === 'taxRate') { const x = A.pbt > 0 ? -A.tax / A.pbt : null; return x !== null && x >= 0 && x <= 0.5 ? x : null; }
  const v = g(d.row);
  if (v === null) return d.basis === 'flat' || d.basis === 'level' ? 0 : null;
  switch (d.basis) {
    case 'rev': return A.rev ? v / A.rev : null;
    case 'cogs': return A.cogs ? v / A.cogs : null;
    case 'dso': return A.rev ? (v / A.rev) * 365 : null;
    case 'dcogs': return A.cogs ? (v / A.cogs) * 365 : null;
    case 'inv': return g(42) ? v / g(42) : null;
    default: return v;
  }
}

/** Lịch sử và giá trị áp dụng (bình quân 3 năm actual gần nhất, ghi đè) của mọi driver. */
export function driverTable(inputFs, fs, N) {
  const { years, cells } = inputFs;
  const out = {};
  for (const d of [...BS_DRIVERS, ...FIN_DRIVERS, ...PL_DRIVERS]) {
    const hist = years.map((y, i) => tyLe(d, cells[y], i ? cells[years[i - 1]] : null));
    const ba = hist.slice(-3);
    // "flat": giữ nguyên số dư năm gốc; còn lại bình quân 3 năm.
    const mac = d.basis === 'flat' ? hist[hist.length - 1] : avg(ba);
    const o = fs.drv[d.k];
    const chung = o?.all ?? mac;
    out[d.k] = { hist, avg: mac, all: o?.all ?? null, applied: Array.from({ length: N }, (_, t) => (Number.isFinite(o?.y?.[t]) ? o.y[t] : chung)), over: Array.from({ length: N }, (_, t) => Number.isFinite(o?.y?.[t])) };
  }
  return out;
}

/**
 * Số năm sử dụng của từng nhóm TSCĐ: TB nguyên giá / TB khấu hao các năm actual, chặn [min; max] (như cột AD / AB / AC
 * của 10.FA_SCHED). Khung lấy từ thuyết minh chính sách kế toán khi đã trích (ranges), không thì khung chung TT45.
 * @param ranges { nhóm: { min, max } } — notes.lives của năm gần nhất
 */
export function usefulLives(inputFs, fs, ranges = {}) {
  const { years, cells } = inputFs;
  const out = {};
  for (const c of FA_CLS) {
    const cost = avg(years.map((y) => num(cells[y][c.row])).filter((x) => x)), dep = avg(years.map((y) => num(cells[y][c.row + 3])).filter((x) => x));
    const est = cost && dep ? Math.abs(cost / dep) : null;
    const k = ranges?.[c.cls];
    const tm = k && Number.isFinite(k.min) && Number.isFinite(k.max);
    const lo = tm ? k.min : c.min, hi = tm ? k.max : c.max;
    // Lịch sử có nguyên giá mà không có khấu hao (vd. TSCĐ vô hình chưa tách nhóm, quyền sử dụng đất): không khấu hao,
    // trừ khi thuyết minh có khung số năm (như model: chặn về min) hoặc người dùng nhập.
    const clamp = est === null ? (tm ? lo : 0) : Math.min(hi, Math.max(lo, est));
    out[c.cls] = { est, applied: fs.life[c.cls] ?? clamp, user: fs.life[c.cls] !== undefined, min: lo, max: hi, src: tm ? 'tm' : est === null ? 'nohist' : 'md' };
  }
  return out;
}

/**
 * Đầu vào WACC theo 15.DCF: Kd = lãi suất bình quân năm dự phóng đầu (lãi vay năm 1 / dư nợ đầu kỳ, như 11.Debt J38) và
 * thuế suất = thuế suất hiệu dụng của năm ACTUAL cuối (như C21). null khi không đủ số.
 */
export function waccFrom3(inputFs, fs, kdMacDinh) {
  if (!inputFs?.years?.length) return null;
  const D = driverTable(inputFs, fs, 1);
  const c0 = inputFs.cells[inputFs.years[inputFs.years.length - 1]];
  const st = num(c0[78]) ?? 0, lt = num(c0[80]) ?? 0;
  const tb = D.intRate.applied[0] ?? kdMacDinh;
  const rST = Number.isFinite(fs.stRateY[0]) ? fs.stRateY[0] : fs.stRate ?? tb, rLT = Number.isFinite(fs.ltRateY[0]) ? fs.ltRateY[0] : fs.ltRate ?? tb;
  const kd = st + lt > 0 ? (st * rST + lt * rLT) / (st + lt) : tb;
  const A = actualRow(c0);
  return { kd, tax: A.pbt ? -A.tax / A.pbt : null };
}

/**
 * @param a      dealAnalysis có a.inputFs (03.Input_FS các năm actual, đồng)
 * @param flows  dòng dự phóng KQKD của DCF (rev, cogs, ebit, tax)
 * @param ctx    { fs (cleanFs), kd (lãi vay mặc định), capexPct (capex % doanh thu mặc định), shares }
 * @returns null khi thiếu năm actual / CĐKT, hoặc { years, base, drivers, lives, issues, ok }
 */
export function model3(a, flows, ctx) {
  const F = a.inputFs;
  if (!F?.years?.length || !flows?.length) return null;
  const fs = ctx.fs;
  const last = F.years[F.years.length - 1];
  const c0 = F.cells[last];
  const A0 = actualRow(c0);
  if (!A0.assets) return { issue: 'noBs' };
  const N = flows.length;
  const D = driverTable(F, fs, N);
  // Chế độ FCFF chuẩn: lãi suất tiền gửi (mặc định = Rf) và thu nhập tài chính hoạt động (% doanh thu, bình quân 3 năm
  // actual của phần thu nhập tài chính VƯỢT lãi gửi ước tính trên tiền + ĐTNH đầu kỳ).
  const chuan = fs.fcffMode !== 'excel';
  const depRate = fs.depRate ?? ctx.rf ?? 0.04;
  const finOpHist = F.years.slice(-3).map((y) => {
    const k = F.years.indexOf(y), c = F.cells[y], cp = k > 0 ? F.cells[F.years[k - 1]] : null;
    const rev = actualRow(c).rev, fi = num(c[12]);
    if (!rev || fi === null) return null;
    const goc = cp ? actualRow(cp).cash + (num(cp[34]) ?? 0) : 0;
    return Math.max(0, fi - depRate * goc) / rev;
  }).filter((x) => x !== null);
  const finOpPct = fs.finOp ?? (finOpHist.length ? finOpHist.reduce((s2, x) => s2 + x, 0) / finOpHist.length : 0);
  const lives = usefulLives(F, fs, a.faLives);
  const g0 = (r) => num(c0[r]) ?? 0;
  const issues = [];

  // Số dư năm gốc theo đúng các dòng của 07.BS. Chênh lệch (nếu Input_FS chưa cân) dồn vào "khác" để năm gốc cân.
  const base = { cash: A0.cash, stDebt: g0(78), ltDebt: g0(80), revolver: 0, shareCap: g0(85) + g0(86) + g0(87) + g0(88), retained: g0(89), nci: g0(90), assoc: g0(60) };
  for (const d of BS_DRIVERS) base[d.k] = g0(d.row);
  const fa0 = FA_CLS.map((c) => ({ cls: c.cls, cost: g0(c.row), acc: g0(c.row + 1) }));
  // Phần TSCĐ trên CĐKT không nằm trong nhóm nào (Input_FS thiếu thuyết minh) → nhóm "khác".
  const lechTscd = g0(54) + g0(55) + g0(57) + g0(58) - fa0.reduce((s, x) => s + x.cost + x.acc, 0);
  if (Math.abs(lechTscd) > 1) fa0.find((x) => x.cls === 'other').cost += lechTscd;
  const gw0 = { cost: num(c0[185]) ?? g0(65), acc: num(c0[185]) !== null ? g0(186) : 0 };
  // Lợi thế thương mại theo thuyết minh lệch số dư CĐKT → lấy số dư CĐKT (giữ nguyên giá, chỉnh phân bổ luỹ kế).
  if (Math.abs(gw0.cost + gw0.acc - g0(65)) > 1) gw0.acc = g0(65) - gw0.cost;
  const tsB = base.cash + base.assoc + BS_DRIVERS.filter((d) => d.side === 'A').reduce((s, d) => s + base[d.k], 0) + fa0.reduce((s, x) => s + x.cost + x.acc, 0) + gw0.cost + gw0.acc;
  const nvB = BS_DRIVERS.filter((d) => d.side === 'L').reduce((s, d) => s + base[d.k], 0) + base.stDebt + base.ltDebt;
  const vcB = base.shareCap + base.retained + base.nci;
  base.plug = tsB - nvB - vcB;                          // nợ / vốn chủ chưa phân loại (Input_FS cân thì ≈ 0)
  if (Math.abs(base.plug) > Math.max(1e6, Math.abs(tsB) * 1e-6)) issues.push('baseGap');

  // Capex theo nhóm: nhập trực tiếp (như 10.FA_SCHED mục A); bỏ trống = capex % doanh thu × tỷ trọng tăng TSCĐ lịch sử.
  const tang = FA_CLS.map((c) => F.years.slice(-3).reduce((s, y) => s + Math.max(0, num(F.cells[y][c.row + 2]) ?? 0), 0));
  const tongTang = tang.reduce((s, x) => s + x, 0);
  const tyTrong = FA_CLS.map((c, i) => (tongTang ? tang[i] / tongTang : (c.cls === 'other' ? 1 : 0)));
  const gwYears = fs.gwYears ?? (num(c0[217]) || 10);
  // Lãi suất từng năm (04.Drivers C4): ghi đè từng năm → ghi đè chung → lãi suất bình quân 3 năm actual (→ lãi suất mặc định).
  const rate = (y, chung, i) => (Number.isFinite(y[i]) ? y[i] : chung ?? D.intRate.applied[i] ?? ctx.kd);
  const stRateAt = (i) => rate(fs.stRateY, fs.stRate, i), ltRateAt = (i) => rate(fs.ltRateY, fs.ltRate, i);
  const stRate = stRateAt(0), ltRate = ltRateAt(0);
  const minCash = fs.minCash ?? 0;

  let p = { ...base, fa: fa0.map((x) => ({ ...x })), gw: { ...gw0 }, npatP: A0.npatP, shares: ctx.shares || null };
  const years = flows.map((f, i) => {
    const t = i + 1;
    const dv = (k) => D[k].applied[i];
    const rev = f.rev, cogs = f.cogs > 0 ? f.cogs : rev - f.gp;
    // 1. Các dòng CĐKT theo driver.
    const n = { ...p };
    for (const d of BS_DRIVERS) {
      const x = dv(d.k);
      n[d.k] = x === null || x === undefined ? p[d.k]
        : d.basis === 'rev' ? x * rev : d.basis === 'cogs' ? x * cogs : d.basis === 'dso' ? (x * rev) / 365
          : d.basis === 'dcogs' ? (x * cogs) / 365 : d.basis === 'inv' ? null : x;
    }
    n.invProv = (dv('invProv') ?? 0) * n.inv;
    if (chuan) n.stInv = p.stInv;                       // ĐTNH coi như tiền: giữ số dư, không vào FCFF
    // 2. Lịch TSCĐ theo nhóm.
    let capex = 0, khau = 0;
    n.fa = p.fa.map((x, j) => {
      const c = FA_CLS[j];
      const nhap = fs.capex[c.cls]?.[i];
      const add = Number.isFinite(nhap) ? nhap : (ctx.capexPct ?? 0) * rev * tyTrong[j];
      const cost = x.cost + add;
      const life = lives[c.cls].applied;
      const dep = life > 0 ? Math.min(cost / life, Math.max(0, cost + x.acc)) : 0;
      capex += add; khau += dep;
      return { cls: c.cls, cost, acc: x.acc - dep, add, dep };
    });
    const gwAm = gwYears > 0 ? Math.min(n.gw.cost / gwYears, Math.max(0, n.gw.cost + p.gw.acc)) : 0;
    n.gw = { cost: p.gw.cost, acc: p.gw.acc - gwAm };
    // 3. Nợ vay (11.Debt_Sched): NH cuối kỳ = % giá vốn; tiền vay nhận = MAX(giá vốn × tỷ lệ vay mới, Δ dư nợ), trả nợ là
    //    số cân; DH theo lịch; lãi = lãi suất từng năm × dư nợ ĐẦU KỲ.
    n.stDebt = (dv('stDebt') ?? 0) * cogs;
    const stVay = Math.max((dv('stNew') ?? 0) * cogs, n.stDebt - p.stDebt), stTra = n.stDebt - p.stDebt - stVay;
    const ltNew = fs.ltNew[i] ?? 0, ltRepay = Math.min(p.ltDebt, fs.ltRepay[i] ?? 0);
    n.ltDebt = p.ltDebt + ltNew - ltRepay;
    const rST = stRateAt(i), rLT = ltRateAt(i);
    const laiVay = p.stDebt * rST + p.ltDebt * rLT + p.revolver * rST;
    // Thu nhập tài chính — 'excel': lợi suất × tiền ĐẦU KỲ (như 06.IS dòng 13); 'std': lãi gửi trên tiền + ĐTNH đầu kỳ
    // + phần hoạt động theo % doanh thu.
    const laiGui = chuan ? depRate * (p.cash + p.stInv) : p.cash * (fs.cashRate ?? dv('yield') ?? 0);
    const tcHd = chuan ? finOpPct * rev : 0;
    const thuTc = laiGui + tcHd;
    // Đầu tư công ty liên kết (13.Tax_JV_Sched mục D): đầu kỳ + đầu tư mới + phần lãi / lỗ − cổ tức nhận về.
    const lk = dv('assocProfit') ?? 0;
    const lkMoi = fs.assocNew[i] ?? 0;
    const lkCoTuc = Math.max(0, lk) * fs.assocDiv;
    n.assoc = p.assoc + lkMoi + lk - lkCoTuc;
    // 4. KQKD như 06.IS: lợi nhuận gộp (05.Revenue) − bán hàng − QLDN + thu nhập TC − lãi vay − CP tài chính khác + LDLK
    //    + thu nhập khác − chi phí khác = LNTT; thuế = thuế suất hiệu dụng × LNTT; NCI = % LNST.
    const gp = rev - cogs;
    const ban = (dv('selling') ?? 0) * rev, ql = (dv('ga') ?? 0) * rev, tcKhac = (dv('otherFin') ?? 0) * rev;
    const tnKhac = (dv('otherInc') ?? 0) * rev, cpKhac = (dv('otherExp') ?? 0) * rev;
    const opProfit = gp + thuTc - laiVay - tcKhac + lk - ban - ql;
    const pbt = opProfit + tnKhac - cpKhac;
    const taxR = dv('taxRate') ?? f.tax;
    const thue = pbt * taxR;
    const npat = pbt - thue;
    const nciP = npat * (dv('nci') ?? 0);
    const npatP = npat - nciP;
    const ebit = pbt + laiVay;                            // như 06.IS dòng 34: EBIT = LNTT + chi phí lãi vay
    // 5. Vốn chủ (12.Equity): cổ tức tiền = tỷ lệ × LNST cty mẹ năm trước; ESOP / phát hành theo mệnh giá 10.000 đ → số CP.
    const coTuc = Math.max(0, (dv('payout') ?? 0) * p.npatP);
    const phatHanh = dv('issue') ?? 0;
    n.shares = p.shares ? p.shares + phatHanh / 10000 : null;
    n.shareCap = p.shareCap + phatHanh;
    n.retained = p.retained + npatP - coTuc;
    n.nci = p.nci + nciP;
    n.npatP = npatP;
    // 6. LCTT gián tiếp từ biến động CĐKT (tài sản tăng → tiền giảm).
    const dA = (k) => -(n[k] - p[k]), dL = (k) => n[k] - p[k];
    const nhom = (cf) => BS_DRIVERS.filter((d) => d.cf === cf).reduce((s, d) => s + (d.side === 'A' ? dA(d.k) : dL(d.k)), 0);
    const cf = {
      pbt, da: khau + gwAm, prov: nhom('prov'), interest: laiVay,
      rec: nhom('rec'), inv: nhom('inv'), pay: nhom('pay'), prepaid: nhom('prepaid'),
      // Thuế đã nộp theo lịch thuế phải nộp (13.Tax mục B): đầu kỳ + thuế phải nộp trong năm − cuối kỳ.
      intPaid: -laiVay, taxPaid: -thue + nhom('tax'), other: nhom('other'), assoc: -lk,
    };
    cf.cfo = cf.pbt + cf.da + cf.prov + cf.assoc + cf.interest + cf.rec + cf.inv + cf.pay + cf.prepaid + cf.intPaid + cf.taxPaid + cf.other;
    cf.capex = -capex; cf.stInv = nhom('stInv'); cf.invOther = nhom('invOther');
    cf.assocInv = -lkMoi; cf.assocDiv = lkCoTuc;
    cf.cfi = cf.capex + cf.stInv + cf.invOther + cf.assocInv + cf.assocDiv;
    cf.issue = phatHanh; cf.stDebt = n.stDebt - p.stDebt; cf.stVay = stVay; cf.stTra = stTra; cf.ltNew = ltNew; cf.ltRepay = -ltRepay; cf.div = -coTuc;
    let tien = p.cash + cf.cfo + cf.cfi + cf.issue + cf.stDebt + cf.ltNew + cf.ltRepay + cf.div;
    // Revolver: tiền dưới mức tối thiểu thì vay; dư thì trả revolver trước.
    let rv = 0;
    if (tien < minCash) rv = minCash - tien;
    else if (p.revolver > 0) rv = -Math.min(p.revolver, tien - minCash);
    tien += rv;
    n.revolver = p.revolver + rv;
    cf.revolver = rv;
    cf.cff = cf.issue + cf.stDebt + cf.ltNew + cf.ltRepay + cf.div + cf.revolver;
    cf.net = cf.cfo + cf.cfi + cf.cff;
    cf.open = p.cash; cf.close = tien;
    n.cash = tien;
    // FCFF như 08.CF dòng 47: CFO + lãi vay × (1 − t) + capex + Δ đầu tư tài chính NH.  FCFE = FCFF − lãi(1 − t) + vay ròng.
    // Chế độ chuẩn: bỏ lãi tiền gửi sau thuế khỏi FCFF (tiền đã được cộng ở cầu nối EV → vốn chủ).
    cf.fcff = cf.cfo + laiVay * (1 - taxR) - (chuan ? laiGui * (1 - taxR) : 0) + cf.capex + cf.stInv;
    cf.fcfe = cf.fcff - laiVay * (1 - taxR) + cf.stDebt + cf.ltNew + cf.ltRepay + cf.revolver;
    // 7. Tổng & kiểm tra.
    const faNet = n.fa.reduce((s, x) => s + x.cost + x.acc, 0), gwNet = n.gw.cost + n.gw.acc;
    const assets = n.cash + n.assoc + BS_DRIVERS.filter((d) => d.side === 'A').reduce((s, d) => s + n[d.k], 0) + faNet + gwNet;
    const liab = BS_DRIVERS.filter((d) => d.side === 'L').reduce((s, d) => s + n[d.k], 0) + n.stDebt + n.ltDebt + n.revolver + n.plug;
    const equity = n.shareCap + n.retained + n.nci;
    const sh = n.shares;
    const is = { rev, cogs: -cogs, gp, selling: -ban, ga: -ql, otherFin: -tcKhac, otherInc: tnKhac, otherExp: -cpKhac, opProfit, ebit, intIncome: thuTc, cashInt: chuan ? laiGui : 0, finOp: tcHd, interest: -laiVay,
      assoc: lk, pbt, tax: -thue, taxRate: taxR, npat, nci: -nciP, npatP, eps: sh ? npatP / sh : null, shares: sh, da: khau + gwAm, ebitda: ebit + khau + gwAm,
      rST, rLT };
    const bs = { ...n, faNet, gwNet, assets, liab, equity, tle: liab + equity };
    const ratios = {
      dso: (n.ar / rev) * 365, dio: cogs ? (n.inv / cogs) * 365 : null, dpo: cogs ? (n.ap / cogs) * 365 : null,
      netDebt: n.stDebt + n.ltDebt + n.revolver - n.cash - n.stInv,
      lev: is.ebitda > 0 ? (n.stDebt + n.ltDebt + n.revolver - n.cash - n.stInv) / is.ebitda : null,
      roe: (p.shareCap + p.retained) > 0 ? npatP / (((p.shareCap + p.retained) + (n.shareCap + n.retained)) / 2) : null,
      cover: laiVay > 0 ? ebit / laiVay : null, dps: sh ? coTuc / sh : null, bvps: sh ? (n.shareCap + n.retained) / sh : null,
    };
    const tax = { pbt, charge: thue, rate: taxR, open: p.taxPay, paid: -cf.taxPaid, close: n.taxPay, dta: n.dta, dtl: n.dtl };
    const jv = { open: p.assoc, add: lkMoi, share: lk, div: -lkCoTuc, close: n.assoc };
    p = n;
    return { t, is, bs, cf, check: assets - (liab + equity), ratios, fa: n.fa, gwAm, tax, jv };
  });
  // 'excel': thu nhập tài chính (nằm trong FCFF) quá lớn so với EBIT, hoặc lợi suất trên tiền vượt xa lãi gửi → báo.
  if (!chuan && years.some((y) => y.is.ebit > 0 && y.is.intIncome / y.is.ebit > 0.2)) issues.push('finHeavy');
  const baseFaNet = fa0.reduce((s, x) => s + x.cost + x.acc, 0);
  return {
    fcffMode: chuan ? 'std' : 'excel', depRate, finOpPct,
    years, drivers: D, lives, issues, last, tyTrong, gwYears, stRate, ltRate, minCash,
    base: { ...base, fa: fa0, gw: gw0, faNet: baseFaNet, gwNet: gw0.cost + gw0.acc, assets: tsB, liab: nvB + base.plug, equity: vcB, tle: tsB },
    ok: years.every((y) => Math.abs(y.check) <= Math.max(1, Math.abs(y.bs.assets) * 1e-9) && Math.abs(y.cf.close - y.bs.cash) < 1),
  };
}
