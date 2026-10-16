// Đối chiếu NGƯỢC: số đọc từ THUYẾT MINH phải cộng lại đúng bằng dòng trên ba bảng chính.
//
// Vì sao cần: thuyết minh là bảng ma trận nhiều cột, in nhỏ, hay kéo dài sang trang sau — chỗ AI đọc
// sai nhiều nhất, mà sai thì không có gì tự phát hiện: model vẫn điền được, biểu đồ vẫn vẽ được, chỉ
// là sai số. Mỗi bảng thuyết minh đều có một dòng trên CĐKT / KQKD / LCTT để soi lại, nên cộng số
// thuyết minh rồi so với dòng ấy là bắt được ngay.
//
// Hai mức:
//   'warn' — gần như chắc là đọc sai (nguyên giá TSCĐ, dư nợ vay, bảng biến động không tự khớp).
//   'info' — có thể lệch chính đáng, chỉ để người dùng biết mà kiểm (doanh thu theo mảng có loại trừ
//            nội bộ; hao mòn giảm khi thanh lý; cổ tức trên LCTT là tiền ĐÃ TRẢ, thuyết minh là số
//            ĐÃ QUYẾT NGHỊ, hai số lệch nhau phần còn phải trả).
// Mọi số ở đây đã quy về ĐỒNG. Mô-đun chỉ phát ra khoá + con số, câu chữ do ui/review.js dịch.

import { computeTotals } from './statements.js';

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
/** Cộng các số có thật; cả dãy đều trống thì trả null (khác hẳn với cộng ra 0). */
const cong = (xs) => { const c = xs.filter(Number.isFinite); return c.length ? c.reduce((a, b) => a + b, 0) : null; };

/**
 * @param ds dataset (periods, values, notes)
 * @param opts { unit } đơn vị in trên BCTC, để tính sai số làm tròn
 * @returns { [mã kỳ]: [{ id, severity, reported, computed, diff, name? }] }
 *          reported = số trên bảng chính · computed = số cộng từ thuyết minh
 */
export function reconcile(ds, { unit = 1 } = {}) {
  const out = {};
  for (const p of ds.periods || []) {
    const no = ds.notes?.[p.id];
    if (!no) continue;
    const V = computeTotals(ds.values?.[p.id] || {});
    const g = (k) => num(V[k]);
    const list = [];
    // Sai số: thuyết minh thường in bằng đơn vị thô hơn bảng chính, cộng vài chục dòng lại lệch thêm.
    const tol = Math.max(2000, Math.max(1, unit) * 20);
    const so = (id, severity, bangChinh, thuyetMinh, { rel = 0, name } = {}) => {
      if (bangChinh === null || thuyetMinh === null) return;
      const diff = thuyetMinh - bangChinh;
      if (Math.abs(diff) <= tol + rel * Math.max(Math.abs(bangChinh), Math.abs(thuyetMinh))) return;
      list.push({ id, severity, reported: bangChinh, computed: thuyetMinh, diff, ...(name ? { name } : {}) });
    };

    // ── Doanh thu & lợi nhuận gộp theo mảng ──────────────
    if (Array.isArray(no.segments) && no.segments.length) {
      so('segRevenue', 'info', g('IS:10'), cong(no.segments.map((x) => x.revenue)), { rel: 0.01 });
      so('segGross', 'info', g('IS:20'), cong(no.segments.map((x) => x.gross)), { rel: 0.01 });
    }

    // ── Tài sản cố định theo nhóm ────────────────────────
    const fa = no.fixedAssets;
    if (fa) {
      const kh = [...(fa.tangible || []), ...(fa.intangible || [])];
      // hau = 'T' hữu hình (mã 221 = 222 − 223) · 'I' vô hình (mã 227 = 228 − 229)
      const nhom = (rows, hau, maNet, maCost, maDep) => {
        if (!rows?.length) return;
        so(`faCost${hau}`, 'warn', g(`BS:${maCost}`), cong(rows.map((x) => x.cost)));
        so(`faDep${hau}`, 'warn', abs(g(`BS:${maDep}`)), abs(cong(rows.map((x) => x.accDep))));
        const conLai = cong(rows.filter((x) => Number.isFinite(x.cost)).map((x) => x.cost + (x.accDep || 0)));
        so(`faNet${hau}`, 'warn', g(`BS:${maNet}`), conLai);
      };
      nhom(fa.tangible, 'T', '221', '222', '223');
      nhom(fa.intangible, 'I', '227', '228', '229');
      // Bảng biến động phải TỰ khớp: đầu kỳ + tăng − giảm = cuối kỳ. Chỉ soát nhóm có số đầu kỳ.
      for (const r of kh) {
        if (!Number.isFinite(r.costOpen) || !Number.isFinite(r.cost)) continue;
        so('faRoll', 'warn', r.cost, r.costOpen + (r.additions || 0) - (r.disposals || 0), { name: r.name });
      }
      // Khấu hao trong kỳ của mọi nhóm ≈ dòng khấu hao trên LCTT (mã 02).
      so('depCF', 'info', abs(g('CF:02')), abs(cong(kh.map((x) => x.depreciation))));
    }

    // ── Vay và nợ thuê tài chính ─────────────────────────
    const d = no.debt;
    if (d) {
      so('debtNH', 'warn', abs(g('BS:321')), abs(num(d.stClose)));
      so('debtDH', 'warn', abs(g('BS:339')), abs(num(d.ltClose)));
      const roll = (id, open, up, down, close) => {
        if (!Number.isFinite(open) || !Number.isFinite(close)) return;
        so(id, 'warn', Math.abs(close), Math.abs(open) + Math.abs(up || 0) - Math.abs(down || 0));
      };
      roll('debtRollNH', d.stOpen, d.stProceeds, d.stRepay, d.stClose);
      roll('debtRollDH', d.ltOpen, d.ltProceeds, d.ltRepay, d.ltClose);
      so('debtCF', 'info', abs(g('CF:33')), cong([abs(num(d.stProceeds)), abs(num(d.ltProceeds))]));
      so('debtCFRepay', 'info', abs(g('CF:34')), cong([abs(num(d.stRepay)), abs(num(d.ltRepay))]));
    }

    // ── Biến động vốn chủ sở hữu ─────────────────────────
    // Không đối chiếu TỔNG vốn chủ: cổ tức bằng cổ phiếu, thưởng cổ phiếu, trích quỹ chỉ chuyển qua lại
    // giữa các cột trong chính vốn chủ nên tổng không đổi — cộng các cột lại là đếm hai lần.
    // Hai khoản THẬT có tiền ra / vào thì đối chiếu được với LCTT.
    const eq = no.equity;
    if (eq) {
      so('eqDividends', 'info', abs(g('CF:36')), abs(num(eq.dividends)));
      so('eqIssued', 'info', abs(g('CF:31')), cong([abs(num(eq.capIssued)), abs(num(eq.premiumInc))]));
    }

    // ── Lợi thế thương mại ───────────────────────────────
    const gw = no.goodwill;
    if (gw && Number.isFinite(gw.cost)) so('goodwill', 'warn', g('BS:279'), gw.cost + (gw.accAmort || 0));

    if (list.length) out[p.id] = list;
  }
  return out;
}
