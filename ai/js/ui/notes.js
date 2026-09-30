// Bước 4, tab "Thuyết minh" và "Xem trước model": số AI đọc từ thuyết minh, ghép mảng kinh doanh vào
// 5 ô của model, và bảng xem trước đúng các ô sẽ điền vào sheet 03.Input_FS.

import { h, fmt } from './dom.js';
import { periodLabel } from '../core/table.js';
import { buildModel, MODEL_ROWS, SEGMENT_SLOTS } from '../targets/model.js';

const M = 1e6;
const FA_NAME = { buildings: 'Nhà cửa, vật kiến trúc', machinery: 'Máy móc, thiết bị', transport: 'Phương tiện vận tải', office: 'Thiết bị quản lý', other: 'Khác', land: 'Quyền sử dụng đất', software: 'Phần mềm / vô hình khác' };
const SRC = { bctc: ['BCTC', 'em'], tm: ['Thuyết minh', 'em'], lctt: ['LCTT (ước)', 'gold'], uoc: ['Ước tính', 'gold'], md: ['Mặc định', ''] };

/** Tên mảng theo thứ tự xuất hiện qua các năm; mảng chưa được người dùng gán thì lấy ô theo thứ tự (quá 5 dồn ô 5). */
export function effectiveSegmentMap(ds, userMap = {}) {
  const names = [];
  for (const p of ds.periods) for (const sg of ds.notes[p.id]?.segments || []) if (!names.includes(sg.name)) names.push(sg.name);
  const map = {};
  names.forEach((n, i) => { map[n] = Number.isInteger(userMap[n]) ? userMap[n] : Math.min(i, SEGMENT_SLOTS - 1); });
  return { names, map };
}

/** Tên 5 ô mảng để ghi vào model: người dùng nhập, không thì tên mảng đầu tiên gán vào ô đó. */
export function effectiveSegmentNames(ds, userMap, userNames = []) {
  const { names, map } = effectiveSegmentMap(ds, userMap);
  return Array.from({ length: SEGMENT_SLOTS }, (_, i) => userNames[i] || names.find((n) => map[n] === i) || '');
}

export function renderNotes(store) {
  const s = store.get();
  const { ds } = store.data();
  const withNotes = ds.periods.filter((p) => ds.notes[p.id] && Object.keys(ds.notes[p.id]).length);
  if (!withNotes.length) return h('p', { class: 'msg warn' }, 'Chưa có số thuyết minh. Chọn gói "Cho model elevaTO" ở bước 3 rồi trích xuất; nếu không, model sẽ dùng số ước tính từ 3 báo cáo chính.');
  return [segmentsCard(store, s, ds), h('div', { class: 'cards', style: { marginTop: '14px' } }, withNotes.map((p) => periodCard(p, ds.notes[p.id])))];
}

function segmentsCard(store, s, ds) {
  const { names, map } = effectiveSegmentMap(ds, s.segmentMap);
  if (!names.length) return null;
  const years = ds.periods.filter((p) => ds.notes[p.id]?.segments?.length);
  const slotNames = effectiveSegmentNames(ds, s.segmentMap, s.segmentNames);
  const rows = names.map((n) => h('tr', {},
    h('td', {}, n),
    years.map((p) => { const sg = ds.notes[p.id].segments.find((x) => x.name === n); return h('td', {}, sg ? fmt(sg.revenue, M) : ''); }),
    h('td', {}, h('select', { 'aria-label': `Ô model cho mảng ${n}`, onchange: (e) => store.set({ segmentMap: { ...store.get().segmentMap, [n]: Number(e.target.value) } }) },
      Array.from({ length: SEGMENT_SLOTS }, (_, i) => h('option', { value: String(i), selected: map[n] === i }, `Mảng ${i + 1}`))))));
  const nameInputs = h('div', { class: 'groups' }, slotNames.map((n, i) => h('label', { class: 'grp' }, h('span', {}, `Tên mảng ${i + 1} trong model`),
    h('input', { value: s.segmentNames[i] || '', placeholder: n || '(trống)', style: { width: '180px', fontFamily: 'inherit' }, onchange: (e) => {
      const next = [...store.get().segmentNames]; next[i] = e.target.value.trim().slice(0, 60); store.set({ segmentNames: next });
    } }))));
  return h('div', { class: 'cardx' },
    h('h3', {}, 'Doanh thu theo mảng → 5 mảng của model'),
    h('p', {}, 'Model có 5 ô mảng (dòng 132–136 doanh thu, 140–144 LN gộp). Gộp các mảng nhỏ vào cùng một ô nếu công ty có nhiều hơn 5. Chênh lệch với doanh thu thuần (loại trừ nội bộ) tự dồn vào mảng 5.'),
    h('table', { class: 'k' }, h('thead', {}, h('tr', {}, h('th', {}, 'Mảng (triệu đồng)'), years.map((p) => h('th', {}, periodLabel(p))), h('th', {}, 'Ô model'))), h('tbody', {}, rows)),
    nameInputs);
}

