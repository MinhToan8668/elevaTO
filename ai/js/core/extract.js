// Biến kết quả AI (chép nguyên văn số trên BCTC) thành số liệu chuẩn: mã TT99, đơn vị đồng, dấu chuẩn.
// Nguyên tắc: AI chỉ CHÉP, code mới ĐỌC SỐ / ĐỔI ĐƠN VỊ / QUY ĐỔI MÃ — để không có chuyện AI tự làm tròn,
// tự nhân đơn vị hay trả số dạng chữ bị hiểu thành 0.

import { CHART } from '../chart2026.js';
import { parseVN, unitScale } from './numbers.js';
import { fromTT200, normalizeSigns, detectRegime, toTT99Key, item as chartItem } from './statements.js';
import { t } from '../i18n.js';
import { isBankStatement, bankToValues } from './bank.js';

// ─── JSON từ AI ────────────────────────────────────────────

export function parseAIJson(text) {
  const s = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = s.search(/[{[]/);
  if (start >= 0) {
    const end = matchEnd(s, start);
    if (end > 0) { try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { /* rơi xuống lỗi chung */ } }
  }
  throw new Error(t('err.badJson'));
}

// Tìm dấu đóng khớp với { hoặc [ ở vị trí start, bỏ qua ký tự nằm trong chuỗi.
function matchEnd(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Khi không gửi khuôn JSON (lượt thử lại), AI hay đặt tên trường theo ý mình: "ma_so", "chi_tieu", "nam_nay"…
// Không gom về c/n/v/p thì mọi dòng bị bỏ âm thầm và cả bảng ra rỗng.
const BI_DANH = {
  c: ['c', 'ma', 'ma_so', 'maso', 'code', 'ms'],
  n: ['n', 'ten', 'chi_tieu', 'chitieu', 'ten_chi_tieu', 'name', 'label'],
  v: ['v', 'ky_nay', 'nam_nay', 'so_cuoi_ky', 'so_cuoi_nam', 'cuoi_ky', 'cur', 'current', 'value'],
  p: ['p', 'ky_truoc', 'nam_truoc', 'so_dau_nam', 'dau_nam', 'prev', 'previous'],
};
export function normItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((x) => x && typeof x === 'object').map((x) => {
    const out = {};
    for (const [k, ds] of Object.entries(BI_DANH)) {
      const hit = ds.find((d) => x[d] !== undefined && x[d] !== null);
      out[k] = hit === undefined ? '' : x[hit];
    }
    return out;
  });
}

// ─── Mã số & tên chỉ tiêu ─────────────────────────────────

export function normCode(st, raw) {
  const s = String(raw ?? '').replace(/[\s.]/g, '').toLowerCase();
  if (!/^\d{1,3}[a-z]?$/.test(s)) return '';
  const m = /^(\d+)([a-z]?)$/.exec(s);
  const n = m[1];
  return (st === 'BS' ? n : n.padStart(2, '0')) + m[2];
}

export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
// Viết tắt hay gặp trên BCTC và trong danh mục → cụm đầy đủ, áp cho CẢ HAI phía nên "TSCĐ hữu hình" trên danh mục
// khớp "Tài sản cố định hữu hình" trên báo cáo. Chỉ các viết tắt không nhập nhằng (bỏ "NH", "DH", "CP", "KH").
const VIET_TAT = [
  [/\btscd\b/g, 'tai san co dinh'], [/\bbdsdt\b/g, 'bat dong san dau tu'], [/\bbds\b/g, 'bat dong san'],
  [/\bccdv\b/g, 'cung cap dich vu'], [/\bhdkd\b/g, 'hoat dong kinh doanh'], [/\bhddt\b/g, 'hoat dong dau tu'],
  [/\bhdtc\b/g, 'hoat dong tai chinh'], [/\bvld\b/g, 'von luu dong'], [/\blnst\b/g, 'loi nhuan sau thue'],
  [/\blntt\b/g, 'loi nhuan truoc thue'], [/\bln\b/g, 'loi nhuan'], [/\blc\b/g, 'luu chuyen'], [/\btndn\b/g, 'thu nhap doanh nghiep'],
  [/\bdn\b/g, 'doanh nghiep'], [/\bsxkd\b/g, 'san xuat kinh doanh'], [/\bxdcb\b/g, 'xay dung co ban'],
  [/\bhdxd\b/g, 'hop dong xay dung'], [/\btdt\b/g, 'tuong duong tien'], [/\bcsh\b/g, 'chu so huu'],
  [/\bld lk\b/g, 'lien doanh lien ket'], [/\bldlk\b/g, 'lien doanh lien ket'], [/\bhtk\b/g, 'hang ton kho'],
  [/\bvcsh\b/g, 'von chu so huu'], [/\bqldn\b/g, 'quan ly doanh nghiep'], [/\bgtgt\b/g, 'gia tri gia tang'],
];
function normLabel(s) {
  let t = fold(s).toLowerCase().replace(/\(\*\)|¤/g, ' ').replace(/&/g, ' va ')
    // "(Tăng) giảm hàng tồn kho" → "tang giam hang ton kho": giữ chữ trong ngoặc đầu dòng
    .replace(/^\s*\(([^)]*)\)/, '$1 ')
    .replace(/^\s*(?:[ivxlc]+|\d+|[a-z])\s*[.)]\s*/, '').replace(/^[-–+\s]+/, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, full] of VIET_TAT) t = t.replace(re, full);
  return t.replace(/\bva\b/g, ' ').replace(/\s+/g, ' ').trim();
}
const LABELS = {};
for (const it of CHART) {
  const k = normLabel(it.label);
  ((LABELS[it.st] ||= {})[k] ||= []).push(it.code);
}

