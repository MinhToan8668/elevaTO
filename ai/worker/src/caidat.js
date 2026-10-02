// Hằng số của máy chủ. Mọi giá trị ở đây đổi được bằng biến môi trường trong wrangler.toml
// (vars) hoặc bằng cài đặt lưu trong D1 — xem docCaiDat trong db.js.

export const PHIEN_BAN = '2026-10-06';          // đổi mỗi lần sửa, để biết bản nào đang chạy

export const SO = {
  AI_LUOT_FREE: 10,          // lượt AI mỗi ngày: tài khoản thường
  AI_LUOT_HV: 40,            //                   học viên (giảng viên không giới hạn)
  AI_RPM: 12,                // tối đa lượt gọi Gemini mỗi phút cho CẢ hệ thống, tính cho MỖI key
  AI_RPM_MA: 6,              // tối đa lượt mỗi phút cho MỘT tài khoản
  AI_MAX_SCHEMA: 20000,      // độ dài tối đa của responseSchema (JSON)
  AI_MAX_BODY: 45 * 1024 * 1024,   // yêu cầu lớn hơn thì từ chối (Workers nhận tối đa 100MB)
  AI_MAX_OUT: 32768,         // trần maxOutputTokens
  AI_MAX_TEXT: 200000,       // tổng số ký tự chữ trong một yêu cầu
  AI_MAX_SYS: 20000,         // độ dài chỉ dẫn hệ thống
  AI_MAX_THINK: 8192,        // trần thinkingBudget
  AI_MODEL_TTL: 6 * 3600,    // nhớ danh sách model 6 giờ
  AI_SO_MODEL: 5,            // chuỗi dự phòng: tối đa bấy nhiêu model (mỗi model một hạn mức riêng)
  AI_THU_TOI_DA: 8,          // mỗi lượt của người dùng thử Gemini tối đa bấy nhiêu lần
  AI_NGHI_QUA_TAI: 300,      // model báo quá tải (503) thì nghỉ bấy nhiêu giây
  AI_QUA_TAI_LAN: 2,         // phải lỗi bấy nhiêu lần mới cho model nghỉ
  PHIEN_NGAY: 30,            // phiên đăng nhập sống bao nhiêu ngày
  PHIEN_TOI_DA: 3,           // mỗi tài khoản đăng nhập tối đa mấy máy cùng lúc
  DN_SAI_TOI_DA: 5,          // đăng nhập sai bấy nhiêu lần trong 10 phút thì khoá tạm
  DK_MOI_GIO: 30,            // chặn bot: tối đa số tài khoản mới mỗi giờ cho cả hệ thống
  MK_TOI_THIEU: 8,
  MA_DL_SO: 8,               // mã đặt lại mật khẩu dài bao nhiêu chữ số
  MA_DL_PHUT: 15,            // mã sống bao nhiêu phút
  MA_DL_SAI: 5,              // nhập sai bấy nhiêu lần thì nghỉ MA_DL_NGHI giây (KHÔNG huỷ mã:
  MA_DL_NGHI: 60,            //   huỷ mã là người lạ đoán bừa vài lần đã chặn được chủ tài khoản)
  MA_DL_MOI_GIO: 3,          // mỗi email xin tối đa bấy nhiêu mã mỗi giờ
  MA_DL_HE_THONG: 40,        // cả hệ thống gửi tối đa bấy nhiêu THƯ mỗi giờ
  // Số vòng PBKDF2. Gói Workers Free chỉ cho 10ms CPU mỗi yêu cầu nên để vừa phải;
  // lên gói Paid thì đặt BAM_VONG = 200000 trong wrangler.toml (bản băm tự ghi kèm số vòng
  // nên đổi lúc nào cũng được, người đang có tài khoản vẫn đăng nhập bình thường).
  BAM_VONG: 15000,
};

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const MIME_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
export const GEN_KEYS = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'responseSchema',
  'responseJsonSchema', 'candidateCount', 'stopSequences', 'seed', 'thinkingConfig'];

/** Số lấy từ biến môi trường nếu có đặt, không thì lấy mặc định ở trên. */
export const so = (env, ten) => {
  const v = Number(env && env[ten]);
  return Number.isFinite(v) && v > 0 ? v : SO[ten];
};
