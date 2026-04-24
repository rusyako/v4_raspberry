#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CRON_LINE="0 2 * * * $PROJECT_DIR/scripts/sync_ad_users.sh"

(crontab -l 2>/dev/null | grep -v "scripts/sync_ad_users.sh"; echo "$CRON_LINE") | crontab -

echo "Installed AD sync cron job: $CRON_LINE"
