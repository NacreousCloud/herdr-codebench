# 구현/통합 검토

## T01

[담당 결과](T01-result.md). 주 에이전트가 실제 source와 호출부를 검토했고 layout-tree.find의 첫 일치 탐색, common export 유지, 직렬화 파일 ID 유지와 tests를 재확인했다.

## T02

툴 registry/레이아웃 상태/명령은 tool-windows.js, 렌더링은 tools.js로 분리했다. settings/status/recent는 상태 모듈을 직접 참조한다. openToolSettings wrapper는 기존 openIdeaSettings("windows")로 대체했다. settings↔tools 및 recent→tools→everywhere→recent의 view import 고리를 줄였다. settings.js 내부 updateJsonFile 하나로 CAS retry를 공유한다. 저장 순서와 3회 시도, 파싱/도메인 실패의 즉시 반환은 유지한다.

14개 check_*.mjs 전부 통과. settings 검사는 충돌 후 최신 원문 재읽기, 타 설정 보존, 3회 실패, parse/shortcut 충돌 시 쓰기 금지, pending 보존과 terminal font 저장을 실동작 method로 추가 검증했다. workspace/surfaces 검사는 분리된 실제 상태 모듈을 대상으로 툴 이동/툴바 동작을 검증한다. sync_ui --check 통과.

2026-11-04 구조 변경 파일 10개를 백업 후 한 배치로 설치했다. 백업: ~/.config/herdr-app/data/native-ide-backups/simplify-20261104-124523. 사용자 keys/layout은 쓰지 않았다. status.errors=[]이며 실제 창은 기존 editor/Project/terminal/notifications 구성을 유지한다.

제약: herdr-app check mods/codenav는 12초 내 종료하지 않아 timeout 처리했다. passing check로 주장하지 않는다. 전체 native UI/키보드 완료 판정은 보류한다.

## T03

구조 정리 검증 후 진행했다. 설정의 툴 위치 버튼은 170px 고정 열을 없애고 남은 너비와 줄바꿈/가변 행 높이를 사용한다. 이름과 표시 열은 고정 너비로 분리하고 checkbox label은 내용이 열을 넘지 않게 한다. 편집기 위치·LF·UTF-8을 status의 LSP/언어 옆에 모아 두 block 사이의 불필요한 간격을 없앴다. caret/outline/problems의 현재 문서 범위 검사는 common.editorSnapshot 하나로 통일했다.

[편집기 변경](T03-editor-result.md), [트리 변경](T03-tree-result.md)을 실제 소스와 대조해 검토했다. 기존 IDEA 아이콘으로 충분하여 REA 추가 추출은 하지 않았다. 선택한 새 편집기 배치 값은 upstream 추출값과 구분해 herdr.editor.metrics에 기록하고 양쪽 mod를 생성했다.

14개 회귀 검사와 sync_ui --check가 모두 통과한 뒤 12개 변경 파일을 백업하고 배치 설치했다. 백업은 ~/.config/herdr-app/data/native-ide-backups/idea-ui-20261104-125132. 실제 설정에서 위치 버튼/체크박스 겹침이 사라진 것을 확인했다. 실제 Project 트리의 module root/경로/계층선을 확인했다. codenav.design-system을 열어 공통 버튼/입력/checkbox/tree 예제 표시도 확인했다.

실제 소스 화면에서 새 line_height 숫자가 px가 아니라 배율로 해석되어 첫 6줄이 가려지는 문제를 발견했다. 설치된 gpui-kit.d.ts의 line_height 설명으로 원인을 확인했고, 불필요한 한 줄을 제거했다. check_editor_context와 sync/whitespace 검사를 재실행했고 수정 code.js를 적용해 첫 줄부터 정상 표시되는 화면을 확인했다. 이 수정은 기존 고정 h(codeFont().row)를 유지한다.

네이티브 activity check도 XPC 오류 이후 종료되지 않아 통과로 기록하지 않는다. 실제 메뉴 포인터/긴 목록 키보드, 모든 UI 글꼴·밀도 조합, 네이티브 EditorState 내부 gutter는 미확인이다. 이미지와 전체 기능/픽셀 일치를 주장하지 않는다. 실제 화면 확인 마지막 단계에서 앱 IPC 연결이 끊겼으며 새로운 crash report는 발견하지 못했다. 일반 herdr-app 실행으로 창 복구를 시도했다. 최종 연결 상태는 다음 기록에 따른다.

최종: 일반 실행 후 status 연결이 복구되었고 idea/기존 space·tab·terminal이 유지되며 overlays=[]/errors=[]이다. 설정/레이아웃/키 파일과 Herdr 본체 소스는 수정하지 않았다. 전체 목표는 필수 native check·실제 입력 검증 제약으로 부분 완료이며, 요청한 구조 및 네 화면의 구현은 설치되어 있다.

