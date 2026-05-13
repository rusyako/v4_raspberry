#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"
mkdir -p "$LOG_DIR"

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

{
  printf '[%s] Start prune-only cleanup\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  docker compose exec -T "${docker_env_args[@]}" smart-box python /app/scripts/Export_AD_users.py --prune-only

  printf '[%s] Start AD import\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  docker compose exec -T "${docker_env_args[@]}" smart-box python /app/scripts/Export_AD_users.py
} >> "$LOG_DIR/ad-sync.log" 2>&1
