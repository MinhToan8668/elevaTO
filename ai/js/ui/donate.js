// Nút "Ủng hộ" ở góc trên: hiện số tài khoản + mã QR chuyển khoản, vẽ ngay trên máy người dùng.
//
// Số tài khoản do chủ trang đặt bằng bot Telegram và lấy về qua máy chủ, không viết cứng trong trang.
// Mã QR dựng bằng thư viện trong vendor/qrcode nên không gọi dịch vụ sinh QR bên ngoài.
// Chưa đặt số tài khoản thì hộp vẫn mở, chỉ hiện lời cảm ơn và cách liên hệ.

import { h, mount, $, toast, download } from './dom.js';
import { callApi } from '../ai.js';
import { API } from '../config.js';
import { loadQR } from '../libs.js';
import { vietQrPayload, khongDau } from '../core/vietqr.js';
import { t, locale } from '../i18n.js';

const MUC = [50000, 100000, 200000, 500000];        // mức gợi ý; bấm lại mức đang chọn là bỏ số tiền
const QR_CANH = 240;                                 // cạnh canvas (px) — KHÔNG lấy từ cv.width, không thì
                                                     // mỗi lần vẽ lại ô QR nhỏ dần đi và mờ
const QR_TAI = 1024;                                 // cạnh ảnh lúc tải về: in ra giấy hay phóng to vẫn nét
const NHO_GIAY = 60;                                 // nhớ thông tin ủng hộ bấy nhiêu giây
let nho = null;                                      // { luc, cho: Promise }

export function initDonate() {
  const btn = $('#donateBtn');
  if (!btn) return;
  btn.addEventListener('click', () => moHop());
}

/**
 * Lấy thông tin ủng hộ. Nhớ trong một phút để mở ra mở vào không gọi lại máy chủ, nhưng không nhớ
 * cả phiên: chủ trang đổi số tài khoản bằng bot thì tab đang mở cũng cập nhật theo.
 * Nhớ cả lời hứa đang chờ nên mở nhanh hai lần cũng chỉ gọi một lượt.
 */
function layThongTin() {
  if (nho && Date.now() - nho.luc < NHO_GIAY * 1000) return nho.cho;
  const cho = callApi(API, { action: 'ungho' })
    .then((d) => d.ungho || null)
    .catch(() => { nho = null; return null; });       // lỗi mạng thì lần mở sau hỏi lại
  nho = { luc: Date.now(), cho };
  return cho;
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

/**
 * Một dòng "nhãn — giá trị" kèm nút chép. Trên điện thoại nút rút còn mỗi cái icon (CSS lo):
 * để nguyên chữ "Chép" thì nó ăn hết bề ngang và "HUYNH MINH TOAN" phải xuống hai dòng.
 */
function dongChep(nhan, gt) {
  if (!gt) return null;
  return h('div', { class: 'ug-row' },
    h('span', { class: 'ug-lb' }, nhan),
    h('b', { class: 'ug-vl' }, gt),
    h('button', {
      type: 'button', class: 'btn ghost sm ug-chep', title: t('ug.copy'), 'aria-label': `${t('ug.copy')} ${nhan}`,
      onclick: async () => {
        try { await navigator.clipboard.writeText(gt); toast(t('ug.copied')); } catch (e) { toast(t('ug.copyFail')); }
      },
    },
    h('svg', { class: 'ug-chep-ic', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      h('rect', { x: '9', y: '9', width: '11.5', height: '11.5', rx: '2.6' }),
      h('path', { d: 'M15 5.6A2.6 2.6 0 0 0 12.4 3H6.6A3.6 3.6 0 0 0 3 6.6v5.8A2.6 2.6 0 0 0 5.6 15' })),
    h('span', { class: 'ug-chep-t' }, t('ug.copy'))));
}

async function veHop(tt) {
  const cv = h('canvas', { class: 'ug-qr', width: '240', height: '240', role: 'img', 'aria-label': t('ug.qr.aria') });
  const loiNhan = khongDau(tt.loi_nhan || 'Ung ho elevaTO');
  let soTien = 0;

  const loi = h('p', { class: 'msg warn', hidden: true });
  const ve = async () => {
    const payload = vietQrPayload({ bin: tt.bin, stk: tt.stk, soTien, loiNhan });
    if (!payload) { cv.hidden = true; loi.hidden = false; loi.textContent = t('ug.qr.bad'); return; }
    try {
      veQR(cv, await loadQR(), payload);
      cv.hidden = false; loi.hidden = true;           // vẽ lại được thì bỏ lời báo lỗi của lần trước
    } catch (e) { cv.hidden = true; loi.hidden = false; loi.textContent = t('ug.qr.fail'); }
  };

  const nutMuc = (v) => h('button', { type: 'button', class: 'btn ghost sm', 'aria-pressed': 'false', onclick: (e) => {
    soTien = soTien === v ? 0 : v;
    for (const b of e.currentTarget.parentElement.querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
    e.currentTarget.setAttribute('aria-pressed', String(soTien === v));
    ve();
  } }, `${new Intl.NumberFormat(locale()).format(v / 1000)}k`);

  /**
   * Tải mã QR về máy. Vẽ lại ở 1024px chứ không chụp canvas 240px đang hiện: ảnh tải về hay
   * được phóng to, gửi qua chat hay in ra giấy, lấy đúng bản nhỏ là vỡ nét và máy quét đọc trượt.
   * Số tiền đang chọn nằm luôn trong tên file để khỏi lẫn giữa mấy bản.
   */
  const tai = async () => {
    const payload = vietQrPayload({ bin: tt.bin, stk: tt.stk, soTien, loiNhan });
    if (!payload) { toast(t('ug.qr.bad')); return; }
    try {
      const to = document.createElement('canvas');
      veQR(to, await loadQR(), payload, QR_TAI);
      const blob = await new Promise((ok, hong) => to.toBlob((b) => (b ? ok(b) : hong(new Error('toBlob'))), 'image/png'));
      download(blob, `elevato-qr${soTien ? `-${soTien / 1000}k` : ''}.png`, 'image/png');
    } catch (e) { toast(t('ug.qr.saveFail')); }
  };
  const nutTai = h('button', { type: 'button', class: 'btn ghost sm ug-tai', onclick: tai },
    h('span', { 'aria-hidden': 'true' }, '⤓'), ' ', h('span', {}, t('ug.qr.save')));

  await ve();
  return h('div', {},
    h('div', { class: 'ug-grid' },
      h('div', { class: 'ug-info' },
        dongChep(t('ug.bank'), tt.bank),
        dongChep(t('ug.stk'), tt.stk),
        dongChep(t('ug.owner'), tt.chu_tk),
        dongChep(t('ug.msg'), loiNhan)),
      h('div', { class: 'ug-qrbox' }, cv, loi, nutTai,
        h('p', { class: 'fine' }, t('ug.qr.hint', { bin: tt.bin })))),
    h('div', { class: 'ug-amt' }, h('span', { class: 'ug-lb' }, t('ug.amount')), ...MUC.map(nutMuc)),
    h('p', { class: 'fine ug-free' }, t('ug.free')));
}

/** Vẽ mã QR lên canvas; nền luôn trắng để máy quét đọc chắc dù giao diện đang sáng hay tối. */
function veQR(cv, qrcode, payload, canhDich = QR_CANH) {
  const q = qrcode(0, 'M');
  q.addData(payload);
  q.make();
  const n = q.getModuleCount(), le = 4;              // viền trắng 4 ô theo chuẩn QR
  const o = Math.max(2, Math.floor(canhDich / (n + le * 2)));
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
