// Điền địa chỉ máy chủ vừa triển khai vào mọi chỗ trang web đang trỏ tới nó.
//
// Bước thủ công cuối cùng lúc cài là chép địa chỉ workers.dev dán vào config.js — vừa dễ dán
// nhầm, vừa phải commit tay. Chạy trong GitHub Actions ngay sau khi triển khai xong thì khỏi.
//
//   node tools/config-url.mjs <địa chỉ>
//
// Sửa 6 chỗ: ai/js/config.js, links/js/backend.js, index.html (trang khoá học), và khai báo
// connect-src trong CSP của ai/index.html + links/index.html + links/edit.html. Địa chỉ CŨ lấy từ
// chính config.js rồi thay khắp nơi, nên không phải giữ danh sách địa chỉ ở hai chỗ.
//
// In ra "DOI" nếu có sửa, "GIU" nếu địa chỉ đã đúng sẵn (workflow dựa vào đó để biết có cần commit).

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const duong = new URL('../../js/config.js', import.meta.url);
const DONG = /^(export const API = )'[^']*';$/m;
// Dòng khai báo địa chỉ ở từng file, và các file chỉ cần thay địa chỉ cũ bằng địa chỉ mới.
const DONG_LINKS = /^(export const BACKEND_URL = )'[^']*';$/m;
const DONG_KHOA_HOC = /^(\s*var API = )'[^']*';/m;
const duongKhoaHoc = new URL('../../../index.html', import.meta.url);
const duongLinks = new URL('../../../links/js/backend.js', import.meta.url);
const duongCSP = ['../../index.html', '../../../links/index.html', '../../../links/edit.html']
  .map((d) => new URL(d, import.meta.url));

const thoat = (msg) => { console.error(`✘ ${msg}`); process.exit(1); };

/** Địa chỉ wrangler in ra, hoặc lôi ra từ cả khối chữ nó in. */
export function locDiaChi(raw) {
  const s = String(raw || '').trim();
  const m = /https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?(?=[\s/)'"]|$)/i.exec(s);
  if (!m) return '';
  // Bỏ dấu / ở cuối: trang tự nối đường dẫn nên hai dấu / liền nhau là gọi hỏng.
  return m[0].replace(/\/+$/, '');
}

/** Thay một dòng khai báo địa chỉ trong file. @returns có sửa gì không */
function suaDong(d, dong, ten, dc) {
  const cu = readFileSync(d, 'utf8');
  if (!dong.test(cu)) thoat(`${ten} không còn dòng khai báo địa chỉ như mong đợi`);
  const moi = cu.replace(dong, `$1'${dc}';`);
  if (moi === cu) return false;
  writeFileSync(d, moi);
  return true;
}

/** Thay địa chỉ cũ bằng địa chỉ mới ở mọi chỗ trong file (dùng cho CSP). */
function thayKhap(d, cu, moi) {
  if (cu === moi) return false;
  let txt;
  // Thiếu file thì dừng hẳn: CSP không cho gọi máy chủ là trang chết LẶNG, không lỗi đỏ gì cả.
  try { txt = readFileSync(d, 'utf8'); } catch { thoat(`không đọc được ${d.pathname}`); }
  if (!txt.includes(cu)) return false;
  writeFileSync(d, txt.split(cu).join(moi));
  return true;
}

function chay(raw) {
  const dc = locDiaChi(raw);
  if (!dc) thoat(`Không tìm thấy địa chỉ https trong: ${String(raw || '').slice(0, 200)}`);
  // Địa chỉ đang khai trong config.js: dùng nó để tìm-thay trong CSP, khỏi phải đoán bằng mẫu.
  const truoc = (DONG.exec(readFileSync(duong, 'utf8')) ? /'([^']*)'/.exec(RegExp.lastMatch)[1] : '');
  let doi = suaDong(duong, DONG, 'ai/js/config.js', dc);
  doi = suaDong(duongLinks, DONG_LINKS, 'links/js/backend.js', dc) || doi;
  doi = suaDong(duongKhoaHoc, DONG_KHOA_HOC, 'index.html', dc) || doi;
  if (truoc) for (const d of duongCSP) doi = thayKhap(d, truoc, dc) || doi;
  console.log(`${doi ? 'DOI' : 'GIU'} ${dc}`);
}

// Chỉ chạy khi gọi thẳng từ dòng lệnh — bài kiểm tra còn import locDiaChi từ file này.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) chay(process.argv[2]);
