# T04 결과 — 코드·리뷰·코멘트

수정 파일: `mods/codenav/code.js`, `mods/codenav/review.js`, `mods/codenav/comments.js`.

## 변경

- idea 코드 헤더는 탭의 파일명을 다시 표시하지 않고 부모 경로·심볼 breadcrumbs를 표시한다. 파일이 없는 상태에서는 빈 보조바를 만들지 않는다. 기존 LSP 상태·진단·찾기·리치 보기·편집 버튼의 동작을 유지하고 상태 pill의 채움과 테두리를 줄였다.
- 코드·리뷰 헤더는 공통 32px 높이, 구조·참조 목록은 24px 행을 사용한다. 구조·리뷰 파일·브랜치 선택 행에 4px radius와 안쪽 여백을 적용했다. 리뷰 브랜치/대상 컨트롤과 찾기 입력은 공통 controlRadius/inputHeight 기준에 연결했다.
- idea의 리뷰 main은 기존 파일 탭과 중복된 파일 제목을 숨기며 비교 기준·상태와 파일 열기 동작을 보존한다. 보조 패널은 에디터와 같은 표면을 사용한다. 빈 참조 결과는 `No results`를 표시한다.
- UI 글꼴은 ideaUI, 각 UI 텍스트 크기는 uiSize를 사용한다. 코드/리뷰의 소스 텍스트와 참조 미리보기는 codeFont를 유지하고 소스 기본 글자는 추출된 #BCBEC4를 사용한다. 현재 줄/줄 번호는 추출된 에디터 색 역할을 사용한다.
- 코드 부모가 codeFont인 경우에도 코멘트 카드/입력 패널은 시스템 UI 글꼴을 갖는다. 코멘트 높이는 UI 배율에 반응하며 코드 items 캐시는 UI 크기가 바뀌면 갱신한다. 저장·삭제·줄 범위 선택·리뷰 전달 데이터 흐름은 그대로다.
- 기존 codebench에서는 uiSize/ideaUI가 원래 크기·스타일을 유지하며 디자인 구조 변경은 isIdea 분기에 한정했다. 단, 로딩 문자열에 누락된 T() 적용은 공통 번역 수정이다.

## 검증

- `node --check mods/codenav/code.js` 통과.
- `node --check mods/codenav/review.js` 통과.
- `node --check mods/codenav/comments.js` 통과.
- `git diff --check` 통과.
- `gpui-kit.d.ts`에서 사용한 font_family/text_size/rounded 계열 API를 확인했다. 데이터 로드, HTTP 요청 실행, LSP 호출, 리뷰 diff 생성, 코멘트 저장/선택/전달 코드는 UI 변경 대상과 구분해 소스 검토했다.

## 미확인·의존 사항

- 설치, Herdr CLI, 앱 조작은 실행하지 않았다. 실제 정상·빈·오류·로딩 상태 화면, 클릭/키보드 이동, 확대 글꼴에서 줄 잘림, codebench 회귀는 root의 앱 검증이 필요하다.
- 부모의 radius가 자식 배경을 자른다고 가정하지 않는다. 본 변경은 보조 배경을 editor surface에 맞추며 기존 islandBottom을 유지한다. 스크롤러/정보·코멘트·개요 패널 끝까지 보호하는 에디터 아래 마감 블록과 셸은 root 소유 변경에 의존한다.
- 코멘트 높이는 기존 문자 수 기반 추정 방식을 유지한다. 아주 좁은 너비와 긴 문장/큰 UI 글꼴에서는 실제 앱에서 확인해야 한다.

## 후속 구현 — 사용자 키맵 감사 반영

