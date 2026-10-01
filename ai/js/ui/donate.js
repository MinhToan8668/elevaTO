// Nút "Ủng hộ" ở góc trên: hiện số tài khoản + mã QR chuyển khoản, vẽ ngay trên máy người dùng.
//
// Số tài khoản do chủ trang đặt bằng bot Telegram và lấy về qua máy chủ, không viết cứng trong trang.
// Mã QR dựng bằng thư viện trong vendor/qrcode nên không gọi dịch vụ sinh QR bên ngoài.
// Chưa đặt số tài khoản thì hộp vẫn mở, chỉ hiện lời cảm ơn và cách liên hệ.

import { h, mount, $, toast } from './dom.js';
import { callApi } from '../ai.js';
import { API } from '../config.js';
import { loadQR } from '../libs.js';
import { vietQrPayload, khongDau } from '../core/vietqr.js';
import { t, locale } from '../i18n.js';

const MUC = [50000, 100000, 200000, 500000];        // mức gợi ý; 0 = để người ủng hộ tự nhập
let daLay = null;                                    // nhớ kết quả trong phiên, khỏi gọi lại máy chủ

export function initDonate() {
  const btn = $('#donateBtn');
  if (!btn) return;
  btn.addEventListener('click', () => moHop());
}

async function layThongTin() {
  if (daLay) return daLay;
  try { daLay = (await callApi(API, { action: 'ungho' })).ungho || null; } catch (e) { daLay = null; }
  return daLay;
}

async function moHop() {
  const than = h('div', { class: 'ug-body' }, h('p', { class: 'fine' }, t('ug.loading')));
  const cu = $('#ugDlg');
  const dlg = h('dialog', { class: 'authdlg ugdlg', id: 'ugDlg', 'aria-label': t('ug.title') },
    h('button', { type: 'button', class: 'icon-btn sm auth-x', 'aria-label': t('vw.close'), onclick: () => dlg.close() }, '✕'),
    h('section', { class: 'auth-card' },
      h('h2', {}, t('ug.title')),
      h('p', { class: 'auth-sub' }, t('ug.sub')),
      than,
      h('p', { class: 'fine ug-ct' },
        h('span', {}, t('ug.contact')), ' ',
        h('a', { href: 'https://zalo.me/0376292148', target: '_blank', rel: 'noopener noreferrer' }, 'Zalo 0376 292 148'))));
  if (cu) cu.replaceWith(dlg); else document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();

  const tt = await layThongTin();
  if (!dlg.open) return;                             // người dùng đóng trước khi máy chủ trả lời
  mount(than, tt ? await veHop(tt) : h('p', { class: 'msg warn' }, t('ug.none')));
}

/** Một dòng "nhãn — giá trị" kèm nút chép. */
function dongChep(nhan, gt) {
  if (!gt) return null;
  return h('div', { class: 'ug-row' },
    h('span', { class: 'ug-lb' }, nhan),
    h('b', { class: 'ug-vl' }, gt),
    h('button', { type: 'button', class: 'btn ghost sm', onclick: async () => {
      try { await navigator.clipboard.writeText(gt); toast(t('ug.copied')); } catch (e) { toast(t('ug.copyFail')); }
    } }, t('ug.copy')));
}

async function veHop(tt) {
  const cv = h('canvas', { class: 'ug-qr', width: '240', height: '240', role: 'img', 'aria-label': t('ug.qr.aria') });
  const loiNhan = khongDau(tt.loi_nhan || 'Ung ho elevaTO');
  let soTien = 0;

  const ve = async () => {
    const payload = vietQrPayload({ bin: tt.bin, stk: tt.stk, soTien, loiNhan });
    if (!payload) { cv.hidden = true; return; }
    try { veQR(cv, await loadQR(), payload); } catch (e) { cv.hidden = true; }
  };

  const nutMuc = (v) => h('button', { type: 'button', class: 'btn ghost sm', 'aria-pressed': 'false', onclick: (e) => {
    soTien = soTien === v ? 0 : v;
    for (const b of e.currentTarget.parentElement.querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
    e.currentTarget.setAttribute('aria-pressed', String(soTien === v));
    ve();
  } }, v ? new Intl.NumberFormat(locale()).format(v / 1000) + 'k' : t('ug.any'));

  await ve();
  return h('div', {},
    h('div', { class: 'ug-grid' },
      h('div', { class: 'ug-info' },
        dongChep(t('ug.bank'), tt.bank),
        dongChep(t('ug.stk'), tt.stk),
        dongChep(t('ug.owner'), tt.chu_tk),
        dongChep(t('ug.msg'), loiNhan)),
      h('div', { class: 'ug-qrbox' }, cv, h('p', { class: 'fine' }, t('ug.qr.hint')))),
    h('div', { class: 'ug-amt' }, h('span', { class: 'ug-lb' }, t('ug.amount')), ...MUC.map(nutMuc)),
    h('p', { class: 'fine ug-free' }, t('ug.free')));
}

/** Vẽ mã QR lên canvas, màu theo giao diện đang dùng (nền luôn sáng để máy quét đọc chắc). */
function veQR(cv, qrcode, payload) {
  const q = qrcode(0, 'M');
  q.addData(payload);
  q.make();
  const n = q.getModuleCount(), le = 4;              // viền trắng 4 ô theo chuẩn QR
  const o = Math.max(2, Math.floor(cv.width / (n + le * 2)));
  const canh = o * (n + le * 2);
  cv.width = canh; cv.height = canh;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canh, canh);
  g.fillStyle = '#0e1613';
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    if (q.isDark(r, c)) g.fillRect((c + le) * o, (r + le) * o, o, o);
  }
}
