// Chạy ngay trong <head> (không phải module) để áp giao diện sáng/tối trước khi trang vẽ, không bị nháy.
(function () {
  var t = null;
  try { t = localStorage.getItem('elevato-theme'); } catch (e) { /* bỏ qua */ }
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
})();
