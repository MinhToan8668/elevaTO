/**
 * elevaTO — Backend (Google Apps Script Web App)
 * ============================================================
 * Một file duy nhất đảm nhiệm 3 việc:
 *   1. API config  — landing page fetch để render toàn bộ nội dung động
 *   2. API đăng ký — nhận form, lưu Google Sheet, báo Telegram
 *   3. Bot Telegram — đổi cohort / giá / slot / lịch học ngay trên chat,
 *                     web tự cập nhật mà KHÔNG cần sửa source code
 *
 * Cài đặt: xem SETUP.md
 * ============================================================
 */

// ═════════════════════════════════════════════════════════════
//  ĐIỀN 3 GIÁ TRỊ NÀY RỒI CHẠY HÀM  setup
// ═════════════════════════════════════════════════════════════
var TG_TOKEN   = 'DAN_TOKEN_BOT';          // token từ @BotFather
var TG_ADMIN   = 'DAN_CHAT_ID';            // chat id của bạn, từ @userinfobot
var WEBAPP_URL = 'DAN_URL_EXEC';           // URL Web App, PHẢI kết thúc bằng /exec
// ═════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────
// 0. HẰNG SỐ
// ─────────────────────────────────────────────────────────────
var PROP_CONFIG   = 'SITE_CONFIG';     // JSON config hiện tại
var PROP_TOKEN    = 'TG_BOT_TOKEN';    // token bot Telegram (BÍ MẬT)
var PROP_ADMIN    = 'TG_ADMIN_IDS';    // chat id được phép ra lệnh, phân cách bởi dấu phẩy
var PROP_ADMINKEY = 'ADMIN_KEY';       // key xem danh sách đăng ký từ web
var SHEET_REGS    = 'DangKy';
var SHEET_LOG     = 'Log';

var REG_HEADERS = ['ID','Thời gian','Cohort','Họ tên','SĐT','Năm sinh','Email',
                   'Công việc','Mục tiêu','Nguồn','Trạng thái','Ghi chú'];

// ─────────────────────────────────────────────────────────────
// 1. CONFIG MẶC ĐỊNH
//    Chỉ dùng lần đầu tiên. Sau đó mọi thay đổi đều qua bot Telegram
//    và được lưu trong Script Properties.
// ─────────────────────────────────────────────────────────────
function defaultConfig() {
  return {
    version: 1,
    updatedAt: '',

    cohort: {
      number: 7,             // bot đổi bằng /cohort 8
      status: 'open',        // open | full | closed
      openText: 'Sắp mở'
    },

    slots: {
      max: 10,               // /slot 12
      base: 4,               // /base 4  — số người đã đăng ký ngoài hệ thống
      registered: 0          // backend tự đếm, không sửa tay
    },

    pricing: {
      earlyBird: 3000000,    // /giasom 3000000
      regular:   4000000,    // /giagoc 4000000
      selfPaced: 1500000,    // /giatuhoc 1500000
      showSelfPaced: true,
      note: 'Học thử 1 buổi rồi mới quyết định đóng học phí.'
    },

    schedule: {
      days: 'Thứ 7 & CN',    // /lich Thứ 7 & CN | 9h–11h sáng
      time: '9h–11h sáng',
      detail: 'Thứ 7 & Chủ Nhật, 9h00 – 11h00 (GMT+7, Việt Nam)',
      platform: 'MS Teams',
      sessions: 8,
      theory: 5,
      practice: 3,
      hoursPerSession: 2
    },

    stats: {
      years: '2.5+',
      cohortsDone: 6,        // /cohortmoi tự +1
      students: '50+'
    },

    instructor: {
      name: 'Minh Toàn',
      role: 'Assistant Relationship Manager (Wholesale Banking) · Vietnam International Bank (VIB)',
      badges: [
        '2.5+ năm kinh nghiệm M&A & Investment Analysis',
        'Corporate Banking — Vietnam International Bank (VIB)',
        'CFA Candidate · elevaTO Founder',
        'TikTok: Toàn Thích Trải Nghiệm'
      ]
    },

    contact: {
      tiktok: 'Toàn Thích Trải Nghiệm',
      tiktokUrl: 'https://www.tiktok.com/@toanthichtrainghiem',
      email: ''
    },

    announcement: {
      show: false,           // /thongbao <nội dung>  /xoathongbao
      text: ''
    },

    media: {
      videoUrl: 'https://drive.google.com/file/d/1NW1h_XqO_85XHf_Gl3YDNL5pnr0FNwE7/view',
      videoTitle: 'Buổi học thử — Module 1: Tổng quan định giá & mô hình DCF',
      showSlides: true,      // /slide on|off
      showModel: true        // /model on|off
    },

    company: {
      ticker: 'DGW',
      name: 'Digiworld Corporation (CTCP Thế Giới Số)',
      exchange: 'HOSE',
      sheets: 21,
      checks: 5,
      industries: 17
    }
  };
}

// ─────────────────────────────────────────────────────────────
// 2. ĐỌC / GHI CONFIG
// ─────────────────────────────────────────────────────────────
function props() { return PropertiesService.getScriptProperties(); }

function getConfig() {
  var raw = props().getProperty(PROP_CONFIG);
  var cfg;
  try { cfg = raw ? JSON.parse(raw) : null; } catch (e) { cfg = null; }
  // merge sâu với mặc định để config cũ không thiếu key khi ta thêm field mới
  return deepMerge(defaultConfig(), cfg || {});
}

function saveConfig(cfg) {
  cfg.updatedAt = nowVN();
  props().setProperty(PROP_CONFIG, JSON.stringify(cfg));
  return cfg;
}

