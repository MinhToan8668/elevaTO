// Tab "Phân tích & đề xuất" ở bước rà soát: sức khoẻ tài chính, dấu hiệu bất thường, việc cần làm.
// Toàn bộ kết luận do js/core/analysis.js tính bằng công thức — AI không viết chữ nào ở đây, nên đọc
// bằng tiếng Việt hay tiếng Anh cũng ra đúng một nhận định.
//
// Cũng ở đây: bảng đối chiếu NGƯỢC thuyết minh ↔ ba bảng chính (js/core/reconcile.js), vì đó là chỗ
// người dùng cần xem trước khi tin vào phần phân tích bên dưới.

import { h, fmt } from './dom.js';
import { analyze, LEVELS, SEVERITIES } from '../core/analysis.js';
import { reconcile } from '../core/reconcile.js';
import { periodLabel } from '../core/table.js';
import { t, unitLabel } from '../i18n.js';

const SUBS = ['liq', 'prof', 'lev', 'asset'];
const tone = (muc) => LEVELS[muc]?.tone || '';
const chip = (muc) => h('span', { class: `tag ${tone(muc)}` }, t(`level.${muc}`));

/**
 * Một con số của nhận định → chuỗi. core/analysis.js gắn sẵn kiểu cho từng số (xem `money`/`pc`/… ở đó):
 *   '' số tiền (theo đơn vị đang chọn) · '%' tỷ lệ · 'pp' điểm phần trăm · 'x' số lần · 'd' ngày · 'n' số đếm
 */
function soCau({ n, k }, unit) {
  if (k === 'n') return String(n);
  if (!Number.isFinite(n)) return '—';
  if (k === '%') return `${n.toFixed(1)}%`;
  if (k === 'pp') return t('an.pp', { v: n.toFixed(1) });
  if (k === 'x') return t('ch.times', { v: n.toFixed(2) });
  if (k === 'd') return t('ch.days', { v: Math.round(n) });
  return `${fmt(n, unit)} ${unitLabel(unit)}`;
}

const dich = (khoa, params, unit) => t(khoa, Object.fromEntries(Object.entries(params || {}).map(([k, v]) => [k, soCau(v, unit)])));

/** @returns phần tử của tab, hoặc lời nhắn nếu chưa đủ số. */
export function renderAnalysis(ds, unit) {
  const a = analyze(ds);
  if (!a) return h('p', { class: 'empty' }, t('ch.none'));
  const ky = a.periods[a.last];
  const soSanh = a.prev >= 0 ? a.periods[a.prev] : null;
  return h('div', {},
    h('p', { class: 'priv' }, t('an.lead', { p: ky.label, prev: soSanh ? soSanh.label : t('an.noPrev') })),
    h('div', { class: 'health' },
      h('div', { class: `hbox ${tone(a.health)}` }, h('span', { class: 'hlbl' }, t('an.health')), h('b', {}, t(`level.${a.health}`))),
      h('ul', { class: 'hsubs' }, a.subs.map((x) => h('li', {}, h('span', {}, t(`sub.${x.key}`)), chip(x.level))))),
    flagList(a, unit),
    adviceList(a, unit),
    h('p', { class: 'priv' }, t('an.note')));
}

function flagList(a, unit) {
  if (!a.flags.length) return h('p', { class: 'msg' }, t('an.noFlag'));
  const khoi = SEVERITIES.map((sv) => {
    const list = a.flags.filter((f) => f.severity === sv);
    if (!list.length) return null;
    return h('div', { class: `fgrp sv-${sv}` },
      h('h4', {}, t(`sev.${sv}`), h('span', { class: 'tag' }, String(list.length))),
      h('ul', {}, list.map((f) => h('li', {},
        h('b', {}, t(`flag.${f.id}`)),
        h('span', {}, dich(`flag.${f.id}.why`, f.params, unit))))));
  });
  return h('section', { class: 'flags' }, h('h3', {}, t('an.flags')), khoi);
}

