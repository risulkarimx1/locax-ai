#!/usr/bin/env bash
# Launch the local M2M100 FastAPI service (if needed) and then start Locax.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_COMMAND="${1:-npm run dev}"
HOST="${LOCAX_M2M100_HOST:-127.0.0.1}"
PORT="${LOCAX_M2M100_PORT:-9600}"
MODEL_PATH="${LOCAX_M2M100_MODEL_PATH:-$HOME/.locax/models/m2m100_418M}"
PYTHON_BIN="${LOCAX_M2M100_PYTHON:-python3}"
LOG_DIR="${LOCAX_M2M100_LOG_DIR:-$HOME/.locax/logs}"
LOG_FILE="$LOG_DIR/m2m100_service.log"
PID_FILE="${LOCAX_M2M100_PID_FILE:-$HOME/.locax/m2m100_service.pid}"

check_service() {
  curl --silent --max-time 2 "http://${HOST}:${PORT}/health" | grep -q "\"status\":\"ready\"" >/dev/null 2>&1
}

start_service() {
  mkdir -p "$(dirname "$PID_FILE")" "$LOG_DIR"
  echo "Starting M2M100 service on ${HOST}:${PORT}..."
  nohup "${PYTHON_BIN}" "$REPO_ROOT/server/m2m100_service.py" \
    --model-path "$MODEL_PATH" \
    --host "$HOST" \
    --port "$PORT" \
    >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 3
}

if check_service; then
  echo "M2M100 service already running on ${HOST}:${PORT}."
else
  start_service
  if check_service; then
    echo "M2M100 service is ready. Logs: $LOG_FILE"
  else
    echo "Failed to start M2M100 service. Check $LOG_FILE for details." >&2
    exit 1
  fi
fi

echo "Launching app command: ${APP_COMMAND}"
cd "$REPO_ROOT"
eval "$APP_COMMAND"
