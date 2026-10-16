// Đánh giá & đề xuất: xếp hạng từng chỉ số theo ngưỡng, bắt dấu hiệu bất thường (red flag), chấm
// sức khoẻ tài chính và gợi ý việc cần làm.
//
// Logic lấy từ bộ phân tích của AI_Finlens (ngưỡng chỉ số, bộ quy tắc red flag, cách chấm sức khoẻ)
// rồi chuyển sang mã chỉ tiêu Thông tư 99 và sang bộ dữ liệu NHIỀU KỲ của tool này.
//
// Nguyên tắc: MÁY tính và máy xếp hạng, AI không tham gia. Mô-đun chỉ phát ra KHOÁ + CON SỐ, câu chữ
// do i18n lo (xem js/ui/analysis.js) — nhờ vậy cùng một kết luận đọc được cả tiếng Việt và tiếng Anh,
// và không ai sửa được nhận định bằng cách sửa lời.

import { computeTotals } from './statements.js';
import { buildMetrics } from './metrics.js';

/** Năm mức xếp hạng. tone = lớp màu dùng trên giao diện (xem .tag trong css/app.css). */
export const LEVELS = {
  tot: { rank: 0, tone: 'em' },
  kha: { rank: 1, tone: 'em' },
  tb: { rank: 2, tone: '' },
  yeu: { rank: 3, tone: 'gold' },
  rat_yeu: { rank: 4, tone: 'red' },
};
export const SEVERITIES = ['cao', 'tb', 'thap'];

/**
 * Ngưỡng xếp hạng từng chỉ số (khoá theo RATIO_ROWS trong metrics.js).
 *   dir 'hi' càng cao càng tốt · 'lo' càng thấp càng tốt
 * Bốn mốc tot / kha / tb / yeu; vượt cả mốc yeu là 'rat_yeu'.
 * Ngưỡng là mức chung của doanh nghiệp Việt Nam, KHÔNG theo ngành — đọc kèm so sánh giữa các kỳ
 * thì mới ra kết luận, nên giao diện luôn hiện cả dãy số các kỳ bên cạnh mức xếp hạng.
 */
export const THRESHOLDS = {
  current: { dir: 'hi', tot: 1.5, kha: 1.2, tb: 1.0, yeu: 0.8 },
  quick: { dir: 'hi', tot: 1.0, kha: 0.8, tb: 0.5, yeu: 0.3 },
  cashRatio: { dir: 'hi', tot: 0.5, kha: 0.3, tb: 0.15, yeu: 0.05 },
  defensiveDays: { dir: 'hi', tot: 180, kha: 120, tb: 60, yeu: 30 },
  wcAsset: { dir: 'hi', tot: 30, kha: 20, tb: 10, yeu: 0 },
  gross: { dir: 'hi', tot: 20, kha: 10, tb: 5, yeu: 0 },
  ebitMargin: { dir: 'hi', tot: 12, kha: 7, tb: 3, yeu: 0 },
  ebitdaMargin: { dir: 'hi', tot: 15, kha: 10, tb: 5, yeu: 0 },
  ros: { dir: 'hi', tot: 10, kha: 5, tb: 2, yeu: 0 },
  roa: { dir: 'hi', tot: 5, kha: 3, tb: 1, yeu: 0 },
  roe: { dir: 'hi', tot: 15, kha: 10, tb: 5, yeu: 0 },
  de: { dir: 'lo', tot: 1, kha: 3, tb: 5, yeu: 10 },
  debtAsset: { dir: 'lo', tot: 50, kha: 65, tb: 75, yeu: 85 },
  loanEquity: { dir: 'lo', tot: 0.5, kha: 1, tb: 2, yeu: 3 },
  intCover: { dir: 'hi', tot: 5, kha: 3, tb: 1.5, yeu: 1 },
  debtEbitda: { dir: 'lo', tot: 2, kha: 3, tb: 4, yeu: 5 },
  assetTurn: { dir: 'hi', tot: 2, kha: 1, tb: 0.5, yeu: 0.2 },
  dsi: { dir: 'lo', tot: 60, kha: 90, tb: 120, yeu: 180 },
  dso: { dir: 'lo', tot: 45, kha: 90, tb: 120, yeu: 180 },
  dpo: { dir: 'lo', tot: 60, kha: 90, tb: 120, yeu: 180 },
  ccc: { dir: 'lo', tot: 30, kha: 60, tb: 90, yeu: 120 },
  cfoRevenue: { dir: 'hi', tot: 10, kha: 5, tb: 2, yeu: 0 },
};

