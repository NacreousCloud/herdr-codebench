# T02 — 구현 결과

## 추가 검토 — 실제 사용자 키맵 정합

- `design/idea/keymap.json`에서 관련 action만 추출해 확인했다. SaveAll Ctrl+S, RenameElement Shift+F6, CopyPaths Ctrl+Shift+C, CopyReference Ctrl+Alt+Shift+C, Cut/Copy/Paste Ctrl+X/C/V와 Shift+Delete/Ctrl+Insert/Shift+Insert, Delete Delete/Backspace/⌘Backspace, SafeDelete ⌘Delete다. SaveDocument 항목은 없다.
- idea 파일 트리에 이 별칭을 기존 작업으로 연결했다. Ctrl+Shift+C는 일반 Copy보다 먼저 처리해 절대 경로를 복사하고, Shift+Delete는 삭제보다 먼저 Cut으로 처리한다. 기존 F2/경로 복사 별칭도 보존했다. codebench는 원래 분기를 유지한다.
- idea 파일 메뉴의 Rename 힌트는 ⇧F6, Copy Path는 Ctrl+Shift+C로 표시한다. Copy Relative Path의 Ctrl+Shift+Alt+C는 실제 CopyReference 조합과 동일하다. 기존 Save 툴팁/미저장 안내 Ctrl+S는 추출 키맵과 일치해 유지했다. root는 Cmd+S 별칭 추가를 취소했다.
- idea 파일 메뉴는 첫 항목을 선택하고 다음 timer에서 포커스를 재획득한다. ↑↓/Enter/Esc 처리 시 전파를 차단해 부모 트리의 파일 열기/선택으로 전달되지 않게 했다. native 포커스 API와 기존 키 이벤트만 사용했다.
- `/private/tmp/herdr-activity-keys-check.mjs` VM 검사 통과: 별칭·경로 복사 우선순위·codebench 기존 동작·메뉴 포커스·↑↓ 순환·Enter 첫 항목 실행·Esc 닫기. 변경 files.js/fileops.js와 editor.js 문법 검사 및 diff 검사 통과. 실제 앱 키 전달은 미검증이며 설치/CLI/앱 조작은 하지 않았다.

상태: 검토 대기. 구현 담당은 하위 에이전트이며 별도 모델 재지정 없이 부모 실행 설정을 상속했다. 명세의 effort는 medium이고 이 작업에서 하위 에이전트를 추가하지 않았다.

## 수정 파일

- `mods/activity/files.js`: idea Project 표면과 시스템 UI 글꼴·크기, 24px 트리 행 및 4px 인셋 선택, 선택 위 hover 색 보존, 실제 대소문자의 프로젝트 루트 이름, 오류/빈/로딩/제한 상태 정리.
- `mods/activity/search.js`: idea Find의 중복 제목 제거(외부 툴 윈도우 제목 사용), 입력 테두리·28px 컨트롤·24px 결과 행·16px 파일 아이콘·선택 인셋·UI 크기 통일. 기본 빈 안내와 오류 색 역할 적용. Clear 또는 빈 query가 이전 검색을 무효화하도록 seq를 증가시키고 loading을 해제한다. 이 동작 변경은 상위 요청으로 포함했다.
- `mods/activity/editor.js`: idea 헤더 32px, 파일명/보조 경로 구분, 에디터 빈 안내와 오류 색, 기본 버튼 높이, EditorState의 Islands 문법색 및 사용자 코드 글꼴 크기 적용. 읽기 전용 diff의 글꼴 크기와 가상 행 높이를 함께 조정한다.
- `mods/activity/viewer.js`: 이미지/PDF 주변을 island 표면으로 통일, 확대 컨트롤/정보 UI/외부 열기 버튼의 UI 크기 및 공통 컨트롤 역할 적용.
- `mods/activity/fileops.js`: 파일 메뉴·다이얼로그에 popupSurface, 24px 메뉴 행·16px 아이콘·선택/컨트롤 radius 적용. UI 글꼴 확대 시 이름/삭제 다이얼로그 크기도 확대한다. 팝업 행 5px, 다이얼로그 내용 18px 안쪽 배치로 모서리 clipping에만 의존하지 않는다.

## 보존 및 범위

- idea 분기 밖 codebench의 배경·행 높이·크기·컨트롤 형태를 유지한다. uiSize/ideaUI/popupSurface는 idea 밖에서 원래 값을 유지한다.
- 파일 작업·드래그·선택·열기·키맵·원격 전송·미디어 변환·저장·Markdown preview의 실행 경로는 유지한다.
- 검색 Clear/빈 query의 오래된 결과 재등장만 승인된 동작 수정으로 포함한다. 검색 도구 선택, 결과 파일·줄 좌표, 오류 원문을 유지한다.
- 외부 섬의 상하 모서리는 T01 레이아웃 보호 영역에서 담당한다. root radius가 자식 배경을 자른다는 가정을 추가하지 않았다. 트리/검색 선택 배경은 외곽에서 4px 안쪽이다.
- 새로운 영어 안내문 번역 키 추가는 root 소유 i18n 작업으로 요청했다.

## 실제 검증

- 변경한 5개 JS 파일 각각 `node --check` 통과.
- `git diff --check` 통과.
- 일회성 Node VM 상태 검사 통과: 이전 검색 실행 중 빈 query로 초기화한 뒤 이전 응답이 도착해도 결과가 재등장하지 않음; 정상 응답의 파일/줄 7 좌표 유지; 검색 도구 오류의 원문 및 loading 해제 유지. UI/검색 엔진을 대체한 상태 검사이며 실제 rg·파일 열기 성공을 증명하지 않는다. 테스트 파일/의존성은 추가하지 않았다.
- `mods/activity/gpui-kit.d.ts`의 EditorState 생성 옵션(font_family/font_size/syntax)과 rounded/overflow API를 확인했다.

## 미확인 및 후속

- 설치·Herdr CLI·앱 조작·화면 캡처·커밋·푸시는 지시에 따라 실행하지 않았다. 정상/빈/오류 화면의 실제 모서리, 표시 크기, popup 배치, 글꼴/언어 전환, 파일 열기·접기·검색·저장·PDF 확대의 실제 앱 검증은 T01 통합 단계에서 필요하다.
- native EditorState는 생성 시 글꼴/문법 옵션을 받으며 현재 공개 API에는 해당 옵션을 갱신하는 메서드가 없다. 코드 본문 글꼴은 다음 파일 로드 시 반영된다. UI 크기/글꼴은 렌더링 시 공통 helper를 통해 반영된다.
- 새로운 안내문과 일부 기존 영어 fallback의 한국어 번역은 root에게 요청했다.
- R01·R02·R03·R04의 T02 코드 반영은 구현했고, R05의 분기 보존은 diff로 검토했다. 실제 화면/동작 증거인 R06은 미완료이므로 전체 완료로 판정하지 않는다.
