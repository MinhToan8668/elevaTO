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
var PROP_OFFSET   = 'TG_OFFSET';       // vị trí đã đọc tới, dùng cho chế độ hỏi định kỳ
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
      years: '2.5+',         // /kinhnghiem 3+
      cohortsDone: 6,        // KHÔNG sửa tay: tự suy ra = số cohort hiện tại - 1
      students: '50+'
    },

    // Người dạy, liên hệ, thông tin công ty mẫu: KHÔNG để ở đây.
    // Bot không có lệnh nào sửa được chúng, nên chúng sống trong index.html.
    // Xem thêm ghi chú ở configChoWeb.

    announcement: {
      show: false,           // /thongbao <nội dung>  /xoathongbao
      text: ''
    },

    media: {
      videoUrl: 'https://drive.google.com/file/d/1NW1h_XqO_85XHf_Gl3YDNL5pnr0FNwE7/view',
      videoTitle: 'Buổi học thử — Buổi 1: Phân tích Bảng cân đối kế toán',
      showSlides: true,      // /slide on|off
      showModel: true        // /model on|off
    },

    dummy: null   // giữ chỗ, không dùng
  };
}

/**
 * Cấu hình gửi cho trang web.
 *
 * Chỉ gửi những gì bot sửa được. Mấy khối chữ như người dạy, liên hệ, thông
 * tin công ty mẫu thì sửa thẳng trong index.html — nếu backend cũng gửi
 * chúng thì bản lưu trong Script Properties sẽ ĐÈ LÊN bản trong index.html,
 * và sửa file bao nhiêu lần trang cũng không đổi. Đã dính đúng lỗi đó với
 * link TikTok và dòng chứng chỉ CFA.
 */
function configChoWeb(preloaded) {
  var c = publicConfig(preloaded);
  ['instructor', 'contact', 'company', 'dummy'].forEach(function (k) { delete c[k]; });
  delete c.pricing.note;
  delete c.stats.students;
  delete c.schedule.platform;
  delete c.cohort.openText;
  return c;
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

  // Cohort 08 đang chạy thì đã xong 7 cohort. Suy ra thay vì lưu rời, để đổi
  // số cohort bằng /cohort là con số này đi theo, không bao giờ lệch nhau.
  c.stats.cohortsDone = Math.max(0, Number(c.cohort.number) - 1);

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
    // Gói tự học (source có 'tuhoc') không chiếm suất lớp live
    return r.cohort === label && r.status !== 'rejected' &&
           String(r.source).indexOf('tuhoc') === -1;
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
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'config';

    if (action === 'config') return json({ ok: true, config: configChoWeb() });

    if (action === 'regs') {
      if (p.key !== props().getProperty(PROP_ADMINKEY)) {
        return json({ ok: false, error: 'unauthorized' });
      }
      return json({ ok: true, regs: allRegs(), config: configChoWeb() });
    }

    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    // Trang web bắt được ok:false thì tự dùng cấu hình dự phòng, còn ném lỗi
    // ra ngoài thì nó nhận về HTML và chết ở bước đọc JSON.
    ghiLoi('doGet', err);
    return json({ ok: false, error: 'internal' });
  }
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
  // Bọc TOÀN BỘ. Để một lỗi ném ra ngoài doPost là Apps Script trả về trang
  // báo lỗi của nó, mà nó phục vụ trang đó qua một lệnh chuyển hướng — Telegram
  // nhận "302 Found", kết luận webhook hỏng rồi ngừng gửi. Bot chết câm lặng
  // vì một lỗi lẻ ở đâu đó bên trong. Luôn trả về 200 tử tế.
  try {
    var body = {};
    try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }

    if (body.update_id !== undefined) {
      if (!daXuLy(body.update_id)) handleTelegram(body);
      return json({ ok: true });
    }

    if (body.action === 'register') return json(handleRegister(body));

    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    ghiLoi('doPost', err);
    return json({ ok: false, error: 'internal' });
  }
}

