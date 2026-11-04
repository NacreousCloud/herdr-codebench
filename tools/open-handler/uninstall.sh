#!/bin/sh
# Puts back the default apps install.sh replaced and removes Herdr Open.app.
set -e
cd "$(dirname "$0")"
APP="$HOME/Applications/Herdr Open.app"
BACKUP="$HOME/.config/herdr-app/open-handlers.backup.json"
[ -f "$BACKUP" ] && swift handlers.swift restore "$BACKUP" && rm "$BACKUP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$APP" 2>/dev/null || true
rm -rf "$APP"
echo "Herdr Open removed."
