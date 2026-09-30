// Trạng thái dùng chung của trang. Mỗi lần set tạo đối tượng mới (không sửa tại chỗ),
// các phần giao diện so sánh tham chiếu để biết phần nào cần vẽ lại.

import { buildDataset, checkDataset } from '../core/dataset.js';

export const NOTE_KEYS = ['segments', 'fixedAssets', 'equity', 'debt', 'goodwill', 'params'];
/** Hai loại form: phổ thông (ai cũng dùng) và form riêng elevaTO (học viên / giảng viên). */
export const FORMS = {
  basic: { label: 'Form phổ thông', maxPages: 10, notes: [],
    desc: 'Ba báo cáo chính: Tình hình tài chính, Kết quả kinh doanh, Lưu chuyển tiền tệ. Tự chọn tối đa 10 trang mỗi file, AI tự nhận trang nào là bảng nào. Xuất Form chuẩn hóa 2026.' },
  model: { label: 'Form riêng elevaTO', maxPages: 80, notes: NOTE_KEYS,
    desc: 'Toàn bộ dữ liệu model forecast cần: 3 báo cáo + doanh thu/LN gộp theo mảng, TSCĐ theo nhóm, vốn chủ, vay, lợi thế thương mại, số cổ phiếu. Chọn được cả file. Điền thẳng vào model elevaTO.' },
};

/** Học viên và giảng viên elevaTO mới điền được model. */
export const canUseModel = (user) => ['hv', 'gv'].includes(user?.vaitro);
/** Form đang dùng: tài khoản thường luôn là phổ thông. */
export const formOf = (s) => (s.preset === 'model' && canUseModel(s.user) ? 'model' : 'basic');
export const ROLE_NAME = { free: 'Tài khoản thường', hv: 'Học viên elevaTO', gv: 'Giảng viên elevaTO' };

export function initialState() {
  return {
    user: null,          // tài khoản đang đăng nhập: { ten, email, vaitro, luot: { dung, han } }
    jobs: [],            // file đang mở: { id, name, kind: 'pdf'|'img'|'xls', status, error, numPages, types, notes, scanned }
    sources: [],         // dữ liệu đã trích: { id, jobId, kind: 'ext'|'period', ext | period+values, meta? }
    edits: [],           // số sửa tay: { period, key, v }
    preset: 'model',     // form muốn dùng; tài khoản thường luôn được tính là 'basic' (xem formOf)
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
