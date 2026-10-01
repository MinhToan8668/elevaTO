/**
 * elevaTO AI — máy chủ tài khoản + gọi Gemini cho công cụ AI BCTC
 * ============================================================
 * Dự án Apps Script RIÊNG (không dính landing page, không dính công cụ upload).
 * Người dùng đăng ký / đăng nhập bằng email + mật khẩu (giống Viral Studio của TMXK);
 * tài khoản nằm trong Google Sheet "elevaTO AI — Tài khoản" do hàm caiDat tạo.
 * Key Gemini cất trong Script Properties, không bao giờ ra tới trình duyệt.
 *
 * Quản trị trên Sheet (tab TaiKhoan) hoặc qua bot Telegram (gõ /help cho bot):
 *   vaitro    : free (tài khoản thường) | hv (học viên) | gv (giảng viên — không giới hạn lượt)
 *               Học viên và giảng viên mới điền được model elevaTO trên trang.
 *   trangthai : active | cho (chờ duyệt) | off (khoá)
 *   luot_ngay : số lượt AI mỗi ngày của riêng người đó; để trống = theo vai trò (AI_LUOT_FREE / AI_LUOT_HV)
 *
 * Giới hạn: UrlFetchApp chờ tối đa ~60 giây mỗi lượt gọi → trang tự chia việc nhỏ;
 * hết giờ thì máy chủ trả code 'timeout' để trang chia nhỏ hơn nữa.
 * Cài đặt: xem ai/README.md
 * ============================================================
 */

// ═════════════════════════════════════════════════════════════
//  DÁN KEY GEMINI VÀO ĐÂY RỒI CHẠY HÀM  caiDat
//  Nhiều key: cách nhau bằng dấu phẩy — hết hạn mức key này máy chủ tự chuyển sang key khác.
//  Chạy xong có thể xoá key khỏi dòng này (key đã cất trong Script Properties).
// ═════════════════════════════════════════════════════════════
var GEMINI_KEY_MOI = 'DAN_KEY_GEMINI';

//  BOT TELEGRAM (báo tài khoản mới, duyệt học viên / giảng viên, tra cứu). Chạy caiDat là bot tự kết nối.
var TG_TOKEN_MOI = 'DAN_TOKEN_BOT';        // token của @BotFather
var TG_CHAT_MOI  = 'DAN_CHAT_ID';          // chat ID của bạn (chỉ tin riêng của người này được ra lệnh); nhiều người: cách nhau dấu phẩy
// ═════════════════════════════════════════════════════════════

var AI_LUOT_FREE    = 10;                  // lượt AI mỗi ngày: tài khoản thường (Script Property AI_LUOT_FREE đè lên)
var AI_LUOT_HV      = 40;                  //                   học viên (AI_LUOT_HV); giảng viên không giới hạn
var AI_RPM          = 12;                  // tối đa lượt gọi Gemini mỗi phút cho CẢ hệ thống, tính cho MỖI key
var AI_RPM_MA       = 6;                   // tối đa lượt mỗi phút cho MỘT tài khoản
var AI_MAX_SCHEMA   = 20000;               // độ dài tối đa của responseSchema (JSON)
var AI_MAX_BODY     = 45 * 1024 * 1024;    // yêu cầu lớn hơn thì từ chối (Apps Script nhận tối đa ~50MB)
var AI_MAX_OUT      = 32768;               // trần maxOutputTokens
var AI_MAX_TEXT     = 200000;              // tổng số ký tự chữ trong một yêu cầu
var AI_MAX_SYS      = 20000;               // độ dài chỉ dẫn hệ thống
var AI_MAX_THINK    = 8192;                // trần thinkingBudget
var AI_MODEL_TTL    = 6 * 3600;            // nhớ danh sách model 6 giờ
var AI_SO_MODEL     = 5;                   // chuỗi dự phòng: tối đa bấy nhiêu model (mỗi model có hạn mức miễn phí riêng)
var AI_THU_TOI_DA   = 8;                   // mỗi lượt của người dùng thử Gemini tối đa bấy nhiêu lần (đổi key / đổi model).
                                           // Đo 01/10/2026: các bản flash mới hay trả 429/503 ngay (0,1–7 giây),
                                           // phải đủ lượt thử để chạm tới model cuối chuỗi — bản lite đọc được và nhanh.
var AI_NGHI_QUA_TAI = 300;                 // model báo quá tải (503) thì nghỉ bấy nhiêu giây
var AI_QUA_TAI_LAN  = 2;                   // phải lỗi bấy nhiêu lần mới cho model nghỉ (một người dùng không làm cả hệ thống ngừng)
var PHIEN_NGAY      = 30;                  // phiên đăng nhập sống bao nhiêu ngày
var PHIEN_TOI_DA    = 3;                   // mỗi tài khoản đăng nhập tối đa mấy máy cùng lúc
var DN_SAI_TOI_DA   = 5;                   // đăng nhập sai bấy nhiêu lần trong 10 phút thì khoá tạm
var DK_MOI_GIO      = 30;                  // chặn bot: tối đa số tài khoản mới mỗi giờ cho cả hệ thống
var MK_TOI_THIEU    = 8;
var BAM_VONG        = 1500;                // số vòng băm mật khẩu
var GEMINI_API      = 'https://generativelanguage.googleapis.com/v1beta/models';
var PHIEN_BAN       = '2026-10-01';       // đổi mỗi lần sửa file này, để biết bản nào đang chạy
var MIME_OK         = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
var GEN_KEYS        = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'responseSchema',
                       'responseJsonSchema', 'thinkingConfig', 'seed'];
var TK_SHEET        = 'TaiKhoan';
var TK_COT          = ['ma', 'email', 'ten', 'sdt', 'salt', 'hash', 'vaitro', 'trangthai', 'luot_ngay',
                       'phien', 'tao_luc', 'dangnhap_cuoi', 'ghi_chu',
                       // Khai báo lúc đăng ký — chỉ để tham khảo. Vai trò thật do quản trị đặt bằng bot.
                       'tuoi', 'nguyen_vong', 'muc_dich'];
var NGUYEN_VONG     = { hv: 'Học viên', gv: 'Giảng viên', free: 'Người dùng' };

