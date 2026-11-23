// Hồ sơ giải ngân theo công ty: kiểm tra tự sinh theo bộ chứng từ, mốc, đọc file Excel quản lý giải ngân, việc hôm nay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BK, HSC, XLSX } from './load.js';

const L = (id, ncc, so_hd, ngay_hd, tien_hd, tien_gn, so_hdmb = '') => ({ id, ncc, so_hd, ngay_hd, tien_hd, tien_gn, so_hdmb });
const D = (id, loai, f) => ({ id, fileId: 'f1', loai, f, conf: 0.9 });
const KH = { id: 'c1', name: 'CTCP An Bình', mst: '0303640880', hs: { tk: { [BK.supKey('Điện lực Bắc Ninh')]: { tk: '0351000998999', nh: 'VCB Bắc Ninh' } }, han_hm: '11/11/2027', ngay_hdtd: '11/11/2026' } };
const keys = (cs, sev) => cs.filter((c) => c.sev === sev).map((c) => c.key.replace(/_.*/, ''));

test('kiểm tra tự sinh: chỉ soát những gì bộ chứng từ có, bắt sai lệch giữa bảng kê và chứng từ', () => {
  const lines = [
    L('l1', 'Công ty TNHH Hóa Dầu Long Sơn', '830', '2026-11-04', 1116900000, 1116900000, 'HĐMB 1040006585'),
    L('l2', 'Điện lực Bắc Ninh', 'PA22040512594', '2026-11-13', 303166541, 303166541),
    L('l3', 'Hải quan cửa khẩu', '108834553000', '2026-11-19', 87005295, 87005295),
  ];
  const docs = [
    D('d1', 'hoa_don', { so: '830', ngay: '04/11/2026', ben_ban: 'CÔNG TY TNHH HÓA DẦU LONG SƠN', mst_mua: '0303640880', tien: '1116900000' }),
    D('d2', 'hdmb', { so: '1040006585', ngay: '15/10/2026', hieu_luc_den: '31/12/2026' }),
    D('d3', 'tien_dien', { so: 'PA22040512594', ngay: '13/11/2026', ben_ban: 'Điện lực Bắc Ninh', tien: '303166541', tk_nhan: '118000048033', ngan_hang: 'VietinBank' }),
    D('d4', 'to_khai', { so: '108834553000', ngay: '19/11/2026', tien: '87005295' }),
  ];
  const cs = HSC.checks({ lines, docs, ngay_gn: '2026-11-26' }, { kh: KH, kunns: [], ledger: { hm: 50e9, du_no: 47.008e9, file: 'x.xlsm' } });
  const msg = cs.map((c) => `${c.sev}|${c.title}|${c.detail}`).join('\n');
  assert.match(msg, /3\|Số tài khoản nhận tiền Điện lực Bắc Ninh không khớp\|.*118000048033 — VietinBank.*0351000998999/);
  assert.match(msg, /2\|Có tờ khai nhưng chưa có giấy nộp tiền NSNN/, 'có tờ khai → mới soát NSNN');
  assert.match(msg, /2\|Chưa có CIC trong hồ sơ/);
  assert.match(msg, /0\|3\/3 dòng bảng kê khớp/);
  assert.match(msg, /0\|1 HĐMB còn hiệu lực/);
  assert.match(msg, /0\|Khả dụng hạn mức đủ — còn 1\.484\.928\.164 đ/);
  assert.doesNotMatch(msg, /UNC|đối chiếu công nợ/, 'không có thì không soát');
  // sửa sai: bảng kê ghi nhầm tiền & ngày, hóa đơn trước HĐMB, HĐMB hết hạn, vượt hạn mức
  const bad = HSC.checks({
    lines: [L('l1', 'Long Sơn', '830', '2026-11-05', 1116000000, 1116000000, '1040006585')],
    docs: [D('d1', 'hoa_don', { so: '830', ngay: '04/11/2026', ben_ban: 'Hóa Dầu Long Sơn', tien: '1116900000' }), D('d2', 'hdmb', { so: '1040006585', ngay: '15/11/2026', hieu_luc_den: '20/11/2026' })],
    ngay_gn: '2026-11-26',
  }, { kh: KH, ledger: { hm: 50e9, du_no: 49.5e9 } });
  const m2 = bad.filter((c) => c.sev === 3).map((c) => c.title + ' ' + c.detail).join('\n');
  assert.match(m2, /Bảng kê ghi khác Hóa đơn GTGT 830 ngày: bảng kê 05\/11\/2026, chứng từ 04\/11\/2026; tiền: bảng kê 1\.116\.000\.000, chứng từ 1\.116\.900\.000/);
  assert.match(m2, /lập trước ngày ký HĐMB 1040006585 \(15\/11\/2026\)/);
  assert.match(m2, /HĐMB 1040006585 hết hiệu lực 20\/11\/2026/);
  assert.match(m2, /Vượt hạn mức khả dụng/);
  // bỏ qua có lý do → không còn là lỗi
  const k = bad.find((c) => c.title.startsWith('Vượt hạn mức')).key;
  const again = HSC.checks({ lines: [L('l1', 'Long Sơn', '830', '2026-11-04', 1116900000, 1116900000)], docs: [], ngay_gn: '2026-11-26', ack: { [k]: 'đã xin ngoại lệ' } }, { kh: KH, ledger: { hm: 50e9, du_no: 49.5e9 } });
  assert.equal(again.find((c) => c.key === k).sev, 1);
});

