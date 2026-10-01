// Biến kết quả AI (chép nguyên văn số trên BCTC) thành số liệu chuẩn: mã TT99, đơn vị đồng, dấu chuẩn.
// Nguyên tắc: AI chỉ CHÉP, code mới ĐỌC SỐ / ĐỔI ĐƠN VỊ / QUY ĐỔI MÃ — để không có chuyện AI tự làm tròn,
// tự nhân đơn vị hay trả số dạng chữ bị hiểu thành 0.

import { CHART } from '../chart2026.js';
import { parseVN, unitScale } from './numbers.js';
import { fromTT200, normalizeSigns, detectRegime } from './statements.js';
import { t } from '../i18n.js';

// ─── JSON từ AI ────────────────────────────────────────────

export function parseAIJson(text) {
  const s = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = s.search(/[{[]/);
  if (start >= 0) {
    const end = matchEnd(s, start);
    if (end > 0) { try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { /* rơi xuống lỗi chung */ } }
  }
  throw new Error(t('err.badJson'));
}

// Tìm dấu đóng khớp với { hoặc [ ở vị trí start, bỏ qua ký tự nằm trong chuỗi.
function matchEnd(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// ─── Mã số & tên chỉ tiêu ─────────────────────────────────

export function normCode(st, raw) {
  const s = String(raw ?? '').replace(/[\s.]/g, '').toLowerCase();
  if (!/^\d{1,3}[a-z]?$/.test(s)) return '';
  const m = /^(\d+)([a-z]?)$/.exec(s);
  const n = m[1];
  return (st === 'BS' ? n : n.padStart(2, '0')) + m[2];
}

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
function normLabel(s) {
  return fold(s).toLowerCase().replace(/\(\*\)|¤/g, ' ').replace(/&/g, ' va ')
    .replace(/^\s*(?:[ivxlc]+|\d+|[a-z])\s*[.)]\s*/, '').replace(/^[-–+\s]+/, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const LABELS = {};
for (const it of CHART) {
  const k = normLabel(it.label);
  ((LABELS[it.st] ||= {})[k] ||= []).push(it.code);
}

/** Mã TT99 của một dòng không in mã số, theo tên chỉ tiêu. Tên trùng nhiều dòng ("- Nguyên giá") → null. */
export function matchLabel(st, label) {
  const hits = (LABELS[st] || {})[normLabel(label)];
  return hits && hits.length === 1 ? hits[0] : null;
}

// ─── Báo cáo chính ────────────────────────────────────────

/**
 * @param st 'BS' | 'IS' | 'CF'
 * @param ai { meta: { don_vi, thong_tu, phuong_phap, … }, items: [{ c, n, v, p }] }
 * @returns { cur, prev, unit, regime, unmapped: [..], warnings: [..] }   (cur/prev: { "BS:131": đồng })
 */
export function statementToValues(st, ai, hint = {}) {
  const meta = ai.meta || {};
  const warnings = [];
  let unit = unitScale(meta.don_vi);
  if (!unit) { unit = 1; warnings.push(t('w.noUnit', { raw: meta.don_vi || '' })); }
  const direct = st === 'CF' && /truc/.test(fold(meta.phuong_phap || '').toLowerCase());

  const raw = { cur: {}, prev: {} }, byLabel = { cur: {}, prev: {} };
  const dup = new Set();
  for (const it of ai.items || []) {
    const code = normCode(st, it.c);
    const target = code ? raw : byLabel;
    const key = code ? `${st}:${code}` : matchLabel(st, it.n) && `${st}:${matchLabel(st, it.n)}`;
    if (!key) { if (it.n && (parseVN(it.v) !== null || parseVN(it.p) !== null)) warnings.push(t('w.noCode', { name: String(it.n).slice(0, 60) })); continue; }
    for (const [side, rawV] of [['cur', it.v], ['prev', it.p]]) {
      const v = parseVN(rawV);
      if (v === null) continue;
      if (key in target[side]) { dup.add(key); continue; }
      target[side][key] = v * unit;
    }
  }
  if (dup.size) warnings.push(t('w.dup', { codes: [...dup].map((k) => k.split(':')[1]).join(', ') }));

  const regime = hint.regime || regimeFrom(st, meta, raw.cur, ai.items || []);
  if (!hint.regime && regime === 'TT200' && oldYear(meta) && (/99/.test(String(meta.thong_tu || '')) || detectRegime(raw.cur) === 'TT99')) {
    warnings.push(t('w.oldForm', { d: meta.ngay_ket_thuc }));
  }
  const unmapped = new Set();
  const conv = (vals) => {
    let v = vals;
    if (regime === 'TT200' && st !== 'CF') { const r = fromTT200(vals); v = r.values; r.unmapped.forEach((k) => unmapped.add(k)); }
    if (direct) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/^CF:(\d)/, 'CF:T$1'), x]));
    return v;
  };
  const out = {};
  for (const side of ['cur', 'prev']) {
    const labeled = direct ? Object.fromEntries(Object.entries(byLabel[side]).map(([k, x]) => [k.replace(/^CF:(\d)/, 'CF:T$1'), x])) : byLabel[side];
    out[side] = normalizeSigns({ ...labeled, ...conv(raw[side]) });   // dòng có mã được ưu tiên
  }
  return { cur: out.cur, prev: out.prev, unit, regime, direct, unmapped: [...unmapped], warnings, meta };
}

