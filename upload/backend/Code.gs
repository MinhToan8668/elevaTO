/**
 * elevaTO Upload — tải file lớn (video, tài liệu, mọi loại) lên Google Drive, bot Telegram nhắn link
 * ============================================================
 * Dự án Apps Script RIÊNG, tách hẳn khỏi backend landing page (backend/Code.gs).
 * Không đọc/ghi Sheet đăng ký, không nhận lệnh bot — chỉ dùng token để NHẮN
 * link cho admin, nên chạy song song với bot quản trị mà không đụng nhau.
 *
 * Trang: upload/index.html (GitHub Pages), POST từng mảnh 4MB về /exec của
 * dự án này → script đẩy tiếp lên phiên "resumable upload" của Drive. Mỗi lần
 * gọi chỉ mang một mảnh nên không chạm giới hạn 50MB / lần của Apps Script,
 * và rớt mạng giữa chừng thì hỏi Drive đã nhận tới đâu rồi gửi tiếp.
 *
 * Vì sao file lên Drive trước rồi mới vào Telegram: ở Việt Nam trình duyệt
 * không gọi được Telegram, nhưng máy chủ Google thì gọi được. Và bot chỉ gửi
 * được file tối đa 50MB — file lớn hơn được cắt thành các phần .001, .002…
 * (ghép lại bằng upload/ghep.html). Gửi xong thì bỏ bản trên Drive vào thùng rác.
 *
 * Vì sao trang KHÔNG phục vụ bằng HtmlService: mọi trang HtmlService đều cho
 * người mở nó gọi BẤT KỲ hàm nào trong script qua google.script.run. Trang
 * tĩnh + doPost chỉ mở đúng ba action upload_start / upload_chunk / upload_status.
 *
 * Cài đặt: xem upload/README.md
 * ============================================================
 */

// ═════════════════════════════════════════════════════════════
//  ĐIỀN 3 GIÁ TRỊ NÀY RỒI CHẠY HÀM  caiDat
// ═════════════════════════════════════════════════════════════
var TG_TOKEN   = 'DAN_TOKEN_BOT';          // token bot từ @BotFather (dùng chung bot cũ được)
var TG_CHAT    = 'DAN_CHAT_ID';            // chat id nhận link, từ @userinfobot
var WEBAPP_URL = 'DAN_URL_EXEC';           // URL Web App của DỰ ÁN NÀY, kết thúc bằng /exec
// ═════════════════════════════════════════════════════════════

var PROP_TOKEN     = 'TG_BOT_TOKEN';
var PROP_CHAT      = 'TG_CHAT_ID';
var PROP_KEY       = 'UPLOAD_KEY';
var PROP_FOLDER    = 'UPLOAD_FOLDER_ID';
var FOLDER_NAME    = 'elevaTO Uploads';
var UP_MAX_BYTES   = 2 * 1024 * 1024 * 1024;   // 2GB mỗi file
var UP_MAX_SAI_KEY = 20;                        // số lần sai key trước khi khoá tạm
var UP_KHOA_GIAY   = 600;                       // khoá 10 phút
var DRIVE_FILES    = 'https://www.googleapis.com/drive/v3/files';
var DRIVE_UPLOAD   = 'https://www.googleapis.com/upload/drive/v3/files';
var PAGE_URL       = 'https://minhtoan8668.github.io/elevaTO/upload/';
var GHEP_URL       = PAGE_URL + 'ghep.html';

// Chuyển file vào Telegram. Bot gửi được tối đa 50MB mỗi file (tính cả phần
// bọc multipart), UrlFetchApp cũng nhận/gửi tối đa 50MB mỗi lần — 45MB chừa đủ dư.
var TG_PART        = 45 * 1024 * 1024;
var JOB_PREFIX     = 'TGJOB_';              // mỗi file chờ chuyển là một Script Property
var WORKER_GIAY    = 240;                   // mỗi lượt chạy dừng sau ~4 phút (giới hạn 6 phút)
var JOB_MAX_LOI    = 5;                     // lỗi liên tiếp quá số này thì bỏ, giữ file trên Drive