function adviceList(a, unit) {
  return h('section', { class: 'advice' }, h('h3', {}, t('an.advice')),
    h('ol', {}, a.advice.map((x) => h('li', {},
      h('b', {}, t(`adv.${x.id}`)),
      h('span', {}, dich(`adv.${x.id}.how`, x.params, unit))))));
}

// ─── Đối chiếu ngược thuyết minh ───────────────────────────

/** @returns bảng lệch giữa thuyết minh và ba bảng chính, hoặc null nếu khớp hết / chưa có thuyết minh. */
export function renderReconcile(ds, unit) {
  const rc = reconcile(ds, { unit });
  const ids = Object.keys(rc);
  if (!ids.length) return null;
  const n = ids.reduce((a, k) => a + rc[k].length, 0);
  const nang = ids.reduce((a, k) => a + rc[k].filter((x) => x.severity === 'warn').length, 0);
  const rows = ds.periods.flatMap((p) => (rc[p.id] || []).map((x) => h('tr', { class: x.severity === 'warn' ? 'bad' : '' },
    h('td', {}, periodLabel(p)),
    h('td', {}, t(`rc.${x.id}`), x.name ? h('small', { class: 'priv' }, x.name) : null),
    h('td', { class: 'num' }, fmt(x.reported, unit)),
    h('td', { class: 'num' }, fmt(x.computed, unit)),
    h('td', { class: 'num' }, fmt(x.diff, unit)))));
  return h('details', { class: 'msg warn', open: nang > 0 },
    h('summary', {}, t('rc.h', { n, warn: nang, unit: unitLabel(unit) })),
    h('p', {}, t('rc.lead')),
    h('div', { class: 'gridwrap' }, h('table', { class: 'k' },
      h('thead', {}, h('tr', {}, h('th', {}, t('src.period')), h('th', {}, t('rc.item')), h('th', { class: 'num' }, t('rc.stmt')), h('th', { class: 'num' }, t('rc.note')), h('th', { class: 'num' }, t('rc.diff')))),
      h('tbody', {}, rows))));
}

// ─── AI nhận định ──────────────────────────────────────────
// Lượt AI thứ hai, chạy khi người dùng bấm: máy gửi đúng bảng số đã tính (core/aireview.js) cho AI và
// AI viết lời. Kết quả giữ trong store theo băm của số liệu: số đổi (sửa ô, thêm file) thì nhận định cũ
// vẫn hiện nhưng được đánh dấu "lỗi thời" để bấm viết lại.

import { buildAiReviewInput, aiReviewPrompt, sanitizeAiReview, aiReviewText, AI_REVIEW_SCHEMA, AI_REVIEW_SYSTEM } from '../core/aireview.js';
import { toast } from './dom.js';
import { isFatal } from '../ai.js';

const aiUi = { running: false, error: '' };

