import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  safeUrl, safeImg, socialUrl, normalize, THEME_DEFAULT, ART, visibleLinks, visibleSocials, hiddenReason, opensSheet,
  cohortInfo, utf8ToBase64, serialize, githubError,
} from '../js/core.js';
import { ICONS, TILE_ICONS, svg } from '../js/icons.js';

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
  const d = normalize(raw);
  assert.equal(JSON.stringify(raw), frozen);
  assert.equal(d.profile.name, 'Toàn');
  assert.equal(d.profile.verified, true);
  assert.equal(d.links[0].size, 'half');
  assert.equal(d.links[0].accent, 'emerald');
  assert.ok(d.links[0].id);
  assert.deepEqual(d.stats, [{ value: '1', label: '' }]);
  assert.deepEqual(normalize(null).links, []);
  assert.equal(normalize({ stats: Array(9).fill({ value: '1' }) }).stats.length, 4);
});

test('ô thiếu link, bị tắt hoặc link độc hại không hiện ra — và trình chỉnh sửa nói rõ vì sao', () => {
  const d = normalize({ links: [
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
  const d = normalize({ socials: [{ type: 'tiktok', url: '@a' }, { type: 'facebook', url: '' }, { type: 'lạ', url: 'https://x.vn' }] });
  assert.deepEqual(visibleSocials(d).map((s) => [s.type, s.href]), [['tiktok', 'https://www.tiktok.com/@a'], ['website', 'https://x.vn']]);
});

test('thẻ chi tiết chỉ mở khi đã bật và có nội dung', () => {
  const [a, b, c] = normalize({ links: [
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

test('data.json trong repo hợp lệ: icon có thật, ô nổi bật có số chỗ trực tiếp', async () => {
  const d = normalize(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));
  for (const l of d.links) assert.ok(TILE_ICONS.includes(l.icon), 'icon lạ: ' + l.icon);
  for (const s of d.socials) assert.ok(s.type);
  assert.ok(d.links.some((l) => l.size === 'feature' && l.live));
  assert.match(d.live.api, /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
  assert.ok(visibleLinks(d).length >= 4);
});

test('mọi icon chọn được đều có hình, svg() không bao giờ trả chuỗi rỗng', () => {
  for (const n of TILE_ICONS) assert.ok(ICONS[n], n);
  assert.match(svg('không-có'), /^<svg /);
  assert.match(svg('tiktok'), /fill="currentColor"/);
});

test('lỗi GitHub ra câu dễ hiểu', () => {
  assert.match(githubError(401), /Token sai/);
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
  const d = normalize({ socials: [{ type: 'constructor', url: 'https://x.vn' }, { type: 'toString', url: '@a' }],
    links: [{ title: 'A', url: 'https://a.vn', accent: 'constructor', icon: '__proto__' }] });
  assert.deepEqual(d.socials.map((s) => s.type), ['website', 'website']);
  assert.equal(visibleSocials(d).length, 2);
  assert.equal(d.links[0].accent, 'emerald');
  assert.match(svg('__proto__'), /^<svg /);
  assert.ok(!svg('constructor').includes('undefined'));
});

test('nút CTA có link độc hại thì trình chỉnh sửa báo', () => {
  const [l] = normalize({ links: [{ title: 'A', url: 'https://a.vn', size: 'feature', ctaUrl: 'javascript:alert(1)' }] }).links;
  assert.equal(hiddenReason(l), 'Link của nút không hợp lệ');
});

test('theme: độ mờ, độ đục bị kẹp trong khoảng cho phép; nền lạ quay về mặc định', () => {
  assert.deepEqual(normalize({}).theme, THEME_DEFAULT);
  const t = normalize({ theme: { blur: 999, tint: -5, background: 'neon', pattern: false } }).theme;
  assert.equal(t.blur, 48);
  assert.equal(t.tint, 5);
  assert.equal(t.background, 'aurora');
  assert.equal(t.pattern, false);
  assert.equal(normalize({ theme: { blur: '12.6' } }).theme.blur, 13);
});

test('ảnh tải lên (data URL) được giữ nguyên, không bị cắt cụt; SVG nhúng và script bị chặn', () => {
  const big = 'data:image/webp;base64,' + 'A'.repeat(120000);
  const d = normalize({ profile: { avatar: big }, links: [{ title: 'x', url: 'https://a.vn', image: big }] });
  assert.equal(d.profile.avatar, big);
  assert.equal(d.links[0].image, big);
  assert.equal(safeImg(big), big);
  assert.equal(safeImg('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(safeImg('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(safeImg('javascript:alert(1)'), '');
  assert.equal(safeImg('art/course.svg'), 'art/course.svg');
});

test('ảnh có sẵn: mọi file trong ART đều tồn tại và là SVG hợp lệ', async () => {
  for (const src of Object.keys(ART)) {
    const svgText = await readFile(new URL('../' + src, import.meta.url), 'utf8');
    assert.match(svgText, /^<svg [^>]*viewBox="0 0 120 120"/, src);
    assert.doesNotMatch(svgText, /<script|on\w+=/i, src);
  }
});
