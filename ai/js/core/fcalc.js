// Tính sẵn giá trị cho các ô công thức mình tự ghi vào file .xlsx.
//
// Excel/LibreOffice/Google Sheets đều tính lại khi mở (calcPr fullCalcOnLoad), nhưng các trình xem
// nhanh (xem trước trên điện thoại, một số thư viện đọc) chỉ hiện giá trị đã lưu — không có thì
// người dùng thấy ô trắng và tưởng file lỗi. Nên ghi kèm giá trị.
//
// Chỉ nhận đúng phần cú pháp mình sinh ra: số, ô, dải trong SUM, ABS, + − × ÷, ngoặc,
// tên đã định nghĩa (DonVi) và lớp bọc IFERROR(…,""). Công thức nào ngoài tập đó (có IF, có chuỗi…)
// trả null — để Excel tự tính, không đoán bừa. Chia cho 0 cũng trả null: Excel ra #DIV/0! nên
// ghi sẵn số 0 vào đó là ghi sai.

// Chỉ nhận hàm nào mà mình thực sự sinh ra VÀ chắc chắn cùng nghĩa với Excel.
// MIN/MAX bỏ ra ngoài: Excel bỏ qua ô trống còn ở đây ô trống tính là 0 → số sẽ khác.
const HAM = new Set(['SUM', 'ABS']);
// Dòng tỷ lệ mình sinh ra luôn ở dạng IFERROR(<biểu thức>,"") — bóc lớp đó rồi tính phần trong.
const BOC_IFERROR = /^IFERROR\((.*),""\)$/;
const O = /^([A-Z]+)(\d+)$/;

/**
 * @param cells Map<'C10', { f?: string, v?: number }>  f = công thức (không có dấu '=')
 * @param opts.names { [tên]: số }  tên đã định nghĩa trong workbook, ví dụ DonVi
 * @returns Map<ref, number|null>  null = không tính được, cứ để Excel tính
 */
export function evalFormulas(cells, { names = {} } = {}) {
  const ra = new Map();
  const dang = new Set();                           // chống công thức vòng

  const giaTri = (ref) => {
    if (ra.has(ref)) return ra.get(ref);
    const c = cells.get(ref);
    if (!c) return 0;                               // ô trống trong Excel tính như 0
    if (c.f === undefined) return Number.isFinite(c.v) ? c.v : 0;
    if (dang.has(ref)) return null;
    dang.add(ref);
    let v;
    try { v = tinh(c.f, giaTri, names); } catch { v = null; }
    dang.delete(ref);
    ra.set(ref, v);
    return v;
  };

  for (const [ref, c] of cells) if (c.f !== undefined) giaTri(ref);
  return ra;
}

/** Tách công thức thành chuỗi token; gặp thứ không hiểu thì ném lỗi để trả null. */
function tach(f, giaTri, names) {
  const out = [];
  let i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[-+*/(),]/.test(ch)) { out.push(ch); i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+/.exec(f.slice(i));
      if (!m) throw new Error('so');
      out.push({ n: Number(m[0]) }); i += m[0].length; continue;
    }
    const w = /^[A-Za-z_][A-Za-z0-9_.]*(\$?\d+)?/.exec(f.slice(i));
    if (!w) throw new Error(`token: ${f.slice(i, i + 8)}`);
    i += w[0].length;
    const ten = w[0].replace(/\$/g, '');
    if (f[i] === '(') {
      if (!HAM.has(ten.toUpperCase())) throw new Error(`ham: ${ten}`);
      out.push({ h: ten.toUpperCase() }); continue;
    }
    if (O.test(ten)) {
      // Dải ô (chỉ trong SUM): C12:C20 → cộng dồn ngay khi tách.
      if (f[i] === ':') {
        const w2 = /^:(\$?[A-Z]+\$?\d+)/.exec(f.slice(i));
        if (!w2) throw new Error('dai');
        i += w2[0].length;
        out.push({ d: [ten, w2[1].replace(/\$/g, '')] });
        continue;
      }
      const v = giaTri(ten);
      if (v === null) throw new Error('vong');
      out.push({ n: v }); continue;
    }
    if (Object.prototype.hasOwnProperty.call(names, ten)) { out.push({ n: names[ten] }); continue; }
    throw new Error(`ten: ${ten}`);
  }
  return out;
}

