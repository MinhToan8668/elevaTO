// Hai khối "chi tiết hoá" của phần định giá:
//   · segBuild — dự phóng doanh thu theo từng mảng kinh doanh (revenue build-up): mỗi mảng một doanh thu năm gốc
//     và tăng trưởng riêng (chung + ghi đè từng năm); tổng các mảng khớp về doanh thu hợp nhất năm gốc.
//   · sotpBlock — định giá tổng các phần (SOTP) cho doanh nghiệp nhiều mảng / có công ty con, cổ phần niêm yết,
//     quỹ đất…: mỗi phần một cách định giá (bội số × chỉ tiêu, hoặc nhập thẳng giá trị từ DCF / RNAV riêng).
// Số do core/valuation.js và core/sotp.js tính; ở đây chỉ vẽ và nhận thông số.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { sotpValuation, SOTP_KINDS, SOTP_BASIS } from '../core/sotp.js';
import { gmMang } from '../core/valuation.js';

const uiSeg = { detail: false };

const pc = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const dong = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('vi-VN') : '—');
const so = (v) => (v === '' ? null : +v);
const oIn = (val, onSet, { step = 'any', cls = 'dv-yr', aria = '', placeholder = '', disabled = false } = {}) => h('input', {
  type: 'number', step, class: cls, value: val === null || val === undefined ? '' : String(val), placeholder, 'aria-label': aria, disabled,
  onchange: (e) => onSet(so(e.target.value)) });
const oText = (val, onSet, aria, placeholder = '') => h('input', { type: 'text', class: 'dv-name', value: val, maxlength: 80, 'aria-label': aria, placeholder, onchange: (e) => onSet(e.target.value) });
const xoa = (onclick, aria) => h('button', { type: 'button', class: 'btn ghost sm', 'aria-label': aria, onclick }, '✕');

// ─── Revenue build-up theo mảng ────────────────────────────

/**
 * @param r kết quả dcfValuation (r.segs: danh sách mảng đang dùng, r.flows[].segs: doanh thu từng mảng từng năm)
 */