function deepMerge(base, over) {
  var out = {}, k;
  for (k in base) {
    if (isPlainObject(base[k])) {
      out[k] = deepMerge(base[k], (over && isPlainObject(over[k])) ? over[k] : {});
    } else {
      out[k] = (over && over[k] !== undefined && over[k] !== null) ? over[k] : base[k];
    }
  }
  for (k in over) { if (!(k in out)) out[k] = over[k]; }
  return out;
}
function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Config đã "nấu chín": thêm các giá trị tính toán sẵn để client chỉ việc hiển thị. */
function publicConfig(preloaded) {
  var c = getConfig();
  var registered = countRegs(preloaded);
  c.slots.registered = registered;

  var total = Number(c.slots.base) + registered;
  var remaining = Math.max(0, Number(c.slots.max) - total);

  c.computed = {
    cohortLabel: cohortLabel(c.cohort.number),
    nextCohortLabel: cohortLabel(Number(c.cohort.number) + 1),
    totalRegistered: total,
    remaining: remaining,
    isFull: remaining <= 0 || c.cohort.status === 'full',
    isClosed: c.cohort.status === 'closed',
    percent: Math.min(100, Math.round(total / Math.max(1, Number(c.slots.max)) * 100)),
    price: {
      earlyBird:      money(c.pricing.earlyBird),
      earlyBirdShort: moneyShort(c.pricing.earlyBird),
      regular:        money(c.pricing.regular),
      regularShort:   moneyShort(c.pricing.regular),
      selfPaced:      money(c.pricing.selfPaced),
      selfPacedShort: moneyShort(c.pricing.selfPaced),
      saveAmount:     money(Math.max(0, c.pricing.regular - c.pricing.earlyBird)),
      savePercent:    c.pricing.regular > 0
        ? Math.round((c.pricing.regular - c.pricing.earlyBird) / c.pricing.regular * 100) : 0
    },
    scheduleShort: c.schedule.days + ' · ' + c.schedule.time
  };
  return c;
}

function cohortLabel(n) {
  n = Number(n) || 1;
  return 'Cohort ' + (n < 10 ? '0' + n : String(n));
}
function money(n) {
  n = Number(n) || 0;
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}
function moneyShort(n) {
  n = Number(n) || 0;
  if (n >= 1000000) {
    var m = n / 1000000;
    return (Math.round(m * 10) / 10).toString().replace('.', ',') + 'M';
  }
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(n);
}
function nowVN() {
  return Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy HH:mm');
}

// ─────────────────────────────────────────────────────────────
// 3. GOOGLE SHEET — LƯU ĐĂNG KÝ
// ─────────────────────────────────────────────────────────────
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function regSheet() {
  var sh = ss().getSheetByName(SHEET_REGS);
  if (!sh) {
    sh = ss().insertSheet(SHEET_REGS);
    sh.appendRow(REG_HEADERS);
    sh.getRange(1, 1, 1, REG_HEADERS.length)
      .setFontWeight('bold').setBackground('#111').setFontColor('#00c896');
    sh.setFrozenRows(1);
  }
  return sh;
}

function allRegs() {
  var sh = regSheet();
  if (sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, REG_HEADERS.length).getValues();
  return vals.map(function (r, i) {
    return {
      row: i + 2,
      id: String(r[0]), time: String(r[1]), cohort: String(r[2]),
      name: String(r[3]), phone: String(r[4]), year: String(r[5]),
      email: String(r[6]), job: String(r[7]), goal: String(r[8]),
      source: String(r[9]), status: String(r[10] || 'pending'), note: String(r[11])
    };
  });
}

/** Chỉ đếm đăng ký của cohort hiện tại và chưa bị từ chối. */
function countRegs(preloaded) {
  var label = cohortLabel(getConfig().cohort.number);
  return (preloaded || allRegs()).filter(function (r) {
    return r.cohort === label && r.status !== 'rejected';
  }).length;
}

function findReg(idOrPhone) {
  var s = String(idOrPhone).trim();
  var list = allRegs();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === s || normPhone(list[i].phone) === normPhone(s)) return list[i];
  }
  return null;
}
function normPhone(p) { return String(p).replace(/\D/g, ''); }

function setRegStatus(reg, status) {
  regSheet().getRange(reg.row, 11).setValue(status);
  return status;
}

// ─────────────────────────────────────────────────────────────
// 4. WEB ENDPOINTS
// ─────────────────────────────────────────────────────────────
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** GET ?action=config  → landing page gọi cái này khi load */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'config';

  if (action === 'config') return json({ ok: true, config: publicConfig() });

  if (action === 'regs') {
    if (p.key !== props().getProperty(PROP_ADMINKEY)) {
      return json({ ok: false, error: 'unauthorized' });
    }
    return json({ ok: true, regs: allRegs(), config: publicConfig() });
  }

  return json({ ok: false, error: 'unknown action' });
}

/**
 * POST — hai loại request đi chung một endpoint:
 *   • Telegram gọi webhook  → body có update_id
 *   • Landing page gửi form → body có action:'register'
 * Client gửi Content-Type: text/plain để tránh CORS preflight.
 */
/**
 * Telegram gửi lại đúng update đó nếu không nhận được phản hồi kịp.
 * Apps Script chạy chậm (mở Sheet, gọi API) nên chuyện này xảy ra thường xuyên,
 * và mỗi lần gửi lại là bot nhắn thêm một tin — thành vòng lặp spam.
 * Nhớ update_id đã xử lý trong cache 6 tiếng để bỏ qua các lần gửi lại.
 */
function daXuLy(updateId) {
  try {
    var cache = CacheService.getScriptCache();
    var key = 'tgu_' + updateId;
    if (cache.get(key)) return true;
    cache.put(key, '1', 21600);          // 6 giờ, mức tối đa của CacheService
    return false;
  } catch (err) {
    return false;                        // cache lỗi thì vẫn xử lý, thà trùng còn hơn mất
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }

  if (body.update_id !== undefined) {
    if (!daXuLy(body.update_id)) handleTelegram(body);
    return json({ ok: true });
  }

  if (body.action === 'register') return json(handleRegister(body));

  return json({ ok: false, error: 'unknown action' });
}

