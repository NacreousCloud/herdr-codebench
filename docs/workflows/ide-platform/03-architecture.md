# Herdr에 맞춰 재구성할 공통 구조

이 문서는 **선정한 설계**다. 아래 디렉터리·서비스·예제는 아직 제품에 구현되지 않았다.
IDEA의 근거와 구분하며, 실제 코드의 registry/state 중복을 단계적으로 대체한다.

## 1. 모드 내부의 작은 IDE 플랫폼

```text
design/idea/                  # 기존 tokens/ui + 새 선언 원본·생성/검사
mods/codenav/platform/        # 제안: pure registry/model/reducer/contracts
mods/codenav/services/        # 제안: 도킹·문서·알림·실행·provider 조정
mods/codenav/adapters/        # 제안: Herdr layout/keys/commands, GPUI, LSP, ijhttp
mods/codenav/features/        # 제안: 기능별 descriptor·handler·content factory
mods/codenav/surfaces/        # 제안: toolbar/menu/stripe/settings의 공통 renderer
mods/activity/               # 기존 Project/editor 유지, 선언 사본과 명령 adapter 사용
```

기능은 `actions`, `groups`, `toolWindows`, `settingsPages`, `providers`를 등록한다.
현재 파일·실행 세션·위치 상태를 등록 객체에 직접 담지 않는다. renderer는 상태를 읽고
action을 호출한다. 신규 기능 때문에 toolbar/settings/everywhere 분기를 동시에 고치지 않는
것이 확장 계약의 완료 기준이다.

별도 거대 daemon이나 임의 플러그인 로더부터 만들지 않는다. 첫 구현은 정적 ES module
등록과 기존 Python LSP helper를 사용한다. 제공되지 않은 host 기능은 adapter의 한계로 둔다.

## 2. 액션·그룹·surface

| 계약 | 필수 역할 |
| --- | --- |
| ActionDescriptor | stable ID, 번역 label key, description, icon, category, handler ID, capability, 기본 단축키 |
| ActionPresentation | context별 visible/enabled/checked/label/reason. 빠르고 부작용 없는 평가 |
| ActionContext | layout, machine, space, repository/cwd, focus kind, terminal, document/selection, invocation place |
| ActionGroup | stable item ID를 가진 action/group/separator/widget 참조, 순서, popup 여부 |
| SurfaceDescriptor | 표시할 root group, 렌더 방식, context source, customizable 여부 |
| HandlerAdapter | 실제 기능 호출. 실행 직전 context와 capability를 재검증하고 비동기 취소/실패 처리 |

예시는 새 모델의 형태이며 기존 `codenav.find-file` 명령은 adapter를 통해 유지한다.

```js
// 선언은 직렬화 가능한 metadata, handler는 별도 함수 map.
{
  id: "ide.file.goto",
  label: "Go to File",
  category: "Navigation",
  handler: "navigation.gotoFile",
  defaultShortcuts: ["cmd-shift-o"],
  capability: "workspace.files",
}
// 동일 ID를 Find Action / Keymap / toolbar / menu에서 재사용한다.
```

메뉴가 열리기 **전** 호출자의 context를 캡처한다. 설정·popup으로 focus가 옮겨도
원래 터미널의 cwd나 문서를 잃지 않는다. 파괴적 작업·저장은 실행 시점의 유효성도 확인한다.
context에는 원격 machine이 포함되며 동일 path를 local 파일로 잘못 실행하지 않는다.

`update/presentation`에서는 fs/LSP/exec/상태 저장을 하지 않는다. 미리 확보한 snapshot으로
평가하고, 미확정 capability는 loading/disabled로 표현한다. 렌더 중 notify·쓰기 금지 규칙을 유지한다.

키맵·tooltip은 실제 effective binding을 같은 resolver에서 읽는다. modifier tap sequence
`shift shift`와 macOS Ctrl/Meta 구분을 보존한다. terminal override도 같은 action을 호출한다.
`app.settings`와 `ide.settings`는 독립 ID이며 각각 Cmd+, / Cmd+Shift+,에 연결한다.

## 3. 사용자에게 보여줄 구성 트리

```text
모양 및 동작
├─ 모양
├─ 메뉴 및 도구 모음
│  ├─ 메인 툴바
│  │  ├─ 왼쪽: Project 위젯 · Branch 위젯 · 일반 액션
│  │  ├─ 가운데: 선택적 현재 파일 위젯
│  │  └─ 오른쪽: Run 위젯 · Search Everywhere · 설정
│  ├─ 모드 메뉴: File · Edit · View · Navigate · Code · Run · Tools · Window
│  ├─ 에디터 팝업 / 에디터 탭 팝업
│  ├─ Project 팝업 / Project 헤더 / Project 더보기
│  ├─ Structure 헤더 / 더보기
│  ├─ Problems 헤더 / 더보기
│  ├─ Find / Commit / Terminal / Notifications / Agents의 등록 그룹
│  └─ 상태바 액션 그룹 (지원되는 항목만)
└─ 알림
키맵
에디터
├─ 글꼴
└─ 탭과 표시
창
└─ 도구 창: 위치 · primary/secondary · stripe 표시 · 기본 배치 복원
도구
├─ 터미널
├─ 실행 구성
└─ HTTP Client
```

