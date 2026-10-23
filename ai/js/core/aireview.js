// AI nhận định: lượt gọi AI THỨ HAI, sau khi máy đã trích số và tính xong chỉ số / dấu hiệu / sức khoẻ
// (core/analysis.js). AI KHÔNG được xem BCTC và KHÔNG tự tính: nó chỉ nhận bảng số đã tính sẵn (JSON, có
// nhãn) rồi viết lời nhận định — tổng quan, điểm mạnh / yếu, xu hướng qua các kỳ (đúng những gì tab biểu đồ
// vẽ), rủi ro, việc nên làm và câu hỏi cần làm rõ với doanh nghiệp. Mọi con số trong lời viết phải là số
// trong bảng gửi đi, nên người đọc đối chiếu được từng câu.
//
// Thuần tính toán + chuỗi, không đụng DOM — giao diện (ui/analysis.js) gọi AI và vẽ.

import { analyze } from './analysis.js';
import { computeTotals } from './statements.js';
import { RATIO_ROWS } from './metrics.js';
import { t, getLang } from '../i18n.js';

const S = { type: 'STRING' };
const arr = (items) => ({ type: 'ARRAY', items });
const obj = (properties, required) => ({ type: 'OBJECT', properties, ...(required ? { required } : {}) });

/** Khuôn JSON AI phải trả. Tên trường giữ tiếng Việt như các khuôn khác của tool. */
export const AI_REVIEW_SCHEMA = obj({
  tong_quan: { type: 'STRING', description: '3–5 câu: doanh nghiệp đang ở đâu, kỳ mới nhất so với kỳ trước ra sao' },
  diem_manh: arr(S),
  diem_yeu: arr(S),
  xu_huong: { ...arr(S), description: 'Nhận xét dãy số qua các kỳ: doanh thu, biên lợi nhuận, ROE, cơ cấu nợ, vòng quay tiền, dòng tiền — đúng các biểu đồ' },
  rui_ro: arr(obj({ tieu_de: S, muc: { type: 'STRING', enum: ['cao', 'tb', 'thap'] }, noi_dung: S }, ['tieu_de', 'muc', 'noi_dung'])),
  de_xuat: arr(S),
  cau_hoi: { ...arr(S), description: '5–8 câu hỏi cụ thể cần làm rõ với doanh nghiệp, mỗi câu dẫn đúng con số' },
  ket_luan: { type: 'STRING', description: '2–3 câu chốt, nêu rõ mức sức khoẻ và điều kiện cần theo dõi' },
}, ['tong_quan', 'diem_manh', 'diem_yeu', 'xu_huong', 'rui_ro', 'de_xuat', 'cau_hoi', 'ket_luan']);

/** Câu lệnh hệ thống cho lượt nhận định (thay cho SYSTEM "chỉ chép số" của phần trích xuất). */
export const AI_REVIEW_SYSTEM = [
  'Bạn là chuyên viên phân tích tài chính / thẩm định tín dụng doanh nghiệp Việt Nam, 15 năm kinh nghiệm, viết ngắn gọn, đi thẳng vào số.',
  'Bạn CHỈ được dùng các con số trong bảng dữ liệu được đưa — không bịa số, không tự tính thêm chỉ số mới, không đoán ngành nếu dữ liệu không nói.',
  'Mỗi nhận xét phải dẫn đúng con số và kỳ tương ứng (ví dụ "biên gộp 18,2% (Năm 2025) so với 22,0% (Năm 2024)").',
  'Trả về đúng một đối tượng JSON theo khuôn đã cho, không kèm lời giải thích ngoài JSON.',
].join('\n');