// Tên gọi khác nhau nhưng bản chất như nhau → mã TT99. Chỉ nhận tên KHÔNG nhập nhằng (không đưa "hàng tồn kho",
// "vốn chủ sở hữu"… vì vừa là dòng tổng vừa là dòng con). Khoá đi qua normLabel như nhãn AI đọc.
const DONG_NGHIA_GOC = {
  BS: {
    'tien va cac khoan tuong duong tien': '110', 'tien va tuong duong tien': '110', 'tien mat va tien gui ngan hang': '111',
    'phai thu khach hang': '131', 'phai thu cua khach hang': '131', 'phai thu ngan han khach hang': '131',
    'tra truoc cho nguoi ban': '132', 'tra truoc nguoi ban': '132',
    'tai san co dinh huu hinh': '221', 'tai san co dinh thue tai chinh': '224', 'tai san co dinh vo hinh': '227',
    'dau tu vao cong ty con': '261', 'dau tu vao cong ty lien doanh lien ket': '262', 'dau tu vao cong ty lien ket lien doanh': '262',
    'tong tai san': '280', 'tong cong tai san': '280', 'no phai tra': '300', 'no ngan han': '310', 'no dai han': '330',
    'phai tra nguoi ban': '311', 'phai tra nha cung cap': '311', 'phai tra cho nguoi ban': '311',
    'nguoi mua tra tien truoc': '312', 'khach hang ung truoc': '312', 'nguoi mua ung truoc': '312', 'nguoi mua tra truoc': '312',
    'thue va cac khoan phai nop nha nuoc': '314', 'thue va cac khoan phai nop': '314', 'thue phai nop nha nuoc': '314',
    'phai tra nguoi lao dong': '315', 'phai tra cong nhan vien': '315', 'chi phi phai tra': '316',
    'vay ngan han': '321', 'vay va no ngan han': '321', 'vay va no thue tai chinh ngan han': '321',
    'vay dai han': '339', 'vay va no dai han': '339', 'vay va no thue tai chinh dai han': '339',
    'von dau tu cua chu so huu': '411', 'von gop cua chu so huu': '411', 'von dieu le': '411', 'von gop': '411',
    'thang du von co phan': '412', 'co phieu quy': '415', 'quy dau tu phat trien': '418',
    'loi nhuan chua phan phoi': '420', 'lai chua phan phoi': '420', 'loi nhuan sau thue chua phan phoi': '420', 'loi nhuan giu lai': '420',
    'loi ich co dong khong kiem soat': '429', 'loi ich cua co dong khong kiem soat': '429', 'loi ich co dong thieu so': '429',
    'loi the thuong mai': '279', 'tong nguon von': '440', 'tong cong nguon von': '440',
    'du phong giam gia hang ton kho': '142', 'du phong phai thu ngan han kho doi': '136', 'du phong phai thu kho doi': '136',
    'chi phi tra truoc ngan han': '161', 'chi phi tra truoc dai han': '271', 'thue gia tri gia tang duoc khau tru': '162',
    'chi phi xay dung co ban do dang': '252', 'tai san thue thu nhap hoan lai': '272', 'thue thu nhap hoan lai phai tra': '342',
  },
  IS: {
    'doanh thu ban hang': '01', 'doanh thu ban hang va cung cap dich vu': '01', 'doanh thu': '01',
    'cac khoan giam tru doanh thu': '02', 'cac khoan giam tru': '02',
    'phan lai hoac lo trong cong ty lien doanh lien ket': '27', 'phan lai lo trong cong ty lien doanh lien ket': '27', 'lai lo trong cong ty lien doanh lien ket': '27',
    'doanh thu thuan': '10', 'doanh thu thuan ve ban hang va cung cap dich vu': '10', 'doanh thu thuan ve cung cap dich vu': '10', 'doanh thu thuan ban hang va cung cap dich vu': '10',
    'gia von hang ban': '11', 'gia von': '11', 'gia von dich vu cung cap': '11', 'gia von hang ban va dich vu cung cap': '11',
    'loi nhuan gop': '20', 'loi nhuan gop ve ban hang va cung cap dich vu': '20', 'loi nhuan gop ve cung cap dich vu': '20', 'lai gop': '20',
    'doanh thu hoat dong tai chinh': '22', 'chi phi tai chinh': '23', 'trong do chi phi lai vay': '24', 'chi phi lai vay': '24', 'trong do chi phi di vay': '24',
    'chi phi ban hang': '25', 'chi phi quan ly doanh nghiep': '26',
    'loi nhuan thuan tu hoat dong kinh doanh': '30', 'loi nhuan tu hoat dong kinh doanh': '30',
    'thu nhap khac': '31', 'chi phi khac': '32', 'loi nhuan khac': '40', 'lo khac': '40', 'lai lo khac': '40', 'loi nhuan lo khac': '40',
    'tong loi nhuan ke toan truoc thue': '50', 'loi nhuan ke toan truoc thue': '50', 'loi nhuan truoc thue': '50', 'tong loi nhuan truoc thue': '50',
    'chi phi thue thu nhap doanh nghiep hien hanh': '51', 'thue thu nhap doanh nghiep hien hanh': '51', 'chi phi thue thu nhap doanh nghiep': '51',
    'chi phi thue thu nhap doanh nghiep hoan lai': '52', 'thue thu nhap doanh nghiep hoan lai': '52', 'loi ich thue thu nhap doanh nghiep hoan lai': '52',
    'loi nhuan sau thue': '60', 'loi nhuan sau thue thu nhap doanh nghiep': '60', 'loi nhuan thuan sau thue': '60', 'loi nhuan sau thue trong ky': '60', 'loi nhuan sau thue trong nam': '60',
    'loi nhuan sau thue cua cong ty me': '61', 'loi nhuan sau thue cua co dong cong ty me': '61', 'loi nhuan sau thue cua co dong khong kiem soat': '62',
    'lai co ban tren co phieu': '70', 'lai suy giam tren co phieu': '71',
  },
  CF: {
    'loi nhuan truoc thue': '01', 'tong loi nhuan ke toan truoc thue': '01', 'loi nhuan ke toan truoc thue': '01',
    'khau hao va hao mon': '02', 'khau hao tai san co dinh': '02', 'khau hao tai san co dinh va bat dong san dau tu': '02', 'khau hao va phan bo': '02', 'chi phi khau hao': '02', 'khau hao': '02',
    'cac khoan du phong': '03', 'du phong': '03', 'trich lap hoan nhap du phong': '03',
    'lai lo chenh lech ty gia hoi doai': '04', 'lai lo chenh lech ty gia hoi doai do danh gia lai cac khoan muc tien te co goc ngoai te': '04', 'lai lo chenh lech ty gia': '04', 'lai lo chenh lech ty gia chua thuc hien': '04',
    'lai lo tu hoat dong dau tu': '05', 'lai tu hoat dong dau tu': '05', 'lo tu hoat dong dau tu': '05', 'lai lo hoat dong dau tu': '05',
    'chi phi lai vay': '06', 'chi phi di vay': '06', 'cac khoan dieu chinh khac': '07',
    'loi nhuan tu hoat dong kinh doanh truoc thay doi von luu dong': '08', 'loi nhuan kinh doanh truoc nhung thay doi von luu dong': '08', 'loi nhuan tu hoat dong kinh doanh truoc nhung thay doi von luu dong': '08',
    'tang giam cac khoan phai thu': '09', 'tang cac khoan phai thu': '09', 'giam cac khoan phai thu': '09', 'giam tang cac khoan phai thu': '09',
    'tang giam hang ton kho': '10', 'tang hang ton kho': '10', 'giam hang ton kho': '10', 'giam tang hang ton kho': '10',
    'tang giam cac khoan phai tra': '11', 'tang cac khoan phai tra': '11', 'giam cac khoan phai tra': '11',
    'tang giam chi phi tra truoc': '12', 'giam tang chi phi tra truoc': '12', 'giam chi phi tra truoc': '12', 'tang chi phi tra truoc': '12', 'tang giam chi phi cho phan bo': '12',
    'tang giam chung khoan kinh doanh': '13', 'tien lai vay da tra': '14', 'lai vay da tra': '14', 'chi phi di vay da tra': '14',
    'thue thu nhap doanh nghiep da nop': '15', 'tien thu khac tu hoat dong kinh doanh': '16', 'tien chi khac cho hoat dong kinh doanh': '17', 'tien chi khac tu hoat dong kinh doanh': '17',
    'luu chuyen tien thuan tu hoat dong kinh doanh': '20', 'luu chuyen tien thuan tu su dung vao hoat dong kinh doanh': '20', 'luu chuyen tien thuan su dung vao hoat dong kinh doanh': '20',
    'tien chi de mua sam xay dung tai san co dinh va cac tai san dai han khac': '21', 'tien chi de mua sam xay dung tai san co dinh': '21', 'tien chi mua sam xay dung tai san co dinh': '21', 'tien chi de mua sam tai san co dinh': '21', 'tien chi mua sam tai san co dinh': '21',
    'tien thu tu thanh ly nhuong ban tai san co dinh va cac tai san dai han khac': '22', 'tien thu tu thanh ly nhuong ban tai san co dinh': '22', 'tien thu thanh ly nhuong ban tai san co dinh': '22',
    'tien chi cho vay mua cac cong cu no cua don vi khac': '23', 'tien chi cho vay': '23', 'tien chi cho vay mua cong cu no': '23',
    'tien thu hoi cho vay ban lai cac cong cu no cua don vi khac': '24', 'tien thu hoi cho vay': '24', 'tien thu hoi cho vay ban lai cong cu no': '24',
    'tien chi dau tu gop von vao don vi khac': '25', 'tien chi dau tu gop von vao cac don vi khac': '25', 'tien thu hoi dau tu gop von vao don vi khac': '26', 'tien thu hoi dau tu gop von vao cac don vi khac': '26',
    'tien thu lai cho vay co tuc va loi nhuan duoc chia': '27', 'tien thu lai tien gui co tuc va loi nhuan duoc chia': '27', 'thu lai cho vay co tuc va loi nhuan duoc chia': '27', 'tien thu lai cho vay va loi nhuan duoc chia': '27',
    'luu chuyen tien thuan tu hoat dong dau tu': '30', 'luu chuyen tien thuan su dung vao hoat dong dau tu': '30', 'luu chuyen tien thuan tu su dung vao hoat dong dau tu': '30',
    'tien thu tu phat hanh co phieu nhan von gop cua chu so huu': '31', 'tien thu tu nhan von gop cua chu so huu': '31', 'tien thu tu phat hanh co phieu': '31', 'tien thu tu nhan von gop': '31',
    'tien tra lai von gop cho cac chu so huu mua lai co phieu cua doanh nghiep da phat hanh': '32', 'tien chi tra von gop cho chu so huu': '32', 'tien chi mua lai co phieu': '32',
    'tien thu tu di vay': '33', 'tien vay ngan han dai han nhan duoc': '33', 'tien thu tu di vay ngan han dai han': '33', 'tien vay nhan duoc': '33',
    'tien tra no goc vay': '34', 'tien chi tra no goc vay': '34', 'tien tra no goc vay ngan han dai han': '34',
    'tien tra no goc thue tai chinh': '35', 'tien chi tra no goc thue tai chinh': '35', 'tien tra no thue tai chinh': '35',
    'co tuc loi nhuan da tra cho chu so huu': '36', 'loi nhuan da tra cho chu so huu': '36', 'co tuc da tra cho chu so huu': '36', 'co tuc da tra': '36', 'co tuc loi nhuan da tra': '36', 'tien chi tra co tuc': '36',
    'luu chuyen tien thuan tu hoat dong tai chinh': '40', 'luu chuyen tien thuan su dung vao hoat dong tai chinh': '40', 'luu chuyen tien thuan tu su dung vao hoat dong tai chinh': '40',
    'luu chuyen tien thuan trong ky': '50', 'luu chuyen tien thuan trong nam': '50', 'luu chuyen tien va tuong duong tien thuan trong ky': '50', 'tang giam tien thuan trong ky': '50', 'tang giam tien thuan trong nam': '50',
    'tien va tuong duong tien dau ky': '60', 'tien va tuong duong tien dau nam': '60', 'tien dau ky': '60', 'tien dau nam': '60', 'tien va cac khoan tuong duong tien dau ky': '60', 'tien va cac khoan tuong duong tien dau nam': '60',
    'anh huong cua thay doi ty gia hoi doai quy doi ngoai te': '61', 'anh huong cua thay doi ty gia quy doi ngoai te': '61', 'anh huong cua thay doi ty gia hoi doai': '61', 'anh huong thay doi ty gia hoi doai': '61', 'anh huong cua thay doi ty gia': '61',
    'tien va tuong duong tien cuoi ky': '70', 'tien va tuong duong tien cuoi nam': '70', 'tien cuoi ky': '70', 'tien cuoi nam': '70', 'tien va cac khoan tuong duong tien cuoi ky': '70', 'tien va cac khoan tuong duong tien cuoi nam': '70',
  },
};
const DONG_NGHIA = {};
for (const [st, m] of Object.entries(DONG_NGHIA_GOC)) {
  DONG_NGHIA[st] = {};
  for (const [lbl, code] of Object.entries(m)) if (chartItem(st, code)) DONG_NGHIA[st][normLabel(lbl)] = code;
}

