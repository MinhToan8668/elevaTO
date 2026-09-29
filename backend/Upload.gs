/**
 * elevaTO — Tải video lớn lên Google Drive
 * ============================================================
 * Trang:  upload.html ở thư mục gốc repo (GitHub Pages), gọi doPost ở đây.
 *
 * Vì sao video đi lên Drive chứ không đi thẳng vào bot:
 *   • Bot Telegram chỉ gửi được file tối đa 50MB, video 350MB không lọt.
 *   • Ở Việt Nam trình duyệt không gọi được Telegram, nhưng máy chủ Google
 *     thì gọi được — nên chính script này nhắn link cho admin qua bot.
 *
 * Luồng: trình duyệt cắt file thành từng mảnh 4MB → POST từng mảnh về /exec
 * → script đẩy tiếp lên phiên "resumable upload" của Drive. Mỗi lần gọi chỉ
 * mang một mảnh nên không chạm giới hạn 50MB / lần của Apps Script, và rớt
 * mạng giữa chừng thì hỏi Drive đã nhận tới đâu rồi gửi tiếp.
 *
 * Vì sao trang KHÔNG phục vụ bằng HtmlService: mọi trang HtmlService đều cho
 * người mở nó gọi BẤT KỲ hàm nào trong script qua google.script.run — tức là
 * người lạ mở trang rồi gõ google.script.run.allRegs() là lấy được cả danh
 * sách đăng ký. Trang tĩnh + doPost chỉ mở đúng ba action dưới đây.
 *
 * Token bot KHÔNG bao giờ ra tới trang. Trang chỉ cầm ADMIN_KEY — cùng key dùng
 * để xem danh sách đăng ký (chạy hàm xemAdminKey để lấy, hoặc gõ /upload cho bot).
 * ============================================================
 */

var PROP_UP_FOLDER = 'UPLOAD_FOLDER_ID';
var UP_FOLDER_NAME = 'elevaTO Uploads';
var UP_MAX_BYTES   = 2 * 1024 * 1024 * 1024;   // 2GB mỗi file
var UP_MAX_SAI_KEY = 20;                        // số lần sai key trước khi khoá tạm
var UP_KHOA_GIAY   = 600;                       // khoá 10 phút
var DRIVE_FILES    = 'https://www.googleapis.com/drive/v3/files';
var DRIVE_UPLOAD   = 'https://www.googleapis.com/upload/drive/v3/files';
var UP_PAGE_URL    = 'https://minhtoan8668.github.io/elevaTO/upload.html';

/**
 * doPost chuyển mọi action upload_* về đây. Trả {ok, data} hoặc
 * {ok:false, error, code}: code 'key' / 'session' thì trang dừng hẳn,
 * code 'retry' thì trang thử lại.
 */
function handleUpload(b) {
  try {
    var data;
    if (b.action === 'upload_start') data = uploadBatDau(b.key, b.info);
    else if (b.action === 'upload_chunk') data = uploadManh(b.key, b.session, b.start, b.total, b.data, b.share);
    else if (b.action === 'upload_status') data = uploadTrangThai(b.key, b.session, b.total, b.share);
    else return { ok: false, error: 'unknown action', code: 'session' };
    return { ok: true, data: data };
  } catch (err) {
    var msg = String(err && err.message || err);
    var m = msg.match(/^(KEY|PHIEN): ?/);
    if (!m) ghiLoi(b.action, err);
    return { ok: false, error: msg.replace(/^(KEY|PHIEN): ?/, ''),
             code: m ? (m[1] === 'KEY' ? 'key' : 'session') : 'retry' };
  }
}

// ─────────────────────────────────────────────────────────────
// Ba việc trang làm được. Việc nào cũng kiểm key trước.
// ─────────────────────────────────────────────────────────────

/** Mở phiên tải lên Drive. Trả về URL phiên để trang gửi từng mảnh. */
function uploadBatDau(key, info) {
  kiemKeyUpload(key);
  info = info || {};
  var size = Number(info.size);
  if (!(size > 0) || Math.floor(size) !== size) throw new Error('File rỗng hoặc dung lượng không hợp lệ');
  if (size > UP_MAX_BYTES) throw new Error('File lớn quá ' + Math.round(UP_MAX_BYTES / 1048576) + 'MB');

  var ten  = String(info.name || '').replace(/[\\\/\u0000-\u001f]/g, ' ').trim().slice(0, 200) || 'video';
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
function uploadManh(key, session, start, total, b64, share) {
  kiemKeyUpload(key);
  kiemSession(session);
  var bytes = Utilities.base64Decode(String(b64 || ''));
  start = Number(start); total = Number(total);
  if (!bytes.length || !(start >= 0) || start + bytes.length > total) {
    throw new Error('Mảnh dữ liệu không hợp lệ');
  }
  var res = UrlFetchApp.fetch(session, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + start + '-' + (start + bytes.length - 1) + '/' + total },
    payload: bytes,
    muteHttpExceptions: true,
    followRedirects: false          // Drive trả 308 nghĩa là "nhận rồi, gửi tiếp", không phải chuyển hướng
  });
  return ketQuaPhien(res, share);
}

