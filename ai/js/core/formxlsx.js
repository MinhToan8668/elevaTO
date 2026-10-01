// "Form chuẩn hóa 2026": file .xlsx ba báo cáo chính theo mẫu Thông tư 99/2025 — không cần file mẫu.
//
// Bố cục bám theo các sheet trình bày của model elevaTO: dòng "Năm", dòng "Actual / Forecast",
// dải mục lớn, dòng tổng in đậm, kèm dòng tỷ lệ suy ra (tăng trưởng, biên lợi nhuận).
//
// ĐƠN VỊ CHỌN NGAY TRONG FILE: sheet Tổng quan có ô chọn đơn vị (đồng / nghìn / triệu / tỷ); mọi ô
// số là công thức chia cho tên đã định nghĩa DonVi nên đổi đơn vị là cả file tự tính lại.
// Dòng tổng là công thức cộng các dòng con, nên vẫn đúng ở mọi đơn vị.

import { statementRows } from './table.js';
import { checkDataset } from './dataset.js';
import { CHART } from '../chart2026.js';
import { numToCol } from './xlsx.js';
import { noteSheets } from './notesxlsx.js';
import { S, DV, cellStr, cellNum, cellBlank, cellFormula, row, sheetXml, bookFiles,
  soThuong, tinhSanO, ghiO, periodTitle } from './xlsxout.js';
import { t, locale, unitLabel } from '../i18n.js';

const HEAD_ROW = 4;                                 // dòng "Năm", như các sheet của model
const ROW0 = 7;                                     // dòng đầu của phần số liệu
const SUM_OF = new Map(CHART.filter((i) => i.sum).map((i) => [`${i.st}:${i.code}`, i.sum]));
const TOL = 1000;                                   // lệch dưới 1.000 đồng là do bản in làm tròn
const DON_VI = [1, 1e3, 1e6, 1e9];
const O_DON_VI = 'B5';                              // ô chọn đơn vị trên sheet Tổng quan
const O_HE_SO = 'C5';                               // ô hệ số chia (DonVi trỏ vào đây)

/**
 * So được tăng trưởng YoY hay không: hai kỳ phải cùng độ dài, cùng tháng kết thúc và liền năm.
 * Không kiểm thì một bộ dữ liệu có cả "Năm 2025" và "6 tháng 2026" sẽ hiện −50% như thể sụt doanh thu.
 */
const soDuocYoY = (nay, truoc) => !!truoc && truoc.months === nay.months
  && truoc.endMonth === nay.endMonth && truoc.year === nay.year - 1;

// Dòng tỷ lệ suy ra, chèn ngay sau chỉ tiêu tương ứng (giống dòng YoY / margin của model).
const TY_LE = {
  'IS:10': { key: 'yoy', tren: 'IS:10' },           // tăng trưởng doanh thu thuần so với kỳ trước
  'IS:20': { key: 'gross', tren: 'IS:20', chia: 'IS:10' },
  'IS:30': { key: 'oper', tren: 'IS:30', chia: 'IS:10' },
  'IS:60': { key: 'net', tren: 'IS:60', chia: 'IS:10' },
};

/**
 * @param ds       bộ dữ liệu (dataset.js)
 * @param opts.keys     Set các dòng được tick (null = mọi dòng có số)
 * @param opts.unit     đơn vị chọn sẵn trong file: 1 | 1e3 | 1e6 | 1e9 (người dùng đổi được)
 * @param opts.details  true = thêm các sheet thuyết minh (học viên / giảng viên)
 * @returns { [path]: string }
 */
