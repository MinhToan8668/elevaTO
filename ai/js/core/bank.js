// BCTC ngân hàng (mẫu B02/B03/B04-TCTD theo TT49/2014/TT-NHNN): không có cột "Mã số", nên xếp từng dòng AI chép
// vào danh mục chartTCTD.js theo TÊN + vị trí trong cây (mục cha gần nhất, cấp STT La Mã / số / chữ).
// Cùng một tên "Dự phòng rủi ro" nằm dưới năm mục khác nhau — chỉ ngữ cảnh mới phân biệt được.

import { CHART_TCTD, TCTD_AM, TCTD_CHI_PHI } from '../chartTCTD.js';
import { parseVN, unitScale } from './numbers.js';
import { t } from '../i18n.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const norm = (s) => fold(s).toLowerCase().replace(/\(\*+\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Bỏ STT đầu dòng ("XII.", "1.", "a)", "01.") và các chữ viết tắt hay gặp. */
function core(label) {
  return norm(String(label || '').replace(STT, ''))
    .replace(/\bnhnn\b/g, 'ngan hang nha nuoc').replace(/\btctd\b/g, 'to chuc tin dung').replace(/\btndn\b/g, 'thu nhap doanh nghiep')
    .replace(/\btscd\b/g, 'tai san co dinh').replace(/\bbdsdt\b/g, 'bat dong san dau tu').replace(/\bxdcb\b/g, 'xay dung co ban')
    .replace(/\bhdkd\b/g, 'hoat dong kinh doanh').replace(/\blct\b/g, 'luu chuyen tien').replace(/\bln\b/g, 'loi nhuan')
    .replace(/\b(va|cua|ma)\b/g, (w) => (w === 'cua' || w === 'ma' ? w : ' ')).replace(/\s+/g, ' ').trim();
}
// STT đầu dòng: "XII.", "1.", "a)", "01" — AI hay bỏ mất dấu chấm ("I Thu nhập lãi thuần", "1 Thu nhập lãi…").
const STT = /^\s*(?:(?:[IVXLC]+|\d{1,2})(?:\s*[.)/]\s*|\s+)|[a-zđ]\s*[.)/]\s*)/i;
/** Cấp của STT in đầu dòng: La Mã → 1, số → 2, chữ → 3, không có → null. */
function capSTT(label) {
  const s = String(label || '').trim();
  if (/^[IVXLC]+(?:\s*[.)]|\s)/.test(s)) return 1;
  if (/^\d{1,2}(?:\s*[.)]|\s)/.test(s)) return 2;
  if (/^[a-zđ]\s*[.)]/i.test(s)) return 3;
  return null;
}

/** Độ giống theo từ (Jaccard) — đỡ lỗi chép lặp chữ ("tương tự tự nhận được") hay thiếu một từ. */
function giong(a, b) {
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  let chung = 0;
  for (const w of A) if (B.has(w)) chung++;
  return chung / (A.size + B.size - chung);
}

const PARENT = new Map();
for (const it of CHART_TCTD) for (const [c] of it.sum || []) PARENT.set(`${it.st}:${c}`, it.code);
const AKA = CHART_TCTD.map((it) => ({ it, names: new Set([core(it.label), ...it.aka]) }));

/** Báo cáo này có phải mẫu TCTD không (nhìn tên dòng). */
export function isBankStatement(items = []) {
  const ten = items.map((i) => core(i.n)).join('|');
  return /tong tai san co\b|tien gui cua khach hang|cho vay khach hang|thu nhap lai thuan|thu nhap lai cac khoan thu nhap tuong tu/.test(ten);
}

/**
 * @returns { cur, prev, unit, regime: 'TCTD', unmapped: [], warnings, meta } — khoá "BS:N300", số đã quy về đồng.
 */
