// Câu lệnh + khuôn JSON gửi Gemini cho từng việc.
// Khuôn JSON (responseSchema) ép AI trả đúng cấu trúc; số liệu luôn là CHUỖI chép nguyên văn,
// code tự đọc số (numbers.js) — vì AI hay tự "làm đẹp" số, đổi đơn vị, hoặc trả số dạng chữ.

const S = { type: 'STRING' };
const B = { type: 'BOOLEAN' };
const I = { type: 'INTEGER' };
const obj = (properties, required) => ({ type: 'OBJECT', properties, ...(required ? { required } : {}) });
const arr = (items) => ({ type: 'ARRAY', items });

export const SYSTEM = [
  'Bạn là kế toán viên đọc báo cáo tài chính (BCTC) doanh nghiệp Việt Nam, cực kỳ cẩn thận với con số.',
  'Bạn CHỈ CHÉP LẠI những gì in trên trang, không suy luận, không tính toán, không làm tròn, không đổi đơn vị.',
  'Số chép NGUYÊN VĂN như in: giữ dấu chấm/phẩy ngăn nghìn, giữ ngoặc đơn "( )" của số âm, giữ dấu "-".',
  'Mỗi công ty có quy ước dấu riêng (chi phí in trong ngoặc hay in dương, dự phòng in âm hay dương): KHÔNG tự "sửa" dấu theo ý mình — chép đúng dấu như in, máy sẽ tự hiểu quy ước.',
  'Ô trống hoặc gạch ngang thì trả chuỗi rỗng "". Không bịa dòng, không bịa số.',
  'Tên chỉ tiêu có thể bị ngắt xuống 2–3 dòng ("Phải thu ngắn hạn của / khách hàng"): ghép lại thành MỘT dòng, số của dòng đó là số in ngang hàng với cụm tên ấy; không tạo dòng rỗng, không gán số của dòng kế tiếp cho tên bị ngắt.',
  'Tên gọi có thể khác mẫu ("Phải thu khách hàng", "Giá vốn dịch vụ cung cấp", "Lỗ khác", "Tiền thu từ đi vay"): vẫn chép nguyên văn tên như in, không đổi về tên mẫu — máy tự nhận.',
  'Trả về đúng một đối tượng JSON theo khuôn đã cho, không kèm lời giải thích.',
].join('\n');

const META = obj({
  ten_cong_ty: S,
  don_vi: { type: 'STRING', description: 'Chép nguyên văn dòng đơn vị tính, ví dụ "Đơn vị tính: VND"' },
  ngay_ket_thuc: { type: 'STRING', description: 'Ngày của cột kỳ này, dạng YYYY-MM-DD' },
  so_thang: { type: 'INTEGER', description: 'Số tháng CỘT KỲ NÀY bao trùm: năm = 12, lũy kế 9 tháng = 9, bán niên = 6, lũy kế quý 1 = 3, cột quý lẻ = 3' },
  so_thang_p: { type: 'INTEGER', description: 'Số tháng cột kỳ trước bao trùm. Cùng kỳ năm trước thì bằng so_thang; cột "Số đầu năm" của CĐKT thì bỏ hẳn trường này' },
  // KHÔNG thêm '' vào enum: Gemini trả 400 "enum: cannot be empty" và bỏ cả yêu cầu.
  // Trường không bắt buộc, không rõ thì để AI bỏ hẳn trường này.
  thong_tu: { type: 'STRING', enum: ['200', '99'], description: 'Thông tư ghi ở góc mẫu biểu: 200/2014 → "200", 99/2025 → "99"; không thấy ghi thì bỏ trường này' },
  hop_nhat: B,
  cot_v: { type: 'STRING', description: 'Tiêu đề cột đã lấy làm kỳ này' },
  cot_p: { type: 'STRING', description: 'Tiêu đề cột đã lấy làm kỳ trước' },
}, ['don_vi', 'ngay_ket_thuc']);

