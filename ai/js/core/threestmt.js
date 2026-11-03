// Mô hình ba báo cáo liên kết (3-statement model): Kết quả kinh doanh · Cân đối kế toán · Lưu chuyển tiền tệ dự phóng,
// nối với nhau như một model Excel bài bản. Lấy chính các dòng dự phóng của phần DCF (revenue, giá vốn, SG&A, D&A,
// capex, vốn lưu động — kể cả các module chi tiết) và số dư THẬT của năm gốc trên BCTC đã trích.
//
//   KQKD:  EBIT (dự phóng) − lãi vay (lãi suất × dư nợ ĐẦU năm, không vòng lặp) + lãi tiền gửi (trên tiền đầu năm)
//          = LNTT → thuế = LNTT dương × thuế suất → LNST → phần cổ đông không kiểm soát (tỷ lệ lịch sử) → LNST cty mẹ
//   LCTT:  LNST + khấu hao − Δ vốn lưu động = CFO;  CFI = − capex;  CFF = vay mới − trả gốc ± revolver + phát hành − cổ tức
//   CĐKT:  tiền = tiền đầu năm + Δ tiền (LCTT);  TSCĐ = đầu năm + capex − khấu hao;  vốn lưu động = đầu năm + ΔNWC
//          vốn chủ cty mẹ = đầu năm + LNST cty mẹ − cổ tức + phát hành;  NCI = đầu năm + phần LNST của NCI
//          các khoản khác giữ nguyên số dư năm gốc  →  tổng tài sản = nợ + vốn chủ (dòng kiểm tra)
//   Revolver: tiền xuống dưới mức tối thiểu thì tự vay thêm; dư tiền thì trả revolver trước.
// Máy tính, AI không tham gia.

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const cong = (...xs) => (xs.every((x) => x === null) ? null : xs.reduce((s, x) => s + (x || 0), 0));

export const DEFAULT_FS = { cashRate: 0.03, payout: null, minCash: null, amort: 0, newDebt: [], issue: [] };

/** Làm sạch giả định tài chính của mô hình ba báo cáo. */
export function cleanFs(x) {
  const o = x && typeof x === 'object' ? x : {};
  const tl = (v, lo, hi, d) => (v !== null && v !== undefined && v !== '' && Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : d);
  const ds = (arr) => (Array.isArray(arr) ? arr : []).slice(0, 10).map((v) => (v !== null && v !== '' && Number.isFinite(+v) && Math.abs(+v) < 1e18 ? +v : null));
  return {
    cashRate: tl(o.cashRate, 0, 0.3, DEFAULT_FS.cashRate), payout: tl(o.payout, 0, 1, null), minCash: tl(o.minCash, 0, 1e18, null),
    amort: tl(o.amort, 0, 1, 0), newDebt: ds(o.newDebt), issue: ds(o.issue),
  };
}

/** Các dòng cân đối kế toán (đồng) đọc từ một kỳ — dùng cho cả năm gốc lẫn cột actual. */
export function bsLines(v, m) {
  const g = (k) => num(v[k]);
  const ta = g('BS:280');
  const cash = abs(g('BS:110')) ?? 0;
  const cashLike = m.cashLike ?? 0;
  // Vốn lưu động thương mại tách: phải thu KH (131), tồn kho (140), phải trả người bán (311) và phần còn lại (ròng):
  // trả trước người bán + phải thu theo tiến độ − người mua trả trước − phải trả theo tiến độ.
  const tradeA = abs(g('BS:131')) ?? 0;
  const inv = g('BS:140') === null ? 0 : abs(g('BS:140'));
  const ppe = m.ppe ?? 0;
  const tradeL = abs(g('BS:311')) ?? 0;
  const wcOther = (cong(abs(g('BS:132')), abs(g('BS:134'))) ?? 0) - (cong(abs(g('BS:312')), abs(g('BS:318'))) ?? 0);
  const debt = m.debt ?? 0;
  const minority = m.minority ?? 0;
  const equity = g('BS:400');
  if (ta === null || equity === null) return null;
  const equityParent = equity - minority;
  return {
    cash, cashLike, tradeA, inv, wcOther, ppe, otherA: ta - cash - cashLike - tradeA - inv - wcOther - ppe, ta,
    tradeL, debt, revolver: 0, otherL: ta - equity - debt - tradeL, tl: ta - equity,
    equityParent, minority, te: equity, tle: ta,
  };
}

/**
 * @param a  dealAnalysis · @param r dcfValuation (r.flows, r.d.kd, r.inputs.fs)
 * @returns null khi chưa có dự phóng / CĐKT năm gốc, hoặc
 *   { base, years: [{ t, is: {...}, bs: {...}, cf: {...}, check }], fs (giả định đã dùng), hist }
 */