/**
 * Mã TT99 của một dòng theo tên chỉ tiêu: đúng tên trên danh mục (tên trùng nhiều dòng như "- Nguyên giá" → null),
 * không thì theo bảng tên gọi đồng nghĩa ("Phải thu khách hàng" → 131, "Tiền thu từ đi vay" → 33).
 */
export function matchLabel(st, label) {
  const k = normLabel(label);
  const hits = (LABELS[st] || {})[k];
  if (hits && hits.length === 1) return hits[0];
  if (hits) return null;
  return (DONG_NGHIA[st] || {})[k] || null;
}

/** Độ giống hai tên đã chuẩn hoá (Dice trên tập từ), 0..1. */
function labelSim(a, b) {
  const A = new Set(a.split(' ').filter(Boolean)), B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return (2 * n) / (A.size + B.size);
}
const DONG_CON_TSCD = /nguyen gia|hao mon|khau hao/;
const DAU_KHOI_TSCD = new Set(['221', '224', '227', '240']);

/**
 * Mã in trên giấy và TÊN chỉ tiêu không khớp nhau (công ty đánh số lệch mẫu, ví dụ THILOGI 2024 in
 * "Tài sản cố định vô hình" ở mã 221 trong khi mẫu là 227) → tin TÊN khi tên khớp ĐÚNG một dòng khác của danh mục
 * (hoặc bảng đồng nghĩa). Dòng tổng (có công thức) không bao giờ bị đổi: "I. Tiền" ở 110 vẫn là 110.
 * Trả mã TT99 mới hoặc null (giữ mã in).
 */
