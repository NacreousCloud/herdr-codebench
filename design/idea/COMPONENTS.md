# IntelliJ 공통 컴포넌트

`tokens.json`은 추출 색·치수의 원본, `ui.js`는 컴포넌트와 동작의 원본이다. 모드에서는 생성된 `./idea-design.js`를 import한다. 모드 사이 상대경로 import나 생성 파일의 직접 수정은 하지 않는다.

```sh
python3 design/idea/sync_ui.py
python3 design/idea/sync_ui.py --check
# 새 모드 디렉터리를 먼저 만든 뒤 같은 두 파일 생성
python3 design/idea/sync_ui.py --mod my-new-mode
python3 design/idea/sync_ui.py --check --mod my-new-mode
```

`--mod`는 반복 가능하다. 생략하면 codenav/activity를 검사·생성한다. `--check`는 파일을 쓰지 않고 누락·차이가 있으면 종료코드 1을 반환한다. 생성 파일은 토큰 전체를 담은 `idea-tokens.js`와 컴포넌트 `idea-design.js` 두 개다. `ui.js` 자체는 배포 전 원본이며 해당 디렉터리에서 직접 실행하지 않는다.

`isIdea`, `IDEA`, `uiSize`, `ideaUI`, `popupSurface`의 기존 export를 유지한다. `IDEA`는 현재 설정을 읽는 getter다. idea에서 appearance.compact 미지정은 compact이며 명시적 false는 normal이다. 다른 레이아웃에서 isCompact는 false이고 색과 글꼴은 기존 theme을 사용한다. `uiColors()`는 canvas/surface/popup/foreground/secondary/disabled/border/separator/hover/selection/selectionInactive/selectionForeground/tabSelected/focus/accent/accentForeground/error/editor/lineNumber/currentLine/guide 역할을 제공한다.

## 조립 단위

| 함수 | 소유 영역 |
| --- | --- |
| `uiButton(id,label,action,{primary,disabled,small})` | 텍스트 버튼, 클릭, 비활성 |
| `uiIconButton(id,graphic,action,{tip,active,disabled,size})` | 실제 아이콘 element의 버튼; 내부 클릭 전파 차단 |
| `uiInputBox(input,{focused,error,mono})` | 입력 element 바깥 배경·오류/포커스 틀 |
| `uiListRow(id,children,{selected,focused,disabled,onClick,interactive,indent})` | 밀도·행 선택·들여쓰기; indent는 px. virtual renderer는 handler 없이 interactive로 hover만 사용 |
| `uiCheckbox(id,label,action,{checked,disabled})` | 체크·비활성 상태와 클릭. checked 상태는 호출자가 소유 |
| `uiStripeButton(id,graphic,action,{active,tip})` | stripe hit area와 inset 선택 배경·아이콘·tooltip |
| `uiTreeRow(id,label,{depth,selected,expanded,graphic,shortcut,onClick,disabled})` | depth×14 들여쓰기·펼침 표식·선택. expanded 미지정은 leaf, 실제 펼침 상태는 호출자가 소유 |
| `uiSettingsShell(id,{title,sidebar,content,footer,width,height,sidebarWidth})` | 설정 제목/좌측열/본문/하단 영역과 명시 크기. 기본900×700/좌측145. 갤러리 settings variant는640×420을 명시하고 개인 설정을 쓰지 않음 |
| `uiSeparator()`, `uiCaption(text)` | 구분선·보조 설명 |
| `uiToolbar(id,children)` | 툴바 크기·정렬 |
| `uiToolHeader(id,title,{actions,content})` | 제목 또는 대체 content와 오른쪽 액션 |
| `uiTab(id,children,{selected,active,onSelect,onClose,closeIcon,tip})` | Islands 채움, 클릭 선택, 가운데 클릭 닫기, 닫기 아이콘 |
| `uiPopupSize(count,{width,maxHeight,extraHeight})` | `{width,height}` 명시 크기 계산 |
| `uiDialog(id,{title,body,footer})` | 제목·flex 본문·footer. 기본 높이360, 호출자가 `.h(높이)`로 실제 필요 크기 지정 |
| `uiIslandBottom()` | 레이아웃이 소유한 섬 아래 마감. 외부 gap을 추가하지 않음 |

