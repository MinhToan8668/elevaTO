// Bước 5 (phần xuất): điền model elevaTO (mẫu DGW), điền Form nội bộ 2026, bảng chuẩn hoá các dòng đã tick,
// lưu / mở phiên làm việc. File model / form do người dùng chọn từ máy — trang không giữ bản nào.

import { h, mount, $, toast, download, safeName } from './dom.js';
import { watch } from './store.js';
import { UNITS, allValueKeys } from './review.js';
import { effectiveSegmentMap, effectiveSegmentNames } from './notes.js';
import { tableAOA } from '../core/table.js';
import { serializeSession, parseSession } from '../core/session.js';
import { fillDGWWorkbook, fillForm2026Workbook } from '../targets/writer.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_TEMPLATE = 60 * 1024 * 1024;

export function initExporter(store) {
  watch(store, ['sources', 'edits', 'ticks', 'unit'], () => render(store));
}

function render(store) {
  const { ds } = store.data();
  const empty = !ds.periods.length;
  mount($('#exportBox'), h('div', { class: 'cards' },
    templateCard(store, empty, {
      title: 'Điền vào model elevaTO (mẫu DGW)',
      desc: 'Chọn file model .xlsx của bạn. Số điền vào sheet 03.Input_FS theo từng năm (triệu đồng), ô công thức và biểu đồ giữ nguyên. Excel tự tính lại khi mở.',
      options: [['clear', 'Xoá số năm cũ không có trong dữ liệu mới (khi đổ công ty khác vào model mẫu)', true], ['lastAct', 'Cập nhật năm thực tế cuối (02.Control!C4)', true]],
      fill: async (zip, opts) => {
        const r = await fillDGWWorkbook(zip, ds, {
          segmentMap: effectiveSegmentMap(ds, store.get().segmentMap).map,
          segmentNames: effectiveSegmentNames(ds, store.get().segmentMap, store.get().segmentNames),
          clearOtherYears: opts.clear, updateLastAct: opts.lastAct,
        });
        const lines = [`Đã điền năm: ${r.written.join(', ') || 'không năm nào'}`];
        if (r.cleared.length) lines.push(`Đã xoá số cũ năm: ${r.cleared.join(', ')}`);
        if (r.missingYears.length) lines.push(`Model không có cột cho năm: ${r.missingYears.join(', ')} — đổi năm đầu ở 02.Control rồi điền lại`);
        if (r.skipped.length) lines.push(`${r.skipped.length} ô là công thức nên giữ nguyên (${r.skipped.slice(0, 5).join(', ')}${r.skipped.length > 5 ? '…' : ''})`);
        return { ok: r.written.length > 0, lines, warnings: r.warnings };
      },
      suffix: 'model',
    }),
    templateCard(store, empty, {
      title: 'Điền Form nội bộ 2026',
      desc: 'Chọn file Form_noi_bo_2026 .xlsx. Mỗi kỳ ghi vào một cột của sheet "Lưu trữ" (đồng), trang F1 chuyển sang 4 kỳ gần nhất.',
      options: [],
      fill: async (zip) => {
        const r = await fillForm2026Workbook(zip, ds);
        const lines = [`Đã ghi ${ds.periods.length} kỳ × ${r.rows} dòng chỉ tiêu`];
        if (r.unplaced.length) lines.push(`Hết cột trống, chưa ghi: ${r.unplaced.join(', ')}`);
        if (r.skipped.length) lines.push(`${r.skipped.length} ô là công thức nên giữ nguyên`);
        return { ok: true, lines, warnings: [] };
      },
      suffix: 'form 2026',
    }),
    tableCard(store, empty),
    sessionCard(store)));
}

