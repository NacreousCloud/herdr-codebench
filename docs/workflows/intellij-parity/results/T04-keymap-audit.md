# T04 후속 감사 — 사용자 키맵과 입력 경로

읽기 전용 코드 감사. 기능 파일은 수정하지 않았다. 기준은 `HANDOFF.md`의 사용자 키맵 선택과 `design/idea/keymap.json`의 실제 `macOS 1 복사 → Mac OS X 10.5+ → $default` 병합 값이다. 일반 macOS/VS Code 관례로 키를 추정하지 않았다. `keys.json`, `status.js`, `code.js`, `review.js`, `tabs.js`, `everywhere.js`, `tools.js`, `run.js`를 대조했다. 앱 실행/키 입력 검증은 하지 않았다.

## P1 — 기존 기능으로 고칠 수 있는 불일치

| 항목 | 실제 사용자 키맵 | 현재 코드와 영향 | 수정 방향 |
| --- | --- | --- | --- |
| 파일 이동의 포커스 차이 | GotoFile = Cmd+Shift+O | `keys.json` terminal → `status.js` TERM_KEYS.idea는 terminal-files로 보낸다. 에디터에서는 Go to File이다. HANDOFF에도 의도된 기존 분기로 기록되어 있으나 IntelliJ 동일 UX에는 불일치한다. | idea에서는 파일 찾기로 통일하고 터미널 출력 경로 선택에는 별도 액션을 제공. codebench 분기는 보존. |
| 액션 찾기의 포커스 차이 | GotoAction = Ctrl+Shift+A | layout:idea는 맞지만 terminal은 Ctrl+Shift+A를 terminal로 통과시킨다. 대신 Cmd+Shift+A가 Find Action으로 전달된다. Kitty 프로그램에선 사용자 키로 액션 찾기가 열리지 않을 수 있다. | terminal override와 TERM_KEYS의 키를 함께 교정. 터미널 프로그램 키를 보존하는 제품 정책이라면 그 차이를 명시. 이는 엔진상 불가능한 항목이 아니다. |
| 에디터 Back/Forward의 위치 기록 | Back = Cmd+[ 또는 Cmd+Alt+Left, Forward = Cmd+] 또는 Cmd+Alt+Right | layout 액션을 받은 status는 tabBack/tabForward만 호출한다. tabs.js는 탭 id별 방문 기록(최대 10개, 같은 id는 재기록하지 않음)을 이동한다. 반면 code.js의 같은 파일 내 정의 이동은 this.back/this.fwd에 저장되고 Alt+Left/Right에서만 소비된다. 사용자 Back 키로 같은 파일 내 이동을 되돌릴 수 없다. terminal 포커스에서는 같은 액션을 agent.prev/next로 바꾼다. | 파일·줄·열을 포함한 위치 이력과 명령 경로를 연결. 터미널 agent 이동은 기존 별도 정책으로 분리 검토. |
| 마우스 구현/타입 이동 | GotoImplementation = Ctrl+Alt+click, GotoTypeDeclaration = Cmd+Shift+click, GotoDeclaration = Cmd+click/middle | code.release는 platform 또는 control이면 항상 definition. Ctrl+Alt는 구현 대신 선언으로 가며 Cmd+Shift는 press에서 선택 확장에 걸릴 수 있다. middle 핸들러도 없다. 리뷰 pickWord 역시 control을 선언으로 취급한다. | modifier 우선순위에서 구현/타입을 먼저 판별하고 middle의 선언 이동 추가. 키보드 LSP 엔드포인트는 이미 존재. |
| Esc 정보창 닫기 | EditorEscape/FocusEditor = Escape | code.keyDown의 Escape는 refs/hover/selection/finding만 지운다. infoBar 표시 조건인 sel/note는 남아 있어 `Close (Esc)`로 안내한 정보 패널이 계속 보일 수 있다. 닫기 버튼은 sel/note까지 지운다. | 동일한 닫기 helper로 버튼/Escape 상태 정리. 다른 블록 포커스 이동 문제와 별개인 구현 가능한 상태 버그. |
| 리뷰의 잘못된 Definition 툴팁 | GotoDeclaration = Cmd+B | T04에서 리뷰 Definition 툴팁을 Cmd+B로 맞췄지만 Review는 nextCommand 구독/definition 명령 처리가 없고 key handler는 코멘트/Escape만 처리한다. Cmd+click은 코드에 있으나 Cmd+B 보장은 없다. | 리뷰의 선택 위치에 definition 명령을 연결하거나 리뷰에서 지원하는 마우스 조작만 안내. |

