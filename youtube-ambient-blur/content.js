// Vẽ khung hình video lên canvas phía sau video, phủ kín player,
// rồi áp hiệu ứng theo chế độ (blur, glow, mirror, pixel...) -> thay cho viền đen.
(() => {
  const FPS = 15;
  // Độ phân giải canvas theo chế độ: thấp = mờ mịn/nhẹ máy, pixel = ô vuông to
  const SIZES = { pixel: [24, 14], mirror: [320, 180] };
  const DEFAULT = [64, 36];
  let mode = 'blur';
  let blur = 100, light = 100; // phần trăm, chỉnh từ popup
  let canvas, ctx, last = 0;

  chrome.storage.sync.get({ mode: 'blur', blur: 100, light: 100 }, (s) => {
    blur = s.blur; light = s.light;
    setMode(s.mode);
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.blur) blur = c.blur.newValue;
    if (c.light) light = c.light.newValue;
    if (c.mode) setMode(c.mode.newValue); else applyVars();
  });

  function applyVars() {
    if (!canvas) return;
    canvas.style.setProperty('--b', blur / 100);
    canvas.style.setProperty('--l', light / 100);
  }

  function setMode(m) {
    mode = m;
    if (!canvas) return;
    canvas.className = 'ytbf-canvas ytbf-' + mode;
    [canvas.width, canvas.height] = SIZES[mode] || DEFAULT;
    canvas.parentNode?.classList.toggle('ytbf-grain', mode === 'vintage');
    applyVars();
  }

  function ensureCanvas(player) {
    if (canvas && canvas.parentNode === player) return;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    player.insertBefore(canvas, player.firstChild);
    setMode(mode);
  }

  // Cắt phần giữa video sao cho phủ kín canvas ("cover")
  function drawCover(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const pr = canvas.clientWidth / canvas.clientHeight || canvas.width / canvas.height;
    let sw = vw, sh = vw / pr;
    if (sh > vh) { sh = vh; sw = vh * pr; }
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  // Phản chiếu: video ở giữa, hai bên là ảnh lật gương kéo dài ra mép
  function drawMirror(video) {
    const W = canvas.width, H = canvas.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    const cw = canvas.clientWidth || W, ch = canvas.clientHeight || H;
    const scale = Math.min(cw / vw, ch / vh);
    const dw = (vw * scale) / cw * W, dh = (vh * scale) / ch * H;
    const x = (W - dw) / 2, y = (H - dh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(video, x, y, dw, dh);
    if (x > 0.5) { // viền trái/phải
      ctx.save(); ctx.scale(-1, 1);
      ctx.drawImage(video, -x, y, dw, dh);            // trái
      ctx.drawImage(video, -(x + dw) - dw, y, dw, dh); // phải
      ctx.restore();
    }
    if (y > 0.5) { // viền trên/dưới
      ctx.save(); ctx.scale(1, -1);
      ctx.drawImage(video, x, -y, dw, dh);
      ctx.drawImage(video, x, -(y + dh) - dh, dw, dh);
      ctx.restore();
    }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    if (mode === 'off' || t - last < 1000 / FPS) return;
    last = t;
    const player = document.querySelector('#movie_player');
    const video = player && player.querySelector('video.html5-main-video');
    if (!video) return;
    ensureCanvas(player);
    if (video.readyState < 2 || !video.videoWidth) return;
    try {
      mode === 'mirror' ? drawMirror(video) : drawCover(video);
    } catch (_) { /* bỏ qua khung chưa sẵn sàng */ }
  }

  requestAnimationFrame(loop);
})();
