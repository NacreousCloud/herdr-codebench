# T06 — 위치별 설정 및 공통 편집기

사용자 지시: (1) 위치별 도구 아이콘 목록으로 이동/표시/순서를 설정, (2) 파일 drag/drop과 빈 화면 안내 제거, (3) 리뷰와 소스의 실제 편집기 표시 구조 공유, (4) 키맵 추가/변경/제거와 저장, (5) terminal Cmd+Shift+O 교정, (6) 탭이 없을 때도 상단 코너 유지.

- Parent: settings.js/tool-windows.js/tool-layout.js/tools.js/common.js/ui.js/main.js/notice.js 및 공통 문서. 도구 순서는 shared codenav.toolOrder의 side별 tool-name 배열로 저장한다. 미지 도구/필드는 보존하고 등록 안 된 ID는 렌더링만 제외한다. 누락된 도구는 기본 registry 순서로 보충. Apply/Cancel과 동시 무관 설정을 보존한다. actual sideOf가 존재하면 설정 위치도 실제 배치로 초기화한다.
- Editor agent: code.js/review.js/islands.js + 새 editor-surface.js, 관련 editor/review 검사. 공통 viewport/font/background/gutter/line/scroll 기하를 사용하고 diff 번호/상태/선택/댓글은 호출자가 제공한다. 버퍼/LSP/리뷰 git 모델은 분리 유지한다. 빈 모서리는 shell이 소유하고 부모 canvas가 보이도록 실제 mask를 그린다. 파일 DnD를 두 codenav 뷰에서 제거한다. 새 framework나 가짜 편집 기능은 추가하지 않는다.
- Activity agent: activity/files.js/editor.js + 관련 tree/file 검사. 파일 DnD 시작/수신/힌트만 제거하며 텍스트 선택·복사/잘라내기/붙여넣기·파일 context 작업/키맵/기존 codebench 행은 유지한다.
- Keymap agent: 새 keymap-model.js, status.js/actions.js/install_keys.py + shortcut/action 검사. parent가 settings UI를 통합한다. 순수 모델 계약은 아래와 같다.

키맵 모델은 stageBindingEdits(bindings, edits) / applyBindingEdits(document, edits) 같은 작고 실제 필요한 함수를 제공한다. edits는 {section,chord,action,expected}이며 action=null은 삭제, expected는 사용자가 편집을 시작할 때의 action(없으면 null)이다. add/replace/remove 모두 실제 파일 최신 값과 expected가 다르면 충돌로 실패한다. unknown section/bindings는 유지한다. IDEA/codenav/activity 명령의 chord 추가/삭제/변경 시 terminal forwarder는 exact previous codenav.key:chord에만 동기화하고 개인 terminal action은 충돌로 보고한다. codebench에서 원 키 전달/기존 terminal-files 조합 유지. 정의된 현재 계약이 부족하면 parent와 확정 후 구현한다.

모든 담당은 자기 파일과 결과 문서만 수정하고 install/commit/native check를 실행하지 않는다. 기본 medium, 상태/공통 기하/키맵 동시성 복잡성 때문에 high로 조정한다. parent는 실제 source와 검사를 검토하고 1회 배치 설치한다. 생성 디자인 파일은 원본으로부터 생성한다. 사용자 layout 크기/순서/active/terminal data는 보존한다.

검증: 위치별 이동/reorder/hide/Cancel/Apply/동시 변경, 키 추가/교체/삭제/CAS/forwarder/user 충돌, 파일 DnD 없는 실제 handlers, 실제 소스/리뷰 공통 기하와 차이 보존, 빈/탭 있는 코너, terminal file search routing 및 다른 layout 회귀. sync --check와 관련 VM 검사, changed mods native check와 actual UI 근거를 구분한다.