## T04 후속 정리

- tools.Stripe의 tool drag 시작/이동/drop target/위치별 fraction 분기를 제거했다. 우클릭 이동은 유지하며 init에서 이전 tool gesture만 cancel한다. 파일 drag는 유지한다.
- 좌우 upper/lower에 보이는 항목이 모두 있으면 공통 separator를 그린다. 왼쪽 bottom 그룹도 나눈다. 숨긴/빈 그룹만 있으면 불필요한 선은 없다.
- [편집기 T04 결과](T03-editor-result.md)에 따라 IDEA 내부 Outline은 stale outline=true 상태에도 나타나지 않는다. 평범한 선택의 Ln/Col·Copy·Comment 줄은 없고 명시적인 문서/참조/댓글과 Structure 기능은 유지한다.
- 파일 트리의 click guard가 모든 active drag를 차단하던 것을 files payload에만 적용했다. 오래된 tool gesture 상태에서도 폴더 펼침/닫힘이 되는 실제 Files.click 회귀 검사가 통과했다.
- Open Folder 메뉴는 picker를 직접 실행하지 않고 persistent status.openFolder에 위임한다. 선택기는 한 번만 열고, 취소는 no-op, 오류는 알림이며 로컬 경로를 local machine으로 연다. 닫힌 menu의 async 수명/중복 close 경로를 제거했다. 실제 Status method로 성공/취소/실패/중복/로컬 machine을 검증했다. 네이티브 picker 선택 완료 왕복은 미확인이다.

검증: check_*.mjs 14개, sync_ui --check, whitespace 검사 통과. codenav/activity의 native check는 각각 5초 XPC 오류 timeout (실패로 기록). 5개 변경 파일을 한 배치로 설치했고 백업은 ~/.config/herdr-app/data/native-ide-backups/idea-t04-20261104-130334이다. 실제 소스 편집기에서 내부 Outline/선택 하단 줄 미표시와 stripe 그룹선을 확인했고 status.errors=[]였다. 개인 layout/keys 및 본체는 수정하지 않았다.

## T05 후속 회귀 교정

실제 초기 상태는 editorSpec이 없고, 현재 공간에 보이는 Review 탭 하나가 남아 있지만 review.current는 다른 작업공간을 가리켰다. activeId=null로 Cmd+W가 빈 ID 목록을 닫았고, 기존 다음 탭 선택은 다른 저장소의 숨은 Review까지 후보에 넣었다. activeId는 실제 소스 뷰 fallback을 따르고, closeTab은 보이는 마지막 탭을 fallback으로 닫는다. 다음 선택은 visibleTabs로 제한한다. 마지막 보이는 탭을 닫으면 숨은 review 기록은 보존하고 area를 빈 code로 되돌린다.

IDEA workspace 복구와 routing은 빈 editor island를 유지한다. spec/실제 close request가 없는 orphan native dirty metadata는 빈 화면 routing을 가로채지 않는다. unsaved close/save/취소 계약은 유지한다. emptyEditor의 안내는 secondary 색과 정렬한 바로가기 열을 쓰며 Search Everywhere는 실제 유효 바인딩을 표시한다.

소스 gutter guide는 행 border 대신 viewport의 1px 선 하나로 그려 하단 빈 공간까지 이어진다. 가로 scroll과 함께 움직이고 offscreen에서는 잘린다. 글자 시작점/마우스 좌표/codebench/review는 유지한다. [담당 결과](T03-editor-result.md)의 T05 참고.

Shift API 감사 결과 모드 API는 terminal의 두 Shift 시각/중간 입력을 제공하지 않으며 global raw input observer도 없다. 사용자가 일반 기본키 변경을 허용했다. 실제 keys에서 Cmd+Shift+P는 global app.palette와 겹치고 Cmd+Shift+Z는 native redo와 겹치므로 비어 있는 Cmd+Shift+Space를 선택했다. 원본/설치본의 정확한 이전 기본 Shift 두 항목만 제거하고 새 chord와 terminal forwarding을 설치했다. install_keys.py는 custom gesture를 보존한다. keymap/settings/metadata/README/empty hint를 맞췄다.

14개 회귀 검사, sync_ui --check, diff --check 통과. 추가 사례: 다른 workspace 리뷰 current + 마지막 visible review 닫기, 숨은 다른 repo review 자동 활성화 금지, 빈 hidden area 복귀, orphan native vs 실제 pending close, viewport guide 높이/가로 clipping/좌표, 이전 gesture migration/custom 보존/idempotence. native check는 두 mod 모두 5초 XPC timeout으로 미통과다.

