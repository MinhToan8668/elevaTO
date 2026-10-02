// Các sheet thuyết minh của Form chuẩn hóa — chỉ học viên / giảng viên mới xuất được.
//
// Đây là phần chi tiết mà model forecast cần nhưng ba báo cáo chính không có: doanh thu & LN gộp
// theo mảng, TSCĐ theo nhóm, lợi thế thương mại, biến động vốn chủ, vay & nợ thuê tài chính,
// tham số cổ phiếu. Số gốc để ở đồng, mỗi ô là công thức chia DonVi nên đổi đơn vị ở sheet
// Tổng quan là cả file tự tính lại.

import { numToCol } from './xlsx.js';
import { S, DV, cellStr, row, sheetXml, soThuong, tinhSanO, ghiO, periodTitle } from './xlsxout.js';
import { t } from '../i18n.js';

const HEAD_ROW = 4;
// Bày đúng thứ tự bảng biến động TSCĐ in trong BCTC: đầu năm → tăng → cuối năm, rồi hao mòn.
const FA_DONG = [['costOpen', 'costOpen'], ['add', 'additions'], ['cost', 'cost'],
  ['accOpen', 'accDepOpen'], ['dep', 'depreciation'], ['acc', 'accDep']];
const GW_DONG = ['cost', 'accAmort', 'additions', 'amortization'];
const DEBT_DONG = ['stProceeds', 'stRepay', 'ltProceeds', 'ltRepay'];
const EQ_DONG = ['capIssued', 'capBonus', 'capEsop', 'capStockDiv', 'capDecrease', 'premiumInc', 'premiumDec',
  'treasuryInc', 'treasuryDec', 'devFundInc', 'devFundDec', 'dividends', 'reOtherInc', 'reOtherDec', 'nciChange'];

/** @returns [{ name, xml }] các sheet thuyết minh có số; sheet nào không có số thì bỏ. */
export function noteSheets(ds, dv) {
  const out = [];
  for (const [key, dung] of [['seg', khoiMang], ['fa', khoiTSCD], ['eq', khoiVonChu], ['debt', khoiNoVay]]) {
    const khoi = dung(ds);
    if (khoi.some((k) => k.rows.length)) out.push({ name: t(`xn.sheet.${key}`), xml: sheetThuyetMinh(ds, key, khoi, dv) });
  }
  return out;
}

/**
 * Dựng một sheet thuyết minh từ các khối { ten, rows: [{ label, get, kind }] }.
 * get(notes) trả số gốc: đơn vị đồng với kind 'money' (mặc định), còn 'pct' / 'int' giữ nguyên.
 */