/** Mức của một giá trị chỉ số, hoặc null nếu chỉ số không có ngưỡng / không có số. */
export function assess(key, value) {
  const th = THRESHOLDS[key];
  if (!th || !Number.isFinite(value)) return null;
  const ok = th.dir === 'hi' ? (a, b) => a >= b : (a, b) => a <= b;
  for (const m of ['tot', 'kha', 'tb', 'yeu']) if (ok(value, th[m])) return m;
  return 'rat_yeu';
}

const toiNhat = (mucs) => {
  const co = mucs.filter(Boolean);
  if (!co.length) return null;
  return co.reduce((a, b) => (LEVELS[b].rank > LEVELS[a].rank ? b : a));
};

// ─── Dấu hiệu bất thường ───────────────────────────────────

const num = (v) => (Number.isFinite(v) ? v : null);
const abs = (v) => (v === null ? null : Math.abs(v));
const pctDoi = (nay, truoc) => (nay === null || truoc === null || !truoc ? null : ((nay - truoc) / Math.abs(truoc)) * 100);
/** Dãy có đủ n số và đi một chiều suốt (không đảo) → 'tang' | 'giam' | null. */
function motChieu(day, n = 3) {
  const v = day.filter((x) => x !== null);
  if (v.length < n) return null;
  const len = v.every((x, i) => i === 0 || x > v[i - 1]);
  const giam = v.every((x, i) => i === 0 || x < v[i - 1]);
  return len ? 'tang' : giam ? 'giam' : null;
}
// Phải thu nội bộ + cho vay + phải thu khác (ngắn & dài hạn) theo mã Thông tư 99. Các mã 136 / 216 ở
// hệ này là dòng DỰ PHÒNG mang dấu âm nên không cộng vào.
const MA_LIEN_QUAN = ['BS:133', 'BS:135x', 'BS:135', 'BS:214', 'BS:215x', 'BS:215'];

/**
 * Phân tích một bộ dữ liệu.
 * @param ds dataset (periods, values)
 * @returns { periods, last, ratios, levels, flags, health, subs, advice } hoặc null nếu chưa có kỳ nào
 *   flags:  [{ id, severity: 'cao'|'tb'|'thap', params }]   — params là các con số để ghép câu
 *   advice: [{ id, params }]
 */
