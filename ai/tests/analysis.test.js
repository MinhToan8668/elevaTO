// Đánh giá & đề xuất: xếp hạng chỉ số theo ngưỡng, bắt dấu hiệu bất thường, chấm sức khoẻ, gợi ý việc
// cần làm. MÁY tính và máy xếp hạng — AI không tham gia, nên mọi kết luận ở đây kiểm được bằng số.
//
// Mô-đun chỉ phát ra KHOÁ + CON SỐ: nhờ vậy cùng một kết luận đọc được cả tiếng Việt và tiếng Anh, và
// không ai sửa được nhận định bằng cách sửa lời. Bài này canh cả hai chuyện đó.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, assess, LEVELS, SEVERITIES, THRESHOLDS } from '../js/core/analysis.js';
import { RATIO_ROWS } from '../js/core/metrics.js';
import { VI } from '../js/i18n.vi.js';
import { EN } from '../js/i18n.en.js';

const M = 1e6;
const KY = (id, year, months = 12, endMonth = months) => ({ id, year, months, endMonth });
/** Một kỳ số liệu đầy đủ, viết theo đơn vị TRIỆU đồng cho dễ đọc rồi quy về đồng. */
const nam = (o) => ({
  'BS:100': o.tsNH * M, 'BS:110': o.tien * M, 'BS:120': 0, 'BS:130': o.pt * M, 'BS:131': o.ptKH * M,
  'BS:140': o.htk * M, 'BS:200': o.tsDH * M, 'BS:220': o.tscd * M, 'BS:280': o.ts * M,
  'BS:300': o.no * M, 'BS:310': o.noNH * M, 'BS:311': o.ptra * M, 'BS:321': o.vayNH * M,
  'BS:330': o.noDH * M, 'BS:339': o.vayDH * M, 'BS:400': o.vc * M,
  'IS:10': o.dt * M, 'IS:11': o.gv * M, 'IS:20': o.gop * M, 'IS:24': o.lv * M, 'IS:25': o.cpb * M,
  'IS:26': o.cpq * M, 'IS:30': o.lnhd * M, 'IS:50': o.lntt * M, 'IS:60': o.lnst * M,
  'CF:02': o.kh * M, 'CF:20': o.cfo * M, 'CF:21': -o.capex * M,
});
const TOT24 = { tsNH: 600, tien: 150, pt: 150, ptKH: 120, htk: 200, tsDH: 400, tscd: 350, ts: 1000,
  no: 400, noNH: 300, ptra: 150, vayNH: 100, noDH: 100, vayDH: 100, vc: 600,
  dt: 1500, gv: 1050, gop: 450, lv: 15, cpb: 120, cpq: 130, lnhd: 185, lntt: 190, lnst: 150,
  kh: 60, cfo: 200, capex: 80 };
const TOT25 = { ...TOT24, ts: 1100, vc: 700, tien: 170, pt: 160, ptKH: 130, htk: 210, tsNH: 650, noNH: 320, ptra: 160,
  dt: 1700, gv: 1190, gop: 510, cpb: 130, cpq: 140, lnhd: 225, lntt: 230, lnst: 180, cfo: 230 };
const mo = (a, b) => ({ periods: [KY('FY2024', 2024), KY('FY2025', 2025)],
  values: { FY2024: nam(a), FY2025: nam(b) } });
const LANH = mo(TOT24, TOT25);
const cuaId = (r) => r.flags.map((f) => f.id);

// ─── Câu chữ: khoá nào mô-đun phát ra cũng phải dịch được, và dịch đủ chỗ điền ───

const bien = (s) => [...new Set([...String(s).matchAll(/\{(\w+)(?:\|[^|{}]*\|[^{}]*)?\}/g)].map((m) => m[1]))].sort();
/** Đọc thẳng mã nguồn để biết mỗi dấu hiệu / đề xuất phát ra những con số nào. */
function thamSo(goi) {
  const src = readFileSync(new URL('../js/core/analysis.js', import.meta.url), 'utf8');
  const out = {};
  for (const m of src.matchAll(new RegExp(`${goi}\\('(\\w+)',(?: '\\w+',)?\\s*\\{([^}]*)\\}`, 'g'))) {
    const ten = [...m[2].matchAll(/(\w+):/g)].map((x) => x[1]).sort();
    out[m[1]] = [...new Set([...(out[m[1]] || []), ...ten])].sort();
  }
  return out;
}

