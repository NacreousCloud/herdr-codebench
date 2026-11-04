# idea-ux 구조 정리 및 화면 개선

- 실행 모드: 구현. 기존 idea-ux 미커밋 변경을 보존한다.
- 현재 단계: 구조 정리 후 UI 구현/회귀 검사 및 실제 화면 확인. 네이티브 CLI check는 아래 제약으로 미통과다.
- 범위/검증 계약: [계획](plan.md)

| 작업 | 상태 | 담당 |
| --- | --- | --- |
| T01 레이아웃 탐색·파일 탭 ID 중복 제거 | 검토 대기 (CLI 제약) | 하위 구현 에이전트 |
| T02 설정 저장 재시도 공통화·툴 상태/화면 책임 분리 | 검토 대기 (CLI 제약) | 주 에이전트 |
| T03 설정 겹침·상태바·편집기·Project 트리 개선 | 검토 대기 (CLI/입력 검증 제약) | 주 에이전트 + 파일 범위를 나눈 편집기/트리 담당 |
| T04 도구 드래그·내부 Outline·하단 스트립 제거, stripe 구분선, 폴더 열기 수정 | 검토 대기 (native check/선택기 왕복 미확인) | 주 에이전트 + 편집기 담당 |
| T05 마지막 탭·빈 편집기·거터 선·검색 단축키 교정 | 검토 대기 (native check 제약) | 주 에이전트 + 편집기 담당, Shift API 읽기 전용 감사 |
| T06 위치별 툴 순서·파일 DnD 제거·공통 리뷰 편집기·키맵 편집·터미널 검색·빈 모서리 | 구현·설치/회귀·화면 확인, native check 제약 | 부모 통합 검토 + 담당별 결과 |
| T07 Markdown 하단 제어·Git 거터·stripe/툴바 정렬·설정 단일 트리·섬 seam 제거 | 구현·설치/15개 회귀·실제 설정/갤러리/프레임 확인, native check·직접 입력 검증 제약 | 부모 설정/통합 + 편집기/chrome 담당, [명세](T07-spec.md), [통합 결과](T07-result.md) |
| T08 리뷰 툴바 의미/중복 정리·전체 폭 하단 도구 창 | 구현·설치/16개 회귀·전체 폭 실제 화면 확인, native check·실제 resize 제약 | parent 리뷰/통합 + chrome 담당, [명세](T08-spec.md), [결과](T08-result.md) |
| T09 Go LSP/Spring 엔진·환경별 바이너리·Super 오류·IDEA 진행 아이콘 | 구현·설치·로컬 엔진 커밋/17개 VM·Go race·실제 Go/Java/Kotlin 확인, native check 제약 | parent 통합 + core/탐색/Spring 담당, [명세](T09-spec.md), [결과](T09-result.md) |
| T10 언어 서버·실행 런타임 바이너리 동봉 | 사용자 요청으로 취소: 대용량 동봉 중단, 원래 작은 엔진 복구 | [취소된 명세](T10-spec.md) |
| T11 언어별 SDK/LSP 설치·시작 가이드 | 구현·설치·19개 VM/Go race/vet·실제 Go 감지/초기화 확인, native check 제약 | parent + guide/UI/Go 담당, [명세](T11-spec.md), [결과](T11-result.md) |
| T12 YAGNI/KISS/DRY 정리·커밋·푸시 | 구현·배치 설치/19개 JS·Go race/vet·release smoke 통과, native check/현재 화면 검증 제약 | parent + editor/status/legacy 담당, [명세](T12-spec.md) |

구조 검증과 실제 앱 검증 결과를 기록한 뒤 상태를 갱신한다. 네이티브 check 실패/미실행을 통과로 처리하지 않는다.

구조 검증: 기존 check_*.mjs 14개 전부 exit 0, sync_ui --check exit 0. codenav에 1회 배치 적용 후 status.errors=[]와 실제 화면 확인. `herdr-app check mods/codenav`는 12초 timeout이며 통과로 기록하지 않는다. 런타임 갤러리/메뉴 키보드 검증은 남아 있다.

UI 결과와 제약은 [통합 결과](results.md), [편집기](T03-editor-result.md), [트리](T03-tree-result.md)에 기록한다. 14개 회귀 검사 통과 후 UI를 배치 적용했고 설정/트리/소스 편집기/공통 갤러리를 실제로 열어 확인했다. 소스 행 높이 배율 오류는 실제 화면에서 발견해 제거하고 첫 줄 정상 표시를 확인했다. 전체 native check 통과 및 실제 포인터/긴 메뉴 키보드는 미확인으로 남긴다.