// ─────────────────────────────────────────────────────────────
// 5. XỬ LÝ ĐĂNG KÝ
// ─────────────────────────────────────────────────────────────
function handleRegister(d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return { ok: false, error: 'busy' }; }

  try {
    // ô bẫy: người thật để trống, bot điền. Trả ok để bot không biết bị chặn.
    if (String(d.website || '').trim()) return { ok: true, id: 'spam' };

    var name  = String(d.name  || '').trim();
    var phone = String(d.phone || '').trim();
    if (!name || !phone) return { ok: false, error: 'missing_fields' };
    if (normPhone(phone).length < 9) return { ok: false, error: 'invalid_phone' };

    var cfg   = getConfig();
    var label = cohortLabel(cfg.cohort.number);

    // chống đăng ký trùng trong cùng cohort
    var dup = allRegs().filter(function (r) {
      return r.cohort === label && normPhone(r.phone) === normPhone(phone);
    })[0];
    if (dup) {
      return { ok: true, duplicate: true, config: publicConfig(),
               message: 'Số điện thoại này đã có trong danh sách rồi nhé!' };
    }

    var id = 'R' + Utilities.formatDate(new Date(), 'GMT+7', 'yyMMddHHmmss');
    regSheet().appendRow([
      id, nowVN(), label, name, "'" + phone,
      String(d.year || ''), String(d.email || ''), String(d.job || ''),
      String(d.goal || ''), String(d.source || 'web'), 'pending', ''
    ]);

    var pub = publicConfig();
    notifyNewReg({ id: id, name: name, phone: phone, year: d.year, email: d.email,
                   job: d.job, goal: d.goal }, pub);

    // Đủ chỗ → tự chuyển trạng thái sang full và báo admin
    if (pub.computed.remaining <= 0 && cfg.cohort.status === 'open') {
      cfg.cohort.status = 'full';
      saveConfig(cfg);
      tgSend(adminIds()[0],
        '🎉 *' + pub.computed.cohortLabel + ' ĐÃ ĐỦ ' + cfg.slots.max + ' NGƯỜI!*\n\n' +
        'Web đã tự chuyển sang trạng thái *đã đủ chỗ* — người vào sau sẽ đăng ký waitlist ' +
        pub.computed.nextCohortLabel + '.\n\n' +
        'Khi muốn mở cohort mới, gõ /cohortmoi (không cần sửa code).');
    }

    return { ok: true, id: id, config: publicConfig() };
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────────────────────
// 6. TELEGRAM — HẠ TẦNG
// ─────────────────────────────────────────────────────────────
function token()    { return props().getProperty(PROP_TOKEN) || ''; }
function adminIds() {
  return String(props().getProperty(PROP_ADMIN) || '')
    .split(',').map(function (s) { return s.trim(); }).filter(String);
}
function isAdmin(id) { return adminIds().indexOf(String(id)) !== -1; }

function tgApi(method, payload) {
  if (!token()) return null;
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token() + '/' + method, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText());
  } catch (err) { return null; }
}

function tgSend(chatId, text, keyboard) {
  if (!chatId) return;
  var p = { chat_id: chatId, text: text, parse_mode: 'Markdown',
            disable_web_page_preview: true };
  if (keyboard) p.reply_markup = { inline_keyboard: keyboard };
  var r = tgApi('sendMessage', p);
  // Markdown lệch (thiếu một dấu ` hoặc *) khiến Telegram từ chối CẢ tin nhắn,
  // nhìn từ ngoài giống hệt "bot không trả lời". Gửi lại dạng chữ thường.
  if (r && r.ok === false) {
    delete p.parse_mode;
    p.text = String(text).replace(/[`*_]/g, '');
    r = tgApi('sendMessage', p);
  }
  return r;
}

function tgAnswer(cbId, text) {
  return tgApi('answerCallbackQuery', { callback_query_id: cbId, text: text || '' });
}

function notifyNewReg(r, pub) {
  var lines = [
    '🔔 *Đăng ký mới — ' + pub.computed.cohortLabel + '*',
    '',
    '👤 *' + r.name + '*',
    '📱 `' + r.phone + '`',
    '🎂 ' + (r.year || '—'),
    '💼 ' + (r.job || '—')
  ];
  if (r.email) lines.push('✉️ ' + r.email);
  if (r.goal)  lines.push('🎯 _"' + r.goal + '"_');
  lines.push('');
  lines.push('📅 ' + pub.schedule.detail);
  lines.push('🕐 ' + nowVN());
  lines.push('');
  lines.push('📊 *' + pub.computed.totalRegistered + '/' + pub.slots.max +
             ' chỗ* · còn *' + pub.computed.remaining + '* suất');

  var kb = [[
    { text: '✅ Duyệt',   callback_data: 'ok:'  + r.id },
    { text: '❌ Từ chối', callback_data: 'no:'  + r.id }
  ]];

  adminIds().forEach(function (id) { tgSend(id, lines.join('\n'), kb); });
}

// ─────────────────────────────────────────────────────────────
// 7. TELEGRAM — ROUTER
// ─────────────────────────────────────────────────────────────
function handleTelegram(u) {
  if (u.callback_query) return handleCallback(u.callback_query);
  if (!u.message || !u.message.text) return;

  var chatId = u.message.chat.id;
  var text   = String(u.message.text).trim();

  if (!isAdmin(chatId)) {
    tgSend(chatId, 'Bot này chỉ dành cho quản trị elevaTO.\n\nChat ID của bạn: `' +
                   chatId + '`');
    return;
  }

  var m    = text.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?\s*([\s\S]*)$/);
  var cmd  = m ? m[1].toLowerCase() : '';
  var args = m ? m[2].trim() : '';

  switch (cmd) {
    case 'start':
    case 'menu':
    case 'help':      return cmdMenu(chatId);
    case 'status':
    case 'trangthai': return cmdStatus(chatId);

    case 'slots':     cmd = 'slot';   /* rơi xuống nhánh dưới */
    case 'cohort':
    case 'slot':
    case 'base':
    case 'giasom':
    case 'giagoc':
    case 'giatuhoc':  return cmdSetVal(chatId, args, cmd);

    case 'lich':      return cmdSchedule(chatId, args);
    case 'buoi':      return cmdSessions(chatId, args);

    case 'mo':        return cmdStatusSet(chatId, 'open');
    case 'day':
    case 'dayroi':    return cmdStatusSet(chatId, 'full');
    case 'dong':      return cmdStatusSet(chatId, 'closed');

    case 'thongbao':    return cmdAnnounce(chatId, args, false);
    case 'xoathongbao': return cmdAnnounce(chatId, '', true);

    case 'cohortmoi': return cmdNewCohort(chatId);

    case 'video':     return cmdVideo(chatId, args, false);
    case 'xoavideo':  return cmdVideo(chatId, '', true);
    case 'slide':
    case 'model':     return cmdToggle(chatId, args, cmd);

    case 'ds':
    case 'dsdangky':  return cmdList(chatId, args);
    case 'duyet':     return cmdApprove(chatId, args, 'approved', '/duyet');
    case 'tuchoi':    return cmdApprove(chatId, args, 'rejected', '/tuchoi');
    case 'sheet':     return cmdSheet(chatId);
    case 'id':        return tgSend(chatId, 'Chat ID: `' + chatId + '`');
  }

  tgSend(chatId, 'Không hiểu lệnh `' + text + '`. Gõ /menu để xem danh sách lệnh.');
}

