# T03 결과: IDEA 에디터 시각 정합

## 변경

- `tabs.js`: IDEA 파일 탭이 섬의 왼쪽에서 바로 시작한다. 뒤로/앞으로 버튼은 탭 뒤쪽으로 옮겼고 동일한 실제 탐색 명령을 호출한다. 선택·가운데 클릭 닫기·우클릭 메뉴·활성 탭 자동 스크롤·파일 ID는 보존했다. 탭 줄 배경은 공통 editor 색을 쓴다. codebench 버튼 위치와 표시 방식은 유지한다.
- `code.js`: 비어 있던 IDEA 보조 줄에 실제 LSP 심볼 범위의 breadcrumb를 표시한다. 심볼이 없으면 현재 파일 이름을 보여준다. 심볼 클릭은 기존 reveal 동작을 호출한다. 높이는 공통 `editorBreadcrumbHeight`의 compact 22/normal 26을 쓰며 확대 UI 글꼴에는 최소 높이를 확보한다. 문제 수·이전/다음 문제·편집 버튼과 Markdown 미리보기 전환은 유지한다.
- IDEA 소스 gutter는 왼쪽 줄 번호, 변경/코멘트 표시, 탐색·HTTP·진단 마커 영역과 본문 경계선을 구분한다. 폭은 실제 글자 폭과 공통 `editorGutterInset`/`editorMarkerWidth`에서 계산한다. 본문 inset은 공통 `editorTextInset`을 쓴다. `textOrigin()`을 렌더링·클릭·드래그·댓글 들여쓰기·가로 스크롤 폭이 함께 사용하므로 시각 변경 후에도 같은 글자를 선택한다. codebench는 기존 폭·순서·12px inset을 사용한다.
- 기존 소스 행의 고정 h(codeFont().row)를 유지하며 본문·빈 영역·breadcrumb 배경과 현재 줄/줄 번호/경계에 공통 의미 색을 적용했다. 진단 우측 표시의 시작 위치도 breadcrumb metric을 따른다.
- `activity/editor.js`: IDEA 네이티브 편집기/뷰어의 상단 줄에 같은 compact/normal 높이와 작은 버튼을 사용한다. slot 파일은 실제 상위 경로를 문맥으로 표시한다. Markdown 미리보기 배경도 공통 editor 색을 쓴다. EditorState 생성·버퍼·수정 상태·저장·닫기·워크스페이스 버퍼 복원 코드는 변경하지 않았다.
- `check_editor_context.mjs`에 IDEA/codebench에서 클릭과 드래그가 같은 본문 원점을 사용하는 검사를 추가했다. `check_tabs.mjs`는 실제 `common.editorSnapshot`을 사용해 현재 파일·로컬/원격 머신·워크스페이스 경계를 검사한다.

## 검증

다음 검사는 종료 코드 0이다.

- `node --experimental-vm-modules design/idea/check_editor_context.mjs`
- `node --experimental-vm-modules design/idea/check_tabs.mjs`
- `python3 design/idea/sync_ui.py --check`
- `node --experimental-vm-modules design/idea/check_system.mjs`

네이티브 `herdr-app check mods/codenav; herdr-app check mods/activity` 호출은 macOS XPC 오류 로그 이후 10초 시점에 반환된 세션의 ID를 출력에서 누락했다. 따라서 성공으로 판정하지 않는다. 관찰된 해당 check PID 61480만 종료하려 했으나 환경이 `operation not permitted`로 거부했다. 이후 shell의 activity check 진행 여부와 세션 종료는 확인하지 못했다. 추가 네이티브 명령은 실행하지 않았다. 설치와 실제 화면/상호작용 검증은 부모 에이전트의 통합 단계에서 수행한다.

## 범위와 제약

통합 화면에서 숫자 line_height가 px가 아닌 배율로 적용되는 결함을 확인해 중복 line_height 호출을 제거했다. 주 에이전트가 수정 후 실제 첫 줄 정상 표시와 check_editor_context 통과를 확인했다.

참조 이미지는 직접 확인했다. 실제 설치 화면 검증 전이므로 픽셀 일치나 전체 UI 회귀 통과를 주장하지 않는다. 네이티브 EditorState 공개 API에는 gutter 폭·현재 줄/UI 배경·caret reveal 제어가 없어 그 내부 좌표와 그림은 손대지 않았다. 네이티브 편집기와 소스 뷰의 내부 gutter가 완전히 같다고 주장하지 않는다. 가짜 접기·inlay·code lens나 새 IDE 엔진 기능은 추가하지 않았다. 생성 디자인 파일은 직접 편집하지 않았으며 설치·커밋·하위 에이전트 생성은 수행하지 않았다.

