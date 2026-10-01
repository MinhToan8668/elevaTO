// "Form chi tiết elevaTO": sao y bố cục sheet 03.Input_FS của model forecast elevaTO —
// GIỮ NGUYÊN SỐ DÒNG, nên chọn vùng C<đầu>:…<cuối> trong file này dán thẳng vào ô cùng dòng
// của model là khớp, không lệch dòng nào.
//
// Bố cục (nhãn, thứ tự, dòng nào nhập tay / là công thức / là dòng CHECK) lấy từ chính template
// qua tools/doc-template.py → js/targets/sheets.js. Đơn vị cố định TRIỆU ĐỒNG vì model dùng vậy;
// đổi đơn vị ở đây là dán vào model sẽ sai hệ số.

import { buildModel } from '../targets/model.js';
import { INPUT_FS } from '../targets/sheets.js';
import { numToCol } from './xlsx.js';
import { S, cellStr, cellNum, cellFormula, row, sheetXml, bookFiles, tinhSanO, ghiO } from './xlsxout.js';
import { t, locale } from '../i18n.js';

const SHEET = '03.Input_FS';
const COT_DAU = 3;                                  // cột C — đúng cột đầu của model
const HEAD_ROW = 4;                                 // dòng "Năm" trong model
const oV = (o) => (o && Number.isFinite(o.v) ? o.v : null);

// Dòng CHECK mà template để trống (=0) vì cần so với năm trước. Có đủ dữ liệu thì tính thật:
// cột năm đầu không có năm trước nên vẫn để 0.
const CHECK_LIEN_NAM = {
  206: (c, p) => `ABS((${c}85-${p}85)-SUM(${c}191:${c}195))+ABS((${c}89-${p}89)-${c}28-(${c}202+${c}203+${c}204))`,
  212: (c, p) => `(${c}78-${p}78)-(${c}208+${c}209)`,
};

/**
 * @param ds   bộ dữ liệu (dataset.js)
 * @param opts.segmentMap / segmentNames  xếp mảng kinh doanh vào ô 132–136 / 140–144 của model
 * @returns { [path]: string }
 */
export function buildModelXlsx(ds, { segmentMap, segmentNames, now = new Date() } = {}) {
  const { byYear, warnings } = buildModel(ds, { segmentMap, segmentNames });
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  return bookFiles([
    { name: t('xl.sheet.overview'), xml: tongQuan(ds, years, warnings, now) },
    { name: SHEET, xml: inputSheet(ds, byYear, years, segmentNames) },
  ], { unit: 1e6 });
}

/** Công thức của template viết theo cột C → đổi sang cột của năm đang ghi. */
const doiCot = (f, col) => f.replace(/\b(C)(\$?)(\d+)\b/g, (_, __, d, n) => `${col}${d}${n}`);

const NHAN_THEO_DONG = new Map(INPUT_FS.map((r) => [r.r, r.label]));

/**
 * Nhãn dòng. Mục D/E của model là 5 ô mảng kinh doanh: nếu thuyết minh có tên mảng thì dùng tên
 * thật. Dòng 140–144 trong template lấy nhãn bằng công thức =$B$132… nên trỏ về cùng ô mảng.
 */
function nhan(r, segmentNames) {
  const goc = r.ref || r.r;
  const i = goc - 132;
  if (i >= 0 && i < 5 && segmentNames && segmentNames[i]) return segmentNames[i];
  return r.ref ? (NHAN_THEO_DONG.get(r.ref) || '') : r.label;
}

/** Kiểu ô số theo định dạng của template; dòng nhập tay tô vàng như ô nhập của model. */
function kieuSo(r, src) {
  if (r.kind === 'input') {
    if (r.fmt === 'pct') return S.pctIn;
    if (r.fmt === 'dec') return S.dec;
    if (r.fmt === 'int') return S.int;
    return src && src !== 'bctc' ? S.numEst : S.numIn;
  }
  if (r.fmt === 'pct') return S.pct;
  return S.numB;
}

function inputSheet(ds, byYear, years, segmentNames) {
  const cot = (i) => numToCol(COT_DAU + i);
  const last = cot(years.length - 1);
  // Dựng kế hoạch ô trước (số hay công thức), tính sẵn giá trị công thức, rồi mới ghi XML —
  // nhờ vậy trình xem không tự tính lại cũng thấy số.
  const ke = INPUT_FS.filter((r) => r.r > 5).map((r) => keHoach(r, years, byYear, cot, segmentNames));
  const tinhSan = tinhSanO(ke);

  const out = [
    row(1, [cellStr('A1', ds.company || t('xl.company'), S.title)], 22),
    row(2, [cellStr('A2', t('xlm.ifsSub'), S.sub)], 28),
    row(3, [cellStr('B3', t('xlm.ifsStatus'), S.labelB),
      ...years.map((_, i) => cellFormula(`${cot(i)}3`, trangThai(cot(i)), null, S.textB))]),
    row(HEAD_ROW, [cellStr(`B${HEAD_ROW}`, t('xlm.ifsYear'), S.head),
      ...years.map((y, i) => cellStr(`${cot(i)}${HEAD_ROW}`, String(y), S.head))], 26),
    row(5, [cellStr('B5', t('xlm.ifsAF'), S.labelB),
      ...years.map((y, i) => cellStr(`${cot(i)}5`, t('xl.actual', { y }), S.textB))]),
  ];
  for (const k of ke) out.push(ghiDong(k, tinhSan));
  return sheetXml({
    cols: [3, 62, ...years.map(() => 15)],
    rowsXml: out,
    freeze: { x: 2, y: 5 },
    merges: [`A1:${last}1`, `A2:${last}2`],
  });
}

