# 기존 에디터·검색 기능이 따라야 할 IDEA 구조

2026-11-04 KST. 설치된 IDEA **2026.2.4 / IU-262.11879.100**의 6개 클래스를
읽기 전용으로 조사했다. Python zipfile과 기존 `/usr/bin/javap`의 정적 결과이며,
클래스 실행·runtime attach·UI 조작·설정 변경을 하지 않았다. 아래 E1–E8은
이 문서의 로컬 근거 ID이며 REA Evidence ID가 아니다. JAR/class SHA-256은
[identity.json](identity.json)에 기록했다. `*.excerpt.txt`는 관련 호출 주변만 보관하며
`[...]`는 생략이다. 앞의 숫자는 원래 dump 줄, 내부 숫자는 메서드 bytecode offset이다.

재현: `python3 extract_features.py --output /tmp/idea-editor-search-repeat`.
전체 javap 덤프는 `/tmp/herdr-idea-feature-static-20261104`에만 보관했다.
이 자료는 모양의 픽셀 측정 결과가 아니다. 테마/밀도/Islands painter 근거는
기존 T07 감사 및 현재 실제 UI 관찰과 함께 사용해야 한다.

## 관찰한 동작·책임 분리

| 근거 | 관찰 | 정확한 메서드 근거 |
| --- | --- | --- |
| E1 | 현재 파일과 현재 창은 독립 화면의 문자열이 아니라 active splitter/window를 통해 조회한다. editor open은 target window와 `FileEditorOpenOptions`를 받는다. 새 창 open mode 분기도 존재한다. | [FileEditorManagerImpl](FileEditorManagerImpl.excerpt.txt), `getCurrentFile` offsets 42–49, `getCurrentWindow` 52–59, `setCurrentWindow` 9–15, `openFile(VirtualFile,EditorWindow,FileEditorOpenOptions)` 70–94 |
| E2 | composite와 탭 선택은 한 메서드에서 연결된다. 기존 탭 목록에서 같은 composite의 TabInfo를 찾아 select하고 `_currentCompositeFlow`를 같은 composite로 갱신한다. TabInfo overload도 선택 후 해당 composite를 flow에 쓴다. | [EditorWindow](EditorWindow.excerpt.txt), `setCurrentCompositeAndSelectTab(EditorComposite)` offsets 64–78, 97–124; `setCurrentCompositeAndSelectTab(TabInfo)` 7–28 |
| E3 | 탭 추가는 preview/pinned 상태, 삽입 index, selectAsCurrent를 독립 option으로 처리한다. `selectAsCurrent`가 참일 때 현재 composite/탭을 선택한다. `preview`는 Markdown 미리보기 모드와 별개인 editor-tab 수명이다. | [EditorWindow](EditorWindow.excerpt.txt), `addComposite` offsets 27–64 (preview), 81 (index), 277–286 (insert/watch), 437–458 (pin/selectAsCurrent) |
| E4 | 닫기는 실제 탭 제거, 다음 선택, composite 해제, current flow 갱신, fileClosed/afterFileClosed 통지로 이어진다. 다음 선택은 닫는 탭의 previousSelection이 아직 보이면 우선 사용하고, 이후 설정에 따라 MRU 또는 오른쪽/왼쪽을 고른다. 비활성 탭을 닫으면 현재 선택 index를 유지한다. | [EditorWindow](EditorWindow.excerpt.txt), `closeFile(VirtualFile,EditorComposite,boolean)` offsets 204–288, 401–411; `getTabToSelect` 14–54; `computeIndexToSelect` 7–21, 35–54, 152–186 |
| E5 | 탭 선택은 selectedInfo 갱신, before-selection 통지, container 갱신, selection 통지, focus 요청으로 이어진다. 마지막 탭 제거 시 다음 탭이 null인 경로가 있으며 processRemove가 selectedInfo를 null로 만든다. visibleInfos가 비면 deferred components를 즉시 정리한다. | [JBTabsImpl](JBTabsImpl.excerpt.txt), `executeSelectionChange` offsets 111–136, 184–230, 265–267; `removeTab(TabInfo,TabInfo,boolean)` 166–198, 260–281; `processRemove` 218–230 |
| E6 | Search Everywhere provider는 ID, group name, sort weight, element priority, fetchElements(pattern, progress, processor), 선택 실행, renderer, description/data, multi-select·empty-query 지원 계약을 가진다. 기본 empty-query/multi-select 지원은 false다. UI와 각 검색 엔진의 역할이 분리된다. | [SearchEverywhereContributor](SearchEverywhereContributor.excerpt.txt), 메서드 선언; `search`가 `fetchElements` 호출 offsets 23–41; `isMultiSelectionSupported`/`isEmptyPatternSupported` offsets 0–1 |
| E7 | 검색 재시작은 이전 progress 취소 → searching 상태 → 선택 tab의 contributor 목록 → indexing 지원 필터 → 이전 결과 expire → 공통 searcher 호출 순서다. rebuild scheduling은 빈 query면 0ms, 비어 있지 않으면 100ms를 사용한다. 선택 실행은 row의 contributor에 위임하며 반환값을 모아 popup 닫기를 결정한다. closePopup도 검색을 취소한다. | [SearchEverywhereUI](SearchEverywhereUI.excerpt.txt), `scheduleRebuildList` offsets 20–50; `rebuildList` 3–21, 49–81, 188–198, 337, 623–628; `elementsSelected` 1, 299, 588–594, 677–690; `stopSearching` 7–23; `closePopup` 9–10 |
| E8 | Recent Files 액션은 project 컨텍스트가 있어야 enabled/visible이다. 기존 SwitcherPanel이 있으면 only-edited 체크를 토글하고, 없으면 제목·onlyEditedFiles 상태로 별도 SwitcherPanel을 만든다. Search Everywhere의 파일 탭을 단순 재사용하는 액션이 아니다. | [BaseRecentFilesAction](BaseRecentFilesAction.excerpt.txt), `update` offsets 25–37; `actionPerformed` 17–40, 51–66, 74–103 |