/** Hỏi Drive đã nhận tới đâu — dùng khi rớt mạng hoặc mở lại trang giữa chừng. */
function uploadTrangThai(key, session, total, share) {
  kiemKeyUpload(key);
  kiemSession(session);
  var res = UrlFetchApp.fetch(session, {
    method: 'put',
    headers: { 'Content-Range': 'bytes */' + Number(total) },
    payload: '',
    muteHttpExceptions: true,
    followRedirects: false
  });
  if (res.getResponseCode() === 404 || res.getResponseCode() === 410) return { expired: true };
  return ketQuaPhien(res, share);
}

// ─────────────────────────────────────────────────────────────
// Nội bộ
// ─────────────────────────────────────────────────────────────

function ketQuaPhien(res, share) {
  var code = res.getResponseCode();
  if (code === 308) {
    // Range: bytes=0-N  → đã nhận tới byte N. Không có Range → chưa nhận byte nào.
    var m = String(layHeader(res, 'range')).match(/bytes=0-(\d+)/);
    return { next: m ? Number(m[1]) + 1 : 0 };
  }
  if (code === 200 || code === 201) {
    return hoanTatUpload(JSON.parse(res.getContentText()).id, share !== false);
  }
  ghiLoi('upload', code + ' ' + res.getContentText().slice(0, 500));
  throw new Error('Google Drive báo lỗi ' + code);
}

/** Mảnh cuối đã lên: mở quyền xem theo link, nhắn admin, trả link cho trang. */
function hoanTatUpload(fileId, share) {
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
    viewUrl: 'https://drive.google.com/file/d/' + fileId + '/view',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId
  };

  // Mảnh cuối có thể được hỏi lại (rớt mạng đúng lúc Drive trả lời) —
  // nhớ trong cache để admin không nhận hai tin cho cùng một file.
  var cache = CacheService.getScriptCache();
  if (!cache.get('upxong_' + fileId)) {
    cache.put('upxong_' + fileId, '1', 21600);
    guiChuTho(adminIds()[0], [
      '📥 Video mới đã lên Google Drive',
      '',
      '🎞 ' + kq.name + ' (' + (kq.size / 1048576).toFixed(1) + 'MB)',
      '👁 Xem: ' + kq.viewUrl,
      '⬇️ Tải về: ' + kq.downloadUrl,
      share ? '' : '(Chỉ tài khoản Google của bạn mở được — chưa bật chia sẻ theo link.)',
      '',
      'Dùng làm video học thử trên web, gửi lệnh:',
      '/video ' + kq.viewUrl
    ].join('\n'));
  }
  return kq;
}

/** Thư mục "elevaTO Uploads" trong Drive, tạo lại nếu đã bị xoá. */
function thuMucUpload() {
  var id = props().getProperty(PROP_UP_FOLDER);
  if (id) {
    var cu = driveApi('get', DRIVE_FILES + '/' + id + '?fields=id,trashed');
    if (cu.code === 200 && !cu.body.trashed) return id;
  }
  var moi = driveApi('post', DRIVE_FILES + '?fields=id',
    { name: UP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' });
  if (moi.code !== 200) {
    ghiLoi('thuMucUpload', moi.code + ' ' + JSON.stringify(moi.body));
    throw new Error('Không tạo được thư mục trên Google Drive');
  }
  props().setProperty(PROP_UP_FOLDER, moi.body.id);
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
 * Gửi chữ thường, không Markdown. Link Drive và tên file hay có dấu _ — Markdown
 * hiểu nhầm thành in nghiêng rồi từ chối cả tin, và bản gửi lại của guiMotTin
 * xoá hết dấu _ nên link hỏng. Không có Markdown thì không có gì để hỏng.
 */
function guiChuTho(chatId, text) {
  if (!chatId) return null;
  return tgApi('sendMessage', { chat_id: chatId, text: String(text), disable_web_page_preview: true });
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
function kiemKeyUpload(key) {
  var cache = CacheService.getScriptCache();
  var sai = Number(cache.get('upsai') || 0);
  if (sai >= UP_MAX_SAI_KEY) throw new Error('KEY: Sai key quá nhiều lần, thử lại sau 10 phút');
  var dung = props().getProperty(PROP_ADMINKEY);
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

/**
 * Chạy MỘT LẦN trong trình soạn thảo sau khi dán file này:
 * Google sẽ hỏi quyền Drive, rồi hàm tạo sẵn thư mục và in link trang tải lên.
 */
function capQuyenUpload() {
  var id = thuMucUpload();
  Logger.log('✔ Thư mục Drive: https://drive.google.com/drive/folders/' + id);
  Logger.log('✔ Trang tải lên: ' + linkTrangUpload());
  Logger.log('  Nhớ Triển khai → Quản lý bản triển khai → bút chì → Phiên bản mới → Triển khai,');
  Logger.log('  không thì URL /exec vẫn chạy code cũ và trang báo lỗi.');
}

/** Key đi sau dấu # — phần đó trình duyệt không gửi lên máy chủ nào cả. */
function linkTrangUpload() {
  return UP_PAGE_URL + '#key=' + encodeURIComponent(props().getProperty(PROP_ADMINKEY) || '');
}

/** Lệnh bot /upload — gửi link trang tải lên, kèm sẵn key. */
function cmdUpload(chatId) {
  var link = linkTrangUpload();
  guiChuTho(chatId, [
    '📤 Trang tải video lên Google Drive',
    '',
    link,
    '',
    'Link đã kèm sẵn key — ĐỪNG gửi cho người khác.',
    'Mở trên máy tính (không cần Telegram), chọn video rồi bấm Tải lên.',
    'Xong bot sẽ nhắn link xem và link tải về ở đây.'
  ].join('\n'));
}
