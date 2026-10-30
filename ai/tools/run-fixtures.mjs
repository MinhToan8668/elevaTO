// Chạy THẬT phần trích xuất AI trên các BCTC mẫu trong tests/fixtures/bctc/ (cần GEMINI_API_KEY, poppler-utils).
// Đi đúng đường của trang: nhận trang bằng AI (bản scan) → extractJob → dataset → kiểm tra cộng dồn.
//
//   GEMINI_API_KEY=… node tools/run-fixtures.mjs [lọc tên file] [--notes] [--model gemini-flash-latest]
//
// Lời đáp của Gemini được nhớ trong .cache/fixtures (theo hash yêu cầu) → chạy lại chỉ tốn lượt khi câu lệnh đổi.
// In tóm tắt mỗi file ra màn hình và ghi toàn bộ kết quả vào .cache/fixtures/<file>.json.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractJob, mapPagesWithAI } from '../js/core/pipeline.js';
import { NOTE_TASKS, SYSTEM } from '../js/core/prompts.js';
import { parseAIJson } from '../js/core/extract.js';
import { validate } from '../js/core/statements.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests/fixtures/bctc');
const CACHE = join(ROOT, '.cache/fixtures');
mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const MODEL = opt('--model', process.env.GEMINI_MODEL || 'gemini-3.6-flash');
const withNotes = args.includes('--notes') && args.splice(args.indexOf('--notes'), 1);
const shared = opt('--shared', '');          // ví dụ --shared 9-12: như Form phổ thông — tick trang, không nhận trang
const typesArg = opt('--types', '');        // ví dụ --types BS=8-9,IS=11-12,CF=13-14: trang đã biết, khỏi tốn lượt nhận trang
const filter = args[0] || '';
const log = (...a) => process.env.DEBUG && console.error(...a);
const KEY = process.env.GEMINI_API_KEY;
// Quá tải / hết hạn mức ở model này thì đổi sang model sau (như chuỗi dự phòng của máy chủ).
const CHUOI = [MODEL, ...['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.7-flash'].filter((m) => m !== MODEL)];
if (!KEY) { console.error('Thiếu GEMINI_API_KEY'); process.exit(1); }

class AIError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0, cached = 0;
// Giữ nhịp như máy chủ (≤ 6 lượt/phút): gói miễn phí báo 429 rất nhanh khi gọi dồn.
let sau = 0;
const nhip = async () => { const now = Date.now(), cho = Math.max(0, sau - now); sau = Math.max(now, sau) + 10000; if (cho) await sleep(cho); };

async function generate(body) {
  // PDF cắt bằng pdfunite mang dấu thời gian → băm theo "file:trang" thay cho nội dung, để bộ nhớ đệm trúng.
  const h = createHash('sha256').update(JSON.stringify(body, (k, v) => (k === 'data' && TEN.has(v) ? TEN.get(v) : v))).digest('hex').slice(0, 24);
  const f = join(CACHE, `${h}.json`);
  if (existsSync(f)) { cached++; return JSON.parse(readFileSync(f, 'utf8')); }
  for (let lan = 0; ; lan++) {
    await nhip();
    const model = CHUOI[lan % CHUOI.length];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      calls++;
      const c = j.candidates?.[0];
      const out = { text: (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join(''), finishReason: c?.finishReason || '' };
      if (out.finishReason !== 'MAX_TOKENS') writeFileSync(f, JSON.stringify(out));
      return out;
    }
    log('gemini', model, r.status, j?.error?.message?.slice(0, 120));
    if ([429, 500, 503].includes(r.status) && lan < 12) { if ((lan + 1) % CHUOI.length === 0) await sleep(30000); continue; }
    throw new AIError(r.status === 400 ? 'schema' : 'upstream', `Gemini ${r.status}: ${j?.error?.message || ''}`.slice(0, 300));
  }
}

const ai = {
  async json({ parts, schema, maxOutputTokens = 32768, system = SYSTEM }) {
    const generationConfig = { temperature: 0, responseMimeType: 'application/json', maxOutputTokens };
    // Chép số không cần suy nghĩ dài: để mặc định thì token "suy nghĩ" ăn vào maxOutputTokens và CĐKT ngân hàng
    // (60+ dòng, hai trang) bị cắt MAX_TOKENS ngay cả khi đã chia đôi — gặp thật ở VCB 2025.
    if (system === SYSTEM) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    if (schema) generationConfig.responseSchema = schema;
    const d = await generate({ contents: [{ role: 'user', parts }], systemInstruction: { parts: [{ text: system }] }, generationConfig });
    if (d.finishReason === 'MAX_TOKENS') throw new AIError('truncated', 'MAX_TOKENS');
    try { return parseAIJson(d.text); } catch (e) { throw new AIError('parse', e.message); }
  },
};

