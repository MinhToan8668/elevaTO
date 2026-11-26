import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BK, XLSX, grid, bangKeVay, toXlsx } from './load.js';

test('đọc số tiền nhiều kiểu viết', () => {
  assert.equal(BK.parseAmount(119383800), 119383800);
  assert.equal(BK.parseAmount('  19,246,587,302 '), 19246587302);
  assert.equal(BK.parseAmount('1.234.567'), 1234567);
  assert.equal(BK.parseAmount('1.234.567,89'), 1234567.89);
  assert.equal(BK.parseAmount('80,120.50'), 80120.5);
  assert.equal(BK.parseAmount('(1.000)'), -1000);
  assert.equal(BK.parseAmount('12,5'), 12.5);
  assert.equal(BK.parseAmount('chưa có'), null);
});

test('đọc ngày: số sê-ri Excel, dd/mm/yyyy, ISO', () => {
  assert.equal(BK.toISO(46223), '2026-07-20');
  assert.equal(BK.toISO('24/03/2026'), '2026-03-24');
  assert.equal(BK.toISO('5-1-26'), '2026-01-05');
  assert.equal(BK.toISO('2026-02-30'), '');
  assert.equal(BK.toISO('ngày 13 tháng 8 năm 2018'), '2018-08-13');
  assert.equal(BK.fmtDate('2026-03-24'), '24/03/2026');
});

test('khóa nhà cung cấp bỏ dấu, hoa thường, loại hình công ty', () => {
  assert.equal(BK.supKey('Công Ty TNHH Sản Xuất Phụ Tùng ÔTô'), BK.supKey('CÔNG TY TNHH SẢN XUẤT PHỤ TÙNG Ô TÔ'));
  assert.equal(BK.supKey('Công ty Cổ phần ABC'), BK.supKey('CTCP ABC'));
  assert.notEqual(BK.supKey('Công ty TNHH ABC'), BK.supKey('Công ty TNHH ABD'));
  assert.equal(BK.invNo('00001234'), '1234');
  assert.equal(BK.invNo(252), '252');
  assert.equal(BK.invNo('HĐ số 0252'), '252');
});

test('nhận dạng bảng kê vay khách gửi: tiêu đề hàng 9, số KU & ngày trong dòng chữ', () => {
  const g = bangKeVay({ rows: [
    ['CÔNG TY TNHH XNK MINH ĐĂNG', 'HĐMB: 02/01/2025/HDMB/MD-ABC', '988', 46217, 47628000, 47628000, 47628000],
    ['Công Ty TNHH Thương Mại Dịch Vụ A&B', 'HĐMB: 01/2025/HDMB/A&B', '3166', 46217, 38102400, 38102400, 42784200],
    ['Công Ty TNHH Thương Mại Dịch Vụ A&B', '', '3167', 46217, 6161400, 4681800, ''],
  ] });
  const r = BK.autoParseSheet(g);
  assert.ok(r.ok);
  assert.equal(r.header.row, 8);
  assert.equal(r.title.so_kunn, '8800123(37).26');
  assert.equal(r.title.ngay_gn, '2026-03-24');
  assert.equal(r.groups.length, 1);
  const ls = r.groups[0].lines;
  assert.equal(ls.length, 3, 'không lấy dòng Tổng cộng, chữ ký');
  assert.equal(ls[0].ncc, 'CÔNG TY TNHH XNK MINH ĐĂNG', '"Công ty" không bị coi là dòng "Cộng"');
  assert.equal(ls[2].so_hdmb, 'HĐMB: 01/2025/HDMB/A&B', 'HĐMB điền xuôi theo NCC');
  assert.equal(ls[2].tien_hd, 6161400);
  assert.equal(ls[2].tien_gn, 4681800);
  assert.equal(ls[0].ngay_hd, '2026-07-14');
});

