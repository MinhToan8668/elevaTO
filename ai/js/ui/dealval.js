// Tab "M&A & định giá" — phần DCF (FCFF), giá mục tiêu gia quyền, định giá nhanh và phân tích thương vụ
// mua cổ phần. Số do core/valuation.js và core/mna.js tính; ở đây chỉ vẽ và nhận thông số người dùng
// nhập (lưu vào store.dealInputs.val / .mna, đi cùng phiên làm việc).

import { h } from './dom.js';
import { dcfValuation, quickAnchors, blendedTarget, piotroski, scenarioValuation, REV_MODES, TV_METHODS } from '../core/valuation.js';
import { PRESETS, applyPreset } from '../core/presets.js';
import { footballChart, waterfallChart, revFcffChart, heatStyle } from './dvcharts.js';
import { mnaAnalysis } from '../core/mna.js';
import { compsAnalysis, peerMultiples, parsePeers, MULTS } from '../core/comps.js';
import { regressBeta, regressRows } from '../core/beta.js';
import { API } from '../config.js';
import { layGiaSan } from '../core/giasan.js';
import { t } from '../i18n.js';

const pc = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const lan = (x) => (Number.isFinite(x) ? t('ch.times', { v: x.toFixed(2) }) : '—');
const dong = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('vi-VN') : '—');
const vnd = (x) => (Number.isFinite(x) ? t('dv.vnd', { v: dong(x) }) : '—');
const sec = (key, ...kids) => h('section', { class: 'dl-sec' }, h('h3', {}, t(`${key}.h`)), h('p', { class: 'priv', style: { marginTop: 0 } }, t(`${key}.lead`)), ...kids);
const card = (label, val, tone = '', hint = '') => h('div', { class: `hbox ${tone}` }, h('span', { class: 'hlbl' }, label), h('b', {}, val),
  hint ? h('small', { class: 'priv', style: { marginTop: '2px' } }, hint) : null);
const REC_TONE = { buy: 'em', accumulate: 'em', hold: 'gold', underperform: 'red', sell: 'red' };

/** Ô nhập %: hiện số ×100; bỏ trống = máy tự tính (placeholder là số máy đang dùng). */
function oPct(label, val, auto, onSet, step = '0.1') {
  return h('label', { class: 'dv-f' }, h('span', {}, label),
    h('input', { type: 'number', step, value: val === null || val === undefined ? '' : String(+(val * 100).toFixed(4)),
      placeholder: Number.isFinite(auto) ? (auto * 100).toFixed(2) : '', onchange: (e) => onSet(e.target.value === '' ? null : +e.target.value / 100) }),
    h('i', {}, '%'));
}
function oNum(label, val, onSet, { step = 'any', suffix = '', placeholder = '' } = {}) {
  return h('label', { class: 'dv-f' }, h('span', {}, label),
    h('input', { type: 'number', step, value: val === null || val === undefined || val === 0 ? '' : String(val), placeholder,
      onchange: (e) => onSet(e.target.value === '' ? null : +e.target.value) }),
    suffix ? h('i', {}, suffix) : null);
}

// ─── DCF ───────────────────────────────────────────────────

export function dcfBlock(a, inp, save, money, ul) {
  const V = inp.val;
  const dat = (patch) => save({ val: { ...V, ...patch } });
  const r = dcfValuation(a, V);
  const nguon = (k) => (r.used[k] === 'user' ? '' : r.used[k] === 'hist' ? t('dv.src.hist', { n: r.his.n }) : t('dv.src.def'));
  const thamSo = h('div', { class: 'dv-grid' },
    oNum(t('dv.price'), V.price, (v) => dat({ price: v }), { suffix: t('dv.cur') }),
    oNum(t('dv.shares'), V.shares, (v) => dat({ shares: v }), { step: '1', placeholder: a.cols.map((c) => c.m.shares).filter(Boolean).pop()?.toString() || '' }),
    oPct(t('dv.rf'), V.rf, null, (v) => dat({ rf: v ?? 0.0437 })),
    oPct(t('dv.erp'), V.erp, null, (v) => dat({ erp: v ?? 0.0813 })),
    oNum(t('dv.beta'), V.beta, (v) => dat({ beta: v ?? 1 }), { step: '0.01' }),
    h('label', { class: 'dv-f dv-chk' }, h('input', { type: 'checkbox', checked: V.blume, onchange: (e) => dat({ blume: e.target.checked }) }), h('span', {}, t('dv.blume'))),
    oPct(t('dv.extra'), V.extra, null, (v) => dat({ extra: v ?? 0 })),
    oPct(t('dv.kd'), V.kd, r.d.kd, (v) => dat({ kd: v })),
    oPct(t('dv.tax'), V.tax, r.d.tax, (v) => dat({ tax: v })),
    oPct(t('dv.g'), V.g, null, (v) => dat({ g: v ?? 0.03 })),
    oNum(t('dv.years'), V.years, (v) => dat({ years: v ?? 5 }), { step: '1' }),
    oPct(t('dv.growth'), V.growth, r.d.growth, (v) => dat({ growth: v })),
    h('label', { class: 'dv-f dv-chk' }, h('input', { type: 'checkbox', checked: V.fade, onchange: (e) => dat({ fade: e.target.checked }) }), h('span', {}, t('dv.fade'))),
    oPct(t('dv.margin'), V.margin, r.d.margin, (v) => dat({ margin: v })),
    oPct(t('dv.da'), V.da, r.d.da, (v) => dat({ da: v })),
    oPct(t('dv.capex'), V.capex, r.d.capex, (v) => dat({ capex: v })),
    oPct(t('dv.nwc'), V.nwc, r.d.nwc, (v) => dat({ nwc: v })),
    oNum(t('dv.exit'), V.exit, (v) => dat({ exit: v }), { step: '0.1', suffix: '×', placeholder: String(a.inputs.evEbitda[1]) }));
  const betaBox = betaBlock(V, dat);
  const thietLap = setupBlock(a, r, V, dat, money, ul);
  const ghiChu = h('p', { class: 'priv' }, t('dv.auto'), ' ',
    ['growth', 'margin', 'da', 'capex', 'nwc', 'tax', 'kd'].filter((k) => r.used[k] !== 'user').map((k) => `${t(`dv.${k}`)}: ${nguon(k)}`).join(' · '));
  const W = r.W;
  const waccCards = h('div', { class: 'dl-cards' },
    card(t('dv.ke'), pc(W.ke, 2), '', t('dv.ke.hint', { b: W.betaAdj.toFixed(2) })),
    card(t('dv.kdAfter'), pc(W.kdSau, 2)),
    card(t('dv.weights'), `${pc(W.wd, 0)} / ${pc(W.we, 0)}`, '', t(W.eBasis === 'market' ? 'dv.wMarket' : 'dv.wBook')),
    card('WACC', pc(W.wacc, 2), 'em'));
  const loi = r.issues.map((k) => h('p', { class: `msg ${['noBase', 'gOverWacc'].includes(k) ? 'err' : 'warn'}` }, t(`dv.issue.${k}`)));
  if (!r.flows) return sec('dv', thietLap, thamSo, betaBox, ghiChu, waccCards, ...loi);

  const bang = bangDuPhong(a, r, V, dat, money, ul);
  const up = r.price !== null && V.price ? r.price / V.price - 1 : null;
  const ketQua = h('div', { class: 'dl-cards' },
    card(t('dv.ev'), money(r.ev), '', t('dv.ev.hint', { pv: money(r.pv), tv: money(r.pvTv) })),
    card(t('dv.equity'), money(r.equity)),
    card(t('dv.target'), r.price !== null ? vnd(r.price) : '—', 'em', r.shares ? '' : t('dv.noShares')),
    card(t('dv.upside'), pc(up), up === null ? '' : up >= 0 ? 'em' : 'red'),
    card(t('dv.tvShare'), pc(r.tvShare, 0), r.tvShare > 0.75 ? 'gold' : ''));
  const doiChieu = h('p', { class: 'msg' }, t('dv.exitCheck', {
    m: r.exit.mult, p: r.exit.price !== null ? vnd(r.exit.price) : money(r.exit.equity), ig: pc(r.exit.impliedG, 2), im: lan(r.impliedExit) }));
  return sec('dv', thietLap, thamSo, betaBox, ghiChu, waccCards, ...loi, bang, ketQua, doiChieu, sensTable(r, money, V.price));
}

