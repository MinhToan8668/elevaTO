// Dựng nội dung mã QR chuyển khoản VietQR (chuẩn EMVCo của NAPAS) ngay trên máy người dùng.
//
// Không gọi dịch vụ sinh QR bên ngoài: số tài khoản của elevaTO không cần đi qua bên thứ ba,
// và trang vẫn giữ CSP chỉ cho script cùng nguồn. Thư viện vẽ QR để sẵn trong vendor/qrcode.
//
// Mỗi trường là: 2 chữ số mã + 2 chữ số độ dài + nội dung. Trường 63 (CRC) tính trên toàn bộ
// chuỗi đã có sẵn "6304" ở cuối.

/**
 * Bỏ dấu tiếng Việt rồi bỏ mọi ký tự ngoài ASCII in được: máy ATM / app ngân hàng không đọc
 * được dấu, nội dung chuyển khoản có dấu sẽ ra ký tự lạ.
 * Tách dấu bằng NFD nên không cần bảng tra; chỉ đ/Đ không phải dấu tách được nên xử riêng.
 */
export function khongDau(s) {
  return String(s ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e]/g, '');
}

/** CRC-16/CCITT-FALSE: khởi tạo 0xFFFF, đa thức 0x1021, không đảo bit. */
export function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i += 1) {
    crc ^= (s.charCodeAt(i) & 0xff) << 8;
    for (let b = 0; b < 8; b += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const TRUONG_TOI_DA = 99;                            // độ dài ghi bằng 2 chữ số
const BOC = 4;                                       // 2 chữ số mã + 2 chữ số độ dài của trường bên trong

/**
 * Một trường EMVCo. Nội dung dài hơn 99 ký tự thì KHÔNG cắt mà ném lỗi: cắt là độ dài ghi ra
 * không còn khớp nội dung, mã QR vẫn có CRC hợp lệ nhưng app ngân hàng đọc ra sai — với dữ liệu
 * chuyển tiền thì thà không dựng mã còn hơn dựng mã sai.
 */
const truong = (ma, noiDung) => {
  const v = String(noiDung ?? '');
  if (!v) return '';
  if (v.length > TRUONG_TOI_DA) throw new RangeError(`field ${ma}: ${v.length} chars`);
  return ma + String(v.length).padStart(2, '0') + v;
};

/**
 * @param o.bin      mã ngân hàng 6 chữ số theo NAPAS (ví dụ Vietcombank 970436)
 * @param o.stk      số tài khoản nhận
 * @param o.soTien   số tiền gợi ý (đồng); bỏ trống = người chuyển tự nhập
 * @param o.loiNhan  nội dung chuyển khoản
 * @returns chuỗi để vẽ thành mã QR, hoặc '' nếu thiếu BIN / số tài khoản
 */
export function vietQrPayload({ bin, stk, soTien, loiNhan } = {}) {
  const b = String(bin ?? '').replace(/\D/g, '');
  const tk = String(stk ?? '').replace(/[^0-9A-Za-z]/g, '');
  // Số tài khoản ngân hàng Việt Nam dài 6–19 ký tự; dài hơn là dữ liệu hỏng, đừng dựng mã.
  if (b.length !== 6 || tk.length < 6 || tk.length > 19) return '';
  const tien = Number(soTien);
  try {
    return than(b, tk, Number.isFinite(tien) && tien > 0, tien, loiNhan);
  } catch (e) { return ''; }                          // trường nào quá dài → không dựng mã còn hơn dựng sai
}

function than(b, tk, coTien, tien, loiNhan) {
  const dv = truong('00', 'A000000727') + truong('01', truong('00', b) + truong('01', tk)) + truong('02', 'QRIBFTTA');
  const than_ = truong('00', '01')
    + truong('01', coTien ? '12' : '11')            // 11 = QR dùng nhiều lần, 12 = có sẵn số tiền
    + truong('38', dv)
    + truong('53', '704')                            // VND
    + (coTien ? truong('54', String(Math.round(tien))) : '')
    + truong('58', 'VN')
    + (loiNhan ? truong('62', truong('08', khongDau(loiNhan).slice(0, TRUONG_TOI_DA - BOC))) : '');
  return than_ + '6304' + crc16(`${than_}6304`);
}
