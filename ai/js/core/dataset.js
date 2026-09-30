// Bộ dữ liệu nhiều kỳ: gộp kết quả trích xuất từ nhiều file BCTC.
//   periods: [{ id, year, months, endMonth }]  (sắp theo thời gian)
//   values:  { [kỳ]: { "BS:131": đồng } }
//   src:     { [kỳ]: { "BS:131": { file, col: 'cur'|'prev', end } | { manual: true } } }
//   notes:   { [kỳ]: { segments, fixedAssets, … } }
//   conflicts: [{ period, key, kept, other, keptFile, otherFile }]
// Mọi hàm trả bộ dữ liệu MỚI, không sửa bộ cũ.

import { periodsFromMeta } from './extract.js';
import { validate } from './statements.js';

export function emptyDataset() {
  return { company: '', periods: [], values: {}, src: {}, notes: {}, conflicts: [], warnings: [], files: [] };
}

const order = (p) => p.year * 100 + p.endMonth + (p.months === 12 ? 0.5 : 0);

/**
 * @param ext { file, company, meta: {ngay_ket_thuc, so_thang}, statements: { BS|IS|CF: {cur, prev} }, notes, warnings }
 */
export function addExtraction(ds, ext) {
  const per = periodsFromMeta(ext.meta || {});
  if (!per) throw new Error(`${ext.file}: không xác định được ngày kết thúc kỳ báo cáo — cần nhập tay`);
  const out = structuredClone(ds);
  if (!out.company && ext.company) out.company = ext.company;
  const end = per.cur.year * 100 + per.cur.endMonth;
  out.files.push({ file: ext.file, period: per.cur.id, end });

  const place = (p, vals, col) => {
    if (!vals || !Object.keys(vals).length) return;
    if (!out.periods.some((x) => x.id === p.id)) out.periods.push(p);
    const V = (out.values[p.id] ||= {}), S = (out.src[p.id] ||= {});
    for (const [k, v] of Object.entries(vals)) {
      const had = S[k];
      if (had && !had.manual && had.end > end) {                        // báo cáo đang có mới hơn → giữ
        if (V[k] !== v) out.conflicts.push({ period: p.id, key: k, kept: V[k], other: v, keptFile: had.file, otherFile: ext.file });
        continue;
      }
      if (had && had.manual) continue;                                  // số sửa tay luôn được giữ
      if (had && V[k] !== v) out.conflicts.push({ period: p.id, key: k, kept: v, other: V[k], keptFile: ext.file, otherFile: had.file });
      V[k] = v;
      S[k] = { file: ext.file, col, end };
    }
  };
  for (const st of ['BS', 'IS', 'CF']) {
    const s = ext.statements?.[st];
    if (!s) continue;
    place(per.cur, s.cur, 'cur');
    place(st === 'BS' ? per.prevBS : per.prevFlow, s.prev, 'prev');
  }
  if (ext.notes && Object.keys(ext.notes).length) {
    if (!out.periods.some((x) => x.id === per.cur.id)) out.periods.push(per.cur);
    out.notes[per.cur.id] = { ...(out.notes[per.cur.id] || {}), ...ext.notes };
  }
  out.warnings.push(...(ext.warnings || []).map((w) => `${ext.file}: ${w}`));
  out.periods.sort((a, b) => order(a) - order(b));
  out.conflicts.sort((a, b) => (a.period + a.key).localeCompare(b.period + b.key));
  return out;
}

/** Sửa tay một ô (v = null để xoá). Số sửa tay không bị file thêm sau ghi đè. */
export function setValue(ds, period, key, v) {
  const out = structuredClone(ds);
  const V = (out.values[period] ||= {}), S = (out.src[period] ||= {});
  if (v === null || v === undefined || !Number.isFinite(v)) { delete V[key]; delete S[key]; }
  else { V[key] = v; S[key] = { manual: true }; }
  return out;
}

/** Kiểm tra từng kỳ + đối chiếu giữa các kỳ. Trả { [kỳ]: [lệch…] }. */
export function checkDataset(ds, opts = {}) {
  const out = {};
  for (const p of ds.periods) {
    const vals = ds.values[p.id] || {};
    const issues = validate(vals, { unit: opts.unit || 1 });
    // Tiền đầu kỳ trên LCTT = tiền cuối năm trước trên CĐKT
    const prevFY = ds.values[`FY${p.year - 1}`];
    if (Number.isFinite(vals['CF:60']) && prevFY && Number.isFinite(prevFY['BS:110'])) {
      const diff = vals['CF:60'] - prevFY['BS:110'];
      if (Math.abs(diff) > Math.max(2, opts.unit || 1) * 2) {
        issues.push({ key: 'CF:60=BS:110(năm trước)', kind: 'cross', reported: vals['CF:60'], computed: prevFY['BS:110'], diff, label: 'Tiền đầu kỳ LCTT ≠ tiền cuối năm trước trên CĐKT' });
      }
    }
    out[p.id] = issues;
  }
  return out;
}

/** Nạp thẳng một kỳ đã có mã TT99 + đơn vị đồng (file FinLens "Lưu trữ"). Số đã có từ file khác được giữ nếu mới hơn. */
export function addPeriodValues(ds, { period, values, file }) {
  const month = period.endMonth || 12;
  return addExtraction(ds, {
    file, company: '', warnings: [], notes: {},
    meta: { ngay_ket_thuc: `${period.year}-${String(month).padStart(2, '0')}-28`, so_thang: period.months },
    statements: splitByStatement(values),
  });
}
function splitByStatement(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) (out[k.split(':')[0]] ||= { cur: {}, prev: {} }).cur[k] = v;
  return out;
}

/**
 * Dựng bộ dữ liệu từ đầu: các nguồn (kết quả AI / Excel đã đọc) rồi áp số sửa tay.
 * Nhờ vậy đổi ngày kỳ, xoá một file hay nạp lại phiên làm việc không cần gọi lại AI.
 * @param sources [{ id, kind: 'ext', ext, meta? } | { id, kind: 'period', period, values, file }]
 *        meta (tuỳ chọn): ngày kết thúc / số tháng người dùng nhập, đè lên meta AI đọc được
 * @param edits   [{ period, key, v }]  (v = null: xoá ô)
 * @returns { ds, errors: [{ id, file, message }], unit }  unit = đơn vị in lớn nhất (sai số làm tròn khi kiểm tra)
 */
export function buildDataset(sources, edits = []) {
  let ds = emptyDataset();
  const errors = [];
  let unit = 1;
  for (const s of sources) {
    try {
      if (s.kind === 'period') ds = addPeriodValues(ds, s);
      else ds = addExtraction(ds, { ...s.ext, meta: { ...s.ext.meta, ...definedOnly(s.meta) } });
      for (const u of Object.values(s.ext?.units || {})) if (u > unit) unit = u;
    } catch (e) {
      errors.push({ id: s.id, file: s.ext?.file || s.file, message: e.message });
    }
  }
  for (const e of edits) ds = setValue(ds, e.period, e.key, e.v);
  return { ds, errors, unit };
}
const definedOnly = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