const ITEM = obj({
  c: { type: 'STRING', description: 'Mã số in ở cột "Mã số"; trống thì ""' },
  n: { type: 'STRING', description: 'Tên chỉ tiêu, tối đa 70 ký tự' },
  v: { type: 'STRING', description: 'Số ở cột kỳ này, chép nguyên văn' },
  p: { type: 'STRING', description: 'Số ở cột kỳ trước, chép nguyên văn' },
}, ['c', 'n', 'v', 'p']);

export const STATEMENT_SCHEMA = obj({
  meta: { ...META, properties: { ...META.properties,
    phuong_phap: { type: 'STRING', enum: ['gian_tiep', 'truc_tiep'], description: 'Chỉ cho Lưu chuyển tiền tệ; không rõ thì bỏ trường này' },
    cot_luy_ke: { type: 'BOOLEAN', description: 'Chỉ cho KQKD và LCTT: true = cột đã lấy là cột LŨY KẾ TỪ ĐẦU NĂM, false = cột quý lẻ (chỉ riêng quý đó). Báo cáo năm thì true' } } },
  items: arr(ITEM),
}, ['meta', 'items']);

const TITLE = {
  BS: 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH (tên cũ: BẢNG CÂN ĐỐI KẾ TOÁN)',
  IS: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH',
  CF: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ',
};
// Chọn cột là chỗ sai nhiều nhất khi đưa BCTC QUÝ vào: mẫu B 02a-DN in BỐN cột số — hai cột "Quý
// này / Quý trước" và hai cột "Lũy kế từ đầu năm đến cuối quý này". Lấy nhầm cột quý lẻ thì doanh thu
// 9 tháng hoá ra chỉ bằng một quý, mà CĐKT vẫn là số tại ngày cuối quý → mọi chỉ số lệch 3–4 lần.
// Nên: luôn ưu tiên cột LŨY KẾ, và BẮT BUỘC ghi lại đã lấy cột nào (cot_luy_ke) + bao nhiêu tháng
// (so_thang) để code tự biết kỳ này so được với kỳ nào (xem periodsFromMeta trong extract.js).
const LUY_KE = [
  'Báo cáo QUÝ hoặc BÁN NIÊN (mẫu B 02a-DN) thường in BỐN cột số, xếp thành hai cặp:',
  '  · cặp "Quý này" / "Quý … năm trước" — chỉ riêng ba tháng của quý đó;',
  '  · cặp "Lũy kế từ đầu năm đến cuối quý này" (năm nay) / (năm trước) — từ 01/01 tới cuối quý.',
  'BẮT BUỘC lấy CẶP LŨY KẾ: v = lũy kế năm nay, p = lũy kế cùng kỳ năm trước, và ghi cot_luy_ke = true.',
  'CHỈ khi bảng hoàn toàn KHÔNG có cột lũy kế mới lấy cặp cột quý lẻ, và khi đó ghi cot_luy_ke = false.',
  'Tiêu đề cột đã lấy chép vào cot_v / cot_p để người đọc kiểm lại được.',
  'so_thang = số tháng cột v bao trùm (quý 1 = 3, bán niên = 6, 9 tháng = 9, cả năm = 12; cột quý lẻ = 3).',
  'so_thang_p = số tháng cột p bao trùm (cùng kỳ năm trước nên thường bằng so_thang).',
].join('\n');
const COLS = {
  BS: 'v = cột "Số cuối kỳ/cuối năm", p = cột "Số đầu năm" (số tại ngày 31/12 năm trước, KHÔNG phải cùng kỳ năm trước). Bỏ trường so_thang_p.',
  IS: `Báo cáo NĂM: v = năm nay, p = năm trước, cot_luy_ke = true, so_thang = 12.\n${LUY_KE}`,
  CF: `Báo cáo NĂM: v = năm nay, p = năm trước, cot_luy_ke = true, so_thang = 12.\n${LUY_KE}\n`
    + 'Ghi phuong_phap: "gian_tiep" nếu mục I bắt đầu bằng "Lợi nhuận trước thuế", "truc_tiep" nếu bắt đầu bằng "Tiền thu từ bán hàng".',
};
// Chia đôi CĐKT khi chạy quá 60 giây / quá dài.
const PART = {
  all: '',
  assets: '\nCHỈ lấy phần TÀI SẢN: từ dòng mã 100 tới hết dòng TỔNG CỘNG TÀI SẢN.',
  sources: '\nCHỈ lấy phần NGUỒN VỐN: từ dòng mã 300 (Nợ phải trả) tới hết dòng TỔNG CỘNG NGUỒN VỐN.',
};