// Thông tư 99/2025 áp dụng từ năm tài chính 2026: báo cáo kỳ kết thúc từ 2025 trở về trước chắc chắn theo mẫu TT200
// (kể cả khi AI ghi nhầm thông tư) → đọc mã theo TT200 rồi quy đổi sang mẫu 2026.
// Năm của ngày cuối cùng trong chuỗi (AI đôi khi ghi cả khoảng "01/01/2025 - 31/03/2026").
const yearOf = (d) => { const all = String(d || '').match(/\d{4}/g); return all ? Number(all[all.length - 1]) : 0; };
const oldYear = (meta) => { const y = yearOf(meta.ngay_ket_thuc); return y > 0 && y <= 2025; };

function regimeFrom(st, meta, cur, items) {
  if (oldYear(meta)) return 'TT200';
  const t = String(meta.thong_tu || '');
  if (/200/.test(t)) return 'TT200';
  if (/99/.test(t)) return 'TT99';
  if (st === 'BS') return detectRegime(cur) || 'TT99';
  if (st === 'IS') {
    // TT200: mã 21 là doanh thu tài chính. TT99: 21 là lãi/lỗ bất động sản đầu tư, 22 mới là doanh thu tài chính.
    const i21 = items.find((i) => normCode('IS', i.c) === '21');
    if (i21 && /tai chinh/.test(normLabel(i21.n))) return 'TT200';
    if (items.some((i) => normCode('IS', i.c) === '27')) return 'TT99';
    return i21 ? 'TT99' : 'TT200';
  }
  return 'TT99';
}

// ─── Kỳ báo cáo ───────────────────────────────────────────

export function periodsFromMeta(meta = {}) {
  const d = String(meta.ngay_ket_thuc || '');
  let y, m;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d);
  if (x) { y = +x[1]; m = +x[2]; }
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(d))) { y = +x[3]; m = +x[2]; }
  else return null;
  if (!(m >= 1 && m <= 12) || !(y > 1990 && y < 2100)) return null;
  const months = Number(meta.so_thang) || (m === 12 ? 12 : m);
  const mk = (yy, mo) => ({ id: mo === 12 ? `FY${yy}` : `Q${Math.ceil(m / 3)}-${yy}`, year: yy, months: mo, endMonth: m });
  const cur = mk(y, months);
  return { cur, prevBS: { id: `FY${y - 1}`, year: y - 1, months: 12, endMonth: 12 }, prevFlow: mk(y - 1, months) };
}

