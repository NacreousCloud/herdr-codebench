# T12 — 에디터·리뷰 정리 결과

`T12-spec.md`의 에디터 범위에서 `code.js`, `review.js`, `editor-model.js`와
기존 `check_editor_context.mjs`를 정리했다. `editor-surface.js`의 실제 공유
렌더링·거터 계약은 그대로 사용한다.

## 변경

- 소스·리뷰에 같게 들어 있던 정의 이동 클릭 판단을 순수 함수
  `definitionGesture(modifiers, idea)`로 합쳤다. IDEA의 Meta+Alt는 구현으로,
  Meta는 정의로 이동한다. codebench의 기존 Ctrl 클릭도 유지한다.
- 소스 클릭의 열 계산이 기존 `pointAt()`을 사용하도록 했다. 드래그와 클릭이
  같은 텍스트 원점·문자 폭·`offsetAt()` 계산을 사용한다.
- IDEA 소스 한 행의 geometry 계산을 3회에서 1회로 줄였다. 탐색 마커가 있는
  행의 배열 탐색은 최대 4회에서 1회로 줄였다. 마커 종류·툴팁·클릭 동작에는
  같은 마커 객체를 사용한다.
- 생산 코드에서 호출되지 않던 `gutterGuide()`와 geometry 접근용 얇은
  메서드 `lineNumberWidth()`, `textInset()`을 제거했다. 거터 검사는 실제 공유
  `editorGuide()`와 기존 viewport 부착 검사를 사용한다.
- 기존 미사용 import binding 4개(`settings` 두 곳, `openPath`,
  `openEverywhere`)와 wrapper 제거 후 불필요해진 `editorGuide` import를
  제거했다. codebench 전용 패널 안에서 도달할 수 없는 IDEA 조건식 9개를
  제거했다.

선택·문서 버퍼·비동기 세대·저장·Git 데이터·리뷰 구측/신측 상태는 각 뷰에
남겼다. 새 프레임워크나 공통 상태 계층을 추가하지 않았다. 네 소유 생산
파일의 합계는 작업 시작 1,966행에서 1,967행이다. 정리 수치는 제거한 중복
판단·미사용 메서드·불필요한 탐색/조건식 기준이다.

## 검증

다음 기존 검사 6개가 모두 통과했다.

- `check_editor_context.mjs`
- `check_editor_history.mjs`
- `check_review_navigation.mjs`
- `check_workspace.mjs`
- `check_actions.mjs`
- `check_keymap.mjs`

`check_editor_context`에는 두 레이아웃 × 수정키 8조합을 소스·리뷰의 실제
클릭 경로 양쪽에서 실행하는 검사를 추가했다. 총 32회 호출에서 기존
정의/구현/hover 판단을 확인했다. 기존 검사는 거터 원점·스크롤 클리핑,
Git 변경 막대, 구측/신측 줄 번호와 댓글, 명시적 문서/참조 패널, 키맵 변경,
늦은 응답 취소와 워크스페이스별 버퍼 보존도 통과했다.

범위 내 `git diff --check`가 통과했다. 이 작업에서는 앱 설치·재시작·native
check·커밋·push를 실행하지 않았다. 생성 파일과 전체 회귀 검사, 실제 UI 및
native 검증은 부모 통합 작업의 결과를 따른다.
