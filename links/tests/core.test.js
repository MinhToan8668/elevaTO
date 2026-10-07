import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  safeUrl, safeImg, socialUrl, normalize, brandDoc, mergeDraft, glassIconFor, cleanToken, tokenProblem, THEME_DEFAULT, ICON3D, GLASS, TMXK, TMXK_EMOJI, CLASSIC, ICON_LIBRARY, visibleLinks, visibleSocials, hiddenReason, opensSheet,
  cohortInfo, utf8ToBase64, serialize, githubError, ACCENTS, ACCENT_LABELS, BACKGROUNDS,
} from '../js/core.js';
import { ICONS, TILE_ICONS, svg } from '../js/icons.js';

// Từ đời 2, normalize() trả về CẢ TRANG (nhiều thương hiệu). Phần lớn bài kiểm dưới đây quan tâm
// một thương hiệu, nên đi qua helper này cho gọn: dữ liệu đời 1 → bản phẳng của thương hiệu đầu tiên.
const mot = (raw) => brandDoc(normalize(raw), 0);

test('safeUrl chỉ cho qua http(s), mailto, tel, sms và đường dẫn tương đối', () => {
  assert.equal(safeUrl('https://zalo.me/0901234567'), 'https://zalo.me/0901234567');
  assert.equal(safeUrl('../#slides'), '../#slides');
  assert.equal(safeUrl('mailto:a@b.vn'), 'mailto:a@b.vn');
  assert.equal(safeUrl('  '), '');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('JaVaScRiPt:alert(1)'), '');
  assert.equal(safeUrl('java\tscript:alert(1)'), '');
  assert.equal(safeUrl(' \u0001javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,<b>x</b>'), '');
  assert.equal(safeUrl('//evil.example/x'), '');
});

test('socialUrl đổi handle / số điện thoại thành link đầy đủ', () => {
  assert.equal(socialUrl('tiktok', '@financewithto'), 'https://www.tiktok.com/@financewithto');
  assert.equal(socialUrl('tiktok', 'https://www.tiktok.com/@x'), 'https://www.tiktok.com/@x');
  assert.equal(socialUrl('zalo', '0901 234 567'), 'https://zalo.me/0901234567');
  assert.equal(socialUrl('zalo', '+84 901 234 567'), 'https://zalo.me/0901234567');
  assert.equal(socialUrl('facebook', 'facebook.com/minhtoan'), 'https://facebook.com/minhtoan');
  assert.equal(socialUrl('linkedin', 'minh-toan'), 'https://www.linkedin.com/in/minh-toan');
  assert.equal(socialUrl('email', 'a@b.vn'), 'mailto:a@b.vn');
  assert.equal(socialUrl('phone', '0901 234 567'), 'tel:0901234567');
  assert.equal(socialUrl('facebook', ''), '');
  assert.equal(socialUrl('website', 'javascript:alert(1)'), '');
});

test('normalize điền đủ trường, chặn giá trị lạ, không sửa object gốc', () => {
  const raw = { profile: { name: '  Toàn ' }, links: [{ title: 'A', url: 'x', size: 'huge', accent: 'neon' }], stats: [{}, { value: '1' }] };
  const frozen = JSON.stringify(raw);
  const d = mot(raw);
  assert.equal(JSON.stringify(raw), frozen);
  assert.equal(d.profile.name, 'Toàn');
  assert.equal(d.profile.verified, true);
  assert.equal(d.links[0].size, 'half');
  assert.equal(d.links[0].accent, 'emerald');
  assert.ok(d.links[0].id);
  assert.deepEqual(d.stats, [{ value: '1', label: '' }]);
  assert.deepEqual(mot(null).links, []);
  assert.equal(mot({ stats: Array(9).fill({ value: '1' }) }).stats.length, 4);
});

test('ô thiếu link, bị tắt hoặc link độc hại không hiện ra — và trình chỉnh sửa nói rõ vì sao', () => {
  const d = mot({ links: [
    { id: 'ok', title: 'Hiện', url: 'https://a.vn' },
    { id: 'empty', title: 'Trống', url: '' },
    { id: 'off', title: 'Tắt', url: 'https://a.vn', hidden: true },
    { id: 'bad', title: 'Độc', url: 'javascript:alert(1)' },
    { id: 'nameless', title: '', url: 'https://a.vn' },
  ] });
  assert.deepEqual(visibleLinks(d).map((l) => l.id), ['ok']);
  assert.deepEqual(d.links.map(hiddenReason), ['', 'Chưa có link — đang ẩn', 'Đang tắt', 'Link không hợp lệ — đang ẩn', 'Chưa có tiêu đề']);
});