## P2 — 기능 추가 또는 경로 정리가 필요한 항목

| 항목 | 근거와 현재 상태 | 구분 |
| --- | --- | --- |
| Recent Locations | 실제 RecentFiles는 Ctrl+E, RecentLocations는 Ctrl+Shift+E. 현재 둘 다 find-recent로 연결되고 everywhere recent는 열린 파일 탭을 중복 제거한 목록이다. 줄/열 위치와 닫은 파일을 보존하지 않는다. | 엔진 제약이 아닌 위치 이력/별도 보기의 미구현. 동일 창을 두 키에 연결한 것은 동등 구현이 아니다. |
| Find Next/Previous | 실제 FindNext = Cmd+G, FindPrevious = Cmd+Shift+G. code의 findNext는 존재하지만 Enter/Shift+Enter 입력 submit과 버튼만 연결된다. | 구현 가능. 검색 Input에 포커스가 있을 때의 키 전달도 함께 처리해야 한다. |
| Find 툴 윈도우 바로 열기 | 실제 ActivateFindToolWindow = Cmd+3, FindInPath = Cmd+Shift+F. 현재 TOOLS.find의 키와 layout 바인딩은 Cmd+Shift+F 하나이다. | Cmd+3 추가 가능. 경로 검색 시작과 기존 결과 창 활성화는 실제로 다른 액션이다. |
| 아웃라인 툴팁/키 충돌 | code의 Outline 버튼은 여전히 `Outline (Cmd+Shift+O)`라고 안내한다. 사용자 키맵은 Go to File이며 파일 구조 팝업은 Ctrl+F12. local keyDown에도 Cmd+Shift+O → outline 토글이 남아 있다. F12는 local 선언 이동과 layout 마지막 툴 윈도우 이동이 중복되고 Shift+F12는 local references지만 사용자 키맵은 RestoreDefaultLayout이다. | idea 분기에서 기존 VS Code 로컬 별칭을 정리하고 구조 버튼을 실제 구조 액션에 연결 가능. 실제 우선순위는 Herdr 앱 키 입력 검증 필요. |
| 타입 선언 대체키 | 실제 GotoTypeDeclaration은 Cmd+Shift+B와 Ctrl+Shift+B 모두. 현재 code local은 Cmd+Shift+B만 처리한다. | Ctrl+Shift+B alias 추가 가능. |
| Search Everywhere 그룹 이동 | 실제 NextGroup은 PageDown/Cmd+Down, PrevGroup은 PageUp/Cmd+Up. 현재 everywhere는 Up/Down, Tab/Shift+Tab, Escape만 처리한다(Enter는 input submit 경로). | 그룹/페이지 이동 추가 가능. 기존 결과 구조에 맞는 의미 정의 필요. |
| 설정 열기 | 실제 ShowSettings = Cmd+Comma. 툴바 Settings 버튼은 app.settings를 실행한다. repo keys에는 Cmd+Comma가 없다. | Herdr 기본 바인딩에서 제공할 수 있어 누락 확정은 아님. 실행 앱의 기본 키 설정을 확인한 뒤 필요하면 추가. |
| 리뷰 키보드 포커스 | 정상 리뷰 root는 track_focus(this.focus)를 붙이지 않고 pressRow도 focus.focus()를 하지 않는다. 빈 notRepo root만 focus를 추적한다. | 키보드 이벤트가 어디로 전달되는지 앱 검증 필요. Esc/이동/선언 액션 지원 전에 포커스 경로를 확인. |

## 엔진/기능 범위 제약과 보존할 차이

