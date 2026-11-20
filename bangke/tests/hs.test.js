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

test('mốc hồ sơ: tự đánh dấu khi đủ điều kiện, bỏ bớt được, mốc đang làm', () => {
  const hs = { files: [{ id: 'f' }], docs: [{ id: 'd' }], so_kunn: '', ms: { gui_ky: 'skip' } };
  const m = HSC.milestones(hs, 0);
  assert.deepEqual(m.slice(0, 5).map((x) => x.st), ['done', 'auto', 'cur', 'skip', 'todo']);
  assert.equal(HSC.stageOf({ ...hs, so_kunn: '1(2).26' }, 0).k, 'nhan_ky');
  assert.equal(HSC.stageOf({ files: [{}], docs: [{}] }, 1).k, 'kiem_tra', 'còn lỗi → đang ở bước kiểm tra');
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

test('việc hôm nay: mỗi việc gắn một công ty; lỗi hồ sơ, chờ ký lâu, hồ sơ gốc quá hạn, đáo hạn theo sổ Excel', () => {
  const t = HSC.tasks([
    { c: { id: 'a', name: 'An Bình' }, hoso: [{ hs: { id: 'h1', ngay_gn: '2026-11-26', files: [{}], docs: [{}] }, checks: [{ sev: 3, title: 'Số tài khoản không khớp' }] }] },
    { c: { id: 'b', name: 'Minh Long' }, hoso: [{ hs: { id: 'h2', ngay_gn: '2026-11-21', so_kunn: '7(9).26', files: [{}], docs: [{}], ms: { gui_ky: '2026-11-16', nhan_ky: '2026-11-17' } }, checks: [] }],
      ledger: { kunns: [{ so: '7(3).26', dao_han: '2026-12-02', con_lai: 4.2e9 }] } },
    { c: { id: 'c', name: 'Hòa Phát Thử' }, kunns: [{ id: 'k', so_kunn: '3(12).26', ngay_gn: '2026-10-01', lines: [{ goc: 'chua' }] }] },
  ], '2026-11-20');
  const s = t.map((x) => `${x.sev}|${x.cname}|${x.text}`).join('\n');
  assert.match(s, /3\|An Bình\|Hồ sơ GN 26\/11: Số tài khoản không khớp/);
  assert.match(s, /2\|Minh Long\|Hồ sơ GN 21\/11: GĐ TTKD ký PDGN — chờ 3 ngày/);
  assert.match(s, /3\|Hòa Phát Thử\|KUNN 3\(12\)\.26 quá hạn hồ sơ gốc 20 ngày/);
  assert.match(s, /1\|Minh Long\|KUNN 7\(3\)\.26 đáo hạn 02\/12\/2026/);
  assert.equal(t[0].sev, 3);
});

test('gói tải lên hệ thống: đặt tên theo loại chứng từ, xếp thứ tự, không trùng tên', () => {
  const hs = { docs: [{ fileId: 'a', loai: 'hoa_don', f: { so: '830' } }, { fileId: 'b', loai: 'to_khai', f: { so: '1088' } }, { fileId: 'b', loai: 'to_khai', f: { so: '1089' } }, { fileId: 'c', loai: 'hoa_don', f: { so: '830' } }] };
  const r = HSC.packageNames(hs, [{ id: 'a', name: 'x.PDF' }, { id: 'b', name: 'thue.pdf' }, { id: 'c', name: 'y.pdf' }, { id: 'd', name: 'bk.xls' }]);
  assert.deepEqual(r.map((x) => x.name), ['03_BANG_KE.xls', '05_HOA_DON_GTGT_830.pdf', '05_HOA_DON_GTGT_830_2.pdf', '07_TO_KHAI_HAI_QUAN_1088.pdf']);
});