export function buildFormXlsx(ds, { keys = null, unit = 1e6, details = false, now = new Date() } = {}) {
  const dv = DON_VI.includes(unit) ? unit : 1e6;
  const checks = checkDataset(ds);
  const tenTQ = t('xl.sheet.overview');
  const sheets = [{ name: tenTQ, xml: overviewSheet(ds, checks, dv, details, now) }];
  for (const st of ['BS', 'IS', 'CF']) {
    const rows = statementRows(ds, st).filter((r) => !keys || keys.has(r.key));
    if (rows.length) sheets.push({ name: t(`xl.sheet.${st}`), xml: statementSheet(ds, st, rows, checks, dv) });
  }
  if (details) sheets.push(...noteSheets(ds, dv));
  return bookFiles(sheets, { definedNames: { [DV]: `'${tenTQ.replace(/'/g, "''")}'!$${O_HE_SO[0]}$${O_HE_SO.slice(1)}` } });
}

/** Ô lệch so với số in trên BCTC → tô đỏ. checkDataset trả về theo từng kỳ. */
function lechSet(checks) {
  const out = new Set();
  for (const [period, list] of Object.entries(checks || {})) for (const i of list) out.add(`${period}|${i.key}`);
  return out;
}

/** Danh sách dòng cần ghi: chỉ tiêu + dòng tỷ lệ suy ra, đã gán số dòng trong sheet. */
function xepDong(rows, st) {
  const out = [];
  let n = ROW0;
  for (const r of rows) {
    out.push({ ...r, n });
    n += 1;
    const tl = st === 'IS' ? TY_LE[r.key] : null;
    if (tl) { out.push({ tyLe: tl, n }); n += 1; }
  }
  return out;
}