// Dòng đề mục không phải chỉ tiêu: "2. Điều chỉnh cho các khoản" của LCTT gián tiếp (chỉ khi đứng riêng một dòng —
// AI hay gộp đề mục với dòng đầu: "2. Điều chỉnh cho các khoản: - Khấu hao TSCĐ…", số là khấu hao, phải giữ). AI hay chép kèm số tổng
// các điều chỉnh và gán luôn mã "02" (đẩy các mã bên dưới lệch một dòng) → số đề mục đè lên khấu hao.
const DE_MUC = /^dieu chinh cho cac khoan$/;

function maTheoTen(st, tt99Code, label) {
  const byName = matchLabel(st, label);
  // Mã in không có trong mẫu (AI đọc nhầm "149" thành "142" của TT200, hay công ty tự đánh số): không quy đổi
  // được thì dòng bị bỏ và dòng tổng lệch — xếp theo tên nếu tên khớp chắc một dòng nhập liệu.
  if (!tt99Code || !chartItem(st, tt99Code)) {
    const target = byName && chartItem(st, byName);
    return target && target.kind === 'input' && labelSim(normLabel(label), normLabel(target.label)) >= 0.75 ? byName : null;
  }
  const cur = chartItem(st, tt99Code);
  if (!byName || byName === tt99Code) return null;
  const target = chartItem(st, byName);
  if (!target || target.kind === 'memo') return null;
  // Dòng tổng giữ nguyên mã — trừ các đầu khối TSCĐ / BĐSĐT (221, 224, 227, 240: tổng của nguyên giá + hao mòn),
  // là chỗ các công ty hay đánh số lẫn nhau; đổi được giữa chúng với nhau.
  const dauKhoi = (c) => DAU_KHOI_TSCD.has(c);
  if ((cur.sum || target.sum) && !(dauKhoi(tt99Code) && dauKhoi(byName))) return null;
  // Tên nằm đúng trong bảng đồng nghĩa là chắc chắn (DGW Q3/2026 in "Phần lãi hoặc lỗ trong công ty liên doanh,
  // liên kết" ở mã 26 — mã của chi phí QLDN — nên phải dời đi, không thì đè lên QLDN).
  if (DONG_NGHIA[st]?.[normLabel(label)] !== byName && labelSim(normLabel(label), normLabel(target.label)) < 0.75) return null;
  return byName;
}

