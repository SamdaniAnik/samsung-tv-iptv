#!/bin/bash
# Ensure device-profile.xml matches distributor.p12 (required for TV install-permit).
set -euo pipefail

CERT_DIR="${CERT_DIR:-$HOME/tizen-studio-data/SamsungCertificate/Tizen}"
PROFILE_XML="$CERT_DIR/device-profile.xml"
DIST_P12="$CERT_DIR/distributor.p12"
DIST_PWD="$CERT_DIR/distributor.pwd"

if [[ ! -f "$PROFILE_XML" || ! -f "$DIST_P12" || ! -f "$DIST_PWD" ]]; then
  echo "Missing Samsung cert files under $CERT_DIR"
  exit 1
fi

serial_from_p12() {
  openssl pkcs12 -in "$DIST_P12" -passin "file:$DIST_PWD" -nokeys 2>/dev/null \
    | openssl x509 -noout -serial 2>/dev/null | sed 's/serial=//'
}

serial_from_profile() {
  python3 - "$PROFILE_XML" <<'PY'
import sys, subprocess, re
xml = open(sys.argv[1]).read()
b64 = xml.split("<Certificate>")[1].split("</Certificate>")[0].strip()
pem = "-----BEGIN CERTIFICATE-----\n" + "\n".join(
    [b64[i:i+64] for i in range(0, len(b64), 64)]
) + "\n-----END CERTIFICATE-----\n"
open("/tmp/_dp_check.pem", "w").write(pem)
print(subprocess.check_output(
    ["openssl", "x509", "-in", "/tmp/_dp_check.pem", "-noout", "-serial"],
    text=True,
).strip().replace("serial=", ""))
PY
}

modulus_from_p12() {
  openssl pkcs12 -in "$DIST_P12" -passin "file:$DIST_PWD" -nokeys 2>/dev/null \
    | openssl x509 -noout -modulus 2>/dev/null | md5 -q
}

modulus_from_profile() {
  python3 - "$PROFILE_XML" <<'PY'
import sys, subprocess, hashlib
xml = open(sys.argv[1]).read()
b64 = xml.split("<Certificate>")[1].split("</Certificate>")[0].strip()
pem = "-----BEGIN CERTIFICATE-----\n" + "\n".join(
    [b64[i:i+64] for i in range(0, len(b64), 64)]
) + "\n-----END CERTIFICATE-----\n"
open("/tmp/_dp_check.pem", "w").write(pem)
mod = subprocess.check_output(
    ["openssl", "x509", "-in", "/tmp/_dp_check.pem", "-noout", "-modulus"],
    text=True,
)
print(hashlib.md5(mod.encode()).hexdigest())
PY
}

M12="$(modulus_from_p12)"
MP="$(modulus_from_profile)"

if [[ "$M12" != "$MP" ]]; then
  S12="$(serial_from_p12)"
  SP="$(serial_from_profile)"
  echo "MISMATCH: device-profile.xml distributor key != distributor.p12 (profile serial $SP, p12 serial $S12)"
  echo ""
  echo "The TV was permitted with an old profile; installs fail silently in Device Manager"
  echo "or show: install failed[118, -19], reason: Parsing error"
  echo ""
  echo "Fix (one-time, browser login):"
  echo "  npx samsung-tv-cert --duid P7CHYSD5T2LDW"
  echo "Then:"
  echo "  cp $CERT_DIR/device-profile.xml $HOME/tizen-studio-data/SamsungCertificate/SamsungIPTV/"
  echo "  tizen install-permit -s YOUR_TV_IP:26101"
  echo "  ./complete_tv_install.sh YOUR_TV_IP"
  exit 1
fi

echo "OK: device-profile matches distributor.p12"
exit 0
