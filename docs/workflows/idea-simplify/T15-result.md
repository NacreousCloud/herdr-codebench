# T15 — 진단 공유 정리 및 커밋/푸시

- 실행 모드: 구현. 사용자가 현재 변경의 정리·커밋·푸시를 허가했다.
- 범위: T13/T14 미커밋 변경을 보존하고 진단 공유의 중복 후보 조회/첨부 명령 조립을 단순화한다. 새 기능/의존성을 추가하지 않는다.
- 지속 원칙: 저장소 AGENTS.md에 모든 변경의 YAGNI/KISS/DRY를 명시한다.
- 계약: AI 후보 1개는 직접 첨부, 여러 개는 선택 메뉴, 원문·머신/작업공간 경계·Status task 소유·Enter 전송 없음은 유지한다.
- 검증: 기존 21개 JS 검사, 생성물 일치, diff 검사, 변경 모드의 native check 및 실제 화면. 검증 후 idea-ux에 커밋/푸시하고 원격 HEAD를 확인한다.
- 위임: 명확한 진단 코드 범위의 독립 읽기 전용 검토를 medium으로 위임한다. parent가 구현과 결과를 검토한다.

## 결과

- YAGNI: production에서 한 번만 쓰이며 native 후보 목록을 다시 읽던 `defaultDiagnosticTarget`을 제거했다. 새로운 범용 selector/dispatch 계층은 만들지 않았다.
- KISS: `handleDiagnosticAttachment`가 동일한 후보 snapshot으로 없음/단일/다중 분기와 popup 크기를 결정한다. 실제 첨부 실행 직전/대기 후 재검증은 유지했다.
- DRY: picker와 카드가 `requestDiagnosticAttachment`의 명령 직렬화와 실패 알림을 공유한다. diagnostic model/actions/UI의 서로 다른 책임은 억지로 합치지 않았다.
- 독립 검토: diagnostics_refactor_review, medium, 읽기 전용. 추가 결함이나 의미 있는 중복 없음. parent가 실제 diff와 기존 계약을 검토했다.
- AGENTS.md에 모든 변경의 YAGNI/KISS/DRY 원칙을 기록했다.
- 앱에 바뀐 2개 모듈을 배치 설치하고 백업했다. 실제 화면의 Problems/물결 밑줄을 확인했고 status.errors=[]이다. 앱/코어/사용자 세션을 재시작하지 않았다.

## 검증 및 전달

- 21개 JS 검사, sync_ui --check, git diff --check 통과. 기존 대상 선택 검사가 후보 조회 1회와 명령 경로 통합을 확인한다.
- 지원되는 hc worker t2k에서 저장소 codenav/activity와 설치본 codenav/activity native check 모두 exit 0, stderr 없음(0.37/0.22/0.29/0.22초). 종료한 worker는 제거한다.
- Go/엔진/바이너리는 바뀌지 않아 해당 검사를 반복하지 않는다. T14의 실제 텍스트 드래그/AI draft 검증 제약은 그대로다.
- 검증을 마친 T13/T14/T15 변경과 근거를 함께 idea-ux에 커밋하고 origin/idea-ux로 push한다. 전달 결과는 Git HEAD와 원격 ref로 확인한다.
