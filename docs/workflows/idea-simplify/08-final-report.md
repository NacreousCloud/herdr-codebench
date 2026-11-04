# 최종 보고

- 실행: 구조 정리를 선행한 구현 모드.
- 상태: 구현·설치 및 확인 가능한 회귀/화면 검증 완료, 전체 검증은 부분 완료.
- [진행 인덱스](00-progress.md), [계약과 계획](plan.md), [변경 및 검증 근거](results.md).

레이아웃 탐색/파일 탭 ID/설정 CAS retry를 공통화했고 툴 상태/레이아웃 명령을 화면에서 분리했다. 이어 툴 위치 설정 겹침, 하단 상태 영역 사이 간격, 편집기 탭/경로/거터/본문 간격, Project 루트/경로/계층선을 수정하여 Herdr에 적용했다.

check_*.mjs 14개와 sync_ui --check, whitespace 검사를 통과했다. 소스 첫 줄이 가려지는 native line_height 배율 오류를 실제 화면에서 발견·수정 후 재확인했다. 설정 화면/편집기/트리/공통 갤러리를 실제로 확인했고 최종 app status는 errors=[]/overlays=[]였다. 중간 IPC 단절은 일반 앱 실행 후 복구됐다.

남은 검증: 환경 XPC 오류/timeout으로 native herdr-app check는 통과하지 못했다. 실제 긴 메뉴 키보드/포인터와 모든 UI 글꼴·밀도 조합은 미확인이다. 네이티브 EditorState 내부 gutter 제어는 공개 API 범위 밖이며 버퍼/저장 동작은 변경하지 않았다. 전체 IDEA 기능·픽셀 일치를 주장하지 않는다.

다음 행동은 사용 가능한 환경에서 native check 및 실제 입력 검증을 수행하는 것이다. 이 제약을 구현 미적용으로 혼동하지 않는다. Herdr 본체/개인 키/레이아웃 파일은 수정하지 않았다.

## T04 후속 적용

도구 drag/drop, IDEA 내부 Outline, 평범한 선택의 하단 액션 줄을 제거했다. 실제 보이는 stripe upper/lower 그룹에 separator를 추가했고 폴더 클릭의 stale tool drag 차단 및 닫히는 메뉴에서 picker를 실행하던 경로를 수정했다. 14개 회귀 검사 통과 후 설치했고 실제 화면에서 제거된 영역과 구분선을 확인했다. errors=[]다. Native check는 양쪽 mod 모두 XPC timeout으로 미통과이며, 네이티브 선택기에서 실제 폴더를 골라 space가 열리는 왕복은 미확인이다. 상세 근거는 results.md의 T04에 있다.

## T05 후속 적용

다른 workspace/repo Review 상태로 마지막 보이는 탭을 닫지 못하는 경로와 닫은 후 숨은 Review를 자동 선택하는 경로를 고쳤다. empty island 복구와 orphan native 상태 routing도 교정했다. 거터 선은 viewport 바닥까지 이어진다. 사용자 후속 지시에 따라 Shift 두 번 기본값은 제거하고 ⌘⇧Space로 검색을 연다. 개인 키맵을 보존하는 설치 migration을 적용했다. 회귀 14개/sync/whitespace 검사 통과 및 native 화면 확인 범위와 미확인 입력은 results.md에 구분했다. Native check는 여전히 XPC timeout으로 미통과다.

## T06 후속 적용

위치별 툴 목록과 순서/이동/표시 편집, 파일 DnD/안내/ghost 제거, 실제 공통 소스·리뷰 표면, 키맵 추가/변경/제거/terminal scope와 CAS 저장, 문맥별 CmdShiftO(terminal files vs editor Go to File), 빈 editor canvas corner cutout을 구현·설치했다. 회귀 15개와 sync/whitespace 통과. 실제 위치별 설정/리뷰/터미널 파일 창을 확인했다. 전체 native check 및 미확인 pointer/키맵 저장/zero-tab 코너 확대는 results.md에 남겼다.

## T12 구조 정리 및 저장소 통합

Go 엔진으로 이미 전환된 Python LSP 구현을 제거하고, 소스·리뷰의 정의 이동 판단과 클릭 좌표 계산, 상태바 명령 실행, 설치 가이드 요청 조건을 공통화했다. 사용하지 않는 import·wrapper·설정 상태와 도달 불가능한 분기를 제거했다. 기존 UI 작업과 언어별 설치 가이드를 함께 커밋하는 범위다.

19개 JS 검사, 생성물 동기화, Go race/vet, 여섯 바이너리 검증과 현재 호스트의 실제 엔진 smoke가 통과했다. 앱에 변경 파일 12개를 배치 반영하고 구 Python 파일 두 개를 앱 외부 백업 디렉터리로 옮겼다. status.errors=[]와 overlay 원상복구를 확인했다. 현재 native check는 timeout이고 창 연결/새 프레임 확인이 되지 않아 이번 화면 검증은 미완료다. 상세 근거는 [T12 결과](T12-result.md)에 있다.
