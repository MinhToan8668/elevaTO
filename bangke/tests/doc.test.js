// Soạn KUNN & PDGN: học mẫu từ file Word đã điền, nhân bảng theo danh sách, tính toán, kiểm tra, ghi lại Word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCX, JSZip, docx, docXml, P, TBL, TR, TC, KUNN_BODY, PDGN_BODY, LCB } from './load.js';

const learnOf = (body) => DOCX.learn(DOCX.parse(docXml(body)));
const texts = (doc) => { const out = []; DOCX.walk(doc.blocks, (p) => out.push(DOCX.ptext(p))); return out; };

test('đọc / ghi document.xml giữ nguyên nội dung, gộp {{trường}} bị Word cắt nhiều đoạn', () => {
  const x = docXml(P('Số: {{so_', 'kunn}} ngày ', '{{ngay_gn}}') + P('A & B <c>'));
  const d = DOCX.parse(x);
  assert.deepEqual(DOCX.fieldsIn(d), ['so_kunn', 'ngay_gn']);
  const back = DOCX.parse(DOCX.serialize(d));
  assert.deepEqual(texts(back), ['Số: {{so_kunn}} ngày {{ngay_gn}}', 'A & B <c>']);
  const filled = DOCX.serialize(d, { fill: (k) => ({ so_kunn: '12(3).26', ngay_gn: '01/02/2026' }[k]) });
  assert.match(filled, /12\(3\)\.26/);
  assert.match(filled, /A &amp; B &lt;c&gt;/);
  const red = DOCX.serialize(d, { fill: () => 'X', red: true });
  assert.match(red, /<w:color w:val="FF0000"\/><w:b\/>|<w:rPr><w:color w:val="FF0000"\/><\/w:rPr><w:t xml:space="preserve">X/, 'chỗ tool điền tô đỏ khi xuất bản soát');
});

test('học mẫu KUNN đã điền: nhận số KUNN (bị cắt nhiều đoạn), ngày, số tiền, bằng chữ, dư nợ, bảng thụ hưởng', () => {
  const r = learnOf(KUNN_BODY);
  assert.equal(r.kind, 'kunn');
  const v = r.values;
  assert.equal(v.so_kunn, '5500777(2).26');
  assert.equal(v.ngay_kunn, '05/10/2026');
  assert.equal(v.ten_kh, 'CÔNG TY TNHH THỬ NGHIỆM AN BÌNH');
  assert.equal(v.dai_dien, 'TRẦN VĂN MẪU');
  assert.deepEqual([v.so_hdtd, v.ngay_hdtd], ['5500777.26', '01/09/2026']);
  assert.deepEqual([v.so_tien, v.tong_du_no], ['1,000,000,000', '5,000,000,000'], 'Bằng số lần 1 = GN, lần 2 = tổng dư nợ');
  assert.deepEqual([v.so_tien_chu, v.tong_du_no_chu], ['Một tỷ đồng', 'Năm tỷ đồng']);
  assert.deepEqual([v.ngay_gn, v.ngay_dao_han, v.lai_suat, v.ngay_tra_lai, v.ngay_tra_lai_dau], ['05/10/2026', '05/04/2027', '8.5', '25', '25/10/2026']);
  assert.deepEqual(v._tth.map((x) => [x.ben, x.tk]), [['Công ty Cũ A', '111'], ['Công ty Cũ B', '222']]);
  const t = texts(r.doc);
  assert.ok(t.includes('Bằng chữ: {{tong_du_no_chu}}.'), 'giữ dấu chấm sau bằng chữ');
  assert.ok(t.includes('Tài sản bảo đảm riêng của khách hàng An Bình.'), 'phần riêng của KH giữ nguyên');
  assert.ok(t.some((x) => /^Số:\s*\{\{so_kunn\}\}$/.test(x)));
  assert.deepEqual(DOCX.fieldsIn(r.doc).filter((k) => k.startsWith('tth.')), ['tth.stt', 'tth.ten', 'tth.tk', 'tth.nh']);
  const tb = DOCX.listTables(r.doc);
  assert.equal(tb.length, 1); assert.equal(tb[0].rows.length, 2, 'chỉ giữ dòng tiêu đề + 1 dòng mẫu');
});