모든 action/onClose는 `(event,cx)`를 받는다. 자식 element와 입력 상태는 호출자가 소유한다. 입력/검색/저장/오류 상태를 이 모듈이 가짜로 생성하지 않는다. 컨트롤 행은 UI 글자 크기가 커지면 최소 높이도 늘려 잘림을 줄인다. `IDEA`의 기본 compact 값은 Island radius8/gap4, row22, input24, tab32/fill24, header31, toolbar32/button26, stripe32/icon16, status24다. tab32는 선정한 근사값이며 Java TabbedPane36을 editor bar의 관측값으로 취급하지 않는다.

## 메뉴 수명과 키보드

```js
import { View, div } from "gpui-kit";
import { MenuController, uiMenu } from "./idea-design.js";

export default class Actions extends View {
  init(_props, cx) {
    this.menu = new MenuController(cx, 0); // init에서만 생성
    this.menu.focus.focus();
  }
  close() { this.menu.release(); }
  render(cx) {
    const rows = [
      { id: "open", label: "Open", shortcut: "1", action: (event, cx) => this.open(event, cx) },
      { separator: true },
      { id: "save", label: "Save", disabled: this.saving, action: (event, cx) => this.save(event, cx) },
    ];
    return uiMenu("actions", rows, this.menu, cx, {
      width: 320, maxHeight: 400,
      onClose: (event, cx) => this.dismiss(event, cx),
    });
  }
}
```

`this.menu.at`은 원본 rows의 index다. 구분선·비활성 행은 ↑↓/Home/End/PageUp/PageDown에서 건너뛴다. Enter와 클릭은 현재 항목을 실행하며 Escape는 onClose만 호출한다. 숫자1–9는 명시적 `row.shortcut`과 먼저 매칭한다. 명시 숫자가 하나도 없을 때만 활성 항목 순번을 사용한다. 명시 숫자가 존재하면 빠진 번호가 다른 항목을 실행하지 않는다. 텍스트 shortcut 표시는 별도로 key binding을 등록하지 않는다.

기본 실행은 onClose 후 action 순서다. 복사·비동기 작업이 끝난 뒤 닫아야 하면 `closeOnActivate:false`를 전달하고 action이 성공 후 닫도록 한다. Escape는 이 경우에도 onClose를 호출한다. controller.key 직접 호출도 같은 옵션을 받는다.

긴 검색 목록처럼 메뉴 이외 renderer가 선택을 소유하면 다음 형태로 같은 handle을 사용한다. 선택 변경은 event 안에서 수행하고 renderer 안에서 notify하지 않는다.

```js
// init에서 MenuController 생성. 선택 변경 이벤트:
this.menu.at = nextIndex;
this.menu.ensureVisible(nextIndex); // center, 기본값은 현재 at
cx.notify();
// render에서 실제 v_virtual_list에 연결:
v_virtual_list(id, rows.length, rowHeight, i => rows[i].id, renderRange)
  .h_full().track_scroll(this.menu.scroll);
```

`uiPopupSize`의 기본 extraHeight는14(양쪽 padding6+border1)다. popup 호출부의 width도 uiMenu의 width와 같게 맞춘다.

메뉴는 가변 높이 virtual list(행22/구분선9), 명시적 popup와 list 높이, `track_scroll` 및 동일 id Scrollbar를 조립한다. 빈 rows도 최소 한 행 높이를 보존한다. 최초 selected가 0보다 크면 constructor에서 그 index로 스크롤을 요청한다. 데이터가 재정렬되면 호출자가 안정적인 id로 선택 index를 다시 맞추고 ensureVisible을 호출한다. release는 반복 호출해도 안전하다.

