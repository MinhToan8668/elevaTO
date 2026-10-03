// Ngôn ngữ giao diện: tiếng Việt (mặc định) hoặc tiếng Anh.
//   · t('khoá') trả chuỗi theo ngôn ngữ đang chọn; thiếu bản dịch thì rơi về tiếng Việt.
//   · t('khoá', { n: 3 }) thay {n} trong chuỗi.
//   · Chuỗi trong HTML tĩnh đánh dấu bằng data-t / data-t-attr, applyStatic() dịch tại chỗ.
// Đổi ngôn ngữ không nạp lại trang: store.lang đổi → mọi phần giao diện vẽ lại (xem watch trong ui/*.js).

import { VI } from './i18n.vi.js';
import { EN } from './i18n.en.js';
import { CHART_EN } from './chart2026.en.js';
import { MODEL_EN } from './targets/model.en.js';

// [mã, tên đầy đủ, nhãn ngắn dùng khi thanh đầu trang hẹp]
export const LANGS = [['vi', 'Tiếng Việt', 'VI'], ['en', 'English', 'EN']];
const BANG = { vi: VI, en: EN };
const LS = 'elevato-ai-lang';

let lang = 'vi';

/** Ngôn ngữ đã lưu trên máy, hoặc theo ngôn ngữ trình duyệt. */
export function initialLang() {
  try { const l = localStorage.getItem(LS); if (BANG[l]) return l; } catch (e) { /* bỏ qua */ }
  return (navigator.languages || [navigator.language || 'vi']).some((l) => /^vi\b/i.test(l)) ? 'vi' : 'en';
}

export const getLang = () => lang;

/**
 * Đặt ngôn ngữ cho các lần gọi t() sau đó.
 * @param nho  true = người dùng tự chọn, ghi nhớ trên máy. false = chỉ đoán theo trình duyệt,
 *             KHÔNG ghi — để lần sau máy vẫn đoán lại chứ không khoá cứng.
 */
export function setLang(l, { nho = true } = {}) {
  lang = BANG[l] ? l : 'vi';
  if (nho) { try { localStorage.setItem(LS, lang); } catch (e) { /* bỏ qua */ } }
  // Gọi được cả trong bài kiểm tra Node (không có DOM) để kiểm phần chữ của lõi.
  if (typeof document === 'undefined') return lang;
  document.documentElement.lang = lang;
  applyStatic();
  return lang;
}

// {n} điền biến. {n|trang|trang} chọn dạng số ít / số nhiều theo biến n (tiếng Anh cần, tiếng Việt thì
// hai vế viết giống nhau). Chỉ thay một lượt, nên biến chứa "{x}" không bị điền tiếp.
const DIEN = /\{(\w+)(?:\|([^|{}]*)\|([^{}]*))?\}/g;
const dien = (s, v) => (v
  ? String(s).replace(DIEN, (m, k, mot, nhieu) => {
    if (!(k in v)) return m;
    return mot === undefined ? String(v[k]) : (Number(v[k]) === 1 ? mot : nhieu);
  })
  : String(s));

/** Chuỗi theo ngôn ngữ đang chọn. Thiếu bản dịch → tiếng Việt; thiếu cả hai → trả lại chính khoá. */
export function t(key, vars) {
  const s = BANG[lang]?.[key] ?? VI[key];
  return dien(s === undefined ? key : s, vars);
}

/** Tên chỉ tiêu BCTC: bản tiếng Anh nếu có, không thì giữ tên tiếng Việt trong CHART. */
export const chartLabel = (key, vi) => (lang === 'en' && CHART_EN[key]) || vi;
/** Tên dòng model forecast theo số dòng 03.Input_FS. */
export const modelLabel = (row, vi) => (lang === 'en' && MODEL_EN[row]) || vi;
/** Tên đầy đủ của nhóm dòng model (KQKD → "Kết quả kinh doanh" / "Income statement"). */
export const modelGroup = (g) => t(`mgroup.${g}`);
const BOI_SO = [1, 1e3, 1e6, 1e9];
/** Nhãn đơn vị tiền theo bội số; bội số lạ thì lùi về bội số hợp lệ gần nhất (không bao giờ ra "unit.1eNaN"). */
export const unitLabel = (unit) => {
  const u = BOI_SO.includes(unit) ? unit : BOI_SO.filter((x) => x <= (Number(unit) || 1)).pop() || 1;
  return t(`unit.${u === 1 ? '1' : `1e${Math.round(Math.log10(u))}`}`);
};

/** Mã vùng cho toLocaleString (ngày giờ, số). */
export const locale = () => (lang === 'en' ? 'en-GB' : 'vi-VN');

/**
 * Dịch phần HTML tĩnh: data-t="khoá" đổi nội dung chữ,
 * data-t-attr="aria-label:khoá;title:khoá2" đổi thuộc tính.
 */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-attr]')) {
    for (const cap of el.dataset.tAttr.split(';')) {
      const [attr, key] = cap.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  }
}
