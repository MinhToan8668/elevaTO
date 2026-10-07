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
 * Kho: file đã vào Telegram được ghi lại (mã file_id từng phần), tải về được hai đường:
 *   • "Tải thẳng" — script ký một vé rồi trang đưa thẳng cho Cloudflare Worker; Worker kéo
 *     các phần từ Telegram nối thành một luồng về máy. Không đụng Drive, không phải chờ.
 *     Giới hạn 44 phần (~836MB) vì Worker gói Free chỉ được 50 subrequest mỗi lần gọi.
 *   • "Lấy về Drive" — đường cũ, không giới hạn dung lượng: bot kéo các phần từ Telegram,
 *     ghép thành file gốc đặt tạm trên Drive để tải, 24 giờ sau tự bỏ vào thùng rác.
 *
 * Vì sao trang KHÔNG phục vụ bằng HtmlService: mọi trang HtmlService đều cho
 * người mở nó gọi BẤT KỲ hàm nào trong script qua google.script.run. Trang
 * tĩnh + doPost chỉ mở đúng mấy action liệt kê trong doPost, không hơn.
 *
 * Cài đặt: xem upload/README.md
 * ============================================================
 */

// ════════════════════════════════════════════════════════════
//  ĐIỀN 3 GIÁ TRỊ NÀY RỒI CHẠY HÀM  caiDat
// ════════════════════════════════════════════════════════════
var TG_TOKEN   = 'DAN_TOKEN_BOT';          // token bot từ @BotFather (dùng chung bot cũ được)
var TG_CHAT    = 'DAN_CHAT_ID';            // chat id nhận link, từ @userinfobot
var WEBAPP_URL = 'DAN_URL_EXEC';           // URL Web App của DỰ ÁN NÀY, kết thúc bằng /exec

// Tải thẳng (không bắt buộc): để trống thì trang chỉ có nút "Lấy về Drive" như cũ.
// Điền vào là có thêm nút "Tải thẳng" — file đi từ Telegram về máy qua Cloudflare Worker,
// không đặt bản tạm trên Drive nữa. Xem upload/README.md mục "Tải thẳng".
var WORKER_URL    = '';                    // vd https://elevato.minhtoantowork.workers.dev/taive
var WORKER_SECRET = '';                    // chuỗi ngẫu nhiên dài, PHẢI khớp secret TAIVE_SECRET của Worker
// ════════════════════════════════════════════════════════════

var PROP_TOKEN     = 'TG_BOT_TOKEN';
var PROP_CHAT      = 'TG_CHAT_ID';
var PROP_KEY       = 'UPLOAD_KEY';
var PROP_FOLDER    = 'UPLOAD_FOLDER_ID';
var PROP_WORKER    = 'TAIVE_WORKER_URL';
var PROP_SECRET    = 'TAIVE_SECRET';
var FOLDER_NAME    = 'elevaTO Uploads';
var UP_MAX_BYTES   = 2 * 1024 * 1024 * 1024;   // 2GB mỗi file
var UP_MAX_SAI_KEY = 20;                        // số lần sai key trước khi khoá tạm
var UP_KHOA_GIAY   = 600;                       // khoá 10 phút
var DRIVE_FILES    = 'https://www.googleapis.com/drive/v3/files';
var DRIVE_UPLOAD   = 'https://www.googleapis.com/upload/drive/v3/files';
var PAGE_URL       = 'https://minhtoan8668.github.io/elevaTO/upload/';
var GHEP_URL       = PAGE_URL + 'ghep.html';

// Chuyển file vào Telegram. Bot GỬI được file tối đa 50MB nhưng chỉ TẢI VỀ được
// file tối đa 20MB — nên mỗi phần 19MB để sau này lấy ngược từ Telegram được.
// 19MB = 76 × 256KB: khi ghép lại lên Drive (resumable, mảnh phải là bội số
// 256KB) mỗi phần là một mảnh trọn vẹn.
var TG_PART        = 19 * 1024 * 1024;
var TG_PART_CU     = 45 * 1024 * 1024;      // cỡ phần của bản cũ — việc xếp hàng từ trước vẫn chạy đúng
var TG_TAI_MAX     = 20 * 1000 * 1000;      // Telegram: bot tải về tối đa 20MB mỗi file
var JOB_PREFIX     = 'TGJOB_';              // mỗi file chờ chuyển là một Script Property
var LIB_PREFIX     = 'TGLIB_';              // kho: mỗi file đã vào Telegram (lấy về được)
var FID_PREFIX     = 'TGFID_';              // mã file_id các phần, 40 mã một ô (mỗi ô tối đa 9KB)
var FID_MOI_O      = 40;
var RES_PREFIX     = 'TGRES_';              // việc lấy về đang chạy
var TAM_PREFIX     = 'TGTAM_';              // bản lấy về đang nằm tạm trên Drive
var GIU_BAN_TAM_GIO = 24;                   // bản tạm tự vào thùng rác sau 24 giờ
var WORKER_GIAY    = 240;                   // mỗi lượt chạy dừng sau ~4 phút (giới hạn 6 phút)
var JOB_MAX_LOI    = 5;                     // lỗi liên tiếp quá số này thì bỏ, giữ file trên Drive

