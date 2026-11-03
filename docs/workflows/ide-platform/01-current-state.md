# 현재 모드 기준의 기능 목록과 구조 요구

2026-11-04, `idea-ux`, 기준 HEAD `d61150d` + 현재 미커밋 작업.
아래의 “있음”은 소스에 구현이 있다는 뜻이다. 이번 조사에서 설치·실기 검증 완료를 뜻하지 않는다.
`HANDOFF.md`는 과거 인계 자료이므로 현 소스와 다른 내용은 그대로 따르지 않았다.

## 화면과 도구 창

| 영역 | 현재 있는 것 | 앞으로 공통화할 것 | 소스 |
| --- | --- | --- | --- |
| 상단 툴바 | 프로젝트/스페이스 위젯, 브랜치 표시, 실행 구성·실행·중지, 전체 검색, 도구 창 설정, 모드 설정 | Left/Center/Right 그룹, 액션·위젯 등록, 숨김·재배치·복원·overflow | `mods/codenav/tools.js:263` |
| Project | 파일 트리, 현재 파일 선택, 폴더 작업, Cmd/Shift 다중 선택, 드래그 payload | 공통 selection/drag 서비스, header/secondary/context action groups | `mods/activity/files.js`, `tools.js:22` |
| Commit | Git 리뷰 목록·diff·코멘트 | 문서 provider 및 리뷰 액션 그룹, 저장소별 컨텍스트 | `mods/codenav/review.js` |
| Structure | 현재 파일의 LSP 문서 심볼, 계층·현재 위치 | 문서 키별 심볼 snapshot, 정렬·필터 액션, 도구 창 content | `mods/codenav/tools.js` |
| Find | activity의 프로젝트 검색 | 취소·세대 관리, 결과 content 및 탐색 액션 | `mods/activity/search.js` |
| Terminal | Herdr 원래 터미널과 탭, 전용 실행 터미널 | 실제 터미널을 유지하는 content adapter, 키 전달, focus context | `tools.js`, `status.js`, `run.js` |
| Problems | 현재 파일/프로젝트 범위 탭, 심각도 필터, 파일별 목록·행 이동 | diagnostic provider별 workspace snapshot·오류 수·editor decorations | `tools.js`, `code.js`, `bridge/lsp_bridge.py` |
| Notifications | 타임라인·공통 카드, 풍선 queue, 소리 preference gate | 그룹별 표시·소리·기록 정책, 중복 제거, 원본 event 소유자 | `tools.js`, `notice.js`, `design/idea/ui.js` |
| Agents | 기존 Herdr 에이전트 상태·조작을 IDEA shell에 표시 | Herdr 상태 adapter 유지, 공통 action/content 계약 | `mods/codenav/agents.js` |
| 바깥 프레임 | Islands·좌우 stripe·하단 status·경로·좌우 상하 슬롯 | ToolWindowManager와 layout projection, 공통 splitter/drag/drop | `islands.js`, `tool-layout.js`, `tools.js:40` |

현재 도구 창은 **8개**, 배치 슬롯은 **left/left2/right/right2/bottom 5개**다.
하단 보조 그룹, 분리된 OS 창, floating/sliding 모드까지 구현된 상태는 아니다.
브랜치는 표시만 하며 실제 Git 브랜치 전환 UI는 없다.

## 기반 기능

| 영역 | 현재 상태 | 필요한 구조 |
| --- | --- | --- |
| 디자인 시스템 | canonical tokens/ui, 모드별 생성 사본, MenuController·tree·tab·settings shell·tool header | 기존 체계 유지. 렌더러가 선언형 action/group 모델을 소비하게 연결 |
| 검색·이동 | Search Everywhere의 전체/클래스/파일/심볼/액션/텍스트, Recent Files/Locations, 줄 이동·파일 구조 | action/search contributor 등록, 일관된 결과 위치·취소·포커스 복귀 |
| 키맵 | IDEA 31개, codenav 9개, activity 9개, 터미널 전달 12개 바인딩. 설정에서 기존 액션에 키 추가 | 액션 전체 목록, 미할당 액션, 충돌·재정의·제거·복원, terminal/editor에서 같은 명령 실행 |
| 설정 | Appearance, Editor Font, Terminal, Keymap, Tool Windows 5페이지와 draft/Apply/Cancel | provider 기반 카테고리, 메뉴 및 도구 모음, Notifications, pages 간 공통 저장·충돌 처리 |
| 문서·탭 | 소스 viewer, native editor/미디어 viewer, review; 탭·최근 위치·현재 파일 동기화 | 문서/탭의 단일 owner, open/activate/close/reveal/drop 공통 경로 |
| 언어 기능 | LSP 7종 서버 등록, definition/implementation/usages/hover/diagnostics/symbols | 서버별 capability와 문서 generation, UI/검색/탐색 공통 provider |
| 상위 선언·Spring | LSP hierarchy/definition/implementation + 소스 후보 검색 | 관련 위치 provider, 근거·다중 후보·미지원 상태. Spring container 모델은 별도 엔진 과제 |
| 실행 | 프로젝트별 명령 구성, 전용 터미널, 재실행·중지 | configuration provider와 실행 session/content. 실제 debugger는 추가 엔진 필요 |
| HTTP | ijhttp CLI, 환경 선택, 전용 터미널, 실행 간 globals 메모리 전달 | 실행기 유지, 요청·응답·테스트 결과를 표현할 content provider |
| 드래그 | pointer payload, moving ghost overlay, stripe 이동, 파일 다중 드롭 | 단일 drag session·drop target·취소·feedback·cleanup. 현재 네이티브 OS DnD와 동일하지 않음 |

