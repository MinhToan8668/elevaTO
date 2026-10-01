// "Form chi tiết elevaTO": file .xlsx đúng bố cục dữ liệu mà model forecast của elevaTO cần —
// ba báo cáo đã quy về dòng của model, cộng thuyết minh (doanh thu/LN gộp theo mảng, TSCĐ theo nhóm,
// biến động vốn chủ, vay). Mỗi năm một cột. Xuất thẳng, không cần người dùng đưa file model vào.

import { buildModel, MODEL_ROWS } from '../targets/model.js';
import { numToCol } from './xlsx.js';
import { S, cellStr, cellNum, row, sheetXml, bookFiles } from './xlsxout.js';

// buildModel trả mỗi ô là { v, src } và số đã quy về TRIỆU ĐỒNG (đơn vị gốc của model elevaTO).
const MODEL_UNIT = 1e6;
const oV = (o) => (o && Number.isFinite(o.v) ? o.v : null);

const HEAD_ROW = 4;
// Mỗi nhóm dòng của model thành một sheet, theo đúng thứ tự người dùng đọc.
const NHOM = [
  { key: 'KQKD', ten: 'Kết quả kinh doanh' },
  { key: 'CĐKT', ten: 'Tình hình tài chính' },
  { key: 'LCTT', ten: 'Lưu chuyển tiền tệ' },
  { key: 'Mảng', ten: 'Doanh thu theo mảng' },
  { key: 'TSCĐ', ten: 'Tài sản cố định' },
  { key: 'Vốn chủ', ten: 'Biến động vốn chủ' },
  { key: 'Nợ vay', ten: 'Vay và nợ' },
  { key: 'Tham số', ten: 'Thông số khác' },
];

/**
 * @param ds   bộ dữ liệu (dataset.js)
 * @param opts.unit  đơn vị hiển thị trong file (model gốc dùng triệu đồng)
 * @param opts.segmentMap / segmentNames  xếp mảng kinh doanh vào ô của model
 * @returns { [path]: string }
 */
export function buildModelXlsx(ds, { unit = 1e6, unitLabel = 'triệu đồng', segmentMap, segmentNames, now = new Date() } = {}) {
  const { byYear, warnings } = buildModel(ds, { segmentMap, segmentNames });
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const theoNhom = new Map(NHOM.map((n) => [n.key, []]));
  for (const r of MODEL_ROWS) { const l = theoNhom.get(r.group); if (l) l.push(r); }

  const sheets = [{ name: 'Tổng quan', xml: tongQuan(ds, years, warnings, unitLabel, now) }];
  for (const n of NHOM) {
    const rows = (theoNhom.get(n.key) || []).filter((r) => years.some((y) => oV(byYear[y][r.row]) !== null));
    if (rows.length) sheets.push({ name: n.ten, xml: nhomSheet(ds, n.ten, rows, byYear, years, unit, unitLabel) });
  }
  return bookFiles(sheets, unit);
}

function nhomSheet(ds, ten, rows, byYear, years, unit, unitLabel) {
  const last = numToCol(2 + years.length);
  const out = [
    row(1, [cellStr('A1', ds.company || 'Doanh nghiệp', S.title)], 22),
    row(2, [cellStr('A2', ten.toUpperCase(), S.textB)]),
    row(3, [cellStr('A3', `Đơn vị: ${unitLabel} · Form chi tiết elevaTO · dòng tương ứng sheet 03.Input_FS của model`, S.sub)]),
    row(HEAD_ROW, [cellStr(`A${HEAD_ROW}`, 'Dòng model', S.head), cellStr(`B${HEAD_ROW}`, 'Chỉ tiêu', S.head),
      ...years.map((y, i) => cellStr(`${numToCol(3 + i)}${HEAD_ROW}`, `Năm ${y}`, S.head))], 30),
  ];
  rows.forEach((r, i) => {
    const n = HEAD_ROW + 1 + i;
    out.push(row(n, [
      cellNum(`A${n}`, r.row, S.code),
      cellStr(`B${n}`, r.label, S.label),
      ...years.map((y, j) => {
        const o = byYear[y][r.row], v = oV(o);
        // src 'bctc' = chép từ BCTC; còn lại là do máy ước tính/suy ra → in nghiêng cho dễ rà.
        return cellNum(`${numToCol(3 + j)}${n}`, chia(v, unit), o && o.src && o.src !== 'bctc' ? S.numB : S.num);
      }),
    ]));
  });
  return sheetXml({ cols: [11, 56, ...years.map(() => 18)], rowsXml: out, freeze: { x: 2, y: HEAD_ROW }, merges: [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`] });
}

/** v là triệu đồng (đơn vị của model) → đổi sang đơn vị người dùng chọn. */
const chia = (v, unit) => (Number.isFinite(v) ? Math.round(v * MODEL_UNIT / unit * 1000) / 1000 : null);

function tongQuan(ds, years, warnings, unitLabel, now) {
  const out = [
    row(1, [cellStr('A1', 'FORM CHI TIẾT ELEVATO — DỮ LIỆU CHO MODEL FORECAST', S.title)], 22),
    row(2, [cellStr('A2', ds.company || 'Doanh nghiệp', S.textB)]),
    row(3, [cellStr('A3', `Đơn vị các sheet số liệu: ${unitLabel} · Tạo lúc ${now.toLocaleString('vi-VN')}`, S.sub)]),
    row(5, [cellStr('A5', 'Năm có dữ liệu', S.head), cellStr('B5', 'Nguồn (file BCTC)', S.head)], 24),
  ];
  years.forEach((y, i) => {
    const n = 6 + i;
    const p = ds.periods.find((x) => x.year === y && x.months === 12);
    const files = p ? [...new Set(Object.values(ds.src[p.id] || {}).map((x) => (x.manual ? 'sửa tay' : x.file)).filter(Boolean))].join('; ') : '';
    out.push(row(n, [cellStr(`A${n}`, `Năm ${y}`, S.labelB), cellStr(`B${n}`, files, S.label)]));
  });
  let n = 7 + years.length;
  out.push(row(n, [cellStr(`A${n}`, 'Chỉ lấy các kỳ 12 tháng — model forecast chạy theo năm.', S.sub)])); n++;
  out.push(row(n, [cellStr(`A${n}`, 'Cột "Dòng model" là số dòng tương ứng trong sheet 03.Input_FS của model elevaTO.', S.sub)])); n += 2;
  if (warnings.length) {
    out.push(row(n, [cellStr(`A${n}`, `${warnings.length} lưu ý khi dựng số:`, S.textB)])); n++;
    for (const w of warnings.slice(0, 40)) { out.push(row(n, [cellStr(`A${n}`, `• ${w}`, S.sub)])); n++; }
  }
  return sheetXml({ cols: [26, 70], rowsXml: out, merges: ['A1:B1', 'A2:B2', 'A3:B3'] });
}