const TEN = new Map();   // base64 PDF đã cắt → "file:trang"
/** Cắt các trang của PDF thành một PDF mới (poppler). */
function pdfPages(file, pages) {
  const tmp = mkdtempSync(join(tmpdir(), 'bctc-'));
  try {
    const one = pages.map((p) => { const o = join(tmp, `p${p}.pdf`); execFileSync('pdfseparate', ['-f', p, '-l', p, file, o]); return o; });
    const out = join(tmp, 'out.pdf');
    if (one.length === 1) return readFileSync(one[0]);
    execFileSync('pdfunite', [...one, out]);
    return readFileSync(out);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
function jpegs(file, pages, px = 1800, rot = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'bctc-'));
  try {
    return pages.map((p) => {
      execFileSync('pdftoppm', ['-f', p, '-l', p, '-jpeg', '-jpegopt', 'quality=80', '-scale-to', px, '-singlefile', file, join(tmp, `p${p}`)]);
      let b = readFileSync(join(tmp, `p${p}.jpg`));
      if (rot[p]) { execFileSync('convert', [join(tmp, `p${p}.jpg`), '-rotate', rot[p], join(tmp, `r${p}.jpg`)]); b = readFileSync(join(tmp, `r${p}.jpg`)); }
      return { inlineData: { mimeType: 'image/jpeg', data: b.toString('base64') } };
    });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const fmt = (x) => (typeof x === 'number' ? Math.round(x / 1e6).toLocaleString('vi-VN') : '—');

async function runFile(name) {
  const file = join(DIR, name);
  const total = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file]).toString())[1]);
  const t0 = Date.now();
  let map;
  if (typesArg) {
    map = { types: Array(total).fill('OTHER'), notes: {}, rot: {} };
    for (const part of typesArg.split(',')) {
      const [k, r] = part.split('='); const [a, b] = r.split('-').map(Number);
      for (let p = a; p <= (b || a); p++) map.types[p - 1] = k;
    }
  } else if (shared) {
    const [a, b] = shared.split('-').map(Number);
    map = { types: Array(total).fill('OTHER'), notes: {}, rot: {}, shared: Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i) };
  } else map = await mapPagesWithAI(total, { ai, images: async (pg) => jpegs(file, pg, 900) });
  const rot = map.rot || {};
  const io = {
    ai,
    parts: async (pages, o = {}) => (o.anh || Object.keys(rot).some((p) => pages.includes(+p))
      ? jpegs(file, pages, 1800, rot)
      : [{ inlineData: { mimeType: 'application/pdf', data: ((d) => (TEN.set(d, `${name}:${pages.join(',')}`), d))(pdfPages(file, pages).toString('base64')) } }]),
    images: async (pages) => jpegs(file, pages, 900),
    isSplittable: (e) => e?.code === 'truncated',
    isFatal: () => false,
  };
  const job = { name, types: map.types, notes: map.notes, scanned: true, shared: map.shared };
  const ext = await extractJob(job, io, { noteGroups: withNotes ? Object.keys(NOTE_TASKS) : [] });
  const out = { file: name, secs: Math.round((Date.now() - t0) / 1000), map: { types: map.types, notes: map.notes, rot }, ext };
  writeFileSync(join(CACHE, `${basename(name, '.pdf')}.json`), JSON.stringify(out, null, 1));

  console.log(`\n══ ${name} (${total} trang, ${out.secs}s)`);
  for (const st of ['BS', 'IS', 'CF']) console.log(`  ${st}: trang ${ext.pages[st]?.join(',') || '—'} · ${Object.keys(ext.statements[st]?.cur || {}).length} chỉ tiêu`);
  console.log('  thuyết minh:', Object.entries(map.notes).map(([g, p]) => `${g}=${p.join(',')}`).join(' '));
  console.log('  kỳ:', JSON.stringify(ext.meta));
  const s = ext.statements;
  const bank = Object.keys(s.BS?.cur || s.IS?.cur || {}).some((k) => /:N/.test(k));
  const pick = bank ? { BS: ['BS:N160', 'BS:N300', 'BS:N330', 'BS:N400', 'BS:N500', 'BS:N600'], IS: ['IS:N10', 'IS:N80', 'IS:N100', 'IS:N120'], CF: ['CF:N20', 'CF:N30', 'CF:N40', 'CF:N70'] } : { BS: ['BS:280', 'BS:300', 'BS:400', 'BS:440'], IS: ['IS:10', 'IS:20', 'IS:50', 'IS:60'], CF: ['CF:20', 'CF:30', 'CF:40', 'CF:70'] };
  for (const [st, ks] of Object.entries(pick)) if (s[st]) console.log(`  ${st} (tr.đ):`, ks.map((k) => `${k.split(':')[1]}=${fmt(s[st].cur[k])}/${fmt(s[st].prev[k])}`).join(' '));
  for (const st of Object.keys(s)) {
    const bad = validate(s[st].cur, { unit: ext.units[st], cashMatchesBS: false }).filter((b) => b.key.startsWith(st));
    if (bad.length) console.log(`  ✗ ${st} lệch cộng dồn:`, bad.slice(0, 6).map((b) => `${b.key}(${fmt(b.diff)})`).join(', '));
  }
  for (const w of ext.warnings) console.log('  ! ' + w);
  if (withNotes) console.log('  notes:', JSON.stringify(ext.notes).slice(0, 1500));
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.pdf') && f.includes(filter));
for (const f of files) {
  try { await runFile(f); } catch (e) { console.log(`\n══ ${f}: LỖI ${e.code || ''} ${e.message}`); }
}
console.log(`\nModel ${MODEL} · ${calls} lượt gọi mới, ${cached} lượt lấy từ bộ nhớ.`);
