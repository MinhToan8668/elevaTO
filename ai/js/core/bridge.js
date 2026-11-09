// Cầu nối EV → vốn chủ DÙNG CHUNG cho mọi phương pháp (DCF, bội số EV, peer, SOTP, LBO, thác nước, bước 4): một định
// nghĩa nợ ròng duy nhất để các giá đặt cạnh nhau trên football field / giá mục tiêu so được với nhau.
//
//   'model' (như 15.DCF / 16.Comps): Equity = EV + tiền − nợ vay − NCI
//            (+ đầu tư tài chính NH khi coi ĐTNH như tiền — chế độ FCFF "chuẩn", xem core/model3.js)
//   'full':  Equity = EV − nợ ròng (gồm ĐTNH) − khoản tương đương nợ − NCI + tài sản ngoài hoạt động
//
// Tránh tính hai lần với FCFF của mô hình ba báo cáo tích hợp (fs.src = 'model'): khoản nào mô hình đã dự phóng qua
// CĐKT và chạy vào FCFF thì cầu nối không trừ / cộng thêm lần nữa:
//   · ĐTNH ở chế độ "như Excel" (biến động ĐTNH nằm trong FCFF như 08.CF dòng 25)
//   · cổ tức phải trả, dự phòng (nằm trong "phải trả khác" 07.BS dòng 77 / 82), cho vay (dòng 38 / 52)

/** @param B số dư kỳ gốc (a.base.m) · @param val thông số định giá (inp.val: bridge, fs.src, fs.fcffMode) */
export function equityBridge(B, val = {}) {
  const mode = val.bridge === 'full' ? 'full' : 'model';
  const tichHop = (val.fs?.src ?? 'model') !== 'simple';
  const chuan = (val.fs?.fcffMode ?? 'std') !== 'excel';
  const n = (x) => (Number.isFinite(x) ? x : 0);
  const items = [];
  const dup = [];
  const them = (key, v, grp) => { if (v) items.push({ key, v, grp }); };
  them('debt', -n(B.debt), 'debt');
  them('cash', n(B.cash), 'cash');
  // ĐTNH: 'model' chỉ cộng khi coi ĐTNH là tiền; 'full' luôn cộng, trừ khi FCFF tích hợp đã gồm biến động ĐTNH.
  const coDtnh = mode === 'full' ? !(tichHop && !chuan) : chuan;
  if (coDtnh) them('cashLike', n(B.cashLike), 'cash');
  else if (n(B.cashLike) && mode === 'full') dup.push('cashLike');
  if (mode === 'full') {
    for (const x of B.debtLike || []) {
      if (tichHop && (x.key === 'dividends' || x.key === 'provisions')) { dup.push(x.key); continue; }
      them(`dl.${x.key}`, -n(x.v), 'debtLike');
    }
    for (const x of B.nonOp || []) {
      if (tichHop && x.key === 'loansOut') { dup.push(x.key); continue; }
      them(`no.${x.key}`, n(x.v), 'nonOp');
    }
  }
  them('nci', -n(B.minority), 'nci');
  const total = items.reduce((s, x) => s + x.v, 0);
  // Phần trừ cho người có quyền đòi trước cổ đông (nợ, tương đương nợ, NCI) trừ tiền — không gồm tài sản ngoài hoạt động.
  const claims = -items.filter((x) => x.grp !== 'nonOp').reduce((s, x) => s + x.v, 0);
  return { mode, items, total, claims, dup, stAsCash: coDtnh, toEq: (ev) => (ev === null || ev === undefined || !Number.isFinite(ev) ? null : ev + total) };
}
