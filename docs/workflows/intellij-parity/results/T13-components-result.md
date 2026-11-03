# T13 공통 컴포넌트 적용 결과

담당 소스: `mods/codenav/common.js`, `tabs.js`, `settings.js`, `mods/activity/common.js`. root가 별도로 승인한 공통 `ui.js` shortcut 한 줄(max_w180/truncate) 수정과 sync 생성도 수행했다. 설치·Herdr CLI·CUA·커밋·푸시는 실행하지 않았다.

## 적용

- 두 common의 iconButton은 idea에서 uiIconButton을 사용한다. 크기/아이콘/색 옵션과 mouse-down 전파 차단을 보존하며 disabled 색을 덮지 않는다. codenav button은 uiButton에 solid/tip/disabled를 전달한다. codenav sectionHeader 및 activity viewHeader는 uiToolHeader를 사용한다. non-idea는 기존 renderer로 분기한다.
- Idea 에디터 탭은 uiTab의 32 bar/24 fill, 실제 아이콘, 선택·클릭·닫기·가운데 클릭으로 연결했다. 오른쪽 메뉴 overlay와 열린탭 목록은 uiPopupSize를 사용한다. TabMenu/TabList는 init MenuController, common uiMenu, stable file id, path hint, close시 handle release를 사용한다. 중복 키보드 이동 구현을 제거했고 non-idea의 기존 목록/메뉴 표현은 남겼다.
- Settings 입력·검색은 uiInputBox, 카테고리·키맵 행·compact 설정은 uiListRow, zoom은 uiToolbar, footer는 uiButton, 전체는 uiDialog(.h620)로 연결했다. auto-size flex에 의존하지 않고 전체 dialog620 및 키맵 목록의 명시 높이를 준다. 저장 중 Cancel/Apply/OK 및 스텝버튼을 실제 disabled 상태로 만들었다. 적용되지 않은 Apply도 disabled다.
- Compact mode는 draft에 들어가 Apply/OK 때 appearance.compact로 저장하며 Cancel은 draft를 저장하지 않는다. 정상 source engine나 실행 상태를 만들지 않았다.
- Recent Files 빈에디터 힌트는 현재 유효 macOS 키맵의 ⌘E로 교정했다. Settings는 현재 keys()의 cmd/ctrl을 그대로 기호화하고, 시퀀스는 chord 사이 공백을 유지한다. cmd-shift-e→⌘⇧E, ctrl-r→⌃R를 별도 검증했다. 추출 keymap의 RecentFiles(meta E), GotoAction(meta shift A)와 현재 keys.json의 cmd-e/cmd-shift-a를 읽어 확인했으며 전역 Ctrl→Cmd 치환하지 않았다.

## 검증

- 네 담당 JS 파일의 `node --input-type=module --check` 통과.
- `sync_ui.py --check` 및 담당 diff whitespace check 통과.
- Node vm fixture로 Settings 소스를 직접 평가해 undefined init props, 실제 component 조립, 명시 높이620, compact false Apply의 shared 저장, 불필요한 terminal 파일쓰기 없음, keymap 페이지 조립, modifier/sequence 기호화를 검증했다. 통과.
- Node vm fixture로 Tabs 소스를 직접 평가해 TabMenu 공통 rows/폭210, TabList stable file rows/path hint, 파일행 실행이 실제 editorSpec을 /b로 변경함, init focus와 close release, codebench fallback이 idea uiMenu를 호출하지 않음을 검증했다. 통과.
- 공통 MenuController 자체 fixture는 PreToolUse 읽기 정책 hook이 차단했다. 우회하지 않았으며 그 fixture는 실행 근거로 포함하지 않는다. 위 두 호출자 fixture는 실제로 실행하고 통과했다.

## 남은 실제 앱 검증

GPUI 실제 포커스·스크롤 handle, 탭 클릭/닫기 전파, 설정 overlay의 Retina/확대글자 배치, non-idea 시각 회귀는 root 설치후 확인이 필요하다. Mock은 element API 호출과 상태 변화를 검증하며 화면 픽셀 일치를 증명하지 않는다. 일반 TabMenu의 ↑↓도 공통 controller의 끝점 clamp를 따른다(기존 wrap에서 통일).