/** Ghi một dòng đã lên kế hoạch; ô công thức kèm giá trị tính sẵn nếu tính được. */
const ghiDong = (k, san) => row(k.r, [k.nhan, ...k.o.map((o) => ghiO(o, san))], k.ht);

/** Chuỗi nằm trong công thức Excel: dấu nháy kép phải viết đôi. */
const chuoi = (k) => `"${String(t(k)).replace(/"/g, '""')}"`;

/** Dòng TRẠNG THÁI: bỏ lớp LastAct của template vì file này chỉ có năm actual. */
const trangThai = (c) => `IF(N(${c}8)=0,${chuoi('xlm.ifsBlank')},IF(AND(ABS(N(${c}93))<1,ABS(N(${c}138))<0.005*ABS(N(${c}8)),N(${c}189)<1,N(${c}206)<1),${chuoi('xlm.ifsOk')},${chuoi('xlm.ifsBad')}))`;

/** Dòng mà trangThai() và CHECK_LIEN_NAM dựa vào — có test chốt là chúng tồn tại trong template. */
export const DONG_PHU_THUOC = [8, 28, 78, 85, 89, 93, 138, 189, 191, 195, 202, 203, 204, 206, 208, 209, 212];

/** Một dòng → { nhãn, các ô theo năm } chưa ghi XML. */
function keHoach(r, years, byYear, cot, segmentNames) {
  const lab = nhan(r, segmentNames);
  if (r.kind === 'head') {
    // Dải mục lớn trải hết bề ngang cho dễ nhìn — ô năm trống nhưng cùng nền.
    return { r: r.r, ht: 20, nhan: cellStr(`B${r.r}`, lab, S.secHead), o: years.map((_, i) => ({ ref: `${cot(i)}${r.r}`, trong: true, s: S.secHead })) };
  }
  if (r.kind === 'subhead') return { r: r.r, nhan: cellStr(`B${r.r}`, lab, S.subHead), o: [] };
  if (r.kind === 'note') return { r: r.r, nhan: cellStr(`B${r.r}`, lab, S.sub), o: [] };

  const o = years.map((y, i) => {
    const ref = `${cot(i)}${r.r}`;
    const cell = byYear[y][r.r];
    if (r.kind === 'input') return { ref, v: oV(cell), s: kieuSo(r, cell && cell.src) };
    const f = congThuc(r, cot(i), i > 0 ? cot(i - 1) : null);
    if (f === null) return { ref, v: oV(cell), s: kieuSo(r) };
    return { ref, f, s: r.kind === 'check' ? S.numCheck : kieuSo(r) };
  });
  return { r: r.r, nhan: cellStr(`B${r.r}`, lab, nhanKieu(r)), o };
}

const nhanKieu = (r) => (r.kind === 'check' ? S.labelTot : r.kind === 'calc' ? S.labelB : S.labelIn);

/** Công thức cho dòng calc / check, đã đổi sang cột năm đang ghi. null = không có công thức. */
function congThuc(r, col, truoc) {
  const lienNam = CHECK_LIEN_NAM[r.r];
  if (lienNam) return truoc ? lienNam(col, truoc) : '0';
  return r.f ? doiCot(r.f, col) : null;
}

function tongQuan(ds, years, warnings, now) {
  const out = [
    row(1, [cellStr('A1', t('xlm.title'), S.title)], 22),
    row(2, [cellStr('A2', ds.company || t('xl.company'), S.textB)]),
    row(3, [cellStr('A3', t('xlm.subFixed', { d: now.toLocaleString(locale()) }), S.sub)]),
    row(5, [cellStr('A5', t('xlm.years'), S.head), cellStr('B5', t('xlm.sources'), S.head)], 24),
  ];
  years.forEach((y, i) => {
    const n = 6 + i;
    const p = ds.periods.find((x) => x.year === y && x.months === 12);
    const files = p ? [...new Set(Object.values(ds.src[p.id] || {}).map((x) => (x.manual ? t('xl.ov.manual') : x.file)).filter(Boolean))].join('; ') : '';
    out.push(row(n, [cellStr(`A${n}`, t('xlm.year', { y }), S.labelB), cellStr(`B${n}`, files, S.label)]));
  });
  let n = 7 + years.length;
  for (const k of ['xlm.note.1', 'xlm.note.paste', 'xlm.note.pasteRow', 'xlm.note.yellow', 'xlm.note.check']) {
    out.push(row(n, [cellStr(`A${n}`, t(k), S.sub)])); n++;
  }
  n++;
  if (warnings.length) {
    out.push(row(n, [cellStr(`A${n}`, t('xlm.warn', { n: warnings.length }), S.textB)])); n++;
    for (const w of warnings.slice(0, 40)) { out.push(row(n, [cellStr(`A${n}`, `• ${w}`, S.sub)])); n++; }
  }
  return sheetXml({ cols: [26, 86], rowsXml: out, merges: ['A1:B1', 'A2:B2', 'A3:B3'] });
}