- code/review에서 idea Ctrl+Alt+click은 LSP implementation을 호출한다. 기존 Ctrl+click과 Cmd+click의 definition은 유지한다. idea middle press도 선언 이동으로 연결했으며 codebench에는 해당 신규 mouse binding을 추가하지 않았다. 리뷰 implementation의 로딩/결과 없음 설명도 메서드에 맞춘다.
- gpui-kit.d.ts의 MouseButton(left/right/middle), MouseButtonEvent.modifiers/control/alt/platform와 on_mouse_down/up 서명을 확인했다. middle은 press에서 즉시 처리하며 좌클릭의 기존 release/drag 흐름을 변경하지 않는다.
- 코멘트 카드는 공통 uiFontFamily를 사용하므로 root가 추가한 shared appearance.uiFont를 읽는다. idea Outline 버튼은 `File Structure (Ctrl+F12)` 및 실제 structure popup으로 변경했다. code local Cmd+Shift+O도 idea에서는 files popup을 열어 layout의 Go to File과 충돌하지 않는다. 리뷰 Definition 툴팁은 실제 구현된 Cmd+click만 안내한다(리뷰 Cmd+B 명령 미구현).
- code local Ctrl+Shift+E를 locations에 연결했다. codenav.caret publish에 `on: s.on ?? null`을 포함해 동일 절대경로의 다른 머신과 구분한다.
- 변경 JS 세 파일의 node --check 및 git diff --check 재통과. 실제 클래스 메서드를 Node VM에서 불러와 Code.release와 Review.pickWord에 plain/Cmd/Ctrl/Ctrl+Alt modifier를 주입해 호출 메서드를 확인했다. idea implementation/definition/hover 분기와 codebench Ctrl+Alt의 기존 definition이 유지되는 검사 통과. 첫 실행은 mock의 codeFont 의존 누락으로 실패했고 review.cw를 명시한 수정된 harness에서 통과했다.
- 실제 앱 middle press/좌클릭 release 이벤트 전달, LSP 서버 결과, 키보드 dispatch는 실행하지 않았다. 감사 문서의 나머지 항목은 root/다른 담당자의 수정과 앱 검증 대상이다.

## 잔여 입력 정합 수정

- code.closeInfo를 닫기 버튼/Escape가 함께 사용한다. Escape는 sel/note/selection/hover와 references/find 상태를 정리하고 코드 포커스를 복구한다.
- Cmd+G/Cmd+Shift+G는 공통 findKey로 다음/이전 검색 결과를 이동한다. 검색 Input 자체와 코드 root 양쪽에 연결했고, 처리하면 propagation을 중단한다. 코멘트 타이핑 중에는 검색 키를 가로채지 않는다.
- Ctrl+Shift+B 타입 선언 alias를 연결했다. idea의 F12/Shift+F12는 로컬 VS Code 선언/참조 별칭을 처리하지 않고 상위 키 경로로 남긴다. codebench 별칭은 유지한다.
- code.command의 editor-back/editor-forward는 로컬 back/fwd 이력이 있으면 goBack/goForward, 없으면 tabBack/tabForward로 보낸다. status/탐색 버튼의 명령 연결은 root 담당이다.
- 정상 리뷰 root에 track_focus(this.focus)를 붙이고, diff 좌클릭/middle 선택과 리뷰 코멘트 목록 press에서 먼저 focus.focus한다. 코멘트 edit의 textarea focus는 이후 실행되어 유지된다.
- code/review/comments node --check와 git diff --check 통과. 실제 CodeView 클래스를 Node VM에서 불러 keyDown/command를 실행해 검색 중 Cmd+G/Shift+Cmd+G, Escape의 sel/note 정리, 타입 alias, idea F12/Shift+F12 비소비, codebench 기존 별칭, 로컬 이력과 탭 fallback 분기를 검사했다. 최종 검사 통과. 첫 harness는 back/fwd accessor의 editorKey mock 누락으로 실패했고, 검증하려는 dispatch 경계에 맞게 이력 배열을 instance property로 주입한 뒤 통과했다.
- 검색 Input의 실제 native 이벤트 전달·중복 소비 여부, 정상 리뷰 focus, 전역 F12/Shift+F12 dispatch 및 위치 이력 저장의 앱 검증은 미실행이다.
