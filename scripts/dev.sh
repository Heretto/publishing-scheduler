#!/usr/bin/env bash
# dev.sh — start the full Publishing Scheduler stack (backend + frontend)
# Run from the project root: bash scripts/dev.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV="$BACKEND_DIR/.venv"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
info()    { echo -e "${GREEN}[dev]${RESET} $*"; }
warning() { echo -e "${YELLOW}[dev]${RESET} $*"; }
die()     { echo -e "${RED}[dev]${RESET} $*" >&2; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
command -v node &>/dev/null    || die "node not found — install Node.js 18+"
command -v npm  &>/dev/null    || die "npm not found"

[ -d "$VENV" ]                 || die "Python venv not found. Run: bash backend/scripts/setup.sh"
[ -f "$BACKEND_DIR/.env" ]     || die ".env not found. Run: bash backend/scripts/setup.sh"
[ -d "$FRONTEND_DIR/node_modules" ] || {
  info "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install --silent)
}

# ── Port helpers ──────────────────────────────────────────────────────────────
free_port() {
  local port=$1
  while lsof -i ":$port" &>/dev/null 2>&1; do port=$((port + 1)); done
  echo "$port"
}

wait_for_http() {
  local url=$1 label=$2 tries=${3:-40}
  printf "  Waiting for %s" "$label"
  for _ in $(seq 1 "$tries"); do
    if curl -sf "$url" &>/dev/null; then printf " ready\n"; return 0; fi
    printf "."
    sleep 1
  done
  printf " timed out\n"
  return 1
}

BACKEND_PORT=$(free_port "${PORT:-8000}")
FRONTEND_PORT=$(free_port 4200)

# ── Cleanup on exit ───────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""
PROXY_TMP=""

cleanup() {
  echo ""
  info "Shutting down..."
  [ -n "$BACKEND_PID"  ] && kill "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$PROXY_TMP"    ] && rm -f "$PROXY_TMP"
}
trap cleanup EXIT INT TERM

# ── Write a temporary proxy config for the chosen backend port ────────────────
PROXY_TMP="$(mktemp /tmp/scheduler-proxy-XXXXXX.json)"
cat > "$PROXY_TMP" <<EOF
{
  "/api": {
    "target": "http://127.0.0.1:${BACKEND_PORT}",
    "secure": false,
    "changeOrigin": true
  }
}
EOF

# ── Start backend ─────────────────────────────────────────────────────────────
echo ""
info "Starting Publishing Scheduler"
echo "  Backend  → http://localhost:${BACKEND_PORT}"
echo "  Frontend → http://localhost:${FRONTEND_PORT}"
echo "  API docs → http://localhost:${BACKEND_PORT}/docs"
echo ""

(
  cd "$BACKEND_DIR"
  CORS_ORIGINS="http://localhost:${FRONTEND_PORT}" \
    exec "$VENV/bin/uvicorn" main:app \
      --host 127.0.0.1 \
      --port "$BACKEND_PORT" \
      --reload \
      --reload-include '*.py' \
      --log-level warning
) &
BACKEND_PID=$!

wait_for_http "http://127.0.0.1:${BACKEND_PORT}/" "backend" 40 \
  || die "Backend did not start — check logs above"

# ── Start frontend ────────────────────────────────────────────────────────────
(
  cd "$FRONTEND_DIR"
  exec npx ng serve \
    --port "$FRONTEND_PORT" \
    --proxy-config "$PROXY_TMP" \
    --configuration development \
    --no-open
) &
FRONTEND_PID=$!

wait_for_http "http://localhost:${FRONTEND_PORT}/" "frontend" 90 \
  || die "Frontend did not start — check logs above"

# ── Open browser ──────────────────────────────────────────────────────────────
URL="http://localhost:${FRONTEND_PORT}"
echo ""
info "Application is live → $URL"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

if command -v open &>/dev/null; then
  open "$URL"
elif command -v xdg-open &>/dev/null; then
  xdg-open "$URL"
fi

# ── Wait ──────────────────────────────────────────────────────────────────────
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 2
done