## T04 후속: IDEA 내부 Outline·선택 액션 줄 제거

- IDEA에서 내부 Outline을 초기화하지 않으며, `outlinePanel()`도 레이아웃을 직접 검사해 오래된 `outline:true` 상태가 있어도 렌더링하지 않는다. 별도 Structure 도구 창과 File Structure popup 명령·심볼 게시 로직은 유지한다. codebench의 내부 Outline은 유지한다.
- IDEA의 평범한 단어·줄·범위 선택, 기존 note/hover 상태는 아래 Ln/Col·Copy·Comment·Close 액션 줄을 만들지 않는다. 일반 선택 시 화면에 표시되지 않을 hover 요청도 생략한다. 복사·댓글·탐색 키보드 및 context 명령과 명시적인 references/comment 패널은 유지한다.
- F1/Ctrl+J는 명시적인 문서 요청으로 구분한다. 기존 info 내용 영역에 문서 본문과 닫기만 표시하고 선택 액션 줄은 만들지 않는다. 닫기/Escape와 파일 변경은 명시 요청을 해제하고 늦은 응답은 기존 generation/context 검사로 차단한다.
- 사라진 액션 줄에만 표시되던 정의/관련 대상 없음·탐색 실패·저장소 밖 댓글 오류는 IDEA에서 기존 notify를 통해 표시한다. codebench의 기존 선택 줄과 일반 hover 동작은 유지한다.
- `check_editor_context.mjs`가 강제 `outline:true`, 오래된 note/hover, IDEA/codebench 렌더 분기, 일반 선택 요청 생략, F1/Ctrl+J, 명시 문서 닫기, File Structure 명령 및 실패 피드백을 검사한다. 기존 비동기 문서/워크스페이스 경계·선택 좌표·dirty 저장/닫기 검사도 유지한다.

T04의 `node --experimental-vm-modules design/idea/check_editor_context.mjs`, `node --experimental-vm-modules design/idea/check_tabs.mjs`와 세 변경 파일의 `git diff --check`는 종료 코드 0이다.

T04의 네이티브 CLI 검사·설치·실제 화면 검증은 이 작업에서 수행하지 않았다. 부모 에이전트가 통합 후 실제 Outline 미표시, 선택 줄 미표시와 명시 문서/댓글/참조 패널을 확인한다.

## T05 후속: gutter 경계선을 에디터 viewport 전체 높이로 확장

- IDEA 소스 행별 오른쪽 경계선을 제거하고 소스 스크롤 viewport를 감싼 요소가 경계선 하나를 소유하도록 했다. 위/아래 0의 1px 선이므로 짧은 파일의 마지막 줄 아래 빈 공간에도 이어진다. 현재 줄 배경이 선을 지우지 않도록 스크롤 내용 뒤에 그리며, pointer handler가 없어 클릭·드래그·선택을 소비하지 않는다.
- 경계선 x 좌표는 기존 gutter 끝 `gutter() - 1`에서 실제 가로 스크롤 `scroll.left`를 뺀다. viewport가 장식을 clip하고 gutter가 왼쪽 화면 밖으로 나가면 선도 생략한다. 세로 스크롤/행 수와 선 높이를 연결하지 않는다.
- gutter에 이미 예약한 폭과 `textOrigin()`은 그대로여서 본문·줄 번호·마커·클릭 좌표는 움직이지 않는다. Markdown rich view·codebench·리뷰와 공통 Scroller는 변경하지 않았다.
- `check_editor_context.mjs`에서 짧은 파일의 선 top/bottom/폭, 가로 이동·왼쪽 경계·화면 밖 생략, 세로 이동 독립성, 실제 소스 렌더 분기의 위치/clip/한 번 부착, pointer handler 없음, 행별 경계 제거와 본문 원점 보존을 검사한다.

T05의 `node --experimental-vm-modules design/idea/check_editor_context.mjs`는 종료 코드 0이다. 네이티브 CLI 검사·설치·커밋은 수행하지 않았다. 부모 에이전트가 실제 짧은 파일과 가로 스크롤 화면에서 통합 검증한다.
