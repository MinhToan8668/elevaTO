// Đóng gói thành MỘT file HTML tự chứa (nhúng thư viện Excel) để gửi cho team: mở bằng Chrome/Edge là chạy,
// không cần mạng (trừ khi dùng AI Gemini).   node build.mjs  →  dist/BangKe_GiaiNgan.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const here = (p) => new URL(p, import.meta.url);
let html = readFileSync(here('index.html'), 'utf8');
const lib = readFileSync(here('vendor/xlsx-js-style.bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const tags = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx-js-style@1\.2\.0\/dist\/xlsx\.bundle\.js"><\/script>\n<script>window\.XLSX \|\| document\.write\([^\n]*\);<\/script>/;
if (!tags.test(html)) throw new Error('Không thấy thẻ nạp thư viện Excel trong index.html');
html = html.replace(tags, () => `<script>/* xlsx-js-style 1.2.0 — Apache-2.0 */\n${lib}\n</script>`);
mkdirSync(here('dist/'), { recursive: true });
writeFileSync(here('dist/BangKe_GiaiNgan.html'), html);
console.log('dist/BangKe_GiaiNgan.html', (html.length / 1024).toFixed(0) + ' KB');