// ─── Báo cáo chính ────────────────────────────────────────

/**
 * @param st 'BS' | 'IS' | 'CF'
 * @param ai { meta: { don_vi, thong_tu, phuong_phap, … }, items: [{ c, n, v, p }] }
 * @returns { cur, prev, unit, regime, unmapped: [..], warnings: [..] }   (cur/prev: { "BS:131": đồng })
 */
export function statementToValues(st, ai, hint = {}) {
  ai = { ...ai, items: normItems(ai.items) };
  // Ngân hàng: không có mã số, danh mục khác hẳn → bộ đọc riêng.
  if (hint.regime === 'TCTD' || (hint.regime == null && isBankStatement(ai.items))) {
    const r = bankToValues(st, ai);
    r.warnings.unshift(t('w.bank'));
    return r;
  }
  const meta = ai.meta || {};
  const warnings = [];
  let unit = unitScale(meta.don_vi);
  if (!unit) { unit = 1; warnings.push(t('w.noUnit', { raw: meta.don_vi || '' })); }
  const direct = st === 'CF' && /truc/.test(fold(meta.phuong_phap || '').toLowerCase());

  // Gom số theo mã (raw, mã như in) và theo tên (byLabel, mã TT99). regime = null ở lượt đầu (chỉ để đoán mẫu),
  // lượt sau mới sửa mã in lệch theo tên — vì muốn so tên phải biết mã in thuộc mẫu nào.
  const gom = (regime) => {
    const raw = { cur: {}, prev: {} }, byLabel = { cur: {}, prev: {} };
    const dup = new Set(), remap = [];
    let khoi = null;   // khối TSCĐ/BĐSĐT vừa bị đổi mã → dòng con "Nguyên giá"/"Hao mòn" đi theo
    for (const it of ai.items || []) {
      if (DE_MUC.test(normLabel(it.n))) continue;
      const code = normCode(st, it.c);
      let target = code ? raw : byLabel;
      let key = code ? `${st}:${code}` : matchLabel(st, it.n) && `${st}:${matchLabel(st, it.n)}`;
      if (code && regime) {
        const k99 = regime === 'TT200' && st !== 'CF' ? (toTT99Key(key) || '').split(':')[1] : code;
        const nl = normLabel(it.n);
        let moi = null;
        if (st === 'BS' && khoi && DONG_CON_TSCD.test(nl) && /^\d{3}$/.test(k99) && (+k99 === khoi.from + 1 || +k99 === khoi.from + 2)) {
          moi = String(khoi.to + (+k99 - khoi.from));
        } else {
          moi = maTheoTen(st, k99, it.n);
          if (st === 'BS') khoi = moi && DAU_KHOI_TSCD.has(moi) && /^\d{3}$/.test(k99) ? { from: +k99, to: +moi } : (DONG_CON_TSCD.test(nl) ? khoi : null);
        }
        if (moi) { remap.push({ from: code, to: moi, name: String(it.n || '').trim().slice(0, 50) }); target = byLabel; key = `${st}:${moi}`; }
      }
      if (!key) { if (it.n && (parseVN(it.v) !== null || parseVN(it.p) !== null)) warnings.push(t('w.noCode', { name: String(it.n).slice(0, 60) })); continue; }
      for (const [side, rawV] of [['cur', it.v], ['prev', it.p]]) {
        const v = parseVN(rawV);
        if (v === null) continue;
        if (key in target[side]) { dup.add(key); continue; }
        target[side][key] = v * unit;
      }
    }
    return { raw, byLabel, dup, remap };
  };
  const regime = hint.regime || regimeFrom(st, meta, gom(null).raw.cur, ai.items || []);
  const { raw, byLabel, dup, remap } = gom(regime);
  if (dup.size) warnings.push(t('w.dup', { codes: [...dup].map((k) => k.split(':')[1]).join(', ') }));
  for (const r of remap) warnings.push(t('w.remap', r));
  if (!hint.regime && regime === 'TT200' && oldYear(meta) && (/99/.test(String(meta.thong_tu || '')) || detectRegime(raw.cur) === 'TT99')) {
    warnings.push(t('w.oldForm', { d: meta.ngay_ket_thuc }));
  }
  const unmapped = new Set();
  const conv = (vals) => {
    let v = vals;
    if (regime === 'TT200' && st !== 'CF') { const r = fromTT200(vals); v = r.values; r.unmapped.forEach((k) => unmapped.add(k)); }
    if (direct) v = Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/^CF:(\d)/, 'CF:T$1'), x]));
    return v;
  };
  const out = {};
  const fixes = [];
  let suy01 = false;
  for (const side of ['cur', 'prev']) {
    const labeled = direct ? Object.fromEntries(Object.entries(byLabel[side]).map(([k, x]) => [k.replace(/^CF:(\d)/, 'CF:T$1'), x])) : byLabel[side];
    const v = normalizeSigns({ ...labeled, ...conv(raw[side]) }, fixes, { unit });   // dòng có mã được ưu tiên
    // BCTC dịch vụ hay in KQKD từ "Doanh thu thuần" (mã 10), không có 01/02. Dòng 10 là dòng tổng (10 = 01 − 02)
    // nên mọi chỗ cộng dồn / tính tăng trưởng doanh thu sẽ hụt → suy 01 = 10 + 02 và nói rõ.
    if (st === 'IS' && typeof v['IS:10'] === 'number' && typeof v['IS:01'] !== 'number') {
      v['IS:01'] = v['IS:10'] + (typeof v['IS:02'] === 'number' ? v['IS:02'] : 0);
      suy01 = true;
    }
    out[side] = v;
  }
  if (suy01) warnings.push(t('w.derived01'));
  // Chỗ đã đổi dấu theo quy ước của báo cáo: gộp theo loại, mỗi loại một dòng cảnh báo để người dùng soát.
  const daDoi = {};
  for (const f of fixes) { daDoi[f.kind] ||= new Set(); f.codes.forEach((c) => daDoi[f.kind].add(c)); }
  for (const [kind, codes] of Object.entries(daDoi)) warnings.push(t(`w.sign${kind}`, { codes: [...codes].join(', ') }));
  return { cur: out.cur, prev: out.prev, unit, regime, direct, unmapped: [...unmapped], warnings, meta };
}

