# T07 editor 결과 — 하단 Markdown 제어와 Git gutter edge 표시

## Markdown 제어 소유권

- 탭 줄의 일반 `cn-tab-codeview` eye를 제거했다. 일반 소스/네이티브 파일에는 preview eye가 없다. 네이티브 편집기의 기존 Close/dirty-save/discard/cancel 경로는 그대로다. 이전 eye처럼 탭 쪽에서 `edit`만 지워 소유 버퍼를 우회하지 않는다.
- 소스의 `cn-md`와 네이티브 편집기의 `ed-preview`를 상단에서 제거하고, 각 소유 뷰의 하단 `uiEditorFooter`로 옮겼다. Markdown일 때만 footer와 eye가 있다. 공유 footer는 각 모드의 로컬 생성 디자인 모듈에서 import한다.
- 소스의 하단 eye는 기존 `toggleRich()`를 호출한다. 네이티브 하단 eye는 기존 `mdMode`의 edit → split → preview → edit 순환을 그대로 실행한다. 새 버퍼/preview 상태를 만들거나 EditorState를 다시 생성하지 않는다.
- 설치된 `gpui-kit.d.ts`의 EditorState/Editor 공개 계약을 확인했다. 글꼴·문법·줄 번호·folding·readonly·wrap API는 있지만 Markdown preview/footer 옵션은 문서화되어 있지 않다. 실제 앱 쪽 `mdMode`와 preview body는 기존 `activity/editor.js`가 소유한다. 이 기존 제어를 옮겼으며 네이티브 엔진 내부에 별도 footer가 없다는 것까지 VM 검사로 주장하지 않는다. 실제 화면의 중복 여부는 부모 통합 단계에서 확인한다.

일반 상단 eye 제거와 Markdown 제어의 하단 이동은 codebench에도 적용했다. 파일 열기/편집/저장/닫기와 preview 순환 동작은 보존했다. 리뷰의 실제 diff 작업인 Show Diff/Show Whole File eye는 이 범위에서 수정하지 않았다.

## Git 변경 표시

- `editor-surface.js`의 `editorGutter`에 선택적 `edgeMark: {kind,start,end}` 계약을 추가했다. 표시는 공통 gutter가 소유한 absolute 장식이며 숫자/rail/navigation marker의 flex 배치에 참여하지 않는다.
- IDEA 소스는 기존 4px 변경 rail 자리를 비워 둔다. 이로써 숫자·탐색/HTTP glyph·기존 댓글 rail·본문 원점이 바뀌지 않는다. 실제 추가/수정 표시는 gutter의 오른쪽 1px guide 바로 옆에서 그린다. 전체 viewport guide와 가로 스크롤 동작은 유지한다.
- 수정/추가 구간은 좁은 세로 막대이며 연속된 같은 종류의 시작/끝에만 둥근 cap을 쓴다. 삭제 표시는 기존 의미처럼 해당 줄 아래의 짧은 표시다. 실제 git diff에서 읽은 `changes` Map과 line classification은 변경하지 않았다.
- 색은 부모/chrome 담당이 canonical `uiColors()`에 추가한 `lineAdded`/`lineModified`/`lineDeleted`를 쓴다. 폭·radius는 같은 담당이 토큰으로 추가한 `IDEA.editorChangeMarkerWidth=4` / `editorChangeMarkerRadius=2`를 쓴다. 이 치수는 사용자가 준 화면에서 선정한 근사값이며 upstream runtime 추출값으로 주장하지 않는다.
- codebench의 기존 Git rail/색/위치는 유지한다. 공유 Review gutter에는 새 optional 계약을 제공하지만 diff row의 번호/+/-/배경/댓글 계약은 바꾸지 않았다.

네이티브 EditorState 공개 API에는 Git gutter rail/marker를 지정할 방법이 없다. 따라서 이 Git edge 표시는 공통 custom source/diff surface에 적용되며 네이티브 내부 gutter까지 변경했다고 주장하지 않는다.

## 검증

다음 검사는 종료 코드 0이다.

- `node --experimental-vm-modules design/idea/check_editor_context.mjs`: semantic edge 색, 연속 구간 cap, 기존 rail/nav slot과 text origin 보존, 상단 eye 제거, source/native의 Markdown 전용 하단 제어를 검사한다. 네이티브 edit/split/preview 세 상태를 렌더하고 순환하며 같은 dirty EditorState/텍스트가 보존됨을 확인한다. 기존 source/review 공통 기하·댓글·명시 문서·참조·workspace/remote/dirty-save 검사도 통과한다.
- `node --experimental-vm-modules design/idea/check_tabs.mjs`: 닫기/MRU/dirty handshake/workspace 및 codebench 회귀를 유지한다.
- `node --experimental-vm-modules design/idea/check_review_navigation.mjs`: 차이 구간 순환과 늦은 workspace/file diff 응답 격리를 유지한다.
- `node --experimental-vm-modules design/idea/check_system.mjs`: 부모의 canonical 변경과 공유 디자인·레이아웃 보존 검사를 통과했다.
- `python3 design/idea/sync_ui.py --check`: 부모가 동기화한 codenav/activity 생성 사본 일치를 확인했다.
- 변경 editor source/test 파일의 `git diff --check`를 통과했다.

공유 canonical 파일/생성 사본은 이 작업에서 편집하지 않았다. 부모가 생성 동기화를 완료한 뒤 위 최종 검사를 다시 통과했다. 실제 설치와 화면 검증은 부모 통합 단계에서 수행한다. 네이티브 CLI 검사·설치·커밋·하위 에이전트 생성은 수행하지 않았다. VM 검사를 실제 cap 픽셀·native footer 중복·모든 화면 통과로 취급하지 않는다.
