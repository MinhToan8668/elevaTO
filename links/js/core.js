// Logic thuần của trang link-in-bio: không đụng DOM nên chạy được cả trong trình duyệt lẫn node --test.
// Trang công khai và trình chỉnh sửa dùng chung file này, nên quy tắc "link nào được hiện" chỉ có một chỗ.

export const SIZES = ['feature', 'wide', 'half'];

// Nền trang: dải màu dựng sẵn (định nghĩa trong links.css) hoặc ảnh tự chọn.
export const BACKGROUNDS = {
  aurora: 'Ngọc lục bảo',
  ocean: 'Đại dương',
  sunset: 'Hoàng hôn',
  midnight: 'Đêm',
  image: 'Ảnh tự chọn',
};
export const THEME_DEFAULT = { blur: 22, tint: 46, background: 'aurora', bgImage: '', pattern: true };
// Ảnh tải lên được lưu thẳng trong data.json dưới dạng data URL (đã thu nhỏ) → cần giới hạn dài hơn link thường.
const IMG_MAX = 300000;
const BG_MAX = 900000;

/** Ảnh có sẵn cho ô link (thư mục links/art/). */
export const ART = {
  'art/course.svg': 'Khoá học',
  'art/ai.svg': 'AI',
  'art/slides.svg': 'Slide',
  'art/trial.svg': 'Video',
  'art/model.svg': 'Model',
  'art/zalo.svg': 'Zalo',
  'art/cv.svg': 'CV',
  'art/coffee.svg': 'Coffee',
};
export const ACCENTS = {
  emerald: '#18cb96',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  slate: '#64748b',
};

// Mạng xã hội: nhãn hiển thị, icon, và cách đổi thứ người dùng gõ (handle, số điện thoại) thành URL đầy đủ.
export const SOCIALS = {
  tiktok: { label: 'TikTok', icon: 'tiktok', build: (v) => handle(v, 'https://www.tiktok.com/@') },
  facebook: { label: 'Facebook', icon: 'facebook', build: (v) => handle(v, 'https://www.facebook.com/') },
  linkedin: { label: 'LinkedIn', icon: 'linkedin', build: (v) => handle(v, 'https://www.linkedin.com/in/') },
  zalo: { label: 'Zalo', icon: 'zalo', build: (v) => phone(v, 'https://zalo.me/') },
  youtube: { label: 'YouTube', icon: 'youtube', build: (v) => handle(v, 'https://www.youtube.com/@') },
  instagram: { label: 'Instagram', icon: 'instagram', build: (v) => handle(v, 'https://www.instagram.com/') },
  telegram: { label: 'Telegram', icon: 'telegram', build: (v) => handle(v, 'https://t.me/') },
  email: { label: 'Email', icon: 'mail', build: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'mailto:' + v : v) },
  phone: { label: 'Điện thoại', icon: 'phone', build: (v) => (/^\+?[\d\s.-]{8,}$/.test(v) ? 'tel:' + v.replace(/[^\d+]/g, '') : v) },
  website: { label: 'Website', icon: 'globe', build: (v) => withScheme(v) },
};

function handle(v, prefix) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('/') || v.startsWith('.')) return v;
  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(v)) return 'https://' + v;
  return prefix + v.replace(/^@/, '');
}
function phone(v, prefix) {
  const digits = v.replace(/[^\d]/g, '');
  return /^\+?[\d\s.-]{8,}$/.test(v) ? prefix + digits.replace(/^84/, '0') : handle(v, prefix);
}

// Đuôi file hay gặp: "slide.pdf" là file cạnh trang, không phải tên miền.
const FILE_EXT = /\.(html?|json|js|css|pdf|png|jpe?g|webp|gif|svg|ico|xlsx?|docx?|pptx?|zip|txt)$/i;

