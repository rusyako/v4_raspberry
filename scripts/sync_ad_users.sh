#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"
mkdir -p "$HOST_LOG_DIR"

cd "$PROJECT_DIR"

if [[ -f "$PROJECT_DIR/.env.ad" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env.ad"
  set +a
fi

docker_env_args=()
for env_name in AD_SERVER AD_USER AD_PASSWORD AD_SEARCH_BASE AD_EXPORT_CSV_PATH AD_ENV_PATH; do
  if [[ -n "${!env_name:-}" ]]; then
    docker_env_args+=( -e "$env_name=${!env_name}" )
  fi
done

run_in_container() {
  local marker="$1"
  local command="$2"

  docker compose exec -T "${docker_env_args[@]}" smart-box sh -lc \
    "mkdir -p /app/logs; printf '[%s] ${marker}\\n' \"\
$(date '+%Y-%m-%d %H:%M:%S')\" >> /app/logs/ad-sync.log; ${command} >> /app/logs/ad-sync.log 2>&1"
}

run_in_container 'Start prune-only cleanup' 'python /app/scripts/Export_AD_users.py --prune-only'
run_in_container 'Start AD import' 'python /app/scripts/Export_AD_users.py'

docker compose cp smart-box:/app/logs/ad-sync.log "$HOST_LOG_DIR/ad-sync.log" > /dev/null 2>&1 || true