test('bảng kê tổng hợp nhiều KUNN: cột KUNN chỉ ghi dòng đầu khối, cột chứng từ thiếu', () => {
  const g = [
    ['', 'SỐ KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐẾN HẠN', 'SỐ TIỀN', 'STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN (VNĐ)', 'SỐ TIỀN GIẢI  NGÂN (VNĐ)', 'TỔNG (VNĐ)', '', 'CHỨNG TỪ THIẾU CẦN BỔ SUNG', 'Ghi chú chứng từ'],
    ['TRONG HỆ THỐNG', '5500777(1).25', 45110, 45275, 300, 1, 'Công ty A', 'HDMB 01', '1763', 45015, 100, 100, 300, '', 'ok'],
    ['', '', '', '', '', 2, 'Công ty A', '', '1762', 45015, 500, 200, '', '', 'Biên bản giao hàng'],
    ['', '5500777(2).25', 45140, 45300, 300, 1, 'Công ty A', 'HDMB 01', '1762', 45015, 500, 300, 300, '', 'chưa có sao y'],
    ['', 106, 45380, 45500, 50, 1, 'CÔNG TY A', '', '1763', 45015, 100, 50, '', '', ''],
  ];
  const r = BK.autoParseSheet(g);
  assert.equal(r.header.map.so_kunn, 1);
  assert.equal(r.header.map.so_tien_kunn, 4);
  assert.equal(r.header.map.ho_so, 14);
  assert.deepEqual(r.groups.map((x) => [x.so_kunn, x.lines.length]), [['5500777(1).25', 2], ['5500777(2).25', 1], ['106', 1]]);
  assert.equal(r.groups[0].ngay_gn, '2023-07-03');
  assert.deepEqual(r.groups[0].lines.map((l) => [l.goc, l.thieu]), [['da_nhan', ''], ['thieu', 'Biên bản giao hàng']]);
  assert.equal(r.groups[1].lines[0].goc, 'chua');

  const kunns = r.groups.map((x, i) => ({ id: 'k' + i, ...x, lines: x.lines.map((l, j) => ({ ...l, id: `k${i}l${j}` })) }));
  const a = BK.analyze(kunns);
  const hd1762 = a.invoices.find((iv) => iv.so_hd === '1762');
  assert.equal(hd1762.status, 'du', 'GN 200 rồi GN tiếp 300 = đủ 500');
  assert.equal(hd1762.n_kunn, 2);
  assert.equal(a.lineInfo.get('k1l0').status, 'tiep');
  const hd1763 = a.invoices.find((iv) => iv.so_hd === '1763');
  assert.equal(hd1763.status, 'vuot', 'đã GN đủ 100 ở KUNN 1 rồi lại GN 50 ở KUNN 106');
  assert.equal(a.lineInfo.get('k2l0').status, 'da_du');
  assert.ok(a.alerts.some((x) => x.type === 'vuot'));
});

test('kiểm tra bảng kê mới trước khi giải ngân', () => {
  const old = [{ id: 'a', so_kunn: 'KU1', ngay_gn: '2026-01-10', lines: [
    { id: 'a1', ncc: 'Công ty TNHH Thép Hòa Bình', so_hd: '676', ngay_hd: '2026-01-05', tien_hd: 1000, tien_gn: 400 },
    { id: 'a2', ncc: 'Công ty TNHH Thép Hòa Bình', so_hd: '677', ngay_hd: '2026-01-05', tien_hd: 800, tien_gn: 800 },
    { id: 'a3', ncc: 'Công ty B', so_hd: '12', ngay_hd: '2025-01-05', tien_hd: 50, tien_gn: 50 },
  ] }];
  const neu = [{ so_kunn: 'KU2', ngay_gn: '2026-02-01', lines: [
    { ncc: 'CÔNG TY TNHH THÉP HÒA BÌNH', so_hd: '0676', ngay_hd: '2026-01-05', tien_hd: 1000, tien_gn: 600 },   // GN tiếp phần còn lại
    { ncc: 'CÔNG TY TNHH THÉP HÒA BÌNH', so_hd: '677', ngay_hd: '2026-01-05', tien_hd: 800, tien_gn: 800 },    // gửi nhầm HĐ đã GN đủ
    { ncc: 'Công ty B', so_hd: '12', ngay_hd: '2026-03-01', tien_hd: 70, tien_gn: 70 },                   // số HĐ năm sau, khác hóa đơn
    { ncc: 'Công ty C', so_hd: '5', ngay_hd: '2026-01-20', tien_hd: 90, tien_gn: 90 },
    { ncc: 'Công ty C', so_hd: '5', ngay_hd: '2026-01-20', tien_hd: 90, tien_gn: 90 },                    // kê 2 lần
  ] }];
  const r = BK.checkNew(old, neu);
  const st = r.groups[0].lines.map((l) => l.check.status);
  assert.deepEqual(st, ['tiep', 'da_du', 'moi', 'trung_file', 'trung_file']);
  assert.equal(r.groups[0].lines[0].check.con_lai_truoc, 600);
  assert.equal(r.groups[0].lines[0].check.con_lai_sau, 0);
  assert.equal(r.groups[0].lines[1].check.history[0].so_kunn, 'KU1');
  assert.equal(r.errors, 3);
  assert.equal(r.groups[0].exists, false);
  // nạp lại đúng KUNN cũ → coi là thay thế, không tự báo trùng với chính nó
  const again = BK.checkNew(old, [{ so_kunn: 'ku1', ngay_gn: '2026-01-10', lines: old[0].lines.map(({ id, ...l }) => l) }]);
  assert.equal(again.errors, 0);
  assert.equal(again.groups[0].exists, true);
});