// ─── Hồi quy beta (20.Beta_Data) ───────────────────────────

// Chuỗi dữ liệu không lưu vào phiên (có thể vài nghìn dòng) — chỉ giữ trong trang tới khi tải lại.
const uiBeta = { open: false, text: '', step: 1, res: undefined, years: 5, rows: null, src: null, err: '', busy: false };
/** Tính lại theo nguồn đang có: dữ liệu tải từ sàn (dãy số) hoặc chữ dán / file. */
const tinhLai = () => { uiBeta.res = uiBeta.rows ? regressRows(uiBeta.rows, uiBeta.step) : uiBeta.text ? regressBeta(uiBeta.text, uiBeta.step) : undefined; };

/**
 * Tải giá cổ phiếu + VN-Index từ sàn: qua Worker trước (GET /gia — nhớ đệm 6 giờ); không tới được Worker
 * (mạng công ty hay chặn *.workers.dev → "Failed to fetch") hoặc Worker không lấy được giá thì trang gọi
 * thẳng VNDirect (core/giasan.js — cùng một logic với Worker).
 */
async function taiGia(ma, dat) {
  uiBeta.busy = true; uiBeta.err = ''; dat({ ticker: ma });
  try {
    let b = null;
    if (API) {
      try { b = await (await fetch(`${API}/gia?ma=${encodeURIComponent(ma)}&nam=${uiBeta.years}`)).json(); } catch (e) { b = null; }
    }
    if (!b?.ok && !['bad', 'khong_co'].includes(b?.code)) b = await layGiaSan(ma, uiBeta.years);
    if (!b?.ok) throw new Error(t(`bt.e.${b?.code || 'upstream'}`, { ma, n: b?.info?.n ?? 0, msg: b?.info?.msg || b?.error || '' }));
    uiBeta.rows = b.data.rows; uiBeta.text = '';
    uiBeta.src = { ma: b.data.ma, n: b.data.rows.length, gia: b.data.gia, ngay: b.data.ngay, nguon: b.data.nguon };
    tinhLai();
  } catch (e) { uiBeta.err = t('bt.dl.err', { msg: e.message }); }
  finally { uiBeta.busy = false; dat({}); }
}

function betaBlock(V, dat) {
  const o = h('textarea', { rows: 5, placeholder: t('bt.ph'), 'aria-label': t('bt.h') });
  o.value = uiBeta.text;
  const tinh = () => { uiBeta.text = o.value; uiBeta.rows = null; uiBeta.src = null; tinhLai(); dat({}); };
  const maIn = h('input', { type: 'text', class: 'bt-ma', value: V.ticker || '', maxlength: 10, placeholder: 'DGW', 'aria-label': t('bt.ma'),
    onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) taiGia(e.target.value.trim().toUpperCase(), dat); } });
  const tai = h('div', { class: 'row cp-bar' },
    h('label', { class: 'dv-f' }, h('span', {}, t('bt.ma')), maIn),
    h('label', { class: 'dv-f' }, h('span', {}, t('bt.years')),
      h('select', { onchange: (e) => { uiBeta.years = +e.target.value; } }, [1, 2, 3, 5].map((n) => h('option', { value: String(n), selected: uiBeta.years === n }, t('bt.nYears', { n }))))),
    h('button', { type: 'button', class: 'btn sm', disabled: uiBeta.busy, onclick: () => { const ma = maIn.value.trim().toUpperCase(); if (ma) taiGia(ma, dat); else maIn.focus(); } },
      t(uiBeta.busy ? 'bt.dl.busy' : 'bt.dl')));
  const daTai = uiBeta.src ? h('p', { class: 'msg ok' }, t('bt.dl.done', { ma: uiBeta.src.ma, n: uiBeta.src.n, nguon: uiBeta.src.nguon }), ' ',
    uiBeta.src.gia && uiBeta.src.gia !== V.price ? h('button', { type: 'button', class: 'linkb', onclick: () => dat({ price: uiBeta.src.gia }) },
      t('bt.usePrice', { p: Math.round(uiBeta.src.gia).toLocaleString('vi-VN'), d: uiBeta.src.ngay })) : null) : null;
  const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', 'aria-label': t('bt.file'), onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    uiBeta.text = (await f.text()).slice(0, 2_000_000);
    uiBeta.rows = null; uiBeta.src = null;
    tinhLai();
    dat({});
  } });
  const r = uiBeta.res;
  const ngay = (ms) => (ms === null ? '' : new Date(ms).toLocaleDateString('vi-VN', { timeZone: 'UTC' }));
  return h('details', { class: 'dv-beta', open: uiBeta.open },
    h('summary', { onclick: (e) => { uiBeta.open = !e.currentTarget.parentElement.open; } }, h('b', {}, t('bt.h')),
      r ? h('span', { class: 'tag em' }, `β ${r.beta.toFixed(2)}`) : null),
    h('p', { class: 'priv' }, t('bt.dl.lead')),
    tai,
    uiBeta.err ? h('p', { class: 'msg warn' }, uiBeta.err) : null,
    daTai,
    h('p', { class: 'priv' }, t('bt.lead')),
    o,
    h('div', { class: 'row cp-bar' },
      h('label', { class: 'dv-f' }, h('span', {}, t('bt.freq')),
        h('select', { onchange: (e) => { uiBeta.step = +e.target.value; if (uiBeta.rows) { tinhLai(); dat({}); } } },
          [[1, 'bt.f.d'], [5, 'bt.f.w'], [21, 'bt.f.m']].map(([v, k]) => h('option', { value: String(v), selected: uiBeta.step === v }, t(k))))),
      h('button', { type: 'button', class: 'btn sm', onclick: tinh }, t('bt.run')),
      h('label', { class: 'btn ghost sm bt-file' }, t('bt.file'), file)),
    r === null ? h('p', { class: 'msg warn' }, t('bt.none')) : null,
    r ? h('div', {},
      h('div', { class: 'dl-cards' },
        card(t('bt.raw'), r.beta.toFixed(4), 'em', t('bt.raw.hint', { n: r.n, from: ngay(r.from), to: ngay(r.to) })),
        card(t('bt.adj'), (r.beta * 2 / 3 + 1 / 3).toFixed(4), '', t('bt.adj.hint')),
        card('R²', r.r2.toFixed(3), r.r2 < 0.1 ? 'gold' : '', t('bt.r2.hint')),
        card(t('bt.kind'), t(r.kind === 'return' ? 'bt.k.ret' : 'bt.k.price'))),
      r.r2 < 0.1 ? h('p', { class: 'msg warn' }, t('bt.lowR2')) : null,
      h('button', { type: 'button', class: 'btn sm', disabled: Math.abs((V.beta || 0) - r.beta) < 1e-9, onclick: () => dat({ beta: Math.round(r.beta * 10000) / 10000 }) },
        t('bt.use', { b: r.beta.toFixed(4) }))) : null);
}

