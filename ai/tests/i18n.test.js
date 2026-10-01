// Bộ chuyển ngôn ngữ: hai từ điển phải đủ khoá như nhau, không chuỗi rỗng, cùng bộ biến {…};
// tên chỉ tiêu BCTC và tên dòng model phải phủ hết dữ liệu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { VI } from '../js/i18n.vi.js';
import { EN } from '../js/i18n.en.js';
import { t, getLang, locale, chartLabel, modelLabel, modelGroup, unitLabel, LANGS } from '../js/i18n.js';
import { CHART_EN } from '../js/chart2026.en.js';
import { MODEL_EN } from '../js/targets/model.en.js';
import { CHART } from '../js/chart2026.js';
import { MODEL_ROWS } from '../js/targets/model.js';
import { RATIO_ROWS } from '../js/core/metrics.js';

const bien = (s) => [...new Set([...String(s).matchAll(/\{(\w+)(?:\|[^|{}]*\|[^{}]*)?\}/g)].map((m) => m[1]))].sort().join(',');

test('hai từ điển có đúng cùng bộ khoá, không chuỗi rỗng', () => {
  const v = Object.keys(VI).sort(), e = Object.keys(EN).sort();
  assert.deepEqual(e.filter((k) => !(k in VI)), [], 'khoá thừa ở bản tiếng Anh');
  assert.deepEqual(v.filter((k) => !(k in EN)), [], 'khoá thiếu ở bản tiếng Anh');
  for (const k of v) {
    assert.equal(typeof VI[k], 'string'); assert.equal(typeof EN[k], 'string');
    assert.ok(VI[k].trim() && EN[k].trim(), `${k}: chuỗi rỗng`);
  }
});

test('cùng một khoá thì hai bản dùng cùng bộ biến {…} — không rơi mất chỗ điền', () => {
  const lech = Object.keys(VI).filter((k) => bien(VI[k]) !== bien(EN[k]));
  assert.deepEqual(lech, [], `khác bộ biến: ${lech.map((k) => `${k} (vi: ${bien(VI[k])} / en: ${bien(EN[k])})`).join('; ')}`);
});

test('t() điền biến, thiếu bản dịch thì rơi về tiếng Việt, khoá lạ trả lại chính nó', () => {
  assert.equal(getLang(), 'vi', 'mặc định là tiếng Việt (setLang cần DOM nên không gọi ở đây)');
  assert.equal(t('period.year', { y: 2025 }), 'Năm 2025');
  assert.equal(t('file.tooBig', { name: 'a.pdf' }), 'a.pdf: file quá lớn (tối đa 200MB)');
  assert.equal(t('khoa.khong.co'), 'khoa.khong.co');
  assert.equal(t('period.year'), 'Năm {y}', 'thiếu biến thì giữ nguyên chỗ điền, không in "undefined"');
  assert.equal(t('file.pages', { n: 1 }), '1 trang · ', 'dạng số ít / số nhiều: tiếng Việt hai vế như nhau');
  assert.equal(t('file.pages', { n: 5 }), '5 trang · ');
  assert.equal(locale(), 'vi-VN');
  assert.deepEqual(LANGS.map(([v]) => v), ['vi', 'en']);
});

test('mọi chỉ tiêu BCTC có tên tiếng Anh, không thừa khoá lạ', () => {
  const keys = CHART.map((i) => `${i.st}:${i.code}`);
  assert.deepEqual(keys.filter((k) => !CHART_EN[k]), [], 'chỉ tiêu thiếu tên tiếng Anh');
  assert.deepEqual(Object.keys(CHART_EN).filter((k) => !keys.includes(k)), [], 'tên tiếng Anh thừa');
  for (const [k, v] of Object.entries(CHART_EN)) assert.ok(v.trim(), `${k} rỗng`);
  // Đang ở tiếng Việt thì chartLabel trả lại tên gốc.
  assert.equal(chartLabel('BS:280', 'TỔNG CỘNG TÀI SẢN'), 'TỔNG CỘNG TÀI SẢN');
});

test('mọi dòng model có tên tiếng Anh; nhóm dòng lấy tên đầy đủ từ từ điển', () => {
  const rows = MODEL_ROWS.map((r) => r.row);
  assert.deepEqual(rows.filter((r) => !MODEL_EN[r]), [], 'dòng model thiếu tên tiếng Anh');
  assert.deepEqual(Object.keys(MODEL_EN).map(Number).filter((r) => !rows.includes(r)), [], 'tên tiếng Anh thừa');
  assert.equal(modelLabel(8, 'Doanh thu thuần'), 'Doanh thu thuần');
  for (const g of new Set(MODEL_ROWS.map((r) => r.group))) {
    assert.ok(VI[`mgroup.${g}`], `thiếu tên nhóm ${g}`);
    assert.equal(modelGroup(g), VI[`mgroup.${g}`]);
  }
});

