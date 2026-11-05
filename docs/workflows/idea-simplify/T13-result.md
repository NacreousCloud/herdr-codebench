# T13 — 진단 표시와 브레이크포인트 구분

## 요청 및 근거

IDEA 편집기의 진단을 줄 번호 옆 빨간 점으로 표시하던 방식을 제거한다. 사용자가 첨부한 IntelliJ 화면처럼 범위 물결 밑줄, 우측 overview stripe, 출처·코드·메시지를 읽는 hover card로 보여 준다.

설치된 IntelliJ JAR를 REA open_binary로 식별했다. inspect_artifact는 클라이언트 승인 정책에 막혔고 재시도하지 않았다. 선택한 스킴 XML은 일반 Python zipfile/ElementTree로 읽었다. [스킴 identity/색상](../ide-platform/evidence/features/editor-diagnostics/scheme.json)은 REA Evidence와 이 일반 정적 관찰의 범위를 구분한다.

- 오류: EFFECT_COLOR `#FA6675`, ERROR_STRIPE_COLOR `#D64D5B`.
- 경고: EFFECT_COLOR `#F2C55C`, ERROR_STRIPE_COLOR `#C29E4A`.
- 정보: EFFECT_COLOR `#857042`, 스킴에 없는 경고 stripe를 임의로 만들지 않는다.
- 진단 카드: INFORMATION_HINT `#2B2D30`, HINT_BORDER `#393B40`.
- BREAKPOINT_ATTRIBUTES의 별도 배경/stripe 값은 진단에 사용하지 않는다.

## 구현

정본 `design/idea/ui.js`의 공통 진단 색/밑줄/카드/hover component를 생성해서 사용한다. 별도 native wave path가 문법 색상, 텍스트 폭, 행 높이, gutter/hit-test 원점을 유지한다. 토큰 경계의 파형을 이어 주고 겹친 진단에서는 높은 심각도를 우선한다. 여러 줄은 LSP end column까지 표시하며 빈 줄/EOF의 point 진단도 inline target을 가진다. 원본 문서를 수정하지 않는다.

IDEA source의 diagnostic gutter dot을 제거했다. Spring/super/HTTP 이동 아이콘과 Git edge mark는 그대로 둔다. codebench의 기존 straight underline/gutter는 유지한다. 우측 표시와 헤더 개수는 editor scheme 색을 사용한다.

Native HoverCard가 500ms 열기/150ms 닫기 지연과 창 경계 배치를 맡는다. 카드 본문은 출처·진단 코드·메시지를 줄바꿈하며 경로 footer를 둔다. 폭560/최대 높이320의 명시 bounds, 긴 본문 스크롤로 flex collapse를 피한다. 새 quick-fix나 자동 수정·문서 hover 기능을 주장하지 않는다.

공통 갤러리에 오류/경고 wave trigger와 카드 예제를 추가했다. 실제 렌더링에서 초기 카드의 한 줄 높이 collapse를 발견해 높이/body/경로 구조를 수정하고 재개방한 갤러리에서 줄바꿈과 footer를 확인했다.

## 검증

19개 JS 회귀 검사, sync_ui --check, git diff --check 통과. 추가 검사는 실제 source row의 범위·토큰 경계·중복 심각도·다중 줄·빈 줄/EOF, 문법 색과 hit-test 보존, codebench 기존 동작, 실제 canonical component의 scheme 색·wave paint·hover bounds를 검증한다.

앱에는 변경된 codenav source/gallery/common과 activity common을 배치 적용했고 백업을 남겼다. 실제 갤러리의 red/yellow wave와 줄바꿈·경로 footer가 있는 카드를 캡처해 확인했다. 실제 bar.js의 진단 12개를 source 화면에서 확인했고 diagnostic gutter dot 없이 물결 밑줄/우측 stripe가 렌더링됐다. 검증용 read-only 탭은 닫아 원래 빈 편집기 상태로 돌렸다. native check는 codenav/activity 초기 15초와 최종 8초 제한 모두 timeout으로 미통과다. 실제 포인터 hover와 긴 메뉴 키 입력은 이번에는 자동화하지 않았다.

T14 재개 후속: direct 실행의 macOS 서비스 초기화 문제를 분리했고, 지원되는 hc worker에서 저장소와 설치본 codenav/activity 4개 native check가 모두 exit 0으로 통과했다. 최종 JS 검사도 21개 통과했다. [후속 검증](T14-result.md)의 실제 입력 검증 범위는 별도로 유지한다.
