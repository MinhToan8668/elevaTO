#!/bin/bash
# Cài TeleUploader trên macOS và tạo TeleUploader.app trong ~/Applications
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

APP="$HOME/Applications/TeleUploader.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/MacOS/TeleUploader" <<SH
#!/bin/bash
cd "$DIR"
exec "$DIR/.venv/bin/python" "$DIR/gui.py" >> "$DIR/app.log" 2>&1
SH
chmod +x "$APP/Contents/MacOS/TeleUploader"
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>TeleUploader</string>
  <key>CFBundleDisplayName</key><string>TeleUploader</string>
  <key>CFBundleIdentifier</key><string>com.teleuploader.app</string>
  <key>CFBundleExecutable</key><string>TeleUploader</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PL
# Icon: dùng icon-512.png của repo nếu có
ICON_SRC="$DIR/../icon-512.png"
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
echo "   (Kéo vào Dock để mở nhanh. Muốn tự mở khi bật máy: System Settings → General → Login Items → thêm TeleUploader)"
open "$APP"
