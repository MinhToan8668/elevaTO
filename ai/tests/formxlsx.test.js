import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildFormXlsx } from '../js/core/formxlsx.js';
import { emptyDataset, addExtraction } from '../js/core/dataset.js';
import { readCells, sheetNames, sheetPathByName } from '../js/core/xlsx.js';

// Nạp SheetJS bản trình duyệt vào sandbox (thư mục ai/ là ES module nên không require được).
const sb = {}; vm.createContext(sb);
vm.runInContext(readFileSync(new URL('../vendor/sheetjs/xlsx.full.min.js', import.meta.url), 'utf8'), sb);
const XLSX = sb.XLSX;

const ds = addExtraction(emptyDataset(), {
  file: 'BCTC 2025.pdf', company: 'CTCP <ABC> & Co', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, warnings: [], notes: {},
  statements: {
    BS: { cur: { 'BS:111': 60e9, 'BS:112': 40e9, 'BS:280': 100e9, 'BS:411': 100e9, 'BS:440': 100e9 }, prev: { 'BS:111': 50e9 } },
    IS: { cur: { 'IS:01': 500e9, 'IS:11': 300e9 }, prev: {} },
  },
});

test('Form chuẩn hóa 2026: đủ sheet, số đúng đơn vị, không cần file mẫu, SheetJS mở được', () => {
  const files = buildFormXlsx(ds, { unit: 1e6 });
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) assert.ok(files[f], f);
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  assert.deepEqual(sheetNames(wb), ['Tổng quan', 'Tình hình tài chính', 'Kết quả kinh doanh']);
  const bs = readCells(files[sheetPathByName(wb, rels, 'Tình hình tài chính')], []);
  const row = Object.entries(bs).find(([k, v]) => /^A\d+$/.test(k) && v === '111')[0].slice(1);
  assert.equal(bs[`C${row}`], 50000, 'cột năm trước');
  assert.equal(bs[`D${row}`], 60000);
  assert.match(files[sheetPathByName(wb, rels, 'Tổng quan')], /CTCP &lt;ABC&gt; &amp; Co/);
  // Đọc lại bằng SheetJS như Excel sẽ mở
  const book = XLSX.read(zipFiles({ ...files }), { type: 'buffer' });
  assert.deepEqual([...book.SheetNames], ['Tổng quan', 'Tình hình tài chính', 'Kết quả kinh doanh']);
  assert.equal(findVal(book.Sheets['Kết quả kinh doanh'], '01'), 500000);
});

test('bố cục theo sheet của model: dòng Năm, dòng Actual / Forecast, dải mục lớn, dòng tỷ lệ', () => {
  const files = buildFormXlsx(ds, { unit: 1e6 });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const kq = readCells(files[sheetPathByName(wb, rels, 'Kết quả kinh doanh')], []);
  assert.equal(kq.B4, 'Chỉ tiêu');
  assert.equal(kq.B5, 'Actual / Forecast');
  assert.equal(kq.C5, '2024A', 'form chuẩn hóa chỉ có số thực tế nên mọi cột là A');
  assert.equal(kq.D5, '2025A');
  const nhan = Object.values(kq).filter((v) => typeof v === 'string');
  assert.ok(nhan.includes('Tỷ lệ lợi nhuận gộp / doanh thu thuần'), 'phải có dòng biên lợi nhuận suy ra');
  const bs = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  assert.match(bs, / s="18"/, 'dòng cấp 0 (A. Tài sản ngắn hạn…) dùng dải mục lớn');
});

