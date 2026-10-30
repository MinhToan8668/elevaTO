// Tab "M&A & định giá": lớp phân tích kiểu thẩm định giao dịch (financial due diligence / quality of
// earnings) và thẩm định tín dụng doanh nghiệp, dựng trên chính bộ số đã trích.
//
//   1. LTM — 12 tháng gần nhất = năm gần nhất + lũy kế năm nay − lũy kế cùng kỳ năm trước (khi có báo cáo quý)
//   2. EBITDA chuẩn hoá — EBITDA báo cáo trừ các khoản KHÔNG thuộc hoạt động cốt lõi (thu nhập tài chính,
//      lãi/lỗ liên doanh liên kết, lợi nhuận khác, lãi bán BĐS đầu tư, chi phí tài chính ngoài lãi vay)
//   3. Cầu nối EV → giá trị vốn chủ: nợ vay, khoản tương đương nợ, tiền & khoản tương đương tiền,
//      tài sản ngoài hoạt động, lợi ích cổ đông không kiểm soát
//   4. Vốn lưu động: thương mại (phải thu + tồn kho + trả trước − phải trả − người mua trả trước) và hoạt động,
//      theo % doanh thu và mức bình quân các năm (gợi ý mức "peg" khi đàm phán giá)
//   5. Chất lượng lợi nhuận & rủi ro: tỷ lệ chuyển đổi tiền, dồn tích Sloan, Beneish M-score, Altman Z''
//   6. Định giá bội số EV/EBITDA, P/E, P/B (dải thấp / giữa / cao) và sức vay nợ theo nợ ròng / EBITDA mục tiêu
//
// Nguyên tắc như core/analysis.js: MÁY tính, AI không tham gia; mô-đun phát ra KHOÁ + SỐ, câu chữ do i18n.

import { computeTotals } from './statements.js';
import { periodLabel } from './table.js';

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const div = (a, b) => (a === null || b === null || !b ? null : a / b);
const sumN = (...xs) => (xs.every((x) => x === null) ? null : xs.reduce((a, x) => a + (x || 0), 0));

/** Bội số mặc định — mức tham khảo chung thị trường Việt Nam, người dùng sửa ngay trên tab. */
export const DEFAULT_INPUTS = {
  evEbitda: [5, 7, 9],
  pe: [8, 11, 14],
  pb: [0.8, 1.2, 1.6],
  targetLev: 3,          // nợ ròng / EBITDA tối đa ngân hàng chấp nhận (lần)
  adjustments: [],       // điều chỉnh tay vào EBITDA: [{ label, amount }] — đồng, + cộng vào / − trừ ra
};

/** Làm sạch bộ thông số người dùng nhập (từ phiên lưu / ô nhập). */
export function cleanInputs(x) {
  const o = x && typeof x === 'object' ? x : {};
  const ba = (v, d) => {
    if (!Array.isArray(v) || v.length !== 3) return d.slice();
    return v.map((n, i) => (Number.isFinite(+n) && +n >= 0 && +n < 1000 ? +n : d[i]));
  };
  const lev = Number.isFinite(+o.targetLev) && +o.targetLev > 0 && +o.targetLev < 50 ? +o.targetLev : DEFAULT_INPUTS.targetLev;
  const adjustments = (Array.isArray(o.adjustments) ? o.adjustments : []).slice(0, 20)
    .map((a) => ({ label: String(a?.label || '').slice(0, 120), amount: Number.isFinite(+a?.amount) ? +a.amount : 0 }))
    .filter((a) => a.label || a.amount);
  return { evEbitda: ba(o.evEbitda, DEFAULT_INPUTS.evEbitda), pe: ba(o.pe, DEFAULT_INPUTS.pe), pb: ba(o.pb, DEFAULT_INPUTS.pb), targetLev: lev, adjustments };
}

// ─── Kỳ phân tích ──────────────────────────────────────────

const laDong = (k) => k.startsWith('IS:') || k.startsWith('CF:');
const keyOf = (p) => `${p.year}-${p.endMonth || 12}-${p.months || 12}`;

