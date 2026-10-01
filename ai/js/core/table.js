// Dòng của một báo cáo theo mẫu 2026 để hiển thị / xuất file: mỗi dòng một chỉ tiêu, mỗi cột một kỳ.

import { CHART } from '../chart2026.js';
import { computeTotals } from './statements.js';
import { t, chartLabel } from '../i18n.js';

export function periodLabel(p) {
  if (p.months === 12) return t('period.year', { y: p.year });
  return t('period.short', { m: p.months, y: p.year });
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
    if (any || showEmpty) rows.push({ key, code: it.code, label: chartLabel(key, it.label), lvl: it.lvl, kind: it.kind, values });
  }
  return rows;
}
