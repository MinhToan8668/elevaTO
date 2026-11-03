// Khối LBO (mua lại bằng vốn vay) — dùng dòng tiền đã dự phóng ở bước 3 (core/lbo.js). Hiện: nguồn & sử dụng vốn,
// lịch trả nợ, IRR / MOIC của quỹ, bảng IRR theo bội số vào × thoát, và mức giá cao nhất quỹ trả được để đạt IRR mục
// tiêu (đưa sang football field / giá mục tiêu). Chỉ vẽ và nhận thông số (lưu ở dealInputs.val.lbo).

import { h } from './dom.js';
import { t } from '../i18n.js';
import { dcfValuation } from '../core/valuation.js';
import { lboAnalysis, lboGrid, lboMaxEntry } from '../core/lbo.js';
import { oPct, oNum, nhom, card } from './dealval.js';

const pc = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const lan = (x) => (Number.isFinite(x) ? `${x.toFixed(1)}×` : '—');
const dong = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('vi-VN') : '—');

export function lboBlock(a, inp, save, money, ul) {
  const V = inp.val, L = V.lbo;
  const dat = (patch) => save({ val: { ...V, lbo: { ...L, ...patch } } });
  const r = dcfValuation(a, V);
  const k = r?.flows ? lboAnalysis(a, r) : null;
  const thamSo = h('div', { class: 'dv-fsrow' },
    nhom(t('lbo.fs.deal'), '',
      oNum(t('lbo.entry'), L.entry, (v) => dat({ entry: v }), { step: '0.5', suffix: '× EBITDA', placeholder: k?.entry ? k.entry.toFixed(1) : '' }),
      oNum(t('lbo.exit'), L.exit, (v) => dat({ exit: v }), { step: '0.5', suffix: '× EBITDA', placeholder: k?.exit ? k.exit.toFixed(1) : '' }),
      oNum(t('lbo.years'), L.years, (v) => dat({ years: v }), { step: '1', suffix: t('dv.years.u'), placeholder: String(r?.flows?.length || V.years) }),
      oPct(t('lbo.fees'), L.fees, null, (v) => dat({ fees: v ?? 0.02 }))),
    nhom(t('lbo.fs.debt'), t('lbo.fs.debt.h'),
      oNum(t('lbo.sX'), L.sX, (v) => dat({ sX: v ?? 0 }), { step: '0.5', suffix: '× EBITDA' }),
      oPct(t('lbo.sRate'), L.sRate, null, (v) => dat({ sRate: v ?? 0.09 })),
      oPct(t('lbo.sAmort'), L.sAmort, null, (v) => dat({ sAmort: v ?? 0 }), '5'),
      oNum(t('lbo.mX'), L.mX, (v) => dat({ mX: v ?? 0 }), { step: '0.5', suffix: '× EBITDA' }),
      oPct(t('lbo.mRate'), L.mRate, null, (v) => dat({ mRate: v ?? 0.12 }))),
    nhom(t('lbo.fs.ret'), '',
      oPct(t('lbo.sweep'), L.sweep, null, (v) => dat({ sweep: v ?? 0 }), '5'),
      oPct(t('lbo.irr'), L.irr, null, (v) => dat({ irr: v ?? 0.2 }), '1')));
  const khung = (...kids) => h('section', { class: 'dl-sec dv-lbo' }, h('h3', {}, t('lbo.h')), h('p', { class: 'priv' }, t('lbo.lead')), thamSo, ...kids);
  if (!k) return khung(h('p', { class: 'msg' }, t('lbo.need')));
  if (k.issue) return khung(h('p', { class: 'msg warn' }, t(`lbo.issue.${k.issue}`)));

  const su = h('div', { class: 'dv-su' },
    h('table', { class: 'k dl-t' }, h('thead', {}, h('tr', {}, h('th', {}, t('lbo.uses')), h('th', { class: 'num' }, ul), h('th', { class: 'num' }, '%'))),
      h('tbody', {},
        h('tr', {}, h('td', {}, t('lbo.u.ev', { m: lan(k.entry) })), h('td', { class: 'num' }, money(k.ev)), h('td', { class: 'num' }, pc(k.ev / k.uses))),
        h('tr', {}, h('td', {}, t('lbo.u.fees')), h('td', { class: 'num' }, money(k.fees)), h('td', { class: 'num' }, pc(k.fees / k.uses))),
        h('tr', { class: 'dl-tot' }, h('td', {}, t('lbo.total')), h('td', { class: 'num' }, money(k.uses)), h('td', { class: 'num' }, '100%')))),
    h('table', { class: 'k dl-t' }, h('thead', {}, h('tr', {}, h('th', {}, t('lbo.sources')), h('th', { class: 'num' }, ul), h('th', { class: 'num' }, '%'))),
      h('tbody', {},
        h('tr', {}, h('td', {}, t('lbo.s.senior', { m: lan(L.sX) })), h('td', { class: 'num' }, money(k.senior0)), h('td', { class: 'num' }, pc(k.senior0 / k.uses))),
        h('tr', {}, h('td', {}, t('lbo.s.mezz', { m: lan(L.mX) })), h('td', { class: 'num' }, money(k.mezz0)), h('td', { class: 'num' }, pc(k.mezz0 / k.uses))),
        h('tr', {}, h('td', {}, t('lbo.s.equity')), h('td', { class: 'num' }, money(k.equity0)), h('td', { class: 'num' }, pc(k.equity0 / k.uses))),
        h('tr', { class: 'dl-tot' }, h('td', {}, t('lbo.total')), h('td', { class: 'num' }, money(k.uses)), h('td', { class: 'num' }, '100%')))));

  const datIrr = k.irr >= L.irr;
  const ketQua = h('div', { class: 'dl-cards' },
    card('IRR', pc(k.irr), datIrr ? 'em' : 'red', t('lbo.irr.vs', { p: pc(L.irr, 0) })),
    card('MOIC', lan(k.moic), datIrr ? 'em' : ''),
    card(t('lbo.eqIn'), money(k.equity0), '', ul),
    card(t('lbo.eqOut'), money(k.equityOut), '', t('lbo.evOut', { v: money(k.evOut), m: lan(k.exit) })));

  const dongL = (nhan, f, cls = '') => h('tr', { class: cls }, h('td', {}, nhan), k.rows.map((x) => h('td', { class: 'num' }, f(x))));
  const namGoc = a.base.months === 12 && !a.base.ltm ? a.base.year : null;
  const lich = h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-lbos' },
    h('thead', {}, h('tr', {}, h('th', {}, ul), k.rows.map((x) => h('th', { class: 'num' }, namGoc ? `${namGoc + x.t}F` : t('dv.yearN', { n: x.t }))))),
    h('tbody', {},
      dongL('EBITDA', (x) => money(x.ebitda)),
      dongL(t('dv.r.capexRow'), (x) => money(-x.capex)),
      dongL(t('dv.r.dNwc'), (x) => money(-x.dNwc)),
      dongL(t('lbo.r.tax'), (x) => money(-x.tax)),
      dongL('CFADS', (x) => money(x.cfads), 'dl-tot'),
      dongL(t('lbo.r.intS'), (x) => money(-x.intS)),
      dongL(t('lbo.r.intM'), (x) => money(-x.intM)),
      dongL(t('lbo.r.mand'), (x) => money(-x.mandatory)),
      dongL(t('lbo.r.sweep'), (x) => money(-x.sweep)),
      dongL(t('lbo.r.senior'), (x) => money(x.senior), 'dl-tot'),
      dongL(t('lbo.r.mezz'), (x) => money(x.mezz)),
      dongL(t('lbo.r.cash'), (x) => money(x.cash)),
      dongL(t('lbo.r.lev'), (x) => lan(x.lev)),
      dongL(t('lbo.r.cover'), (x) => lan(x.cover)))));

  const gr = lboGrid(a, r, k);
  const mau = (v) => (Number.isFinite(v) ? { background: `color-mix(in srgb, ${v >= L.irr ? 'var(--em)' : 'var(--red)'} ${Math.round(Math.min(1, Math.abs(v - L.irr) / 0.15) * 40)}%, transparent)` } : null);
  const nhay = h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-lbog' },
    h('thead', {}, h('tr', {}, h('th', {}, t('lbo.grid.h')), gr.exit.map((x, j) => h('th', { class: `num${j === 2 ? ' dl-base' : ''}` }, lan(x))))),
    h('tbody', {}, gr.entry.map((x, i) => h('tr', {}, h('th', { class: i === 2 ? 'dl-base' : '' }, lan(x)),
      gr.irr[i].map((v, j) => h('td', { class: `num${i === 2 && j === 2 ? ' dv-mid' : ''}`, style: mau(v) }, pc(v))))))));

  const mx = lboMaxEntry(a, r, k);
  return khung(
    k.issues.map((x) => h('p', { class: 'msg warn' }, t(`lbo.issue.${x}`))),
    h('h4', {}, t('lbo.su.h')), su,
    h('h4', {}, t('lbo.ret.h')), ketQua,
    h('h4', {}, t('lbo.sched.h')), lich,
    h('h4', {}, t('lbo.grid.t'), h('small', { class: 'priv' }, ` (${t('lbo.grid.note')})`)), nhay,
    h('h4', {}, t('lbo.max.h', { p: pc(L.irr, 0) })),
    mx && mx.equity <= 0 ? h('p', { class: 'msg warn' }, t('lbo.max.neg')) : null,
    mx ? h('div', { class: 'dl-cards' },
      card(t('lbo.max.mult'), lan(mx.entry), 'gold', k.marketEntry ? t('lbo.max.vsMkt', { m: lan(k.marketEntry) }) : ''),
      card(t('lbo.max.ev'), money(mx.ev), '', ul),
      card(t('lbo.max.eq'), money(mx.equity), '', ul),
      card(t('lbo.max.ps'), mx.price === null ? '—' : t('dv.vnd', { v: dong(mx.price) }), 'em', t('lbo.max.feed'))) : h('p', { class: 'msg' }, t('lbo.max.none')));
}
