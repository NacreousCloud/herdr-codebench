# T14 — 공통 컴포넌트 개발자 갤러리

2026-11-03. `mods/codenav/design-preview.js`를 추가했다. default class의 init/render/release 규약을 따르며 별도 제품 메뉴 노출 없이 개발자 명령에서만 여는 연결 계약이다.

공통 생성물 `idea-design.js`의 button/icon button/input/list row/tab/toolbar/tool header/dialog/caption/separator/island bottom/menu를 그대로 조립한다. typography·active density 치수·semantic colors와 normal/selected/inactive/disabled/focused/error 예제를 표시한다. 본문은 세로 스크롤하며 popup는 버튼을 눌러 같은 view의 menu variant로 연다.

메뉴는 disabled 두 개/구분선 뒤 100개 예제 항목을 제공하고 일부 항목을 비활성화한다. 숫자 1–9 shortcut, 초기 선택과 긴 목록 스크롤은 공통 MenuController가 소유한다. action은 instance 내부 status만 변경하고 Escape로 닫는다. 설정/shared/실제 외부 실행은 사용하지 않는다.

연결: main view key는 `designpreview`, 명령은 `codenav.design-system`이다. dialog 820×680, menu variant popup 320×360. main/명령 등록은 root 소유다. `design/idea/COMPONENTS.md`에 호출 예제와 갤러리 설명을 추가했다.

검증: `node --check`와 `git diff --check` 통과. Node mock에서 gallery render, 4개 입력 생성, 버튼/행/탭 로컬 상태 변경, 메뉴 view/variant/크기, 100개 항목과 비활성 항목, 상태 갱신, 닫기 hook, handle release를 확인했다. 실제 앱 설치·CU 조작은 수행하지 않았으며 픽셀 일치와 실제 키 입력 검증은 root 후속 작업이다.
