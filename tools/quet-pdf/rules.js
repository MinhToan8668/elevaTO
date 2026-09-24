/* =====================================================================
   rules.js — Bộ rule nhận diện loại văn bản + trích Số / Ngày / Tên / Nội dung
   từ text (OCR hoặc lớp text) của giấy tờ pháp lý, hồ sơ tín dụng tiếng Việt.
   Thuần logic, không đụng DOM: dùng chung cho danh-muc-tai-lieu.html (online),
   bản offline và test bằng Node (test_rules.js).

   So khớp từ khóa luôn làm trên chữ KHÔNG DẤU, chữ thường (norm) nên OCR sai dấu
   ("CỎ PHẢN", "ĐIÊU LỆ", "TƠ TRÌNH") vẫn bắt được.
   Sửa/thêm ở 3 chỗ: KNOWN_COMPANIES, TITLE_MAP, RULES.
   ===================================================================== */

/* ---------------------------------------------------------------- 1. CẤU HÌNH DỄ SỬA -> sửa trong config.json (build.py nhúng vào HTML)
   KNOWN_COMPANIES: [từ khóa không dấu] -> tên đầy đủ / rút gọn. TITLE_MAP: đầu tiêu đề (không dấu) -> tên chuẩn.
   VN_WORDS / VN_PHRASES: từ điển sửa dấu cho tiêu đề IN HOA bị OCR sai. */
if (typeof CONFIG === 'undefined') { var CONFIG = require('./config.json'); }
const KNOWN_COMPANIES = CONFIG.KNOWN_COMPANIES;
const TITLE_MAP = CONFIG.TITLE_MAP;
const ABBREV = [
  [/h[ộo]i [đd][ồo]ng qu[ảaá]n tr[ịi]/giu, 'HĐQT'], [/h[ộo]i [đd][ồo]ng th[àa]nh vi[êe]n/giu, 'HĐTV'],
  [/[đd][ạa]i h[ộo]i [đd][ồo]ng c[ổo] [đd][ôo]ng/giu, 'ĐHĐCĐ'], [/(\d{4})\s*[-–—]\s*(\d{4})/g, '$1-$2'],
];
const VN_WORDS = CONFIG.VN_WORDS;
const VN_PHRASES = CONFIG.VN_PHRASES;

