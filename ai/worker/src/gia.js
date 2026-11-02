// GET /gia?ma=DGW&nam=5 — giá đóng cửa cổ phiếu + VN-Index (VNDirect) ghép theo ngày, để trang AI BCTC tự hồi
// quy beta. Phần lấy và ghép giá dùng chung với trang: ai/js/core/giasan.js (trang gọi thẳng khi mạng chặn
// Worker). Ở đây chỉ thêm kiểm tham số, mã lỗi HTTP và nhớ đệm 6 giờ (giá ngày không đổi trong phiên).
//   → { ok:true, data:{ ma, nguon, donVi, rows:[[ngày 'YYYY-MM-DD', giá CP, VN-Index]…], gia, ngay } }

import { layGiaSan, maHopLe } from '../../js/core/giasan.js';

const DEM_GIAY = 6 * 3600;
const tl = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*',
    'cache-control': status === 200 && obj.ok ? `public, max-age=${DEM_GIAY}` : 'no-store',
  },
});

/** @param fetchFn để kiểm thử thay bằng hàm giả */
export async function giaCoPhieu(req, { fetchFn = fetch, now = Date.now() } = {}) {
  const url = new URL(req.url);
  const ma = String(url.searchParams.get('ma') || '').trim().toUpperCase();
  if (!maHopLe(ma)) return tl({ ok: false, code: 'bad', error: 'Mã cổ phiếu không hợp lệ (3–10 chữ / số, ví dụ DGW)' }, 400);
  const r = await layGiaSan(ma, url.searchParams.get('nam'), { fetchFn, now, headers: { 'user-agent': 'Mozilla/5.0 (compatible; elevaTO)' } });
  return tl(r.ok ? r : { ok: false, code: r.code === 'it_phien' ? 'khong_co' : r.code, error: CAU[r.code](r.info) });
}

const CAU = {
  bad: () => 'Mã cổ phiếu không hợp lệ (3–10 chữ / số, ví dụ DGW)',
  upstream: (i) => `Không lấy được giá từ VNDirect (${i.msg}) — thử lại sau`,
  khong_co: (i) => `Không có dữ liệu giá cho mã ${i.ma}`,
  it_phien: (i) => `Mã ${i.ma} chỉ có ${i.n} phiên trùng với VN-Index — quá ít để hồi quy`,
};
