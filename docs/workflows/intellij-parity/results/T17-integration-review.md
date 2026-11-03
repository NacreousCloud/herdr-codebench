# T17 독립 통합 리뷰

대상: canonical `design/idea/ui.js`, 공통 컴포넌트 도입부, `mods/codenav/tools.js`/`islands.js`, 관련 virtual list 호출자. 실제 기준 API는 `~/.config/herdr-app/gpui-kit.d.ts` 및 `herdr.d.ts`. UI 조작·설치·프로세스 제어는 하지 않았다. 처음에는 읽기 전용 리뷰였으며, 발견 직후 root가 명시 승인한 canonical uiMenu 수정·생성·check_system 보강만 수행했다. 다른 담당자의 소스는 수정하지 않았다.

## 높은 가치의 발견

### P1 — virtual renderer에서 행 이벤트 등록 (공통 수정 완료)

발견 시 uiMenu의 v_virtual_list callback에서 `uiListRow(...,{onClick})`를 호출하여 내부 `.on_click`을 layout 단계에 등록했다. 현재 d.ts 21229–21243은 virtual renderer가 layout에서 실행되고 **on_click 및 기타 handler 등록은 throw**한다고 명시한다. d.ts 831–853은 리스트 바깥의 `on_item_click((key,cx)=>...)`만 허용하며 key는 get_key의 안정적인 행 id라고 정의한다. 이 결함은 실제 메뉴가 배치될 때 throw할 수 있으므로 시각적 차이보다 먼저 고쳐야 했다. 초기 공통 helper를 만든 제 검증이 이 lifecycle 규약을 놓쳤다.

root 승인 후 canonical uiMenu를 수정했다. renderer는 handler 없는 행만 만들고, 리스트에 on_item_click을 한 번 등록하여 안정적인 id로 원본 rows를 찾아 실행한다. 가상리스트 click API는 ClickEvent를 주지 않으므로 action의 첫 인자는 undefined, 두 번째는 실제 Context를 전달한다. 구분선과 disabled 행은 실행하지 않는다. root의 추가 요청대로 uiListRow의 `interactive` 옵션을 분리하여 pointer/hover 스타일은 유지하고 handler는 onClick이 있을 때만 등록한다. 두 모드 생성물을 sync했다.

같은 문제가 Search Everywhere(row helper), Recent Files의 tools/files 두 리스트, TermFiles에 있었으며 root와 popup 담당자에게 위치를 전달했다. 이후 읽은 소스에서는 해당 담당자가 on_item_click과 stable id lookup으로 옮긴 것을 확인했다. 이 파일들은 제가 편집하지 않았다.

`check_system.mjs`는 기존에 실제 uiMenu 조립과 virtual callback을 실행하지 않았다. root 승인 후 chain 가능한 Proxy와 layout phase guard를 넣어 item renderer 중 on_*를 등록하면 assertion이 실패하도록 강화했다. 실제 uiMenu 생성, stable id `b` 클릭 실행, separator 클릭 무시를 추가했다. `node --experimental-vm-modules design/idea/check_system.mjs`가 통과했다. 이는 GPUI mock 계약 검증이며 실제 화면 확인을 대신하지 않는다.

### P1 — PDF 가상 페이지의 wheel handler (root 전달)

`mods/activity/viewer.js`의 renderPdf page(n)는 약248에서 `this.wheelZoom(div(...))`를 호출하고, page(n)는 약257–261의 v_virtual_list renderer에서 실행된다. wheelZoom 약187–197은 `.on_scroll_wheel`을 등록한다. 동일한 d.ts의 handler 금지 규약에 걸려 PDF 페이지 생성이 throw할 수 있다. root에게 PDF page 내부에서는 제거하고 바깥 PDF viewport에 한 번 등록하도록 전달했다. 이 파일은 수정하지 않았다. 일반 이미지 경로의 wheelZoom은 정상 render에서 호출되어 같은 문제로 분류하지 않았다.

### P2 — 탭 메뉴 scroll handle cleanup 이름 (root 수정 확인)

리뷰 시작 시 TabMenu/TabList는 `close()`에서 controller.release를 호출했지만, `mods/codenav/main.js`의 바깥 View.close는 impl.release만 호출했다. 따라서 실제 popup lifecycle에서 handle 해제가 누락됐다. root에게 전달했고, 이후 소스에서 두 구현이 `release()`로 바뀐 것을 확인했다. 제가 이 두 줄을 수정한 것은 아니다.

## 검토한 주요 경계

- MenuController는 constructor에서 focus_handle/VirtualListScrollHandle을 만들고 호출자 init에서 생성한다. virtual renderer에서는 새 state/focus/notify를 만들지 않는다. keyboard는 실제 KeyEvent.keystroke 우선이며 plain key fallback을 사용한다. ↑↓/Home/End/PageUp/PageDown은 disabled/구분선을 건너뛰고 실제 scroll_to_item(center)을 요청한다.
- uiMenu는 명시 popup/list 높이와 가변 행 extent를 제공하고 실제 virtual list에 track_scroll을 연결한다. 같은 id의 Scrollbar를 연결한다. 자동 flex 높이만 있는 형태로 돌아가지 않았다. border-box와 실제 마지막 행의 픽셀 clipping은 runtime 화면에서 확인해야 한다.
- `activity/editor.js`의 diffRow는 virtual callback 안에 handler가 없어 이 규약에 맞는다. code.js references도 list.on_item_click이 이미 바깥에 등록돼 있다.
- ToolHeader의 Project command 이름은 실제 Files.nextCommand loop의 project-new-file/new-folder/refresh/collapse와 일치한다. Files.target()/refresh()/collapseAll()로 이어진다. 다만 herdr.d.ts의 mod 명령 설명만으로 여러 activity copy 중 전달 대상을 확정할 수 없다. root에게 **에디터에 포커스를 둔 채 Project header를 누르는 실제 검증**을 요청했다. 이것은 확정 결함이 아닌 runtime 검증 항목이다.
- ensureIdeaIslands는 root/body/work-body gap과 padding을 0으로 만들고 개별 island에 half-gap padding2(compact)를 준다. 툴 순서·열 크기·hidden·active·split 방향·terminal 본문을 삭제하거나 교체하는 경로는 이번 범위에서 발견하지 않았다. 기존 check_system의 layout 보존/idempotence 검사가 통과했다. pane radius/gap, owned chrome 높이·stripe 폭·footer는 의도한 변경이다.
- codenav/activity common의 icon/button/header는 isIdea 분기로 공통 API에 연결하고 non-idea renderer를 보존한다. Tabs의 non-idea 표현은 유지되며 메뉴 이동의 끝점 clamp는 공통 정책으로 바뀐 부분이다. Settings는 idea 전용 overlay이며 명시620 높이를 가진다.

## 남은 확인

이 리뷰는 GPUI 실제 이벤트 전달·레이아웃을 실행하지 않았다. root의 실제 앱 검증에서 긴 메뉴 End/스크롤/마지막 행, PDF, Project header command 대상, 기본 codebench 탭과 메뉴, 확대 UI 글꼴과 root gutter를 확인해야 한다. 현재 소스의 정확한 시각 bounds나 키 입력 성공을 정적 분석만으로 완료라고 주장하지 않는다.
