// Chạy ngay trong <head> (không phải module nên không bị hoãn): áp đúng giao diện của chủ trang
// TRƯỚC nhịp vẽ đầu tiên, và tô màu thanh trạng thái cho khớp màu thật ở đỉnh trang.
//
// Không có file này thì trang vẽ bằng giá trị mặc định của CSS rồi vài trăm mili-giây sau page.js mới
// áp giá trị thật — trên mạng di động thành ra "hiện giao diện cũ trước, 2 giây sau mới đổi".
// Từ đời 2, LỚP SƠN cũng phải vào trước nhịp vẽ đầu: mở ?v=content mà nháy qua kính mờ của elevaTO
// rồi mới thành giấy lime thì còn chướng mắt hơn cả nháy màu.
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('elevato-links-v1') || 'null'); } catch (e) { /* chế độ riêng tư */ }
  if (saved) {
    // Đời 1 không có brands: cả trang chính là thương hiệu duy nhất.
    var bs = (saved.brands && saved.brands.length) ? saved.brands : [saved];
    var want = '';
    try { want = new URLSearchParams(location.search).get('v') || ''; } catch (e) { /* trình duyệt cũ */ }
    var b = bs[0];
    for (var k = 0; k < bs.length; k += 1) if (bs[k] && bs[k].id === want) b = bs[k];

    if (b && (b.skin === 'paper' || b.skin === 'glass')) root.dataset.skin = b.skin;
    var t = b && b.theme;
    if (t) {
      var blur = Number(t.blur);
      var tint = Number(t.tint);
      if (isFinite(blur)) root.style.setProperty('--blur', Math.min(48, Math.max(0, Math.round(blur))) + 'px');
      if (isFinite(tint)) root.style.setProperty('--tint', String(Math.min(95, Math.max(0, Math.round(tint))) / 100));
      if (/^(aurora|ocean|sunset|midnight|image)$/.test(String(t.background))) root.dataset.bg = t.background;
      if (/^(gon|vua|thoang)$/.test(String(t.density))) root.dataset.density = t.density;
    }
  }
  // --chrome (links.css) là màu thật ở đỉnh trang, đo riêng cho từng nền × lớp sơn × sáng/tối.
  var mau = getComputedStyle(root).getPropertyValue('--chrome').trim();
  if (mau) {
    var the = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < the.length; i += 1) the[i].setAttribute('content', mau);
  }
})();
