#!/usr/bin/env bash
# start.sh — start the Python backend only
# Run from anywhere: bash backend/scripts/start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
VENV="$BACKEND_DIR/.venv"

if [ ! -d "$VENV" ]; then
  echo "Virtual environment not found. Run backend/scripts/setup.sh first."
  exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo ".env not found. Run backend/scripts/setup.sh first."
  exit 1
fi

PORT="${PORT:-8000}"

echo "[backend] Starting on http://localhost:$PORT"
cd "$BACKEND_DIR"
exec "$VENV/bin/uvicorn" main:app \
  --host 127.0.0.1 \
  --port "$PORT" \
  --reload \
  --log-level info
