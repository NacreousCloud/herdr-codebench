#!/usr/bin/env python3
"""Install missing bindings without replacing the person's shortcuts."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from datetime import datetime


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
    added, conflicts = 0, []
    for name, bindings in defaults.items():
        section = current.setdefault(name, {})
        for key, action in bindings.items():
            if key not in section:
                section[key] = action
                added += 1
            elif section[key] != action:
                conflicts.append(f"{name}: {key}")
    if added:
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