function handleCallback(cb) {
  var chatId = cb.message.chat.id;
  var data   = String(cb.data || '');
  if (!isAdmin(chatId)) return tgAnswer(cb.id, 'Không có quyền');

  var p = data.split(':');
  var act = p[0], val = p[1];

  if (act === 'ok' || act === 'no') {
    var reg = findReg(val);
    if (!reg) return tgAnswer(cb.id, 'Không tìm thấy');
    setRegStatus(reg, act === 'ok' ? 'approved' : 'rejected');
    tgAnswer(cb.id, act === 'ok' ? 'Đã duyệt' : 'Đã từ chối');
    tgApi('editMessageReplyMarkup', {
      chat_id: chatId, message_id: cb.message.message_id,
      reply_markup: { inline_keyboard: [[{
        text: (act === 'ok' ? '✅ Đã duyệt — ' : '❌ Đã từ chối — ') + reg.name,
        callback_data: 'noop'
      }]] }
    });
    return;
  }

  if (act === 'st') { tgAnswer(cb.id); return cmdStatus(chatId); }

  if (act === 'adj') {          // adj:<lệnh>:<bước> — nút +/- trên thẻ gợi ý
    var spec = NUMCMD[p[1]];
    if (!spec) return tgAnswer(cb.id);
    var cf = getConfig();
    var moi = Math.max(0, (Number(getPath(cf, spec.path)) || 0) + Number(p[2]));
    setPath(cf, spec.path, moi);
    saveConfig(cf);
    tgAnswer(cb.id, spec.label + ': ' + docSo(spec, moi));
    tgApi('editMessageText', {
      chat_id: chatId, message_id: cb.message.message_id, parse_mode: 'Markdown',
      text: '✅ ' + spec.label + ' = *' + docSo(spec, moi) + '*\n\nWeb sẽ cập nhật trong ~1 phút.',
      reply_markup: { inline_keyboard: [[
        { text: '➖ ' + moneyStep(spec), callback_data: 'adj:' + p[1] + ':-' + spec.step },
        { text: '➕ ' + moneyStep(spec), callback_data: 'adj:' + p[1] + ':' + spec.step }]] }
    });
    return;
  }

  if (act === 'tog') {          // tog:<slide|model>
    var ts = TOGCMD[p[1]];
    if (!ts) return tgAnswer(cb.id);
    tgAnswer(cb.id);
    return datToggle(chatId, p[1], !getPath(getConfig(), ts.path));
  }

  if (act === 'set') {          // set:<path>:<delta>
    var cfg = getConfig();
    var cur = Number(getPath(cfg, p[1])) || 0;
    setPath(cfg, p[1], Math.max(0, cur + Number(p[2])));
    saveConfig(cfg);
    tgAnswer(cb.id, 'Đã cập nhật');
    return cmdStatus(chatId);
  }

  if (act === 'stt') {          // stt:<open|full|closed>
    var c2 = getConfig();
    c2.cohort.status = p[1];
    saveConfig(c2);
    tgAnswer(cb.id, 'Đã đổi trạng thái');
    return cmdStatus(chatId);
  }

  tgAnswer(cb.id);
}

function getPath(o, path) {
  return path.split('.').reduce(function (a, k) { return a ? a[k] : undefined; }, o);
}
function setPath(o, path, v) {
  var ks = path.split('.'), last = ks.pop();
  var t = ks.reduce(function (a, k) { return a[k]; }, o);
  t[last] = v;
}

// ─────────────────────────────────────────────────────────────
// 8. TELEGRAM — CÁC LỆNH
// ─────────────────────────────────────────────────────────────

// Lệnh có kèm giá trị. Một bảng dùng chung cho router, cho phần gợi ý
// khi bấm lệnh trơn, và cho nút +/- trên thẻ gợi ý.
var NUMCMD = {
  cohort:   { path: 'cohort.number',      label: 'Cohort',                 ex: '/cohort 8',          step: 1 },
  slot:     { path: 'slots.max',          label: 'Tổng số chỗ',            ex: '/slot 12',           step: 1 },
  base:     { path: 'slots.base',         label: 'Đăng ký ngoài hệ thống', ex: '/base 4',            step: 1 },
  giasom:   { path: 'pricing.earlyBird',  label: 'Giá Early Bird',         ex: '/giasom 3000000',    step: 100000, money: true },
  giagoc:   { path: 'pricing.regular',    label: 'Giá gốc',                ex: '/giagoc 4000000',    step: 100000, money: true },
  giatuhoc: { path: 'pricing.selfPaced',  label: 'Giá Self-paced',         ex: '/giatuhoc 1500000',  step: 100000, money: true }
};

var TOGCMD = {
  slide: { path: 'media.showSlides', label: 'Mục slide bài giảng' },
  model: { path: 'media.showModel',  label: 'Mục model bàn giao' }
};

// Thẻ trả lời khi bấm một lệnh trơn (không kèm giá trị). Cho thấy giá trị
// đang dùng và câu lệnh mẫu — bấm vào dòng mẫu là Telegram copy sẵn.
function cmdHint(chatId, cmd, cur, example, note, keyboard) {
  var t = '⚙️ ' + cur + '\n\n' +
          'Muốn đổi thì bấm dòng dưới để copy, dán vào ô chat rồi sửa giá trị:\n' +
          '`' + example + '`';
  if (note) t += '\n\n_' + note + '_';
  tgSend(chatId, t, keyboard);
}

function cmdMenu(chatId) {
  var t = [
    '⚙️ *elevaTO — Bảng điều khiển*',
    '_Mọi thay đổi ở đây tự động hiện lên web trong ~1 phút._',
    '',
    '👉 Lệnh không có số phía sau (`/status`, `/mo`, `/cohortmoi`…) thì *bấm là chạy*.',
    'Lệnh có số phía sau thì phải *gõ cả số*: bấm `/giasom` chỉ gửi mỗi chữ ' +
      '`/giasom`, bot sẽ hiện giá đang dùng kèm dòng mẫu — bấm dòng mẫu để copy, ' +
      'dán vào ô chat rồi sửa số là xong.',
    '',
    '*📊 Xem*',
    '/status — tình trạng hiện tại',
    '/ds — danh sách đăng ký (`/ds cho` để lọc chờ duyệt)',
    '/sheet — link Google Sheet',
    '',
    '*🔢 Cohort & chỗ*',
    '/cohort `8` — đổi sang Cohort 08',
    '/slot `12` — tổng số chỗ mỗi cohort',
    '/base `4` — số người đăng ký ngoài hệ thống',
    '/cohortmoi — mở cohort kế tiếp (tự +1, reset đếm)',
    '',
    '*💰 Học phí*',
    '/giasom `3000000` — giá Early Bird',
    '/giagoc `4000000` — giá gốc (giá gạch)',
    '/giatuhoc `1500000` — giá Self-paced',
    '',
    '*📅 Lịch học*',
    '/lich `Thứ 7 & CN | 9h–11h sáng`',
    '/buoi `8 5 3` — tổng buổi, lý thuyết, thực hành',
    '',
    '*🚦 Trạng thái*',
    '/mo — đang mở đăng ký',
    '/day — đã đủ chỗ (chuyển sang waitlist)',
    '/dong — đóng đăng ký',
    '',
    '*🎬 Nội dung trên web*',
    '/video `<link YouTube hoặc Drive>` — bật video học thử',
    '/xoavideo — ẩn video',
    '/slide `on` hoặc `off` — mục slide bài giảng',
    '/model `on` hoặc `off` — mục model bàn giao',
    '',
    '*📢 Thông báo trên web*',
    '/thongbao `Khai giảng 15/09` — hiện banner đầu trang',
    '/xoathongbao — tắt banner',
    '',
    '*✅ Duyệt*',
    '/duyet `R2508241030` hoặc `/duyet 0901234567`',
    '/tuchoi `<id hoặc sđt>`'
  ].join('\n');
  tgSend(chatId, t, [[{ text: '📊 Xem tình trạng', callback_data: 'st:' }]]);
}

