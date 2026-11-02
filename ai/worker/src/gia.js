// Giá đóng cửa hằng ngày của một mã cổ phiếu và VN-Index, ghép theo ngày — để trang AI BCTC tự hồi
// quy beta (xem ai/js/core/beta.js) mà người dùng không phải đi chép dữ liệu giá.
//
// GET /gia?ma=DGW&nam=5  →  { ok:true, data:{ ma, nguon, rows:[[ngày 'YYYY-MM-DD', giá CP, VN-Index]…], gia } }
//   rows: chỉ các phiên CẢ HAI cùng có giá, cũ trước mới sau · gia: giá đóng cửa gần nhất (đồng / cổ phiếu)
//
// Nguồn: API biểu đồ công khai của VNDirect (định dạng TradingView: t / c / o / h / l / v), giá cổ phiếu
// tính bằng NGHÌN đồng và đã điều chỉnh chia tách / cổ tức — đúng thứ cần để tính lợi suất. Trang không
// gọi thẳng được vì CSP chỉ cho nói chuyện với Worker này. Nhớ đệm 6 giờ (giá ngày không đổi trong phiên).

const NGUON = 'https://dchart-api.vndirect.com.vn/dchart/history';
const CHI_SO = 'VNINDEX';
const DEM_GIAY = 6 * 3600;

const tl = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*',
    'cache-control': status === 200 && obj.ok ? `public, max-age=${DEM_GIAY}` : 'no-store',
  },
});
const loi = (code, error, status = 200) => tl({ ok: false, code, error }, status);

async function lay(fetchFn, ma, tu, den) {
  const u = `${NGUON}?resolution=D&symbol=${encodeURIComponent(ma)}&from=${tu}&to=${den}`;
  const r = await fetchFn(u, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (elevaTO)' }, cf: { cacheTtl: DEM_GIAY } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d || !Array.isArray(d.t) || !Array.isArray(d.c) || d.t.length !== d.c.length) return new Map();
  const m = new Map();
  d.t.forEach((t, i) => { const c = Number(d.c[i]); if (Number.isFinite(c) && c > 0) m.set(new Date(t * 1000).toISOString().slice(0, 10), c); });
  return m;
}

/** @param fetchFn để kiểm thử thay bằng hàm giả */
export async function giaCoPhieu(req, { fetchFn = fetch, now = Date.now() } = {}) {
  const url = new URL(req.url);
  const ma = String(url.searchParams.get('ma') || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,10}$/.test(ma)) return loi('bad', 'Mã cổ phiếu không hợp lệ (3–10 chữ / số, ví dụ DGW)', 400);
  const nam = Math.min(10, Math.max(1, Math.round(Number(url.searchParams.get('nam')) || 5)));
  const den = Math.floor(now / 1000), tu = den - Math.round(nam * 365.25 * 86400);
  let cp, cs;
  try { [cp, cs] = await Promise.all([lay(fetchFn, ma, tu, den), lay(fetchFn, CHI_SO, tu, den)]); }
  catch (e) { return loi('upstream', `Không lấy được giá từ VNDirect (${e.message}) — thử lại sau`); }
  if (!cp.size) return loi('khong_co', `Không có dữ liệu giá cho mã ${ma}`);
  const rows = [...cp.keys()].filter((d) => cs.has(d)).sort().map((d) => [d, cp.get(d), cs.get(d)]);
  if (rows.length < 21) return loi('khong_co', `Mã ${ma} chỉ có ${rows.length} phiên trùng với VN-Index — quá ít để hồi quy`);
  const cuoi = [...cp.keys()].sort().pop();
  return tl({ ok: true, data: { ma, nguon: 'VNDirect', donVi: 'nghìn đồng', rows, gia: Math.round(cp.get(cuoi) * 1000), ngay: cuoi } });
}
