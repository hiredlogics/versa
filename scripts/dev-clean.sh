#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null); then
  echo "Stopping process(es) on port ${PORT}: ${PIDS}"
  kill -9 ${PIDS} 2>/dev/null || true
  sleep 0.5
fi

echo "Clearing .next and node_modules/.cache..."
rm -rf .next node_modules/.cache

echo "Starting Next.js dev server on port ${PORT}..."
exec next dev -p "${PORT}"