test('dòng tỷ lệ là công thức, kỳ đầu để trống vì không có kỳ trước để so', () => {
  const two = [2024, 2025].reduce((d, y) => addExtraction(d, {
    file: `BCTC ${y}.pdf`, company: 'CTCP Hai Kỳ', meta: { ngay_ket_thuc: `${y}-12-31`, so_thang: 12 }, warnings: [], notes: {},
    statements: { IS: { cur: { 'IS:01': 500e9, 'IS:11': 300e9 }, prev: {} } },
  }), emptyDataset());
  const files = buildFormXlsx(two, { unit: 1e6 });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const xml = files[sheetPathByName(wb, rels, 'Kết quả kinh doanh')];
  const cells = readCells(xml, []);
  const n = Object.entries(cells).find(([k, v]) => /^B\d+$/.test(k) && v === 'Tăng trưởng doanh thu thuần (YoY)')[0].slice(1);
  assert.doesNotMatch(xml, new RegExp(`<c r="C${n}"[^>]*><f>`), 'kỳ đầu không có dòng YoY');
  assert.match(xml, new RegExp(`<c r="D${n}"[^>]*><f>IFERROR\\(D\\d+/C\\d+-1`), 'kỳ sau so với kỳ trước');
});

test('chỉ các dòng được tick; dòng tổng in đậm; cố định dòng tiêu đề', () => {
  const files = buildFormXlsx(ds, { unit: 1, keys: new Set(['BS:111', 'BS:280']) });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  assert.deepEqual(sheetNames(wb), ['Tổng quan', 'Tình hình tài chính']);
  const xml = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  const codes = Object.entries(readCells(xml, [])).filter(([k]) => /^A\d+$/.test(k)).map(([, v]) => v);
  assert.ok(codes.includes('111') && codes.includes('280') && !codes.includes('112'), codes.join());
  assert.match(xml, /state="frozen"/);
  const bold = /<cellXfs[\s\S]*<\/cellXfs>/.exec(files['xl/styles.xml'])[0];
  assert.ok(bold.includes('fontId="1"'));
  assert.match(bold, /horizontal="left"[^>]*indent="2"/, 'Excel chỉ thụt lề khi căn trái');
  assert.match(xml, /^<\?xml[^>]*\?><worksheet[^>]*><sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr><sheetViews>/, 'in vừa một trang ngang: sheetPr đứng trước sheetViews');
});

// BCTC đủ dòng để có cây cộng dồn thật: 280 = 100 + 200, 440 = 300 + 400.
const dsDu = addExtraction(emptyDataset(), {
  file: 'BCTC 2025.pdf', company: 'CTCP Đầy Đủ', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, warnings: [], notes: {},
  statements: {
    BS: { cur: {
      'BS:111': 60e9, 'BS:112': 40e9, 'BS:141': 30e9, 'BS:100': 130e9, 'BS:221': 70e9, 'BS:200': 70e9, 'BS:280': 200e9,
      'BS:311': 50e9, 'BS:300': 50e9, 'BS:411': 150e9, 'BS:400': 150e9, 'BS:440': 200e9,
    }, prev: {} },
  },
});

test('dòng tổng ghi bằng công thức Excel: sửa dòng con thì tổng tự nhảy', () => {
  const files = buildFormXlsx(dsDu, { unit: 1 });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const xml = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  const f = [...xml.matchAll(/<c r="(C\d+)"[^>]*><f>([^<]+)<\/f>/g)].map((m) => `${m[1]}=${m[2]}`);
  assert.ok(f.length >= 3, `phải có công thức, đang có ${f.length}`);
  assert.ok(f.some((x) => /=[+-]?C\d+([+-]C\d+)+$/.test(x)), f.slice(0, 3).join(' | '));
});

test('cuối báo cáo có dòng KIỂM TRA cân đối, viết bằng công thức, khớp thì không tô đỏ', () => {
  const files = buildFormXlsx(dsDu, { unit: 1 });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const xml = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  assert.match(xml, /KIỂM TRA: Tổng tài sản/);
  const kt = /<row r="(\d+)"><c r="A\d+"[^/]*\/><c r="B\d+"[^>]*><is><t[^>]*>KIỂM TRA[^<]*/.exec(xml);
  assert.ok(kt, 'không thấy dòng kiểm tra');
  const dong = xml.slice(xml.indexOf(`<row r="${kt[1]}"`));
  assert.match(dong, /<f>C\d+-\(C\d+\+C\d+\)<\/f>/, 'dòng kiểm tra phải là công thức');
});

