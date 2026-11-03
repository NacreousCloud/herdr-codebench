# 통합 검토

2026-11-03. 정적 검사, mock 계약 검사, Herdr native check, 실제 Computer Use를 함께 수행했다.

## 실제 화면에서 발견하고 수정한 문제

- Stripe의20px 하드코딩을16px로 교정.32px hit area와28px 선택 fill/inset2를 분리해 창 끝 선택색 잘림을 없앴다.
- Project 본문의 중복 제목줄 제거 후 상위 단일 헤더에서 실제 파일/폴더 생성·새로고침·접기 명령을 전달. 누락된3개 SVG 경로도 보완했다.
- Recent Files의 flex 열이0높이로 접히던 문제를 stretch/h_full/size_full로 해결. 실제2열 목록을 확인했다.
- 공통 popup 외부 크기와 내부 메뉴 폭 불일치를 수정. ToolMenu220→240, terminal menu320. 선택 배경과 모서리가 양쪽 padding 안에서 표시된다.
- 가상 목록의 eager native icon 재사용으로 모든 행이 비어 보이는 문제를 CU로 재현. icon factory로 전환하여 deferred renderer 안에서 생성한다. 모든 공통 메뉴 호출부를 전환하고 잘못된 eager icon은 즉시 거부한다.
- PDF 가상 페이지 renderer의 이벤트 등록을 바깥 컨테이너로 이동. TabMenu/TabList handle 해제 경로 교정. 터미널 메뉴는 render의 cx 대신 실제 클릭 eventCx를 사용한다.

## Computer Use 확인

| 항목 | 확인한 결과 |
| --- | --- |
| 메인 셸 | compact 아이콘·선택 inset·섬 모서리·stripe/status와의 외곽 여백 |
| Search Everywhere/Find Action |6탭·검색·선택 행·영문 action id 검색·Esc |
| Recent Files ⌘E | tools/files2열, 편집 필터·하단 경로 |
| 설정 |900×700/좌측145·카테고리 트리·같은 배경·세로 구분선·키맵 그룹 트리 |
| 키맵 검색 | find-recent 검색 후 Navigation의 최근 파일 ⌘E 표시 |
| 설정 적용 | compact 해제→Apply로 셸이 normal로 변함, 재체크→Apply로 compact 복원 |
| 실행 구성 | tree/입력/footer 표시·Esc 취소. Run은 누르지 않음 |
| Project New File | 상위 헤더 버튼으로 실제 생성 입력창 열림·Esc 취소 |
| 공통100행 메뉴 | End에서 Example100 선택+스크롤, Home/페이지 이동/Enter 후 Selected example17 표시, Esc |
| 실제 컨텍스트 메뉴 | stripe 우클릭 후 Down 선택, terminal 우클릭의 아이콘/행/선택/크기·Esc |
| 갤러리 | 버튼/입력/checkbox/stripe/tree/행/탭/색·스크롤, 상태 예제 |

UI 검증 도중 반복 HMR 뒤 Herdr의 out of memory 오류가 발생했다. CU로 창을 재시작해 복구했고 같은 core 터미널을 계속 표시했다. 실제 앱 검증은 새 인스턴스로 반복했다. 메모리 문제 자체를 해결했다고 주장하지 않는다.

## 자동 검사

- python3 design/idea/sync_ui.py --check: 통과.
- node --experimental-vm-modules design/idea/check_system.mjs: 밀도·색·deferred icon·키보드/scroll·stripe inset·layout 보존/idempotence 통과.
- node --check: codenav/activity의46개 최상위JS 통과.
- herdr-app check mods/codenav, mods/activity: 모두 통과.
- git diff --check: 통과.
- 구현별 mock 검증: results/T09–T18 참조. mock는 GPUI 배치 검증을 대신하지 않는다.

## 남은 검증 한계

원격 기계의 연결 실패 UI, 실제 shortcut 추가/충돌 저장, 최근 위치의 실제 점프, codebench로 전환한 전체 수동 회귀, 모든 파일 형식의 PDF/동영상/수정 저장 흐름은 이번 최종 CU에서 전수 실행하지 않았다. 해당 코드의 분기/계약 검사는 수행했다. 외부 명령/HTTP/실행 구성 Run을 검증 목적으로 실행하지 않았다.

OS의 독립 설정 창/traffic lights, native drag-to-dock, IntelliJ 분석 엔진과 HTTP 결과 전용 뷰는 Herdr mod로 동일하지 않다. 에디터 탭32는 관측을 바탕으로 선정한 근사값이다. 모든 픽셀이 같다는 판정은 하지 않는다.

최종 설치 비교: codenav193개/activity1259개 파일의 SHA-256 일치, runtime *.error 없음. appearance compact=true/UI13 유지 확인.
