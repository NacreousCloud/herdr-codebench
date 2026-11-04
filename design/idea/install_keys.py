#!/usr/bin/env python3
"""Install missing bindings without replacing the person's shortcuts."""
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from datetime import datetime


def normalize_chord(value):
    """GPUI ASCII-letter aliases, without guessing keyboard-layout punctuation."""
    strokes = []
    for stroke in value.strip().split(" "):
        if not stroke:
            continue
        modifiers = set()
        key = stroke
        while match := re.match(r"^(cmd|ctrl|alt|shift|fn|super|win)-", key, re.IGNORECASE):
            modifier = match[1].lower()
            modifiers.add("cmd" if modifier in ("super", "win") else modifier)
            key = key[match.end():]
        if re.fullmatch(r"[A-Z]", key):
            modifiers.add("shift")
        key = re.sub(r"[A-Z]", lambda match: match[0].lower(), key)
        strokes.append("-".join([modifier for modifier in ("cmd", "ctrl", "alt", "shift", "fn") if modifier in modifiers] + [key]))
    return " ".join(strokes)


def load(path):
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict) or any(
        not isinstance(section, dict)
        or any(not isinstance(key, str) or not isinstance(action, str) for key, action in section.items())
        for section in document.values()
    ):
        raise ValueError(f"Invalid key bindings: {path}")
    return document


def install(source, target):
    if not target.is_file():
        raise ValueError(f"Start Herdr once to create {target}, then run install.sh again.")
    defaults, current = load(source), load(target)
    # Migrate only the earlier shipped IDEA default, preserving custom actions.
    if current.get("layout:idea", {}).get("cmd-,") == "codenav.settings":
        current["layout:idea"]["cmd-,"] = "app.settings"
        migrated = True
    else:
        migrated = False
    # Replace only our retired double-Shift defaults; personal gestures survive.
    for section, action in [("layout:idea", "codenav.find-all"), ("terminal", "codenav.key:shift shift")]:
        if current.get(section, {}).get("shift shift") == action:
            del current[section]["shift shift"]
            migrated = True
    # Cmd+Shift+O in a terminal opens paths from that terminal. Only our old
    # equivalent-chord forwarder migrates; personal/direct terminal actions stay.
    for key, action in list(current.get("terminal", {}).items()):
        if normalize_chord(key) == "cmd-shift-o" and action.startswith("codenav.key:") \
                and normalize_chord(action[len("codenav.key:"):]) == normalize_chord(key):
            current["terminal"][key] = "codenav.terminal-files"
            migrated = True
    added, conflicts = 0, []
    for name, bindings in defaults.items():
        section = current.setdefault(name, {})
        for key, action in bindings.items():
            # GPUI parses cmd-O as cmd-shift-o. A personal alias already owns
            # that accelerator; adding our spelling would create two bindings
            # and could replace it depending on native map iteration order.
            aliases = [existing for existing in section if normalize_chord(existing) == normalize_chord(key)]
            if not aliases:
                section[key] = action
                added += 1
            elif any(section[alias] != action and not (
                name == "terminal"
                and section[alias] == f"codenav.key:{alias}"
                and action == f"codenav.key:{key}"
            ) for alias in aliases):
                conflicts.append(f"{name}: {key}")
    if added or migrated:
        backup = target.with_name(f"{target.name}.backup-{datetime.now():%Y%m%d-%H%M%S-%f}")
        shutil.copy2(target, backup)
        fd, temporary = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as output:
                output.write(json.dumps(current, ensure_ascii=False, indent=2) + "\n")
            shutil.copymode(target, temporary)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        print(f"Added {added} key bindings. Backup: {backup}")
    else:
        print("Key bindings are already installed.")
    for conflict in conflicts:
        print(f"Kept your existing shortcut: {conflict}")


if __name__ == "__main__":
    try:
        install(Path(sys.argv[1]), Path(sys.argv[2]))
    except (OSError, ValueError) as error:
        sys.exit(str(error))