// Thông tư 99/2025 áp dụng từ năm tài chính 2026: báo cáo kỳ kết thúc từ 2025 trở về trước chắc chắn theo mẫu TT200
// (kể cả khi AI ghi nhầm thông tư) → đọc mã theo TT200 rồi quy đổi sang mẫu 2026.
// Năm của ngày cuối cùng trong chuỗi (AI đôi khi ghi cả khoảng "01/01/2025 - 31/03/2026").
const yearOf = (d) => { const all = String(d || '').match(/\d{4}/g); return all ? Number(all[all.length - 1]) : 0; };
const oldYear = (meta) => { const y = yearOf(meta.ngay_ket_thuc); return y > 0 && y <= 2025; };

function regimeFrom(st, meta, cur, items) {
  if (oldYear(meta)) return 'TT200';
  const t = String(meta.thong_tu || '');
  if (/200/.test(t)) return 'TT200';
  if (/99/.test(t)) return 'TT99';
  if (st === 'BS') return detectRegime(cur) || 'TT99';
  if (st === 'IS') {
    // TT200: mã 21 là doanh thu tài chính. TT99: 21 là lãi/lỗ bất động sản đầu tư, 22 mới là doanh thu tài chính.
    const i21 = items.find((i) => normCode('IS', i.c) === '21');
    if (i21 && /tai chinh/.test(normLabel(i21.n))) return 'TT200';
    if (items.some((i) => normCode('IS', i.c) === '27')) return 'TT99';
    return i21 ? 'TT99' : 'TT200';
  }
  return 'TT99';
}

// ─── Kỳ báo cáo ───────────────────────────────────────────

export function periodsFromMeta(meta = {}) {
  const d = String(meta.ngay_ket_thuc || '');
  let y, m;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d);
  if (x) { y = +x[1]; m = +x[2]; }
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(d))) { y = +x[3]; m = +x[2]; }
  else return null;
  if (!(m >= 1 && m <= 12) || !(y > 1990 && y < 2100)) return null;
  // AI ghi cot_luy_ke = false khi bảng chỉ in cột quý lẻ (xem prompts.js). Thiếu trường → coi là lũy kế,
  // vì mọi BCTC quý theo mẫu B 02a-DN đều có cột lũy kế và câu lệnh bắt lấy đúng cột ấy.
  const luyKe = meta.cot_luy_ke !== false;
  const months = soThang(meta.so_thang) || (luyKe ? (m === 12 ? 12 : m) : 3);
  // Cột kỳ trước của KQKD/LCTT là CÙNG KỲ năm trước nên cùng số tháng; AI ghi khác thì tin AI.
  const monthsPrev = soThang(meta.so_thang_p) || months;
  return { cur: mkPeriod(y, months, m), prevBS: mkPeriod(y - 1, 12, 12), prevFlow: mkPeriod(y - 1, monthsPrev, m) };
}
const soThang = (v) => ([3, 6, 9, 12].includes(Number(v)) ? Number(v) : 0);

/**
 * Một kỳ: mã, năm, số tháng kỳ bao trùm, tháng kết thúc.
 * Mã phải phân biệt được QUÝ LẺ với LŨY KẾ cùng ngày kết thúc — chín tháng đầu năm và riêng quý 3
 * đều kết thúc 30/9 nhưng là hai kỳ khác nhau, trộn vào một ô là cộng dồn sai:
 *   12 tháng → FY2025 · 3 tháng → Q3-2025 (quý lẻ) · còn lại → 9T-2025 (lũy kế từ đầu năm).
 */
export function mkPeriod(year, months, endMonth) {
  const id = months === 12 ? `FY${year}` : months === 3 ? `Q${Math.ceil(endMonth / 3)}-${year}` : `${months}T-${year}`;
  return { id, year, months, endMonth };
}

// ─── Nhận diện trang ──────────────────────────────────────

const TITLES = [
  ['BS', /BANG CAN DOI KE TOAN|BAO CAO TINH HINH TAI CHINH/],
  ['IS', /KET QUA HOAT DONG KINH DOANH/],
  ['CF', /LUU CHUYEN TIEN TE/],
  ['NOTES', /THUYET MINH BAO CAO TAI CHINH/],
];
export const NOTE_GROUPS = {
  fixedAssets: /TAI SAN CO DINH (HUU HINH|VO HINH|THUE TAI CHINH)/,
  debt: /VAY VA NO THUE TAI CHINH|CAC KHOAN VAY\b/,
  equity: /DOI CHIEU BIEN DONG|BIEN DONG (CUA )?VON CHU SO HUU/,
  segments: /BAO CAO BO PHAN|THONG TIN BO PHAN|THEO (LINH VUC|BO PHAN) KINH DOANH/,
  goodwill: /LOI THE THUONG MAI/,
  params: /CO PHIEU DANG LUU HANH|SO LUONG CO PHIEU/,
};

/**
 * @param texts chữ của từng trang (pdf.js), trang 1 ở index 0
 * @returns { types: ['BS'|'IS'|'CF'|'NOTES'|'OTHER'|'UNKNOWN'], notes: {nhóm: [số trang]}, scanned }
 */
