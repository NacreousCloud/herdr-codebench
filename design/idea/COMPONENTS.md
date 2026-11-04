# IntelliJ 공통 컴포넌트

`tokens.json`은 추출 색·치수의 원본, `ui.js`는 컴포넌트와 동작의 원본이다. 모드에서는 생성된 `./idea-design.js`를 import한다. 모드 사이 상대경로 import나 생성 파일의 직접 수정은 하지 않는다.

작업 중 표시는 `uiSpinner(() => svg(localAsset), {size,tip})`를 사용한다. 설치 IDEA의 Apache-2.0 `process/step_1.svg`와 8×125ms 주기를 기준으로 한 중립색 8-spoke SVG다. 실제 working 상태에서만 GPUI native `.spin(1000)`을 붙이고 JS 타이머는 만들지 않는다. IDEA의 이산 프레임과 달리 GPUI에서는 연속 회전하며 codebench의 기존 표시를 유지한다.

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

소스/리뷰는 `mods/codenav/editor-surface.js`의 `editorGeometry`·`editorGutter`·`editorLine`·`editorViewport`·`editorSurface`를 공유한다. 문서/토큰/diff 상태/선택/댓글은 각 뷰가 소유하고, 숫자 열 수·마커·행 내용을 공통 표면에 제공한다. 텍스트 원점과 hit test는 같은 geometry를 쓴다. 탭이 숨겨진 표면에는 canvas 색 native path로 상단 코너를 실제로 마스킹한다.

IDEA의 `terminal-panel`은 `idea-content`의 아래 자식이다. 위의 `idea-upper`는 기존 sidebar/work-body/editor/tool-right를 함께 담아 하단 도구가 열릴 때 모두 위로 줄어든다. 기존 노드와 도구 stack/terminal payload는 이동만 하며 재구성하지 않는다. `memory.js`는 이 위 행의 세로 비율을 저장한다. codebench의 별도 split 계약은 유지한다.

리뷰 툴바는 같은 action 중복을 렌더에서 제거하고 소스 열기를 하나만 제공한다. 이전/다음 변경은 위/아래, 전체 파일 context는 이름과 체크 상태로 표시한다. 삭제 파일의 소스 열기, 변경이 없는 행 이동 등 불가능한 동작은 비활성이다.

툴 위치 설정은 위치별 목록과 위/아래 순서 버튼, 이동 대상, stripe 표시 체크를 제공한다. 위치·순서·표시는 Apply 전 로컬 draft이며 `codenav.toolOrder`는 위치별 안정적인 tool 이름 배열이다. 숨긴 항목도 설정 목록에는 남아 있고, 미지 항목/미지 위치는 저장 시 보존한다. 파일 drag/drop 및 drag preview UI는 제거했다.

키맵은 액션과 개별 chord 선택 후 추가/변경/제거할 수 있다. 실제 키 기록 외에 `cmd-shift-o` 텍스트 입력도 가능하다. `keymap-model.js`는 staged edits와 latest-file CAS를 검증하고 원래의 terminal forwarder만 동기화한다. 모드 소유 shortcut의 제거/재할당은 소스의 하드코딩 fallback보다 우선한다.

`tokens.json`의 `herdr.editor.metrics`는 첨부 IDEA 화면을 기준으로 선택한 Herdr 편집기 배치 값이다(추출한 upstream 수치와 구분). `IDEA.editorBreadcrumbHeight`(compact22/normal26), `editorTextInset`(4/8), `editorGutterInset`(8), `editorMarkerWidth`(18)를 제공한다. 텍스트 시작 좌표는 렌더링·마우스 hit test·인라인 코멘트가 같은 값을 사용한다.

메뉴 및 도구 모음 설정의 단일 트리는 Main Toolbar의 Left/Center/Right, Tool Windows의 위치별 도구, 헤더·팝업 메뉴 그룹을 포함한다. 펼침·검색·키보드 이동과 선택 항목 스크롤을 지원한다. 도구를 선택하면 표시 체크와 위치 이동 버튼이 나오며 위/아래 버튼은 해당 위치 안의 순서를 바꾼다. 모든 변경은 Apply 전 draft다.