function props() { return PropertiesService.getScriptProperties(); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function loi(code, error, extra) { var o = { ok: false, code: code, error: error }; for (var k in extra || {}) o[k] = extra[k]; return o; }
function ok(data) { return { ok: true, data: data }; }

// Mở link /exec trên trình duyệt sẽ thấy phiên bản đang chạy — dùng để biết đã Triển khai bản mới chưa.
function doGet() { return json({ ok: true, service: 'elevaTO AI', ban: PHIEN_BAN }); }

/**
 * { action, … } → { ok:true, data } | { ok:false, code, error, retryAfter? }
 *   dangky {ten,email,sdt,mk,tuoi,nguyen_vong,muc_dich} · dangnhap {email,mk} · toi {token} · dangxuat {token} · generate {token, contents…}
 * code: auth (cần đăng nhập lại) · sai · khoa_tam · cho_duyet · bi_khoa · thieu · email_sai · sdt_sai · mk_ngan
 *       · da_ton_tai · quota · busy · timeout · blocked · bad · upstream · setup
 * Trang gửi Content-Type: text/plain để tránh CORS preflight.
 */
function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (raw.length > AI_MAX_BODY) return json(loi('bad', 'Yêu cầu quá lớn — chọn ít trang hơn'));
  var b;
  try { b = JSON.parse(raw); } catch (err) { return json(loi('bad', 'Yêu cầu không đọc được')); }
  if (!b || typeof b !== 'object') return json(loi('bad', 'Yêu cầu không đọc được'));
  try {
    var a = String(b.action || '');
    if (a === 'dangky') return json(dangKy(b));
    if (a === 'dangnhap') return json(dangNhap(b));
    if (a === 'toi' || a === 'dangxuat' || a === 'generate') {
      var tk = tkTuToken(b.token);
      if (!tk) return json(loi('auth', 'Phiên đăng nhập đã hết — đăng nhập lại'));
      if (a === 'toi') return json(ok({ me: hoSo(tk) }));
      if (a === 'dangxuat') { boPhien(tk, b.token); return json(ok({})); }
      return json(goiGemini(tk, b));
    }
    return json(loi('bad', 'Không rõ yêu cầu'));
  } catch (err) {
    console.error('doPost: ' + err + (err && err.stack ? '\n' + err.stack : ''));
    return json(loi('upstream', 'Máy chủ gặp lỗi, thử lại sau ít phút'));
  }
}

// ─── Bảng tài khoản (Google Sheet) ──────────────────────────

function bangTK() {
  var id = props().getProperty('AI_SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('elevaTO AI — Tài khoản');
    props().setProperty('AI_SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName(TK_SHEET);
  if (!sh) {
    var dau = ss.getSheets()[0];
    sh = dau && dau.getLastRow() === 0 ? dau : ss.insertSheet(TK_SHEET);
    sh.setName(TK_SHEET);
  }
  if (sh.getLastRow() === 0) { sh.appendRow(TK_COT); sh.setFrozenRows(1); }
  else themCotThieu(sh);
  return sh;
}

/** Bảng lập từ bản cũ: nối thêm các cột mới vào tiêu đề, dữ liệu đang có giữ nguyên. */
function themCotThieu(sh) {
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  var thieu = TK_COT.filter(function (c) { return head.indexOf(c) < 0; });
  if (!thieu.length) return;
  sh.getRange(1, head.length + 1, 1, thieu.length).setValues([thieu]);
}

/** Mọi tài khoản: [{ _r: số dòng, ma, email, … }] */
function docTK(sh) {
  var v = (sh || bangTK()).getDataRange().getValues();
  var head = v[0] || TK_COT, ds = [];
  for (var i = 1; i < v.length; i++) {
    var o = { _r: i + 1 };
    for (var j = 0; j < head.length; j++) o[String(head[j])] = v[i][j];
    if (o.ma) ds.push(o);
  }
  return ds;
}

function ghiTK(tk, sua) {
  var sh = bangTK(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var k in sua) {
    var c = head.indexOf(k);
    if (c >= 0) { sh.getRange(tk._r, c + 1).setValue(sua[k]); tk[k] = sua[k]; }
  }
}

// Ô bắt đầu bằng = + - @ bị Google Sheets hiểu là công thức → thêm dấu ' để luôn là chữ.
function oChu(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

function tkTheoEmail(email) { var k = khoaEmail(email), r = null; docTK().forEach(function (x) { if (!r && khoaEmail(x.email) === k) r = x; }); return r; }
function tkTheoMa(ma) { var r = null; docTK().forEach(function (x) { if (!r && String(x.ma).toUpperCase() === ma) r = x; }); return r; }

function maMoi(ds) {
  var B = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', dung = {};
  ds.forEach(function (x) { dung[String(x.ma).toUpperCase()] = 1; });
  for (;;) {
    var m = 'E';
    for (var i = 0; i < 5; i++) m += B.charAt(Math.floor(Math.random() * B.length));
    if (!dung[m]) return m;
  }
}

// ─── Mật khẩu & phiên ───────────────────────────────────────

function tieu() {
  var p = props().getProperty('AI_PEPPER');
  if (!p) { p = ngauNhien() + ngauNhien(); props().setProperty('AI_PEPPER', p); }
  return p;
}
function ngauNhien() { return Utilities.getUuid().replace(/-/g, ''); }
function hex(bytes) { return bytes.map(function (v) { return ('0' + (v & 0xFF).toString(16)).slice(-2); }).join(''); }
function bamMK(mk, salt) {
  var x = salt + '|' + mk + '|' + tieu();
  for (var i = 0; i < BAM_VONG; i++) x = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, x, Utilities.Charset.UTF_8));
  return x;
}
// Token là 64 ký tự ngẫu nhiên nên một vòng băm là đủ.
function bamNhanh(x) { return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(x) + '|' + tieu(), Utilities.Charset.UTF_8)); }
function bangNhau(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var kh = 0;
  for (var i = 0; i < a.length; i++) kh |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return kh === 0;
}

function dsPhien(tk) {
  try { var p = JSON.parse(tk.phien || '[]'); return Array.isArray(p) ? p : []; } catch (e) { return []; }
}
// Đọc lại dòng rồi mới ghi, trong khoá: hai máy đăng nhập cùng lúc không làm mất phiên của nhau.
function suaPhien(tk, bien) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var moi = tkTheoMa(String(tk.ma).toUpperCase()) || tk;
    var sua = bien(dsPhien(moi).filter(function (p) { return p && p.han > Date.now(); }));
    ghiTK(moi, sua);
  } finally { lock.releaseLock(); }
}
function capPhien(tk) {
  var token = tk.ma + '.' + ngauNhien() + ngauNhien();
  suaPhien(tk, function (con) {
    con.push({ h: bamNhanh(token), han: Date.now() + PHIEN_NGAY * 86400000 });
    return { phien: JSON.stringify(con.slice(-PHIEN_TOI_DA)), dangnhap_cuoi: new Date().toISOString() };
  });
  return token;
}
function tkTuToken(token) {
  token = typeof token === 'string' ? token : '';
  var m = /^(E[A-Z0-9]{5})\.[a-f0-9]{64}$/.exec(token);
  if (!m) return null;
  var tk = tkTheoMa(m[1]);
  if (!tk || tk.trangthai !== 'active') return null;
  var h = bamNhanh(token);
  return dsPhien(tk).some(function (p) { return p && p.han > Date.now() && bangNhau(p.h, h); }) ? tk : null;
}
function boPhien(tk, token) {
  var h = bamNhanh(token);
  suaPhien(tk, function (con) { return { phien: JSON.stringify(con.filter(function (p) { return !bangNhau(p.h, h); })) }; });
}

/** 'gv' | 'hv' | 'free' — vai trò 'admin' của bản cũ tính là giảng viên. */
function vaiTro(tk) {
  var v = String(tk.vaitro || '').trim().toLowerCase();
  if (v === 'gv' || v === 'admin') return 'gv';
  return v === 'hv' ? 'hv' : 'free';
}
function hoSo(tk) {
  var gv = laGV(tk);
  return { ten: String(tk.ten), email: String(tk.email), vaitro: vaiTro(tk), luot: { dung: daDung(tk), han: gv ? 0 : hanNgay(tk) } };
}