test('học mẫu PDGN: ô nhãn → giá trị, CLTF, CIC, bảng chứng từ gộp ô theo bên thụ hưởng, ngày GN ở chữ ký', () => {
  const r = learnOf(PDGN_BODY);
  assert.equal(r.kind, 'pdgn');
  const v = r.values;
  assert.deepEqual([v.ten_kh_ngan, v.cif, v.ttkd, v.ma_ttkd, v.testkey, v.so_kunn], ['CÔNG TY TNHH THỬ NGHIỆM AN BÌNH', '00123456', 'CN Thử', '123', '123/9999', '5500777(2).26']);
  assert.deepEqual([v.hm_vay, v.sd_vay, v.tn_vay, v.kd_vay, v.sd_lc, v.kd_tong, v.han_hm], ['10,000', '4,000', '0', '6,000', '0', '6,000', '01/09/2027']);
  assert.deepEqual([v.ngay_cic, v.thoi_han_thang, v.ngay_dao_han], ['01/10/2026', '6', '05/04/2027']);
  assert.equal(v._ct.length, 2);
  const f = DOCX.fieldsIn(r.doc);
  for (const k of ['ct.ben', 'ct.so', 'ct.tien_tt', 'tong_hd', 'tong_tt', 'ngay_gn']) assert.ok(f.includes(k), k);
  assert.ok(texts(r.doc).includes('Giám đốc TTKD đồng ý ngày {{ngay_gn}}'));
  assert.ok(texts(r.doc).some((x) => x.includes('Số dư tại ngày {{ngay_gn}}')));
  // nhân bảng: 3 chứng từ, 2 dòng đầu cùng bên thụ hưởng → gộp ô
  const lists = DOCX.prepLists(DOCX.linesToCt([
    { ncc: 'Công ty Mới X', so_hdmb: 'HĐ 9', so_hd: '1', ngay_hd: '2026-11-01', tien_hd: 100, tien_gn: 100 },
    { ncc: 'Công ty Mới Y', so_hd: '7', ngay_hd: '2026-11-02', tien_hd: 50, tien_gn: 40 },
    { ncc: 'CÔNG TY TNHH MỚI X', so_hd: '2', ngay_hd: '2026-11-03', tien_hd: 300, tien_gn: 200 },
  ]), []);
  assert.deepEqual(lists.ct.map((x) => [x.so, x._g, x.tien_tt]), [['1', 0, '300'], ['2', 0, '300'], ['7', 1, '40']], 'gom cùng NCC liền nhau');
  assert.deepEqual(lists.tth.map((x) => [x.ten, x.tien]), [['Công ty Mới X', '300'], ['Công ty Mới Y', '40']]);
  const d = DOCX.expand(DOCX.clone(r.doc), lists);
  const t = DOCX.listTables(d)[0];
  assert.equal(t.rows.length, 5, 'tiêu đề + 3 dòng + tổng');
  const ben = t.rows.slice(1, 4).map((row) => DOCX.vMerge(row.cells[1]));
  assert.deepEqual(ben, ['restart', 'continue', '']);
  assert.equal(DOCX.ctext(t.rows[2].cells[1]), '', 'ô gộp tiếp theo để trống');
  assert.equal(DOCX.ctext(t.rows[3].cells[3]), '{{ct.2.so}}');
  const xml = DOCX.serialize(d, { fill: (k) => { const m = /^ct\.(\d)\.(\w+)$/.exec(k); return m ? lists.ct[+m[1]][m[2]] : ''; } });
  assert.match(xml, /<w:vMerge w:val="restart"\/>/);
  const back = DOCX.parse(xml);
  const tb = back.blocks.find((b) => b.t === 'tbl' && DOCX.ctext(b.rows[0].cells[0]) === 'STT');
  assert.deepEqual(tb.rows.slice(1, 4).map((row) => DOCX.ctext(row.cells[3])), ['1', '2', '7']);
  // ô tick (checkbox) giữ được và đổi được
  assert.match(DOCX.setCb(`<w14:checked w14:val="1"/><w:t>☒</w:t>`, false), /w14:val="0"\/><w:t>☐/);
});