function templateCard(store, empty, cfg) {
  const input = h('input', { type: 'file', accept: '.xlsx,.xlsm', hidden: true });
  const opts = Object.fromEntries(cfg.options.map(([k, , def]) => [k, def]));
  const out = h('div');
  const btn = h('button', { class: 'btn', disabled: empty, onclick: () => input.click() }, 'Chọn file & điền');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_TEMPLATE) return toast('File quá lớn');
    if (!window.JSZip) return toast('Chưa tải được thư viện JSZip — kiểm tra mạng rồi tải lại trang');
    btn.disabled = true; btn.textContent = 'Đang điền…';
    try {
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const r = await cfg.fill(zip, opts);
      const blob = await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
      const base = file.name.replace(/\.(xlsx|xlsm)$/i, '');
      const ext = /\.xlsm$/i.test(file.name) ? '.xlsm' : '.xlsx';
      download(blob, `${safeName(base)} - ${safeName(store.data().ds.company || cfg.suffix)}${ext}`);
      mount(out, h('div', { class: `msg ${r.ok ? 'ok' : 'warn'}` }, h('ul', {}, r.lines.map((l) => h('li', {}, l)))),
        r.warnings.length ? h('details', { class: 'msg warn' }, h('summary', {}, `${r.warnings.length} lưu ý`), h('ul', {}, r.warnings.map((w) => h('li', {}, w)))) : null);
    } catch (e) {
      mount(out, h('p', { class: 'msg err' }, e.message));
    } finally { btn.disabled = empty; btn.textContent = 'Chọn file & điền'; }
  });
  return h('div', { class: 'cardx' },
    h('h3', {}, cfg.title), h('p', {}, cfg.desc),
    cfg.options.map(([k, label, def]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: def, onchange: (e) => { opts[k] = e.target.checked; } }), h('span', {}, label))),
    input, btn, out);
}

function tableCard(store, empty) {
  const s = store.get();
  const n = s.ticks ? s.ticks.length : allValueKeys(store).length;
  const btn = h('button', { class: 'btn', disabled: empty || !n, onclick: () => {
    if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng rồi tải lại trang');
    const { ds } = store.data();
    const unitLabel = (UNITS.find(([v]) => v === s.unit) || [])[1] || 'đồng';
    const aoa = tableAOA(ds, { keys: s.ticks ? new Set(s.ticks) : null, unit: s.unit, unitLabel });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 8 }, { wch: 54 }, ...ds.periods.map(() => ({ wch: 18 }))];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'BCTC mau 2026');
    const bytes = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    download(new Blob([bytes], { type: XLSX_MIME }), `${safeName(ds.company || 'BCTC')} - mau 2026.xlsx`);
  } }, 'Tải bảng .xlsx');
  return h('div', { class: 'cardx' },
    h('h3', {}, 'Bảng chuẩn hoá mẫu 2026'),
    h('p', {}, `${n} dòng đang được tick, mỗi kỳ một cột, đơn vị theo ô chọn ở trên. Dùng để dán vào model riêng của bạn.`),
    btn);
}

function sessionCard(store) {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) return toast('File phiên quá lớn');
    try {
      const data = parseSession(await f.text());
      applySession(store, data);
      toast(`Đã mở phiên: ${data.sources.length} nguồn dữ liệu.`);
    } catch (e) { toast(e.message); }
  });
  return h('div', { class: 'cardx' },
    h('h3', {}, 'Phiên làm việc'),
    h('p', {}, 'Lưu toàn bộ số đã trích + số sửa tay ra file .json để làm tiếp lần sau hoặc gửi cho người khác, không tốn thêm lượt AI. File không chứa mã truy cập.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', style: { flex: '0 0 auto' }, disabled: !store.get().sources.length, onclick: () => {
        const { ds } = store.data();
        download(serializeSession(store.get()), `${safeName(ds.company || 'phien')} - elevaTO AI.json`, 'application/json');
      } }, 'Lưu phiên'),
      h('button', { class: 'btn ghost', style: { flex: '0 0 auto' }, onclick: () => input.click() }, 'Mở phiên')),
    input);
}

export function applySession(store, data) {
  const { savedAt, ...rest } = data;
  store.set({ ...rest, sources: data.sources.map((s) => ({ ...s, jobId: undefined })) });
}