// ─── Nhận diện trang ──────────────────────────────────────

const TITLES = [
  ['BS', /BANG CAN DOI KE TOAN|BAO CAO TINH HINH TAI CHINH/],
  ['IS', /KET QUA HOAT DONG KINH DOANH/],
  ['CF', /LUU CHUYEN TIEN TE/],
  ['NOTES', /THUYET MINH BAO CAO TAI CHINH/],
];
export const NOTE_GROUPS = {
  fixedAssets: /TAI SAN CO DINH (HUU HINH|VO HINH|THUE TAI CHINH)/,
  debt: /VAY VA NO THUE TAI CHINH|CAC KHOAN VAY\b/,
  equity: /DOI CHIEU BIEN DONG|BIEN DONG (CUA )?VON CHU SO HUU/,
  segments: /BAO CAO BO PHAN|THONG TIN BO PHAN|THEO (LINH VUC|BO PHAN) KINH DOANH/,
  goodwill: /LOI THE THUONG MAI/,
  params: /CO PHIEU DANG LUU HANH|SO LUONG CO PHIEU/,
};

/**
 * @param texts chữ của từng trang (pdf.js), trang 1 ở index 0
 * @returns { types: ['BS'|'IS'|'CF'|'NOTES'|'OTHER'|'UNKNOWN'], notes: {nhóm: [số trang]}, scanned }
 */
export function classifyPages(texts) {
  const up = texts.map((t) => fold(t || '').toUpperCase());
  const types = [];
  let prev = 'OTHER';
  for (const t of up) {
    let type;
    if (t.replace(/\s/g, '').length < 10) type = 'UNKNOWN';          // trang trắng / chỉ có số trang
    else if (/MUC LUC/.test(t.slice(0, 200))) type = 'OTHER';
    else {
      const head = t.slice(0, 400);                        // tiêu đề nằm đầu trang; thân thuyết minh hay nhắc tên báo cáo
      type = (TITLES.find(([, re]) => re.test(head)) || [])[0];
      if (!type) {
        const codes = (t.match(/(?:^|\s)\d{2,3}(?=\s|$)/g) || []).length;
        if (['BS', 'IS', 'CF'].includes(prev) && codes >= 5) type = prev;
        else type = prev === 'NOTES' ? 'NOTES' : 'OTHER';
      }
    }
    types.push(type);
    if (type !== 'UNKNOWN') prev = type;
  }
  const notes = Object.fromEntries(Object.keys(NOTE_GROUPS).map((k) => [k, []]));
  up.forEach((t, i) => {
    if (types[i] !== 'NOTES') return;
    for (const [k, re] of Object.entries(NOTE_GROUPS)) if (re.test(t)) notes[k].push(i + 1);
  });
  const empty = up.filter((t) => t.replace(/\s/g, '').length < 30).length;
  return { types, notes, scanned: texts.length > 0 && empty / texts.length >= 0.8 };
}

// ─── Thuyết minh ──────────────────────────────────────────

const TANGIBLE = ['buildings', 'machinery', 'transport', 'office', 'other'];
function guessTangible(name) {
  const s = normLabel(name);
  if (/nha cua|vat kien truc/.test(s)) return 'buildings';
  if (/phuong tien|van tai|truyen dan/.test(s)) return 'transport';
  if (/dung cu quan ly|van phong/.test(s)) return 'office';
  if (/may moc|thiet bi/.test(s)) return 'machinery';
  return 'other';
}
function guessIntangible(name, nhom) {
  if (nhom === 'land' || nhom === 'software') return nhom;
  const s = normLabel(name);
  if (/quyen su dung dat/.test(s)) return 'land';
  if (/phan mem/.test(s)) return 'software';
  return 'other';
}

