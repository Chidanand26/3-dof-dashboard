#!/usr/bin/env bash
set -e

# Change to script's directory
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=================================================="
echo "  Starting 3-DOF ARMBENCH Complete System"
echo "=================================================="

# Check if port 8787 is already in use
if lsof -Pi :8787 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "Hardware Bridge is already running on port 8787."
else
    echo "[1/2] Starting Hardware Bridge on http://127.0.0.1:8787..."
    node bridge/server.js &
    BRIDGE_PID=$!
    echo "Hardware Bridge PID: $BRIDGE_PID"
fi

cleanup() {
  echo -e "\nShutting down services..."
  if [ -n "$BRIDGE_PID" ]; then
    kill "$BRIDGE_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "[2/2] Starting Web Dashboard on http://localhost:8080..."
npm run dev

cleanup
