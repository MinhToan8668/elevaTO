// Ngôn ngữ giao diện: tiếng Việt (mặc định) hoặc tiếng Anh.
//   · t('khoá') trả chuỗi theo ngôn ngữ đang chọn; thiếu bản dịch thì rơi về tiếng Việt.
//   · t('khoá', { n: 3 }) thay {n} trong chuỗi.
//   · Chuỗi trong HTML tĩnh đánh dấu bằng data-t / data-t-attr, applyStatic() dịch tại chỗ.
// Đổi ngôn ngữ không nạp lại trang: store.lang đổi → mọi phần giao diện vẽ lại (xem watch trong ui/*.js).

import { VI } from './i18n.vi.js';
import { EN } from './i18n.en.js';
import { CHART_EN } from './chart2026.en.js';
import { MODEL_EN } from './targets/model.en.js';

export const LANGS = [['vi', 'Tiếng Việt'], ['en', 'English']];
const BANG = { vi: VI, en: EN };
const LS = 'elevato-ai-lang';

let lang = 'vi';

/** Ngôn ngữ đã lưu trên máy, hoặc theo ngôn ngữ trình duyệt. */
export function initialLang() {
  try { const l = localStorage.getItem(LS); if (BANG[l]) return l; } catch (e) { /* bỏ qua */ }
  return (navigator.languages || [navigator.language || 'vi']).some((l) => /^vi\b/i.test(l)) ? 'vi' : 'en';
}

export const getLang = () => lang;

/** Đặt ngôn ngữ cho các lần gọi t() sau đó; nhớ vào máy và cập nhật <html lang>. */
export function setLang(l) {
  lang = BANG[l] ? l : 'vi';
  document.documentElement.lang = lang;
  try { localStorage.setItem(LS, lang); } catch (e) { /* bỏ qua */ }
  applyStatic();
  return lang;
}

const dien = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : String(s));

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
/** Nhãn đơn vị tiền theo bội số. */
export const unitLabel = (unit) => t(`unit.${unit === 1 ? '1' : `1e${Math.round(Math.log10(unit))}`}`);

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