test('mọi dấu hiệu & đề xuất đều có tên + cách xử lý ở hai ngôn ngữ, và chỉ điền những số nó phát ra', () => {
  for (const [goi, tien] of [['bat', 'flag'], ['them', 'adv']]) {
    const bang = thamSo(goi);
    assert.ok(Object.keys(bang).length >= 12, `đọc được quá ít ${goi}(): ${Object.keys(bang).length}`);
    for (const [id, params] of Object.entries(bang)) {
      const phu = tien === 'flag' ? [`flag.${id}`, `flag.${id}.why`] : [`adv.${id}`, `adv.${id}.how`];
      for (const k of phu) {
        assert.ok(VI[k], `thiếu ${k} (tiếng Việt)`);
        assert.ok(EN[k], `thiếu ${k} (tiếng Anh)`);
        for (const b of bien(VI[k])) assert.ok(params.includes(b), `${k}: điền {${b}} mà mã không phát ra số ấy (có: ${params.join(', ')})`);
      }
    }
    // Không để khoá mồ côi trong từ điển: dịch mà không ai in ra là dịch thừa.
    const co = Object.keys(VI).filter((k) => k.startsWith(`${tien}.`) && !/\.(why|how)$/.test(k)).map((k) => k.slice(tien.length + 1));
    assert.deepEqual(co.filter((id) => !bang[id]), [], `khoá ${tien}.* không có chỗ nào phát ra`);
  }
});

test('nhãn mức xếp hạng, mức độ nặng, nhóm sức khoẻ đều dịch được', () => {
  for (const k of Object.keys(LEVELS)) assert.ok(VI[`level.${k}`] && EN[`level.${k}`], `thiếu level.${k}`);
  for (const s of SEVERITIES) assert.ok(VI[`sev.${s}`] && EN[`sev.${s}`], `thiếu sev.${s}`);
  for (const k of ['liq', 'prof', 'lev', 'asset']) assert.ok(VI[`sub.${k}`] && EN[`sub.${k}`], `thiếu sub.${k}`);
});

// ─── Xếp hạng theo ngưỡng ───────────────────────────────────

test('ngưỡng chỉ số: khai đúng chiều, đủ bốn mốc, và chỉ khai cho chỉ số có thật', () => {
  const keys = RATIO_ROWS.map((r) => r.key);
  assert.deepEqual(Object.keys(THRESHOLDS).filter((k) => !keys.includes(k)), [], 'ngưỡng cho chỉ số không tồn tại');
  for (const [k, th] of Object.entries(THRESHOLDS)) {
    assert.ok(['hi', 'lo'].includes(th.dir), k);
    const moc = ['tot', 'kha', 'tb', 'yeu'].map((m) => th[m]);
    assert.ok(moc.every(Number.isFinite), `${k}: thiếu mốc`);
    // Mốc phải xếp theo đúng chiều, không thì xếp hạng đảo lộn mà không ai thấy.
    const xep = th.dir === 'hi' ? [...moc].sort((a, b) => b - a) : [...moc].sort((a, b) => a - b);
    assert.deepEqual(moc, xep, `${k}: bốn mốc không xếp theo chiều ${th.dir}`);
    assert.equal(th.dir, RATIO_ROWS.find((r) => r.key === k).good === 'hi' ? 'hi' : 'lo', `${k}: chiều ngược với metrics.js`);
  }
});

test('assess(): đúng mốc là đạt mức đó; qua cả mốc yếu nhất là "rất yếu"; không có số thì không xếp', () => {
  assert.equal(assess('current', 2), 'tot');
  assert.equal(assess('current', 1.5), 'tot', 'đúng bằng mốc thì tính là đạt');
  assert.equal(assess('current', 1.3), 'kha');
  assert.equal(assess('current', 1.0), 'tb');
  assert.equal(assess('current', 0.9), 'yeu');
  assert.equal(assess('current', 0.5), 'rat_yeu');
  // Chỉ số càng thấp càng tốt thì so ngược lại.
  assert.equal(assess('de', 0.5), 'tot');
  assert.equal(assess('de', 4), 'tb');
  assert.equal(assess('de', 20), 'rat_yeu');
  assert.equal(assess('current', null), null);
  assert.equal(assess('current', NaN), null);
  assert.equal(assess('khong_co_nguong', 1), null);
});

// ─── Sức khoẻ & dấu hiệu ───────────────────────────────────

