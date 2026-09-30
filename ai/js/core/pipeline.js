// Điều phối trích xuất một file BCTC: gọi AI từng bảng (song song), tự chia nhỏ khi quá 60 giây,
// đọc các nhóm thuyết minh được chọn, gom thành một "extraction" cho dataset.addExtraction.
//
// Không phụ thuộc trình duyệt: các việc cụ thể được truyền vào qua `io`:
//   io.parts(pages)  → Promise<[{inlineData}…]>   (cắt trang PDF / ảnh JPEG)
//   io.ai.json({parts, schema}) → Promise<object>  (xem ai.js; ném AIError)
//   io.isSplittable(err), io.isFatal(err)

import { statementTask, NOTE_TASKS } from './prompts.js';
import { statementToValues, noteToModel } from './extract.js';

const STATEMENTS = ['BS', 'IS', 'CF'];

/**
 * @param job { name, types: [...per page], notes: {group: [pages]} }
 * @param opts { noteGroups: [...], onStep(step) }
 */
export async function extractJob(job, io, opts = {}) {
  const warnings = [];
  const step = (s) => opts.onStep?.(s);
  const pagesOf = (t) => job.types.map((x, i) => (x === t ? i + 1 : 0)).filter(Boolean);

  // 1. Ba báo cáo chính, song song. CĐKT xong trước để biết mẫu TT200/TT99 cho KQKD.
  const results = {};
  const runSt = async (st) => {
    const pages = pagesOf(st);
    if (!pages.length) { warnings.push(`Không tìm thấy trang ${NAME[st]} — chỉnh lại ở bước chọn trang nếu file có bảng này.`); return; }
    step({ key: st, state: 'run', label: `${NAME[st]} (trang ${range(pages)})` });
    try {
      results[st] = await statementWithSplit(st, pages, io, step);
      step({ key: st, state: 'done' });
    } catch (e) {
      if (io.isFatal(e)) throw e;
      warnings.push(`${NAME[st]}: ${e.message}`);
      step({ key: st, state: 'fail', error: e.message });
    }
  };
  await Promise.all(STATEMENTS.map(runSt));

  const statements = {}, units = {};
  let bsRegime;
  for (const st of STATEMENTS) {
    if (!results[st]) continue;
    const r = statementToValues(st, results[st], st === 'IS' && bsRegime && !results[st].meta?.thong_tu ? { regime: bsRegime } : {});
    if (st === 'BS') bsRegime = r.regime;
    statements[st] = { cur: r.cur, prev: r.prev };
    units[st] = r.unit;
    warnings.push(...r.warnings.map((w) => `${NAME[st]}: ${w}`));
    if (r.unmapped.length) warnings.push(`${NAME[st]}: mã không quy đổi được sang mẫu 2026: ${r.unmapped.map((k) => k.split(':')[1]).join(', ')}`);
  }
  const meta0 = (results.BS || results.IS || results.CF || {}).meta || {};
  const flowMeta = (results.IS || results.CF || {}).meta || {};
  const meta = { ngay_ket_thuc: meta0.ngay_ket_thuc || flowMeta.ngay_ket_thuc, so_thang: flowMeta.so_thang || meta0.so_thang };

  // 2. Thuyết minh được chọn (tuần tự từng nhóm, mỗi nhóm một lượt gọi).
  const notes = {};
  for (const g of opts.noteGroups || []) {
    const task = NOTE_TASKS[g];
    // exact: người dùng đã tick đúng trang → không tự gửi kèm trang kế tiếp.
    const pages = opts.exact ? [...(job.notes?.[g] || [])].sort((a, b) => a - b).slice(0, 8) : withNext(job.notes?.[g] || [], job.types.length);
    if (!task) continue;
    if (!pages.length) { warnings.push(`Không tìm thấy trang thuyết minh "${task.label}".`); continue; }
    step({ key: g, state: 'run', label: `${task.label} (trang ${range(pages)})` });
    try {
      const res = await io.ai.json({ parts: [...await io.parts(pages), { text: task.prompt }], schema: task.schema });
      const m = noteToModel(g, res);
      if (g === 'params') Object.assign(notes, m); else notes[g] = m;
      step({ key: g, state: 'done' });
    } catch (e) {
      if (io.isFatal(e)) throw e;
      warnings.push(`${task.label}: ${e.message}`);
      step({ key: g, state: 'fail', error: e.message });
    }
  }
  return { file: job.name, company: meta0.ten_cong_ty || '', meta, statements, units, notes, warnings, pages: Object.fromEntries(STATEMENTS.map((s) => [s, pagesOf(s)])) };
}

const NAME = { BS: 'Tình hình tài chính', IS: 'Kết quả kinh doanh', CF: 'Lưu chuyển tiền tệ' };

/** Gọi AI một bảng; quá 60 giây / bị cắt → CĐKT chia tài sản / nguồn vốn, bảng khác chia đôi số trang. */
async function statementWithSplit(st, pages, io, step) {
  const once = async (pg, part) => io.ai.json({ parts: [...await io.parts(pg), { text: statementTask(st, part).prompt }], schema: statementTask(st, part).schema });
  try {
    return await once(pages, 'all');
  } catch (e) {
    if (!io.isSplittable(e)) throw e;
    step({ key: st, state: 'split' });
    if (st === 'BS') {
      const [a, b] = await Promise.all([once(pages, 'assets'), once(pages, 'sources')]);
      return { meta: { ...b.meta, ...a.meta }, items: [...(a.items || []), ...(b.items || [])] };
    }
    if (pages.length < 2) throw e;
    const half = Math.ceil(pages.length / 2);
    const [a, b] = await Promise.all([once(pages.slice(0, half), 'all'), once(pages.slice(half), 'all')]);
    return { meta: { ...b.meta, ...a.meta }, items: [...(a.items || []), ...(b.items || [])] };
  }
}