/** Ghi lỗi ra sheet Log để còn lần ra được, thay vì mất hút. */
function ghiLoi(cho, err) {
  var dong = cho + ': ' + err + (err && err.stack ? '\n' + err.stack : '');
  try { Logger.log(dong); } catch (e2) {}
  try {
    var sh = ss().getSheetByName(SHEET_LOG) || ss().insertSheet(SHEET_LOG);
    sh.appendRow([nowVN(), cho, String(err), String(err && err.stack || '')]);
  } catch (e3) {}
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
      return { ok: true, duplicate: true, config: configChoWeb(),
               message: 'Số điện thoại này đã có trong danh sách rồi nhé!' };
    }

    // Gói học: web mới gửi plan:'selfpaced' kèm source 'web-tuhoc'. Chuẩn hoá
    // để dù client gửi kiểu nào, cột Nguồn cũng nhận diện được gói tự học.
    var src = String(d.source || 'web');
    if (d.plan === 'selfpaced' && src.indexOf('tuhoc') === -1) src += '-tuhoc';
    var tuHoc = src.indexOf('tuhoc') > -1;

    var id = 'R' + Utilities.formatDate(new Date(), 'GMT+7', 'yyMMddHHmmss');
    regSheet().appendRow([
      id, nowVN(), label, name, "'" + phone,
      String(d.year || ''), String(d.email || ''), String(d.job || ''),
      String(d.goal || ''), src, 'pending', ''
    ]);

    var pub = publicConfig();
    notifyNewReg({ id: id, name: name, phone: phone, year: d.year, email: d.email,
                   job: d.job, goal: d.goal, tuHoc: tuHoc }, pub);

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

    return { ok: true, id: id, config: configChoWeb() };
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
  // Telegram chặn tin dài quá 4096 ký tự — /ds nhiều người là chạm ngay,
  // và tin bị chặn thì không có gì hiện ra cả. Cắt theo dòng cho an toàn.
  var manh = catNho(String(text), 3800);
  var r = null;
  for (var i = 0; i < manh.length; i++) {
    r = guiMotTin(chatId, manh[i], i === manh.length - 1 ? keyboard : null);
  }
  return r;
}

