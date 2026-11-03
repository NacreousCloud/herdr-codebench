# T05 결과 — 검토 대기

담당: 위임된 구현 에이전트, 환경 기본 모델/추론 설정. 별도 override 또는 하위 에이전트를 사용하지 않았다.

## 변경 파일과 구현

- `mods/codenav/agents.js`: Herdr `~/.config/herdr-app/mods/agents/main.js`를 출처 주석과 함께 개인 codenav view로 복제했다. View 상속을 제거하고 `init(p,cx)`/`render(cx)`를 사용한다. 부모/자식 urgency, 자식 error/Done 처리, 현재 보고 있던 Done 유지, 핀과 pending pin 마이그레이션, 원격 주소, 이름 있는 탭과 동적 제목, priority/grouped 정렬, 그룹 접기, 자식 peek, `setAgentOrder`를 보존했다. localStorage는 `idea-agents.changed`/`idea-agents.pins`를 사용한다.
- Agents 내부 중복 제목과 sidebar 폭/접기 동작을 제거했다. 완전한 목록을 표시하고 요약과 정렬 컨트롤만 둔다. 공통 UI 글꼴/배율·섬 표면·24px 행·4px 선택 모서리/목록 inset을 사용한다. 정렬 팝업은 `codenav`, `{view:"agents",sortMenu:true}`로 열고 위/아래/Enter/Esc를 처리한다.
- `mods/codenav/newterminal.js`: 기본 `new-menu/main.js`의 machine별 knownAgents 캐시/조회·설치 판정·숫자 단축키·Terminal/New space/worktree 명령을 보존한 개인 view다. 공통 popupSurface, UI 배율, 24px 행, 둥근 선택과 아이콘 간격을 사용한다. 선택 가능한 항목에 위/아래/Enter/Esc를 적용하고 미설치 항목은 선택에서 제외한다. 설치 상태 확인 중/조회 실패/빈 결과를 표시한다. 원격 agent는 활성 space와 원래 argv로 실행한다. space가 없으면 worktree 클릭/키보드 실행을 비활성화한다.

main.js, tools/layout 연결, 설치 및 앱 조작은 상위 담당 범위여서 수정/실행하지 않았다.

## 확인한 API

`~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`의 `AgentInfo`, `agents`, `terminals`, `setAgentOrder`, `knownAgents({on})` 및 기본 두 모드를 확인했다. 기본 모드 파일은 읽고 복제만 했으며 수정하지 않았다. 키보드는 기존에 확인한 gpui focus_handle/track_focus/on_key_down 계약을 따른다.

## 실제 실행 검증

- 신규 두 파일 각각 `node --check`: 통과.
- `git diff --check`: 통과.
- Node VM에서 요소와 Herdr API를 stub으로 대체하여 실행한 로직 smoke 검증: 빈 Agents render, 자식 blocked가 부모 우선순위에 반영됨, 보고 있던 Done→idle 유지, 정렬 메뉴 키보드 변경, 원격 knownAgents 대상과 agent 숫자/Enter 실행 인수, space 없는 worktree 제외, Esc 닫기: 통과. 이 검사는 실제 앱/네트워크 실행이 아니다.

## 미확인과 상위 검토

Herdr CLI check·설치·실제 화면·실제 agent 생성/원격 연결·핀 응답·worktree 다이얼로그는 실행하지 않았다. root의 view 등록과 레이아웃 연결 후 실제 모서리/스크롤/키보드 전달 및 관련 기능의 통합 검증이 필요하다. 실제 화면 수용 기준을 완료로 보고하지 않는다.

상위 검토: 대기.
