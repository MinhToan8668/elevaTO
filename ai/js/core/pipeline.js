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
 * @param job { name, types: [...per page], notes: {group: [pages]}, shared?: [pages] }
 *   shared: trang chưa rõ loại → gửi kèm cho cả ba bảng, AI tự tìm bảng cần đọc trong đó.
 * @param opts { noteGroups: [...], onStep(step) }
 */
export async function extractJob(job, io, opts = {}) {
  const warnings = [];
  const step = (s) => opts.onStep?.(s);
  const pagesOf = (t) => job.types.map((x, i) => (x === t ? i + 1 : 0)).filter(Boolean);
  const shared = job.shared || [];
  const pagesFor = (t) => [...new Set([...pagesOf(t), ...shared])].sort((a, b) => a - b);

  // 1. Ba báo cáo chính, song song. CĐKT xong trước để biết mẫu TT200/TT99 cho KQKD.
  const results = {};
  const trong = [];                       // bảng AI xem mà không thấy — để đoán xem các trang đó thật ra là gì
  let goiY = '';                          // lời chỉ dẫn khi không đọc nổi bảng nào (giao diện hiện thay lỗi khô khan)
  const runSt = async (st) => {
    const pages = pagesFor(st);
    if (!pages.length) { warnings.push(`Không tìm thấy trang ${NAME[st]} — chỉnh lại ở bước chọn trang nếu file có bảng này.`); return; }
    step({ key: st, state: 'run', label: `${NAME[st]} (trang ${list(pages)})` });
    try {
      let res = await statementWithSplit(st, pages, io, step);
      // Đọc ra rỗng: có thể do dạng file gửi đi (PDF scan, hoặc PDF có lớp chữ rác) chứ không phải
      // trang sai. Gửi lại đúng trang đó dưới dạng ảnh — tốn thêm 1 lượt, chỉ khi đã hỏng sẵn.
      if (!(res?.items || []).length) {
        step({ key: st, state: 'run', label: `${NAME[st]} — gửi lại bằng ảnh trang ${list(pages)}` });
        const ioAnh = { ...io, parts: (p) => io.parts(p, { anh: true }) };
        const lai = await statementWithSplit(st, pages, ioAnh, step).catch(() => null);
        if ((lai?.items || []).length) {
          warnings.push(`${NAME[st]}: đọc thẳng file không ra số nên đã gửi lại bằng ảnh trang.`);
          res = lai;
        }
      }
      if (!(res?.items || []).length) {
        trong.push(st);
        warnings.push(`${NAME[st]}: không thấy bảng này trong các trang đã chọn (trang ${list(pages)}).`);
        step({ key: st, state: 'fail', error: 'không thấy bảng trong các trang đã chọn' });
        return;
      }
      results[st] = res;
      step({ key: st, state: 'done' });
    } catch (e) {
      if (io.isFatal(e)) throw e;
      warnings.push(`${NAME[st]}: ${e.message}`);
      step({ key: st, state: 'fail', error: e.message });
    }
  };
  await Promise.all(STATEMENTS.map(runSt));

  // Không đọc được bảng nào: thường là tick nhầm trang. Tốn thêm 1 lượt hỏi AI các trang đó là gì,
  // rồi chỉ luôn trang nào có bảng — đỡ hơn nhiều so với bắt người dùng tự dò trong file mấy chục trang.
  if (trong.length === STATEMENTS.length && io.images) {
    const xem = [...new Set([...shared, ...STATEMENTS.flatMap(pagesOf)])].sort((a, b) => a - b).slice(0, 12);
    if (xem.length) {
      step({ key: 'doan', state: 'run', label: `Xem lại trang ${list(xem)} là trang gì` });
      try {
        const { pageMapTask } = await import('./prompts.js');
        const task = pageMapTask(xem);
        const res = await io.ai.json({ parts: [...await io.images(xem), { text: task.prompt }], schema: task.schema });
        goiY = moTaTrang(Array.isArray(res) ? res : [], xem);
        warnings.push(goiY);
        step({ key: 'doan', state: 'done' });
      } catch (e) {
        step({ key: 'doan', state: 'fail', error: e.message });
      }
    }
  }

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
    const all = opts.exact ? [...(job.notes?.[g] || [])].sort((a, b) => a - b) : null;
    const pages = opts.exact ? all.slice(0, MAX_NOTE_PAGES) : withNext(job.notes?.[g] || [], job.types.length);
    if (!task) continue;
    if (all && all.length > MAX_NOTE_PAGES) warnings.push(`${task.label}: chỉ đọc ${MAX_NOTE_PAGES} trang đầu, bỏ trang ${list(all.slice(MAX_NOTE_PAGES))} — bỏ tick bớt trang không cần.`);
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
  return { file: job.name, company: meta0.ten_cong_ty || '', meta, statements, units, notes, warnings, goiY,
    pages: Object.fromEntries(STATEMENTS.map((s) => [s, pagesOf(s)])) };
}

const NAME = { BS: 'Tình hình tài chính', IS: 'Kết quả kinh doanh', CF: 'Lưu chuyển tiền tệ' };
const TEN_TRANG = { ...NAME, NOTES: 'Thuyết minh', OTHER: 'bìa / mục lục / báo cáo kiểm toán' };

