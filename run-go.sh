#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
BACKEND_LOG_FILE="$RUN_DIR/backend.log"
APP_URL="http://localhost:10000"

mkdir -p "$RUN_DIR"

if [[ -f "$BACKEND_PID_FILE" ]]; then
  OLD_PID="$(cat "$BACKEND_PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Backend already running. PID: $OLD_PID"
    echo "Open: $APP_URL"
    exit 0
  fi
  rm -f "$BACKEND_PID_FILE"
fi

if [[ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]]; then
  echo "Missing backend virtualenv at backend/.venv"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Missing frontend/node_modules"
  exit 1
fi

if [[ "${RUN_GO_BUILD:-0}" == "1" || ! -f "$FRONTEND_DIR/dist/index.html" ]]; then
  echo "Building frontend..."
  (
    cd "$FRONTEND_DIR"
    npm run build
  )
else
  echo "Using existing frontend/dist"
fi

echo "Starting backend on $APP_URL"
cd "$BACKEND_DIR"
setsid env \
  SCHEDULER_ENABLED=false \
  FRONTEND_URL="$APP_URL" \
  DASHBOARD_URL="$APP_URL" \
  GRAPH_REDIRECT_URI="$APP_URL/api/graph/oauth/callback" \
  GOOGLE_REDIRECT_URI="$APP_URL/api/gmail/oauth/callback" \
  ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 10000 \
  >"$BACKEND_LOG_FILE" 2>&1 < /dev/null &
BACKEND_PID=$!
cd "$ROOT_DIR"
echo "$BACKEND_PID" >"$BACKEND_PID_FILE"

for _ in {1..20}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend failed. Log: $BACKEND_LOG_FILE"
    exit 1
  fi
  if curl -fsS "$APP_URL/api/health" >/dev/null 2>&1; then
    echo "App running."
    echo "URL: $APP_URL"
    echo "Log: $BACKEND_LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "Backend started but health check failed."
echo "URL: $APP_URL"
echo "Log: $BACKEND_LOG_FILE"
