# T08 — 실제 IntelliJ 키맵 기준 감사

2026-11-03. 소스·추출 JSON·IDE 설정은 수정하지 않았다. 이 결과 문서만 작성했다. 앱 조작은 root가 담당했고, 이 감사에서는 설치 파일과 소스만 읽었다. `extract.py`는 JSON을 덮어쓰므로 실행하지 않았다.

## 결론과 확정 수준

**확정:** 활성 키맵 선택과 parent resource는 기존 추출 결과와 일치한다. 오류의 핵심은 XML 상속을 병합할 때 IntelliJ의 **MacOSDefaultKeymap parent modifier 변환**을 적용하지 않은 것이다. `$default`의 `control E`를 그대로 복사한 `keymap.json`은 실제 런타임 Recent Files 단축키가 아니다.

**UI 확정(root 전달):** IntelliJ 설정에서 활성 키맵은 `macOS 1 복사`, ‘최근 파일’의 표시 키는 `⌘E`. 실제 Cmd+E로 Recent Files가 열리고 Ctrl+E로는 열리지 않았다.

**설치 코드로 확정, 개별 UI 실행 미확인:** 아래 표의 나머지 키는 현재 설치 JAR와 실제 사용자 키맵을 IntelliJ의 상속 규칙대로 대조한 값이다. 개별 기능 실행·OS 선점·포커스별 결과까지 확인한 것으로 표현하면 안 된다.

## 실제 설정과 resource

- `/Users/estsoft/Library/Application Support/JetBrains/IntelliJIdea2026.2/options/mac/keymap.xml`: `KeymapManager`의 `active_keymap name="macOS 1 복사"`.
- `/Users/estsoft/Library/Application Support/JetBrains/IntelliJIdea2026.2/options/keymap.xml`: 없음. 따라서 일반 경로가 mac 경로 값을 덮어쓰는 상황은 현재 발생하지 않는다.
- `/Users/estsoft/Library/Application Support/JetBrains/IntelliJIdea2026.2/keymaps/macOS 1.xml`: `name="macOS 1 복사" parent="Mac OS X 10.5+"`.
- 같은 디렉터리의 `macOS.xml`은 `macOS 복사`로 이름이 다르며 비활성이다.
- `/Applications/IntelliJ IDEA.app/Contents/lib/intellij.platform.ide.impl.jar` 안 `keymaps/Mac OS X 10.5+.xml`: `parent="$default"`; `keymaps/$default.xml`이 실제 parent resource다.
- 활성 사용자 XML은 Claude 줄바꿈, 다른 탭 닫기, 절대 경로 복사, 최근 프로젝트, 전체화면, 일부 액션의 바인딩 제거만 변경한다. 아래 주요 액션은 사용자 레벨에서 재정의하지 않는다.

`extract.py`는 설정 디렉터리를 glob 정렬의 마지막으로 선택하고 mac/일반 옵션을 차례로 읽는다. 여러 버전 또는 두 옵션 파일이 존재할 때 잘못 선택할 위험은 있으나, 현재 발견된 Ctrl/Cmd 오류의 직접 원인은 아니다.

## 설치 코드 근거: ctrl/meta의 의미

`/usr/bin/javap -c -p -classpath "/Applications/IntelliJ IDEA.app/Contents/lib/intellij.platform.ide.impl.jar"`로 다음 클래스를 읽었다. REA 세션은 사용하거나 변경하지 않았다.

1. `DefaultKeymap.loadKeymap$intellij_platform_ide_impl`: keymapName이 `Mac OS X`로 시작하면 일반 `DefaultKeymapImpl` 대신 `MacOSDefaultKeymap`을 생성한다.
2. `KeymapImpl.getParentShortcuts`: parent의 shortcut list 각 항목에 **자신의 `convertShortcut`**를 적용한다.
3. `MacOSDefaultKeymap.convertShortcut` 및 `MacOSDefaultKeymapKt.mapModifiers`: Ctrl/Meta를 교환한다. AWT 상수는 `CTRL_MASK=2`, `META_MASK=4`, `CTRL_DOWN_MASK=128`, `META_DOWN_MASK=256`; bytecode는 2↔4와 128↔256을 교환하며 다른 modifier를 유지한다.
4. `KeymapImpl.readExternal`: 자기 XML의 keyboard shortcut은 `KeyStrokeAdapter.getKeyStroke`로 읽고 자체 list에 저장한다. 자기 XML 키를 parent 변환에 다시 넣지 않는다. 동일 action id가 여러 번 있으면 각 list를 `Map.put`하므로 마지막 선언이 남는다.
5. 일반 `KeymapImpl.convertShortcut`는 입력을 그대로 반환한다. 사용자 키맵 상속 단계에서 두 번째 Ctrl/Meta 교환은 없다.

따라서 `control`/`ctrl` 자체가 Mac에서 항상 Command를 뜻하는 것이 아니다. `$default → Mac OS X 10.5+` 경계에서 상속된 키만 Ctrl/Meta를 교환한다. `Mac OS X 10.5+` 또는 사용자 XML에 명시된 `control R`는 실제 Control+R이다. 전체 JSON에서 문자열 `control`을 `meta`로 일괄 치환하면 Run, Quick Documentation, Code Completion, EditorLineEnd 등의 올바른 Control 키까지 망가진다. 마우스 shortcut에도 같은 parent modifier 변환이 존재한다.

