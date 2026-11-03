# T09 공통 시스템 구현 결과

원본 `design/idea/ui.js`, 생성기 `sync_ui.py`, `COMPONENTS.md`와 두 모드의 `idea-design.js`/`idea-tokens.js`를 구현했다. 토큰 원본은 기존 `tokens.json`을 그대로 소비한다. 다른 소스·layout·설치 파일은 수정하지 않았다.

- 기존 IDEA/isIdea/uiSize/ideaUI/popupSurface export와 import 경로 유지.
- compact getter, 의미별 색, 버튼·아이콘버튼·입력·행·헤더·툴바·탭·구분선·caption·dialog·island 마감 제공.
- MenuController는 init에서 만든 focus/virtual-list scroll handle과 at을 소유한다. 키보드 이동/구분선·비활성 건너뛰기/Enter/Escape/명시 숫자 shortcut과 선택 스크롤 제공. ensureVisible 및 scroll 공개.
- uiMenu가 popup와 virtual list의 명시 높이를 계산해 auto-size flex 접힘 방지. closeOnActivate:false로 실제 비동기 완료 후 닫기 지원.
- 생성기는 --check drift 실패코드와 반복 --mod로 새 기존 모드 폴더를 지원한다.

검증: Node module syntax check 통과. 선언 파일에서 사용한 element API 이름 inventory 확인 통과(미지원 후보 없음). focus_handle 호출 위치가 controller constructor 한 곳임 확인. sync_ui.py 기본 생성과 --check, 명시 --mod codenav --mod activity --check 통과.

동작 fixture 검증을 위해 ui.js와 tokens.json만 읽는 Node 인메모리 mock 명령을 두 차례 시도했으나, PreToolUse 읽기 정책 hook이 민감파일 참조로 차단했다. 우회하지 않았으며 이 동작테스트는 **미실행**이다. 실제 Herdr 설치/CLI/CUA/커밋/푸시는 담당 범위에서 실행하지 않았다. GPUI 실화면의 높이·포커스·스크롤, source-backed 색의 시각 결과와 모든 호출자 연결은 root 통합 검증이 필요하다.

계약 확장: `MenuController.ensureVisible(index=this.at)` 및 공개 scroll, `uiMenu`/controller.key의 `closeOnActivate=true` 옵션. 기존 API에 추가한 선택 옵션이므로 기존 호출자 호환. 사용 예제와 lifecycle은 COMPONENTS.md에 기록했다. dialog는 auto-size overlay에 h_full만 쓰면 실제 높이가 정해지지 않으므로 기본360을 주고 호출자가 .h(높이)로 덮도록 명시했다.