const neg = (v) => (v ? -Math.abs(v) : 0);
const abs = (v) => (v ? Math.abs(v) : 0);

/** Kết quả AI cho một nhóm thuyết minh → dạng model.js cần (đơn vị đồng). */
export function noteToModel(kind, ai) {
  const unit = unitScale(ai.meta?.don_vi) || 1;
  const n = (x) => { const v = parseVN(x); return v === null ? 0 : v * unit; };
  const opt = (x) => { const v = parseVN(x); return v === null ? undefined : v * unit; };
  if (kind === 'fixedAssets') {
    const row = (x, cls) => ({
      cls, name: String(x.ten || ''), cost: n(x.nguyen_gia_cuoi), accDep: neg(n(x.hao_mon_cuoi)),
      additions: n(x.mua) + n(x.xdcb) + n(x.tang_khac) || 0, depreciation: neg(n(x.khau_hao)),
    });
    return {
      tangible: (ai.tangible || []).map((x) => row(x, TANGIBLE.includes(x.nhom) ? x.nhom : guessTangible(x.ten))),
      intangible: (ai.intangible || []).map((x) => row(x, guessIntangible(x.ten, x.nhom))),
    };
  }
  if (kind === 'segments') {
    return (ai.segments || []).filter((s) => parseVN(s.doanh_thu) !== null).map((s) => {
      const revenue = n(s.doanh_thu);
      const gp = parseVN(s.loi_nhuan_gop);
      const gross = gp !== null ? gp * unit : (parseVN(s.gia_von) !== null ? revenue - abs(n(s.gia_von)) : undefined);
      return gross === undefined ? { name: String(s.ten || ''), revenue } : { name: String(s.ten || ''), revenue, gross };
    });
  }
  if (kind === 'debt') {
    const st = ai.vay_ngan_han || {}, lt = ai.vay_dai_han || {};
    return { stProceeds: abs(n(st.vay_trong_ky)), stRepay: abs(n(st.tra_trong_ky)), ltProceeds: abs(n(lt.vay_trong_ky)), ltRepay: abs(n(lt.tra_trong_ky)) };
  }
  if (kind === 'equity') {
    const MAP = {
      von_gop_phat_hanh: ['capIssued', 1], co_phieu_thuong: ['capBonus', 1], esop: ['capEsop', 1], co_tuc_co_phieu: ['capStockDiv', 1],
      von_gop_giam: ['capDecrease', 0], thang_du_tang: ['premiumInc', 1], thang_du_giam: ['premiumDec', 0],
      co_phieu_quy_mua: ['treasuryInc', 0], co_phieu_quy_ban: ['treasuryDec', 0], quy_dtpt_tang: ['devFundInc', 1],
      quy_dtpt_giam: ['devFundDec', 0], co_tuc_tien: ['dividends', 0], lncpp_tang_khac: ['reOtherInc', 1],
      lncpp_giam_khac: ['reOtherDec', 0], lickks_thay_doi: ['nciChange', 2],
    };
    const out = {};
    for (const [k, [f, mode]] of Object.entries(MAP)) {
      const v = opt(ai[k]);
      if (v === undefined) continue;
      out[f] = mode === 2 ? v : Math.abs(v);
    }
    return out;
  }
  if (kind === 'goodwill') {
    return { cost: opt(ai.nguyen_gia), accAmort: neg(n(ai.phan_bo_luy_ke)), additions: n(ai.tang), amortization: neg(n(ai.phan_bo_trong_ky)) };
  }
  if (kind === 'params') {
    const out = {};
    const sh = parseVN(ai.so_co_phieu_luu_hanh);
    if (sh) out.shares = sh;
    const tr = parseVN(String(ai.thue_suat_tndn ?? '').replace('%', ''));
    if (tr !== null) out.taxRate = tr > 1 ? tr / 100 : tr;
    return out;
  }
  throw new Error(t('err.noteKind', { kind }));
}
