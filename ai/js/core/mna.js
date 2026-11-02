// Phân tích một thương vụ mua cổ phần (bên mua = công ty đang phân tích), theo cách model hợp nhất elevaTO
// làm (sheet Consolidation_Model, Goodwill for new subsidiaries, NCI, DCF before / after M&A):
//
//   Lợi thế thương mại (phương pháp phần sở hữu, VAS 11) = giá mua − tỷ lệ sở hữu × giá trị hợp lý tài sản thuần
//     âm → lãi từ giao dịch mua giá rẻ, ghi nhận một lần; dương → phân bổ đều tối đa 10 năm (VAS)
//   NCI lúc mua = (1 − tỷ lệ sở hữu) × giá trị hợp lý tài sản thuần (chỉ khi nắm quyền kiểm soát > 50%)
//   Năm đầu chỉ hợp nhất số tháng sau ngày mua (model: hệ số 0,5 cho năm mua giữa kỳ)
//   EPS trước / sau thương vụ (accretion / dilution) có tính chi phí nguồn tiền: lãi vay mới, lãi tiền gửi mất
//   đi (sau thuế) và cổ phiếu phát hành thêm; giá mua hoà vốn EPS; giá trị tạo thêm so với định giá riêng mục tiêu.
// Mọi số tiền tính bằng đồng. MÁY tính, AI không tham gia.

const fin = (v) => Number.isFinite(v);
const so = (v, d = 0) => (fin(+v) ? +v : d);

export const DEFAULT_MNA = {
  on: false,
  name: '',
  stake: 0.51,          // tỷ lệ sở hữu SAU giao dịch (0–1)
  price: 0,             // giá mua cho phần sở hữu đó
  equity: 0,            // vốn chủ sở hữu (sổ sách) 100% của công ty mục tiêu
  fvAdj: 0,             // chênh lệch đánh giá lại tài sản thuần lên giá trị hợp lý (100%)
  npat: 0,              // LNST một năm 100% của công ty mục tiêu
  ebitda: 0,            // EBITDA một năm 100% (để tính EV/EBITDA đã trả)
  netDebt: 0,           // nợ ròng của mục tiêu (100%)
  months: 12,           // số tháng được hợp nhất trong năm mua
  gwYears: 10,          // số năm phân bổ lợi thế thương mại (0 = không phân bổ, như IFRS)
  cash: 1, debt: 0, shares: 0,   // cơ cấu nguồn tiền (tỷ trọng)
  kd: 0.08,             // lãi suất khoản vay mua
  cashYield: 0.04,      // lãi tiền gửi mất đi khi dùng tiền mặt
  issuePrice: 0,        // giá phát hành cổ phiếu mới (0 = giá thị trường của bên mua)
  intrinsic: 0,         // giá trị vốn chủ 100% của mục tiêu theo định giá riêng (0 = không có)
};

export function cleanMna(x) {
  const o = x && typeof x === 'object' ? x : {};
  const tien = (v) => (fin(+v) && Math.abs(+v) < 1e18 ? +v : 0);
  const tyle = (v, d) => (fin(+v) && +v >= 0 && +v <= 1 ? +v : d);
  const out = {
    on: o.on === true,
    name: String(o.name || '').slice(0, 120),
    stake: tyle(o.stake, DEFAULT_MNA.stake) || DEFAULT_MNA.stake,
    price: Math.max(0, tien(o.price)), equity: tien(o.equity), fvAdj: tien(o.fvAdj), npat: tien(o.npat),
    ebitda: tien(o.ebitda), netDebt: tien(o.netDebt), intrinsic: Math.max(0, tien(o.intrinsic)),
    months: Number.isInteger(+o.months) && +o.months >= 0 && +o.months <= 12 ? +o.months : 12,
    gwYears: Number.isInteger(+o.gwYears) && +o.gwYears >= 0 && +o.gwYears <= 50 ? +o.gwYears : 10,
    cash: tyle(o.cash, 1), debt: tyle(o.debt, 0), shares: tyle(o.shares, 0),
    kd: tyle(o.kd, DEFAULT_MNA.kd), cashYield: tyle(o.cashYield, DEFAULT_MNA.cashYield),
    issuePrice: Math.max(0, tien(o.issuePrice)),
  };
  const tong = out.cash + out.debt + out.shares;
  if (tong > 0) { out.cash /= tong; out.debt /= tong; out.shares /= tong; } else out.cash = 1;
  return out;
}

/**
 * @param acq bên mua: { npat (LNST thuộc cổ đông mẹ một năm), shares, price, netDebt, ebitda, tax }
 * @param deal thông số thương vụ (xem DEFAULT_MNA)
 */
