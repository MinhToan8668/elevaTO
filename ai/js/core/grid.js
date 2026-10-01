// Đọc BCTC từ bảng Excel (đã đổi sang mảng 2 chiều bằng SheetJS) — không cần AI.
//   1. File FinLens: sheet "Lưu trữ" (mã TT99, mỗi kỳ một cột, đơn vị đồng) → đọc thẳng mọi kỳ.
//   2. Bảng BCTC có cột "Mã số" → trả dạng giống kết quả AI ({ meta, items }) để đi chung đường xử lý.

import { normCode, fold, statementToValues } from './extract.js';
import { parseVN } from './numbers.js';
import { t } from '../i18n.js';

const GROUP = { 'CĐKT': 'BS', 'KQKD': 'IS', 'LCTT': 'CF' };

/** @param sheets [{ name, rows: any[][] }] */
export function readGrid(sheets) {
  const storage = sheets.find((s) => fold(s.name).toLowerCase().trim() === 'luu tru' && hasPeriodRow(s.rows));
  if (storage) return { kind: 'storage', periods: readStorage(storage.rows) };
  const statements = {};
  for (const s of sheets) {
    const t = readStatement(s);
    if (t && !statements[t.st]) statements[t.st] = t.data;
  }
  if (!Object.keys(statements).length) throw new Error(t('err.noTable'));
  return { kind: 'statements', statements };
}

const cell = (rows, r, c) => (rows[r] ? rows[r][c] : undefined);
const hasPeriodRow = (rows) => rows.some((r) => r && /ma ky/i.test(fold(String(r[0] ?? ''))));

function readStorage(rows) {
  const r6 = rows.findIndex((r) => r && /ma ky/i.test(fold(String(r[0] ?? ''))));
  const r9 = rows.findIndex((r) => r && /nhan ky/i.test(fold(String(r[2] ?? ''))));
  const r10 = rows.findIndex((r) => r && /so thang/i.test(fold(String(r[2] ?? ''))));
  const out = [];
  const width = Math.max(...rows.map((r) => (r ? r.length : 0)));
  for (let c = 3; c < width; c++) {
    const code = String(cell(rows, r6, c) ?? '').trim();
    const m = /^(FY|Q([1-4]))-(\d{4})$/.exec(code);
    if (!m) continue;
    const year = +m[3];
    const months = Number(cell(rows, r10, c)) || (m[1] === 'FY' ? 12 : +m[2] * 3);
    const endMonth = m[1] === 'FY' ? 12 : +m[2] * 3;
    const period = { id: months === 12 ? `FY${year}` : `Q${Math.ceil(endMonth / 3)}-${year}`, year, months, endMonth, label: cell(rows, r9, c) };
    const values = {};
    for (const row of rows) {
      const st = row && GROUP[String(row[0] ?? '').trim()];
      if (!st || row[1] === null || row[1] === undefined) continue;
      const v = parseVN(row[c]);
      if (v !== null) values[`${st}:${String(row[1]).trim()}`] = v;
    }
    out.push({ period, values });
  }
  return out;
}

const DATE_RE = /ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