// ─── Đăng ký / đăng nhập ────────────────────────────────────

function chuanEmail(e) { return String(e || '').trim().toLowerCase(); }
// Chỉ nhận email "thường": bắt đầu bằng chữ/số — chặn luôn chuỗi kiểu =importdata(...) thành công thức trên Sheet.
function emailHopLe(e) { return e.length <= 120 && /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e); }
/** Khoá so trùng: Gmail bỏ dấu chấm và +nhãn (an.nguyen+2@gmail.com = annguyen@gmail.com). */
function khoaEmail(e) {
  e = chuanEmail(e);
  var at = e.lastIndexOf('@'); if (at < 1) return e;
  var ten = e.slice(0, at), mien = e.slice(at + 1);
  if (mien === 'gmail.com' || mien === 'googlemail.com') return ten.split('+')[0].replace(/\./g, '') + '@gmail.com';
  return e;
}
function chuanTen(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 60).split(' ')
    .map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' ');
}

function dangKy(b) {
  if (b.website) return loi('thieu', 'Thiếu thông tin');                      // ô bẫy bot
  var ten = chuanTen(b.ten), email = chuanEmail(b.email), mk = String(b.mk || '');
  var sdt = String(b.sdt || '').replace(/\D/g, '');
  var tuoi = Math.round(Number(b.tuoi));
  var nv = String(b.nguyen_vong || '').trim().toLowerCase();
  var mucDich = String(b.muc_dich || '').trim().slice(0, 300);
  if (!ten || !email || !mk || !sdt) return loi('thieu', 'Điền đủ họ tên, email, số điện thoại và mật khẩu');
  if (!emailHopLe(email)) return loi('email_sai', 'Email chưa đúng');
  if (sdt.length < 9 || sdt.length > 12) return loi('sdt_sai', 'Số điện thoại chưa đúng');
  if (mk.length < MK_TOI_THIEU || mk.length > 200) return loi('mk_ngan', 'Mật khẩu cần ít nhất ' + MK_TOI_THIEU + ' ký tự');
  if (!(tuoi >= 12 && tuoi <= 100)) return loi('tuoi_sai', 'Tuổi chưa đúng');
  if (!NGUYEN_VONG[nv]) return loi('nv_sai', 'Chọn bạn là học viên, giảng viên hay người dùng');
  if (!mucDich) return loi('thieu', 'Cho biết bạn định dùng công cụ để làm gì');

  var salt = ngauNhien(), hash = bamMK(mk, salt);                        // băm (chậm) làm ngoài khoá
  var cache = CacheService.getScriptCache(), kGio = 'dk_' + Math.floor(Date.now() / 3600000);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var tk;
  try {
    // Đếm cả lần dò email đã có → không dò danh sách email được thoải mái.
    var soDK = Number(cache.get(kGio) || 0);
    if (soDK >= DK_MOI_GIO) return loi('busy', 'Đang có quá nhiều đăng ký, thử lại sau ít phút', { retryAfter: 300 });
    cache.put(kGio, String(soDK + 1), 3700);
    var sh = bangTK(), ds = docTK(sh), k = khoaEmail(email);
    if (ds.some(function (x) { return khoaEmail(x.email) === k; })) return loi('da_ton_tai', 'Email này đã có tài khoản — đăng nhập nhé');
    var duyet = /^(1|true|co)$/i.test(String(props().getProperty('AI_CAN_DUYET') || ''));
    // Ai cũng vào ở mức thường; học viên / giảng viên do quản trị xếp bằng bot Telegram.
    var gt = { ma: maMoi(ds), email: oChu(email), ten: oChu(ten), sdt: "'" + sdt, salt: salt, hash: hash,
      vaitro: 'free', trangthai: duyet ? 'cho' : 'active', luot_ngay: '', phien: '[]',
      tao_luc: new Date().toISOString(), dangnhap_cuoi: '', ghi_chu: '',
      tuoi: tuoi, nguyen_vong: nv, muc_dich: oChu(mucDich) };
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    sh.appendRow(head.map(function (c) { return gt.hasOwnProperty(c) ? gt[c] : ''; }));
    tk = tkTheoEmail(email);
  } finally { lock.releaseLock(); }
  baoTaiKhoanMoi(tk, sdt);
  if (tk.trangthai !== 'active') return ok({ cho: true });
  return ok({ token: capPhien(tk), me: hoSo(tk) });
}

function dangNhap(b) {
  var email = chuanEmail(b.email), mk = String(b.mk || '');
  if (!email || !mk) return loi('thieu', 'Nhập email và mật khẩu');
  var cache = CacheService.getScriptCache();
  var khoa = 'dn_' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, khoaEmail(email), Utilities.Charset.UTF_8));
  // Giữ trước một lượt thử (trong khoá) rồi mới kiểm mật khẩu → gửi song song cũng không vượt số lần cho phép.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sai = Number(cache.get(khoa) || 0);
    if (sai >= DN_SAI_TOI_DA) return loi('khoa_tam', 'Sai mật khẩu nhiều lần — thử lại sau 10 phút');
    cache.put(khoa, String(sai + 1), 600);
  } finally { lock.releaseLock(); }
  var tk = tkTheoEmail(email);
  // Không có tài khoản vẫn băm như thường để thời gian trả lời không lộ email nào đã đăng ký.
  var dung = bangNhau(bamMK(mk, tk ? String(tk.salt) : 'khong-co'), tk ? String(tk.hash) : '-');
  if (!tk || !dung) return loi('sai', 'Email hoặc mật khẩu chưa đúng');
  cache.remove(khoa);
  if (tk.trangthai === 'cho') return loi('cho_duyet', 'Tài khoản đang chờ elevaTO duyệt');
  if (tk.trangthai !== 'active') return loi('bi_khoa', 'Tài khoản đã bị khoá — liên hệ elevaTO');
  return ok({ token: capPhien(tk), me: hoSo(tk) });
}

// ─── Hạn mức ────────────────────────────────────────────────

function homNay() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
function khoaLuot(tk) { return 'Q_' + tk.ma + '_' + homNay(); }
function daDung(tk) { return Number(props().getProperty(khoaLuot(tk)) || 0); }
function hanNgay(tk) {
  var rieng = Number(tk.luot_ngay);
  if (tk.luot_ngay !== '' && tk.luot_ngay != null && rieng > 0) return rieng;
  var hv = vaiTro(tk) === 'hv', md = Number(props().getProperty(hv ? 'AI_LUOT_HV' : 'AI_LUOT_FREE'));
  return md > 0 ? md : (hv ? AI_LUOT_HV : AI_LUOT_FREE);
}
function laGV(tk) { return vaiTro(tk) === 'gv'; }
function hetLuot(tk) { return loi('quota', 'Hôm nay đã dùng hết ' + hanNgay(tk) + ' lượt AI — mai dùng tiếp, hoặc liên hệ elevaTO xin thêm'); }