설치 백업: ~/.config/herdr-app/data/native-ide-backups/idea-t05-20261104-131746 (8개 JS), 사용자 키 백업: ~/.config/herdr-app/keys.json.backup-20261104-131657-960404. 실제 앱에서 close-tab 명령을 실행했고 소스의 전체 높이 거터 선과 정상 문서 표시/현재 tab 이동을 확인했다. 사용자가 파일을 추가로 여닫는 중이어서 닫기 전체 왕복의 인과는 VM 검증 근거와 구분한다. 마지막 실제 snapshot에서는 탭 줄이 사라지고 새 ⌘⇧Space 안내를 포함한 empty editor가 표시되는 것을 확인했다. Search Everywhere 직접 명령은 성공 응답했으나 이후 snapshot에서는 사용자 조작과 겹쳐 overlay가 보이지 않아 열림 화면 증거로 사용하지 않는다. 명령줄 key forwarding 검증은 보안 hook가 이름을 민감 키 참조로 차단하여 대신 직접 UI action과 VM routing으로 확인했고 실제 물리 키 입력은 미확인이다. 앱 오류 목록은 비어 있었다. 사용자 layout/본체는 수정하지 않았다.

## T06 통합 결과

- 설정은 위치별 도구 목록으로 개편했다. 같은 위치의 위/아래 순서, 다른 위치로 이동, stripe 표시를 draft로 편집하며 Apply/Cancel을 유지한다. 현재 실제 배치로 초기화하며 codenav.toolOrder를 런타임 stripe가 읽는다. 새 도구/미지 ID/미지 위치를 보존하고 reorder만으로 panel layout을 쓰지 않는다. side별 무관 동시 변경은 병합하고 같은 order 변경은 충돌로 처리한다.
- activity Files/Editor, codenav Code/Review의 모든 파일 drag/drop 시작/수신과 ghost preview 기능을 제거했다. canonical drag API/preview view도 제거하고 기존 ghost만 init에서 정리한다. 빈 편집기의 drop 안내를 제거했다. 텍스트 범위 선택/clipboard/file context 작업/네이티브 버퍼는 유지했다.
- [공통 편집기 결과](T06-editor-result.md)를 검토했다. 실제 geometry/gutter/line/viewport/font/background/scroll 원점을 소스와 diff가 공유한다. diff 상태·두 줄번호·선택/댓글 모델은 뷰에 남긴다. 리뷰의 일반 선택 액션 줄은 숨기고 명시적 docs/usages/댓글을 유지한다. 빈 editor의 상단에는 canvas native path cutout을 두어 자식 배경이 모서리를 덮지 못하게 했다.
- Settings에 개별 chord 추가/변경/제거와 직접 문자열 입력/키 기록을 넣었다. [키맵 모델](T06-keymap-result.md)은 순수 preview, expected-action CAS, terminal forwarder, 개인/미지 바인딩과 충돌을 처리한다. 실제 파일 저장 retry를 공유하며 저장 전에는 동작을 바꾸지 않는다. 명시적 terminal scope를 따로 편집할 수 있다.
- 사용자 물리 입력 뒤 제한 trace는 key:cmd-shift-o 수신 및 codenav.find-file 해석을 기록했다. 사용자는 프로젝트 파일 검색이 아닌 ‘이 터미널의 파일’을 원한다고 명확히 했다. terminal default를 직접 codenav.terminal-files로 교정하고 layout:idea의 Go to File은 유지했다. 정확한 이전 forwarder만 설치 migration으로 교정했다. 진단 코드는 제거하고 남은 trace도 초기화했다. 실제 ‘이 터미널의 파일’ 창과 5개 경로 목록이 표시되는 화면을 확인했다. 교정 뒤 물리 chord 자체를 별도로 재입력한 증거와 CLI 직접 action 증거는 구분한다.

검증: check_*.mjs 15개, sync_ui --check, diff --check 통과. 추가 검증은 실제 Settings add/replace/remove, terminal action 별도 편집, 위치별 staged order/Cancel/Apply/동시 변경/미지 값/패널 무변경, shared source/review geometry와 hit test/표시/command, DnD handler 의존성 부재, corner native paths, direct terminal/editor 기본값 분리 및 migration을 포함한다. 두 native check는 기존 XPC 오류로 각각 5초 timeout이며 통과로 기록하지 않는다.

native 적용: ~/.config/herdr-app/data/native-ide-backups/idea-t06-20261104-133743 백업 후 18개 JS를 배치 설치했다(후속 문맥 교정 파일도 적용). 키 백업은 keys.json.backup-20261104-134303-311107이다. 실제 위치별 설정과 source/review 표시, 터미널 파일 창을 확인했고 errors=[]였다. 키맵 UI는 사용자의 조작과 겹쳐 열림 snapshot을 확보하지 못했으며 실제 저장/재할당 입력 왕복은 VM 근거와 구분한다. 빈 editor corner는 native path/상태 조건 검사를 통과했지만 zero-tab actual corner 확대 비교는 남아 있다. 개인 layout/본체/터미널 데이터는 수정하지 않았다.
