#!/bin/bash
# Bật/tắt tự chạy "watch" mỗi khi đăng nhập Mac (launchd). Dùng: ./autostart.sh on|off
cd "$(dirname "$0")"
DIR="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/com.teleuploader.watch.plist"
if [ "$1" = "off" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true; rm -f "$PLIST"; echo "Đã tắt tự chạy."; exit 0
fi
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.teleuploader.watch</string>
  <key>ProgramArguments</key><array>
    <string>$DIR/.venv/bin/python</string><string>$DIR/app.py</string><string>watch</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/watch.log</string>
  <key>StandardErrorPath</key><string>$DIR/watch.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "✅ Đã bật tự chạy. Log: $DIR/watch.log"