E7의 취소 호출을 확인했다고 해서 결과 전달의 모든 race 방지를 증명한 것은 아니다.
실제 Searcher 구현·ranking/ML·dedup·동등성 provider 전체는 이번 6개 클래스 범위 밖이다.
E3의 preview 옵션 존재도 이 빌드의 모든 preview 승격 트리거를 확인했다는 뜻은 아니다.

## 현재 Herdr 기능에 적용할 구조와 행동

아래는 위 관찰을 바탕으로 한 **Herdr 설계 제안**이다. 아직 구현·설치 완료를 뜻하지 않는다.

| 현재 기능/소스 | 공통 구조로 옮길 책임 | 유지·보강할 IDEA식 행동 |
| --- | --- | --- |
| `common.js` openPath/openFiles + `tabs.js` routeEditor + activity editor + code/review | `EditorService`가 file identity, editor group, open options, selected tab/current editor를 소유. code/native edit/image/PDF/Markdown/review는 editor provider가 됨 | 탐색기·검색·drop·최근 파일·문제 클릭이 같은 open 연산으로 들어옴. 파일은 보이는데 탭이 없는 상태를 허용하지 않음. 요청한 focus만 이동. 마지막 닫기는 selected=null이며 오래된 render callback이 파일을 다시 열지 않음 |
| `tabs.js` current/tab/history + `recent.js` | 열린 탭, MRU 파일, 뒤/앞 위치 이력, 닫힌 탭 이력을 분리한 `EditorHistory` | inactive close가 활성 탭을 바꾸지 않음. active close 정책을 설정과 연결. reopen-closed 가능. Recent Files는 닫힌 파일도 포함할 수 있는 방문 이력을 사용하고 open-tab 목록에 종속되지 않음 |
| `everywhere.js`의 모드별 files/symbols/actions/text 분기 | `SearchContributorRegistry` + `SearchSession` + 동일 popup/list controller | provider ID·availability·scope·empty-query·limit·result kind·실행을 등록. 탭 전환/쿼리 변경/close는 한 cancellation-generation 수명으로 정리. 실패/미지원/검색 중/결과 없음은 구분 |
| `everywhere.js` actions + source별 명령 분기 | 기존 공통 ActionRegistry를 action contributor가 조회 | 이름·아이콘·shortcut·enabled/visible과 실행 컨텍스트가 toolbar/menu/Find Action에서 동일. 새 기능 추가 시 별도의 액션 목록을 다시 수정하지 않음 |
| `recent.js` 도구 창/파일 2열, onlyEdited 필터 | 별도 RecentFiles presenter가 ToolWindowRegistry와 EditorHistory를 읽음 | 필터와 컬럼 이동·선택 위치를 유지하고, 같은 단축키 재입력은 IDEA의 only-edited 전환 흐름과 맞춤. 다른 project/machine 이력 혼합 방지 |
| 탭/검색/Recent/Structure 표시 | 현재 canonical `design/idea/ui.js`와 의미 토큰을 공통 renderer가 사용 | 상태색·밀도·행 높이·아이콘·rounded tab/empty state·keyboard/scroll 동작도 공통화. service 연결만 끝내고 기존 화면의 모양/행동을 그대로 남기지 않음 |