function periodCard(p, n) {
  const parts = [h('h3', {}, `Thuyết minh ${periodLabel(p)}`)];
  const kv = (title, pairs) => {
    const rows = pairs.filter(([, v]) => v !== undefined && v !== null);
    if (!rows.length) return;
    parts.push(h('table', { class: 'k' }, h('thead', {}, h('tr', {}, h('th', { colspan: '2' }, title))),
      h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, typeof v === 'number' ? fmt(v, M) : String(v)))))));
  };
  if (n.fixedAssets) {
    const all = [...(n.fixedAssets.tangible || []).map((x) => ({ ...x, t: 'HH' })), ...(n.fixedAssets.intangible || []).map((x) => ({ ...x, t: 'VH' }))];
    parts.push(h('table', { class: 'k' },
      h('thead', {}, h('tr', {}, h('th', {}, 'TSCĐ (triệu)'), h('th', {}, 'Nguyên giá'), h('th', {}, 'Hao mòn'), h('th', {}, 'Tăng'), h('th', {}, 'Khấu hao'))),
      h('tbody', {}, all.map((x) => h('tr', {}, h('td', { title: x.name }, `${x.t} · ${FA_NAME[x.cls] || x.cls}`),
        h('td', {}, fmt(x.cost, M)), h('td', {}, fmt(x.accDep, M)), h('td', {}, fmt(x.additions, M)), h('td', {}, fmt(x.depreciation, M)))))));
  }
  if (n.debt) kv('Vay (triệu)', [['Vay NH — vay mới', n.debt.stProceeds], ['Vay NH — trả nợ', n.debt.stRepay], ['Vay DH — vay mới', n.debt.ltProceeds], ['Vay DH — trả nợ', n.debt.ltRepay]]);
  if (n.equity) kv('Biến động vốn chủ (triệu)', Object.entries(n.equity));
  if (n.goodwill) kv('Lợi thế thương mại (triệu)', [['Nguyên giá', n.goodwill.cost], ['Phân bổ lũy kế', n.goodwill.accAmort], ['Tăng', n.goodwill.additions], ['Phân bổ trong kỳ', n.goodwill.amortization]]);
  kv('Tham số', [['Cổ phiếu lưu hành', n.shares !== undefined ? n.shares.toLocaleString('vi-VN') : undefined], ['Thuế suất TNDN', n.taxRate !== undefined ? `${Math.round(n.taxRate * 1000) / 10}%` : undefined]]);
  return h('div', { class: 'cardx' }, parts);
}

export function renderModel(store) {
  const s = store.get();
  const { ds } = store.data();
  const { map } = effectiveSegmentMap(ds, s.segmentMap);
  const built = buildModel(ds, { segmentMap: map });
  const years = Object.keys(built.byYear).map(Number).sort();
  if (!years.length) return h('p', { class: 'msg warn' }, 'Model elevaTO cần số cả năm (BCTC năm). Chưa có kỳ 12 tháng nào.');
  let group = '';
  const rows = [];
  for (const d of MODEL_ROWS) {
    if (!years.some((y) => built.byYear[y][d.row])) continue;
    if (d.group !== group) { group = d.group; rows.push(h('tr', { class: 'lv0' }, h('td', { colspan: String(years.length + 2) }, group))); }
    rows.push(h('tr', {}, h('td', { class: 'c' }, String(d.row)), h('td', { class: 'l' }, d.label),
      years.map((y) => {
        const c = built.byYear[y][d.row];
        if (!c) return h('td', { class: 'v' });
        const [lbl, tone] = SRC[c.src] || [c.src, ''];
        const txt = d.row === 216 ? `${Math.round(c.v * 1000) / 10}%` : d.row >= 214 ? String(c.v) : fmt(c.v, 1);
        return h('td', { class: `v${tone === 'gold' ? ' est' : ''}`, title: lbl }, txt, ' ', h('span', { class: `tag ${tone}` }, lbl[0]));
      })));
  }
  return [
    h('p', { class: 'priv' }, 'Đúng các ô sẽ ghi vào sheet 03.Input_FS (triệu đồng, chi phí mang dấu âm). Nhãn: B = BCTC, T = thuyết minh, L = suy từ LCTT, Ư = ước tính / dòng cân, M = mặc định — ô ước tính nên kiểm tra lại.'),
    built.warnings.length ? h('details', { class: 'msg warn' }, h('summary', {}, `${built.warnings.length} lưu ý cho model`), h('ul', {}, built.warnings.map((w) => h('li', {}, w)))) : null,
    h('div', { class: 'gridwrap' }, h('table', { class: 'g' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Dòng'), h('th', {}, 'Khoản mục model'), years.map((y) => h('th', {}, String(y))))),
      h('tbody', {}, rows))),
  ];
}
