# T05 — Agents와 새 터미널/에이전트 선택

R02/R03/R04. 기존 Agents와 new-menu는 Herdr 기본 모드여서 현재 idea 컨테이너 안에서도 중복 제목·서로 다른 UI가 남는다. 기본 모드 파일을 직접 수정하지 않고, ~/.config/herdr-app/mods/agents/main.js와 new-menu/main.js의 동작을 참고/복제한 개인 구현을 codenav 안에 둔다. 자체 모드 복제·수정은 Herdr AGENTS 지침상 허용된다.

수정 범위: mods/codenav/agents.js, mods/codenav/newterminal.js 신규 두 파일과 results/T05-result.md. root가 main.js의 view agents/newterminal을 연결하고 TOOLS.agents content 및 터미널 + 메뉴를 변경한다. 다른 파일은 수정하지 않는다.

일반 구현 클래스(export default class, View 상속 없음), init(p,cx), render(cx) 인터페이스. sortMenu와 overlay props가 필요하면 p와 herdr props를 사용한다. 기본 모드의 부모/자식 agent urgency·핀·Done 유지·탭 이름·그룹·정렬·setAgentOrder 의미를 보존한다. collapsed는 다른 sidebar 폭을 보지 말고 이 tool이 놓인 column 폭으로 판정하거나 idea에서는 false로 둔다. 상위 공통 ToolHeader가 이미 있으므로 내부 Agents 제목은 없애고 정렬 컨트롤+요약만 쓴다. UI는 공통 idea-design.js, 24px 행과 선택 inset, 시스템 UI 글꼴, 빈 상태. sort popup은 codenav props view agents/sortMenu true로 연다. localStorage key는 idea-agents. 접두사 사용.

새 터미널 메뉴는 기본 knownAgents·설치 여부·Terminal·New space·worktree actions를 보존하되 같은 popupSurface, UI 크기, row 24로 통일하고 ↑↓/Enter/Esc 및 숫자 선택을 제공한다. 항목이 로드 중/실패일 때 상태를 보여준다. root가 menu 높이/등록을 맡는다.

기존 파일을 참고해도 실행·원격·pin 동작을 임의로 축약하거나 가짜 성공으로 만들지 않는다. 원본 출처 주석을 남긴다. 설치·앱 조작·커밋·푸시 금지. node --check와 diff 검증을 기록. 추론 effort medium, 모델 환경 기본값. 시작 전 04-contracts.md와 API 정의를 읽는다.
