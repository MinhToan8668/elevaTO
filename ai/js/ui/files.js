// Bước 2 + 3: mở file (PDF / ảnh / Excel), tự nhận diện trang, cho người dùng chỉnh lại trang nào là bảng nào.
// File gốc (PDF, ảnh) giữ trong ctx.media — không đưa vào state vì không lưu JSON được.

import { h, mount, $, toast, parsePages, pagesText } from './dom.js';
import { uid, watch } from './store.js';
import { classifyPages } from '../core/extract.js';
import { readGrid, gridToSources } from '../core/grid.js';
import { readCells, parseSharedStrings, sheetPathByName, sheetNames, cellsToRows } from '../core/xlsx.js';
import { NOTE_TASKS } from '../core/prompts.js';
import { mapPagesWithAI } from '../core/pipeline.js';
import { isFatal } from '../ai.js';

const MAX_FILE = 200 * 1024 * 1024;
const TYPE_OPTS = [['BS', 'Tình hình tài chính (CĐKT)'], ['IS', 'Kết quả kinh doanh'], ['CF', 'Lưu chuyển tiền tệ'], ['NOTES', 'Thuyết minh'], ['OTHER', 'Khác / bỏ qua'], ['UNKNOWN', '— chưa rõ —']];
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
      ctx.media.set(id, { file, pdf });
      const texts = await pageTexts(pdf.doc, (i, n) => { if (i % 5 === 0 || i === n) patchJob(id, { progress: `Đọc chữ trang ${i}/${n}` }); });
      const c = classifyPages(texts);
      patchJob(id, { status: 'ready', progress: '', numPages: pdf.numPages, types: c.types, notes: c.notes, scanned: c.scanned });
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
    }] }));
    toast('Ảnh chụp: bấm "Nhờ AI nhận diện trang" ở bước 3, hoặc tự chọn loại cho từng ảnh.');
  }

  async function addExcel(file) {
    const id = uid('j');
    store.set((s) => ({ jobs: [...s.jobs, { id, name: file.name, kind: 'xls', status: 'reading', progress: 'Đang đọc…' }] }));
    try {
      const grid = readGrid(await readSheets(file));
      const srcs = gridToSources(file.name, grid).map((x) => ({ ...x, id: uid('s'), jobId: id }));
      const summary = grid.kind === 'storage'
        ? `File FinLens "Lưu trữ": ${grid.periods.length} kỳ — ${grid.periods.map((p) => p.period.id).join(', ')}`
        : `Bảng ${Object.keys(grid.statements).map((k) => SHORT[k]).join(', ')}${srcs[0].ext.meta.ngay_ket_thuc ? ` · kỳ kết thúc ${srcs[0].ext.meta.ngay_ket_thuc}` : ' · chưa rõ ngày — nhập ở bước 5'}`;
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
    store.set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id), sources: s.sources.filter((x) => x.jobId !== id) }));
  };

  watch(store, ['jobs'], (s) => renderList(s, ctx));
  watch(store, ['jobs', 'conn'], (s) => renderMaps(s, store, ctx));
}

