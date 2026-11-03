import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJob } from '../js/core/pipeline.js';

class E extends Error { constructor(code) { super(code); this.code = code; } }
const job = {
  name: 'BCTC 2025.pdf',
  types: ['OTHER', 'BS', 'BS', 'IS', 'CF', 'NOTES', 'NOTES', 'NOTES'],
  notes: { debt: [7], fixedAssets: [], segments: [6] },
};
const BS_ITEMS = [{ c: '111', n: 'Tiền', v: '10', p: '8' }, { c: '270', n: 'Tổng cộng tài sản', v: '10', p: '8' }, { c: '421', n: 'LNST chưa PP', v: '3', p: '2' }, { c: '440', n: 'Tổng cộng nguồn vốn', v: '10', p: '8' }];

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
      if (prompt.includes('KẾT QUẢ HOẠT ĐỘNG')) return { meta, items: [{ c: '10', n: 'Doanh thu thuần', v: '100', p: '90' }, { c: '21', n: 'Doanh thu hoạt động tài chính', v: '5', p: '4' }, { c: '60', n: 'LNST', v: '20', p: '18' }] };
      if (prompt.includes('LƯU CHUYỂN')) return { meta: { ...meta, phuong_phap: 'gian_tiep' }, items: [{ c: '20', n: 'LCT HĐKD', v: '7', p: '6' }, { c: '70', n: 'Tiền cuối kỳ', v: '10', p: '8' }] };
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
  assert.deepEqual(r.statements.BS.cur, { 'BS:111': 10, 'BS:280': 10, 'BS:420': 3, 'BS:440': 10 });   // TT200 → TT99
  assert.deepEqual(r.statements.IS.cur, { 'IS:01': 100, 'IS:10': 100, 'IS:22': 5, 'IS:60': 20 });   // 21 (TT200) → 22; 01 suy từ 10 vì báo cáo không in dòng 01
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
  assert.ok(r.warnings.some((w) => /Không có trang nào được nhận là Lưu chuyển tiền tệ/.test(w)), 'gửi cả các trang bảng đã tick cho LCTT');
  const r0 = await extractJob({ ...job, types: ['NOTES', 'NOTES'], notes: {} }, makeIO(), {});
  assert.ok(r0.warnings.some((w) => /Không tìm thấy trang Lưu chuyển tiền tệ/.test(w)), 'không có trang bảng nào → cảnh báo cách sửa');
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

test('AI trả nhóm thuyết minh lạ ("constructor", "__proto__") khi nhận diện trang → bỏ qua, không lỗi', async () => {
  const { mapPagesWithAI } = await import('../js/core/pipeline.js');
  const io = { images: async (p) => p.map(() => ({ inlineData: {} })), ai: { json: async () => [{ trang: 1, loai: 'NOTES', nhom: ['constructor', '__proto__', 'debt'] }] } };
  const r = await mapPagesWithAI(1, io);
  assert.deepEqual(r.notes.debt, [1]);
});

test('trang đã tick: trang máy đã biết loại giữ nguyên, trang chưa rõ mới nhờ AI nhận (ghi rõ số trang); không tick thì bỏ', async () => {
  const { planPicked } = await import('../js/core/pipeline.js');
  const seen = [];
  const io = {
    images: async (pages) => { seen.push(pages); return pages.map(() => ({ inlineData: { mimeType: 'image/jpeg', data: 'x' } })); },
    ai: { json: async ({ parts }) => {
      const prompt = parts[parts.length - 1].text;
      assert.match(prompt, /3, 9, 10/);
      return [{ trang: 3, loai: 'BS' }, { trang: 9, loai: 'NOTES', nhom: ['debt', 'constructor'] }, { trang: 10, loai: 'OTHER' }, { trang: 99, loai: 'IS' }];
    } },
  };
  const job = { numPages: 12, types: ['OTHER', 'UNKNOWN', 'UNKNOWN', 'IS', 'CF', 'OTHER', 'OTHER', 'OTHER', 'UNKNOWN', 'UNKNOWN', 'OTHER', 'OTHER'], notes: { segments: [4], debt: [] } };
  const r = await planPicked(job, [3, 4, 5, 9, 10], io);
  assert.deepEqual(seen, [[3, 9, 10]]);
  assert.deepEqual(r.types.map((t, i) => (t === 'OTHER' ? null : `${i + 1}:${t}`)).filter(Boolean), ['3:BS', '4:IS', '5:CF', '9:NOTES']);
  assert.deepEqual(r.notes.debt, [9]);
  assert.deepEqual(r.notes.segments, [], 'trang 4 là KQKD, không phải thuyết minh được tick');
  assert.equal(r.aiCalls, 1);
});

