# T07 통합 검토

구현/설치 및 화면 확인을 수행했다. 전체 native 검증 완료 상태는 아니다.

후속 지시: Markdown eye를 하단에서 제거하고 헤더의 편집 버튼 바로 왼쪽으로 이동했다. code/native 기존 preview mode와 dirty 버퍼를 유지하며 일반 파일에는 eye가 없다. `check_editor_context.mjs`를 새 위치와 단일 제어/dirty mode 순환 기준으로 갱신해 통과했다. 하단 배치는 아래 최초 T07 기록을 대체한다.

- Settings는 별도 windows 페이지를 제거하고 메뉴 및 도구 모음의 단일 계층 트리로 통합했다. Main Toolbar의 좌/중/우, Tool Windows의 위치별 도구, 헤더/팝업 메뉴/HTTP/리뷰 그룹을 같은 트리에 표시한다. 기존 windows 명령 진입은 Tool Windows 루트를 선택한다. 선택한 도구의 순서·위치·줄 표시 및 액션 추가·구분 기호·아이콘·제거·복원은 기존 draft/CAS 저장을 재사용한다.
- 트리는 native virtual list와 init에서 소유하는 MenuController focus/scroll을 사용한다. 검색은 일치하는 가지를 펼치며 ↑↓/Home/End/PageUp/PageDown/좌우/Enter와 선택 행 스크롤, Space 도구 표시 전환을 지원한다. 저장/취소/미지 데이터·동시 무관 설정 보존은 기존 계약을 유지했다.
- [편집기 담당 결과](T07-editor-result.md)를 검토했다. 상단 일반 eye 제거, Markdown 하단 제어 이동과 dirty 버퍼 보존, source Git 변경 구간의 semantic edge bar/cap 및 텍스트 원점 불변을 검사했다. 네이티브 내부 거터는 공개 API 제약으로 변경하지 못했다. 리뷰의 실제 diff 기능 eye는 유지했다.
- [chrome 담당 결과](T07-chrome-result.md)를 검토했다. stripe는 기존 hit target 안에서 shell inset을 고려한 양쪽 대칭 보정, toolbar의 definite height/중앙 정렬, IslandBottom 별도 border 제거를 적용했다. layout 크기/배치/terminal state는 변경하지 않았다. 공통 갤러리에 stripe 양쪽 상태와 Markdown 하단 제어 예제를 추가했다.

## 검증과 적용

15개 `design/idea/check_*.mjs` 전체 exit0. 마지막 설정/문구/갤러리 보완 뒤 영향받는 check_settings/check_system 및 sync_ui --check, git diff --check를 다시 통과했다. 새 검사는 실제 Settings 트리 모델의 계층/옛 명령 라우팅/접기/검색/키보드 선택과 scroll 요청/로컬 visibility draft/추가·삭제 후 실제 행 선택을 검증한다. 기존 위치 이동/순서/Apply/취소/CAS/키맵 검사를 유지했다.

`herdr-app check mods/codenav`와 `mods/activity`는 각각 5초 제한에서 XPC connection invalid 및 LaunchServices -50으로 종료되지 않았다. 타임아웃으로 기록하며 native check 통과로 주장하지 않는다.

12개 변경 JS 파일(첫 배치11 + 갤러리1)을 실제 앱에 설치했다. 백업: `~/.config/herdr-app/data/native-ide-backups/idea-t07-20261104-142031`. 사용자의 layout/keys/버퍼/터미널을 덮어쓰지 않았다.

`codenav.tool-settings`, `codenav.design-system`을 실제 열고 `herdr-app shot` 결과를 이미지로 확인했다. `/tmp/herdr-t07-settings.png`, `/tmp/herdr-t07-gallery.png`에 통합 트리, 갤러리 정상 상태, 배경의 상단 정렬/양쪽 stripe/Project 아래 별도 밝은 선 부재 및 source Git edge marker가 보인다. 최종 한국어 문구 보완 뒤 `/tmp/herdr-t07-settings-final.png`를 캡처했다. runtime status.errors는 빈 배열이다. 스크린샷은 사용자 터미널이 포함되어 저장소에 넣지 않는다.

실제 포인터/긴 메뉴 키보드 및 Markdown footer의 모든 native 화면 왕복은 이 환경에서 수행하지 못했다. VM dirty/mode 순환 검사를 native 픽셀 검증으로 취급하지 않는다. UI 설정 트리는 사용자 검토가 가능하도록 열어 두었다. 커밋/push는 하지 않았다.