Markdown preview eye는 헤더의 편집 버튼 바로 왼쪽에 배치한다. 네이티브 편집 중에도 같은 헤더의 앞쪽 액션으로 유지하며 기존 mode/dirty 버퍼를 보존한다. 하단 preview bar와 일반 파일의 eye는 만들지 않는다. Git edge marker는 공통 editor-surface에서 absolute 장식으로 그리며 숫자/이동 아이콘/텍스트 원점에 영향을 주지 않는다. `lineAdded`/`lineModified`/`lineDeleted` 의미 색과 `editorChangeMarkerWidth`/`Radius` 치수를 사용한다.

| 함수 | 소유 영역 |
| --- | --- |
| `uiButton(id,label,action,{primary,disabled,small})` | 텍스트 버튼, 클릭, 비활성 |
| `uiIconButton(id,graphic,action,{tip,active,disabled,size})` | 실제 아이콘 element의 버튼; 내부 클릭 전파 차단 |
| `uiInputBox(input,{focused,error,mono})` | 입력 element 바깥 배경·오류/포커스 틀 |
| `uiListRow(id,children,{selected,focused,disabled,onClick,interactive,indent})` | 밀도·행 선택·들여쓰기; indent는 px. virtual renderer는 handler 없이 interactive로 hover만 사용 |
| `uiCheckbox(id,label,action,{checked,disabled})` | 체크·비활성 상태와 클릭. checked 상태는 호출자가 소유 |
| `uiStripeButton(id,graphic,action,{active,tip,side})` | stripe hit area와 inset 선택 배경·아이콘·tooltip. side는 left/right, 인접 island inset을 고려해 시각 여백 대칭 |
| `uiTreeRow(id,label,{depth,selected,expanded,graphic,shortcut,onClick,disabled})` | depth×14 들여쓰기·펼침 표식·선택. expanded 미지정은 leaf, 실제 펼침 상태는 호출자가 소유 |
| `uiSettingsShell(id,{title,sidebar,content,footer,width,height,sidebarWidth})` | 설정 제목/좌측열/본문/하단 영역과 명시 크기. 기본900×700/좌측145. 갤러리 settings variant는640×420을 명시하고 개인 설정을 쓰지 않음 |
| `uiSeparator()`, `uiCaption(text)` | 구분선·보조 설명 |
| `uiToolbar(id,children)` | 툴바 크기·정렬 |
| `uiToolHeader(id,title,{actions,content})` | 제목 또는 대체 content와 오른쪽 액션 |
| `uiTab(id,children,{selected,active,onSelect,onClose,closeIcon,tip})` | Islands 채움, 클릭 선택, 가운데 클릭 닫기, 닫기 아이콘 |
| `uiTabStrip(id,items,active,viewport)` | `{id,content}` 탭의 실제 폭을 측정하고 활성 탭을 보이게 이동; `TabViewport`는 init에서 생성, 수동 휠 이동은 일반 redraw에서 유지 |
| `uiEmptyEditor(hints,footer)` | 빈 에디터의 공통 배경·중앙 정렬·보조색 안내. hints는 `[번역한 이름, 단축키]` 목록이며 실제 동작은 호출자가 소유 |
| `uiPopupSize(count,{width,maxHeight,extraHeight})` | `{width,height}` 명시 크기 계산 |
| `uiDialog(id,{title,body,footer})` | 제목·flex 본문·footer. 기본 높이360, 호출자가 `.h(높이)`로 실제 필요 크기 지정 |
| `uiIslandBottom()` | 레이아웃이 소유한 섬 아래 마감. 외부 gap을 추가하지 않음 |
| `uiEditorFooter(children)` | Markdown 등 편집기 로컬 모드의 하단 제어. 호출자가 실제 상태/핸들러를 소유 |

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

## 레이아웃 공통 키맵

