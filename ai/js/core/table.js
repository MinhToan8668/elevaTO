// Bảng chuẩn hoá theo mẫu 2026 để xem / tải về: mỗi dòng một chỉ tiêu, mỗi cột một kỳ.

import { CHART } from '../chart2026.js';
import { computeTotals } from './statements.js';

export const ST_NAME = { BS: 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH', IS: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH', CF: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ' };

export function periodLabel(p) {
  if (p.months === 12) return `Năm ${p.year}`;
  return `${p.months}T/${p.year}`;
}

/**
 * Dòng hiển thị cho một báo cáo: chỉ tiêu có số ở ít nhất một kỳ (hoặc mọi dòng nếu showEmpty).
 * @returns [{ key, code, label, lvl, kind, values: {kỳ: đồng|undefined} }]
 */
export function statementRows(ds, st, { showEmpty = false } = {}) {
  const totals = Object.fromEntries(ds.periods.map((p) => [p.id, computeTotals(ds.values[p.id] || {})]));
  const rows = [];
  for (const it of CHART) {
    if (it.st !== st) continue;
    const key = `${it.st}:${it.code}`;
    const values = {};
    let any = false;
    for (const p of ds.periods) {
      const v = totals[p.id][key];
      if (Number.isFinite(v)) { values[p.id] = v; any = true; }
    }
    if (any || showEmpty) rows.push({ key, code: it.code, label: it.label, lvl: it.lvl, kind: it.kind, values });
  }
  return rows;
}

/** Mảng 2 chiều cho SheetJS: chỉ các dòng được tick (keys), đơn vị chia (1 / 1e6 / 1e9). */
export function tableAOA(ds, { keys, unit = 1, unitLabel = 'đồng' } = {}) {
  const aoa = [[ds.company || 'Doanh nghiệp'], [`Đơn vị: ${unitLabel} · theo mẫu Thông tư 99/2025/TT-BTC`], []];
  for (const st of ['BS', 'IS', 'CF']) {
    const rows = statementRows(ds, st).filter((r) => !keys || keys.has(r.key));
    if (!rows.length) continue;
    aoa.push([ST_NAME[st]]);
    aoa.push(['Mã số', 'Chỉ tiêu', ...ds.periods.map(periodLabel)]);
    for (const r of rows) {
      aoa.push([r.code, r.label, ...ds.periods.map((p) => (Number.isFinite(r.values[p.id]) ? round(r.values[p.id] / unit) : null))]);
    }
    aoa.push([]);
  }
  return aoa;
}
const round = (v) => Math.round(v * 1000) / 1000;