function props() { return PropertiesService.getScriptProperties(); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ghiLoi(cho, err) {
  console.error(cho + ': ' + err + (err && err.stack ? '\n' + err.stack : ''));
}

/** Mở /exec trên trình duyệt để xem bản triển khai còn sống không. */
function doGet() {
  return json({ ok: true, service: 'elevaTO upload' });
}

/**
 * Trả {ok, data} hoặc {ok:false, error, code}: code 'key' / 'session' thì
 * trang dừng hẳn, code 'retry' thì trang thử lại.
 * Trang gửi Content-Type: text/plain để tránh CORS preflight.
 */
function doPost(e) {
  var b = {};
  try { b = JSON.parse(e.postData.contents); } catch (err) { b = {}; }
  try {
    var data;
    if (b.action === 'upload_start') data = uploadBatDau(b.key, b.info);
    else if (b.action === 'upload_chunk') data = uploadManh(b.key, b.session, b.start, b.total, b.data, b.share, b.tele);
    else if (b.action === 'upload_status') data = uploadTrangThai(b.key, b.session, b.total, b.share, b.tele);
    else return json({ ok: false, error: 'unknown action', code: 'session' });
    return json({ ok: true, data: data });
  } catch (err) {
    var msg = String(err && err.message || err);
    var m = msg.match(/^(KEY|PHIEN): ?/);
    if (!m) ghiLoi(b.action, err);
    return json({ ok: false, error: msg.replace(/^(KEY|PHIEN): ?/, ''),
                  code: m ? (m[1] === 'KEY' ? 'key' : 'session') : 'retry' });
  }
}

// ─────────────────────────────────────────────────────────────
// Ba việc trang làm được. Việc nào cũng kiểm key trước.
// ─────────────────────────────────────────────────────────────

/** Mở phiên tải lên Drive. Trả về URL phiên để trang gửi từng mảnh. */
function uploadBatDau(key, info) {
  kiemKey(key);
  info = info || {};
  var size = Number(info.size);
  if (!(size > 0) || Math.floor(size) !== size) throw new Error('PHIEN: File rỗng hoặc dung lượng không hợp lệ');
  if (size > UP_MAX_BYTES) throw new Error('PHIEN: File lớn quá ' + Math.round(UP_MAX_BYTES / 1048576) + 'MB');

  var ten  = String(info.name || '').replace(/[\\\/\u0000-\u001f]/g, ' ').trim().slice(0, 200) || 'file';
  var mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(info.type || '')) ? info.type : 'application/octet-stream';

  var res = UrlFetchApp.fetch(DRIVE_UPLOAD + '?uploadType=resumable', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size)
    },
    payload: JSON.stringify({ name: ten, parents: [thuMucUpload()] }),
    muteHttpExceptions: true
  });
  var session = res.getResponseCode() === 200 ? layHeader(res, 'location') : '';
  if (!session) {
    ghiLoi('uploadBatDau', res.getResponseCode() + ' ' + res.getContentText().slice(0, 500));
    throw new Error('Google Drive không mở được phiên tải lên, thử lại sau ít phút');
  }
  return session;
}

/** Gửi một mảnh. Trả {next: vị trí kế tiếp} hoặc {done: true, ...link} ở mảnh cuối. */
function uploadManh(key, session, start, total, b64, share, tele) {
  kiemKey(key);
  kiemSession(session);
  var bytes = Utilities.base64Decode(String(b64 || ''));
  start = Number(start); total = Number(total);
  if (!bytes.length || !(start >= 0) || start + bytes.length > total) {
    throw new Error('PHIEN: Mảnh dữ liệu không hợp lệ');
  }
  var res = UrlFetchApp.fetch(session, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + start + '-' + (start + bytes.length - 1) + '/' + total },
    payload: bytes,
    muteHttpExceptions: true,
    followRedirects: false          // Drive trả 308 nghĩa là "nhận rồi, gửi tiếp", không phải chuyển hướng
  });
  return ketQuaPhien(res, share, tele);
}

/** Hỏi Drive đã nhận tới đâu — dùng khi rớt mạng hoặc mở lại trang giữa chừng. */
function uploadTrangThai(key, session, total, share, tele) {
  kiemKey(key);
  kiemSession(session);
  var res = UrlFetchApp.fetch(session, {
    method: 'put',
    headers: { 'Content-Range': 'bytes */' + Number(total) },
    payload: '',
    muteHttpExceptions: true,
    followRedirects: false
  });
  if (res.getResponseCode() === 404 || res.getResponseCode() === 410) return { expired: true };
  return ketQuaPhien(res, share, tele);
}

// ─────────────────────────────────────────────────────────────
// Nội bộ
// ─────────────────────────────────────────────────────────────