// Tải thẳng: Cloudflare gói Free cho 50 subrequest mỗi lần gọi, mỗi phần tốn 1 lượt tải.
// Chừa 6 lượt để Worker còn xin lại được đường dẫn Telegram hết hạn giữa chừng (mỗi lần
// xin tốn 2). PHẢI khớp MAX_PHAN trong ai/worker/src/taive.js — lệch là Worker từ chối vé.
var TAI_THANG_PHAN = 44;                    // 44 × 19MB ≈ 836MB
var VE_SONG_PHUT   = 50;                    // vé hết hạn sau 50 phút (đường dẫn Telegram sống ≥1 giờ)

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
    else if (b.action === 'lib_list') data = khoDanhSach(b.key);
    else if (b.action === 'lib_restore') data = khoLayVe(b.key, b.id);
    else if (b.action === 'lib_direct') data = khoVeTaiThang(b.key, b.id);
    else if (b.action === 'lib_forget') data = khoBo(b.key, b.id);
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

// ────────────────────────────────────────────────────────────
// Tải lên: ba việc trang làm được. Việc nào cũng kiểm key trước.
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// Nội bộ
// ────────────────────────────────────────────────────────────

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
      parts: Math.max(1, Math.ceil(kq.size / TG_PART)), ps: TG_PART, part: 0, loi: 0
    }));
    return kq;
  }
  guiTelegram([
    '\u{1F4E5} File mới đã lên Google Drive',
    '',
    '\u{1F39E} ' + kq.name + ' (' + mbText(kq.size) + ')',
    '\u{1F441} Xem: ' + kq.viewUrl,
    '\u2B07\uFE0F Tải về: ' + kq.downloadUrl,
    share ? '' : '(Chỉ tài khoản Google của bạn mở được — chưa bật chia sẻ theo link.)'
  ].join('\n'));
  return kq;
}

function mbText(n) { return (Number(n) / 1048576).toFixed(1) + 'MB'; }