function sheetThuyetMinh(ds, key, khoi, dv) {
  const cot = (i) => numToCol(2 + i);
  const last = cot(ds.periods.length - 1);
  const ke = [];
  let n = HEAD_ROW + 2;
  for (const k of khoi) {
    if (!k.rows.length) continue;
    ke.push({ n, band: k.ten, o: ds.periods.map((p, i) => ({ ref: `${cot(i)}${n}`, trong: true, s: S.secHead })) });
    n += 1;
    for (const r of k.rows) {
      ke.push({
        n,
        nhan: cellStr(`A${n}`, r.label, r.tong ? S.labelTot : S.labelIn),
        o: ds.periods.map((p, i) => oSo(`${cot(i)}${n}`, r, (ds.notes && ds.notes[p.id]) || {})),
      });
      n += 1;
    }
    n += 1;                                         // một dòng trắng giữa các khối
  }

  const san = tinhSanO(ke, dv);

  const out = [
    row(1, [cellStr('A1', ds.company || t('xl.company'), S.title)], 22),
    row(2, [cellStr('A2', t(`xn.title.${key}`), S.textB)]),
    row(3, [cellStr('A3', t('xl.subPick'), S.sub)]),
    row(HEAD_ROW, [cellStr(`A${HEAD_ROW}`, t('xl.item'), S.head),
      ...ds.periods.map((p, i) => cellStr(`${cot(i)}${HEAD_ROW}`, periodTitle(p), S.head))], 28),
  ];
  for (const k of ke) {
    const nhan = k.band === undefined ? k.nhan : cellStr(`A${k.n}`, k.band, S.secHead);
    out.push(row(k.n, [nhan, ...k.o.map((o) => ghiO(o, san))], k.band === undefined ? undefined : 20));
  }
  return sheetXml({ cols: [56, ...ds.periods.map(() => 17)], rowsXml: out, freeze: { x: 1, y: HEAD_ROW }, merges: [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`] });
}

function oSo(ref, r, notes) {
  const v = r.get(notes);
  if (!Number.isFinite(v)) return { ref, v: null, s: r.kind === 'pct' ? S.pct : S.num };
  if (r.kind === 'pct') return { ref, v, s: S.pct };
  if (r.kind === 'int') return { ref, v, s: S.int };
  const go = soThuong(v);
  const s = r.tong ? S.numTot : S.num;
  return go === null ? { ref, v: null, s } : { ref, f: `${go}/${DV}`, s };
}

/** Tên mảng kinh doanh xuất hiện ở bất kỳ kỳ nào, giữ thứ tự gặp đầu tiên. */
function tenMang(ds) {
  const out = new Set();
  for (const p of ds.periods) for (const sg of (ds.notes && ds.notes[p.id]?.segments) || []) out.add(sg.name);
  return [...out];
}

// Thuyết minh bộ phận do AI trả về có thể rất nhiều mảng; tra bằng Map để không thành O(n²).
const nhoMang = new WeakMap();
function timMang(notes, ten) {
  let m = nhoMang.get(notes);
  if (!m) { m = new Map((notes.segments || []).map((x) => [x.name, x])); nhoMang.set(notes, m); }
  return m.get(ten);
}

/** Tổng theo mảng: cộng các mảng có số; không mảng nào có số thì để trống chứ không ra 0. */
function tongMang(notes, f) {
  const co = (notes.segments || []).filter((x) => Number.isFinite(x[f]));
  return co.length ? co.reduce((s, x) => s + x[f], 0) : undefined;
}

function khoiMang(ds) {
  const ten = tenMang(ds);
  const coSo = (f) => ds.periods.some((p) => Number.isFinite(tongMang((ds.notes && ds.notes[p.id]) || {}, f)));
  const khoi = (f, tongKey) => (ten.length && coSo(f)
    ? [...ten.map((nm) => ({ label: nm, get: (no) => timMang(no, nm)?.[f] })),
      { label: t(tongKey), tong: true, get: (no) => tongMang(no, f) }]
    : []);
  return [
    { ten: t('xn.seg.rev'), rows: khoi('revenue', 'xn.seg.revTotal') },
    { ten: t('xn.seg.gross'), rows: khoi('gross', 'xn.seg.grossTotal') },
  ];
}

/**
 * TSCĐ bày theo ĐÚNG CÁC DÒNG IN TRONG THUYẾT MINH, không ép về 7 nhóm của model: BCTC nào có
 * nhóm lạ ("Vườn cây lâu năm", "Súc vật làm việc"…) thì vẫn hiện nguyên tên, kèm nhóm model nó
 * được xếp vào để đối chiếu. Riêng form chi tiết elevaTO vẫn giữ nhãn của model để dán cho khớp dòng.
 */
function khoiTSCD(ds) {
  const nhom = [];
  for (const { kind, name, cls } of nhomTSCD(ds)) {
    // Chỉ chú thêm nhóm của model khi tên in trên BCTC khác nó, khỏi lặp "Nhà cửa (HH · Nhà cửa)".
    const mau = t(`tm.fa.${cls}`);
    const phu = mau.toLowerCase() === name.toLowerCase() ? t(`tm.fa.${kind}`) : `${t(`tm.fa.${kind}`)} · ${mau}`;
    nhom.push({
      ten: `${name} (${phu})`,
      rows: FA_DONG.map(([k, f]) => ({ label: t(`tm.fa.${k}`), get: (no) => lopTSCD(no, kind, name)?.[f] })),
    });
  }
  const coGW = ds.periods.some((p) => (ds.notes && ds.notes[p.id]?.goodwill));
  if (coGW) nhom.push({ ten: t('xn.gw'), rows: GW_DONG.map((f) => ({ label: t(`tm.gw.${f}`), get: (no) => no.goodwill?.[f] })) });
  return nhom;
}

/** Các dòng TSCĐ có trong thuyết minh của bất kỳ kỳ nào, giữ thứ tự in. */
function nhomTSCD(ds) {
  const ra = new Map();
  for (const p of ds.periods) {
    const fa = (ds.notes && ds.notes[p.id]?.fixedAssets) || {};
    for (const kind of ['tangible', 'intangible']) {
      for (const x of fa[kind] || []) {
        const khoa = `${kind}|${x.name}`;
        if (!ra.has(khoa)) ra.set(khoa, { kind, name: x.name || t(`tm.fa.${x.cls}`), cls: x.cls });
      }
    }
  }
  return [...ra.values()];
}

const lopTSCD = (notes, kind, name) => (notes.fixedAssets?.[kind] || []).find((x) => x.name === name);

function khoiVonChu(ds) {
  const co = (f) => ds.periods.some((p) => Number.isFinite((ds.notes && ds.notes[p.id]?.equity)?.[f]));
  return [{ ten: t('xn.eq.band'), rows: EQ_DONG.filter(co).map((f) => ({ label: t(`xn.eq.${f}`), get: (no) => no.equity?.[f] })) }];
}

function khoiNoVay(ds) {
  const coDebt = ds.periods.some((p) => (ds.notes && ds.notes[p.id]?.debt));
  const khoi = [];
  if (coDebt) khoi.push({ ten: t('xn.debt.band'), rows: DEBT_DONG.map((f) => ({ label: t(`tm.debt.${f}`), get: (no) => no.debt?.[f] })) });
  const rows = [];
  if (ds.periods.some((p) => Number.isFinite((ds.notes && ds.notes[p.id])?.shares))) rows.push({ label: t('xn.shares'), kind: 'int', get: (no) => no.shares });
  if (ds.periods.some((p) => Number.isFinite((ds.notes && ds.notes[p.id])?.taxRate))) rows.push({ label: t('tm.taxRate'), kind: 'pct', get: (no) => no.taxRate });
  if (rows.length) khoi.push({ ten: t('xn.params.band'), rows });
  return khoi;
}
