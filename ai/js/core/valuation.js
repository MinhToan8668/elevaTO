// Định giá chiết khấu dòng tiền (DCF – FCFF) và tổng hợp giá mục tiêu, theo cách làm của model
// elevaTO (sheet 15.DCF, 16.Comps, 17.Valuation, 25.Quant_Checks):
//
//   WACC  = Wd × Kd × (1 − t) + We × Ke;  Ke = Rf + β điều chỉnh × ERP (+ phần bù riêng)
//           β điều chỉnh Blume = ⅔ β + ⅓;  tỷ trọng theo GIÁ TRỊ THỊ TRƯỜNG (giá × số cổ phiếu) khi có giá
//   FCFF  = EBIT × (1 − t) + khấu hao − capex thuần − Δ vốn lưu động  (dự phóng N năm, chiết khấu cuối năm)
//   TV    = FCFF năm cuối × (1 + g) / (WACC − g)  — đối chiếu bằng bội số EV/EBITDA lúc thoát
//   EV → vốn chủ: dùng chung cầu nối nợ ròng của tab M&A (nợ vay, tương đương nợ, NCI, tài sản ngoài hoạt động)
//
// Giả định mặc định giống model: trung bình 3 năm actual GẦN NHẤT (tự trượt khi thêm năm), người dùng
// ghi đè ô nào thì ô đó dùng số của người dùng. MÁY tính, AI không tham gia.

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const div = (a, b) => (a === null || b === null || !b ? null : a / b);
const avg = (xs) => { const a = xs.filter((x) => x !== null && Number.isFinite(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const kep = (x, lo, hi) => (x === null ? null : Math.min(hi, Math.max(lo, x)));

/** Thông số mặc định. null = máy tự tính từ BCTC (trung bình 3 năm gần nhất). */
export const DEFAULT_VAL = {
  price: null,            // giá thị trường hiện tại, đồng / cổ phiếu
  ticker: '',             // mã cổ phiếu (để tải giá từ sàn khi hồi quy beta)
  shares: null,           // số cổ phiếu lưu hành — ghi đè số đọc từ thuyết minh (null = dùng thuyết minh)
  rf: 0.0437,             // lợi suất TPCP 10 năm
  erp: 0.0813,            // phần bù rủi ro vốn cổ phần — Damodaran, Việt Nam
  beta: 1,                // beta thô (hồi quy với VN-Index)
  blume: true,            // điều chỉnh Blume ⅔β + ⅓
  extra: 0,               // phần bù rủi ro riêng (quy mô, thanh khoản…)
  kd: null,               // lãi vay trước thuế — mặc định = chi phí lãi vay / nợ vay bình quân
  tax: null,              // thuế suất — mặc định = thuế TNDN / LNTT bình quân
  g: 0.03,                // tăng trưởng dài hạn sau giai đoạn dự phóng
  years: 5,               // số năm dự phóng (1–10)
  growth: null,           // tăng trưởng doanh thu năm đầu — mặc định = CAGR các năm actual
  fade: true,             // tăng trưởng giảm dần đều về g ở năm cuối
  margin: null,           // biên EBIT (hoạt động cốt lõi, sau chuẩn hoá) / doanh thu
  da: null,               // khấu hao / doanh thu
  capex: null,            // capex thuần / doanh thu
  nwc: null,              // vốn lưu động thương mại / doanh thu
  exit: null,             // bội số EV/EBITDA lúc thoát để đối chiếu — mặc định = mức giữa tab bội số
  weights: { dcf: 50, pe: 25, evEbitda: 15, pb: 10, evRev: 0 },
  byYear: {},             // ghi đè theo năm: { growth: [năm1, năm2, …], margin: […], … } — null = dùng số chung   // evRev: theo trung vị peer (bảng so sánh)
};
/** Tham số sửa được theo từng năm dự phóng. */
export const BY_YEAR = ['growth', 'margin', 'da', 'capex', 'nwc', 'tax'];
const KHOA_TY_LE = ['rf', 'erp', 'extra', 'kd', 'tax', 'g', 'growth', 'margin', 'da', 'capex', 'nwc'];

/** Làm sạch thông số (từ phiên lưu / ô nhập): số lạ → mặc định; ô bỏ trống → null (máy tự tính). */
export function cleanVal(x) {
  const o = x && typeof x === 'object' ? x : {};
  const out = { ...DEFAULT_VAL, weights: { ...DEFAULT_VAL.weights } };
  for (const k of KHOA_TY_LE) {
    if (o[k] === null || o[k] === '' || o[k] === undefined) { if (DEFAULT_VAL[k] === null) out[k] = null; continue; }
    const v = +o[k];
    if (Number.isFinite(v) && v > -1 && v < 1) out[k] = v;
  }
  if (Number.isFinite(+o.price) && +o.price > 0 && +o.price < 1e9) out.price = +o.price;
  if (Number.isFinite(+o.shares) && +o.shares >= 1 && +o.shares < 1e13) out.shares = Math.round(+o.shares);
  if (Number.isFinite(+o.beta) && +o.beta >= 0 && +o.beta < 5) out.beta = +o.beta;
  if (Number.isInteger(+o.years) && +o.years >= 1 && +o.years <= 10) out.years = +o.years;
  if (Number.isFinite(+o.exit) && +o.exit > 0 && +o.exit < 100) out.exit = +o.exit;
  if (typeof o.blume === 'boolean') out.blume = o.blume;
  if (typeof o.ticker === 'string' && /^[A-Za-z0-9]{0,10}$/.test(o.ticker.trim())) out.ticker = o.ticker.trim().toUpperCase();
  if (typeof o.fade === 'boolean') out.fade = o.fade;
  const by = o.byYear && typeof o.byYear === 'object' ? o.byYear : {};
  out.byYear = {};
  for (const k of BY_YEAR) {
    if (!Array.isArray(by[k])) continue;
    const a = by[k].slice(0, 10).map((x) => (x !== null && x !== '' && Number.isFinite(+x) && +x > -1 && +x < 1 ? +x : null));
    if (a.some((x) => x !== null)) out.byYear[k] = a;
  }
  const w = o.weights && typeof o.weights === 'object' ? o.weights : {};
  for (const k of Object.keys(DEFAULT_VAL.weights)) if (Number.isFinite(+w[k]) && +w[k] >= 0 && +w[k] <= 100) out.weights[k] = +w[k];
  return out;
}

/**
 * Thuế suất hiệu dụng của một kỳ = (LNTT − LNST) / LNTT — gộp cả thuế hiện hành lẫn hoãn lại mà không
 * phụ thuộc công ty in chi phí thuế mang dấu gì. LNTT ≤ 0 thì không tính.
 */
function thueSuat(v) {
  const lntt = num(v['IS:50']), lnst = num(v['IS:60']);
  if (!lntt || lntt <= 0 || lnst === null) return null;
  return kep((lntt - lnst) / lntt, 0, 0.5);
}

/**
 * Tham số dự phóng máy tự suy từ BCTC: trung bình 3 năm actual gần nhất (cửa sổ tự trượt như AVERAGEIFS
 * của model), tăng trưởng = CAGR doanh thu trên cùng cửa sổ.
 * @param years các cột năm của tab M&A (dealAnalysis(...).cols lọc months = 12, không LTM)
 */
export function historyDrivers(years) {
  const ba = years.slice(-3);
  const m = ba.map((c) => c.m);
  const tyle = (f) => avg(m.map((x) => (x.rev ? div(f(x), x.rev) : null)));
  const r0 = m[0]?.rev, r1 = m[m.length - 1]?.rev;
  const growth = m.length >= 2 && r0 > 0 && r1 > 0 ? (r1 / r0) ** (1 / (m.length - 1)) - 1 : null;
  // Lãi vay trước thuế = chi phí lãi vay / nợ vay bình quân đầu – cuối năm.
  const kd = avg(ba.map((c, i) => {
    const truoc = i ? ba[i - 1].m.debt : years[years.indexOf(c) - 1]?.m.debt;
    const nb = c.m.debt === null ? null : truoc === null || truoc === undefined ? c.m.debt : (c.m.debt + truoc) / 2;
    return nb && c.m.laiVay ? c.m.laiVay / nb : null;
  }));
  return {
    growth: kep(growth, -0.2, 0.4),
    margin: tyle((x) => (x.adjEbitda === null ? null : x.adjEbitda - (x.kh || 0))),
    da: tyle((x) => x.kh),
    capex: tyle((x) => x.capexNet),
    nwc: tyle((x) => x.tradeWc),
    tax: avg(ba.map((c) => thueSuat(c.v))),
    kd: kep(kd, 0.02, 0.2),
    n: ba.length,
  };
}

/** Các năm actual (tối đa 5 năm gần nhất) với đúng các tỷ lệ mà phần dự phóng dùng — để người dùng thấy số lấy từ đâu. */
function lichSu(years) {
  return years.slice(-5).map((c, i, a) => {
    const m = c.m, rev = m.rev;
    const truoc = i ? a[i - 1].m.rev : null;
    const ebit = m.adjEbitda === null ? null : m.adjEbitda - (m.kh || 0);
    return { label: c.label, rev, growth: truoc > 0 && rev > 0 ? rev / truoc - 1 : null, ebit, margin: rev ? div(ebit, rev) : null,
      da: rev ? div(m.kh, rev) : null, capex: rev ? div(m.capexNet, rev) : null, nwc: rev ? div(m.tradeWc, rev) : null, tax: thueSuat(c.v), fcff: m.fcff };
  });
}

/** WACC theo CAPM. E theo giá thị trường khi có giá × số cổ phiếu, không thì vốn chủ sổ sách. */
export function wacc({ rf, erp, beta, blume, extra, kd, tax, debt, equityMkt, equityBook }) {
  const betaAdj = blume ? beta * 2 / 3 + 1 / 3 : beta;
  const ke = rf + betaAdj * erp + (extra || 0);
  const kdSau = kd * (1 - tax);
  const E = equityMkt || equityBook || 0, D = Math.max(0, debt || 0);
  const wd = D + E > 0 ? D / (D + E) : 0;
  return { betaAdj, ke, kdSau, wd, we: 1 - wd, wacc: wd * kdSau + (1 - wd) * ke, eBasis: equityMkt ? 'market' : 'book' };
}

/**
 * Dự phóng FCFF N năm từ doanh thu năm gốc.
 * @returns [{ t, rev, growth, ebit, nopat, da, capex, nwc, dNwc, ebitda, fcff }]
 */
export function projectFcff({ rev0, years, growth, fade, g, margin, da, capex, nwc, tax, byYear = {}, nwc0 = null }) {
  const out = [];
  // Ghi đè từng năm (như cột OVERRIDE của sheet 04.Drivers): byYear[k][t − 1] là số của năm t, null = dùng số chung.
  const lay = (k, t, chung) => (Number.isFinite(byYear[k]?.[t - 1]) ? byYear[k][t - 1] : chung);
  let rev = rev0, nwcTruoc = nwc0 ?? rev0 * nwc;
  for (let t = 1; t <= years; t++) {
    const gChung = fade && years > 1 ? growth + (g - growth) * (t - 1) / (years - 1) : growth;
    const gt = lay('growth', t, gChung), m = lay('margin', t, margin), d = lay('da', t, da), c = lay('capex', t, capex), n = lay('nwc', t, nwc), tx = lay('tax', t, tax);
    rev *= 1 + gt;
    const ebit = rev * m, khau = rev * d, cx = rev * c, wc = rev * n;
    const nopat = ebit * (1 - tx);
    const dNwc = wc - nwcTruoc;
    nwcTruoc = wc;
    out.push({ t, rev, growth: gt, margin: m, daPct: d, capexPct: c, nwcPct: n, tax: tx, ebit, nopat, da: khau, capex: cx, nwc: wc, dNwc, ebitda: ebit + khau, fcff: nopat + khau - cx - dNwc,
      ghiDe: Object.fromEntries(['growth', 'margin', 'da', 'capex', 'nwc', 'tax'].map((k) => [k, Number.isFinite(byYear[k]?.[t - 1])])) });
  }
  return out;
}

/** EV theo Gordon với dòng FCFF đã có (giữ nguyên dòng tiền, chỉ đổi WACC / g — như bảng độ nhạy của model). */
export function evAt(flows, w, g) {
  if (!(w > g)) return null;
  const n = flows.length;
  const pv = flows.reduce((s, f) => s + f.fcff / (1 + w) ** f.t, 0);
  const tv = flows[n - 1].fcff * (1 + g) / (w - g);
  return { pv, tv, pvTv: tv / (1 + w) ** n, ev: pv + tv / (1 + w) ** n };
}

/** Thang khuyến nghị của model: > +20% MUA · +10…+20% TÍCH LUỸ · ±10% NẮM GIỮ · −10…−20% KÉM KHẢ QUAN · < −20% BÁN. */
export const recommend = (up) => (up === null ? null : up > 0.2 ? 'buy' : up > 0.1 ? 'accumulate' : up > -0.1 ? 'hold' : up > -0.2 ? 'underperform' : 'sell');

/**
 * @param a  kết quả dealAnalysis (dùng chung cột kỳ, cầu nối nợ ròng, bội số)
 * @param inputs thông số (xem DEFAULT_VAL)
 */
export function dcfValuation(a, inputs) {
  const inp = cleanVal(inputs);
  if (!a) return null;
  const B = a.base.m, v = a.valuation;
  const years = a.cols.filter((c) => c.months === 12 && !c.ltm);
  const his = historyDrivers(years);
  const nam = 12 / (a.base.months || 12);
  const rev0 = B.rev === null ? null : B.rev * nam;
  const pick = (k, fb) => (inp[k] !== null && inp[k] !== undefined ? inp[k] : his[k] ?? fb);
  const d = {
    growth: pick('growth', 0.05), margin: pick('margin', null), da: pick('da', 0), capex: pick('capex', 0),
    nwc: pick('nwc', 0), tax: pick('tax', 0.2), kd: pick('kd', 0.08),
  };
  // Lãi vay suy từ BCTC hay thấp giả (lãi vốn hoá vào tài sản, vay ưu đãi, nợ vay cuối năm phình to):
  // không để thấp hơn Rf + 1 điểm % — doanh nghiệp không vay rẻ hơn Chính phủ.
  if (inp.kd === null && d.kd < inp.rf + 0.01) d.kd = inp.rf + 0.01;
  // Thuế suất suy từ BCTC lệch khỏi khoảng hợp lý (số trích sai / năm lỗ / ưu đãi thuế đặc biệt) → dùng 20%
  // (thuế suất TNDN phổ thông), báo rõ để người dùng tự nhập nếu doanh nghiệp được ưu đãi thật.
  const thueLa = inp.tax === null && his.tax !== null && (his.tax < 0.05 || his.tax > 0.35);
  if (thueLa) d.tax = 0.2;
  const used = Object.fromEntries(Object.keys(d).map((k) => [k, inp[k] !== null && inp[k] !== undefined ? 'user' : his[k] !== null && his[k] !== undefined ? 'hist' : 'default']));
  const shares = v.shares;
  const equityMkt = inp.price && shares ? inp.price * shares : null;
  const W = wacc({ rf: inp.rf, erp: inp.erp, beta: inp.beta, blume: inp.blume, extra: inp.extra, kd: d.kd, tax: d.tax,
    debt: B.debt || 0, equityMkt, equityBook: B.equityParent });
  const out = { inputs: inp, his, d, used, W, rev0, shares, marketCap: equityMkt, issues: thueLa ? ['taxOdd'] : [], hist: lichSu(years) };
  if (thueLa) used.tax = 'default';
  if (!rev0 || rev0 <= 0 || d.margin === null) { out.issues.push('noBase'); return out; }
  if (!(W.wacc > inp.g)) { out.issues.push('gOverWacc'); return out; }
  if (inp.g > inp.rf) out.issues.push('gOverRf');
  if (W.wacc < inp.rf + 0.02) out.issues.push('lowWacc');

  const flows = projectFcff({ rev0, years: inp.years, growth: d.growth, fade: inp.fade, g: inp.g, margin: d.margin, da: d.da, capex: d.capex, nwc: d.nwc, tax: d.tax, byYear: inp.byYear });
  const r = evAt(flows, W.wacc, inp.g);
  const toEq = (ev) => (ev === null ? null : ev - (v.netDebt || 0) - v.debtLikeSum - (v.minority || 0) + v.nonOpSum);
  const perShare = (eq) => (eq === null || !shares ? null : eq / shares);
  const last = flows[flows.length - 1];
  const exit = inp.exit ?? a.inputs.evEbitda[1];
  const tvExit = last.ebitda > 0 ? last.ebitda * exit : null;
  const evExit = tvExit === null ? null : r.pv + tvExit / (1 + W.wacc) ** flows.length;
  Object.assign(out, {
    flows, ...r, equity: toEq(r.ev), price: perShare(toEq(r.ev)),
    tvShare: r.ev ? r.pvTv / r.ev : null,
    impliedExit: last.ebitda > 0 ? r.tv / last.ebitda : null,
    exit: { mult: exit, ev: evExit, equity: toEq(evExit), price: perShare(toEq(evExit)),
      impliedG: tvExit ? (tvExit * W.wacc - last.fcff) / (tvExit + last.fcff) : null },
  });
  if (out.tvShare !== null && out.tvShare > 0.75) out.issues.push('tvHeavy');
  if (flows.some((f) => f.fcff < 0)) out.issues.push('negFcff');

  // Bảng độ nhạy 7 × 7: WACC ± 1,5 điểm %, g ± 1,5 điểm %, bước 0,5.
  const buoc = [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015];
  out.sens = {
    w: buoc.map((s) => W.wacc + s), g: buoc.map((s) => inp.g + s),
    grid: buoc.map((sg) => buoc.map((sw) => { const x = evAt(flows, W.wacc + sw, inp.g + sg); const eq = x && toEq(x.ev); return shares ? perShare(eq) : eq; })),
    perShare: !!shares,
  };
  return out;
}

/**
 * Định giá nhanh (25.Quant_Checks D): các neo "không tăng trưởng / bình thường hoá" để đối chiếu.
 * EPV = EPS / Ke · P/B hợp lý = (ROE − g)/(Ke − g) · Graham = √(22,5 × EPS × BVPS) · g ngầm định trong giá.
 */
export function quickAnchors(a, dcf) {
  const v = a.valuation, B = a.base.m, sh = v.shares;
  if (!sh || !dcf) return null;
  const ke = dcf.W.ke, g = dcf.inputs.g;
  const eps = v.earnings === null ? null : v.earnings / sh;
  const bvps = B.equityParent === null ? null : B.equityParent / sh;
  const roe = div(v.earnings, B.equityParent);
  const traCoTuc = abs(num(a.base.v['CF:36'] ?? a.base.v['CF:T36'] ?? null));
  const payout = traCoTuc !== null && v.earnings > 0 ? traCoTuc * (12 / (a.base.months || 12)) / v.earnings : null;
  const pe = dcf.inputs.price && eps > 0 ? dcf.inputs.price / eps : null;
  return {
    eps, bvps, roe, payout, ke, g,
    epv: eps > 0 && ke > 0 ? eps / ke : null,
    justPb: roe !== null && ke > g ? (roe - g) / (ke - g) : null,
    // ROE ≤ g thì P/B hợp lý ≤ 0 — mô hình không còn ý nghĩa (doanh nghiệp phá huỷ giá trị khi tăng trưởng).
    pbPrice: roe !== null && ke > g && roe > g && bvps > 0 ? ((roe - g) / (ke - g)) * bvps : null,
    graham: eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : null,
    impliedG: pe && payout !== null ? (pe * ke - payout) / (pe + payout) : null,
  };
}

/**
 * Giá mục tiêu bình quân gia quyền (17.Valuation): DCF + các bội số mức giữa (+ EV/Doanh thu theo trung vị
 * peer nếu có bảng so sánh, extra.evRev). Phương pháp nào không có số thì bỏ và chia lại trọng số.
 */
export function blendedTarget(a, dcf, extra = {}) {
  if (!dcf) return null;
  const w = dcf.inputs.weights, v = a.valuation;
  const giua = (key) => v.methods.find((m) => m.key === key)?.equity[1] ?? null;
  const rows = [
    { key: 'dcf', equity: dcf.equity ?? null },
    { key: 'pe', equity: giua('pe') },
    { key: 'evEbitda', equity: giua('evEbitda') },
    { key: 'pb', equity: giua('pb') },
    { key: 'evRev', equity: extra.evRev ?? null },
  ].map((r) => ({ ...r, weight: w[r.key] || 0, price: r.equity !== null && v.shares ? r.equity / v.shares : null }));
  const co = rows.filter((r) => r.equity !== null && r.equity > 0 && r.weight > 0);
  const tong = co.reduce((s, r) => s + r.weight, 0);
  if (!tong) return { rows, equity: null, price: null, upside: null, rec: null };
  const equity = co.reduce((s, r) => s + r.equity * r.weight, 0) / tong;
  const price = v.shares ? equity / v.shares : null;
  const upside = price !== null && dcf.inputs.price ? price / dcf.inputs.price - 1 : null;
  return { rows: rows.map((r) => ({ ...r, used: co.includes(r), share: co.includes(r) ? r.weight / tong : 0 })), equity, price, upside, rec: recommend(upside) };
}

/** Piotroski F-score (9 tiêu chí) giữa hai năm liền nhau; tiêu chí thiếu số thì bỏ, ghi vào `missing`. */
export function piotroski(cur, prev, sharesCur, sharesPrev) {
  const g = (o, k) => num(o[k]);
  const roa = (o) => div(g(o, 'IS:60'), g(o, 'BS:280'));
  const cfo = (o) => g(o, 'CF:20') ?? g(o, 'CF:T20');
  const ltd = (o) => div(abs(g(o, 'BS:339')) || 0, g(o, 'BS:280'));
  const cr = (o) => div(g(o, 'BS:100'), abs(g(o, 'BS:310')));
  const gm = (o) => div(g(o, 'IS:20'), g(o, 'IS:10'));
  const at = (o) => div(g(o, 'IS:10'), g(o, 'BS:280'));
  const ok = (x) => (x === null ? null : x ? 1 : 0);
  const so = (a, b, f) => (a === null || b === null ? null : f(a, b));
  const items = {
    roa: ok(roa(cur) === null ? null : roa(cur) > 0),
    cfo: ok(cfo(cur) === null ? null : cfo(cur) > 0),
    dRoa: ok(so(roa(cur), roa(prev), (a, b) => a > b)),
    accrual: ok(so(cfo(cur), g(cur, 'IS:60'), (a, b) => a > b)),
    leverage: ok(so(ltd(cur), ltd(prev), (a, b) => a <= b)),
    liquidity: ok(so(cr(cur), cr(prev), (a, b) => a > b)),
    shares: ok(so(num(sharesCur), num(sharesPrev), (a, b) => a <= b)),
    margin: ok(so(gm(cur), gm(prev), (a, b) => a > b)),
    turnover: ok(so(at(cur), at(prev), (a, b) => a > b)),
  };
  const co = Object.values(items).filter((x) => x !== null);
  if (co.length < 6) return null;
  const score = co.reduce((s, x) => s + x, 0);
  return { score, max: co.length, items, missing: Object.keys(items).filter((k) => items[k] === null),
    zone: score >= 7 ? 'safe' : score >= 4 ? 'grey' : 'risk' };
}