function cmdStatus(chatId) {
  var all = allRegs();                   // đọc sheet đúng một lần
  var c = publicConfig(all);
  var regs = all.filter(function (r) { return r.cohort === c.computed.cohortLabel; });
  var pend = regs.filter(function (r) { return r.status === 'pending'; }).length;
  var appr = regs.filter(function (r) { return r.status === 'approved'; }).length;

  var bar = '';
  var filled = Math.round(c.computed.percent / 10);
  for (var i = 0; i < 10; i++) bar += (i < filled ? '█' : '░');

  var statusText = { open: '🟢 Đang mở đăng ký',
                     full: '🟡 Đã đủ chỗ — nhận waitlist',
                     closed: '🔴 Đã đóng' }[c.cohort.status] || c.cohort.status;

  var t = [
    '📊 *' + c.computed.cohortLabel + '* · ' + statusText,
    '',
    '`' + bar + '` ' + c.computed.percent + '%',
    '👥 *' + c.computed.totalRegistered + '/' + c.slots.max + '* chỗ · còn *' +
      c.computed.remaining + '* suất',
    '   ├ ngoài hệ thống: ' + c.slots.base,
    '   └ qua web: ' + c.slots.registered + '  (⏳ ' + pend + ' chờ · ✅ ' + appr + ' duyệt)',
    '',
    '💰 Early Bird *' + c.computed.price.earlyBird + '*  (gốc ~' +
      c.computed.price.regular + '~, tiết kiệm ' + c.computed.price.savePercent + '%)',
    '   Self-paced: ' + c.computed.price.selfPaced +
      (c.pricing.showSelfPaced ? '' : ' _(đang ẩn)_'),
    '',
    '📅 ' + c.schedule.detail,
    '📚 ' + c.schedule.sessions + ' buổi (' + c.schedule.theory + ' lý thuyết + ' +
      c.schedule.practice + ' thực hành)',
    '🎓 Đã hoàn thành: ' + c.stats.cohortsDone + ' cohort',
    '',
    '🎬 Video học thử: ' + (c.media.videoUrl ? '✅ đang bật' : '— chưa có'),
    '🖼 Slide: ' + (c.media.showSlides ? 'hiện' : 'ẩn') +
      '  ·  Model: ' + (c.media.showModel ? 'hiện' : 'ẩn'),
    c.announcement.show ? '\n📢 Banner: _' + c.announcement.text + '_' : '',
    '',
    '_Cập nhật lúc ' + (c.updatedAt || '—') + '_'
  ].filter(String).join('\n');

  tgSend(chatId, t, [
    [{ text: '➖ chỗ', callback_data: 'set:slots.max:-1' },
     { text: '➕ chỗ', callback_data: 'set:slots.max:1' },
     { text: '🔄',     callback_data: 'st:' }],
    [{ text: '🟢 Mở',  callback_data: 'stt:open' },
     { text: '🟡 Đủ',  callback_data: 'stt:full' },
     { text: '🔴 Đóng',callback_data: 'stt:closed' }]
  ]);
}

function docSo(spec, v) {
  if (spec.money) return money(v);
  if (spec.path === 'cohort.number') return v + ' (' + cohortLabel(v) + ')';
  return String(v);
}

// Chấp nhận 3000000, 3.000.000, 3tr, 3M, 500k
function docTien(args) {
  var raw = String(args).toLowerCase().replace(/[.,\s]/g, '');
  if (/^\d+(tr|m)$/.test(raw)) return parseFloat(raw) * 1000000;
  if (/^\d+k$/.test(raw))      return parseFloat(raw) * 1000;
  return parseInt(raw.replace(/\D/g, ''), 10);
}

function cmdSetVal(chatId, args, cmd) {
  var spec = NUMCMD[cmd];
  var cfg  = getConfig();

  // Bấm lệnh trơn trong menu: Telegram chỉ gửi đúng chữ "/giasom", không kèm
  // con số phía sau. Trả về thẻ hướng dẫn thay vì câu báo lỗi cụt lủn.
  if (!String(args).trim()) {
    return cmdHint(chatId, cmd,
      spec.label + ' đang là *' + docSo(spec, getPath(cfg, spec.path)) + '*', spec.ex,
      spec.money ? 'Gõ tắt cũng được: `3tr` `3M` `500k`' : '',
      [[{ text: '➖ ' + moneyStep(spec), callback_data: 'adj:' + cmd + ':-' + spec.step },
        { text: '➕ ' + moneyStep(spec), callback_data: 'adj:' + cmd + ':' + spec.step }]]);
  }

  var n = spec.money ? docTien(args) : parseInt(String(args).replace(/\D/g, ''), 10);
  if (isNaN(n) || n < 0) {
    return cmdHint(chatId, cmd, 'Không đọc được giá trị `' + args + '`', spec.ex);
  }

  setPath(cfg, spec.path, n);
  saveConfig(cfg);
  tgSend(chatId, '✅ ' + spec.label + ' = *' + docSo(spec, n) + '*\n\nWeb sẽ cập nhật trong ~1 phút.');
}

function moneyStep(spec) {
  return spec.money ? moneyShort(spec.step) : String(spec.step);
}

