# 범위와 계약

## 분석·요구사항

사용자는 YAGNI/KISS/DRY 구조 정리를 먼저 요청했다. 이어 설정 툴 위치 버튼 겹침, 하단바 여백, 이미지 기준 편집기/파일 트리 개선을 요청했고 구조 정리를 선행하도록 명시했다.

기존 idea-ux는 레이아웃 탐색 3개, 파일 탭 ID 3개, 설정 파일 CAS 저장 루프 2개를 중복 구현한다. tools.js는 툴 상태/명령과 렌더링을 함께 소유하며 settings.js와 상호 import한다. 생성 디자인 사본은 모드 간 import 경계로 필요하므로 유지한다.

## 설계·계약 (T01/T02)

- 레이아웃 탐색은 순수 함수 하나로 통일한다. 첫 일치 노드를 반환하며 기존 common.find export를 보존한다.
- 파일 ID는 기존 editor-history.fileTabId를 사용한다. 저장 형식과 machine 구분을 유지한다.
- JSON 저장 helper는 settings.js 내부에만 둔다. 최신 파일을 매 시도 읽고 변경하며 예상 원문을 writeTextFile에 전달한다. 최대 3회, 파싱/도메인 검증 오류는 즉시 실패한다. 성공 후에만 pending shortcut을 지운다.
- 툴 상태 모듈은 기존 registry/상태/레이아웃 명령만 소유한다. UI를 import하지 않으며 기존 명령과 레이아웃 payload를 바꾸지 않는다.
- 새 프레임워크, 엔진, 의존성, 저장 포맷, 드래그 기능을 추가하지 않는다. codebench와 사용자 패널/터미널 상태를 보존한다.

## 태스크·검증

T01: layout-tree.js, common.js, islands.js, tool-layout.js, tabs.js 및 해당 회귀 검사. 기존 동일 탐색 결과, migration idempotence, remote/local 탭 구분, 다중 파일 열기/닫기를 확인한다.

T02: settings.js, tool-windows.js, tools.js, status.js, recent.js와 관련 VM mock 경로. 저장 충돌 재시도/실패/유효성 검증, 그룹 병합/취소, 툴 이동과 terminal payload 보존을 검사한다.

T03: 구조 검증 후 실제 화면과 첨부 기준을 비교했다. 툴 위치 선택 열은 flex 폭/줄바꿈과 높이 자동 확장으로 표시 열 침범을 막는다. 하단 위치/인코딩은 LSP/언어와 같은 상태 영역에 모은다. editorSnapshot을 공유해 path/machine/workspace 스코프를 유지한다. 편집기는 얇은 breadcrumbs와 거터/텍스트 원점을 공유하고 탭의 앞쪽 탐색 버튼은 뒤쪽으로 옮긴다. 트리는 root module 아이콘/이름/경로와 14px 계층/가이드를 쓴다. 기존 추출된 IDEA 아이콘으로 충분하므로 새 패키지 분해는 필요하지 않다. 새 편집기 배치 값은 tokens.json herdr.editor.metrics에 upstream 추출값과 구분해 기록한다. 디자인 원본만 수정/생성하고 설치는 배치한다.

필수: sync_ui.py --check, check_system.mjs 및 관련 check_*.mjs, changed mod의 herdr-app check, 실제 앱 화면/errors 확인. 런타임의 클릭/키보드 확인 가능 범위와 미확인 항목을 구분한다.

## T04 후속 요구사항

도구 stripe의 드래그 시작/이동/드롭을 제거하고 오래된 tool drag 상태를 init에서 정리한다. 좌우 upper/lower 그룹과 왼쪽 bottom 그룹은 실제 보이는 항목이 양쪽에 있을 때만 공통 separator를 표시한다. 우클릭 이동/설정은 유지한다. 파일 드래그와 기존 codebench는 범위 밖이다.

IDEA 편집기의 내부 Outline과 평소 선택 시 나오는 줄/열·복사·코멘트 스트립은 그리지 않는다. Structure 도구/명시적 참조·코멘트 기능은 유지한다. 문서 단축키는 명시 요청 시 본문만 표시하고 선택만으로 hover를 요청하지 않는다.

폴더 클릭은 오래된 tool drag에 막히지 않아야 한다. 프로젝트 메뉴의 비동기 pickFolder는 닫히는 overlay 대신 상시 status 뷰에서 실행한다. 중복 요청을 차단하고 취소는 no-op, 실패는 알림, 선택한 로컬 경로는 local machine으로 새 space를 연다. 관련 실제 view/command method 회귀 검사와 runtime 적용/화면 확인을 수행한다.

## T05 후속 요구사항

다른 workspace/repository가 게시한 review.current 때문에 activeId가 null인 경우에도 마지막 보이는 탭을 닫을 수 있어야 한다. 닫은 뒤 자동 선택은 현재 저장소에서 보이는 탭에 한정하고 다른 저장소 review는 보존하되 활성화하지 않는다. empty IDEA island는 workspace 복구 시에도 보이며 orphan native metadata가 welcome 화면을 가리지 않게 한다. unsaved close 요청은 기존 native owner에서 유지한다. 빈 편집기 힌트는 현재 유효 키맵으로 표시한다.

거터 선은 소스 viewport 전체 높이에 한 번 그리고 가로 스크롤과 함께 이동한다. 스크롤 좌표/행 클릭 원점과 codebench는 유지한다.

사용자가 Shift 타이밍 대신 기본 단축키 변경을 허용했다. ⌘⇧Z는 redo, ⌘⇧P는 실제 global app.palette와 겹쳐 비어 있는 ⌘⇧Space를 선택했다. 저장소/설치본의 이전 기본 shift shift 두 항목만 마이그레이션하고 개인 action은 보존한다. metadata/설정 표시/README/empty hint/검사도 같은 기본값을 따른다. 앱 본체·전역 키 감시 helper는 추가하지 않는다.

## 문서 범위

이번 국소 리팩터링은 별도 API/스키마/배포를 만들지 않으므로 분석~검증 계획을 이 문서에 모았다. 태스크별 결과는 results.md에 합치며 진행 상태는 00-progress.md를 기준으로 한다.

## 결정

- D01: 구조 정리 검증을 UI 수정에 선행한다 (사용자 지시).
- D02: speculative framework 대신 확인된 중복과 실제 책임 경계만 분리한다.