// Bảng thuyết minh hay tràn sang trang sau → gửi kèm 1 trang kế tiếp.
function withNext(pages, total) {
  const s = new Set();
  for (const p of pages) { s.add(p); if (p < total) s.add(p + 1); }
  return [...s].sort((a, b) => a - b).slice(0, 8);
}
const range = (pages) => (pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0]));

/**
 * Bản scan (không có chữ): nhờ AI xem ảnh nhỏ từng nhóm trang để biết trang nào là bảng nào.
 * io.images(pages) → [{inlineData: image/jpeg}…]
 * @returns { types, notes } cùng dạng classifyPages
 */
export async function mapPagesWithAI(total, io, { batch = 12, onStep } = {}) {
  const { pageMapTask } = await import('./prompts.js');
  const types = Array(total).fill('OTHER');
  const notes = Object.fromEntries(Object.keys(NOTE_TASKS).map((k) => [k, []]));
  for (let start = 1; start <= total; start += batch) {
    const pages = Array.from({ length: Math.min(batch, total - start + 1) }, (_, i) => start + i);
    onStep?.({ key: 'map', state: 'run', label: `Nhận diện trang ${start}–${pages[pages.length - 1]} / ${total}` });
    const task = pageMapTask(start);
    const res = await io.ai.json({ parts: [...await io.images(pages), { text: task.prompt }], schema: task.schema });
    for (const r of Array.isArray(res) ? res : []) {
      const i = Number(r.trang) - 1;
      if (!(i >= start - 1 && i < start - 1 + pages.length)) continue;          // AI đánh số sai → bỏ
      if (['BS', 'IS', 'CF', 'NOTES', 'OTHER'].includes(r.loai)) types[i] = r.loai;
      for (const g of Array.isArray(r.nhom) ? r.nhom : []) if (Object.hasOwn(notes, g) && types[i] === 'NOTES') notes[g].push(i + 1);
    }
  }
  onStep?.({ key: 'map', state: 'done' });
  return { types, notes, scanned: true };
}

const KNOWN = ['BS', 'IS', 'CF', 'NOTES'];

/**
 * Chuẩn bị trích xuất theo các trang người dùng đã tick.
 *  - Trang máy đã biết loại (PDF có chữ) giữ nguyên, không tốn lượt AI.
 *  - Trang chưa rõ (bản scan, ảnh, trang "khác") → nhờ AI xem ảnh nhỏ để biết thuộc bảng nào / thuyết minh nào.
 *  - Trang không tick → OTHER (không gửi AI).
 * @param job { numPages, types, notes }   (types/notes từ classifyPages hoặc chỉnh tay)
 * @param picked [số trang]
 * @param io { images(pages), ai }
 * @returns { types, notes, aiCalls }
 */
export async function planPicked(job, picked, io, { batch = 12, onStep } = {}) {
  const n = job.numPages || job.types.length;
  const sel = [...new Set(picked)].filter((p) => p >= 1 && p <= n).sort((a, b) => a - b);
  const types = Array(n).fill('OTHER');
  const notes = Object.fromEntries(Object.keys(NOTE_TASKS).map((k) => [k, []]));
  const unknown = [];
  for (const p of sel) {
    const t = job.types?.[p - 1];
    if (KNOWN.includes(t)) types[p - 1] = t; else unknown.push(p);
  }
  for (const [g, pages] of Object.entries(job.notes || {})) {
    if (!Object.hasOwn(notes, g)) continue;
    for (const p of pages || []) if (types[p - 1] === 'NOTES') notes[g].push(p);
  }
  let aiCalls = 0;
  if (unknown.length) {
    const { pageMapTask } = await import('./prompts.js');
    for (let i = 0; i < unknown.length; i += batch) {
      const chunk = unknown.slice(i, i + batch);
      onStep?.({ key: 'map', state: 'run', label: `AI nhận diện ${chunk.length} trang (${range(chunk)})` });
      const task = pageMapTask(chunk);
      const res = await io.ai.json({ parts: [...await io.images(chunk), { text: task.prompt }], schema: task.schema });
      aiCalls++;
      for (const r of Array.isArray(res) ? res : []) {
        const p = Number(r.trang);
        if (!chunk.includes(p) || !KNOWN.concat('OTHER').includes(r.loai)) continue;   // AI đánh số sai → bỏ
        types[p - 1] = r.loai;
        if (r.loai === 'NOTES') for (const g of Array.isArray(r.nhom) ? r.nhom : []) if (Object.hasOwn(notes, g) && !notes[g].includes(p)) notes[g].push(p);
      }
    }
    onStep?.({ key: 'map', state: 'done' });
  }
  for (const g of Object.keys(notes)) notes[g].sort((a, b) => a - b);
  return { types, notes, aiCalls };
}

/** Trang tick sẵn khi vừa mở file (người dùng xem lại và sửa). */
export function suggestPicks(job) {
  const n = job.types?.length || 0;
  if (job.kind === 'img') return Array.from({ length: n }, (_, i) => i + 1);
  if (job.scanned) return [];
  const set = new Set();
  job.types.forEach((t, i) => { if (['BS', 'IS', 'CF'].includes(t)) set.add(i + 1); });
  for (const pages of Object.values(job.notes || {})) for (const p of pages || []) if (job.types[p - 1] === 'NOTES') set.add(p);
  return [...set].sort((a, b) => a - b);
}
