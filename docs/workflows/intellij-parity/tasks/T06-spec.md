# T06 — Recent Locations와 편집기 글꼴 설정

R02/R04. 수정 범위 mods/codenav/everywhere.js 및 신규 locations.js, mods/activity/editor.js, results/T06-result.md. 앞선 담당자들은 이 파일 편집을 종료했다. root는 status.js 및 keys.json 연결을 맡는다.

Recent Locations는 실제 caret 위치 기록에서 최신순 위치를 검색·재방문해야 하며 Recent Files와 같은 결과로 위장하지 않는다. locations.js는 export recordLocation()을 제공한다. root가 Status.render에서 호출한다. shared codenav.caret와 editorSpec(활성 file 일치), editorKey()로 프로젝트별 shared codenav.locations 배열에 기록한다. 스냅샷은 path, on, line(0-based), col(0-based), scope, at. 같은 파일+같은 줄 중복을 갱신하고 같은 파일 연속 caret 이동은 debounce/짧은 시간 coalesce해 매 글자마다 shared write하지 않는다. render 중 shared 쓰기는 하지 않도록 recordLocation(self,cx)로 만들고 timer.after 안에서 재확인 후 쓴다. 최근 100개 한도, 이동 기밀 내용은 저장하지 않는다. mode locations의 검색은 파일명/경로/scope 대상이고 결과는 파일·줄 번호·scope를 보여준다. pick은 해당 on 머신에 정확한 line/column으로 openPath한다. 기존 최근 파일도 remote on을 잃지 않게 확인한다.

appearance 설정 계약 확장: shared codenav.appearance {uiFont,uiSize,editorFont,editorSize}. root의 codeFont는 이 editor 값을 읽는다. activity editor의 native EditorState/일반 diff도 같은 값을 읽도록 구현한다. live native 글꼴 갱신 API가 없으므로 다음 파일 로드 적용은 결과 문서에 명시. 코드나 입력 내용을 버리고 재생성하지 않는다. 변경 후 node --check와 순서/중복/remote 위치 계산의 의미 있는 검사, 결과 기록. 설치·앱 조작·커밋·푸시 금지. medium 유지.
