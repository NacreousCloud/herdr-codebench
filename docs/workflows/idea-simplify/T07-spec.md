# T07 — 편집기와 chrome 정렬, 단일 사용자화 트리

최신 사용자 첨부 화면을 기준으로 구현한다. 기존 미커밋 변경 및 codebench 동작은 보존한다.

- E1 편집기: 상단 일반 눈 아이콘 제거. Markdown preview는 하단에서만 조작한다. Git 변경 마커는 줄 번호/이동 아이콘과 분리해 거터 오른쪽에 좁고 둥근 세로 막대로 표시한다.
- C1 chrome: 양쪽 stripe 버튼의 좌우 여백 대칭, 프로젝트/branch 등의 툴바 수직 중앙 정렬, 위 섬 아래 불필요한 밝은 선 제거. 실제 layout 크기/표시/터미널 데이터는 유지한다.
- S1 설정: 별도 windows 페이지를 메뉴 및 도구 모음에 통합. Main Toolbar > Left/Center/Right, Tool Windows > 위치 > 도구, 헤더/컨텍스트 그룹을 하나의 펼침 트리로 표시한다. 기존 add/icon/up/down/remove/restore와 도구 이동/표시/순서 draft를 재사용한다. 검색/키보드 이동, Apply/Cancel 및 동시 무관 설정 보존을 검증한다. 기존 windows 명령 진입은 통합 트리의 Tool Windows를 선택한다.

분담: 기존 editor_layout 담당은 code/tabs/editor-surface/activity editor 및 관련 검사; shift_audit 담당은 tools/islands/canonical ui.js 및 chrome 검사; parent는 settings/i18n/설정 검사/문서/생성/설치 통합. 기존 high 설정을 재사용하며 공통 기하·상태 보존 때문에 유지한다. 파일 소유권을 교차 수정하지 않는다. 별도 엔진/API/본체 수정은 범위 밖이다.

검증: shared generation/check, 관련 VM 회귀 및 전체 기존 검사, git diff --check, bounded native mod check, 배치 설치 후 실제 screenshot/status 및 갤러리 확인. native check 기존 XPC 제한은 통과로 기록하지 않는다. 실제 포인터/키 입력이 불가하면 별도 제약으로 기록한다.
