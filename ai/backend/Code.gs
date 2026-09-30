/**
 * elevaTO AI — máy chủ tài khoản + gọi Gemini cho công cụ AI BCTC
 * ============================================================
 * Dự án Apps Script RIÊNG (không dính landing page, không dính công cụ upload).
 * Người dùng đăng ký / đăng nhập bằng email + mật khẩu (giống Viral Studio của TMXK);
 * tài khoản nằm trong Google Sheet "elevaTO AI — Tài khoản" do hàm caiDat tạo.
 * Key Gemini cất trong Script Properties, không bao giờ ra tới trình duyệt.
 *
 * Quản trị trên Sheet (tab TaiKhoan):
 *   vaitro    : hv | admin (admin không giới hạn lượt)
 *   trangthai : active | cho (chờ duyệt) | off (khoá)
 *   luot_ngay : số lượt AI mỗi ngày; để trống = mặc định AI_LUOT_MAC_DINH
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
// ═════════════════════════════════════════════════════════════

var AI_LUOT_MAC_DINH = 20;                 // lượt AI mỗi ngày cho tài khoản mới (Script Property AI_LUOT_MAC_DINH đè lên)
var AI_RPM          = 12;                  // tối đa lượt gọi Gemini mỗi phút cho CẢ hệ thống, tính cho MỖI key
var AI_RPM_MA       = 6;                   // tối đa lượt mỗi phút cho MỘT tài khoản
var AI_MAX_SCHEMA   = 20000;               // độ dài tối đa của responseSchema (JSON)
var AI_MAX_BODY     = 45 * 1024 * 1024;    // yêu cầu lớn hơn thì từ chối (Apps Script nhận tối đa ~50MB)
var AI_MAX_OUT      = 32768;               // trần maxOutputTokens
var AI_MAX_TEXT     = 200000;              // tổng số ký tự chữ trong một yêu cầu
var AI_MAX_SYS      = 20000;               // độ dài chỉ dẫn hệ thống
var AI_MAX_THINK    = 8192;                // trần thinkingBudget
var AI_MODEL_TTL    = 6 * 3600;            // nhớ danh sách model 6 giờ
var PHIEN_NGAY      = 30;                  // phiên đăng nhập sống bao nhiêu ngày
var PHIEN_TOI_DA    = 3;                   // mỗi tài khoản đăng nhập tối đa mấy máy cùng lúc
var DN_SAI_TOI_DA   = 5;                   // đăng nhập sai bấy nhiêu lần trong 10 phút thì khoá tạm
var DK_MOI_GIO      = 30;                  // chặn bot: tối đa số tài khoản mới mỗi giờ cho cả hệ thống
var MK_TOI_THIEU    = 8;
var BAM_VONG        = 1500;                // số vòng băm mật khẩu
var GEMINI_API      = 'https://generativelanguage.googleapis.com/v1beta/models';
var MIME_OK         = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
var GEN_KEYS        = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'responseSchema',
                       'responseJsonSchema', 'thinkingConfig', 'seed'];
var TK_SHEET        = 'TaiKhoan';
var TK_COT          = ['ma', 'email', 'ten', 'sdt', 'salt', 'hash', 'vaitro', 'trangthai', 'luot_ngay',
                       'phien', 'tao_luc', 'dangnhap_cuoi', 'ghi_chu'];

function props() { return PropertiesService.getScriptProperties(); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function loi(code, error, extra) { var o = { ok: false, code: code, error: error }; for (var k in extra || {}) o[k] = extra[k]; return o; }
function ok(data) { return { ok: true, data: data }; }

function doGet() { return json({ ok: true, service: 'elevaTO AI' }); }

/**
 * { action, … } → { ok:true, data } | { ok:false, code, error, retryAfter? }
 *   dangky {ten,email,sdt,mk} · dangnhap {email,mk} · toi {token} · dangxuat {token} · generate {token, contents…}
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
  return sh;
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

function hoSo(tk) {
  var admin = tk.vaitro === 'admin';
  return { ten: String(tk.ten), email: String(tk.email), vaitro: admin ? 'admin' : 'hv', luot: { dung: daDung(tk), han: admin ? 0 : hanNgay(tk) } };
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
  if (!ten || !email || !mk || !sdt) return loi('thieu', 'Điền đủ họ tên, email, số điện thoại và mật khẩu');
  if (!emailHopLe(email)) return loi('email_sai', 'Email chưa đúng');
  if (sdt.length < 9 || sdt.length > 12) return loi('sdt_sai', 'Số điện thoại chưa đúng');
  if (mk.length < MK_TOI_THIEU || mk.length > 200) return loi('mk_ngan', 'Mật khẩu cần ít nhất ' + MK_TOI_THIEU + ' ký tự');

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
    sh.appendRow([maMoi(ds), oChu(email), oChu(ten), "'" + sdt, salt, hash, 'hv', duyet ? 'cho' : 'active', '', '[]',
      new Date().toISOString(), '', '']);
    tk = tkTheoEmail(email);
  } finally { lock.releaseLock(); }
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
  var md = Number(props().getProperty('AI_LUOT_MAC_DINH'));
  return md > 0 ? md : AI_LUOT_MAC_DINH;
}
function laAdmin(tk) { return tk.vaitro === 'admin'; }
function hetLuot(tk) { return loi('quota', 'Hôm nay đã dùng hết ' + hanNgay(tk) + ' lượt AI — mai dùng tiếp, hoặc liên hệ elevaTO xin thêm'); }

/** Giữ 1 lượt TRƯỚC khi gọi Gemini (trong khoá, nên gọi song song không vượt hạn mức). */
function giuLuot(tk) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var k = khoaLuot(tk), used = Number(props().getProperty(k) || 0);
    if (!laAdmin(tk) && used >= hanNgay(tk)) return false;
    props().setProperty(k, String(used + 1));
    var all = props().getProperties();                                       // dọn bộ đếm các ngày trước
    for (var p in all) if (p.indexOf('Q_' + tk.ma + '_') === 0 && p !== k) props().deleteProperty(p);
    return true;
  } finally { lock.releaseLock(); }
}
function traLuot(tk) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var k = khoaLuot(tk), used = Number(props().getProperty(k) || 0);
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
    if (!laAdmin(tk) && nMa >= AI_RPM_MA) return cho;
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
function khoaNghi(k) { return 'nghi_' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, k, Utilities.Charset.UTF_8)); }
function keyNghi(k, giay) { CacheService.getScriptCache().put(khoaNghi(k), '1', Math.max(5, Math.min(giay, 21600))); }
function keyDangNghi(k) { return !!CacheService.getScriptCache().get(khoaNghi(k)); }
function keyRanh() { return dsKey().filter(function (k) { return !keyDangNghi(k); }); }

