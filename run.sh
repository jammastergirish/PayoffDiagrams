#!/bin/bash

clear

# Kill background processes on exit
trap 'kill $(jobs -p)' EXIT

echo "🚀 Starting Payoff Visualizer..."

# 1. Start Backend (Python)
echo "🐍 Starting Backend..."

# Run Uvicorn via uv
# Ensure port 8000 is free
lsof -t -i:8000 | xargs kill -9 2>/dev/null || true

# uv automatically handles venv creation and dependency installation
uv run uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# 2. Start Frontend (Next.js)
echo "⚛️  Starting Frontend..."
cd frontend
npm install > /dev/null 2>&1 # Ensure deps are installed
npm run dev

# Wait for any process to exit
wait
