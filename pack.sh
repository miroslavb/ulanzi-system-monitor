#!/usr/bin/env bash
# Build a distributable zip of the plugin (top-level entry = plugin folder).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUG="com.ulanzi.sysmonitor.ulanziPlugin"
OUT="$ROOT/dist"

cd "$ROOT/$PLUG"
[ -d node_modules/ws ] || { echo "installing ws…"; npm install --omit=dev --no-audit --no-fund; }

mkdir -p "$OUT"
ZIP="$OUT/${PLUG}-$(node -p "require('./package.json').version").zip"
rm -f "$ZIP"
cd "$ROOT"
zip -r -q "$ZIP" "$PLUG" -x "*/.DS_Store" "*/npm-debug.log"
echo "built: $ZIP"
unzip -l "$ZIP" | tail -n +4 | head -n 18
