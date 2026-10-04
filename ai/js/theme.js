// Chạy ngay trong <head> (không phải module) để áp giao diện sáng/tối trước khi trang vẽ, không bị nháy.
(function () {
  var t = null;
  try { t = localStorage.getItem('elevato-theme'); } catch (e) { /* bỏ qua */ }
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);

  /**
   * Tô dải trạng thái và thanh địa chỉ của trình duyệt cùng màu nền trang — không thì iOS để
   * một vệt đen ngay trên đầu, nhìn như trang bị cắt ngang.
   *
   * Trong <head> đã có hai thẻ theme-color theo prefers-color-scheme, lo giúp lúc người dùng
   * chưa chọn gì. Nhưng bấm nút sáng/tối là sở thích của máy hết quyết định, nên lúc đó phải
   * gom về MỘT thẻ đúng giao diện đang chọn.
   *
   * Màu đọc thẳng từ biến --chrome trong CSS (app.css nạp trước file này) nên không có mã màu nào
   * chép lại ở đây — đổi bảng màu là dải trạng thái đổi theo.
   */
  window.datMauThanh = function (giaoDien) {
    var goc = document.documentElement;
    var mau = getComputedStyle(goc).getPropertyValue('--chrome').trim();
    if (!mau) return;                       // CSS chưa sẵn sàng: để hai thẻ sẵn có lo
    var ds = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 1; i < ds.length; i++) ds[i].remove();
    var m = ds[0];
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); }
    m.removeAttribute('media');
    m.setAttribute('content', mau);
    if (giaoDien) goc.setAttribute('data-theme', giaoDien);
  };
  if (t === 'light' || t === 'dark') window.datMauThanh();
})();
