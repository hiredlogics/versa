#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CMD="${1:-up}"

case "$CMD" in
  up)
    echo "Starting PostgreSQL (Docker)..."
    docker compose up -d postgres
    echo "Waiting for database to be ready..."
    until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-leadpilot}" -d "${POSTGRES_DB:-leadpilot}" >/dev/null 2>&1; do
      sleep 1
    done
    echo "PostgreSQL is ready on port ${POSTGRES_HOST_PORT:-5434}"
    echo ""
    echo "Set in .env.local:"
    echo 'DATABASE_URL=postgresql://leadpilot:leadpilot@localhost:5434/leadpilot?schema=public'
    echo ""
    echo "Then run: npx prisma migrate deploy && npm run db:seed"
    ;;
  down)
    docker compose down
    ;;
  reset)
    docker compose down -v
    docker compose up -d postgres
    until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-leadpilot}" -d "${POSTGRES_DB:-leadpilot}" >/dev/null 2>&1; do
      sleep 1
    done
    npx prisma migrate deploy
    npm run db:seed
    echo "Database reset complete."
    ;;
  logs)
    docker compose logs -f postgres
    ;;
  *)
    echo "Usage: $0 {up|down|reset|logs}"
    exit 1
    ;;
esac
