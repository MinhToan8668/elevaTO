// Hai cách bắt đầu, chọn ở khối giới thiệu đầu trang:
//   'pdf'  — có BCTC PDF / scan / ảnh → AI trích xuất (đủ 3 bước)
//   'data' — đã có số liệu (Excel BCTC có cột Mã số, file FinLens, file mẫu của tool, phiên .json)
//            → bỏ hẳn bước chọn trang & trích xuất, nạp xong là sang phân tích / định giá
// Chế độ chỉ đổi cái người dùng THẤY (body[data-mode], CSS ẩn bước 2); dữ liệu đi chung một đường.
// Kèm nút tải file Excel mẫu dạng sheet "Lưu trữ" (mã TT99, mỗi kỳ một cột) — đọc lại không cần AI.

import { h, mount, $ } from './dom.js';
import { watch } from './store.js';
import { t, chartLabel } from '../i18n.js';
import { CHART } from '../chart2026.js';
import { loadXLSX } from '../libs.js';

const LS = 'elevato-ai-mode';
// Nhãn khuôn mà core/grid.js dò để nhận file (không phải câu chữ giao diện — giữ nguyên ở mọi ngôn ngữ).
const GROUP = { BS: 'CĐKT', IS: 'KQKD', CF: 'LCTT' };
const HDR = { ky: 'Ma ky', nhom: 'Nhom', muc: 'Khoan muc', nhan: 'Nhan ky', thang: 'So thang', sheet: 'Luu tru' };

export function initMode(store) {
  let mode = 'pdf';
  try { mode = localStorage.getItem(LS) === 'data' ? 'data' : 'pdf'; } catch (e) { /* bỏ qua */ }
  const set = (m, cuon) => {
    mode = m;
    document.body.dataset.mode = m;
    try { localStorage.setItem(LS, m); } catch (e) { /* bỏ qua */ }
    ve();
    if (cuon) $('#s2')?.scrollIntoView({ behavior: 'smooth' });
  };
  const the = (m, ic) => h('button', { type: 'button', class: `mode-card${mode === m ? ' on' : ''}`, 'aria-pressed': String(mode === m), onclick: () => set(m, true) },
    h('span', { class: 'mode-ic', 'aria-hidden': 'true' }, ic),
    h('span', { class: 'mode-tx' }, h('b', {}, t(`mode.${m}`)), h('small', {}, t(`mode.${m}.d`))),
    h('span', { class: 'mode-go', 'aria-hidden': 'true' }, '→'));
  function ve() {
    mount($('#modePick'), h('div', { class: 'mode-pick', role: 'group', 'aria-label': t('mode.aria') }, the('pdf', '📄'), the('data', '📊')));
    mount($('#dataTpl'), mode === 'data'
      ? h('div', { class: 'tpl' }, h('span', {}, t('mode.tpl.lead')), h('button', { class: 'btn ghost sm', type: 'button', onclick: taiMau }, t('mode.tpl.btn')))
      : null);
  }
  watch(store, ['lang'], ve);
  set(mode, false);
}

/** File mẫu: sheet "Lưu trữ" đúng khuôn grid.js đọc (Mã kỳ / Nhãn kỳ / Số tháng + dòng [nhóm, mã, tên, số…]). */
export function templateRows(years) {
  const ky = years.map((y) => `FY-${y}`);
  const rows = [
    [t('mode.tpl.title')], [t('mode.tpl.note')], [],
    [HDR.ky, null, null, ...ky],
    [HDR.nhom, 'MS', HDR.muc, ...ky],
    [null, null, HDR.nhan, ...years.map(String)],
    [null, null, HDR.thang, ...years.map(() => 12)],
  ];
  for (const st of ['BS', 'IS', 'CF']) {
    rows.push([]);
    for (const r of CHART) if (r.st === st && r.kind === 'input' && !/^T/.test(r.code)) rows.push([GROUP[st], r.code, chartLabel(`${st}:${r.code}`, r.label)]);
  }
  return rows;
}

async function taiMau() {
  const XLSX = await loadXLSX();
  const y = new Date().getFullYear() - 1;
  const ws = XLSX.utils.aoa_to_sheet(templateRows([y - 3, y - 2, y - 1, y]));
  ws['!cols'] = [{ wch: 7 }, { wch: 7 }, { wch: 52 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, HDR.sheet);
  XLSX.writeFile(wb, 'elevaTO_mau_nhap_so_lieu.xlsx');
}