export function analyze(ds) {
  const m = buildMetrics(ds, { mode: 'period', span: 0 });
  if (!m.periods.length) return null;
  const i = m.periods.length - 1;                       // kỳ gần nhất
  const V = m.periods.map((p) => computeTotals(ds.values?.[p.id] || {}));
  const g = (k, at = i) => num(V[at]?.[k]);
  const cfKey = (at, code) => (num(V[at]?.['CF:20']) === null && num(V[at]?.['CF:T20']) !== null ? `CF:T${code}` : `CF:${code}`);
  const cf = (code, at = i) => num(V[at]?.[cfKey(at, code)]);
  const R = Object.fromEntries(m.ratios.map((r) => [r.key, r.values]));
  const r = (key, at = i) => (R[key] ? num(R[key][at]) : null);
  const levels = Object.fromEntries(m.ratios.map((x) => [x.key, assess(x.key, x.values[i])]));

  // Kỳ so sánh: CÙNG KỲ năm trước (cùng tháng kết thúc, cùng độ dài) — so một quý với một năm là vô nghĩa.
  const p = m.periods[i];
  const j = m.periods.findIndex((x) => x.year === p.year - 1 && x.endMonth === p.endMonth && x.months === p.months);
  const truoc = j >= 0 ? j : -1;
  const gt = (k) => (truoc < 0 ? null : g(k, truoc));
  const rt = (key) => (truoc < 0 ? null : r(key, truoc));

  const flags = [];
  const bat = (id, severity, params = {}) => flags.push({ id, severity, params });
  // Mỗi con số đi kèm KIỂU của nó, để giao diện in đúng dạng mà không phải đoán theo tên khoá:
  // '' số tiền · '%' tỷ lệ · 'pp' điểm phần trăm · 'x' số lần · 'd' số ngày · 'n' số đếm.
  const money = (n) => ({ n, k: '' }), pc = (n) => ({ n, k: '%' }), lan = (n) => ({ n, k: 'x' });
  const ngay = (n) => ({ n, k: 'd' }), diem = (n) => ({ n, k: 'pp' }), dem = (n) => ({ n, k: 'n' });

  const tongTS = g('BS:280'), vcsh = g('BS:400'), noNH = abs(g('BS:310'));
  const tsnh = g('BS:100'), lnst = g('IS:60'), lntt = g('IS:50');
  const vlDRong = tsnh === null || noNH === null ? null : tsnh - noNH;
  const laiVay = abs(g('IS:24'));
  const ebit = lntt === null ? null : lntt + (laiVay || 0);
  const ebitda = ebit === null ? null : ebit + (abs(cf('02')) || 0);
  const vay = (at = i) => { const a = abs(g('BS:321', at)), b = abs(g('BS:339', at)); return a === null && b === null ? null : (a || 0) + (b || 0); };

  // ── Mức CAO ──
  if (vcsh !== null && vcsh < 0) bat('equityNegative', 'cao', { v: money(vcsh) });
  if (vlDRong !== null && vlDRong < 0) bat('wcNegative', 'cao', { v: money(vlDRong) });
  if (lnst !== null && lnst < 0) bat('lossNet', 'cao', { v: money(lnst) });
  if (g('IS:20') !== null && g('IS:20') < 0) bat('grossNegative', 'cao', { v: money(g('IS:20')) });
  if (g('IS:30') !== null && g('IS:30') < 0) bat('opLoss', 'cao', { v: money(g('IS:30')) });
  if (r('current') !== null && r('current') < 0.8) bat('currentLow', 'cao', { v: lan(r('current')) });
  if (r('de') !== null && r('de') > 5) bat('deHigh', 'cao', { v: lan(r('de')) });
  const ebitdaCover = ebitda !== null && laiVay ? ebitda / laiVay : null;
  const coverThap = ebitdaCover !== null && ebitdaCover < 2;
  if (coverThap) bat('ebitdaCoverLow', 'cao', { v: lan(ebitdaCover) });
  // Dòng tiền kinh doanh âm: một kỳ là chuyện của kỳ đó, nhiều kỳ liền là bệnh.
  const cfoDay = m.periods.map((_, at) => cf('20', at));
  const amLienTiep = (() => { let n = 0; for (let at = i; at >= 0; at--) { if (cfoDay[at] !== null && cfoDay[at] < 0) n++; else break; } return n; })();
  if (amLienTiep >= 3) bat('cfoNegativeStreak', 'cao', { n: dem(amLienTiep) });
  else if (amLienTiep === 2) bat('cfoNegative2', 'cao', { v: money(cfoDay[i]), p: money(cfoDay[i - 1]) });

  // ── Mức TRUNG BÌNH ──
  if (r('de') !== null && r('de') > 3 && r('de') <= 5) bat('deMid', 'tb', { v: lan(r('de')) });
  if (r('current') !== null && r('current') >= 0.8 && r('current') < 1) bat('currentThin', 'tb', { v: lan(r('current')) });
  if (!coverThap && r('intCover') !== null && r('intCover') >= 1.5 && r('intCover') < 3) bat('intCoverThin', 'tb', { v: lan(r('intCover')) });
  if (r('debtEbitda') !== null && r('debtEbitda') > 4) bat('debtEbitdaHigh', 'tb', { v: lan(r('debtEbitda')), vay: money(vay()), ebitda: money(ebitda) });
  const ptKH = g('BS:131');
  if (ptKH !== null && tongTS) { const x = (ptKH / tongTS) * 100; if (x > 30) bat('arHeavy', 'tb', { v: money(ptKH), pct: pc(x) }); }
  const lienQuan = MA_LIEN_QUAN.reduce((a, k) => a + Math.max(0, g(k) || 0), 0);
  if (lienQuan > 0 && tongTS) { const x = (lienQuan / tongTS) * 100; if (x > 15) bat('relatedParty', 'tb', { v: money(lienQuan), pct: pc(x) }); }
  const tangHTK = pctDoi(abs(g('BS:140')), abs(gt('BS:140')));
  const tangDT = pctDoi(g('IS:10'), gt('IS:10'));
  if (tangHTK !== null && tangHTK > 50 && (tangDT === null || tangDT < 20)) bat('invSurge', 'tb', { htk: pc(tangHTK), dt: pc(tangDT) });
  if (rt('gross') !== null && r('gross') !== null && rt('gross') - r('gross') > 5) bat('grossDrop', 'tb', { d: diem(rt('gross') - r('gross')), p: pc(rt('gross')), v: pc(r('gross')) });
  if (tangDT !== null && tangDT < -30) bat('revDrop', 'tb', { v: pc(tangDT) });
  const tsdh = g('BS:200'), noDH = abs(g('BS:330'));
  if (tsdh !== null && vcsh !== null && noDH !== null && vcsh + noDH > 0 && tsdh > vcsh + noDH) bat('fundingMismatch', 'tb', { tsdh: money(tsdh), dai: money(vcsh + noDH), v: money(tsdh - vcsh - noDH) });
  const tangVay = pctDoi(vay(), truoc < 0 ? null : vay(truoc));
  if (tangVay !== null && tangVay > 30 && cfoDay[i] !== null && cfoDay[i] < 0) bat('borrowWhileCfoNeg', 'tb', { vay: pc(tangVay), cfo: money(cfoDay[i]) });
  const dtTC = g('IS:22');
  if (dtTC !== null && dtTC > 0 && lntt !== null && lntt > 0) { const x = (dtTC / lntt) * 100; if (x > 30) bat('finIncomeHeavy', 'tb', { v: money(dtTC), pct: pc(x) }); }
  const lnKhac = g('IS:40');
  if (lnKhac !== null && lnKhac > 0 && lntt !== null && lntt > 0) { const x = (lnKhac / lntt) * 100; if (x > 50) bat('otherProfitHeavy', 'tb', { v: money(lnKhac), pct: pc(x) }); }
  if (rt('ccc') !== null && r('ccc') !== null && r('ccc') - rt('ccc') > 30) bat('cccUp', 'tb', { d: ngay(r('ccc') - rt('ccc')), p: ngay(rt('ccc')), v: ngay(r('ccc')) });

  // Xu hướng nhiều kỳ: chỉ bật khi có từ 3 kỳ CÙNG LOẠI (so quý với quý, năm với năm).
  const cungLoai = m.periods.map((x, at) => (x.months === p.months ? at : -1)).filter((at) => at >= 0);
  if (cungLoai.length >= 3) {
    const day = (f) => cungLoai.map(f);
    if (motChieu(day((at) => g('IS:10', at))) === 'giam') bat('revDownStreak', 'tb', { n: dem(cungLoai.length) });
    if (motChieu(day((at) => r('gross', at))) === 'giam') bat('grossDownStreak', 'tb', { n: dem(cungLoai.length) });
    if (motChieu(day((at) => g('BS:131', at))) === 'tang') bat('arUpStreak', 'tb', { n: dem(cungLoai.length) });
    if (motChieu(day((at) => r('de', at))) === 'tang') bat('deUpStreak', 'tb', { n: dem(cungLoai.length) });
  }

  // ── Mức THẤP ──
  const opex = (at) => { const a = abs(g('IS:25', at)), b = abs(g('IS:26', at)); return a === null && b === null ? null : (a || 0) + (b || 0); };
  const tangOpex = pctDoi(opex(i), truoc < 0 ? null : opex(truoc));
  if (tangOpex !== null && tangOpex > 30) bat('opexSurge', 'thap', { v: pc(tangOpex) });
  if (tangHTK !== null && tangHTK > 30 && !(tangHTK > 50 && (tangDT === null || tangDT < 20))) bat('invUp', 'thap', { v: pc(tangHTK) });
  const tangPT = pctDoi(abs(g('BS:130')), abs(gt('BS:130')));
  if (tangPT !== null && tangDT !== null && tangPT > tangDT + 10 && tangPT > 10) bat('arFasterThanRev', 'thap', { pt: pc(tangPT), dt: pc(tangDT) });
  const tienVaDT = (abs(g('BS:110')) || 0) + (abs(g('BS:120')) || 0);
  if (tongTS && tongTS > 0) { const x = (tienVaDT / tongTS) * 100; if (x < 5) bat('cashThin', 'thap', { v: money(tienVaDT), pct: pc(x) }); }

  // ── Sức khoẻ tổng thể ──
  const nCao = flags.filter((f) => f.severity === 'cao').length;
  const nTB = flags.filter((f) => f.severity === 'tb').length;
  let health;
  if ((vcsh !== null && vcsh < 0) || (lnst !== null && lnst < 0 && cfoDay[i] !== null && cfoDay[i] < 0)) health = 'rat_yeu';
  else if (nCao >= 2) health = 'yeu';
  else if (nCao === 1 || nTB >= 3) health = 'tb';
  else if (nTB >= 1) health = 'kha';
  else health = 'tot';

  const mucCua = (keys) => toiNhat(keys.map((k) => levels[k])) || 'tb';
  // Chất lượng tài sản: tỷ trọng phải thu khách hàng / phải thu khác / trả trước người bán trên tổng TS.
  const chatLuongTS = (() => {
    if (!tongTS || tongTS <= 0) return 'tb';
    const tyLe = (v) => ((v || 0) / tongTS) * 100;
    const a = tyLe(g('BS:131')), b = tyLe(Math.max(0, g('BS:135') || 0) + Math.max(0, g('BS:135x') || 0)), c = tyLe(g('BS:132'));
    if (a > 30 || b > 15 || c > 15) return 'yeu';
    if (a > 20 || b > 10 || c > 10) return 'kha';
    return 'tot';
  })();
  const subs = [
    { key: 'liq', level: mucCua(['current', 'quick', 'wcAsset']) },
    { key: 'prof', level: mucCua(['ros', 'roe', 'gross']) },
    { key: 'lev', level: mucCua(['de', 'intCover']) },
    { key: 'asset', level: chatLuongTS },
  ];

  return { periods: m.periods, last: i, prev: truoc, ratios: m.ratios, levels, flags, health, subs,
    advice: advise({ flags, levels, r, cfo: cfoDay[i] }) };
}