function statementSheet(ds, st, rows, checks, dv) {
  const cot = (i) => numToCol(3 + i);
  const last = cot(ds.periods.length - 1);
  const lech = lechSet(checks);
  const danh = xepDong(rows, st);
  const dongCua = new Map(danh.filter((d) => d.key).map((d) => [d.key, d.n]));
  const ke = danh.map((d) => (d.tyLe ? keTyLe(d, ds, cot, dongCua) : keChiTieu(d, ds, cot, dongCua, lech, dv)));
  const chk = keKiemTra(ds, st, dongCua, cot, ROW0 + danh.length);
  if (chk) ke.push(chk);

  const san = tinhSanO(ke, dv);

  const out = [
    row(1, [cellStr('A1', ds.company || t('xl.company'), S.title)], 22),
    row(2, [cellStr('A2', t(`xl.title.${st}`), S.textB)]),
    row(3, [cellStr('A3', t('xl.subPick'), S.sub)]),
    row(HEAD_ROW, [cellStr(`A${HEAD_ROW}`, t('xl.code'), S.head), cellStr(`B${HEAD_ROW}`, t('xl.item'), S.head),
      ...ds.periods.map((p, i) => cellStr(`${cot(i)}${HEAD_ROW}`, periodTitle(p), S.head))], 30),
    row(5, [cellBlank('A5', S.code), cellStr('B5', t('xlm.ifsAF'), S.labelB),
      ...ds.periods.map((p, i) => cellStr(`${cot(i)}5`, t('xl.actual', { y: p.year }), S.textB))]),
  ];
  for (const k of ke) out.push(row(k.n, [k.ma, k.nhan, ...k.o.map((o) => ghiO(o, san))]));
  return sheetXml({
    cols: [9, 58, ...ds.periods.map(() => 17)],
    rowsXml: out,
    freeze: { x: 2, y: 5 },
    merges: [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`],
  });
}

/** Một chỉ tiêu BCTC: ô số là công thức chia DonVi (hoặc cộng các dòng con nếu cộng lại đúng). */
function keChiTieu(r, ds, cot, dongCua, lech, dv) {
  const tot = r.lvl === 0 || r.kind === 'total';
  const sub = !tot && (r.lvl <= 1 || r.kind === 'sub');
  const lab = r.lvl === 0 ? S.secHead : tot ? S.labelTot : sub ? S.labelB : r.lvl >= 3 || r.kind === 'memo' ? S.labelI : S.label;
  const cong = congThuc(ds, r.key, dongCua);
  return {
    n: r.n,
    ma: cellStr(`A${r.n}`, r.code, r.lvl === 0 ? S.secHead : tot ? S.codeTot : S.code),
    nhan: cellStr(`B${r.n}`, r.label, lab),
    o: ds.periods.map((p, i) => {
      const ref = `${cot(i)}${r.n}`;
      const raw = r.values[p.id];
      const do_ = lech.has(`${p.id}|${r.key}`);
      const s = do_ ? S.numDo : tot ? S.numTot : sub ? S.numB : S.num;
      if (cong) return { ref, f: cong(cot(i)), s };
      const go = Number.isFinite(raw) ? soThuong(raw) : null;
      return go === null ? { ref, v: null, s } : { ref, f: `${go}/${DV}`, v: raw / dv, s };
    }),
  };
}

/** Dòng tỷ lệ: tăng trưởng so với kỳ trước, hoặc biên lợi nhuận trên doanh thu thuần. */
function keTyLe({ tyLe, n }, ds, cot, dongCua) {
  const tren = dongCua.get(tyLe.tren);
  const chia = tyLe.chia ? dongCua.get(tyLe.chia) : null;
  const co = tren && (!tyLe.chia || chia);
  return {
    n,
    ma: cellBlank(`A${n}`, S.code),
    nhan: cellStr(`B${n}`, t(`xl.ratio.${tyLe.key}`), S.labelI),
    o: ds.periods.map((p, i) => {
      const ref = `${cot(i)}${n}`;
      if (!co) return { ref, v: null, s: S.pct };
      if (!tyLe.chia) {
        // Tăng trưởng chỉ ghi khi kỳ liền trước so được; kỳ đầu hoặc kỳ lệch loại thì để trống.
        return soDuocYoY(p, ds.periods[i - 1])
          ? { ref, f: `IFERROR(${cot(i)}${tren}/${cot(i - 1)}${tren}-1,"")`, s: S.pct }
          : { ref, trong: true, s: S.pct };
      }
      return { ref, f: `IFERROR(${cot(i)}${tren}/${cot(i)}${chia},"")`, s: S.pct };
    }),
  };
}

/**
 * Công thức cộng các dòng con có mặt trong sheet — chỉ dùng khi MỌI kỳ đều có số tổng in trên BCTC
 * và cộng các dòng con lại khớp (lệch dưới TOL là do bản in làm tròn). Thiếu dòng con, thiếu số tổng
 * ở một kỳ, hoặc số in không khớp thì giữ số gốc chia DonVi (ô đó đã được tô đỏ) — nếu không, một kỳ
 * chưa trích được số tổng sẽ hiện tổng cộng dở của mấy dòng con như thể đó là số của báo cáo.
 */
function congThuc(ds, key, dongCua) {
  const sum = SUM_OF.get(key);
  if (!sum || !sum.length) return null;
  const st = key.split(':')[0];
  const phan = sum.map(([code, dau]) => ({ code: `${st}:${code}`, dau, n: dongCua.get(`${st}:${code}`) })).filter((x) => x.n);
  if (phan.length < 2) return null;
  for (const p of ds.periods) {
    const v = ds.values[p.id]?.[key];
    if (!Number.isFinite(v)) return null;
    const tong = phan.reduce((s, x) => s + x.dau * (ds.values[p.id]?.[x.code] || 0), 0);
    if (Math.abs(tong - v) > TOL) return null;
  }
  return (col) => phan.map((p, i) => `${i === 0 ? (p.dau < 0 ? '-' : '') : (p.dau < 0 ? '-' : '+')}${col}${p.n}`).join('');
}

/** Dòng kiểm tra cuối mỗi báo cáo: chênh lệch phải bằng 0. */
const KIEM_TRA = {
  BS: { a: 'BS:280', b: ['BS:300', 'BS:400'] },
  IS: { a: 'IS:60', b: ['IS:61', 'IS:62'] },
  CF: { a: 'CF:70', b: ['CF:60', 'CF:50', 'CF:61'] },
};

function keKiemTra(ds, st, dongCua, cot, n) {
  const k = KIEM_TRA[st];
  if (!k) return null;
  const a = dongCua.get(k.a), b = k.b.map((x) => dongCua.get(x)).filter(Boolean);
  if (!a || b.length !== k.b.length) return null;
  return {
    n,
    ma: cellBlank(`A${n}`, S.codeTot),
    nhan: cellStr(`B${n}`, t(`xl.check.${st}`), S.labelTot),
    o: ds.periods.map((p, i) => {
      const g = (key) => ds.values[p.id]?.[key];
      const av = g(k.a), bv = k.b.reduce((s, x) => s + (g(x) || 0), 0);
      const lech = Number.isFinite(av) && Math.abs(av - bv) > TOL;
      return { ref: `${cot(i)}${n}`, f: `${cot(i)}${a}-(${b.map((x) => `${cot(i)}${x}`).join('+')})`, s: lech ? S.numDo : S.numCheck };
    }),
  };
}

/**
 * Ô chọn đơn vị + ô hệ số chia mà cả file dùng chung (tên đã định nghĩa DonVi).
 * Nhánh cuối của chuỗi IF là đơn vị đang chọn, không phải đơn vị lớn nhất: xoá trắng ô chọn thì
 * file giữ nguyên đơn vị lúc tải về chứ không lặng lẽ nhảy sang tỷ đồng.
 */
function oChonDonVi(dv) {
  const heSo = DON_VI.reduce((f, u) => `IF(${O_DON_VI}="${unitLabel(u)}",${u},${f})`, String(dv));
  return [
    row(5, [cellStr('A5', t('xl.unit.pick'), S.labelB), cellStr(O_DON_VI, unitLabel(dv), S.unitCell),
      cellFormula(O_HE_SO, heSo, dv, S.code), cellStr('D5', t('xl.unit.hint'), S.sub)], 22),
  ];
}

function overviewSheet(ds, checks, dv, details, now) {
  const out = [
    row(1, [cellStr('A1', t('xl.ov.title'), S.title)], 22),
    row(2, [cellStr('A2', ds.company || t('xl.company'), S.textB)]),
    row(3, [cellStr('A3', t('xl.ov.subPick'), S.sub)]),
    ...oChonDonVi(dv),
    row(7, ['xl.ov.period', 'xl.ov.months', 'xl.ov.files', 'xl.ov.check'].map((k, i) => cellStr(`${numToCol(i + 1)}7`, t(k), S.head)), 24),
  ];
  ds.periods.forEach((p, i) => {
    const n = 8 + i;
    const files = [...new Set(Object.values(ds.src[p.id] || {}).map((x) => (x.manual ? t('xl.ov.manual') : x.file)).filter(Boolean))].join('; ');
    const iss = checks[p.id] || [];
    out.push(row(n, [cellStr(`A${n}`, periodTitle(p), S.labelB), cellNum(`B${n}`, p.months, S.text), cellStr(`C${n}`, files, S.label),
      cellStr(`D${n}`, iss.length ? t('xl.ov.issues', { n: iss.length, list: iss.slice(0, 3).map((x) => x.label).join('; ') }) : t('xl.ov.fine'), iss.length ? S.labelDo : S.label)]));
  });
  let n = 9 + ds.periods.length;
  const notes = [t('xl.note.unit'), t('xl.note.1'), t('xl.note.2'), t('xl.note.3'), t('xl.note.4'),
    details ? t('xl.note.details') : t('xl.note.locked'), t('xl.note.5', { d: now.toLocaleString(locale()) })];
  for (const line of notes) { out.push(row(n, [cellStr(`A${n}`, line, S.sub)])); n += 1; }
  return sheetXml({
    cols: [24, 13, 46, 58],
    rowsXml: out,
    merges: ['A1:D1', 'A2:D2', 'A3:D3'],
    validations: [{ sqref: O_DON_VI, list: DON_VI.map((u) => unitLabel(u)), prompt: { title: t('xl.unit.pick'), text: t('xl.unit.hint') } }],
  });
}