test('ô tick kiểu cũ FORMCHECKBOX: không lộ mã trường, tick/bỏ tick ghi đúng; đổi định dạng chữ / đoạn đúng thứ tự Word', () => {
  const d = DOCX.parse(docXml(LCB(true, 'Đồng ý') + LCB(false, 'Không đồng ý')));
  const [a, b] = d.blocks;
  assert.equal(a.items[0].k, 'cb'); assert.equal(a.items[0].on, true); assert.equal(b.items[0].on, false);
  assert.equal(DOCX.pview(a).trim(), '☒ Đồng ý');
  assert.doesNotMatch(DOCX.pview(b), /FORMCHECKBOX/);
  const off = DOCX.setCb(a.items[0].xml, false);
  assert.match(off, /<w:default w:val="1"\/><w:checked w:val="0"\/>/);
  assert.equal(DOCX.legacyOn(off), false);
  assert.equal(DOCX.legacyOn(DOCX.setCb(b.items[0].xml, true)), true);
  const xml = DOCX.serialize({ ...d, blocks: [{ ...a, items: [{ ...a.items[0], on: false }, ...a.items.slice(1)] }] });
  assert.match(xml, /FORMCHECKBOX[\s\S]*fldCharType="end"/, 'giữ nguyên trường Word');
  assert.equal(DOCX.parse(xml).blocks[0].items[0].on, false);
  assert.equal(DOCX.patchRPr('<w:rPr><w:sz w:val="24"/><w:rFonts w:ascii="X"/></w:rPr>', { b: true, color: 'FF0000' }), '<w:rPr><w:rFonts w:ascii="X"/><w:b/><w:bCs/><w:color w:val="FF0000"/><w:sz w:val="24"/></w:rPr>');
  assert.equal(DOCX.patchRPr('', { i: true, bg: 'FFFF00' }), '<w:rPr><w:i/><w:iCs/><w:highlight w:val="yellow"/></w:rPr>');
  assert.equal(DOCX.patchRPr('<w:rPr><w:highlight w:val="yellow"/></w:rPr>', { bg: 'ABCDEF', sz: 13 }), '<w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/><w:shd w:val="clear" w:color="auto" w:fill="ABCDEF"/></w:rPr>');
  assert.equal(DOCX.patchPPr('<w:pPr><w:spacing w:after="0"/><w:ind w:firstLine="720"/><w:rPr><w:b/></w:rPr></w:pPr>', { jc: 'center', indL: 720 }), '<w:pPr><w:spacing w:after="0"/><w:ind w:left="720" w:firstLine="720"/><w:jc w:val="center"/><w:rPr><w:b/></w:rPr></w:pPr>');
  assert.equal(DOCX.patchPPr('', { jc: 'right' }), '<w:pPr><w:jc w:val="right"/></w:pPr>');
});

