// Ghi dữ liệu vào file Excel người dùng chọn (model DGW / Form nội bộ 2026), giữ nguyên mọi thứ khác.
// Nhận một đối tượng JSZip đã mở file (trình duyệt và bài kiểm tra dùng chung).

import { readCells, parseSharedStrings, patchSheetXml, sheetPathByName, setFullCalcOnLoad, numToCol, colToNum } from '../core/xlsx.js';
import { buildDGW, DGW_ROWS } from './dgw.js';

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

// ─── Model elevaTO (mẫu DGW) ───────────────────────────────────────────────

export const DGW_SHEET = '03.Input_FS';

/**
 * @param opts.segmentMap, opts.segmentNames[5] (ghi tên mảng vào cột B), opts.updateLastAct (mặc định true)
 * @param opts.clearOtherYears  xoá số nhập tay ở các năm lịch sử (≤ LastAct) KHÔNG có trong dữ liệu mới —
 *        bắt buộc khi đổ công ty khác vào model mẫu, nếu không số cũ của DGW trộn với số công ty mới.
 * @returns { written, skipped, missingYears, warnings, cellsByYear }
 */
export async function fillDGWWorkbook(zip, ds, opts = {}) {
  const book = await openBook(zip);
  const inp = await book.sheet(DGW_SHEET);
  if (!inp) throw new Error(`Không thấy sheet "${DGW_SHEET}" — file này không phải model elevaTO mẫu DGW`);
  // Hàng 4 là năm của từng cột (ô công thức, đọc kết quả đã lưu).
  const yearCol = {};
  for (const [ref, v] of Object.entries(inp.cells)) {
    const m = /^([A-Z]+)4$/.exec(ref);
    if (m && Number.isInteger(v) && v > 1990 && v < 2100) yearCol[v] = m[1];
  }
  const built = buildDGW(ds, opts);
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
      for (const d of DGW_ROWS) if (d.row < 214) cells.push({ ref: `${col}${d.row}`, v: null });
      cleared.push(+year);
    }
  }
  const patches = [{ name: DGW_SHEET, sheet: inp, cells }];
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

// ─── Form nội bộ 2026 (sheet "Lưu trữ") ────────────────────────────────────

export const FORM_SHEET = 'Lưu trữ';
const GROUP = { 'CĐKT': 'BS', 'KQKD': 'IS', 'LCTT': 'CF' };
const FIRST_COL = colToNum('D'), LAST_COL = colToNum('AC');

export function periodCode(p) {
  if (p.months === 12) return `FY-${p.year}`;
  return `Q${Math.ceil(p.endMonth / 3)}-${p.year}`;
}
export function periodLabel(p) {
  if (p.months === 12) return String(p.year);
  const q = `Q${Math.ceil(p.endMonth / 3)}/${p.year}`;
  return p.months > 3 ? `${q} (LK ${p.months}T)` : q;
}

/** Mỗi kỳ một cột (trùng mã kỳ thì ghi đè cột đó), đơn vị đồng. */
export async function fillForm2026Workbook(zip, ds, opts = {}) {
  const book = await openBook(zip);
  const st = await book.sheet(FORM_SHEET);
  if (!st) throw new Error(`Không thấy sheet "${FORM_SHEET}" — file này không phải Form nội bộ 2026`);
  const rowOf = {};                                            // "BS:131" → 12…
  for (const [ref, code] of Object.entries(st.cells)) {
    const m = /^B(\d+)$/.exec(ref);
    const grp = st.cells[`A${m?.[1]}`];
    if (m && GROUP[grp] && code !== '' && code !== undefined) rowOf[`${GROUP[grp]}:${String(code)}`] = +m[1];
  }
  const colOfCode = {};
  const used = new Set();
  for (let c = FIRST_COL; c <= LAST_COL; c++) {
    const v = st.cells[`${numToCol(c)}6`];
    if (v) { colOfCode[v] = numToCol(c); used.add(c); }
  }
  const cells = [];
  const periods = [...ds.periods].sort((a, b) => (a.year - b.year) || (a.months - b.months));
  const unplaced = [];
  for (const p of periods) {
    const code = periodCode(p);
    let col = colOfCode[code];
    if (!col) {
      let c = FIRST_COL; while (c <= LAST_COL && used.has(c)) c++;
      if (c > LAST_COL) { unplaced.push(code); continue; }
      used.add(c); col = numToCol(c); colOfCode[code] = col;
    }
    cells.push({ ref: `${col}6`, v: code }, { ref: `${col}9`, v: periodLabel(p) }, { ref: `${col}10`, v: p.months });
    const vals = ds.values[p.id] || {};
    for (const [key, row] of Object.entries(rowOf)) {
      const v = vals[key];
      cells.push({ ref: `${col}${row}`, v: Number.isFinite(v) ? Math.round(v) : null });   // ô không có số → xoá số cũ
    }
  }
  const patches = [{ name: FORM_SHEET, sheet: st, cells }];
  const f1 = await book.sheet('F1');
  if (f1) {
    const show = periods.slice(-4).map(periodLabel);
    const f1cells = show.map((label, i) => ({ ref: `${numToCol(3 + i)}9`, v: label }));
    if (ds.company) f1cells.push({ ref: 'C5', v: ds.company });
    patches.push({ name: 'F1', sheet: f1, cells: f1cells });
  }
  const skipped = await save(zip, book, patches);
  return { skipped, unplaced, rows: Object.keys(rowOf).length };
}
