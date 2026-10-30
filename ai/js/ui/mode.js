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
const LS_VIEW = 'elevato-ai-view';
// Nhãn khuôn mà core/grid.js dò để nhận file (không phải câu chữ giao diện — giữ nguyên ở mọi ngôn ngữ).
const GROUP = { BS: 'CĐKT', IS: 'KQKD', CF: 'LCTT' };
const HDR = { ky: 'Ma ky', nhom: 'Nhom', muc: 'Khoan muc', nhan: 'Nhan ky', thang: 'So thang', sheet: 'Luu tru' };

/** Công cụ trên trang chủ → tab ở bước rà soát. 'EXPORT' cuộn tới khối xuất file. */
const TOOL_TAB = { DEAL: 'DEAL', AIR: 'PT', PT: 'PT', CHART: 'CHART', RC: 'PT', Q: 'CHART', EXPORT: null };
const TOOL_NAME = { DEAL: 'hero.f.deal', AIR: 'hero.f.ai', PT: 'hero.f.pt', CHART: 'hero.f.chart', RC: 'hero.f.rc', Q: 'hero.f.q', EXPORT: 'hero.f.xlsx' };

/**
 * Hai màn: 'home' (trang chủ: chọn cách bắt đầu + các công cụ) và 'work' (khu làm việc theo bước).
 * Bấm một công cụ khi chưa có số → vào khu làm việc ở bước tải dữ liệu, nạp xong tự mở đúng tab.
 */
export function initMode(store, ctx) {
  let mode = 'pdf', muon = null;
  try { mode = localStorage.getItem(LS) === 'data' ? 'data' : 'pdf'; } catch (e) { /* bỏ qua */ }
  const coSo = () => store.data().ds.periods.length > 0;
  const setMode = (m) => {
    mode = m;
    document.body.dataset.mode = m;
    try { localStorage.setItem(LS, m); } catch (e) { /* bỏ qua */ }
  };
  // Màn đang xem nhớ theo TAB trình duyệt (sessionStorage): tải lại trang không bị đá về trang chủ.
  const view = (v) => {
    document.body.dataset.view = v;
    try { sessionStorage.setItem(LS_VIEW, v); } catch (e) { /* bỏ qua */ }
    window.scrollTo({ top: 0 });
  };
  const moTool = (k) => {
    if (TOOL_TAB[k]) ctx.openTab?.(TOOL_TAB[k]);
    const el = TOOL_TAB[k] ? $('#s5') : $('#exportBox');
    setTimeout(() => el?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  function go(k) {
    view('work');
    if (k === 'pdf' || k === 'data') { setMode(k); muon = null; }
    else if (coSo()) { muon = null; moTool(k); }
    else { muon = k; setMode('data'); }
    ve();
  }
  function ve() {
    mount($('#dataTpl'), mode === 'data'
      ? h('div', { class: 'tpl' }, h('span', {}, t('mode.tpl.lead')), h('button', { class: 'btn ghost sm', type: 'button', onclick: taiMau }, t('mode.tpl.btn')))
      : null);
    mount($('#goalNote'), muon ? h('p', { class: 'msg warn' }, t('home.need', { f: t(TOOL_NAME[muon]) }),
      ' ', mode === 'data' ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { setMode('pdf'); ve(); } }, t('home.go.pdf')) : null) : null);
  }
  ctx.showWork = () => view('work');
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#homeBtn')?.addEventListener('click', () => view('home'));
  // Có số rồi mà người dùng đang chờ mở một công cụ → mở luôn.
  watch(store, ['sources'], () => { if (muon && coSo()) { const k = muon; muon = null; ve(); moTool(k); } });
  watch(store, ['lang'], ve);
  setMode(mode);
  let dau = 'home';
  try { dau = sessionStorage.getItem(LS_VIEW) === 'work' ? 'work' : 'home'; } catch (e) { /* bỏ qua */ }
  view(dau);
  ve();
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
