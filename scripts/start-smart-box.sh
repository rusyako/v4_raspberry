#!/usr/bin/env bash
set -euo pipefail

HOST_PORT="${HOST_PORT:-5000}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

get_local_ip() {
  if command -v hostname >/dev/null 2>&1; then
    local host_ips
    host_ips="$(hostname -I 2>/dev/null || true)"
    if [[ -n "$host_ips" ]]; then
      for ip in $host_ips; do
        if [[ "$ip" != 127.* ]]; then
          printf '%s\n' "$ip"
          return 0
        fi
      done
    fi
  fi

  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}'
    return 0
  fi

  return 1
}

cd "$PROJECT_ROOT"

echo "Starting Smart Box..."
docker compose up --build -d

LOCAL_IP="$(get_local_ip || true)"

echo
echo "Smart Box is running."

if [[ -n "$LOCAL_IP" ]]; then
  echo "Kiosk: http://${LOCAL_IP}:${HOST_PORT}/"
  echo "Admin: http://${LOCAL_IP}:${HOST_PORT}/admin"
else
  echo "Unable to detect local IPv4 automatically. Use port ${HOST_PORT} on your current host IP."
fi
