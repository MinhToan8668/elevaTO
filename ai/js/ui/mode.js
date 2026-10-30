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

/** Công cụ trên trang chủ → tab đích. PT / DEAL thuộc khu B (Phân tích & M&A), còn lại ở bước rà soát khu A. */
const TOOL_TAB = { DEAL: 'DEAL', AIR: 'PT', PT: 'PT', CHART: 'CHART', RC: 'PT', Q: 'CHART', EXPORT: null };
const TOOL_NAME = { DEAL: 'hero.f.deal', AIR: 'hero.f.ai', PT: 'hero.f.pt', CHART: 'hero.f.chart', RC: 'hero.f.rc', Q: 'hero.f.q', EXPORT: 'hero.f.xlsx' };
const STEPS = ['s2', 's3', 's5', 's6'];

/**
 * Hai màn: 'home' (trang chủ) và 'work' (khu làm việc). Trong khu làm việc MỖI LÚC CHỈ HIỆN MỘT BƯỚC
 * (body[data-step]); thanh bước trên đầu là tab chuyển bước. Làm xong một bước thì tự sang bước kế:
 * thêm PDF → chọn trang; có số → rà soát. Khu B (s6) lấy chung bộ số với khu A.
 */
export function initMode(store, ctx) {
  let mode = 'pdf', muon = null, step = 's2';
  try { mode = localStorage.getItem(LS) === 'data' ? 'data' : 'pdf'; } catch (e) { /* bỏ qua */ }
  const coSo = () => store.data().ds.periods.length > 0;
  const setMode = (m) => {
    mode = m;
    document.body.dataset.mode = m;
    try { localStorage.setItem(LS, m); } catch (e) { /* bỏ qua */ }
  };
  // Màn và bước đang xem nhớ theo TAB trình duyệt (sessionStorage): tải lại trang không bị đá về trang chủ.
  const nho = () => { try { sessionStorage.setItem(LS_VIEW, JSON.stringify({ v: document.body.dataset.view, step })); } catch (e) { /* bỏ qua */ } };
  const view = (v) => { document.body.dataset.view = v; nho(); window.scrollTo({ top: 0 }); };
  const goStep = (st) => {
    if (!STEPS.includes(st)) return;
    if (st === 's3' && mode === 'data') st = 's2';
    step = st;
    document.body.dataset.step = st;
    document.querySelectorAll('.rail a[data-step]').forEach((a) => {
      const on = a.getAttribute('href') === `#${st}`;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    nho();
    window.scrollTo({ top: 0 });
  };
  ctx.goStep = goStep;
  const moTool = (k) => {
    const st = TOOL_TAB[k] ? ctx.openTab?.(TOOL_TAB[k]) : 's5';
    goStep(st || 's5');
    if (k === 'EXPORT') setTimeout(() => $('#exportBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  function go(k) {
    view('work');
    if (k === 'pdf' || k === 'data') { setMode(k); muon = null; goStep(coSo() ? 's5' : 's2'); }
    else if (coSo()) { muon = null; moTool(k); }
    else { muon = k; setMode('data'); goStep('s2'); }
    ve();
  }
  function ve() {
    mount($('#dataTpl'), mode === 'data'
      ? h('div', { class: 'tpl' }, h('span', {}, t('mode.tpl.lead')), h('button', { class: 'btn ghost sm', type: 'button', onclick: taiMau }, t('mode.tpl.btn')))
      : null);
    mount($('#goalNote'), muon ? h('p', { class: 'msg warn' }, t('home.need', { f: t(TOOL_NAME[muon]) }),
      ' ', mode === 'data' ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { setMode('pdf'); ve(); } }, t('home.go.pdf')) : null) : null);
  }
  ctx.showWork = () => { view('work'); goStep('s5'); };
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#homeBtn')?.addEventListener('click', () => view('home'));
  // Thanh bước = tab; nút "Sang bước …" trong trang cũng vậy.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.rail a[data-step], [data-step-go]');
    if (!a) return;
    e.preventDefault();
    goStep(a.dataset.stepGo || a.getAttribute('href').slice(1));
  });
  // Tự sang bước kế: thêm PDF / ảnh → chọn trang; có số và AI đã chạy xong → rà soát (hoặc công cụ đang chờ).
  let soJob = store.get().jobs.length, dangChay = store.get().running;
  watch(store, ['jobs', 'sources', 'running'], (s) => {
    const them = s.jobs.length > soJob, xong = dangChay && !s.running;
    soJob = s.jobs.length; dangChay = s.running;
    if (document.body.dataset.view !== 'work') return;
    if (them && step === 's2' && s.jobs.some((j) => j.kind !== 'xls')) { goStep('s3'); return; }
    if (!coSo() || s.running) return;
    if (muon) { const k = muon; muon = null; ve(); moTool(k); return; }
    if (xong || (step === 's2' && mode === 'data')) goStep('s5');
  });
  watch(store, ['lang'], ve);
  setMode(mode);
  let dau = { v: 'home', step: 's2' };
  try { dau = { ...dau, ...JSON.parse(sessionStorage.getItem(LS_VIEW) || '{}') }; } catch (e) { if (sessionStorage.getItem?.(LS_VIEW) === 'work') dau.v = 'work'; }
  view(dau.v === 'work' ? 'work' : 'home');
  goStep(dau.step);
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
