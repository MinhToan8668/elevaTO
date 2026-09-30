/**
 * elevaTO AI — máy chủ trung gian giữ key Gemini
 * ============================================================
 * Dự án Apps Script RIÊNG (không dính landing page, không dính công cụ upload).
 * Trang ai/index.html gửi yêu cầu tới /exec của dự án này kèm MÃ TRUY CẬP; máy chủ
 * kiểm mã + hạn mức rồi mới gọi Gemini bằng key cất trong Script Properties.
 * Key không bao giờ ra tới trình duyệt.
 *
 * Giới hạn cần biết: UrlFetchApp chờ tối đa ~60 giây mỗi lượt gọi → trang tự chia việc
 * thành nhiều lượt nhỏ; hết giờ thì máy chủ trả code 'timeout' để trang chia nhỏ hơn nữa.
 *
 * Cài đặt: xem ai/README.md
 * ============================================================
 */

// ═════════════════════════════════════════════════════════════
//  DÁN KEY GEMINI VÀO ĐÂY RỒI CHẠY HÀM  caiDat  (chạy xong có thể xoá key khỏi dòng này)
// ═════════════════════════════════════════════════════════════
var GEMINI_KEY_MOI = 'DAN_KEY_GEMINI';
// ═════════════════════════════════════════════════════════════

var AI_RPM          = 12;                  // tối đa số lượt gọi Gemini mỗi phút cho CẢ hệ thống (bản miễn phí rất chặt)
var AI_MAX_BODY     = 45 * 1024 * 1024;    // yêu cầu lớn hơn thì từ chối (Apps Script nhận tối đa ~50MB)
var AI_MAX_OUT      = 32768;               // trần maxOutputTokens
var AI_SAI_MAX      = 20;                  // sai mã quá số này thì khoá tạm
var AI_KHOA_GIAY    = 600;
var AI_MODEL_TTL    = 6 * 3600;            // nhớ danh sách model 6 giờ
var GEMINI_API      = 'https://generativelanguage.googleapis.com/v1beta/models';
var MIME_OK         = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
var GEN_KEYS        = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType', 'responseSchema',
                       'responseJsonSchema', 'thinkingConfig', 'seed'];

function props() { return PropertiesService.getScriptProperties(); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function loi(code, error, extra) { var o = { ok: false, code: code, error: error }; for (var k in extra || {}) o[k] = extra[k]; return o; }

function doGet() { return json({ ok: true, service: 'elevaTO AI' }); }

/**
 * { action: 'ping' | 'generate', code, … } → { ok, data } | { ok:false, code, error, retryAfter? }
 * code: key (sai mã) · quota (hết lượt hôm nay) · busy (chờ retryAfter giây) · timeout (chia nhỏ việc)
 *       · blocked (Gemini chặn nội dung) · bad (yêu cầu sai) · upstream (Gemini lỗi khác) · setup (chưa cài)
 * Trang gửi Content-Type: text/plain để tránh CORS preflight.
 */
function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (raw.length > AI_MAX_BODY) return json(loi('bad', 'Yêu cầu quá lớn — chọn ít trang hơn'));
  var b;
  try { b = JSON.parse(raw); } catch (err) { return json(loi('bad', 'Yêu cầu không đọc được')); }
  try {
    var who = kiemMa(b.code);
    if (!who.ok) return json(who);
    if (b.action === 'ping') return json({ ok: true, data: { name: who.name, quota: hanMuc(who), models: danhSachModel() } });
    if (b.action === 'generate') return json(goiGemini(who, b));
    return json(loi('bad', 'Không rõ yêu cầu'));
  } catch (err) {
    console.error('doPost: ' + err + (err && err.stack ? '\n' + err.stack : ''));
    return json(loi('upstream', 'Máy chủ gặp lỗi, thử lại sau ít phút'));
  }
}

// ─── Mã truy cập & hạn mức ──────────────────────────────────

function dsMa() {
  try { return JSON.parse(props().getProperty('AI_CODES') || '{}'); } catch (e) { return {}; }
}

function kiemMa(code) {
  var cache = CacheService.getScriptCache();
  var sai = Number(cache.get('aisai') || 0);
  if (sai >= AI_SAI_MAX) return loi('key', 'Nhập sai mã quá nhiều lần, thử lại sau 10 phút');
  code = String(code || '').trim();
  var admin = props().getProperty('ADMIN_CODE');
  if (code && admin && code === admin) return { ok: true, code: code, name: 'Quản trị', perDay: 0 };
  var m = code ? dsMa()[code] : null;
  if (!m) {
    cache.put('aisai', String(sai + 1), AI_KHOA_GIAY);
    return loi('key', 'Mã truy cập không đúng');
  }
  return { ok: true, code: code, name: m.name, perDay: Number(m.perDay) || 0 };
}