/** Giữ 1 lượt TRƯỚC khi gọi Gemini (trong khoá, nên gọi song song không vượt hạn mức). Trả khoá bộ đếm để trả lại đúng ngày đó. */
function giuLuot(tk) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var k = khoaLuot(tk), used = Number(props().getProperty(k) || 0);
    if (!laGV(tk) && used >= hanNgay(tk)) return '';
    props().setProperty(k, String(used + 1));
    var all = props().getProperties();                                       // dọn bộ đếm các ngày trước
    for (var p in all) if (p.indexOf('Q_' + tk.ma + '_') === 0 && p !== k) props().deleteProperty(p);
    return k;
  } finally { lock.releaseLock(); }
}
/** Trả lại lượt vừa giữ. `k` là khoá lúc giữ: lượt gọi vắt qua nửa đêm vẫn trả đúng bộ đếm của hôm qua. */
function traLuot(k) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var used = Number(props().getProperty(k) || 0);
    if (used > 0) props().setProperty(k, String(used - 1));
  } finally { lock.releaseLock(); }
}

/** Nhịp gọi trong phút hiện tại, cho cả hệ thống và từng tài khoản. Trả số giây phải chờ (0 = được gọi). */
function giuNhip(tk) {
  var cache = CacheService.getScriptCache(), lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var now = Date.now(), phut = Math.floor(now / 60000);
    var cho = Math.max(1, 60 - Math.floor((now % 60000) / 1000));
    var kMa = 'rpm_' + tk.ma + '_' + phut, nMa = Number(cache.get(kMa) || 0);
    if (!laGV(tk) && nMa >= AI_RPM_MA) return cho;
    var k = 'rpm_' + phut, n = Number(cache.get(k) || 0);
    if (n >= AI_RPM * Math.max(1, dsKey().length)) return cho;
    cache.put(k, String(n + 1), 120);
    cache.put(kMa, String(nMa + 1), 120);
    return 0;
  } finally { lock.releaseLock(); }
}

// ─── Key Gemini (nhiều key, key hết hạn mức thì nghỉ) ───────

function dsKey() {
  var s = [props().getProperty('GEMINI_KEYS') || '', props().getProperty('GEMINI_KEY') || ''].join('\n');
  var out = [];
  s.split(/[\s,;]+/).forEach(function (k) { if (k && out.indexOf(k) < 0) out.push(k); });
  return out;
}
// Nghỉ: key hỏng thì nghỉ hẳn (mọi model); hết hạn mức (429) thì chỉ nghỉ ở model đó — mỗi model có hạn mức riêng.
function khoaNghi(k, model) { return 'nghi_' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, k, Utilities.Charset.UTF_8)) + (model ? '|' + model : ''); }
function giayNghi(giay) { return Math.max(5, Math.min(giay, 21600)); }
function keyNghi(k, giay, model) { CacheService.getScriptCache().put(khoaNghi(k, model), '1', giayNghi(giay)); }
function keyDangNghi(k, model) { var c = CacheService.getScriptCache(); return !!c.get(khoaNghi(k)) || (!!model && !!c.get(khoaNghi(k, model))); }
function keyRanh(model) { return dsKey().filter(function (k) { return !keyDangNghi(k, model); }); }
/** Đếm lỗi quá tải; đủ AI_QUA_TAI_LAN lần trong 2 phút mới cho model nghỉ. */
function modelLoi(model) {
  var c = CacheService.getScriptCache(), k = 'qtn_' + model, n = Number(c.get(k) || 0) + 1;
  if (n >= AI_QUA_TAI_LAN) { c.remove(k); modelNghi(model, AI_NGHI_QUA_TAI); return; }
  c.put(k, String(n), 120);
}
function modelNghi(model, giay) { CacheService.getScriptCache().put('qt_' + model, '1', giayNghi(giay)); }
function modelDangNghi(model) { return !!CacheService.getScriptCache().get('qt_' + model); }

