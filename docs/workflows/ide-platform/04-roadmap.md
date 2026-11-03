# 전환 순서와 검증 기준

상태: 조사·설계 완료. 아래 P0–P5의 구현 완료를 뜻하지 않는다.
전체를 한 번에 다시 쓰지 않고 기존 동작을 adapter로 보존하며 한 소유자씩 교체한다.

## 단계

| 단계 | 작업 | 완료 조건 |
| --- | --- | --- |
| P0 기준 고정 | 기존 미커밋 작업과 설치 차이 기록, 안전한 baseline 검증, command/owner/복수 창 scope 확인, 전역 도킹의 workspace 승계·현재 layout/keys backup 계획 | 기존 탭·미저장 buffer·터미널·배치 보존 근거와 unresolved 목록. 새 모델을 안전하게 붙일 host 확정 |
| P1 Action System | 액션 descriptor/context/handler registry, capability·presentation, legacy command adapter | 같은 액션이 Find Action·Keymap·클릭·terminal shortcut에서 같은 context로 실행. 단축키 없는 액션도 설정에 보임 |
| P2 Menus and Toolbars | 그룹/surface 모델, Left/Center/Right toolbar renderer, 사용자 patch, 공통 tree editor | 추가·순서·제거·구분선·아이콘·선택/전체 복원·Apply/Cancel·재시작 유지. 기본 업데이트가 사용자 변경을 지우지 않음 |
| P3 Tool Windows | registry+manager, primary/secondary·순서·활성·표시·splitter, content model, DragSession | 8개 기존 도구를 양측 상하/하단으로 옮기고 재시작해도 유지. 메뉴/드래그/설정의 결과 일치. 터미널 주소·탭 보존 |
| P4 Editor Workspace | 문서/탭 단일 owner, dirty buffer·저장/폐기/취소, viewer/editor/review providers, selection/drop/history, versioned snapshots | 마지막 탭·재열기·현재 탭·Project 선택·다중 드롭·미저장 closeAll 중간 취소·외부 변경 충돌·workspace/machine 전환·늦은 결과 무효화 실기 통과 |
| P5 기능 provider | 알림 정책, 진단·관련 위치, 실행 configuration/session/content, HTTP 결과 | 실제 엔진 능력과 표시 분리. 공통 액션·설정·shell 등록만으로 신규 provider 연결 |

P1/P2를 **첫 구조 릴리스**로 삼는다. 현재 툴바의 기능을 바꾸지 않고 공통 모델로 옮긴 뒤
사용자 편집기를 붙인다. 각 단계에서 codebench 회귀를 확인하고 기능 단위 커밋/배포한다.

## 첫 릴리스의 구체적 변경 범위

1. `IDEA_ACTIONS`, `ACTION_NAMES`, action category를 한 descriptor 원본으로 옮긴다.
2. Find Action·Keymap은 원본 registry를 조회한다. 기존 명령 ID는 alias adapter로 유지한다.
3. toolbar의 Project/Branch/Run 위젯은 renderer를 보존하고 group 참조로 바꾼다.
4. `ide.mainToolbar.left/center/right`, editor/tab/Project context와 tool header groups를 등록한다.
5. Settings에 **Appearance & Behavior → Menus and Toolbars**를 추가한다.
6. 사용자 patch를 저장하고 신규/알 수 없는 item·버전·충돌·복원 규칙을 구현한다.
7. 새 sample action을 등록하는 것만으로 Keymap·Find Action·추가 창에 나타나는지 검증한다.

메인 toolbar에 실제 debugger·미지원 IDE action을 추가하지 않는다. 첫 릴리스는 기존 8개
도구와 현재 실행 가능한 액션을 정규화하는 범위다. 복잡한 기능의 새 엔진 구현은 P5 이후다.

## 가장 최근 요청의 처리 위치

