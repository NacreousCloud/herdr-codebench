# IDEA에서 확인한 구조

대상: 설치된 **IntelliJ IDEA 2026.2.4, IU-262.11879.100, arm64**.
사용자의 Islands Dark/compact 설정과 현재 모드의 범위에 집중했다.
앱 패키지·설정 파일은 읽기만 했고, 실제 UI 조작은 Computer Use로 했다.

## 근거 구분

| ID | 종류·범위 | 결과 |
| --- | --- | --- |
| R1 | REA `open_binary` + `inspect_plist` | 앱 identity 확인. Evidence `ev_8b0fa4811f40735b491add73a7f1b7cefc04fba7a576ceddd84fda70b96e67fe` |
| R2 | REA JAR open / inventory | JAR SHA 확인 성공, inventory는 integrity mismatch. record-and-continue로도 실패. 성공한 코드 분석 근거로 사용하지 않음 |
| S1–S10 | Python zipfile·ElementTree + 기존 JDK javap | 3개 XML, 9개 클래스의 관련 구조와 bytecode를 조사. [해시·발췌](evidence/static/README.md) |
| X1 | 재사용 가능한 구조 추출기 | [선택 그룹 98개·기여 선언 24개](evidence/idea-structure.json). 전체 플러그인 최종 트리가 아님 |
| C1 | Computer Use: 메뉴 및 도구 모음 | 실제 설정의 Main Menu, Main Toolbar → Left/Center/Right, Editor Popup Menu와 편집 도구 확인 |
| C2 | Computer Use: 액션 추가 | 액션 트리·필터, 구분 기호, 아이콘 경로 SVG/PNG, 취소·확인 확인. 추가하지 않고 Cancel |
| C3 | Computer Use: 알림 | 그룹별 팝업 타입·도구 창 표시·사운드, 풍선 표시·위치·시스템 알림 설정 확인 |
| C4 | Computer Use 종료 | 설정 Apply가 disabled인 것을 확인하고 Cancel로 편집 화면 복귀 |
| C5 | 도구 창 컨텍스트 메뉴 | 접근성 right-click 후 메뉴를 확인하지 못했고 후속 좌표 조작은 timeout. 이동 submenu의 실제 조작은 이번 조사에서 미확인 |

REA 원본 응답은 [rea-session.json](evidence/rea-session.json)에 보존했다.
S/C/X 식별자는 이 보고서의 근거 ID이며 REA Evidence ID를 가장하지 않는다.
R1의 native launcher identity가 JVM 내부 동작을 입증하지는 않는다.

## 1. 액션은 기능이고 메뉴·툴바는 배치다

