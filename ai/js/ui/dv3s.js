// Mô hình ba báo cáo tích hợp (3.6) — trình bày như model elevaTO: Drivers (04.Drivers: actual · APPLIED = bình quân 3
// năm · ghi đè cả giai đoạn / từng năm), Fixed assets (10.FA_SCHED: capex theo nhóm, số năm sử dụng, nguyên giá → khấu
// hao → giá trị còn lại), Income statement, Balance sheet, Cash flow (08.CF, gián tiếp), Ratios. Nguồn FCFF cho DCF:
// mô hình tích hợp (như 08.CF dòng 47 → 15.DCF) hoặc driver đơn giản. Số do core/model3.js tính; ở đây chỉ vẽ và nhận
// giả định (lưu ở dealInputs.val.fs).

import { h } from './dom.js';
import { t } from '../i18n.js';
import { dcfValuation } from '../core/valuation.js';
import { model3, actualRow, BS_DRIVERS, FIN_DRIVERS, PL_DRIVERS, FA_CLS } from '../core/model3.js';
import { oPct, oNum, nhom, subHead } from './dealval.js';

const pc = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const lan = (x) => (Number.isFinite(x) ? `${x.toFixed(1)}×` : '—');
const dong = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('vi-VN') : '—');
const uiFs = { tab: 'drv' };

// Nhóm driver hiển thị (thứ tự như 04.Drivers C2 → C3).
const NHOM_DRV = [
  ['fs.g.pl', ['selling', 'ga', 'otherFin', 'otherInc', 'otherExp', 'yield', 'intRate', 'taxRate']],
  ['fs.g.wc', ['ar', 'inv', 'invProv', 'ap', 'prepay', 'loanRec', 'otherRec', 'provRec', 'stPrepaid', 'vat', 'taxRec', 'otherCa', 'advCust', 'taxPay', 'empPay', 'accrued', 'unearned', 'otherPay']],
  ['fs.g.lt', ['stInv', 'ltRec', 'cip', 'otherLtInv', 'ltPrepaid', 'dta', 'otherLt', 'dtl', 'otherLtL']],
  ['fs.g.fin', ['stDebt', 'stNew', 'payout', 'nci', 'issue', 'assocProfit']],
];
const DEF = Object.fromEntries([...BS_DRIVERS, ...FIN_DRIVERS, ...PL_DRIVERS].map((d) => [d.k, d]));

