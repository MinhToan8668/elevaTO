#!/bin/bash
# Cài đặt TeleUploader trên macOS
set -e
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Cần Python 3: brew install python"; exit 1; }
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
[ -f config.yaml ] || cp config.example.yaml config.yaml
echo "✅ Cài xong. Mở config.yaml điền api_id/api_hash + folders, rồi chạy: ./run.sh login"
