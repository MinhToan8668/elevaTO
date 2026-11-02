// Giữ file PDF / ảnh đang mở (và các trang đã tick) trong IndexedDB của trình duyệt.
//
// Vì sao: Edge / Chrome cho "ngủ" tab không dùng một lúc — quay lại là trang tải lại từ đầu. Phiên làm
// việc (core/session.js) chỉ lưu số đã trích, còn file gốc nằm trong bộ nhớ (ctx.media) nên mất hẳn:
// file hiện "đã chọn 0 trang", không xem được trang nào, muốn sửa phải tải lại file và tick lại từ đầu.
// File chỉ nằm trên máy người dùng, không gửi đi đâu; bấm "Bỏ" / "Xoá hết" là xoá luôn khỏi đây.

const DB = 'elevato-ai-files', STORE = 'files';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((ok, fail) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    }).catch(() => null);                 // trình duyệt chặn IndexedDB (cửa sổ ẩn danh…) → chỉ là không nhớ được
  }
  return dbp;
}

async function lam(mode, f) {
  const d = await db();
  if (!d) return null;
  return new Promise((ok) => {
    try {
      const tx = d.transaction(STORE, mode);
      const req = f(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req?.result ?? null);
      tx.onerror = tx.onabort = () => ok(null);
    } catch (e) { ok(null); }
  });
}

/** Lưu file gốc lúc vừa mở. files: [File] (PDF: một file; ảnh: cả xấp). */
export const luuFile = (id, kind, name, files) => lam('readwrite', (s) => s.put({ id, kind, name, files, job: null, at: Date.now() }));

/** Ghi lại trạng thái chọn trang của file (gọi mỗi khi job đổi). */
export async function luuJob(job) {
  const cu = await lam('readonly', (s) => s.get(job.id));
  if (!cu) return;
  const { id, name, kind, status, numPages, scanned, types, notes, picked, goiY, rot } = job;
  await lam('readwrite', (s) => s.put({ ...cu, job: { id, name, kind, status, numPages, scanned, types, notes, picked, goiY, rot } }));
}

export const xoaFile = (id) => lam('readwrite', (s) => s.delete(id));
export const xoaHetFile = () => lam('readwrite', (s) => s.clear());
/** Các file đã lưu, theo thứ tự mở. */
export async function docFile() {
  const all = (await lam('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => a.at - b.at);
}