test('doanh nghiệp lành: không dấu hiệu nào, sức khoẻ tốt, đề xuất chỉ còn mục "đang ổn"', () => {
  const r = analyze(LANH);
  assert.deepEqual(r.flags, []);
  assert.equal(r.health, 'tot');
  assert.deepEqual(r.advice.map((a) => a.id), ['ok']);
  assert.deepEqual(r.subs.map((s) => s.key), ['liq', 'prof', 'lev', 'asset']);
  assert.ok(r.subs.every((s) => s.level in LEVELS));
  assert.equal(r.last, 1);
  assert.equal(r.prev, 0, 'kỳ so sánh là cùng kỳ năm trước');
  assert.equal(r.levels.current, 'tot');
});

test('vốn chủ sở hữu âm → rất yếu ngay, không cần đếm dấu hiệu khác', () => {
  const r = analyze(mo(TOT24, { ...TOT25, vc: -50, no: 1150 }));
  assert.equal(r.health, 'rat_yeu');
  const f = r.flags.find((x) => x.id === 'equityNegative');
  assert.equal(f.severity, 'cao');
  assert.equal(f.params.v.n, -50 * M);
  assert.equal(f.params.v.k, '', 'số tiền → giao diện in kèm đơn vị');
});

test('lỗ mà dòng tiền kinh doanh cũng âm → rất yếu; chỉ lỗ thôi thì chưa', () => {
  assert.equal(analyze(mo(TOT24, { ...TOT25, lnst: -100, lntt: -120, lnhd: -125, cfo: -50 })).health, 'rat_yeu');
  const chiLo = analyze(mo(TOT24, { ...TOT25, lnst: -100, lntt: -120, lnhd: -125 }));
  assert.ok(cuaId(chiLo).includes('lossNet'));
  assert.ok(['yeu', 'tb'].includes(chiLo.health), `lỗ nhưng dòng tiền vẫn dương: ${chiLo.health}`);
});

test('thanh toán ngắn hạn hụt: vốn lưu động ròng âm và hệ số dưới 0,8 đều là mức cao', () => {
  const r = analyze(mo(TOT24, { ...TOT25, tsNH: 200, noNH: 400, tien: 50, htk: 80, pt: 60, ptKH: 50 }));
  const ids = cuaId(r);
  assert.ok(ids.includes('wcNegative'));
  assert.ok(ids.includes('currentLow'));
  assert.equal(r.flags.find((f) => f.id === 'currentLow').params.v.k, 'x', 'hệ số → in dạng "lần"');
  assert.ok(r.advice.map((a) => a.id).includes('liquidity'), 'bắt được thì phải có việc để làm');
});

test('đòn bẩy: nợ trên vốn chủ trên 5 lần là mức cao, trên 3 lần là mức trung bình — không báo trùng', () => {
  const cao = cuaId(analyze(mo(TOT24, { ...TOT25, vc: 100, no: 1000, noNH: 600, noDH: 400, vayNH: 500, vayDH: 300 })));
  assert.ok(cao.includes('deHigh'));
  assert.ok(!cao.includes('deMid'));
  const tb = cuaId(analyze(mo(TOT24, { ...TOT25, vc: 250, no: 850, noNH: 500, noDH: 350, vayNH: 400, vayDH: 200 })));
  assert.ok(tb.includes('deMid'));
  assert.ok(!tb.includes('deHigh'));
});

test('dòng tiền kinh doanh âm: hai kỳ liền báo một kiểu, ba kỳ liền báo kiểu nặng hơn kèm số kỳ', () => {
  const am = (o) => ({ ...o, cfo: -40 });
  const hai = analyze(mo(am(TOT24), am(TOT25)));
  assert.ok(cuaId(hai).includes('cfoNegative2'));
  const ba = analyze({ periods: [KY('FY2023', 2023), KY('FY2024', 2024), KY('FY2025', 2025)],
    values: { FY2023: nam(am(TOT24)), FY2024: nam(am(TOT24)), FY2025: nam(am(TOT25)) } });
  const f = ba.flags.find((x) => x.id === 'cfoNegativeStreak');
  assert.equal(f.severity, 'cao');
  assert.equal(f.params.n.n, 3);
  assert.equal(f.params.n.k, 'n', 'số đếm → in trơn, không kèm đơn vị tiền');
  assert.ok(!cuaId(ba).includes('cfoNegative2'), 'ba kỳ thì không báo lại kiểu hai kỳ');
  assert.ok(ba.advice.map((a) => a.id).includes('cashflow'));
});