function ketQuaPhien(res, share, tele) {
  var code = res.getResponseCode();
  if (code === 308) {
    // Range: bytes=0-N  → đã nhận tới byte N. Không có Range → chưa nhận byte nào.
    var m = String(layHeader(res, 'range')).match(/bytes=0-(\d+)/);
    return { next: m ? Number(m[1]) + 1 : 0 };
  }
  if (code === 200 || code === 201) {
    return hoanTat(JSON.parse(res.getContentText()).id, share !== false, tele === true);
  }
  ghiLoi('upload', code + ' ' + res.getContentText().slice(0, 500));
  throw new Error('Google Drive báo lỗi ' + code);
}

/**
 * Mảnh cuối đã lên: mở quyền xem theo link, trả link cho trang.
 * tele = true → xếp vào hàng chờ để bot chuyển file vào Telegram rồi xoá khỏi
 * Drive (việc nặng, chạy nền bằng lịch mỗi phút — xem chuyenTelegram).
 * tele = false → chỉ nhắn link Drive như trước.
 */
function hoanTat(fileId, share, tele) {
  if (share) {
    driveApi('post', DRIVE_FILES + '/' + fileId + '/permissions', { role: 'reader', type: 'anyone' });
  }
  var meta = driveApi('get', DRIVE_FILES + '/' + fileId + '?fields=id,name,size').body || {};
  var kq = {
    done: true,
    id: fileId,
    name: meta.name || '',
    size: Number(meta.size || 0),
    shared: share,
    tele: tele,
    viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId
  };

  // Mảnh cuối có thể được hỏi lại (rớt mạng đúng lúc Drive trả lời) —
  // nhớ trong cache để không nhắn / xếp hàng hai lần cho cùng một file.
  var cache = CacheService.getScriptCache();
  if (cache.get('upxong_' + fileId)) return kq;
  cache.put('upxong_' + fileId, '1', 21600);

  if (tele) {
    props().setProperty(JOB_PREFIX + fileId, JSON.stringify({
      id: fileId, name: kq.name, size: kq.size,
      parts: Math.max(1, Math.ceil(kq.size / TG_PART)), part: 0, loi: 0
    }));
    return kq;
  }
  guiTelegram([
    '📥 File mới đã lên Google Drive',
    '',
    '🎞 ' + kq.name + ' (' + mbText(kq.size) + ')',
    '👁 Xem: ' + kq.viewUrl,
    '⬇️ Tải về: ' + kq.downloadUrl,
    share ? '' : '(Chỉ tài khoản Google của bạn mở được — chưa bật chia sẻ theo link.)'
  ].join('\n'));
  return kq;
}

function mbText(n) { return (Number(n) / 1048576).toFixed(1) + 'MB'; }

// ─────────────────────────────────────────────────────────────
// Chuyển file từ Drive vào Telegram (chạy nền)
// ─────────────────────────────────────────────────────────────

/**
 * Lịch chạy mỗi phút (caiDat tự đặt). Không có file chờ thì thoát ngay.
 * Mỗi lượt gửi được bao nhiêu phần thì gửi, nhớ lại chỗ dừng trong Script
 * Properties, lượt sau làm tiếp — nên file 2GB cũng không chạm giới hạn 6 phút.
 */
function chuyenTelegram() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;            // lượt trước còn đang chạy
  try {
    var batDau = Date.now();
    var all = props().getProperties();
    var keys = Object.keys(all).filter(function (k) { return k.indexOf(JOB_PREFIX) === 0; });
    for (var i = 0; i < keys.length; i++) {
      var job;
      try { job = JSON.parse(all[keys[i]]); } catch (e) { props().deleteProperty(keys[i]); continue; }
      if (!chuyenMotFile(job, batDau)) return; // hết giờ, lượt sau làm tiếp
    }
  } finally {
    lock.releaseLock();
  }
}

/** Trả false khi hết giờ giữa chừng. */
function chuyenMotFile(job, batDau) {
  var key = JOB_PREFIX + job.id;
  while (job.part < job.parts) {
    if ((Date.now() - batDau) / 1000 > WORKER_GIAY) return false;
    var ok;
    try { ok = guiMotPhan(job); }
    catch (err) { ghiLoi('chuyenTelegram ' + job.name, err); ok = String(err && err.message || err); }
    if (ok === true) {
      job.part++; job.loi = 0;
      props().setProperty(key, JSON.stringify(job));
      continue;
    }
    job.loi = (job.loi || 0) + 1;
    if (ok === 'mat' || job.loi >= JOB_MAX_LOI) {
      props().deleteProperty(key);
      guiTelegram('⚠️ Không chuyển được ' + job.name + ' vào Telegram' +
        (ok === 'mat' ? ' — file đã không còn trên Drive.' :
         ' (lỗi: ' + ok + ').\nFile vẫn nằm trên Google Drive: https://drive.google.com/file/d/' + job.id + '/view'));
      return true;
    }
    props().setProperty(key, JSON.stringify(job));
    return false;                              // lỗi tạm (mạng, Telegram bắt chờ) → lượt sau thử lại
  }
  xongMotFile(job);
  props().deleteProperty(key);
  return true;
}