/** Lời nhắn: các trang đã tick thật ra là trang gì, và nên tick lại trang nào. */
function moTaTrang(ds, xem) {
  const co = new Map();
  for (const r of ds) { const p = Number(r.trang); if (xem.includes(p) && TEN_TRANG[r.loai]) co.set(p, r.loai); }
  if (!co.size) return `AI xem trang ${list(xem)} nhưng không nhận ra trang nào là báo cáo tài chính. Mở xem trang lớn ở bước 2 để tick đúng trang có bảng số, hoặc kiểm tra xem bản scan có bị mờ quá không.`;
  const gom = (loai) => [...co.entries()].filter(([, t]) => t === loai).map(([p]) => p).sort((a, b) => a - b);
  const dong = Object.keys(TEN_TRANG).map((t) => { const p = gom(t); return p.length ? `trang ${list(p)}: ${TEN_TRANG[t]}` : ''; }).filter(Boolean);
  const bang = STATEMENTS.flatMap(gom);
  return `Các trang đã tick thật ra là — ${dong.join('; ')}.` +
    (bang.length ? ` Tick lại đúng trang có bảng rồi trích xuất lại.` : ` Ba báo cáo chính nằm ở trang khác — mở xem trang lớn ở bước 2 để tìm và tick lại.`);
}

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
/** [1,2,3,7,9,10] → "1–3, 7, 9–10" */
const list = (pages) => {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    let k = i;
    while (k + 1 < pages.length && pages[k + 1] === pages[k] + 1) k++;
    out.push(k > i ? `${pages[i]}–${pages[k]}` : String(pages[i]));
    i = k;
  }
  return out.join(', ');
};
const MAX_TRANG = 200;                 // chặn trên số trang một file gửi cho AI (giao diện còn giới hạn chặt hơn theo form)
const MAX_NOTE_PAGES = 8;              // một nhóm thuyết minh đọc tối đa bấy nhiêu trang trong một lượt

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
 * @returns { types, notes, aiCalls, warnings }
 */
export async function planPicked(job, picked, io, { batch = 12, onStep, notes: wantNotes = true } = {}) {
  const n = Math.min(job.numPages || job.types.length, MAX_TRANG);
  const sel = [...new Set(picked)].filter((p) => p >= 1 && p <= n).sort((a, b) => a - b).slice(0, MAX_TRANG);
  const types = Array(n).fill('OTHER');
  const notes = Object.fromEntries(Object.keys(NOTE_TASKS).map((k) => [k, []]));
  const grouped = new Set();
  for (const [g, pages] of Object.entries(job.notes || {})) if (Object.hasOwn(notes, g)) for (const p of pages || []) grouped.add(p);
  const unknown = [];
  for (const p of sel) {
    if (needsMap(job, p, grouped)) { unknown.push(p); continue; }
    types[p - 1] = job.types[p - 1];
  }
  for (const [g, pages] of Object.entries(job.notes || {})) {
    if (!Object.hasOwn(notes, g)) continue;
    for (const p of pages || []) if (types[p - 1] === 'NOTES') notes[g].push(p);
  }
  const warnings = [];
  // Không lấy thuyết minh và ít trang chưa rõ: khỏi tốn lượt nhận trang — gửi thẳng các trang đó vào lượt đọc từng bảng.
  if (!wantNotes && unknown.length <= batch) return { types, notes, aiCalls: 0, warnings, shared: unknown };
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
    const inGroup = new Set(Object.values(notes).flat());
    const skip = unknown.filter((p) => types[p - 1] === 'OTHER');
    const loose = unknown.filter((p) => types[p - 1] === 'NOTES' && !inGroup.has(p));
    if (skip.length) warnings.push(`Trang ${list(skip)}: AI thấy không phải CĐKT, KQKD, LCTT hay thuyết minh cần lấy — bỏ qua. Mở xem lại nếu cần.`);
    if (loose.length) warnings.push(`Trang ${list(loose)}: thuyết minh nhưng không thuộc nhóm dữ liệu nào (TSCĐ, vay, vốn chủ…) — bỏ qua.`);
  }
  for (const g of Object.keys(notes)) notes[g].sort((a, b) => a - b);
  return { types, notes, aiCalls, warnings, shared: [] };
}

/** Trang đã tick cần AI nhận diện: máy chưa rõ loại, hoặc là thuyết minh nhưng chưa rõ thuộc nhóm nào. */
export function needsMap(job, p, grouped) {
  const t = job.types?.[p - 1];
  if (!KNOWN.includes(t)) return true;
  if (t !== 'NOTES') return false;
  const g = grouped || new Set(Object.values(job.notes || {}).flat());
  return !g.has(p);
}

/** Trang tick sẵn khi vừa mở file (người dùng xem lại và sửa). */
export function suggestPicks(job, { notes = true, max = Infinity } = {}) {
  const n = job.types?.length || 0;
  if (job.kind === 'img') return Array.from({ length: Math.min(n, max) }, (_, i) => i + 1);
  if (job.scanned) return [];
  const set = new Set();
  job.types.forEach((t, i) => { if (['BS', 'IS', 'CF'].includes(t)) set.add(i + 1); });
  if (notes) for (const pages of Object.values(job.notes || {})) for (const p of pages || []) if (job.types[p - 1] === 'NOTES') set.add(p);
  return [...set].sort((x, y) => x - y).slice(0, max);
}