test('soát giải ngân trùng với sổ hóa đơn, hóa đơn > 90 ngày, CIC quá 10 ngày / nhóm 2, NSNN theo tờ khai', () => {
  const old = [{ id: 'k0', so_kunn: '1(1).26', ngay_gn: '2026-09-01', lines: [L('o1', 'Công ty A', '11', '2026-08-01', 100, 100)] }];
  const cs = HSC.checks({
    lines: [L('l1', 'Công ty A', '11', '2026-08-01', 100, 50), L('l2', 'Hải quan', '108800000001', '2026-11-10', 10, 10)],
    docs: [D('h', 'hoa_don', { so: '11', ngay: '01/08/2026', tien: '100' }), D('c', 'cic', { ngay: '01/11/2026', nhom_no: '2' }),
      D('t', 'to_khai', { so: '108800000001', ngay: '10/11/2026', tien: '10' }), D('n', 'nsnn', { so: 'NS1', to_khai: '108800000001', tien: '10' })],
    ngay_gn: '2026-11-26',
  }, { kh: KH, kunns: old });
  const msg = cs.map((c) => `${c.sev}|${c.title}|${c.detail}`).join('\n');
  assert.match(msg, /3\|ĐÃ GIẢI NGÂN ĐỦ trước đó: HĐ 11 · Công ty A\|đã GN ở KUNN 1\(1\)\.26 ngày 01\/09\/2026: 100 đ/);
  assert.match(msg, /2\|Hóa đơn 11 đã 117 ngày \(> 90 ngày\) — cần đối chiếu công nợ/);
  assert.match(msg, /2\|CIC tra ngày 01\/11\/2026 — đã 25 ngày/);
  assert.match(msg, /3\|CIC: KH có nợ nhóm 2/);
  assert.match(msg, /0\|1 tờ khai có giấy nộp NSNN/);
  assert.match(msg, /2\|Chưa đọc file Excel quản lý giải ngân/);
});

