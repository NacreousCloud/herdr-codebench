# 설치된 IDEA의 구조: 정적 근거

2026-11-04 KST. 대상은 `/Applications/IntelliJ IDEA.app`, Info.plist의 버전은
**2026.2.4 / IU-262.11879.100**이다. 아래는 REA inventory 결과가 아니라
Python `zipfile` 및 설치된 JDK `javap -constants -p -c`로 확인한 정적 관찰이다.
IDEA 클래스 로딩·실행, 에이전트 주입, 설정 변경은 하지 않았다.

원본 JAR SHA-256:
`5a19d56e6ff99866f413af64200954a2e61c6dc8258014de0811a08e4312e026`.
클래스·XML별 해시는 [identity.json](identity.json)에 있다. `*.excerpt.txt`는
전체 클래스가 아닌 관련 선언과 호출 주변의 발췌이며 `[...]`는 생략이다.
각 줄 앞 숫자는 원래 javap 덤프 줄, 내부 숫자는 해당 메서드의 bytecode offset이다.
전체 덤프는 조사 시점 `/tmp/herdr-idea-structure-static-20261104`에만 보관했다.

재현은 `python3 extract_structure.py --output /tmp/idea-structure-repeat`로 한다.
스크립트는 설치된 JAR를 읽고 지정 출력 디렉터리만 쓴다. 앱 업데이트 후에는
identity가 달라질 수 있으므로 이전 관찰과 같은 빌드라고 간주하지 않는다.

## 관찰

| 근거 | 확인한 동작·형태 | 파일·메서드 |
| --- | --- | --- |
| S1 | `MainToolbarNewUI`는 `MainToolbarLeft`, `MainToolbarCenter`, `MainToolbarRight`를 가진 그룹이다. Project 위젯·Search Everywhere·설정은 액션 또는 다른 액션 ID의 reference다. 빈 `EditorTabsToolbarActions`, `ToolWindowContextMenu` 그룹도 선언된다. | [action-groups.json](action-groups.json), `idea/PlatformActions.xml` |
| S2 | 액션 등록은 ID와 `AnAction` 객체를 받으며, popup과 toolbar 생성은 같은 `ActionGroup` 타입을 받는다. 툴바는 자신의 group, presentation factory, target component/data context를 따로 가진다. | [ActionManagerImpl](ActionManagerImpl.excerpt.txt) `registerAction`, `createActionToolbar`, `createActionPopupMenu`; [ActionToolbarImpl](ActionToolbarImpl.excerpt.txt) `getActionGroup`, `createPresentationFactory`, `setTargetComponent`, `getDataContext` |
| S3 | 사용자 변경은 `ActionUrl` 목록으로 보유한다. `getState()`가 각 항목을 `group` element로 만들고 `writeExternal`을 호출하며, `loadState()`는 이를 읽어 `addAction`한다. | [CustomActionsSchema](CustomActionsSchema.excerpt.txt), `getState` offsets 11–66, `loadState` offsets 218–237 |
| S4 | 변경 항목에는 `groupPath`, component ID/type, action type, absolute position이 있다. 상수는 ADDED=1, DELETED=-1, MOVE=2다. XML은 `path`, `value`, `action_type`, `position`, action/group/separator 구분을 저장한다. | [ActionUrl](ActionUrl.excerpt.txt), 선언 및 `readExternal`/`writeExternal` |
| S5 | 기본 그룹과 편집 결과를 비교해 삭제(-1)·추가(1) delta를 생성한다. 적용 때 기본 children을 복사하고 대상 그룹의 ID/이름/경로, component action, position을 확인해 삽입·제거하고 하위 그룹에도 보정을 적용한다. `MOVE` 상수가 있다는 사실과 별개로 이 경로에서 실제 처리하는 것은 추가·삭제다. | [CustomizationUtil](CustomizationUtil.excerpt.txt), `computeDiff` offsets 11–148; `getReordableChildren` offsets 47–401 |
| S6 | `updateActionGroup`은 기본 구성과 diff를 만든 뒤 기존 schema의 해당 그룹 변경만 바꾸고 schema-changed 알림을 보낸다. 다른 그룹을 통째로 새 구성으로 덮는 흐름이 아니다. | [CustomizationUtil](CustomizationUtil.excerpt.txt), `updateActionGroup` offsets 18–156 |
| S7 | 보정된 그룹은 원래 group을 감싼다. schema/group modification stamp와 dynamic group 여부에 따라 children을 다시 계산하고 캐시한다. | [CustomisedActionGroup](CustomisedActionGroup.excerpt.txt), `getChildren` offsets 0–125 |
| S8 | 사용자 정의가 가능한 그룹을 등록하는 별도 provider/registrar 계약이 존재한다. 모든 액션과 사용자 편집 가능 surface는 같은 개념이 아니다. | [CustomizableActionGroupProvider](CustomizableActionGroupProvider.excerpt.txt), `registerGroups` |
| S9 | 도구 창 위치는 액션 그룹과 별도 상태 객체다. `WindowInfoImpl`은 ID, pane ID, anchor, order, split, visible, stripe-button visibility, type/internal type, auto-hide, floating bounds, weight/sideWeight를 가진다. | [WindowInfoImpl](WindowInfoImpl.excerpt.txt), 필드 선언 |
| S10 | `DesktopLayout`은 ID→window info map을 관리한다. `setAnchor`는 같은 pane+anchor에서 삽입 순서 이후 창들의 order를 증가시키고 이동 대상의 order/pane/anchor를 바꾼다. `writeExternal`은 정렬된 window info와 unified weights를 별도 직렬화한다. | [DesktopLayout](DesktopLayout.excerpt.txt), `setAnchor` offsets 33–180; `writeExternal` offsets 24–119 |

