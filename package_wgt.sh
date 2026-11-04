#!/bin/bash
# Build a signed Samsung TV package (SamsungSmartIPTV.wgt) from the app files only.
# Usage: ./package_wgt.sh [security-profile]   (default profile: SamsungIPTV)
set -euo pipefail
cd "$(dirname "$0")"

PROFILE="${1:-SamsungIPTV}"
STAGE=".buildResult"
OUT_DIR=".buildOut"
OUTPUT_WGT="SamsungSmartIPTV.wgt"
# Everything the TV app needs — nothing else goes into the package.
APP_FILES=(config.xml index.html style.css channels.js app.js icon.png js/config.js js/hls.js)

export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"
if ! command -v tizen >/dev/null; then
  echo "Tizen CLI not found (expected in ~/tizen-studio/tools/ide/bin)."
  echo "A plain zip is not installable on the TV — it must be signed by 'tizen package'."
  exit 1
fi

echo "Staging app files..."
rm -rf "$STAGE" "$OUT_DIR"
mkdir -p "$STAGE" "$OUT_DIR"
for f in "${APP_FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp "$f" "$STAGE/$f"
done

echo "Signing with profile '$PROFILE'..."
tizen package -t wgt -s "$PROFILE" -o "$OUT_DIR" -- "$STAGE"

BUILT="$(ls "$OUT_DIR"/*.wgt 2>/dev/null | head -n 1)"
if [[ -z "$BUILT" ]]; then
  echo "Failed to build package"
  exit 1
fi
mv -f "$BUILT" "$OUTPUT_WGT"
rm -rf "$OUT_DIR"
echo "Successfully built: $OUTPUT_WGT ($(du -h "$OUTPUT_WGT" | cut -f1))"