test('ô lệch so với số in trên BCTC được tô đỏ', () => {
  const xau = JSON.parse(JSON.stringify(dsDu));
  xau.values[dsDu.periods[0].id]['BS:280'] += 9e9;              // tổng tài sản không khớp các dòng con
  const files = buildFormXlsx(xau, { unit: 1 });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  const xml = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  const soLech = (xml.match(/ s="15"/g) || []).length;         // 15 = kiểu số lệch (đỏ, nền hồng)
  assert.ok(soLech >= 1, 'phải có ít nhất một ô tô đỏ');
  const sach = buildFormXlsx(dsDu, { unit: 1 });
  const xmlSach = sach[sheetPathByName(sach['xl/workbook.xml'], sach['xl/_rels/workbook.xml.rels'], 'Tình hình tài chính')];
  assert.equal((xmlSach.match(/ s="15"/g) || []).length, 0, 'dữ liệu khớp thì không tô đỏ ô nào');
});

test('đơn vị chọn ngay trong file: ô chọn có dropdown, mọi ô số chia cho tên DonVi', () => {
  const files = buildFormXlsx(ds, { unit: 1e6 });
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
  assert.match(wb, /<definedName name="DonVi">'Tổng quan'!\$C\$5<\/definedName>/, 'DonVi phải trỏ tới ô hệ số');
  assert.ok(wb.indexOf('<definedNames>') > wb.indexOf('<sheets>'), 'definedNames nằm sau sheets');
  assert.ok(wb.indexOf('<definedNames>') < wb.indexOf('<calcPr'), 'definedNames nằm trước calcPr');
  const tq = files[sheetPathByName(wb, rels, 'Tổng quan')];
  assert.match(tq, /<dataValidation type="list"[^>]*sqref="B5"/, 'ô B5 là danh sách chọn đơn vị');
  assert.match(tq, /&quot;đồng,nghìn đồng,triệu đồng,tỷ đồng&quot;/);
  assert.match(readCells(tq, []).B5, /^triệu đồng$/, 'mở file ra đang ở đơn vị đã chọn trên trang');
  const bs = files[sheetPathByName(wb, rels, 'Tình hình tài chính')];
  assert.match(bs, /<f>50000000000\/DonVi<\/f>/, 'số gốc giữ nguyên đồng, chia cho DonVi khi hiển thị');
});

test('số đã tính sẵn khớp đơn vị chọn sẵn, nên trình xem không tự tính cũng thấy số', () => {
  const lay = (unit) => {
    const f = buildFormXlsx(ds, { unit });
    const c = readCells(f[sheetPathByName(f['xl/workbook.xml'], f['xl/_rels/workbook.xml.rels'], 'Tình hình tài chính')], []);
    const r = Object.entries(c).find(([k, v]) => /^A\d+$/.test(k) && v === '111')[0].slice(1);
    return Number(c[`D${r}`]);
  };
  assert.equal(lay(1), 60e9);
  assert.equal(lay(1e6), 60000);
  assert.equal(lay(1e9), 60);
});

test('sheet thuyết minh chỉ có khi tài khoản được mở (học viên / giảng viên)', () => {
  const dsTm = addExtraction(emptyDataset(), {
    file: 'BCTC 2025.pdf', company: 'CTCP Thuyết Minh', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, warnings: [],
    statements: { IS: { cur: { 'IS:01': 500e9, 'IS:11': 300e9 }, prev: {} } },
    // Thuyết minh đã qua noteToModel (dataset lưu nguyên dạng này, đơn vị đồng).
    notes: {
      segments: [{ name: 'Cá tra', revenue: 400e9, gross: 80e9 }, { name: 'Phụ phẩm', revenue: 100e9 }],
      debt: { stProceeds: 100e9, stRepay: 80e9, ltProceeds: 0, ltRepay: 0 },
    },
  });
  const free = sheetNames(buildFormXlsx(dsTm, { unit: 1e6 })['xl/workbook.xml']);
  assert.deepEqual(free, ['Tổng quan', 'Kết quả kinh doanh'], 'người dùng thường chỉ nhận báo cáo chính');
  const hv = buildFormXlsx(dsTm, { unit: 1e6, details: true });
  const ten = sheetNames(hv['xl/workbook.xml']);
  assert.ok(ten.includes('Mảng kinh doanh') && ten.includes('Vay & tham số'), ten.join(' | '));
  const mang = hv[sheetPathByName(hv['xl/workbook.xml'], hv['xl/_rels/workbook.xml.rels'], 'Mảng kinh doanh')];
  const c = readCells(mang, []);
  assert.ok(Object.values(c).includes('Cá tra') && Object.values(c).includes('Phụ phẩm'));
  assert.match(mang, /<f>400000000000\/DonVi<\/f>/, 'thuyết minh cũng chia cho DonVi');
});