function cmdSchedule(chatId, args) {
  if (!args) {
    var sc = getConfig().schedule;
    return cmdHint(chatId, 'lich', 'Lịch học đang là *' + sc.days + ' · ' + sc.time + '*',
                   '/lich ' + sc.days + ' | ' + sc.time,
                   'Ngày và giờ ngăn cách bởi dấu gạch đứng');
  }
  var parts = args.split('|');
  var cfg = getConfig();
  cfg.schedule.days = parts[0].trim();
  if (parts[1]) cfg.schedule.time = parts[1].trim();
  cfg.schedule.detail = cfg.schedule.days + ', ' + cfg.schedule.time + ' (GMT+7, Việt Nam)';
  saveConfig(cfg);
  tgSend(chatId, '✅ Lịch học: *' + cfg.schedule.days + ' · ' + cfg.schedule.time + '*');
}

function cmdSessions(chatId, args) {
  var n = String(args).match(/\d+/g);
  if (!n || n.length < 3) {
    var sb = getConfig().schedule;
    return cmdHint(chatId, 'buoi',
      'Đang là *' + sb.sessions + ' buổi* (' + sb.theory + ' lý thuyết + ' +
        sb.practice + ' thực hành)',
      '/buoi ' + sb.sessions + ' ' + sb.theory + ' ' + sb.practice,
      'Ba số theo thứ tự: tổng, lý thuyết, thực hành');
  }
  var cfg = getConfig();
  cfg.schedule.sessions = +n[0];
  cfg.schedule.theory   = +n[1];
  cfg.schedule.practice = +n[2];
  saveConfig(cfg);
  tgSend(chatId, '✅ ' + n[0] + ' buổi (' + n[1] + ' lý thuyết + ' + n[2] + ' thực hành)');
}

function cmdStatusSet(chatId, st) {
  var cfg = getConfig();
  cfg.cohort.status = st;
  saveConfig(cfg);
  var msg = { open: '🟢 Đã *mở* đăng ký.',
              full: '🟡 Đã đánh dấu *đủ chỗ* — web chuyển sang nhận waitlist.',
              closed: '🔴 Đã *đóng* đăng ký — nút đăng ký trên web bị vô hiệu hoá.' }[st];
  tgSend(chatId, msg);
}

function cmdAnnounce(chatId, text, choXoa) {
  if (!String(text || '').trim() && !choXoa) {
    var c0 = getConfig().announcement;
    return cmdHint(chatId, 'thongbao',
      c0.show ? 'Banner đang hiện:\n_' + c0.text + '_' : 'Web *không có* banner nào',
      '/thongbao Khai giảng 15/09',
      'Muốn tắt banner thì dùng /xoathongbao');
  }
  var cfg = getConfig();
  cfg.announcement.text = text;
  cfg.announcement.show = !!text;
  saveConfig(cfg);
  tgSend(chatId, text ? '📢 Banner đã bật:\n_' + text + '_' : '✅ Đã tắt banner thông báo.');
}

function cmdNewCohort(chatId) {
  var cfg = getConfig();
  var old = cohortLabel(cfg.cohort.number);
  cfg.cohort.number = Number(cfg.cohort.number) + 1;
  cfg.cohort.status = 'open';
  cfg.slots.base = 0;
  cfg.stats.cohortsDone = Number(cfg.stats.cohortsDone) + 1;
  saveConfig(cfg);
  tgSend(chatId,
    '🚀 Đã mở *' + cohortLabel(cfg.cohort.number) + '*\n\n' +
    '• ' + old + ' được lưu lại trong Sheet (không mất dữ liệu)\n' +
    '• Bộ đếm reset về 0, trạng thái 🟢 mở\n' +
    '• Số cohort đã hoàn thành: ' + cfg.stats.cohortsDone + '\n\n' +
    'Web tự cập nhật — *không cần sửa dòng code nào.*');
  cmdStatus(chatId);
}

function cmdList(chatId, filter) {
  var label = cohortLabel(getConfig().cohort.number);
  var list = allRegs().filter(function (r) { return r.cohort === label; });
  if (filter) {
    var f = filter.toLowerCase();
    if (f.indexOf('cho') === 0)   list = list.filter(function (r) { return r.status === 'pending'; });
    if (f.indexOf('duyet') === 0) list = list.filter(function (r) { return r.status === 'approved'; });
  }
  if (!list.length) return tgSend(chatId, 'Chưa có đăng ký nào cho ' + label + '.');

  var icon = { pending: '⏳', approved: '✅', rejected: '❌' };
  var out = ['📋 *' + label + '* — ' + list.length + ' đăng ký', ''];
  list.slice(-25).forEach(function (r, i) {
    out.push((i + 1) + '. ' + (icon[r.status] || '•') + ' *' + r.name + '* · `' +
             r.phone + '`\n   ' + (r.job || '—') + ' · `' + r.id + '`');
  });
  if (list.length > 25) out.push('\n_Hiển thị 25 gần nhất. Xem đầy đủ: /sheet_');
  tgSend(chatId, out.join('\n'));
}

function cmdApprove(chatId, args, status, cmd) {
  if (!args) {
    tgSend(chatId, 'Cần kèm id hoặc số điện thoại, ví dụ `' + cmd + ' 0901234567`.\n' +
                   'Dưới đây là các đăng ký đang chờ:');
    return cmdList(chatId, 'cho');
  }
  var reg = findReg(args);
  if (!reg) return tgSend(chatId, 'Không tìm thấy đăng ký `' + args + '`.');
  setRegStatus(reg, status);
  tgSend(chatId, (status === 'approved' ? '✅ Đã duyệt ' : '❌ Đã từ chối ') +
                 '*' + reg.name + '* · `' + reg.phone + '`');
}

function cmdVideo(chatId, url, choXoa) {
  url = String(url || '').trim();
  // Bấm "/video" trơn trong menu chỉ gửi đúng chữ đó. Trước đây nó rơi vào
  // nhánh xoá và làm mất luôn mục học thử trên web — nay chỉ hiện hướng dẫn.
  if (!url && !choXoa) {
    var dang = getConfig().media.videoUrl;
    return cmdHint(chatId, 'video',
      dang ? 'Video học thử đang dùng:\n`' + dang + '`' : 'Web *chưa có* video học thử',
      '/video https://drive.google.com/file/d/XXXX/view',
      'Muốn gỡ video khỏi web thì dùng /xoavideo');
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return tgSend(chatId, 'Link phải bắt đầu bằng http:// hoặc https://\n\n' +
      'Ví dụ:\n`/video https://youtu.be/abc123xyz90`\n' +
      '`/video https://drive.google.com/file/d/XXXX/view`');
  }
  var cfg = getConfig();
  cfg.media.videoUrl = url;
  saveConfig(cfg);
  if (!url) return tgSend(chatId, '✅ Đã ẩn mục video học thử trên web.');
  var kind = url.indexOf('youtu') > -1 ? 'YouTube'
           : url.indexOf('drive.google') > -1 ? 'Google Drive' : 'link nhúng';
  tgSend(chatId, '🎬 Đã bật video học thử (' + kind + ').\n\n' +
    'Web sẽ hiện mục *Học thử* trong ~1 phút.\n\n' +
    '_Lưu ý: video trên Google Drive phải để quyền "Bất kỳ ai có đường liên kết" thì người xem mới thấy._');
}