test('nghi trùng: cùng số HĐ cùng năm khác ngày', () => {
  const a = BK.analyze([{ id: 'x', so_kunn: 'K', ngay_gn: '2026-01-01', lines: [
    { id: '1', ncc: 'NCC', so_hd: '9', ngay_hd: '2026-01-02', tien_hd: 10, tien_gn: 10 },
  ] }, { id: 'y', so_kunn: 'K2', ngay_gn: '2026-02-01', lines: [
    { id: '2', ncc: 'NCC', so_hd: '9', ngay_hd: '2026-01-20', tien_hd: 10, tien_gn: 10 },
  ] }]);
  assert.equal(a.lineInfo.get('2').status, 'nghi_trung');
  assert.ok(a.alerts.some((x) => x.type === 'nghi_trung'));
});

test('hồ sơ gốc: quá hạn và tóm tắt khách hàng', () => {
  const k = { id: 'k', so_kunn: 'K', ngay_gn: '2026-01-01', lines: [{ id: 1, goc: 'da_nhan', tien_gn: 5 }, { id: 2, goc: 'thieu', thieu: 'BBGH', tien_gn: 5 }] };
  const s = BK.kunnSummary(k, { today: '2026-03-02', hanNgay: 30 });
  assert.equal(s.han, '2026-01-31');
  assert.equal(s.quaHan, 30);
  assert.equal(s.goc, 'thieu');
  assert.equal(BK.kunnSummary({ ...k, han_bs: '2026-04-01' }, { today: '2026-03-02' }).quaHan, 0);
  const cs = BK.customerSummary([k], { today: '2026-03-02' });
  assert.equal(cs.n_pending, 1);
  assert.equal(cs.n_qua_han, 1);
  assert.equal(BK.classifyDocNote('OK').goc, 'da_nhan');
  assert.equal(BK.classifyDocNote('chưa thấy bản gốc lưu NH').goc, 'chua');
});

test('đọc file Excel thật (.xlsx) qua thư viện + chọn đúng sheet', () => {
  const buf = toXlsx({
    'Bang Ke': [['DANH SÁCH CHUYỂN KHOẢN ĐÍNH KÈM KUNN SỐ: 007.10'], ['STT', 'BÊN THỤ HƯỞNG', 'SỐ TÀI KHOẢN', 'NGÂN HÀNG', 'SỐ TIỀN (VNĐ)', 'NỘI DUNG']],
    'Sheet1': [['SỐ TIỀN GỐC'], ['Chọn Ngôn Ngữ', '', '', '', 'English', 'Việt Nam']],
    'bANG KE chung tu GN': bangKeVay({ rows: [['CÔNG TY X', 'HĐ 1', '11', 46217, 10, 10, 10]] }),
  });
  const wb = XLSX.read(buf);
  const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, grid(wb, n)]));
  assert.equal(BK.pickSheet(sheets).name, 'bANG KE chung tu GN');
});