// Khi gửi kèm responseSchema mà AI vẫn trả rỗng, thử lại KHÔNG kèm khuôn —
// lúc đó phải tả cấu trúc ngay trong câu lệnh, nếu không AI không biết đặt tên trường thế nào.
const MO_TA_KHUON = [
  'Trả về đúng một đối tượng JSON, không kèm lời nào khác, theo dạng:',
  '{"meta":{"ten_cong_ty":"","don_vi":"","ngay_ket_thuc":"YYYY-MM-DD","so_thang":12,"so_thang_p":12,"cot_luy_ke":true,"thong_tu":"200"|"99"|"","hop_nhat":true,"cot_v":"","cot_p":""},',
  ' "items":[{"c":"mã số","n":"tên chỉ tiêu","v":"số kỳ này","p":"số kỳ trước"}]}',
  'Mọi số để ở dạng chuỗi, chép nguyên văn như in.',
].join('\n');

/**
 * @param st 'BS'|'IS'|'CF'
 * @param part 'all'|'assets'|'sources' (chỉ BS)
 * @param opts { moTaKhuon } — true: không gửi responseSchema, tả cấu trúc bằng lời trong câu lệnh
 */
export function statementTask(st, part = 'all', { moTaKhuon = false } = {}) {
  return {
    schema: moTaKhuon ? null : STATEMENT_SCHEMA,
    prompt: [
      `Đọc ${TITLE[st]} trong các trang BCTC đính kèm (bảng có thể kéo dài nhiều trang — đọc hết).`,
      'Chép MỌI dòng có số theo đúng thứ tự in, gồm cả dòng tổng (A, B, I, II…, Tổng cộng) và dòng chi tiết a), b), - Nguyên giá, - Hao mòn…',
      'c = mã số in ở cột "Mã số" (ví dụ "131", "421a", "01"), chép đúng như in kể cả khi công ty đánh số khác mẫu; ô mã trống thì c = "" (KHÔNG lấy mã của dòng trên/dưới). KHÔNG lấy số ở cột "Thuyết minh" (dạng V.01, 5, 24.1) làm mã số hay làm giá trị.',
      'BCTC ngân hàng / tổ chức tín dụng (mẫu B02, B03, B04/TCTD) không có cột "Mã số": c = "" và GIỮ số thứ tự in đầu dòng (I, II, 1, 2, a, b, 01) ở đầu n, ví dụ "VI. Cho vay khách hàng", "2. Dự phòng rủi ro cho vay khách hàng".',
      'Trang in "(tiếp theo)" là phần nối của cùng bảng: đọc tiếp, không lặp dòng đã lấy. Bỏ chữ ký, con dấu, số trang, dòng "Người lập / Kế toán trưởng / Giám đốc".',
      `Cột số: ${COLS[st]}`,
      'meta: chép đơn vị tính, ngày kết thúc kỳ, số tháng, thông tư của mẫu biểu, hợp nhất hay riêng.',
      moTaKhuon ? MO_TA_KHUON : '',
    ].filter(Boolean).join('\n') + PART[part],
  };
}

// ─── Thuyết minh ──────────────────────────────────────────

