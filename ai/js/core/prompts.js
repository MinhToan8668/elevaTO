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
  'Ô trống hoặc gạch ngang thì trả chuỗi rỗng "". Không bịa dòng, không bịa số.',
  'Trả về đúng một đối tượng JSON theo khuôn đã cho, không kèm lời giải thích.',
].join('\n');

const META = obj({
  ten_cong_ty: S,
  don_vi: { type: 'STRING', description: 'Chép nguyên văn dòng đơn vị tính, ví dụ "Đơn vị tính: VND"' },
  ngay_ket_thuc: { type: 'STRING', description: 'Ngày của cột kỳ này, dạng YYYY-MM-DD' },
  so_thang: { type: 'INTEGER', description: 'Số tháng của kỳ lấy số (năm = 12, bán niên lũy kế = 6)' },
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
    phuong_phap: { type: 'STRING', enum: ['gian_tiep', 'truc_tiep'], description: 'Chỉ cho Lưu chuyển tiền tệ; không rõ thì bỏ trường này' } } },
  items: arr(ITEM),
}, ['meta', 'items']);

const TITLE = {
  BS: 'BÁO CÁO TÌNH HÌNH TÀI CHÍNH (tên cũ: BẢNG CÂN ĐỐI KẾ TOÁN)',
  IS: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH',
  CF: 'BÁO CÁO LƯU CHUYỂN TIỀN TỆ',
};
const COLS = {
  BS: 'v = cột "Số cuối kỳ/cuối năm", p = cột "Số đầu năm".',
  IS: 'Báo cáo năm: v = năm nay, p = năm trước. Báo cáo quý/bán niên có cả cột "quý này" và cột "lũy kế từ đầu năm": LẤY CỘT LŨY KẾ (v = lũy kế năm nay, p = lũy kế năm trước) và ghi so_thang = số tháng lũy kế.',
  CF: 'v = kỳ này (lũy kế từ đầu năm), p = cùng kỳ năm trước. Ghi phuong_phap: "gian_tiep" nếu mục I bắt đầu bằng "Lợi nhuận trước thuế", "truc_tiep" nếu bắt đầu bằng "Tiền thu từ bán hàng".',
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
  '{"meta":{"ten_cong_ty":"","don_vi":"","ngay_ket_thuc":"YYYY-MM-DD","so_thang":12,"thong_tu":"200"|"99"|"","hop_nhat":true,"cot_v":"","cot_p":""},',
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
      'c = mã số (ví dụ "131", "421a", "01"). KHÔNG lấy số ở cột "Thuyết minh" (dạng V.01, 5, 6.2) làm mã số.',
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
      `TSCĐ vô hình đưa vào intangible, hữu hình vào tangible. ${DON_VI_BANG}`,
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
      `meta.nguon: tên thuyết minh đã dùng. ${DON_VI_BANG}`,
    ].join('\n'),
  },
  debt: {
    label: 'Vay: tiền vay / trả nợ trong năm',
    schema: obj({ meta: obj({ don_vi: S }), vay_ngan_han: obj({ dau_nam: S, vay_trong_ky: S, tra_trong_ky: S, cuoi_nam: S }), vay_dai_han: obj({ dau_nam: S, vay_trong_ky: S, tra_trong_ky: S, cuoi_nam: S }) }, ['meta']),
    prompt: [
      'Đọc thuyết minh VAY VÀ NỢ THUÊ TÀI CHÍNH (ngắn hạn và dài hạn), bảng biến động trong NĂM NAY.',
      'vay_trong_ky = cột/dòng "Tăng" (tiền vay mới), tra_trong_ky = "Giảm" (trả nợ), kèm số đầu năm, cuối năm. Lấy dòng TỔNG của từng loại (ngắn hạn, dài hạn).',
      `Phần nợ dài hạn đến hạn trả chuyển sang ngắn hạn KHÔNG tính là vay mới. ${DON_VI_BANG}`,
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
      `Bỏ dòng số dư đầu năm / cuối năm và cột "Cộng". ${BO_COT_TONG}`,
      DON_VI_BANG,
    ].join('\n'),
  },
  goodwill: {
    label: 'Lợi thế thương mại',
    schema: obj({ meta: obj({ don_vi: S }), nguyen_gia: S, phan_bo_luy_ke: S, tang: S, phan_bo_trong_ky: S }, ['meta']),
    prompt: `Đọc thuyết minh LỢI THẾ THƯƠNG MẠI năm nay: nguyen_gia (nguyên giá cuối năm), phan_bo_luy_ke (phân bổ lũy kế cuối năm), tang (tăng trong năm), phan_bo_trong_ky (phân bổ trong năm). ${DON_VI_BANG}`,
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
