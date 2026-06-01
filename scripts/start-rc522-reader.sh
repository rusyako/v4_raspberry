#!/usr/bin/env bash
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Source .env if exists (ignore errors)
if [[ -f .env ]]; then
  set -a
  source ./.env 2>/dev/null || true
  set +a
fi

# Find Python — prefer venv, fallback to system
if [[ -x "$PROJECT_ROOT/venv/bin/python3" ]]; then
  PYTHON_BIN="$PROJECT_ROOT/venv/bin/python3"
elif [[ -x "$PROJECT_ROOT/venv/bin/python" ]]; then
  PYTHON_BIN="$PROJECT_ROOT/venv/bin/python"
else
  PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" "$PROJECT_ROOT/scripts/rc522_reader.py"