export function threeBlock(a, inp, save, money, ul) {
  const V = inp.val, F = V.fs;
  const dat = (patch) => save({ val: { ...V, fs: { ...F, ...patch } } });
  const r = dcfValuation(a, V);
  const u = a.unitDong;
  const head = [subHead('3.6', t('fs.h')), h('p', { class: 'priv dv-sublead' }, t('fs.lead'))];
  const khung = (...kids) => h('section', { class: 'dl-sec dv-3s' }, ...head, ...kids);
  if (!a.inputFs?.years?.length) return khung(h('p', { class: 'msg' }, t('fs.noInput')));
  if (!r?.flows) return khung(h('p', { class: 'msg' }, t('fs.need')));
  const M = r.m3 ?? model3(a, r.flows, { fs: F, kd: r.d.kd, capexPct: r.d.capex, shares: a.valuation.shares, rf: V.rf });
  if (!M) return khung(h('p', { class: 'msg' }, t('fs.need')));
  if (M.issue) return khung(h('p', { class: 'msg warn' }, t(`fs.issue.${M.issue}`)));

  const Y = M.years, FY = a.inputFs.years.slice(-3);
  const namGoc = M.last;
  const nhanF = (y) => `${namGoc + y.t}F`;
  const nhanA = (y) => `${y}A`;
  const cellsA = (y) => a.inputFs.cells[y];

  // ── Nguồn FCFF & giả định tài chính ──
  const nguon = h('div', { class: 'dv-src' },
    h('b', {}, t('fs.src')),
    ['model', 'simple'].map((k) => h('label', { class: `dv-radio${F.src === k ? ' on' : ''}` },
      h('input', { type: 'radio', name: 'fs-src', checked: F.src === k, onchange: () => dat({ src: k }) }), ' ', t(`fs.src.${k}`))),
    h('small', { class: 'priv' }, t(F.src === 'model' ? 'fs.src.model.h' : 'fs.src.simple.h')));
  // Cách xử lý thu nhập tài chính & ĐTNH trong FCFF: chuẩn (lãi gửi ngoài FCFF, ĐTNH = tiền) hay như model Excel.
  const cheDo = h('div', { class: 'dv-src' },
    h('b', {}, t('fs.mode')),
    ['std', 'excel'].map((k) => h('label', { class: `dv-radio${M.fcffMode === k ? ' on' : ''}` },
      h('input', { type: 'radio', name: 'fs-mode', checked: M.fcffMode === k, onchange: () => dat({ fcffMode: k }) }), ' ', t(`fs.mode.${k}`))),
    h('small', { class: 'priv' }, t(`fs.mode.${M.fcffMode}.h`, { r: pc(M.depRate, 2), f: pc(M.finOpPct, 2) })));
  const giaDinh = h('div', { class: 'dv-fsrow' },
    nhom(t('fs.fs.fin'), t('fs.fs.fin.h'),
      oPct(t('fs.stRate'), F.stRate, M.stRate, (v) => dat({ stRate: v })),
      oPct(t('fs.ltRate'), F.ltRate, M.ltRate, (v) => dat({ ltRate: v })),
      M.fcffMode === 'std' ? oPct(t('fs.depRate'), F.depRate, M.depRate, (v) => dat({ depRate: v })) : oPct(t('fs.cashRate'), F.cashRate, M.drivers.yield.applied[0], (v) => dat({ cashRate: v })),
      M.fcffMode === 'std' ? oPct(t('fs.finOp'), F.finOp, M.finOpPct, (v) => dat({ finOp: v }), '0.01') : null,
      oNum(t('fs.minCash'), F.minCash === null ? null : +(F.minCash / u).toFixed(2), (v) => dat({ minCash: v === null ? null : v * u }), { suffix: ul, placeholder: '0' }),
      oNum(t('fs.gwYears'), F.gwYears, (v) => dat({ gwYears: v }), { step: '1', suffix: t('dv.years.u'), placeholder: String(M.gwYears) })));

  // ── Bảng chung: cột actual (A) + dự phóng (F) ──
  const bang = (rows, { cls = '', H = FY } = {}) => h('div', { class: 'gridwrap' }, h('table', { class: `k dl-t dv-3t ${cls}` },
    h('thead', {}, h('tr', {}, h('th', {}, ul), H.map((y) => h('th', { class: 'num dv-a' }, nhanA(y))), Y.map((y) => h('th', { class: 'num' }, nhanF(y))))),
    h('tbody', {}, rows.map(([nhan, hv, fv, cl = '']) => (hv === 'grp'
      ? h('tr', { class: 'dv-grp' }, h('td', { colspan: String(1 + H.length + Y.length) }, nhan))
      : h('tr', { class: cl }, h('td', {}, nhan), H.map((y) => h('td', { class: 'num dv-a' }, hv ? hv(y) : '')), Y.map((y, i) => h('td', { class: 'num' }, fv(y, i)))))))));
  const tienA = (f) => (y) => money(f(y));
  const tienF = (f) => (y, i) => money(f(y, i));

  // ── Tab Drivers (04.Drivers) ──
  const fmtD = (d, x) => (x === null || x === undefined ? '—' : ['dso', 'dcogs'].includes(d.basis) ? x.toFixed(1)
    : ['level', 'flat'].includes(d.basis) ? money(x) : pc(x, 2));
  const raSo = (d, v) => (['dso', 'dcogs'].includes(d.basis) ? v : ['level', 'flat'].includes(d.basis) ? v * u : v / 100);
  const vaoO = (d, x) => (x === null || x === undefined ? '' : ['dso', 'dcogs'].includes(d.basis) ? String(+x.toFixed(2)) : ['level', 'flat'].includes(d.basis) ? String(+(x / u).toFixed(2)) : String(+(x * 100).toFixed(3)));
  const datD = (k, patch) => { const cu = F.drv[k] || { all: null, y: [] }; dat({ drv: { ...F.drv, [k]: { ...cu, ...patch } } }); };
  const oAll = (d) => h('input', { type: 'number', step: 'any', class: `dv-yr${M.drivers[d.k].all !== null ? ' on' : ''}`, 'aria-label': `${t(`fs.d.${d.k}`)} ${t('fs.drv.all')}`,
    value: vaoO(d, M.drivers[d.k].all), placeholder: vaoO(d, M.drivers[d.k].avg) || '',
    onchange: (e) => datD(d.k, { all: e.target.value === '' ? null : raSo(d, +e.target.value) }) });
  const oY = (d, i) => h('input', { type: 'number', step: 'any', class: `dv-yr${M.drivers[d.k].over[i] ? ' on' : ''}`, 'aria-label': `${t(`fs.d.${d.k}`)} ${namGoc + i + 1}F`,
    value: M.drivers[d.k].over[i] ? vaoO(d, M.drivers[d.k].applied[i]) : '', placeholder: vaoO(d, M.drivers[d.k].applied[i]),
    onchange: (e) => { const y = Array.from({ length: Y.length }, (_, j) => F.drv[d.k]?.y?.[j] ?? null); y[i] = e.target.value === '' ? null : raSo(d, +e.target.value); datD(d.k, { y }); } });
  const iA = a.inputFs.years.length - FY.length;
  const DRV = h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-3t dv-drv' },
    h('thead', {}, h('tr', {}, h('th', {}, t('fs.drv.h')), h('th', {}, t('fs.drv.unit')), FY.map((y) => h('th', { class: 'num dv-a' }, nhanA(y))),
      h('th', { class: 'num' }, t('fs.drv.all')), Y.map((y) => h('th', { class: 'num' }, nhanF(y))))),
    h('tbody', {}, NHOM_DRV.map(([nk, ks]) => [
      h('tr', { class: 'dv-grp' }, h('td', { colspan: String(3 + FY.length + Y.length) }, t(nk))),
      ...ks.map((k) => { const d = DEF[k]; return h('tr', {},
        h('td', {}, t(`fs.d.${k}`)), h('td', { class: 'priv' }, t(`fs.b.${d.basis}`)),
        FY.map((_, j) => h('td', { class: 'num dv-a' }, fmtD(d, M.drivers[k].hist[iA + j]))),
        h('td', { class: 'num' }, oAll(d)),
        Y.map((_, i) => h('td', { class: 'num' }, oY(d, i)))); }),
      // 04.Drivers C4: lãi suất vay ngắn / dài hạn ghi đè TỪNG NĂM (trên dư nợ đầu kỳ).
      ...(nk === 'fs.g.pl' ? ['stRateY', 'ltRateY'].map((k) => h('tr', {},
        h('td', {}, t(`fs.${k}`)), h('td', { class: 'priv' }, t('fs.b.pct')), FY.map(() => h('td', { class: 'num dv-a' }, '')), h('td', { class: 'num priv' }, pc(k === 'stRateY' ? M.stRate : M.ltRate, 2)),
        Y.map((y, i) => h('td', { class: 'num' }, h('input', { type: 'number', step: '0.1', class: `dv-yr${Number.isFinite(F[k][i]) ? ' on' : ''}`, 'aria-label': `${t(`fs.${k}`)} ${nhanF(y)}`,
          value: Number.isFinite(F[k][i]) ? String(+(F[k][i] * 100).toFixed(3)) : '', placeholder: (100 * (k === 'stRateY' ? y.is.rST : y.is.rLT)).toFixed(2),
          onchange: (e) => { const arr = Array.from({ length: Y.length }, (_, j) => F[k][j] ?? null); arr[i] = e.target.value === '' ? null : +e.target.value / 100; dat({ [k]: arr }); } }))))) : []),
    ]))));

  // ── Tab Fixed assets (10.FA_SCHED) ──
  const datCapex = (cls, i, v) => { const arr = Array.from({ length: Y.length }, (_, j) => F.capex[cls]?.[j] ?? null); arr[i] = v; dat({ capex: { ...F.capex, [cls]: arr } }); };
  const capexPlan = h('div', { class: 'gridwrap' }, h('table', { class: 'k dl-t dv-3t' },
    h('thead', {}, h('tr', {}, h('th', {}, t('fs.fa.cls')), h('th', { class: 'num' }, t('fs.fa.lifeEst')), h('th', { class: 'num' }, t('fs.fa.range')), h('th', { class: 'num' }, t('fs.fa.life')),
      h('th', { class: 'num' }, t('fs.fa.mix')), Y.map((y) => h('th', { class: 'num' }, `${t('fs.fa.capex')} ${nhanF(y)}`)))),
    h('tbody', {},
      FA_CLS.map((c, j) => h('tr', {},
        h('td', {}, t(`fs.fa.${c.cls}`)),
        h('td', { class: 'num dv-a' }, Number.isFinite(M.lives[c.cls].est) ? M.lives[c.cls].est.toFixed(1) : '—'),
        h('td', { class: 'num' }, `${M.lives[c.cls].min}–${M.lives[c.cls].max} `, h('span', { class: `tag ${M.lives[c.cls].src === 'tm' ? 'em' : ''}`, title: t(`fs.fa.src.${M.lives[c.cls].src}.h`) }, t(`fs.fa.src.${M.lives[c.cls].src}`))),
        h('td', { class: 'num' }, h('input', { type: 'number', step: '1', min: '0', class: `dv-yr${M.lives[c.cls].user ? ' on' : ''}`, 'aria-label': `${t(`fs.fa.${c.cls}`)} ${t('fs.fa.life')}`,
          value: M.lives[c.cls].user ? String(M.lives[c.cls].applied) : '', placeholder: String(+M.lives[c.cls].applied.toFixed(1)),
          onchange: (e) => dat({ life: { ...F.life, [c.cls]: e.target.value === '' ? undefined : +e.target.value } }) })),
        h('td', { class: 'num' }, pc(M.tyTrong[j], 0)),
        Y.map((y, i) => h('td', { class: 'num' }, h('input', { type: 'number', step: 'any', class: `dv-yr${Number.isFinite(F.capex[c.cls]?.[i]) ? ' on' : ''}`, 'aria-label': `${t(`fs.fa.${c.cls}`)} capex ${nhanF(y)}`,
          value: Number.isFinite(F.capex[c.cls]?.[i]) ? String(+(F.capex[c.cls][i] / u).toFixed(2)) : '', placeholder: (y.fa[j].add / u).toFixed(1),
          onchange: (e) => datCapex(c.cls, i, e.target.value === '' ? null : +e.target.value * u) }))))),
      h('tr', { class: 'dl-tot' }, h('td', { colspan: '5' }, t('fs.fa.total')), Y.map((y) => h('td', { class: 'num' }, money(-y.cf.capex)))))));
  const lanFA = (j) => [
    [t(`fs.fa.${FA_CLS[j].cls}`), 'grp'],
    [t('fs.fa.cost'), tienA((y) => cellsA(y)[FA_CLS[j].row]), tienF((y) => y.fa[j].cost)],
    [t('fs.fa.add'), tienA((y) => cellsA(y)[FA_CLS[j].row + 2]), tienF((y) => y.fa[j].add)],
    [t('fs.fa.dep'), tienA((y) => cellsA(y)[FA_CLS[j].row + 3]), tienF((y) => -y.fa[j].dep)],
    [t('fs.fa.acc'), tienA((y) => cellsA(y)[FA_CLS[j].row + 1]), tienF((y) => y.fa[j].acc)],
    [t('fs.fa.net'), tienA((y) => (cellsA(y)[FA_CLS[j].row] ?? 0) + (cellsA(y)[FA_CLS[j].row + 1] ?? 0)), tienF((y) => y.fa[j].cost + y.fa[j].acc), 'dl-tot'],
  ];
  const coSo = (j) => a.inputFs.years.some((y) => cellsA(y)[FA_CLS[j].row]) || M.years.some((y) => y.fa[j].add);
  const FA = h('div', {},
    h('p', { class: 'priv' }, t('fs.fa.lead')),
    capexPlan,
    bang([
      ...FA_CLS.flatMap((_, j) => (coSo(j) ? lanFA(j) : [])),
      [t('fs.fa.gw'), 'grp'],
      [t('fs.fa.gwAm'), tienA((y) => cellsA(y)[188]), tienF((y) => -y.gwAm)],
      [t('fs.fa.gwNet'), tienA((y) => cellsA(y)[65]), tienF((y) => y.bs.gwNet), 'dl-tot'],
      [t('fs.memo'), 'grp'],
      [t('fs.fa.totDa'), () => '', tienF((y) => y.cf.da), 'dl-tot'],
      [t('fs.fa.totNet'), tienA((y) => ['54', '55', '57', '58'].reduce((s, k) => s + (cellsA(y)[k] ?? 0), 0)), tienF((y) => y.bs.faNet), 'dl-tot'],
    ]));

  // ── IS · BS · CF · Ratios ──
  const ac = (y) => actualRow(cellsA(y));
  const IS = bang([
    [t('fs.is.rev'), tienA((y) => ac(y).rev), tienF((y) => y.is.rev), 'dl-tot'],
    [t('fs.is.growth'), null, (y, i) => pc(y.is.rev / (i ? Y[i - 1].is.rev : ac(namGoc).rev) - 1)],
    [t('fs.is.cogs'), tienA((y) => -ac(y).cogs), tienF((y) => y.is.cogs)],
    [t('fs.is.gp'), tienA((y) => ac(y).gp), tienF((y) => y.is.gp), 'dl-tot'],
    [t('fs.is.gm'), (y) => pc(ac(y).gp / ac(y).rev), (y) => pc(y.is.gp / y.is.rev)],
    [t('fs.is.intIncome'), tienA((y) => cellsA(y)[12]), tienF((y) => y.is.intIncome)],
    ...(M.fcffMode === 'std' ? [[`↳ ${t('fs.is.cashInt')}`, null, tienF((y) => y.is.cashInt), 'dl-sub'], [`↳ ${t('fs.is.finOp')}`, null, tienF((y) => y.is.finOp), 'dl-sub']] : []),
    [t('fs.is.interest'), tienA((y) => cellsA(y)[13]), tienF((y) => y.is.interest)],
    [t('fs.is.otherFin'), tienA((y) => cellsA(y)[14]), tienF((y) => y.is.otherFin)],
    [t('fs.is.assoc'), tienA((y) => cellsA(y)[16]), tienF((y) => y.is.assoc)],
    [t('fs.is.selling'), tienA((y) => cellsA(y)[17]), tienF((y) => y.is.selling)],
    [t('fs.is.ga'), tienA((y) => cellsA(y)[18]), tienF((y) => y.is.ga)],
    [t('fs.is.op'), null, tienF((y) => y.is.opProfit), 'dl-tot'],
    [t('fs.is.otherInc'), tienA((y) => cellsA(y)[20]), tienF((y) => y.is.otherInc)],
    [t('fs.is.otherExp'), tienA((y) => cellsA(y)[21]), tienF((y) => y.is.otherExp)],
    [t('fs.is.ebt'), tienA((y) => ac(y).pbt), tienF((y) => y.is.pbt), 'dl-tot'],
    [t('fs.is.tax'), tienA((y) => ac(y).tax), tienF((y) => y.is.tax)],
    [t('fs.tx.eff'), (y) => pc(ac(y).pbt ? -ac(y).tax / ac(y).pbt : null), (y) => pc(y.is.taxRate)],
    [t('fs.is.npat'), tienA((y) => ac(y).npat), tienF((y) => y.is.npat), 'dl-tot'],
    [t('fs.is.nci'), tienA((y) => -ac(y).nci), tienF((y) => y.is.nci)],
    [t('fs.is.npatP'), tienA((y) => ac(y).npatP), tienF((y) => y.is.npatP), 'dl-tot'],
    [t('fs.is.shares'), (y) => (cellsA(y)[214] ? `${cellsA(y)[214].toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr` : ''), (y) => (y.is.shares ? `${(y.is.shares / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tr` : '—')],
    [t('fs.is.eps'), null, (y) => dong(y.is.eps)],
    [t('fs.memo'), 'grp'],
    [t('fs.is.ebit'), null, tienF((y) => y.is.ebit), 'dl-tot'],
    [t('fs.is.da'), null, tienF((y) => y.is.da)],
    ['EBITDA', null, tienF((y) => y.is.ebitda)],
  ]);
  const ga = (rows) => (y) => money(rows.reduce((s, k) => s + (cellsA(y)[k] ?? 0), 0));
  const BS = bang([
    [t('fs.bs.assets'), 'grp'],
    [t('fs.bs.cash'), ga([32, 33]), tienF((y) => y.bs.cash)],
    ...BS_DRIVERS.filter((d) => d.side === 'A').map((d) => [t(`fs.d.${d.k}`), ga([d.row]), tienF((y) => y.bs[d.k])]),
    [t('fs.bs.assoc'), ga([60]), tienF((y) => y.bs.assoc)],
    [t('fs.bs.ppe'), ga([54, 55, 57, 58]), tienF((y) => y.bs.faNet)],
    [t('fs.fa.gwNet'), ga([65]), tienF((y) => y.bs.gwNet)],
    [t('fs.bs.ta'), (y) => money(ac(y).assets), tienF((y) => y.bs.assets), 'dl-tot'],
    [t('fs.bs.liab'), 'grp'],
    ...BS_DRIVERS.filter((d) => d.side === 'L').map((d) => [t(`fs.d.${d.k}`), ga([d.row]), tienF((y) => y.bs[d.k])]),
    [t('fs.d.stDebt'), ga([78]), tienF((y) => y.bs.stDebt)],
    [t('fs.bs.ltDebt'), ga([80]), tienF((y) => y.bs.ltDebt)],
    [t('fs.bs.revolver'), () => '', tienF((y) => y.bs.revolver)],
    Math.abs(M.base.plug) > 1 ? [t('fs.bs.plug'), () => '', tienF((y) => y.bs.plug)] : null,
    [t('fs.bs.tl'), (y) => money(ac(y).liab), tienF((y) => y.bs.liab), 'dl-tot'],
    [t('fs.bs.eqP'), ga([85, 86, 87, 88, 89]), tienF((y) => y.bs.shareCap + y.bs.retained)],
    [t('fs.bs.nci'), ga([90]), tienF((y) => y.bs.nci)],
    [t('fs.bs.te'), (y) => money(ac(y).equity), tienF((y) => y.bs.equity), 'dl-tot'],
    [t('fs.bs.tle'), (y) => money(ac(y).liab + ac(y).equity), tienF((y) => y.bs.tle), 'dl-tot'],
    [t('fs.bs.check'), (y) => money(ac(y).assets - ac(y).liab - ac(y).equity), (y) => (Math.abs(y.check) <= Math.max(1, Math.abs(y.bs.assets) * 1e-9) ? '✓ 0' : money(y.check)), 'dv-check'],
  ].filter(Boolean));
  const datArr = (k, i, v) => { const arr = Array.from({ length: Y.length }, (_, j) => F[k][j] ?? null); arr[i] = v; dat({ [k]: arr }); };
  const oYr = (k, y) => h('input', { type: 'number', step: 'any', class: `dv-yr${Number.isFinite(F[k][y.t - 1]) ? ' on' : ''}`, 'aria-label': `${t(`fs.${k}`)} ${nhanF(y)}`,
    value: Number.isFinite(F[k][y.t - 1]) ? String(+(F[k][y.t - 1] / u).toFixed(2)) : '', placeholder: '0',
    onchange: (e) => datArr(k, y.t - 1, e.target.value === '' ? null : +e.target.value * u) });
  const cfA = (r2) => (y) => money(cellsA(y)[r2]);
  const CF = bang([
    [t('fs.cf.cfoH'), 'grp'],
    [t('fs.cf.pbt'), (y) => money(ac(y).pbt), tienF((y) => y.cf.pbt)],
    [t('fs.cf.da'), cfA(98), tienF((y) => y.cf.da)],
    [t('fs.cf.prov'), cfA(99), tienF((y) => y.cf.prov)],
    [t('fs.cf.assoc'), cfA(100), tienF((y) => y.cf.assoc)],
    [t('fs.cf.interest'), cfA(101), tienF((y) => y.cf.interest)],
    [t('fs.cf.rec'), cfA(103), tienF((y) => y.cf.rec)],
    [t('fs.cf.inv'), cfA(104), tienF((y) => y.cf.inv)],
    [t('fs.cf.pay'), cfA(105), tienF((y) => y.cf.pay)],
    [t('fs.cf.prepaid'), cfA(106), tienF((y) => y.cf.prepaid)],
    [t('fs.cf.intPaid'), cfA(107), tienF((y) => y.cf.intPaid)],
    [t('fs.cf.taxPaid'), cfA(108), tienF((y) => y.cf.taxPaid)],
    [t('fs.cf.other'), cfA(109), tienF((y) => y.cf.other)],
    [t('fs.cf.cfo'), cfA(110), tienF((y) => y.cf.cfo), 'dl-tot'],
    [t('fs.cf.cfiH'), 'grp'],
    [t('fs.cf.capex'), cfA(112), tienF((y) => y.cf.capex)],
    [t('fs.cf.stInv'), () => '', tienF((y) => y.cf.stInv)],
    [t('fs.cf.assocInv'), () => '', tienF((y) => y.cf.assocInv)],
    [t('fs.cf.assocDiv'), () => '', tienF((y) => y.cf.assocDiv)],
    [t('fs.cf.invOther'), cfA(114), tienF((y) => y.cf.invOther)],
    [t('fs.cf.cfi'), cfA(116), tienF((y) => y.cf.cfi), 'dl-tot'],
    [t('fs.cf.cffH'), 'grp'],
    [t('fs.cf.issue'), cfA(118), tienF((y) => y.cf.issue)],
    [t('fs.cf.stVay'), cfA(208), tienF((y) => y.cf.stVay)],
    [t('fs.cf.stTra'), cfA(209), tienF((y) => y.cf.stTra)],
    [`${t('fs.ltNew')} (${ul})`, cfA(210), (y) => oYr('ltNew', y)],
    [`${t('fs.ltRepay')} (${ul})`, cfA(211), (y) => oYr('ltRepay', y)],
    [t('fs.cf.revolver'), () => '', tienF((y) => y.cf.revolver)],
    [t('fs.cf.div'), cfA(122), tienF((y) => y.cf.div)],
    [t('fs.cf.cff'), cfA(124), tienF((y) => y.cf.cff), 'dl-tot'],
    [t('fs.cf.net'), cfA(125), tienF((y) => y.cf.net), 'dl-tot'],
    [t('fs.cf.open'), cfA(126), tienF((y) => y.cf.open)],
    [t('fs.cf.close'), cfA(128), tienF((y) => y.cf.close), 'dl-tot'],
    [t('fs.cf.check'), () => '', (y) => (Math.abs(y.cf.close - y.bs.cash) < 1 ? '✓ 0' : money(y.cf.close - y.bs.cash)), 'dv-check'],
    [t('fs.memo'), 'grp'],
    ...(M.fcffMode === 'std' ? [[t('fs.cf.cashInt'), () => '', tienF((y) => -y.is.cashInt * (1 - y.is.taxRate)), 'dl-sub']] : []),
    [t('fs.cf.fcff'), () => '', tienF((y) => y.cf.fcff), 'dl-tot'],
    [t('fs.cf.fcfe'), () => '', tienF((y) => y.cf.fcfe)],
  ]);
  const gia = V.price;
  const RT = bang([
    ['DSO', () => '', (y) => y.ratios.dso.toFixed(1)], ['DIO', () => '', (y) => (Number.isFinite(y.ratios.dio) ? y.ratios.dio.toFixed(1) : '—')],
    ['DPO', () => '', (y) => (Number.isFinite(y.ratios.dpo) ? y.ratios.dpo.toFixed(1) : '—')],
    [t('fs.rt.ccc'), () => '', (y) => (Number.isFinite(y.ratios.dio) ? (y.ratios.dso + y.ratios.dio - y.ratios.dpo).toFixed(1) : '—')],
    [t('fs.rt.netDebt'), () => '', tienF((y) => y.ratios.netDebt)],
    [t('fs.rt.lev'), () => '', (y) => lan(y.ratios.lev)], [t('fs.rt.cover'), () => '', (y) => lan(y.ratios.cover)],
    ['ROE', () => '', (y) => pc(y.ratios.roe)], ['DPS', () => '', (y) => dong(y.ratios.dps)], ['BVPS', () => '', (y) => dong(y.ratios.bvps)],
    [t('fs.rt.pe'), () => '', (y) => (gia && y.is.eps > 0 ? lan(gia / y.is.eps) : '—')],
    [t('fs.rt.pb'), () => '', (y) => (gia && y.ratios.bvps > 0 ? lan(gia / y.ratios.bvps) : '—')],
  ]);

  // ── Tab Tax & associates (13.Tax_JV_Sched) ──
  const datAN = (i, v) => { const arr = Array.from({ length: Y.length }, (_, j) => F.assocNew[j] ?? null); arr[i] = v; dat({ assocNew: arr }); };
  const dLk = DEF.assocProfit;
  const thueA = (y) => { const x = ac(y); return x.pbt ? -x.tax / x.pbt : null; };
  const TAX = h('div', {},
    h('p', { class: 'priv' }, t('fs.tx.lead')),
    nhom(t('fs.tx.fs'), '',
      oPct(t('fs.assocDiv'), F.assocDiv, null, (v) => dat({ assocDiv: v ?? 0 }), '5')),
    bang([
      [t('fs.tx.a'), 'grp'],
      [t('fs.cf.pbt'), (y) => money(ac(y).pbt), tienF((y) => y.tax.pbt)],
      [t('fs.tx.charge'), tienA((y) => cellsA(y)[23]), tienF((y) => -y.tax.charge)],
      [t('fs.tx.deferred'), tienA((y) => cellsA(y)[24]), () => money(0)],
      [t('fs.tx.eff'), (y) => pc(thueA(y)), (y) => pc(y.tax.rate)],
      [t('fs.tx.stat'), (y) => pc(cellsA(y)[216]), () => pc(cellsA(namGoc)[216])],
      [t('fs.tx.b'), 'grp'],
      [t('fs.tx.open'), null, tienF((y) => y.tax.open)],
      [t('fs.tx.chargeP'), null, tienF((y) => y.tax.charge)],
      [t('fs.tx.paid'), null, tienF((y) => -y.tax.paid)],
      [t('fs.tx.close'), tienA((y) => cellsA(y)[73]), tienF((y) => y.tax.close), 'dl-tot'],
      [t('fs.tx.c'), 'grp'],
      [t('fs.d.dta'), tienA((y) => cellsA(y)[63]), tienF((y) => y.tax.dta)],
      [t('fs.d.dtl'), tienA((y) => cellsA(y)[81]), tienF((y) => y.tax.dtl)],
      [t('fs.tx.net'), tienA((y) => (cellsA(y)[63] ?? 0) - (cellsA(y)[81] ?? 0)), tienF((y) => y.tax.dta - y.tax.dtl), 'dl-tot'],
      [t('fs.tx.d'), 'grp'],
      [t('fs.jv.open'), null, tienF((y) => y.jv.open)],
      [`${t('fs.jv.add')} (${ul})`, null, (y, i) => h('input', { type: 'number', step: 'any', class: `dv-yr${Number.isFinite(F.assocNew[i]) ? ' on' : ''}`, 'aria-label': `${t('fs.jv.add')} ${nhanF(y)}`,
        value: Number.isFinite(F.assocNew[i]) ? String(+(F.assocNew[i] / u).toFixed(2)) : '', placeholder: '0',
        onchange: (e) => datAN(i, e.target.value === '' ? null : +e.target.value * u) })],
      [t('fs.jv.share'), tienA((y) => cellsA(y)[16]), (y, i) => oY(dLk, i)],
      [t('fs.jv.div'), null, tienF((y) => y.jv.div)],
      [t('fs.jv.close'), tienA((y) => cellsA(y)[60]), tienF((y) => y.jv.close), 'dl-tot'],
    ]));

  const TABS = { drv: DRV, fa: FA, tax: TAX, is: IS, bs: BS, cf: CF, rt: RT };
  if (!TABS[uiFs.tab]) uiFs.tab = 'drv';
  const panel = h('div', { class: 'dv-3panel' }, TABS[uiFs.tab]);
  const tabs = h('div', { class: 'dv-tabs', role: 'tablist' }, Object.keys(TABS).map((k) => h('button', {
    type: 'button', role: 'tab', class: `dv-tab${uiFs.tab === k ? ' on' : ''}`, 'aria-selected': String(uiFs.tab === k),
    onclick: (e) => {
      uiFs.tab = k;
      panel.replaceChildren(TABS[k]);
      e.currentTarget.parentElement.querySelectorAll('.dv-tab').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    } }, t(`fs.tab.${k}`))));
  return khung(
    nguon,
    cheDo,
    h('p', { class: `msg ${M.ok ? 'ok' : 'err'}` }, M.ok ? t('fs.ok') : t('fs.bad')),
    M.issues.map((k) => h('p', { class: 'msg warn' }, t(`fs.issue.${k}`))),
    giaDinh,
    h('ul', { class: 'priv dv-tipsl' }, ['fs.tip.drv', 'fs.tip.fa', 'fs.tip.cf'].map((k) => h('li', {}, t(k)))),
    tabs, panel);
}
