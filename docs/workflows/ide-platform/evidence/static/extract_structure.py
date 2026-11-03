#!/usr/bin/env python3
"""Read installed IDEA JAR/resources; never execute target classes.

Requires existing JDK javap. Writes only into --output (default this directory).
Focused disassembly omits unrelated methods/instructions; not decompiled source
and not REA Evidence. Exact original class/resource SHA-256 is in identity.json.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app', default='/Applications/IntelliJ IDEA.app')
parser.add_argument('--output', type=Path, default=Path(__file__).parent)
args = parser.parse_args()
jar = Path(args.app) / 'Contents/lib/intellij.platform.ide.impl.jar'
out = args.output
out.mkdir(parents=True, exist_ok=True)
sha = lambda data: hashlib.sha256(data).hexdigest()

# Exact method filters followed by instruction/call anchors; surrounding lines
# preserve local data flow. Ellipses explicitly mark omitted bytecode.
selected = {
    'com.intellij.openapi.actionSystem.impl.ActionManagerImpl':
        (r'(registerAction|createActionToolbar|createActionPopupMenu)\(',
         r'registerAction\$|createActionToolbarImpl|ActionPopupMenuImpl'),
    'com.intellij.openapi.actionSystem.impl.ActionToolbarImpl':
        (r'(getActionGroup|createPresentationFactory|setTargetComponent|getDataContext|updateActionsImpl)\(',
         r'myActionGroup|ActionToolbarPresentationFactory|myTargetComponent|getDataContext|createAsyncDataContext|DataManager'),
    'com.intellij.ide.ui.customization.CustomActionsSchema':
        (r'(getState|loadState|getCorrectedAction)\(',
         r'actions:|String (group|state)|ActionUrl\.(readExternal|writeExternal)|addAction:|correctActionGroup|ActionManager\.getAction'),
    'com.intellij.ide.ui.customization.ActionUrl':
        (r'(readExternal|writeExternal)\(',
         r'String (path|value|is_action|is_group|seperator|forse_popup|action_type|position)|my(GroupPath|ComponentId|ComponentType|ActionType|AbsolutePosition)'),
    'com.intellij.ide.ui.customization.CustomizationUtil':
        (r'(getReordableChildren|computeDiff|updateActionGroup)\(',
         r'getActions|getParentGroup|getRootGroup|getComponentAction|getAbsolutePosition|getActionType|ArrayList\.(add|remove)|Diff\.buildChanges|setActionType|setAbsolutePosition|computeDiff|copyFrom|fireSchemaChanged'),
    'com.intellij.ide.ui.customization.CustomisedActionGroup':
        (r'getChildren\(', r'getModificationStamp|getReordableChildren|my(SchemeModificationStamp|GroupModificationStamp|Children)'),
    'com.intellij.ide.ui.customization.CustomizableActionGroupProvider':
        (r'registerGroups\(', r'.*'),
    'com.intellij.openapi.wm.impl.WindowInfoImpl':
        (r'NEVER_MATCH_METHOD', r'NEVER_MATCH_INSTRUCTION'),
    'com.intellij.openapi.wm.impl.DesktopLayout':
        (r'(setAnchor|writeExternal|readExternal)\(',
         r'getNextOrder|getOrder|setOrder|setToolWindowPaneId|setAnchor|XmlSerializer|normalizeAfterRead|idToInfo|unifiedWeights'),
}

ledger = {'method': 'Python zipfile + javap -constants -p -c; no target execution; not REA Evidence',
          'jar': str(jar), 'sha256': sha(jar.read_bytes()), 'classes': [], 'resources': []}
with zipfile.ZipFile(jar) as archive:
    for name, (method_pattern, instruction_pattern) in selected.items():
        member = name.replace('.', '/') + '.class'
        raw = subprocess.run(['/usr/bin/javap', '-constants', '-p', '-c', '-classpath', str(jar), name],
                             text=True, capture_output=True, check=True).stdout
        lines = raw.splitlines()
        headers = [i for i, line in enumerate(lines) if re.match(r'^  (?:public|protected|private|static|final).*', line)]
        keep = set(range(min(headers, default=2)))
        for pos, start in enumerate(headers):
            end = headers[pos + 1] if pos + 1 < len(headers) else len(lines)
            # Keep field declarations as identity/shape, not their constructors.
            if '(' not in lines[start]:
                keep.add(start)
            if not re.search(method_pattern, lines[start]):
                continue
            keep.add(start)
            for i in range(start + 1, end):
                if re.search(instruction_pattern, lines[i]):
                    keep.update(range(max(start, i - 3), min(end, i + 4)))
        result = ['# Focused javap excerpts. [...] = omitted original lines. Numbers are original dump lines.']
        previous = -1
        for i in sorted(keep):
            if i != previous + 1:
                result.append('[...]')
            result.append(f'{i+1}: {lines[i]}'.rstrip())
            previous = i
        filename = name.rsplit('.', 1)[-1] + '.excerpt.txt'
        (out / filename).write_text('\n'.join(result) + '\n')
        ledger['classes'].append({'class': name, 'member': member, 'sha256': sha(archive.read(member)), 'excerpt': filename})

    ids = {'MainToolbarNewUI', 'MainToolbarLeft', 'MainToolbarCenter', 'MainToolbarRight',
           'MainToolbarPopupActions', 'EditorTabsToolbarActions', 'ToolWindowContextMenu',
           'EditorTabPopupMenu'}
    groups = []
    for member in ['idea/PlatformActions.xml', 'idea/LangActions.xml', 'idea/ExecutionActions.xml']:
        data = archive.read(member)
        ledger['resources'].append({'member': member, 'sha256': sha(data)})
        for node in ET.fromstring(data).iter('group'):
            if node.get('id') in ids:
                # Keep declarative structure, not unrelated menu text/classes.
                groups.append({'member': member, 'attributes': dict(node.attrib),
                               'children': [{'tag': child.tag, **child.attrib} for child in node]})
    (out / 'action-groups.json').write_text(json.dumps(groups, ensure_ascii=False, indent=2) + '\n')
(out / 'identity.json').write_text(json.dumps(ledger, indent=2) + '\n')
print(f'Wrote {len(selected)} focused class excerpts, {len(groups)} group declarations into {out}')