## Herdr 재구성에 대한 추론·설계 제안

위 관찰에서 다음 구조를 도출할 수 있다. 이것은 IDEA의 Java 클래스를
Herdr에서 그대로 실행하거나 이식했다는 뜻이 아니다.

- 액션 ID·표시 이름·아이콘·키맵·실행 컨텍스트를 한 번 등록하고, 메뉴/툴바/
  Find Action은 같은 등록을 조회한다. surface는 action/group/separator 참조를 가진다.
- 상단 툴바는 left/center/right 그룹으로 선언하고, Project/Run처럼 복합 UI가
  필요한 위젯은 custom renderer를 가진 액션으로 취급한다.
- 사용자 편집은 기본 그룹과 분리한 versioned delta로 저장한다. Herdr용 delta는
  번역된 라벨이나 절대 배열 위치에만 의존하기보다 stable item ID와 before/after
  anchor를 쓰는 편이 업데이트·번역 변경에 안전하다. 이 부분은 IDEA bytecode의
  그대로 복제가 아니라 개선을 포함한 Herdr 설계 선택이다.
- `Menus and Toolbars`는 등록된 surface의 공통 tree editor가 되고, 추가·구분선·
  이동·삭제·선택 그룹 복원·전체 복원·Apply/Cancel이 같은 모델을 바꾼다.
- 도구 창은 별도 registry+state로 관리한다. stripe 버튼·View 메뉴·단축키는 같은
  activate action을 호출하되, 위치/크기/열림/선택/줄 표시 여부는 layout state다.
  드래그 결과 역시 같은 manager의 move 연산으로 들어가야 한다.
- 새 도구 추가는 tool descriptor + body factory + 선택적 header action group으로
  끝내고, 이를 stripe/설정/키맵 각각에 수작업으로 다시 등록하지 않는다.

## 미확인·범위

- 실제 사용자 설정 UI와 드래그/키보드 동작은 이 조사에서 관찰하지 않았다.
  root의 Computer Use 기록과 별도로 결합해야 한다.
- 일부 실행·VCS·플러그인 group 기여는 다른 JAR/extension 등록으로 들어온다.
  PlatformActions.xml의 기본 구조가 현재 화면의 전체 최종 버튼 목록은 아니다.
- Spring, PSI, 인덱싱, 디버거, inspections 엔진은 이 9개 클래스 조사 범위가 아니다.
  UI 구조를 재구성해도 그 의미 분석 엔진이 자동으로 제공되지는 않는다.
- Java Swing custom components, tool window floating/docking 세부 구현,
  비동기 action update thread 정책 전부를 GPUI로 직접 가져올 수 있는지 확인하지 않았다.
- REA JAR inventory의 integrity mismatch는 이 독립 해시 일치만으로 해소되지 않는다.
  이 문서의 S1–S10은 REA Evidence ID가 아닌 로컬 정적 근거 식별자다.