IDEA macOS의 OS 메뉴바를 mod가 바꿀 수 있다는 근거는 아직 없다. “모드 메뉴”는
우선 모드 내부 메뉴 surface로 제공하고, native 메뉴바 통합은 host 지원을 검증한 뒤 결정한다.
도구 창 줄은 등록 도구만 수용하는 전용 surface다. 일반 액션을 도킹 가능한 도구 창처럼
넣지 않는다. stripe 순서·위치는 도킹 설정이 관리하고, 헤더/더보기의 액션은 그룹 편집이 관리한다.

편집기는 **추가 / 구분선 / 위로·아래로 / 제거 / 아이콘 / 선택 그룹 복원 / 전체 복원**을 제공한다.
등록 액션 검색·카테고리는 Find Action·Keymap과 같은 registry를 쓴다.
먼저 draft에서 편집하고 Apply/OK 때 검증·저장·반영한다. Cancel은 실행 배치를 건드리지 않는다.
필수 shell 위젯·창 조작 영역·안전한 설정 진입은 제거 불가 제약을 가진다.

## 4. 기본 구성 + 사용자 변경분

완성된 배열 전체를 저장하지 않고 versioned patch로 보관한다.

```json
{
  "schemaVersion": 1,
  "surface": "ide.mainToolbar.right",
  "patches": [
    { "op": "remove", "item": "settings.mode" },
    { "op": "insert", "item": "user.gotoFile.1", "action": "ide.file.goto", "after": "run.widget" }
  ]
}
```

`item`은 surface 내 occurrence ID다. 같은 action을 두 곳에 넣을 수 있어 action ID와 구분한다.
사용자 move는 같은 모델의 remove+insert 또는 정규화된 move 연산으로 다룬다.
동일 그룹 간 move는 item ID를 유지한다. 중복 ID·group cycle·없는 action·잘못된 위치를 검증한다.

원본 업데이트에서 anchor가 사라지면 저장된 fallback 순서로 배치하고 사용자에게 상태를 알린다.
일시적으로 없는 provider의 사용자 항목은 unresolved로 보존한다. 무조건 삭제하거나 실행하지 않는다.
번역 문자열은 identity로 사용하지 않는다. “복원”은 선택한 scope의 patch만 제거한다.

설정은 `default < user < workspace`의 override 순서를 명시한다. toolbar/keymap 기본 개인화는
user scope, 도킹·문서 세션은 workspace scope다. 프로젝트별 toolbar override는 기본 기능이
안정된 뒤 지원한다. 알 수 없는 미래 필드와 다른 scope의 변경을 보존한다.

workspace별 도킹은 **새 모델의 목표**다. 현재 `toolSides/toolHidden`과 실제 layout에는
workspace key가 없다. 첫 전환은 현재 전역 배치를 호환 기본값으로 보존하고, workspace별
override는 P3에서 space 전환·저장·projection과 터미널 범위를 검증한 뒤 활성화한다.
Herdr가 원래 workspace별 모드 layout을 제공한다고 가정하지 않는다.

Apply 전 최신 저장본과 revision을 재확인한다. optimistic write가 가능한 파일은 expected
text를 사용한다. 여러 파일/Herdr 명령을 원자적으로 쓰는 API는 없으므로 검증→저장→projection의
실패 시 복구 상태를 남긴다. commit 실패를 성공으로 표시하거나 unrelated 변경을 rollback하지 않는다.

## 5. 도구 창과 content manager

```js
// 등록: 도구의 정체성과 생성 방법
{ id: "ide.tool.structure", label: "Structure", icon: "structure",
  defaultPlacement: { anchor: "left", secondary: true, order: 0 },
  contentFactory: "structure.content",
  headerGroup: "ide.structure.header", secondaryGroup: "ide.structure.more" }

// workspace 상태: 등록 기본값과 별개
{ tool: "ide.tool.structure", anchor: "left", secondary: true, order: 0,
  visible: true, stripeVisible: true, weight: 0.4 }
```

ToolWindowManager가 `activate/hide/move/reorder/setStripeVisible/restore`를 소유한다.
각 `(anchor, secondary)` 슬롯에는 한 active tool만 존재한다. focus는 visible/active와 구별한다.
header의 숨기기·stripe 클릭·단축키·컨텍스트 메뉴·드롭 모두 같은 연산으로 들어간다.

실제 Herdr layout node는 projection이다. 임의로 전체 layout을 재생성하지 않고 기존 노드 ID,
사이즈·터미널 content·탭·숨김 상태·알 수 없는 노드를 보존한다. 외부 layout 변경도 import해
모델과 reconcile한다. 적용 직후 다시 읽어 실패를 감지한다.