// ─── Bảng dự phóng: năm actual (A) cạnh năm dự phóng (F), tham số sửa được từng năm ─────────

const DRIVERS = ['growth', 'margin', 'da', 'capex', 'nwc', 'tax'];
/** Dòng tham số doanh thu của từng cách dự phóng (dòng "tăng trưởng" thành số tính ra khi không ở cách % tăng trưởng). */
const dong0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('vi-VN') : '—');
const DRIVERS_DT = { growth: ['growth'], volprice: ['vol', 'price'], stores: ['storesAdd', 'perStore'], manual: [] };
function bangDuPhong(a, r, V, dat, money, ul) {
  const H = r.hist || [], F = r.flows;
  const namGoc = a.base.months === 12 && !a.base.ltm ? a.base.year : null;
  const nhanF = (f) => (namGoc ? `${namGoc + f.t}F` : t('dv.yearN', { n: f.t }));
  const setBy = (k, i, v) => {
    const arr = Array.from({ length: Math.max(V.byYear[k]?.length || 0, F.length) }, (_, j) => V.byYear[k]?.[j] ?? null);
    arr[i] = v;
    dat({ byYear: { ...V.byYear, [k]: arr } });
  };
  const TRUONG = { growth: 'growth', margin: 'margin', da: 'daPct', capex: 'capexPct', nwc: 'nwcPct', tax: 'tax', vol: 'vol', price: 'price', perStore: null, storesAdd: null };
  const laSo = (k) => k === 'storesAdd';                                  // số cửa hàng mở thêm: số nguyên, không phải %
  const oF = (k, f) => h('input', { type: 'number', step: laSo(k) ? '1' : '0.1', class: `dv-yr${f.ghiDe[k] ? ' on' : ''}`, 'aria-label': `${t(`dv.r.${k}`)} ${nhanF(f)}`,
    value: f.ghiDe[k] ? String(laSo(k) ? V.byYear[k][f.t - 1] : +(V.byYear[k][f.t - 1] * 100).toFixed(4)) : '',
    placeholder: laSo(k) ? String(V.rev.storesAdd) : k === 'perStore' ? (V.rev.perStore * 100).toFixed(1) : Number.isFinite(f[TRUONG[k]]) ? (f[TRUONG[k]] * 100).toFixed(1) : '',
    onchange: (e) => setBy(k, f.t - 1, e.target.value === '' ? null : laSo(k) ? Math.round(+e.target.value) : +e.target.value / 100) });
  const oTay = (f) => h('input', { type: 'number', step: 'any', class: `dv-yr${Number.isFinite(V.rev.manual[f.t - 1]) ? ' on' : ''}`, 'aria-label': `${t('dv.r.manual')} ${nhanF(f)}`,
    value: Number.isFinite(V.rev.manual[f.t - 1]) ? String(+(V.rev.manual[f.t - 1] / a.unitDong).toFixed(2)) : '', placeholder: (f.rev / a.unitDong).toFixed(0),
    onchange: (e) => { const m = Array.from({ length: F.length }, (_, j) => V.rev.manual[j] ?? null); m[f.t - 1] = e.target.value === '' ? null : +e.target.value * a.unitDong; dat({ rev: { ...V.rev, manual: m } }); } });
  const histPct = { growth: 'growth', margin: 'margin', da: 'da', capex: 'capex', nwc: 'nwc', tax: 'tax' };
  const dong = (nhan, hv, fv, cls = '') => h('tr', { class: cls }, h('td', {}, nhan), H.map((x) => h('td', { class: 'num dv-a' }, hv(x))), F.map((f) => h('td', { class: 'num' }, fv(f))));
  const coGhiDe = Object.values(V.byYear).some((arr) => arr?.some((x) => x !== null)) || V.rev.manual.some((x) => x !== null);
  return h('div', {},
    h('p', { class: 'priv' }, t('dv.tbl.lead', { base: a.base.label, rev: money(r.rev0), unit: ul })),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-proj' },
      h('thead', {}, h('tr', {}, h('th', {}, ul), H.map((x) => h('th', { class: 'num dv-a' }, `${x.label} A`)), F.map((f) => h('th', { class: 'num' }, nhanF(f))))),
      h('tbody', {},
        h('tr', { class: 'dv-grp' }, h('td', { colspan: String(1 + H.length + F.length) }, t('dv.grp.drivers'))),
        (DRIVERS_DT[V.revMode] || []).filter((k) => k !== 'growth').map((k) => dong(t(`dv.r.${k}`), () => '', (f) => oF(k, f))),
        V.revMode === 'manual' ? dong(`${t('dv.r.manual')} (${ul})`, (x) => money(x.rev), (f) => oTay(f)) : null,
        V.revMode === 'stores' ? dong(t('dv.r.stores'), () => '', (f) => dong0(f.stores)) : null,
        DRIVERS.map((k) => (k === 'growth' && V.revMode !== 'growth'
          ? dong(t('dv.r.growth'), (x) => pc(x.growth), (f) => pc(f.growth))
          : dong(t(`dv.r.${k}`), (x) => pc(x[histPct[k]]), (f) => oF(k, f)))),
        h('tr', { class: 'dv-grp' }, h('td', { colspan: String(1 + H.length + F.length) }, t('dv.grp.calc'))),
        dong(t('dv.r.rev'), (x) => money(x.rev), (f) => money(f.rev)),
        dong(t('dv.r.ebit'), (x) => money(x.ebit), (f) => money(f.ebit)),
        dong(t('dv.r.nopat'), () => '', (f) => money(f.nopat)),
        dong(t('dv.r.daRow'), () => '', (f) => money(f.da)),
        dong(t('dv.r.capexRow'), () => '', (f) => money(-f.capex)),
        dong(t('dv.r.dNwc'), () => '', (f) => money(-f.dNwc)),
        dong(t('dv.r.fcff'), (x) => money(x.fcff), (f) => money(f.fcff), 'dl-tot'),
        dong(t('dv.r.df'), () => '', (f) => (1 / (1 + r.W.wacc) ** f.t).toFixed(4)),
        dong(t('dv.r.pv'), () => '', (f) => money(f.fcff / (1 + r.W.wacc) ** f.t))))),
    h('p', { class: 'priv dv-how' }, t('dv.how')),
    coGhiDe ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => dat({ byYear: {}, rev: { ...V.rev, manual: [] } }) }, t('dv.clearYear')) : null);
}

