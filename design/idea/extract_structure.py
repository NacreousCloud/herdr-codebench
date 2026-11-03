#!/usr/bin/env python3
"""Read selected shipped IDEA action groups without executing IDEA classes.

This is a structural inventory, not the runtime action tree. Plugin contributions,
dynamic groups, locale labels, user customizations and context updates can change
the visible tree. Output is research data and is never installed into Herdr.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

RESOURCES = ("idea/PlatformActions.xml", "idea/LangActions.xml", "idea/ExecutionActions.xml")
SEEDS = {
    "MainMenu", "MainToolbarNewUI", "MainToolbarLeft", "MainToolbarCenter",
    "MainToolbarRight", "MainToolbarGeneralActionsGroup", "MainToolbarPopupActions",
    "ToolbarPopupActions.MainToolbarNewUI", "CustomizeMainToolbarGroup",
    "MainToolbarQuickActionsRaw", "EditorPopupMenu", "EditorPopupMenu.GoTo",
    "EditorTabPopupMenu", "EditorTabsGroup", "EditorTabsEntryPoint",
    "ProjectViewPopupMenu", "ProjectViewToolbar", "ProjectViewTabToolbar",
    "ProjectView.ToolWindow.SecondaryActions", "StructureViewToolbar",
    "ToolWindowsGroup", "ToolWindowContextMenu", "RunToolbarMainActionGroup",
    "ExecutionTargetsToolbarGroup",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(app):
    jar = app / "Contents/lib/intellij.platform.ide.impl.jar"
    identity_before = file_digest(jar)
    product_path = app / "Contents/Resources/product-info.json"
    product_bytes = product_path.read_bytes()
    product = json.loads(product_bytes)
    groups, placements, resources = [], [], []
    found = set()
    with zipfile.ZipFile(jar) as archive:
        for member in RESOURCES:
            raw = archive.read(member)
            root = ET.fromstring(raw)
            resources.append({"member": member, "sha256": digest(raw)})
            selected = []
            for group in root.iter("group"):
                gid = group.get("id", "")
                if gid in SEEDS or gid.startswith(("MainToolbarQuickActions.", "ProjectView.ToolWindow.")):
                    selected.append(group)
            selected_ids = {x.get("id") for group in selected for x in group.iter("group") if x.get("id")}
            # Nested inline groups are identities too; flatten them once per resource.
            emitted = set()
            for selected_group in selected:
                for group in selected_group.iter("group"):
                    gid = group.get("id")
                    if not gid or gid in emitted:
                        continue
                    emitted.add(gid)
                    found.add(gid)
                    groups.append({
                        "id": gid, "source": member,
                        "attributes": dict(group.attrib),
                        "children": [
                            {"kind": child.tag, **dict(child.attrib)}
                            for child in group
                            if child.tag in {"action", "group", "reference", "separator"}
                        ],
                    })
            for element in root.iter():
                if element.tag not in {"action", "group", "reference"}:
                    continue
                for placement in element.findall("add-to-group"):
                    if placement.get("group-id") in SEEDS | selected_ids:
                        placements.append({"source": member, "kind": element.tag,
                                           "component": dict(element.attrib),
                                           "placement": dict(placement.attrib)})
    identity_after = file_digest(jar)
    if identity_after != identity_before:
        raise RuntimeError("IDEA JAR changed during inspection; discard the inventory and rerun on stable bytes")
    return {
        "formatVersion": 1,
        "method": "Python zipfile + ElementTree; static observation; not REA Evidence; no target class execution",
        "target": {"app": str(app), "name": product["name"], "version": product["version"],
                   "build": product["buildNumber"], "productInfoSha256": digest(product_bytes),
                   "jar": str(jar), "jarSha256Before": identity_before, "jarSha256After": identity_after},
        "resources": resources,
        "groups": groups,
        "contributions": placements,
        "unmatchedSeeds": sorted(SEEDS - found),
        "limitations": [
            "Only three selected resources in one exact JAR were parsed; this is not the complete product/plugin action registry.",
            "References and programmatic groups are not expanded; missing declarations do not prove actions are unavailable.",
            "Resource text is not localized, user customizations are not applied, and visible/enabled state was not executed.",
            "IDEA identifiers are evidence and mapping candidates, not executable Herdr commands or implementation code.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, default=Path("/Applications/IntelliJ IDEA.app"))
    parser.add_argument("--output", type=Path, help="Research JSON destination; stdout when omitted")
    args = parser.parse_args()
    result = json.dumps(inventory(args.app), indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result, encoding="utf-8")
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
