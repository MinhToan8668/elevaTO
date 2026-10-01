// Trạng thái dùng chung của trang. Mỗi lần set tạo đối tượng mới (không sửa tại chỗ),
// các phần giao diện so sánh tham chiếu để biết phần nào cần vẽ lại.

import { buildDataset, checkDataset } from '../core/dataset.js';

export const NOTE_KEYS = ['segments', 'fixedAssets', 'equity', 'debt', 'goodwill', 'params'];
/** Form chi tiết elevaTO chỉ dành cho học viên và giảng viên. */
export const canUseModel = (user) => ['hv', 'gv'].includes(user?.vaitro);
export const ROLE_KEY = { free: 'role.free', hv: 'role.hv', gv: 'role.gv' };

export function initialState() {
  return {
    user: null,          // tài khoản đang đăng nhập: { ten, email, vaitro, luot: { dung, han } }
    jobs: [],            // file đang mở: { id, name, kind: 'pdf'|'img'|'xls', status, error, numPages, types, notes, scanned }
    sources: [],         // dữ liệu đã trích: { id, jobId, kind: 'ext'|'period', ext | period+values, meta? }
    edits: [],           // số sửa tay: { period, key, v }
    ticks: null,         // null = mọi dòng có số; mảng khoá = chỉ các dòng này
    unit: 1e6,
    lang: 'vi',          // app.js đặt lại theo lựa chọn đã lưu; đổi ngôn ngữ làm mọi phần vẽ lại
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
    /**
     * Bộ dữ liệu dựng từ sources + edits, chỉ tính lại khi hai mảng này đổi.
     * Có cả lang vì nhãn chỗ lệch (checkDataset) và lời báo lỗi nguồn đều theo ngôn ngữ.
     */
    data() {
      if (!derived || derived.sources !== state.sources || derived.edits !== state.edits || derived.lang !== state.lang) {
        const { ds, errors, unit } = buildDataset(state.sources, state.edits);
        derived = { sources: state.sources, edits: state.edits, lang: state.lang, ds, errors, checks: checkDataset(ds, { unit }) };
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
