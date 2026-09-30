// Trạng thái dùng chung của trang. Mỗi lần set tạo đối tượng mới (không sửa tại chỗ),
// các phần giao diện so sánh tham chiếu để biết phần nào cần vẽ lại.

import { buildDataset, checkDataset } from '../core/dataset.js';

export const NOTE_KEYS = ['segments', 'fixedAssets', 'equity', 'debt', 'goodwill', 'params'];
export const PRESETS = {
  dgw: { label: 'Cho model elevaTO (khuyên dùng)', desc: '3 báo cáo + doanh thu/LN gộp theo mảng, TSCĐ theo nhóm, vốn chủ, vay, lợi thế TM, số cổ phiếu', notes: NOTE_KEYS },
  main: { label: 'Chỉ 3 báo cáo chính', desc: 'Nhanh, ít lượt AI nhất. Model vẫn điền được, phần thuyết minh sẽ ước tính', notes: [] },
  custom: { label: 'Tự chọn', desc: 'Tick từng nhóm thuyết minh bên dưới', notes: null },
};

export function initialState() {
  return {
    user: null,          // tài khoản đang đăng nhập: { ten, email, vaitro, luot: { dung, han } }
    jobs: [],            // file đang mở: { id, name, kind: 'pdf'|'img'|'xls', status, error, numPages, types, notes, scanned }
    sources: [],         // dữ liệu đã trích: { id, jobId, kind: 'ext'|'period', ext | period+values, meta? }
    edits: [],           // số sửa tay: { period, key, v }
    preset: 'dgw',
    noteGroups: [...NOTE_KEYS],
    ticks: null,         // null = mọi dòng có số; mảng khoá = chỉ các dòng này
    unit: 1e6,
    segmentMap: {},      // tên mảng trong thuyết minh → ô 0..4 của model
    segmentNames: ['', '', '', '', ''],
    running: false,
  };
}

export function createStore(init) {
  let state = init;
  const subs = new Set();
  let derived = null;
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach((f) => f(state));
    },
    on(f) { subs.add(f); return () => subs.delete(f); },
    /** Bộ dữ liệu dựng từ sources + edits, chỉ tính lại khi hai mảng này đổi. */
    data() {
      if (!derived || derived.sources !== state.sources || derived.edits !== state.edits) {
        const { ds, errors, unit } = buildDataset(state.sources, state.edits);
        derived = { sources: state.sources, edits: state.edits, ds, errors, checks: checkDataset(ds, { unit }) };
      }
      return derived;
    },
  };
}

/** Gọi f mỗi khi một trong các phần state (theo tên) đổi tham chiếu. */
export function watch(store, keys, f) {
  let last = keys.map((k) => store.get()[k]);
  store.on((s) => {
    const now = keys.map((k) => s[k]);
    if (now.some((v, i) => v !== last[i])) { last = now; f(s); }
  });
  f(store.get());
}

let seq = 0;
export const uid = (p = 'id') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