바인딩 수는 현재 `keys.json`의 해당 section 기준이며, IDEA 전체 단축키 지원 수가 아니다.
Problems의 프로젝트 범위는 **열어 본 파일의 LSP 진단 캐시**이며 전체 프로젝트 inspection 결과가 아니다.
Herdr core 알림은 별도 원본 경로가 있어 모드 알림의 풍선/소리와 자동으로 통합되지 않는다.

## 반복 수정을 만드는 중복

| 같은 개념 | 분산된 정의 |
| --- | --- |
| 액션 ID·이름·검색 | `everywhere.js:27 IDEA_ACTIONS`, `settings.js:24 ACTION_NAMES`, `settings.js:34 bindingGroup` |
| 실행·단축키 | `keys.json`, `status.js:27 TERM_KEYS`, `status.js:72` 명령 분기, `code.js` 뷰 내부 키 |
| 툴바·헤더의 액션 | `tools.js:250` 직접 handler와 tooltip, `TOOLS.headerActions`의 별도 명령 |
| 현재 문서 | `activity.editor`, `codenav.area`, `codenav.review.current`, `codenav.tabs`, Herdr layout의 active |
| 도구 창 배치 | `codenav.toolSides` 저장 기본 위치, 실제 layout stack 위치, stripe 숨김 상태 |
| 알림 원본 | uiNotify와 recordAgents, Herdr native toast의 독립 경로 |

도구 창과 canonical UI는 이미 재사용하므로 버리지 않는다. 먼저 액션과 상태의 소유자를
정리하고 기존 화면을 그 모델의 renderer로 바꾼다.

`code.js:447` 근처 publish는 path/배열 identity 중심 변경 감지와 지연 callback의
`editorKey()` 재조회가 섞여 있다. 동일 파일 경로를 다른 space/machine에서 보는 상황은
문서 namespace 전환 때 함께 고쳐야 한다. 조사에서 발견한 위험이며 실제 오염 재현까지 하지는 않았다.

## 사용자 요청을 연결한 요구 목록

| ID | 요구 | 담당할 공통 구조 |
| --- | --- | --- |
| U01 | 알림 타임라인과 오른쪽 아래 풍선 | NotificationService + 공통 카드 |
| U02 | 알림 소리 | notification group 정책 + Herdr sounds adapter |
| U03 | 문제 목록·밑줄·tooltip·오른쪽 진단 rail | DiagnosticService + editor decorations |
| U04 | 좌측 두 창과 상하 구분선 | ToolWindowManager + primary/secondary splitter |
| U05 | IDEA형 viewer/editor | DocumentProvider + 기존 canonical UI |
| U06 | 구현→인터페이스·Spring 종속성 탐색 | RelatedLocationProvider + 공통 chooser |
| U07 | 터미널 Cmd+Shift+O | ActionContext + terminal key adapter |
| U08 | 좌/우/하단 아이콘 이동 | ToolWindowManager.move + DragSession |
| U09 | 파일 다중 선택·드롭으로 열기 | SelectionModel + EditorWorkspace.openMany |
| U10 | 드래그 시 따라오는 파일/아이콘 | DragSession의 preview/feedback |
| U11 | Cmd+, 기본 설정 / Cmd+Shift+, 모드 설정 | 독립된 app.settings / ide.settings 액션 |
| U12 | 마지막 탭 닫기·빈 화면·현재 탭·탐색기 선택 | EditorWorkspace 단일 상태와 source별 selection projection |
| U13 | compact 아이콘·선택 잘림·모서리·외곽 여백 | 기존 tokens/ui/island shell의 계약과 실제 UI 회귀 |
| U14 | 새 기능에도 일관된 UI/UX·설정·커스텀 반영 | extension descriptor + registry + 공통 renderer |

U02/U04/U10/U11의 가장 최근 구현은 일부 소스에 있으나 설치·실기 검증이 남아 있다.
이번 구조 조사 때문에 완료 표시로 바꾸거나 미커밋 작업을 삭제하지 않는다.