// Dòng chính gửi AI (khoá → nhãn ngắn). Chỉ các dòng mà người phân tích hay nhắc tới.
const KEY_FIGURES = [
  ['IS:10', 'rev', 'Doanh thu thuần'], ['IS:20', 'gross', 'Lợi nhuận gộp'], ['IS:30', 'opProfit', 'LN thuần từ HĐKD'],
  ['IS:50', 'pbt', 'LN trước thuế'], ['IS:60', 'npat', 'LN sau thuế'], ['IS:24', 'interest', 'Chi phí lãi vay'],
  ['BS:280', 'assets', 'Tổng tài sản'], ['BS:100', 'currentAssets', 'Tài sản ngắn hạn'], ['BS:110', 'cash', 'Tiền & tương đương'],
  ['BS:131', 'receivables', 'Phải thu khách hàng'], ['BS:140', 'inventory', 'Hàng tồn kho'], ['BS:220', 'fixedAssets', 'Tài sản cố định'],
  ['BS:300', 'liabilities', 'Nợ phải trả'], ['BS:310', 'currentLiab', 'Nợ ngắn hạn'], ['BS:321', 'stLoans', 'Vay ngắn hạn'],
  ['BS:339', 'ltLoans', 'Vay dài hạn'], ['BS:400', 'equity', 'Vốn chủ sở hữu'],
  ['CF:20', 'cfo', 'Dòng tiền HĐKD'], ['CF:21', 'capex', 'Chi mua sắm TSCĐ'], ['CF:30', 'cfi', 'Dòng tiền HĐĐT'], ['CF:40', 'cff', 'Dòng tiền HĐTC'],
];
const UNIT_TY = 1e9;
const ty = (v) => (Number.isFinite(v) ? Math.round((v / UNIT_TY) * 100) / 100 : null);   // tỷ đồng, 2 chữ số lẻ
const lam = (v, fmt) => (!Number.isFinite(v) ? null : fmt === 'd' ? Math.round(v) : Math.round(v * 100) / 100);

/**
 * Bảng dữ liệu gửi AI, dựng từ chính những gì tab Biểu đồ & chỉ số và tab Phân tích đang hiện.
 * @returns { input, hash } hoặc null nếu chưa có kỳ nào. hash đổi khi số liệu / ngôn ngữ đổi.
 */
export function buildAiReviewInput(ds, { company = '' } = {}) {
  const a = analyze(ds);
  if (!a) return null;
  const lang = getLang();
  const periods = a.periods.map((p) => ({ id: p.id, label: p.label, months: p.months }));
  const V = a.periods.map((p) => computeTotals(ds.values?.[p.id] || {}));
  const cfKey = (vals, code) => (Number.isFinite(vals['CF:20']) || !Number.isFinite(vals['CF:T20']) ? `CF:${code}` : `CF:T${code}`);
  const figures = KEY_FIGURES.map(([key, name, label]) => {
    const vals = V.map((vals) => ty(key.startsWith('CF:') ? vals[cfKey(vals, key.slice(3))] : vals[key]));
    return vals.some((x) => x !== null) ? { name, label, unit: 'tỷ đồng', values: vals } : null;
  }).filter(Boolean);
  const ratios = a.ratios.map((r) => {
    const row = RATIO_ROWS.find((x) => x.key === r.key) || {};
    return { name: r.key, label: t(`ratio.${r.key}`), unit: row.fmt === 'x' ? 'lần' : row.fmt === 'd' ? 'ngày' : '%',
      values: r.values.map((v) => lam(v, row.fmt)), level: a.levels[r.key] ? t(`level.${a.levels[r.key]}`) : null };
  });
  const flags = a.flags.map((f) => ({ severity: f.severity, title: t(`flag.${f.id}`) }));
  const input = {
    company: String(company || ds.company || '').trim() || null,
    language: lang,
    periods,
    latest: periods[a.last]?.id || null,
    compared_with: a.prev >= 0 ? periods[a.prev]?.id : null,
    figures,
    ratios,
    health: t(`level.${a.health}`),
    sub_scores: a.subs.map((s) => ({ name: t(`sub.${s.key}`), level: t(`level.${s.level}`) })),
    flags,
    suggested_actions: a.advice.map((x) => t(`adv.${x.id}`)),
  };
  return { input, hash: hashOf(JSON.stringify([input.periods, figures, ratios, lang])) };
}

