// Mô hình ba báo cáo liên kết (3.6): Income statement · Balance sheet · Cash flow, các năm actual (A) cạnh các năm dự phóng
// (F), giả định tài chính (lãi tiền gửi, cổ tức, trả nợ, vay mới, phát hành, tiền tối thiểu / revolver) và dòng kiểm tra cân
// đối. Số do core/threestmt.js tính; ở đây chỉ vẽ và nhận giả định (lưu ở dealInputs.val.fs).

import { h } from './dom.js';
import { t } from '../i18n.js';
import { dcfValuation } from '../core/valuation.js';
import { threeStatement, bsLines } from '../core/threestmt.js';
import { oPct, oNum, nhom, subHead } from './dealval.js';

const pc = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const lan = (x) => (Number.isFinite(x) ? `${x.toFixed(1)}×` : '—');
const dong = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('vi-VN') : '—');
const n = (v) => (Number.isFinite(v) ? v : null);
const uiFs = { tab: 'is' };

/** Số actual của một cột kỳ năm theo đúng các dòng của mô hình. */
function actual(c) {
  const v = c.v, m = c.m, g = (k) => n(v[k]);
  const ebit = m.adjEbitda === null ? null : m.adjEbitda - (m.kh || 0);
  const lv = g('IS:24') === null ? null : -Math.abs(g('IS:24'));
  const ebt = g('IS:50'), npat = g('IS:60'), npatP = g('IS:61') ?? npat;
  const is = {
    rev: g('IS:10'), cogs: g('IS:11') === null ? null : -Math.abs(g('IS:11')), gp: m.gross ?? null, opex: m.gross !== null && m.gross !== undefined && ebit !== null ? m.gross - ebit : null,
    ebitda: m.adjEbitda, da: m.kh, ebit, interest: lv, intIncome: ebt !== null && ebit !== null ? ebt - ebit - (lv || 0) : null, ebt,
    tax: ebt !== null && npat !== null ? npat - ebt : null, npat, nci: npat !== null && npatP !== null ? npatP - npat : null, npatP,
    eps: m.shares && npatP !== null ? npatP / m.shares : null,
  };
  const truc = g('CF:20') === null && g('CF:T20') !== null;
  const cf0 = (k) => g(truc ? `CF:T${k}` : `CF:${k}`);
  const cf = { npat, da: m.kh, cfo: cf0('20'), capex: m.capexNet === null ? null : -m.capexNet, cfi: cf0('30'), cff: cf0('40'), net: cf0('50'), open: cf0('60'), close: cf0('70'),
    div: cf0('36'), fcff: m.fcff, fcfe: m.fcfe };
  return { is, bs: bsLines(v, m), cf };
}