const FA_ROW = obj({
  ten: S,
  nhom: { type: 'STRING', enum: ['buildings', 'machinery', 'transport', 'office', 'other', 'land', 'software'] },
  nguyen_gia_dau: S, mua: S, xdcb: S, tang_khac: S, thanh_ly: S, giam_khac: S, nguyen_gia_cuoi: S,
  hao_mon_dau: S, khau_hao: S, hao_mon_cuoi: S,
}, ['ten', 'nguyen_gia_dau', 'nguyen_gia_cuoi', 'hao_mon_dau', 'hao_mon_cuoi']);

// Cột/dòng tổng của bảng thuyết minh BCTC Việt Nam hay đặt tên này — lấy nhầm là nhân đôi số.
const BO_COT_TONG = 'KHÔNG lấy cột hay dòng tổng: "Cộng", "Tổng", "Tổng cộng", "Loại trừ", "Điều chỉnh".';
const DON_VI_BANG = 'meta.don_vi: đơn vị tính của bảng — chép dòng "Đơn vị tính:…" nếu có, nếu không thì lấy đơn vị ghi ở ĐẦU CỘT (ví dụ "VND", "Triệu VND").';
// Thuyết minh của BCTC GIỮA NIÊN ĐỘ cũng in hai khối kỳ như các bảng chính. Lấy nhầm khối là số thuyết
// minh không khớp với KQKD/CĐKT đã trích, và phần đối chiếu ngược sẽ báo lệch (xem core/reconcile.js).
const KY_NAY = 'Báo cáo giữa niên độ (quý, bán niên): bảng in khối "kỳ này / lũy kế từ đầu năm" và khối "cùng kỳ năm trước" — LẤY KHỐI LŨY KẾ TỪ ĐẦU NĂM CỦA NĂM NAY, đúng kỳ với các bảng chính.';
// Số thuyết minh phải CỘNG LẠI ĐÚNG BẰNG dòng trên bảng chính. Nhắc thẳng trong câu lệnh vì đây là
// chỗ AI hay bỏ sót dòng cuối trang hoặc lấy lẫn cả dòng tổng.
const CONG_DU = 'Chép ĐỦ mọi dòng/cột của bảng, kể cả dòng cuối trang và dòng nhỏ: tổng các số bạn chép phải đúng bằng dòng tổng in trên bảng (nhưng KHÔNG chép chính dòng tổng đó).';

// Một DÒNG của bảng biến động vốn chủ: nhãn dòng + số ở từng cột thành phần vốn.
// Chép theo dòng (không ép AI gộp sẵn) vì một dòng model hay phải cộng nhiều dòng của bảng:
// HAX 2025 có tới ba dòng cùng rơi vào "LNCPP giảm khác" (cổ tức bằng cổ phiếu, trích quỹ, thù lao).
const EQUITY_ROW = obj({
  ten: { type: 'STRING', description: 'Nhãn dòng, chép nguyên văn' },
  von_gop: S, thang_du: S, co_phieu_quy: S, quy_dtpt: S, lncpp: S, lickks: S,
}, ['ten']);

