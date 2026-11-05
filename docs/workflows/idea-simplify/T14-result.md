# T14 — Problems 목록 겹침과 진단 공유 액션

## 구현 범위

- TypeScript overload 메시지의 명시적 개행이 고정 높이 행을 넘쳐 그려지는 원인이었다. 목록은 첫 비어 있지 않은 줄의 한 줄 요약/ellipsis/clip으로 표시하고 원문은 유지한다.
- source 진단 카드와 Problems hover 카드에서 실제 native selectable TextView를 사용한다. 타입 문법을 HTML escape하고 개행을 보존해 텍스트 드래그 선택과 복사를 지원한다. 텍스트 mouse-down/click 전파를 막아 부모 Problems 목록의 focus/파일 열기가 선택을 방해하지 않게 했다. 행 선택/파일 열기는 아이콘·줄 번호 영역에서 유지한다. 파일 drag/drop을 복원하지 않는다.
- 카드에는 복사/AI 첨부 버튼, Problems 각 행에는 복사/AI 버튼을 추가했다. shared header.Problems registry에는 표시된 문제 전체 복사/AI 첨부를 추가했다. 명령은 실제 Problems 소유 뷰가 현재 File/Project 범위와 Errors Only 필터로 평가한다.
- 복사/첨부에는 머신, 전체 경로, 실제 줄/열 범위, 출처, 진단 코드, 전체 메시지를 넣는다. 프로젝트 범위는 열린 파일에서 알려진 진단이며 다른 workspace 진단을 섞지 않는다. 메시지의 일부를 조용히 잘라 내지 않는다.
- AI가 하나면 해당 AI, 여럿이면 명시적 선택 메뉴를 사용한다. 작업공간/머신/대상 pane·tab/상태와 실제 포커스·클립보드를 재검증한다. 카드나 선택 메뉴가 닫혀도 Status가 붙여넣기 task를 소유한다. 선택 중 원래 workspace가 바뀌어도 취소한다.
- 첨부는 AI 입력창에 paste하는 동작이다. Enter나 hc send를 호출하지 않고 사용자가 내용을 확인해 전송한다. 실제 사용자 AI에 검증용 텍스트를 보내지 않았다.

공통 UI/owner routing은 parent가 구현했고 문서 기반 개발 스킬의 계약·파일 범위에 따라 model/actions만 medium 설정의 하위 에이전트에 맡겼다. [actions 검토 근거](T14-actions-result.md)를 읽고 실제 구현 및 테스트를 통합했다.

## 검증

21개 JS 검사, sync_ui --check, git diff --check 통과. 토큰/진단 행마다 전체 native 대상 목록을 다시 읽지 않도록 프레임당 eligibility/space snapshot을 재사용하는 검사도 통과했다.

- 실제 canonical 컴포넌트: 한 줄 요약과 전체 메시지 분리, HTML/type syntax escape, native selectable 설정.
- 실제 Problems 소비자: 여러 줄 overload 요약·고정 행 clip, 항목별 액션과 실제 owner의 전체 복사/첨부, File/Project/Errors Only와 namespace 경계.
- 실제 Status 소비자와 UI coordinator: 전체 JSON payload 보존, 영구 task owner, 대상 선택/닫힌 popup, 올바른 메뉴 아이콘 factory 및 stale workspace.
- 실제 actions 함수: 200,000자·Unicode·CRLF 원문, native clipboard, shell/blocked/error 제외, 원격 머신, stale pane/tab/focus/clipboard, 중복 작업과 submit 없음.

앱에 12개 변경 소스를 배치 설치했다. 실제 bar.js의 진단 12개가 한 줄씩 겹치지 않고, 항목별 버튼과 header 전체 버튼이 표시되는 것을 캡처해 확인했다. 확인을 위해 일시 확장한 하단 패널은 원래 weight로 복원했다.

## native 검사 복구 및 실제 복사 확인 (재개)

