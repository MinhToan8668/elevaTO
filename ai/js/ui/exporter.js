// Bước 4 (phần xuất): hai tùy chọn — điền vào model elevaTO (chỉ học viên / giảng viên) hoặc tải Form chuẩn hóa 2026
// (.xlsx trang tự tạo) — và lưu / mở phiên làm việc (.json). File model do người dùng chọn từ máy, trang không giữ bản nào.

import { h, mount, $, toast, download, safeName } from './dom.js';
import { watch, canUseModel } from './store.js';
import { UNITS, allValueKeys } from './review.js';
import { effectiveSegmentMap, effectiveSegmentNames } from './notes.js';
import { serializeSession, parseSession } from '../core/session.js';
import { buildFormXlsx } from '../core/formxlsx.js';
import { fillModelWorkbook } from '../targets/writer.js';
import { openZip, loadJSZip } from '../libs.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_TEMPLATE = 60 * 1024 * 1024;

// Lựa chọn, trạng thái đang điền và kết quả của từng thẻ nằm ngoài lần vẽ: vẽ lại (tick dòng, đổi đơn vị…)
// không làm checkbox quay về mặc định hay mất thông báo kết quả.
const cards = {};
const cardState = (key, options) => (cards[key] ||= { opts: Object.fromEntries(options.map(([k, , def]) => [k, def])), out: h('div'), busy: false });

export function initExporter(store) {
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'running', 'user'], () => render(store));
}

function render(store) {
  const { ds } = store.data();
  const empty = !ds.periods.length;
  mount($('#exportBox'), h('div', { class: 'cards' },
    canUseModel(store.get().user) ? templateCard(store, empty, {
      key: 'model',
      title: 'Điền vào model elevaTO',
      desc: 'Chọn file model elevaTO (.xlsx) của khoá học. Số điền vào sheet 03.Input_FS theo từng năm (triệu đồng); ô công thức và biểu đồ giữ nguyên, Excel tự tính lại khi mở.',
      options: [['clear', 'Xoá số năm cũ không có trong dữ liệu mới (khi đổ công ty khác vào model)', true], ['lastAct', 'Cập nhật năm thực tế cuối (02.Control!C4)', true]],
      fill: async (zip, opts) => {
        const ds = store.data().ds;
        const r = await fillModelWorkbook(zip, ds, {
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
    }) : lockedModelCard(),
    formCard(store, empty),
    sessionCard(store)));
}

function lockedModelCard() {
  return h('div', { class: 'cardx locked' },
    h('span', { class: 'lock-ic', 'aria-hidden': 'true' }, '🔒'),
    h('h3', {}, 'Điền vào model elevaTO'),
    h('p', {}, 'Dành cho học viên và giảng viên elevaTO: đổ số thẳng vào model forecast của khoá học, giữ nguyên công thức và biểu đồ.'),
    h('p', { class: 'fine-l' }, 'Bạn đã học elevaTO? Nhắn elevaTO email đăng ký để được mở quyền.'),
    h('button', { class: 'btn', disabled: true }, 'Chỉ dành cho học viên'));
}

function templateCard(store, empty, cfg) {
  const st = cardState(cfg.key, cfg.options);
  const input = h('input', { type: 'file', accept: '.xlsx,.xlsm', hidden: true });
  const label = st.busy ? 'Đang điền…' : 'Chọn file & điền';
  const btn = h('button', { class: 'btn', disabled: empty || st.busy, onclick: () => input.click() }, label);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_TEMPLATE) return toast('File quá lớn');
    st.busy = true; render(store);
    try {
      const zip = await openZip(await file.arrayBuffer());
      const r = await cfg.fill(zip, st.opts);
      const blob = await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
      const base = file.name.replace(/\.(xlsx|xlsm)$/i, '');
      const ext = /\.xlsm$/i.test(file.name) ? '.xlsm' : '.xlsx';
      download(blob, `${safeName(base)} - ${safeName(store.data().ds.company || cfg.suffix)}${ext}`);
      mount(st.out, h('div', { class: `msg ${r.ok ? 'ok' : 'warn'}`, role: 'status' }, h('ul', {}, r.lines.map((l) => h('li', {}, l)))),
        r.warnings.length ? h('details', { class: 'msg warn' }, h('summary', {}, `${r.warnings.length} lưu ý`), h('ul', {}, r.warnings.map((w) => h('li', {}, w)))) : null);
    } catch (e) {
      mount(st.out, h('p', { class: 'msg err', role: 'alert' }, e.message));
    } finally { st.busy = false; render(store); }
  });
  return h('div', { class: 'cardx' },
    h('h3', {}, cfg.title), h('p', {}, cfg.desc),
    cfg.options.map(([k, text]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.opts[k], onchange: (e) => { st.opts[k] = e.target.checked; } }), h('span', {}, text))),
    input, btn, st.out);
}

