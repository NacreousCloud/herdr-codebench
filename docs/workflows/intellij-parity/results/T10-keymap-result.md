# T10 — 실제 Mac 사용자 키맵 추출 교정

2026-11-03. 계획 `design/idea/PARITY_PLAN.md` 및 공유 계약 `04-contracts.md`에 따라 extractor·생성 keymap·DESIGN의 키맵 설명만 변경했다. UI 토큰·모드 소스·앱 설치·앱 조작·커밋·푸시는 하지 않았다.

## 변경

- `design/idea/extract.py`: bundled `Mac OS X*` 키맵이 parent에서 받은 keyboard/mouse shortcut에만 Ctrl↔Meta 교환을 적용한다. 첫 번째와 두 번째 keystroke 모두 변환한다. Mac XML과 사용자 XML 자체 선언은 변환하지 않는다.
- 사용자 키맵은 일반 KeymapImpl로 처리한다. 같은 이름의 사용자 scheme이 bundled scheme을 덮어쓰는 경우도 bundled 여부를 해제한다.
- 빈 action은 상속 키를 제거하며, 같은 XML에 action이 중복되면 마지막 선언이 전체 shortcut list를 교체한다. 누락된 parent와 상속 순환은 명시적 오류로 중단한다.
- `keyboard-gesture-shortcut`는 `gestures` 배열에 원본 `keystroke`/`modifier` 속성을 보존한다. `keys: []`여도 gesture가 있을 수 있다. IntelliJ Companion bytecode와 같이 parent modifier gesture에는 교환을 적용하지 않는다.
- `--output-dir`로 사전 생성 비교를 지원하고 `--keymap-only`로 독립 관리되는 tokens.json을 쓰지 않고 keymap만 생성할 수 있게 했다. 기본 명령의 기존 전체 생성 동작은 유지한다.
- `design/idea/keymap.json`을 재생성했다. 활성 chain은 `macOS 1 복사 → Mac OS X 10.5+ → $default`, actions는 454개다.
- `DESIGN.md`는 키맵 표의 잘못된 Ctrl 표기와 “적용 완료”로 읽힐 수 있는 과거 설명을 교정했다. 색·크기 등 다른 UI 설명은 건드리지 않았다.

## 설치 클래스 근거

`intellij.platform.ide.impl.jar`의 DefaultKeymap.loadKeymap은 이름이 Mac OS X로 시작하는 bundled scheme을 MacOSDefaultKeymap으로 만든다. KeymapImpl.getParentShortcuts는 parent shortcut에 자식 convertShortcut을 적용한다. MacOSDefaultKeymapKt.mapModifiers는 AWT Ctrl/Meta 마스크 2↔4, 128↔256을 교환한다. MacOSDefaultKeymap.Companion.convertShortcutFromParent는 MouseShortcut과 KeyboardShortcut(first/second)만 변환하고 다른 shortcut은 그대로 반환한다. KeymapImpl.readExternal은 로컬 선언 list를 Map.put한다. 자세한 최초 조사와 사용자 XML 경로는 T08-keymap-runtime-audit.md에 있다.

## 생성 결과

| action | 생성 keys |
| --- | --- |
| RecentFiles | meta E |
| RecentLocations | meta shift E |
| GotoAction | meta shift A |
| FileStructurePopup | meta F12 |
| SaveAll | meta S |
| GotoImplementation | meta alt B; mouse meta alt button1 |
| HideAllWindows | meta shift F12 |
| ShowUsages | meta alt F7 |
| Stop | meta F2 |
| GotoLine | meta L |
| GotoDeclaration | meta B |
| ShowSettings | meta COMMA |
| Run | control R |
| RunClass | control shift R |
| ChooseRunConfiguration | control alt R |
| QuickJavaDoc | F1; control J |
| GotoTypeDeclaration | meta shift B; control shift B |

SearchEverywhere: `keys: []`, `gestures: [{"keystroke":"shift SHIFT","modifier":"dblClick"}]`.RunAnything의 modifier gesture도 보존된다. 이 변경만으로 Herdr의 gesture 입력 경로가 자동 구현되지는 않으며 root가 바인딩을 반영한다.

## 검증

- Python AST 구문검사 및 생성 JSON 파싱 통과.
- 임시 디렉터리에 전체 generator 실행 후 기존 tokens와 비교: 의미 차이 없음. 기존 tokens SHA256은 `cf3776712f85ca6db131f1ca19ff16ab4e8b1cf61f36251af1d484086f4b678a`.
- 실제 출력은 `python3 design/idea/extract.py --keymap-only`로 생성했다. 이후 tokens SHA256은 동일했다.
- fixture XML을 AST로 로드한 실제 extractor 함수에 넣어 parent 경계 변환, 두 stroke, mouse, Mac 로컬 Control 보존, 사용자 override, 빈 removal, 동일 action 마지막 선언, gesture 불변, 대소문자 modifier, CONTROL/META 키 코드 보존, missing parent 및 cycle 오류를 assert했다. 모두 통과했다.
- 설치 키맵 12개 주요 action의 정확한 keys 배열 및 SearchEverywhere gesture를 assert했다. 모두 통과했다.
- 별도 임시 디렉터리에 keymap-only로 다시 생성하여 byte-for-byte 동일함을 확인했다.

Recent Files Cmd+E는 root가 실제 IntelliJ 키맵 표시와 실행으로 확인했다. 다른 항목은 현재 설치 클래스·XML 근거와 generator 회귀검사로 검증했으며, Herdr 실제 dispatch와 포커스 동작은 root의 앱 검증 범위다.
