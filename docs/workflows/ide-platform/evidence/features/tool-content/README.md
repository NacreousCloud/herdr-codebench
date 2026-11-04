# Problems·Notifications·Run: 기능 안쪽 content 구조 조사

2026-11-04. 대상은 `/Applications/IntelliJ IDEA.app`의 **2026.2.4 / 262.11879.100**.
기존 구조 조사와 같은 `intellij.platform.ide.impl.jar` SHA
`5a19d56e6ff99866f413af64200954a2e61c6dc8258014de0811a08e4312e026`을 확인했다.
이번에는 4개 JAR의 **6개 클래스와 1개 XML**만 선택했다. [identity.json](identity.json)에
JAR 검사 전후 해시·class/resource 해시·full javap dump 해시가 있다.

Python zipfile·기존 JDK javap의 **정적 관찰**이며 REA Evidence가 아니다.
타깃 클래스 실행·앱 UI 조작·설정 변경·Herdr 설치·실행 모드 코드 변경은 하지 않았다.
아래 TC 식별자는 이 문서의 로컬 근거 ID다. 호출이 있다는 사실과 실제 런타임에서
그 경로를 실행했다는 주장을 구별한다.

```sh
python3 docs/workflows/ide-platform/evidence/features/tool-content/extract.py \
  --output /tmp/idea-tool-content-repeat \
  --dump-dir /tmp/idea-tool-content-full-repeat
```

기본 실행은 현재 디렉터리에 발췌·identity를 쓰고 전체 dump는
`/tmp/herdr-idea-tool-content-20261104`에만 쓴다. `[...]`는 생략한 원본 줄이다.
발췌 앞 숫자는 전체 dump의 줄 번호이며 명령 옆 숫자는 bytecode offset이다.

## 직접 확인한 계약

| 근거 | 관찰 | 위치 |
| --- | --- | --- |
| TC1 | Problems는 tool 자체와 그 안의 panel/tab을 나눈다. provider 목록에서 `create()`한 tab을 `ContentFactory.createContent(component, getName(0), false)`로 감싸고 `setCloseable(false)`, `customizeTabContent`, `addContent`를 호출한다. | [ProblemsView](ProblemsView.excerpt.txt), `createContent` offsets 55–92, `createToolWindowContent` offsets 40–94 |
| TC2 | 선택과 보임을 각각 `ProblemsViewTab.selectionChangedTo`와 `visibilityChangedTo`로 전달한다. panel 선택 시 comparator·preview·secondary gear action group을 갱신한다. | [ProblemsView](ProblemsView.excerpt.txt) `selectionChanged`/`visibilityChanged`; [ProblemsViewPanel](ProblemsViewPanel.excerpt.txt) `selectionChangedTo` offsets 4–56 |
| TC3 | Problems의 toolbar, tree popup, secondary menu는 별개 action group ID다. 정렬/그룹/preview/autoscroll 옵션은 panel 상태이며 renderer가 임의로 검사 결과를 만드는 구조가 아니다. | [ProblemsViewPanel](ProblemsViewPanel.excerpt.txt) 필드, `getToolbarActionGroupId`, `getPopupHandlerGroupId`, `createToolbar`, `createComparator`; [problem-action-groups.json](problem-action-groups.json) |
| TC4 | 알림 설정은 `groupId`, `displayType`, log/read-aloud/sound를 별도로 보유한다. `save()`는 그룹 ID와 기본값에서 달라지는 속성을 XML로 직렬화한다. | [NotificationSettings](NotificationSettings.excerpt.txt), 필드와 `save` offsets 14–93 |
| TC5 | 그룹 기본값은 등록된 NotificationGroup의 표시 타입/log 기본값에서 얻는다. `changeSettings`는 새 값이 기본값과 같으면 override map에서 제거하고, 다르면 put한 뒤 group event를 발생시킨다. 전역 balloon/system/announcing/location과 그룹 override는 별도 저장된다. | [NotificationsConfigurationImpl](NotificationsConfigurationImpl.excerpt.txt), `getDefaultSettings`, `changeSettings(NotificationSettings)` offsets 9–58, `getState` |
| TC6 | Run descriptor는 console·process handler·component·attached content·execution ID·configuration name/type·reuse policy·focus/선택/활성화 flags를 별도로 가진다. descriptor는 실행 구성 자체가 아니다. | [RunContentDescriptor](RunContentDescriptor.excerpt.txt), 필드와 attach/execution/activation accessors |
| TC7 | Run content 표시 때 새 content 생성 또는 기존 attached content 재사용 경로가 갈린다. 재사용이면 기존 descriptor에 removed event와 dispose를 호출하고 새 execution/component/focus/display name/descriptor를 연결한다. content 선택과 tool window 활성화는 각 flag를 따로 검사한다. | [RunContentManagerImpl](RunContentManagerImpl.excerpt.txt), `showRunContent(Executor,Descriptor,long)` offsets 55–209, 456–541 |
| TC8 | Run content 제거는 해당 manager에서 `removeContent(content,true)`의 성공 여부를 돌려준다. 이번에 읽은 이 메서드만으로 process의 terminate/detach/확인 정책까지 알 수 없다. | [RunContentManagerImpl](RunContentManagerImpl.excerpt.txt), `removeRunContent` offsets 12–48 |

TC1의 provider 등록은 `ProblemsViewPanelProvider.getEP().getExtensionList(project)` 호출로
확인했다. 단순히 클래스 파일 이름에서 확장성이나 UI 실행 결과를 추정한 것이 아니다.

## 기능별 메뉴·표현을 함께 가져오는 방법

### Problems

`idea/ProblemsViewActions.xml`에서 다음 그룹과 연결을 확인했다. dynamic severity 그룹의
실제 children과 각 액션의 context별 활성화는 실행하지 않았다.