test('mốc hồ sơ: mốc tự động chỉ tick khi việc đã làm thật; mốc làm tay tick lúc nào cũng được; bỏ qua được; chứng từ bổ sung', () => {
  const base = { files: [{ id: 'f' }], docs: [{ id: 'd', loai: 'hoa_don' }], lines: [{}], so_kunn: '' };
  let m = HSC.milestones(base, 0);
  assert.deepEqual(m.map((x) => x.k), ['nhan', 'kiem_tra', 'so_kunn', 'soan', 'giai_ngan'], 'chỉ các bước tool làm / theo dõi được');
  assert.deepEqual(m.map((x) => x.st), ['done', 'done', 'cur', 'todo', 'todo']);
  assert.equal(m.find((x) => x.k === 'giai_ngan').can, true, 'bấm Đã giải ngân lúc nào cũng được');
  m = HSC.milestones({ ...base, so_kunn: '1(2).26', ms: { soan: '2026-11-20' } }, 0);
  assert.deepEqual(m.map((x) => x.st), ['done', 'done', 'done', 'done', 'cur']);
  assert.equal(HSC.stageOf({ ...base, so_kunn: '1', ms: { soan: '2026-11-20', giai_ngan: '2026-11-21' } }, 0).k, 'xong');
  assert.equal(HSC.stageOf(base, 1).k, 'kiem_tra', 'còn lỗi → đang ở bước kiểm tra');
  // chứng từ bổ sung: thiếu số ngày → cần xem; chưa chọn → nhắc nhẹ
  const ctx = { kh: {}, kunns: [] };
  const line = { id: 'l', ncc: 'A', so_hd: '1', ngay_hd: '2026-11-01', tien_hd: 1e6, tien_gn: 1e6 };
  let cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2026-11-20', bo_sung: [{ ten: 'Thông báo tiền điện', ban: 'Sao', ngay: '' }] }, ctx);
  assert.ok(cs.some((c) => c.key === 'bs_ngay' && c.sev === 2));
  cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2026-11-20', bo_sung: [] }, ctx);
  assert.ok(cs.some((c) => c.key === 'bs_chua'));
  cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2026-11-20', bo_sung: [], bs_none: true }, ctx);
  assert.ok(!cs.some((c) => /^bs_/.test(c.key)));
});

test('đọc file Excel QUẢN LÝ GIẢI NGÂN (mẫu trong giaingan/): sổ khế ước, danh mục, gói UBG, dư nợ', () => {
  const wb = XLSX.read(readFileSync(new URL('../../giaingan/excel/QUAN_LY_GIAI_NGAN_MAU.xlsx', import.meta.url)));
  const grids = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })]));
  const r = HSC.readLedger(grids);
  assert.ok(r.kunns.length >= 5);
  const k1 = r.kunns[0];
  assert.deepEqual([k1.so, k1.hm, k1.ngay_gn, k1.ls, k1.goc, k1.da_thu, k1.con_lai], ['1000001(1).26', 'HMTD 1', '2026-07-14', 8.35, 5e9, 5e9, 0]);
  assert.equal(r.kunns[3].con_lai, 7480500000 - 2e9, 'gốc còn lại = gốc − đã thu khi cột công thức chưa có giá trị');
  assert.equal(r.profile.ten_kh, 'CÔNG TY CỔ PHẦN MẪU A');
  assert.equal(r.profile.ma_ttkd, '123');
  assert.equal(r.profile.ngay_hdtd, BK.fmtDate(BK.toISO(46204)));
  assert.deepEqual(r.hmList.map((h) => h.ma), ['HMTD 1', 'HMTD 2']);
  assert.equal(r.hm, 120e9);
  assert.equal(r.ubg[0].ls, 8.35);
  assert.equal(r.du_no, BK.sum(r.kunns.map((k) => k.con_lai)));
  assert.equal(HSC.duNoTruoc(r, '1000001(2).27'), r.du_no - 3.25e9, 'bỏ chính KUNN đang xuất lại (bỏ hậu tố năm)');
  assert.throws(() => HSC.readLedger({ Sheet1: [['a']] }), /KHE_UOC/);
});

test('việc hôm nay: mỗi việc gắn một công ty; lỗi hồ sơ, hồ sơ dừng lâu, hồ sơ gốc quá hạn, đáo hạn theo sổ Excel', () => {
  const t = HSC.tasks([
    { c: { id: 'a', name: 'An Bình' }, hoso: [{ hs: { id: 'h1', ngay_gn: '2026-11-26', files: [{}], docs: [{}] }, checks: [{ sev: 3, title: 'Số tài khoản không khớp' }] }] },
    { c: { id: 'b', name: 'Minh Long' }, hoso: [{ hs: { id: 'h2', ngay_gn: '2026-11-21', so_kunn: '7(9).26', files: [{}], docs: [{}], lines: [{}], ms: { gui_ky: '2026-11-16', nhan_ky: '2026-11-17' } }, checks: [] }],
      ledger: { kunns: [{ so: '7(3).26', dao_han: '2026-12-02', con_lai: 4.2e9 }] } },
    { c: { id: 'c', name: 'Hòa Phát Thử' }, kunns: [{ id: 'k', so_kunn: '3(12).26', ngay_gn: '2026-10-01', lines: [{ goc: 'chua' }] }] },
  ], '2026-11-20');
  const s = t.map((x) => `${x.sev}|${x.cname}|${x.text}`).join('\n');
  assert.match(s, /3\|An Bình\|Hồ sơ GN 26\/11: Số tài khoản không khớp/);
  assert.match(s, /2\|Minh Long\|Hồ sơ GN 21\/11: Soạn KUNN & PDGN — chờ 3 ngày/);
  assert.match(s, /3\|Hòa Phát Thử\|KUNN 3\(12\)\.26 quá hạn hồ sơ gốc 20 ngày/);
  assert.match(s, /1\|Minh Long\|KUNN 7\(3\)\.26 đáo hạn 02\/12\/2026/);
  assert.equal(t[0].sev, 3);
});

