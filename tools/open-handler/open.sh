#!/bin/sh
# Herdr Open: files macOS hands to this app (a Cmd+click on a path in a Herdr
# terminal, a double-click in Finder) open in the codebench editor when Herdr
# is running with the codebench or idea layout; otherwise in the fallback app (a bundle id in
# ~/.config/herdr-app/open-fallback: install.sh writes the app most of these
# types opened with before).
PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
FALLBACK="${HERDR_OPEN_FALLBACK:-$(cat "$HOME/.config/herdr-app/open-fallback" 2>/dev/null)}"
[ -n "$FALLBACK" ] || FALLBACK=com.apple.TextEdit
LOG="$HOME/.config/herdr-app/herdr-open.log"
echo "$(date '+%F %T') $*" >> "$LOG"
if [ "$1" = "--url" ]; then
  # file:///a%20b/c -> /a b/c
  set -- "$(python3 -c 'import sys,urllib.parse as u;print(u.unquote(u.urlparse(sys.argv[1]).path))' "$2")"
fi
layout=""
if pgrep -x Herdr >/dev/null 2>&1; then
  layout=$(herdr-app status 2>/dev/null | sed -n 's/.*"layout": *"\([^"]*\)".*/\1/p' | head -1)
fi
for f in "$@"; do
  case "$layout" in
    codebench|idea)
      if [ -f "$f" ] && herdr-app do "activity.open:$f" >/dev/null 2>&1; then opened=1; continue; fi ;;
  esac
  open -b "$FALLBACK" "$f" 2>/dev/null || open -b com.apple.TextEdit "$f"
done
[ -n "$opened" ] && open -a Herdr
exit 0
