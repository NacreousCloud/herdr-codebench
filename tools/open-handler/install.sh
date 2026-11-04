#!/bin/sh
# Builds "Herdr Open.app" into ~/Applications and makes it the default app for
# the extensions below, so files opened from a Herdr terminal (Cmd+click on a
# path) open in Herdr's codebench editor. The previous default apps are kept in
# ~/.config/herdr-app/open-handlers.backup.json; ./uninstall.sh puts them back.
#
#   ./install.sh              the default extensions
#   ./install.sh md txt json  only these
set -e
cd "$(dirname "$0")"
APP="$HOME/Applications/Herdr Open.app"
BUNDLE=dev.herdr-codebench.open
BACKUP="$HOME/.config/herdr-app/open-handlers.backup.json"
EXTS="${*:-md markdown mdx txt log json jsonc yaml yml toml ini conf ts tsx js jsx mjs cjs py rs go java kt kts swift c h cpp hpp cs rb php sh zsh bash fish sql graphql gql css scss sass less vue svelte gradle properties lock}"

mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -o "$APP" main.applescript
cp open.sh "$APP/Contents/Resources/open.sh"
chmod +x "$APP/Contents/Resources/open.sh"
PL="$APP/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$BUNDLE" "$PL"
plutil -replace CFBundleName -string "Herdr Open" "$PL"
# Any file: the extensions are chosen by default handler, not by declaration.
plutil -replace CFBundleDocumentTypes -json '[{"CFBundleTypeName":"Any file","CFBundleTypeRole":"Editor","LSHandlerRank":"Alternate","LSItemContentTypes":["public.data","public.content","public.item"]}]' "$PL"
codesign --force --sign - "$APP" 2>/dev/null || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"

# shellcheck disable=SC2086
swift handlers.swift set "$BUNDLE" "$BACKUP" $EXTS
FB="$HOME/.config/herdr-app/open-fallback"
[ -f "$FB" ] || python3 -c 'import json,sys,collections;c=collections.Counter(v for v in json.load(open(sys.argv[1])).values() if v);print(c.most_common(1)[0][0] if c else "com.apple.TextEdit")' "$BACKUP" > "$FB"
echo "Herdr Open: $APP (outside codebench, files open with $(cat "$FB"); change it in $FB)"