/** Gửi phần job.part. Trả true, 'mat' (file không còn) hoặc chuỗi lỗi. */
function guiMotPhan(job) {
  var start = job.part * TG_PART;
  var end = Math.min(start + TG_PART, job.size) - 1;
  var res = UrlFetchApp.fetch(DRIVE_FILES + '/' + job.id + '?alt=media', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=' + start + '-' + end },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 404) return 'mat';
  if (code !== 200 && code !== 206) return 'Drive ' + code;

  var motFile = job.parts === 1;
  var ten = motFile ? job.name : job.name + '.' + ('00' + (job.part + 1)).slice(-3);
  var caption = motFile ? job.name + ' (' + mbText(job.size) + ')'
                        : job.name + ' — phần ' + (job.part + 1) + '/' + job.parts;
  var r = guiFileTelegram(res.getBlob().setName(ten), caption);
  if (r && r.ok) return true;
  return 'Telegram ' + (r ? (r.error_code || '') + ' ' + (r.description || '') : 'không phản hồi');
}

function guiFileTelegram(blob, caption) {
  var token = props().getProperty(PROP_TOKEN), chat = props().getProperty(PROP_CHAT);
  if (!token || !chat) return { ok: false, description: 'chưa chạy caiDat' };
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendDocument', {
    method: 'post',
    payload: { chat_id: chat, caption: caption, disable_content_type_detection: 'true', document: blob },
    muteHttpExceptions: true
  });
  try { return JSON.parse(res.getContentText()); } catch (e) { return null; }
}

/** Gửi đủ phần: bỏ bản trên Drive vào thùng rác, nhắn cách ghép nếu có nhiều phần. */
function xongMotFile(job) {
  var xoa = driveApi('patch', DRIVE_FILES + '/' + job.id, { trashed: true });
  var dong = [];
  if (job.parts > 1) {
    dong.push('✅ ' + job.name + ' (' + mbText(job.size) + ') đã vào Telegram thành ' + job.parts + ' phần.');
    dong.push('');
    dong.push('Ghép lại sau khi tải đủ ' + job.parts + ' phần về máy:');
    dong.push('• Mở ' + GHEP_URL + ' → chọn cả ' + job.parts + ' phần → Ghép');
    dong.push("• Hoặc trên Mac, mở Terminal ở thư mục chứa các phần: cat '" + job.name + "'.0* > '" + job.name + "'");
    dong.push('');
  }
  dong.push(xoa.code === 200 ? '🗑 Đã bỏ ' + job.name + ' khỏi Google Drive (còn trong Thùng rác 30 ngày).'
                             : '⚠️ Chưa xoá được ' + job.name + ' khỏi Drive (lỗi ' + xoa.code + '), xoá tay giúp nhé.');
  guiTelegram(dong.join('\n'));
}

/** Đặt lịch chạy chuyenTelegram mỗi phút — gọi lại bao nhiêu lần cũng chỉ còn một lịch. */
function datLichChuyen() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'chuyenTelegram') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('chuyenTelegram').timeBased().everyMinutes(1).create();
}

