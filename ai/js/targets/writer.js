// Ghi dữ liệu vào file model elevaTO người dùng chọn, giữ nguyên mọi thứ khác (công thức, biểu đồ, định dạng).
// Nhận một đối tượng JSZip đã mở file (trình duyệt và bài kiểm tra dùng chung).

import { readCells, parseSharedStrings, patchSheetXml, sheetPathByName, setFullCalcOnLoad } from '../core/xlsx.js';
import { buildModel, MODEL_ROWS } from './model.js';

async function openBook(zip) {
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!wb || !rels) throw new Error('File không phải workbook Excel (.xlsx) hợp lệ');
  const ssFile = zip.file('xl/sharedStrings.xml');
  const shared = ssFile ? parseSharedStrings(await ssFile.async('string')) : [];
  const sheet = async (name) => {
    const path = sheetPathByName(wb, rels, name);
    if (!path || !zip.file(path)) return null;
    const xml = await zip.file(path).async('string');
    return { path, xml, cells: readCells(xml, shared) };
  };
  return { wb, sheet };
}

async function save(zip, book, patches) {
  const skipped = [];
  for (const p of patches) {
    const r = patchSheetXml(p.sheet.xml, p.cells);
    zip.file(p.sheet.path, r.xml);
    skipped.push(...r.skipped.map((ref) => `${p.name}!${ref}`));
  }
  zip.file('xl/workbook.xml', setFullCalcOnLoad(book.wb));
  // calcChain chỉ là bộ nhớ đệm thứ tự tính; bỏ đi để Excel tự dựng lại, tránh lỗi "file bị hỏng".
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
    const relsPath = 'xl/_rels/workbook.xml.rels';
    const rels = await zip.file(relsPath).async('string');
    zip.file(relsPath, rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  }
  return skipped;
}

// ─── Model elevaTO ───────────────────────────────────────────────

export const MODEL_SHEET = '03.Input_FS';

/**
 * @param opts.segmentMap, opts.segmentNames[5] (ghi tên mảng vào cột B), opts.updateLastAct (mặc định true)
 * @param opts.clearOtherYears  xoá số nhập tay ở các năm lịch sử (≤ LastAct) KHÔNG có trong dữ liệu mới —
 *        bắt buộc khi đổ công ty khác vào model mẫu, nếu không số cũ của model mẫu trộn với số công ty mới.
 * @returns { written, skipped, missingYears, warnings, cellsByYear }
 */
export async function fillModelWorkbook(zip, ds, opts = {}) {
  const book = await openBook(zip);
  const inp = await book.sheet(MODEL_SHEET);
  if (!inp) throw new Error(`Không thấy sheet "${MODEL_SHEET}" — file này không phải model elevaTO`);
  // Hàng 4 là năm của từng cột (ô công thức, đọc kết quả đã lưu).
  const yearCol = {};
  for (const [ref, v] of Object.entries(inp.cells)) {
    const m = /^([A-Z]+)4$/.exec(ref);
    if (m && Number.isInteger(v) && v > 1990 && v < 2100) yearCol[v] = m[1];
  }
  const built = buildModel(ds, opts);
  const cells = [];
  const missingYears = [];
  for (const [year, rows] of Object.entries(built.byYear)) {
    const col = yearCol[year];
    if (!col) { missingYears.push(+year); continue; }
    for (const [row, c] of Object.entries(rows)) cells.push({ ref: `${col}${row}`, v: round(c.v) });
  }
  if (Array.isArray(opts.segmentNames)) {
    opts.segmentNames.forEach((name, i) => { if (name) cells.push({ ref: `B${132 + i}`, v: String(name) }, { ref: `B${140 + i}`, v: String(name) }); });
  }
  const written = Object.keys(built.byYear).map(Number).filter((y) => yearCol[y]);
  const ctrl = await book.sheet('02.Control');
  const lastAct = ctrl && Number.isInteger(ctrl.cells.C4) ? ctrl.cells.C4 : null;
  const cleared = [];
  if (opts.clearOtherYears && lastAct) {
    for (const [year, col] of Object.entries(yearCol)) {
      if (+year > Math.max(lastAct, ...written) || written.includes(+year)) continue;
      for (const d of MODEL_ROWS) if (d.row < 214) cells.push({ ref: `${col}${d.row}`, v: null });
      cleared.push(+year);
    }
  }
  const patches = [{ name: MODEL_SHEET, sheet: inp, cells }];
  if (opts.updateLastAct !== false && written.length && lastAct && Math.max(...written) > lastAct) {
    patches.push({ name: '02.Control', sheet: ctrl, cells: [{ ref: 'C4', v: Math.max(...written) }] });
  }
  const skipped = await save(zip, book, patches);
  const warnings = [...built.warnings];
  if (written.length && written.length < 4) warnings.push(`Model cần ít nhất 4 năm lịch sử (mới có ${written.length}) — giả định bình quân 3 năm và các tỷ lệ đầu kỳ sẽ thiếu.`);
  if (written.length) warnings.push(`Năm ${Math.min(...written)}: không có năm trước nên biến động vốn chủ không ghi được — dòng CHECK 206 năm đó có thể báo lệch.`);
  return { written, cleared, skipped, missingYears, warnings, cellsByYear: built.byYear };
}

// Số triệu đồng: giữ 3 chữ số thập phân (= nghìn đồng), tránh đuôi 0.30000000000000004.
const round = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