/**
 * Cột kỳ cho tab: các kỳ năm, rồi kỳ gần nhất (nếu là giữa niên độ) và cột LTM khi đủ ba kỳ để ghép.
 * LTM chỉ ghép số dòng (KQKD, LCTT); số dư CĐKT lấy nguyên của kỳ gần nhất.
 */
export function dealPeriods(ds) {
  const all = (ds.periods || []).slice().sort((a, b) => (a.year - b.year) || ((a.endMonth || 12) - (b.endMonth || 12)) || ((a.months || 12) - (b.months || 12)));
  if (!all.length) return [];
  const V = (p) => computeTotals(ds.values?.[p.id] || {});
  const cols = all.filter((p) => (p.months || 12) === 12).map((p) => ({ id: p.id, label: periodLabel(p), year: p.year, months: 12, endMonth: p.endMonth || 12, v: V(p) }));
  // Kỳ gần nhất theo ngày kết thúc; cùng ngày lấy kỳ dài hơn (lũy kế đủ hơn riêng quý).
  const last = all.reduce((a, b) => {
    const da = a.year * 12 + (a.endMonth || 12), db = b.year * 12 + (b.endMonth || 12);
    return db > da || (db === da && (b.months || 12) > (a.months || 12)) ? b : a;
  });
  if ((last.months || 12) < 12) {
    const idx = new Map(all.map((p) => [keyOf(p), p]));
    const fy = all.find((p) => p.year === last.year - 1 && (p.months || 12) === 12 && (p.endMonth || 12) === 12);
    const ytdTruoc = idx.get(`${last.year - 1}-${last.endMonth}-${last.months}`);
    const vl = V(last);
    cols.push({ id: last.id, label: periodLabel(last), year: last.year, months: last.months, endMonth: last.endMonth, v: vl });
    if (fy && ytdTruoc) {
      const a = V(fy), b = V(ytdTruoc);
      const v = {};
      for (const k of new Set([...Object.keys(vl), ...Object.keys(a)])) {
        if (!laDong(k)) { if (Number.isFinite(vl[k])) v[k] = vl[k]; continue; }
        if ([a[k], vl[k], b[k]].every((x) => x === undefined || x === null)) continue;
        v[k] = (num(a[k]) || 0) + (num(vl[k]) || 0) - (num(b[k]) || 0);
      }
      // Tiền đầu / cuối kỳ của LCTT là số dư, không cộng trừ được.
      delete v['CF:60']; delete v['CF:70']; delete v['CF:61'];
      cols.push({ id: 'LTM', label: `LTM ${String(last.endMonth).padStart(2, '0')}/${last.year}`, year: last.year, months: 12, endMonth: last.endMonth, v, ltm: true, from: [fy.id, last.id, ytdTruoc.id] });
    }
  }
  return cols;
}

// ─── Các khối số của một kỳ ────────────────────────────────