## 현재 사용자 키맵에 맞는 주요 명세

표기: Cmd=⌘, Ctrl=⌃, Alt=⌥. `기본 상속`은 `$default` 선언을 Mac parent가 변환한 것, `Mac 명시`는 Mac parent 자체 선언이다. 최근 파일 이외 항목은 개별 UI 동작을 아직 실행하지 않았다.

| 기능 / action id | 실제 유효 키 | 근거 | 기존 keymap.json |
| --- | --- | --- | --- |
| 최근 파일 / RecentFiles | Cmd+E | 기본 상속 `control E`; UI 확인 | 잘못된 Ctrl+E |
| 최근 위치 / RecentLocations | Cmd+Shift+E | 기본 상속 `control shift E` | 잘못된 Ctrl+Shift+E |
| 액션 찾기 / GotoAction | Cmd+Shift+A | 기본 상속 `control shift A` | 잘못된 Ctrl+Shift+A |
| 파일 구조 / FileStructurePopup | Cmd+F12 | 기본 상속 `control F12` | 잘못된 Ctrl+F12 |
| 줄 이동 / GotoLine | Cmd+L | Mac 명시 `meta L` | 일치 |
| 모두 저장 / SaveAll | Cmd+S | 기본 상속 `control S` | 잘못된 Ctrl+S |
| 선언 이동 / GotoDeclaration | Cmd+B; Cmd+click; Force touch; middle click | Mac 명시 | 일치 |
| 구현 이동 / GotoImplementation | Cmd+Alt+B; Cmd+Alt+click | 기본 상속 `control alt B`, `ctrl alt button1` | 잘못된 Ctrl+Alt |
| 실행 / Run | Ctrl+R | Mac 명시 `control R` | 일치 |
| 현재 문맥 실행 / RunClass | Ctrl+Shift+R | Mac XML 마지막 RunClass 선언 | 일치 |
| 실행 구성 선택 / ChooseRunConfiguration | Ctrl+Alt+R | Mac 명시 | 일치 |
| 설정 / ShowSettings | Cmd+, | Mac 명시 `meta COMMA` | 일치 |
| 클래스 찾기 / GotoClass | Cmd+O | Mac 명시 | 일치 |
| 파일 찾기 / GotoFile | Cmd+Shift+O | Mac 명시 | 일치 |
| 심볼 찾기 / GotoSymbol | Cmd+Alt+O | Mac 명시 | 일치 |
| 파일 내 찾기 / Find | Cmd+F | Mac 명시 | 일치 |
| 바꾸기 / Replace | Cmd+R | 기본 상속 `control R` | 잘못된 Ctrl+R |
| 경로 찾기 / FindInPath | Cmd+Shift+F | Mac 명시 | 일치 |
| 코드 서식 / ReformatCode | Cmd+Alt+L | 기본 상속 `control alt L` | 잘못된 Ctrl+Alt+L |
| 에디터 줄 끝 / EditorLineEnd | Cmd+Right; Ctrl+E; End | Mac XML 마지막 선언 | 일치; Ctrl+E는 최근 파일 키가 아님 |

`SaveDocument`는 읽은 keymap resource와 추출 JSON에 없다. SaveAll과 동일한 별도 action이라고 가정하지 않는다.

`SearchEverywhere`는 `$default`에 `keyboard-gesture-shortcut keystroke="shift SHIFT" modifier="dblClick"`가 있으나 extractor가 gesture를 읽지 않아 `keys: []`가 됐다. 따라서 빈 keys를 “단축키 없음”으로 해석하면 안 된다. Shift 두 번 제스처 resource는 확정이며 실제 UI 동작은 root 관찰로 보강해야 한다. RunAnything에도 gesture가 있어 일반 키 배열만으로 전체 키맵을 표현할 수 없다.

## 기존 문서에 미치는 영향과 이후 작업

`T04-keymap-audit.md`와 `T02-result.md`가 추출 JSON을 “실제 사용자 키맵”으로 취급한 Ctrl+E, Ctrl+Shift+E, Ctrl+Shift+A, Ctrl+F12, Ctrl+S, Ctrl+Alt+B 등의 결론은 이 감사로 교정해야 한다. 현재 문서는 수정하지 않았다. 키맵 추출 오류가 기존 구현의 modifier 선택·툴팁·터미널 충돌 정책까지 전파될 수 있으므로, 계획 확정 이후 구현 때 action의 선언 출처와 경계 변환을 보존하고 변경 영향 키를 다시 대조해야 한다.

추출 보정 설계는 (1) 실제 active 옵션/사용자 XML을 선택, (2) 각 레벨의 마지막 action 선언과 빈 override를 유지, (3) MacOSDefaultKeymap이 parent로부터 받는 shortcut에만 Ctrl/Meta 교환, (4) 자기 XML override 적용, (5) keyboard gesture/마우스/두 번째 keystroke를 보존하는 순서다. 전체 modifier 일괄 치환으로 처리하지 않는다.

미확인: 실행 중 IDE의 메모리 키맵 API 직접 조회, 플러그인 동적 action binding 전체, OS/터미널/에디터 포커스별 가로채기, 기능 실행 결과. 이 감사는 실제 사용자 설정과 설치 코드로 유효 바인딩을 확인했으며, 개별 UI 검증의 범위는 root의 관찰 기록을 따른다.
