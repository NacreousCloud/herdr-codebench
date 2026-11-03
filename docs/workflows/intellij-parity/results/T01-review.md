# T01 읽기 전용 통합 검토

검토 범위: `mods/codenav/settings.js`, `islands.js`, `tools.js`, `tabs.js`, `main.js`, `status.js`, 공통 `idea-design.js`. 최초 읽기 전용 감사 후 root가 명시적으로 아래 후속 구현 범위를 위임했다. 작업 중인 root에게 발견 즉시 전달했고 수정된 항목은 최신 소스로 다시 확인했다.

## 발견과 처리 상태

| 우선순위 | 항목 | 근거/영향 | 검토 당시 상태 |
| --- | --- | --- | --- |
| P1 | 설정 Apply 중 추가 편집을 저장 완료로 잘못 표시 | 저장할 `d`를 캡처한 후 await 동안 draft가 바뀌어도 `saved=JSON.stringify(this.draft)`로 표시했었다. A 저장 중 B 편집 시 실제 A/화면 B인데 clean이 되는 것을 VM으로 재현했다. | root가 `saved=JSON.stringify(d)`로 수정. 재검증에서 추가 편집은 dirty 유지. |
| P1 | terminal key fallback 실패가 명령 루프 종료 | `await termKey`의 hc reject가 무한 nextCommand 루프 밖으로 전파될 수 있었다. | root가 hc reject/비정상 종료에 catch+notify 추가. stub hc rejection 검증 통과. |
| P2 | 저장 중 Cancel/Esc로 dialog가 닫혀 저장 완료 여부가 불명확 | await 도중 close되면 일부 파일 쓰기와 shared 반영이 분리될 수 있다. | root가 Cancel/Esc를 saving 동안 막는 코드 확인. 실제 앱 close/task 수명 검증은 미실행. |
| P2 | 누락 tool 복구의 잘못된 content | addMissing의 `{mod:"codenav",props:{view:n}}` 기본값으로 project/find/commit/terminal을 생성하면 일부 view가 main VIEWS에 없어 unknown view가 된다. HEAD에도 있던 결함이지만 migration 수용 기준에 해당한다. | root가 project/commit/find content 명시. 위임 후 terminal의 content를 현재 template와 일치시켰고 JSON 동등성 검증 통과. |
| P2 | TabList가 탭 바와 다른 review 집합을 사용 | 탭 바와 popup 높이는 `here`로 현재 repo review만 포함하지만 TabList는 `tabsNow()` 전체를 사용했다. 같은 space에서 다른 repo로 이동하면 이전 repo review가 dropdown에 남고 클릭과 결과가 다를 수 있었다. | 위임 후 visibleTabs 공통 helper로 통일. repo/원격 host 필터와 키보드 선택 VM 검증 통과. |
| P2 | TabMenu/ToolMenu의 키보드 경로 누락 | 최초 검토 시 두 클래스 init이 비어 있고 focus/위·아래/Enter 처리가 없었다. | 위임 후 focus/위·아래/Enter/Esc와 선택 표시를 구현. Projects에도 동일한 키보드 경로 적용. VM 검증 통과, 앱 전달은 미확인. |

## API와 상태 계약 검토

- `herdr.d.ts`의 writeTextFile은 expected 원문을 요구하는 optimistic write다. settings는 최신 파일을 매 시도 다시 읽고 unrelated key를 보존한 채 `font`/`font_size`만 변경한다. 실제 기본 `frame/settings/main.js`도 개인 JSON key `font`와 resolved `settings().font_family`를 구분하므로 이 매핑은 맞다. 3회 실패는 오류로 표시하고 appearance shared 변경까지 진행하지 않는다.
- 개인 설정의 font와 UI shared appearance는 별도 저장 매체다. 트랜잭션은 아니지만 현재 코드는 파일 쓰기 성공 뒤 shared를 적용한다. 외부 파일/앱을 실제로 변경하지 않았다.
- 새 일반 클래스는 main의 `new Impl()` → `init(p,cx)` → `render(cx)` 위임과 일치한다. main은 initProps와 herdr props를 병합해 settings.page 및 agents.sortMenu를 전달한다. UI helper import는 유효한 exports를 사용한다.
- uiSize/ideaUI/popupSurface는 `isIdea()`로 분기하여 codebench에 UI 크기·새 표면을 강제로 적용하지 않는다. codebench Cmd+Shift+O는 terminal files 동작을 유지한다. 추가 terminal global 바인딩의 fallback은 hc로 전달한다.
- `hc keys`의 `ctrl+c` 사용은 기존 run.js와 동일한 `+` 표현이다. 하지만 herdr.d.ts에는 hc subcommand 키 이름/Kitty 인코딩 명세가 없으므로 cmd alias와 모든 terminal keyboard mode에서 원래 키와 같은 인코딩인지 이 검토만으로 확정하지 않았다. 실제 terminal 입력 검증이 필요하다.
- settings의 Zoom, Tool Window Reset은 즉시 command를 실행한다. Cancel은 이 즉시 실행 action을 되돌리지 않으며 font draft만 버린다. 의도된 즉시 작업인지 사용자 흐름 검토가 필요하다.