test('mạng xã hội để trống thì ẩn', () => {
  const d = mot({ socials: [{ type: 'tiktok', url: '@a' }, { type: 'facebook', url: '' }, { type: 'lạ', url: 'https://x.vn' }] });
  assert.deepEqual(visibleSocials(d).map((s) => [s.type, s.href]), [['tiktok', 'https://www.tiktok.com/@a'], ['website', 'https://x.vn']]);
});

test('thẻ chi tiết chỉ mở khi đã bật và có nội dung', () => {
  const [a, b, c] = mot({ links: [
    { details: { enabled: true, text: 'x' } },
    { details: { enabled: true } },
    { details: { enabled: false, bullets: ['y'] } },
  ] }).links;
  assert.equal(opensSheet(a), true);
  assert.equal(opensSheet(b), false);
  assert.equal(opensSheet(c), false);
});

test('cohortInfo: cùng quy tắc tính chỗ với trang khoá học', () => {
  const base = { cohort: { number: 7, status: 'open', openText: 'Sắp mở' }, slots: { max: 10, base: 4, registered: 1 },
    pricing: { earlyBird: 3000000 }, schedule: { days: 'Thứ 7 & CN', time: '9h–11h' } };
  const c = cohortInfo(base);
  assert.equal(c.label, 'Cohort 07');
  assert.equal(c.status, 'Sắp mở');
  assert.equal(c.remaining, 5);
  assert.equal(c.percent, 50);
  assert.equal(c.earlyBird, '3tr');
  assert.equal(c.schedule, 'Thứ 7 & CN · 9h–11h');
  assert.equal(c.isOpen, true);
  assert.equal(cohortInfo({ ...base, slots: { max: 10, base: 10, registered: 2 } }).status, 'Đã đủ chỗ');
  assert.equal(cohortInfo({ ...base, cohort: { number: 7, status: 'closed' } }).isOpen, false);
  assert.equal(cohortInfo({ ...base, pricing: { earlyBird: 2500000 } }).earlyBird, '2,5tr');
  assert.equal(cohortInfo(null), null);
});

test('utf8ToBase64 giữ đúng chữ tiếng Việt (GitHub API đòi base64 của UTF-8)', () => {
  const s = 'Minh Toàn · Học thử buổi 1 ☕';
  assert.equal(Buffer.from(utf8ToBase64(s), 'base64').toString('utf8'), s);
  const big = 'đ'.repeat(70000);
  assert.equal(Buffer.from(utf8ToBase64(big), 'base64').toString('utf8'), big);
});

test('serialize ổn định: chạy lại không đổi nội dung (để biết có thay đổi chưa đăng)', async () => {
  const raw = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'));
  const once = serialize(raw);
  assert.equal(serialize(JSON.parse(once)), once);
  assert.equal(once, serialize(normalize(raw)));
});