export const NOTE_TASKS = {
  fixedAssets: {
    label: 'Tài sản cố định theo nhóm (hữu hình, vô hình)',
    schema: obj({ meta: obj({ don_vi: S }), tangible: arr(FA_ROW), intangible: arr(FA_ROW) }, ['meta', 'tangible']),
    prompt: [
      'Đọc thuyết minh TÀI SẢN CỐ ĐỊNH HỮU HÌNH và TÀI SẢN CỐ ĐỊNH VÔ HÌNH (bảng biến động: mỗi CỘT là một nhóm tài sản, các dòng là Nguyên giá rồi Giá trị hao mòn lũy kế).',
      `Mỗi nhóm tài sản (mỗi cột) là một phần tử. ${BO_COT_TONG}`,
      'nhom: nhà cửa/vật kiến trúc → buildings; máy móc thiết bị → machinery; phương tiện vận tải/truyền dẫn → transport; thiết bị dụng cụ quản lý/văn phòng → office; tài sản (hữu hình) khác → other; quyền sử dụng đất (lâu dài hay có thời hạn) → land; phần mềm và vô hình khác → software.',
      'Khối NGUYÊN GIÁ: nguyen_gia_dau = "Số dư đầu năm" / "Số đầu năm"; nguyen_gia_cuoi = "Số dư cuối năm" / "Số cuối năm";',
      '  mua = mua sắm trong năm ("Tăng trong năm" khi bảng không tách riêng); xdcb = "Chuyển từ xây dựng cơ bản dở dang" / XDCB hoàn thành;',
      '  tang_khac = tăng khác, kể cả "Phân loại lại" (ghi số âm nếu in trong ngoặc); thanh_ly = "Thanh lý/xóa sổ"; giam_khac = "Giảm trong năm" còn lại.',
      'Khối GIÁ TRỊ HAO MÒN LŨY KẾ: hao_mon_dau / hao_mon_cuoi = số dư đầu / cuối năm;',
      '  khau_hao = khấu hao trích trong năm — nhiều báo cáo ghi dòng này là "Tăng trong năm" NGAY TRONG KHỐI HAO MÒN, đừng nhầm với "Tăng trong năm" của khối nguyên giá.',
      'Hao mòn lũy kế thường in số DƯƠNG trong bảng này; cứ chép nguyên văn như in.',
      'Bỏ qua khối "Giá trị còn lại" (nó bằng nguyên giá trừ hao mòn).',
      `TSCĐ vô hình đưa vào intangible, hữu hình vào tangible. ${CONG_DU} ${KY_NAY}`,
      'Kiểm lại trước khi trả: với MỖI nhóm, nguyen_gia_dau + mua + xdcb + tang_khac − thanh_ly − giam_khac phải bằng nguyen_gia_cuoi,',
      'và hao_mon_dau + khau_hao (− hao mòn của phần thanh lý) phải bằng hao_mon_cuoi. Lệch nhiều thì xem lại đã đọc đúng dòng/cột chưa.',
      DON_VI_BANG,
    ].join('\n'),
  },
  segments: {
    label: 'Doanh thu & lợi nhuận gộp theo mảng / bộ phận',
    schema: obj({ meta: obj({ don_vi: S, nguon: S }), segments: arr(obj({
      ten: S, doanh_thu: S, gia_von: S, loi_nhuan_gop: S,
      doanh_thu_truoc: S, gia_von_truoc: S, loi_nhuan_gop_truoc: S,
    }, ['ten', 'doanh_thu'])) }, ['meta', 'segments']),
    prompt: [
      'Đọc thuyết minh BÁO CÁO BỘ PHẬN theo lĩnh vực kinh doanh (hoặc thuyết minh doanh thu / giá vốn chi tiết theo sản phẩm, dịch vụ nếu không có báo cáo bộ phận).',
      'Mỗi bộ phận / nhóm sản phẩm là MỘT phần tử: doanh_thu, gia_von, loi_nhuan_gop (dòng nào không có thì "").',
      'Bảng thường có cả NĂM NAY và NĂM TRƯỚC (hai khối dòng "Năm nay" / "Năm trước", hoặc hai nhóm cột):',
      'lấy luôn số năm trước vào doanh_thu_truoc / gia_von_truoc / loi_nhuan_gop_truoc. Không có năm trước thì để "".',
      `${BO_COT_TONG} Bỏ cả báo cáo bộ phận theo KHU VỰC ĐỊA LÝ, chỉ lấy theo lĩnh vực kinh doanh.`,
      `${CONG_DU} Tổng doanh_thu các bộ phận phải bằng doanh thu thuần trên KQKD (mã 10), tổng loi_nhuan_gop phải bằng lợi nhuận gộp (mã 20).`,
      KY_NAY,
      `meta.nguon: tên thuyết minh đã dùng. ${DON_VI_BANG}`,
    ].join('\n'),
  },
  debt: {
    label: 'Vay: tiền vay / trả nợ trong năm',
    schema: obj({ meta: obj({ don_vi: S }),
      vay_ngan_han: obj({ dau_nam: S, vay_trong_ky: S, tra_trong_ky: S, cuoi_nam: S }, ['dau_nam', 'cuoi_nam']),
      vay_dai_han: obj({ dau_nam: S, vay_trong_ky: S, tra_trong_ky: S, cuoi_nam: S }, ['dau_nam', 'cuoi_nam']) }, ['meta']),
    prompt: [
      'Đọc thuyết minh VAY VÀ NỢ THUÊ TÀI CHÍNH (ngắn hạn và dài hạn), bảng biến động trong NĂM NAY.',
      'vay_trong_ky = cột/dòng "Tăng" (tiền vay mới), tra_trong_ky = "Giảm" (trả nợ).',
      'dau_nam = số dư đầu năm, cuoi_nam = số dư cuối kỳ — lấy CẢ HAI, đừng để trống: số dư cuối kỳ phải khớp dòng',
      '"Vay và nợ thuê tài chính" trên CĐKT, nhờ đó kiểm được là đã đọc đúng bảng.',
      'Lấy dòng TỔNG của từng loại (ngắn hạn, dài hạn), đừng cộng tay từng chủ nợ.',
      'Kiểm lại: dau_nam + vay_trong_ky − tra_trong_ky phải bằng cuoi_nam.',
      `Phần nợ dài hạn đến hạn trả chuyển sang ngắn hạn KHÔNG tính là vay mới. ${KY_NAY} ${DON_VI_BANG}`,
    ].join('\n'),
  },
  equity: {
    label: 'Biến động vốn chủ sở hữu',
    schema: obj({
      meta: obj({ don_vi: S }),
      nam_nay: arr(EQUITY_ROW),
      nam_truoc: arr(EQUITY_ROW),
    }, ['meta', 'nam_nay']),
    prompt: [
      'Đọc BẢNG ĐỐI CHIẾU BIẾN ĐỘNG CỦA VỐN CHỦ SỞ HỮU (nhiều báo cáo in thành phụ lục riêng ở cuối thuyết minh,',
      'tên kiểu "PHỤ LỤC SỐ 01: TÌNH HÌNH TĂNG GIẢM VỐN CHỦ SỞ HỮU"; bảng có thể kéo dài sang trang sau).',
      'Bảng là một MA TRẬN: mỗi DÒNG là một nghiệp vụ, mỗi CỘT là một thành phần vốn chủ.',
      'Mỗi dòng nghiệp vụ là MỘT phần tử; ten = nhãn dòng chép nguyên văn; số lấy ở Ô GIAO của dòng với từng cột:',
      '  von_gop = cột "Vốn đầu tư của chủ sở hữu" / "Vốn góp của chủ sở hữu";',
      '  thang_du = "Thặng dư vốn cổ phần"; co_phieu_quy = "Cổ phiếu quỹ";',
      '  quy_dtpt = "Quỹ đầu tư phát triển" (hoặc vốn khác / quỹ khác thuộc vốn chủ);',
      '  lncpp = "Lợi nhuận sau thuế chưa phân phối"; lickks = "Lợi ích của cổ đông không kiểm soát".',
      'Ô trống hay gạch ngang thì để "". Giữ nguyên ngoặc đơn của số âm.',
      'Bảng thường có HAI KHỐI năm liền nhau, mỗi khối mở đầu bằng "Số dư đầu năm" / "Tại ngày 01/01/…" và',
      'khép lại bằng "Số dư cuối năm" / "Tại ngày 31/12/…". Khối của NĂM GẦN NHẤT vào nam_nay, khối năm liền',
      'trước vào nam_truoc. Chỉ in một năm thì bỏ hẳn nam_truoc.',
      'Chép các dòng NGHIỆP VỤ CHI TIẾT (thường có gạch đầu dòng). Dòng cộng của khối ("Tăng trong năm",',
      '"Giảm trong năm") chỉ chép khi bảng KHÔNG tách chi tiết bên dưới nó.',
      `Bỏ dòng số dư đầu năm / cuối năm và cột "Cộng". ${BO_COT_TONG} ${CONG_DU}`,
      DON_VI_BANG,
    ].join('\n'),
  },
  goodwill: {
    label: 'Lợi thế thương mại',
    schema: obj({ meta: obj({ don_vi: S }), nguyen_gia: S, phan_bo_luy_ke: S, tang: S, phan_bo_trong_ky: S }, ['meta']),
    prompt: `Đọc thuyết minh LỢI THẾ THƯƠNG MẠI năm nay: nguyen_gia (nguyên giá cuối năm), phan_bo_luy_ke (phân bổ lũy kế cuối năm), tang (tăng trong năm), phan_bo_trong_ky (phân bổ trong năm). ${KY_NAY} ${DON_VI_BANG}`,
  },
  params: {
    label: 'Số cổ phiếu lưu hành, thuế suất TNDN',
    schema: obj({ so_co_phieu_luu_hanh: S, thue_suat_tndn: S }),
    prompt: 'Tìm SỐ LƯỢNG CỔ PHIẾU ĐANG LƯU HÀNH cuối năm (số cổ phiếu, không phải mệnh giá) và THUẾ SUẤT THUẾ TNDN phổ thông công ty áp dụng (ví dụ "20%").',
  },
};