## 수행 검증

- 지정 JS 7개 `node --check`: 모두 통과.
- `git diff --check`: 통과.
- VM 순수 migration 실행: 현재 idea layout의 최대 깊이는 6이며 ensureIdeaIslands 전후 6→6이다. footer를 같은 column의 자식으로 넣으므로 중첩 깊이를 늘리지 않는다. 두 번째 호출은 false를 반환해 idempotent임을 확인했다.
- VM 설정 경쟁 재현 및 수정 재검증: write를 지연시킨 상태에서 추가 편집해도 실제 적용 snapshot과 saved가 같고 후속 편집은 dirty다. 첫 optimistic write를 stale로 실패시킨 뒤 fresh read로 재시도하며 기존 unrelated key를 보존함을 확인했다.
- VM hc rejection: fallback이 오류를 통지하고 정상 반환함을 확인했다.

이 VM 검증은 요소/API stub을 사용한 소스 로직 검증이다. 실제 Herdr 렌더링·설정 파일 쓰기·키 입력·원격 연결 검증으로 간주하지 않는다.

## 모서리와 미확인 사항

islands migration은 column의 canvas, radius와 gap을 정리하고 고정 10px footer를 추가한다. ToolHeader는 surface와 rounded_t, IslandBottom은 surface와 rounded_b를 직접 그린다. Settings는 p(4) content inset 안에 본문을 배치하며 상위 radius의 자식 clipping만 가정하지 않는다. 탭 내부의 배경 역시 top inset과 둥근 선택을 사용한다. 소스 수준에서는 기본 자식 배경이 외곽에 닿는 구조를 줄였다.

실제 네 모서리 픽셀, 큰 UI 폰트에서 overflow, 이동/분할한 개인 layout, migration의 앱 저장 처리, popup framing과 Escape 전달은 화면 검증이 남았다. Herdr CLI 및 앱 조작은 읽기 전용 검토 범위에 따라 실행하지 않았다. root의 추가 편집 후 최종 검토/미해결 상태 갱신이 필요하다.

## 명시적으로 위임된 후속 구현

편집 경계는 `tools.js`의 ToolMenu/Projects 클래스와 TOOLS.terminal content, `tabs.js`의 visibleTabs helper/TabMenu/TabList 및 idea nav 버튼이다. 그 외 root 코드와 settings/status/islands 공통 구현은 수정하지 않았다.

- ToolMenu는 표시 중인 이동/숨기기/줄에서 제거/설정 항목만 순회하며 separator를 건너뛰고 Enter는 클릭과 같은 action을 호출한다.
- Projects는 활성 space에서 시작하고 Open Folder도 순회 대상에 포함한다. space가 없어도 Open Folder를 키보드로 실행할 수 있다. 실제 pickFolder/space.new 동작은 기존과 같다.
- TabMenu는 Close/Close Others/Close All을 키보드로 실행한다. TabList와 탭 바는 같은 visibleTabs를 사용해 원격 host와 repo가 다른 review를 숨긴다. 기존 codebench 탭 바의 here 필터 의미도 동일하게 유지한다.
- TOOLS.terminal content는 실제 `layouts/idea.json`의 bottom-terminal content를 복제했다. `tab:"active"`와 pane의 surface/background/border/focus/radius/gap을 사용하며 pane_header를 추정해서 추가하지 않았다.
- idea 탭 바 이동 버튼은 `codenav.nav-back`/`codenav.nav-forward`로 보낸다. 위치 이력과 탭 이력의 통합 경로는 root/code 담당자가 처리한다. idea 버튼 색은 t.muted이며 codebench는 기존 직접 tabBack/tabForward 호출과 canStep 색을 유지한다.

후속 검증: tools.js/tabs.js `node --check`, `git diff --check` 통과. 별도 VM에서 terminal content와 template JSON 동등성, ToolMenu 이동/설정 키보드, Projects 활성 space/빈 목록 Folder 선택, visibleTabs repo+host 필터, TabMenu Close All, TabList 표시 항목 선택/빈 목록 Enter, idea nav command와 codebench 기존 nav/색 분기를 실행해 모두 통과했다. API/요소는 stub이며 앱/네트워크/개인 설정은 실제로 변경하지 않았다. 스크롤 영역 밖으로 키보드 선택이 이동할 때 자동 스크롤 여부와 실제 포커스 전달은 앱 통합 검증에 남는다.