전체 검색 기본값은 `cmd-shift-space`(⌘⇧Space)다. `terminal` override는 `codenav.key:cmd-shift-space`로 전달하고 Status가 IDEA에서 전체 검색을 연다. 다른 레이아웃은 원래 키를 터미널에 전달한다. Herdr modifier 시퀀스의 입력 중 오작동을 피하기 위해 기존 `shift shift` 기본값은 제거했다. 설치 스크립트는 이전의 정확한 기본 action만 마이그레이션하고 개인 바인딩을 보존한다. 설정 키맵과 빈 편집기 안내는 실제 `keys()` 바인딩을 표시한다.

설치 시 빠진 바인딩만 병합하며 기존 키 충돌은 보존·출력하고 변경 전 파일을 백업한다. Herdr 최초 실행 전에는 기본 키맵을 대신 생성하지 않고 최초 실행을 안내한다.

회귀 검사: `node design/idea/check_shortcuts.mjs`, `node --experimental-vm-modules design/idea/check_settings.mjs`.

## 툴 윈도우 설정

툴 윈도우의 기본 위치·줄 표시·레이아웃 복원은 IdeaSettings의 `toolbars` 단일 트리에 통합한다. `openToolSettings()`와 기존 `codenav.tool-settings`의 `openIdeaSettings("windows")` 진입은 같은 페이지의 Tool Windows 루트를 선택한다. 별도 windows 페이지나 dialog는 만들지 않는다.

위치/표시는 다른 설정과 같은 draft 및 Apply/OK/Cancel 수명을 따른다. 일반 Apply에서는 수정된 툴의 위치만 arrange에 전달한다. 명시적 레이아웃 복원은 Apply 후 현재 draft의 전체 알려진 위치를 적용한다. 표시만 바꿀 때는 레이아웃을 재배치하지 않으며 알 수 없는 미래 설정과 동시에 바뀐 다른 항목을 유지한다.

회귀 검사: `node --experimental-vm-modules design/idea/check_settings.mjs`.

## 현재 파일 선택

`uiListRow`와 `uiTab`은 호출자가 전달한 selected를 배경과 접근성 선택 상태에 함께 반영한다. 파일 탭은 파일/머신의 안정적인 id를 사용하며 현재 탭 이름을 semibold로 표시한다.

Project는 에디터/리뷰의 현재 파일이 바뀔 때 선택과 anchor를 맞추고 상위 폴더를 펼쳐 읽는다. 에디터에 포커스가 있을 때는 공통 비활성 선택 색을 유지한다. 같은 파일의 일반 redraw는 수동 다중 선택·폴더 접기를 덮어쓰지 않는다. 경로 경계·머신·스페이스가 다른 파일은 선택하지 않으며, 이전 파일의 비동기 폴더 읽기는 새 선택을 바꾸지 않는다. 일반 트리의 스크롤 위치는 유지한다.

회귀 검사: `node --experimental-vm-modules design/idea/check_file_selection.mjs`.

탭 등록·스택 선택·빈 탭 줄의 표시 여부는 항상 보이는 Status의 `routeEditor`가 담당한다. 숨겨진 탭 줄도 탐색기에서 파일을 열면 복귀한다. 지연 콜백은 현재 스페이스와 현재 파일/리뷰를 다시 확인하고, 닫힌 탭의 이전 클릭 콜백은 파일을 다시 열지 않는다. 리뷰의 현재 파일은 스페이스와 저장소 경계를 모두 검사한다.

IDEA에서 마지막 탭을 닫으면 editor-area는 유지하고 editor-tabs만 숨긴다. 빈 화면은 code child의 `emptyEditor`를 사용하며 제목·탭 도구줄 없이 중앙 안내를 보여준다. 파일 drag/drop은 지원하지 않는다. codebench는 마지막 탭을 닫으면 영역을 숨기는 기존 동작을 유지한다. 회귀 검사: `node --experimental-vm-modules design/idea/check_tabs.mjs`.

언어 서버 설정은 `lsp-install-guide.js`의 OS별 순수 안내 모델과 `lsp-setup.js`의 공통 settings shell을 사용한다. 언어별 선택과 로컬 폴더, LLM용 안내 복사, 실제 감지/초기화를 구분한다. 설치 명령을 자동 실행하지 않으며 선택·폴더 변경/닫기 뒤 오래된 응답은 버린다.
