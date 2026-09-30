// Sửa trực tiếp XML của một sheet trong file .xlsx — chỉ đụng tới đúng các ô cần ghi.
//
// Vì sao không dùng thư viện Excel (SheetJS / ExcelJS / openpyxl) để ghi: chúng dựng lại cả file và
// làm mất biểu đồ, định dạng có điều kiện… (model elevaTO mất 5 biểu đồ Dashboard). Ở đây chỉ thay
// chuỗi <c> của từng ô, mọi phần khác của file giữ nguyên từng byte.
// Không bao giờ ghi đè ô có công thức.

export function colToNum(col) {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function numToCol(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
export function splitRef(ref) {
  const m = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(ref);
  if (!m) return null;
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => cp(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

const cp = (n) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd');

export function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
}
// Nối mọi <t> nhưng bỏ phần phiên âm (<rPh>) của Excel.
const textOf = (inner) => [...inner.replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
  .map((t) => unesc(t[1])).join('');

// Thân ô không được vượt qua thẻ <c> kế tiếp → file hỏng (thiếu </c>) không làm regex chạy bình phương.
const CELL_RE = /<c\s([^>]*?)(\/>|>((?:(?!<c[\s>])[\s\S])*?)<\/c>)/g;
const attr = (attrs, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs); return m ? m[1] : null; };

/** { "B8": "Net revenue", "I4": 2025, … } — giá trị đã lưu (với ô công thức là kết quả lần tính gần nhất). */
export function readCells(sheetXml, shared) {
  const out = {};
  for (const m of sheetXml.matchAll(CELL_RE)) {
    const ref = attr(m[1], 'r');
    if (!ref || !splitRef(ref)) continue;
    const body = m[3] || '';
    const t = attr(m[1], 't');
    if (t === 'inlineStr') { out[ref] = textOf(body); continue; }
    const v = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (!v) continue;
    if (t === 's') out[ref] = shared[Number(v[1])] ?? '';
    else if (t === 'str') out[ref] = unesc(v[1]);
    else if (t === 'b') out[ref] = v[1] === '1';
    else if (t === 'e') out[ref] = unesc(v[1]);
    else out[ref] = Number(v[1]);
  }
  return out;
}

function cellXml(ref, style, v) {
  const s = style ? ` s="${style}"` : '';
  if (v === null || v === undefined) return `<c r="${ref}"${s}/>`;
  if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

/**
 * @param cells [{ ref: 'I8', v: number | string | null }]
 * @returns { xml, skipped: [ref…] }  skipped = ô có công thức, đã bỏ qua
 */
export function patchSheetXml(sheetXml, cells) {
  const byRow = new Map();
  for (const c of cells) {
    const p = splitRef(c.ref);
    if (!p) throw new Error(`Ô không hợp lệ: ${c.ref}`);
    if (typeof c.v === 'number' && !Number.isFinite(c.v)) throw new Error(`Giá trị không hợp lệ ở ${c.ref}`);
    if (!byRow.has(p.row)) byRow.set(p.row, new Map());
    byRow.get(p.row).set(p.col, c);
  }
  const skipped = [];
  const open = sheetXml.indexOf('<sheetData');
  const openEnd = sheetXml.indexOf('>', open);
  const selfClosed = sheetXml[openEnd - 1] === '/';
  const close = selfClosed ? openEnd + 1 : sheetXml.indexOf('</sheetData>');
  if (open < 0 || close < 0) throw new Error('Không thấy <sheetData> trong sheet');
  const body = selfClosed ? '' : sheetXml.slice(openEnd + 1, close);

  // Tách từng <row>: [số dòng, chuỗi XML]
  const rows = [];
  for (const m of body.matchAll(/<row\s([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g)) {
    rows.push({ r: Number(attr(m[1], 'r')), attrs: m[1], inner: m[3] ?? null });
  }
  const done = new Set();
  const out = rows.map((row) => {
    const want = byRow.get(row.r);
    if (!want) return rowXml(row);
    done.add(row.r);
    return rowXml({ ...row, inner: patchRow(row.inner || '', row.r, want, skipped) });
  });
  for (const [r, want] of byRow) {
    if (done.has(r)) continue;
    out.push(rowXml({ r, attrs: `r="${r}"`, inner: patchRow('', r, want, skipped) }));   // sortRows xếp lại đúng chỗ
  }
  const head = selfClosed ? sheetXml.slice(0, openEnd - 1) + '>' : sheetXml.slice(0, openEnd + 1);
  const tail = selfClosed ? '</sheetData>' + sheetXml.slice(openEnd + 1) : sheetXml.slice(close);
  return { xml: head + sortRows(out).join('') + tail, skipped };
}

const rowXml = (row) => (row.inner === null ? `<row ${row.attrs}/>` : `<row ${row.attrs}>${row.inner}</row>`);
const sortRows = (xmls) => xmls.map((x) => [Number(/<row\s[^>]*?\br="(\d+)"/.exec(x)[1]), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

function patchRow(inner, r, want, skipped) {
  const cells = [...inner.matchAll(CELL_RE)].map((m) => ({ col: splitRef(attr(m[1], 'r')).col, xml: m[0], attrs: m[1], body: m[3] || '' }));
  const rest = inner.replace(CELL_RE, '');            // phần không phải <c> (hiếm) giữ lại ở cuối
  for (const [col, c] of want) {
    const i = cells.findIndex((x) => x.col === col);
    if (i >= 0) {
      if (/<f[\s>]/.test(cells[i].body) || /<f\/>/.test(cells[i].body)) { skipped.push(c.ref); continue; }
      cells[i] = { col, xml: cellXml(c.ref, attr(cells[i].attrs, 's'), c.v) };
    } else {
      cells.push({ col, xml: cellXml(c.ref, null, c.v) });
    }
  }
  return cells.sort((a, b) => a.col - b.col).map((x) => x.xml).join('') + rest;
}

/** 'xl/worksheets/sheet4.xml' của sheet có tên đó, hoặc null. */
export function sheetPathByName(workbookXml, relsXml, name) {
  for (const m of workbookXml.matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    if (unesc(attr(m[1], 'name') || '') !== name) continue;
    const rid = /\br:id="([^"]+)"/.exec(m[1]);
    if (!rid) return null;
    const rel = [...relsXml.matchAll(/<Relationship\s([^>]*?)\/?>/g)].find((x) => attr(x[1], 'Id') === rid[1]);
    if (!rel) return null;
    const target = attr(rel[1], 'Target');
    return target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  }
  return null;
}

/** Bắt Excel tính lại mọi công thức khi mở — vì ô công thức đang giữ kết quả cũ. */
export function setFullCalcOnLoad(workbookXml) {
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^>]*?)(\/?)>/, (_, a, sl) => {
      const cleaned = a.replace(/\sfullCalcOnLoad="[^"]*"/, '');
      return `<calcPr${cleaned} fullCalcOnLoad="1"${sl}>`;
    });
  }
  return workbookXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
}

/** Tên các sheet theo thứ tự trong workbook.xml. */
export function sheetNames(workbookXml) {
  return [...workbookXml.matchAll(/<sheet\s([^>]*?)\/?>/g)].map((m) => unesc(attr(m[1], 'name') || '')).filter(Boolean);
}

/** { A1: 'x', C2: 5 } → [['x'], [null, null, 5]] (dòng/cột đánh số từ 0, ô trống = null). */
export function cellsToRows(cells) {
  const rows = [];
  for (const [ref, v] of Object.entries(cells)) {
    const p = splitRef(ref);
    if (!p || p.row > 100000 || p.col > 1000) continue;
    const r = (rows[p.row - 1] ||= []);
    r[p.col - 1] = v;
  }
  for (let i = 0; i < rows.length; i++) rows[i] = Array.from(rows[i] || [], (x) => (x === undefined ? null : x));
  return rows;
}
