#!/usr/bin/env bash
# setup.sh — one-time backend initialisation
# Run from anywhere: bash backend/scripts/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$BACKEND_DIR/.env"
VENV="$BACKEND_DIR/.venv"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
info()    { echo -e "${GREEN}[setup]${RESET} $*"; }
warning() { echo -e "${YELLOW}[setup]${RESET} $*"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
command -v python3 &>/dev/null || { echo "python3 is required"; exit 1; }

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]; }; then
  echo "Python 3.11+ is required (found $PYTHON_VERSION)"; exit 1
fi

# ── Virtual environment ───────────────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  info "Creating virtual environment..."
  python3 -m venv "$VENV"
fi

info "Installing Python dependencies..."
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"

# ── Generate .env ─────────────────────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  warning ".env already exists — skipping secret generation."
  warning "Delete $ENV_FILE and re-run to regenerate."
else
  info "Generating secrets and writing .env..."

  APP_SECRET=$("$VENV/bin/python" -c "import secrets; print(secrets.token_urlsafe(32))")
  JWT_SECRET=$("$VENV/bin/python" -c "import secrets; print(secrets.token_urlsafe(32))")
  ENC_KEY=$("$VENV/bin/python" -c "
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
")

  # Prompt for Heretto credentials (optional — can be filled in later)
  echo ""
  echo "Enter your Heretto API credentials (press Enter to skip and fill in .env later):"
  read -rp "  Heretto username: " HERETTO_USERNAME
  read -rsp "  Heretto password: " HERETTO_PASSWORD
  echo ""
  read -rp "  Heretto host (e.g. acme.heretto.com or cms.acme.com): " HERETTO_HOST
  # Suggest the first subdomain segment as the org ID default — works for standard
  # *.heretto.com instances but must be overridden when the org slug differs.
  SUGGESTED_ORG="${HERETTO_HOST%%.*}"
  read -rp "  Heretto org ID [${SUGGESTED_ORG}]: " HERETTO_ORG
  HERETTO_ORG="${HERETTO_ORG:-$SUGGESTED_ORG}"

  cat > "$ENV_FILE" <<EOF
# ── hop-core required ──────────────────────────────────────────────────────────
APP_SECRET_KEY=$APP_SECRET
JWT_SECRET_KEY=$JWT_SECRET
ENCRYPTION_KEY=$ENC_KEY
DATABASE_URL=sqlite:///./data/scheduler.db
REDIS_URL=

# ── hop-core optional ──────────────────────────────────────────────────────────
APP_ENV=development
APP_DEBUG=false
CORS_ORIGINS=http://localhost:4200
COOKIE_SECURE=false
SINGLE_ORG_MODE=true
SINGLE_ORG_SLUG=publishing-scheduler
FRONTEND_BASE_URL=http://localhost:4200

# SMTP (required for password reset and invitations)
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Publishing Scheduler

# SSO (optional)
GOOGLE_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=

# ── Heretto API ────────────────────────────────────────────────────────────────
# HERETTO_HOST: full domain of the Heretto instance (e.g. acme.heretto.com)
# HERETTO_ORG: org identifier used in CCMS content paths — usually equals the
#   subdomain, but may differ (e.g. host "demo-nxt.heretto.com", org "jorsek")
HERETTO_HOST=$HERETTO_HOST
HERETTO_ORG=$HERETTO_ORG
HERETTO_USERNAME=$HERETTO_USERNAME
HERETTO_PASSWORD=$HERETTO_PASSWORD
HERETTO_BRANCH=master
HERETTO_REPOSITORY=content

# ── Scheduler ─────────────────────────────────────────────────────────────────
SCHEDULER_MAX_CONSECUTIVE_FAILURES=5
JOB_RETENTION_DAYS=90

# ── Retry ─────────────────────────────────────────────────────────────────────
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY_MS=1000
RETRY_MAX_DELAY_MS=30000
RETRY_BACKOFF_MULTIPLIER=2.0
EOF

  info "Created $ENV_FILE"
fi

# ── Seed database ─────────────────────────────────────────────────────────────
mkdir -p "$BACKEND_DIR/data"
info "Seeding database..."
(cd "$BACKEND_DIR" && "$VENV/bin/python" "$SCRIPT_DIR/seed.py")

echo ""
info "Setup complete. Start the application with:"
echo "    bash scripts/dev.sh          (from project root — starts both servers)"
echo "    bash backend/scripts/start.sh  (backend only)"