/** @returns số đo của một cột kỳ (đồng). Hàm thuần, null khi thiếu số. */
export function measure(v, notes = {}) {
  const g = (k) => num(v[k]);
  const truc = g('CF:20') === null && g('CF:T20') !== null;
  const cf = (c) => g(truc ? `CF:T${c}` : `CF:${c}`);
  const rev = g('IS:10');
  const laiVay = abs(g('IS:24'));
  const kh = abs(cf('02'));
  const lntt = g('IS:50');
  const ebit = lntt === null ? null : lntt + (laiVay || 0);
  const ebitda = ebit === null ? null : ebit + (kh || 0);

  // Điều chỉnh chuẩn hoá: dấu là tác động lên EBITDA (− là trừ ra).
  const cpTaiChinhKhac = g('IS:23') === null ? null : Math.max(0, abs(g('IS:23')) - (laiVay || 0));
  const adj = [
    { key: 'finIncome', v: g('IS:22') === null ? null : -abs(g('IS:22')) },
    { key: 'finCostOther', v: cpTaiChinhKhac },
    { key: 'associates', v: g('IS:27') === null ? null : -g('IS:27') },
    { key: 'invProperty', v: g('IS:21') === null ? null : -g('IS:21') },
    { key: 'otherProfit', v: g('IS:40') === null ? null : -g('IS:40') },
  ].filter((a) => a.v !== null && a.v !== 0);
  const adjEbitda = ebitda === null ? null : ebitda + adj.reduce((a, x) => a + x.v, 0);

  // Cầu nối nợ ròng (số dư CĐKT, dương).
  const debt = sumN(abs(g('BS:321')), abs(g('BS:339')), abs(g('BS:340')));
  const prefShares = abs(g('BS:341'));
  const cash = abs(g('BS:110'));
  const cashLike = sumN(g('BS:121') === null ? null : g('BS:121') + (g('BS:122') || 0), abs(g('BS:123')));
  const netDebt = debt === null && cash === null ? null : (debt || 0) - (cash || 0) - (cashLike || 0);
  const debtLike = [
    { key: 'dividends', v: abs(g('BS:313')) },
    { key: 'provisions', v: sumN(abs(g('BS:322')), abs(g('BS:343'))) },
    { key: 'prefShares', v: prefShares },
    { key: 'ltTax', v: abs(g('BS:333')) },
  ].filter((x) => x.v);
  const nonOp = [
    { key: 'associatesInv', v: abs(g('BS:262')) },
    { key: 'otherInv', v: sumN(g('BS:263') === null ? null : g('BS:263') + (g('BS:264') || 0), abs(g('BS:265'))) },
    { key: 'investProperty', v: abs(g('BS:240')) },
    { key: 'loansOut', v: sumN(abs(g('BS:135x')), abs(g('BS:215x'))) },
  ].filter((x) => x.v);
  const minority = abs(g('BS:429'));

  // Vốn lưu động.
  const tradeWc = (() => {
    const ts = sumN(abs(g('BS:131')), abs(g('BS:132')), abs(g('BS:134')), g('BS:140'));
    const no = sumN(abs(g('BS:311')), abs(g('BS:312')), abs(g('BS:318')));
    return ts === null && no === null ? null : (ts || 0) - (no || 0);
  })();
  const opWc = (() => {
    if (tradeWc === null) return null;
    const them = sumN(g('BS:135'), g('BS:136'), abs(g('BS:150')));
    const tru = sumN(abs(g('BS:314')), abs(g('BS:315')), abs(g('BS:316')), abs(g('BS:319')), abs(g('BS:320')));
    return tradeWc + (them || 0) - (tru || 0);
  })();

  // Dòng tiền.
  const cfo = cf('20');
  const capexGross = abs(cf('21'));
  const capexNet = capexGross === null ? null : capexGross - Math.max(0, cf('22') || 0);
  const laiDaTra = abs(cf('14')) ?? abs(cf('04'));
  const fcff = cfo === null ? null : cfo + (truc ? 0 : (laiDaTra || 0)) - (capexNet || 0);
  const fcfe = cfo === null ? null : cfo - (capexNet || 0) + (cf('33') || 0) + (cf('34') || 0) + (cf('35') || 0);

  const npat = g('IS:60');
  const npatParent = g('IS:61') ?? npat;
  const equity = g('BS:400');
  const equityParent = equity === null ? null : equity - (minority || 0);
  const shares = num(notes.shares);
  return {
    rev, ebit, ebitda, adj, adjEbitda, kh, laiVay, npat, npatParent, equity, equityParent,
    debt, cash, cashLike, netDebt, debtLike, nonOp, minority,
    tradeWc, opWc, cfo, capexGross, capexNet, fcff, fcfe, shares,
    ta: g('BS:280'), tl: abs(g('BS:300')),
  };
}

// ─── Chất lượng lợi nhuận & rủi ro ─────────────────────────

/**
 * Beneish M-score (8 biến) giữa hai kỳ năm liền nhau. > −1,78 là vùng nghi ngờ "làm đẹp" lợi nhuận.
 * Thiếu biến nào thì biến đó lấy giá trị trung tính 1 (TATA = 0) và ghi vào `missing`.
 */
