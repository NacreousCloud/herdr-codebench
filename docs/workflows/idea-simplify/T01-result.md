# T01 결과: 레이아웃 탐색·파일 탭 ID 공통화

## 변경

- `mods/codenav/layout-tree.js`에 런타임/UI import가 없는 `find`를 추출했다. 현재 노드를 먼저 검사하고 자식 순서대로 깊이 우선 탐색하며 첫 일치에서 멈춘다. 미일치는 `null`이다.
- `common.js`는 같은 함수를 import하여 내부에서 사용하고 기존 `find` export도 유지한다. `islands.js`, `tool-layout.js`의 중복 탐색을 제거했다.
- `tabs.js`는 기존 `editor-history.js`의 `fileTabId`를 `fileId` 이름으로 import한다. `common.openFiles`도 같은 함수를 사용한다. 저장 ID 형식과 로컬/원격 구분은 그대로다.
- `check_system.mjs`에 첫 일치, 깊이 우선 순서, 없는 노드, 자식 없는 노드, 첫 일치 후 탐색 중단 검사를 추가했다.
- `check_tabs.mjs`에서 실제 `common.js`와 두 순수 모듈을 로드하여 다중 파일 열기, 중복 제거, 순서, 마지막 파일 선택, 로컬/원격 경계, 재열기와 빈 입력을 검사한다.

기존 미커밋 WIP를 보존했다. UI, 디자인 생성물, 저장 포맷, 키맵은 변경하지 않았다. 설치/커밋은 수행하지 않았다.

## 검증

다음 명령 모두 종료 코드 0:

- `node --experimental-vm-modules design/idea/check_system.mjs`: 공유 디자인 상태, 메뉴 키보드/스크롤, 새 탐색 계약, migration 보존·멱등성 통과.
- `node --experimental-vm-modules design/idea/check_tabs.mjs`: 기존 닫기·워크스페이스·리뷰·codebench 회귀 및 실제 common의 다중 파일/머신 ID 검사 통과.
- `node --experimental-vm-modules design/idea/check_editor_history.mjs`: MRU, 닫힌 파일, 머신 ID, 수 제한, 편집 상태 제거, 선택 정책, 워크스페이스 격리 통과.
- `node --experimental-vm-modules design/idea/check_editor_context.mjs`: 비동기 문서/워크스페이스 경계, dirty 저장/닫기, 동시 편집, 버퍼 보존 통과.
- `node --experimental-vm-modules design/idea/check_file_selection.mjs`: 선택/확장, 다중 선택, 경로·머신 경계, 늦은 응답, 리뷰 범위 통과.
- `git diff --check -- mods/codenav/common.js mods/codenav/islands.js mods/codenav/tool-layout.js mods/codenav/tabs.js design/idea/check_system.mjs design/idea/check_tabs.mjs`: 통과.

Node의 VM experimental 경고와 환경 인증서 접근 경고가 출력되었지만 검사 실패는 없었다. 네이티브 `herdr-app check`, 디자인 생성 동기화 검사, 실제 화면 검증은 통합 단계에서 주 에이전트가 수행한다. 이 결과는 해당 검증을 통과로 간주하지 않는다.

## 실행 기록

기존 감사 에이전트에 followup으로 배정되어 부모에서 상속된 reasoning 설정을 사용했다. followup 도구에는 reasoning 재지정 기능이 없으며 실행 중 실제 effort 값은 이 에이전트에 노출되지 않았다. 요청한 medium으로 변경되었다고 주장하지 않는다. 하위 에이전트는 생성하지 않았다.