function sensTable(r, money, gia) {
  const S = r.sens;
  const o = (v) => (S.perShare ? dong(v) : money(v));
  return h('div', {},
    h('h4', {}, t('dv.sens'), h('small', { class: 'priv' }, ` (${t(S.perShare ? 'dv.sens.ps' : 'dv.sens.eq')})`)),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-sens' },
      h('thead', {}, h('tr', {}, h('th', {}, 'g \\ WACC'), S.w.map((w, j) => h('th', { class: `num${j === 3 ? ' dl-base' : ''}` }, pc(w, 2))))),
      h('tbody', {}, S.g.map((g, i) => h('tr', {}, h('th', { class: i === 3 ? 'dl-base' : '' }, pc(g, 2)),
        S.grid[i].map((v, j) => h('td', { class: `num${i === 3 && j === 3 ? ' dv-mid' : ''}`, style: S.perShare ? heatStyle(v, gia) : null }, v === null ? '—' : o(v))))))),
      S.perShare && gia ? h('p', { class: 'priv' }, t('dv.sens.heat', { p: dong(gia) })) : null));
}

// ─── Giá mục tiêu gia quyền + định giá nhanh ───────────────

export function targetBlock(a, inp, save, money) {
  const V = inp.val;
  const r = dcfValuation(a, V);
  const B = a.base.m, v = a.valuation, nam = 12 / (a.base.months || 12);
  const cp = compsAnalysis(inp.peers, { rev: B.rev === null ? null : B.rev * nam, ebitda: v.ebitdaAnnual, npat: v.earnings, equity: B.equityParent, shares: v.shares,
    bridge: (ev) => ev - (v.netDebt || 0) - v.debtLikeSum - (v.minority || 0) + v.nonOpSum });
  const b = blendedTarget(a, r, { evRev: cp.implied.find((x) => x.key === 'evRev')?.equity ?? null });
  if (!b) return null;
  const datW = (k, v) => save({ val: { ...V, weights: { ...V.weights, [k]: v } } });
  const q = quickAnchors(a, r);
  const tong = Object.values(V.weights).reduce((s, x) => s + x, 0);
  return sec('tg',
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t' },
      h('thead', {}, h('tr', {}, h('th', {}, t('dl.m.method')), h('th', { class: 'num' }, t('tg.weight')), h('th', { class: 'num' }, t('tg.used')),
        h('th', { class: 'num' }, t('dl.m.eq')), h('th', { class: 'num' }, t('dl.m.ps')))),
      h('tbody', {}, b.rows.map((x) => h('tr', { class: x.used ? '' : 'src-off' },
        h('td', {}, t(`tg.m.${x.key}`)),
        h('td', { class: 'num' }, h('input', { type: 'number', min: '0', max: '100', step: '5', class: 'dl-mult', value: String(V.weights[x.key]), onchange: (e) => datW(x.key, +e.target.value || 0) })),
        h('td', { class: 'num' }, pc(x.share, 0)),
        h('td', { class: 'num' }, money(x.equity)),
        h('td', { class: 'num' }, x.price === null ? '—' : dong(x.price))))))),
    tong !== 100 ? h('p', { class: 'priv' }, t('tg.renorm', { n: tong })) : null,
    h('div', { class: 'dl-cards' },
      card(t('tg.price'), b.price !== null ? vnd(b.price) : money(b.equity), 'em'),
      card(t('dv.upside'), pc(b.upside), b.upside === null ? '' : b.upside >= 0 ? 'em' : 'red', V.price ? t('tg.vs', { p: dong(V.price) }) : t('tg.needPrice')),
      card(t('tg.rec'), b.rec ? t(`tg.rec.${b.rec}`) : '—', b.rec ? REC_TONE[b.rec] : '', t('tg.scale'))),
    q ? h('div', {},
      h('h4', {}, t('tg.quick')),
      h('p', { class: 'priv' }, t('tg.quick.lead')),
      h('div', { class: 'dl-cards' },
        card(t('tg.epv'), vnd(q.epv), '', t('tg.epv.hint')),
        card(t('tg.jpb'), vnd(q.pbPrice), '', t('tg.jpb.hint', { v: lan(q.justPb), roe: pc(q.roe) })),
        card(t('tg.graham'), vnd(q.graham), '', t('tg.graham.hint')),
        card(t('tg.impliedG'), pc(q.impliedG), '', t('tg.impliedG.hint')))) : null);
}

/** Piotroski F-score giữa hai năm gần nhất (thêm vào khối chất lượng lợi nhuận). */
export function piotroskiCard(a, ZONE_TONE) {
  const ys = a.cols.filter((c) => c.months === 12 && !c.ltm);
  const c = ys[ys.length - 1], p = ys[ys.length - 2];
  const f = c && p ? piotroski(c.v, p.v, c.m.shares, p.m.shares) : null;
  return h('div', { class: `hbox ${f ? ZONE_TONE[f.zone] : ''}` },
    h('span', { class: 'hlbl' }, t('dl.q.piotroski')),
    h('b', {}, f ? `${f.score}/${f.max}` : '—'),
    f ? h('span', { class: `tag ${ZONE_TONE[f.zone]}` }, t(`dl.zone.${f.zone}`)) : null,
    h('small', { class: 'priv', style: { marginTop: '2px' } }, f ? (f.missing.length ? t('dl.q.missing', { v: f.missing.join(', ') }) : t('dl.q.piotroski.hint')) : t('dl.q.need2y')));
}

