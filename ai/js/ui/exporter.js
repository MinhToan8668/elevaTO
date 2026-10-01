// Bước 3 (phần xuất): hai file Excel tải thẳng về máy — không cần đưa file mẫu nào vào.
//   · Form chuẩn hóa 2026 — ba báo cáo chính, mọi tài khoản.
//   · Form chi tiết elevaTO — thêm thuyết minh model forecast cần, chỉ học viên / giảng viên.

import { h, mount, $, toast, download, safeName } from './dom.js';
import { watch, canUseModel } from './store.js';
import { UNITS, allValueKeys } from './review.js';
import { effectiveSegmentMap, effectiveSegmentNames } from './notes.js';
import { buildFormXlsx } from '../core/formxlsx.js';
import { buildModelXlsx } from '../core/modelxlsx.js';
import { loadJSZip } from '../libs.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Đơn vị hiển thị trong file Excel — chọn riêng, không đụng số gốc (luôn lưu bằng đồng).
const ui = { unit: 1e6 };

export function initExporter(store) {
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'running', 'user'], () => render(store));
}

function render(store) {
  const { ds } = store.data();
  const empty = !ds.periods.length;
  mount($('#exportBox'), h('div', { class: 'cards' },
    formCard(store, empty),
    canUseModel(store.get().user) ? modelCard(store, empty) : lockedCard()));
}

/** Chọn đơn vị ghi trong file Excel. */
function unitPicker(store) {
  return h('label', { class: 'chk unit-pick' },
    h('span', {}, 'Đơn vị trong file:'),
    h('select', { class: 'inp', onchange: (e) => { ui.unit = Number(e.target.value); render(store); } },
      UNITS.map(([v, l]) => h('option', { value: String(v), selected: ui.unit === v }, l))));
}

const unitLabel = () => (UNITS.find(([v]) => v === ui.unit) || [])[1] || 'đồng';

/** Nút tải: dựng file trong trình duyệt rồi tải về. */
function taiBtn(label, empty, lam) {
  const btn = h('button', { class: 'btn', disabled: empty, onclick: async () => {
    btn.disabled = true;
    const cu = btn.textContent;
    btn.textContent = 'Đang tạo file…';
    try {
      const { files, name } = await lam();
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      for (const [path, xml] of Object.entries(files)) zip.file(path, xml);
      download(await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' }), name);
    } catch (e) { toast(e.message); }
    finally { btn.disabled = false; btn.textContent = cu; }
  } }, label);
  return btn;
}

function formCard(store, empty) {
  const s = store.get();
  const n = s.ticks ? s.ticks.length : allValueKeys(store).length;
  return h('div', { class: 'cardx' },
    h('h3', {}, 'Form chuẩn hóa 2026'),
    h('p', {}, `Ba báo cáo chính theo mẫu Thông tư 99/2025, mỗi kỳ một cột. Dòng tổng là công thức Excel, cuối mỗi báo cáo có dòng kiểm tra cân đối, ô lệch tô đỏ. ${n} dòng đang tick ở bảng trên.`),
    unitPicker(store),
    taiBtn('Tải Form chuẩn hóa 2026 (.xlsx)', empty || !n, async () => {
      const st = store.get(), { ds } = store.data();
      return {
        files: buildFormXlsx(ds, { keys: st.ticks ? new Set(st.ticks) : null, unit: ui.unit, unitLabel: unitLabel() }),
        name: `${safeName(ds.company || 'BCTC')} - Form chuan hoa 2026.xlsx`,
      };
    }));
}

function modelCard(store, empty) {
  return h('div', { class: 'cardx em-card' },
    h('h3', {}, 'Form chi tiết elevaTO', h('span', { class: 'tag em' }, 'Học viên · Giảng viên')),
    h('p', {}, 'Đủ dữ liệu model forecast cần: ba báo cáo đã quy về dòng của model, cộng doanh thu/LN gộp theo mảng, TSCĐ theo nhóm, biến động vốn chủ, vay — mỗi năm một cột, kèm số dòng tương ứng ở sheet 03.Input_FS.'),
    unitPicker(store),
    taiBtn('Tải Form chi tiết elevaTO (.xlsx)', empty, async () => {
      const st = store.get(), { ds } = store.data();
      return {
        files: buildModelXlsx(ds, {
          unit: ui.unit, unitLabel: unitLabel(),
          segmentMap: effectiveSegmentMap(ds, st.segmentMap).map,
          segmentNames: effectiveSegmentNames(ds, st.segmentMap, st.segmentNames),
        }),
        name: `${safeName(ds.company || 'BCTC')} - Form chi tiet elevaTO.xlsx`,
      };
    }));
}

function lockedCard() {
  return h('div', { class: 'cardx locked' },
    h('span', { class: 'lock-ic', 'aria-hidden': 'true' }, '🔒'),
    h('h3', {}, 'Form chi tiết elevaTO'),
    h('p', {}, 'Thêm thuyết minh mà model forecast cần: doanh thu theo mảng, TSCĐ theo nhóm, biến động vốn chủ, vay.'),
    h('p', { class: 'fine-l' }, 'Dành cho học viên và giảng viên elevaTO — nhắn elevaTO email đăng ký để được mở quyền.'),
    h('button', { class: 'btn', disabled: true }, 'Chỉ dành cho học viên'));
}

/** Mở lại phiên đã lưu (tự lưu theo tài khoản). Trả false nếu không mở. */
export function applySession(store, data) {
  const cur = store.get();
  if (cur.running) { toast('Đang trích xuất — đợi xong rồi mở phiên.'); return false; }
  if (cur.sources.length && !confirm('Mở phiên sẽ thay toàn bộ dữ liệu đang có trên trang (kể cả số sửa tay). Tiếp tục?')) return false;
  const { savedAt, ...rest } = data;
  store.set({
    ...rest,
    sources: data.sources.map((s) => ({ ...s, jobId: undefined })),
    jobs: cur.jobs.filter((j) => j.kind !== 'xls').map((j) => (j.status === 'done' ? { ...j, status: 'ready' } : j)),
  });
  return true;
}