function cmdToggle(chatId, args, cmd) {
  var spec = TOGCMD[cmd];
  var a = String(args || '').trim().toLowerCase();
  var on;
  if (['on', 'bat', 'bật', '1', 'hien', 'hiện'].indexOf(a) > -1) on = true;
  else if (['off', 'tat', 'tắt', '0', 'an', 'ẩn'].indexOf(a) > -1) on = false;
  else {
    var dang = getPath(getConfig(), spec.path);
    return cmdHint(chatId, cmd, spec.label + ' đang *' + (dang ? 'hiện' : 'ẩn') + '* trên web',
      '/' + cmd + (dang ? ' off' : ' on'), '',
      [[{ text: dang ? '🙈 Ẩn đi' : '👁 Hiện lên', callback_data: 'tog:' + cmd }]]);
  }
  return datToggle(chatId, cmd, on);
}

function datToggle(chatId, cmd, on) {
  var spec = TOGCMD[cmd];
  var cfg = getConfig();
  setPath(cfg, spec.path, on);
  saveConfig(cfg);
  tgSend(chatId, (on ? '👁 Đã hiện ' : '🙈 Đã ẩn ') + spec.label + ' trên web.');
}

function cmdSheet(chatId) {
  tgSend(chatId, '📄 [Mở Google Sheet](' + ss().getUrl() + ')');
}

// ─────────────────────────────────────────────────────────────
// 9. CÀI ĐẶT — chạy tay trong trình soạn thảo Apps Script
// ─────────────────────────────────────────────────────────────

/**
 * CHẠY MỘT LẦN LÀ XONG.
 *
 * Thứ tự đúng:
 *   1. Dán file này vào Apps Script của Google Sheet
 *   2. Điền 2 giá trị TOKEN và ADMIN ngay dưới đây
 *   3. Triển khai → Bản triển khai mới → Ứng dụng web
 *        · Thực thi với tư cách: Tôi
 *        · Ai có quyền truy cập: Bất kỳ ai        ← bắt buộc
 *   4. Quay lại đây, chọn hàm setup rồi bấm Run
 *
 * Hàm này tự làm hết: lưu token, tạo sheet, nạp cấu hình mặc định,
 * tự tìm URL web app và tự nối webhook Telegram.
 * Chạy lại nhiều lần cũng an toàn, cấu hình đang có sẽ không bị ghi đè.
 */
function setup() {
  var out = [];

  if (TG_TOKEN.indexOf('DAN_') === 0 || TG_ADMIN.indexOf('DAN_') === 0) {
    throw new Error('Chưa điền TG_TOKEN và TG_ADMIN ở đầu file. Kéo lên đầu, điền vào, rồi chạy lại setup.');
  }

  props().setProperty(PROP_TOKEN, TG_TOKEN.trim());
  props().setProperty(PROP_ADMIN, TG_ADMIN.trim());
  if (!props().getProperty(PROP_ADMINKEY)) {
    props().setProperty(PROP_ADMINKEY, Utilities.getUuid());
  }
  out.push('✔ Đã lưu token và chat id admin');

  if (!props().getProperty(PROP_CONFIG)) {
    saveConfig(defaultConfig());
    out.push('✔ Đã nạp cấu hình mặc định');
  } else {
    out.push('• Cấu hình đã có sẵn, giữ nguyên');
  }

  regSheet();
  out.push('✔ Sheet "' + SHEET_REGS + '" sẵn sàng');

  var me = tgApi('getMe', {});
  if (!me || !me.ok) {
    out.push('✘ Token không hợp lệ — kiểm tra lại với @BotFather rồi chạy lại setup');
    Logger.log(out.join('\n'));
    return;
  }
  out.push('✔ Bot: @' + me.result.username);

  var dsLenh = tgApi('setMyCommands', { commands: [
    { command: 'status',      description: '📊 Tình trạng cohort hiện tại' },
    { command: 'ds',          description: '📋 Danh sách đăng ký' },
    { command: 'sheet',       description: '📄 Link Google Sheet' },
    { command: 'cohort',      description: '🔢 Đổi số cohort — /cohort 8' },
    { command: 'slot',        description: '🪑 Tổng số chỗ — /slot 12' },
    { command: 'base',        description: '👥 Đăng ký ngoài hệ thống — /base 4' },
    { command: 'cohortmoi',   description: '🚀 Mở cohort kế tiếp' },
    { command: 'giasom',      description: '💰 Giá Early Bird — /giasom 3000000' },
    { command: 'giagoc',      description: '💰 Giá gốc — /giagoc 4000000' },
    { command: 'giatuhoc',    description: '💰 Giá Self-paced — /giatuhoc 1500000' },
    { command: 'lich',        description: '📅 Lịch học — /lich Thứ 7 & CN | 9h–11h' },
    { command: 'buoi',        description: '📚 Số buổi — /buoi 8 5 3' },
    { command: 'mo',          description: '🟢 Mở đăng ký' },
    { command: 'day',         description: '🟡 Đã đủ chỗ' },
    { command: 'dong',        description: '🔴 Đóng đăng ký' },
    { command: 'video',       description: '🎬 Đổi video học thử' },
    { command: 'xoavideo',    description: '🎬 Ẩn video học thử' },
    { command: 'slide',       description: '🖼 Hiện/ẩn mục slide' },
    { command: 'model',       description: '📈 Hiện/ẩn mục model' },
    { command: 'thongbao',    description: '📢 Bật banner — /thongbao Khai giảng 15/09' },
    { command: 'xoathongbao', description: '📢 Tắt banner' },
    { command: 'duyet',       description: '✅ Duyệt đăng ký — /duyet 0901234567' },
    { command: 'tuchoi',      description: '❌ Từ chối đăng ký' },
    { command: 'menu',        description: '⚙️ Bảng điều khiển' }
  ] });
  out.push(dsLenh && dsLenh.ok
    ? '✔ Đã nạp danh sách lệnh — nút Menu xanh hiện cạnh ô chat'
    : '• Không nạp được danh sách lệnh (không ảnh hưởng việc gõ lệnh tay)');

  // URL webhook. KHÔNG suy ra từ ScriptApp.getService().getUrl() được:
  // hàm đó trả URL /dev, mà /dev và /exec dùng hai loại ID khác nhau nên
  // không đổi qua lại bằng cách cắt chuỗi. Phải lấy URL /exec thật.
  var url = String(WEBAPP_URL || '').trim();

  if (url.indexOf('DAN_') === 0 || !url) {
    out.push('✘ Chưa điền WEBAPP_URL ở đầu file → bot sẽ KHÔNG trả lời lệnh nào');
    out.push('  Lấy URL ở: Triển khai → Quản lý bản triển khai → cột URL ứng dụng web');
  } else if (url.slice(-5) !== '/exec') {
    out.push('✘ WEBAPP_URL phải kết thúc bằng /exec, đang là: ' + url);
    out.push('  URL /dev không dùng được vì Telegram không đăng nhập được vào đó.');
  } else {
    var hook = tgApi('setWebhook', {
      url: url,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true          // xoá hàng chờ cũ, tránh bot nhắn lại loạt tin tồn
    });
    if (hook && hook.ok) {
      // hỏi lại Telegram để chắc chắn, không tin mỗi câu trả lời của lệnh set
      var chk = tgApi('getWebhookInfo', {});
      var live = chk && chk.ok ? chk.result.url : '';
      out.push(live === url ? '✔ Webhook đã nối và Telegram xác nhận'
                            : '⚠ Đã gửi lệnh nối nhưng Telegram báo URL: ' + (live || 'trống'));
    } else {
      out.push('✘ Nối webhook lỗi: ' + JSON.stringify(hook));
    }
  }

  out.push('');
  out.push('─── DÁN VÀO index.html, thay dòng bắt đầu bằng  var API =  ───');
  out.push("var API = '" + url + "';");
  out.push('');
  out.push('─── Xem danh sách đăng ký trên web ───');
  out.push('https://<tên-miền>/?admin=' + props().getProperty(PROP_ADMINKEY));
  out.push('');
  out.push('Xong. Vào Telegram nhắn bot /menu để kiểm tra.');

  Logger.log(out.join('\n'));
  tgSend(adminIds()[0],
    '✅ *Backend elevaTO đã sẵn sàng*\n\nBot: @' + me.result.username +
    '\n\nGõ /menu để xem danh sách lệnh.');
}

