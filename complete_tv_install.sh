#!/bin/bash
# Completes install after samsung-tv-cert finishes (Samsung account sign-in once).
set -euo pipefail
TV_IP="${1:-192.168.0.198}"
TV_SERIAL="${TV_IP}:26101"
CERT_DIR="$HOME/tizen-studio-data/SamsungCertificate/Tizen"
PWD_FILE="$HOME/.samsung-tv-cert-password"
PROFILE="SamsungIPTV"
PROJECT="/Applications/XAMPP/xamppfiles/htdocs/samsung-tv-iptv"

export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"
export TIZEN_SDK_DATA="$HOME/tizen-studio-data"

if [[ ! -f "$CERT_DIR/author.p12" || ! -f "$CERT_DIR/distributor.p12" ]]; then
  echo "Samsung certificates not found yet."
  echo "Run in another terminal (sign in when browser opens):"
  echo "  npx samsung-tv-cert --duid P7CHYSD5T2LDW"
  exit 1
fi

PASS="$(cat "$PWD_FILE")"
CA="$HOME/tizen-studio-data/samsung-ca"

tizen cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
tizen security-profiles remove -n "$PROFILE" 2>/dev/null || true
tizen security-profiles add -n "$PROFILE" -A \
  -a "$CERT_DIR/author.p12" -p "$PASS" \
  -d "$CERT_DIR/distributor.p12" -dp "$PASS" \
  -dc "$CA/vd_tizen_dev_public2.crt" \
  -c "$CA/vd_tizen_dev_author_ca.cer"

cd "$PROJECT"
if [[ -x "$PROJECT/verify_tv_certs.sh" ]]; then
  "$PROJECT/verify_tv_certs.sh" || exit 1
fi
mkdir -p "$HOME/tizen-studio-data/SamsungCertificate/SamsungIPTV"
cp -f "$CERT_DIR/device-profile.xml" "$HOME/tizen-studio-data/SamsungCertificate/SamsungIPTV/" 2>/dev/null || true
./package_wgt.sh "$PROFILE"

sdb kill-server 2>/dev/null || true
sdb connect "$TV_IP"
sleep 2
tizen install-permit -s "$TV_SERIAL" 2>/dev/null || true
tizen install -n SamsungSmartIPTV.wgt -s "$TV_SERIAL"
APP_ID="$(sed -n 's/.*tizen:application id="\([^"]*\)".*/\1/p' config.xml)"
tizen run -s "$TV_SERIAL" -p "$APP_ID"

echo "Installed. TV: Apps → Downloaded → Samsung Smart IPTV"