/** Thư mục "elevaTO Uploads" trong Drive, tạo lại nếu đã bị xoá. */
function thuMucUpload() {
  var id = props().getProperty(PROP_FOLDER);
  if (id) {
    var cu = driveApi('get', DRIVE_FILES + '/' + id + '?fields=id,trashed');
    if (cu.code === 200 && !cu.body.trashed) return id;
  }
  var moi = driveApi('post', DRIVE_FILES + '?fields=id',
    { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' });
  if (moi.code !== 200) {
    ghiLoi('thuMucUpload', moi.code + ' ' + JSON.stringify(moi.body));
    throw new Error('Không tạo được thư mục trên Google Drive');
  }
  props().setProperty(PROP_FOLDER, moi.body.id);
  return moi.body.id;
}

function driveApi(method, url, body) {
  var opt = {
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(url, opt);
  var parsed = {};
  try { parsed = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  return { code: res.getResponseCode(), body: parsed };
}

/**
 * Gửi chữ thường, không Markdown. Link Drive và tên file hay có dấu _ —
 * Markdown hiểu nhầm thành in nghiêng rồi Telegram từ chối cả tin.
 */
function guiTelegram(text) {
  var token = props().getProperty(PROP_TOKEN), chat = props().getProperty(PROP_CHAT);
  if (!token || !chat) return null;
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: String(text), disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText());
  } catch (err) {
    ghiLoi('guiTelegram', err);         // nhắn hỏng thì file vẫn đã lên Drive, trang vẫn có link
    return null;
  }
}

function layHeader(res, ten) {
  var h = res.getHeaders();
  for (var k in h) if (k.toLowerCase() === ten) return String(h[k]);
  return '';
}

/**
 * Trang mở cho bất kỳ ai, nên key là thứ duy nhất chắn người lạ đổ file vào
 * Drive của bạn. Sai quá nhiều lần thì khoá tạm để không dò key được.
 */
function kiemKey(key) {
  var cache = CacheService.getScriptCache();
  var sai = Number(cache.get('upsai') || 0);
  if (sai >= UP_MAX_SAI_KEY) throw new Error('KEY: Sai key quá nhiều lần, thử lại sau 10 phút');
  var dung = props().getProperty(PROP_KEY);
  if (!dung || String(key || '').trim() !== dung) {
    cache.put('upsai', String(sai + 1), UP_KHOA_GIAY);
    throw new Error('KEY: Key không đúng');
  }
}

/** Chỉ chấp nhận URL phiên của Drive — không để trang bắt script gửi dữ liệu đi nơi khác. */
function kiemSession(session) {
  if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?[^\s]*upload_id=[\w-]+/.test(String(session || ''))) {
    throw new Error('PHIEN: Phiên tải lên không hợp lệ');
  }
}

/** Link mở trang: API và key đi sau dấu # — phần đó trình duyệt không gửi lên máy chủ nào. */
function linkTrang() {
  return PAGE_URL + '#api=' + encodeURIComponent(String(WEBAPP_URL).trim()) +
         '&key=' + encodeURIComponent(props().getProperty(PROP_KEY) || '');
}

// ─────────────────────────────────────────────────────────────
// Chạy tay trong trình soạn thảo
// ─────────────────────────────────────────────────────────────

/**
 * Chạy sau khi điền 3 giá trị ở đầu file và đã Triển khai web app.
 * Google sẽ hỏi quyền Drive; hàm lưu token, tạo key, tạo thư mục, rồi nhắn
 * link trang (kèm sẵn key) vào Telegram. Chạy lại nhiều lần vẫn an toàn.
 */
function caiDat() {
  if (TG_TOKEN.indexOf('DAN_') === 0 || TG_CHAT.indexOf('DAN_') === 0) {
    throw new Error('Chưa điền TG_TOKEN và TG_CHAT ở đầu file.');
  }
  if (String(WEBAPP_URL).trim().slice(-5) !== '/exec') {
    throw new Error('WEBAPP_URL phải là URL Web App của dự án này, kết thúc bằng /exec ' +
                    '(Triển khai → Quản lý bản triển khai → cột URL ứng dụng web).');
  }
  props().setProperty(PROP_TOKEN, TG_TOKEN.trim());
  props().setProperty(PROP_CHAT, TG_CHAT.trim());
  if (!props().getProperty(PROP_KEY)) props().setProperty(PROP_KEY, Utilities.getUuid());

  var folder = thuMucUpload();
  datLichChuyen();
  var link = linkTrang();
  var tg = guiTelegram('📤 Trang tải file lên Google Drive\n\n' + link +
    '\n\nLink đã kèm sẵn key — ĐỪNG gửi cho người khác.\nMở một lần là trang tự nhớ key.');

  Logger.log('✔ Thư mục Drive: https://drive.google.com/drive/folders/' + folder);
  Logger.log('✔ Đã đặt lịch chuyển file vào Telegram (mỗi phút)');
  Logger.log('✔ Trang tải lên (kèm key, đừng chia sẻ):\n' + link);
  Logger.log(tg && tg.ok ? '✔ Đã nhắn link vào Telegram'
                         : '✘ Không nhắn được Telegram — kiểm tra TG_TOKEN / TG_CHAT');
}

/** Đổi key mới (vd. lỡ để lộ link). Link cũ hết dùng được. */
function doiKey() {
  props().setProperty(PROP_KEY, Utilities.getUuid());
  Logger.log('✔ Key mới. Link trang mới:\n' + linkTrang());
  guiTelegram('🔑 Đã đổi key trang tải file. Link mới:\n\n' + linkTrang());
}