function guiMotTin(chatId, text, keyboard) {
  var p = { chat_id: chatId, text: text, parse_mode: 'Markdown',
            disable_web_page_preview: true };
  if (keyboard) p.reply_markup = { inline_keyboard: keyboard };
  var r = tgApi('sendMessage', p);
  // Markdown lệch (thiếu một dấu ` hoặc *, hay tên người có dấu _) khiến
  // Telegram từ chối CẢ tin nhắn — nhìn từ ngoài giống hệt "bot không trả lời".
  // Gửi lại dạng chữ thường để không tin nào mất trắng.
  if (r && r.ok === false) {
    delete p.parse_mode;
    p.text = String(text).replace(/[`*_]/g, '');
    r = tgApi('sendMessage', p);
  }
  return r;
}

function catNho(s, max) {
  if (s.length <= max) return [s];
  var out = [], cur = '';
  var dong = s.split('\n');
  for (var i = 0; i < dong.length; i++) {
    var d = dong[i];
    while (d.length > max) {                       // một dòng dài quá thì cắt cứng
      if (cur) { out.push(cur); cur = ''; }
      out.push(d.slice(0, max));
      d = d.slice(max);
    }
    if (cur && cur.length + d.length + 1 > max) { out.push(cur); cur = d; }
    else cur = cur ? cur + '\n' + d : d;
  }
  if (cur) out.push(cur);
  return out;
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
  if (r.tuHoc) lines.push('📦 Gói: *Tự học (self-paced)* — không tính vào số chỗ lớp live');
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

    case 'kinhnghiem':
    case 'nam':       return cmdYears(chatId, args);

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
    '_Số cohort đã hoàn thành tự bằng số cohort hiện tại trừ 1._',
    '',
    '*💰 Học phí*',
    '/giasom `3000000` — giá Early Bird',
    '/giagoc `4000000` — giá gốc (giá gạch)',
    '/giatuhoc `1500000` — giá Self-paced',
    '',
    '*📅 Lịch học & hồ sơ*',
    '/lich `Thứ 7 & CN | 9h–11h sáng`',
    '/buoi `8 5 3` — tổng buổi, lý thuyết, thực hành',
    '/kinhnghiem `3+` — số năm kinh nghiệm hiện đầu trang',
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

/** Số năm kinh nghiệm hiện trên dải chỉ số đầu trang. Nhận cả '3' lẫn '2.5+'. */
function cmdYears(chatId, args) {
  var v = String(args || '').trim();
  if (!v) {
    return cmdHint(chatId, 'kinhnghiem',
      'Số năm kinh nghiệm đang là *' + getConfig().stats.years + '*',
      '/kinhnghiem 3+', 'Viết sao hiện y vậy: `3`, `3+`, `2.5+` đều được');
  }
  if (!/^[0-9]+([.,][0-9]+)?\+?$/.test(v)) {
    return cmdHint(chatId, 'kinhnghiem', 'Không đọc được `' + v + '`',
                   '/kinhnghiem 3+', 'Chỉ nhận số, có thể kèm dấu `+` ở cuối');
  }
  var cfg = getConfig();
  cfg.stats.years = v;
  saveConfig(cfg);
  tgSend(chatId, '✅ Kinh nghiệm = *' + v + '* năm\n\nWeb sẽ cập nhật trong ~1 phút.');
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
  saveConfig(cfg);           // cohortsDone tự suy ra, không cộng tay ở đây
  tgSend(chatId,
    '🚀 Đã mở *' + cohortLabel(cfg.cohort.number) + '*\n\n' +
    '• ' + old + ' được lưu lại trong Sheet (không mất dữ liệu)\n' +
    '• Bộ đếm reset về 0, trạng thái 🟢 mở\n' +
    '• Số cohort đã hoàn thành: ' + Math.max(0, cfg.cohort.number - 1) + '\n\n' +
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
    { command: 'kinhnghiem',  description: '🎯 Năm kinh nghiệm — /kinhnghiem 3+' },
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

  // Bot KHÔNG dùng webhook nữa.
  //
  // Webhook bắt Telegram gọi ngược vào URL /exec, mà URL đó phụ thuộc vào bản
  // triển khai và quyền truy cập của nó — chỉ cần hộp thoại deploy đặt lại một
  // dòng là Telegram nhận về chuyển hướng 302 và im hẳn, không báo gì cho ta.
  // Chế độ hỏi định kỳ đi theo chiều ngược lại: script tự gọi ra Telegram, nên
  // không có URL nào để hỏng, không có quyền truy cập nào để đặt sai.
  // Ưu tiên webhook vì nó cho phản hồi tức thì. Chỉ nối khi đã tự thử và
  // thấy /exec thật sự trả 200 — nối bừa thì Telegram im lặng bỏ cuộc và bot
  // chết câm, đúng thứ đã xảy ra trước đây.
  var tucThi = false;
  if (webhookDungDuoc()) {
    try { goLichHoi(); } catch (e1) {}          // hai đường sẽ xử lý trùng
    var hook = tgApi('setWebhook', {
      url: String(WEBAPP_URL).trim(),
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    });
    tucThi = !!(hook && hook.ok);
  }

  if (tucThi) {
    out.push('✔ Đã nối webhook — bot trả lời TỨC THÌ');
    out.push('  Đã tự thử /exec trước khi nối và thấy trả về 200.');
    out.push('  Nếu sau này bot im, chạy  batCheDoHoi  để lùi về chế độ chậm mà chắc.');
    Logger.log(out.join('\n'));
    tgSend(adminIds()[0],
      '✅ *Backend elevaTO đã sẵn sàng*\n\nBot: @' + me.result.username +
      '\n\nGõ /menu để xem danh sách lệnh.');
    return;
  }

  out.push('• /exec chưa trả về 200 → không nối webhook (nối bừa thì bot sẽ câm)');
  out.push('  Thường là do bản đang triển khai vẫn là code cũ. Deploy phiên bản');
  out.push('  mới rồi chạy lại setup là có phản hồi tức thì.');
  out.push('  Chạy  kiemTraWebApp  để xem chi tiết.');
  out.push('');

  try {
    datLichHoi();
    out.push('✔ Tạm chạy bằng chế độ hỏi định kỳ (lịch chạy mỗi phút)');
    out.push('  Không dùng webhook → không dính lỗi 302 hay quyền truy cập.');
    out.push('  Tin đầu chờ tối đa 1 phút, các tin sau gần như tức thì.');
  } catch (err) {
    out.push('');
    out.push('┌──────────────────────────────────────────────────────────┐');
    out.push('│  CÒN ĐÚNG MỘT VIỆC: ĐẶT LỊCH CHẠY CHO BOT                │');
    out.push('└──────────────────────────────────────────────────────────┘');
    out.push('Mọi thứ khác đã xong. Webhook đã ngắt, token đã lưu, lệnh đã nạp.');
    out.push('');
    if (thieuQuyenLich(err)) {
      out.push(huongDanDatLichTay());
    } else {
      out.push('Lỗi: ' + err);
      out.push('');
      out.push(huongDanDatLichTay());
    }
  }

  // WEBAPP_URL giờ chỉ còn phục vụ landing page đọc cấu hình. Bot không cần nó.
  var url = String(WEBAPP_URL || '').trim();
  out.push('');
  if (url.slice(-5) === '/exec') {
    out.push('─── DÁN VÀO index.html, thay dòng bắt đầu bằng  var API =  ───');
    out.push("var API = '" + url + "';");
  } else {
    out.push('• WEBAPP_URL chưa đúng dạng /exec — bot vẫn chạy bình thường,');
    out.push('  chỉ landing page là chưa đọc được cấu hình từ đây.');
  }
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

  var polling = demLich();
  out.push('');
  out.push('Chế độ chạy: ' + (
    polling > 0 ? '✔ hỏi định kỳ (' + polling + ' lịch chạy mỗi phút) — chế độ chuẩn' :
    polling === 0 ? '✘ KHÔNG có lịch chạy nào → bot sẽ không nhận lệnh' :
    '? không đọc được danh sách lịch (thiếu quyền script.scriptapp)'));
  if (polling <= 0) {
    out.push('');
    out.push(huongDanDatLichTay());
    out.push('');
  }
  out.push('Đã đọc tới update: ' + (props().getProperty(PROP_OFFSET) || 'chưa có'));

  var wh = tgApi('getWebhookInfo', {});
  if (wh && wh.ok) {
    var w = wh.result;
    out.push('Webhook: ' + (w.url || 'không nối (đúng — chế độ hỏi không cần webhook)'));
    if (w.url && w.url.slice(-5) !== '/exec') {
      out.push('  ⚠ URL không kết thúc bằng /exec, Telegram sẽ không gọi được');
    }
    if (w.pending_update_count) out.push('  Tin đang chờ xử lý: ' + w.pending_update_count);
    if (w.last_error_message) {
      out.push('  ✘ Lỗi gần nhất: ' + w.last_error_message);
      out.push('    lúc: ' + new Date(w.last_error_date * 1000));
      out.push('    (lỗi cũ của webhook — không ảnh hưởng khi đang chạy chế độ hỏi)');
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
  // hai đường cùng chạy sẽ xử lý trùng mỗi lệnh hai lần
  try { goLichHoi(); } catch (err) { Logger.log('⚠ Không gỡ được lịch hỏi: ' + err); }
  var r = tgApi('setWebhook', {
    url: url,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  Logger.log(r && r.ok
    ? '✔ Đã nối webhook: ' + url + '\n' +
      '  Đã gỡ lịch hỏi định kỳ để tránh xử lý trùng.\n\n' +
      '  THỬ NGAY: nhắn /menu cho bot, phải trả lời trong một hai giây.\n' +
      '  Quá 30 giây không thấy gì → chạy  batCheDoHoi  để lùi về chế độ\n' +
      '  chậm mà chắc. Lúc này bot chỉ nghe qua webhook, không còn lịch hỏi.'
    : '✘ Lỗi: ' + JSON.stringify(r));
}

/**
 * DỪNG KHẨN CẤP — bot đang nhắn liên tục thì chạy hàm này.
 * Ngắt webhook và xoá sạch hàng chờ, bot im ngay lập tức.
 * Sửa xong thì chạy lại noiWebhook (hoặc setup) để nối lại.
 */
function dungBot() {
  var r = tgApi('deleteWebhook', { drop_pending_updates: true });
  var out = ['✔ Đã ngắt webhook (' + (r && r.ok ? 'ok' : JSON.stringify(r)) + ')'];
  try {
    out.push('✔ Đã gỡ ' + goLichHoi() + ' lịch chạy. Bot im ngay lập tức.');
    out.push('  Chạy  batCheDoHoi  để bật lại.');
  } catch (err) {
    out.push('✘ Không gỡ được lịch chạy bằng code.');
    out.push('  Gỡ tay: cột trái → biểu tượng đồng hồ → ba chấm ở dòng');
    out.push('  hoiTelegram → Xoá trình kích hoạt.');
  }
  Logger.log(out.join('\n'));
}

/**
 * Webhook có dùng được không: tự gọi /exec đúng kiểu Telegram gọi và xem
 * cuối cùng có ra 200 không.
 *
 * Apps Script LUÔN trả 302 rồi mới chuyển tới nội dung thật — chuyện đó bình
 * thường, Telegram đi theo được. Cái làm Telegram bó tay là khi chuyển hướng
 * dẫn tới trang báo lỗi thay vì câu trả lời, tức là doPost đã ném lỗi.
 * Nên phép thử đúng là đi theo chuyển hướng rồi xem mã cuối cùng.
 *
 * Lưu ý: hàm này thử bản ĐANG TRIỂN KHAI, không phải code trong trình soạn
 * thảo — đúng thứ Telegram sẽ gặp. Sửa code xong phải deploy phiên bản mới
 * thì kết quả ở đây mới đổi.
 */
function webhookDungDuoc() {
  var url = String(WEBAPP_URL || '').trim();
  if (url.slice(-5) !== '/exec') return false;
  try {
    // KHÔNG dùng followRedirects: true ở đây. UrlFetchApp không đi theo
    // chuyển hướng trên một POST, nên nó luôn báo 302 và ta kết luận oan là
    // web app hỏng. Phải tự đọc chỗ nó chuyển tới rồi tự phán.
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ ping: true }),
      followRedirects: false,
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) return true;

    var h = res.getAllHeaders();
    var loc = String(h.Location || h.location || '');

    // Apps Script LUÔN trả 302 sang googleusercontent/macros/echo — đó là
    // đường phục vụ nội dung bình thường của nó, không phải dấu hiệu hỏng.
    // Hỏng là khi chuyển hướng dẫn về trang đăng nhập.
    return loc.indexOf('script.googleusercontent.com/macros/echo') > -1;
  } catch (err) {
    return false;
  }
}

/**
 * Telegram báo `Wrong response from the webhook: 302 Found` nghĩa là nó gọi
 * URL /exec nhưng nhận về một lệnh chuyển hướng chứ không phải câu trả lời.
 * Hàm này tự gọi chính URL đó để xem chuyển hướng đi đâu, từ đó biết nguyên nhân.
 */
function kiemTraWebApp() {
  var url = String(WEBAPP_URL || '').trim();
  var out = ['Đang tự gọi URL web app của chính mình:', url, ''];

  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ action: 'ping' }),
      followRedirects: false,             // KHÔNG đi theo, để thấy đúng thứ Telegram thấy
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log(out.join('\n') + '\n✘ Không gọi được: ' + err);
    return;
  }

  var code = res.getResponseCode();
  var h    = res.getAllHeaders();
  var loc  = String(h.Location || h.location || '');
  out.push('Mã trả về: ' + code);
  if (loc) out.push('Chuyển hướng tới: ' + loc);
  out.push('');

  if (code === 200) {
    out.push('✔ Web app trả thẳng 200. Webhook Telegram dùng được bình thường.');
    out.push('  Nếu bot vẫn không trả lời, chạy lại  setup  để nối lại webhook.');
  } else if (loc.indexOf('accounts.google.com') > -1 || loc.indexOf('/u/0/') > -1) {
    out.push('✘ ĐÂY LÀ NGUYÊN NHÂN: web app đang bắt đăng nhập Google.');
    out.push('  Telegram không có tài khoản Google nên bị đá về trang đăng nhập → 302.');
    out.push('');
    out.push('  SỬA: Triển khai → Quản lý bản triển khai → bút chì (Chỉnh sửa)');
    out.push('       · Người có quyền truy cập: Bất kỳ ai      ← đổi lại dòng này');
    out.push('       · Phiên bản: Phiên bản mới');
    out.push('       → Triển khai, rồi chạy lại  setup');
  } else if (loc.indexOf('script.googleusercontent.com/macros/echo') > -1) {
    out.push('✔ Chuyển hướng LÀNH MẠNH — đây là đường Apps Script phục vụ nội');
    out.push('  dung bình thường, không phải trang đăng nhập hay trang lỗi.');
    out.push('  Web app đang chạy tốt, webhook nhiều khả năng dùng được.');
    out.push('');
    out.push('  Thử luôn: chạy hàm  noiWebhook  rồi nhắn /menu cho bot.');
    out.push('  Không thấy trả lời trong 30 giây thì chạy  batCheDoHoi  để lùi lại.');
  } else if (code >= 300 && code < 400) {
    out.push('⚠ Web app trả ' + code + ' chuyển hướng tới một chỗ lạ.');
    out.push('  Không phải đường phục vụ nội dung bình thường của Apps Script.');
    out.push('');
    out.push('  CÁCH CHẮC ĂN: chạy hàm  batCheDoHoi');
    out.push('  Bot sẽ chạy bằng chế độ tự hỏi Telegram mỗi phút, bỏ hẳn webhook.');
  } else {
    out.push('⚠ Mã lạ. Nội dung trả về:');
    out.push(res.getContentText().slice(0, 400));
  }
  Logger.log(out.join('\n'));
}

// ─────────────────────────────────────────────────────────────
// 10. CHẾ ĐỘ HỎI ĐỊNH KỲ — dùng khi webhook không chạy được
//     Không cần URL công khai, không dính lỗi chuyển hướng 302.
//     Đổi lại: bot trả lời chậm hơn, tối đa khoảng 1 phút.
// ─────────────────────────────────────────────────────────────
var HOI_TRAN_GIAY = 30;   // trần thời gian một lượt chạy được phép bám
var HOI_CHO_GIAY  = 10;   // mỗi lần hỏi nằm chờ bao lâu khi đang có việc
var HOI_RONG_TOI  = 2;    // im lặng mấy lượt liền thì thôi bám, nhường lượt sau

/** Bật chế độ hỏi định kỳ. Gọi tay khi cần; setup cũng tự gọi. */
function batCheDoHoi() {
  try {
    datLichHoi();
  } catch (err) {
    Logger.log('✘ Không đặt được lịch chạy.\n\n' + huongDanDatLichTay());
    return;
  }
  Logger.log('✔ Đã bật chế độ hỏi định kỳ.\n' +
             '  Webhook đã ngắt — bot không còn phụ thuộc URL /exec nữa,\n' +
             '  nên lỗi 302 và chuyện quyền truy cập không còn ảnh hưởng gì.\n\n' +
             '  Nhắn /menu cho bot. Tin đầu tiên có thể chờ tới 1 phút;\n' +
             '  từ tin thứ hai trở đi trả lời gần như tức thì.');
}

function tatCheDoHoi() {
  try {
    Logger.log('✔ Đã gỡ ' + goLichHoi() + ' lịch chạy.\n' +
               '  Bot sẽ không nhận lệnh nữa cho tới khi chạy lại  batCheDoHoi.');
  } catch (err) {
    Logger.log('✘ Không gỡ được lịch bằng code: ' + err + '\n\n' +
               '  Gỡ tay: cột trái → biểu tượng đồng hồ → ba chấm ở dòng\n' +
               '  hoiTelegram → Xoá trình kích hoạt.');
  }
}

/**
 * Ngắt webhook, bỏ qua tin cũ, rồi dựng lại lịch chạy mỗi phút.
 * Hai việc đầu làm trước vì chúng luôn chạy được; việc cuối cần quyền
 * script.scriptapp, mà quyền đó có thể bị thiếu (xem đếmLich bên dưới).
 */
function datLichHoi() {
  tgApi('deleteWebhook', { drop_pending_updates: false });
  datMocMoiNhat();
  goLichHoi();
  ScriptApp.newTrigger('hoiTelegram').timeBased().everyMinutes(1).create();
}

function goLichHoi() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hoiTelegram') { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/**
 * Đếm lịch chạy đang có. Trả -1 nếu không đọc được.
 *
 * Danh sách quyền của project bị chốt trong file appsscript.json. Nếu ở đó
 * thiếu script.scriptapp thì Google KHÔNG hỏi xin thêm quyền mà ném lỗi thẳng,
 * nên mọi chỗ đụng tới ScriptApp đều phải chịu được chuyện này.
 */
function demLich() {
  try {
    return ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'hoiTelegram';
    }).length;
  } catch (err) {
    return -1;
  }
}

function thieuQuyenLich(err) {
  return String(err).indexOf('script.scriptapp') > -1 ||
         String(err).indexOf('ScriptApp') > -1;
}

/** Hướng dẫn khi script không được phép tự đặt lịch. */
function huongDanDatLichTay() {
  return [
    'Script không được phép tự đặt lịch. Hai cách, chọn một:',
    '',
    'CÁCH NHANH — tự thêm lịch bằng tay, khỏi đụng gì khác:',
    '  1. Cột trái Apps Script, bấm biểu tượng đồng hồ (Trình kích hoạt)',
    '  2. Nút "Thêm trình kích hoạt" góc dưới phải',
    '  3. Chọn: hàm  hoiTelegram  ·  Nguồn: Trình kích hoạt theo thời gian',
    '     ·  Loại: Hẹn giờ theo phút  ·  Khoảng: Mỗi phút',
    '  4. Lưu, cấp quyền khi Google hỏi',
    '  Xong. Hàm hoiTelegram không cần quyền đó nên chạy bình thường.',
    '',
    'CÁCH GỐC — mở quyền cho script tự làm:',
    '  1. Cài đặt dự án (bánh răng bên trái)',
    '  2. Tích "Hiển thị tệp kê khai appsscript.json trong trình chỉnh sửa"',
    '  3. Mở file appsscript.json, thêm vào mảng oauthScopes dòng:',
    '     "https://www.googleapis.com/auth/script.scriptapp"',
    '  4. Lưu, chạy lại setup, cấp quyền mới khi Google hỏi'
  ].join('\n');
}

/**
 * Dời mốc đọc qua hết các tin đang tồn mà không xử lý chúng.
 * Không có bước này, bật bot lên là nó trả lời dồn cả loạt lệnh cũ từ hôm trước.
 */
function datMocMoiNhat() {
  var r = tgApi('getUpdates', { offset: -1, timeout: 0, limit: 1 });
  if (r && r.ok && r.result && r.result.length) {
    props().setProperty(PROP_OFFSET, String(r.result[0].update_id + 1));
  }
}

/**
 * Lịch chạy gọi hàm này mỗi phút.
 *
 * Hầu hết các lần chạy là lúc bạn không dùng bot: hỏi một cái rồi thoát ngay,
 * tốn khoảng một giây. Nhưng hễ có lệnh thật thì nghĩa là bạn đang ngồi thao
 * tác, nên nó bám lại thêm một lúc bằng long polling — các lệnh tiếp theo
 * trong cùng phiên được trả lời gần như tức thì thay vì phải chờ lượt sau.
 * Cách này giữ tổng thời gian chạy trong hạn mức của Apps Script.
 */
function hoiTelegram() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;          // lượt trước còn đang bám, để nó làm
  try {
    if (motLuotHoi(0) <= 0) return;         // rảnh hoặc lỗi mạng — thoát ngay
    // Bám lại một lúc, nhưng thôi ngay khi bạn ngừng gõ. Apps Script chỉ cho
    // tổng cộng 90 phút chạy theo lịch mỗi ngày, không tiêu hoang được.
    var het = Date.now() + HOI_TRAN_GIAY * 1000;
    var rong = 0;
    while (Date.now() < het && rong < HOI_RONG_TOI) {
      var n = motLuotHoi(HOI_CHO_GIAY);
      if (n < 0) break;
      rong = (n === 0) ? rong + 1 : 0;
    }
  } finally {
    lock.releaseLock();
  }
}

/** Trả về số update đã xử lý, 0 nếu không có, -1 nếu gọi Telegram lỗi. */
function motLuotHoi(choGiay) {
  var off = Number(props().getProperty(PROP_OFFSET) || 0);
  var r = tgApi('getUpdates', {
    offset: off, timeout: choGiay, limit: 20,
    allowed_updates: ['message', 'callback_query']
  });
  if (!r || !r.ok || !r.result) return -1;
  if (!r.result.length) return 0;

  // Dời mốc TRƯỚC khi xử lý: một tin gây lỗi cũng không làm kẹt hàng chờ mãi.
  var maxId = off;
  r.result.forEach(function (u) { if (u.update_id >= maxId) maxId = u.update_id + 1; });
  props().setProperty(PROP_OFFSET, String(maxId));

  r.result.forEach(function (u) {
    try { handleTelegram(u); } catch (err) { Logger.log('Lỗi xử lý update: ' + err); }
  });
  return r.result.length;
}

function xoaWebhook()   { Logger.log(JSON.stringify(tgApi('deleteWebhook', {}))); }
function xemAdminKey()  { Logger.log(props().getProperty(PROP_ADMINKEY)); }
function resetConfig()  { saveConfig(defaultConfig()); Logger.log('Đã reset cấu hình về mặc định.'); }