export function beneish(cur, prev) {
  const g = (o, k) => num(o[k]);
  const rec = (o) => abs(g(o, 'BS:131'));
  const rev = (o) => g(o, 'IS:10');
  const gm = (o) => div(g(o, 'IS:20'), rev(o));
  const ca = (o) => g(o, 'BS:100'), ppe = (o) => g(o, 'BS:220'), ta = (o) => g(o, 'BS:280');
  const dep = (o) => abs(g(o, 'CF:02'));
  const sga = (o) => sumN(abs(g(o, 'IS:25')), abs(g(o, 'IS:26')));
  const tl = (o) => abs(g(o, 'BS:300'));
  const missing = [];
  const lay = (key, v, neutral) => { if (v === null || !Number.isFinite(v)) { missing.push(key); return neutral; } return v; };
  const tile = (f) => div(f(cur), f(prev));
  const v = {
    DSRI: lay('DSRI', div(div(rec(cur), rev(cur)), div(rec(prev), rev(prev))), 1),
    GMI: lay('GMI', div(gm(prev), gm(cur)), 1),
    AQI: lay('AQI', div(1 - (ca(cur) + ppe(cur)) / ta(cur), 1 - (ca(prev) + ppe(prev)) / ta(prev)), 1),
    SGI: lay('SGI', tile(rev), 1),
    DEPI: lay('DEPI', div(div(dep(prev), dep(prev) + ppe(prev)), div(dep(cur), dep(cur) + ppe(cur))), 1),
    SGAI: lay('SGAI', div(div(sga(cur), rev(cur)), div(sga(prev), rev(prev))), 1),
    LVGI: lay('LVGI', div(div(tl(cur), ta(cur)), div(tl(prev), ta(prev))), 1),
    TATA: lay('TATA', div(sumN(g(cur, 'IS:60'), g(cur, 'CF:20') === null ? null : -g(cur, 'CF:20')), ta(cur)), 0),
  };
  if (missing.length > 3) return null;          // quá nửa biến phải đoán thì điểm không còn nghĩa
  const m = -4.84 + 0.92 * v.DSRI + 0.528 * v.GMI + 0.404 * v.AQI + 0.892 * v.SGI + 0.115 * v.DEPI
    - 0.172 * v.SGAI + 4.679 * v.TATA - 0.327 * v.LVGI;
  return { score: m, vars: v, missing, zone: m > -1.78 ? 'risk' : m > -2.22 ? 'grey' : 'safe' };
}

/** Altman Z'' cho thị trường mới nổi (Altman 2005): 3,25 + 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4. */
export function altmanEM(v) {
  const g = (k) => num(v[k]);
  const ta = g('BS:280');
  if (!ta || ta <= 0) return null;
  const tl = abs(g('BS:300'));
  const lntt = g('IS:50'), lv = abs(g('IS:24'));
  const x = {
    X1: div((g('BS:100') ?? 0) - (abs(g('BS:310')) ?? 0), ta),
    X2: div(g('BS:420'), ta),
    X3: lntt === null ? null : (lntt + (lv || 0)) / ta,
    X4: div(g('BS:400'), tl),
  };
  if (Object.values(x).some((n) => n === null)) return null;
  const z = 3.25 + 6.56 * x.X1 + 3.26 * x.X2 + 6.72 * x.X3 + 1.05 * x.X4;
  return { score: z, vars: x, zone: z > 5.85 ? 'safe' : z > 4.15 ? 'grey' : 'risk' };
}

// ─── Tổng hợp ──────────────────────────────────────────────

/**
 * @param ds dataset
 * @param inputs bội số / đòn bẩy mục tiêu / điều chỉnh tay (xem DEFAULT_INPUTS)
 * @returns null nếu chưa có kỳ, hoặc
 *   { cols: [{ id, label, ltm?, m }], base, baseIdx, valuation, capacity, quality, flags, wcAvg }
 *   base: cột dùng định giá (LTM nếu có, không thì năm gần nhất, không thì kỳ gần nhất)
 */