## 새 화면 검증 예제

정상 목록에는 실제 rows를 넣는다. 메뉴의 아이콘은 반드시 `icon: () => toolImage(name, 16)`처럼 factory로 전달한다. Native element를 미리 만들어 deferred renderer에 재사용하면 실제 앱에서 행 전체가 비어 보인다. uiMenu는 잘못된 eager icon을 즉시 거부한다. 빈 화면은 `uiCaption("No results")`, 로딩은 현재 작업의 실제 busy일 때 `uiCaption("Searching…")`, 오류는 실패 상태에서 `uiCaption(message)`와 `uiButton("retry","Retry",retry)`를 쓴다. 포커스 상태는 입력 상태가 보고한 사실을 uiInputBox에 전달한다. 상태 이름만 바꿔 실제 작업 성공을 표시하지 않는다.

설치 후 검증은 compact/normal와 UI13/확대 글자에서 수행한다. 빈 메뉴, 전부 비활성, 구분선 사이 항목, 100개 긴 목록의 End/Home/PageUp/PageDown, 숫자 명시shortcut, Enter/Escape, 클릭·가운데 클릭 탭닫기, 비동기 실패 후 메뉴 유지, 섬 끝 배경을 확인한다. unit mock만으로 GPUI 실제 높이·포커스·Retina 픽셀 일치를 주장하지 않는다.

## 개발자 갤러리

`mods/codenav/design-preview.js`는 생성된 공통 컴포넌트를 직접 조립한 실행 가능한 참고 화면이다. `designpreview` view와 개발자 명령 `codenav.design-system`이 등록되어 있다. Find Action(⌘⇧A)에서 `design-system`을 검색하면 열린다. 제품의 기본 메뉴·툴바에는 갤러리를 노출하지 않는다.

```js
openOverlay({ mod: "codenav", props: { view: "designpreview" },
  kind: "dialog", frame: "none", width: 820, height: 680 });
```

본문은 스크롤하며 현재 설정의 밀도·치수·UI 글꼴, 11/13/16 텍스트, 의미별 색, 정상/주요/비활성 버튼, 아이콘 버튼, 정상/포커스/오류/monospace 입력, 선택/비활성 선택/비활성/들여쓰기 행, 탭, 툴바, 툴 제목과 섬 아래 마감을 보여준다. 명시된 입력 테두리는 상태 예제이며 실제 작업의 실패나 성공을 나타내지 않는다. 빈/로딩/실패 예제도 명확히 sample로 표시한다.

`Open 100-row menu…`는 같은 view의 `variant:"menu"`를 논리 320×360 팝업으로 연다. 메뉴는 공통 컨트롤러의 긴 목록·비활성 건너뛰기·숫자 shortcut·선택 스크롤을 검증하는 예제다. 활성화하면 로컬 상태 문구만 바꾸고 유지되며 Escape로 닫는다. 갤러리는 settings/shared를 쓰거나 외부 명령·파일·네트워크 작업을 실행하지 않는다. 각 instance의 release에서 메뉴 handle을 해제한다.

## 툴 윈도우 설정

툴 윈도우의 기본 위치·줄 표시·레이아웃 복원은 IdeaSettings의 `windows` 페이지에 통합한다. `openToolSettings()`와 기존 `codenav.tool-settings`는 `openIdeaSettings("windows")`로 연결한다. 별도 ToolSettings dialog는 만들지 않는다.

위치/표시는 다른 설정과 같은 draft 및 Apply/OK/Cancel 수명을 따른다. 일반 Apply에서는 수정된 툴의 위치만 arrange에 전달한다. 명시적 레이아웃 복원은 Apply 후 현재 draft의 전체 알려진 위치를 적용한다. 표시만 바꿀 때는 레이아웃을 재배치하지 않으며 알 수 없는 미래 설정과 동시에 바뀐 다른 항목을 유지한다.

회귀 검사: `node --experimental-vm-modules design/idea/check_settings.mjs`.
