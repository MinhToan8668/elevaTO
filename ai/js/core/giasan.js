// Lấy giá đóng cửa hằng ngày của một mã cổ phiếu và VN-Index từ API biểu đồ công khai của VNDirect,
// ghép theo ngày. Dùng chung ở HAI nơi:
//   · Worker (ai/worker/src/gia.js) — đường GET /gia, nhớ đệm 6 giờ;
//   · trang (ui/dealval.js) — gọi thẳng khi không tới được Worker (mạng công ty hay chặn *.workers.dev,
//     trình duyệt chỉ báo "Failed to fetch"). VNDirect trả Access-Control-Allow-Origin: * nên gọi được.
// Giá cổ phiếu tính bằng NGHÌN đồng, đã điều chỉnh chia tách / cổ tức — đúng thứ cần để tính lợi suất.

export const NGUON_GIA = 'https://dchart-api.vndirect.com.vn/dchart/history';
const CHI_SO = 'VNINDEX';

export const maHopLe = (ma) => /^[A-Z0-9]{3,10}$/.test(ma);

async function lay(fetchFn, ma, tu, den, them) {
  const u = `${NGUON_GIA}?resolution=D&symbol=${encodeURIComponent(ma)}&from=${tu}&to=${den}`;
  // KHÔNG gửi "accept: application/json": API này trả 406 cho tiêu đề đó (dù thân vẫn là JSON).
  const r = await fetchFn(u, { headers: { accept: '*/*', ...(them || {}) }, ...(them ? { cf: { cacheTtl: 6 * 3600 } } : {}) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d || !Array.isArray(d.t) || !Array.isArray(d.c) || d.t.length !== d.c.length) return new Map();
  const m = new Map();
  d.t.forEach((t, i) => { const c = Number(d.c[i]); if (Number.isFinite(c) && c > 0) m.set(new Date(t * 1000).toISOString().slice(0, 10), c); });
  return m;
}

/**
 * @param ma mã cổ phiếu (đã viết hoa) · nam số năm (1–10)
 * @param opts.fetchFn hàm fetch (kiểm thử thay bằng hàm giả) · opts.now mốc "hôm nay" · opts.headers tiêu đề thêm (Worker)
 * @returns { ok:true, data:{ ma, nguon, rows:[[ngày, giá CP, VN-Index]…], gia (đồng), ngay } }
 *          hoặc { ok:false, code: 'bad'|'upstream'|'khong_co'|'it_phien', info } — câu chữ do nơi gọi dựng (i18n / Worker)
 */
export async function layGiaSan(ma, nam, { fetchFn = fetch, now = Date.now(), headers } = {}) {
  if (!maHopLe(ma)) return { ok: false, code: 'bad', info: { ma } };
  const n = Math.min(10, Math.max(1, Math.round(Number(nam) || 5)));
  const den = Math.floor(now / 1000), tu = den - Math.round(n * 365.25 * 86400);
  let cp, cs;
  try { [cp, cs] = await Promise.all([lay(fetchFn, ma, tu, den, headers), lay(fetchFn, CHI_SO, tu, den, headers)]); }
  catch (e) { return { ok: false, code: 'upstream', info: { ma, msg: e.message } }; }
  if (!cp.size) return { ok: false, code: 'khong_co', info: { ma, n: 0 } };
  const rows = [...cp.keys()].filter((d) => cs.has(d)).sort().map((d) => [d, cp.get(d), cs.get(d)]);
  if (rows.length < 21) return { ok: false, code: 'it_phien', info: { ma, n: rows.length } };
  const cuoi = [...cp.keys()].sort().pop();
  return { ok: true, data: { ma, nguon: 'VNDirect', rows, gia: Math.round(cp.get(cuoi) * 1000), ngay: cuoi } };
}