test('gói tải lên hệ thống: đặt tên theo loại chứng từ, xếp thứ tự, không trùng tên', () => {
  const hs = { docs: [{ fileId: 'a', loai: 'hoa_don', f: { so: '830' } }, { fileId: 'b', loai: 'to_khai', f: { so: '1088' } }, { fileId: 'b', loai: 'to_khai', f: { so: '1089' } }, { fileId: 'c', loai: 'hoa_don', f: { so: '830' } }] };
  const r = HSC.packageNames(hs, [{ id: 'a', name: 'x.PDF' }, { id: 'b', name: 'thue.pdf' }, { id: 'c', name: 'y.pdf' }, { id: 'd', name: 'bk.xls' }]);
  assert.deepEqual(r.map((x) => x.name), ['03_BANG_KE.xls', '05_HOA_DON_GTGT_830.pdf', '05_HOA_DON_GTGT_830_2.pdf', '07_TO_KHAI_HAI_QUAN_1088.pdf']);
});

test('sổ theo dõi KUNN tự lập (file nhiều sheet): gợi ý đúng sheet công ty, dò cột, nhóm HMTD, file sửa vẫn đọc lại được', () => {
  const head = ['Số KUNN', 'Ngày GN', 'Ngày đáo hạn', 'Lãi suất', 'Số tiền GN', 'Đã trả', 'Dư nợ'];
  const ktla = [
    ['THEO DÕI KHẾ ƯỚC — KIM TÍN LONG AN'], [], head,
    ['HMTD 2025'],
    ['1050807(1).26', 46217, 46353, 0.0835, 10933435095, 10933435095, 0],
    ['1050807(2).26', 46218, 46352, 0.0835, 17924201640, 17924201640, 0],
    ['1050807(5).26', 46226, 46363, 0.0835, 7533742585, 0, 7533742585],
    ['HMTD 2026'],
    ['1050807(9).26', 46258, 46415, 0.082, 32010146610, 0, 32010146610],
  ];
  const grids = { 'Tổng hợp Kim Tín Group': [['Tổng'], ['KES', 1]], KES: [['Số KUNN'], ['9990001(1).26', 46200]], KTLA: ktla, 'KTLA - theo dõi GN': [['x']], 'Dòng tiền': [] };
  const pick = HSC.pickLedgerSheet(grids, 'Công ty TNHH Kim Tín Long An');
  assert.equal(pick[0].name, 'KTLA');
  const g = HSC.ledgerGuess(ktla);
  assert.equal(g.hr, 2);
  assert.deepEqual([g.cols.so, g.cols.ngay_gn, g.cols.dao_han, g.cols.ls, g.cols.goc, g.cols.da_thu, g.cols.con_lai], [0, 1, 2, 3, 4, 5, 6]);
  const cfg = { sheet: 'KTLA', hr: g.hr, cols: g.cols };
  const L = HSC.readLedgerSheet(ktla, cfg, { hm: 60e9 });
  assert.equal(L.kunns.length, 4);
  assert.equal(L.n_live, 2);
  assert.equal(L.du_no, 7533742585 + 32010146610);
  assert.deepEqual([L.kunns[0].hm, L.kunns[3].hm, L.kunns[3].ls, L.kunns[3].dao_han], ['HMTD 2025', 'HMTD 2026', 8.2, '2027-01-28']);
  // không có tiêu đề: dò theo dữ liệu (khoản cũ hơn = cột đã trả)
  const raw = ktla.slice(3);
  const g2 = HSC.ledgerGuess(raw);
  assert.deepEqual([g2.cols.so, g2.cols.ngay_gn, g2.cols.dao_han, g2.cols.ls, g2.cols.goc, g2.cols.da_thu, g2.cols.con_lai], [0, 1, 2, 3, 4, 5, 6]);
  // file sửa: chèn 2 hàng trên cùng + chèn cột "Ghi chú" ở đầu → đọc lại theo tên tiêu đề đã nhớ
  const labels = HSC.ledgerLabels(ktla, cfg);
  const edited = [[''], ['Cập nhật 20/11'], ...ktla.map((r, i) => (i === 2 ? ['Ghi chú', ...r] : ['', ...r])), ['', '1050807(10).26', 46260, 46420, 0.0835, 6969976665, 0, 6969976665]];
  const cf = HSC.relocateLedger(edited, { ...cfg, labels });
  assert.equal(cf.moved, true);
  assert.equal(cf.hr, 4);
  assert.equal(cf.cols.so, 1);
  const L2 = HSC.readLedgerSheet(edited, cf);
  assert.equal(L2.n_live, 3, 'thấy cả KUNN mới thêm');
});