// ────────────────────────────────────────────────────────────
// Chuyển file từ Drive vào Telegram (chạy nền)
// ────────────────────────────────────────────────────────────

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
    donBanTam(all);
    // Lấy về trước (người dùng đang chờ trên trang), gửi đi sau.
    var viec = [[RES_PREFIX, layVeMotFile], [JOB_PREFIX, chuyenMotFile]];
    for (var v = 0; v < viec.length; v++) {
      var keys = Object.keys(all).filter(function (k) { return k.indexOf(viec[v][0]) === 0; });
      for (var i = 0; i < keys.length; i++) {
        var job;
        try { job = JSON.parse(all[keys[i]]); } catch (e) { props().deleteProperty(keys[i]); continue; }
        if (job.fail) continue;                // lấy về đã hỏng, chờ người dùng bấm lại
        if (!viec[v][1](job, batDau)) return;  // hết giờ, lượt sau làm tiếp
      }
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
      xoaFid(job.id, job.parts);
      guiTelegram('\u26A0\uFE0F Không chuyển được ' + job.name + ' vào Telegram' +
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
  var ps = job.ps || TG_PART_CU;
  var start = job.part * ps;
  var end = Math.min(start + ps, job.size) - 1;
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
  if (r && r.ok) {
    var doc = r.result && r.result.document;
    if (vaoKhoDuoc(job) && doc && doc.file_id) luuFid(job.id, job.part, doc.file_id);
    return true;
  }
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
  var kho = vaoKhoDuoc(job);
  if (kho) {
    props().setProperty(LIB_PREFIX + job.id, JSON.stringify({
      id: job.id, name: job.name, size: job.size, parts: job.parts, ps: job.ps, date: new Date().toISOString()
    }));
  }
  var dong = [];
  if (job.parts > 1) {
    dong.push('\u2705 ' + job.name + ' (' + mbText(job.size) + ') đã vào Telegram thành ' + job.parts + ' phần.');
    dong.push('');
    dong.push('Ghép lại sau khi tải đủ ' + job.parts + ' phần về máy:');
    dong.push('• Mở ' + GHEP_URL + ' → chọn cả ' + job.parts + ' phần → Ghép');
    dong.push("• Hoặc trên Mac, mở Terminal ở thư mục chứa các phần: cat '" + job.name + "'.0* > '" + job.name + "'");
    dong.push('');
  }
  dong.push(xoa.code === 200 ? '\u{1F5D1} Đã bỏ ' + job.name + ' khỏi Google Drive (còn trong Thùng rác 30 ngày).'
                             : '\u26A0\uFE0F Chưa xoá được ' + job.name + ' khỏi Drive (lỗi ' + xoa.code + '), xoá tay giúp nhé.');
  if (kho) dong.push('\u{1F4E6} Cần lấy lại trên máy không vào được Telegram: mục "Kho file trên Telegram" ở trang tải lên.');
  guiTelegram(dong.join('\n'));
}

/** Chỉ ghi vào kho khi từng phần đủ nhỏ để bot tải ngược về được (việc cũ 45MB thì không). */
function vaoKhoDuoc(job) { return (job.ps || TG_PART_CU) <= TG_TAI_MAX; }

// ─── Mã file_id các phần, 40 mã một ô Script Property ───
function oFid(id, part) { return FID_PREFIX + id + '_' + Math.floor(part / FID_MOI_O); }
function luuFid(id, part, fid) {
  var o = oFid(id, part), arr = [];
  try { arr = JSON.parse(props().getProperty(o) || '[]'); } catch (e) {}
  arr[part % FID_MOI_O] = fid;
  props().setProperty(o, JSON.stringify(arr));
}
function docFid(id, part) {
  try { return (JSON.parse(props().getProperty(oFid(id, part)) || '[]'))[part % FID_MOI_O] || ''; }
  catch (e) { return ''; }
}
function xoaFid(id, parts) {
  for (var c = 0; c * FID_MOI_O < Math.max(1, parts); c++) props().deleteProperty(FID_PREFIX + id + '_' + c);
}

// ────────────────────────────────────────────────────────────
// Kho: lấy file từ Telegram về Drive để tải trên máy không vào được Telegram
// ────────────────────────────────────────────────────────────

/** Danh sách file trong kho, mới nhất trước, kèm trạng thái lấy về. */
function khoDanhSach(key) {
  kiemKey(key);
  var all = props().getProperties(), now = Date.now(), out = [];
  // Đọc một lần ngoài vòng lặp: `all` đã có sẵn mọi thuộc tính, hỏi lại dịch vụ cho từng
  // file trong kho là tốn một lượt gọi mạng cho mỗi dòng mà kết quả không bao giờ khác.
  var thang = Boolean(all[PROP_WORKER] && all[PROP_SECRET]);
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(LIB_PREFIX) !== 0) return;
    var m;
    try { m = JSON.parse(all[k]); } catch (e) { return; }
    var it = { id: m.id, name: m.name, size: m.size, parts: m.parts, date: m.date, st: 'none',
               thang: thang && m.parts <= TAI_THANG_PHAN };
    var tam = docJson(all[TAM_PREFIX + m.id]), res = docJson(all[RES_PREFIX + m.id]);
    if (tam && tam.until > now) {
      it.st = 'san'; it.until = tam.until;
      it.url = 'https://drive.google.com/uc?export=download&id=' + tam.fileId;
      it.viewUrl = 'https://drive.google.com/file/d/' + tam.fileId + '/view';
    } else if (res && res.fail) {
      it.st = 'loi'; it.err = res.fail;
    } else if (res) {
      it.st = 'dang'; it.done = res.part;
    }
    out.push(it);
  });
  return out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
}

/** Xếp việc lấy về. Đã có bản tạm còn hạn thì thôi; đang lấy thì để yên. */
function khoLayVe(key, id) {
  kiemKey(key);
  var m = docKho(id);
  var tam = docJson(props().getProperty(TAM_PREFIX + id));
  if (tam && tam.until > Date.now()) return { st: 'san' };
  var res = docJson(props().getProperty(RES_PREFIX + id));
  if (res && !res.fail) return { st: 'dang', done: res.part };
  props().setProperty(RES_PREFIX + id, JSON.stringify({
    id: id, name: m.name, size: m.size, parts: m.parts, ps: m.ps, part: 0, session: '', loi: 0
  }));
  return { st: 'dang', done: 0 };
}