export function mnaAnalysis(acq, deal) {
  const d = cleanMna(deal);
  const s = d.stake, P = d.price;
  const control = s > 0.5;
  const fvNet = d.equity + d.fvAdj;
  const phan = s * fvNet;
  const gw = P - phan;
  const gwAmort = gw > 0 && d.gwYears > 0 ? gw / d.gwYears : 0;
  const nci = control ? (1 - s) * fvNet : 0;
  const tax = fin(acq.tax) ? acq.tax : 0.2;
  const giaPhatHanh = d.issuePrice || acq.price || 0;

  // Chi phí nguồn tiền một năm (sau thuế) và cổ phiếu phát hành thêm.
  const vay = P * d.debt, tienMat = P * d.cash;
  const finCost = vay * d.kd * (1 - tax) + tienMat * d.cashYield * (1 - tax);
  const cpMoi = d.shares && giaPhatHanh ? (P * d.shares) / giaPhatHanh : 0;
  const issues = [];
  if (d.shares && !giaPhatHanh) issues.push('noIssuePrice');
  if (!P) issues.push('noPrice');
  if (gw < 0) issues.push('bargain');
  if (d.gwYears > 10) issues.push('gwOver10');
  if (!control && s >= 0.2) issues.push('associate');
  if (s < 0.2) issues.push('investment');

  const phanLai = s * d.npat;
  const lnTruoc = acq.npat;
  const epsTruoc = lnTruoc !== null && acq.shares ? lnTruoc / acq.shares : null;
  const sau = (f, motLan = 0) => (lnTruoc === null ? null : lnTruoc + (phanLai - gwAmort - finCost) * f + motLan);
  const lnSauNam = sau(1);
  const lnSauNam1 = sau(d.months / 12, gw < 0 ? -gw : 0);       // lãi mua giá rẻ ghi nhận một lần trong năm mua
  const cpSau = (acq.shares || 0) + cpMoi;
  const eps = (ln) => (ln === null || !cpSau ? null : ln / cpSau);
  const epsSau = eps(lnSauNam), epsSau1 = eps(lnSauNam1);

  // Giá mua hoà vốn EPS cả năm: giải P trong EPS_sau(P) = EPS_trước.
  const hoaVon = (() => {
    if (epsTruoc === null || !(phanLai > 0)) return null;
    const c = d.debt * d.kd * (1 - tax) + d.cash * d.cashYield * (1 - tax);
    const k = d.shares && giaPhatHanh ? (d.shares / giaPhatHanh) * epsTruoc : 0;
    const y = d.gwYears > 0 ? 1 / d.gwYears : 0;
    const coGw = c + k + y > 0 ? (phanLai + phan * y) / (c + k + y) : null;     // nhánh giá > phần tài sản thuần
    if (coGw !== null && coGw >= phan) return coGw;
    return c + k > 0 ? phanLai / (c + k) : null;                                 // nhánh không có lợi thế thương mại
  })();

  const giaTri100 = s ? P / s : null;
  const out = {
    deal: d, control, fvNet, share: phan, goodwill: gw, gwAmort, nci, tax,
    debtRaised: vay, cashUsed: tienMat, finCost, newShares: cpMoi, issuePrice: giaPhatHanh,
    sellerOwn: cpSau ? cpMoi / cpSau : 0,
    implied: {
      equity100: giaTri100,
      pe: giaTri100 && d.npat > 0 ? giaTri100 / d.npat : null,
      pb: giaTri100 && d.equity > 0 ? giaTri100 / d.equity : null,
      evEbitda: giaTri100 !== null && d.ebitda > 0 ? (giaTri100 + d.netDebt) / d.ebitda : null,
    },
    pickup: phanLai,
    npatBefore: lnTruoc, npatAfter: lnSauNam, npatAfterY1: lnSauNam1,
    epsBefore: epsTruoc, epsAfter: epsSau, epsAfterY1: epsSau1,
    accretion: epsTruoc && epsSau !== null ? epsSau / epsTruoc - 1 : null,
    accretionY1: epsTruoc && epsSau1 !== null ? epsSau1 / epsTruoc - 1 : null,
    breakeven: hoaVon,
    valueCreated: d.intrinsic ? s * d.intrinsic - P : null,
    issues,
  };
  // Đòn bẩy sau thương vụ: nắm quyền kiểm soát thì hợp nhất 100% nợ ròng và EBITDA của mục tiêu.
  const ndSau = (acq.netDebt || 0) + vay + tienMat + (control ? d.netDebt : 0);
  const ebSau = (acq.ebitda || 0) + (control ? d.ebitda : 0);
  out.leverage = { before: acq.ebitda ? (acq.netDebt || 0) / acq.ebitda : null, after: ebSau ? ndSau / ebSau : null, netDebtAfter: ndSau };
  if (out.accretion !== null && out.accretion < 0) issues.push('dilutive');
  if (out.valueCreated !== null && out.valueCreated < 0) issues.push('overpay');
  return out;
}