// ─── Nhận diện trang cho bản scan (không có chữ) ──────────

export const PAGE_MAP_SCHEMA = arr(obj({
  trang: I,
  loai: { type: 'STRING', enum: ['BS', 'IS', 'CF', 'NOTES', 'OTHER'] },
  nhom: arr({ type: 'STRING', enum: ['fixedAssets', 'debt', 'equity', 'segments', 'goodwill', 'params'] }),
  // Bản scan hay có trang in ngang (báo cáo bộ phận, bảng biến động vốn chủ) nhưng đóng cùng chiều
  // với các trang dọc → ảnh gửi AI bị nằm ngang. Hỏi luôn ở lượt nhận trang, khỏi tốn thêm lượt.
  xoay: { type: 'STRING', enum: ['0', '90', '180', '270'] },
}, ['trang', 'loai']));

/** @param pages số trang đầu (các trang liên tiếp) hoặc danh sách số trang theo đúng thứ tự ảnh đính kèm */
export function pageMapTask(pages) {
  const intro = Array.isArray(pages)
    ? `Các ảnh đính kèm lần lượt là các trang số ${pages.join(', ')} của một BCTC (trường "trang" ghi đúng số trang này).`
    : `Các ảnh đính kèm là các trang liên tiếp của một BCTC, bắt đầu từ trang ${pages}.`;
  return {
    schema: PAGE_MAP_SCHEMA,
    prompt: [
      intro,
      'Với MỖI trang, cho biết loai: BS (tình hình tài chính / cân đối kế toán), IS (kết quả kinh doanh), CF (lưu chuyển tiền tệ), NOTES (thuyết minh), OTHER (bìa, mục lục, báo cáo kiểm toán, ban giám đốc…).',
      'Trang tiếp nối của một bảng (không có tiêu đề) vẫn cùng loại với bảng đó.',
      'Với trang NOTES, nhom = các thuyết minh có trên trang: fixedAssets (TSCĐ hữu hình/vô hình), debt (vay và nợ thuê tài chính), equity (biến động vốn chủ sở hữu), segments (báo cáo bộ phận / doanh thu theo mảng), goodwill (lợi thế thương mại), params (số cổ phiếu lưu hành, thuế suất TNDN).',
      'xoay: ảnh trang này phải quay bao nhiêu độ THEO CHIỀU KIM ĐỒNG HỒ để chữ nằm ngang và đọc từ trái sang phải —',
      '"0" nếu chữ đã xuôi; "90" nếu chữ chạy từ dưới lên trên (phải nghiêng đầu sang trái mới đọc được);',
      '"180" nếu chữ ngược đầu; "270" nếu chữ chạy từ trên xuống dưới. Không chắc thì ghi "0".',
    ].join('\n'),
  };
}