/** @returns khối "AI nhận định" ở cuối tab Phân tích & đề xuất. */
export function renderAiReview(store, ctx) {
  const s = store.get();
  const { ds } = store.data();
  const built = buildAiReviewInput(ds, { company: ds.company });
  if (!built) return null;
  const cur = s.aiReview;
  const stale = !!(cur && cur.hash !== built.hash);
  const run = async () => {
    if (aiUi.running) return;
    if (!ctx.canDo(t('ai.need'), run)) return;
    const client = ctx.client((sec, msg) => toast(t('run.retry', { msg: msg || t('run.busy'), sec }), sec * 1000));
    if (!client) return toast(t('run.needLogin'));
    aiUi.running = true; aiUi.error = '';
    store.set({ aiReview: cur ? { ...cur } : null });           // vẽ lại để hiện trạng thái đang chạy
    try {
      const raw = await client.json({ parts: [{ text: aiReviewPrompt(built.input) }], schema: AI_REVIEW_SCHEMA, system: AI_REVIEW_SYSTEM, maxOutputTokens: 8192 });
      const result = sanitizeAiReview(raw);
      if (!result.tong_quan && !result.ket_luan) throw new Error(t('ai.empty'));
      store.set({ aiReview: { hash: built.hash, lang: built.input.language, result, at: new Date().toISOString() } });
    } catch (e) {
      aiUi.error = e.message;
      if (isFatal(e)) toast(e.message, 8000);
      store.set({ aiReview: cur ? { ...cur } : null });
    } finally {
      aiUi.running = false;
      ctx.refreshQuota?.();
    }
  };
  const btn = h('button', { class: 'btn', type: 'button', disabled: aiUi.running, onclick: run },
    aiUi.running ? t('ai.running') : cur ? t('ai.again') : t('ai.btn'));
  const head = h('div', { class: 'ai-head' },
    h('h3', {}, t('ai.h')),
    h('p', { class: 'priv', style: { margin: 0 } }, t('ai.lead')),
    h('div', { class: 'bar' }, btn, h('span', { class: 'tag' }, t('ai.cost')),
      cur ? h('button', { class: 'btn ghost sm', type: 'button', onclick: () => {
        const text = aiReviewText(cur.result, tieuDe());
        navigator.clipboard?.writeText(text).then(() => toast(t('ai.copied'))).catch(() => toast(t('ai.copyFail')));
      } }, t('ai.copy')) : null));
  const body = [];
  if (aiUi.error) body.push(h('p', { class: 'msg err' }, aiUi.error));
  if (cur) {
    if (stale) body.push(h('p', { class: 'msg warn' }, t('ai.stale')));
    body.push(renderAiResult(cur.result));
    body.push(h('p', { class: 'priv' }, t('ai.note', { at: new Date(cur.at).toLocaleString() })));
  }
  return h('section', { class: 'airev' }, head, body);
}

const tieuDe = () => ({ title: t('ai.h'), tong_quan: t('ai.sec.tong_quan'), diem_manh: t('ai.sec.diem_manh'), diem_yeu: t('ai.sec.diem_yeu'),
  xu_huong: t('ai.sec.xu_huong'), rui_ro: t('ai.sec.rui_ro'), de_xuat: t('ai.sec.de_xuat'), cau_hoi: t('ai.sec.cau_hoi'), ket_luan: t('ai.sec.ket_luan'),
  muc: { cao: t('sev.cao'), tb: t('sev.tb'), thap: t('sev.thap') } });

function renderAiResult(r) {
  const list = (key, items) => (items.length ? h('div', { class: 'ai-sec' }, h('h4', {}, t(`ai.sec.${key}`)), h('ul', {}, items.map((x) => h('li', {}, x)))) : null);
  return h('div', { class: 'ai-body' },
    r.tong_quan ? h('div', { class: 'ai-sec' }, h('h4', {}, t('ai.sec.tong_quan')), h('p', {}, r.tong_quan)) : null,
    h('div', { class: 'ai-grid' }, list('diem_manh', r.diem_manh), list('diem_yeu', r.diem_yeu)),
    list('xu_huong', r.xu_huong),
    r.rui_ro.length ? h('div', { class: 'ai-sec' }, h('h4', {}, t('ai.sec.rui_ro')),
      h('ul', { class: 'ai-risks' }, r.rui_ro.map((x) => h('li', { class: `sv-${x.muc}` },
        h('span', { class: `tag ${x.muc === 'cao' ? 'red' : x.muc === 'tb' ? 'gold' : ''}` }, t(`sev.${x.muc}`)),
        x.tieu_de ? h('b', {}, x.tieu_de, ' — ') : null, h('span', {}, x.noi_dung))))) : null,
    list('de_xuat', r.de_xuat),
    list('cau_hoi', r.cau_hoi),
    r.ket_luan ? h('div', { class: 'ai-sec ai-end' }, h('h4', {}, t('ai.sec.ket_luan')), h('p', {}, r.ket_luan)) : null);
}
