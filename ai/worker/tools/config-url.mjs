// Điền địa chỉ máy chủ vừa triển khai vào ai/js/config.js.
//
// Bước thủ công cuối cùng lúc cài là chép địa chỉ workers.dev dán vào config.js — vừa dễ dán
// nhầm, vừa phải commit tay. Chạy trong GitHub Actions ngay sau khi triển khai xong thì khỏi.
//
//   node tools/config-url.mjs <địa chỉ>
//
// In ra "DOI" nếu có sửa, "GIU" nếu địa chỉ đã đúng sẵn (workflow dựa vào đó để biết có cần commit).

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const duong = new URL('../../js/config.js', import.meta.url);
const DONG = /^(export const API = )'[^']*';$/m;

const thoat = (msg) => { console.error(`✘ ${msg}`); process.exit(1); };

/** Địa chỉ wrangler in ra, hoặc lôi ra từ cả khối chữ nó in. */
export function locDiaChi(raw) {
  const s = String(raw || '').trim();
  const m = /https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?(?=[\s/)'"]|$)/i.exec(s);
  if (!m) return '';
  // Bỏ dấu / ở cuối: trang tự nối đường dẫn nên hai dấu / liền nhau là gọi hỏng.
  return m[0].replace(/\/+$/, '');
}

function chay(raw) {
  const dc = locDiaChi(raw);
  if (!dc) thoat(`Không tìm thấy địa chỉ https trong: ${String(raw || '').slice(0, 200)}`);
  const cu = readFileSync(duong, 'utf8');
  if (!DONG.test(cu)) thoat('ai/js/config.js không còn dòng "export const API = \'…\';" như mong đợi');
  const moi = cu.replace(DONG, `$1'${dc}';`);
  if (moi === cu) { console.log(`GIU ${dc}`); return; }
  writeFileSync(duong, moi);
  console.log(`DOI ${dc}`);
}

// Chỉ chạy khi gọi thẳng từ dòng lệnh — bài kiểm tra còn import locDiaChi từ file này.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) chay(process.argv[2]);
