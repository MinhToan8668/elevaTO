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
}, ['ten', 'nguyen_gia_cuoi', 'hao_mon_cuoi']);

export const NOTE_TASKS = {
  fixedAssets: {
    label: 'Tài sản cố định theo nhóm (hữu hình, vô hình)',
    schema: obj({ meta: obj({ don_vi: S }), tangible: arr(FA_ROW), intangible: arr(FA_ROW) }, ['meta', 'tangible']),
    prompt: [
      'Đọc thuyết minh TÀI SẢN CỐ ĐỊNH HỮU HÌNH và TÀI SẢN CỐ ĐỊNH VÔ HÌNH (bảng biến động: cột là các nhóm tài sản, dòng là nguyên giá / hao mòn).',
      'Mỗi nhóm tài sản (mỗi CỘT của bảng, KHÔNG lấy cột "Tổng cộng") là một phần tử, lấy số của NĂM NAY (bảng năm nay, không phải bảng năm trước).',
      'nhom: nhà cửa/vật kiến trúc → buildings; máy móc thiết bị → machinery; phương tiện vận tải/truyền dẫn → transport; thiết bị dụng cụ quản lý → office; còn lại (hữu hình) → other; quyền sử dụng đất → land; phần mềm và vô hình khác → software.',
      'nguyen_gia_dau/cuoi = số dư đầu/cuối năm của nguyên giá; mua = mua trong năm; xdcb = đầu tư XDCB hoàn thành; tang_khac = tăng khác; thanh_ly, giam_khac = giảm;',
      'hao_mon_dau/cuoi = số dư đầu/cuối năm của giá trị hao mòn lũy kế; khau_hao = khấu hao (trích) trong năm.',
      'TSCĐ vô hình đưa vào intangible, hữu hình vào tangible. meta.don_vi: đơn vị tính của bảng.',
    ].join('\n'),
  },
  segments: {
    label: 'Doanh thu & lợi nhuận gộp theo mảng / bộ phận',
    schema: obj({ meta: obj({ don_vi: S, nguon: S }), segments: arr(obj({ ten: S, doanh_thu: S, gia_von: S, loi_nhuan_gop: S }, ['ten', 'doanh_thu'])) }, ['meta', 'segments']),
    prompt: [
      'Đọc thuyết minh BÁO CÁO BỘ PHẬN theo lĩnh vực kinh doanh (hoặc thuyết minh doanh thu / giá vốn chi tiết theo sản phẩm, dịch vụ nếu không có báo cáo bộ phận).',
      'Mỗi bộ phận / nhóm sản phẩm là một phần tử, số của NĂM NAY: doanh thu thuần, giá vốn, lợi nhuận gộp (dòng nào không có thì "").',
      'KHÔNG lấy cột/dòng "Tổng cộng", "Loại trừ", "Điều chỉnh". meta.nguon: tên thuyết minh đã dùng. meta.don_vi: đơn vị tính.',
    ].join('\n'),
  },
  debt: {
    label: 'Vay: tiền vay / trả nợ trong năm',
    schema: obj({ meta: obj({ don_vi: S }), vay_ngan_han: obj({ dau_nam: S, vay_trong_ky: S, tra_trong_ky: S, cuoi_nam: S }), vay_dai_han: obj({ dau_nam: S, vay_trong_ky: S, tra_trong_ky: S, cuoi_nam: S }) }, ['meta']),
    prompt: [
      'Đọc thuyết minh VAY VÀ NỢ THUÊ TÀI CHÍNH (ngắn hạn và dài hạn), bảng biến động trong NĂM NAY.',
      'vay_trong_ky = cột/dòng "Tăng" (tiền vay mới), tra_trong_ky = "Giảm" (trả nợ), kèm số đầu năm, cuối năm. Lấy dòng TỔNG của từng loại (ngắn hạn, dài hạn).',
      'Phần nợ dài hạn đến hạn trả chuyển sang ngắn hạn KHÔNG tính là vay mới. meta.don_vi: đơn vị tính.',
    ].join('\n'),
  },
  equity: {
    label: 'Biến động vốn chủ sở hữu',
    schema: obj({
      meta: obj({ don_vi: S }),
      von_gop_phat_hanh: S, co_phieu_thuong: S, esop: S, co_tuc_co_phieu: S, von_gop_giam: S,
      thang_du_tang: S, thang_du_giam: S, co_phieu_quy_mua: S, co_phieu_quy_ban: S,
      quy_dtpt_tang: S, quy_dtpt_giam: S, co_tuc_tien: S, lncpp_tang_khac: S, lncpp_giam_khac: S, lickks_thay_doi: S,
    }, ['meta']),
    prompt: [
      'Đọc BẢNG ĐỐI CHIẾU BIẾN ĐỘNG CỦA VỐN CHỦ SỞ HỮU, chỉ các dòng phát sinh trong NĂM NAY.',
      'Vốn góp: von_gop_phat_hanh (phát hành thường/chào bán), co_phieu_thuong (thưởng), esop, co_tuc_co_phieu (chia cổ tức bằng cổ phiếu), von_gop_giam.',
      'thang_du_tang/giam (thặng dư vốn cổ phần); co_phieu_quy_mua / co_phieu_quy_ban; quy_dtpt_tang/giam (quỹ đầu tư phát triển).',
      'Lợi nhuận chưa phân phối: co_tuc_tien (chia cổ tức bằng tiền), lncpp_tang_khac, lncpp_giam_khac (trích quỹ, thù lao HĐQT, giảm khác) — KHÔNG gồm lợi nhuận trong năm.',
      'lickks_thay_doi: thay đổi lợi ích cổ đông không kiểm soát do mua/bán công ty con (nếu có). meta.don_vi: đơn vị tính.',
    ].join('\n'),
  },
  goodwill: {
    label: 'Lợi thế thương mại',
    schema: obj({ meta: obj({ don_vi: S }), nguyen_gia: S, phan_bo_luy_ke: S, tang: S, phan_bo_trong_ky: S }, ['meta']),
    prompt: 'Đọc thuyết minh LỢI THẾ THƯƠNG MẠI năm nay: nguyen_gia (nguyên giá cuối năm), phan_bo_luy_ke (phân bổ lũy kế cuối năm), tang (tăng trong năm), phan_bo_trong_ky (phân bổ trong năm). meta.don_vi: đơn vị tính.',
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
    ].join('\n'),
  };
}