function homNay() { return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'); }
function khoaLuot(code) { return 'Q_' + code + '_' + homNay(); }

function hanMuc(who) {
  return { used: Number(props().getProperty(khoaLuot(who.code)) || 0), limit: who.perDay };
}

function tinhLuot(who) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var k = khoaLuot(who.code);
    props().setProperty(k, String(Number(props().getProperty(k) || 0) + 1));
    // dọn bộ đếm của các ngày trước
    var all = props().getProperties();
    for (var p in all) if (p.indexOf('Q_' + who.code + '_') === 0 && p !== k) props().deleteProperty(p);
  } finally { lock.releaseLock(); }
}

/** Đếm lượt gọi Gemini trong phút hiện tại cho cả hệ thống. Trả số giây phải chờ (0 = được gọi). */
function giuNhip() {
  var cache = CacheService.getScriptCache();
  var now = Date.now(), phut = Math.floor(now / 60000);
  var k = 'rpm_' + phut, n = Number(cache.get(k) || 0);
  if (n >= AI_RPM) return Math.max(1, 60 - Math.floor((now % 60000) / 1000));
  cache.put(k, String(n + 1), 120);
  return 0;
}

// ─── Gemini ─────────────────────────────────────────────────

function keyGemini() { return props().getProperty('GEMINI_KEY') || ''; }