/** .xlsx/.xlsm đọc bằng JSZip + bộ đọc XML riêng; .xls/.csv (định dạng cũ) mới cần SheetJS. */
async function readSheets(file) {
  const buf = await file.arrayBuffer();
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    if (!window.JSZip) throw new Error('Chưa tải được thư viện JSZip — kiểm tra mạng rồi tải lại trang');
    const zip = await window.JSZip.loadAsync(buf);
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
  if (!window.XLSX) throw new Error('Chưa tải được thư viện đọc Excel — kiểm tra mạng rồi tải lại trang');
  const wb = window.XLSX.read(new Uint8Array(buf), { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
  return wb.SheetNames.map((name) => ({ name, rows: window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) }));
}

// ─── Danh sách file (bước 2) ───────────────────────────────

function renderList(s, ctx) {
  const IC = { pdf: 'PDF', img: 'ẢNH', xls: 'XLS' };
  mount($('#fileList'), s.jobs.map((j) => h('li', { class: 'file' },
    h('span', { class: `ic ${j.kind === 'img' ? 'img' : j.kind}` }, IC[j.kind]),
    h('div', { style: { minWidth: 0 } },
      h('div', { class: 'nm', title: j.name }, j.name),
      h('div', { class: 'st' }, statusLine(j))),
    h('button', { class: 'btn ghost sm', 'aria-label': `Bỏ file ${j.name}`, onclick: () => ctx.removeJob(j.id), disabled: s.running }, 'Bỏ'))));
  document.querySelector('.rail a[data-step="2"]').classList.toggle('done', s.jobs.some((j) => j.status !== 'error'));
}

function statusLine(j) {
  if (j.status === 'error') return h('span', { class: 'tag red' }, j.error);
  if (j.status === 'reading') return j.progress || 'Đang đọc…';
  if (j.kind === 'xls') return [h('span', { class: 'tag em' }, 'Không cần AI'), j.summary];
  const found = ['BS', 'IS', 'CF'].filter((t) => j.types.includes(t)).map((t) => SHORT[t]);
  return [
    `${j.numPages} trang · `,
    j.scanned ? h('span', { class: 'tag gold' }, 'bản scan / ảnh') : h('span', { class: 'tag em' }, 'có chữ'),
    found.length ? `tìm thấy ${found.join(', ')}` : 'chưa xác định trang bảng',
    j.status === 'done' ? h('span', { class: 'tag em', style: { marginLeft: '6px' } }, 'đã trích xuất') : null,
  ];
}

// ─── Bản đồ trang (bước 3) ─────────────────────────────────

const thumbCache = new Map();          // `${jobId}:${page}` → dataURL
const panels = new Map();              // jobId → { el, sig } — tránh vẽ lại (mất chỗ cuộn) khi chỉ đổi loại 1 trang

const sigOf = (j, s) => JSON.stringify([j.types, j.notes, j.numPages, j.scanned, j.status === 'done', s.conn.status, s.running]);

function renderMaps(s, store, ctx) {
  const box = $('#pageMaps');
  const jobs = s.jobs.filter((j) => j.kind !== 'xls' && j.status !== 'error' && j.status !== 'reading');
  for (const id of panels.keys()) if (!jobs.some((j) => j.id === id)) panels.delete(id);
  if (!jobs.length) { mount(box, h('p', { class: 'msg warn' }, 'Chưa có file PDF / ảnh nào. File Excel không cần bước này.')); return; }
  const els = jobs.map((j, i) => {
    const sig = sigOf(j, s), had = panels.get(j.id);
    if (had && had.sig === sig) return had.el;
    const el = mapPanel(j, store, ctx, had ? had.el.open : i === jobs.length - 1);
    panels.set(j.id, { el, sig });
    return el;
  });
  const same = els.length === box.children.length && els.every((el, i) => box.children[i] === el);
  if (!same) mount(box, els);
  document.querySelector('.rail a[data-step="3"]').classList.toggle('done', jobs.every((j) => ['BS', 'IS', 'CF'].some((t) => j.types.includes(t))));
}

function summaryTags(j) {
  return ['BS', 'IS', 'CF', 'NOTES'].map((t) => {
    const pages = j.types.map((x, i) => (x === t ? i + 1 : 0)).filter(Boolean);
    return h('span', { class: `tag ${pages.length ? 'em' : t === 'NOTES' ? '' : 'red'}` }, `${SHORT[t]}: ${pages.length ? pagesText(pages) : 'chưa có'}`);
  });
}

function mapPanel(j0, store, ctx, isOpen) {
  let j = j0;
  const title = h('h3', {}, j.name, ' ', summaryTags(j));
  // Sửa ngay trên panel rồi mới báo state, ghi trước "chữ ký" mới để renderMaps giữ nguyên panel này.
  const update = (patch) => {
    j = { ...j, ...patch, status: j.status === 'done' ? 'ready' : j.status };
    mount(title, j.name, ' ', summaryTags(j));
    const s = store.get();
    panels.set(j.id, { el: panel, sig: sigOf(j, s) });
    ctx.patchJob(j.id, { ...patch, status: j.status });
  };
  const conn = store.get().conn;
  const aiBtn = j.scanned ? h('button', {
    class: 'btn sm', disabled: conn.status !== 'on' || store.get().running,
    title: conn.status !== 'on' ? 'Cần kết nối AI ở bước 1' : '',
    onclick: (e) => aiMap(j, ctx, e.currentTarget),
  }, `Nhờ AI nhận diện trang (~${Math.ceil(j.numPages / 12)} lượt)`) : null;

  const grid = h('div', { class: 'thumbs' });
  for (let n = 1; n <= j.numPages; n++) {
    const img = h('div', { class: 'img', dataset: { job: j.id, page: String(n) } }, h('span', {}, String(n)));
    const th = h('div', { class: 'th', dataset: { t: j.types[n - 1] } }, img);
    const sel = h('select', { 'aria-label': `Loại trang ${n}`, onchange: (e) => {
      const types = [...j.types]; types[n - 1] = e.target.value;
      th.dataset.t = e.target.value;
      update({ types });
    } }, TYPE_OPTS.map(([v, label]) => h('option', { value: v, selected: j.types[n - 1] === v }, label)));
    th.append(sel);
    grid.append(th);
  }
  lazyThumbs(grid, ctx);

  const groups = h('div', { class: 'groups' }, Object.entries(NOTE_TASKS).map(([k, t]) => {
    const inp = h('input', { value: pagesText(j.notes?.[k] || []), placeholder: 'số trang', 'aria-label': `Trang thuyết minh ${t.label}` });
    inp.addEventListener('change', () => {
      const pages = parsePages(inp.value, j.numPages);
      inp.value = pagesText(pages);
      update({ notes: { ...j.notes, [k]: pages } });
    });
    return h('label', { class: 'grp' }, h('span', {}, t.label), inp);
  }));

  const panel = h('details', { class: 'pmap', dataset: { id: j.id }, open: isOpen },
    h('summary', {}, title),
    j.scanned ? h('p', { class: 'msg warn' }, j.kind === 'img'
      ? 'Ảnh chụp: chọn loại cho từng ảnh, hoặc nhờ AI nhận diện. Ảnh nên chụp thẳng, đủ sáng, mỗi ảnh một trang.'
      : 'Bản scan: máy không đọc được chữ nên chưa biết trang nào là bảng nào. Nhờ AI nhận diện hoặc tự chọn.', ' ', aiBtn) : null,
    grid,
    h('p', { class: 'priv' }, 'Trang thuyết minh cho từng nhóm (máy tự tìm theo tiêu đề; sửa nếu thiếu, ví dụ "24-26"). Mỗi trang được gửi kèm trang kế tiếp.'),
    groups);
  return panel;
}

function lazyThumbs(grid, ctx) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      paintThumb(en.target, ctx);
    }
  }, { rootMargin: '200px' });
  grid.querySelectorAll('.img').forEach((el) => io.observe(el));
}