function formCard(store, empty) {
  const s = store.get();
  const n = s.ticks ? s.ticks.length : allValueKeys(store).length;
  const unitLabel = (UNITS.find(([v]) => v === s.unit) || [])[1] || 'đồng';
  const btn = h('button', { class: 'btn', disabled: empty || !n, onclick: async () => {
    btn.disabled = true;
    try {
      const JSZip = await loadJSZip();
      const st = store.get();
      const { ds } = store.data();
      const files = buildFormXlsx(ds, { keys: st.ticks ? new Set(st.ticks) : null, unit: st.unit, unitLabel });
      const zip = new JSZip();
      for (const [path, xml] of Object.entries(files)) zip.file(path, xml);
      const blob = await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
      download(blob, `${safeName(ds.company || 'BCTC')} - Form chuan hoa 2026.xlsx`);
    } catch (e) { toast(e.message); }
    finally { btn.disabled = false; }
  } }, 'Tải Form chuẩn hóa 2026 (.xlsx)');
  return h('div', { class: 'cardx' },
    h('h3', {}, 'Form chuẩn hóa 2026'),
    h('p', {}, `File Excel theo mẫu Thông tư 99/2025: trang Tổng quan + ba báo cáo, mỗi kỳ một cột, đơn vị ${unitLabel}. Gồm ${n} dòng đang tick ở bảng trên. BCTC mẫu cũ (năm 2025 trở về trước) đã được quy đổi sang mẫu mới.`),
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
      if (applySession(store, data)) toast(`Đã mở phiên: ${data.sources.length} nguồn dữ liệu.`);
    } catch (e) { toast(e.message); }
  });
  return h('div', { class: 'cardx' },
    h('h3', {}, 'Phiên làm việc (.json)'),
    h('p', {}, 'Lưu toàn bộ số đã trích + số sửa tay ra file .json để làm tiếp lần sau hoặc gửi cho người khác, không tốn thêm lượt AI. File không chứa thông tin đăng nhập.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', style: { flex: '0 0 auto' }, disabled: !store.get().sources.length, onclick: () => {
        const { ds } = store.data();
        download(serializeSession(store.get()), `${safeName(ds.company || 'phien')} - elevaTO AI.json`, 'application/json');
      } }, 'Lưu phiên'),
      h('button', { class: 'btn ghost', style: { flex: '0 0 auto' }, onclick: () => input.click() }, 'Mở phiên')),
    input);
}

/** Mở phiên: thay toàn bộ dữ liệu hiện có (hỏi trước nếu đang có). Trả false nếu không mở. */
export function applySession(store, data) {
  const cur = store.get();
  if (cur.running) { toast('Đang trích xuất — đợi xong rồi mở phiên.'); return false; }
  if (cur.sources.length && !confirm('Mở phiên sẽ thay toàn bộ dữ liệu đang có trên trang (kể cả số sửa tay). Tiếp tục?')) return false;
  const { savedAt, ...rest } = data;
  store.set({
    ...rest,
    sources: data.sources.map((s) => ({ ...s, jobId: undefined })),
    // Số của phiên thay số cũ: file Excel đã đọc bỏ khỏi danh sách, file PDF/ảnh quay về "chưa trích xuất".
    jobs: cur.jobs.filter((j) => j.kind !== 'xls').map((j) => (j.status === 'done' ? { ...j, status: 'ready' } : j)),
  });
  return true;
}