test('báo cáo CLTF (CL - KERNEL - TF): nhận loại, so hạn mức khả dụng với số tiền giải ngân, cảnh báo CLTF cũ', () => {
  const d = HSC.normDocs({ docs: [{ loai: 'khac', conf: 0.9, f: { mo_ta: 'Báo cáo CL - KERNEL - TF của khách hàng' } }] }, 'f1');
  assert.equal(d[0].loai, 'cltf');
  const doc = { id: 'c1', fileId: 'f1', loai: 'cltf', f: { ngay: '20/10/2026', hm: '350000000000', du_no: '330000000000' }, ok: true };
  const line = { id: 'l1', ncc: 'A', so_hd: 'PO 1', ngay_hd: '2026-10-07', tien_hd: 3e10, tien_gn: 28913500000 };
  const cs = HSC.checks({ lines: [line], docs: [doc], ngay_gn: '2026-10-27' }, { kh: {}, kunns: [] });
  assert.ok(cs.some((c) => c.key === 'cltf_vuot' && c.sev === 3), 'vượt khả dụng 20 tỷ');
  assert.ok(cs.some((c) => c.key === 'cltf_old' && c.sev === 2), 'CLTF cũ 7 ngày');
  const ok = HSC.checks({ lines: [line], docs: [{ ...doc, f: { ...doc.f, ngay: '27/10/2026', du_no: '100000000000' } }], ngay_gn: '2026-10-27' }, { kh: {}, kunns: [] });
  assert.ok(ok.some((c) => c.key === 'cltf_ok'));
});

test('CIC: đọc mẫu báo cáo (S10A / R20) và ngày; tên file trong gói theo mẫu', () => {
  const d = HSC.normDocs({ docs: [{ loai: 'cic', conf: 0.95, f: { mau: 'S10A', ngay: '27/10/2026', nhom_no: '1' } }, { loai: 'cic', conf: 0.95, f: { mau: 'R20', ngay: '2026-10-27' } }] }, 'f1');
  assert.deepEqual(d.map((x) => [x.f.mau, x.f.ngay]), [['S10A', '27/10/2026'], ['R20', '27/10/2026']]);
  const hs = { files: [{ id: 'a', name: 'cic1.pdf' }, { id: 'b', name: 'cic2.pdf' }, { id: 'c', name: 'x.pdf' }], docs: [{ ...d[0], fileId: 'a' }, { ...d[1], fileId: 'b' }], skipUp: { c: true } };
  assert.deepEqual(HSC.packageNames(hs, hs.files).map((x) => x.name), ['09_CIC_S10A.pdf', '09_CIC_R20.pdf'], 'file đã bỏ khỏi gói không có trong gói');
});

