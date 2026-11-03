# T18 Settings reference 구현

사용자가 제공한 clipboard 이미지(`codex-clipboard-2fde0eee-a498-420f-8d39-feaa1e196c41.png`)를 view_image로 확인했다. 원본 이미지에 있는 좁은 좌측 설정 트리, 세로 구분선, 우측 키맵 제목, scheme 표시, 검색·툴바·그룹 트리를 기준으로 `mods/codenav/settings.js`를 재구성했다. canonical `design/idea/ui.js`에는 재사용 가능한 uiSettingsShell/uiTreeRow를 추가하고 모드별 생성 파일을 sync했다. root가 동시에 추가한 uiCheckbox를 compact 설정에 사용했다.

## 화면과 공통 컴포넌트

- Settings overlay는 논리900×700, sidebar145로 명시한다. 왼쪽의 기존 너비224·카드배경·둥근 테두리를 제거하고 전체 surface #191A1C와 세로 divider를 사용한다.
- sidebar는 실제 지원하는 Appearance/Font/Terminal/Tool Windows와 root leaf Keymap으로 조립한다. Keymap을 scheme 이름의 하위 leaf로 만들지 않는다. 부모는 실제로 펼치고 접을 수 있으며 검색도 동작한다.
- 우측 제목은 현재 페이지명이다. Keymap은 `macOS 1 복사`와 기반 표시 행, 펼치기/접기/shortcut 추가 버튼, 별도 키맵 검색, bordered tree를 가진다. scheme 선택이나 외부 plugin 가져오기는 구현하지 않았으므로 동작하지 않는 dropdown/gear/link를 그리지 않았다.
- 키맵 데이터는 현재 Herdr keys()의 layout:idea/mod:codenav/mod:activity에서 가져온다. 실제 action만 Tool Windows/Navigation/Editor/Run/Appearance/Other로 분류하고 비어 있는 분류는 표시하지 않는다. shortcut와 command 검색은 그룹을 자동으로 펼쳐 결과를 보여준다. 임의의 Debugger/Database/Plugin 등의 미지원 카테고리를 추가하지 않았다.
- 그룹 행은 실제 폴더 아이콘과 disclosure를 사용하고, leaf는 action명과 cmd/ctrl을 구분한 shortcut 표시를 사용한다. 같은 section/action의 여러 shortcut는 하나의 leaf에 모은다.

공통 API:

```js
uiSettingsShell(id, { title, sidebar, content, footer = [], width = 900, height = 700, sidebarWidth = 145 })
uiTreeRow(id, label, { depth = 0, selected = false, expanded, graphic, shortcut, onClick, disabled = false })
```

두 API는 uiDialog 앞에 추가해 root가 맨끝에 추가한 checkbox/stripe와 편집 충돌을 피했다. 실화면의 native 창 traffic lights나 존재하지 않는 설정 엔진을 흉내 내는 기능은 추가하지 않았다.

## 실제 shortcut 추가

action leaf를 선택하고 pencil의 Add Shortcut를 누르면 init에서 만든 FocusHandle로 capture 표면에 포커스를 준다. 실제 KeyEvent.keystroke를 받아 표시하고 Add로 pending 변경에 넣는다. Escape는 capture만 취소한다. Apply/OK 이전에는 사용자 파일을 쓰지 않는다.

Apply는 `${appHome()}/keys.json`을 읽고 실제 section→chord→action schema에 **새 shortcut을 추가**한다. 기존 shortcut을 삭제하거나 바꾸지 않는다. 다른 section/unknown field/base binding은 JSON 구조 그대로 보존한다. 같은 section의 기존 chord가 다른 action에 할당돼 있으면 stage 또는 저장 단계에서 실패를 표시하고 덮어쓰지 않는다. writeTextFile expected raw를 사용하고 optimistic 충돌시 최신 파일을 다시 읽어 최대3회 병합한다. 실패시 pending은 유지한다. 새 chord 적용은 Herdr의 기존 keys.json 갱신 동작을 따른다. 이 작업에서 실제 사용자 keys 파일을 수정하지는 않았다.

키맵과 폰트는 별도 파일/상태이므로 저장이 하나의 원자적 transaction은 아니다. shortcut 저장 성공 뒤 다른 설정 저장이 실패하면 성공한 shortcut는 남고 실패 내용을 보여준다. 미실행 성공 메시지는 표시하지 않는다. 이 첫 구현은 additive 편집이며 기존 shortcut 삭제/교체 UI는 없다.

## 검증

- settings.js와 canonical ui.js Node module syntax check 통과.
- sync_ui.py 생성/--check 및 해당 diff whitespace check 통과.
- 기존 check_system.mjs 통과: 밀도/색/메뉴 keyboard·scroll/virtual renderer handler 금지/layout 보존·idempotence.
- Settings 실제 소스를 Node vm fixture로 평가: 900×700/sidebar145, root keymap leaf, 실제 데이터에만 존재하는 Editor/Navigation/Run 그룹, capture→stage→Apply, optimistic 첫쓰기충돌 후 재읽기 병합, concurrent/unknown/global/base binding 보존, 다른 action에 할당된 chord 거절, 검색, cmd/ctrl 표기 검증 통과.
- 첫 fixture 실행은 error의 null을 undefined로 기대한 fixture assertion이 실패했다. product 오류가 아니어서 기대값을 null로 고친 뒤 전체 관련 검증을 다시 통과했다.

실제 GPUI의 sidebar 폭·키맵 트리 높이·capture focus·settings file reload·Retina 비교는 root의 설치 후 UI 검증 항목이다. 권한 변경/HMR/Herdr CLI/CUA/설치/commit/push는 실행하지 않았다.
