#!/bin/bash
# =============================================================================
# setup-vpn.sh — Host-level OpenVPN setup for Ubuntu
#
# Usage:
#   chmod +x setup-vpn.sh
#   sudo ./setup-vpn.sh --config /path/to/router_config.ovpn
#
# Options:
#   --config <path>   Path to the .ovpn config file  (required)
#   --user   <name>   VPN username (prompted if omitted)
#   --pass   <pass>   VPN password (prompted if omitted)
#   --dry-run         Print what would happen without making changes
# =============================================================================
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()    { echo -e "\n${BOLD}▶ $*${NC}"; }
die()     { error "$*"; exit 1; }

# ── Defaults ──────────────────────────────────────────────────────────────────
OVPN_CONFIG=""
VPN_USER=""
VPN_PASS=""
DRY_RUN=false
SERVICE_NAME="vpn"
OPENVPN_DIR="/etc/openvpn/client"
DEST_CONFIG="${OPENVPN_DIR}/${SERVICE_NAME}.conf"
CREDS_FILE="${OPENVPN_DIR}/${SERVICE_NAME}-creds.txt"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --config) OVPN_CONFIG="$2"; shift 2 ;;
    --user)   VPN_USER="$2";   shift 2 ;;
    --pass)   VPN_PASS="$2";   shift 2 ;;
    --dry-run) DRY_RUN=true;   shift   ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# ── Preflight checks ──────────────────────────────────────────────────────────
step "Preflight checks"

[[ $EUID -eq 0 ]] || die "This script must be run as root (use sudo)."
success "Running as root"

[[ "$(uname -s)" == "Linux" ]] || die "This script is for Linux (Ubuntu) only."
command -v apt-get &>/dev/null || die "apt-get not found — is this Ubuntu/Debian?"
success "OS is Linux with apt-get"

if [[ -z "$OVPN_CONFIG" ]]; then
  die "--config is required. Example: sudo ./setup-vpn.sh --config ./router_config.ovpn"
fi

[[ -f "$OVPN_CONFIG" ]] || die "Config file not found: $OVPN_CONFIG"
success "Config file found: $OVPN_CONFIG"

# ── Prompt for credentials if not provided ────────────────────────────────────
step "VPN credentials"

if [[ -z "$VPN_USER" ]]; then
  read -rp "  VPN username: " VPN_USER
fi
[[ -n "$VPN_USER" ]] || die "VPN username cannot be empty."

if [[ -z "$VPN_PASS" ]]; then
  read -rsp "  VPN password: " VPN_PASS
  echo
fi
[[ -n "$VPN_PASS" ]] || die "VPN password cannot be empty."

success "Credentials provided"

# ── Dry-run gate ──────────────────────────────────────────────────────────────
run() {
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[dry-run]${NC} $*"
  else
    eval "$@"
  fi
}

# ── Install OpenVPN ───────────────────────────────────────────────────────────
step "Installing OpenVPN"

if command -v openvpn &>/dev/null; then
  success "OpenVPN already installed ($(openvpn --version | head -1))"
else
  info "Updating apt and installing openvpn..."
  run "apt-get update -qq"
  run "apt-get install -y openvpn"
  success "OpenVPN installed"
fi

# ── Create config directory ───────────────────────────────────────────────────
step "Setting up config directory"

run "mkdir -p '${OPENVPN_DIR}'"
success "Directory ready: ${OPENVPN_DIR}"

# ── Copy and patch the .ovpn config ──────────────────────────────────────────
step "Installing VPN config"

run "cp '${OVPN_CONFIG}' '${DEST_CONFIG}'"

# Replace 'auth-user-pass' (bare) with 'auth-user-pass <creds-file>'
# Works whether or not the line already has an argument
if $DRY_RUN; then
  echo -e "  ${YELLOW}[dry-run]${NC} patch auth-user-pass line in ${DEST_CONFIG}"
else
  sed -i "s|^auth-user-pass.*|auth-user-pass ${CREDS_FILE}|" "${DEST_CONFIG}"
fi

success "Config installed: ${DEST_CONFIG}"

# ── Write credentials file ────────────────────────────────────────────────────
step "Writing credentials"

if $DRY_RUN; then
  echo -e "  ${YELLOW}[dry-run]${NC} write credentials to ${CREDS_FILE} (chmod 600)"
else
  printf '%s\n%s\n' "${VPN_USER}" "${VPN_PASS}" > "${CREDS_FILE}"
  chmod 600 "${CREDS_FILE}"
fi

success "Credentials file written: ${CREDS_FILE}"

# ── Enable & start systemd service ────────────────────────────────────────────
step "Enabling systemd service (openvpn-client@${SERVICE_NAME})"

run "systemctl daemon-reload"
run "systemctl enable openvpn-client@${SERVICE_NAME}"
run "systemctl restart openvpn-client@${SERVICE_NAME}"

# ── Wait for tun0 to appear ───────────────────────────────────────────────────
step "Waiting for VPN tunnel (tun0) to come up..."

if $DRY_RUN; then
  echo -e "  ${YELLOW}[dry-run]${NC} would wait for tun0"
else
  TIMEOUT=30
  i=0
  until ip link show tun0 &>/dev/null; do
    if [[ $i -ge $TIMEOUT ]]; then
      error "VPN tunnel did not come up after ${TIMEOUT}s."
      echo ""
      warn "OpenVPN logs:"
      journalctl -u "openvpn-client@${SERVICE_NAME}" --no-pager -n 40
      die "Setup failed — check credentials and config."
    fi
    sleep 1
    i=$((i+1))
  done

  CURRENT_IP=$(curl -sf --max-time 5 https://ifconfig.me || echo "unknown")
  success "VPN tunnel is up! (tun0 appeared after ${i}s)"
  success "Public IP is now: ${CURRENT_IP}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✔ VPN setup complete!${NC}"
echo ""
echo -e "  ${BOLD}Config:${NC}      ${DEST_CONFIG}"
echo -e "  ${BOLD}Credentials:${NC} ${CREDS_FILE}"
echo -e "  ${BOLD}Service:${NC}     openvpn-client@${SERVICE_NAME}"
echo ""
echo -e "  Useful commands:"
echo -e "    ${CYAN}sudo systemctl status  openvpn-client@${SERVICE_NAME}${NC}   # check status"
echo -e "    ${CYAN}sudo systemctl restart openvpn-client@${SERVICE_NAME}${NC}   # reconnect"
echo -e "    ${CYAN}sudo journalctl -u openvpn-client@${SERVICE_NAME} -f${NC}    # live logs"
echo -e "    ${CYAN}curl ifconfig.me${NC}                                        # verify IP"
echo ""
warn "NOTE: All outbound traffic (including SSH) now routes through the VPN."
warn "      Keep your cloud provider's web console available in case of lockout."
