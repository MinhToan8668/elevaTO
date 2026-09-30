import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJob } from '../js/core/pipeline.js';

class E extends Error { constructor(code) { super(code); this.code = code; } }
const job = {
  name: 'BCTC 2025.pdf',
  types: ['OTHER', 'BS', 'BS', 'IS', 'CF', 'NOTES', 'NOTES', 'NOTES'],
  notes: { debt: [7], fixedAssets: [], segments: [6] },
};
const BS_ITEMS = [{ c: '111', n: 'Tiền', v: '10', p: '8' }, { c: '270', n: 'Tổng cộng tài sản', v: '10', p: '8' }, { c: '421', n: 'LNST chưa PP', v: '3', p: '2' }];

function makeIO(behaviour = {}) {
  const calls = [];
  const io = {
    calls,
    parts: async (pages) => [{ inlineData: { mimeType: 'application/pdf', data: 'p' + pages.join(',') } }],
    isSplittable: (e) => e.code === 'timeout' || e.code === 'truncated',
    isFatal: (e) => ['key', 'quota'].includes(e.code),
    ai: { json: async ({ parts }) => {
      const prompt = parts[parts.length - 1].text, pages = parts[0].inlineData.data;
      calls.push({ prompt: prompt.slice(0, 40), pages });
      const hit = Object.entries(behaviour).find(([k]) => prompt.includes(k));
      if (hit) { const r = hit[1](prompt, pages); if (r instanceof Error) throw r; if (r) return r; }
      const meta = { don_vi: 'VND', ngay_ket_thuc: '2025-12-31', so_thang: 12, ten_cong_ty: 'CTCP ABC' };
      if (prompt.includes('TÌNH HÌNH TÀI CHÍNH')) return { meta, items: BS_ITEMS };
      if (prompt.includes('KẾT QUẢ HOẠT ĐỘNG')) return { meta, items: [{ c: '10', n: 'Doanh thu thuần', v: '100', p: '90' }, { c: '21', n: 'Doanh thu hoạt động tài chính', v: '5', p: '4' }] };
      if (prompt.includes('LƯU CHUYỂN')) return { meta: { ...meta, phuong_phap: 'gian_tiep' }, items: [{ c: '20', n: 'LCT HĐKD', v: '7', p: '6' }] };
      if (prompt.includes('VAY VÀ NỢ')) return { meta: { don_vi: 'VND' }, vay_ngan_han: { vay_trong_ky: '100', tra_trong_ky: '(80)' } };
      if (prompt.includes('BỘ PHẬN')) return { meta: { don_vi: 'VND' }, segments: [{ ten: 'A', doanh_thu: '100', loi_nhuan_gop: '20' }] };
      throw new Error('prompt lạ: ' + prompt.slice(0, 60));
    } },
  };
  return io;
}

test('bình thường: 3 bảng + thuyết minh đã chọn; KQKD theo mẫu TT200 của CĐKT; trang thuyết minh kèm trang sau', async () => {
  const io = makeIO();
  const steps = [];
  const r = await extractJob(job, io, { noteGroups: ['debt', 'segments', 'fixedAssets'], onStep: (s) => steps.push(s) });
  assert.equal(r.company, 'CTCP ABC');
  assert.deepEqual(r.meta, { ngay_ket_thuc: '2025-12-31', so_thang: 12 });
  assert.deepEqual(r.statements.BS.cur, { 'BS:111': 10, 'BS:280': 10, 'BS:420': 3 });   // TT200 → TT99
  assert.deepEqual(r.statements.IS.cur, { 'IS:10': 100, 'IS:22': 5 });                 // 21 (TT200) → 22
  assert.deepEqual(r.notes.debt, { stProceeds: 100, stRepay: 80, ltProceeds: 0, ltRepay: 0 });
  assert.deepEqual(r.notes.segments, [{ name: 'A', revenue: 100, gross: 20 }]);
  assert.ok(r.warnings.some((w) => /Tài sản cố định/.test(w)), 'nhóm được chọn mà không có trang → cảnh báo');
  assert.equal(io.calls.find((c) => c.prompt.startsWith('Đọc thuyết minh VAY')).pages, 'p7,8');
  assert.equal(io.calls.find((c) => c.prompt.includes('TÌNH HÌNH')).pages, 'p2,3');
  assert.deepEqual(r.pages, { BS: [2, 3], IS: [4], CF: [5] });
  assert.ok(Object.values(r.units).every((u) => u === 1), 'đơn vị in trên từng bảng, để bộ kiểm tra tính sai số làm tròn');
  assert.ok(steps.some((s) => s.key === 'BS' && s.state === 'done'));
});