export function threeStatement(a, r) {
  if (!r?.flows?.length) return null;
  const B = a.base, m0 = B.m;
  const base = bsLines(B.v, m0);
  if (!base) return { issue: 'noBs' };
  const fs = cleanFs(r.inputs.fs);
  const g = (k) => num(B.v[k]);
  const npat0 = g('IS:60'), npatP0 = g('IS:61') ?? npat0;
  // Tỷ lệ LNST thuộc cổ đông không kiểm soát và tỷ lệ chi trả cổ tức: theo năm gốc.
  const nciPct = npat0 > 0 && npatP0 !== null ? Math.min(0.9, Math.max(0, (npat0 - npatP0) / npat0)) : 0;
  const coTuc = abs(g('CF:36') ?? g('CF:T36'));
  const payout = fs.payout ?? (coTuc !== null && npatP0 > 0 ? Math.min(1, coTuc * (12 / (B.months || 12)) / npatP0) : 0);
  const kd = r.d.kd ?? 0.08;
  const minCash = fs.minCash ?? 0;
  const shares = a.valuation.shares;
  const rev0 = r.rev0 || 1;
  const wc0 = base.tradeA + base.inv - base.tradeL + base.wcOther;

  let p = { ...base };                              // số dư đầu năm (cuối năm trước)
  let wc = wc0;
  const years = r.flows.map((f) => {
    // KQKD
    const laiVay = (p.debt + p.revolver) * kd;
    const laiGui = (p.cash + p.cashLike) * fs.cashRate;
    const ebt = f.ebit - laiVay + laiGui;
    const thue = Math.max(0, ebt) * f.tax;
    const npat = ebt - thue;
    const nci = npat > 0 ? npat * nciPct : 0;
    const npatP = npat - nci;
    const is = { rev: f.rev, cogs: f.cogs, gp: f.gp, opex: f.gp - f.ebit, ebitda: f.ebitda, da: f.da, ebit: f.ebit, interest: -laiVay, intIncome: laiGui, ebt, tax: -thue, npat, nci: -nci, npatP,
      eps: shares ? npatP / shares : null };
    // LCTT
    const cfo = npat + f.da - f.dNwc;
    const cfi = -f.capex;
    const traGoc = p.debt * fs.amort;
    const vayMoi = fs.newDebt[f.t - 1] ?? 0;
    const phatHanh = fs.issue[f.t - 1] ?? 0;
    const coTucT = npatP > 0 ? npatP * payout : 0;
    let tien = p.cash + cfo + cfi - traGoc + vayMoi + phatHanh - coTucT;
    // Revolver: thiếu tiền dưới mức tối thiểu thì vay; dư thì trả revolver trước.
    let rv = 0;
    if (tien < minCash) rv = minCash - tien;
    else if (p.revolver > 0) rv = -Math.min(p.revolver, tien - minCash);
    tien += rv;
    const cff = -traGoc + vayMoi + rv + phatHanh - coTucT;
    const cf = { npat, da: f.da, dNwc: -f.dNwc, cfo, capex: -f.capex, cfi, repay: -traGoc, newDebt: vayMoi, revolver: rv, issue: phatHanh, div: -coTucT, cff, net: cfo + cfi + cff,
      open: p.cash, close: tien, fcff: f.fcff, fcfe: cfo + cfi - traGoc + vayMoi + rv };
    // CĐKT
    wc += f.dNwc;
    const ppe = p.ppe + f.capex - f.da;
    // Tách vốn lưu động: theo số ngày khi bật module, không thì các khoản lớn tăng theo doanh thu, phần còn lại vào "khác".
    const ar = f.wcd ? f.wcd.ar : base.tradeA * (f.rev / rev0);
    const inv = f.wcd ? f.wcd.inv : base.inv * (f.rev / rev0);
    const ap = f.wcd ? f.wcd.ap : base.tradeL * (f.rev / rev0);
    const wcKhac = wc - (ar + inv - ap);
    const n = {
      cash: tien, cashLike: p.cashLike, tradeA: ar, inv, ppe, otherA: p.otherA,
      tradeL: ap, debt: p.debt - traGoc + vayMoi, revolver: p.revolver + rv, otherL: p.otherL,
      equityParent: p.equityParent + npatP - coTucT + phatHanh, minority: p.minority + nci, wcOther: wcKhac,
    };
    // "Vốn lưu động khác" (trả trước, phải thu / phải trả khác trong vốn lưu động thương mại) là tài sản ròng.
    n.ta = n.cash + n.cashLike + n.tradeA + n.inv + n.ppe + n.otherA + wcKhac;
    n.tl = n.tradeL + n.debt + n.revolver + n.otherL;
    n.te = n.equityParent + n.minority;
    n.tle = n.tl + n.te;
    const check = n.ta - n.tle;
    const ebitda = f.ebitda;
    const ratios = {
      netDebt: n.debt + n.revolver - n.cash - n.cashLike, lev: ebitda > 0 ? (n.debt + n.revolver - n.cash - n.cashLike) / ebitda : null,
      roe: p.equityParent > 0 ? npatP / ((p.equityParent + n.equityParent) / 2) : null, cover: laiVay > 0 ? f.ebit / laiVay : null,
      dps: shares ? coTucT / shares : null, bvps: shares ? n.equityParent / shares : null,
    };
    p = n;
    return { t: f.t, is, cf, bs: n, check, ratios };
  });
  return { base, years, fs: { ...fs, payout, minCash, kd, nciPct }, ok: years.every((y) => Math.abs(y.check) <= Math.max(1, Math.abs(y.bs.ta) * 1e-9)) };
}