export function classifyPages(texts) {
  const up = texts.map((t) => fold(t || '').toUpperCase());
  const types = [];
  let prev = 'OTHER';
  for (const t of up) {
    let type;
    if (t.replace(/\s/g, '').length < 10) type = 'UNKNOWN';          // trang trắng / chỉ có số trang
    else if (/MUC LUC/.test(t.slice(0, 200))) type = 'OTHER';
    else {
      const head = t.slice(0, 400);                        // tiêu đề nằm đầu trang; thân thuyết minh hay nhắc tên báo cáo
      type = (TITLES.find(([, re]) => re.test(head)) || [])[0];
      if (!type) {
        const codes = (t.match(/(?:^|\s)\d{2,3}(?=\s|$)/g) || []).length;
        if (['BS', 'IS', 'CF'].includes(prev) && codes >= 5) type = prev;
        else type = prev === 'NOTES' ? 'NOTES' : 'OTHER';
      }
    }
    types.push(type);
    if (type !== 'UNKNOWN') prev = type;
  }
  const notes = Object.fromEntries(Object.keys(NOTE_GROUPS).map((k) => [k, []]));
  up.forEach((t, i) => {
    if (types[i] !== 'NOTES') return;
    for (const [k, re] of Object.entries(NOTE_GROUPS)) if (re.test(t)) notes[k].push(i + 1);
  });
  const empty = up.filter((t) => t.replace(/\s/g, '').length < 30).length;
  return { types, notes, scanned: texts.length > 0 && empty / texts.length >= 0.8 };
}

// ─── Thuyết minh ──────────────────────────────────────────

const TANGIBLE = ['buildings', 'machinery', 'transport', 'office', 'other'];
function guessTangible(name) {
  const s = normLabel(name);
  if (/nha cua|vat kien truc/.test(s)) return 'buildings';
  if (/phuong tien|van tai|truyen dan/.test(s)) return 'transport';
  if (/dung cu quan ly|van phong/.test(s)) return 'office';
  if (/may moc|thiet bi/.test(s)) return 'machinery';
  return 'other';
}
function guessIntangible(name, nhom) {
  if (nhom === 'land' || nhom === 'software') return nhom;
  const s = normLabel(name);
  if (/quyen su dung dat/.test(s)) return 'land';
  if (/phan mem/.test(s)) return 'software';
  return 'other';
}

// Cột / dòng tổng và cột loại trừ của bảng thuyết minh. AI được dặn bỏ (xem prompts.js) nhưng
// vẫn hay chép vào: lấy một cột "Cộng" làm mảng là nhân đôi doanh thu, lấy "Loại trừ" là tạo mảng âm.
const COT_TONG = /^(cong|tong(\s+cong)?|total|loai tru.*|dieu chinh.*)$/;
export const laCotTong = (name) => COT_TONG.test(normLabel(name));

const neg = (v) => (v ? -Math.abs(v) : 0);
const abs = (v) => (v ? Math.abs(v) : 0);

// ── Bảng biến động vốn chủ ────────────────────────────────
// Bảng in theo ma trận (dòng = nghiệp vụ, cột = thành phần vốn). Một dòng model hay phải cộng
// nhiều dòng của bảng, nên AI chép từng dòng còn code mới xếp vào dòng model và cộng lại.
const EQ_SO_DU = /^(so du|tai ngay|so (dau|cuoi))/;              // dòng số dư, không phải phát sinh
const EQ_CONG_KHOI = /^(tang|giam) trong (nam|ky)$/;             // dòng cộng của khối tăng / giảm
const EQ_LAI_NAM = /(^|\s)(lai|lo|loi nhuan)( sau thue)?( trong (nam|ky)| nam nay)/;   // đã có ở KQKD
const EQ_CO_TUC_CP = /co tuc bang co phieu|co tuc bang cp/;
const EQ_THUONG = /co phieu thuong/;
const EQ_ESOP = /esop|nguoi lao dong/;
const EQ_CO_TUC_TIEN = /co tuc bang tien|tra co tuc|chi co tuc/;

/**
 * Các dòng của một khối năm → dòng 191–205 của model.
 * @param rows [{ ten, von_gop, thang_du, co_phieu_quy, quy_dtpt, lncpp, lickks }]
 * @param so chuỗi trên bảng → số (đồng), ô trống = 0
 */
function equityMove(rows, so) {
  const chiTiet = [], congKhoi = [];
  for (const r of rows || []) {
    const ten = normLabel(r.ten);
    if (EQ_SO_DU.test(ten) || EQ_LAI_NAM.test(ten) || laCotTong(r.ten)) continue;
    (EQ_CONG_KHOI.test(ten) ? congKhoi : chiTiet).push(r);
  }
  // Bảng tách chi tiết thì bỏ dòng cộng (lấy cả hai là nhân đôi); bảng không tách thì dòng cộng là tất cả.
  const dung = chiTiet.length ? chiTiet : congKhoi;
  const out = {};
  const cong = (f, v) => { out[f] = (out[f] || 0) + Math.abs(v); };
  for (const r of dung) {
    const ten = normLabel(r.ten);
    const vg = so(r.von_gop), td = so(r.thang_du), cq = so(r.co_phieu_quy);
    const qu = so(r.quy_dtpt), re = so(r.lncpp), ks = so(r.lickks);
    if (vg) {
      if (EQ_CO_TUC_CP.test(ten)) cong('capStockDiv', vg);
      else if (EQ_THUONG.test(ten)) cong('capBonus', vg);
      else if (EQ_ESOP.test(ten)) cong('capEsop', vg);
      else cong(vg > 0 ? 'capIssued' : 'capDecrease', vg);
    }
    if (td) cong(td > 0 ? 'premiumInc' : 'premiumDec', td);
    if (cq) cong(cq < 0 ? 'treasuryInc' : 'treasuryDec', cq);      // mua cổ phiếu quỹ làm giảm vốn chủ
    if (qu) cong(qu > 0 ? 'devFundInc' : 'devFundDec', qu);
    if (re) cong(EQ_CO_TUC_TIEN.test(ten) ? 'dividends' : re > 0 ? 'reOtherInc' : 'reOtherDec', re);
    if (ks) out.nciChange = (out.nciChange || 0) + ks;              // giữ dấu: tăng hay giảm đều được
  }
  return out;
}