/** Câu lệnh gửi kèm bảng dữ liệu. */
export function aiReviewPrompt(input) {
  const ngonNgu = input.language === 'en' ? 'Write every field in ENGLISH.' : 'Viết mọi trường bằng TIẾNG VIỆT.';
  return [
    'Dưới đây là số liệu tài chính đã được máy trích từ BCTC và tính sẵn (đơn vị tiền: tỷ đồng; kỳ xếp CŨ → MỚI; "level" là mức máy xếp theo ngưỡng chung của doanh nghiệp Việt Nam; "flags" là dấu hiệu bất thường máy đã bắt được; "suggested_actions" là việc máy gợi ý).',
    'Hãy viết nhận định cho người thẩm định tín dụng / phân tích tài chính:',
    '- tong_quan: 3–5 câu về quy mô, tăng trưởng, sinh lời, cơ cấu vốn và dòng tiền của kỳ mới nhất ("latest") so với kỳ so sánh ("compared_with").',
    '- diem_manh / diem_yeu: mỗi ý một câu, có số.',
    '- xu_huong: nhận xét dãy số QUA CÁC KỲ (dạng "X → Y → Z"), điểm gãy, đảo chiều — doanh thu & lợi nhuận, biên gộp / ROS / ROE, cơ cấu nợ & vốn chủ, vòng quay tiền (DSO / DSI / DPO / CCC), dòng tiền kinh doanh so với lợi nhuận.',
    '- rui_ro: diễn giải từng dấu hiệu trong "flags" (giữ nguyên mức cao / tb / thap), thêm rủi ro khác nếu số liệu cho thấy rõ.',
    '- de_xuat: việc nên làm, cụ thể, bám đúng rủi ro đã nêu.',
    '- cau_hoi: 5–8 câu hỏi cần làm rõ với doanh nghiệp, mỗi câu dẫn đúng con số đáng ngờ.',
    '- ket_luan: 2–3 câu chốt, nêu mức sức khoẻ ("health") và điều kiện cần theo dõi.',
    'Không nhắc tới các chỉ số không có trong bảng. Kỳ ngắn hơn một năm đã được quy về mức năm ở các chỉ số dòng.',
    ngonNgu,
    '',
    'DỮ LIỆU (JSON):',
    JSON.stringify(input),
  ].join('\n');
}

/** Kết quả AI → đúng dạng giao diện cần: mọi trường có mặt, chuỗi cắt gọn, mục rủi ro đúng mức. */
export function sanitizeAiReview(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const str = (v, max = 1200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v, max = 12) => (Array.isArray(v) ? v.map((x) => str(x, 600)).filter(Boolean).slice(0, max) : []);
  const risks = (Array.isArray(o.rui_ro) ? o.rui_ro : []).map((r) => (r && typeof r === 'object'
    ? { tieu_de: str(r.tieu_de, 160), muc: ['cao', 'tb', 'thap'].includes(r.muc) ? r.muc : 'tb', noi_dung: str(r.noi_dung, 800) }
    : { tieu_de: '', muc: 'tb', noi_dung: str(r, 800) })).filter((r) => r.noi_dung || r.tieu_de).slice(0, 15);
  return { tong_quan: str(o.tong_quan), diem_manh: list(o.diem_manh), diem_yeu: list(o.diem_yeu), xu_huong: list(o.xu_huong),
    rui_ro: risks, de_xuat: list(o.de_xuat), cau_hoi: list(o.cau_hoi, 10), ket_luan: str(o.ket_luan) };
}

/** Nhận định → văn bản thuần (nút sao chép). */
export function aiReviewText(r, tieuDe) {
  const sec = (h, lines) => (lines.length ? [`${h}:`, ...lines.map((x) => `- ${x}`), ''] : []);
  return [
    `${tieuDe.title}`, '',
    `${tieuDe.tong_quan}: ${r.tong_quan}`, '',
    ...sec(tieuDe.diem_manh, r.diem_manh), ...sec(tieuDe.diem_yeu, r.diem_yeu), ...sec(tieuDe.xu_huong, r.xu_huong),
    ...sec(tieuDe.rui_ro, r.rui_ro.map((x) => `[${tieuDe.muc[x.muc]}] ${x.tieu_de ? x.tieu_de + ' — ' : ''}${x.noi_dung}`)),
    ...sec(tieuDe.de_xuat, r.de_xuat), ...sec(tieuDe.cau_hoi, r.cau_hoi),
    `${tieuDe.ket_luan}: ${r.ket_luan}`,
  ].join('\n').trim();
}

/** Băm ngắn (djb2) — chỉ để biết số liệu có đổi so với lúc AI viết, không cần mạnh. */
export function hashOf(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