// ─── Thương vụ mua cổ phần ─────────────────────────────────

const uiMna = { open: false };
export function mnaBlock(a, inp, save, money, unit, ul) {
  const M = inp.mna;
  const dat = (patch) => save({ mna: { ...M, ...patch } });
  const v = a.valuation, B = a.base.m;
  const r0 = dcfValuation(a, inp.val);
  const acq = { npat: v.earnings, shares: v.shares, price: inp.val.price, netDebt: B.netDebt, ebitda: v.ebitdaAnnual, tax: r0?.d?.tax };
  const tien = (label, k) => oNum(`${label} (${ul})`, M[k] ? +(M[k] / unit).toFixed(4) : null, (x) => dat({ [k]: (x || 0) * unit }));
  const thamSo = h('div', { class: 'dv-grid' },
    h('label', { class: 'dv-f dv-wide' }, h('span', {}, t('ma.name')), h('input', { type: 'text', value: M.name, maxlength: 120, onchange: (e) => dat({ name: e.target.value }) })),
    oPct(t('ma.stake'), M.stake, null, (x) => dat({ stake: x ?? 0.51 })),
    tien(t('ma.price'), 'price'),
    tien(t('ma.equity'), 'equity'),
    tien(t('ma.fvAdj'), 'fvAdj'),
    tien(t('ma.npat'), 'npat'),
    tien(t('ma.ebitda'), 'ebitda'),
    tien(t('ma.netDebt'), 'netDebt'),
    oNum(t('ma.months'), M.months, (x) => dat({ months: x ?? 12 }), { step: '1' }),
    oNum(t('ma.gwYears'), M.gwYears, (x) => dat({ gwYears: x ?? 10 }), { step: '1' }),
    oPct(t('ma.cash'), M.cash, null, (x) => dat({ cash: x ?? 0 }), '5'),
    oPct(t('ma.debt'), M.debt, null, (x) => dat({ debt: x ?? 0 }), '5'),
    oPct(t('ma.shares'), M.shares, null, (x) => dat({ shares: x ?? 0 }), '5'),
    oPct(t('ma.kd'), M.kd, null, (x) => dat({ kd: x ?? 0.08 })),
    oPct(t('ma.cashYield'), M.cashYield, null, (x) => dat({ cashYield: x ?? 0.04 })),
    oNum(t('ma.issuePrice'), M.issuePrice, (x) => dat({ issuePrice: x || 0 }), { suffix: t('dv.cur'), placeholder: inp.val.price ? String(inp.val.price) : '' }),
    tien(t('ma.intrinsic'), 'intrinsic'));
  // Ghi trạng thái ngay lúc bấm (đồng bộ): ô nhập kế tiếp vẽ lại khối thì vẫn mở đúng như người dùng để.
  const head = h('summary', { onclick: (e) => { uiMna.open = !e.currentTarget.parentElement.open; } }, h('b', {}, t('ma.h')), ' ', h('span', { class: 'tag' }, M.name || t('ma.tag')));
  // Mở / đóng khối nhớ trong biến của trang, không ghi vào thông số: sự kiện "toggle" đến SAU lần lưu
  // ô nhập, ghi thông số từ đó là ghi đè bằng bản cũ (mất số vừa nhập).
  const khung = (...kids) => h('details', { class: 'dl-sec dv-mna', open: uiMna.open }, head, ...kids);
  if (!M.price || !M.stake) return khung(h('p', { class: 'priv' }, t('ma.lead')), thamSo, h('p', { class: 'msg' }, t('ma.need')));
  const r = mnaAnalysis(acq, M);
  const ia = r.implied;
  return khung(
    h('p', { class: 'priv' }, t('ma.lead')),
    thamSo,
    r.issues.map((k) => h('p', { class: `msg ${['dilutive', 'overpay', 'noIssuePrice'].includes(k) ? 'warn' : ''}` }, t(`ma.issue.${k}`, { y: M.gwYears }))),
    h('h4', {}, t('ma.acct')),
    h('div', { class: 'dl-cards' },
      card(t('ma.gw'), money(r.goodwill), r.goodwill < 0 ? 'gold' : '', t('ma.gw.hint', { fv: money(r.fvNet), s: pc(M.stake, 0), share: money(r.share) })),
      card(t('ma.gwAmort'), money(r.gwAmort), '', t('ma.gwAmort.hint', { y: M.gwYears })),
      card(t('ma.nci'), money(r.nci), '', t(r.control ? 'ma.nci.hint' : 'ma.nci.none')),
      card(t('ma.paid'), `${lan(ia.pe)} · ${lan(ia.pb)}`, '', t('ma.paid.hint', { ev: lan(ia.evEbitda), eq: money(ia.equity100) }))),
    h('h4', {}, t('ma.eps')),
    h('div', { class: 'dl-cards' },
      card(t('ma.epsBefore'), vnd(r.epsBefore)),
      card(t('ma.epsAfter'), vnd(r.epsAfter), r.accretion === null ? '' : r.accretion >= 0 ? 'em' : 'red', t('ma.acc', { v: pc(r.accretion) })),
      card(t('ma.epsY1'), vnd(r.epsAfterY1), '', t('ma.acc1', { v: pc(r.accretionY1), m: M.months })),
      card(t('ma.breakeven'), money(r.breakeven), r.breakeven !== null && M.price > r.breakeven ? 'gold' : 'em', t('ma.breakeven.hint'))),
    h('div', { class: 'dl-cards' },
      card(t('ma.fin'), money(r.finCost), '', t('ma.fin.hint', { d: money(r.debtRaised), c: money(r.cashUsed), n: dong(r.newShares) })),
      card(t('ma.lev'), `${lan(r.leverage.before)} → ${lan(r.leverage.after)}`, r.leverage.after > a.inputs.targetLev ? 'red' : '', t('ma.lev.hint', { t: a.inputs.targetLev })),
      card(t('ma.value'), r.valueCreated === null ? '—' : money(r.valueCreated), r.valueCreated === null ? '' : r.valueCreated >= 0 ? 'em' : 'red', t(r.valueCreated === null ? 'ma.value.need' : 'ma.value.hint'))));
}

// ─── So sánh cùng ngành (16.Comps) ─────────────────────────