- 마우스 button4/button5 Back/Forward: HANDOFF에서 확인된 Herdr 입력 API는 left/right/middle만 제공한다. middle 선언 이동은 이 제약에 포함되지 않으며 구현 가능하다.
- 다른 툴 윈도우에서 Escape로 에디터 포커스 복귀: 현재 모드 API의 블록 간 포커스 이동 제약으로 HANDOFF가 미지원으로 기록한다. 코드 내부 정보창 닫기 상태 누락을 이 제약으로 정당화하면 안 된다.
- 툴 윈도우 끌어서 이동은 블록 간 drag 수신 제약이 있으며 현재 메뉴 이동이 대안이다.
- Debug = Ctrl+D, ChooseDebugConfiguration = Ctrl+Alt+D는 실제 키맵에 있으나 현재 run.js는 shell 실행 구성과 interrupt이며 디버거 엔진이 없다. Run으로 잘못 연결해 성공을 가장하지 않는다. Run/Debug 제목은 실제 제공 범위를 넘는 인상을 줄 수 있다.
- Ctrl+R 실행과 Ctrl+J 문서는 터미널 프로그램과 충돌하여 현재 터미널에서 보존하는 정책이다(HANDOFF/DESIGN에 명시). 엔진의 절대 불가능이 아니라 가로채기/터미널 입력 보존의 선택이다. Ctrl+Shift+A 등으로 확대된 차이는 위 P1과 함께 정리할 수 있다.
- Replace/리팩터링/컴파일 등 편집·IDE 엔진 전체 기능은 이 소스 탐색 뷰의 범위를 넘는다. 이번 감사는 존재하는 탐색/검색/리뷰 기능의 잘못된 키 연결을 먼저 다룬다.

## 일치하는 주요 바인딩

layout의 Project Cmd+1, Commit Cmd+0, Structure Cmd+7, Problems Cmd+6, Terminal Alt+F12, 클래스 Cmd+O, 심볼 Cmd+Alt+O, 숨기기 Shift+Escape/Ctrl+Shift+F12, 실행 구성 Ctrl+Alt+R, 재실행 Cmd+R, 중지 Ctrl+F2는 실제 추출 값과 일치한다. 탭 다음/이전 Cmd+Shift+]/[ 및 Ctrl+Right/Left도 일치한다. 코드의 Cmd+B, Alt+F7, Ctrl+Alt+B, Ctrl+Alt+F7, Ctrl+F12, F1/Ctrl+J, Cmd+L, F2/Shift+F2의 로컬 처리도 존재한다. 단, 전역/레이아웃/로컬/terminal 중복 우선순위는 앱 검증 대상이다.

## 검증 한계

설치·앱 조작·Herdr CLI는 실행하지 않았다. 이는 정적 바인딩/처리 경로 증거이며 실제 키 디스패치나 macOS 단축키 선점 여부를 검증한 결과는 아니다. 초기 복합 검색 명령은 민감 경로 자동 훅에 차단되었으나, 허용된 개별 문서 읽기 명령으로 기준 키맵과 소스 확인을 완료했다. 제한된 민감 파일은 읽지 않았다.

## 감사 이후 T04 지정 수정

위 표는 감사 당시 상태다. root 지정 후 Ctrl+Alt+click/middle 선언 이동, Outline 툴팁/파일 구조 popup, 리뷰 Definition 툴팁, code local Ctrl+Shift+E locations 연결을 T04에서 수정했다. 코멘트 appearance UI 글꼴 연동과 caret.on도 추가했다. 실제 앱 검증은 아직 미실행이며 세부 내용/Node modifier 검사는 T04-result.md를 따른다. keys/status/everywhere 및 나머지 위치 이력/키 경로는 다른 담당자가 처리한다.

추가 T04 수정으로 Escape 정보창 상태, Cmd+G/Cmd+Shift+G, Ctrl+Shift+B, idea 로컬 F12/Shift+F12 충돌, editor-back/editor-forward 명령 dispatch, 정상 리뷰 focus를 처리했다. 앱 키 디스패치/포커스 검증은 남아 있다.
