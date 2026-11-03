#!/bin/sh
# Copies this repo's mods and layout into Herdr's home and checks each mod.
# Herdr doesn't hot-reload symlinked mod folders, so files are copied: run it again after edits.
set -eu
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
REPO="$(cd "$(dirname "$0")" && pwd)"
for d in "$REPO"/mods/*/; do
  name=$(basename "$d"); dest="$HOME_DIR/mods/$name"
  [ -L "$dest" ] && rm "$dest"
  mkdir -p "$dest"
  # Keep machine-local files and what Herdr writes itself.
  rsync -a --exclude gpui-kit.d.ts --exclude jsconfig.json --exclude hosts.json --exclude .cache --exclude __pycache__ "$d" "$dest/"
  herdr-app check "$dest"
done
# A layout already there keeps how it was arranged (moved tool windows, sizes);
# HERDR_LAYOUT_RESET=1 copies this repo's over it.
for f in "$REPO"/layouts/*; do
  dest="$HOME_DIR/layouts/$(basename "$f")"
  [ -L "$dest" ] && rm "$dest"
  if [ -e "$dest" ] && [ "${HERDR_LAYOUT_RESET:-}" != 1 ] && [ "${f##*.}" = json ]; then continue; fi
  cp "$f" "$dest"
done
mkdir -p "$HOME_DIR/themes"
for f in "$REPO"/themes/*; do cp "$f" "$HOME_DIR/themes/$(basename "$f")"; done
echo "Installed. Merge keys.json into $HOME_DIR/keys.json once (see README), then:"
echo "  herdr-app do layout.switch --name codebench"