export function segBuild(a, r, V, dat, money, ul) {
  const u = a.unitDong;
  // Chưa nhập mảng nào thì lấy theo thuyết minh báo cáo bộ phận; sửa ô nào thì ghi cả danh sách vào thông số.
  const ds = V.segs.length ? V.segs : (a.segments || []).map((x) => ({ name: x.name, rev0: null, g: null, gy: [] }));
  const ghi = (i, patch) => dat({ segs: ds.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const theoTm = (x) => (a.segments || []).find((y) => y.name === x.name)?.revenue ?? null;
  const F = r.flows || [];
  const namGoc = a.base.months === 12 && !a.base.ltm ? a.base.year : null;
  const nhanF = (f) => (namGoc ? `${namGoc + f.t}F` : t('dv.yearN', { n: f.t }));
  const them = h('button', { type: 'button', class: 'btn ghost sm', onclick: () => dat({ segs: [...ds, { name: t('dv.seg.new', { n: ds.length + 1 }), rev0: 0, g: null, gy: [] }] }) }, t('dv.seg.add'));
  const layTm = a.segments?.length ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => dat({ segs: a.segments.map((x) => ({ name: x.name, rev0: null, g: null, gy: [] })) }) },
    t('dv.seg.fromNote', { p: a.segments[0].label })) : null;
  const chiTiet = h('button', { type: 'button', class: `btn ghost sm${uiSeg.detail ? ' on' : ''}`, 'aria-pressed': String(uiSeg.detail),
    onclick: () => { uiSeg.detail = !uiSeg.detail; dat({}); } }, t(uiSeg.detail ? 'dv.seg.detail.off' : 'dv.seg.detail'));
  const dau = h('div', { class: 'row cp-bar' }, them, layTm, ds.length ? chiTiet : null);
  if (!ds.length) return h('div', { class: 'dv-segs' }, h('p', { class: 'msg warn' }, t('dv.seg.none')), dau);

  const S = r.segs;
  const coGm = r.mods?.gm || r.fcffSrc === 'model';             // mô hình tích hợp: lợi nhuận gộp theo biên từng mảng
  const gmTm = (x) => (a.segments || []).find((y) => y.name === x.name)?.gm ?? null;
  const tong = S ? S.sum : ds.reduce((s, x) => s + (x.rev0 ?? theoTm(x) ?? 0), 0);
  const cot = 4 + F.length + (coGm ? 1 : 0);
  const gmCell = (x, i) => (coGm ? h('td', { class: 'num' }, oIn(x.gm === null || x.gm === undefined ? null : +(x.gm * 100).toFixed(2), (v) => ghi(i, { gm: v === null ? null : v / 100 }),
    { step: '1', aria: `${x.name} GM`, placeholder: gmTm(x) !== null ? (gmTm(x) * 100).toFixed(1) : Number.isFinite(r.d?.gm) ? (r.d.gm * 100).toFixed(1) : '' })) : null);
  const trong = () => (coGm ? h('td', {}) : null);
  const gyAt = (i, j, v) => { const gy = Array.from({ length: Math.max(ds[i].gy.length, F.length) }, (_, k) => ds[i].gy[k] ?? null); gy[j] = v; ghi(i, { gy }); };
  // Chi tiết như 04.Drivers A–B: biên gộp từng năm (Base), tăng trưởng & biên gộp từng năm cho Bull / Bear, ghi chú căn cứ.
  const dM = r.scenKey && r.scenKey !== 'base' ? V.scen[r.scenKey]?.margin ?? 0 : 0;
  const datMang = (i, f, j, v) => {
    const x = ds[i];
    const sua = (arr) => { const a2 = Array.from({ length: Math.max(arr?.length || 0, F.length) }, (_, k) => arr?.[k] ?? null); a2[j] = v; return a2; };
    if (f === 'gmy') ghi(i, { gmy: sua(x.gmy) });
    else { const [k, g] = f.split('.'); ghi(i, { sc: { ...x.sc, [k]: { ...(x.sc?.[k] || {}), [g]: sua(x.sc?.[k]?.[g]) } } }); }
  };
  const giaTri = (x, f, j) => (f === 'gmy' ? x.gmy?.[j] : x.sc?.[f.split('.')[0]]?.[f.split('.')[1]]?.[j]);
  const dongCT = (x, i, f, nhan) => h('tr', { class: 'dv-segd' }, h('td', {}, `↳ ${nhan}`), h('td', {}), h('td', {}), h('td', {}), trong(),
    F.map((ff, j) => { const v = giaTri(x, f, j); return h('td', { class: 'num' }, oIn(Number.isFinite(v) ? +(v * 100).toFixed(3) : null, (z) => datMang(i, f, j, z === null ? null : z / 100),
      { step: '0.5', cls: `dv-yr${Number.isFinite(v) ? ' on' : ''}`, aria: `${x.name} ${nhan} ${nhanF(ff)}` })); }));
  const chiTietMang = (x, i) => [
    coGm ? dongCT(x, i, 'gmy', t('dv.seg.gmy')) : null,
    dongCT(x, i, 'bull.gy', t('dv.seg.bullG')), coGm ? dongCT(x, i, 'bull.gmy', t('dv.seg.bullGm')) : null,
    dongCT(x, i, 'bear.gy', t('dv.seg.bearG')), coGm ? dongCT(x, i, 'bear.gmy', t('dv.seg.bearGm')) : null,
    h('tr', { class: 'dv-segd' }, h('td', {}, `↳ ${t('dv.seg.note')}`), h('td', { colspan: String(3 + (coGm ? 1 : 0) + F.length) },
      h('input', { type: 'text', class: 'dv-name dv-note', value: x.note || '', maxlength: 300, 'aria-label': `${x.name} ${t('dv.seg.note')}`, placeholder: t('dv.seg.note.ph'),
        onchange: (e) => ghi(i, { note: e.target.value }) }))),
  ];
  const hang = ds.map((x, i) => {
    const goc = x.rev0 ?? theoTm(x) ?? 0;
    return [
      h('tr', { class: 'dv-seg' },
        h('td', {}, h('div', { class: 'dv-segn' }, oText(x.name, (v) => ghi(i, { name: v }), t('dv.seg.name')), xoa(() => dat({ segs: ds.filter((_, j) => j !== i) }), t('dv.seg.del', { n: x.name })))),
        h('td', { class: 'num' }, oIn(x.rev0 === null ? null : +(x.rev0 / u).toFixed(2), (v) => ghi(i, { rev0: v === null ? null : v * u }),
          { aria: `${x.name} ${t('dv.seg.base')}`, placeholder: theoTm(x) !== null ? (theoTm(x) / u).toFixed(0) : '' })),
        h('td', { class: 'num' }, tong ? pc(goc / tong) : '—'),
        h('td', { class: 'num' }, oIn(x.g === null ? null : +(x.g * 100).toFixed(3), (v) => ghi(i, { g: v === null ? null : v / 100 }),
          { step: '0.5', aria: `${x.name} ${t('dv.seg.g')}`, placeholder: Number.isFinite(F[0]?.growth) && x.g === null ? t('dv.seg.gAuto') : '' })),
        gmCell(x, i),
        F.map((f, j) => h('td', { class: 'num' }, oIn(Number.isFinite(x.gy[j]) ? +(x.gy[j] * 100).toFixed(3) : null, (v) => gyAt(i, j, v === null ? null : v / 100),
          { step: '0.5', cls: `dv-yr${Number.isFinite(x.gy[j]) ? ' on' : ''}`, aria: `${x.name} ${nhanF(f)}`,
            placeholder: S && Number.isFinite(f.segs?.[i]) ? pc((f.segs[i] / (j ? F[j - 1].segs[i] : S.list[i].rev0)) - 1).replace('%', '') : '' })))),
      h('tr', { class: 'dl-sub' }, h('td', {}, `↳ ${t('dv.seg.rev')}`), h('td', { class: 'num' }, money(goc)), h('td', {}), h('td', {}), trong(),
        F.map((f) => h('td', { class: 'num' }, Number.isFinite(f.segs?.[i]) ? money(f.segs[i]) : '—'))),
      coGm && S ? h('tr', { class: 'dl-sub' }, h('td', {}, `↳ ${t('dv.seg.gp')}`), h('td', {}), h('td', {}), h('td', {}), trong(),
        F.map((f) => h('td', { class: 'num' }, Number.isFinite(f.segs?.[i]) ? money(f.segs[i] * gmMang(S.list[i], f.t, r.d.gm ?? 0, dM, r.scenKey)) : '—'))) : null,
      ...(uiSeg.detail ? chiTietMang(x, i) : []),
    ];
  });
  const lech = S ? r.rev0 - S.sum : null;
  return h('div', { class: 'dv-segs' },
    h('p', { class: 'priv' }, t('dv.seg.lead')),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-segt' },
      h('thead', {}, h('tr', {}, h('th', {}, t('dv.seg.name')), h('th', { class: 'num' }, `${t('dv.seg.base')} (${ul})`), h('th', { class: 'num' }, t('dv.seg.mix')),
        h('th', { class: 'num' }, t('dv.seg.g')), coGm ? h('th', { class: 'num' }, 'GM %') : null, F.map((f) => h('th', { class: 'num' }, `${nhanF(f)} %`)))),
      h('tbody', {}, hang,
        S ? [
          h('tr', { class: 'dl-sub' }, h('td', {}, t('dv.seg.sum')), h('td', { class: 'num' }, money(S.sum)), h('td', {}), h('td', {}), trong(),
            F.map((f) => h('td', { class: 'num' }, money(f.segs.reduce((x, y) => x + y, 0))))),
          Math.abs(lech) > Math.abs(r.rev0) * 1e-6 ? h('tr', { class: 'dl-sub' }, h('td', {}, t('dv.seg.elim', { k: pc(S.k - 1) })), h('td', { class: 'num' }, money(lech)), h('td', {}), h('td', {}), trong(),
            F.map((f) => h('td', { class: 'num' }, money(f.rev - f.segs.reduce((x, y) => x + y, 0))))) : null,
          h('tr', { class: 'dl-tot' }, h('td', {}, t('dv.seg.total')), h('td', { class: 'num' }, money(r.rev0)), h('td', {}), h('td', {}), trong(), F.map((f) => h('td', { class: 'num' }, money(f.rev)))),
          h('tr', {}, h('td', {}, t('dv.r.growthRow')), h('td', {}), h('td', {}), h('td', {}), trong(), F.map((f) => h('td', { class: 'num' }, pc(f.growth)))),
          coGm ? h('tr', { class: 'dl-tot' }, h('td', {}, t('dv.r.gp')), h('td', {}), h('td', {}), h('td', {}), trong(), F.map((f) => h('td', { class: 'num' }, money(f.gp)))) : null,
          coGm ? h('tr', {}, h('td', {}, t('dv.r.gmRow')), h('td', {}), h('td', {}), h('td', {}), trong(), F.map((f) => h('td', { class: 'num' }, pc(f.gm)))) : null,
        ] : h('tr', {}, h('td', { colspan: String(cot) }, t('dv.seg.noBase')))))),
    dau);
}