/** Kết quả AI cho một nhóm thuyết minh → dạng model.js cần (đơn vị đồng). */
export function noteToModel(kind, ai) {
  const unit = unitScale(ai.meta?.don_vi) || 1;
  const n = (x) => { const v = parseVN(x); return v === null ? 0 : v * unit; };
  const opt = (x) => { const v = parseVN(x); return v === null ? undefined : v * unit; };
  if (kind === 'fixedAssets') {
    // Giữ cả SỐ ĐẦU NĂM: đó chính là số cuối năm TRƯỚC, nên một bảng thuyết minh đủ tách nhóm
    // TSCĐ cho hai năm liền nhau (xem muonNamTruoc trong targets/model.js).
    const row = (x, cls) => {
      const r = {
        cls, name: String(x.ten || ''), cost: n(x.nguyen_gia_cuoi), accDep: neg(n(x.hao_mon_cuoi)),
        additions: n(x.mua) + n(x.xdcb) + n(x.tang_khac) || 0, depreciation: neg(n(x.khau_hao)),
        // Model không dùng số giảm, nhưng đối chiếu bảng biến động thì cần (đầu kỳ + tăng − giảm = cuối kỳ).
        disposals: abs(n(x.thanh_ly)) + abs(n(x.giam_khac)) || 0,
      };
      const mo = opt(x.nguyen_gia_dau);
      if (mo !== undefined) { r.costOpen = mo; r.accDepOpen = neg(n(x.hao_mon_dau)); }
      return r;
    };
    const thuc = (ds) => (ds || []).filter((x) => !laCotTong(x.ten));
    return {
      tangible: thuc(ai.tangible).map((x) => row(x, TANGIBLE.includes(x.nhom) ? x.nhom : guessTangible(x.ten))),
      intangible: thuc(ai.intangible).map((x) => row(x, guessIntangible(x.ten, x.nhom))),
    };
  }
  if (kind === 'segments') {
    // Lãi gộp: lấy dòng "Lãi gộp" nếu có, không thì doanh thu trừ giá vốn.
    const gopFrom = (revenue, gpRaw, gvRaw) => {
      const gp = parseVN(gpRaw);
      if (gp !== null) return gp * unit;
      return parseVN(gvRaw) !== null ? revenue - abs(n(gvRaw)) : undefined;
    };
    const keo = (o, revenue, gross) => { o.revenue = revenue; if (gross !== undefined) o.gross = gross; return o; };
    return (ai.segments || []).filter((s) => parseVN(s.doanh_thu) !== null && !laCotTong(s.ten)).map((s) => {
      const revenue = n(s.doanh_thu);
      const out = keo({ name: String(s.ten || '') }, revenue, gopFrom(revenue, s.loi_nhuan_gop, s.gia_von));
      // Khối "Năm trước" của bảng báo cáo bộ phận: đủ để tách mảng cho năm liền trước
      // (xem muonNamTruoc trong targets/model.js), thay vì dồn hết doanh thu vào mảng 1.
      if (parseVN(s.doanh_thu_truoc) !== null) {
        const rPrev = n(s.doanh_thu_truoc);
        out.prev = keo({ name: out.name }, rPrev, gopFrom(rPrev, s.loi_nhuan_gop_truoc, s.gia_von_truoc));
      }
      return out;
    });
  }
  if (kind === 'debt') {
    const st = ai.vay_ngan_han || {}, lt = ai.vay_dai_han || {};
    const out = { stProceeds: abs(n(st.vay_trong_ky)), stRepay: abs(n(st.tra_trong_ky)), ltProceeds: abs(n(lt.vay_trong_ky)), ltRepay: abs(n(lt.tra_trong_ky)) };
    // Số dư đầu / cuối năm: model không cần, nhưng đối chiếu được với mã 321 / 339 trên CĐKT.
    // Chỉ ghi khi bảng có in, để dạng dữ liệu không mọc thêm khoá rỗng.
    for (const [khoa, v] of [['stOpen', opt(st.dau_nam)], ['stClose', opt(st.cuoi_nam)], ['ltOpen', opt(lt.dau_nam)], ['ltClose', opt(lt.cuoi_nam)]]) {
      if (v !== undefined) out[khoa] = v;
    }
    return out;
  }
  if (kind === 'equity') {
    const out = equityMove(ai.nam_nay, n);
    // Bảng in HAI khối năm liền nhau → khối trên là phát sinh của năm trước.
    const truoc = equityMove(ai.nam_truoc, n);
    if (Object.keys(truoc).length) out.prev = truoc;
    return out;
  }
  if (kind === 'goodwill') {
    return { cost: opt(ai.nguyen_gia), accAmort: neg(n(ai.phan_bo_luy_ke)), additions: n(ai.tang), amortization: neg(n(ai.phan_bo_trong_ky)) };
  }
  if (kind === 'params') {
    const out = {};
    const sh = parseVN(ai.so_co_phieu_luu_hanh);
    if (sh) out.shares = sh;
    const tr = parseVN(String(ai.thue_suat_tndn ?? '').replace('%', ''));
    if (tr !== null) out.taxRate = tr > 1 ? tr / 100 : tr;
    return out;
  }
  throw new Error(t('err.noteKind', { kind }));
}