test('data.json trong repo hợp lệ: mọi thương hiệu đủ ô, mã ?v= không trùng', async () => {
  const site = normalize(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  assert.ok(site.brands.length >= 2, 'phải có ít nhất hai thương hiệu');
  assert.deepEqual([...new Set(site.brands.map((b) => b.id))].length, site.brands.length, 'mã ?v= bị trùng');
  for (const s of site.socials) assert.ok(s.type);
  for (const l of site.pinned) assert.ok(TILE_ICONS[l.icon], 'icon lạ ở ô ghim: ' + l.icon);
  assert.ok(visibleLinks({ links: site.pinned }).length >= 1, 'phải có ô ghim nào đó hiện được');

  for (let i = 0; i < site.brands.length; i += 1) {
    const d = brandDoc(site, i);
    for (const l of d.links) assert.ok(TILE_ICONS[l.icon], d.id + ': icon lạ: ' + l.icon);
    assert.ok(visibleLinks(d).length >= 3, d.id + ': ít ô quá, trang nhìn trống');
    assert.ok(d.links.some((l) => l.size === 'feature'), d.id + ': thiếu ô nổi bật');
  }
  // Riêng thương hiệu tài chính mới nối số chỗ cohort trực tiếp từ Apps Script.
  const fin = brandDoc(site, 0);
  assert.ok(fin.links.some((l) => l.size === 'feature' && l.live));
  assert.match(fin.live.api, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
});

test('mọi icon chọn được đều có hình, svg() không bao giờ trả chuỗi rỗng', () => {
  for (const n of Object.keys(TILE_ICONS)) assert.ok(ICONS[n], n);
  assert.match(svg('không-có'), /^<svg /);
  assert.match(svg('tiktok'), /fill="currentColor"/);
});

// Nút chọn icon / màu chỉ là hình, nên nhãn là thứ duy nhất trình đọc màn hình đọc ra.
test('icon và màu nhấn nào cũng có nhãn tiếng Việt cho trình đọc màn hình', () => {
  for (const [name, label] of Object.entries(TILE_ICONS)) {
    assert.equal(typeof label, 'string', name);
    assert.ok(label && label !== name, 'icon thiếu nhãn: ' + name);
  }
  for (const name of Object.keys(ACCENTS)) assert.ok(ACCENT_LABELS[name], 'màu thiếu nhãn: ' + name);
  assert.deepEqual(Object.keys(ACCENT_LABELS).sort(), Object.keys(ACCENTS).sort());
});

// Nhịp vẽ đầu tiên dùng giá trị mặc định trong CSS; JS áp theme thật vài trăm mili-giây sau.
// Hai bên lệch nhau là người xem thấy "giao diện cũ" rồi mới nhảy sang bản đúng.
test('mặc định --blur/--tint trong CSS trùng theme của data.json (khỏi nháy lúc mới mở)', async () => {
  const css = await readFile(new URL('../css/links.css', import.meta.url), 'utf8');
  const d = mot(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  const root = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));
  assert.match(root, new RegExp('--blur:' + d.theme.blur + 'px'), 'đổi theme trong data.json thì sửa cả mặc định trong CSS');
  assert.match(root, new RegExp('--tint:' + String(d.theme.tint / 100).replace(/^0/, '').replace('.', '\\.')));
});

// Mọi nền × sáng/tối phải có CẢ --chrome (màu thanh trạng thái) lẫn --base (màu trơn của khung
// trình duyệt). Thiếu --base là iPhone hở dải gần đen ở thanh trạng thái và trên thanh công cụ.
test('nền nào cũng có --chrome và --deep, và thẻ theme-color dự phòng trùng nền mặc định', async () => {
  const css = await readFile(new URL('../css/links.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const khoi = '\\{--chrome:#[0-9a-f]{6};--deep:#[0-9a-f]{6}\\}';
  for (const bg of Object.keys(BACKGROUNDS)) {
    if (bg === 'image') continue;               // nền ảnh tự chọn: không đoán trước được màu
    const chon = bg === 'aurora' ? '' : '\\[data-bg="' + bg + '"\\]';
    assert.match(css, new RegExp(':root' + chon + khoi), 'thiếu --chrome/--deep cho nền ' + bg);
    assert.match(css, new RegExp('\\[data-theme="dark"\\]' + chon + khoi), 'thiếu --chrome/--deep nền tối cho ' + bg);
  }
  const sang = css.match(/:root\{--chrome:(#[0-9a-f]{6})/)[1];
  const toi = css.match(/:root\[data-theme="dark"\]\{--chrome:(#[0-9a-f]{6})/)[1];
  assert.ok(html.includes('content="' + sang + '" media="(prefers-color-scheme: light)"'), 'thẻ theme-color sáng lệch --chrome');
  assert.ok(html.includes('content="' + toi + '" media="(prefers-color-scheme: dark)"'), 'thẻ theme-color tối lệch --chrome');
});

// iPhone tô thanh trạng thái theo MÀU NỀN CỦA BODY, không theo <meta name="theme-color">
// (đo ảnh chụp máy thật: dải đó ra đúng #05090b của --base đời trước, sai lệch 1–4 đơn vị).
// Nên nền body phải là --chrome — màu thật ở đỉnh trang — chứ không phải màu đục --deep.
test('nền body là --chrome, và --deep luôn tối/nhạt hơn để nằm dưới hai quầng sáng', async () => {
  const css = await readFile(new URL('../css/links.css', import.meta.url), 'utf8');
  assert.match(css, /\bbody\{[^}]*background:var\(--chrome\)/, 'nền body phải là --chrome, không thì iPhone hở dải lạc màu ở đỉnh');
  assert.match(css, /\.bg\{[^}]*var\(--deep\)\}/s, '--deep phải là lớp đục cuối cùng của .bg');
  assert.doesNotMatch(css, /var\(--base\)/, 'còn sót --base: hai vai trò đã tách thành --chrome và --deep');

  const doc = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const troi = (c) => c.indexOf(Math.max(...c));          // kênh màu trội
  const sang = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  let n = 0;
  let giay = 0;
  for (const m of css.matchAll(/(:root[^{]*)\{\s*--chrome:(#[0-9a-f]{6});\s*--deep:(#[0-9a-f]{6})/g)) {
    const [, sel, chrome, deep] = m;
    const c = doc(chrome); const d = doc(deep);
    assert.equal(troi(d), troi(c), sel + ': --deep lệch tông so với --chrome');
    assert.ok(Math.max(...c) - Math.min(...c) >= 8, sel + ': --chrome gần như xám, mép trên sẽ ra dải đen/trắng');
    // Lớp sơn "giấy" của TMXK phủ MỘT màu phẳng từ mép trên xuống mép dưới, không có quầng sáng
    // nào nằm trên nền — nên ở đó --deep phải GẦN BẰNG --chrome, chứ không tối/sáng hơn.
    if (sel.includes('data-skin="paper"')) {
      assert.ok(Math.abs(sang(d) - sang(c)) < 30, sel + ': nền giấy phải phẳng một màu, --deep lệch --chrome quá xa');
      giay += 1;
      continue;
    }
    const toi = sel.includes('dark') || sel.includes('not([data-theme="light"])');
    assert.ok(toi ? sang(d) < sang(c) : sang(d) > sang(c), sel + ': --deep phải tối hơn --chrome ở nền tối, sáng hơn ở nền sáng');
    n += 1;
  }
  assert.equal(n, 12, 'phải đủ 4 nền × (sáng + tối theo thuộc tính + tối theo máy)');
  assert.ok(giay >= 2, 'lớp sơn giấy phải khai --chrome/--deep cho cả sáng lẫn tối');
});

test('lỗi GitHub ra câu dễ hiểu', () => {
  assert.match(githubError(401), /không nhận token/);
  assert.match(githubError(403), /Contents: Read and write/);
  assert.match(githubError(404, { message: 'Resource not accessible by personal access token' }), /quyền ghi/);
  assert.match(githubError(404, { message: 'Not Found' }), /Không thấy repo/);
  assert.match(githubError(409), /bản mới hơn/);
  assert.match(githubError(0), /mạng/);
});

test('link gõ thiếu https:// được tự thêm; link sang trang khác giả dạng đường dẫn bị chặn', () => {
  assert.equal(safeUrl('minhtoan.vn'), 'https://minhtoan.vn');
  assert.equal(safeUrl('drive.google.com/file/d/x'), 'https://drive.google.com/file/d/x');
  assert.equal(socialUrl('website', 'minhtoan.vn'), 'https://minhtoan.vn');
  assert.equal(safeUrl('slide.pdf'), 'slide.pdf');
  assert.equal(safeUrl('../#slides'), '../#slides');
  assert.equal(safeUrl('/\\evil.example'), '');
  assert.equal(safeUrl('\\\\evil.example'), '');
});

test('tên kiểu prototype trong data.json không làm sập trang', () => {
  const d = mot({ socials: [{ type: 'constructor', url: 'https://x.vn' }, { type: 'toString', url: '@a' }],
    links: [{ title: 'A', url: 'https://a.vn', accent: 'constructor', icon: '__proto__' }] });
  assert.deepEqual(d.socials.map((s) => s.type), ['website', 'website']);
  assert.equal(visibleSocials(d).length, 2);
  assert.equal(d.links[0].accent, 'emerald');
  assert.match(svg('__proto__'), /^<svg /);
  assert.ok(!svg('constructor').includes('undefined'));
});

test('nút CTA có link độc hại thì trình chỉnh sửa báo', () => {
  const [l] = mot({ links: [{ title: 'A', url: 'https://a.vn', size: 'feature', ctaUrl: 'javascript:alert(1)' }] }).links;
  assert.equal(hiddenReason(l), 'Link của nút không hợp lệ');
});

test('theme: độ mờ, độ đục bị kẹp trong khoảng cho phép; nền lạ quay về mặc định', () => {
  assert.deepEqual(mot({}).theme, THEME_DEFAULT);
  const t = mot({ theme: { blur: 999, tint: -5, background: 'neon' } }).theme;
  assert.equal(t.blur, 48);
  assert.equal(t.tint, 0);     // 0 = kính trong suốt hẳn, vẫn thấy tấm kính nhờ vành mép bẻ sáng
  assert.equal(t.background, 'aurora');
  assert.equal(mot({ theme: { blur: '12.6' } }).theme.blur, 13);
});

test('ảnh tải lên (data URL) được giữ nguyên, không bị cắt cụt; HTML nhúng và script bị chặn', () => {
  const big = 'data:image/webp;base64,' + 'A'.repeat(120000);
  const d = mot({ profile: { avatar: big }, links: [{ title: 'x', url: 'https://a.vn', image: big }] });
  assert.equal(d.profile.avatar, big);
  assert.equal(d.links[0].image, big);
  assert.equal(safeImg(big), big);
  assert.equal(safeImg('data:image/svg+xml;base64,PHN2Zz4='), 'data:image/svg+xml;base64,PHN2Zz4=');
  assert.equal(safeImg('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(safeImg('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(safeImg('javascript:alert(1)'), '');
  assert.equal(safeImg('art/course.svg'), 'art/course.svg');
});

test('bộ icon elevaTO và bộ icon cũ: mọi file đều có, là SVG 120×120 không chứa script', async () => {
  assert.equal(Object.keys(GLASS).length, 16);
  assert.ok(Object.keys(CLASSIC).length >= 7);
  assert.deepEqual(ICON_LIBRARY.map((s) => [s.key, s.style]),
    [['glass', 'photo'], ['tmxk', 'photo'], ['tmxk-emoji', 'icon'], ['3d', 'icon'], ['classic', 'photo']]);
  assert.deepEqual(Object.keys(TMXK), ['art/tmxk/mark.svg']);
  // Emoji của TMXK phải là file WebP thật, đúng bộ Fluent 3D như mọi icon 3D khác.
  for (const src of Object.keys(TMXK_EMOJI)) {
    const buf = await readFile(new URL('../' + src, import.meta.url));
    assert.equal(buf.subarray(8, 12).toString(), 'WEBP', src);
    assert.ok(ICON3D[src], src + ' phải có trong bộ icon 3D chung');
  }
  // Bộ vẽ tay bản đầu đã bỏ: dữ liệu cũ trỏ vào chúng phải tự đổi sang logo thật / emoji.
  for (const cu of ['lop', 'studio', 'teams', 'bot', 'kenh', 'kichban']) {
    const img = mot({ links: [{ image: 'art/tmxk/' + cu + '.svg' }] }).links[0].image;
    assert.ok(img === 'art/tmxk/mark.svg' || img.startsWith('art/3d/'), cu + ' → ' + img);
  }
  for (const src of [...Object.keys(GLASS), ...Object.keys(TMXK), ...Object.keys(CLASSIC)]) {
    if (!src.endsWith('.svg')) continue;
    const svgText = await readFile(new URL('../' + src, import.meta.url), 'utf8');
    assert.match(svgText, /^<svg [^>]*viewBox="0 0 120 120"/, src);
    assert.doesNotMatch(svgText, /<script|on\w+=/i, src);
  }
});

// Logo Zalo là ảnh chính chủ, không vẽ lại: hai bản SVG vẽ tay trước đây đã bỏ hẳn.
test('logo Zalo: dùng ảnh thật, và dữ liệu cũ tự trỏ sang ảnh đó', async () => {
  assert.equal(GLASS['art/zalo.png'], 'Zalo');
  const buf = await readFile(new URL('../art/zalo.png', import.meta.url));
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  for (const cu of ['art/zalo.svg', 'art/glass/zalo.svg']) {
    assert.equal(mot({ links: [{ image: cu }] }).links[0].image, 'art/zalo.png', cu);
    await assert.rejects(readFile(new URL('../' + cu, import.meta.url)), 'file vẽ tay cũ phải xoá hẳn');
  }
});

test('icon 3D có sẵn: đủ file WebP thật, có ghi giấy phép', async () => {
  assert.ok(Object.keys(ICON3D).length >= 40);
  for (const src of Object.keys(ICON3D)) {
    const buf = await readFile(new URL('../' + src, import.meta.url));
    assert.equal(buf.subarray(0, 4).toString(), 'RIFF', src);
    assert.equal(buf.subarray(8, 12).toString(), 'WEBP', src);
  }
  assert.match(await readFile(new URL('../art/3d/LICENSE', import.meta.url), 'utf8'), /MIT License[\s\S]*Microsoft/);
});

test('ảnh minh hoạ đời trước tự đổi sang icon 3D; kiểu hiển thị suy ra từ ảnh', () => {
  const [a, b, c, d] = mot({ links: [
    { image: 'art/course.svg', imageStyle: 'photo' }, { image: 'art/zalo.svg' },
    { image: 'art/3d/robot.webp' }, { image: 'data:image/webp;base64,AAAA', imageStyle: 'icon' },
  ] }).links;
  assert.deepEqual([a.image, a.imageStyle], ['art/3d/chart-increasing.webp', 'icon']);
  assert.deepEqual([b.image, b.imageStyle], ['art/zalo.png', 'photo']);
  assert.equal(c.imageStyle, 'icon');
  assert.equal(d.imageStyle, 'icon');
});

test('glassIconFor: theo id ô, rồi theo tiêu đề / link; không đoán được thì để trống', () => {
  assert.equal(glassIconFor({ id: 'course', title: 'bất kỳ' }), 'art/glass/course.svg');
  assert.equal(glassIconFor({ id: 'x1', title: 'Zalo Minh nhé' }), 'art/zalo.png');
  assert.equal(glassIconFor({ id: 'zalo', title: 'bất kỳ' }), 'art/zalo.png');
  assert.equal(glassIconFor({ id: 'x2', title: 'My CV' }), 'art/glass/cv.svg');
  assert.equal(glassIconFor({ id: 'x3', title: 'Liên hệ', url: 'mailto:a@b.vn' }), 'art/glass/mail.svg');
  assert.equal(glassIconFor({ id: 'x4', title: 'Đặt lịch tư vấn' }), 'art/glass/calendar.svg');
  assert.equal(glassIconFor({ id: 'x5', title: 'Trang lạ' }), '');
});

test('token: dọn chuỗi dán vào và nhận ra ngay thứ chắc chắn không phải token', () => {
  const real = 'github_pat_' + 'A1b2C3d4E5'.repeat(8) + '_xy';
  assert.equal(cleanToken('  "' + real + '"\n'), real);
  assert.equal(cleanToken('Bearer ' + real), real);
  assert.equal(cleanToken(real.slice(0, 40) + ' ' + real.slice(40)), real);
  assert.equal(tokenProblem(real), '');
  assert.equal(tokenProblem('ghp_' + 'a'.repeat(36)), '');
  assert.match(tokenProblem(real.slice(0, 30)), /thiếu ký tự/);
  assert.match(tokenProblem('MatKhauCuaToi@123'), /không phải token/);
  assert.match(tokenProblem('minhtoan@gmail.com'), /không phải token/);
  assert.equal(tokenProblem(''), 'Chưa có token.');
});

// Nháp soạn trước khi có nhiều thương hiệu: nạp thẳng thì trang sửa mất tab Content, chủ trang
// muốn xem TMXK chỉ còn cách đổi lớp sơn của elevaTO → ra trang lai nhìn như lỗi.
test('nháp đời 1 ghép vào bản trên web: giữ chữ đã sửa, có đủ thương hiệu, Zalo/CV về ô ghim', async () => {
  const pub = normalize(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  const b0 = pub.brands[0];
  const cu = { profile: { ...pub.profile, handle: b0.handle, tagline: 'Chữ chủ trang đã sửa trong nháp' },
    stats: b0.stats, socials: pub.socials, theme: b0.theme, live: b0.live,
    links: [...b0.links, ...pub.pinned.map((l) => ({ ...l, subtitle: l.subtitle + ' (đã sửa)' }))] };

  const ra = mergeDraft(normalize(cu), pub);
  assert.deepEqual(ra.brands.map((b) => b.id), pub.brands.map((b) => b.id), 'phải có đủ thương hiệu của bản trên web');
  assert.equal(ra.brands[0].tagline, 'Chữ chủ trang đã sửa trong nháp', 'không được mất chữ đã sửa');
  assert.equal(ra.brands[0].skin, 'glass', 'elevaTO giữ kính mờ');
  assert.deepEqual(ra.pinned.map((l) => l.id), pub.pinned.map((l) => l.id), 'ô ghim đúng thứ tự trên web');
  assert.ok(ra.pinned.every((l) => l.subtitle.endsWith('(đã sửa)')), 'ô ghim phải dùng bản đã sửa trong nháp');
  const ghim = new Set(ra.pinned.map((l) => l.id));
  assert.ok(!ra.brands[0].links.some((l) => ghim.has(l.id)), 'Zalo/CV không được nằm hai chỗ');

  // Nháp đã đủ thương hiệu thì ghép lại không đổi gì.
  assert.equal(serialize(mergeDraft(ra, pub)), serialize(ra));
});

// Trang TMXK nằm ở /TikTok/ (T hoa). GitHub Pages phân biệt hoa thường: /tiktok/ là 404 — đã từng
// lọt một lần, mọi nút bên Content đều dẫn vào trang lỗi.
test('link TMXK trong data.json đều trỏ đúng /TikTok/, ô công cụ đủ nút và nút nào cũng có link', async () => {
  const site = normalize(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  const tmxk = site.brands.find((b) => b.skin === 'paper');
  const urls = tmxk.links.flatMap((l) => [l.url, l.ctaUrl, ...l.tools.map((t) => t.url)]).filter(Boolean);
  assert.ok(urls.length >= 8);
  for (const u of urls) assert.match(u, /^https:\/\/minhtoan8668\.github\.io\/TikTok\//, 'sai đường dẫn TMXK: ' + u);
  const kit = tmxk.links.find((l) => l.tools.length);
  assert.ok(kit, 'phải có ô bộ công cụ (Viral Studio)');
  assert.ok(kit.tools.length >= 6);
  for (const t of kit.tools) { assert.ok(t.emoji && t.label, JSON.stringify(t)); assert.ok(safeUrl(t.url), t.label); }
});

test('emoji và bộ công cụ: cắt độ dài, bỏ nút không tên, tối đa 8 nút', () => {
  const [l] = mot({ links: [{ title: 'x', url: 'https://a.vn', emoji: '✨✨✨✨✨✨✨✨✨✨',
    tools: [...Array(12)].map((_, i) => ({ label: 'Nút ' + i, url: 'https://a.vn/' + i })).concat([{ url: 'https://a.vn' }]) }] }).links;
  assert.ok(l.emoji.length <= 8);
  assert.equal(l.tools.length, 8);
  assert.ok(l.tools.every((t) => t.label));
  assert.deepEqual(mot({ links: [{ title: 'y' }] }).links[0].tools, []);
});

test('ô ghim: hideIn chỉ giữ mã thương hiệu hợp lệ, không trùng; nháp đời 1 dời sang ô ghim lấy hideIn của bản trên web', () => {
  const s = normalize({ brands: [{ id: 'finance' }, { id: 'content' }],
    pinned: [{ id: 'cv', title: 'CV', url: 'https://x.y', hideIn: ['Content', 'content', '', 7, 'Nội dung!'] }, { id: 'zalo', title: 'Zalo' }] });
  assert.deepEqual(s.pinned[0].hideIn, ['content', '7', 'n-i-dung']);
  assert.deepEqual(s.pinned[1].hideIn, []);

  const pub = normalize({ brands: [{ id: 'finance' }, { id: 'content' }],
    pinned: [{ id: 'cv', title: 'CV', url: 'https://x.y', hideIn: ['content'] }] });
  const nhap = normalize({ links: [{ id: 'cv', title: 'CV của tôi', url: 'https://x.y' }, { id: 'a', title: 'A' }] });
  const gop = mergeDraft(nhap, pub);
  assert.equal(gop.pinned[0].title, 'CV của tôi', 'giữ chữ đã sửa trong nháp');
  assert.deepEqual(gop.pinned[0].hideIn, ['content']);
});
