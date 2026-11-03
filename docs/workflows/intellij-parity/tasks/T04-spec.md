# T04 — 코드·리뷰·코멘트

목적: 02-requirements.md의 해당 요구사항을 구현한다. 선행 계약: 04-contracts.md 및 idea-design.js. 수정 파일: mods/codenav/code.js, review.js, comments.js. 다른 파일은 수정하지 않고 필요한 변경을 root에게 요청한다. codebench의 외형과 데이터 동작, HTTP·실행·리뷰·언어 서버 계약은 보존한다.

기준 자료: design/idea/DESIGN.md, tokens.json(필요한 키만 추출), keymap.json. 기본 Herdr 모드는 수정하지 않는다. UI 문자열 번역은 기존 T()를 유지한다. 구현 details를 제품 화면에 노출하지 않는다.

정상: 사용자 흐름과 데이터는 유지하면서 IntelliJ 표면·행·컨트롤·UI 글꼴을 사용한다. 경계: 비어 있거나 오류·로딩이어도 모서리와 정보 구조가 유지된다. 오류: 실제 오류를 보여주고 가짜 성공을 만들지 않는다.

공통 helper: isIdea, IDEA, uiSize, ideaUI, popupSurface. 자체 하드코딩 크기는 이 기준에 연결한다. 루트 모서리가 자식 배경을 잘라준다고 가정하지 않는다. root가 레이아웃 가장자리를 보호하되 각 뷰에서 독자적인 사각 배경이 외곽에 새어나오지 않게 검토한다.

검증: 변경한 JS에 node --check와 git diff --check. 가능한 단위의 동작 검토. 설치·앱 조작·CLI check·커밋·푸시는 root만 수행한다. 확인하지 않은 화면을 검증했다고 쓰지 않는다.

담당: 구현 에이전트. 하위 effort medium: 파일 경계와 디자인 계약이 정해진 UI 구현이다. 모델은 환경 기본값. 결과는 results/T04-result.md에 수정 파일·변경·검증·미충족 사항을 기록한다. 진행 인덱스 및 공통 계약은 root만 수정한다.

## 후속 사용자 키맵 정합 범위

root의 감사 후 지정: 코드/리뷰의 idea Ctrl+Alt+click은 구현으로 이동하고 middle click은 선언으로 이동한다. 기존 Ctrl+click/Cmd+click 및 codebench 분기는 유지한다. 코멘트 카드가 공통 uiFontFamily의 shared appearance를 따르도록 한다. idea Outline 툴팁/동작은 실제 Ctrl+F12 파일 구조 팝업에 맞춘다. Ctrl+Shift+E는 다른 담당자가 제공하는 locations 모드로 연결하고, codenav.caret에는 on을 포함한다. keys.json/status.js/everywhere.js와 최근 위치 저장 구현은 다른 담당자 소유다.
