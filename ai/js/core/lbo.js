// Mô hình mua lại bằng vốn vay (LBO) — dùng chính dòng tiền đã dự phóng ở phần DCF (EBITDA, capex, ΔNWC, thuế
// suất) nên đổi giả định dự phóng nào thì LBO đổi theo.
//
//   Vào:   EV mua = EBITDA chuẩn hoá × bội số vào; dùng vốn = EV + phí giao dịch
//          nguồn vốn = nợ senior (× EBITDA) + nợ mezzanine (× EBITDA) + vốn chủ quỹ (phần còn lại)
//   Mỗi năm: lãi = lãi suất × dư nợ đầu năm; thuế = (EBIT − lãi) × t (không âm)
//          dòng tiền trả nợ = EBITDA − capex − ΔNWC − thuế − lãi; trả gốc senior bắt buộc (% gốc ban đầu),
//          phần dư quét (cash sweep) trả thêm senior, còn lại giữ làm tiền mặt
//   Ra:    EV thoát = EBITDA năm thoát × bội số thoát; vốn chủ thoát = EV − nợ còn lại + tiền mặt
//          IRR = (vốn chủ thoát / vốn chủ vào)^(1/năm) − 1 · MOIC = vốn chủ thoát / vốn chủ vào
// Bội số vào tối đa để đạt IRR mục tiêu (giải bằng chia đôi) → mức giá cao nhất quỹ đầu tư trả được: một "sàn"
// định giá theo góc nhìn nhà đầu tư tài chính, đưa sang football field / giá mục tiêu.

/**
 * @param a  dealAnalysis (EBITDA chuẩn hoá năm, cầu nối nợ, số cổ phiếu)
 * @param r  dcfValuation (r.flows, r.inputs.lbo)
 * @param o  ghi đè { entry, exit } khi tính bảng độ nhạy / giải bội số
 */
export function lboAnalysis(a, r, o = {}) {
  if (!r?.flows?.length) return null;
  const L = r.inputs.lbo, v = a.valuation;
  const e0 = v.ebitdaAnnual;
  if (!(e0 > 0)) return { issue: 'noEbitda' };
  const thiTruong = r.inputs.price && v.shares ? (r.inputs.price * v.shares + (v.netDebt || 0) + v.debtLikeSum + (v.minority || 0) - v.nonOpSum) / e0 : null;
  const entry = o.entry ?? L.entry ?? (thiTruong > 0 ? thiTruong : a.inputs.evEbitda[1]);
  const exit = o.exit ?? L.exit ?? entry;
  const N = Math.min(L.years ?? r.flows.length, r.flows.length);
  const ev = e0 * entry, fees = ev * L.fees, uses = ev + fees;
  const senior0 = e0 * L.sX, mezz0 = e0 * L.mX;
  const equity0 = uses - senior0 - mezz0;
  if (!(equity0 > 0)) return { issue: 'overLevered', entry, exit, ev, fees, uses, senior0, mezz0, equity0 };
  let s = senior0, m = mezz0, cash = 0;
  const rows = [];
  for (let t = 1; t <= N; t++) {
    const f = r.flows[t - 1];
    const intS = s * L.sRate, intM = m * L.mRate, lai = intS + intM;
    const thue = Math.max(0, f.ebit - lai) * f.tax;
    const cfads = f.ebitda - f.capex - f.dNwc - thue;
    const sauLai = cfads - lai;
    const batBuoc = Math.min(s, senior0 * L.sAmort);
    const du = sauLai - batBuoc;
    // Chỉ quét phần tiền thật sự dư: bù hết phần thiếu hụt của các năm trước (tiền mặt âm) rồi mới trả thêm nợ.
    const duThat = Math.max(0, Math.min(du, cash + du));
    const quet = Math.min(s - batBuoc, duThat * L.sweep);
    s -= batBuoc + quet;
    cash += du - quet;
    // Đòn bẩy, khả năng trả lãi và bội số thoát theo EBITDA hoạt động — cùng định nghĩa với EBITDA lúc vào (chuẩn hoá).
    const eOp = f.ebitdaOp ?? f.ebitda;
    rows.push({ t, ebitda: f.ebitda, ebitdaOp: eOp, capex: f.capex, dNwc: f.dNwc, tax: thue, cfads, intS, intM, mandatory: batBuoc, sweep: quet, senior: s, mezz: m, cash,
      lev: eOp > 0 ? (s + m) / eOp : null, cover: lai > 0 ? eOp / lai : null });
  }
  const last = rows[N - 1];
  const evOut = (last.ebitdaOp ?? last.ebitda) * exit;
  const equityOut = evOut - last.senior - last.mezz + last.cash;
  const moic = equityOut / equity0;
  const irr = equityOut > 0 ? moic ** (1 / N) - 1 : -1;
  const issues = [];
  if (rows.some((x) => x.cash < 0)) issues.push('shortfall');
  if (rows[0].cover !== null && rows[0].cover < 2) issues.push('lowCover');
  return { entry, exit, years: N, ev, fees, uses, senior0, mezz0, equity0, rows, evOut, equityOut, moic, irr, issues, marketEntry: thiTruong };
}

/** Bảng IRR theo bội số vào × bội số thoát (± 1 lần, bước 0,5). */
export function lboGrid(a, r, base) {
  const buoc = [-1, -0.5, 0, 0.5, 1];
  return {
    entry: buoc.map((x) => base.entry + x), exit: buoc.map((x) => base.exit + x),
    irr: buoc.map((x) => buoc.map((y) => { const k = lboAnalysis(a, r, { entry: base.entry + x, exit: base.exit + y }); return k?.irr ?? null; })),
  };
}

/**
 * Bội số vào tối đa để quỹ vẫn đạt IRR mục tiêu (bội số thoát giữ như đang đặt) → EV, vốn chủ, giá / cổ phiếu tương ứng.
 * @returns null khi không giải được (kể cả bội số rất thấp cũng không đạt IRR).
 */
export function lboMaxEntry(a, r, base) {
  const target = r.inputs.lbo.irr;
  const irrAt = (x) => { const k = lboAnalysis(a, r, { entry: x, exit: base.exit }); return k && !k.issue ? k.irr : null; };
  const L = r.inputs.lbo;
  // Bội số vào phải lớn hơn tổng nợ vay (× EBITDA) thì quỹ mới phải bỏ vốn chủ.
  let lo = (L.sX + L.mX) / (1 + L.fees) + 0.25, hi = 40;
  const iLo = irrAt(lo);
  if (iLo === null || iLo < target) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2, x = irrAt(mid);
    if (x !== null && x >= target) lo = mid; else hi = mid;
  }
  const v = a.valuation, e0 = v.ebitdaAnnual;
  const ev = e0 * lo;
  const equity = ev - (v.netDebt || 0) - v.debtLikeSum - (v.minority || 0) + v.nonOpSum;
  return { entry: lo, ev, equity, price: v.shares ? equity / v.shares : null, irr: target };
}