test('mỗi chỉ số có tên và cách tính ở cả hai ngôn ngữ', () => {
  for (const r of RATIO_ROWS) for (const k of [`ratio.${r.key}`, `ratio.${r.key}.hint`]) {
    assert.ok(VI[k] && EN[k], `thiếu ${k}`);
  }
});

test('nhãn đơn vị đủ cho mọi bội số dùng trong trang', () => {
  for (const u of [1, 1e3, 1e6, 1e9]) assert.ok(unitLabel(u) && !unitLabel(u).startsWith('unit.'), `thiếu nhãn cho ${u}`);
  assert.equal(unitLabel(1e6), 'triệu đồng');
});

test('không còn chuỗi tiếng Việt viết cứng — mọi chữ người dùng thấy đều đi qua i18n', () => {
  const VN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  // prompts.js viết tiếng Việt cho Gemini đọc BCTC Việt Nam, không phải chữ hiện trên trang.
  // chart2026.js / model.js giữ tên tiếng Việt làm bản gốc; chartLabel/modelLabel lo bản tiếng Anh.
  // sheets.js sinh tự động từ template elevaTO: nhãn trong đó là nhãn của model, phải giữ y nguyên
  // để file xuất ra dán được vào model — dịch là mất đối chiếu.
  const BO_QUA = new Set(['i18n.js', 'i18n.vi.js', 'i18n.en.js', 'prompts.js', 'chart2026.js', 'chart2026.en.js',
    'model.js', 'model.en.js', 'sheets.js', 'config.js', 'theme.js']);
  // Khoá nội bộ / mã định dạng, không phải câu chữ.
  const KHONG_PHAI_CHU = /^(CF:60=BS:110\(năm trước\)|[#,.0;()"–\\]+|·|✕|🔒| · |CĐKT|Mảng|TSCĐ|Vốn chủ|Nợ vay|Tham số|triệu đồng|Chữ)$/;
  const thuMuc = [['js', ''], ['js/core', 'core/'], ['js/ui', 'ui/'], ['js/targets', 'targets/']];
  const xau = [];
  for (const [dir, tien] of thuMuc) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.js') || BO_QUA.has(f.name)) continue;
      const src = readFileSync(new URL(`../${dir}/${f.name}`, import.meta.url), 'utf8');
      for (const line of src.split('\n')) {
        const tr = line.trim();
        if (tr.startsWith('//') || tr.startsWith('*') || tr.startsWith('/*')) continue;   // chú thích vẫn viết tiếng Việt
        const sach = line
          .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, ' ')          // chú thích /* … */ giữa dòng
          .replace(/(^|[^:])\/\/.*$/, '$1')                          // chú thích // cuối dòng (chừa https://)
          .replace(/\/(?:\[[^\]]*\]|\\.|[^/\\\n])+\/[gimsuy]*/g, 'RE');   // /đ/g trong .replace() không phải chữ hiển thị
        // Cả ba kiểu nháy — chuỗi mẫu `…` từng lọt lưới và để sót một nhãn hiện ra "undefined".
        for (const re of [/'([^'\\]{2,})'/g, /"([^"\\]{2,})"/g, /`([^`\\]{2,})`/g]) {
          for (const m of sach.matchAll(re)) {
            if (VN.test(m[1]) && !KHONG_PHAI_CHU.test(m[1])) xau.push(`${tien}${f.name}: ${m[1]}`);
          }
        }
      }
    }
  }
  assert.deepEqual(xau, [], `chuỗi tiếng Việt chưa qua i18n:\n${xau.join('\n')}`);
});

test('HTML tĩnh: mọi khoá data-t / data-t-attr đều có trong từ điển', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-t="([^"]+)"/g)].map((m) => m[1])
    .concat([...html.matchAll(/data-t-attr="([^"]+)"/g)].flatMap((m) => m[1].split(';').map((x) => x.split(':')[1]?.trim())));
  assert.ok(keys.length > 15, `đánh dấu quá ít chỗ: ${keys.length}`);
  assert.deepEqual(keys.filter((k) => !k || !(k in VI)), [], 'khoá trong HTML không có trong từ điển');
});

test('bảng model: chữ trên nhãn nguồn số đúng với chú thích ở câu dẫn', () => {
  // notes.js in t(`md.tag.<src>`) lên nhãn; câu md.lead liệt kê đúng những chữ đó.
  // Trước đây nhãn cắt chữ cái đầu của md.src.* nên bản tiếng Anh ra S/N/C/E/D mà chú thích vẫn ghi B/T/L/Ư/M.
  for (const [ten, bang] of [['vi', VI], ['en', EN]]) {
    const chu = ['bctc', 'tm', 'lctt', 'uoc', 'md'].map((k) => bang[`md.tag.${k}`]);
    assert.equal(new Set(chu).size, chu.length, `${ten}: chữ trên nhãn bị trùng (${chu.join(', ')})`);
    for (const c of chu) {
      assert.equal(c.length, 1, `${ten}: nhãn "${c}" phải đúng một chữ cái`);
      assert.ok(bang['md.lead'].includes(`${c} =`), `${ten}: câu dẫn không giải thích nhãn "${c}"`);
    }
  }
});
