// Bước 3 (phần xuất): hai file Excel tải thẳng về máy — không cần đưa file mẫu nào vào.
//   · Form chuẩn hóa 2026 — ba báo cáo chính, mọi tài khoản.
//   · Form chi tiết elevaTO — thêm thuyết minh model forecast cần, chỉ học viên / giảng viên.

import { h, mount, $, toast, download, safeName } from './dom.js';
import { watch, canUseModel } from './store.js';
import { unitOptions, allValueKeys } from './review.js';
import { effectiveSegmentMap, effectiveSegmentNames } from './notes.js';
import { buildFormXlsx } from '../core/formxlsx.js';
import { buildModelXlsx } from '../core/modelxlsx.js';
import { loadJSZip } from '../libs.js';
import { t, unitLabel } from '../i18n.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Đơn vị hiển thị trong file Excel — chọn riêng, không đụng số gốc (luôn lưu bằng đồng).
const ui = { unit: 1e6 };

export function initExporter(store) {
  watch(store, ['sources', 'edits', 'ticks', 'unit', 'running', 'user', 'lang'], () => render(store));
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
    h('span', {}, t('ex.unit')),
    h('select', { class: 'inp', onchange: (e) => { ui.unit = Number(e.target.value); render(store); } },
      unitOptions().map(([v, l]) => h('option', { value: String(v), selected: ui.unit === v }, l))));
}

/** Nút tải: dựng file trong trình duyệt rồi tải về. */
function taiBtn(label, empty, lam) {
  const btn = h('button', { class: 'btn', disabled: empty, onclick: async () => {
    btn.disabled = true;
    const cu = btn.textContent;
    btn.textContent = t('ex.making');
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
    h('h3', {}, t('ex.form.h')),
    h('p', {}, t('ex.form.lead', { n })),
    unitPicker(store),
    taiBtn(t('ex.form.btn'), empty || !n, async () => {
      const st = store.get(), { ds } = store.data();
      return {
        files: buildFormXlsx(ds, { keys: st.ticks ? new Set(st.ticks) : null, unit: ui.unit, unitLabel: unitLabel(ui.unit) }),
        name: `${safeName(ds.company || 'BCTC')} - ${safeName(t('ex.form.file'))}.xlsx`,
      };
    }));
}

function modelCard(store, empty) {
  return h('div', { class: 'cardx em-card' },
    h('h3', {}, t('ex.model.h'), h('span', { class: 'tag em' }, t('ex.model.tag'))),
    h('p', {}, t('ex.model.lead')),
    unitPicker(store),
    taiBtn(t('ex.model.btn'), empty, async () => {
      const st = store.get(), { ds } = store.data();
      return {
        files: buildModelXlsx(ds, {
          unit: ui.unit, unitLabel: unitLabel(ui.unit),
          segmentMap: effectiveSegmentMap(ds, st.segmentMap).map,
          segmentNames: effectiveSegmentNames(ds, st.segmentMap, st.segmentNames),
        }),
        name: `${safeName(ds.company || 'BCTC')} - ${safeName(t('ex.model.file'))}.xlsx`,
      };
    }));
}

function lockedCard() {
  return h('div', { class: 'cardx locked' },
    h('span', { class: 'lock-ic', 'aria-hidden': 'true' }, '🔒'),
    h('h3', {}, t('ex.model.h')),
    h('p', {}, t('ex.lock.lead')),
    h('p', { class: 'fine-l' }, t('ex.lock.fine')),
    h('button', { class: 'btn', disabled: true }, t('ex.lock.btn')));
}

/** Mở lại phiên đã lưu (tự lưu theo tài khoản). Trả false nếu không mở. */
export function applySession(store, data) {
  const cur = store.get();
  if (cur.running) { toast(t('ex.busy')); return false; }
  if (cur.sources.length && !confirm(t('ex.replaceAsk'))) return false;
  const { savedAt, ...rest } = data;
  store.set({
    ...rest,
    sources: data.sources.map((s) => ({ ...s, jobId: undefined })),
    jobs: cur.jobs.filter((j) => j.kind !== 'xls').map((j) => (j.status === 'done' ? { ...j, status: 'ready' } : j)),
  });
  return true;
}