test('biên gộp tụt trên 5 điểm % so với cùng kỳ năm trước → báo kèm cả hai mức', () => {
  const r = analyze(mo(TOT24, { ...TOT25, gv: 1500, gop: 200 }));
  const f = r.flags.find((x) => x.id === 'grossDrop');
  assert.ok(f, `không bắt được: ${cuaId(r).join(', ')}`);
  assert.equal(f.params.d.k, 'pp', 'chênh lệch giữa hai tỷ lệ → điểm phần trăm');
  assert.equal(f.params.v.k, '%');
  assert.ok(f.params.d.n > 5);
  assert.ok(r.advice.map((a) => a.id).includes('margin'));
});

test('xu hướng nhiều kỳ chỉ bật khi có từ 3 kỳ CÙNG LOẠI — so quý với năm là vô nghĩa', () => {
  const dt = (o, x) => ({ ...o, dt: x, gv: Math.round(x * 0.7), gop: x - Math.round(x * 0.7) });
  const giam = { periods: [KY('FY2023', 2023), KY('FY2024', 2024), KY('FY2025', 2025)],
    values: { FY2023: nam(dt(TOT24, 1800)), FY2024: nam(dt(TOT24, 1600)), FY2025: nam(dt(TOT25, 1400)) } };
  const r = analyze(giam);
  assert.ok(cuaId(r).includes('revDownStreak'), `không bắt được: ${cuaId(r).join(', ')}`);
  assert.equal(r.flags.find((f) => f.id === 'revDownStreak').params.n.n, 3);
  assert.ok(r.advice.map((a) => a.id).includes('growth'));
  // Hai kỳ năm + một kỳ bán niên: chỉ còn hai kỳ cùng loại → không kết luận xu hướng.
  const lan = { periods: [KY('FY2024', 2024), KY('FY2025', 2025), KY('6T-2026', 2026, 6, 6)],
    values: { FY2024: nam(dt(TOT24, 1800)), FY2025: nam(dt(TOT25, 1600)), '6T-2026': nam(dt(TOT25, 700)) } };
  assert.ok(!cuaId(analyze(lan)).includes('revDownStreak'));
});

test('không có kỳ cùng loại năm trước thì không so, nhưng vẫn soát được các dấu hiệu của chính kỳ đó', () => {
  const r = analyze({ periods: [KY('FY2025', 2025)], values: { FY2025: nam({ ...TOT25, vc: -10, no: 1110 }) } });
  assert.equal(r.prev, -1);
  assert.ok(cuaId(r).includes('equityNegative'));
  assert.deepEqual(r.flags.filter((f) => ['grossDrop', 'revDrop', 'invSurge'].includes(f.id)), [], 'không có kỳ so thì không bịa ra so sánh');
});

test('mọi dấu hiệu & đề xuất phát ra đều đúng dạng: id, mức độ, và con số có kiểu rõ ràng', () => {
  const KIEU = ['', '%', 'pp', 'x', 'd', 'n'];
  for (const ds of [LANH, mo(TOT24, { ...TOT25, vc: -50, no: 1150, lnst: -100, lntt: -120, lnhd: -125, cfo: -80, tsNH: 200, noNH: 400 })]) {
    const r = analyze(ds);
    for (const f of r.flags) {
      assert.ok(SEVERITIES.includes(f.severity), `${f.id}: mức độ lạ ${f.severity}`);
      for (const [ten, x] of Object.entries(f.params)) {
        assert.ok(x && typeof x === 'object' && KIEU.includes(x.k), `${f.id}.${ten}: thiếu kiểu số`);
      }
    }
    for (const a of r.advice) for (const [ten, x] of Object.entries(a.params)) {
      assert.ok(x && typeof x === 'object' && KIEU.includes(x.k), `${a.id}.${ten}: thiếu kiểu số`);
    }
    assert.equal(new Set(r.flags.map((f) => f.id)).size, r.flags.length, 'cùng một dấu hiệu báo hai lần');
    assert.equal(new Set(r.advice.map((a) => a.id)).size, r.advice.length, 'cùng một đề xuất hai lần');
  }
});

test('chưa có kỳ nào thì không có gì để phân tích', () => {
  assert.equal(analyze({ periods: [], values: {} }), null);
  assert.equal(analyze({}), null);
});