/** Model sinh văn bản dùng được với key này (bỏ TTS, ảnh, âm thanh, embedding…). */
function danhSachModel() {
  var cache = CacheService.getScriptCache();
  var c = cache.get('ai_models');
  if (c) return JSON.parse(c);
  var key = keyGemini();
  if (!key) return [];
  var res = UrlFetchApp.fetch(GEMINI_API + '?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  var list = (JSON.parse(res.getContentText()).models || []).filter(function (m) {
    var id = String(m.name || '').replace(/^models\//, '');
    return /^gemini-[\w.-]+$/.test(id) && !/(tts|embed|image|audio|live|veo|imagen|robotics|computer-use)/.test(id) &&
      (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
  }).map(function (m) { return { id: String(m.name).replace(/^models\//, ''), name: m.displayName || '' }; });
  cache.put('ai_models', JSON.stringify(list), AI_MODEL_TTL);
  return list;
}

function goiGemini(who, b) {
  var key = keyGemini();
  if (!key) return loi('setup', 'Máy chủ chưa cài key Gemini (chạy hàm caiDat)');
  if (who.perDay && hanMuc(who).used >= who.perDay) {
    return loi('quota', 'Hôm nay đã dùng hết ' + who.perDay + ' lượt — mai dùng tiếp, hoặc xin thêm lượt');
  }
  var model = String(b.model || '');
  var ok = danhSachModel().some(function (m) { return m.id === model; });
  if (!ok) return loi('bad', 'Model không có trong danh sách được phép');
  var body = sachYeuCau(b);
  if (!body) return loi('bad', 'Yêu cầu sai dạng');

  var cho = giuNhip();
  if (cho) return loi('busy', 'Hệ thống đang đông, chờ ' + cho + ' giây', { retryAfter: cho });

  var res;
  try {
    res = UrlFetchApp.fetch(GEMINI_API + '/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { 'x-goog-api-key': key }, muteHttpExceptions: true
    });
  } catch (err) {
    if (/timeout|timed out/i.test(String(err))) return loi('timeout', 'Gemini chạy quá 60 giây — cần chia nhỏ phần này');
    return loi('upstream', 'Không kết nối được Gemini, thử lại sau ít phút');
  }
  var code = res.getResponseCode(), data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {}
  if (code === 429 || code === 503 || code === 500) {
    return loi('busy', 'Gemini đang quá tải hoặc hết hạn mức phút này', { retryAfter: hoiLai(data) || (code === 429 ? 30 : 10) });
  }
  if (code !== 200) {
    var st = data.error && data.error.status ? ' (' + String(data.error.status).replace(/[^A-Z_]/g, '') + ')' : '';
    return loi('upstream', 'Gemini báo lỗi ' + code + st);
  }
  if (data.promptFeedback && data.promptFeedback.blockReason) return loi('blocked', 'Gemini từ chối nội dung này');
  var cand = (data.candidates || [])[0];
  if (!cand) return loi('upstream', 'Gemini không trả kết quả');
  var fr = cand.finishReason || '';
  if (/SAFETY|RECITATION|PROHIBITED|BLOCKLIST|SPII/.test(fr)) return loi('blocked', 'Gemini dừng vì ' + fr);
  var text = ((cand.content && cand.content.parts) || []).filter(function (p) { return p.text && !p.thought; })
    .map(function (p) { return p.text; }).join('');
  tinhLuot(who);
  return { ok: true, data: { text: text, finishReason: fr, tokens: (data.usageMetadata || {}).totalTokenCount || 0 } };
}

function hoiLai(data) {
  var d = (data.error && data.error.details) || [];
  for (var i = 0; i < d.length; i++) {
    var m = /^(\d+(?:\.\d+)?)s$/.exec(String(d[i].retryDelay || ''));
    if (m) return Math.ceil(Number(m[1]));
  }
  return 0;
}

/** Chỉ giữ đúng những gì cần để trích xuất: nội dung, cấu hình sinh, chỉ dẫn hệ thống. */
function sachYeuCau(b) {
  if (!Array.isArray(b.contents) || !b.contents.length || b.contents.length > 20) return null;
  var contents = [];
  for (var i = 0; i < b.contents.length; i++) {
    var c = b.contents[i];
    if (!c || !Array.isArray(c.parts) || !c.parts.length || c.parts.length > 300) return null;
    var parts = [];
    for (var j = 0; j < c.parts.length; j++) {
      var p = c.parts[j] || {};
      if (typeof p.text === 'string') parts.push({ text: p.text });
      else if (p.inlineData && MIME_OK.indexOf(p.inlineData.mimeType) >= 0 && typeof p.inlineData.data === 'string') {
        parts.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
      } else return null;
    }
    contents.push({ role: c.role === 'model' ? 'model' : 'user', parts: parts });
  }
  var out = { contents: contents };
  var gc = b.generationConfig || {}, cfg = {};
  for (var k = 0; k < GEN_KEYS.length; k++) if (gc[GEN_KEYS[k]] !== undefined) cfg[GEN_KEYS[k]] = gc[GEN_KEYS[k]];
  cfg.maxOutputTokens = Math.min(Number(cfg.maxOutputTokens) || AI_MAX_OUT, AI_MAX_OUT);
  out.generationConfig = cfg;
  if (b.systemInstruction && Array.isArray(b.systemInstruction.parts)) {
    out.systemInstruction = { parts: b.systemInstruction.parts.filter(function (p) { return typeof p.text === 'string'; })
      .map(function (p) { return { text: p.text }; }) };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Chạy tay trong trình soạn thảo
// ─────────────────────────────────────────────────────────────

/** Lưu key, tạo mã quản trị, thử gọi Gemini. Chạy lại nhiều lần vẫn an toàn. */
function caiDat() {
  if (GEMINI_KEY_MOI && GEMINI_KEY_MOI.indexOf('DAN_') !== 0) props().setProperty('GEMINI_KEY', GEMINI_KEY_MOI.trim());
  if (!keyGemini()) throw new Error('Chưa có key: dán key Gemini vào GEMINI_KEY_MOI ở đầu file rồi chạy lại.');
  if (!props().getProperty('ADMIN_CODE')) props().setProperty('ADMIN_CODE', 'qt-' + maNgauNhien());
  CacheService.getScriptCache().remove('ai_models');
  var models = danhSachModel();
  Logger.log(models.length ? '✔ Key dùng được. Model: ' + models.map(function (m) { return m.id; }).join(', ')
                           : '✘ Key không dùng được hoặc không có model nào — kiểm tra lại key trong Google AI Studio');
  Logger.log('✔ Mã quản trị (không giới hạn lượt, ĐỪNG chia sẻ): ' + props().getProperty('ADMIN_CODE'));
  Logger.log('  Tạo mã cho học viên: sửa rồi chạy hàm  taoMaHocVien');
  Logger.log('  Đã lưu key vào Script Properties — có thể xoá key khỏi dòng GEMINI_KEY_MOI.');
}

function maNgauNhien() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12).toLowerCase(); }

/** Tạo mã mới cho một người. soLuotNgay = 0 → không giới hạn. */
function themMa(ten, soLuotNgay) {
  var codes = dsMa(), code = 'hv-' + maNgauNhien();
  codes[code] = { name: String(ten || 'Học viên'), perDay: Number(soLuotNgay) || 0, created: homNay() };
  props().setProperty('AI_CODES', JSON.stringify(codes));
  Logger.log('✔ ' + codes[code].name + ': ' + code + (codes[code].perDay ? ' (' + codes[code].perDay + ' lượt/ngày)' : ''));
  return code;
}

function xoaMa(code) {
  var codes = dsMa();
  delete codes[code];
  props().setProperty('AI_CODES', JSON.stringify(codes));
  Logger.log('✔ Đã xoá mã ' + code);
}

/** Sửa tên + số lượt ở đây rồi bấm Run. */
function taoMaHocVien() { themMa('Tên học viên', 40); }

/** Thu hồi một mã: dán mã vào đây rồi bấm Run. */
function xoaMaHocVien() { xoaMa('hv-dan-ma-can-xoa'); }

function xemMa() {
  var codes = dsMa();
  for (var c in codes) Logger.log(c + ' · ' + codes[c].name + ' · ' + (Number(props().getProperty(khoaLuot(c)) || 0)) + '/' + (codes[c].perDay || '∞') + ' lượt hôm nay');
}
