// "Form chuẩn hóa 2026": file .xlsx ba báo cáo chính theo mẫu Thông tư 99/2025 — không cần file mẫu.
// Dòng tổng ghi bằng CÔNG THỨC Excel (sửa một dòng con là tổng tự nhảy), ô lệch so với số in trên BCTC
// được tô đỏ, cuối mỗi báo cáo có dòng kiểm tra cân đối.

import { statementRows } from './table.js';
import { checkDataset } from './dataset.js';
import { CHART } from '../chart2026.js';
import { numToCol } from './xlsx.js';
import { esc, S, cellStr, cellNum, cellFormula, row, sheetXml, bookFiles } from './xlsxout.js';
import { t, locale, chartLabel } from '../i18n.js';

const HEAD_ROW = 4;
const SUM_OF = new Map(CHART.filter((i) => i.sum).map((i) => [`${i.st}:${i.code}`, i.sum]));
const TOL = 1000;                                   // lệch dưới 1.000 đồng là do bản in làm tròn

export function periodTitle(p) {
  if (p.months === 12) return t('period.year', { y: p.year });
  return t('period.part', { m: p.months, mm: String(p.endMonth).padStart(2, '0'), y: p.year });
}

/**
 * @param ds       bộ dữ liệu (dataset.js)
 * @param opts.keys  Set các dòng được tick (null = mọi dòng có số)
 * @param opts.unit  đơn vị hiển thị trong file: 1 | 1e3 | 1e6 | 1e9
 * @returns { [path]: string }
 */
export function buildFormXlsx(ds, { keys = null, unit = 1e6, unitLabel = 'triệu đồng', now = new Date() } = {}) {
  const checks = checkDataset(ds);
  const sheets = [{ name: t('xl.sheet.overview'), xml: overviewSheet(ds, checks, unitLabel, now) }];
  for (const st of ['BS', 'IS', 'CF']) {
    const rows = statementRows(ds, st).filter((r) => !keys || keys.has(r.key));
    if (rows.length) sheets.push({ name: t(`xl.sheet.${st}`), xml: statementSheet(ds, st, rows, checks, unit, unitLabel) });
  }
  return bookFiles(sheets, unit);
}

/** Ô lệch so với số in trên BCTC → tô đỏ. checkDataset trả về theo từng kỳ. */
function lechSet(checks) {
  const out = new Set();
  for (const [period, list] of Object.entries(checks || {})) for (const i of list) out.add(`${period}|${i.key}`);
  return out;
}

