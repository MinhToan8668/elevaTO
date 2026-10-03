// Thông tin ủng hộ hiện trên trang (số tài khoản + mã QR VietQR). Quản trị đặt bằng bot Telegram.

import { docCaiDat, ghiCaiDat, xoaCaiDat } from './db.js';

// BIN NAPAS của các ngân hàng, lấy từ api.vietqr.io (xem ai/tools/banks.py).
export const BANK = {
  abb:['970425','ABBANK'], acb:['970416','ACB'], agri:['970405','Agribank'], agribank:['970405','Agribank'],
  bab:['970409','BacABank'], banviet:['970454','VietCapitalBank'], baovietbank:['970438','BaoVietBank'],
  bidv:['970418','BIDV'], bvb:['970438','BaoVietBank'], bvbank:['970454','VietCapitalBank'],
  cake:['546034','CAKE'], cbb:['970444','CBBank'], cimb:['422589','CIMB'], citibank:['533948','Citibank'],
  coopbank:['970446','COOPBANK'], ctg:['970415','VietinBank'], dbs:['796500','DBSBank'],
  eib:['970431','Eximbank'], eximbank:['970431','Eximbank'], gpb:['970408','GPBank'], hdb:['970437','HDBank'],
  hdbank:['970437','HDBank'], hlbvn:['970442','HongLeong'], hsbc:['458761','HSBC'], ibkhcm:['970456','IBKHCM'],
  ibkhn:['970455','IBKHN'], icb:['970415','VietinBank'], ivb:['970434','IndovinaBank'], kbank:['668888','KBank'],
  kbhcm:['970463','KookminHCM'], kbhn:['970462','KookminHN'], kebhanahcm:['970466','KEBHanaHCM'],
  kebhanahn:['970467','KEBHANAHN'], kienlongbank:['970452','KienLongBank'], klb:['970452','KienLongBank'],
  lienvietpostbank:['970449','LPBank'], lpb:['970449','LPBank'], mafc:['977777','MAFC'], mb:['970422','MBBank'],
  mbbank:['970422','MBBank'], mbv:['970414','MBV'], momo:['971025','MoMo'], msb:['970426','MSB'],
  nab:['970428','NamABank'], namabank:['970428','NamABank'], ncb:['970419','NCB'], nhbhn:['801011','Nonghyup'],
  ocb:['970448','OCB'], pbvn:['970439','PublicBank'], pgb:['970430','PGBank'], pvcb:['970412','PVcomBank'],
  pvdb:['971133','PVcomBank Pay'], sacombank:['970403','Sacombank'], scb:['970429','SCB'],
  scvn:['970410','StandardChartered'], seab:['970440','SeABank'], seabank:['970440','SeABank'],
  sgicb:['970400','SaigonBank'], shb:['970443','SHB'], shbvn:['970424','ShinhanBank'], stb:['970403','Sacombank'],
  tcb:['970407','Techcombank'], techcombank:['970407','Techcombank'], timo:['963388','Timo'],
  tpb:['970423','TPBank'], tpbank:['970423','TPBank'], ubank:['546035','Ubank'], uob:['970458','UnitedOverseas'],
  vab:['970427','VietABank'], vba:['970405','Agribank'], vbsp:['999888','VBSP'], vcb:['970436','Vietcombank'],
  vccb:['970454','VietCapitalBank'], vib:['970441','VIB'], vietbank:['970433','VietBank'],
  vietcombank:['970436','Vietcombank'], vietinbank:['970415','VietinBank'], vikki:['970406','Vikki'],
  vnptmoney:['971011','VNPTMoney'], vpb:['970432','VPBank'], vpbank:['970432','VPBank'], vrb:['970421','VRB'],
  vtlmoney:['971005','ViettelMoney'], wvn:['970457','Woori']
};

/** { bin, bank, stk, chu_tk, loi_nhan, loi_moi } hoặc null nếu quản trị chưa đặt. */
export async function thongTinUngHo(db) {
  const raw = await docCaiDat(db, 'UNG_HO');
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || !/^[0-9]{6}$/.test(String(o.bin || '')) || !o.stk) return null;
    return {
      bin: String(o.bin), bank: String(o.bank || ''), stk: String(o.stk),
      chu_tk: String(o.chu_tk || ''), loi_nhan: String(o.loi_nhan || ''), loi_moi: String(o.loi_moi || ''),
    };
  } catch { return null; }
}

/** Lưu thông tin ủng hộ. nganHang = mã ngắn trong BANK hoặc 6 chữ số BIN. */
export async function datUngHo(db, nganHang, stk, chuTK, loiNhan) {
  const k = String(nganHang || '').trim().toLowerCase(), b = BANK[k];
  const bin = b ? b[0] : (/^[0-9]{6}$/.test(k) ? k : '');
  if (!bin) throw new Error(`Chưa rõ ngân hàng "${nganHang}". Gõ mã ngắn (vcb, tcb, mb…) hoặc 6 chữ số BIN của NAPAS.`);
  const so = String(stk || '').replace(/[^0-9A-Za-z]/g, '');
  if (so.length < 6 || so.length > 19) throw new Error('Số tài khoản chưa đúng.');
  const o = {
    bin, bank: b ? b[1] : `BIN ${bin}`, stk: so, chu_tk: String(chuTK || '').trim().slice(0, 100),
    loi_nhan: String(loiNhan || 'Ung ho elevaTO').trim().slice(0, 60), loi_moi: '',
  };
  await ghiCaiDat(db, 'UNG_HO', JSON.stringify(o));
  return o;
}

export const anUngHo = (db) => xoaCaiDat(db, 'UNG_HO');

/** Luhn — phép kiểm tra số thẻ ngân hàng nào cũng dùng. */
function luhn(s) {
  let tong = 0;
  for (let i = s.length - 1, n = 0; i >= 0; i -= 1, n += 1) {
    let d = Number(s[i]);
    if (n % 2) { d *= 2; if (d > 9) d -= 9; }
    tong += d;
  }
  return tong % 10 === 0;
}

/**
 * Đoán xem người dùng có điền nhầm SỐ THẺ thay vì số tài khoản không.
 *
 * Số thẻ dài 16 chữ số nên lọt qua mọi kiểm tra độ dài, mà chuyển khoản trong nước KHÔNG tới
 * được số thẻ quốc tế — mã QR dựng ra vẫn hợp lệ về mặt kỹ thuật nhưng không ai trả được, và
 * chẳng có gì báo cho mình biết. Chỉ CẢNH BÁO chứ không chặn: vài ngân hàng cấp số tài khoản 16
 * chữ số thật, chặn nhầm thì còn tệ hơn.
 *
 * @returns tên loại thẻ đoán được, hoặc '' nếu trông như số tài khoản bình thường.
 */
export function giongSoThe(stk) {
  const s = String(stk || '').replace(/\D/g, '');
  if (s.length !== 16 || !luhn(s)) return '';
  if (s.startsWith('9704')) return '';                 // thẻ nội địa NAPAS — nằm ngoài phạm vi ở đây
  return { 2: 'Mastercard', 3: 'JCB', 4: 'Visa', 5: 'Mastercard' }[s[0]] || '';
}
