#!/bin/bash
# Start the phone voice remote relay for Samsung Smart IPTV.
# Usage: ./start.sh        (start / restart in the background)
#        ./start.sh stop   (stop it)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${VOICE_REMOTE_PORT:-8765}"
LOG="${TMPDIR:-/tmp}/samsung-tv-voice-remote.log"
PHP="$(command -v php || echo /Applications/XAMPP/xamppfiles/bin/php)"

# Stop any copy already serving this port.
OLD_PID="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$OLD_PID" ]]; then
  kill $OLD_PID 2>/dev/null || true
  sleep 0.5
fi
if [[ "${1:-}" == "stop" ]]; then
  echo "Voice remote stopped."
  exit 0
fi

nohup "$PHP" -S 0.0.0.0:"$PORT" router.php >"$LOG" 2>&1 &
sleep 1
if ! lsof -ti tcp:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Failed to start. Log: $LOG"
  cat "$LOG"
  exit 1
fi

MAC_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<mac-ip>')"
echo "Voice remote running."
echo "  On your phone (same Wi-Fi) open:  http://$MAC_IP:$PORT/"
echo "  TV app setting (js/config.js):    voiceRelayUrl: 'http://$MAC_IP:$PORT'"
echo "  Log: $LOG"
