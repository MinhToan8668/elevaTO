// Xuất một biểu đồ ra ảnh PNG hoặc file Excel số liệu.
//
// PNG: biểu đồ là SVG vẽ bằng biến CSS (var(--em)…) và class (.lbl, .grid) — đem SVG đó đi vẽ riêng
// thì mất hết màu. Nên chép màu / nét / cỡ chữ đã tính sẵn của từng phần tử vào bản sao, thêm tiêu đề
// và chú giải, rồi vẽ lên canvas ở độ phân giải gấp đôi.
// Excel: dùng chung bộ ghi .xlsx của Form chuẩn hóa (core/xlsxout.js), không thêm thư viện.

import { download, safeName } from './dom.js';
import { loadJSZip } from '../libs.js';
import { bookFiles, sheetXml, cellStr, cellNum, row, S } from '../core/xlsxout.js';
import { numToCol } from '../core/xlsx.js';

const NS = 'http://www.w3.org/2000/svg';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const KIEU = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'opacity', 'font-size', 'font-family', 'font-weight'];

/** Màu của một biến CSS ra dạng vẽ được (rgb / color(...)) — đọc qua một phần tử tạm. */
function mauCss(v, chua) {
  const el = document.createElement('i');
  el.style.color = v;
  chua.append(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}

/**
 * @param svg     phần tử <svg class="cv"> đang hiện trên trang
 * @param title   tên biểu đồ · unit: chữ đơn vị in cạnh tên
 * @param legend  [{ name, color }] các đường đang hiện
 */
export async function chartPng(svg, { title, unit, legend, file }) {
  const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
  const fig = svg.closest('figure') || document.body;
  const font = getComputedStyle(fig).fontFamily;
  const nen = mauCss('var(--surface)', fig), chu = mauCss('var(--strong)', fig), phu = mauCss('var(--muted)', fig);

  // Bản sao có màu đã tính sẵn; bỏ lớp chạm chuột và chữ <title> (chỉ dành cho trình đọc màn hình).
  const ban = svg.cloneNode(true);
  const goc = [svg, ...svg.querySelectorAll('*')], sao = [ban, ...ban.querySelectorAll('*')];
  ban.removeAttribute('class');
  goc.forEach((el, i) => {
    const cs = getComputedStyle(el);
    // Ghi bằng thuộc tính trình bày (fill="…"), không dùng style="…": CSP của trang (style-src 'self')
    // chặn mọi thuộc tính style viết tay.
    for (const k of KIEU) { const v = cs.getPropertyValue(k); if (v) sao[i].setAttribute(k, v); }
  });
  ban.querySelectorAll('.hit, .hitr, title').forEach((el) => el.remove());

  const DAU = 44, CHAN = 34 + Math.ceil(legend.length / 4) * 22;
  const out = document.createElementNS(NS, 'svg');
  out.setAttribute('xmlns', NS);
  out.setAttribute('width', W); out.setAttribute('height', H + DAU + CHAN);
  out.setAttribute('viewBox', `0 0 ${W} ${H + DAU + CHAN}`);
  const them = (tag, attrs, text) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    out.append(el);
    return el;
  };
  them('rect', { x: 0, y: 0, width: W, height: H + DAU + CHAN, fill: nen });
  them('text', { x: 16, y: 28, fill: chu, 'font-family': font, 'font-size': 17, 'font-weight': 700 }, title);
  if (unit) them('text', { x: W - 16, y: 28, fill: phu, 'font-family': font, 'font-size': 12, 'text-anchor': 'end' }, unit);
  ban.setAttribute('x', 0); ban.setAttribute('y', DAU); ban.setAttribute('width', W); ban.setAttribute('height', H);
  out.append(ban);
  legend.forEach((l, i) => {
    const x = 16 + (i % 4) * ((W - 32) / 4), y = H + DAU + 18 + Math.floor(i / 4) * 22;
    them('rect', { x, y: y - 10, width: 12, height: 12, rx: 3, fill: mauCss(l.color, fig) });
    them('text', { x: x + 18, y, fill: chu, 'font-family': font, 'font-size': 12.5 }, l.name);
  });
  them('text', { x: W - 16, y: H + DAU + CHAN - 8, fill: phu, 'font-family': font, 'font-size': 10.5, 'text-anchor': 'end' }, 'elevaTO · AI BCTC');

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(out)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('PNG')); img.src = url; });
    const k = 2, cv = document.createElement('canvas');
    cv.width = W * k; cv.height = (H + DAU + CHAN) * k;
    const g = cv.getContext('2d');
    g.scale(k, k);
    g.drawImage(img, 0, 0);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    download(blob, `${safeName(file)}.png`);
  } finally { URL.revokeObjectURL(url); }
}

/**
 * @param rows [{ name, values: [số], pct?: true }] — số tiền đã chia sẵn theo đơn vị đang xem
 * @param heads nhãn các kỳ
 */
export async function chartXlsx({ title, sub, itemLabel, heads, rows, file }) {
  const last = numToCol(heads.length + 1);
  const r = [
    row(1, [cellStr('A1', title, S.title)], 22),
    row(2, [cellStr('A2', sub, S.sub)]),
    row(4, [cellStr('A4', itemLabel, S.head), ...heads.map((p, i) => cellStr(`${numToCol(i + 2)}4`, p, S.head))], 20),
    ...rows.map((x, j) => row(5 + j, [cellStr(`A${5 + j}`, x.name, S.label),
      ...x.values.map((v, i) => cellNum(`${numToCol(i + 2)}${5 + j}`, Number.isFinite(v) ? v : null, S.num))])),
  ];
  const files = bookFiles([{ name: 'So lieu', xml: sheetXml({ cols: [40, ...heads.map(() => 14)], rowsXml: r, freeze: { x: 1, y: 4 }, merges: [`A1:${last}1`, `A2:${last}2`] }) }]);
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  for (const [p, xml] of Object.entries(files)) zip.file(p, xml);
  download(await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' }), `${safeName(file)}.xlsx`);
}
