#!/bin/sh
set -e

# ── Graceful shutdown ──────────────────────────────────────────────────────────
shutdown() {
  echo "[vpn-scraper] SIGTERM received, stopping..."
  pkill -SIGTERM -f "node dist/src/main-scraper" 2>/dev/null || true
  pkill -SIGTERM openvpn 2>/dev/null || true
  exit 0
}
trap shutdown SIGTERM INT

# ── VPN Config ────────────────────────────────────────────────────────────────
if [ -z "$VPN_USER" ] || [ -z "$VPN_PASS" ]; then
  echo "[vpn-scraper] ERROR: VPN_USER and VPN_PASS env vars must be set."
  exit 1
fi

if [ -z "$VPN_CONFIG_B64" ]; then
  echo "[vpn-scraper] ERROR: VPN_CONFIG_B64 env var must be set."
  exit 1
fi

VPN_CONFIG_FILE="/tmp/router_config.ovpn"
VPN_AUTH_FILE="/tmp/vpn-creds.txt"

echo "$VPN_CONFIG_B64" | base64 -d > "$VPN_CONFIG_FILE"
chmod 600 "$VPN_CONFIG_FILE"
printf '%s\n%s\n' "$VPN_USER" "$VPN_PASS" > "$VPN_AUTH_FILE"
chmod 600 "$VPN_AUTH_FILE"

# ── Start OpenVPN ──────────────────────────────────────────────────────────────
echo "[vpn-scraper] Starting OpenVPN..."
openvpn \
  --config "$VPN_CONFIG_FILE" \
  --auth-user-pass "$VPN_AUTH_FILE" \
  --daemon \
  --log /tmp/openvpn.log

# ── Wait for tun0 ─────────────────────────────────────────────────────────────
echo "[vpn-scraper] Waiting for tun0..."
TIMEOUT=30
i=0
while ! ip link show tun0 > /dev/null 2>&1; do
  if [ $i -ge $TIMEOUT ]; then
    echo "[vpn-scraper] ERROR: VPN did not connect."
    cat /tmp/openvpn.log
    exit 1
  fi
  sleep 1
  i=$((i + 1))
done

# Clean up creds from disk now that VPN is up
rm -f "$VPN_AUTH_FILE"
echo "[vpn-scraper] VPN up after ${i}s. IP: $(curl -s ifconfig.me || echo 'unknown')"

# ── Start Scraper ─────────────────────────────────────────────────────────────
echo "[vpn-scraper] Starting scraper process..."
# We run migrations first to ensure DB is ready
node dist/src/db/scripts/run-migrations.js
node dist/src/main-scraper.js