const uiComps = { paste: false };
export function compsBlock(a, inp, save, money, unit, ul) {
  const v = a.valuation, B = a.base.m;
  const peers = inp.peers;
  const datP = (list) => save({ peers: list });
  const sua = (i, patch) => datP(peers.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const nam = 12 / (a.base.months || 12);
  const bridge = (ev) => ev - (v.netDebt || 0) - v.debtLikeSum - (v.minority || 0) + v.nonOpSum;
  const r = compsAnalysis(peers, { rev: B.rev === null ? null : B.rev * nam, ebitda: v.ebitdaAnnual, npat: v.earnings, equity: B.equityParent, shares: v.shares, bridge });
  const dcf = dcfValuation(a, inp.val);
  // Dòng của chính công ty đang phân tích (như dòng DGW của model) — cần giá thị trường + số cổ phiếu.
  const me = inp.val.price && v.shares ? peerMultiples({ price: inp.val.price, fx: 1, shares: v.shares, cash: B.cash || 0, debt: B.debt || 0,
    rev: B.rev === null ? null : B.rev * nam, ebitda: v.ebitdaAnnual, npat: v.earnings, equity: B.equityParent }) : null;

  const oTien = (p, i, k) => h('input', { type: 'number', step: 'any', class: 'cp-in', 'aria-label': `${t(`cp.c.${k}`)} — ${p.name}`,
    value: Number.isFinite(p[k]) ? String(+(p[k] / unit).toFixed(4)) : '', onchange: (e) => sua(i, { [k]: e.target.value === '' ? null : +e.target.value * unit }) });
  const oSo = (p, i, k, step = 'any') => h('input', { type: 'number', step, class: 'cp-in', 'aria-label': `${t(`cp.c.${k}`)} — ${p.name}`,
    value: Number.isFinite(p[k]) ? String(p[k]) : '', onchange: (e) => sua(i, { [k]: e.target.value === '' ? null : +e.target.value }) });
  const x = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
  const nhom = MULTS.map((k) => h('th', { class: 'num' }, t(`cp.m.${k}`)));
  const head = h('tr', {}, h('th', {}, ''), h('th', {}, t('cp.c.name')),
    ['price', 'fx', 'shares'].map((k) => h('th', { class: 'num' }, t(`cp.c.${k}`))),
    ['cash', 'debt', 'rev', 'ebitda', 'npat', 'equity'].map((k) => h('th', { class: 'num' }, `${t(`cp.c.${k}`)} (${ul})`)),
    h('th', {}, ''));
  const dongPeer = r.rows.map((p, i) => h('tr', { class: p.off ? 'src-off' : '' },
    h('td', { class: 'chk-c' }, h('input', { type: 'checkbox', checked: !p.off, 'aria-label': t('cp.use', { name: p.name }), onchange: (e) => sua(i, { off: !e.target.checked }) })),
    h('td', {}, h('input', { type: 'text', class: 'cp-name', value: p.name, maxlength: 80, 'aria-label': t('cp.c.name'), onchange: (e) => sua(i, { name: e.target.value }) })),
    h('td', { class: 'num' }, oSo(p, i, 'price')), h('td', { class: 'num' }, oSo(p, i, 'fx')), h('td', { class: 'num' }, oSo(p, i, 'shares', '1')),
    ['cash', 'debt', 'rev', 'ebitda', 'npat', 'equity'].map((k) => h('td', { class: 'num' }, oTien(p, i, k))),
    h('td', {}, h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': t('cp.del', { name: p.name }), onclick: () => datP(peers.filter((_, j) => j !== i)) }, '✕'))));
  // Bảng kết quả tách riêng khỏi bảng nhập: bội số và trung vị luôn thấy ngay, không phải cuộn ngang.
  const dongKq = r.rows.map((p) => h('tr', { class: p.off ? 'src-off' : '' }, h('td', {}, p.name),
    h('td', { class: 'num' }, money(p.m.cap)), h('td', { class: 'num' }, money(p.m.ev)), MULTS.map((k) => h('td', { class: 'num' }, x(p.m[k])))));
  const thongKe = ['median', 'mean', 'q1', 'q3'].map((s) => h('tr', { class: s === 'median' ? 'dl-tot' : 'dl-sub' },
    h('td', { colspan: '3' }, t(`cp.s.${s}`)), MULTS.map((k) => h('td', { class: 'num' }, x(r.stats[k][s])))));
  const dongMe = me ? h('tr', { class: 'cp-me' }, h('td', {}, t('cp.me')),
    h('td', { class: 'num' }, money(me.cap)), h('td', { class: 'num' }, money(me.ev)), MULTS.map((k) => h('td', { class: 'num' }, x(me[k])))) : null;
  const bangKq = peers.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t cp-r' },
    h('thead', {}, h('tr', {}, h('th', {}, t('cp.c.name')), h('th', { class: 'num' }, `${t('cp.cap')} (${ul})`), h('th', { class: 'num' }, `EV (${ul})`), nhom)),
    h('tbody', {}, dongKq, thongKe, dongMe))) : null;

  const dan = uiComps.paste ? (() => {
    const o = h('textarea', { rows: 5, placeholder: t('cp.paste.ph', { unit: ul }), 'aria-label': t('cp.paste') });
    return h('div', { class: 'gy-f' }, h('p', { class: 'priv' }, t('cp.paste.lead', { unit: ul })), o,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', onclick: () => {
        const moi = parsePeers(o.value, unit);
        if (!moi.length) { o.focus(); return; }
        uiComps.paste = false;
        datP([...peers, ...moi]);
      } }, t('cp.paste.go'))));
  })() : null;

  const duDai = MULTS.filter((k) => k !== 'evRev').every((k) => r.stats[k].n >= 2 || r.stats[k].n === 0) && ['evEbitda', 'pe', 'pb'].some((k) => r.stats[k].n >= 2);
  const lam = (k) => [r.stats[k].q1, r.stats[k].median, r.stats[k].q3].map((n) => Math.round(n * 10) / 10);
  const apDung = () => {
    const patch = {};
    for (const k of ['evEbitda', 'pe', 'pb']) if (r.stats[k].n >= 2) patch[k] = lam(k);
    save(patch);
  };
  const ngam = r.implied.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t' },
    h('thead', {}, h('tr', {}, h('th', {}, t('dl.m.method')), h('th', { class: 'num' }, t('cp.i.mult')), h('th', { class: 'num' }, t('cp.i.metric')),
      h('th', { class: 'num' }, t('cp.i.ev')), h('th', { class: 'num' }, t('dl.m.eq')), h('th', { class: 'num' }, t('dl.m.ps')), h('th', { class: 'num' }, t('cp.i.vsDcf')))),
    h('tbody', {}, r.implied.map((m) => h('tr', {},
      h('td', {}, t(`cp.m.${m.key}`)), h('td', { class: 'num' }, x(m.mult)), h('td', { class: 'num' }, money(m.metric)),
      h('td', { class: 'num' }, m.ev === null ? '—' : money(m.ev)), h('td', { class: 'num' }, money(m.equity)),
      h('td', { class: 'num' }, vnd(m.price)),
      h('td', { class: 'num' }, dcf?.price && m.price !== null ? pc(m.price / dcf.price - 1) : '—')))))) : null;

  return sec('cp',
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t cp-t' }, h('thead', {}, head), h('tbody', {}, dongPeer))),
    !peers.length ? h('p', { class: 'msg' }, t('cp.empty')) : null,
    h('div', { class: 'row cp-bar' },
      h('button', { type: 'button', class: 'btn ghost sm', onclick: () => datP([...peers, { name: t('cp.new'), fx: 1 }]) }, t('cp.add')),
      h('button', { type: 'button', class: 'btn ghost sm', 'aria-expanded': String(uiComps.paste), onclick: () => { uiComps.paste = !uiComps.paste; save({}); } }, t('cp.paste')),
      h('button', { type: 'button', class: 'btn sm', disabled: !duDai, title: t('cp.apply.hint'), onclick: apDung }, t('cp.apply'))),
    dan,
    bangKq ? h('h4', {}, t('cp.mults')) : null,
    bangKq,
    ngam ? h('h4', {}, t('cp.implied')) : null,
    ngam);
}

