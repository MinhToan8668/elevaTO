// Định giá tổng các phần (Sum-of-the-parts, SOTP) — cho doanh nghiệp nhiều mảng / tập đoàn có công ty con,
// cổ phần niêm yết, quỹ đất…: mỗi phần định giá theo cách hợp với nó rồi cộng lại.
//
//   Mỗi phần:  giá trị = bội số × chỉ tiêu (vd. EV/EBITDA × EBITDA của mảng, P/E × LNST, P/B × vốn chủ)
//              hoặc nhập thẳng một giá trị (DCF riêng, RNAV quỹ đất, giá thị trường của cổ phần niêm yết…)
//              × tỷ lệ sở hữu.  Phần nào là EV (giá trị doanh nghiệp, trước nợ) hay là equity (đã sau nợ).
//   Tổng:      Σ EV + Σ equity − (net debt + debt-like + NCI của công ty mẹ hợp nhất, khi có phần là EV)
//              × (1 − holding discount)  →  equity value SOTP, chia số cổ phiếu ra giá / cổ phiếu.
// Máy tính, AI không tham gia.

export const SOTP_KINDS = ['mult', 'value'];
export const SOTP_BASIS = ['ev', 'equity'];
export const DEFAULT_SOTP = { items: [], bridge: true, disc: 0 };

const so = (x, lo, hi) => (x !== null && x !== '' && Number.isFinite(+x) && +x >= lo && +x < hi ? +x : null);

/** Làm sạch thông số SOTP (từ phiên lưu / ô nhập). */
export function cleanSotp(x) {
  const o = x && typeof x === 'object' ? x : {};
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, 15).map((it) => ({
    name: String(it?.name || '').slice(0, 80),
    kind: SOTP_KINDS.includes(it?.kind) ? it.kind : 'mult',
    basis: SOTP_BASIS.includes(it?.basis) ? it.basis : 'ev',
    metric: so(it?.metric, -1e18, 1e18),
    mult: so(it?.mult, 0, 1000),
    value: so(it?.value, -1e18, 1e18),
    own: so(it?.own, 0, 1.000001) ?? 1,
  }));
  return { items, bridge: o.bridge !== false, disc: so(o.disc, 0, 0.9) ?? 0 };
}

/**
 * @param a kết quả dealAnalysis (cầu nối nợ ròng, số cổ phiếu)
 * @returns null khi chưa có phần nào có số, hoặc
 *   { rows: [{ ...item, gross, attr }], evSum, eqSum, less, total, discAmt, equity, price }
 */
export function sotpValuation(a, sotp) {
  const S = cleanSotp(sotp);
  const v = a.valuation;
  const rows = S.items.map((it) => {
    const gross = it.kind === 'mult' ? (it.metric !== null && it.mult !== null ? it.metric * it.mult : null) : it.value;
    return { ...it, gross, attr: gross === null ? null : gross * it.own };
  });
  const co = rows.filter((r) => r.attr !== null);
  if (!co.length) return { rows, evSum: 0, eqSum: 0, less: 0, total: null, discAmt: 0, equity: null, price: null };
  const evSum = co.filter((r) => r.basis === 'ev').reduce((s, r) => s + r.attr, 0);
  const eqSum = co.filter((r) => r.basis === 'equity').reduce((s, r) => s + r.attr, 0);
  // Phần tính theo EV chưa trừ nợ → trừ một lần nợ ròng, khoản tương đương nợ và NCI của số hợp nhất.
  const coEv = co.some((r) => r.basis === 'ev');
  const less = S.bridge && coEv ? (v.netDebt || 0) + v.debtLikeSum + (v.minority || 0) : 0;
  const total = evSum + eqSum - less;
  const discAmt = total > 0 ? total * S.disc : 0;
  const equity = total - discAmt;
  return { rows, evSum, eqSum, less, total, discAmt, equity, price: v.shares ? equity / v.shares : null };
}
