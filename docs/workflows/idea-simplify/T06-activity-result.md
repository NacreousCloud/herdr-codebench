# T06 Activity 파일 drag/drop 제거 결과

## 변경

- `mods/activity/files.js`: `beginDrag`, `advanceDrag`, `dragState` 의존성과 파일 행의 드래그 시작/이동 이벤트를 제거했다. 기존 drag 상태로 클릭을 막는 guard도 제거했다.
- 파일 행과 트리의 외부 `on_drop` 수신, 사용되지 않는 `drop` helper, 그 helper만 호출하던 `perform`의 `drop` 복사 분기를 제거했다.
- `mods/activity/editor.js`: `advanceDrag`, `takeDrag` import와 파일 드래그 이동·mouse-up·외부 drop 수신을 제거했다. 네이티브 `Editor.new(this.code)` 및 텍스트 편집 상태는 그대로다.
- `check_tree_navigation.mjs`: 오래된 drag guard 검사를 제거하고 실제 IDEA/codebench 트리 및 네이티브 편집기 render에 파일 드래그/드롭 handler가 없는지 검사한다. 드래그 API 의존성 부재, 기존 편집 버퍼 전달, context Copy/Cut의 시스템 클립보드·원격 머신 경계도 검사한다.

폴더 펼침/선택, Shift 범위, Cmd 선택, 파일 열기, 컨텍스트 메뉴, 복사/잘라내기/붙여넣기 경로, 머신 검증, 기존 codebench 표시를 보존했다. 텍스트 선택과 네이티브 Editor 내부 편집은 수정하지 않았다. 기존 미커밋 작업을 보존했다.

## 검증

다음 명령 모두 종료 코드 0:

- `node --experimental-vm-modules design/idea/check_tree_navigation.mjs`: 기존 탐색·선택·클릭·표시 회귀, 실제 렌더의 파일 DnD 이벤트 부재, 파일 context 클립보드/머신 경계, 네이티브 편집기 버퍼 전달 통과.
- `node --experimental-vm-modules design/idea/check_file_selection.mjs`: 현재 파일 선택, 상위 폴더 펼침, 수동 다중 선택, 경로/머신 경계, 늦은 응답, 리뷰 범위 통과.
- `node --experimental-vm-modules design/idea/check_editor_context.mjs`: 워크스페이스/머신 경계, 늦은 navigation 취소, dirty save/close, 동시 편집, 기존 버퍼 보존 및 현행 추가 editor 검사 통과.
- `git diff --check -- mods/activity/files.js mods/activity/editor.js design/idea/check_tree_navigation.mjs`: 통과.

요청에 따라 설치, 네이티브 check, 커밋은 수행하지 않았다. 실제 앱의 외부 파일 드롭 무반응 및 텍스트 선택/편집 조작은 주 에이전트의 배치 통합 검증 대상이다. VM 검사만으로 이 실제 조작을 검증했다고 간주하지 않는다.