현재 코드는 이미 일부 대응을 갖춘다. `tabs.js`에는 stable ID, last-tab empty editor,
지연 callback 재검사가 있고, `everywhere.js`에는 files/symbol/text/result별 seq guard가 있다.
이를 버리지 않고 공통 service의 상태 전이와 session 취소 계약으로 모은다.
반면 `recent.js.files()`는 history ID를 다시 현재 열린 tabs에서 찾아서 닫힌 파일은
탈락한다. `tabs.js`의 history는 최대 10개의 열린 탭 뒤/앞 탐색이고, 영구 MRU 파일
이력과 동일하지 않다. 외형만 Recent Files로 맞추어도 이 행동 차이는 남는다.

## 단계별 완료 판정

1. 동일 file open을 Project/Search/Recent/drop에서 수행했을 때 같은 tab ID·본문·선택을
   만들고 새 중복 탭이 생기지 않는지 검사한다. machine/space가 다르면 분리한다.
2. active/inactive/last close, Close Others/All, reopen-closed, preview→keep-open/pin을
   명세에 따라 상태 전이로 검사하고 실제 GPUI에서 focus·선택 fill·scroll도 확인한다.
3. 검색 도중 query/tab/project를 바꾸거나 close한 뒤 늦은 결과가 새 session에 섞이지
   않는지 검사한다. provider별 failure/unsupported를 성공한 empty result로 표시하지 않는다.
4. Recent Files에서 닫은 파일 재열기, only-edited, tool-column 키 이동, shortcut 재입력을
   actual IDEA와 Herdr에서 왕복 비교한다.
5. compact/normal, 큰 UI 글꼴, 긴 파일명/경로, 긴 결과 목록, 빈 에디터를 실제 화면에서
   비교한다. mock 통과만으로 픽셀·포커스 parity를 완료라고 보고하지 않는다.

## 미확인

- Recent SwitcherPanel 내부 파일 수집/정렬, Structure model/PSI, 모든 editor-provider 선택
  우선순위, unsaved 문서 veto, 탭 overflow layout 전체는 조사하지 않았다.
- 실제 keyboard/drag/focus 동작과 appearance는 root의 Computer Use와 기존 테마 근거로
  추가 검증해야 한다. 이번 정적 조사 자체는 그 검증을 수행하지 않았다.
- Herdr의 GPUI/모드 제한 때문에 Swing 객체/PSI/인덱스 엔진을 직접 가져오는 방식은 아니다.
  소비자들이 같은 service·renderer·action 계약을 사용하도록 재구성하는 설계다.
