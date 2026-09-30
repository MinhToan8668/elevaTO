// Bước 1: mở file (PDF / ảnh / Excel), đọc chữ để gợi ý trang cần lấy. Phần chọn trang ở pages.js.
// File gốc (PDF, ảnh) giữ trong ctx.media — không đưa vào state vì không lưu JSON được.

import { h, mount, $, toast, keepFocus } from './dom.js';
import { uid, watch } from './store.js';
import { classifyPages } from '../core/extract.js';
import { readGrid, gridToSources } from '../core/grid.js';
import { readCells, parseSharedStrings, sheetPathByName, sheetNames, cellsToRows } from '../core/xlsx.js';
import { NOTE_TASKS } from '../core/prompts.js';
import { suggestPicks } from '../core/pipeline.js';
import { FORMS, formOf } from './store.js';
import { openZip, loadXLSX } from '../libs.js';

const MAX_FILE = 200 * 1024 * 1024;
const SHORT = { BS: 'CĐKT', IS: 'KQKD', CF: 'LCTT', NOTES: 'TM', OTHER: '·', UNKNOWN: '?' };

export function initFiles(store, ctx) {
  const input = $('#fileInput'), drop = $('#drop');
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });

  const patchJob = (id, patch) => store.set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
  ctx.patchJob = patchJob;
  const alive = (id) => store.get().jobs.some((j) => j.id === id);     // người dùng có thể bấm "Bỏ" khi file đang đọc
  // Trang tick sẵn theo form đang chọn (form phổ thông không lấy thuyết minh và giới hạn số trang).
  const pickOpts = () => { const f = FORMS[formOf(store.get())]; return { notes: f.notes.length > 0, max: f.maxPages }; };

  async function addFiles(files) {
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    for (const f of files) {
      if (imgs.includes(f)) continue;
      if (f.size > MAX_FILE) { toast(`${f.name}: file quá lớn (tối đa 200MB)`); continue; }
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') await addPdf(f);
      else if (/\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) await addExcel(f);
      else toast(`Bỏ qua ${f.name}: chỉ nhận PDF, Excel, ảnh JPG/PNG`);
    }
    if (imgs.length) addImages(imgs);
  }

  async function addPdf(file) {
    const id = uid('j');
    ctx.media.set(id, { file });
    store.set((s) => ({ jobs: [...s.jobs, { id, name: file.name, kind: 'pdf', status: 'reading', progress: 'Đang mở…' }] }));
    try {
      const { openPdf, pageTexts } = await import('../pdf.js');
      const pdf = await openPdf(file);
      if (!alive(id)) { pdf.doc.destroy(); return; }
      ctx.media.set(id, { file, pdf });
      const texts = await pageTexts(pdf.doc, (i, n) => { if (i % 5 === 0 || i === n) patchJob(id, { progress: `Đọc chữ trang ${i}/${n}` }); });
      if (!alive(id)) return;
      const c = classifyPages(texts);
      const job = { kind: 'pdf', numPages: pdf.numPages, types: c.types, notes: c.notes, scanned: c.scanned };
      const goiY = suggestPicks(job, pickOpts());
      patchJob(id, { status: 'ready', progress: '', ...job, picked: goiY, goiY });    // goiY: người dùng chưa sửa tay thì đổi form sẽ gợi ý lại
    } catch (e) {
      const msg = /password/i.test(e.name + e.message) ? 'File có mật khẩu — mở khoá rồi tải lại' : `Không mở được PDF: ${e.message}`;
      patchJob(id, { status: 'error', error: msg, progress: '' });
    }
  }

  function addImages(files) {
    const id = uid('j');
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
    ctx.media.set(id, { images: sorted, urls: sorted.map((f) => URL.createObjectURL(f)) });
    const name = sorted.length > 1 ? `${sorted.length} ảnh chụp (${sorted[0].name} …)` : sorted[0].name;
    store.set((s) => ({ jobs: [...s.jobs, {
      id, name, kind: 'img', status: 'ready', numPages: sorted.length, scanned: true,
      types: sorted.map(() => 'UNKNOWN'), notes: Object.fromEntries(Object.keys(NOTE_TASKS).map((k) => [k, []])),
      picked: sorted.map((_, i) => i + 1).slice(0, pickOpts().max), goiY: sorted.map((_, i) => i + 1).slice(0, pickOpts().max),
    }] }));
  }

  async function addExcel(file) {
    const id = uid('j');
    store.set((s) => ({ jobs: [...s.jobs, { id, name: file.name, kind: 'xls', status: 'reading', progress: 'Đang đọc…' }] }));
    try {
      const grid = readGrid(await readSheets(file));
      if (!alive(id)) return;
      if (grid.kind === 'storage' && !grid.periods.length) throw new Error('Sheet "Lưu trữ" không có cột kỳ hợp lệ (dòng "Mã kỳ" dạng FY-2025, Q2-2026)');
      const srcs = gridToSources(file.name, grid).map((x) => ({ ...x, id: uid('s'), jobId: id }));
      const summary = grid.kind === 'storage'
        ? `File FinLens "Lưu trữ": ${grid.periods.length} kỳ — ${grid.periods.map((p) => p.period.id).join(', ')}`
        : `Bảng ${Object.keys(grid.statements).map((k) => SHORT[k]).join(', ')}${srcs[0].ext.meta.ngay_ket_thuc ? ` · kỳ kết thúc ${srcs[0].ext.meta.ngay_ket_thuc}` : ' · chưa rõ ngày — nhập ở bước 4'}`;
      patchJob(id, { status: 'done', progress: '', summary });
      store.set((s) => ({ sources: [...s.sources, ...srcs] }));
    } catch (e) {
      patchJob(id, { status: 'error', error: e.message, progress: '' });
    }
  }

  ctx.removeJob = (id) => {
    const m = ctx.media.get(id);
    m?.urls?.forEach((u) => URL.revokeObjectURL(u));
    m?.pdf?.doc?.destroy?.();
    ctx.media.delete(id);
    ctx.forgetThumbs?.(id);
    store.set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id), sources: s.sources.filter((x) => x.jobId !== id) }));
  };

  watch(store, ['jobs', 'running'], (s) => renderList(s, ctx));
}

