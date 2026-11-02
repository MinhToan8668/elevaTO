// So sánh doanh nghiệp cùng ngành (trading comparables) — theo sheet 16.Comps của model elevaTO:
//   Giá quy đổi VND = giá × tỷ giá · Vốn hoá = giá VND × số cổ phiếu · EV = vốn hoá + nợ vay − tiền
//   EV/Doanh thu · EV/EBITDA · P/E = vốn hoá / LNST · P/B = vốn hoá / vốn chủ
//   Trung vị / trung bình của nhóm peer → giá trị ngầm định của công ty đang phân tích theo từng bội số.
// Khác model: lấy thêm tứ phân vị 25% / 75% để làm dải thấp / cao cho tab bội số, và bỏ bội số âm / vô nghĩa
// (EBITDA hay LNST âm) khỏi trung vị thay vì để chúng kéo lệch. Tiền tệ: mọi số tiền đã quy đổi về đồng.

const fin = (v) => Number.isFinite(v);
export const MULTS = ['evRev', 'evEbitda', 'pe', 'pb'];
const TOI_DA = 30;

/** Một peer: { name, country, price, fx, shares, cash, debt, rev, ebitda, npat, equity } — tiền bằng đồng. */
export function cleanPeers(list) {
  const so = (v, d = null) => (v !== null && v !== '' && fin(+v) && Math.abs(+v) < 1e18 ? +v : d);
  return (Array.isArray(list) ? list : []).slice(0, TOI_DA).map((p) => ({
    name: String(p?.name || '').slice(0, 80),
    country: String(p?.country || '').slice(0, 40),
    price: so(p?.price), fx: so(p?.fx, 1) || 1, shares: so(p?.shares),
    cash: so(p?.cash), debt: so(p?.debt), rev: so(p?.rev), ebitda: so(p?.ebitda), npat: so(p?.npat), equity: so(p?.equity),
    off: p?.off === true,
  })).filter((p) => p.name || p.price);
}

/** Bội số của một peer; bội số không tính được hoặc mẫu số ≤ 0 → null. */
export function peerMultiples(p) {
  const gia = fin(p.price) ? p.price * (p.fx || 1) : null;
  const cap = gia !== null && p.shares > 0 ? gia * p.shares : null;
  const ev = cap === null ? null : cap + (p.debt || 0) - (p.cash || 0);
  const chia = (a, b) => (a === null || !(b > 0) ? null : a / b);
  return { priceVnd: gia, cap, ev, evRev: chia(ev, p.rev), evEbitda: chia(ev, p.ebitda), pe: chia(cap, p.npat), pb: chia(cap, p.equity) };
}

/** Phân vị kiểu Excel PERCENTILE.INC (nội suy tuyến tính). */
export function quantile(xs, q) {
  const a = xs.filter(fin).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/**
 * @param peers danh sách peer (cleanPeers)
 * @param subj  số của công ty đang phân tích: { rev, ebitda, npat, equity, bridge(ev) → vốn chủ, shares, cap? }
 * @returns { rows, stats: {mult: {n, median, mean, q1, q3}}, implied: [{key, mult, metric, ev?, equity, price}] }
 */
export function compsAnalysis(peers, subj = {}) {
  const rows = cleanPeers(peers).map((p) => ({ ...p, m: peerMultiples(p) }));
  const dung = rows.filter((r) => !r.off);
  const stats = {};
  for (const k of MULTS) {
    // Bội số âm hoặc lớn phi lý (> 200 lần) là do mẫu số gần 0 — bỏ khỏi thống kê.
    const xs = dung.map((r) => r.m[k]).filter((x) => fin(x) && x > 0 && x < 200);
    stats[k] = { n: xs.length, median: quantile(xs, 0.5), mean: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null, q1: quantile(xs, 0.25), q3: quantile(xs, 0.75) };
  }
  const toEq = (ev) => (ev === null || !subj.bridge ? null : subj.bridge(ev));
  const ps = (eq) => (eq === null || !subj.shares ? null : eq / subj.shares);
  const implied = [];
  const them = (key, metric, laEv) => {
    const m = stats[key].median;
    if (m === null || !(metric > 0)) return;
    const ev = laEv ? m * metric : null;
    const eq = laEv ? toEq(ev) : m * metric;
    implied.push({ key, mult: m, metric, ev, equity: eq, price: ps(eq) });
  };
  them('evEbitda', subj.ebitda, true);
  them('evRev', subj.rev, true);
  them('pe', subj.npat, false);
  them('pb', subj.equity, false);
  return { rows, stats, implied };
}

/**
 * Dán bảng từ Excel (mỗi dòng một peer, cột cách nhau bằng Tab hoặc dấu chấm phẩy):
 *   Tên · Giá · Tỷ giá · Số CP · Tiền · Nợ vay · Doanh thu · EBITDA · LNST · Vốn chủ
 * Số tiền nhập theo đơn vị `unit` (ví dụ tỷ đồng = 1e9); giá theo đồng tiền niêm yết (× tỷ giá ra VND).
 * Đọc được cả "1.234,5" (kiểu Việt) và "1,234.5" (kiểu Anh); "185.000" (chỉ chấm, nhóm 3 chữ số) hiểu là
 * 185 nghìn như cách gõ ở Việt Nam — số lẻ thập phân thì gõ "22.1", "0.032". Dòng tiêu đề (không có số) tự bỏ.
 */
export function parsePeers(text, unit = 1) {
  const so = (s) => {
    let x = String(s ?? '').trim().replace(/\s/g, '');
    if (!x || x === '-' || x === '–') return null;
    const am = /^\(.*\)$/.test(x);
    x = x.replace(/[()]/g, '');
    if (/,\d{1,2}$/.test(x) || (/\./.test(x) && /,/.test(x) && x.lastIndexOf(',') > x.lastIndexOf('.'))) x = x.replace(/\./g, '').replace(',', '.');
    // Chỉ có dấu chấm, chia nhóm đúng 3 chữ số ("185.000", "1.462.238.655") → chấm ngăn nghìn kiểu Việt.
    else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
    else x = x.replace(/,/g, '');
    const v = Number(x);
    return fin(v) ? (am ? -v : v) : null;
  };
  const out = [];
  for (const dong of String(text || '').split(/\r?\n/)) {
    const c = dong.split(/\t|;/);
    if (c.length < 4) continue;
    const v = c.slice(1).map(so);
    if (v[0] === null) continue;                                 // dòng tiêu đề / không có giá
    const tien = (x) => (x === null ? null : x * unit);
    out.push({ name: c[0].trim(), price: v[0], fx: v[1] || 1, shares: v[2], cash: tien(v[3]), debt: tien(v[4]),
      rev: tien(v[5]), ebitda: tien(v[6]), npat: tien(v[7]), equity: tien(v[8]) });
  }
  return cleanPeers(out);
}
