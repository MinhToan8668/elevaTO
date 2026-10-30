// Đóng gói AI BCTC thành MỘT file HTML mở thẳng trên máy (nhấp đúp, file://), dùng API key Gemini như AI FinLens.
// Chạy: node tools/build-local.mjs  →  dist/AI_BCTC_elevaTO.html
// Mọi thứ nhúng trong file: JS (gom bằng esbuild), CSS, phông, logo, pdf.js + worker, wasm đọc bản scan,
// SheetJS / JSZip / pdf-lib. Thư viện nạp qua địa chỉ giả https://vendor.elevato.local/ — một lớp chặn fetch
// (ở trang và trong worker của pdf.js) trả về dữ liệu nhúng.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const AI = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(AI, '..');
const BASE = 'https://vendor.elevato.local/';
const rd = (p) => readFileSync(join(AI, p));
const b64 = (buf) => Buffer.from(buf).toString('base64');
const MIME = { '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

// 1. JS: gom js/app.js thành một module.
const js = execFileSync('npx', ['--yes', 'esbuild', join(AI, 'js/app.js'), '--bundle', '--format=esm', '--minify', '--charset=utf8',
  '--log-level=warning'], { maxBuffer: 64e6 }).toString();

// 2. CSS: các tệp trang dùng, url(...) đổi thành data URI.
const inlineUrls = (css, dir) => css.replace(/url\((['"]?)(?!data:|https?:|#)([^'")]+)\1\)/g, (m, q, u) => {
  const f = join(dir, u.split('?')[0]);
  try { return `url(data:${MIME[extname(f)] || 'application/octet-stream'};base64,${b64(readFileSync(f))})`; } catch (e) { return m; }
});
const css = [['vendor/fonts/be-vietnam-pro.css'], ['css/app.css'], ['../links/fonts/plus-jakarta-sans.css'], ['../assets/hop.css']]
  .map(([p]) => inlineUrls(rd(p).toString(), dirname(join(AI, p)))).join('\n');

// 3. Thư viện nạp khi cần.
const files = {};
const add = (rel) => { files[rel] = b64(rd(`vendor/${rel}`)); };
for (const d of ['pdfjs/wasm', 'pdfjs/standard_fonts', 'pdfjs/iccs']) for (const f of readdirSync(join(AI, 'vendor', d))) if (statSync(join(AI, 'vendor', d, f)).isFile() && !/^LICENSE/.test(f)) add(`${d}/${f}`);
const scripts = ['sheetjs/xlsx.full.min.js', 'jszip/jszip.min.js', 'pdf-lib/pdf-lib.min.js', 'qrcode/qrcode.js'];
const scriptData = Object.fromEntries(scripts.map((s) => [s, b64(rd(`vendor/${s}`))]));
const worker = rd('vendor/pdfjs/pdf.worker.min.mjs').toString();

const shim = `(()=>{const F=${JSON.stringify(files)};const B=${JSON.stringify(BASE)};const of=self.fetch.bind(self);
self.fetch=(u,o)=>{const s=String(u&&u.url||u);if(s.startsWith(B)){const k=s.slice(B.length).replace(/^pdfjs\\//,'pdfjs/');const d=F[k];
if(!d)return Promise.resolve(new Response(null,{status:404}));const bin=atob(d),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
return Promise.resolve(new Response(a,{status:200}));}return of(u,o);};})();`;

const boot = `<script>
window.__ELEVATO_LOCAL__=true;window.__ELEVATO_VENDOR__=${JSON.stringify(BASE)};
${shim}
const S=${JSON.stringify(scriptData)};const blob=(t,m)=>URL.createObjectURL(new Blob([t],{type:m}));
window.__ELEVATO_SCRIPT__=(f)=>S[f]?blob(Uint8Array.from(atob(S[f]),c=>c.charCodeAt(0)),'text/javascript'):null;
window.__ELEVATO_PDF_WORKER__=blob(document.getElementById('pdfw').textContent,'text/javascript');
</script>`;

// 4. HTML: lấy index.html, bỏ CSP / link / script ngoài, nhúng mọi thứ.
let html = rd('index.html').toString();
const img = (p) => `data:image/svg+xml;base64,${b64(readFileSync(join(ROOT, p)))}`;
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
  .replace(/<link rel="(preload|stylesheet)"[^>]*>\n?/g, '')
  .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="${img('assets/logo-mark.svg')}">`)
  .replace('src="../assets/logo-on-light.svg"', () => `src="${img('assets/logo-on-light.svg')}"`)
  .replace('src="../assets/logo-on-dark.svg"', () => `src="${img('assets/logo-on-dark.svg')}"`)
  .replace('<script src="js/theme.js"></script>', () => `<script>${rd('js/theme.js')}</script>`)
  .replace('<script type="module" src="js/app.js"></script>', () =>
    `<style>${css}</style>\n<script type="text/plain" id="pdfw">${shim}\n${worker.replace(/<\/script/gi, '<\\/script')}</script>\n${boot}\n<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/href="\.\.\/"/g, 'href="https://minhtoan8668.github.io/elevaTO/"')
  .replace('href="./"', 'href="#"');
mkdirSync(join(AI, 'dist'), { recursive: true });
const out = join(AI, 'dist/AI_BCTC_elevaTO.html');
writeFileSync(out, html);
console.log(out, (html.length / 1e6).toFixed(1), 'MB');