test('AI: ánh xạ cột dạng chữ cái + đọc JSON bọc ```', () => {
  const j = BK.parseAIJson('```json\n{"sheet":"S","header_row":9,"columns":{"ncc":"B","so_hd":"D","tien_gn":"G","ngay_gn":null}}\n```');
  assert.deepEqual(BK.aiMappingToMap(j.columns), { ncc: 1, so_hd: 3, tien_gn: 6 });
  const gs = BK.aiRowsToGroups([{ so_kunn: 'K1', ngay_gn: '2026-01-02', ncc: 'A', so_hd: '1', tien_hd: '1.000', tien_gn: null, ho_so: 'ok' }]);
  assert.equal(gs[0].lines[0].tien_gn, 1000);
  assert.equal(gs[0].lines[0].goc, 'da_nhan');
  assert.match(BK.gridToPrompt([['', 'STT', 'NCC'], [], ['x', 1, 'Công ty']]), /\[3\] A: x \| B: 1 \| C: Công ty/);
});

test('dòng ghi lệch cột (khối nhập khẩu ngoại tệ) bị đánh dấu, không đưa vào sổ hóa đơn', () => {
  const head = ['', 'SỐ KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐẾN HẠN', 'SỐ TIỀN', 'STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN (VNĐ)', 'SỐ TIỀN GIẢI  NGÂN (VNĐ)'];
  const r = BK.autoParseSheet([head,
    ['', 'K1', 45400, 45500, 1000, 1, 'Công ty A', 'HĐ 1', '11', 45390, 1000, 1000],
    ['', '', '', '', '', 2, 'KOREA CO', 'KO-30/2023', 118679.68, 106206820640, 1757.87, 'KO-040124-4'],   // số tiền USD ở cột HĐ, tờ khai ở cột ngày, số INV ở cột GN
    ['', '', '', '', '', 3, 'XIAMEN CO', 'HST092/2024', 45453, 94500, 106452391510, 94500],            // số tờ khai ở cột tiền HĐ
  ]);
  const [a, b, c] = r.groups[0].lines;
  assert.equal(a.lech, undefined);
  assert.match(b.lech, /giống số tiền/);
  assert.match(b.lech, /cột giải ngân chứa chữ/);
  assert.match(c.lech, /giống số tờ khai/);
  assert.equal(c.tien_hd, null, 'số tờ khai không bị coi là tiền hóa đơn');
  const an = BK.analyze([{ id: 'k', ...r.groups[0], lines: r.groups[0].lines.map((l, i) => ({ ...l, id: 'l' + i })) }]);
  assert.equal(an.invoices.length, 1, 'chỉ hóa đơn đọc đúng vào sổ');
  assert.equal(an.lineInfo.get('l1').status, 'lech_cot');
  assert.equal(an.lineInfo.get('l2').status, 'lech_cot');
});

test('rà soát luật: GN > tiền HĐ, HĐ sau ngày GN, số lẻ không ghi loại tiền, thiếu số HĐ, tổng lệch; bỏ qua lỗi đã xác nhận', () => {
  const k = { id: 'k', so_kunn: 'K', ngay_gn: '2026-03-01', so_tien: 999, lines: [
    { id: 'a', ncc: 'A', so_hd: '1', ngay_hd: '2026-02-01', tien_hd: 100, tien_gn: 150 },
    { id: 'b', ncc: 'B', so_hd: '2', ngay_hd: '2026-04-01', tien_hd: 100, tien_gn: 100 },
    { id: 'c', ncc: 'C', so_hd: '3', ngay_hd: '2026-02-01', tien_hd: 1757.87, tien_gn: 1757.87 },
    { id: 'd', ncc: '', so_hd: '', ngay_hd: '', tien_hd: 5, tien_gn: 5 },
    { id: 'e', ncc: 'E', so_hd: '5', ngay_hd: '2026-04-02', tien_hd: 1, tien_gn: 1, ack: ['hd_sau_gn'] },
  ] };
  const t = BK.auditKunn(k).map((x) => `${x.lineId}:${x.type}`);
  assert.ok(t.includes('a:gn_gt_hd'));
  assert.ok(t.includes('b:hd_sau_gn'));
  assert.ok(t.includes('c:ngoai_te'));
  assert.ok(t.includes('d:thieu_so_hd') && t.includes('d:thieu_ncc'));
  assert.ok(t.includes('null:tong_lech'));
  assert.ok(!t.some((x) => x.startsWith('e:')), 'lỗi đã xác nhận đúng không báo lại');
  assert.match(BK.rowText([1, '', 'KIO KOREA', 118679.68]), /^A: 1 \| C: KIO KOREA \| D: 118679\.68$/);
});