```text
ProblemsView.ToolWindow.Toolbar
├─ Options (popup)
│  ├─ severity filter group
│  ├─ folders first / severity / name sorting
│  └─ group by tool ID
├─ Quick Fixes
├─ Show Preview
├─ Expand All
└─ Collapse All

ProblemsView.ToolWindow.SecondaryActions
└─ Autoscroll to Source / Open in Preview Tab / Show Preview

ProblemsView.ToolWindow.TreePopup
└─ Quick Fixes / Copy Problem Description / Edit Source
```

현재 Herdr `tools.js:346`는 한 Problems body와 file/project scope 토글, errors-only,
파일별 행·위치 이동을 가진다. `ProblemsView`의 형태에 맞추려면 하나의 거대한 body에
분기를 추가하기보다 **Problems content provider + 공통 tree/preview panel + 세 action group**으로
나눈다. 각 provider는 title/count/root/selection/navigation/empty state와 지원 기능을 제공한다.

기본 LSP provider가 진단만 주면 quick fix는 비활성 사유를 표시하거나 숨긴다. 실제 지원
되지 않는 detekt/Qodana/취약 종속성 tab을 이름만 복제하지 않는다. 프로젝트 범위의 현재
데이터는 열린 파일의 캐시다. 진단/정렬/preview 결과에는 문서 version을 연결한다.

Herdr용 UX 재구성 제안은 severity 아이콘·source/code/message·line을 공통 row 모델로
유지하고, selection과 explicit activation을 분리하는 것이다. 클릭/키보드 선택마다 파일을
무조건 여는 현재 방식에서 autoscroll 옵션을 적용할 수 있다. 여러 파일 선택 preview 정책과
empty state 문구는 실제 UI 관찰을 보태야 하며 이 bytecode 조사로 픽셀 값을 정하지 않는다.

### Notifications

현재 Herdr `uiNotify`는 카드/timeline/balloon queue를 만들고 전체 sounds 설정을 gate한다.
`recordAgents`는 별도 event 경로다. IDEA에서 확인한 그룹 정책(TC4/TC5)에 맞추려면
**NotificationGroup 기본 등록 → user override → event → log/popup/sound sink**를 분리한다.
기본값으로 복원하면 override만 제거한다. 타임라인·풍선은 같은 event ID를 보여주고
각 renderer에서 소리를 다시 재생하지 않는다.

시각 구조는 기존 사용자 screenshots 및 root의 Computer Use를 기준으로 공통 card,
timeline header/clear, timestamp, action area를 적용한다. 이번 6개 클래스에는 balloon/card
painter가 포함되지 않았으므로 모서리·여백·위치·타이포그래피 값은 새로 추출했다고 하지 않는다.
`isShouldReadAloud`가 있다는 사실은 Herdr에 TTS 기능이 있다는 뜻도 아니다.

### Run / HTTP / Terminal content

현재 Herdr `run.js:15`는 프로젝트별 named command를 저장하고 이름으로 전용 terminal tab을
찾는다. `isRunning`은 그 terminal의 shell 여부를 사용한다. IDEA의 TC6/TC7을 참고해
**RunConfiguration → ExecutionSession → ToolContent**를 독립 identity로 나눈다.
같은 표시 이름의 구성도 ID로 구별하고 재실행마다 execution ID를 부여한다.

content는 console/HTTP response/test summary 같은 view provider를 연결한다. 다시 실행했을 때
기존 결과 재사용, 새 결과 생성, pin된 결과 보존을 policy로 다루고, 결과 tab 선택과 tool window
활성화·focus 이동은 별도 옵션으로 둔다. 실행 완료가 즉시 현재 편집기 focus를 빼앗지 않게 한다.
content 제거·프로세스 중지·터미널 삭제는 같은 동작으로 묶지 않는다.

Herdr의 실제 terminal/process는 adapter로 유지한다. UI content 재구성 때문에 기존 terminal을
닫거나 다시 만들지 않는다. 기존 ijhttp 실행 엔진은 이 구조의 한 session/result provider로
연결할 수 있다. debugger·JVM process engine을 가져왔다고 표시하지 않는다.

## 현재 기능에서 필요한 구조의 우선순위

1. 도구 창 내부 **ContentDescriptor/ContentManager**를 도킹/stripe와 분리한다.
2. Problems의 toolbar/context/secondary action groups를 실제 provider 능력과 연결한다.
3. selection/visible/active/focus lifecycle을 구별해 preview와 background update 수명을 정한다.
4. 알림 group defaults와 user override, event ID와 sink policy를 통합한다.
5. 실행 구성 ID·execution ID·terminal 주소·content ID를 구별하고 재사용·pin·focus 정책을 둔다.

이 목록은 Herdr에 적용할 설계 선택이다. 이번 조사에서 제품 구현/설치·실기 검증을 완료한
내용이 아니다. 전체 IDEA features나 관련 Java 클래스를 이식한 작업도 아니다.

## 남은 질문

- ProblemsTreeModel의 변경 event·노드 diff, severity providers·quick fix 실행은 미추적이다.
- Notifications의 실제 event delivery·중복/expiry·balloon painting·플러그인별 group 전체는 미추적이다.
- Run process termination confirmation·pin/reuse 조건의 전체 구현과 debugger protocol은 미추적이다.
- 선택한 XML의 references/programmatic groups를 확장하지 않았고 실제 context에서 visible/enabled를 실행하지 않았다.
- 이 조사만으로 Herdr GPUI pointer/preview/native editor 장식 지원이나 notification core hook을 입증하지 않는다.
- pixels·화면 전환·키보드·실제 sound는 root의 Computer Use 및 장치 검증과 결합해야 한다.