/**
 * Vé cho Worker tải thẳng — xem ai/worker/src/taive.js.
 *
 * Việc nặng nằm ở đây chứ không ở Worker: Apps Script hỏi Telegram đường dẫn của MỌI phần
 * (fetchAll nên chạy song song, 44 phần mất vài giây), rồi gói hết vào một vé đã ký. Nhờ
 * vậy Worker không tốn lượt subrequest nào cho việc hỏi han — mà subrequest là thứ hiếm
 * nhất bên đó: gói Free chỉ 50 lượt mỗi lần gọi, đúng bằng số phần tải được.
 *
 * Mọi thứ có thể hỏng đều hỏng Ở ĐÂY, nơi còn trả về được lỗi tử tế cho trang hiển thị.
 * Sang tới Worker thì luồng đã mở, hỏng là bản tải đứt giữa chừng.
 */
function khoVeTaiThang(key, id) {
  kiemKey(key);
  var m = docKho(id);
  var url = props().getProperty(PROP_WORKER), biMat = props().getProperty(PROP_SECRET);
  if (!url || !biMat) {
    throw new Error('PHIEN: Chưa cài tải thẳng — điền WORKER_URL, WORKER_SECRET rồi chạy lại caiDat (xem upload/README.md)');
  }
  if (m.parts > TAI_THANG_PHAN) {
    throw new Error('PHIEN: File này ' + m.parts + ' phần, tải thẳng tối đa ' + TAI_THANG_PHAN +
                    ' phần (~' + mbText(TAI_THANG_PHAN * TG_PART) + '). Dùng "Lấy về Drive".');
  }
  var token = props().getProperty(PROP_TOKEN);
  if (!token) throw new Error('PHIEN: Chưa chạy caiDat');

  var ids = [], yc = [];
  for (var i = 0; i < m.parts; i++) {
    var fid = docFid(id, i);
    if (!fid) throw new Error('PHIEN: Thiếu mã phần ' + (i + 1) + ' — file này gửi bằng bản cũ, dùng "Lấy về Drive"');
    ids.push(fid);
    yc.push({ url: 'https://api.telegram.org/bot' + token + '/getFile', method: 'post',
              contentType: 'application/json', payload: JSON.stringify({ file_id: fid }),
              muteHttpExceptions: true });
  }
  var res = UrlFetchApp.fetchAll(yc), phan = [];
  for (var j = 0; j < res.length; j++) {
    var o = null;
    try { o = JSON.parse(res[j].getContentText()); } catch (e) { o = null; }
    if (!o || !o.ok || !o.result || !o.result.file_path) {
      throw new Error('PHIEN: Telegram không cho đường dẫn phần ' + (j + 1) + ' (' +
                      (o && o.description ? o.description : res[j].getResponseCode()) + ')');
    }
    phan.push([ids[j], o.result.file_path]);
  }

  // Ký chính chuỗi base64url chứ không phải JSON gốc: hai bên khỏi phải sắp xếp khoá
  // giống nhau mới ra cùng chữ ký.
  var ve = { n: m.name, s: Number(m.size), e: Date.now() + VE_SONG_PHUT * 60000, f: phan };
  var d = Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(ve)).getBytes());
  var s = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(d, biMat));
  return { url: url, d: d, s: s, name: m.name, size: m.size };
}

/** Bỏ file khỏi kho (tin nhắn trong Telegram vẫn còn). Có bản tạm thì bỏ luôn. */
function khoBo(key, id) {
  kiemKey(key);
  var m = docKho(id);
  var tam = docJson(props().getProperty(TAM_PREFIX + id));
  if (tam) driveApi('patch', DRIVE_FILES + '/' + tam.fileId, { trashed: true });
  [LIB_PREFIX, RES_PREFIX, TAM_PREFIX].forEach(function (p) { props().deleteProperty(p + id); });
  xoaFid(id, m.parts);
  return { ok: true };
}

function docKho(id) {
  if (!/^[\w-]{1,100}$/.test(String(id || ''))) throw new Error('PHIEN: Mã file không hợp lệ');
  var m = docJson(props().getProperty(LIB_PREFIX + id));
  if (!m) throw new Error('PHIEN: Không có file này trong kho');
  return m;
}

