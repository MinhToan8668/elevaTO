// Chạy ngay trong <head> (không phải module nên không bị hoãn): áp đúng giao diện kính của chủ trang
// TRƯỚC nhịp vẽ đầu tiên, và tô màu thanh trạng thái cho khớp màu thật ở đỉnh trang.
//
// Không có file này thì trang vẽ bằng giá trị mặc định của CSS rồi vài trăm mili-giây sau page.js mới
// áp giá trị thật — trên mạng di động thành ra "hiện giao diện cũ trước, 2 giây sau mới đổi".
(function () {
  var root = document.documentElement;
  var t = null;
  try { t = JSON.parse(localStorage.getItem('elevato-links-v1') || 'null'); } catch (e) { /* chế độ riêng tư */ }
  t = t && t.theme;
  if (t) {
    var blur = Number(t.blur);
    var tint = Number(t.tint);
    if (isFinite(blur)) root.style.setProperty('--blur', Math.min(48, Math.max(0, Math.round(blur))) + 'px');
    if (isFinite(tint)) root.style.setProperty('--tint', String(Math.min(95, Math.max(0, Math.round(tint))) / 100));
    if (/^(aurora|ocean|sunset|midnight|image)$/.test(String(t.background))) root.dataset.bg = t.background;
  }
  // --chrome (links.css) là màu thật ở đỉnh trang, đo riêng cho từng nền × sáng/tối.
  var mau = getComputedStyle(root).getPropertyValue('--chrome').trim();
  if (mau) {
    var the = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < the.length; i += 1) the[i].setAttribute('content', mau);
  }
})();
