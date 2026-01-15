#!/bin/bash

clear

# Kill background processes on exit
trap 'kill $(jobs -p)' EXIT

echo "🚀 Starting TradeShape..."

# 1. Start Backend (Python)
echo "🐍 Starting Backend..."

# Run Uvicorn via uv
# Ensure port 8000 is free
lsof -t -i:8000 | xargs kill -9 2>/dev/null || true

# uv automatically handles venv creation and dependency installation
uv run uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Load local env vars (ngrok creds, etc.)
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

# 2. Start Frontend (Next.js)
echo "⚛️  Starting Frontend..."
cd frontend
npm install > /dev/null 2>&1 # Ensure deps are installed

# 3. Start ngrok tunnel (Frontend)
if command -v ngrok >/dev/null 2>&1; then
  NGROK_DOMAIN=${NGROK_DOMAIN:-${NGROK_URL:-ag-tradeshape.ngrok.io}}
  NGROK_PORT=${NGROK_PORT:-3000}
  if [ -z "$NGROK_BASIC_AUTH_GIRISH" ] || [ -z "$NGROK_BASIC_AUTH_ALEXANDRA" ]; then
    echo "ngrok auth not set; skipping tunnel."
  else
    echo "Starting ngrok tunnel..."
    ngrok http --domain="$NGROK_DOMAIN" \
      --basic-auth "$NGROK_BASIC_AUTH_GIRISH" \
      --basic-auth "$NGROK_BASIC_AUTH_ALEXANDRA" \
      "$NGROK_PORT" > /dev/null 2>&1 &
  fi
else
  echo "ngrok not found; skipping tunnel."
fi

npm run dev

# Wait for any process to exit
wait