function readStatement(sheet) {
  const rows = sheet.rows.map((r) => (Array.isArray(r) ? r : []));
  const width = Math.max(0, ...rows.map((r) => r.length));
  // Cột mã số = cột có nhiều ô dạng mã nhất.
  let codeCol = -1, best = 0;
  for (let c = 0; c < width; c++) {
    const n = rows.filter((r) => normCode('BS', r[c]) && /^\d{1,3}[a-z]?$/.test(String(r[c]).trim())).length;
    if (n > best) { best = n; codeCol = c; }
  }
  if (best < 5) return null;
  const codes = new Set(rows.map((r) => normCode('BS', r[codeCol])).filter(Boolean));
  const text = fold(rows.slice(0, 15).flat().join(' ')).toUpperCase() + ' ' + fold(sheet.name).toUpperCase();
  let st;
  if (codes.has('100') && (codes.has('270') || codes.has('280') || codes.has('440'))) st = 'BS';
  else if (/LUU CHUYEN/.test(text)) st = 'CF';
  else if (/KET QUA|KINH DOANH/.test(text) || (codes.has('10') && codes.has('60'))) st = 'IS';
  else if (codes.has('20') && codes.has('50') && codes.has('70')) st = 'CF';
  else return null;

  // Cột tên = cột bên trái cột mã có nhiều chữ nhất; cột số = các cột bên phải có nhiều số nhất (bỏ cột Thuyết minh).
  let labelCol = 0, maxText = -1;
  for (let c = 0; c < codeCol; c++) {
    const n = rows.filter((r) => typeof r[c] === 'string' && r[c].trim().length > 3).length;
    if (n > maxText) { maxText = n; labelCol = c; }
  }
  const numCols = [];
  for (let c = codeCol + 1; c < width; c++) {
    const header = rows.slice(0, 12).map((r) => fold(String(r[c] ?? '')).toLowerCase()).join(' ');
    if (/thuyet minh/.test(header)) continue;
    const n = rows.filter((r) => normCode('BS', r[codeCol]) && parseVN(r[c]) !== null).length;
    if (n >= best * 0.3) numCols.push(c);
    if (numCols.length === 2) break;
  }
  if (!numCols.length) return null;
  const unitRow = rows.slice(0, 15).flat().find((x) => typeof x === 'string' && /don vi/i.test(fold(x)));
  const dm = DATE_RE.exec(fold(rows.slice(0, 12).flat().join(' ')));
  const iso = dm ? (dm[1] ? `${dm[3]}-${pad(dm[2])}-${pad(dm[1])}` : `${dm[6]}-${pad(dm[5])}-${pad(dm[4])}`) : '';
  const items = [];
  for (const r of rows) {
    const c = normCode('BS', r[codeCol]);
    if (!c) continue;
    const str = (x) => (x === null || x === undefined ? '' : String(x));
    items.push({ c: String(r[codeCol]).trim(), n: str(r[labelCol]).trim(), v: str(r[numCols[0]]), p: numCols[1] !== undefined ? str(r[numCols[1]]) : '' });
  }
  return { st, data: { meta: { don_vi: unitRow || '', ngay_ket_thuc: iso, ten_cong_ty: String(rows[0]?.[0] ?? '') }, items } };
}
const pad = (x) => String(x).padStart(2, '0');

/**
 * Kết quả readGrid → danh sách nguồn cho dataset.buildDataset.
 *   "Lưu trữ": mỗi kỳ một nguồn (đã là mã TT99, đồng).
 *   Bảng có cột Mã số: gộp các báo cáo thành một nguồn, đi chung đường với kết quả AI (đơn vị, dấu, mã TT200).
 */
export function gridToSources(file, grid) {
  if (grid.kind === 'storage') return grid.periods.map((p) => ({ kind: 'period', file, period: p.period, values: p.values }));
  const statements = {}, units = {}, warnings = [];
  let regime, meta0 = {};
  for (const st of ['BS', 'IS', 'CF']) {
    const data = grid.statements[st];
    if (!data) continue;
    const r = statementToValues(st, data, st === 'IS' && regime ? { regime } : {});
    if (st === 'BS') regime = r.regime;
    statements[st] = { cur: r.cur, prev: r.prev };
    units[st] = r.unit;
    warnings.push(...r.warnings);
    if (!meta0.ngay_ket_thuc && data.meta?.ngay_ket_thuc) meta0 = data.meta;
  }
  const first = Object.values(grid.statements)[0]?.meta || {};
  return [{ kind: 'ext', ext: {
    file, company: meta0.ten_cong_ty || first.ten_cong_ty || '', warnings, notes: {}, statements, units,
    meta: { ngay_ket_thuc: meta0.ngay_ket_thuc || '', so_thang: undefined },
  } }];
}