export function dealAnalysis(ds, inputs) {
  const inp = cleanInputs(inputs);
  const periods = dealPeriods(ds);
  if (!periods.length) return null;
  const notesOf = (id) => (ds.notes && ds.notes[id]) || {};
  const cols = periods.map((p) => ({ ...p, m: measure(p.v, p.ltm ? notesOf(p.from[1]) : notesOf(p.id)) }));
  const baseIdx = (() => {
    const l = cols.findIndex((c) => c.ltm);
    if (l >= 0) return l;
    for (let i = cols.length - 1; i >= 0; i--) if (cols[i].months === 12) return i;
    return cols.length - 1;
  })();
  const base = cols[baseIdx];
  const B = base.m;
  // Số cổ phiếu: kỳ gốc, không có thì kỳ gần nhất có ghi.
  const shares = B.shares ?? [...cols].reverse().find((c) => c.m.shares)?.m.shares ?? null;
  const manual = inp.adjustments.reduce((a, x) => a + x.amount, 0);
  const ebitdaVal = B.adjEbitda === null ? null : B.adjEbitda + manual;
  // Thu nhập trên năm: kỳ giữa niên độ không có LTM thì quy năm cho P/E.
  const nam = 12 / (base.months || 12);
  const earnings = B.npatParent === null ? null : B.npatParent * nam;
  const ebitdaNam = ebitdaVal === null ? null : ebitdaVal * nam;

  const debtLikeSum = B.debtLike.reduce((a, x) => a + x.v, 0);
  const nonOpSum = B.nonOp.reduce((a, x) => a + x.v, 0);
  const bridge = (ev) => (ev === null ? null : ev - (B.netDebt || 0) - debtLikeSum - (B.minority || 0) + nonOpSum);
  const perShare = (eq) => (eq === null || !shares ? null : eq / shares);
  const ba = (f) => [0, 1, 2].map(f);
  const methods = [];
  if (ebitdaNam !== null && ebitdaNam > 0) {
    const ev = ba((i) => ebitdaNam * inp.evEbitda[i]);
    const eq = ev.map(bridge);
    methods.push({ key: 'evEbitda', mult: inp.evEbitda, ev, equity: eq, perShare: eq.map(perShare) });
  }
  if (earnings !== null && earnings > 0) {
    const eq = ba((i) => earnings * inp.pe[i]);
    methods.push({ key: 'pe', mult: inp.pe, equity: eq, perShare: eq.map(perShare) });
  }
  if (B.equityParent !== null && B.equityParent > 0) {
    const eq = ba((i) => B.equityParent * inp.pb[i]);
    methods.push({ key: 'pb', mult: inp.pb, equity: eq, perShare: eq.map(perShare) });
  }
  const valuation = {
    ebitda: ebitdaVal, ebitdaAnnual: ebitdaNam, manual, earnings, shares,
    netDebt: B.netDebt, debtLike: B.debtLike, debtLikeSum, nonOp: B.nonOp, nonOpSum, minority: B.minority,
    methods,
    range: methods.length ? [Math.min(...methods.map((x) => x.equity[0])), Math.max(...methods.map((x) => x.equity[2]))] : null,
    annualized: nam !== 1,
  };

  // Sức vay nợ (góc nhìn ngân hàng): nợ ròng tối đa = EBITDA × đòn bẩy mục tiêu.
  const capacity = ebitdaNam !== null && ebitdaNam > 0 ? (() => {
    const maxNet = ebitdaNam * inp.targetLev;
    const lev = B.netDebt === null ? null : B.netDebt / ebitdaNam;
    const dscr = (() => {
      // DSCR xấp xỉ = (EBITDA − thuế đã nộp − capex thuần) / (lãi vay + gốc trả RÒNG trong kỳ).
      // Gốc lấy ròng (trả gốc − vay mới, không âm) vì vay ngắn hạn ở Việt Nam quay vòng liên tục:
      // cộng nguyên dòng "tiền trả nợ gốc" thì gần như doanh nghiệp nào cũng ra DSCR < 0,1.
      const g = (k) => num(base.v[k]);
      const thue = abs(g('CF:15')) || 0;
      const goc = Math.max(0, (abs(g('CF:34')) || 0) + (abs(g('CF:35')) || 0) - (abs(g('CF:33')) || 0));
      const traNo = ((B.laiVay || 0) + goc) * nam;
      return traNo ? (ebitdaNam - (thue + (B.capexNet || 0)) * nam) / traNo : null;
    })();
    return { target: inp.targetLev, lev, maxNet, headroom: B.netDebt === null ? null : maxNet - B.netDebt, dscr };
  })() : null;

  // Chất lượng lợi nhuận.
  const years = cols.filter((c) => c.months === 12 && !c.ltm);
  const lastY = years[years.length - 1], prevY = years[years.length - 2];
  const avgTA = (() => {
    if (!lastY) return null;
    const a = lastY.m.ta, b = prevY ? prevY.m.ta : null;
    return a === null ? null : b === null ? a : (a + b) / 2;
  })();
  const quality = {
    cashConv: div(B.cfo, B.ebitda),
    capexConv: B.ebitda && B.capexNet !== null ? (B.ebitda - B.capexNet) / B.ebitda : null,
    accrual: lastY && avgTA ? div(sumN(lastY.m.npat, lastY.m.cfo === null ? null : -lastY.m.cfo), avgTA) : null,
    nonCoreShare: B.ebitda && B.ebitda > 0 ? -B.adj.filter((a) => a.v < 0).reduce((s, a) => s + a.v, 0) / B.ebitda : null,
    beneish: lastY && prevY ? beneish(lastY.v, prevY.v) : null,
    altman: altmanEM(base.v),
    year: lastY ? lastY.label : null,
  };

  // Vốn lưu động: bình quân % doanh thu các kỳ năm.
  const wcPct = years.map((c) => div(c.m.tradeWc, c.m.rev)).filter((x) => x !== null);
  const wcAvg = wcPct.length ? wcPct.reduce((a, b) => a + b, 0) / wcPct.length : null;
  const wcPeg = wcAvg !== null && B.rev ? wcAvg * B.rev * nam : null;

  // Cảnh báo giao dịch: khoá + số, câu chữ ở i18n `dl.flag.*`.
  const flags = [];
  const bat = (id, params = {}) => flags.push({ id, params });
  if (quality.nonCoreShare !== null && quality.nonCoreShare > 0.25) bat('nonCore', { v: quality.nonCoreShare * 100 });
  if (quality.cashConv !== null && quality.cashConv < 0.5) bat('lowConversion', { v: quality.cashConv * 100 });
  if (quality.accrual !== null && quality.accrual > 0.1) bat('highAccrual', { v: quality.accrual * 100 });
  if (quality.beneish && quality.beneish.zone === 'risk') bat('beneish', { v: quality.beneish.score });
  if (quality.altman && quality.altman.zone === 'risk') bat('altman', { v: quality.altman.score });
  if (capacity && capacity.lev !== null && capacity.lev > capacity.target) bat('overLevered', { v: capacity.lev, t: capacity.target });
  if (capacity && capacity.dscr !== null && capacity.dscr < 1.2) bat('dscrLow', { v: capacity.dscr });
  if (debtLikeSum && B.ebitda && debtLikeSum > 0.5 * Math.abs(B.ebitda)) bat('debtLike', { v: debtLikeSum });
  if (wcPeg !== null && B.tradeWc !== null && wcPeg && (B.tradeWc - wcPeg) / Math.abs(wcPeg) < -0.2) bat('wcBelowPeg', { v: B.tradeWc - wcPeg });
  if (B.minority && B.equity && B.minority / B.equity > 0.3) bat('minority', { v: (B.minority / B.equity) * 100 });

  return { cols, base, baseIdx, valuation, capacity, quality, wcAvg, wcPeg, flags, inputs: inp };
}
