# T12 — effective IDEA 키맵 연결

2026-11-03. T10에서 교정한 `design/idea/keymap.json`을 기준으로 source 키보드 경로와 툴팁을 수정했다. 설치·배포·앱 조작·커밋·푸시는 하지 않았다.

## 변경

- `keys.json`의 idea 레이아웃: 최근 파일 Cmd+E, 최근 위치 Cmd+Shift+E, 액션 찾기 Cmd+Shift+A, 모두 숨기기 Cmd+Shift+F12, 중지 Cmd+F2. 저장 Cmd+S는 activity.save로 연결했다. 실행 Ctrl+R 및 실행 구성 Ctrl+Alt+R는 유지했다.
- terminal에는 위 Cmd 검색 키 전달을 추가했다. 기존 Ctrl+E/Shift+E/Shift+A 전달 항목은 유지하되 `status.js`의 idea 액션 테이블에서는 제거했다. 따라서 Ctrl+E는 hc를 통해 터미널 프로그램으로 다시 전달되고 최근 파일을 열지 않는다.
- `code.js`: Cmd+Alt+B와 Cmd+Alt+F7, Cmd+F12 구조, Cmd+Shift+E 위치를 사용한다. idea에서는 잘못 남아 있던 Ctrl+Alt+B/F7, Ctrl+F12, Ctrl+Shift+E, Ctrl+C/F 별칭을 제거하고 codebench 별칭은 유지했다. explicit Control인 Ctrl+J와 Ctrl+Shift+B는 유지한다.
- code/review의 idea 구현 이동 마우스 modifier는 Cmd+Alt+click으로 교정했다. idea의 Ctrl+click을 선언 이동으로 오인하지 않도록 했다.
- Files에서는 key 함수의 modifier와 Insert 복사 조건만 수정했다. idea의 복사/잘라내기/붙여넣기/경로 복사/전체 선택은 platform(Command)을 사용하고 codebench의 Control 별칭은 보존한다. header/commands 영역은 수정하지 않았다.
- activity editor 저장 안내 및 fileops 잘라내기/복사/붙여넣기/경로 복사 툴팁은 idea일 때 Cmd를 표시한다. code 구조와 구현 툴팁도 교정했다.

## 검증

- 수정한 6개 JS 파일에 `node --check` 통과.
- 실제 source의 Code.keyDown 메서드를 추출한 mock 실행: Cmd+Alt+B/F7, Cmd+F12, Cmd+Shift+E, Ctrl+J, Cmd+C의 6개 동작을 확인했다. idea에서 잘못된 Control 별칭 5개가 더 이상 실행되지 않으며 codebench의 Ctrl+Alt+B는 보존되는 것을 확인했다.
- 실제 Files.key 메서드 mock: idea Cmd+C는 copy 요청을 보내고 Ctrl+C는 copy 요청을 보내지 않음을 확인했다.
- 실제 status TERM_KEYS/termKey mock: Ctrl+E가 `hc(["keys","test","ctrl+e"])`로 전달되고 Cmd+E 및 Cmd+Shift+A는 recent/actions를 여는 것을 확인했다.

기존 mod:activity의 Ctrl+S 바인딩은 codebench 호환을 위해 그대로 두고 idea의 Cmd+S를 추가했다. 이 단계는 실제 Herdr 레이아웃/모드별 binding 우선순위나 네이티브 편집기 입력을 검증하지 않았으며 root의 실제 앱 확인이 필요하다. 메뉴·실행창 등 소유 범위 밖 툴팁은 이 변경에 포함하지 않는다.