test('CĐKT quá 60 giây → tự chia TÀI SẢN / NGUỒN VỐN rồi ghép lại', async () => {
  const io = makeIO({ 'TÌNH HÌNH TÀI CHÍNH': (p) => {
    if (p.includes('CHỈ lấy phần TÀI SẢN')) return { meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31' }, items: [BS_ITEMS[0], BS_ITEMS[1]] };
    if (p.includes('CHỈ lấy phần NGUỒN VỐN')) return { meta: { don_vi: 'VND' }, items: [BS_ITEMS[2]] };
    return new E('timeout');
  } });
  const steps = [];
  const r = await extractJob(job, io, { onStep: (s) => steps.push(s) });
  assert.deepEqual(r.statements.BS.cur, { 'BS:111': 10, 'BS:280': 10, 'BS:420': 3 });
  assert.ok(steps.some((s) => s.key === 'BS' && s.state === 'split'));
});

test('một bảng lỗi (không chia được nữa) → cảnh báo, các bảng khác vẫn có', async () => {
  const io = makeIO({ 'KẾT QUẢ HOẠT ĐỘNG': () => new E('timeout') });
  const r = await extractJob(job, io, {});
  assert.equal(r.statements.IS, undefined);
  assert.ok(r.statements.BS && r.statements.CF);
  assert.ok(r.warnings.some((w) => /Kết quả kinh doanh: timeout/.test(w)));
});

test('hết lượt / sai mã → dừng cả file, không nuốt lỗi', async () => {
  const io = makeIO({ 'LƯU CHUYỂN': () => new E('quota') });
  await assert.rejects(extractJob(job, io, {}), (e) => e.code === 'quota');
});

test('không có trang của một bảng → cảnh báo cách sửa', async () => {
  const r = await extractJob({ ...job, types: ['BS', 'IS'] }, makeIO(), {});
  assert.ok(r.warnings.some((w) => /Không tìm thấy trang Lưu chuyển tiền tệ/.test(w)));
});

import { mapPagesWithAI } from '../js/core/pipeline.js';
test('bản scan: AI phân loại theo từng nhóm trang; số trang AI trả sai bị bỏ qua', async () => {
  const seen = [];
  const io = {
    images: async (pages) => pages.map((p) => ({ inlineData: { mimeType: 'image/jpeg', data: 'img' + p } })),
    ai: { json: async ({ parts }) => {
      const pages = parts.filter((p) => p.inlineData).map((p) => +p.inlineData.data.slice(3));
      seen.push(pages);
      return pages.map((p) => ({ trang: p, loai: p <= 2 ? 'BS' : p === 3 ? 'IS' : 'NOTES', nhom: p === 5 ? ['debt'] : [] }))
        .concat([{ trang: 99, loai: 'BS' }]);
    } },
  };
  const r = await mapPagesWithAI(5, io, { batch: 3 });
  assert.deepEqual(seen, [[1, 2, 3], [4, 5]]);
  assert.deepEqual(r.types, ['BS', 'BS', 'IS', 'NOTES', 'NOTES']);
  assert.deepEqual(r.notes.debt, [5]);
});
