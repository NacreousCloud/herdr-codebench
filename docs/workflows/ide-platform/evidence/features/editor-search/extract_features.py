#!/usr/bin/env python3
"""Read six installed IDEA classes with javap, never load target classes.

Outputs focused disassembly + original JAR/class hashes; not REA Evidence.
Run with --output /tmp/idea-editor-search-repeat to reproduce without touching
the retained report. Existing /usr/bin/javap is required, no install occurs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app', default='/Applications/IntelliJ IDEA.app')
parser.add_argument('--output', type=Path, default=Path(__file__).parent)
args = parser.parse_args()
root = Path(args.app) / 'Contents/lib'
out = args.output
out.mkdir(parents=True, exist_ok=True)

# Match selected methods, then retain call anchors plus nearby instructions.
rules = [
    ('intellij.platform.ide.impl.jar', 'com.intellij.openapi.fileEditor.impl.FileEditorManagerImpl',
     r'(getCurrentFile|getCurrentWindow|setCurrentWindow|openFileImpl|openFile)\(',
     r'getActiveSplitterSync|ClientFileEditorManager.getSelectedFile|getCurrentFile|setCurrentWindow|getOpenMode|OpenMode.NEW_WINDOW|doOpenFile|getComposite|openFileInNewComposite|FileEditorOpenOptions|setSelected|fileOpened'),
    ('intellij.platform.ide.impl.jar', 'com.intellij.openapi.fileEditor.impl.EditorWindow',
     r'(setCurrentCompositeAndSelectTab\$intellij_platform_ide_impl|addComposite\$intellij_platform_ide_impl|closeFile|getTabToSelect\$intellij_platform_ide_impl|computeIndexToSelect\$intellij_platform_ide_impl)\(',
     r'getComposite:|JBEditorTabs.select:|_currentCompositeFlow|MutableStateFlow.setValue|isPreview|setPreview|shouldReservePreview|FileEditorOpenOptions\.(selectAsCurrent|pin|index)|insertTab|setPinned|setFilePinned|setCurrentCompositeAndSelectTab|getPreviousSelection|getVisibleInfos|contains:|computeIndexToSelect|getActiveMruEditorOnClose|getActiveRightEditorOnClose|EditorHistoryManager|getFileList|getTabToSelect|removeTab|disposeComposite|fileClosed|afterFileClosed'),
    ('intellij.platform.ide.jar', 'com.intellij.ui.tabs.impl.JBTabsImpl',
     r'(executeSelectionChange|removeTab|getToSelectOnRemoveOf|processRemove)\(',
     r'selectedInfo|setSelectedInfo|requestFocusLater|setLastFocusOwner|fireBeforeSelectionChanged|updateContainer|fireSelectionChanged|getToSelectOnRemoveOf|processRemove|isEmpty|removeDeferredNow|fireTabRemoved|visibleInfos|aconst_null'),
    ('intellij.platform.lang.impl.jar', 'com.intellij.ide.actions.searcheverywhere.SearchEverywhereUI',
     r'(scheduleRebuildList|rebuildList|elementsSelected|stopSearching|closePopup)\(',
     r'Alarm\.(getActiveRequestCount|addRequest)|long 100l|stopSearching|StringUtil.isEmpty|String.isEmpty|SHORT:|FULL:|getSelectedTab|getContributors|filterByDumbAwareness|setEmptyText|expireResults|SESearcher.search:|mySearchProgressIndicator|processSelectedItem|closePopup|ProgressIndicator\.(isCanceled|cancel)|onSessionFinished'),
    ('intellij.platform.lang.jar', 'com.intellij.ide.actions.searcheverywhere.SearchEverywhereContributor',
     r'(getSearchProviderId|getGroupName|getSortWeight|showInFindResults|isShownInSeparateTab|getElementPriority|fetchElements|search|processSelectedItem|getElementsRenderer|getDataForItem|getItemDescription|isMultiSelectionSupported|isEmptyPatternSupported|dispose)\(',
     r'fetchElements|ContributorSearchResult\.(builder|\$Builder)|setHasMore|addItem|iconst_0|Builder\.(build|hasMore|addItem)'),
    ('intellij.platform.ide.impl.jar', 'com.intellij.ide.actions.BaseRecentFilesAction',
     r'(update|actionPerformed)\(',
     r'getProject|setEnabledAndVisible|getSWITCHER_KEY|getCbShowOnlyEditedFiles|isSelected|setSelected|String title.popup.recent.files|Switcher\$SwitcherPanel."<init>"|onlyEditedFiles'),
]

sha = lambda data: hashlib.sha256(data).hexdigest()
ledger = {'method': 'ordinary zipfile + javap -constants -p -c; not REA Evidence; no target execution',
          'app': args.app, 'classes': []}
jar_hashes = {}
for jar_name, class_name, methods, anchors in rules:
    jar = root / jar_name
    jar_hashes.setdefault(jar_name, sha(jar.read_bytes()))
    member = class_name.replace('.', '/') + '.class'
    with zipfile.ZipFile(jar) as archive:
        class_sha = sha(archive.read(member))
    raw = subprocess.run(['/usr/bin/javap', '-constants', '-p', '-c', '-classpath', str(jar), class_name],
                         text=True, capture_output=True, check=True).stdout
    lines = raw.splitlines()
    headers = [i for i, line in enumerate(lines) if re.match(r'^  (?:public|protected|private|static|final).*', line)]
    keep = {0, 1}
    for pos, start in enumerate(headers):
        end = headers[pos + 1] if pos + 1 < len(headers) else len(lines)
        if not re.search(methods, lines[start]):
            continue
        keep.add(start)
        for i in range(start + 1, end):
            # Kotlin closeFile repeats its finally body along exceptional paths;
            # the first path contains the lifecycle operations used in the report.
            offset = re.match(r'\s+(\d+):', lines[i])
            if class_name.endswith('.EditorWindow') and ' closeFile(' in lines[start] and offset and int(offset[1]) > 412:
                continue
            if re.search(anchors, lines[i]):
                keep.update(range(max(start, i - 3), min(end, i + 4)))
    result = ['# Focused javap excerpts. [...] = omitted original lines. Numbers are original dump lines.']
    prev = -1
    for i in sorted(keep):
        if i != prev + 1:
            result.append('[...]')
        result.append(f'{i + 1}: {lines[i]}'.rstrip())
        prev = i
    filename = class_name.rsplit('.', 1)[-1] + '.excerpt.txt'
    (out / filename).write_text('\n'.join(result) + '\n')
    ledger['classes'].append({'jar': str(jar), 'jarSha256': jar_hashes[jar_name],
                              'class': class_name, 'member': member, 'classSha256': class_sha,
                              'excerpt': filename})
(out / 'identity.json').write_text(json.dumps(ledger, indent=2) + '\n')
print(f'Wrote {len(rules)} class identities and focused excerpts into {out}')