/** .xlsx/.xlsm đọc bằng JSZip + bộ đọc XML riêng; .xls/.csv (định dạng cũ) mới cần SheetJS. */
async function readSheets(file) {
  const buf = await file.arrayBuffer();
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const zip = await openZip(buf);
    const wb = await zip.file('xl/workbook.xml')?.async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
    if (!wb || !rels) throw new Error('File Excel hỏng hoặc không đúng định dạng .xlsx');
    const ss = zip.file('xl/sharedStrings.xml');
    const shared = ss ? parseSharedStrings(await ss.async('string')) : [];
    const out = [];
    for (const name of sheetNames(wb)) {
      const path = sheetPathByName(wb, rels, name);
      const f = path && zip.file(path);
      if (f) out.push({ name, rows: cellsToRows(readCells(await f.async('string'), shared)) });
    }
    return out;
  }
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false, dense: true });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
}

// ─── Danh sách file (bước 1) ───────────────────────────────

function renderList(s, ctx) {
  const IC = { pdf: 'PDF', img: 'ẢNH', xls: 'XLS' };
  const list = $('#fileList');
  keepFocus(list, () => mount(list, s.jobs.map((j) => h('li', { class: 'file' },
    h('span', { class: `ic ${j.kind === 'img' ? 'img' : j.kind}` }, IC[j.kind]),
    h('div', { style: { minWidth: 0 } },
      h('div', { class: 'nm', title: j.name }, j.name),
      h('div', { class: 'st' }, statusLine(j))),
    h('button', { class: 'btn ghost sm', 'aria-label': `Bỏ file ${j.name}`, onclick: () => ctx.removeJob(j.id), disabled: s.running }, 'Bỏ')))));
  document.querySelector('.rail a[data-step="2"]').classList.toggle('done', s.jobs.some((j) => j.status !== 'error'));
}

function statusLine(j) {
  if (j.status === 'error') return h('span', { class: 'tag red' }, j.error);
  if (j.status === 'reading') return j.progress || 'Đang đọc…';
  if (j.kind === 'xls') return [h('span', { class: 'tag em' }, 'Không cần AI'), j.summary];
  const found = ['BS', 'IS', 'CF'].filter((t) => j.types.includes(t)).map((t) => SHORT[t]);
  return [
    `${j.numPages} trang · `,
    j.scanned ? h('span', { class: 'tag gold' }, j.kind === 'img' ? 'ảnh chụp' : 'bản scan') : h('span', { class: 'tag em' }, 'có chữ'),
    `đã chọn ${j.picked?.length || 0} trang`,
    !j.scanned && found.length ? ` · máy nhận ra ${found.join(', ')}` : '',
    j.status === 'done' ? h('span', { class: 'tag em', style: { marginLeft: '6px' } }, 'đã trích xuất') : null,
  ];
}
