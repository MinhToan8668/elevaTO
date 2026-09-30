// Lưu / mở lại phiên làm việc (file .json hoặc bộ nhớ trình duyệt).
// Chỉ lưu dữ liệu đã trích + lựa chọn của người dùng — không lưu phiên đăng nhập, không lưu file gốc.
// File phiên có thể đến từ người khác gửi → đọc lại theo khuôn cố định, bỏ mọi khoá / giá trị lạ.

const APP = 'elevato-ai-bctc';
const VERSION = 1;
const KEY_RE = /^(BS|IS|CF):(T?\d{1,3}[a-z]?|KP[Q12])$/;
const PERIOD_RE = /^(FY\d{4}|Q[1-4]-\d{4})$/;
const UNITS = [1, 1e3, 1e6, 1e9];
const NOTE_KEYS = ['segments', 'fixedAssets', 'equity', 'debt', 'goodwill', 'params'];
const PRESETS = ['dgw', 'main', 'custom'];
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SLOTS = 5;

export function serializeSession(s) {
  const data = {
    sources: s.sources, edits: s.edits, ticks: s.ticks, unit: s.unit,
    segmentMap: s.segmentMap, segmentNames: s.segmentNames, noteGroups: s.noteGroups, preset: s.preset,
  };
  return JSON.stringify({ app: APP, v: VERSION, savedAt: new Date().toISOString(), data });
}

/** Chuỗi JSON → phần state dùng được (đã lọc). Ném lỗi nếu không phải file phiên. */
export function parseSession(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { o = null; }
  if (!o || o.app !== APP || typeof o.data !== 'object' || !o.data) throw new Error('Đây không phải file phiên làm việc elevaTO AI');
  const d = o.data;
  return {
    sources: uniqueIds(arr(d.sources, 200).map(source).filter(Boolean)),
    edits: arr(d.edits, 5000).map(edit).filter(Boolean),
    ticks: Array.isArray(d.ticks) ? d.ticks.filter((k) => typeof k === 'string' && KEY_RE.test(k)).slice(0, 2000) : null,
    unit: UNITS.includes(d.unit) ? d.unit : 1e6,
    segmentMap: Object.fromEntries(Object.entries(obj(d.segmentMap)).filter(([k, v]) => safeKey(k) && Number.isInteger(v) && v >= 0 && v < SLOTS).map(([k, v]) => [str(k, 120), v]).slice(0, 50)),
    segmentNames: Array.from({ length: SLOTS }, (_, i) => str(arr(d.segmentNames, SLOTS)[i], 60)),
    noteGroups: arr(d.noteGroups, 10).filter((g) => NOTE_KEYS.includes(g)),
    preset: PRESETS.includes(d.preset) ? d.preset : 'custom',
    savedAt: str(o.savedAt, 40),
  };
}

const arr = (x, max) => (Array.isArray(x) ? x.slice(0, max) : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const str = (x, max = 300) => (typeof x === 'string' ? x.slice(0, max) : '');
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const safeKey = (k) => !BAD_KEYS.has(k);
const id = (x) => (typeof x === 'string' && /^[\w-]{1,60}$/.test(x) ? x : undefined);

function values(x) {
  const out = {};
  for (const [k, v] of Object.entries(obj(x))) if (KEY_RE.test(k) && num(v) !== undefined) out[k] = v;
  return out;
}

function period(p) {
  p = obj(p);
  if (!PERIOD_RE.test(p.id) || !Number.isInteger(p.year) || !(Number.isInteger(p.months) && p.months >= 1 && p.months <= 12) || !(p.endMonth >= 1 && p.endMonth <= 12)) return null;
  return { id: p.id, year: p.year, months: p.months, endMonth: p.endMonth };
}

function meta(m) {
  m = obj(m);
  const out = {};
  if (typeof m.ngay_ket_thuc === 'string') out.ngay_ket_thuc = str(m.ngay_ket_thuc, 20);
  if (num(m.so_thang) !== undefined) out.so_thang = m.so_thang;
  return out;
}

function source(s) {
  s = obj(s);
  const base = { id: id(s.id) };
  if (s.jobId !== undefined) base.jobId = id(s.jobId);
  if (s.kind === 'period') {
    const p = period(s.period);
    return p ? { ...base, kind: 'period', file: str(s.file), period: p, values: values(s.values) } : null;
  }
  if (s.kind !== 'ext') return null;
  const e = obj(s.ext);
  const statements = {};
  for (const st of ['BS', 'IS', 'CF']) {
    const x = obj(e.statements)[st];
    if (x) statements[st] = { cur: values(x.cur), prev: values(x.prev) };
  }
  const units = {};
  for (const st of ['BS', 'IS', 'CF']) if (UNITS.includes(obj(e.units)[st])) units[st] = e.units[st];
  const out = { ...base, kind: 'ext', ext: {
    file: str(e.file), company: str(e.company), meta: meta(e.meta), statements, units,
    notes: clean(e.notes, 0), warnings: arr(e.warnings, 500).map((w) => str(w, 500)),
  } };
  if (s.meta) out.meta = meta(s.meta);
  if (base.jobId === undefined) delete out.jobId;
  return out;
}

// Mỗi nguồn cần id riêng: giao diện sửa ngày / bỏ nguồn theo id.
function uniqueIds(list) {
  const seen = new Set();
  return list.map((s, i) => {
    let v = s.id;
    if (!v || seen.has(v)) v = `r${i}-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(v);
    return { ...s, id: v };
  });
}

function edit(e) {
  e = obj(e);
  if (!PERIOD_RE.test(e.period) || !KEY_RE.test(e.key)) return null;
  if (e.v !== null && num(e.v) === undefined) return null;
  return { period: e.period, key: e.key, v: e.v };
}

// Thuyết minh: JSON thuần, giới hạn độ sâu / độ dài, bỏ khoá nguy hiểm.
function clean(x, depth) {
  if (depth > 5) return undefined;
  if (typeof x === 'string') return x.slice(0, 300);
  if (typeof x === 'number') return Number.isFinite(x) ? x : undefined;
  if (typeof x === 'boolean') return x;
  if (Array.isArray(x)) return x.slice(0, 200).map((v) => clean(v, depth + 1)).filter((v) => v !== undefined);
  if (x && typeof x === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(x).slice(0, 100)) {
      if (!safeKey(k)) continue;
      const c = clean(v, depth + 1);
      if (c !== undefined) out[str(k, 60)] = c;
    }
    return out;
  }
  return undefined;
}
