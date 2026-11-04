# T12 — YAGNI/KISS/DRY 정리 및 통합

## 변경

- YAGNI: 현재 Go 클라이언트에서 실행하지 않는 Python LSP 서버와 그 대체 탐색 구현을 제거했다. 구 helper를 정확히 식별해 종료하는 안전 장치는 유지한다. 사용하지 않는 import·wrapper·설정 상태·팝업 함수를 제거했다.
- KISS: 상태바의 직접 명령과 터미널 단축키가 동일한 화면 열기 경로를 사용한다. 설정 화면은 불필요하게 모듈을 쪼개지 않고 임시 상태와 반복 후보 계산을 줄였다.
- DRY: 소스·리뷰의 수정키 정의 이동 판단, 클릭 좌표 계산, LSP 설치 가이드의 버튼/요청 조건을 공통화했다. 소스 행별 geometry와 탐색 마커 조회를 한 번씩 수행한다.
- 설정 CAS, 요청 세대 취소, 문서 버퍼·저장, 구측/신측 리뷰 상태는 기존 책임 경계에 유지했다. idea와 codebench의 서로 다른 키 입력 규칙도 보존했다.
- HANDOFF의 오래된 구현·배포 설명을 현재 Go 엔진/설치 가이드 기준으로 정리했다. 기존 세션의 UI·키맵·편집기·툴 창 작업과 관련 근거 문서도 사용자 요청에 따라 통합 커밋한다.

담당별 근거: [편집기](T12-editor-result.md), [명령/설정/가이드](T12-state-result.md), [구 LSP 제거](T12-legacy-result.md).

## 검증

- `design/idea/check_*.mjs`: 19/19 통과. 실제 소스/리뷰 클릭 경로의 32개 레이아웃·수정키 조합도 통과했다.
- `python3 design/idea/sync_ui.py --check`, `check_system.mjs`, `git diff --check`: 통과. 생성 파일은 정본에서 일치한다.
- `cd engine && go test -race ./...`, `go vet ./...`: 통과. 부모 선언이 해석되지 않을 때 추측한 이동 결과를 반환하지 않는 회귀 검사 한 개를 추가했다.
- `python3 engine/check_release.py`: 여섯 바이너리 checksum/source identity와 현재 darwin/arm64의 version·HTTP auth·Spring DI/keys·owned shutdown 통과. 생산 Go 소스 digest와 기존 바이너리는 변경하지 않았다.
- 새 API 계약이나 Postman 자원은 추가하지 않았다. 이번 삭제는 사용하지 않는 Python 구현이며 현재 Go HTTP 계약은 그대로다.

## 앱 반영과 제약

변경 파일 12개를 한 번에 설치했다. 기존 설치에만 남아 있던 관리 대상 Python 파일 두 개는 `data/native-ide-backups/t12-20261104-171551`로 백업 이동했다. 로컬 서버 설정·사용자 레이아웃·키맵·터미널 데이터는 변경하지 않았다. 최종 앱 status는 errors=[]/overlays=[]이며 작업 전 space/tab/focus가 유지됐다.

`herdr-app check`는 codenav/activity 모두 제한 시간 내 완료되지 않았다. 갤러리 열기 명령과 overlay 상태는 응답했지만 shot은 이전 프레임을 반환했고 native 창 연결은 cgWindowNotFound였다. 새 화면 렌더링과 긴 메뉴의 실제 키 입력은 이번에 검증하지 못했다. 이를 통과로 기록하지 않는다. 앱 재시작이나 다른 사용자 세션 중단은 하지 않았다.

## Git

취소된 대용량 런타임을 재도입하지 않았다. 신규/수정 텍스트의 자격 증명 패턴 및 파일 크기를 검토했고 2MB 초과 파일이 없다. origin/idea-ux가 기존 추적 SHA와 같은 것을 확인했다. 일반 커밋·push만 사용하며 강제 push와 전역 계정 전환은 하지 않는다.