test('hạn mức theo thời gian (cấp lại / điều chỉnh) và gói lãi suất / UBG: chọn theo ngày GN, soát hiệu lực, hạn mức gói, kỳ hạn', () => {
  const hist = [
    { id: 'a', tu_ngay: '2025-07-14', den_ngay: '2026-07-14', so_hdtd: 'HĐTD 1', ngay_hdtd: '2025-07-14', hm_tong: 300e9 },
    { id: 'b', tu_ngay: '2026-07-14', den_ngay: '2027-07-14', so_hdtd: 'HĐTD 1 - PL 2', ngay_hdtd: '2026-07-14', hm_tong: 350e9 },
  ];
  assert.equal(HSC.hmAt(hist, '2026-03-01').id, 'a');
  assert.equal(HSC.hmAt(hist, '2026-10-27').id, 'b', 'cấp lại → hạn mức mới');
  assert.equal(HSC.hmAt(hist, '2025-01-01'), null);
  const goi = HSC.goiMerge([{ ma: 'UBG01', ten: 'Gói A', ngay: '2026-01-01', hieu_luc: '2026-06-30', ls: 7.5, so_ngay: 180, tong: 50e9 }], [{ ma: 'UBG02', ls: 8.2, tu_ngay: '2026-07-01', den_ngay: '2026-12-31', tong: 30e9, so_ngay_max: 120 }, { ma: 'UBG01', den_ngay: '2026-09-30' }]);
  assert.deepEqual(goi.map((g) => [g.ma, g.src, g.den_ngay]), [['UBG01', 'excel+tay', '2026-09-30'], ['UBG02', 'tay', '2026-12-31']], 'sửa tay ghi đè gói từ file Excel');
  assert.deepEqual(HSC.goiAt(goi, '2026-10-27').map((g) => g.ma), ['UBG02']);
  const rows = [{ so: '1(1).26', goi: 'UBG02', goc: 25e9 }, { so: '1(2).26', goi: 'ubg02', goc: 1e9 }];
  assert.equal(HSC.goiUsed(goi[1], rows), 26e9);
  const line = { id: 'l', ncc: 'A', so_hd: 'PO 1', ngay_hd: '2026-10-07', tien_hd: 9e9, tien_gn: 5e9 };
  const ctx = { kh: { hs: {} }, kunns: [], hmHist: hist, goi, goiRows: rows, ledger: { hm: 1, du_no: 100e9, kunns: [] } };
  let cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2026-10-27', goi: 'UBG02', so_ngay_vay: '150', bs_none: true }, ctx);
  const keys = cs.filter((c) => c.sev >= 2).map((c) => c.key);
  assert.ok(keys.includes('goi_vuot'), 'đã dùng 26 tỷ + 5 tỷ > 30 tỷ');
  assert.ok(keys.includes('goi_ky_han'), '150 ngày > 120 ngày');
  assert.ok(cs.some((c) => c.key === 'hm_ok' && /còn/.test(c.title)), 'khả dụng theo hạn mức 350 tỷ của phụ lục');
  cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2027-08-01', goi: 'UBG02', bs_none: true }, ctx);
  assert.ok(cs.some((c) => c.key === 'goi_het' && c.sev === 3));
  assert.ok(cs.some((c) => c.key === 'hm_het' && /PL 2/.test(c.title)));
  cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2026-10-27', bs_none: true }, ctx);
  assert.ok(cs.some((c) => c.key === 'goi_chon' && c.sev === 1), 'nhắc chọn gói khi có gói hiệu lực');
  cs = HSC.checks({ lines: [line], docs: [], ngay_gn: '2025-01-01', bs_none: true }, ctx);
  assert.ok(cs.some((c) => c.key === 'hm_chua_hl'));
  // không đếm chính hồ sơ đang xét (đã ghi sổ “(chưa số)” / số KUNN lệch đuôi năm)
  const rows2 = [{ so: '(chưa số)', goi: 'UBG02', goc: 5e9, hsId: 'h1', kid: 'k1' }, { so: '9(5).26', goi: 'UBG02', goc: 2e9 }, { so: '9(6).26', goi: 'UBG02', goc: 1e9 }];
  assert.equal(HSC.goiUsed(goi[1], rows2, { hsId: 'h1', kid: 'k1', so: '' }), 3e9);
  assert.equal(HSC.goiUsed(goi[1], rows2, { so: '9(5).27' }), 6e9, 'bỏ KUNN cùng số trong ngoặc');
  // số ngày vay của sheet UBG là mặc định, không phải kỳ hạn tối đa
  assert.equal(goi[0].so_ngay_md, 180); assert.equal(goi[0].so_ngay_max, null);
});