/** "minhtoan.vn", "drive.google.com/…" (gõ thiếu https://) → thêm https:// cho khỏi thành link tương đối hỏng. */
export function withScheme(u) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || /^[./#?\\]/.test(u)) return u;
  const host = u.split(/[/?#]/)[0];
  return /^([a-z0-9-]+\.)+[a-z]{2,24}(:\d+)?$/i.test(host) && !FILE_EXT.test(host) ? 'https://' + u : u;
}

/** Chỉ cho qua link http(s), mailto, tel, sms và đường dẫn tương đối; mọi thứ khác (javascript:, data:…) thành ''. */
export function safeUrl(raw) {
  const u = withScheme(String(raw == null ? '' : raw).trim());
  if (!u) return '';
  // Bỏ ký tự điều khiển và khoảng trắng trước khi xét scheme: "java\tscript:" vẫn bị trình duyệt hiểu là javascript:
  const probe = u.replace(/[\u0000- \u007f]/g, '');
  const m = probe.match(/^([a-z][a-z0-9+.-]*):/i);
  // "//x", "/\x", "\\x" đều bị trình duyệt hiểu là link sang trang khác → không coi là đường dẫn tương đối.
  if (!m) return /^[\\/]{2}/.test(probe) ? '' : u;
  return ['http', 'https', 'mailto', 'tel', 'sms'].includes(m[1].toLowerCase()) ? u : '';
}

/** Như safeUrl, nhưng cho thêm ảnh nhúng data:image/(png|jpeg|webp|gif) — dạng ảnh tải lên từ máy. SVG nhúng không nhận. */
export function safeImg(raw) {
  const u = String(raw == null ? '' : raw).trim();
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(u)) return u;
  return safeUrl(u);
}

const clamp = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

export function socialUrl(type, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  const def = has(SOCIALS, type) ? SOCIALS[type] : null;
  return safeUrl(def ? def.build(v) : v);
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const str = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);

let seq = 0;
export function newId() {
  seq += 1;
  return 'l' + Date.now().toString(36) + seq.toString(36);
}

/** Dữ liệu từ data.json (hoặc từ trình chỉnh sửa) → dạng chuẩn, đủ mọi trường, kiểu đúng. Không làm đổi object gốc. */
export function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const p = d.profile || {};
  const live = d.live || {};
  const meta = d.meta || {};
  const th = d.theme || {};
  return {
    version: 1,
    meta: { title: str(meta.title, 120), description: str(meta.description, 300) },
    profile: {
      name: str(p.name, 80),
      handle: str(p.handle, 60),
      tagline: str(p.tagline, 200),
      avatar: str(p.avatar, IMG_MAX),
      verified: bool(p.verified, true),
      status: str(p.status, 80),
    },
    stats: (Array.isArray(d.stats) ? d.stats : [])
      .map((s) => ({ value: str(s && s.value, 16), label: str(s && s.label, 40) }))
      .filter((s) => s.value || s.label)
      .slice(0, 4),
    socials: (Array.isArray(d.socials) ? d.socials : [])
      .map((s) => ({ type: s && has(SOCIALS, s.type) ? s.type : 'website', url: str(s && s.url, 500) }))
      .slice(0, 10),
    links: (Array.isArray(d.links) ? d.links : []).map(normalizeLink).slice(0, 40),
    live: { enabled: bool(live.enabled, false), api: str(live.api, 500) },
    theme: {
      blur: clamp(th.blur, 0, 48, THEME_DEFAULT.blur),
      tint: clamp(th.tint, 5, 95, THEME_DEFAULT.tint),
      background: has(BACKGROUNDS, th.background) ? th.background : THEME_DEFAULT.background,
      bgImage: str(th.bgImage, BG_MAX),
      pattern: bool(th.pattern, THEME_DEFAULT.pattern),
    },
  };
}

function normalizeLink(l) {
  const x = l && typeof l === 'object' ? l : {};
  const det = x.details || {};
  return {
    id: str(x.id, 40) || newId(),
    title: str(x.title, 80),
    subtitle: str(x.subtitle, 160),
    url: str(x.url, 1000),
    size: SIZES.includes(x.size) ? x.size : 'half',
    icon: str(x.icon, 30) || 'link',
    accent: has(ACCENTS, x.accent) ? x.accent : 'emerald',
    image: str(x.image, IMG_MAX),
    badge: str(x.badge, 12),
    hidden: bool(x.hidden, false),
    live: bool(x.live, false),
    cta: str(x.cta, 30),
    ctaUrl: str(x.ctaUrl, 1000),
    details: {
      enabled: bool(det.enabled, false),
      text: str(det.text, 600),
      bullets: (Array.isArray(det.bullets) ? det.bullets : []).map((b) => str(b, 160)).filter(Boolean).slice(0, 8),
      button: str(det.button, 30),
    },
  };
}