test('PDF có chữ, tick toàn trang đã biết loại → không tốn lượt AI nhận trang; chế độ exact không gửi kèm trang sau', async () => {
  const { planPicked } = await import('../js/core/pipeline.js');
  const io0 = { images: async () => { throw new Error('không được gọi'); }, ai: { json: async () => { throw new Error('không được gọi'); } } };
  const r = await planPicked({ ...job, numPages: 8 }, [2, 3, 4, 5, 7], io0);
  assert.equal(r.aiCalls, 0);
  assert.deepEqual(r.notes.debt, [7]);
  const io = makeIO();
  await extractJob({ name: 'x.pdf', ...r }, io, { noteGroups: ['debt'], exact: true });
  assert.equal(io.calls.find((c) => c.prompt.startsWith('Đọc thuyết minh VAY')).pages, 'p7');
});

test('trang thuyết minh đã tick mà máy không rõ nhóm → nhờ AI xếp nhóm; trang tick nhưng AI không dùng được → cảnh báo, không bỏ im lặng', async () => {
  const { planPicked } = await import('../js/core/pipeline.js');
  const seen = [];
  const io = {
    images: async (pages) => { seen.push(pages); return pages.map(() => ({ inlineData: {} })); },
    ai: { json: async () => [{ trang: 8, loai: 'NOTES', nhom: ['fixedAssets'] }, { trang: 1, loai: 'OTHER' }] },
  };
  const j = { ...job, numPages: 9, types: [...job.types, 'NOTES'] };
  const r = await planPicked(j, [1, 2, 7, 8, 9], io);
  assert.deepEqual(seen, [[1, 8, 9]], 'trang 7 đã có nhóm (vay) → không cần AI');
  assert.deepEqual(r.notes.fixedAssets, [8]);
  assert.deepEqual(r.notes.debt, [7]);
  const w = r.warnings.join('\n');
  assert.match(w, /Trang 1, 9: AI xem ảnh nhỏ không nhận ra/, 'trang 1 AI bảo không phải bảng; trang 9 AI không trả lời');
  assert.deepEqual(r.shared, [1, 9], 'trang đã tick vẫn được gửi kèm cho cả ba bảng, không bỏ');
  assert.doesNotMatch(w, /\b(2|7|8)\b/);
});

test('chế độ exact: nhóm thuyết minh tick quá 8 trang → cảnh báo trang bị bỏ', async () => {
  const io = makeIO();
  const many = { ...job, types: Array(20).fill('NOTES'), notes: { debt: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } };
  const r = await extractJob(many, io, { noteGroups: ['debt'], exact: true });
  assert.match(r.warnings.join('\n'), /chỉ đọc 8 trang đầu, bỏ trang 11–12/);
});

test('form phổ thông (không lấy thuyết minh), ≤ 12 trang chưa rõ loại → không tốn lượt nhận trang: gửi thẳng các trang đó vào 3 lượt đọc bảng', async () => {
  const { planPicked } = await import('../js/core/pipeline.js');
  const io0 = { images: async () => { throw new Error('không được gọi'); }, ai: { json: async () => { throw new Error('không được gọi'); } } };
  const scan = { name: 's.pdf', numPages: 30, types: Array(30).fill('UNKNOWN'), notes: {} };
  const plan = await planPicked(scan, [7, 8, 9, 10, 11], io0, { notes: false });
  assert.equal(plan.aiCalls, 0);
  assert.deepEqual(plan.shared, [7, 8, 9, 10, 11]);
  const io = makeIO();
  const r = await extractJob({ name: 's.pdf', types: plan.types, notes: plan.notes, shared: plan.shared }, io, { noteGroups: [] });
  const bs = io.calls.filter((c) => /TÌNH HÌNH|KẾT QUẢ|LƯU CHUYỂN/.test(c.prompt));
  assert.equal(bs.length, 3);
  assert.ok(bs.every((c) => c.pages === 'p7,8,9,10,11'), JSON.stringify(bs));
  assert.ok(r.statements.BS && r.statements.IS && r.statements.CF);
  // PDF có chữ: trang máy đã nhận ra giữ cho đúng bảng, trang chưa rõ gửi kèm
  const mixed = await planPicked({ ...job, numPages: 8, types: ['UNKNOWN', 'BS', 'BS', 'IS', 'CF', 'NOTES', 'NOTES', 'NOTES'] }, [1, 2, 3, 4], io0, { notes: false });
  assert.deepEqual(mixed.shared, [1]);
  const io2 = makeIO();
  await extractJob({ name: 'x.pdf', ...mixed }, io2, { noteGroups: [] });
  assert.equal(io2.calls.find((c) => c.prompt.includes('TÌNH HÌNH')).pages, 'p1,2,3');
  assert.equal(io2.calls.find((c) => c.prompt.includes('LƯU CHUYỂN')).pages, 'p1');
});