IDEA는 액션 ID에 구현을 등록하고 같은 ActionGroup에서 popup과 toolbar를 만든다.
툴바에는 대상 component/data context와 presentation factory가 따로 있다(S2).
`update(context)`에서 enabled/visible 등 표시 상태를 평가하고 실제 실행은 별도로 하는
계약은 [공식 Action System 문서](https://plugins.jetbrains.com/docs/intellij/action-system.html)와 일치한다.

Herdr에 가져올 부분은 **액션 한 번 등록 → 검색·키맵·메뉴·버튼 재사용**이다.
context를 잃은 popup이나 단축키마다 별도 실행 경로를 만들지 않는다.
기능의 실행 상태를 장수명 액션 descriptor에 저장하지 않고 서비스가 소유한다.

## 2. 상단 툴바는 세 그룹과 확장 기여로 구성된다

`PlatformActions.xml`의 기본 구조는 다음과 같다(S1/X1).

```text
MainToolbarNewUI
├─ MainToolbarLeft
│  ├─ main.toolbar.Project
│  └─ MainToolbarGeneralActionsGroup
├─ MainToolbarCenter
│  └─ main.toolbar.Filename
└─ MainToolbarRight
   ├─ SearchEverywhere
   └─ SettingsEntryPoint
```

실제 화면/설정에서는 VCS·실행 위젯·설치된 플러그인 항목이 추가된다(C1).
ExecutionActions의 ExecutionTargetsToolbarGroup도 MainToolbarRight에 기여한다(X1).
이 작은 기본 XML만 보고 전체 툴바 목록이라고 해서는 안 된다.

Herdr에서는 프로젝트·브랜치·실행 위젯을 renderer 등록으로 유지하고, 정렬/노출/추가를
그룹 모델로 바꾼다. traffic lights·창 이동 영역·가운데 정렬·overflow는 toolbar shell 소유다.

## 3. 메뉴 및 도구 모음 설정은 트리 편집기다

실제 설정에는 추가, 아이콘 편집, 위로/아래로 이동, 제거, 액션 복원, 필터가 있다(C1).
추가 창은 등록 액션을 카테고리 트리로 보여주며 구분 기호도 고를 수 있다(C2).
공식 [사용자 지정 안내](https://www.jetbrains.com/help/idea/customize-actions-menus-and-toolbars.html)는
메뉴·툴바의 항목 편집과 기본값 복원을 설명한다.

Herdr에는 같은 형태의 공통 tree editor를 만든다. 현재 8개 도구 창에서 지원하지 않는
IDEA 액션은 가져오지 않고, 실행 가능한 기능과 지원 예정 항목을 구별한다.

## 4. 사용자 변경은 기본 구성과 분리한다

CustomActionsSchema는 ActionUrl 목록을 저장하고 기본 group에 보정한다(S3–S7).
ActionUrl에는 group path/component/type/position이 있다. 확인한 diff/apply 경로는
추가·삭제 변경분이며, MOVE 상수 존재만으로 해당 경로의 직접 MOVE 처리를 단정하지 않았다.

사용자 `customization.xml`에서도 오른쪽 메인 툴바의 항목을 제거한 3개 변경을 읽었다.
파일 원문은 저장소에 복사하지 않았다. 개인 설정을 곧 제품 기본값으로 가져오지는 않는다.

Herdr에서는 안정적인 그룹/item ID와 before/after anchor로 변경을 표현한다.
번역된 경로나 배열 index에만 의존하지 않는 것은 **Herdr용 설계 선택**이다.
기본 정의 업데이트와 사용자 커스텀을 분리해 새 도구 추가가 기존 설정을 지우지 않게 한다.

## 5. 도구 창 도킹은 툴바 사용자 지정과 별개다

WindowInfoImpl/ DesktopLayout은 anchor/order/split/visible/stripe visibility/weight 등을
별도 관리한다(S9–S10). 사용자 window.layouts에서도 Structure.isSplit=true와
각 창의 anchor/order/weight를 확인했다. 복사본이나 사용자 배치를 수정하지 않았다.

[공식 Tool Windows 문서](https://plugins.jetbrains.com/docs/intellij/tool-windows.html)는 각 방향의
primary/secondary 그룹과 그룹당 한 active tool, 도구 창 내부의 여러 content tab을 설명한다.
툴바 액션 순서·stripe 버튼 순서·도구 창 content 탭 순서는 세 가지 다른 상태다.

Herdr는 지금의 left2/right2를 anchor + secondary 모델로 정규화하고 실제 레이아웃에
투영한다. 하단 보조 그룹은 후속 기능으로 명시하며 현재 구현에 있다고 표시하지 않는다.

## 6. 설정·알림·수명도 공통 계약이다

공식 [Settings Guide](https://plugins.jetbrains.com/docs/intellij/settings-guide.html)는
설정 페이지의 고유 ID·parent hierarchy와 UI lifecycle을 제공한다.
Herdr도 페이지를 등록하고 draft/validate/apply/reset/dispose 경로를 재사용한다.

알림 설정의 실제 UI는 전체 알림 on/off와 그룹별 popup/log/sound를 구분한다(C3).
따라서 알림 카드마다 playSound를 붙이는 수준을 넘어서 그룹 정책과 원본 event를 관리해야 한다.
모드가 볼 수 없는 core event는 별도 한계로 남긴다.

[공식 Disposable 문서](https://plugins.jetbrains.com/docs/intellij/disposers.html)의 수명 관리 원칙에 따라
서비스·문서·popup별 listener/작업/handle을 소유자에게 연결한다.
GPUI에는 같은 Java Disposer가 없으므로 취소 token과 명시적인 release 계약으로 재구성한다.

## 가져오는 경계

**구조와 UX 규칙을 독립적으로 재구현한다.** Java/Swing 클래스·상용 플러그인 코드나
IDEA 런타임 전체를 Herdr에 넣는 작업이 아니다. 기존 Apache-2.0 아이콘의 출처는 유지한다.

PSI, 인덱싱, refactoring, debugger, Spring bean resolution, Database 엔진은 이번 정적
조사 범위 밖이다. UI shell을 갖춰도 자동으로 생기지 않으므로 LSP·외부 실행기·별도 엔진의
지원 여부와 능력에 따라 연결한다. 전체 IDEA 구조·기능을 역공학 완료했다고 주장하지 않는다.