export function threeBlock(a, inp, save, money, ul) {
  const V = inp.val, F = V.fs;
  const dat = (patch) => save({ val: { ...V, fs: { ...F, ...patch } } });
  const r = dcfValuation(a, V);
  const M = r?.flows ? threeStatement(a, r) : null;
  const u = a.unitDong;
  const namGoc = a.base.months === 12 && !a.base.ltm ? a.base.year : null;
  const head = [subHead('3.6', t('fs.h')), h('p', { class: 'priv dv-sublead' }, t('fs.lead'))];
  if (!M) return h('section', { class: 'dl-sec dv-3s' }, ...head, h('p', { class: 'msg' }, t('fs.need')));
  if (M.issue) return h('section', { class: 'dl-sec dv-3s' }, ...head, h('p', { class: 'msg warn' }, t(`fs.issue.${M.issue}`)));

  const Y = M.years;
  const nhanF = (y) => (namGoc ? `${namGoc + y.t}F` : t('dv.yearN', { n: y.t }));
  const H = a.cols.filter((c) => c.months === 12 && !c.ltm).slice(-3).map((c) => ({ label: `${String(c.label).replace(/\D+/g, '') || c.label}A`, ...actual(c) }));
  const datArr = (k, i, v) => { const arr = Array.from({ length: Y.length }, (_, j) => F[k][j] ?? null); arr[i] = v; dat({ [k]: arr }); };
  const oYr = (k, y) => h('input', { type: 'number', step: 'any', class: `dv-yr${Number.isFinite(F[k][y.t - 1]) ? ' on' : ''}`, 'aria-label': `${t(`fs.${k}`)} ${nhanF(y)}`,
    value: Number.isFinite(F[k][y.t - 1]) ? String(+(F[k][y.t - 1] / u).toFixed(2)) : '', placeholder: '0',
    onchange: (e) => datArr(k, y.t - 1, e.target.value === '' ? null : +e.target.value * u) });

  const giaDinh = h('div', { class: 'dv-fsrow' },
    nhom(t('fs.fs.fin'), t('fs.fs.fin.h', { kd: pc(M.fs.kd, 2) }),
      oPct(t('fs.cashRate'), F.cashRate, null, (v) => dat({ cashRate: v ?? 0 })),
      oPct(t('fs.amort'), F.amort, null, (v) => dat({ amort: v ?? 0 }), '5'),
      oNum(t('fs.minCash'), F.minCash === null ? null : +(F.minCash / u).toFixed(2), (v) => dat({ minCash: v === null ? null : v * u }), { suffix: ul, placeholder: '0' })),
    nhom(t('fs.fs.sh'), t('fs.fs.sh.h', { nci: pc(M.fs.nciPct) }),
      oPct(t('fs.payout'), F.payout, M.fs.payout, (v) => dat({ payout: v }), '5')));

  const cot = (o) => h('td', { class: 'num dv-a' }, o);
  const bang = (rows) => h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-3t' },
    h('thead', {}, h('tr', {}, h('th', {}, ul), H.map((x) => h('th', { class: 'num dv-a' }, x.label)), Y.map((y) => h('th', { class: 'num' }, nhanF(y))))),
    h('tbody', {}, rows.map(([nhan, hv, fv, cls = '']) => (hv === 'grp'
      ? h('tr', { class: 'dv-grp' }, h('td', { colspan: String(1 + H.length + Y.length) }, nhan))
      : h('tr', { class: cls }, h('td', {}, nhan), H.map((x) => cot(hv ? hv(x) : '')), Y.map((y) => h('td', { class: 'num' }, fv(y)))))))));
  const tien = (f) => (x) => money(f(x));

  const IS = bang([
    [t('fs.is.rev'), tien((x) => x.is.rev), tien((y) => y.is.rev), 'dl-tot'],
    [t('fs.is.growth'), null, (y, i = Y.indexOf(y)) => pc(y.is.rev / (i ? Y[i - 1].is.rev : r.rev0) - 1)],
    [t('fs.is.cogs'), tien((x) => x.is.cogs), tien((y) => -y.is.cogs)],
    [t('fs.is.gp'), tien((x) => x.is.gp), tien((y) => y.is.gp), 'dl-tot'],
    [t('fs.is.gm'), (x) => pc(x.is.rev ? x.is.gp / x.is.rev : null), (y) => pc(y.is.gp / y.is.rev)],
    [t('fs.is.opex'), tien((x) => (x.is.opex === null ? null : -x.is.opex)), tien((y) => -y.is.opex)],
    [t('fs.is.ebit'), tien((x) => x.is.ebit), tien((y) => y.is.ebit), 'dl-tot'],
    [t('fs.is.ebitm'), (x) => pc(x.is.rev ? x.is.ebit / x.is.rev : null), (y) => pc(y.is.ebit / y.is.rev)],
    [t('fs.is.interest'), tien((x) => x.is.interest), tien((y) => y.is.interest)],
    [t('fs.is.intIncome'), tien((x) => x.is.intIncome), tien((y) => y.is.intIncome)],
    [t('fs.is.ebt'), tien((x) => x.is.ebt), tien((y) => y.is.ebt), 'dl-tot'],
    [t('fs.is.tax'), tien((x) => x.is.tax), tien((y) => y.is.tax)],
    [t('fs.is.npat'), tien((x) => x.is.npat), tien((y) => y.is.npat), 'dl-tot'],
    [t('fs.is.nci'), tien((x) => x.is.nci), tien((y) => y.is.nci)],
    [t('fs.is.npatP'), tien((x) => x.is.npatP), tien((y) => y.is.npatP), 'dl-tot'],
    [t('fs.is.eps'), (x) => dong(x.is.eps), (y) => dong(y.is.eps)],
    [t('fs.memo'), 'grp'],
    ['EBITDA', tien((x) => x.is.ebitda), tien((y) => y.is.ebitda)],
    [t('fs.is.da'), tien((x) => x.is.da), tien((y) => y.is.da)],
  ]);
  const BS = bang([
    [t('fs.bs.assets'), 'grp'],
    [t('fs.bs.cash'), tien((x) => x.bs?.cash), tien((y) => y.bs.cash)],
    [t('fs.bs.cashLike'), tien((x) => x.bs?.cashLike), tien((y) => y.bs.cashLike)],
    [t('fs.bs.tradeA'), tien((x) => x.bs?.tradeA), tien((y) => y.bs.tradeA)],
    [t('fs.bs.inv'), tien((x) => x.bs?.inv), tien((y) => y.bs.inv)],
    [t('fs.bs.wcOther'), tien((x) => x.bs?.wcOther), tien((y) => y.bs.wcOther)],
    [t('fs.bs.ppe'), tien((x) => x.bs?.ppe), tien((y) => y.bs.ppe)],
    [t('fs.bs.otherA'), tien((x) => x.bs?.otherA), tien((y) => y.bs.otherA)],
    [t('fs.bs.ta'), tien((x) => x.bs?.ta), tien((y) => y.bs.ta), 'dl-tot'],
    [t('fs.bs.liab'), 'grp'],
    [t('fs.bs.tradeL'), tien((x) => x.bs?.tradeL), tien((y) => y.bs.tradeL)],
    [t('fs.bs.debt'), tien((x) => x.bs?.debt), tien((y) => y.bs.debt)],
    [t('fs.bs.revolver'), () => '', tien((y) => y.bs.revolver)],
    [t('fs.bs.otherL'), tien((x) => x.bs?.otherL), tien((y) => y.bs.otherL)],
    [t('fs.bs.tl'), tien((x) => x.bs?.tl), tien((y) => y.bs.tl), 'dl-tot'],
    [t('fs.bs.eqP'), tien((x) => x.bs?.equityParent), tien((y) => y.bs.equityParent)],
    [t('fs.bs.nci'), tien((x) => x.bs?.minority), tien((y) => y.bs.minority)],
    [t('fs.bs.te'), tien((x) => x.bs?.te), tien((y) => y.bs.te), 'dl-tot'],
    [t('fs.bs.tle'), tien((x) => x.bs?.tle), tien((y) => y.bs.tle), 'dl-tot'],
    [t('fs.bs.check'), () => '', (y) => (Math.abs(y.check) <= Math.max(1, Math.abs(y.bs.ta) * 1e-9) ? '✓ 0' : money(y.check)), 'dv-check'],
  ]);
  const CF = bang([
    [t('fs.cf.npat'), tien((x) => x.cf.npat), tien((y) => y.cf.npat)],
    [t('fs.cf.da'), tien((x) => x.cf.da), tien((y) => y.cf.da)],
    [t('fs.cf.dNwc'), () => '', tien((y) => y.cf.dNwc)],
    [t('fs.cf.cfo'), tien((x) => x.cf.cfo), tien((y) => y.cf.cfo), 'dl-tot'],
    [t('fs.cf.capex'), tien((x) => x.cf.capex), tien((y) => y.cf.capex)],
    [t('fs.cf.cfi'), tien((x) => x.cf.cfi), tien((y) => y.cf.cfi), 'dl-tot'],
    [t('fs.cf.repay'), () => '', tien((y) => y.cf.repay)],
    [`${t('fs.newDebt')} (${ul})`, () => '', (y) => oYr('newDebt', y)],
    [t('fs.cf.revolver'), () => '', tien((y) => y.cf.revolver)],
    [`${t('fs.issue')} (${ul})`, () => '', (y) => oYr('issue', y)],
    [t('fs.cf.div'), tien((x) => x.cf.div), tien((y) => y.cf.div)],
    [t('fs.cf.cff'), tien((x) => x.cf.cff), tien((y) => y.cf.cff), 'dl-tot'],
    [t('fs.cf.net'), tien((x) => x.cf.net), tien((y) => y.cf.net), 'dl-tot'],
    [t('fs.cf.open'), tien((x) => x.cf.open), tien((y) => y.cf.open)],
    [t('fs.cf.close'), tien((x) => x.cf.close), tien((y) => y.cf.close), 'dl-tot'],
    [t('fs.memo'), 'grp'],
    [t('fs.cf.fcff'), tien((x) => x.cf.fcff), tien((y) => y.cf.fcff)],
    [t('fs.cf.fcfe'), tien((x) => x.cf.fcfe), tien((y) => y.cf.fcfe)],
  ]);
  const gia = V.price;
  const RT = bang([
    [t('fs.rt.netDebt'), () => '', tien((y) => y.ratios.netDebt)],
    [t('fs.rt.lev'), () => '', (y) => lan(y.ratios.lev)],
    [t('fs.rt.cover'), () => '', (y) => lan(y.ratios.cover)],
    ['ROE', () => '', (y) => pc(y.ratios.roe)],
    ['DPS', () => '', (y) => dong(y.ratios.dps)],
    ['BVPS', () => '', (y) => dong(y.ratios.bvps)],
    [t('fs.rt.pe'), () => '', (y) => (gia && y.is.eps > 0 ? lan(gia / y.is.eps) : '—')],
    [t('fs.rt.pb'), () => '', (y) => (gia && y.ratios.bvps > 0 ? lan(gia / y.ratios.bvps) : '—')],
  ]);
  const TABS = { is: IS, bs: BS, cf: CF, rt: RT };
  const khung = h('div', { class: 'dv-3panel' }, TABS[uiFs.tab]);
  const tabs = h('div', { class: 'dv-tabs', role: 'tablist' }, Object.keys(TABS).map((k) => h('button', {
    type: 'button', role: 'tab', class: `dv-tab${uiFs.tab === k ? ' on' : ''}`, 'aria-selected': String(uiFs.tab === k),
    onclick: (e) => {
      uiFs.tab = k;
      khung.replaceChildren(TABS[k]);
      e.currentTarget.parentElement.querySelectorAll('.dv-tab').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    } }, t(`fs.tab.${k}`))));
  return h('section', { class: 'dl-sec dv-3s' }, ...head,
    h('p', { class: `msg ${M.ok ? 'ok' : 'err'}` }, M.ok ? t('fs.ok') : t('fs.bad')),
    giaDinh,
    h('ul', { class: 'priv dv-tipsl' }, ['fs.tip.links', 'fs.tip.wc', 'fs.tip.int'].map((k) => h('li', {}, t(k)))),
    tabs, khung);
}