// ─── zip tối giản (store, không nén) để SheetJS đọc trong test ───
import { deflateRawSync, crc32 } from 'node:zlib';
function zipFiles(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8'), nm = Buffer.from(name, 'utf8'), comp = deflateRawSync(data), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
function findVal(sheet, code) {
  const r = Object.keys(sheet).find((k) => /^A\d+$/.test(k) && sheet[k].v === code);
  return sheet['D' + r.slice(1)]?.v;
}

test('sheet TSCĐ bày theo đúng bảng biến động in trong BCTC, giữ tên nhóm của BCTC', () => {
  // Ca thật: thuyết minh VHC có "Phương tiện vận tải, truyền dẫn" — model gọi là "Phương tiện vận tải".
  // File xuất ra phải giữ TÊN IN TRÊN BCTC, không ép về nhãn của model.
  const dsFa = addExtraction(emptyDataset(), {
    file: 'BCTC 2025.pdf', company: 'CTCP Thủy Sản', meta: { ngay_ket_thuc: '2025-12-31', so_thang: 12 }, warnings: [],
    statements: { IS: { cur: { 'IS:01': 500e9, 'IS:11': 300e9 }, prev: {} } },
    notes: { fixedAssets: {
      tangible: [{ cls: 'transport', name: 'Phương tiện vận tải, truyền dẫn',
        costOpen: 318e9, additions: 12e9, cost: 326e9, accDepOpen: -188e9, depreciation: -28e9, accDep: -214e9 }],
      intangible: [{ cls: 'other', name: 'Vườn cây lâu năm', costOpen: 40e9, additions: 0, cost: 40e9, accDepOpen: -4e9, depreciation: -1e9, accDep: -5e9 }],
    } },
  });
  const f = buildFormXlsx(dsFa, { unit: 1e6, details: true });
  const wb = f['xl/workbook.xml'], rels = f['xl/_rels/workbook.xml.rels'];
  const c = readCells(f[sheetPathByName(wb, rels, 'TSCĐ & LTTM')], []);
  const nhan = Object.values(c).filter((v) => typeof v === 'string');
  assert.ok(nhan.some((x) => x.startsWith('Phương tiện vận tải, truyền dẫn')), nhan.join(' | '));
  assert.ok(nhan.some((x) => x.startsWith('Vườn cây lâu năm')), 'nhóm lạ vẫn hiện nguyên tên trên BCTC');
  // Thứ tự dòng đúng như bảng biến động: đầu năm → tăng → cuối năm, rồi hao mòn.
  const thuTu = ['Nguyên giá đầu năm', 'Tăng', 'Nguyên giá cuối năm', 'Hao mòn lũy kế đầu năm', 'Khấu hao', 'Hao mòn lũy kế cuối năm'];
  const dong = Object.entries(c).filter(([k]) => /^A\d+$/.test(k)).map(([k, v]) => [Number(k.slice(1)), v])
    .sort((a, b) => a[0] - b[0]).map(([, v]) => v).filter((v) => thuTu.includes(v));
  assert.deepEqual(dong.slice(0, 6), thuTu);
  const r = Object.entries(c).find(([k, v]) => /^A\d+$/.test(k) && v === 'Nguyên giá đầu năm')[0].slice(1);
  assert.equal(c[`B${r}`], 318000, 'số đầu năm lấy đúng từ thuyết minh');
});
