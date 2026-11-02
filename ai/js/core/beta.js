// Hồi quy beta từ chuỗi giá — như sheet 20.Beta_Data / ô 15.DCF!C17 của model: β = SLOPE(lợi suất cổ phiếu,
// lợi suất VN-Index) trên lợi suất ngày (hoặc tuần / tháng) 5 năm gần nhất.
//
// Dữ liệu dán từ Excel / file CSV, mỗi dòng một phiên: Ngày · Giá cổ phiếu · VN-Index (ngày có thể bỏ).
// Nếu hai cột số đều là số nhỏ (|x| < 0,5, có số âm) thì hiểu đó đã là LỢI SUẤT (như sheet WACC của model
// hợp nhất), không tính lại. Dòng tiêu đề, dòng thiếu số tự bỏ. Có ngày thì tự sắp theo thời gian.

const fin = (v) => Number.isFinite(v);

function so(s) {
  let x = String(s ?? '').trim().replace(/\s/g, '').replace(/%$/, '');
  if (!x) return null;
  if (/,\d+$/.test(x) && !/\.\d+$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  else x = x.replace(/,/g, '');
  const v = Number(x);
  return fin(v) ? v : null;
}
function ngay(s) {
  const x = String(s ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(x);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(x);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

/** @returns { rows: [{ t (ms|null), a, b }], kind: 'price'|'return' } */
export function parseSeries(text) {
  const rows = [];
  for (const dong of String(text || '').split(/\r?\n/)) {
    const c = dong.split(/\t|;|,(?=\s*[-\d])/).map((x) => x.trim()).filter((x) => x !== '');
    if (c.length < 2) continue;
    const t = ngay(c[0]);
    const nums = (t !== null ? c.slice(1) : c).map(so);
    if (nums.length < 2 || nums[0] === null || nums[1] === null) continue;
    rows.push({ t, a: nums[0], b: nums[1] });
  }
  if (rows.every((r) => r.t !== null)) rows.sort((x, y) => x.t - y.t);
  const nho = rows.length && rows.every((r) => Math.abs(r.a) < 0.5 && Math.abs(r.b) < 0.5) && rows.some((r) => r.a < 0 || r.b < 0);
  return { rows, kind: nho ? 'return' : 'price' };
}

/**
 * @param text dữ liệu dán
 * @param step 1 = theo phiên (ngày), 5 = theo tuần, 21 = theo tháng — lấy mẫu giá cách đều rồi tính lợi suất
 * @returns null nếu không đủ 20 quan sát, hoặc { beta, alpha, r2, n, from, to, kind, corr }
 */
export const regressBeta = (text, step = 1) => regress(parseSeries(text), step);

/**
 * Hồi quy thẳng trên dãy số (dữ liệu tải từ sàn qua Worker): KHÔNG đi qua bước đọc chữ, vì giá đã điều
 * chỉnh có 3 số lẻ ("21.523" nghìn đồng) sẽ bị hiểu nhầm là chấm ngăn nghìn kiểu Việt.
 * @param rows [[ngày 'YYYY-MM-DD', giá CP, chỉ số]…]
 */
export function regressRows(rows, step = 1) {
  const r = (rows || []).filter((x) => Array.isArray(x) && fin(+x[1]) && fin(+x[2]))
    .map(([d, a, b]) => ({ t: /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) : null, a: +a, b: +b }));
  if (r.every((x) => x.t !== null)) r.sort((x, y) => x.t - y.t);
  return regress({ rows: r, kind: 'price' }, step);
}

function regress({ rows, kind }, step) {
  let ra = [], rb = [];
  if (kind === 'return') { ra = rows.map((r) => r.a); rb = rows.map((r) => r.b); }
  else {
    const mau = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
    for (let i = 1; i < mau.length; i++) {
      const p0 = mau[i - 1], p1 = mau[i];
      if (!(p0.a > 0 && p0.b > 0 && p1.a > 0 && p1.b > 0)) continue;
      ra.push(p1.a / p0.a - 1); rb.push(p1.b / p0.b - 1);
    }
  }
  const n = ra.length;
  if (n < 20) return null;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0, vb = 0, va = 0;
  for (let i = 0; i < n; i++) { cov += (ra[i] - ma) * (rb[i] - mb); vb += (rb[i] - mb) ** 2; va += (ra[i] - ma) ** 2; }
  if (!vb) return null;
  const beta = cov / vb;
  const corr = va ? cov / Math.sqrt(va * vb) : 0;
  const co = rows.filter((r) => r.t !== null);
  return { beta, alpha: ma - beta * mb, r2: corr * corr, corr, n, kind,
    from: co.length ? co[0].t : null, to: co.length ? co[co.length - 1].t : null };
}