export function bankToValues(st, ai) {
  const meta = ai.meta || {};
  const warnings = [];
  let unit = unitScale(meta.don_vi);
  if (!unit) { unit = 1; warnings.push(t('w.noUnit', { raw: meta.don_vi || '' })); }
  const raw = { cur: {}, prev: {} };
  const used = new Set();
  let section = null;
  const pool = AKA.filter((a) => a.it.st === st);
  for (const row of ai.items || []) {
    const name = core(row.n);
    if (!name) continue;
    let cands = pool.filter((a) => a.names.has(name));
    if (!cands.length) cands = pool.filter((a) => [...a.names].some((n) => n.length > 12 && (name.startsWith(n) || n.startsWith(name))));
    if (!cands.length) cands = pool.filter((a) => [...a.names].some((n) => giong(n, name) >= 0.8));
    const v = parseVN(row.v), p = parseVN(row.p);
    if (!cands.length) {
      if (v !== null || p !== null) warnings.push(t('w.noCode', { name: String(row.n).slice(0, 60) }));
      continue;
    }
    // AI hay đặt STT vào c (cột "Mã số" không có ở mẫu ngân hàng) thay vì đầu tên.
    const cap = capSTT(row.n) || capSTT(/^[IVXLC\d]+$|^[a-zđ]$/i.test(String(row.c || '').trim()) ? `${String(row.c).trim()}. ` : '');
    const diem = ({ it }) => {
      const cha = PARENT.get(`${st}:${it.code}`);
      let d = 0;
      if (section && cha === section) d += 4;
      else if (section && cha && cha === PARENT.get(`${st}:${section}`)) d += 2;
      if (cap && (cap === 1 ? it.lvl <= 1 : it.lvl === cap)) d += 2;
      if (!used.has(it.code)) d += 1;
      return d;
    };
    const best = cands.reduce((a, b) => (diem(b) > diem(a) ? b : a)).it;
    if (best.sum) section = best.code;
    // Dòng đề mục không số ("LƯU CHUYỂN TIỀN TỪ HOẠT ĐỘNG KINH DOANH", "VIII. Vốn chủ sở hữu" khi tổng in ở dòng
    // "TỔNG VỐN CHỦ SỞ HỮU" phía dưới): chỉ để biết đang ở mục nào, không giữ chỗ của dòng có số.
    if (v === null && p === null) continue;
    if (used.has(best.code)) { warnings.push(t('w.dup', { codes: best.code })); continue; }
    used.add(best.code);
    if (v !== null) raw.cur[`${st}:${best.code}`] = v * unit;
    if (p !== null) raw.prev[`${st}:${best.code}`] = p * unit;
  }
  const doiDau = new Set();
  const out = { cur: dauTCTD(st, raw.cur, unit, doiDau), prev: dauTCTD(st, raw.prev, unit, doiDau) };
  if (doiDau.size) warnings.push(t('w.signBank', { codes: [...doiDau].join(', ') }));
  return { cur: out.cur, prev: out.prev, unit, regime: 'TCTD', direct: st === 'CF', unmapped: [], warnings, meta };
}

/** Dấu chuẩn: (*) trên CĐKT → âm; chi phí KQKD → dương (quy ước in ngoặc quyết bằng 01 − 02 = 10). LCTT giữ như in. */
function dauTCTD(st, vals, unit, doiDau) {
  const out = { ...vals };
  const num = (c) => (typeof vals[`${st}:${c}`] === 'number' ? vals[`${st}:${c}`] : null);
  const gan = (a, b) => Math.abs(a - b) <= Math.max(unit * 2, 1000);
  if (st === 'BS') for (const c of TCTD_AM) { const x = num(c); if (x !== null && x > 0) { out[`BS:${c}`] = -x; doiDau.add(c); } }
  if (st === 'IS') {
    let ngoac = null;
    for (const [a, b, z] of [['N01', 'N02', 'N10'], ['N03', 'N04', 'N20'], ['N05', 'N06', 'N60'], ['N80', 'N81', 'N90']]) {
      const x = num(a), y = num(b), s = num(z);
      if (x === null || y === null || s === null || !y) continue;
      const tru = gan(x - y, s), cong = gan(x + y, s);
      if (tru !== cong) { ngoac = cong; break; }
    }
    if (ngoac === null) ngoac = ['N02', 'N81'].some((c) => num(c) !== null && num(c) < 0);
    for (const c of TCTD_CHI_PHI) {
      const x = num(c);
      if (x === null) continue;
      const y = ngoac ? -x : Math.abs(x);
      if (y !== x) { out[`IS:${c}`] = y; doiDau.add(c); }
    }
    // Thuế hoãn lại có thể là khoản ĐƯỢC HOÀN: theo quy ước chung trước, rồi thử chiều ngược với 100 − 07 − 08 = 120.
    const pbt = num('N100'), pat = num('N120'), hl = num('N08');
    if (hl !== null) {
      const a = ngoac ? -hl : hl, ht = out['IS:N07'] || 0;
      out['IS:N08'] = pbt !== null && pat !== null && !gan(pbt - ht - a, pat) && gan(pbt - ht + a, pat) ? -a : a;
      if (out['IS:N08'] !== hl) doiDau.add('N08');
    }
    const tax = num('N110');
    if (tax !== null && tax < 0) { out['IS:N110'] = -tax; doiDau.add('N110'); }
  }
  return out;
}
