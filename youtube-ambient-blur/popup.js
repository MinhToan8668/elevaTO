const MODES = [
  ['blur',    '🌫️ Blur',      'Nền mờ dịu từ video'],
  ['glow',    '✨ Ambient Glow', 'Hào quang rực rỡ lan tỏa'],
  ['mirror',  '🪞 Mirror',    'Phản chiếu gương nối dài khung hình'],
  ['pixel',   '👾 Pixel Art', 'Ô vuông mosaic kiểu retro'],
  ['neon',    '🌈 Neon Dream', 'Màu đổi liên tục, cực ảo'],
  ['vintage', '🎞️ Vintage Film', 'Tông sepia + hạt nhiễu phim'],
  ['noir',    '🖤 Noir',      'Đen trắng tương phản mạnh'],
  ['off',     '⛔ Tắt',       'Viền đen như mặc định'],
];

const list = document.getElementById('list');
chrome.storage.sync.get({ mode: 'blur' }, ({ mode }) => {
  for (const [id, name, desc] of MODES) {
    const b = document.createElement('button');
    b.innerHTML = `${name}<small>${desc}</small>`;
    b.classList.toggle('on', id === mode);
    b.onclick = () => {
      chrome.storage.sync.set({ mode: id });
      list.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
    list.appendChild(b);
  }
});

// Thanh trượt độ mờ / độ sáng (đơn vị %, 100 = mặc định của chế độ)
chrome.storage.sync.get({ blur: 100, light: 100 }, (s) => {
  for (const key of ['blur', 'light']) {
    const input = document.getElementById(key);
    const out = document.getElementById(key + 'Val');
    input.value = s[key];
    out.textContent = s[key] + '%';
    input.oninput = () => {
      out.textContent = input.value + '%';
      chrome.storage.sync.set({ [key]: Number(input.value) });
    };
  }
});

chrome.storage.sync.get({ spill: true }, ({ spill }) => {
  const cb = document.getElementById('spill');
  cb.checked = spill;
  cb.onchange = () => chrome.storage.sync.set({ spill: cb.checked });
});