left2/right2는 기존 adapter에서만 쓰고 public 모델은 anchor+secondary로 바꾼다.
하단 보조 그룹·floating/sliding은 후속 capability다. 미지원 선택은 설정에 동작하는 것처럼
노출하지 않는다. 분할 경계와 마우스 resize는 shell이 소유한다.

content tab은 도구 창 내부 상태다. Terminal/Run/HTTP 결과가 여러 tab을 가져도 stripe의
도구 등록 개수를 늘리지 않는다. content 제거 시 화면과 프로세스 종료를 구분한다.

## 6. 문서·편집기·진단

문서 identity는 `(machine, workspace, canonical URI)`이며 tab identity는 provider와 document
또는 review revision을 포함한다. path 문자열 하나로 workspace/machine/review를 섞지 않는다.
EditorWorkspace가 `open/openMany/activate/close/closeOthers/reopen/reveal/history`를 소유한다.
현재 viewer/native editor/review는 DocumentProvider로 연결하고 하나의 active document를 읽는다.

편집 가능한 provider에는 `canClose/canDeactivate`와 dirty buffer·저장 revision 계약이 필요하다.
Save/Discard/Cancel을 먼저 처리하고 성공한 뒤에만 tab/활성 문서를 변경한다. closeAll의 중간
Cancel은 남은 문서를 보존한다. 외부 변경 충돌은 optimistic save 결과로 처리하고, native
editor handle을 release하기 전에 미저장 buffer를 유지하거나 명시적으로 폐기했는지 확인한다.

마지막 tab close는 명시적으로 `active=null, tabs=[]`가 될 수 있다. 이전 비동기 open·진단·selection
callback이 닫힌 문서를 다시 열지 못하도록 request generation과 revision을 비교한다.
Project의 수동 다중 선택과 현재 editor 표시를 분리해 redraw가 선택을 지우지 않게 한다.
openMany는 입력 순서를 보존·중복 제거하고 마지막 열린 파일을 활성화한다.
외부 drop은 directory/미지원 파일·원격 파일의 정책을 검사한다.

Diagnostic/Symbol/RelatedLocation provider 결과에는 document key·document version·request generation이
포함된다. Problems·gutter·rail·tooltip·Structure는 같은 snapshot을 조회한다.
전체 프로젝트 검사 결과가 없으면 “열린 파일” 범위를 명시한다. 빠른 fix는 provider가 실제로
지원할 때만 노출한다. interface/Spring 후보가 여러 개면 공통 chooser로 고른다.

## 7. 알림·드래그·서비스 수명

NotificationService는 `{id, group, level, title, body, actions, source, at, dedupeKey}` event를 받는다.
그룹 정책에서 popup/log/sound를 분리하고 Herdr 전체 sounds 설정을 우선한다.
한 event는 한 번 소리를 내고 timeline과 balloon이 같은 ID를 참조한다.
풍선 닫기·타임라인 삭제·읽음은 별개다. Herdr core toast 원본을 가로챌 supported hook은
현재 확인되지 않았으므로 core 알림의 완전한 교체는 별도 host 과제다.

DragSession은 `{id, kind, items, sourceContext, origin, pointer, target, generation}`를 소유한다.
preview와 drop highlight는 renderer다. tool/file payload를 구분하고 복수 파일 개수·아이콘을
표시한다. mouse-up/drop/cancel/Escape/화면 전환/수명 종료 시 한 cleanup 경로로 종료한다.
preview가 pointer/drop target을 가로채지 않는지 실제 GPUI에서 검증한다.
native drag image/pointer capture가 없다면 overlay 대안의 한계를 명시하고 host 지원을 검토한다.

각 service·문서·popup은 소유한 focus/scroll handle·listener·timer·작업 token을 release한다.
hidden view를 유일한 background service로 사용하지 않는다. 전용 항상 보이는 host가 조정하되
기존 여러 view에 broadcast되는 명령의 중복 처리를 피하도록 request ID·target document·handler owner를 명시한다.

## 8. Herdr 런타임에서 먼저 증명할 것

모드별 import 경계 때문에 공통 선언은 기존 생성기로 배포할 수 있으나 **모듈 사본의 전역
변수가 하나의 service가 되는 것은 아니다**. 직렬화 가능한 snapshot/명령을 경계로 사용하고
실행 함수·native handle은 owning instance에 둔다. 같은 mod의 여러 복사본이 있는 경우도 포함한다.

`shared/setShared`는 저장되지만 compare-and-swap나 전역 mutex가 아니다. 현재 `window()`
정보에는 안정적인 window ID가 없다. 복수 OS 창의 command 전달·shared scope와 host 수명은
추가 검증 전 미확정이다. 단일 창에서 owner를 먼저 확정하고, multiwindow 공유 상태 지원을
검증 없이 약속하지 않는다. 임의 UUID를 shared에 쓰는 것만으로 리더 선출이 된다고 보지 않는다.

새 구조가 Herdr node 깊이 제한이나 HMR 동작을 악화시키지 않아야 한다. layout 투영은 깊이를
검사하고, 설치를 묶어서 검증한다. 실제 터미널·프로세스는 UI 재구성 때문에 재생성하지 않는다.