direct `herdr-app check`는 최소 정상 모드, 잘못된 JavaScript, 존재하지 않는 디렉터리에서 모두 검증 출력 전에 멈췄다. stderr의 HIServices XPC `Connection Invalid`, LaunchServices `_LSModifyNotification ... error -50`은 이 실행 환경의 native 초기화 문제를 가리킨다. 정확한 OS 원인은 process sampling이 불가해 확정하지 않는다.

문서 기반 개발 스킬에 따라 읽기 전용 감사/검사 실행을 native_check_audit에 위임했다. `hc --skill`에 문서화된 숨겨진 worker는 로그인 세션 환경에서 실행하므로, 앱/코어 재시작 없이 다음 최종 검사를 통과했다. worker t2j는 정상 종료 후 제거했다. 새 탭/패널/설정은 만들지 않았다.

| 대상 | 모드 | exit | 소요 |
| --- | --- | --- | --- |
| 저장소 | codenav | 0 | 0.28초 |
| 저장소 | activity | 0 | 0.22초 |
| 설치본 | codenav | 0 | 0.26초 |
| 설치본 | activity | 0 | 0.22초 |

각 명령은 `check passed: <absolute mod path>`와 빈 stderr를 반환했다. selectable 이벤트 교정 후 21개 JS 검사, 생성물 일치, diff 검사도 통과했다. native check는 초기 eager 렌더링 검사이며 포인터/후속 async 입력 성공을 증명하지 않는다.

실제 herdr-codebench 작업공간의 bar.js Problems를 열고 `herdr-app do codenav.problems-copy-all`을 실행했다. 지원되는 hc exec에서 macOS pbpaste 결과를 확인한 값은 진단 12개, 3,915자이며 `Overload 2 of 2`와 `NativeElement` 상세를 포함했다. 출력에는 전체 진단/기존 클립보드 내용을 노출하지 않았다. 복사 성공은 실제 Problems owner→native clipboard 경로의 확인이다. 최종 화면에서 목록 겹침과 gutter dot 없이 물결 밑줄이 유지되고 status.errors=[]임을 확인했다. 잠시 연 Problems와 작업공간 선택은 원래 상태로 복원했다.

## 남은 native 입력 검증 범위

후속 갤러리 확인 중 앱 status가 `mod codenav: reloading ... out of memory`를 반환했다. 초기 설치 직후 errors=[]였으며 목록/버튼은 새 화면으로 확인됐지만 반복 HMR 후 현재 재로딩은 실패한다. 앱/코어를 임의 종료하지 않았고 갤러리 overlay만 닫았다. 안전한 mod reload 명령은 현재 Herdr command 목록에 없다. Herdr CLI 가이드가 실행 앱 재시작을 금지하므로 사용자에게 앱만 재시작할 승인 여부를 물었다. 그 뒤 작업공간이 바뀐 상태에서 오류 목록이 errors=[]로 돌아왔고 최종 갤러리도 정상 렌더링됐다. 복구 원인을 임의로 앱 재시작이라고 단정하지 않는다. 에이전트가 앱/코어를 재시작한 사실은 없으며 추가 재시작 작업은 하지 않았다.

최종 갤러리에서 selectable 메시지와 경로, 복사/AI 버튼 footer가 있는 카드가 정상 표시되는 것을 캡처했다. 전체 복사는 위 실제 명령으로 검증했지만 포인터로 누른 카드/행 버튼, 텍스트 드래그 선택, AI 입력창 paste는 native 입력 성공으로 주장하지 않는다. 설치된 `herdr-app --skill`이 실제 사용자 display에서 pointer/key 실험을 금지하므로 자동 포인터 입력을 하지 않았다. 실제 사용자 AI에 검증 텍스트를 붙여 넣거나 보내지 않았다. native terminal.paste는 대상 인자·완료 receipt가 없어 JavaScript의 마지막 포커스 확인과 host 실행 사이의 원자성을 보장하지 못한다. [actions 결과](T14-actions-result.md)의 host 제약을 유지한다.
