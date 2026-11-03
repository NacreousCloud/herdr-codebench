# T24 — IDEA 공통 Shift 두 번과 설치 키맵

2026-11-03. 사용자 요청: 다른 설치에서도 Shift 두 번을 앱 내 공통 단축키로 사용하고 설정 키맵에 표시한다.

## 구현

- `keys.json`의 `layout:idea`에 `shift shift → codenav.find-all`을 등록했다. 터미널은 `codenav.key:shift shift`를 Status로 보내 동일한 전체 검색을 연다. 다른 레이아웃에서는 이 modifier 시퀀스로 검색하거나 hc에 재전송하지 않는다.
- 코드·탐색기·빈 리뷰의 개별 modifier 감지를 제거했다. 검색은 네이티브 키 시퀀스 한 경로만 사용한다. 설정 키맵은 실제 바인딩을 `어디서나 검색` / `⇧ ⇧`로 표시하고 Navigation 그룹에 포함한다.
- `install.sh`는 `install_keys.py`로 빠진 키를 병합한다. 기존 사용자 키와 충돌하면 보존하고 출력하며 변경 전 원본·권한을 백업한다. 재설치는 추가 변경·백업을 만들지 않는다. 아직 기본 keys.json이 없으면 최초 Herdr 실행을 안내한다. 레이아웃 배치 보존은 그대로다.
- README에 IDEA 브랜치 설치 절차를 명시했다. 확인 당시 GitHub 기본 브랜치는 `main`이고 그 브랜치에는 기존 Double Shift 코드도 없었다. 다른 컴퓨터의 실제 체크아웃은 확인하지 않았으므로 신고 원인으로 단정하지 않는다.

## 근거 및 검증

- 설치된 Herdr는 macOS 0.1.12다. 공식 `herdrdev/herdr-app` 소스 `f6fe216e3078225619621174e62b8b4d8cc56513`의 `src/keys.rs`는 GPUI KeyBinding으로 시퀀스를 로드하고, vendored `window.rs`의 `dispatch_key_event`는 다른 키 없이 modifier를 눌렀다 놓으면 modifier keystroke를 만든다. 앱 실행 파일은 수정하지 않았다.
- `herdr-app check mods/codenav`, `herdr-app check mods/activity`: 통과.
- `check_shortcuts.mjs`: IDEA/terminal 등록, 실제 Status 검색 라우팅, 다른 레이아웃 분기, Ctrl+E 터미널 전달, 설치 병합·충돌·백업·권한·재실행·깨진/누락 파일 보호 통과.
- `check_settings.mjs`: 기존 Apply/Cancel 검증과 실제 settings의 Search Everywhere 라벨·Navigation 그룹·`⇧ ⇧` 표시·검색·terminal 중복 제외 통과.
- `check_system.mjs`, `sync_ui.py --check`, `sh -n install.sh`, `git diff --check`: 통과.
- codenav/activity와 새 바인딩을 이 컴퓨터의 Herdr에 적용했다. 기존 키 변경 없이 두 바인딩만 추가했다.
- Computer Use로 실제 화면을 확인했다. Shift 단독 입력은 도구가 `keyPressIncludedNoNonModifierKeys`로 거부하므로 자동 입력 성공으로 기록하지 않는다. 사용자가 직접 코드·터미널 양쪽에서 Shift 두 번으로 검색이 열림을 확인하고 커밋·푸시를 요청했다. 설정 키맵의 표시는 VM 렌더링으로 검증했으며 이번에는 설정 화면을 별도로 열어 확인하지 않았다.
