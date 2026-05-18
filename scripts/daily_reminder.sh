#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"
mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

if [[ -f "$PROJECT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

docker compose exec -T smart-box python /app/backend/notification.py >> "$LOG_DIR/reminder.log" 2>&1