/** Model sinh văn bản dùng được (bỏ TTS, ảnh, âm thanh, embedding…). */
function danhSachModel() {
  var cache = CacheService.getScriptCache(), c = cache.get('ai_models');
  if (c) return JSON.parse(c);
  var key = keyRanh()[0];
  if (!key) return [];
  var res = UrlFetchApp.fetch(GEMINI_API + '?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  var list = (JSON.parse(res.getContentText()).models || []).filter(function (m) {
    var id = String(m.name || '').replace(/^models\//, '');
    return /^gemini-[\w.-]+$/.test(id) && !/(tts|embed|image|audio|live|veo|imagen|robotics|computer-use|transcribe|omni|customtools)/.test(id) &&
      (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
  }).map(function (m) { return String(m.name).replace(/^models\//, ''); });
  cache.put('ai_models', JSON.stringify(list), AI_MODEL_TTL);
  return list;
}

/** Model dùng: AI_MODEL (nếu có trong danh sách), không thì bản flash chính thức mới nhất. */
function chonModel() {
  var list = danhSachModel(), rieng = String(props().getProperty('AI_MODEL') || '');
  if (rieng && list.indexOf(rieng) >= 0) return rieng;
  var ver = function (id) { var m = /^gemini-(\d+(?:\.\d+)?)/.exec(id); return m ? Number(m[1]) : 0; };
  var chinhThuc = list.filter(function (id) { return /^gemini-\d+(\.\d+)?-flash$/.test(id); }).sort(function (a, b) { return ver(b) - ver(a); });
  if (chinhThuc.length) return chinhThuc[0];
  var flash = list.filter(function (id) { return /flash/.test(id) && !/lite/.test(id); }).sort(function (a, b) { return ver(b) - ver(a); });
  return flash[0] || list[0] || '';
}

// ─── Gọi Gemini ─────────────────────────────────────────────

function goiGemini(tk, b) {
  if (!dsKey().length) return loi('setup', 'Máy chủ chưa cài key Gemini (chạy hàm caiDat)');
  var body = sachYeuCau(b);
  if (!body) return loi('bad', 'Yêu cầu sai dạng hoặc quá dài');
  if (!laAdmin(tk) && daDung(tk) >= hanNgay(tk)) return hetLuot(tk);
  var model = chonModel();
  if (!model) return loi('busy', 'Chưa lấy được danh sách model Gemini — thử lại sau ít phút', { retryAfter: 30 });

  var cho = giuNhip(tk);
  if (cho) return loi('busy', 'Hệ thống đang đông, chờ ' + cho + ' giây', { retryAfter: cho });
  if (!giuLuot(tk)) return hetLuot(tk);
  var r = goiLanLuot(model, body);
  if (r.traLai) traLuot(tk);                           // chỉ trả lượt khi Gemini chưa làm gì
  return r.kq;
}

/** Thử lần lượt các key đang rảnh: key bị 429 / hỏng thì cho nghỉ và thử key kế tiếp ngay. */
function goiLanLuot(model, body) {
  var keys = keyRanh(), cuoi = null;
  if (!keys.length) return { kq: loi('busy', 'Gemini đang hết hạn mức phút này, thử lại sau ít giây', { retryAfter: 30 }), traLai: true };
  for (var i = 0; i < keys.length; i++) {
    var r = goiMotKey(model, body, keys[i]);
    if (r.nghi) { keyNghi(keys[i], r.nghi); cuoi = r; continue; }
    return r;
  }
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
  if (code === 401 || code === 403 || (code === 400 && /API_KEY|API key/i.test(JSON.stringify(data.error || {})))) {
    console.error('Key Gemini hỏng / bị chặn (HTTP ' + code + ')');
    return { nghi: 3600, cho: 30 };
  }
  if (code === 503 || code === 500) return { kq: loi('busy', 'Gemini đang quá tải', { retryAfter: hoiLai(data) || 10 }), traLai: true };
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

/** Cài đặt / kiểm tra: cất key, tạo bảng tài khoản, thử key. Chạy lại bao nhiêu lần cũng được. */
function caiDat() {
  var moi = String(GEMINI_KEY_MOI || '').split(/[\s,;]+/).filter(function (k) { return k && k.indexOf('DAN_') !== 0; });
  if (moi.length) props().setProperty('GEMINI_KEYS', moi.join('\n'));
  tieu();
  var sh = bangTK();
  Logger.log('✔ Bảng tài khoản: https://docs.google.com/spreadsheets/d/' + props().getProperty('AI_SHEET_ID') + ' (tab ' + sh.getName() + ')');
  if (!dsKey().length) throw new Error('Chưa có key: dán key Gemini vào GEMINI_KEY_MOI ở đầu file rồi chạy lại.');
  CacheService.getScriptCache().remove('ai_models');
  var model = chonModel();
  Logger.log(model ? '✔ Key dùng được (' + dsKey().length + ' key). Model sẽ dùng: ' + model
                   : '✘ Key không dùng được hoặc không có model nào — kiểm tra lại key trong Google AI Studio');
  Logger.log('  Lượt AI mặc định mỗi ngày: ' + (Number(props().getProperty('AI_LUOT_MAC_DINH')) || AI_LUOT_MAC_DINH) +
             '. Đổi cho từng người: cột luot_ngay trên bảng.');
  Logger.log('  Đăng ký tài khoản của bạn trên trang, rồi sửa email trong hàm taoQuanTri và bấm Chạy để có quyền quản trị.');
}

/** Cấp quyền quản trị (không giới hạn lượt) cho một tài khoản đã đăng ký. */
function datQuanTri(email) {
  var tk = tkTheoEmail(chuanEmail(email));
  if (!tk) throw new Error('Không có tài khoản ' + email);
  ghiTK(tk, { vaitro: 'admin' });
  Logger.log('✔ ' + tk.email + ' là quản trị');
}
function taoQuanTri() { datQuanTri('email-cua-ban@gmail.com'); }

/** Học viên quên mật khẩu: đặt mật khẩu mới rồi báo cho họ (mọi phiên đang mở bị đăng xuất). */
function datLaiMatKhau(email, mkMoi) {
  var tk = tkTheoEmail(chuanEmail(email));
  if (!tk) throw new Error('Không có tài khoản ' + email);
  if (String(mkMoi || '').length < MK_TOI_THIEU) throw new Error('Mật khẩu mới cần ít nhất ' + MK_TOI_THIEU + ' ký tự');
  var salt = ngauNhien();
  ghiTK(tk, { salt: salt, hash: bamMK(String(mkMoi), salt), phien: '[]' });
  Logger.log('✔ Đã đặt lại mật khẩu cho ' + tk.email);
}
function datLaiMatKhauHocVien() { datLaiMatKhau('email-hoc-vien@gmail.com', 'mat-khau-moi'); }
