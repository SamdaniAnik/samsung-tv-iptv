#!/bin/bash
# Run AFTER creating a Samsung TV certificate profile in Tizen Studio (Tools → Certificate Manager).
set -euo pipefail
TV_IP="${1:-192.168.0.198}"
TV_SERIAL="${TV_IP}:26101"
PROJECT="/Applications/XAMPP/xamppfiles/htdocs/samsung-tv-iptv"
PROFILE="${2:-}"

export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"
export TIZEN_SDK="$HOME/tizen-studio"
export TIZEN_SDK_DATA="$HOME/tizen-studio-data"

tizen cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"

if [[ -z "$PROFILE" ]]; then
  echo "Active certificate profiles:"
  tizen security-profiles list
  PROFILE="$(tizen security-profiles list | awk 'NR>2 && $2=="O" {print $1; exit}')"
  if [[ -z "$PROFILE" ]]; then
    echo ""
    echo "No active profile. Create one in Tizen Studio → Tools → Certificate Manager:"
    echo "  + → Samsung → TV → sign in with Samsung account → finish wizard."
    echo "Then run: $0 $TV_IP YourProfileName"
    exit 1
  fi
  echo "Using active profile: $PROFILE"
fi

tizen security-profiles set-active -n "$PROFILE" 2>/dev/null || true

cd "$PROJECT"
./package_wgt.sh "$PROFILE"

sdb kill-server 2>/dev/null || true
sdb connect "$TV_IP"
sleep 2
sdb devices

tizen install-permit -s "$TV_SERIAL" 2>&1 || tizen install-permit -t UA43TU8000RXFS 2>&1 || true

APP_ID="$(sed -n 's/.*tizen:application id="\([^"]*\)".*/\1/p' config.xml)"
tizen install -n SamsungSmartIPTV.wgt -s "$TV_SERIAL"
tizen run -s "$TV_SERIAL" -p "$APP_ID"

echo ""
echo "On TV: Apps → Downloaded → Samsung Smart IPTV"
