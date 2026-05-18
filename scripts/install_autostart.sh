#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${SMART_BOX_SERVICE_USER:-$(id -un)}"
SYSTEMD_DIR="/etc/systemd/system"

install_unit() {
  local template_path="$1"
  local unit_name
  unit_name="$(basename "$template_path")"

  sed \
    -e "s|__SMART_BOX_PROJECT_ROOT__|$PROJECT_ROOT|g" \
    -e "s|__SMART_BOX_USER__|$SERVICE_USER|g" \
    "$template_path" | sudo tee "$SYSTEMD_DIR/$unit_name" > /dev/null
}

chmod +x \
  "$PROJECT_ROOT/scripts/start-smart-box.sh" \
  "$PROJECT_ROOT/scripts/start-smart-box-service.sh" \
  "$PROJECT_ROOT/scripts/stop-smart-box-service.sh" \
  "$PROJECT_ROOT/scripts/start-rc522-reader.sh" \
  "$PROJECT_ROOT/scripts/sync_ad_users.sh" \
  "$PROJECT_ROOT/scripts/daily_reminder.sh"

install_unit "$PROJECT_ROOT/scripts/smart-box.service"
install_unit "$PROJECT_ROOT/scripts/smart-box-rc522-reader.service"
install_unit "$PROJECT_ROOT/scripts/smart-box-ad-sync.service"
install_unit "$PROJECT_ROOT/scripts/smart-box-ad-sync.timer"
install_unit "$PROJECT_ROOT/scripts/smart-box-reminder.service"
install_unit "$PROJECT_ROOT/scripts/smart-box-reminder.timer"

sudo systemctl daemon-reload
sudo systemctl enable docker
sudo systemctl enable smart-box.service
sudo systemctl enable smart-box-rc522-reader.service
sudo systemctl enable smart-box-ad-sync.timer
sudo systemctl enable smart-box-reminder.timer

sudo systemctl restart smart-box.service
sudo systemctl restart smart-box-rc522-reader.service
sudo systemctl restart smart-box-ad-sync.timer
sudo systemctl restart smart-box-reminder.timer

echo "Installed autostart units for user: $SERVICE_USER"
echo "Project root: $PROJECT_ROOT"
echo "Check services with:"
echo "  sudo systemctl status smart-box.service"
echo "  sudo systemctl status smart-box-rc522-reader.service"
echo "  sudo systemctl list-timers smart-box-ad-sync.timer"
echo "  sudo systemctl list-timers smart-box-reminder.timer"