// ─── Đề xuất ───────────────────────────────────────────────

const co = (flags, ...ids) => flags.some((f) => ids.includes(f.id));

/**
 * Việc cần làm, suy từ chính các dấu hiệu đã bắt được — không có nhận định nào thêm ngoài số liệu.
 * Mỗi mục kèm params để câu chữ nêu đúng con số đang có vấn đề.
 */
function advise({ flags, levels, r, cfo }) {
  const out = [];
  const them = (id, params = {}) => out.push({ id, params });
  const yeu = (key) => ['yeu', 'rat_yeu'].includes(levels[key]);
  const money = (n) => ({ n, k: '' }), pc = (n) => ({ n, k: '%' }), lan = (n) => ({ n, k: 'x' }), ngay = (n) => ({ n, k: 'd' });
  if (co(flags, 'wcNegative', 'currentLow', 'currentThin') || yeu('current')) them('liquidity', { current: lan(r('current')), quick: lan(r('quick')) });
  if (co(flags, 'arHeavy', 'arFasterThanRev', 'arUpStreak') || yeu('dso')) them('receivables', { dso: ngay(r('dso')) });
  if (co(flags, 'invSurge', 'invUp') || yeu('dsi')) them('inventory', { dsi: ngay(r('dsi')) });
  if (co(flags, 'deHigh', 'deMid', 'deUpStreak', 'debtEbitdaHigh', 'ebitdaCoverLow', 'intCoverThin')) them('leverage', { de: lan(r('de')), intCover: lan(r('intCover')) });
  if (co(flags, 'grossDrop', 'grossDownStreak', 'grossNegative') || yeu('gross')) them('margin', { gross: pc(r('gross')) });
  if (co(flags, 'cfoNegative2', 'cfoNegativeStreak', 'borrowWhileCfoNeg') || (cfo !== null && cfo < 0) || yeu('cfoRevenue')) {
    them('cashflow', { cfo: money(cfo), cfoRevenue: pc(r('cfoRevenue')) });
  }
  if (co(flags, 'fundingMismatch')) them('funding', {});
  if (co(flags, 'finIncomeHeavy', 'otherProfitHeavy')) them('earningsQuality', {});
  if (co(flags, 'revDrop', 'revDownStreak')) them('growth', {});
  if (co(flags, 'cccUp')) them('workingCapital', { ccc: ngay(r('ccc')) });
  if (co(flags, 'relatedParty')) them('relatedParty', {});
  if (!out.length) them('ok', {});
  return out;
}
