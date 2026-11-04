#!/usr/bin/env python3
"""Focused static IDEA Problems/notification/run-content observation.

Uses existing javap; never loads target classes. Full dumps only in --dump-dir
(default /tmp), excerpts/identity only in --output. Not REA Evidence.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

CLASSES = {
    "com.intellij.analysis.problemsView.toolWindow.ProblemsView": (
        "intellij.platform.lang.impl.jar", r"(createContent|selectionChanged|visibilityChanged|createToolWindowContent)\(",
        r"ContentFactory|createContent|setCloseable|customizeTabContent|addContent|selectionChangedTo|visibilityChangedTo|EP_NAME|getExtensionList|createPanel|ContentManagerListener"),
    "com.intellij.analysis.problemsView.toolWindow.ProblemsViewPanel": (
        "intellij.platform.lang.impl.jar", r"(getPopupHandlerGroupId|getToolbarActionGroupId|createToolbar|selectionChangedTo|createComparator|updateAutoscroll)\(",
        r"String Problems|createActionToolbar|createComparator|setComparator|updatePreview|ActionManager|getAction|setAdditionalGearActions|visibilityChangedTo|Autoscroll|Preview|Sort|isNullableOrSelected|isNotNullAndSelected"),
    "com.intellij.notification.impl.NotificationSettings": (
        "intellij.platform.ide.impl.jar", r"(save|withPlaySound|withDisplayType|withShouldLog)\(",
        r"groupId|displayType|isShouldLog|isShouldReadAloud|isPlaySound|setAttribute|BALLOON|String (shouldLog|shouldReadAloud|playSound|true|false)|copy"),
    "com.intellij.notification.impl.NotificationsConfigurationImpl": (
        "intellij.platform.ide.impl.jar", r"(getDefaultSettings|changeSettings|getState|areNotificationsEnabled)\(",
        r"findRegisteredGroup|getDisplayType|isLogByDefault|NotificationSettings|myIdToSettingsMap|Map\.(remove|put)|equals|getDefaultSettings|fireGroupEvent|SHOW_BALLOONS|SYSTEM_NOTIFICATIONS|NOTIFICATION_|setAttribute|addContent|String (showBalloons|systemNotifications|notificationsAnnouncingMode|notificationLocation)"),
    "com.intellij.execution.ui.RunContentDescriptor": (
        "intellij.platform.execution.jar", r"(getAttachedContent|setAttachedContent|isActivateToolWindowWhenAdded|isSelectContentWhenAdded|setExecutionId|getExecutionId|dispose)\(",
        r"myContent|myActivateToolWindowWhenAdded|mySelectContentWhenAdded|myExecutionId|Disposer|dispose|myExecutionConsole|myProcessHandler|myComponent"),
    "com.intellij.execution.ui.RunContentManagerImpl": (
        "intellij.platform.execution.impl.jar", r"(registerRunContentDescriptor|removeRunContent|showRunContent)\(",
        r"descriptors|Map\.put|Disposer|removeContent|createNewContent|getAttachedContent|contentRemoved|setExecutionId|getExecutionId|setComponent|setPreferredFocusedComponent|setDisplayName|setAttachedContent|getProcessHandler|ProcessListener|isSelectContentWhenAdded|setSelectedContent|isActivateToolWindowWhenAdded|invokeLater"),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def file_sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def excerpt(raw, methods, anchors):
    lines = raw.splitlines()
    starts = [i for i, line in enumerate(lines) if re.match(r"^  (?:public|protected|private|static|final).*", line)]
    keep = set(range(min(starts, default=2)))
    for pos, start in enumerate(starts):
        end = starts[pos + 1] if pos + 1 < len(starts) else len(lines)
        if "(" not in lines[start]:
            keep.add(start)
        elif re.search(methods, lines[start]):
            keep.add(start)
            for i in range(start + 1, end):
                if re.search(anchors, lines[i]):
                    keep.update(range(max(start, i - 3), min(end, i + 4)))
    result = ["# Focused javap excerpts; [...] = omitted original lines. Prefix = full dump line; bytecode offsets remain original."]
    previous = -1
    for i in sorted(keep):
        if i != previous + 1:
            result.append("[...]")
        result.append(f"{i + 1}: {lines[i]}".rstrip())
        previous = i
    return "\n".join(result) + "\n"

def node(element):
    return {"kind": element.tag, "attributes": dict(element.attrib), "children": [node(child) for child in element]}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, default=Path("/Applications/IntelliJ IDEA.app"))
    parser.add_argument("--output", type=Path, default=Path(__file__).parent)
    parser.add_argument("--dump-dir", type=Path, default=Path("/tmp/herdr-idea-tool-content-20261104"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    args.dump_dir.mkdir(parents=True, exist_ok=True)
    lib = args.app / "Contents/lib"
    jars = {name: file_sha(lib / name) for name, _, _ in CLASSES.values()}
    product_bytes = (args.app / "Contents/Resources/product-info.json").read_bytes()
    product = json.loads(product_bytes)
    ledger = {"method": "Python zipfile + javap -constants -p -c; static observation; not REA Evidence; no target class execution", "app": str(args.app), "version": product["version"], "build": product["buildNumber"], "productInfoSha256": sha(product_bytes), "jars": jars, "classes": [], "resources": []}
    for name, (jar, methods, anchors) in CLASSES.items():
        member = name.replace(".", "/") + ".class"
        with zipfile.ZipFile(lib / jar) as archive:
            class_bytes = archive.read(member)
        raw = subprocess.run(["/usr/bin/javap", "-constants", "-p", "-c", "-classpath", str(lib / jar), name], text=True, capture_output=True, check=True).stdout
        short = name.rsplit(".", 1)[-1]
        (args.dump_dir / (short + ".txt")).write_text(raw, encoding="utf-8")
        filename = short + ".excerpt.txt"
        (args.output / filename).write_text(excerpt(raw, methods, anchors), encoding="utf-8")
        ledger["classes"].append({"class": name, "jar": jar, "member": member, "sha256": sha(class_bytes), "excerpt": filename, "fullDumpSha256": sha(raw.encode())})
    jar = "intellij.platform.ide.impl.jar"
    member = "idea/ProblemsViewActions.xml"
    with zipfile.ZipFile(lib / jar) as archive:
        data = archive.read(member)
    root = ET.fromstring(data)
    # Preserve nesting; do not expand dynamic groups, references or user settings.
    groups = [node(group) for actions in root.findall("actions") for group in actions if group.tag == "group"]
    (args.output / "problem-action-groups.json").write_text(json.dumps(groups, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ledger["resources"].append({"jar": jar, "member": member, "sha256": sha(data), "output": "problem-action-groups.json"})
    after = {name: file_sha(lib / name) for name in jars}
    if jars != after:
        raise RuntimeError("JAR identity changed during inspection; discard generated excerpts and rerun")
    ledger["jarsAfter"] = after
    ledger["limitations"] = ["Six selected classes and one XML only, not the full feature implementation.", "Calls and branches are static observations, not observed execution.", "Notifications delivery/balloon painting, ProblemsTreeModel internals and process stopping policy were not traced.", "References/programmatic action groups remain unresolved; no runtime enabled/visible state was executed."]
    (args.output / "identity.json").write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
