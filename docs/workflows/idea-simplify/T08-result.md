# T08 통합 결과

리뷰 도구와 하단 전체 폭 배치를 구현해 실제 Herdr에 적용했다. native check 전체 통과 상태는 아니다.

추가 UI 교정: 메뉴 및 도구 모음의 위/아래 버튼을 chevron-up/chevron-down 동일 계열로 통일했다. 실제 chevron-up SVG 누락도 발견해 기존 Lucide down과 같은 치수·선 굵기의 상향 자산을 추가했다. 리뷰/소스의 기존 상향 참조도 이제 실제 자산을 사용한다. check_settings 및 diff --check 통과 후 설치했다.

- 리뷰: 이전 변경은 chevron-up, 다음은 chevron-down, 소스 열기는 external 아이콘 하나로 통합했다. Review.toolbar의 동일 action 중복은 원본 사용자 customization을 변경하지 않고 렌더에서 제거한다. 추가 고정 rv-open은 IDEA에서 제거했다. 눈 아이콘 대신 ‘전체 파일’ 체크 토글을 사용하며 코멘트/이동/열기의 불가능한 상태는 비활성이다. 소스 열기의 command/toolbar는 하나의 가드·새 쪽 좌표 처리로 통합했다. codebench의 기존 fixed toolbar는 유지한다.
- [하단 담당 결과](T08-bottom-result.md)의 노드 보존/idempotence/사용자 비율/stack·terminal payload 검증을 확인했다. `memory.js`의 IDEA areaWeight 대상은 idea-upper로 변경하고 기존 side-by-side split 복원은 codebench에만 유지했다. 새 check_memory는 workspace 저장/복원과 legacy fallback을 검증한다.
- 이전 후속 Markdown 요청은 상단 eye를 편집 버튼 바로 왼쪽으로 옮겨 적용했다. `/tmp/herdr-markdown-preview-header.png`에서 직접 확인했고 하단 제어는 없다.

## 검증 및 런타임 복구

16개 check_*.mjs, sync_ui --check 및 git diff --check가 통과했다. 리뷰 renderer 검사에는 source-open 중복/화살표/이름 있는 토글/사용자 중복 action/삭제·이진 상태 비활성/old-only 행의 new-side source 좌표가 포함된다.

최초5개 파일 배치 설치 후 mod HMR이 `Null"null"` reload 오류를 반복하며 CLI socket이 끊겼다. 이전 review 파일만 임시 복구하고 plain `herdr-app`으로 창 연결을 정상 복구했다. 이어 최신 review.js를 단독 재적용해 실제 리뷰 toolbar 렌더 및 errors=[]를 확인했다. 오류의 native 내부 원인을 확정하지 않았으며 소스 회귀 통과만으로 정상 HMR을 주장하지 않는다.

복구 후 자동 shell migration이 기존 live 파일에 반영되지 않아, 현재 설치된 layouts/idea.json 원본을 읽고 변경 직전 raw 동일성 확인 후 순수 ensureBottomSpan을 적용했다. 저장소 template으로 덮어쓰지 않았다. 현재 노드/크기/stack/terminal 값은 모두 그대로 이동했다. live layout 원본과 mod 파일 백업은 `~/.config/herdr-app/data/native-ide-backups/idea-t08-20261104-143329/`에 보관했다.

`layout.show terminal-panel`, `layout.select bottom-problems`로 실제 하단 창을 열고 `/tmp/herdr-t08-full-width.png`를 캡처해 이미지로 확인했다. 좌측 Project/Notifications, 중앙 Review, 우측 Codex 터미널이 같은 윗영역에 있고 Problems는 좌우 stripe 안쪽 전체 폭을 차지한다. 리뷰 toolbar의 중복 열기와 눈 표시가 제거되고 ‘전체 파일’ 토글이 보인다. 최종 runtime errors는 빈 배열이다. 사용자 터미널이 포함된 이미지는 저장소에 넣지 않는다.

bounded `herdr-app check mods/codenav`는 기존 XPC 문제로5초 timeout이다. 실제 포인터 resize/워크스페이스 왕복은 이 환경에서 미검증이며 VM 보존 검사와 실제 화면 렌더를 구분한다. 커밋/push는 하지 않았다.