test('đơn vị tiền: nhận "ĐVT: nghìn đồng" và quy đổi; khối hàng USD gắn loại tiền', () => {
  const g = bangKeVay({ rows: [['CÔNG TY A', 'HĐ 1', '11', 46217, 1500, 1500, 1500], ['CÔNG TY B', 'HĐ 2', '12', 46217, 2000, 1000, 1000]] });
  g[6][8] = 'ĐVT: nghìn đồng';
  const r = BK.autoParseSheet(g);
  const du = BK.detectUnit(g, r.header.row, r.header.map);
  assert.equal(du.unit, 'nghin');
  BK.applyUnit(r.groups, du.unit, [{ from: 11, to: 11, currency: 'USD' }]);
  const [a, b] = r.groups[0].lines;
  assert.deepEqual([a.tien_hd, a.tien_gn, a.loai_tien], [1500000, 1500000, '']);
  assert.deepEqual([b.tien_hd, b.tien_gn, b.loai_tien], [2000, 1000, 'USD'], 'hàng 11 là USD → không nhân nghìn');
});

test('kiểm tra phân bổ cột: số HĐ toàn số lẻ, cột tiền lẫn chữ / số tờ khai, số lẻ có thể là ngoại tệ', () => {
  const head = ['STT', 'NHÀ CUNG CẤP', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN', 'SỐ TIỀN VAY'];
  const rows = [1, 2, 3, 4, 5].map((i) => [i, 'KOREA CO', 1000 + i + 0.5, 106206820640 + i, 1757.87 + i, 'INV-' + i]);
  const g = [head, ...rows];
  const map = { stt: 0, ncc: 1, so_hd: 2, ngay_hd: 3, tien_hd: 4, tien_gn: 5 };
  const p = BK.profileColumns(g, 0, map, [], 'dong');
  const t = p.issues.map((x) => x.text).join('\n');
  assert.match(t, /Số hóa đơn \(cột C\).*giống SỐ TIỀN/);
  assert.match(t, /Ngày hóa đơn \(cột D\).*số tờ khai/);
  assert.match(t, /Số tiền giải ngân.*\(cột F\).*là chữ/);
  assert.match(t, /Số tiền hóa đơn \(cột E\).*NGOẠI TỆ/);
  assert.deepEqual(p.fields.ncc.samples, ['KOREA CO']);
});

test('kiểm tra dữ liệu đã nạp: ngoại tệ chưa ghi loại tiền, KUNN ghi theo nghìn đồng, cột GN là tổng các khoản', () => {
  const L = (id, hd, gn, raw = '') => ({ id, ncc: 'NCC', so_hd: id, ngay_hd: '2026-01-01', tien_hd: hd, tien_gn: gn, raw });
  const ks = [
    { id: 'a', so_kunn: 'A', ngay_gn: '2026-01-05', lines: [L('1', 50e6, 50e6), L('2', 80e6, 80e6), L('3', 60e6, 60e6)] },
    { id: 'b', so_kunn: 'B', ngay_gn: '2026-01-05', lines: [L('4', 1757.87, 1757.87), L('5', 920.5, 920.5)] },                 // USD
    { id: 'c', so_kunn: 'C', ngay_gn: '2026-01-05', so_tien: 120e6, lines: [L('6', 50000, 50000), L('7', 70000, 70000)] },  // nghìn đồng
    { id: 'd', so_kunn: 'D', ngay_gn: '2026-01-05', lines: [L('8', 30, 100, 'H: 108 | J: 70 | K: 30 | L: 100'), L('9', 5, 20, 'J: 15 | K: 5 | L: 20')] },
  ];
  const p = BK.storedProfile(ks);
  const t = Object.fromEntries(p.issues.map((i) => [i.so_kunn + ':' + i.type, i.fix]));
  assert.deepEqual(t['B:ngoai_te'], { action: 'currency', currency: 'USD' });
  assert.deepEqual(t['C:don_vi'], { action: 'scale', factor: 1000 });
  assert.deepEqual(t['D:cot_tong'], { action: 'hd_from_gn' });
  assert.ok(!t['A:ngoai_te'] && !t['A:don_vi']);
  assert.deepEqual(BK.kunnFixPatches(ks[2], { action: 'scale', factor: 1000 }).map((x) => x.tien_gn), [50e6, 70e6]);
  assert.deepEqual(BK.kunnFixPatches(ks[3], { action: 'hd_from_gn' }).map((x) => x.tien_hd), [100, 20]);
  assert.equal(p.fields.find((f) => f.k === 'tien_hd').bad, 2, '2 dòng số lẻ không ghi loại tiền');
});

test('tiêu đề phụ giữa sheet: hàng chứa số KUNN + tiêu đề riêng của khối, có (USD) → đọc đúng cột, không gộp nhầm KUNN', () => {
  const head = ['', 'SỐ KUNN', 'NGÀY GIẢI NGÂN', 'NGÀY ĐẾN HẠN', 'SỐ TIỀN', 'STT', 'NHÀ CUNG CẤP', 'SỐ HỢP ĐỒNG/  ĐĐH', 'HÓA ĐƠN', 'NGÀY HÓA ĐƠN', 'SỐ TIỀN HÓA ĐƠN (VNĐ)', 'SỐ TIỀN GIẢI  NGÂN (VNĐ)'];
  const r = BK.autoParseSheet([head,
    ['', 'K-34', 45120, 45300, 100, 1, 'Công ty A', 'HĐ 1', '34', 45110, 100, 100],
    ['', 'K-35', 45205, 45387, 9000, 'STT', 'ĐỐI TÁC', 'SỐ HỢP ĐỒNG', 'GIÁ TRỊ HỢP ĐỒNG', 'SỐ TỜ KHAI', 'SỐ TIỀN TRÊN TỜ KHAI (USD)', 'SỐ HÓA ĐƠN', 'SỐ TIỀN TRÊN INVOICE (USD)', '', 'SỐ TIỀN TT (USD)'],
    [],
    ['', '', '', '', '', 1, 'STAR CO LTD', 'SOI 027/2023', 17640, 105599426110, 9000, 'SOI 027B/2023', 9000, '', 17640],
    ['', '', '', '', '', 2, 'STAR CO LTD', 'SOI 027/2023', '', 105598263520, 8640, 'SOI 027A/2023', 8640],
    ['', 'K-36', 45210, 45400, 50, 1, 'Công ty B', 'HĐ 2', '36', 45200, 50, 50],
  ]);
  assert.deepEqual(r.groups.map((g) => [g.so_kunn, g.lines.length]), [['K-34', 1], ['K-35', 2], ['K-36', 1]]);
  const [a, b] = r.groups[1].lines;
  assert.deepEqual([a.so_hd, a.tien_hd, a.tien_gn, a.loai_tien, a.lech], ['SOI 027B/2023', 9000, 9000, 'USD', undefined], 'số TT 17.640 ghi gộp cho 2 invoice → chia lại');
  assert.deepEqual([b.so_hd, b.tien_hd, b.tien_gn, b.loai_tien], ['SOI 027A/2023', 8640, 8640, 'USD']);
  assert.match(a.ghi_chu, /TK 105599426110/);
  assert.equal(r.groups[2].lines[0].loai_tien, '', 'KUNN sau quay về cột của tiêu đề chính');
});

test('bảng kê theo PO (chưa có hóa đơn): số PO làm số chứng từ, số tiền 11 chữ số không bị nhầm là số tờ khai, bỏ số nháp dưới dòng Tổng', () => {
  const g = [
    ['', '', '', 'BẢNG KÊ ĐỀ NGHỊ GIẢI NGÂN VIB'], ['', '', '', '', '', '', 'NGÀY', '27/10/2026'], [],
    ['STT', 'MÃ NCC', 'TÊN NCC', 'SỐ PO', 'Số tiền', 'Số tiền đề nghị GN ( Lần 2)', 'Ngày PO', 'Ngày Đề nghị', 'mặt hàng'],
    ['', '8002101', 'Công Ty Cổ Phần Tập Đoàn Mẫu', '4300099999', 83913500000, 28913500000, '07/10/2026', '27/10/2026', 'Thép'],
    ['TỔNG CỘNG', '', '', '', 83913500000, 28913500000], [], ['', '', '', '', '', 35000000000], ['', '', '', '', '', 20000000000],
  ];
  const r = BK.autoParseSheet(g);
  assert.ok(r.ok);
  const ls = r.groups.flatMap((x) => x.lines);
  assert.equal(ls.length, 1);
  assert.deepEqual([ls[0].so_hd, ls[0].ngay_hd, ls[0].tien_hd, ls[0].tien_gn], ['4300099999', '2026-10-07', 83913500000, 28913500000]);
  assert.ok(!ls[0].lech);
});

test('bảng kê PO kiểu "Tên NCC | Số PO | Ngày | Số tiền PO | Số tiền GN", dòng tổng theo NCC; "KUNN số ... ngày" không phải số KUNN', () => {
  const g = [
    ['CÔNG TY CỔ PHẦN MẪU'], [], ['BẢNG KÊ CHỨNG TỪ GIẢI NGÂN'], ['Kèm theo KUNN số ... ngày 27/10/2026'],
    ['Chi tiết theo bảng kê dưới đây:', '', '', '', '', '', 'ĐVT: VNĐ'],
    ['STT', 'Tên NCC', 'Số PO', 'Ngày', 'Số tiền PO', 'Số tiền GN', 'Hàng hóa/Dịch vụ'],
    [1, 'Công Ty Cổ Phần Tập Đoàn Mẫu', 'PO 4300099999', '07/10/2026', 83913500000, 28913500000, 'Thép'],
    ['Tổng số tiền giải ngân Công Ty Cổ Phần Tập Đoàn Mẫu', '', '', '', 83913500000, 28913500000, ''],
    ['Tổng cộng', '', '', '', 83913500000, 28913500000, ''],
  ];
  const r = BK.autoParseSheet(g);
  assert.ok(r.ok);
  const ls = r.groups.flatMap((x) => x.lines);
  assert.equal(ls.length, 1);
  assert.deepEqual([ls[0].ncc, ls[0].so_hd, ls[0].ngay_hd, ls[0].tien_hd, ls[0].tien_gn], ['Công Ty Cổ Phần Tập Đoàn Mẫu', 'PO 4300099999', '2026-10-07', 83913500000, 28913500000]);
  assert.ok(!r.title.so_kunn, 'không lấy chữ "số" làm số KUNN');
});

test('soát toàn diện: đơn vị triệu áp cho cả dòng ghi "VND"; loại tiền VND chuẩn hóa về trống', () => {
  const groups = [{ so_kunn: 'K1', so_tien: 1250, lines: [{ so_hd: '1', tien_hd: 1250, tien_gn: 1250, loai_tien: 'VND' }, { so_hd: '2', tien_hd: 10, tien_gn: 10, loai_tien: '' }] }];
  BK.applyUnit(groups, 'trieu');
  assert.equal(groups[0].so_tien, 1.25e9);
  assert.deepEqual(groups[0].lines.map((l) => [l.tien_gn, l.loai_tien]), [[1.25e9, ''], [1e7, '']]);
});
