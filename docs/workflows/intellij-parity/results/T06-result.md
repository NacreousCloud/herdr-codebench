# T06 — Recent Locations 및 편집기 글꼴

추가 입력 정합 검토: 실제 사용자 키맵에 SaveAll=Ctrl+S가 있어 activity Save 툴팁과 기존 Ctrl+S command를 유지했다. Cmd+S 별칭 추가는 root가 취소했다. Files/FileMenu의 Rename·Copy Paths·Delete 별칭 및 포커스/↑↓/Enter/Esc 보완과 통과한 VM/문법 검사는 T02 결과의 ‘추가 검토 — 실제 사용자 키맵 정합’에 기록했다. 데이터 작업은 추가하지 않았다.

상태: 검토 대기. 지정된 하위 구현 에이전트가 수행했으며 모델/effort를 새로 재설정하지 않았다. 명세는 medium 유지다.

## 변경

- 신규 `mods/codenav/locations.js`의 `recordLocation(self, cx)`는 활성 editorKey와 file spec에 일치하는 실제 caret의 path/on/0-based line/col/scope를 기록한다. scope 이름 외 소스·입력 내용은 저장하지 않는다.
- 저장 구조는 `shared("codenav.locations") = {[editorKey]: [{path,on,line,col,scope,at}]}`다. 렌더링에서는 인스턴스 상태와 timer만 설정하고, shared 쓰기는 500ms timer에서 활성 파일·머신·좌표를 재확인한 뒤 실행한다. 500ms 유휴 debounce, 같은 파일의 2초 이내 연속 위치 coalesce, 파일+머신+줄 중복 최신화, 프로젝트별 100개 제한을 적용한다.
- `mods/codenav/everywhere.js`의 별도 locations 모드는 기록을 최신순으로 표시하고 파일명/경로/scope를 검색한다. 행에는 파일명:줄 번호, 경로, 머신, scope를 표시한다. 선택은 저장된 머신 및 정확한 line/col을 `openPath`의 1-based 인자로 변환한다.
- 기존 Recent Files 결과에도 각 tab spec의 on을 보존한다. 명시적 local `null`을 현재 remote 머신으로 덮지 않는다. Go to Line도 활성 spec의 머신을 보존한다.
- `mods/activity/editor.js`는 idea appearance의 editorFont/editorSize를 native EditorState 생성 및 일반 diff 글꼴·가상 행 높이에 적용한다. diff의 수평 최소 폭도 글꼴 크기에 비례해 확대한다. fallback은 root codeFont 계약과 동일하게 settings 및 기본 13px를 사용한다. codebench 분기 크기/글꼴은 보존한다.

## 실제 검증

- `node --check` 통과: locations.js, everywhere.js, activity/editor.js.
- `git diff --check` 통과.
- `/private/tmp/herdr-t06-check.mjs` 일회성 VM 검사 통과. 실제 변경 모듈을 읽어 Herdr API·시계·타이머를 대체한 검사다. 다음 의미를 검증했다: timer 이전 shared write 없음; 500ms debounce와 2초 coalesce; 같은 줄 중복 및 최신 column; stale 파일 무시; 머신/프로젝트 격리; 100개 한도; 최신순·scope 검색; remote line 0/col 6 → openPath line 1/col 7; Recent Files local/remote 유지; appearance editorFont/18px가 native EditorState로 전달되며 diff 행 높이는 28px.
- 공통 openPath의 line은 1-based, column 인자는 1-based를 받아 내부 0-based로 바꾸는 구현을 확인했다.

## 통합 및 미확인

- root 담당: Status.render에서 recordLocation 호출, Recent Locations 명령/keys 연결, caret publisher의 on 추가, 새 번역 키 Recent Locations / No recent locations.
- native EditorState의 공개 API에는 글꼴 변경 메서드가 없다. 기존 입력/선택/수정 내용을 버리고 재생성하지 않았으며, native 본문 글꼴은 다음 파일 로드에 적용된다. 일반 diff는 렌더링 시 즉시 읽는다.
- 실제 앱의 위치 선택·원격 파일 재방문·단축키·글꼴 설정 및 화면 표시는 미검증이다. 설치·Herdr CLI·앱 조작·커밋·푸시는 실행하지 않았다. VM 검사는 실제 Herdr 성공이나 화면 검증을 뜻하지 않는다.
- 저장된 caret 기록이 없는 경우 전용 빈 상태를 표시하며 Recent Files로 위장하지 않는다. native 편집기 자체의 caret publishing API는 없으므로 실제 공유 caret을 제공하는 codenav 코드 뷰의 위치만 기록한다.