test('số tiền bằng chữ (giống hàm DocSoTien của tool cũ), ngày đáo hạn, ngày trả lãi, TestKey', () => {
  assert.equal(DOCX.bangChu(2250491740), 'Hai tỷ hai trăm năm mươi triệu bốn trăm chín mươi mốt nghìn bảy trăm bốn mươi đồng');
  assert.equal(DOCX.bangChu(28354410312), 'Hai mươi tám tỷ ba trăm năm mươi tư triệu bốn trăm mười nghìn ba trăm mười hai đồng');
  assert.equal(DOCX.bangChu(1005000), 'Một triệu không trăm linh năm nghìn đồng');
  assert.equal(DOCX.bangChu(215), 'Hai trăm mười lăm đồng');
  assert.equal(DOCX.addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(DOCX.nextPayDay('2026-11-19', 25), '2026-11-25');
  assert.equal(DOCX.nextPayDay('2026-12-26', 25), '2027-01-25');
  const bang = { day: Object.fromEntries([...Array(31)].map((_, i) => [i + 1, i + 1])), mon: Object.fromEntries([...Array(12)].map((_, i) => [i + 1, 100])), cur: { VND: 7 }, dig: { N5: 1000, M0: 3 } };
  // 123 + ngày 15 + tháng 100 + VND 7 + vị trí cuối (N) chữ số 5 = 1000 + vị trí M chữ số 0 = 3 → 1248
  assert.equal(DOCX.testKey('123', '2026-10-15', 5, 'VND', bang), '123/1248');
  assert.throws(() => DOCX.testKey('1', '2026-10-15', 5, 'VND', { day: {} }), /Bảng key/);
  const hol = DOCX.parseHolidays(DOCX.HOL_DEF);
  assert.equal(hol['2027-02-06'], 'Tết Nguyên đán Đinh Mùi (dự kiến)');
  assert.equal(DOCX.workDay('2027-02-06', 1, hol), '2027-02-11');
});

test('tự tính & kiểm tra hồ sơ: tổng dư nợ, CLTF, vượt khả dụng, chứng từ > 90 ngày / sau ngày GN, CIC quá 10 ngày, đáo hạn ngày nghỉ', () => {
  const lists = DOCX.prepLists(DOCX.linesToCt([
    { ncc: 'A', so_hd: '1', ngay_hd: '2026-06-01', tien_hd: 3e9, tien_gn: 3e9 },
    { ncc: 'B', so_hd: '2', ngay_hd: '2026-11-20', tien_hd: 1e9, tien_gn: 1.5e9 },
  ]), [{ ten: 'A', tk: '1', nh: 'X' }]);
  const v = { ngay_gn: '19/11/2026', so_ngay_vay: '81', ngay_tra_lai: '25', du_no_truoc: '26,000,000,000', hm_tong: '30,000', sd_vay: '26,000', sd_lc: '0', ngay_cic: '01/11/2026', ten_kh: 'CÔNG TY CỔ PHẦN AN BÌNH', ngay_hdtd: '01/01/2026' };
  const c = DOCX.calc(v, lists);
  assert.equal(c.so_tien, '4,500,000,000');
  assert.equal(c.tong_du_no, '30,500,000,000');
  assert.equal(c.so_tien_chu, 'Bốn tỷ năm trăm triệu đồng');
  assert.equal(c.kd_tong, '4,000');
  assert.equal(c.ngay_dao_han, '08/02/2027', 'GN + số ngày vay');
  assert.equal(c.ngay_tra_lai_dau, '25/11/2026');
  assert.equal(c.ten_kh_ngan, 'CÔNG TY CP AN BÌNH');
  const ck = DOCX.checks({ ...v, ...c }, lists, ['testkey'], { hol: DOCX.parseHolidays(DOCX.HOL_DEF) });
  const msg = ck.map((x) => x.msg).join('\n');
  assert.match(msg, /vượt số dư khả dụng 4,000 triệu/);
  assert.match(msg, /Chứng từ 2 \(B\) ngày 20\/11\/2026 sau ngày giải ngân/);
  assert.match(msg, /Chứng từ 1 \(A\) đã 171 ngày \(> 90 ngày\) — cần bổ sung đối chiếu công nợ/);
  assert.match(msg, /giải ngân 1,500,000,000 > giá trị 1,000,000,000/);
  assert.match(msg, /CIC tra ngày 01\/11\/2026 — đã 18 ngày/);
  assert.match(msg, /đáo hạn 08\/02\/2027 rơi vào ngày nghỉ \(Tết Nguyên đán Đinh Mùi \(dự kiến\)\).*trước 03\/02\/2027.*sau 11\/02\/2027/);
  assert.match(msg, /“B” chưa có số tài khoản/);
  assert.match(msg, /Chưa điền: Testkey/);
  assert.equal(ck[0].sev, 3, 'lỗi xếp trước');
  // gõ đè số tiền bằng chữ sai → báo lỗi; trường gõ tay không bị tính đè
  const c2 = DOCX.calc({ ...v, so_tien_chu: 'Bốn tỷ đồng' }, lists, new Set(['so_tien_chu']));
  assert.equal(c2.so_tien_chu, undefined);
  assert.match(DOCX.checks({ ...v, ...c2, so_tien_chu: 'Bốn tỷ đồng' }, lists).map((x) => x.msg).join(), /bằng chữ không khớp/);
});

test('file .docx: học mẫu rồi xuất lại vẫn mở được (XML hợp lệ), số liệu điền đúng chỗ', async () => {
  const z = await JSZip.loadAsync(await docx(KUNN_BODY));
  const r = DOCX.learn(DOCX.parse(await z.file('word/document.xml').async('string')));
  const lists = DOCX.prepLists(DOCX.linesToCt([{ ncc: 'Công ty Mới X', so_hd: '1', ngay_hd: '2026-11-01', tien_hd: 100, tien_gn: 100 }]), [{ ten: 'Công ty Mới X', tk: '999', nh: 'NH Z' }]);
  const d = DOCX.expand(DOCX.clone(r.doc), lists);
  const vals = { ...r.values, so_kunn: '5500777(3).26', ngay_gn: '19/11/2026' };
  const xml = DOCX.serialize(d, { fill: (k) => { const m = /^(\w+)\.(\d+)\.(\w+)$/.exec(k); return m ? lists[m[1]][+m[2]][m[3]] : vals[k] ?? ''; } });
  assert.equal((xml.match(/<w:p>/g) || []).length, (xml.match(/<\/w:p>/g) || []).length);
  const t = texts(DOCX.parse(xml));
  assert.ok(t.some((x) => x.includes('5500777(3).26')));
  assert.ok(t.includes('999') && t.includes('NH Z'), 'bên thụ hưởng mới thay danh sách cũ');
  assert.ok(!t.includes('Công ty Cũ B'), 'không còn bên thụ hưởng của lần trước');
});

test('PDGN: bảng "Chứng từ bổ sung" (nằm trong bảng lớn) thành danh sách {{bs.*}}, điền theo số ngày ĐVKD yêu cầu', () => {
  const body = TBL(TR('Điều kiện', 'Theo phê duyệt', '', ''),
    TR(TC('Chứng từ bổ sung', '<w:vMerge w:val="restart"/>'), 'Tên chứng từ: hóa đơn', 'Bản Gốc/Sao', 'Ngày bổ sung dự kiến:'),
    TR(TC('', '<w:vMerge/>'), 'Hóa đơn GTGT', 'Sao', '30 ngày kể từ ngày giải ngân'),
    TR(TC('', '<w:vMerge/>'), 'Tờ khai', 'Sao', '30 ngày kể từ ngày giải ngân'),
    TR('Điều kiện khác', 'ĐVKD đã kiểm tra', '', ''));
  const d = DOCX.parse(docXml(body));
  const v = DOCX.learnBsAll(d);
  assert.deepEqual(v._bs.map((x) => x.ten), ['Hóa đơn GTGT', 'Tờ khai']);
  const t = d.blocks[0];
  assert.equal(t.rows.length, 4, 'còn 1 dòng mẫu');
  assert.equal(DOCX.ctext(t.rows[2].cells[1]), '{{bs.ten}}');
  const e = DOCX.expand(DOCX.clone(d), { bs: [{ ten: 'Thông báo tiền điện', ban: 'Sao', han: '15 ngày kể từ ngày giải ngân' }, { ten: 'Hóa đơn GTGT', ban: 'Sao', han: '45 ngày kể từ ngày giải ngân' }] });
  const xml = DOCX.serialize(e, { fill: (k) => { const m = /^bs\.(\d)\.(\w+)$/.exec(k); return m ? [{ ten: 'Thông báo tiền điện', ban: 'Sao', han: '15 ngày kể từ ngày giải ngân' }, { ten: 'Hóa đơn GTGT', ban: 'Sao', han: '45 ngày kể từ ngày giải ngân' }][+m[1]][m[2]] : ''; } });
  const back = DOCX.parse(xml).blocks[0];
  assert.equal(back.rows.length, 5);
  assert.equal(DOCX.ctext(back.rows[2].cells[1]), 'Thông báo tiền điện');
  assert.equal(DOCX.ctext(back.rows[3].cells[3]), '45 ngày kể từ ngày giải ngân');
  assert.equal(DOCX.ctext(back.rows[4].cells[0]), 'Điều kiện khác');
});
