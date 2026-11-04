# T06 editor 결과 — 소스·Commit Review 공통 표시 구조

## 공통 계약

`mods/codenav/editor-surface.js`는 문서/버퍼/LSP/git 상태를 소유하지 않는 실제 표시 조립 모듈이다.

| 함수 | 책임 | 호출자가 주는 정보 |
| --- | --- | --- |
| `editorGeometry(font,charWidth,{lineCount,numberColumns})` | 행 높이, 숫자 열 폭, gutter, 본문 inset/원점 | 기존 사용자 에디터 글꼴/측정 폭, 실제 최대 줄 번호와 열 수 |
| `editorGutter(geometry,{numbers,rails,marker})` | 고정 폭 gutter와 공통 padding/열 간격 조립 | 실제 줄 번호, 변경·댓글 rail, 탐색 또는 diff +/- 마커 |
| `editorLine(geometry,gutter,content)` | 고정 높이 행과 같은 본문 시작 좌표/수직 정렬 | gutter element와 실제 토큰 element |
| `editorViewport(id,{scroll,theme,font,gutter,width,render,onUp})` | 글꼴·배경·스크롤 viewport, 전체 높이 gutter 선 | 기존 Scroller, 실제 행 renderer와 text drag 종료 callback |
| `editorGuide(gutter,scroll)` | 가로 스크롤을 따르는 1px 전체 높이 경계 | 동일한 gutter 경계와 실제 스크롤 offset |
| `editorSurface(root,{topCorners})` | 조립이 끝난 root의 clip과 실제 상단 모서리 mask | tab 줄이 숨겨졌거나 없는지 여부 |

치수·색은 기존 생성 디자인 모듈의 IDEA/editor metric과 `uiColors()`를 쓴다. font는 기존 `codeFont()`를 받으므로 source/review가 같은 사용자 글꼴과 크기를 쓴다. 새 프레임워크나 별도 편집 엔진은 추가하지 않았다.

## 호출부 변경과 보존

- Source와 IDEA Commit Review가 같은 geometry/gutter/line/viewport 함수를 실제로 호출한다. 소스는 숫자 한 열, 리뷰는 old/new 두 열을 제공한다. 리뷰는 최대 old/new 줄 번호와 실제 측정 글자 폭으로 gutter를 계산하고, 그 본문 원점을 `pickWord`와 댓글 gutter hit test에도 사용한다. `+/-`, 추가/삭제 색, 이전/다음 차이, 실제 구간/원본 git 데이터는 유지한다.
- 리뷰의 가로 내용 폭은 IDEA에서 같은 본문 원점과 측정 글자 폭을 기준으로 계산한다. hunk 높이도 스크롤에 등록한 높이와 실제 높이를 같게 맞췄다. 댓글 카드는 실제 본문 원점에 정렬하며 old/new comment side·범위·전송 데이터는 유지한다.
- 리뷰 metadata 줄은 실제 diff 동작을 유지하면서 source의 breadcrumb 높이와 작은 버튼 크기를 사용한다. IDEA의 일반 단어 선택은 source처럼 아래 word/action/LSP 줄과 사용되지 않는 hover 요청을 만들지 않는다. F1/Ctrl+J 문서와 명시적 usages 결과는 별도로 열 수 있고, 댓글 편집/카드/결과 패널은 유지한다. 실패한 정의 탐색은 기존 notify로 표시한다.
- natively 소비된 `usages`/`definition`/`implementation` 명령은 기존 review command loop에서 실제 활성 main review, 로컬 new-side LSP 사용 가능 상태와 실제 선택 단어를 검사한 뒤 실행한다. sidebar나 비활성/원격/삭제된 쪽은 실행하지 않는다. 터미널에서 review usages를 보내는 문맥 판정은 keymap 담당이 연동한다.
- Source와 Review의 파일 drag/drop import·수신 handler를 제거했다. 행의 텍스트 선택/댓글 범위 drag와 Scroller의 스크롤 drag는 유지한다.
- IDEA에서 tab 줄이 숨겨지거나 없으면 조립된 root의 마지막에 canvas 색의 실제 native PathBuilder 모서리 cutout 두 개를 그린다. 전체 자식 배경 뒤에 남는 native radius 가정에 의존하지 않는다. `islands.js`는 이미 editor-area 부모를 canvas로 소유하므로 구조·크기·간격을 추가로 바꾸지 않았다. 탭이 있으면 tab 줄이 상단 모서리를 계속 소유한다.
- Source의 registry 동작에 해당하는 raw 키 처리도 현재 `effectiveShortcuts()`와 `normalizeChord()`로 검사한다. 삭제/재할당한 예전 shortcut을 raw handler가 되살리지 않는다. codebench의 기존 로컬 키와 source의 일반 복사/검색/텍스트 조작 및 F1/Ctrl+J는 유지한다.

codebench 리뷰의 111px gutter/135px 본문 원점과 기존 gap/번호·행 조립은 유지한다. codebench 소스의 기존 gutter/12px inset·키 동작도 유지한다. 요청한 파일 DnD 제거는 두 뷰 모두에 적용한다. 버퍼·저장·LSP bridge·리뷰 git 로딩 모델은 교체하지 않았다.

## 검증

다음 검사는 종료 코드 0이다.

- `node --experimental-vm-modules design/idea/check_editor_context.mjs`: 실제 shared 모듈과 두 호출부를 로드한다. source/review 공통 viewport 글꼴/배경/원점/행 조립, 두 diff 번호·+/-·추가/삭제 색, 댓글 old/new 구간, source/review selection 차이, 명시 문서/참조, 실제 review command 소비 guard, DnD 수신 부재, 전체 높이 gutter·가로 clip, 빈 editor/tab 유무의 canvas mask와 keymap 삭제/재할당/정규화 alias를 검사한다. 기존 workspace/remote/late response/dirty save 검사를 유지한다.
- `node --experimental-vm-modules design/idea/check_review_navigation.mjs`: 차이 block 순환과 늦은 workspace/file diff 응답 격리를 검사한다.
- `node --experimental-vm-modules design/idea/check_system.mjs`: 공유 디자인·메뉴·레이아웃 보존/멱등성 검사를 통과했다.
- 변경 editor source/test 파일의 `git diff --check`를 통과했다.

네이티브 CLI 검사·설치·커밋·하위 에이전트 생성은 수행하지 않았다. 실제 native PathBuilder mask의 픽셀·짧은 source/review의 gutter 연속성·리뷰 metadata 줄·native key 소비/터미널 usages는 부모 통합 화면 검증이 필요하다. VM 검사를 실제 화면 통과로 취급하지 않는다.
