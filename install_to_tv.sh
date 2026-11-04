#!/bin/bash
# Install Samsung Smart IPTV .wgt on a Samsung TV (Developer Mode + Tizen CLI)
set -euo pipefail
cd "$(dirname "$0")"

MAC_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
WGT="SamsungSmartIPTV.wgt"

echo "=== Samsung Smart IPTV — TV install ==="
echo ""
echo "Your Mac IP (enter this in TV Developer Mode): ${MAC_IP:-unknown}"
echo ""

if ! command -v sdb >/dev/null || ! command -v tizen >/dev/null; then
  echo "Tizen CLI not found. Install once on your Mac:"
  echo "  1. Download Tizen Studio: https://developer.tizen.org/development/tizen-studio/download"
  echo "  2. Package Manager → install: Tizen SDK tools, TV Extension, Samsung Certificate Extension"
  echo "  3. Add to PATH (adjust version if needed):"
  echo '     export PATH="$PATH:$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools"'
  echo ""
  echo "Create a Samsung author certificate (Tizen Studio → Tools → Certificate Manager),"
  echo "then sign and install from this folder:"
  echo "  ./package_wgt.sh <YOUR_SECURITY_PROFILE>"
  echo "  sdb connect <TV_IP>"
  echo "  tizen install -n $WGT -t <DEVICE_NAME>"
  exit 1
fi

echo "Rebuilding widget package..."
./package_wgt.sh "${TIZEN_PROFILE:-SamsungIPTV}"
echo ""

read -r -p "Samsung TV IP address (Settings → General → Network): " TV_IP
if [[ -z "${TV_IP}" ]]; then
  echo "TV IP required."
  exit 1
fi

echo "Connecting to TV at $TV_IP ..."
sdb disconnect 2>/dev/null || true
sdb connect "$TV_IP"
sleep 2
sdb devices

DEVICE="$(sdb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
if [[ -z "${DEVICE}" ]]; then
  echo ""
  echo "No TV device found. Check:"
  echo "  • Developer Mode ON (Apps → press 1,2,3,4,5)"
  echo "  • Host IP set to $MAC_IP on the TV"
  echo "  • TV restarted after enabling Developer Mode"
  exit 1
fi

echo "Installing $WGT on $DEVICE ..."
tizen install -n "$WGT" -t "$DEVICE"

echo ""
echo "Done. On the TV: Apps → Samsung Smart IPTV (launcher icon)."
