// Hai khối "chi tiết hoá" của phần định giá:
//   · segBuild — dự phóng doanh thu theo từng mảng kinh doanh (revenue build-up): mỗi mảng một doanh thu năm gốc
//     và tăng trưởng riêng (chung + ghi đè từng năm); tổng các mảng khớp về doanh thu hợp nhất năm gốc.
//   · sotpBlock — định giá tổng các phần (SOTP) cho doanh nghiệp nhiều mảng / có công ty con, cổ phần niêm yết,
//     quỹ đất…: mỗi phần một cách định giá (bội số × chỉ tiêu, hoặc nhập thẳng giá trị từ DCF / RNAV riêng).
// Số do core/valuation.js và core/sotp.js tính; ở đây chỉ vẽ và nhận thông số.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { sotpValuation, SOTP_KINDS, SOTP_BASIS } from '../core/sotp.js';

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
  const dau = h('div', { class: 'row cp-bar' }, them, layTm);
  if (!ds.length) return h('div', { class: 'dv-segs' }, h('p', { class: 'msg warn' }, t('dv.seg.none')), dau);

  const S = r.segs;
  const tong = S ? S.sum : ds.reduce((s, x) => s + (x.rev0 ?? theoTm(x) ?? 0), 0);
  const cot = 4 + F.length;
  const gyAt = (i, j, v) => { const gy = Array.from({ length: Math.max(ds[i].gy.length, F.length) }, (_, k) => ds[i].gy[k] ?? null); gy[j] = v; ghi(i, { gy }); };
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
        F.map((f, j) => h('td', { class: 'num' }, oIn(Number.isFinite(x.gy[j]) ? +(x.gy[j] * 100).toFixed(3) : null, (v) => gyAt(i, j, v === null ? null : v / 100),
          { step: '0.5', cls: `dv-yr${Number.isFinite(x.gy[j]) ? ' on' : ''}`, aria: `${x.name} ${nhanF(f)}`,
            placeholder: S && Number.isFinite(f.segs?.[i]) ? pc((f.segs[i] / (j ? F[j - 1].segs[i] : S.list[i].rev0)) - 1).replace('%', '') : '' })))),
      h('tr', { class: 'dl-sub' }, h('td', {}, `↳ ${t('dv.seg.rev')}`), h('td', { class: 'num' }, money(goc)), h('td', {}), h('td', {}),
        F.map((f) => h('td', { class: 'num' }, Number.isFinite(f.segs?.[i]) ? money(f.segs[i]) : '—'))),
    ];
  });
  const lech = S ? r.rev0 - S.sum : null;
  return h('div', { class: 'dv-segs' },
    h('p', { class: 'priv' }, t('dv.seg.lead')),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-segt' },
      h('thead', {}, h('tr', {}, h('th', {}, t('dv.seg.name')), h('th', { class: 'num' }, `${t('dv.seg.base')} (${ul})`), h('th', { class: 'num' }, t('dv.seg.mix')),
        h('th', { class: 'num' }, t('dv.seg.g')), F.map((f) => h('th', { class: 'num' }, `${nhanF(f)} %`)))),
      h('tbody', {}, hang,
        S ? [
          h('tr', { class: 'dl-sub' }, h('td', {}, t('dv.seg.sum')), h('td', { class: 'num' }, money(S.sum)), h('td', {}), h('td', {}),
            F.map((f) => h('td', { class: 'num' }, money(f.segs.reduce((x, y) => x + y, 0))))),
          Math.abs(lech) > Math.abs(r.rev0) * 1e-6 ? h('tr', { class: 'dl-sub' }, h('td', {}, t('dv.seg.elim', { k: pc(S.k - 1) })), h('td', { class: 'num' }, money(lech)), h('td', {}), h('td', {}),
            F.map((f) => h('td', { class: 'num' }, money(f.rev - f.segs.reduce((x, y) => x + y, 0))))) : null,
          h('tr', { class: 'dl-tot' }, h('td', {}, t('dv.seg.total')), h('td', { class: 'num' }, money(r.rev0)), h('td', {}), h('td', {}), F.map((f) => h('td', { class: 'num' }, money(f.rev)))),
          h('tr', {}, h('td', {}, t('dv.r.growthRow')), h('td', {}), h('td', {}), h('td', {}), F.map((f) => h('td', { class: 'num' }, pc(f.growth)))),
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