test('trang gửi kèm không có bảng nào → cảnh báo, không lỗi', async () => {
  const io = makeIO({ 'LƯU CHUYỂN': () => ({ meta: { don_vi: 'VND' }, items: [] }) });
  const r = await extractJob({ name: 's.pdf', types: ['UNKNOWN', 'UNKNOWN'], notes: {}, shared: [1, 2] }, io, { noteGroups: [] });
  assert.equal(r.statements.CF, undefined);
  assert.match(r.warnings.join('\n'), /Lưu chuyển tiền tệ.*không thấy/i);
});

test('gợi ý trang theo form: phổ thông chỉ 3 bảng chính, tối đa 10 trang', async () => {
  const { suggestPicks } = await import('../js/core/pipeline.js');
  const text = { kind: 'pdf', scanned: false, types: ['OTHER', 'BS', 'BS', 'IS', 'CF', 'NOTES', 'NOTES', 'NOTES'], notes: { debt: [7], segments: [6] } };
  assert.deepEqual(suggestPicks(text, { notes: false, max: 10 }), [2, 3, 4, 5]);
  assert.deepEqual(suggestPicks({ kind: 'img', scanned: true, types: Array(14).fill('UNKNOWN'), notes: {} }, { notes: false, max: 10 }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(suggestPicks(text), [2, 3, 4, 5, 6, 7], 'form elevaTO: kèm thuyết minh');
});

test('đọc ra rỗng → thử lại đúng 1 lần: gửi bằng ảnh VÀ bỏ khuôn JSON (đổi cả hai thứ nghi ngờ)', async () => {
  const lan = [];
  const io = makeIO();
  const goc = io.parts;
  io.parts = async (pages, o) => { lan.push({ anh: !!o?.anh }); return goc(pages); };
  let lanBS = 0;
  const truoc = io.ai.json;
  io.ai.json = async (req) => {
    const p = req.parts.at(-1).text;
    if (/TÌNH HÌNH/.test(p)) {
      lan[lan.length - 1].khuon = !!req.schema;
      if (++lanBS === 1) return { meta: {}, items: [] };
    }
    return truoc(req);
  };
  const r = await extractJob({ name: 'x.pdf', ...job }, io, { noteGroups: [] });
  assert.ok(r.statements.BS, 'lần thử lại đọc được');
  const bs = lan.filter((x) => x.khuon !== undefined);
  assert.equal(bs.length, 2, 'chỉ thử lại 1 lần');
  assert.deepEqual(bs[0], { anh: false, khuon: true }, 'lần đầu: gửi PDF, có khuôn');
  assert.deepEqual(bs[1], { anh: true, khuon: false }, 'lần sau: gửi ảnh, bỏ khuôn');
  assert.match(r.warnings.join('\n'), /gửi lại bằng ảnh/i);
});

test('file scan (vốn đã gửi ảnh) → lần thử lại chỉ bỏ khuôn JSON, không gửi trùng ảnh lần nữa', async () => {
  const io = makeIO();
  let khuon = [];
  const truoc = io.ai.json;
  io.ai.json = async (req) => {
    if (/TÌNH HÌNH/.test(req.parts.at(-1).text)) { khuon.push(!!req.schema); if (khuon.length === 1) return { meta: {}, items: [] }; }
    return truoc(req);
  };
  const r = await extractJob({ name: 's.pdf', scanned: true, ...job }, io, { noteGroups: [] });
  assert.deepEqual(khuon, [true, false], 'gọi 2 lần: có khuôn rồi bỏ khuôn');
  assert.ok(r.statements.BS);
});

test('nhiều nhóm thuyết minh: chạy 2 nhóm song song cho nhanh, không bắn hết cùng lúc', async () => {
  let dangChay = 0, dinh = 0;
  const io = makeIO();
  const truoc = io.ai.json;
  io.ai.json = async (req) => {
    if (/^Đọc thuyết minh/m.test(req.parts.at(-1).text)) {        // chỉ đếm lượt đọc thuyết minh
      dangChay++; dinh = Math.max(dinh, dangChay);
      await new Promise((r) => setTimeout(r, 5));
      dangChay--;
    }
    return truoc(req);
  };
  const j = { ...job, notes: { debt: [7], segments: [6], fixedAssets: [8] } };
  await extractJob({ name: 'x.pdf', ...j }, io, { noteGroups: ['debt', 'segments', 'fixedAssets'] });
  assert.ok(dinh >= 2 && dinh <= 2, `chạy nhiều nhất ${dinh} nhóm cùng lúc`);
});

test('Gemini từ chối khuôn JSON → thử lại ngay bằng câu lệnh có tả cấu trúc, không báo "không thấy bảng"', async () => {
  const io = makeIO();
  let lan = 0;
  const truoc = io.ai.json;
  io.ai.json = async (req) => {
    if (/TÌNH HÌNH/.test(req.parts.at(-1).text) && ++lan === 1) { const e = new E('schema'); e.message = 'Gemini từ chối khuôn JSON'; throw e; }
    return truoc(req);
  };
  const r = await extractJob({ name: 'x.pdf', ...job }, io, { noteGroups: [] });
  assert.ok(r.statements.BS, 'lần thử lại đọc được');
  assert.doesNotMatch(r.warnings.join('\n'), /không thấy bảng/);
});

test('không bảng nào đọc được → tốn thêm 1 lượt hỏi AI xem các trang đó là gì, nói rõ cho người dùng tick lại', async () => {
  const goi = [];
  const io = makeIO({ 'TÌNH HÌNH': () => ({ meta: {}, items: [] }), 'KẾT QUẢ': () => ({ meta: {}, items: [] }), 'LƯU CHUYỂN': () => ({ meta: {}, items: [] }) });
  io.images = async (pages) => { goi.push(pages); return pages.map(() => ({ inlineData: {} })); };
  const truoc = io.ai.json;
  io.ai.json = async (req) => (/lần lượt là các trang số/.test(req.parts.at(-1).text)
    ? [{ trang: 7, loai: 'OTHER' }, { trang: 8, loai: 'NOTES', nhom: ['debt'] }, { trang: 9, loai: 'NOTES' }, { trang: 10, loai: 'BS' }]
    : truoc(req));
  const r = await extractJob({ name: 'scan.pdf', types: Array(12).fill('UNKNOWN'), notes: {}, shared: [7, 8, 9, 10, 11] }, io, { noteGroups: [] });
  assert.deepEqual(goi, [[7, 8, 9, 10, 11]], 'chỉ hỏi 1 lần cho cả file');
  const w = r.warnings.join('\n');
  assert.match(w, /trang 10.*Tình hình tài chính|Tình hình tài chính.*trang 10/i, w);
  assert.match(w, /thuyết minh.*8|8.*thuyết minh/i, w);
  assert.match(w, /tick lại|chọn lại/i, w);
  assert.equal(r.goiY, r.warnings.at(-1), 'lời chỉ dẫn trả riêng để giao diện hiện được khi không đọc nổi bảng nào');
});

test('đọc được ít nhất một bảng → không tốn thêm lượt hỏi trang', async () => {
  const io = makeIO({ 'LƯU CHUYỂN': () => ({ meta: {}, items: [] }) });
  io.images = async () => { throw new Error('không được gọi'); };
  const r = await extractJob({ name: 'x.pdf', ...job }, io, { noteGroups: [] });
  assert.ok(r.statements.BS);
  assert.match(r.warnings.join('\n'), /Lưu chuyển tiền tệ: không thấy/);
});

test('gợi ý trang để tick sẵn: PDF có chữ → các trang bảng + thuyết minh máy nhận ra; bản scan → không tick; ảnh chụp → tick hết', async () => {
  const { suggestPicks } = await import('../js/core/pipeline.js');
  assert.deepEqual(suggestPicks({ kind: 'pdf', scanned: false, types: ['OTHER', 'BS', 'BS', 'IS', 'CF', 'NOTES', 'NOTES', 'NOTES'], notes: { debt: [7], segments: [6] } }), [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(suggestPicks({ kind: 'pdf', scanned: true, types: ['UNKNOWN', 'UNKNOWN'], notes: {} }), []);
  assert.deepEqual(suggestPicks({ kind: 'img', scanned: true, types: ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'], notes: {} }), [1, 2, 3]);
});

test('trang in ngang: lượt nhận trang trả góc xoay, chỉ nhận 90/180/270', async () => {
  const { planPicked } = await import('../js/core/pipeline.js');
  const io = {
    images: async (pages) => pages.map(() => ({ inlineData: { mimeType: 'image/jpeg', data: 'x' } })),
    ai: { json: async () => [
      { trang: 3, loai: 'NOTES', nhom: ['segments'], xoay: '90' },
      { trang: 9, loai: 'NOTES', nhom: ['equity'], xoay: '270' },
      { trang: 10, loai: 'BS', xoay: '0' },
      { trang: 11, loai: 'IS', xoay: '45' },
    ] },
  };
  const job = { numPages: 12, types: Array(12).fill('UNKNOWN'), notes: {} };
  const r = await planPicked(job, [3, 9, 10, 11], io);
  assert.deepEqual(r.rot, { 3: 90, 9: 270 }, 'xoay 0 và góc lạ thì không ghi');
  const w = r.warnings.find((x) => /in ngang/.test(x));
  assert.ok(w, r.warnings.join(' | '));
  assert.match(w, /3, 9/);
});

test('bản scan: mapPagesWithAI trả luôn góc xoay từng trang', async () => {
  const { mapPagesWithAI } = await import('../js/core/pipeline.js');
  const io = {
    images: async (p) => p.map(() => ({ inlineData: {} })),
    ai: { json: async () => [{ trang: 1, loai: 'NOTES', nhom: ['segments'], xoay: '90' }, { trang: 2, loai: 'NOTES', xoay: '' }] },
  };
  const r = await mapPagesWithAI(2, io);
  assert.deepEqual(r.rot, { 1: 90 });
});

test('KQKD in liền sau CĐKT bị nhận nhầm là trang CĐKT → KQKD không có trang riêng nhưng vẫn đọc được trên cả cụm trang', async () => {
  const io = makeIO();
  const r = await extractJob({ name: 'vnm.pdf', types: ['OTHER', 'BS', 'BS', 'BS', 'CF'], notes: {} }, io, { noteGroups: [] });
  assert.ok(r.statements.IS, 'có KQKD');
  assert.equal(io.calls.find((c) => c.prompt.includes('KẾT QUẢ')).pages, 'p2,3,4,5', 'KQKD được gửi cả các trang bảng đã tick');
});

test('trang được nhận là KQKD nhưng AI không thấy dòng tổng nào → đọc lại một lần trên cả cụm trang', async () => {
  const io = makeIO({ 'KẾT QUẢ HOẠT ĐỘNG': (pr, pages) => (pages === 'p4' ? { meta: {}, items: [{ c: '', n: 'Chi phí theo yếu tố', v: '1', p: '1' }] } : null) });
  const r = await extractJob({ name: 'x.pdf', types: ['OTHER', 'BS', 'BS', 'IS', 'CF'], notes: {} }, io, { noteGroups: [] });
  const is = io.calls.filter((c) => c.prompt.includes('KẾT QUẢ')).map((c) => c.pages);
  assert.deepEqual(is, ['p4', 'p2,3,4,5']);
  assert.ok(r.statements.IS.cur['IS:10'] || Object.keys(r.statements.IS.cur).length, 'lấy kết quả lần đọc lại');
  assert.match(r.warnings.join('\n'), /đọc lại trên cả các trang bảng/);
});

test('góp ý của người dùng được gửi kèm câu lệnh đọc bảng liên quan', async () => {
  const io = makeIO();
  const seen = [];
  const goc = io.ai.json;
  io.ai.json = async (req) => { seen.push(req.parts.at(-1).text); return goc(req); };
  io.gopY = [{ text: 'LCTT in hai cột quý cùng năm', vung: 'CF' }];
  await extractJob({ name: 'x.pdf', ...job }, io, { noteGroups: [] });
  assert.ok(seen.some((p) => /LƯU CHUYỂN/.test(p) && /LCTT in hai cột quý cùng năm/.test(p)));
  assert.ok(!seen.some((p) => /KẾT QUẢ HOẠT ĐỘNG/.test(p) && /hai cột quý/.test(p)));
});

test('LCTT bị cắt cuối (khối hoạt động tài chính ở trang sau, thiếu dòng 70) → đọc lại kèm trang kế tiếp', async () => {
  const io = makeIO({ 'LƯU CHUYỂN': (pr, pages) => (pages === 'p5'
    ? { meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31', so_thang: 12 }, items: [{ c: '20', n: 'LCT HĐKD', v: '7', p: '6' }, { c: '30', n: 'LCT HĐĐT', v: '-2', p: '1' }] }
    : { meta: { don_vi: 'VND', ngay_ket_thuc: '2025-12-31', so_thang: 12 }, items: [{ c: '20', n: 'LCT HĐKD', v: '7', p: '6' }, { c: '30', n: 'LCT HĐĐT', v: '-2', p: '1' }, { c: '40', n: 'LCT HĐTC', v: '-4', p: '-3' }, { c: '70', n: 'Tiền cuối kỳ', v: '10', p: '8' }] }) });
  const r = await extractJob({ name: 'vnm.pdf', types: ['OTHER', 'BS', 'BS', 'IS', 'CF', 'OTHER'], notes: {} }, io, { noteGroups: [] });
  assert.deepEqual(io.calls.filter((c) => c.prompt.includes('LƯU CHUYỂN')).map((c) => c.pages), ['p5', 'p5,6']);
  assert.ok(r.statements.CF.cur['CF:40'] !== undefined, 'có khối hoạt động tài chính');
  assert.match(r.warnings.join('\n'), /đọc lại kèm trang 6/);
});

test('tự kiểm chứng: dòng tổng không khớp (AI đọc sai một dòng con) → đọc lại có trọng tâm, nói rõ dòng lệch; giữ lần ít lệch hơn', async () => {
  const meta = { don_vi: 'VND', ngay_ket_thuc: '2025-12-31', so_thang: 12 };
  const dung = [{ c: '31', n: 'Thu nhập khác', v: '116.653.846.969', p: '110.508.071.750' }, { c: '32', n: 'Chi phí khác', v: '26.649.261.729', p: '21.592.652.515' },
    { c: '40', n: 'Lợi nhuận khác', v: '90.004.585.240', p: '88.915.419.235' }, { c: '60', n: 'LNST', v: '1', p: '1' }];
  const sai = dung.map((x) => (x.c === '32' ? { ...x, v: '26.849.261.729' } : x));     // đọc nhầm 6 → 8
  const prompts = [];
  const io = makeIO({ 'KẾT QUẢ HOẠT ĐỘNG': (pr) => { prompts.push(pr); return { meta, items: /KIỂM TRA LẠI/.test(pr) ? dung : sai }; } });
  const r = await extractJob({ name: 'x.pdf', types: ['OTHER', 'BS', 'IS', 'CF'], notes: {} }, io, { noteGroups: [] });
  assert.equal(prompts.length, 2, 'đọc lại đúng một lần');
  assert.match(prompts[1], /Mã 40, cột kỳ này: in 90\.004\.585\.240 nhưng cộng các dòng con ra 89\.804\.585\.240/);
  assert.equal(r.statements.IS.cur['IS:32'], 26649261729);
  assert.match(r.warnings.join('\n'), /đã đọc lại có trọng tâm/);
});

test('thuyết minh thời gian khấu hao (chính sách kế toán) → khung năm theo nhóm TSCĐ, lưu ở notes.lives', async () => {
  const io = makeIO({ 'CHÍNH SÁCH KẾ TOÁN': () => ({ nhom_tai_san: [
    { ten: 'Nhà cửa, vật kiến trúc', nhom: 'buildings', tu_nam: '6', den_nam: '25' },
    { ten: 'Phương tiện vận tải', nhom: 'transport', tu_nam: '6', den_nam: '10' },
  ] }) });
  const r = await extractJob({ ...job, notes: { ...job.notes, lives: [6] } }, io, { noteGroups: ['lives'] });
  assert.deepEqual(r.notes.lives, { buildings: { min: 6, max: 25, names: ['Nhà cửa, vật kiến trúc'] }, transport: { min: 6, max: 10, names: ['Phương tiện vận tải'] } });
  assert.equal(io.calls.find((c) => c.prompt.includes('CHÍNH SÁCH')).pages, 'p6,7', 'kèm trang sau: chính sách kế toán hay dài sang trang');
});
