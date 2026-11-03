# 공유 계약

## 실제 앱 조사 후 확정한 공통 시스템 계약

이 항목이 아래 초기 계약보다 우선한다. 실제 활성 기준은 compact 모드다.

- 토큰 원본: design/idea/tokens.json. 컴포넌트 원본: design/idea/ui.js. 생성기: design/idea/sync_ui.py.
- 생성 대상: mods/{codenav,activity}/idea-design.js 및 idea-tokens.js. 직접 편집 금지. 기존 import 경로와 IDEA/isIdea/uiSize/ideaUI/popupSurface export는 호환한다.
- isCompact(): idea에서 appearance.compact !== false(기본 true), 다른 레이아웃은 false. IDEA의 밀도 값은 getter로 현재 설정을 읽는다.
- compact 기준: islandRadius 8, islandGap 4, rowHeight 22, inputHeight 24, tabHeight 32(실제 bar 근사), tabFillHeight 24, toolHeaderHeight 31, toolbarHeight 32, toolbarButtonSize 26, stripeWidth/stripeButtonWidth/stripeButtonHeight 32, stripeIconSize/iconSize16, statusHeight24. normal은 기존 일반 값과 패키지 normal 값을 따른다.
- uiColors(): theme/추출 토큰으로 의미별 배경·텍스트·선택·비활성·포커스·테두리·에디터 보조 색을 제공한다.
- uiButton(id,label,action,{primary=false,disabled=false,small=false}): 공통 텍스트 버튼.
- uiIconButton(id,graphic,action,{tip='',active=false,disabled=false,size}): 실제 아이콘 element를 받는 공통 버튼.
- uiInputBox(input,{focused=false,error=false,mono=false}): 입력 element를 받는 표면/포커스/오류 틀.
- uiListRow(id,children,{selected=false,focused=true,disabled=false,onClick,interactive=Boolean(onClick),indent=0}): 동일 밀도·선택·비활성 역할을 쓰는 행.
- uiSeparator(), uiCaption(text), uiToolbar(id,children), uiToolHeader(id,title,{actions=[],content}): 공통 조립 단위.
- uiTab(id,children,{selected=false,active=true,onSelect,onClose,closeIcon,tip}): Islands 선택 배경과 클릭/가운데 클릭/닫기 규칙.
- uiPopupSize(rowCount,{width=320,maxHeight=400,extraHeight=14}): 실제 auto-size 팝업에서도 flex 목록이 접히지 않도록 명시적 height를 반환한다.
- new MenuController(cx,selected=0): init 안에서만 생성. focus/scroll handle과 at을 소유한다. public scroll/ensureVisible(index=at)로 custom virtual list와 연결한다. release()로 scroll handle 해제.
- uiMenu(id,rows,controller,cx,{width=320,maxHeight=400,onClose,closeOnActivate=true}): rows는 {id,label,icon:()=>element,shortcut,disabled,action} 또는 {separator:true}. 키보드 ↑↓/Home/End/PageUp/PageDown/Enter/Esc·숫자 shortcut, 비활성 건너뛰기, 선택 스크롤을 공통 처리한다. virtual list의 track_scroll을 사용한다. 비동기 작업 중 유지할 메뉴는 closeOnActivate=false로 명시한다.
- uiDialog(id,{title,body,footer}): 제목/본문/하단 버튼 영역을 소유하며 본문 flex의 실제 높이를 보장한다.
- uiIslandBottom(): 섬 끝을 소유한 레이아웃에서 쓰는 compact-aware 마감.

설치·UI 조작·커밋·푸시는 root만 수행한다. 공통 생성물을 바꿀 때는 원본 변경 → 생성 → --check 순서를 따른다. 새로운 컴포넌트 API가 필요하면 계약 문서와 예제를 함께 갱신한다.

툴 윈도우 액션은 TOOLS[name].headerActions의 {id,icon,label,command} 데이터로 등록한다. ToolHeader가 공통 uiToolHeader/uiIconButton을 조립하고 해당 모드의 nextCommand 수신자가 실제 동작을 수행한다. Project/Find 본문은 idea에서 두 번째 제목 줄을 만들지 않는다. 개발자용 codenav.design-system 명령은 designpreview view를 연다.

## 초기 계약(일반 모드 기준 기록)

mods/codenav/idea-design.js 및 mods/activity/idea-design.js는 같은 내용을 가진다. root만 변경한다.

- IDEA: islandRadius 10, islandGap 6, popupRadius 8, dialogRadius 12, controlRadius 4, selectionRadius 4, rowHeight 24, inputHeight 28, tabHeight 40, toolHeaderHeight 32, iconSize 16, stripeWidth 40, stripeButtonWidth 37, stripeButtonHeight 40. 근거는 추출 토큰. 실제 arc 의미가 확인되면 root가 일괄 갱신한다.
- isIdea(): shared layout이 idea인지 판정한다.
- uiSize(base=13): idea에서 shared("codenav.appearance").uiSize / 13 배율, 다른 레이아웃에서는 base 그대로.
- ideaUI(element): idea에서 shared("codenav.appearance").uiFont 또는 사용자 UI 글꼴(기본 .AppleSystemUIFont)과 UI 크기를 지정한다.
- popupSurface(element, dialog=false): idea에서 popup 또는 dialog 표면·둥글기·테두리·UI 글꼴을 지정한다. 기존 행과 내용은 모서리 안쪽에 배치해야 한다. 둥근 클리핑을 보장하는 API로 취급하지 않는다.

settings(): 기존 Herdr API를 따른다. 설정 쓰기 명령은 실제 herdr.d.ts 및 기본 설정 구현에서 확인 후 root가 사용한다. activity/codenav의 기존 데이터·키맵·HTTP 및 비밀 값 처리 계약은 그대로다. 동작 변경 필요 시 root에게 보고한다.

## 최종 추가 계약

- uiStripeButton: compact32 hit area 안에28 선택 fill, inset2, icon16. 창 끝까지 선택색이 닿지 않는다.
- uiCheckbox:14 indicator, checked/disabled는 호출자 상태. 비활성은 handler를 등록하지 않는다.
- uiTreeRow: depth×14, expanded 여부, leaf, 선택과 비활성을 공유한다.
- uiSettingsShell:900×700/좌측145, 제목28/footer46, 동일 배경과 세로 구분선. body의 양쪽 열은 실제 높이를 채운다.
- 가상 행에는 event/state 등록을 하지 않는다. 메뉴 아이콘은 반드시 factory여야 한다. 클릭은 list.on_item_click의 stable key와 eventCx를 사용한다.
- Popup의 외부 width와 내부 uiMenu width를 일치시킨다. 테스트는 deferred renderer를 실행하지만 실제 GPUI 배치·native lifetime 검증을 대체하지 않는다.