// ─── Thiết lập mô hình: mẫu ngành · cách dự phóng doanh thu · giá trị cuối kỳ · kịch bản ─────────

function setupBlock(a, r, V, dat, money, ul) {
  const chon = (label, val, opts, onSet) => h('label', { class: 'dv-f dv-sel' }, h('span', {}, label),
    h('select', { onchange: (e) => onSet(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))));
  const preset = V.preset ? PRESETS.find((p) => p.id === V.preset) : null;
  const R = V.rev;
  const datR = (patch) => dat({ rev: { ...R, ...patch } });
  const cheDo = {
    growth: () => h('p', { class: 'priv' }, t('dv.rm.growth.hint')),
    volprice: () => h('div', { class: 'dv-grid' }, oPct(t('dv.r.vol'), R.vol, null, (v) => datR({ vol: v ?? 0 })), oPct(t('dv.r.price'), R.price, null, (v) => datR({ price: v ?? 0 }))),
    stores: () => h('div', { class: 'dv-grid' },
      oNum(t('dv.stores0'), R.stores0, (v) => datR({ stores0: v }), { step: '1' }),
      oNum(t('dv.r.storesAdd'), R.storesAdd, (v) => datR({ storesAdd: v ?? 0 }), { step: '1' }),
      oPct(t('dv.r.perStore'), R.perStore, null, (v) => datR({ perStore: v ?? 0 })),
      R.stores0 && r.rev0 ? h('p', { class: 'priv dv-wide' }, t('dv.perStore0', { v: money(r.rev0 / R.stores0), unit: ul })) : null),
    manual: () => h('p', { class: 'priv' }, t('dv.rm.manual.hint')),
  };
  const S = V.scen;
  const datS = (k, patch) => dat({ scen: { ...S, [k]: k === 'on' || k === 'baseP' ? patch : { ...S[k], ...patch } } });
  const kb = scenarioValuation(a, V);
  const scenRow = (k) => h('tr', {}, h('td', {}, t(`dv.sc.${k}`)),
    ['growth', 'margin', 'wacc'].map((f) => h('td', { class: 'num' }, h('input', { type: 'number', step: '0.5', class: 'dv-yr', value: String(+(S[k][f] * 100).toFixed(2)),
      'aria-label': `${t(`dv.sc.${k}`)} ${t(`dv.sc.${f}`)}`, onchange: (e) => datS(k, { [f]: (+e.target.value || 0) / 100 }) }))),
    h('td', { class: 'num' }, h('input', { type: 'number', step: '5', min: '0', max: '100', class: 'dv-yr', value: String(S[k].p), onchange: (e) => datS(k, { p: +e.target.value || 0 }) })),
    h('td', { class: 'num' }, kb ? vnd(kb.rows.find((x) => x.key === k)?.price) : '—'));
  return h('div', { class: 'dv-setup' },
    h('h4', {}, t('dv.setup')),
    h('div', { class: 'dv-grid' },
      chon(t('dv.preset'), V.preset, [['', t('dv.preset.none')], ...PRESETS.map((p) => [p.id, t(`preset.${p.id}.name`)])], (v) => dat(v ? applyPreset(V, v) : { preset: '' })),
      chon(t('dv.revMode'), V.revMode, REV_MODES.map((m) => [m, t(`dv.rm.${m}`)]), (v) => dat({ revMode: v })),
      chon(t('dv.tvMethod'), V.tvMethod, TV_METHODS.map((m) => [m, t(`dv.tv.${m}`)]), (v) => dat({ tvMethod: v }))),
    preset ? h('div', { class: 'dv-tips' },
      h('p', {}, h('b', {}, t('dv.tip.rev')), ' ', t(`preset.${preset.id}.rev`)),
      h('p', {}, h('b', {}, t('dv.tip.val')), ' ', t(`preset.${preset.id}.val`)),
      h('p', { class: 'dv-trap' }, h('b', {}, t('dv.tip.trap')), ' ', t(`preset.${preset.id}.trap`))) : null,
    cheDo[V.revMode]?.(),
    h('details', { class: 'dv-scen', open: S.on },
      h('summary', {}, h('label', { onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: S.on, onchange: (e) => datS('on', e.target.checked) }), ' ', h('b', {}, t('dv.sc.h'))),
        kb?.expected.price ? h('span', { class: 'tag em' }, t('dv.sc.exp', { p: dong(kb.expected.price) })) : null),
      h('p', { class: 'priv' }, t('dv.sc.lead')),
      S.on ? h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), ['growth', 'margin', 'wacc'].map((f) => h('th', { class: 'num' }, t(`dv.sc.${f}`))), h('th', { class: 'num' }, t('dv.sc.p')), h('th', { class: 'num' }, t('dl.m.ps')))),
        h('tbody', {}, scenRow('bear'),
          h('tr', {}, h('td', {}, t('dv.sc.base')), h('td', { colspan: '3', class: 'priv' }, t('dv.sc.baseHint')),
            h('td', { class: 'num' }, h('input', { type: 'number', step: '5', min: '0', max: '100', class: 'dv-yr', value: String(S.baseP), onchange: (e) => datS('baseP', +e.target.value || 0) })),
            h('td', { class: 'num' }, kb ? vnd(kb.rows.find((x) => x.key === 'base')?.price) : '—')),
          scenRow('bull')))) : null,
      kb && kb.pSum !== 100 ? h('p', { class: 'priv' }, t('dv.sc.renorm', { n: kb.pSum })) : null));
}