const DAI_TOI_DA = 5000;                            // dải mình sinh ra dài nhất chỉ vài chục dòng

/** Cộng dồn một dải ô cùng cột (dạng duy nhất mình sinh ra). Excel nhận cả dải viết ngược. */
function dai([a, b], giaTri) {
  const ma = O.exec(a), mb = O.exec(b);
  if (!ma || !mb || ma[1] !== mb[1]) throw new Error('range-cols');
  const tu = Math.min(Number(ma[2]), Number(mb[2])), den = Math.max(Number(ma[2]), Number(mb[2]));
  // Dải dài bất thường nghĩa là công thức không phải của mình → bỏ, đừng quét cả triệu dòng.
  if (den - tu > DAI_TOI_DA) throw new Error('range-big');
  let t = 0;
  for (let r = tu; r <= den; r += 1) {
    const v = giaTri(`${ma[1]}${r}`);
    if (v === null) throw new Error('vong');
    t += v;
  }
  return t;
}

function tinh(f, giaTri, names) {
  const boc = BOC_IFERROR.exec(f);
  if (boc) { try { return tinh(boc[1], giaTri, names); } catch { return null; } }
  if (/["']/.test(f)) return null;                  // có chuỗi → ngoài tập cú pháp nhận
  const tk = tach(f, giaTri, names);
  let i = 0;
  const xem = () => tk[i];
  const an = () => tk[i++];

  const laDai = () => { const t = xem(); return typeof t === 'object' && t !== null && 'd' in t; };

  /** Tham số của hàm. Dải ô CHỈ hợp lệ khi là tham số trực tiếp của SUM. */
  const thamSo = (ham) => {
    if (an() !== '(') throw new Error('(');
    const args = [];
    if (xem() !== ')') {
      for (;;) {
        if (laDai()) {
          if (ham !== 'SUM') throw new Error('range-arg');
          args.push(dai(an().d, giaTri));
        } else args.push(bieuThuc());
        if (xem() !== ',') break;
        an();
      }
    }
    if (an() !== ')') throw new Error(')');
    return args;
  };

  const atom = () => {
    const t = an();
    if (t === '(') { const v = bieuThuc(); if (an() !== ')') throw new Error(')'); return v; }
    if (t === '-') return -atom();
    if (t === '+') return atom();
    if (typeof t === 'object' && t !== null && 'n' in t) return t.n;
    if (typeof t === 'object' && t !== null && 'h' in t) {
      const args = thamSo(t.h);
      // Sai số tham số là công thức không phải của mình (Excel sẽ báo lỗi) → đừng đoán giá trị.
      if (t.h === 'ABS') { if (args.length !== 1) throw new Error('abs-arity'); return Math.abs(args[0]); }
      if (!args.length) throw new Error('sum-arity');
      return args.reduce((a, b) => a + b, 0);
    }
    throw new Error('atom');                          // kể cả dải ô đứng ngoài SUM
  };
  const nhan = () => {
    let v = atom();
    while (xem() === '*' || xem() === '/') {
      const op = an(), r = atom();
      if (op === '/' && r === 0) throw new Error('div0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const bieuThuc = () => {
    let v = nhan();
    while (xem() === '+' || xem() === '-') { const op = an(); const r = nhan(); v = op === '+' ? v + r : v - r; }
    return v;
  };

  // Dấu phẩy chỉ hợp lệ bên trong danh sách tham số — bieuThuc() dừng ở đó.
  const v = bieuThuc();
  if (i !== tk.length) throw new Error('tokens-left');
  return Number.isFinite(v) ? v : null;
}