async function paintThumb(el, ctx) {
  const { job, page } = el.dataset;
  const key = `${job}:${page}`;
  const m = ctx.media.get(job);
  if (!m) return;
  try {
    let url = thumbCache.get(key);
    if (!url && m.urls) url = m.urls[page - 1];
    if (!url && m.pdf) {
      const { thumbnail } = await import('../pdf.js');
      url = await thumbnail(m.pdf.doc, Number(page), 150);
      thumbCache.set(key, url);
    }
    if (url) el.style.backgroundImage = `url("${url}")`;
  } catch (e) { el.classList.add('noimg'); el.title = `Không vẽ được trang: ${e.message}`; }
}

async function aiMap(j, ctx, btn) {
  const client = ctx.client();
  if (!client) return toast('Cần kết nối AI ở bước 1');
  btn.disabled = true;
  const old = btn.textContent;
  try {
    const io = { ai: client, images: (pages) => ctx.pageImages(j.id, pages, 900, 0.6) };
    const r = await mapPagesWithAI(j.numPages, io, { onStep: (st) => { if (st.label) btn.textContent = st.label; } });
    ctx.patchJob(j.id, { types: r.types, notes: r.notes });
    toast('AI đã nhận diện xong — kiểm tra lại nhanh các trang CĐKT / KQKD / LCTT.');
  } catch (e) {
    toast(`Nhận diện trang lỗi: ${e.message}`);
    if (isFatal(e)) ctx.refreshQuota?.();
  } finally { btn.disabled = false; btn.textContent = old; ctx.refreshQuota?.(); }
}