// ─── SOTP ──────────────────────────────────────────────────

export function sotpBlock(a, inp, save, money, unit, ul) {
  const S = inp.sotp;
  const dat = (patch) => save({ sotp: { ...S, ...patch } });
  const ghi = (i, patch) => dat({ items: S.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const res = sotpValuation(a, S);
  const tien = (v) => (v === null ? null : +(v / unit).toFixed(4));
  const moi = (patch = {}) => ({ name: t('so.new', { n: S.items.length + 1 }), kind: 'mult', basis: 'ev', metric: null, mult: null, value: null, own: 1, ...patch });
  const nut = h('div', { class: 'row cp-bar' },
    h('button', { type: 'button', class: 'btn ghost sm', onclick: () => dat({ items: [...S.items, moi()] }) }, t('so.add')),
    a.segments?.length ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => dat({ items: [...S.items, ...a.segments.map((x) => moi({ name: x.name }))] }) }, t('so.fromSeg')) : null,
    h('button', { type: 'button', class: 'btn ghost sm', onclick: () => dat({ items: [...S.items, moi({ name: t('so.stake'), kind: 'value', basis: 'equity' })] }) }, t('so.addStake')));
  const sel = (val, opts, onSet, aria) => h('select', { class: 'dv-mini', 'aria-label': aria, onchange: (e) => onSet(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
  const bang = S.items.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-sotp' },
    h('thead', {}, h('tr', {}, ['so.c.name', 'so.c.kind', 'so.c.basis'].map((k) => h('th', {}, t(k))),
      h('th', { class: 'num' }, `${t('so.c.metric')} (${ul})`), h('th', { class: 'num' }, t('so.c.mult')), h('th', { class: 'num' }, `${t('so.c.value')} (${ul})`),
      h('th', { class: 'num' }, t('so.c.own')), h('th', { class: 'num' }, `${t('so.c.attr')} (${ul})`), h('th', {}, ''))),
    h('tbody', {}, res.rows.map((x, i) => h('tr', {},
      h('td', {}, oText(x.name, (v) => ghi(i, { name: v }), t('so.c.name'))),
      h('td', {}, sel(x.kind, SOTP_KINDS.map((k) => [k, t(`so.k.${k}`)]), (v) => ghi(i, { kind: v }), t('so.c.kind'))),
      h('td', {}, sel(x.basis, SOTP_BASIS.map((k) => [k, t(`so.b.${k}`)]), (v) => ghi(i, { basis: v }), t('so.c.basis'))),
      h('td', { class: 'num' }, x.kind === 'mult' ? oIn(tien(x.metric), (v) => ghi(i, { metric: v === null ? null : v * unit }), { aria: `${x.name} ${t('so.c.metric')}` }) : '—'),
      h('td', { class: 'num' }, x.kind === 'mult' ? oIn(x.mult, (v) => ghi(i, { mult: v }), { step: '0.1', aria: `${x.name} ${t('so.c.mult')}` }) : '—'),
      h('td', { class: 'num' }, x.kind === 'value' ? oIn(tien(x.value), (v) => ghi(i, { value: v === null ? null : v * unit }), { aria: `${x.name} ${t('so.c.value')}` }) : money(x.gross)),
      h('td', { class: 'num' }, oIn(+(x.own * 100).toFixed(2), (v) => ghi(i, { own: v === null ? 1 : Math.max(0, Math.min(100, v)) / 100 }), { step: '1', aria: `${x.name} ${t('so.c.own')}` })),
      h('td', { class: 'num' }, h('b', {}, money(x.attr))),
      h('td', {}, xoa(() => dat({ items: S.items.filter((_, j) => j !== i) }), t('so.del', { n: x.name }))))),
    h('tr', { class: 'dl-sub' }, h('td', { colspan: '7' }, t('so.evSum')), h('td', { class: 'num' }, money(res.evSum)), h('td', {})),
    h('tr', { class: 'dl-sub' }, h('td', { colspan: '7' }, t('so.eqSum')), h('td', { class: 'num' }, money(res.eqSum)), h('td', {})),
    h('tr', { class: 'dl-sub' }, h('td', { colspan: '7' }, h('label', { class: 'dv-inl' }, h('input', { type: 'checkbox', checked: S.bridge, onchange: (e) => dat({ bridge: e.target.checked }) }), ' ', t('so.less'))),
      h('td', { class: 'num' }, money(-res.less)), h('td', {})),
    h('tr', { class: 'dl-sub' }, h('td', { colspan: '7' }, h('label', { class: 'dv-inl' }, t('so.disc'), ' ',
      oIn(+(S.disc * 100).toFixed(2), (v) => dat({ disc: v === null ? 0 : Math.max(0, Math.min(90, v)) / 100 }), { step: '5', aria: t('so.disc') }), ' %')),
      h('td', { class: 'num' }, money(-res.discAmt)), h('td', {})),
    h('tr', { class: 'dl-tot' }, h('td', { colspan: '7' }, t('so.equity')), h('td', { class: 'num' }, money(res.equity)), h('td', {})),
    a.valuation.shares ? h('tr', { class: 'dl-tot' }, h('td', { colspan: '7' }, t('so.ps')), h('td', { class: 'num' }, res.price === null ? '—' : t('dv.vnd', { v: dong(res.price) })), h('td', {})) : null))) : null;
  return h('section', { class: 'dl-sec dv-sotpsec' },
    h('h3', {}, t('so.h')),
    h('p', { class: 'priv' }, t('so.lead')),
    h('ul', { class: 'priv dv-tipsl' }, ['so.tip.ev', 'so.tip.eq', 'so.tip.disc'].map((k) => h('li', {}, t(k)))),
    bang, nut,
    res.equity !== null && !(inp.val.weights.sotp > 0) ? h('p', { class: 'msg' }, t('so.weightHint')) : null);
}

// ─── Module dự phóng (bật / tắt) & sơ đồ nối các dòng ──────────────

export const MODS = ['gm', 'wcDays', 'fa'];
const MOD_ISSUE = { gm: 'noGm', wcDays: 'noWcDays', fa: 'noPpe' };

/** Thẻ bật / tắt từng module dự phóng chi tiết; mỗi thẻ ghi rõ module thay dòng nào và đưa số sang đâu. */
export function modPanel(V, r, dat) {
  return h('div', { class: 'dv-mods' },
    h('h4', {}, t('dv.mod.h')),
    h('p', { class: 'priv' }, t('dv.mod.lead')),
    h('div', { class: 'dv-modgrid' }, MODS.map((k) => {
      const on = V.mods[k], loi = on && r.issues?.includes(MOD_ISSUE[k]);
      return h('label', { class: `dv-mod${on ? ' on' : ''}${loi ? ' err' : ''}` },
        h('span', { class: 'dv-modh' }, h('input', { type: 'checkbox', checked: on, onchange: (e) => dat({ mods: { ...V.mods, [k]: e.target.checked } }) }), h('b', {}, t(`dv.mod.${k}`))),
        h('small', {}, t(`dv.mod.${k}.d`)),
        h('span', { class: 'dv-modlk' }, t(`dv.mod.${k}.lk`)),
        loi ? h('span', { class: 'dv-moderr' }, t(`dv.issue.${MOD_ISSUE[k]}`)) : null,
        r.fcffSrc === 'model' && k !== 'gm' ? h('span', { class: 'dv-moderr' }, t(`dv.mod.by3s.${k}`)) : null);
    })));
}

/** Sơ đồ "model wiring": doanh thu → lợi nhuận → FCFF → EV → các mô hình dùng nó; module đang bật được tô đậm. */
export function wiring(V, r) {
  const M = r.mods || V.mods;
  const nut = (txt, on = false) => h('span', { class: `dv-w${on ? ' on' : ''}` }, txt);
  const mui = () => h('span', { class: 'dv-wa' }, '→');
  const xs = [
    nut(`${t('dv.w.rev')} · ${t(`dv.rm.${V.revMode}`)}`, V.revMode !== 'growth'),
    ...(M.gm ? [nut(t('dv.w.gp'), true), nut(t('dv.w.sga'), true)] : [nut(t('dv.w.margin'))]),
    nut('EBITDA'),
    nut(M.fa ? t('dv.w.daFa') : t('dv.w.da'), M.fa),
    nut('EBIT → NOPAT'),
    nut(M.fa ? t('dv.w.capexFa') : t('dv.w.capex'), M.fa),
    nut(M.wcDays ? t('dv.w.nwcDays') : t('dv.w.nwc'), M.wcDays),
    nut('FCFF', true), nut(t('dv.w.3s'), true), nut(t('dv.w.ev')), nut(t('dv.w.out')),
  ];
  return h('div', { class: 'dv-wire', role: 'img', 'aria-label': t('dv.w.h') }, h('b', {}, t('dv.w.h')), ' ', xs.flatMap((x, i) => (i ? [mui(), x] : [x])));
}

// ─── Doanh thu theo dự án (bất động sản, xây dựng…) ─────────────────

export function projBuild(a, r, V, dat, money, ul) {
  const u = a.unitDong, P = V.proj;
  const ghi = (patch) => dat({ proj: { ...P, ...patch } });
  const ghiI = (i, patch) => ghi({ items: P.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const F = r.flows || [];
  const N = F.length || V.years;
  const namGoc = a.base.months === 12 && !a.base.ltm ? a.base.year : null;
  const nhan = (k) => (namGoc ? `${namGoc + k}F` : t('dv.yearN', { n: k }));
  const coGm = r.mods?.gm;
  const pctAt = (i, j, v) => { const pct = Array.from({ length: Math.max(P.items[i].pct.length, N) }, (_, k) => P.items[i].pct[k] ?? null); pct[j] = v; ghiI(i, { pct }); };
  const yrs = Array.from({ length: N }, (_, j) => j);
  const hang = P.items.map((x, i) => {
    const tong = x.pct.reduce((s, v) => s + (v || 0), 0);
    return [
      h('tr', { class: 'dv-seg' },
        h('td', {}, h('div', { class: 'dv-segn' }, oText(x.name, (v) => ghiI(i, { name: v }), t('dv.pj.name')), xoa(() => ghi({ items: P.items.filter((_, j) => j !== i) }), t('dv.pj.del', { n: x.name })))),
        h('td', { class: 'num' }, oIn(x.total ? +(x.total / u).toFixed(2) : null, (v) => ghiI(i, { total: (v || 0) * u }), { aria: `${x.name} ${t('dv.pj.total')}` })),
        coGm ? h('td', { class: 'num' }, oIn(x.gm === null ? null : +(x.gm * 100).toFixed(2), (v) => ghiI(i, { gm: v === null ? null : v / 100 }), { step: '1', aria: `${x.name} GM`, placeholder: Number.isFinite(r.d?.gm) ? (r.d.gm * 100).toFixed(1) : '' })) : null,
        yrs.map((j) => h('td', { class: 'num' }, oIn(Number.isFinite(x.pct[j]) ? +(x.pct[j] * 100).toFixed(2) : null, (v) => pctAt(i, j, v === null ? null : Math.max(0, Math.min(100, v)) / 100), { step: '5', aria: `${x.name} ${nhan(j + 1)}` }))),
        h('td', { class: `num${Math.abs(tong - 1) > 1e-6 && tong > 0 ? ' dv-warn' : ''}` }, pc(tong, 0))),
      h('tr', { class: 'dl-sub' }, h('td', {}, `↳ ${t('dv.seg.rev')}`), h('td', {}), coGm ? h('td', {}) : null,
        yrs.map((j) => h('td', { class: 'num' }, Number.isFinite(F[j]?.proj?.[i]) ? money(F[j].proj[i]) : '—')), h('td', {})),
    ];
  });
  return h('div', { class: 'dv-segs' },
    h('p', { class: 'priv' }, t('dv.pj.lead')),
    h('div', { class: 'dv-grid' },
      h('label', { class: 'dv-f' }, h('span', {}, t('dv.pj.core')), oIn(P.core === null ? null : +(P.core / u).toFixed(2), (v) => ghi({ core: v === null ? null : v * u }), { cls: '', aria: t('dv.pj.core') }), h('i', {}, ul)),
      h('label', { class: 'dv-f' }, h('span', {}, t('dv.pj.coreG')), oIn(P.coreG === null ? null : +(P.coreG * 100).toFixed(2), (v) => ghi({ coreG: v === null ? null : v / 100 }), { cls: '', step: '0.5', aria: t('dv.pj.coreG') }), h('i', {}, '%'))),
    P.items.length ? h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-segt' },
      h('thead', {}, h('tr', {}, h('th', {}, t('dv.pj.name')), h('th', { class: 'num' }, `${t('dv.pj.total')} (${ul})`), coGm ? h('th', { class: 'num' }, 'GM %') : null,
        yrs.map((j) => h('th', { class: 'num' }, `${nhan(j + 1)} %`)), h('th', { class: 'num' }, 'Σ %'))),
      h('tbody', {}, hang,
        F.length ? h('tr', { class: 'dl-sub' }, h('td', {}, t('dv.pj.coreRow')), h('td', {}), coGm ? h('td', {}) : null, F.map((f) => h('td', { class: 'num' }, money(f.core))), h('td', {})) : null,
        F.length ? h('tr', { class: 'dl-tot' }, h('td', {}, t('dv.seg.total')), h('td', {}), coGm ? h('td', {}) : null, F.map((f) => h('td', { class: 'num' }, money(f.rev))), h('td', {})) : null))) : null,
    h('div', { class: 'row cp-bar' }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => ghi({ items: [...P.items, { name: t('dv.pj.new', { n: P.items.length + 1 }), total: 0, pct: [], gm: null }] }) }, t('dv.pj.add'))));
}
