# T15 — Run Configurations 공통 시스템 적용

2026-11-03. `mods/codenav/run.js`의 idea 전용 구성 편집기를 공통 컴포넌트로 전환했다. 다른 레이아웃의 기존 renderer는 유지한다.

- `uiDialog(...).h(580)`으로 높이를 명시하고 flex 본문 안에 tree/fields를 배치한다. tree와 fields는 각각 `min_h(0)`와 세로 스크롤을 소유하여 긴 목록·큰 UI 글자에서 footer가 밀려나지 않게 했다.
- 입력은 uiInputBox, Add/Remove/Copy는 uiIconButton, 트리 행은 uiListRow, 하단은 uiButton을 사용한다. toolbar/caption/separator도 공통 소스를 사용한다.
- idea의 openRunConfigs에만 `frame:'none'`을 지정하여 자체 dialog와 이중 창 장식을 제거한다. Codebench의 기존 native frame 선택은 유지한다.
- init에서 프로젝트키와 machine/folder를 캡처한다. Apply/OK/입력 Enter는 처음 연 프로젝트키에 저장하고 기존 저장 객체의 다른 필드를 보존한다. dialog가 열린 동안 다른 space로 바뀌어도 새 프로젝트의 구성을 덮어쓰지 않는다.
- 활성 프로젝트가 달라졌을 때 Run을 비활성화하고 돌아오라는 문구를 표시한다. action에서도 프로젝트키를 다시 검사한다. 원래 실행/재실행/정지/환경 명령 전송 로직은 변경하지 않았다.
- Escape/Cancel은 닫기만 수행한다. Apply는 dirty일 때만 활성화하고 저장 후 dirty가 해제된다. OK/입력 Enter는 저장 후 닫는다. 구성이나 command가 없을 때 Run, 구성이 없을 때 Remove/Copy를 비활성화한다.

검증: `node --check run.js` 및 `git diff --check` 통과. Node mock에서 layout별 frame, 초기/dirty/저장후 Apply 비활성, Cancel 무저장, 프로젝트 변경 후 원래 키 저장/기존필드 병합/다른키 보존, 교차프로젝트 Run guard, 입력 Enter 저장·닫기, 빈 구성 Run 비활성, add/copy를 확인했다. run/hc/exec는 호출 시 실패하는 spy로 대체했으며 실제 외부 실행은 없었다. 실제 앱의 구성 편집기 기하·포커스·키 입력은 root의 CU 검증 대상이다.