| 요청 | 전환 시점 | 확인해야 할 결과 |
| --- | --- | --- |
| 알림 소리 | P0 기존 미검증 코드 점검 → P5 정책 통합 | 설정 on에서 실제 event당 한 번, off/silent에서는 무음. 사용자 청취 또는 장치 경로 확인 필요 |
| Cmd+, / Cmd+Shift+, | P0 최신 keys migration 점검 → P1 공통 액션 | Terminal·viewer·editor 모두 기본 설정 / 모드 설정으로 각각 이동 |
| 좌측 상하 구분선 | P0 최신 island footer 점검 → P3 splitter | 두 창이 열릴 때 구분·resize가 보이고 추가 외곽 gutter가 생기지 않음 |
| 드래그 preview | P0 현재 overlay 방식의 입력 영향 점검 → P3 공통 DragSession | 파일/도구 아이콘이 따라오며 drop·Escape·화면 전환 뒤 ghost가 남지 않음 |
| 문제·인터페이스·Spring 탐색 | P4 namespace → P5 provider | source·line·version 일치, 미지원·다중 후보 안내, semantic engine 한계를 숨기지 않음 |

구조 전환 전에 해결 가능한 작은 오류는 고치되 같은 개념을 다른 화면에 복제하는 새 예외는
추가하지 않는다. 앞선 작업의 소스/설치/실기 상태를 구분해 기록한다.

## 필요한 검증

Pure model에서는 group cycle·중복 item·빠진 reference·patch 충돌·업데이트 후 anchor 유실,
tool move/reorder·빈 slot·active 불변조건, document close 후 늦은 open/diagnostics 결과를 검사한다.
adapter에서는 command context/machine, terminal 키 전달, 사용자 JSON 미래 필드 보존과 실패 복구를 확인한다.

실제 Computer Use에서는 툴바 사용자 지정 왕복, Add Action 검색·키보드, Apply/Cancel,
재시작 후 커스텀 유지, terminal Cmd+Shift+O, 설정 두 단축키, primary/secondary resize,
파일 Cmd/Shift 복수 선택·드롭, 마지막 탭 닫기/재열기, 알림 카드·소리·중복과 focus 복귀를 확인한다.
mock 검사만으로 GPUI focus·pointer capture·geometry·소리를 확인했다고 하지 않는다.

기존 generator `--check`, system/settings/shortcuts/tabs/file_selection/workspace 회귀를 유지하고,
변경 모드 `herdr-app check`와 실기를 통과한 묶음만 설치한다. 이번 조사에서는 실행 모드 코드를
추가 변경하지 않았으므로 새로운 제품 UI 검증 완료를 기록하지 않았다.

## 후속 조사와 보류 경계

| 질문 | 현재 답 |
| --- | --- |
| IDEA 상단·액션·커스텀 구조를 가져올 수 있나 | 답함. static S1–S8 + 실제 C1/C2. JS 모델로 독립 재구현 |
| 도구 창 위치/분할 모델 | 답함. static S9/S10 + 공식 primary/secondary 계약. 상세 native DnD는 일부 미확인 |
| 현재 모드의 필요한 기반 목록 | 답함. 01-current-state의 inventory와 U01–U14 |
| 전체 IDEA 플러그인 최종 action tree | 일부만 답함. 선택 리소스 + 실제 보이는 트리, dynamic/plugin 기여 전체는 미수집 |
| Herdr multiwindow owner/원자적 설정 commit | 미확정. P0 검증 필요, 현재 API로 지원을 단정하지 않음 |
| native drag preview/pointer capture·floating/sliding·OS 메뉴바 변경 | 미확정. host API 능력 조사 후 adapter 또는 core 과제로 결정 |
| PSI·Spring semantic model·debugger·전체 inspections | 이번 범위 밖. 지원할 engine/provider 선택이 별도 필요 |

Database/Gradle/Services 같은 IDEA의 다른 도구는 현재 8개 도구를 공통 구조로 옮긴 뒤
provider 요구를 평가한다. 이름과 빈 UI만 먼저 복제하지 않는다.