/** Model sinh văn bản dùng được (bỏ TTS, ảnh, âm thanh, embedding…). */
function danhSachModel() {
  var cache = CacheService.getScriptCache(), c = cache.get('ai_models');
  if (c) return JSON.parse(c);
  var key = keyRanh()[0];
  if (!key) return [];
  var res = UrlFetchApp.fetch(GEMINI_API + '?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { cache.put('ai_models', '[]', 30); return []; }   // hỏng thì nhớ 30 giây, đỡ hỏi dồn
  var list = (JSON.parse(res.getContentText()).models || []).filter(function (m) {
    var id = String(m.name || '').replace(/^models\//, '');
    return /^gemini-[\w.-]+$/.test(id) && !/(tts|embed|image|audio|live|veo|imagen|robotics|computer-use|transcribe|omni|customtools)/.test(id) &&
      (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
  }).map(function (m) { return String(m.name).replace(/^models\//, ''); });
  cache.put('ai_models', JSON.stringify(list), AI_MODEL_TTL);
  return list;
}

/**
 * Chuỗi model dùng lần lượt: AI_MODEL (nếu có), các bản flash chính thức mới → cũ, cuối cùng bản flash-lite mới nhất.
 * Model này quá tải / hết hạn mức thì máy chủ chuyển ngay model sau — Gemini miễn phí tính hạn mức riêng cho từng model.
 */
function dsModelDung() {
  var list = danhSachModel(), rieng = String(props().getProperty('AI_MODEL') || '');
  var ver = function (id) { var m = /^gemini-(\d+(?:\.\d+)?)/.exec(id); return m ? Number(m[1]) : 0; };
  var moiTruoc = function (a, b) { return ver(b) - ver(a); };
  var flash = list.filter(function (id) { return /^gemini-\d+(\.\d+)?-flash$/.test(id); }).sort(moiTruoc);
  var lite = list.filter(function (id) { return /^gemini-\d+(\.\d+)?-flash-lite$/.test(id); }).sort(moiTruoc);
  var chuoi = [];
  if (rieng && list.indexOf(rieng) >= 0) chuoi.push(rieng);
  flash.forEach(function (id) { if (chuoi.indexOf(id) < 0) chuoi.push(id); });
  chuoi = chuoi.slice(0, AI_SO_MODEL - (lite.length ? 1 : 0));
  if (lite.length && chuoi.indexOf(lite[0]) < 0) chuoi.push(lite[0]);
  if (!chuoi.length) chuoi = list.filter(function (id) { return /flash/.test(id); }).slice(0, AI_SO_MODEL);
  return chuoi;
}
function chonModel() { return dsModelDung()[0] || ''; }

// ─── Gọi Gemini ─────────────────────────────────────────────

function goiGemini(tk, b) {
  if (!dsKey().length) return loi('setup', 'Máy chủ chưa cài key Gemini (chạy hàm caiDat)');
  var body = sachYeuCau(b);
  if (!body) return loi('bad', 'Yêu cầu sai dạng hoặc quá dài');
  if (!laGV(tk) && daDung(tk) >= hanNgay(tk)) return hetLuot(tk);
  var models = dsModelDung();
  if (!models.length) return loi('busy', 'Chưa lấy được danh sách model Gemini — thử lại sau ít phút', { retryAfter: 30 });

  var cho = giuNhip(tk);
  if (cho) return loi('busy', 'Hệ thống đang đông, chờ ' + cho + ' giây', { retryAfter: cho });
  var khoa = giuLuot(tk);
  if (!khoa) return hetLuot(tk);
  var r = goiLanLuot(models, body) || {};
  if (r.traLai) traLuot(khoa);                         // chỉ trả lượt khi Gemini chưa làm gì
  // Không bao giờ trả { ok: true } rỗng: trang đọc thiếu trường sẽ hỏng.
  return r.kq || loi('upstream', 'Máy chủ không nhận được kết quả từ Gemini, thử lại sau ít phút');
}

/**
 * Thử lần lượt từng model trong chuỗi, mỗi model thử các key đang rảnh:
 * 429 → cặp key + model đó nghỉ, thử key kế; 401/403 → key nghỉ hẳn; 503/500 → model nghỉ vài phút, sang model sau.
 * Tối đa AI_THU_TOI_DA lần gọi cho một lượt của người dùng.
 */
function goiLanLuot(models, body) {
  var cuoi = null, dem = 0;
  var ranh = models.filter(function (m) { return !modelDangNghi(m); });
  if (!ranh.length) ranh = models.slice(0, 1);                   // mọi model đang nghỉ: vẫn thử model đầu một lần
  for (var i = 0; i < ranh.length; i++) {
    var keys = keyRanh(ranh[i]);
    for (var j = 0; j < keys.length; j++) {
      if (dem++ >= AI_THU_TOI_DA) return hetCach(cuoi);
      var r = goiMotKey(ranh[i], body, keys[j]);
      if (r.nghi) { keyNghi(keys[j], r.nghi, r.moiModel ? null : ranh[i]); cuoi = r; continue; }
      if (r.boModel) { if (r.quaTai) modelLoi(ranh[i]); cuoi = r; break; }   // model này không xong: sang model sau
      return r;
    }
  }
  return hetCach(cuoi);
}
function hetCach(cuoi) {
  return { kq: loi('busy', 'Gemini đang quá tải hoặc hết hạn mức phút này', { retryAfter: (cuoi && cuoi.cho) || 30 }), traLai: true };
}

/** { kq, traLai } = kết quả trả trang (traLai: Gemini chưa làm gì → trả lượt); { nghi: giây, cho } = key này tạm không dùng được. */
function goiMotKey(model, body, key) {
  var res;
  try {
    res = UrlFetchApp.fetch(GEMINI_API + '/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { 'x-goog-api-key': key }, muteHttpExceptions: true
    });
  } catch (err) {
    if (/timeout|timed out/i.test(String(err))) return { kq: loi('timeout', 'Gemini chạy quá 60 giây — cần chia nhỏ phần này') };
    return { kq: loi('upstream', 'Không kết nối được Gemini, thử lại sau ít phút'), traLai: true };
  }
  var code = res.getResponseCode(), data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {}
  if (code === 429) { var s = hoiLai(data) || 60; return { nghi: s, cho: s }; }
  var err = data.error || {};
  // Model này không dùng được (tên model sai / chưa mở) → bỏ model, giữ key.
  if ((code === 404 || code === 403) && String(err.message || '').indexOf(model) >= 0) return { boModel: true, cho: 10 };
  if (code === 401 || code === 403 || (code === 400 && keyHong(err))) {
    console.error('Key Gemini hỏng / bị chặn (HTTP ' + code + ')');
    baoMotLan('key_hong', 3600, '⚠️ <b>Key Gemini bị từ chối</b> (HTTP ' + code + ') — kiểm tra lại key trong Google AI Studio. Máy chủ đang dùng tạm key khác nếu có.');
    return { nghi: 3600, cho: 30, moiModel: true };
  }
  if (code === 503 || code === 500 || code === 504) return { boModel: true, quaTai: true, cho: hoiLai(data) || 10 };
  if (code !== 200) {
    var st = data.error && data.error.status ? ' (' + String(data.error.status).replace(/[^A-Z_]/g, '') + ')' : '';
    return { kq: loi('upstream', 'Gemini báo lỗi ' + code + st) };
  }
  if (data.promptFeedback && data.promptFeedback.blockReason) return { kq: loi('blocked', 'Gemini từ chối nội dung này') };
  var cand = (data.candidates || [])[0];
  if (!cand) return { kq: loi('upstream', 'Gemini không trả kết quả') };
  var fr = cand.finishReason || '';
  if (/SAFETY|RECITATION|PROHIBITED|BLOCKLIST|SPII/.test(fr)) return { kq: loi('blocked', 'Gemini dừng vì ' + fr) };
  var text = ((cand.content && cand.content.parts) || []).filter(function (p) { return p.text && !p.thought; })
    .map(function (p) { return p.text; }).join('');
  return { kq: ok({ text: text, finishReason: fr, tokens: (data.usageMetadata || {}).totalTokenCount || 0 }) };
}

/** Key thật sự hỏng: Gemini nói rõ API_KEY_INVALID / API_KEY_SERVICE_BLOCKED, không đoán theo chữ trong yêu cầu. */
function keyHong(err) {
  var d = err.details || [];
  for (var i = 0; i < d.length; i++) if (/^API_KEY_/.test(String(d[i].reason || ''))) return true;
  return /^(api key not valid|api_key_invalid)/i.test(String(err.message || ''));
}

function hoiLai(data) {
  var d = (data && data.error && data.error.details) || [];
  for (var i = 0; i < d.length; i++) {
    var m = /^(\d+(?:\.\d+)?)s$/.exec(String(d[i].retryDelay || ''));
    if (m) return Math.ceil(Number(m[1]));
  }
  return 0;
}

/** Chỉ giữ đúng những gì cần để trích xuất: nội dung, cấu hình sinh, chỉ dẫn hệ thống. */
function sachYeuCau(b) {
  if (!Array.isArray(b.contents) || !b.contents.length || b.contents.length > 20) return null;
  var contents = [], chu = 0;
  for (var i = 0; i < b.contents.length; i++) {
    var c = b.contents[i];
    if (!c || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 300) return null;
    var parts = [];
    for (var j = 0; j < c.parts.length; j++) {
      var p = c.parts[j] || {};
      if (typeof p.text === 'string') { chu += p.text.length; parts.push({ text: p.text }); }
      else if (p.inlineData && MIME_OK.indexOf(p.inlineData.mimeType) >= 0 && typeof p.inlineData.data === 'string') {
        parts.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
      } else return null;
    }
    contents.push({ role: c.role === 'model' ? 'model' : 'user', parts: parts });
  }
  if (chu > AI_MAX_TEXT) return null;
  var out = { contents: contents };
  var gc = b.generationConfig || {}, cfg = {};
  for (var k = 0; k < GEN_KEYS.length; k++) if (gc[GEN_KEYS[k]] !== undefined) cfg[GEN_KEYS[k]] = gc[GEN_KEYS[k]];
  cfg.maxOutputTokens = Math.min(Number(cfg.maxOutputTokens) || AI_MAX_OUT, AI_MAX_OUT);
  if (JSON.stringify([cfg.responseSchema || null, cfg.responseJsonSchema || null]).length > AI_MAX_SCHEMA) return null;
  if (cfg.thinkingConfig !== undefined) {
    var tc = cfg.thinkingConfig || {}, t = {};
    if (tc.thinkingBudget !== undefined) t.thinkingBudget = Math.max(0, Math.min(Number(tc.thinkingBudget) || 0, AI_MAX_THINK));
    if (/^(minimal|low|medium)$/i.test(String(tc.thinkingLevel || ''))) t.thinkingLevel = String(tc.thinkingLevel).toLowerCase();
    cfg.thinkingConfig = t;
  }
  out.generationConfig = cfg;
  if (b.systemInstruction && Array.isArray(b.systemInstruction.parts)) {
    var sys = b.systemInstruction.parts.filter(function (p) { return p && typeof p.text === 'string'; })
      .map(function (p) { return { text: p.text }; });
    if (sys.reduce(function (n, p) { return n + p.text.length; }, 0) > AI_MAX_SYS) return null;
    out.systemInstruction = { parts: sys };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Chạy tay trong trình soạn thảo
// ─────────────────────────────────────────────────────────────

/** Cài đặt / kiểm tra: cất key, tạo bảng tài khoản, thử key, kết nối bot. Chạy lại bao nhiêu lần cũng được. */
function caiDat() {
  var moi = String(GEMINI_KEY_MOI || '').split(/[\s,;]+/).filter(function (k) { return k && k.indexOf('DAN_') !== 0; });
  if (moi.length) props().setProperty('GEMINI_KEYS', moi.join('\n'));
  tieu();
  var sh = bangTK();
  Logger.log('✔ Bảng tài khoản: https://docs.google.com/spreadsheets/d/' + props().getProperty('AI_SHEET_ID') + ' (tab ' + sh.getName() + ')');
  ketNoiTelegram();
  if (!dsKey().length) throw new Error('Chưa có key: dán key Gemini vào GEMINI_KEY_MOI ở đầu file rồi chạy lại.');
  CacheService.getScriptCache().remove('ai_models');
  var chuoi = dsModelDung();
  Logger.log(chuoi.length ? '✔ Key dùng được (' + dsKey().length + ' key). Model dùng lần lượt (quá tải thì chuyển): ' + chuoi.join(' → ')
                          : '✘ Key không dùng được hoặc không có model nào — kiểm tra lại key trong Google AI Studio');
  Logger.log('  Lượt AI mỗi ngày: tài khoản thường ' + luotMacDinh('free') + ', học viên ' + luotMacDinh('hv') + ', giảng viên không giới hạn.');
  Logger.log('  Đăng ký tài khoản của bạn trên trang, rồi gõ /giangvien <email> cho bot (hoặc sửa email trong taoQuanTri và bấm Chạy).');
}
function luotMacDinh(v) {
  var n = Number(props().getProperty(v === 'hv' ? 'AI_LUOT_HV' : 'AI_LUOT_FREE'));
  return n > 0 ? n : (v === 'hv' ? AI_LUOT_HV : AI_LUOT_FREE);
}

/** Cấp quyền giảng viên (không giới hạn lượt, điền được model) cho một tài khoản đã đăng ký. */
function datQuanTri(email) {
  var tk = tkTheoEmail(chuanEmail(email));
  if (!tk) throw new Error('Không có tài khoản ' + email);
  ghiTK(tk, { vaitro: 'gv' });
  Logger.log('✔ ' + tk.email + ' là giảng viên');
}
function taoQuanTri() { datQuanTri('email-cua-ban@gmail.com'); }

/** Đặt mật khẩu mới (mọi phiên đang mở bị đăng xuất). */
function doiMatKhau(tk, mkMoi) {
  if (String(mkMoi || '').length < MK_TOI_THIEU) throw new Error('Mật khẩu mới cần ít nhất ' + MK_TOI_THIEU + ' ký tự');
  var salt = ngauNhien();
  ghiTK(tk, { salt: salt, hash: bamMK(String(mkMoi), salt), phien: '[]' });
}
function datLaiMatKhau(email, mkMoi) {
  var tk = tkTheoEmail(chuanEmail(email));
  if (!tk) throw new Error('Không có tài khoản ' + email);
  doiMatKhau(tk, mkMoi);
  Logger.log('✔ Đã đặt lại mật khẩu cho ' + tk.email);
}
function datLaiMatKhauHocVien() { datLaiMatKhau('email-hoc-vien@gmail.com', 'mat-khau-moi'); }

// ═════════════════════════════════════════════════════════════
// BOT TELEGRAM
// Bot HỎI tin mới mỗi phút (getUpdates) thay vì webhook: Apps Script trả 302 cho webhook nên
// Telegram cứ gửi lại mãi (cách TMXK đang dùng). Chỉ chat quản trị (TG_ADMIN) ra lệnh được.
// ═════════════════════════════════════════════════════════════

var HOI_TRAN_GIAY = 40;          // có lệnh thì bám long-poll thêm tối đa bấy nhiêu giây
var HOI_CHO_GIAY  = 15;

function tgToken() { return props().getProperty('TG_TOKEN') || ''; }
function tgAdmins() { return String(props().getProperty('TG_ADMIN') || '').split(/[\s,;]+/).filter(Boolean); }
function laChatQuanTri(id) { return tgAdmins().indexOf(String(id)) >= 0; }

function tgApi(method, payload) {
  var t = tgToken();
  if (!t) return null;
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + t + '/' + method, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true
    });
    return JSON.parse(r.getContentText());
  } catch (e) { console.error('Telegram ' + method + ': ' + String(e).split(t).join('***')); return null; }   // lỗi mạng hay kèm URL có token
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function tgGui(chatId, text, nut) {
  var p = { chat_id: String(chatId), text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true };
  if (nut) p.reply_markup = { inline_keyboard: nut };
  return tgApi('sendMessage', p);
}
function tgBaoQuanTri(text, nut) { tgAdmins().forEach(function (id) { tgGui(id, text, nut); }); }
/** Báo quản trị nhưng tối đa 1 lần mỗi `giay` giây cho cùng một loại việc. */
function baoMotLan(loai, giay, text) {
  var c = CacheService.getScriptCache();
  if (c.get('bao_' + loai)) return;
  c.put('bao_' + loai, '1', giay);
  tgBaoQuanTri(text);
}

var TEN_VT = { free: 'Tài khoản thường', hv: 'Học viên', gv: 'Giảng viên' };
var TEN_TT = { active: 'đang dùng', cho: 'chờ duyệt', off: 'đã khoá' };

function nutTaiKhoan(tk) {
  return [
    [{ text: '🎓 Học viên', callback_data: 'vt|hv|' + tk.ma }, { text: '👨‍🏫 Giảng viên', callback_data: 'vt|gv|' + tk.ma }, { text: '👤 Thường', callback_data: 'vt|free|' + tk.ma }],
    [tk.trangthai === 'active' ? { text: '🔒 Khoá', callback_data: 'tt|off|' + tk.ma } : { text: '✅ Mở / duyệt', callback_data: 'tt|active|' + tk.ma }]
  ];
}
function moTaTaiKhoan(tk) {
  var khai = '';
  if (tk.nguyen_vong || tk.tuoi) {
    khai = '\n👤 Tự khai: ' + (NGUYEN_VONG[String(tk.nguyen_vong)] || '—') + (tk.tuoi ? ' · ' + esc(String(tk.tuoi)) + ' tuổi' : '');
  }
  if (tk.muc_dich) khai += '\n🎯 ' + esc(String(tk.muc_dich));
  return '<b>' + esc(tk.ten) + '</b> · <code>' + esc(tk.ma) + '</code>\n📧 ' + esc(tk.email) + '\n📱 ' + esc(String(tk.sdt).replace(/^'/, '')) +
    khai +
    '\n🏷 ' + TEN_VT[vaiTro(tk)] + ' · ' + (TEN_TT[tk.trangthai] || esc(tk.trangthai)) +
    '\n🤖 Hôm nay ' + daDung(tk) + (laGV(tk) ? ' lượt (không giới hạn)' : '/' + hanNgay(tk) + ' lượt');
}

function baoTaiKhoanMoi(tk, sdt) {
  try {
    if (!tgToken()) return;
    var cho = tk.trangthai === 'cho';
    tgBaoQuanTri('🆕 <b>Tài khoản AI BCTC mới</b>' + (cho ? ' — <b>chờ duyệt</b>' : '') + '\n' + moTaTaiKhoan(tk) +
      '\n\nXếp vai trò để mở quyền điền model elevaTO:', nutTaiKhoan(tk));
  } catch (e) { console.error('baoTaiKhoanMoi: ' + e); }
}

/** Kết nối bot: cất token + chat, bỏ webhook cũ, bỏ qua tin tồn, bật lịch hỏi tin mỗi phút. */
function ketNoiTelegram() {
  var t = String(TG_TOKEN_MOI || '').trim(), c = String(TG_CHAT_MOI || '').trim();
  if (t && t.indexOf('DAN_') !== 0) props().setProperty('TG_TOKEN', t);
  if (c && c.indexOf('DAN_') !== 0) props().setProperty('TG_ADMIN', c);
  if (!tgToken() || !tgAdmins().length) { Logger.log('ℹ Chưa có token bot Telegram — bỏ qua phần bot.'); return; }
  tgApi('deleteWebhook', { drop_pending_updates: false });
  var r = tgApi('getUpdates', { offset: -1, timeout: 0, limit: 1 });
  if (r && r.ok && r.result && r.result.length) props().setProperty('TG_OFFSET', String(r.result[0].update_id + 1));
  var co = ScriptApp.getProjectTriggers().some(function (x) { return x.getHandlerFunction() === 'hoiTelegram'; });
  if (!co) ScriptApp.newTrigger('hoiTelegram').timeBased().everyMinutes(1).create();
  var gui = tgGui(tgAdmins()[0], '✅ Bot <b>elevaTO AI BCTC</b> đã kết nối.\nGõ /help để xem các lệnh quản trị.');
  Logger.log(gui && gui.ok ? '✔ Bot Telegram đã kết nối, vừa nhắn thử cho bạn.' : '✘ Bot chưa nhắn được — kiểm tra token / chat ID, và bạn đã bấm Start với bot chưa.');
}
/** Tắt bot (xoá lịch hỏi tin). */
function dungBot() {
  ScriptApp.getProjectTriggers().forEach(function (x) { if (x.getHandlerFunction() === 'hoiTelegram') ScriptApp.deleteTrigger(x); });
  Logger.log('✔ Đã tắt bot.');
}

function daXuLy(updateId) {
  var c = CacheService.getScriptCache(), k = 'tgu_' + updateId;
  if (c.get(k)) return true;
  c.put(k, '1', 21600);
  return false;
}

/** Lịch chạy mỗi phút. Rảnh thì ~1 giây; có lệnh thì bám long-poll thêm để trả lời gần như tức thì. */
function hoiTelegram() {
  var c = CacheService.getScriptCache();
  if (c.get('tg_dang_hoi')) return;
  c.put('tg_dang_hoi', '1', HOI_TRAN_GIAY + 30);
  try {
    if (motLuotHoi(0) <= 0) return;
    var het = Date.now() + HOI_TRAN_GIAY * 1000, rong = 0;
    while (Date.now() < het && rong < 2) {
      var n = motLuotHoi(HOI_CHO_GIAY);
      if (n < 0) break;
      rong = n === 0 ? rong + 1 : 0;
    }
  } finally { c.remove('tg_dang_hoi'); }
}

/** Số tin của quản trị đã xử lý (tin người lạ bị bỏ qua, không tính), 0 nếu không có, -1 nếu gọi Telegram lỗi. */
function motLuotHoi(cho) {
  var off = Number(props().getProperty('TG_OFFSET') || 0);
  var r = tgApi('getUpdates', { offset: off, timeout: cho, limit: 20, allowed_updates: ['message', 'callback_query'] });
  if (!r || !r.ok || !r.result) return -1;
  if (!r.result.length) return 0;
  var max = off;
  r.result.forEach(function (u) { if (u.update_id >= max) max = u.update_id + 1; });
  props().setProperty('TG_OFFSET', String(max));                 // dời mốc trước: tin lỗi không làm kẹt hàng chờ
  var dem = 0;
  r.result.forEach(function (u) {
    if (daXuLy(u.update_id)) return;
    try { if (xuLyTin(u)) dem++; } catch (e) { console.error('xuLyTin: ' + e); }
  });
  return dem;
}

/** Chỉ nhận tin riêng do chính quản trị gõ (không nhóm, không tin chuyển tiếp). Người lạ: im lặng, không tốn lượt gọi.
 *  Trả true nếu là việc của quản trị. */
function xuLyTin(u) {
  if (u.callback_query) return xuLyNut(u.callback_query);
  var m = u.message;
  if (!m || !m.chat || !m.from || typeof m.text !== 'string') return false;
  if (m.chat.type !== 'private' || !laChatQuanTri(m.chat.id) || !laChatQuanTri(m.from.id) || m.forward_origin || m.forward_date) return false;
  var text = m.text.trim(), parts = text.split(/\s+/), lenh = parts[0].replace(/@.*$/, '').toLowerCase(), arg = parts.slice(1);
  if (lenh === '/matkhau') {
    // Tin chứa mật khẩu: xoá khỏi lịch sử Telegram ngay; mật khẩu lấy nguyên văn (giữ khoảng trắng bên trong).
    tgApi('deleteMessage', { chat_id: String(m.chat.id), message_id: m.message_id });
    arg = [arg[0], text.replace(/^\S+\s+\S+\s+/, '')];
  }
  var kq = chayLenh(lenh, arg);
  tgGui(m.chat.id, kq.text, kq.nut);
  return true;
}

function timTK(email) { return email ? tkTheoEmail(chuanEmail(email)) : null; }

function chayLenh(lenh, arg) {
  var HELP = ['<b>Bot quản trị elevaTO AI BCTC</b>',
    '/thongke — số tài khoản, lượt AI hôm nay, key',
    '/cho — tài khoản đang chờ duyệt',
    '/tim &lt;email hoặc tên&gt; — tra cứu (kèm nút xếp vai trò)',
    '/hocvien &lt;email&gt; — xếp học viên (điền được model)',
    '/giangvien &lt;email&gt; — xếp giảng viên (không giới hạn lượt)',
    '/free &lt;email&gt; — về tài khoản thường',
    '/luot &lt;email&gt; &lt;số&gt; — số lượt AI mỗi ngày (0 = theo vai trò)',
    '/khoa &lt;email&gt; · /mo &lt;email&gt; — khoá / mở (duyệt) tài khoản',
    '/matkhau &lt;email&gt; &lt;mật khẩu mới&gt; — đặt lại mật khẩu (bot tự xoá tin có mật khẩu)'].join('\n');
  if (lenh === '/start' || lenh === '/help') return { text: HELP };
  if (lenh === '/thongke') {
    var ds = docTK(), dem = { free: 0, hv: 0, gv: 0, cho: 0, off: 0 }, hom = homNay(), luot = 0, all = props().getProperties();
    ds.forEach(function (x) { dem[vaiTro(x)]++; if (x.trangthai === 'cho') dem.cho++; if (x.trangthai === 'off') dem.off++; });
    for (var k in all) if (k.indexOf('Q_') === 0 && k.slice(-hom.length) === hom) luot += Number(all[k]) || 0;
    var nghi = dsKey().filter(function (x) { return keyDangNghi(x); }).length;
    var chuoi = dsModelDung(), qt = chuoi.filter(modelDangNghi);
    return { text: '📊 <b>AI BCTC</b>\nTài khoản: ' + ds.length + ' (học viên ' + dem.hv + ' · giảng viên ' + dem.gv + ' · thường ' + dem.free +
      ' · chờ duyệt ' + dem.cho + ' · khoá ' + dem.off + ')\nLượt AI hôm nay: ' + luot + '\nKey Gemini: ' + dsKey().length +
      (nghi ? ' (đang nghỉ ' + nghi + ')' : '') + '\nModel: ' + esc(chuoi.join(' → ') || '—') +
      (qt.length ? '\nĐang quá tải: ' + esc(qt.join(', ')) : '') };
  }
  if (lenh === '/cho') {
    var cho = docTK().filter(function (x) { return x.trangthai === 'cho'; });
    if (!cho.length) return { text: 'Không có tài khoản nào chờ duyệt.' };
    cho.slice(0, 10).forEach(function (x) { tgBaoQuanTri(moTaTaiKhoan(x), nutTaiKhoan(x)); });
    return { text: 'Có ' + cho.length + ' tài khoản chờ duyệt' + (cho.length > 10 ? ' (hiện 10 người đầu)' : '') + '.' };
  }
  if (lenh === '/tim') {
    var q = arg.join(' ').toLowerCase();
    if (!q) return { text: 'Gõ /tim &lt;email hoặc tên&gt;' };
    var kq = docTK().filter(function (x) { return (String(x.email) + ' ' + String(x.ten)).toLowerCase().indexOf(q) >= 0; });
    if (!kq.length) return { text: 'Không tìm thấy tài khoản nào khớp "' + esc(q) + '".' };
    if (kq.length === 1) return { text: moTaTaiKhoan(kq[0]), nut: nutTaiKhoan(kq[0]) };
    return { text: 'Tìm thấy ' + kq.length + ':\n' + kq.slice(0, 15).map(function (x) { return '• ' + esc(x.ten) + ' — ' + esc(x.email) + ' (' + TEN_VT[vaiTro(x)] + ')'; }).join('\n') };
  }
  var VT = { '/hocvien': 'hv', '/giangvien': 'gv', '/free': 'free' }, TT = { '/khoa': 'off', '/mo': 'active', '/duyet': 'active' };
  if (VT[lenh] || TT[lenh] || lenh === '/luot' || lenh === '/matkhau') {
    var tk = timTK(arg[0]);
    if (!tk) return { text: 'Không tìm thấy tài khoản ' + esc(arg[0] || '') + '. Gõ đúng email đã đăng ký.' };
    if (VT[lenh]) { ghiTK(tk, { vaitro: VT[lenh] }); return { text: '✔ ' + esc(tk.email) + ' → ' + TEN_VT[VT[lenh]] }; }
    if (TT[lenh]) { ghiTK(tk, TT[lenh] === 'off' ? { trangthai: 'off', phien: '[]' } : { trangthai: 'active' }); return { text: '✔ ' + esc(tk.email) + ' → ' + TEN_TT[TT[lenh]] }; }
    if (lenh === '/luot') {
      var n = Math.max(0, Math.floor(Number(arg[1])));
      if (!isFinite(n)) return { text: 'Gõ /luot &lt;email&gt; &lt;số lượt mỗi ngày&gt;' };
      ghiTK(tk, { luot_ngay: n || '' });
      return { text: '✔ ' + esc(tk.email) + ': ' + (n ? n + ' lượt AI mỗi ngày' : 'theo vai trò (' + hanNgay(tk) + ' lượt)') };
    }
    try { doiMatKhau(tk, arg.slice(1).join(' ')); } catch (e) { return { text: '✘ ' + esc(e.message) }; }
    return { text: '✔ Đã đặt mật khẩu mới cho ' + esc(tk.email) + ' (các máy đang đăng nhập bị đăng xuất).' };
  }
  return { text: 'Không rõ lệnh. Gõ /help.' };
}

function xuLyNut(q) {
  var chat = q.message && q.message.chat && q.message.chat.id;
  if (!laChatQuanTri(chat) || !laChatQuanTri(q.from && q.from.id)) { tgApi('answerCallbackQuery', { callback_query_id: q.id, text: 'Không có quyền' }); return false; }
  var p = String(q.data || '').split('|'), tk = /^E[A-Z0-9]{5}$/.test(p[2] || '') ? tkTheoMa(p[2]) : null;
  if (!tk) { tgApi('answerCallbackQuery', { callback_query_id: q.id, text: 'Không tìm thấy tài khoản' }); return true; }
  var bao;
  if (p[0] === 'vt' && TEN_VT[p[1]]) { ghiTK(tk, { vaitro: p[1] }); bao = TEN_VT[p[1]]; }
  else if (p[0] === 'tt' && TEN_TT[p[1]] && p[1] !== 'cho') { ghiTK(tk, p[1] === 'off' ? { trangthai: 'off', phien: '[]' } : { trangthai: 'active' }); bao = TEN_TT[p[1]]; }
  else { tgApi('answerCallbackQuery', { callback_query_id: q.id, text: 'Nút không hợp lệ' }); return true; }
  tgApi('answerCallbackQuery', { callback_query_id: q.id, text: '✔ ' + bao });
  tgApi('editMessageText', { chat_id: String(chat), message_id: q.message.message_id, parse_mode: 'HTML', text: moTaTaiKhoan(tk), reply_markup: { inline_keyboard: nutTaiKhoan(tk) } });
  return true;
}