/** Những ô thực sự hiện ra: không bị ẩn, có tiêu đề và có link hợp lệ. */
export function visibleLinks(data) {
  return data.links.filter((l) => !l.hidden && l.title && safeUrl(l.url));
}

export function visibleSocials(data) {
  return data.socials
    .map((s) => ({ ...s, href: socialUrl(s.type, s.url), def: SOCIALS[s.type] }))
    .filter((s) => s.href);
}

/** Vì sao một ô không hiện — để trình chỉnh sửa nói thẳng cho chủ trang biết. '' nghĩa là ô đang hiện. */
export function hiddenReason(l) {
  if (l.hidden) return 'Đang tắt';
  if (!l.title) return 'Chưa có tiêu đề';
  if (!l.url.trim()) return 'Chưa có link — đang ẩn';
  if (!safeUrl(l.url)) return 'Link không hợp lệ — đang ẩn';
  if (l.size === 'feature' && l.ctaUrl.trim() && !safeUrl(l.ctaUrl)) return 'Link của nút không hợp lệ';
  return '';
}

/** Ô có mở thẻ chi tiết trước khi đi tới link không. */
export function opensSheet(l) {
  return l.details.enabled && Boolean(l.details.text || l.details.bullets.length);
}

const pad2 = (n) => String(n).padStart(2, '0');
function moneyShort(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (Math.round((v / 1e6) * 10) / 10).toString().replace('.', ',') + 'tr';
  if (v >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(v);
}

/** Cấu hình cohort từ backend (cùng định dạng trang khoá học đang dùng) → vài con số cho ô nổi bật. */
export function cohortInfo(cfg) {
  if (!cfg || !cfg.cohort || !cfg.slots) return null;
  const max = Math.max(1, Number(cfg.slots.max) || 1);
  const total = (Number(cfg.slots.base) || 0) + (Number(cfg.slots.registered) || 0);
  const remaining = Math.max(0, max - total);
  const isClosed = cfg.cohort.status === 'closed';
  const isFull = remaining <= 0 || cfg.cohort.status === 'full';
  const num = Number(cfg.cohort.number) || 0;
  return {
    label: 'Cohort ' + pad2(num),
    status: isClosed ? 'Đã đóng' : isFull ? 'Đã đủ chỗ' : cfg.cohort.openText || 'Đang mở',
    isOpen: !isClosed && !isFull,
    total,
    max,
    remaining,
    percent: Math.min(100, Math.round((total / max) * 100)),
    earlyBird: cfg.pricing && cfg.pricing.earlyBird ? moneyShort(cfg.pricing.earlyBird) : '',
    schedule: cfg.schedule ? [cfg.schedule.days, cfg.schedule.time].filter(Boolean).join(' · ') : '',
  };
}

/** Chuỗi UTF-8 → base64 (GitHub API đòi nội dung file ở dạng này; btoa thẳng sẽ hỏng với chữ có dấu). */
export function utf8ToBase64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Dữ liệu → nội dung data.json đúng như sẽ nằm trong repo. */
export function serialize(data) {
  return JSON.stringify(normalize(data), null, 2) + '\n';
}

/** Lỗi GitHub API → câu tiếng Việt chủ trang hiểu và biết phải làm gì. */
export function githubError(status, body) {
  const msg = body && body.message ? String(body.message) : '';
  if (status === 401) return 'Token sai hoặc đã hết hạn. Tạo token mới rồi dán lại.';
  if (status === 403 || (status === 404 && /resource not accessible/i.test(msg)))
    return 'Token chưa có quyền ghi. Khi tạo token, chọn đúng repo và bật Contents: Read and write.';
  if (status === 404) return 'Không thấy repo hoặc nhánh. Kiểm tra lại tên chủ repo, tên repo, nhánh.';
  if (status === 409 || status === 422) return 'Trên GitHub vừa có bản mới hơn. Bấm Đăng lên web lần nữa.';
  if (!status) return 'Không kết nối được GitHub. Kiểm tra mạng rồi thử lại.';
  return 'GitHub báo lỗi ' + status + (msg ? ': ' + msg : '') + '.';
}