function statementSheet(ds, st, rows, checks, unit, unitLabel) {
  const last = numToCol(2 + ds.periods.length);
  const lech = lechSet(checks);
  const dongCua = new Map(rows.map((r, i) => [r.key, HEAD_ROW + 1 + i]));   // khoá chỉ tiêu → dòng trong sheet
  const out = [
    row(1, [cellStr('A1', ds.company || t('xl.company'), S.title)], 22),
    row(2, [cellStr('A2', t(`xl.title.${st}`), S.textB)]),
    row(3, [cellStr('A3', t('xl.sub', { unit: unitLabel }), S.sub)]),
    row(HEAD_ROW, [cellStr(`A${HEAD_ROW}`, t('xl.code'), S.head), cellStr(`B${HEAD_ROW}`, t('xl.item'), S.head),
      ...ds.periods.map((p, i) => cellStr(`${numToCol(3 + i)}${HEAD_ROW}`, periodTitle(p), S.head))], 30),
  ];
  rows.forEach((r, i) => {
    const n = HEAD_ROW + 1 + i;
    const tot = r.lvl === 0 || r.kind === 'total';
    const sub = !tot && (r.lvl <= 1 || r.kind === 'sub');
    const lab = tot ? S.labelTot : sub ? S.labelB : r.lvl >= 3 || r.kind === 'memo' ? S.labelI : S.label;
    const cong = congThuc(ds, r.key, dongCua, unit);
    out.push(row(n, [
      cellStr(`A${n}`, r.code, tot ? S.codeTot : S.code),
      cellStr(`B${n}`, r.label, lab),
      ...ds.periods.map((p, j) => {
        const col = numToCol(3 + j);
        const v = Number.isFinite(r.values[p.id]) ? Math.round(r.values[p.id] / unit * 1000) / 1000 : null;
        const do_ = lech.has(`${p.id}|${r.key}`);
        const ki = do_ ? S.numDo : tot ? S.numTot : sub ? S.numB : S.num;
        // Dòng tổng có đủ dòng con trong sheet → ghi công thức để sửa tay là tổng tự nhảy.
        return cong ? cellFormula(`${col}${n}`, cong(col), v, ki) : cellNum(`${col}${n}`, v, ki);
      }),
    ]));
  });
  out.push(...dongKiemTra(ds, st, dongCua, unit));
  return sheetXml({ cols: [9, 58, ...ds.periods.map(() => 18)], rowsXml: out, freeze: { x: 2, y: HEAD_ROW }, merges: [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`] });
}

/**
 * Công thức cộng các dòng con có mặt trong sheet — chỉ dùng khi cộng lại đúng bằng số đang hiển thị
 * ở MỌI kỳ. Thiếu dòng con, hoặc số in trên BCTC không khớp các dòng con, thì giữ số cứng
 * (ô đó đã được tô đỏ) để file xuất ra không tự ý đổi số của báo cáo.
 */
function congThuc(ds, key, dongCua, unit) {
  const sum = SUM_OF.get(key);
  if (!sum || !sum.length) return null;
  const st = key.split(':')[0];
  const phan = sum.map(([code, dau]) => ({ code: `${st}:${code}`, dau, n: dongCua.get(`${st}:${code}`) })).filter((x) => x.n);
  if (phan.length < 2) return null;
  for (const p of ds.periods) {
    const v = ds.values[p.id]?.[key];
    if (!Number.isFinite(v)) continue;
    const tong = phan.reduce((t, x) => t + x.dau * (ds.values[p.id]?.[x.code] || 0), 0);
    if (Math.abs(tong - v) > TOL) return null;
  }
  void unit;
  return (col) => phan.map((p, i) => `${i === 0 ? (p.dau < 0 ? '-' : '') : (p.dau < 0 ? '-' : '+')}${col}${p.n}`).join('');
}

/** Dòng kiểm tra cuối mỗi báo cáo: chênh lệch phải bằng 0. */
const KIEM_TRA = {
  BS: { a: 'BS:280', b: ['BS:300', 'BS:400'] },
  IS: { a: 'IS:60', b: ['IS:61', 'IS:62'] },
  CF: { a: 'CF:70', b: ['CF:60', 'CF:50', 'CF:61'] },
};

function dongKiemTra(ds, st, dongCua, unit) {
  const k = KIEM_TRA[st];
  if (!k) return [];
  const a = dongCua.get(k.a), b = k.b.map((x) => dongCua.get(x)).filter(Boolean);
  if (!a || b.length !== k.b.length) return [];
  const n = HEAD_ROW + 1 + dongCua.size + 1;
  const vals = ds.periods.map((p) => {
    const g = (key) => ds.values[p.id]?.[key];
    const av = g(k.a), bv = k.b.reduce((t, x) => t + (g(x) || 0), 0);
    return Number.isFinite(av) ? (av - bv) / unit : null;
  });
  return [row(n, [
    cellStr(`A${n}`, '', S.codeTot),
    cellStr(`B${n}`, t(`xl.check.${st}`), S.labelTot),
    ...ds.periods.map((p, j) => {
      const col = numToCol(3 + j);
      const f = `${col}${a}-(${b.map((x) => `${col}${x}`).join('+')})`;
      const v = vals[j] === null ? null : Math.round(vals[j] * 1000) / 1000;
      const lech = v !== null && Math.abs(vals[j] * unit) > TOL;
      return cellFormula(`${col}${n}`, f, v, lech ? S.numDo : S.numCheck);
    }),
  ])];
}

function overviewSheet(ds, checks, unitLabel, now) {
  const out = [
    row(1, [cellStr('A1', t('xl.ov.title'), S.title)], 22),
    row(2, [cellStr('A2', ds.company || t('xl.company'), S.textB)]),
    row(3, [cellStr('A3', t('xl.ov.sub', { unit: unitLabel }), S.sub)]),
    row(5, ['xl.ov.period', 'xl.ov.months', 'xl.ov.files', 'xl.ov.check'].map((k, i) => cellStr(`${numToCol(i + 1)}5`, t(k), S.head)), 24),
  ];
  ds.periods.forEach((p, i) => {
    const n = 6 + i;
    const files = [...new Set(Object.values(ds.src[p.id] || {}).map((x) => (x.manual ? t('xl.ov.manual') : x.file)).filter(Boolean))].join('; ');
    const iss = checks[p.id] || [];
    out.push(row(n, [cellStr(`A${n}`, periodTitle(p), S.labelB), cellNum(`B${n}`, p.months, S.text), cellStr(`C${n}`, files, S.label),
      cellStr(`D${n}`, iss.length ? t('xl.ov.issues', { n: iss.length, list: iss.slice(0, 3).map((x) => x.label).join('; ') }) : t('xl.ov.fine'), iss.length ? S.labelDo : S.label)]));
  });
  let n = 7 + ds.periods.length;
  const notes = [t('xl.note.1'), t('xl.note.2'), t('xl.note.3'), t('xl.note.4'), t('xl.note.5', { d: now.toLocaleString(locale()) })];
  for (const line of notes) { out.push(row(n, [cellStr(`A${n}`, line, S.sub)])); n++; }
  return sheetXml({ cols: [22, 11, 48, 60], rowsXml: out, merges: ['A1:D1', 'A2:D2', 'A3:D3'] });
}

export { esc };
