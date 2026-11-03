# T11 — 검색·최근 파일·메뉴 공통 컴포넌트 적용

2026-11-03. 실제 앱 기준과 API는 `design/idea/PARITY_PLAN.md`, `04-contracts.md` 상단 확정 계약을 따른다. 실제 앱 조작·설치·실행 검증은 root가 담당하며 이 작업에서는 수행하지 않았다.

## 구현

- `NewTerminal`, `RunMenu`, `HttpEnvMenu`, `TermMenu`를 `MenuController` / `uiMenu`로 전환했다. focus는 init에서 명시하고 release에서 scroll handle을 해제한다. 공통 메뉴의 명시 px 높이, 가상 목록, 비활성 항목 건너뛰기, 선택 스크롤과 키보드 처리를 사용한다.
- 새 터미널의 agent 목록은 `flex_1()` 단독 영역 대신 높이를 소유하는 공통 메뉴 안에 들어간다. knownAgents와 기계별 캐시, 설치 여부, agent argv, 활성 space, worktree cwd/action을 보존했다. 숫자 힌트는 설치 agent에 부여한다.
- 터미널 우클릭 메뉴는 `closeOnActivate:false`를 사용한다. 선택 경로 복사의 비동기 작업이 끝나기 전에 overlay를 닫아 작업이 취소되는 기존 위험을 피하고 기존 `choose`의 finally에서 닫는다. Escape는 즉시 닫는다.
- Search Everywhere의 idea 크기는 논리 700×600이다. 여섯 탭·검색 입력·결과·하단 경로를 공통 tab/input/list/caption/separator로 구성하고 결과는 가상 목록으로 선택 스크롤한다. 비프로젝트 옵션은 헤더 아래 한 행에 놓아 700 폭에서 탭을 밀어내지 않게 했다. Text 모드로 직접 여는 경우에도 파일/root 로드를 시작한다. release와 새 요청 이후 오래된 파일 검색이 결과를 되살리지 않게 했다.
- `recent.js`는 별도 default class다. 논리 폭500/최대높이520, 툴 열200, 오른쪽 최근 파일, 제목/Only Edited, 필터, 하단 경로/Recent Locations를 제공한다. 좌우/Tab 열 전환, 위아래/Home/End/PageUp/PageDown, Enter/Escape를 처리하며 양쪽 목록은 선택 스크롤한다.
- 최근 파일 순서는 기존 tabs/history와 editorKey 범위를 따른다. 원격 `on`은 보존하며 Only Edited는 `shared('codenav.editedFiles')[editorKey()]`에 실제 기록된 경로만 사용한다. 툴 목록은 render 시 TOOLS를 읽고 toggleTool로 연결하여 순환 import의 top-level 접근을 피했다.
- idea에서 `openEverywhere('recent')`는 `view:'recent'`로 열고 다른 레이아웃의 기존 recent 모드는 보존한다. Recent Locations의 좌표 계산은 기존 compute를 유지한다. TermFiles에도 공통 입력/행과 가상 선택 스크롤을 적용했다.
- 실행 명령 전송, HTTP globals·비밀 파일·요청 구성/실행 처리와 저장 데이터 포맷은 변경하지 않았다.

## 검증

- 변경한 6개 JS 파일의 `node --check` 통과.
- `git diff --check` 통과.
- Node mock 실행 검증 통과: recent history 중복 제거/순서, editorKey 범위, 실제 edited 경로만 필터, 빈 필터 결과, 원격 파일 on 보존, tool 활성화; Everywhere recent 및 유효한 위치 좌표/원격 보존; 새 터미널 agent argv/space 전달, 미설치 비활성화, 숫자 힌트, worktree cwd/action, 메뉴 최대높이400. 외부 실행은 spy로 대체했다.
- 실제 화면의 픽셀 기하·focus·키 입력·긴 목록 scroll은 root의 CU 검증 전이다. 실제 터미널/agent/HTTP 요청은 실행하지 않았다.

### Virtual list renderer 계약 교정

`gpui-kit.d.ts:831–853, 21229–21243`의 renderer 안 handler 등록 금지 계약을 추가 감사했다. Search Everywhere/Recent Files의 양쪽 열/TermFiles 등 네 목록의 uiListRow는 `onClick` 없이 `interactive:true`로 시각 상태만 사용한다. 클릭은 실제 list의 `.on_item_click((key,cx)=>...)`에 등록하고 데이터의 안정 키로 현재 index를 찾는다. Everywhere는 종류·경로·원격·좌표·action 이름·제목을 키로 사용하고 TermFiles는 절대경로·좌표, Recent는 기존 tab id/tool name을 쓴다. 기존 키보드 선택·스크롤은 유지한다.

추가 Node mock에서 virtual render 중 on_click/on_mouse/on_item_click 등록 시 실패하게 하고 네 renderer를 모두 실행했다. 모든 renderer가 통과했으며 list-level 안정 키 클릭으로 원격 파일/툴을 정확히 열고, 데이터 재정렬 뒤 키가 유지되고 선택 index가 갱신되는 것을 확인했다. 문법/diff 검사도 통과했다.

## 연결 사항

root 소유 main.js에 `recent` view 등록이 필요하다. root 소유 키맵에서 Cmd+E / Shift+Cmd+E를 기존 openEverywhere 경로로 연결한다. 실제 파일 저장 성공 시 activity가 editedFiles 경로배열을 기록해야 Only Edited에 반영된다.