// ─── Bảng điều khiển định giá: thẻ số chính + football field + thác nước + doanh thu & FCFF ─────────

export function dvDashboard(a, inp, money, ul) {
  const V = inp.val, v = a.valuation, B = a.base.m, sh = v.shares;
  const r = dcfValuation(a, V);
  if (!r) return null;
  const nam = 12 / (a.base.months || 12);
  const cp = compsAnalysis(inp.peers, { rev: B.rev === null ? null : B.rev * nam, ebitda: v.ebitdaAnnual, npat: v.earnings, equity: B.equityParent, shares: sh,
    bridge: (ev) => ev - (v.netDebt || 0) - v.debtLikeSum - (v.minority || 0) + v.nonOpSum });
  const b = blendedTarget(a, r, { evRev: cp.implied.find((x) => x.key === 'evRev')?.equity ?? null });
  const kb = scenarioValuation(a, V);
  const q = quickAnchors(a, r);
  const ps = (eq) => (eq === null || eq === undefined ? null : sh ? eq / sh : eq);
  const gia = sh ? V.price : null;
  const veGia = (x) => (sh ? vnd(x) : money(x));

  // Football field: DCF (dải = độ nhạy WACC ± 0,5 / g ± 0,5), bội số (thấp / giữa / cao), peer, định giá nhanh, kịch bản.
  const rows = [];
  if (r.sens) {
    const o = r.sens.grid.slice(2, 5).flatMap((row) => row.slice(2, 5)).filter(Number.isFinite);
    rows.push({ label: t('tg.m.dcf'), lo: Math.min(...o), mid: r.sens.grid[3][3], hi: Math.max(...o), hl: true });
  }
  if (r.exit?.equity !== null && r.exit) rows.push({ label: t('dv.ff.exit'), mid: ps(r.exit.equity) });
  for (const m of v.methods) rows.push({ label: t(`dl.m.${m.key}`), lo: ps(m.equity[0]), mid: ps(m.equity[1]), hi: ps(m.equity[2]) });
  for (const x of cp.implied) rows.push({ label: t('dv.ff.peer', { m: t(`cp.m.${x.key}`) }), mid: ps(x.equity) });
  if (q?.epv) rows.push({ label: t('tg.epv'), mid: sh ? q.epv : null });
  if (q?.graham) rows.push({ label: t('tg.graham'), mid: sh ? q.graham : null });
  if (kb) rows.push({ label: t('dv.sc.h'), lo: ps(kb.rows[0].equity), mid: ps(kb.expected.equity), hi: ps(kb.rows[2].equity), hl: true });
  const ff = footballChart(rows, { price: gia, target: sh ? b?.price : b?.equity, labels: { price: t('dv.ff.price'), target: t('dv.ff.target'), title: t('dv.ff.h') } });

  const wf = r.flows ? waterfallChart([
    { label: t('dv.wf.pv'), v: r.pv / a.unitDong }, { label: t('dv.wf.tv'), v: r.pvTv / a.unitDong }, { label: 'EV', v: r.ev / a.unitDong, total: true },
    { label: t('dv.wf.nd'), v: -(v.netDebt || 0) / a.unitDong }, { label: t('dv.wf.dl'), v: -v.debtLikeSum / a.unitDong },
    { label: t('dv.wf.nci'), v: -(v.minority || 0) / a.unitDong }, { label: t('dv.wf.no'), v: v.nonOpSum / a.unitDong },
    { label: t('dv.wf.eq'), v: r.equity / a.unitDong, total: true },
  ].filter((x) => x.total || Math.abs(x.v) > 1e-9), { title: t('dv.wf.h') }) : null;

  const nhanF = (f) => (a.base.months === 12 && !a.base.ltm ? `${a.base.year + f.t}F` : t('dv.yearN', { n: f.t }));
  const rf = revFcffChart([
    ...(r.hist || []).map((x) => ({ label: `${String(x.label).replace(/\D+/g, '')}A`, actual: true, rev: x.rev / a.unitDong, fcff: Number.isFinite(x.fcff) ? x.fcff / a.unitDong : null })),
    ...(r.flows || []).map((f) => ({ label: nhanF(f), actual: false, rev: f.rev / a.unitDong, fcff: f.fcff / a.unitDong })),
  ], { names: [t('dv.r.rev'), 'FCFF'], title: t('dv.rf.h') });

  const up = b?.upside ?? null;
  return h('section', { class: 'dl-sec dv-dash' },
    h('h3', {}, t('dv.dash.h')),
    h('div', { class: 'dv-kpi' },
      card(t('tg.price'), b?.price !== null && b?.price !== undefined ? vnd(b.price) : money(b?.equity), 'em', t('dv.dash.blend')),
      card(t('dv.upside'), pc(up), up === null ? '' : up >= 0 ? 'em' : 'red', V.price ? t('tg.vs', { p: dong(V.price) }) : t('tg.needPrice')),
      card(t('tg.rec'), b?.rec ? t(`tg.rec.${b.rec}`) : '—', b?.rec ? REC_TONE[b.rec] : ''),
      card(t('dv.target'), r.price !== null ? vnd(r.price) : money(r.equity), '', t('dv.dash.tv', { m: t(`dv.tv.${V.tvMethod}`), s: pc(r.tvShare, 0) })),
      card('WACC', pc(r.W.wacc, 2), '', `g ${pc(V.g, 1)}`),
      kb ? card(t('dv.sc.exp2'), sh ? vnd(kb.expected.price) : money(kb.expected.equity), 'gold', t('dv.sc.range', { lo: veGia(ps(kb.rows[0].equity)), hi: veGia(ps(kb.rows[2].equity)) })) : null),
    h('div', { class: 'dv-charts' },
      ff ? h('figure', { class: 'chart dv-wide' }, h('figcaption', {}, h('b', {}, t('dv.ff.h')), h('span', { class: 'priv' }, sh ? t('dl.m.ps') : ul)), ff) : null,
      wf ? h('figure', { class: 'chart' }, h('figcaption', {}, h('b', {}, t('dv.wf.h')), h('span', { class: 'priv' }, ul)), wf) : null,
      rf ? h('figure', { class: 'chart' }, h('figcaption', {}, h('b', {}, t('dv.rf.h')), h('span', { class: 'priv' }, ul)), rf) : null));
}
