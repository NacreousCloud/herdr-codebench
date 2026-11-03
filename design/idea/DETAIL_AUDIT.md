# IntelliJ Islands 세부 UI 분석과 반영

기준: 사용자가 제공한 stripe/설정 이미지, 실제 IntelliJ Computer Use, 설치된 테마·키맵 XML·Java 렌더링 자원. 실제 활성값은 Islands Dark / compact / UI13 /100%다. Retina 캡처는 물리2px를 논리1px로 환산했다. 자원 근거는 docs/workflows/intellij-parity/results/T07-artifact-audit.md와 T08-keymap-runtime-audit.md를 참조한다.

## 아이콘·선택·외곽 간격

| 관찰 항목 | 선정 기준과 반영 |
| --- | --- |
| compact 아이콘 | stripe 안의20px 하드코딩을16px로 교정. 아이콘만 키우지 않고 hit area32 유지 |
| 선택 fill |32×32 hit area 안쪽2px,28×28 fill/radius6. 창 왼쪽·오른쪽 끝으로 파란색이 잘려 보이지 않게 함 |
| 상태 구분 | 활성 accent+선택용 흰 아이콘, hover 별도색, 비활성 글자/메뉴 실행 불가 |
| 섬 | compact arc16의 논리 radius8. Java의 quadratic mask를 GPUI의 둥근 모서리로 근사 |
| 섬 사이 | borderWidth4→각 섬의 canvas 마스크2. 이웃끼리4px, stripe/status와 별도 root gap 없음 |
| 섬의 아래 끝 | 모드 본문 뒤 공통 rounded bottom cap. 기본 agents 본문도 로컬 view로 소유 |
| 탭 | bar32, fill24/inset2/radius4, 활성/비활성 선택색.32는 선정한 근사값 |
| 툴 헤더 |31높이, 도구 버튼26, 아이콘16, Project/Find 본문 중복 제목 제거 |

간격은 컨테이너 gap과 자식 padding을 더해 판단한다. root/body/work-body를0으로 두고 island만2를 갖게 했다. 스타일 적용을 위해 사용자 패널 폭·순서·활성·숨김을 초기화하지 않는다.

## 설정 이미지 분석

이미지의 약1800×1400 물리 영역은900×700 논리 창이다. 좌측 약290물리=145논리. 제목줄28, footer46, 본문은 남은 높이를 채운다. 두 열은 같은#191A1C 표면이고 세로 경계선만 둔다. 현재 카테고리의 선택색은 열 전체를 채우며, 하위 항목은14px 단위로 들여쓴다.

키맵은 왼쪽 독립 leaf, 오른쪽 제목→scheme→검색/도구→테두리 있는 그룹 트리 순서다. 트리의 선택·펼침·비활성·검색 결과를 각각 실제 상태로 표시한다. Herdr에 존재하는 명령과 유효 바인딩만 그룹화하고, 존재하지 않는 JetBrains 플러그인 범주를 동작하는 것처럼 추가하지 않는다. 단축키 추가는 실제 키 입력을 캡처하고 Apply 시 기존 개인 키 파일과 낙관적으로 병합한다. 취소는 저장하지 않는다.

하단 Cancel/Apply/OK는 공통 버튼이며 변경 전 Apply는 비활성이다. 저장 중 버튼을 잠그고 실패하면 오류를 표시한다. compact Apply는 실제 셸 치수까지 갱신한다. 최종 CU에서 해제→Apply와 체크→Apply를 모두 확인했다.

Herdr mod overlay에는 별도 macOS 설정 창의 traffic lights와 OS 제목표시줄을 동일하게 만들 수 있는 인터페이스가 없다. 이 부분은 앱 내부 dialog shell로 표현했다.

## 공통 메뉴의 잘림과 렌더 수명

메뉴는 외부 overlay width와 내부 width가 같아야 한다. ToolMenu220/240 불일치와 terminal250/320 불일치를 교정했다. padding6+border1을 양쪽에 확보하며 height에도14를 포함한다. 긴 메뉴는 가상 목록·stable row key·선택 스크롤·키보드를 공유한다.

실제 CU에서 eager native icon을 가상 행에 재사용하면 목록 전체가 비는 문제를 발견했다. 모든 메뉴는 `icon: () => graphic()` factory로 행을 그릴 때 생성한다. event handler는 가상 행 안에 두지 않고 list.on_item_click에 등록한다. Enter/숫자/클릭은 실제 항목의 action을 실행하고 disabled/구분선은 건너뛴다.

## 앞으로의 화면

원본 ui.js/tokens.json→생성기→각 모드의 로컬 import 경로를 따른다. 새 상태가 필요하면 공통 API와 갤러리를 확장한 뒤 화면에 적용한다. 일회성 색/치수를 화면마다 복사하지 않는다. COMPONENTS.md와 루트 AGENTS.md에 사용·검증 규칙이 있다. 전체 구현·CU 범위와 미검증 경로는 docs/workflows/intellij-parity/07-integration-review.md를 따른다.