function docJson(v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }

/** Trả false khi hết giờ giữa chừng. */
function layVeMotFile(job, batDau) {
  var key = RES_PREFIX + job.id;
  while (job.part < job.parts) {
    if ((Date.now() - batDau) / 1000 > WORKER_GIAY) return false;
    var ok;
    try { ok = layMotPhan(job); }
    catch (err) { ghiLoi('layVe ' + job.name, err); ok = String(err && err.message || err); }
    if (ok === true) {
      job.part++; job.loi = 0;
      props().setProperty(key, JSON.stringify(job));
      continue;
    }
    if (ok === 'phien') { job.part = 0; job.session = ''; }  // phiên Drive hết hạn → ghép lại từ đầu
    job.loi = (job.loi || 0) + 1;
    if (job.loi >= JOB_MAX_LOI) {
      job.fail = ok === 'phien' ? 'Phiên Google Drive hết hạn liên tục' : ok;
      props().setProperty(key, JSON.stringify(job));
      guiTelegram('\u26A0\uFE0F Không lấy được ' + job.name + ' về Drive (lỗi: ' + job.fail + '). Bấm "Lấy về" trên trang để thử lại.');
      return true;
    }
    props().setProperty(key, JSON.stringify(job));
    return false;
  }
  var fileId = job.driveId;
  driveApi('post', DRIVE_FILES + '/' + fileId + '/permissions', { role: 'reader', type: 'anyone' });
  props().setProperty(TAM_PREFIX + job.id, JSON.stringify({ fileId: fileId, until: Date.now() + GIU_BAN_TAM_GIO * 3600000 }));
  props().deleteProperty(key);
  guiTelegram('\u{1F4E6} Đã lấy ' + job.name + ' (' + mbText(job.size) + ') về Google Drive:\n' +
    'https://drive.google.com/uc?export=download&id=' + fileId +
    '\n\nBản tạm này tự bỏ vào thùng rác sau ' + GIU_BAN_TAM_GIO + ' giờ.');
  return true;
}

/**
 * Kéo phần job.part từ Telegram, đẩy tiếp vào phiên resumable upload của Drive.
 * Trả true, 'phien' (phiên Drive hết hạn) hoặc chuỗi lỗi.
 */
function layMotPhan(job) {
  var token = props().getProperty(PROP_TOKEN);
  if (!token) return 'chưa chạy caiDat';
  if (!job.session) {
    var s = UrlFetchApp.fetch(DRIVE_UPLOAD + '?uploadType=resumable', {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Length': String(job.size) },
      payload: JSON.stringify({ name: job.name, parents: [thuMucUpload()] }),
      muteHttpExceptions: true
    });
    job.session = s.getResponseCode() === 200 ? layHeader(s, 'location') : '';
    if (!job.session) return 'Drive ' + s.getResponseCode();
  }

  var fid = docFid(job.id, job.part);
  if (!fid) return 'thiếu mã phần ' + (job.part + 1);
  var f = tgApi('getFile', { file_id: fid });
  if (!f || !f.ok) return 'Telegram ' + (f ? (f.error_code || '') + ' ' + (f.description || '') : 'không phản hồi');
  var dl = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + token + '/' + f.result.file_path, { muteHttpExceptions: true });
  if (dl.getResponseCode() !== 200) return 'Telegram tải phần ' + (job.part + 1) + ' lỗi ' + dl.getResponseCode();

  var bytes = dl.getContent();
  var start = job.part * job.ps, end = Math.min(start + job.ps, job.size) - 1;
  if (bytes.length !== end - start + 1) return 'phần ' + (job.part + 1) + ' sai dung lượng';
  var put = UrlFetchApp.fetch(job.session, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + job.size },
    payload: bytes,
    muteHttpExceptions: true,
    followRedirects: false
  });
  var code = put.getResponseCode();
  if (code === 308) return true;
  if (code === 200 || code === 201) { job.driveId = JSON.parse(put.getContentText()).id; return true; }
  if (code === 404 || code === 410) return 'phien';
  return 'Drive ' + code;
}

/** Bản tạm quá hạn → bỏ vào thùng rác. */
function donBanTam(all) {
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(TAM_PREFIX) !== 0) return;
    var t = docJson(all[k]);
    if (t && t.until > now) return;
    if (t) driveApi('patch', DRIVE_FILES + '/' + t.fileId, { trashed: true });
    props().deleteProperty(k);
  });
}