/* ---------------------------------------------------------------- 2. TIỆN ÍCH TEXT */
const stripAccents = s => s.replace(/Đ/g, 'D').replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = s => stripAccents(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const fuzzy = s => norm(s).replace(/([a-z])\1+/g, '$1');
const linesOf = t => (t || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const headNorm = (t, n = 25) => norm(linesOf(t).slice(0, n).join(' '));
const letters = s => [...s].filter(c => c.toLowerCase() !== c.toUpperCase());
const upperRatio = l => { const L = letters(l); return L.length ? L.filter(c => c === c.toUpperCase()).length / L.length : 0; };
const isUpperLine = (l, r = 0.8) => letters(l).length >= 3 && upperRatio(l) >= r;
const sentence = s => { s = (s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };
const vnTitle = s => (s || '').split(' ').filter(Boolean).map(w => (w === w.toUpperCase() && w !== w.toLowerCase()) ? w[0] + w.slice(1).toLowerCase() : w).join(' ');
const abbrev = s => ABBREV.reduce((x, [re, rep]) => x.replace(re, rep), s || '');
const cleanEdge = s => (s || '').replace(/^[\s|:!;.\-_'`"“”„,]+|[\s|:!;.\-_'`"“”„,]+$/g, '');
const filenameStem = name => (name || '').replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[.\-_)]\s*/, '');

// Sửa dấu cho chuỗi IN HOA bị OCR sai: bỏ dấu hết rồi tra từ điển (cụm từ trước, từ đơn sau)
function reaccent(s) {
  const n = norm(s).replace(/[^a-z0-9/&\-.,() ]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = n.split(' '), out = [];
  for (let i = 0; i < words.length;) {
    let hit = null;
    for (const [k, v] of VN_PHRASES) { const kl = k.split(' '); if (words.slice(i, i + kl.length).join(' ') === k) { hit = [v, kl.length]; break; } }
    if (hit) { out.push(hit[0]); i += hit[1]; } else { out.push(VN_WORDS[words[i]] || words[i]); i++; }
  }
  return out.join(' ');
}

/* ---------------------------------------------------------------- 3. TIÊU ĐỀ VĂN BẢN (đa dạng kiểu trình bày) */
// Dòng bắt đầu bằng các từ này là tiêu đề dù viết thường ("Báo cáo kiểm tra sử dụng vốn vay")
const DOC_KEYWORDS = ['bao cao', 'to trinh', 'cong van', 'thong bao', 'de xuat', 'de nghi', 'bien ban', 'hop dong', 'giay ', 'quyet dinh',
  'nghi quyet', 'phu luc', 'dieu le', 'danh sach', 'so dang ky', 'khe uoc', 'uy nhiem chi', 'hoa don', 'chung chi', 'chung nhan', 'van ban',
  'thu ', 'phieu', 'bang ke', 'ke hoach', 'phuong an', 'cam ket', 'thoa thuan', 'xac nhan', 'ban cam ket', 'don ', 'the ', 'bien ban', 'ho so', 'bang '];
const SKIP_TITLE = ['cong hoa xa hoi', 'doc lap', 'socialist', 'independence', 'hanh phuc', 'freedom'];
// dòng KHÔNG phải tiêu đề: tên công ty / cơ quan ở góc trên, số, ngày, kính gửi, căn cứ...
const NOT_TITLE = /^(cong ty|ctcp|ngan hang|so ke hoach|uy ban|chi nhanh|khoi |phong |ban |so:|so |no\.|ngay|tp\.|tp |ha noi|hanoi|kinh gui|can cu|dvkd|\d|v\/v|ve viec|hom nay|ma so|dia chi|khach hang)/;
const SO_LABEL = /(?:^|\s)S[ốóòõọôỗộ6oáàăâếe](?:\s*\/\s*No\.?)?(?:[il1]?\s*[:;.,]|[il1]?\s)\s*/iu;

// Trả về mảng dòng tiêu đề (đã bỏ ký tự rác, bỏ phần "Số: ..." dính trong dòng)
const isHeaderLine = l => { const n = norm(l); return SKIP_TITLE.some(s => n.includes(s)) || SO_LABEL.test(' ' + l) || /,\s*ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}\s*\.?$/iu.test(l) || /^(so|no\.)\s*[:.]/.test(n); };
const isLabelLine = l => /^[^:]{1,40}:\s*\S/.test(l) && !/^(quyet dinh|nghi quyet|thong bao|bao cao)/.test(norm(l));  // "Khách hàng: ABC"
const startsWithDocKw = l => DOC_KEYWORDS.some(k => fuzzy(l).startsWith(k));
// Tất cả khối tiêu đề ứng viên trong 20 dòng đầu: [{idx, parts}]
function titleBlocks(ls) {
  const blocks = []; let cur = null, mixedRun = 0, startedMixed = false;
  const close = () => { if (cur && cur.parts.length) blocks.push(cur); cur = null; };
  for (let i = 0; i < ls.length; i++) {
    const raw = cleanEdge(ls[i]); if (!raw) { close(); continue; }
    const n = norm(raw);
    if (SKIP_TITLE.some(k => n.includes(k)) || SO_LABEL.test(' ' + raw) && /^s/.test(n)) { close(); continue; }
    const isUp = isUpperLine(raw), isKw = startsWithDocKw(raw) && !NOT_TITLE.test(n) && !isLabelLine(raw);
    if (cur) {
      if (isUp && !isLabelLine(raw) && !/^(so|no\.)\s*[:.]/.test(n) && letters(raw).length >= 3) { cur.parts.push(raw); mixedRun = 0; continue; }
      if (!isUp && startedMixed && mixedRun < 2 && !/:/.test(raw) && !NOT_TITLE.test(n) && !/\d{1,2}\/\d{1,2}\/\d{4}/.test(raw) && raw.length > 3) { cur.parts.push(raw); mixedRun++; continue; }
      close();
    }
    if ((isUp && !NOT_TITLE.test(n) && !isLabelLine(raw) && letters(raw).length >= 4) || isKw) { cur = { idx: i, parts: [raw] }; startedMixed = !isUp; mixedRun = 0; }
  }
  close();
  // bỏ đoạn "Số: xxx" nếu nằm chung dòng tiêu đề
  blocks.forEach(b => b.parts = b.parts.map(p => p.replace(/\s+S[ốo]\s*[:.].*$/iu, '').trim()).filter(Boolean));
  return blocks.filter(b => b.parts.length);
}
// Chọn khối tiêu đề: (1) khối bắt đầu bằng từ khóa loại văn bản; (2) khối đầu tiên SAU phần đầu (quốc hiệu / Số: / ngày);
// (3) khối đầu tiên. Nhờ vậy "ĐẠI QUANG MINH" (tên công ty góc trên bị bẻ dòng) không bị lấy làm tiêu đề.
function titleBlock(text, maxLines = 20) {
  const ls = linesOf(text).slice(0, maxLines);
  const blocks = titleBlocks(ls); if (!blocks.length) return [];
  let hdrEnd = -1; ls.slice(0, 12).forEach((l, i) => { if (isHeaderLine(l)) hdrEnd = i; });
  const kw = blocks.find(b => startsWithDocKw(b.parts[0]));
  if (kw) return kw.parts;
  const after = blocks.find(b => b.idx > hdrEnd);
  return (after || blocks[0]).parts;
}
const titleNorm = text => fuzzy(titleBlock(text).join(' '));
// Tên hiển thị của tiêu đề: khớp TITLE_MAP -> tên chuẩn; IN HOA -> sửa dấu bằng từ điển; viết thường -> giữ nguyên
function titleText(text, maxParts = 3) {
  const parts = titleBlock(text).slice(0, maxParts); if (!parts.length) return '';
  const raw = parts.join(' '), n = norm(raw);
  for (const [k, v] of TITLE_MAP) if (n.startsWith(k)) { const rest = raw.slice(k.length); return upperRatio(rest) > 0.8 ? v + reaccent(rest).replace(/^\s*$/, '') : v + rest; }
  return sentence(upperRatio(raw) > 0.8 ? reaccent(raw) : raw);
}

/* ---------------------------------------------------------------- 4. TÊN CÔNG TY */
const LOAI_RE = '(co phan|tnhh(?: mot thanh vien| mtv| hai thanh vien tro len)?|hop danh)';
const NAME_STOP = '(?=$|[,;:("“”)]| thong qua| nhu sau| duoc | co | va | la | ngay | theo | tai | ve | ban hanh| kinh gui| cong hoa| doc lap| ma so| dia chi| tru so| von dieu| dang ky| giay chung| so:| sau day| to chuc| hop| quyet dinh| nghi quyet| bien ban| dieu le| tran trong| kinh de nghi|\\.)';
const NAME_RE = new RegExp('cong ty ' + LOAI_RE + ' ([a-z0-9&.\\- ]{3,80}?)' + NAME_STOP, 'g');
const loaiLabel = g => g === 'co phan' ? 'Cổ phần' : g === 'hop danh' ? 'Hợp danh'
  : 'TNHH' + ({ ' mot thanh vien': ' Một thành viên', ' mtv': ' MTV', ' hai thanh vien tro len': ' Hai thành viên trở lên' }[g.slice(4)] || '');
function knownCompany(scopeText, short = false) {
  const n = norm(scopeText);
  for (const c of KNOWN_COMPANIES) if (c.keys.some(k => n.includes(k))) return short ? c.short : c.full;
  return '';
}
// Tìm mọi "CÔNG TY CỔ PHẦN/TNHH + TÊN" trong phần đầu văn bản (không dấu), lấy lại đoạn có dấu tương ứng,
// chọn tên xuất hiện nhiều nhất (ưu tiên bản viết thường trong thân văn bản vì OCR chữ hoa hay sai dấu).
// Khớp KNOWN_COMPANIES -> dùng tên chuẩn.
function companyName(text, opts = {}) {
  const limit = opts.limit || 6000, short = !!opts.short;
  const ls = linesOf(text.slice(0, limit));
  const cands = ls.concat(ls.slice(0, -1).map((l, i) => l + ' ' + ls[i + 1]));
  const found = [];
  for (const l of cands) {
    const wvn = l.split(' '), n = norm(l), wnd = n.split(' ');
    for (const m of n.matchAll(NAME_RE)) {
      const key = m[2].trim(); if (key.length < 3) continue;
      const kc = knownCompany('cong ty ' + m[1] + ' ' + key, short); if (kc) return kc;
      let seg = key, upper = false;
      if (wvn.length === wnd.length) {
        const startW = n.slice(0, m.index + ('cong ty ' + m[1] + ' ').length).split(' ').length - 1;
        const segVn = cleanEdge(wvn.slice(startW, startW + key.split(' ').length).join(' '));
        upper = upperRatio(segVn) >= 0.5; seg = upper ? vnTitle(segVn) : segVn;
      }
      found.push({ key: m[1] + '|' + key, seg, upper });
    }
  }
  if (!found.length) return knownCompany(text.slice(0, limit), short) || '';
  const cnt = {}; found.forEach(f => cnt[f.key] = (cnt[f.key] || 0) + 1);
  const best = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b.length - a.length)[0];
  const vs = found.filter(f => f.key === best).sort((a, b) => (a.upper - b.upper) || (b.seg.length - a.seg.length));
  const ten = vs[0].seg.replace(/\s+(Mã Số|Địa Chỉ|Số \d|Trụ Sở|Vốn Điều|Đăng Ký|Giấy Chứng|Cộng Hòa|Độc Lập).*$/iu, '');
  const loai = loaiLabel(best.split('|')[0]);
  return short ? `${loai === 'Cổ phần' ? 'CTCP' : 'Công ty ' + loai} ${ten}`.trim() : `Công ty ${loai} ${ten}`.trim();
}
// công ty đối tác (khác công ty chính) – dùng cho hợp đồng
function otherCompany(text, main) {
  const mainN = norm(main || '');
  for (const l of linesOf(text).slice(0, 40)) {
    const n = norm(l);
    const m = n.match(new RegExp('cong ty ' + LOAI_RE + ' ([a-z0-9&.\\- ]{3,60}?)' + NAME_STOP));
    if (!m) continue;
    const full = 'cong ty ' + m[1] + ' ' + m[2].trim();
    if (mainN && (mainN.includes(m[2].trim()) || full.includes(mainN.replace(/^cong ty /, '')))) continue;
    const kc = knownCompany(full, true); if (kc) return kc;
    const idx = n.indexOf('cong ty'); const seg = l.split(' ').slice(n.slice(0, idx).split(' ').length - (idx ? 1 : 0)).join(' ');
    let t = vnTitle(cleanEdge(seg.split(/[,;(]|Địa chỉ|địa chỉ/)[0]));
    for (const [a, b] of [['Công Ty', 'Công ty'], ['Tnhh', 'TNHH'], ['Cổ Phần', 'Cổ phần'], ['Cỏ Phần', 'Cổ phần'], ['Cổ Phàn', 'Cổ phần'], ['Cỏ Phàn', 'Cổ phần'], ['Cô Phần', 'Cổ phần'], ['Cổ Phản', 'Cổ phần'], [' Mtv', ' MTV']]) t = t.split(a).join(b);
    return t;
  }
  return '';
}

/* ---------------------------------------------------------------- 5. NGÀY */
const mk = (d, m, y) => { d = +d; m = +m; y = +y; return (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1990 && y <= 2099) ? { d, m, y } : null; };
const fmtDate = x => x ? `${String(x.d).padStart(2, '0')}/${String(x.m).padStart(2, '0')}/${x.y}` : '';
function findDates(text) {
  const f = [];
  for (const m of (text || '').matchAll(/ng[àa]y\s*(\d{1,2})\s*[,.]?\s*th[áa]ng\s*(\d{1,2})\s*[,.]?\s*n[ăa]m\s*(\d{4})/giu)) f.push([m.index, m[1], m[2], m[3]]);
  for (const m of (text || '').matchAll(/(?<!\d)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})(?!\d)/g)) f.push([m.index, m[1], m[2], m[3]]);
  return f.sort((a, b) => a[0] - b[0]).map(x => mk(x[1], x[2], x[3])).filter(Boolean);
}
const firstDate = text => findDates(text)[0] || null;
// Tên file "39._250117_PLS..." -> 17/01/2025 ; "20250117" ; "17.01.2025"
function dateFromFilename(name) {
  name = name || '';
  for (const m of name.matchAll(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/g)) { const d = mk(m[3], m[2], m[1]); if (d) return d; }
  for (const m of name.matchAll(/(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/g)) { const d = mk(m[3], m[2], '20' + m[1]); if (d && +m[1] <= 40) return d; }
  for (const m of name.matchAll(/(?<!\d)(\d{1,2})[ ._\-](\d{1,2})[ ._\-](20\d{2})(?!\d)/g)) { const d = mk(m[1], m[2], m[3]); if (d) return d; }
  return null;
}
// ngày trong dòng này là ngày của văn bản KHÁC được dẫn chiếu (số .../... ngày ...) hoặc ngày hết hạn, ngày sinh...
const SKIP_DATE = ['het han', 'hieu luc', 'ngay cap', 'ngay sinh', 'cap ngay', 'ban hanh', 'kem theo', 'can cu', 'theo hop dong', 'theo nghi quyet', 'theo quyet dinh', 'ket thuc', 'sinh ngay', 'ngay het'];
const REF_BEFORE = /s[ốo]\s*[:.]?\s*\S*[\/\-]\S*\s*(,\s*)?ng[àa]y\s*$/iu;  // "... số 45/2025/HĐTD ngày "
function lineDate(l) {
  const n = norm(l);
  if (SKIP_DATE.some(k => n.includes(k))) return null;
  for (const m of l.matchAll(/ng[àa]y\s*\d{1,2}\s*[,.]?\s*th[áa]ng|(?<!\d)\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{4}/giu)) {
    if (REF_BEFORE.test(l.slice(Math.max(0, m.index - 40), m.index))) continue;
    const ds = findDates(l.slice(m.index)); if (ds.length) return ds[0];
  }
  return null;
}
// Ngày ở phần đầu văn bản: "TP. HCM, ngày 17 tháng 01 năm 2025" / "Ngày lập: 25/03/2025"
function headerDate(text, n = 10) {
  for (const l of linesOf(text).slice(0, n)) { const d = lineDate(l); if (d) return d; }
  return null;
}
// "Địa danh, ngày dd tháng mm năm yyyy" ở bất kỳ đâu trang 1 (thông báo, hợp đồng ký cuối trang...)
function placeDate(text) {
  for (const l of linesOf(text)) {
    if (/,\s*ng[àa]y\s*\d{1,2}\s*th[áa]ng/iu.test(l) || /^h[ôo]m nay,?\s*ng[àa]y/iu.test(l)) { const d = lineDate(l); if (d) return d; }
  }
  return null;
}
function dateAfter(text, labelRe, nLines = 40) {
  for (const l of linesOf(text).slice(0, nLines)) { const m = l.match(labelRe); if (m) { const ds = findDates(l.slice(m.index + m[0].length)); if (ds.length) return ds[0]; } }
  return null;
}
// Thứ tự ưu tiên chung: ngày sau nhãn riêng -> ngày ở phần đầu -> "Địa danh, ngày..." -> tên file -> ngày đầu tiên trong nội dung.
// Trả về {ngay, nguon}
function bestDate(text, name, labelRe) {
  let d;
  if (labelRe && (d = dateAfter(text, labelRe))) return { ngay: d, nguon: 'văn bản' };
  if ((d = headerDate(text))) return { ngay: d, nguon: 'văn bản' };
  if ((d = placeDate(text))) return { ngay: d, nguon: 'văn bản' };
  if ((d = dateFromFilename(name))) return { ngay: d, nguon: 'tên file' };
  if ((d = firstDate(text))) return { ngay: d, nguon: 'trong nội dung – kiểm tra!' };
  return { ngay: null, nguon: '' };
}

/* ---------------------------------------------------------------- 6. SỐ VĂN BẢN */
const NUM_FALLBACK = /(\S{1,8}?)\s*\.?\s*\/\s*(20\d{2})\s*[\/.\]]+\s*([A-ZĐ][A-ZĐa-z]{0,8}(?:\s*[-–]\s*[A-ZĐ]{1,10})?(?:\s*\/\s*[A-ZĐ\-]{1,12})*)/u;
const VIB_NUM = /(?<!\d)(\d{6,8}\.\d{2})(?!\d)/;
const VIB_NUM2 = /(?<![\d\/])(\d{1,3}\/\d{2,4})[\s_.]{0,3}(20\d{6})[\s_.]{0,3}([A-Z]{1,3})\b/;
const vibNum2 = l => { const m = l.match(VIB_NUM2); return m ? `${m[1]}_${m[2]}_${m[3]}` : ''; };
function numberHintFromFilename(name) {
  const n = norm(filenameStem(name).replace(/_/g, ' '));
  const m = n.match(/(?:(?:^|\s)s[ốo](?=\s|\d)|(?:^|\s)hd(?=\s|\d)|(?:^|\s)guq|(?:^|\s)nq|(?:^|\s)qd|(?:^|\s)bb(?=\s|\d)|(?:^|\s)gnn|(?:^|\s)hdxd|(?:^|\s)kunn|(?:^|\s)cv(?=\s|\d))[\s\-.]*(\d{1,4})(?!\d)/u);
  return m ? m[1] : '';
}
function fixLeading(s, hint) {
  s = s.replace(/Ð/g, 'Đ').replace(/ĐĐ/g, 'Đ').replace(/ĐỌM/g, 'ĐQM').replace(/ĐOM/g, 'ĐQM').replace(/(\d)\.{2,}(20\d{2})/g, '$1/$2').replace(/(20\d{2})[.\]]+(?=[A-ZĐ])/g, '$1/');
  const i = s.indexOf('/');
  let head = i < 0 ? s : s.slice(0, i), rest = i < 0 ? '' : s.slice(i);
  if (hint && (!/^\d+$/.test(head) || head.replace(/^0+/, '') !== hint.replace(/^0+/, ''))) head = hint;
  else head = head.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/[^0-9A-Za-zĐ]/g, '');
  return head + rest;
}
// Số văn bản: quét 15 dòng đầu (rồi cả trang) tìm "Số:", "Số/No.:", bắt cả số viết tay OCR lệch ("Số: .04../2025/PLSĐĐL")
function docNumber(text, name = '') {
  const hint = name ? numberHintFromFilename(name) : '';
  const ls = linesOf(text);
  for (const scope of [ls.slice(0, 15), ls.slice(15, 60)]) {
    for (const l of scope) {
      const m = l.match(SO_LABEL);
      if (m) {
        const rest = l.slice(m.index + m[0].length);
        const mv = rest.slice(0, 20).match(VIB_NUM); if (mv) return mv[1];
        const mv2 = vibNum2(rest); if (mv2) return mv2;
        const acc = [];
        for (const t of rest.split(/\s+/)) {
          if (!/^[\wÀ-ỹ.\-\/]+$/u.test(t)) break;
          const ok = t.includes('/') || t.includes('-') || t === '-' || t === '/' || (acc.length && /[\/-]$/.test(acc[acc.length - 1])) || (!acc.length && /^[\d.]/.test(t));
          if (!ok) break;
          acc.push(t);
        }
        if (acc.length) {
          const s = acc.join('').replace(/\.+(?=[\/-])/g, '').replace(/(?<=[\/-])\.+/g, '').replace(/^[.\-\/]+|[.\-\/]+$/g, '');
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) continue;               // bắt nhầm ngày
          if (/\d/.test(s) && /[\/-]/.test(s)) return fixLeading(s, hint);
        }
      }
      const m2 = l.match(NUM_FALLBACK);
      if (m2) return fixLeading(`${m2[1]}/${m2[2]}/${m2[3]}`.replace(/\s+/g, ''), hint);
    }
  }
  for (const l of ls.slice(0, 15)) { const v = vibNum2(l); if (v) return v; }
  return '';
}

/* ---------------------------------------------------------------- 7. NỘI DUNG (V/v, Kính gửi, Kỳ báo cáo...) */
const VV = [/^V\/v\b/iu, /^V[ềe] vi[ệe]c\b/iu, /^V[ềe]\s*:/iu, /^V[^\s:]{0,3}:/u, /^Trích y[ếe]u\s*:/iu, /^Subject\s*:/iu];
function lineAfter(text, patterns = VV, maxlen = 200) {
  const ls = linesOf(text);
  for (let i = 0; i < Math.min(ls.length, 40); i++) for (const p of patterns) {
    const m = ls[i].match(p);
    if (m) { let rest = ls[i].slice(m[0].length).replace(/^[\s:.\-–]+|[\s:.\-–]+$/g, ''); if (!rest && i + 1 < ls.length) rest = ls[i + 1]; return rest.split(/\s*\/\s*(?=[A-Z][a-z])/)[0].slice(0, maxlen); }
  }
  return '';
}
// nội dung V/v có thể nằm chung dòng với cột khác ("V/v đề nghị giải ngân đợt 3 Độc lập - Tự do")
const vvLine = text => lineAfter(text).replace(/\s+(Độc lập|Doc lap|CỘNG HÒA).*$/iu, '').trim();
const kinhGui = text => (lineAfter(text, [/^K[íi]nh g[ửu]i\s*:?/iu]) || '').replace(/\s+(Độc lập|CỘNG HÒA).*$/iu, '');
function kyBaoCao(text) {
  const m = norm(text.slice(0, 3000)).match(/(?:ky|thoi ky|ky ket thuc|ky kiem tra|ky bao cao|thang|quy|nam)\s*(?:bao cao|kiem tra)?\s*[:.]?\s*((?:quy|thang|nam|q)?\s*[ivx\d]{1,4}\s*[\/\-]?\s*(?:20\d{2})?)/);
  if (!m || !/\d{4}|quy|thang/.test(m[1])) return '';
  return sentence(m[1].replace(/\s+/g, ' ').trim().replace(/^quy/, 'Quý').replace(/^thang/, 'Tháng').replace(/^nam/, 'Năm').replace(/^q\s*/, 'Quý ')).replace(/\b[ivx]{1,4}\b/g, r => r.toUpperCase());
}
const vonDieuLe = text => {
  const m = text.match(/v[ốoôỗ]n [đd]i[ềeêể]u l[ệeê][^\d]{0,60}((?:\d{1,3}\.)+\d{3}|\d[\d.,]*)\s*(t[ỷy]|tri[ệe]u|[đd][ồo]ng|VN[ĐD])?/iu);
  if (!m || m[1].replace(/\D/g, '').length < 4) return '';
  const n = norm(m[2] || 'dong');
  return `Vốn điều lệ ${m[1].replace(/^[.,]+|[.,]+$/g, '')} ${n === 'ty' ? 'tỷ' : n === 'trieu' ? 'triệu' : 'đồng'} đồng`.replace('đồng đồng', 'đồng');
};
function suaDoiDieu(text) {
  const m = norm(text.slice(0, 4000)).match(/sua doi(,? bo sung)? (khoan [\d.]+ )?(dieu \d+)/);
  if (!m) return '';
  return ('Sửa đổi' + (m[1] ? ', bổ sung' : '') + ' ' + (m[2] || '') + m[3]).replace('dieu', 'Điều').replace('khoan', 'khoản');
}
function chucVuList(text) {
  const out = [];
  for (const l of linesOf(text)) {
    const m = l.match(/ch[ứu]c v[ụu]\s*[:.]?\s*(.+)/iu); if (!m) continue;
    let cv = m[1].split(/\s+và\s+|\s*[-–—]+\s+|\s*\/\s+|[,(.;]/u)[0].trim(); if (!cv) continue;
    out.push(sentence(abbrev(cv).toLowerCase()).replace(/hđqt/g, 'HĐQT').replace(/hđtv/g, 'HĐTV'));
  }
  return out;
}

/* ---------------------------------------------------------------- 8. RULE TỪNG LOẠI — (text, name, ctx) -> {so, ngay, nguon_ngay?, ten, noi_dung} */
const withDate = (o, text, name, labelRe) => { const b = bestDate(text, name, labelRe); return { ...o, ngay: o.ngay || b.ngay, nguon_ngay: o.ngay ? (o.nguon_ngay || 'văn bản') : b.nguon }; };
const R = {
  gcn(text, name) {
    const m = text.match(/thay [đd][ổo]i l[ầa]n th[ứu]\s*:?\s*(\d+)\s*[,:]?\s*(ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})?/iu);
    const lan = m ? m[1] : '';
    let ngay = m && m[2] ? findDates(m[2])[0] : null;
    if (!ngay && !lan) ngay = dateAfter(text, /[đd][ăa]ng k[ýy] l[ầa]n [đd][ầa]u\s*:?/iu);
    const hn = headNorm(text), loai = hn.includes('cong ty co phan') ? 'Công ty Cổ phần' : hn.includes('cong ty tnhh') ? 'Công ty TNHH' : '';
    const cty = companyName(text, { limit: 3000 });
    return withDate({ so: '', ngay, ten: `Giấy chứng nhận đăng ký doanh nghiệp ${loai}`.trim(), noi_dung: [lan ? `Đăng ký thay đổi lần thứ ${lan}` : 'Đăng ký lần đầu', cty].filter(Boolean).join(' – ') }, text, name);
  },
  async cccd(text, name, ctx) {
    let nm = '';
    for (const l of linesOf(text)) { const m = l.match(/(?:h[ọo] v[àa] t[êe]n|full name)\s*[:\/]*\s*(.*)$/iu); if (m && m[1].trim()) { nm = vnTitle(m[1].replace(/^\/?\s*Full name\s*:?\s*/iu, '').trim()); break; } }
    if (!nm) nm = vnTitle(filenameStem(name).replace(/_/g, ' ').replace(/c[ăa]n c[ưu][ớo]c( c[ôo]ng d[âa]n)?|cccd|cmnd/giu, ' ').replace(/\s+/g, ' ').replace(/^[\s\-.]+|[\s\-.]+$/g, ''));
    let m = text.match(/(?<!\d)(\d{12})(?!\d)/), so = m ? m[1] : '';
    if (!so && ctx && ctx.ocrIdNumber) so = await ctx.ocrIdNumber();
    return { so: '', ngay: null, nguon_ngay: '', ten: `CCCD ${nm}`.trim(), noi_dung: so ? `Số ${so}` : '' };
  },
  nq: coQuan => (text, name) => withDate({ so: docNumber(text, name), ten: ['Nghị quyết', coQuan, companyName(text)].filter(Boolean).join(' '), noi_dung: abbrev(vvLine(text)) }, text, name),
  guq(text, name) {
    const cv = chucVuList(text);
    return withDate({ so: docNumber(text, name), ten: 'Giấy ủy quyền', noi_dung: cv.length >= 2 ? `${cv[0]} ủy quyền cho ${cv[1]}` : vvLine(text) }, text, name);
  },
  qd(text, name) {
    let nd = abbrev(vvLine(text)), ten = 'Quyết định';
    const hn = headNorm(text);
    if (hn.includes('bo nhiem')) { ten = 'Quyết định bổ nhiệm'; if (!nd) { const m = text.match(/[Bb]ổ nhiệm\s+(?:ông|bà|Ông|Bà)?\s*([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s[A-ZÀ-Ỹ][a-zà-ỹ]+){1,4})/u); if (m) nd = `Bổ nhiệm ${m[1]}`; } }
    else if (hn.includes('mien nhiem')) ten = 'Quyết định miễn nhiệm';
    const cq = hn.includes('hoi dong quan tri') ? 'HĐQT' : hn.includes('hoi dong thanh vien') ? 'HĐTV' : hn.includes('chu so huu') ? 'Chủ sở hữu' : '';
    const cty = companyName(text);
    return withDate({ so: docNumber(text, name), ten: [ten, cq ? 'của ' + cq : '', cty].filter(Boolean).join(' '), noi_dung: nd }, text, name);
  },
  chungChi: (text, name) => withDate({ so: docNumber(text, name), ten: 'Chứng chỉ năng lực hoạt động xây dựng', noi_dung: companyName(text, { short: true }) }, text, name),
  plDieuLe(text, name) {
    const parts = [suaDoiDieu(text)];
    const v = vonDieuLe(text);
    if (v) parts.push(v); else if (/nguoi dai dien theo phap luat/.test(norm(text.slice(0, 3000)))) parts.push('Thay đổi người đại diện theo pháp luật');
    return withDate({ so: docNumber(text, name), ten: `Phụ lục sửa đổi Điều lệ ${companyName(text)}`.trim(), noi_dung: parts.filter(Boolean).join(' – ') || abbrev(vvLine(text)) }, text, name);
  },
  dieuLe(text, name) {
    const m = norm(text.slice(0, 6000)).match(/sua doi,? bo sung lan thu (\d+)/);
    let nd = m ? `Sửa đổi, bổ sung lần thứ ${m[1]}` : '';
    const hl = text.match(/c[óo] hi[ệeê]u l[ựu]c (?:k[ểe] )?t[ừu] ng[àa]y\s*([\d\/\-.]+)/iu);
    const ngay = hl ? (findDates(hl[0])[0] || null) : null;
    if (ngay && !nd) nd = `Có hiệu lực từ ngày ${fmtDate(ngay)}`;
    const o = { so: '', ngay, ten: `Điều lệ ${companyName(text)}`.trim(), noi_dung: nd };
    return ngay ? { ...o, nguon_ngay: 'văn bản' } : withDate(o, text, name);
  },
  dsCoDong(text, name) {
    const m = norm(text).match(/chot (?:den )?ngay\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/);
    const ngay = (m && findDates(m[1])[0]) || null, cty = companyName(text);
    let ten = 'Danh sách cổ đông'; if (cty) ten += ` ${cty}`; if (ngay) ten += ` chốt đến ngày ${fmtDate(ngay)}`;
    return withDate({ so: '', ngay, ten, noi_dung: vonDieuLe(text) }, text, name);
  },
  soCoDong: (text, name) => withDate({ so: '', ten: `Sổ đăng ký cổ đông ${companyName(text)}`.trim(), noi_dung: '' }, text, name),
  bctc(text, name) {
    const hn = headNorm(text, 12), loai = hn.includes('hop nhat') ? 'hợp nhất' : hn.includes('rieng') ? 'riêng' : '';
    const m = text.match(/k[ếe]t th[úu]c\s*(?:ng[àa]y\s*)?(\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}|ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/iu);
    const ngay = m ? findDates(m[1].startsWith('ng') ? m[1] : 'ngày ' + m[1])[0] : null;
    const fn = norm(name);
    let ten = ['Báo cáo tài chính', loai, ngay ? 'năm ' + ngay.y : ''].filter(Boolean).join(' ');
    if (fn.includes('kiem toan') || hn.includes('kiem toan')) ten += ' (đã kiểm toán)'; else if (fn.includes('soat xet') || hn.includes('soat xet')) ten += ' (soát xét)';
    const o = { so: '', ngay, ten, noi_dung: companyName(text, { short: true }) };
    return ngay ? { ...o, nguon_ngay: 'văn bản' } : withDate(o, text, name);
  },
  hopDong(text, name) {
    const main = companyName(text), other = otherCompany(text, main);
    return withDate({ so: docNumber(text, name), ten: titleText(text) || 'Hợp đồng', noi_dung: [companyName(text, { short: true }), other].filter(Boolean).join(' – ') || abbrev(vvLine(text)) }, text, name, /h[ôo]m nay,?\s*(?=ng[àa]y)/iu);
  },
  ubtd(text, name) {
    let nd = ''; const cty = companyName(text, { short: true });
    for (const l of linesOf(text)) {
      if (/\bcho KH\b/.test(l)) { nd = l.split(/\s*[(&]|\s+thu[ộo]c\b/u)[0].trim().replace(/^n[ộo]i\s*d\S{0,4}\s*[:.„,]*\s*/iu, ''); if (cty) nd = nd.replace(/cho KH\b.*$/, `cho KH ${cty}`); break; }
    }
    return withDate({ so: docNumber(text, name), ten: 'Biên bản họp kèm phê duyệt của Ủy ban tín dụng', noi_dung: abbrev(nd) || cty }, text, name, /th[ờo]i gian\s*[:.]?\s*ng[àa]y/iu);
  },
  bcttd(text, name) {
    let so = '', ngay = null;
    const m = text.match(VIB_NUM2);
    if (m) { so = `${m[1]}_${m[2]}_${m[3]}`; ngay = findDates(text.slice(m.index + m[0].length, m.index + m[0].length + 60))[0] || null; }
    return withDate({ so: so || docNumber(text, name), ngay, ten: 'Báo cáo tái thẩm định', noi_dung: companyName(text, { short: true }) }, text, name, /^ng[àa]y\s*(?:l[ậa]p)?\s*[:.]/iu);
  },
  deXuat: (text, name) => withDate({ so: docNumber(text, name), ten: titleText(text) || 'Đề xuất tín dụng', noi_dung: companyName(text, { short: true }) }, text, name, /ng[àa]y l[ậa]p\s*[:.]?/iu),
  deNghiCtd: (text, name) => withDate({ so: docNumber(text, name), ten: 'Đề nghị cấp tín dụng kiêm phương án sử dụng vốn', noi_dung: companyName(text, { short: true }) }, text, name),
  bienBan(text, name) {
    const hn = headNorm(text);
    const kind = hn.includes('dai hoi dong co dong') ? 'Đại hội đồng cổ đông' : hn.includes('hoi dong quan tri') ? 'Hội đồng quản trị' : hn.includes('hoi dong thanh vien') ? 'Hội đồng thành viên' : '';
    const ten = kind ? ['Biên bản họp', kind, companyName(text)].filter(Boolean).join(' ') : (titleText(text) || 'Biên bản');
    return withDate({ so: docNumber(text, name), ten, noi_dung: abbrev(vvLine(text)) || companyName(text, { short: true }) }, text, name, /h[ôo]m nay,?.*?(?=ng[àa]y)/iu);
  },
  kheUoc: (text, name) => withDate({ so: docNumber(text, name), ten: 'Khế ước nhận nợ', noi_dung: [companyName(text, { short: true }), (text.match(/s[ốo] ti[ềe]n[^:\d]{0,30}[:.]?\s*([\d.,]{6,})\s*(đ[ồo]ng|VN[ĐD])?/iu) || [])[1]].filter(Boolean).join(' – ').replace(/(\d)$/, '$1 đồng') }, text, name, /ng[àa]y nh[ậa]n n[ợo]\s*[:.]?/iu),
  toTrinh: (text, name) => withDate({ so: docNumber(text, name), ten: 'Tờ trình', noi_dung: abbrev(vvLine(text)) || kinhGui(text) }, text, name),
  congVan: (text, name) => withDate({ so: docNumber(text, name), ten: 'Công văn', noi_dung: abbrev(vvLine(text)) || kinhGui(text) }, text, name),
  thongBao: (text, name) => withDate({ so: docNumber(text, name), ten: 'Thông báo', noi_dung: abbrev(vvLine(text)) }, text, name),
  baoCao(text, name) {
    const ten = titleText(text) || 'Báo cáo';
    const nd = [companyName(text, { short: true }), kyBaoCao(text)].filter(Boolean).join(' – ');
    return withDate({ so: docNumber(text, name), ten, noi_dung: nd || abbrev(vvLine(text)) }, text, name, /ng[àa]y (?:l[ậa]p|ki[ểe]m tra|b[áa]o c[áa]o)\s*[:.]?/iu);
  },
  generic(text, name) {
    const ten = titleText(text) || sentence(reaccent(filenameStem(name).replace(/_/g, ' ')));
    return withDate({ so: docNumber(text, name), ten, noi_dung: abbrev(vvLine(text)) || companyName(text, { short: true }) }, text, name);
  },
};

/* ---------------------------------------------------------------- 9. PHÂN LOẠI */
// keys: từ khóa KHÔNG DẤU. Bước 1 khớp trên KHỐI TIÊU ĐỀ (rule có từ khóa xuất hiện sớm nhất thắng, bằng nhau: rule đứng trước).
// Bước 2 khớp "chứa đủ keys" trong 25 dòng đầu. Bước 3 fname: từ khóa trong tên file. not: loại trừ.
const RULES = [
  { name: 'GCN ĐKDN',        keys: ['giay chung nhan dang ky doanh nghiep'], fn: R.gcn },
  { name: 'GCN ĐKDN',        keys: ['giay chung nhan', 'dang ky doanh nghiep'], fn: R.gcn },
  { name: 'GCN ĐKDN',        fname: ['dkdn', 'dkkd', 'gcn dkdn'], fn: R.gcn },
  { name: 'CCCD',            keys: ['can cuoc'], fn: R.cccd },
  { name: 'CCCD',            keys: ['citizen identity'], fn: R.cccd },
  { name: 'CCCD',            fname: ['cccd', 'cmnd', 'can cuoc'], fn: R.cccd },
  { name: 'BCTC',            keys: ['bao cao tai chinh'], fn: R.bctc },
  { name: 'BCTC',            fname: ['bctc'], fn: R.bctc },
  { name: 'BB UBTD',         keys: ['bien ban hop kem phe duyet'], fn: R.ubtd },
  { name: 'BB UBTD',         keys: ['bien ban hop', 'uy ban tin dung'], not: ['de xuat'], fn: R.ubtd },
  { name: 'BCTTĐ',           keys: ['bao cao tai tham dinh'], fn: R.bcttd },
  { name: 'BCTTĐ',           fname: ['bcttd'], fn: R.bcttd },
  { name: 'Đề nghị CTD',     keys: ['de nghi cap tin dung'], fn: R.deNghiCtd },
  { name: 'Đề xuất',         keys: ['de xuat'], not: ['hop dong'], fn: R.deXuat },
  { name: 'Đề xuất',         fname: ['dxtd', 'dx thay doi', 'dxctd'], fn: R.deXuat },
  { name: 'Khế ước',         keys: ['khe uoc'], fn: R.kheUoc },
  { name: 'Khế ước',         fname: ['kunn', 'khe uoc'], fn: R.kheUoc },
  { name: 'Phụ lục điều lệ', keys: ['phu luc', 'dieu le'], fn: R.plDieuLe },
  { name: 'NQ ĐHĐCĐ',        keys: ['nghi quyet', 'dai hoi dong co dong'], fn: R.nq('Đại hội đồng cổ đông') },
  { name: 'NQ HĐQT',         keys: ['nghi quyet', 'hoi dong quan tri'], fn: R.nq('Hội đồng quản trị') },
  { name: 'NQ HĐTV',         keys: ['nghi quyet', 'hoi dong thanh vien'], fn: R.nq('Hội đồng thành viên') },
  { name: 'Nghị quyết',      keys: ['nghi quyet'], fn: R.nq('') },
  { name: 'Hợp đồng',        keys: ['hop dong'], not: ['uy quyen', 'de xuat', 'khe uoc'], fn: R.hopDong },
  { name: 'Hợp đồng',        fname: ['hop dong', 'hd '], fn: R.hopDong },
  { name: 'Biên bản',        keys: ['bien ban'], fn: R.bienBan },
  { name: 'Giấy ủy quyền',   keys: ['uy quyen'], fn: R.guq },
  { name: 'Giấy ủy quyền',   fname: ['guq', 'uy quyen'], fn: R.guq },
  { name: 'Quyết định',      keys: ['quyet dinh'], fn: R.qd },
  { name: 'Chứng chỉ NLXD',  keys: ['chung chi nang luc'], fn: R.chungChi },
  { name: 'DS cổ đông',      keys: ['danh sach', 'co dong'], fn: R.dsCoDong },
  { name: 'Sổ cổ đông',      keys: ['so dang ky co dong'], fn: R.soCoDong },
  { name: 'Điều lệ',         keys: ['dieu le'], fn: R.dieuLe },
  { name: 'Tờ trình',        keys: ['to trinh'], fn: R.toTrinh },
  { name: 'Công văn',        keys: ['cong van'], fn: R.congVan },
  { name: 'Thông báo',       keys: ['thong bao'], fn: R.thongBao },
  { name: 'Báo cáo',         keys: ['bao cao'], fn: R.baoCao },
  { name: 'Khác',            keys: [], fn: R.generic },
];
const KY_HIEU = { cv: 'Công văn', tb: 'Thông báo', ttr: 'Tờ trình', ttrinh: 'Tờ trình', qd: 'Quyết định', nq: 'Nghị quyết', bb: 'Biên bản', bbh: 'Biên bản',
  hd: 'Hợp đồng', hdtd: 'Hợp đồng', hdxd: 'Hợp đồng', hdtc: 'Hợp đồng', guq: 'Giấy ủy quyền', uq: 'Giấy ủy quyền', kunn: 'Khế ước', kuNN: 'Khế ước', bc: 'Báo cáo', dx: 'Đề xuất' };
function classify(text, name) {
  const tl = titleNorm(text), fn = norm(name || '');
  let best = null;
  if (tl) RULES.forEach((r, idx) => {
    if (!r.keys || !r.keys.length || (r.not || []).some(k => tl.includes(k))) return;
    const pos = r.keys.map(k => tl.indexOf(k));
    if (pos.every(p => p >= 0)) { const sc = [Math.min(...pos), idx]; if (!best || sc[0] < best.sc[0] || (sc[0] === best.sc[0] && sc[1] < best.sc[1])) best = { sc, r }; }
  });
  if (best) return best.r;
  // theo ký hiệu trong số văn bản: 123/CV-ABC -> Công văn, 21/TB -> Thông báo, 15/TTr -> Tờ trình...
  const so = norm(docNumber(text, name)).replace(/[^a-z0-9\/\-]/g, '');
  const ky = (so.match(/[\/\-]([a-z]{2,5})(?:[\/\-]|$)/g) || []).map(x => x.replace(/[\/\-]/g, ''));
  for (const k of ky) if (KY_HIEU[k]) return RULES.find(r => r.name === KY_HIEU[k]);
  const h = fuzzy(headNorm(text));
  for (const r of RULES) {
    if ((r.not || []).some(k => h.includes(k))) continue;
    if (r.fname) { if (r.fname.some(k => fn.includes(k))) return r; continue; }
    if (r.keys.length && r.keys.every(k => h.includes(k))) return r;
  }
  return RULES[RULES.length - 1];
}
async function extractFields(text, name = '', ctx = null) {
  const rule = classify(text, name);
  const f = await rule.fn(text, name, ctx);
  f.loai = rule.name;
  f.noi_dung = sentence((f.noi_dung || '').trim());
  return f;
}

/* ---------------------------------------------------------------- 10. TÁCH VĂN BẢN TRONG PDF GỘP */
const START_KEYS = ['cong hoa xa hoi chu nghia viet nam', 'socialist republic of vietnam', 'giay chung nhan', 'nghi quyet', 'giay uy quyen', 'quyet dinh', 'can cuoc',
  'citizen identity', 'danh sach', 'phu luc', 'dieu le', 'chung chi', 'so dang ky', 'bien ban', 'hop dong', 'to trinh', 'cong van', 'thong bao', 'de xuat', 'bao cao', 'de nghi', 'khe uoc', 'uy nhiem chi', 'hoa don'];
function isDocStart(text) {
  const ls = linesOf(text).slice(0, 12); if (!ls.length) return false;
  const h = norm(ls.join(' '));
  if (/\btrang\s*([2-9]|\d{2,})\s*\/\s*\d+/.test(h) || /\bpage\s*([2-9]|\d{2,})\b/.test(h)) return false;
  for (const l of ls) { if (letters(l).length < 6 || upperRatio(l) < 0.8) continue; const n = norm(cleanEdge(l)); if (START_KEYS.some(k => n.startsWith(k))) return true; }
  return false;
}
function splitDocuments(pages, mode) {
  if (!pages.length) return [];
  let groups;
  if (mode === 'file') groups = [pages.map((_, i) => i)];
  else if (mode === 'page') groups = pages.map((_, i) => [i]);
  else { groups = [[0]]; for (let i = 1; i < pages.length; i++) (isDocStart(pages[i].text) ? groups.push([i]) : groups[groups.length - 1].push(i)); }
  return groups.map(g => ({ start: pages[g[0]].page, end: pages[g[g.length - 1]].page, text: g.map(i => pages[i].text).join('\n'), ocr: g.some(i => pages[i].ocr) }));
}
// lớp text của PDF có "ra tiếng Việt" không (PDF text layer hỏng / font lỗi -> OCR lại)
function looksVietnamese(text) {
  const n = norm(text); let hit = 0;
  for (const w of [' cong ', ' ty ', ' ngay ', ' so ', ' va ', ' cua ', ' hop ', ' dong ', ' theo ', ' nam ', ' thang ', ' ban ', ' viet nam', ' quyet ', ' bao ', ' de ']) if ((' ' + n + ' ').includes(w)) hit++;
  return hit >= 3;
}

if (typeof module !== 'undefined') module.exports = { extractFields, classify, splitDocuments, looksVietnamese, fmtDate, findDates, dateFromFilename, docNumber, companyName, titleBlock, titleText, norm, KNOWN_COMPANIES, TITLE_MAP, RULES };