/** Kiểm tra sức khoẻ hệ thống — chạy bất cứ lúc nào. */
function kiemTra() {
  var out = [];
  var tk = token();
  if (!tk) {
    out.push('╔══════════════════════════════════════════════╗');
    out.push('║  CHƯA CHẠY setup()                           ║');
    out.push('║  Chọn hàm  setup  ở thanh trên rồi bấm Run.  ║');
    out.push('╚══════════════════════════════════════════════╝');
    out.push('');
  }
  out.push('Token: ' + (tk ? 'đã lưu' : '✘ chưa lưu'));
  out.push('Admin chat id: ' + (adminIds().join(', ') || '✘ chưa lưu'));

  var me = tgApi('getMe', {});
  out.push('Bot: ' + (me && me.ok ? '@' + me.result.username : '✘ token sai hoặc mạng lỗi'));

  var wh = tgApi('getWebhookInfo', {});
  if (wh && wh.ok) {
    var w = wh.result;
    out.push('Webhook: ' + (w.url || '✘ CHƯA NỐI — bot sẽ không trả lời lệnh nào'));
    if (w.url && w.url.slice(-5) !== '/exec') {
      out.push('  ⚠ URL không kết thúc bằng /exec, Telegram sẽ không gọi được');
    }
    if (w.pending_update_count) out.push('  Tin đang chờ xử lý: ' + w.pending_update_count);
    if (w.last_error_message) {
      out.push('  ✘ Lỗi gần nhất: ' + w.last_error_message);
      out.push('    lúc: ' + new Date(w.last_error_date * 1000));
    }
  } else {
    out.push('Webhook: không hỏi được (token sai hoặc mạng lỗi)');
  }

  var c = publicConfig();
  out.push('');
  out.push('Cohort: ' + c.computed.cohortLabel + ' · ' + c.cohort.status);
  out.push('Chỗ: ' + c.computed.totalRegistered + '/' + c.slots.max +
           ' (còn ' + c.computed.remaining + ')');
  out.push('Đăng ký trong sheet: ' + allRegs().length + ' dòng');
  out.push('Giá Early Bird: ' + c.computed.price.earlyBird);
  out.push('Video học thử: ' + (c.media.videoUrl || 'chưa đặt'));
  out.push('');
  var devUrl = '';
  try { devUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  out.push('URL từ getService(): ' + (devUrl || 'không có') +
           (devUrl.slice(-4) === '/dev' ? '   ← đây là URL /dev, KHÔNG dùng cho webhook được' : ''));
  out.push('WEBAPP_URL khai ở đầu file: ' + WEBAPP_URL);
  out.push('ADMIN_KEY: ' + props().getProperty(PROP_ADMINKEY));

  Logger.log(out.join('\n'));
}

/** Dùng khi setup không tự tìm được URL: dán URL /exec vào đây rồi Run. */
/** Dán URL /exec vào rồi Run — dùng khi setup không tự nối được webhook. */
function noiWebhook() {
  var url = String(WEBAPP_URL || '').trim();
  if (url.slice(-5) !== '/exec') {
    Logger.log('✘ WEBAPP_URL ở đầu file phải là URL kết thúc bằng /exec. Đang là: ' + url);
    return;
  }
  var r = tgApi('setWebhook', {
    url: url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  Logger.log(r && r.ok ? '✔ Đã nối webhook: ' + url : '✘ Lỗi: ' + JSON.stringify(r));
}

/**
 * DỪNG KHẨN CẤP — bot đang nhắn liên tục thì chạy hàm này.
 * Ngắt webhook và xoá sạch hàng chờ, bot im ngay lập tức.
 * Sửa xong thì chạy lại noiWebhook (hoặc setup) để nối lại.
 */
function dungBot() {
  var r = tgApi('deleteWebhook', { drop_pending_updates: true });
  Logger.log(r && r.ok
    ? '✔ Đã ngắt webhook và xoá hàng chờ. Bot sẽ im ngay.\n  Chạy noiWebhook() để nối lại.'
    : '✘ Lỗi: ' + JSON.stringify(r));
}

function xoaWebhook()   { Logger.log(JSON.stringify(tgApi('deleteWebhook', {}))); }
function xemAdminKey()  { Logger.log(props().getProperty(PROP_ADMINKEY)); }
function resetConfig()  { saveConfig(defaultConfig()); Logger.log('Đã reset cấu hình về mặc định.'); }