function tgApi(method, payload) {
  var token = props().getProperty(PROP_TOKEN);
  if (!token) return null;
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText());
  } catch (err) { return null; }
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

// ────────────────────────────────────────────────────────────
// Chạy tay trong trình soạn thảo
// ────────────────────────────────────────────────────────────

/**
 * Chạy sau khi điền 3 giá trị ở đầu file và đã Triển khai web app.
 * Google sẽ hỏi quyền Drive; hàm lưu token, tạo key, tạo thư mục, rồi nhắn
 * link trang (kèm sẵn key) vào Telegram. Chạy lại nhiều lần vẫn an toàn.
 */
/** Dự án này có phải backend trang khoá học (gắn Sheet đăng ký) không — dấu hiệu: cấu hình cohort / admin bot. */
function laDuAnKhoaHoc() {
  return Boolean(props().getProperty('SITE_CONFIG') || props().getProperty('TG_ADMIN_IDS'));
}

function caiDat() {
  // Dán nhầm file này vào dự án backend trang khoá học là trang khoá học chết hẳn:
  // form đăng ký, cấu hình cohort, lệnh bot đều đi vào code upload. Chặn ngay từ đầu.
  if (laDuAnKhoaHoc()) {
    throw new Error('Đây là dự án backend TRANG KHOÁ HỌC (gắn Sheet đăng ký) — đừng cài công cụ upload ở đây. ' +
                    'Dán lại backend/Code.gs vào dự án này, rồi tạo DỰ ÁN MỚI riêng cho upload (xem upload/README.md).');
  }
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

  // Tải thẳng là tuỳ chọn: để trống hai dòng đầu file thì bỏ qua, trang chỉ có nút
  // "Lấy về Drive" như cũ. Điền sai một nửa thì chặn luôn — thiếu một nửa là trang hiện
  // nút Tải thẳng rồi bấm vào mới báo lỗi, khó hiểu hơn nhiều so với báo ngay ở đây.
  var wUrl = String(WORKER_URL).trim(), wBiMat = String(WORKER_SECRET).trim();
  if (!!wUrl !== !!wBiMat) throw new Error('Tải thẳng cần CẢ WORKER_URL lẫn WORKER_SECRET — điền nốt, hoặc xoá cả hai.');
  if (wUrl) {
    if (!/^https:\/\/[\w.-]+\/[\w/-]*$/.test(wUrl)) throw new Error('WORKER_URL phải là địa chỉ https của Worker, vd https://....workers.dev/taive');
    if (wBiMat.length < 24) throw new Error('WORKER_SECRET quá ngắn — đặt chuỗi ngẫu nhiên ít nhất 24 ký tự, giống hệt secret TAIVE_SECRET của Worker.');
  }
  props().setProperty(PROP_WORKER, wUrl);
  props().setProperty(PROP_SECRET, wBiMat);

  var folder = thuMucUpload();
  datLichChuyen();
  var link = linkTrang();
  var tg = guiTelegram('\u{1F4E4} Trang tải file lên Google Drive\n\n' + link +
    '\n\nLink đã kèm sẵn key — ĐỪNG gửi cho người khác.\nMở một lần là trang tự nhớ key.');

  Logger.log('✔ Thư mục Drive: https://drive.google.com/drive/folders/' + folder);
  Logger.log('✔ Đã đặt lịch chuyển file vào Telegram (mỗi phút)');
  Logger.log(wUrl ? '✔ Tải thẳng qua Worker: ' + wUrl + ' (tối đa ' + TAI_THANG_PHAN + ' phần ≈ ' + mbText(TAI_THANG_PHAN * TG_PART) + ')'
                  : '• Tải thẳng: chưa bật — trang chỉ có nút "Lấy về Drive"');
  Logger.log('✔ Trang tải lên (kèm key, đừng chia sẻ):\n' + link);
  Logger.log(tg && tg.ok ? '✔ Đã nhắn link vào Telegram'
                         : '✘ Không nhắn được Telegram — kiểm tra TG_TOKEN / TG_CHAT');
}

/** Đổi key mới (vd. lỡ để lộ link). Link cũ hết dùng được. */
function doiKey() {
  props().setProperty(PROP_KEY, Utilities.getUuid());
  Logger.log('✔ Key mới. Link trang mới:\n' + linkTrang());
  guiTelegram('\u{1F511} Đã đổi key trang tải file. Link mới:\n\n' + linkTrang());
}
