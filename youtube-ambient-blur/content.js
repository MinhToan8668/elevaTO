// Vẽ khung hình video (độ phân giải thấp) lên canvas phía sau video,
// phóng to phủ kín player rồi blur bằng CSS -> thay cho viền đen.
(() => {
  const W = 64, H = 36, FPS = 15;
  let canvas, ctx, last = 0;

  function ensureCanvas(player) {
    if (canvas && canvas.parentNode === player) return;
    canvas = document.createElement('canvas');
    canvas.className = 'ytbf-canvas';
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { alpha: false });
    player.insertBefore(canvas, player.firstChild);
  }

  function draw(video) {
    // "cover": cắt phần giữa video sao cho phủ kín khung W x H
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const pr = canvas.clientWidth / canvas.clientHeight || W / H;
    let sw = vw, sh = vw / pr;
    if (sh > vh) { sh = vh; sw = vh * pr; }
    try {
      ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
    } catch (_) { /* bỏ qua lỗi tainted/chưa sẵn sàng */ }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (t - last < 1000 / FPS) return;
    last = t;
    const player = document.querySelector('#movie_player');
    const video = player && player.querySelector('video.html5-main-video');
    if (!video) return;
    ensureCanvas(player);
    if (video.readyState >= 2) draw(video);
  }

  requestAnimationFrame(loop);
})();
