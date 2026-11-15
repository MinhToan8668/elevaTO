#!/bin/bash
# Cài Media Hub trên macOS và tạo "Media Hub.app" trong ~/Applications
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"
command -v python3 >/dev/null || { echo "Cần Python 3: brew install python"; exit 1; }
echo "⏳ Đang cài thư viện…"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
[ -f config.yaml ] || cp config.example.yaml config.yaml
command -v ffprobe >/dev/null || echo "💡 Nên cài thêm ffmpeg để đọc ngày quay video: brew install ffmpeg"

rm -rf "$HOME/Applications/TeleUploader.app"   # tên cũ
APP="$HOME/Applications/Media Hub.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/MacOS/MediaHub" <<SH
#!/bin/bash
# Mở từ Finder thì PATH rất ngắn → thêm chỗ Homebrew cài ffmpeg
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
cd "$DIR" || exit 1
LOG="$DIR/app.log"
fail() {
  MSG=\$(printf '%s' "\$1" | tr '"\\\\' "'/")
  osascript -e "display dialog \\"\$MSG\\" buttons {\\"OK\\"} default button 1 with icon stop with title \\"Media Hub\\""
  exit 1
}
[ -x "$DIR/.venv/bin/python" ] || fail "Chưa cài xong. Mở Terminal chạy lại: cd \\"$DIR\\" && ./install.sh"
echo "=== \$(date) ===" >> "\$LOG"
# Mac chip Apple: app dạng script hay bị mở qua Rosetta (Intel) → Python của hệ thống báo lỗi posix_spawn.
# Ép chạy đúng kiến trúc arm64.
RUN=""
[ "\$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ] && RUN="/usr/bin/arch -arm64"
\$RUN "$DIR/.venv/bin/python" "$DIR/gui.py" >> "\$LOG" 2>&1
CODE=\$?
[ \$CODE -eq 0 ] || fail "App bị lỗi khi mở (mã \$CODE):

\$(tail -n 8 "\$LOG")

Log đầy đủ: \$LOG"
SH
chmod +x "$APP/Contents/MacOS/MediaHub"
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Media Hub</string>
  <key>CFBundleDisplayName</key><string>Media Hub</string>
  <key>CFBundleIdentifier</key><string>com.mediahub.app</string>
  <key>CFBundleExecutable</key><string>MediaHub</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSArchitecturePriority</key><array><string>arm64</string><string>x86_64</string></array>
</dict></plist>
PL
ICON_SRC="$DIR/ui/assets/icon.png"
if [ -f "$ICON_SRC" ]; then
  SET="$(mktemp -d)/icon.iconset"; mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$ICON_SRC" --out "$SET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$ICON_SRC" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/icon.icns" 2>/dev/null || true
fi
touch "$APP"
echo "✅ Xong! Mở app: $APP"
echo "   (Kéo vào Dock để mở nhanh. Muốn tự mở khi bật máy: System Settings → General → Login Items → thêm Media Hub)"
open "$APP"
