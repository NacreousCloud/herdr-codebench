# T16 — Activity 공통 컴포넌트 적용

2026-11-03. 소유 파일 `mods/activity/{files.js,search.js,fileops.js}`의 렌더링·메뉴만 변경했다. 설치·앱 조작·커밋은 하지 않았다.

- Files의 IDEA 파일 행은 `uiListRow`를 사용한다. 선택 집합은 selected, 트리 focus handle은 focused, depth는 indent 역할에 연결한다. cut 투명도·git 상태 글자색·열린 파일 강조·재귀 순서와 flat 배열을 유지하며 기존 click/다중 선택/right menu/drop callback을 그대로 연결했다. root의 init/명령 루프와 헤더 변경은 건드리지 않았다.
- Search의 IDEA 검색 필드는 `uiInputBox`로 focus 역할을 공유한다. 파일 제목·검색 결과는 `uiListRow`로 구성하고 열린 editor의 파일/줄 선택과 결과 focus handle을 연결한다. 제목 접기와 파일/줄 열기 동작은 유지한다. 추가 focus handle은 release에서 반환한다.
- FileMenu의 IDEA 분기는 `MenuController/uiMenu`로 전환했다. 공통 ↑↓/Home/End/PageUp/PageDown/Enter/Esc와 선택 스크롤을 사용하며, 최대 400px에서 메뉴 목록이 스크롤한다. 빈 clipboard의 Paste는 disabled로 전달하고 action callback, overlay 닫기, controller release를 연결했다.
- FilePrompt의 IDEA 분기는 `uiDialog/uiButton/uiInputBox`를 사용한다. 기존 요청·검증·확인/취소·Enter/Esc 처리와 overlay 크기를 보존한다. 입력 오류는 공통 error 역할에 연결한다.
- codebench는 기존 행·입력·메뉴·대화상자 렌더 분기를 보존한다.

검증: 변경한 3개 JS의 `node --check`가 통과했다. 실제 source 메서드/모듈에 element proxy를 주입한 mock으로 Files의 재귀·flat 목록·들여쓰기·선택·비활성 focus·click, Search의 input focus·선택된 hit·들여쓰기·파일/줄 열기·접기, FileMenu의 disabled Paste·copy action·overlay 닫기·controller release·높이 상한 및 codebench 분기, FilePrompt의 shared delete dialog 호출을 확인했다. 모두 통과했다.

mock은 실제 GPUI 기하·포커스 전환 redraw·native input 이벤트·drag/drop 전달·virtual menu 스크롤을 실행하지 않는다. 해당 동작과 긴 파일명/오류 문구의 실제 레이아웃은 root의 설치 후 앱 확인 범위다.
