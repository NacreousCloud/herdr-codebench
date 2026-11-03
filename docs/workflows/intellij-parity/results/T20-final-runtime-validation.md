# T19/T20 최종 런타임 검증

T19는 갤러리에 uiCheckbox/uiStripeButton/uiTreeRow/uiSettingsShell의 상태 예제를 추가했다. 모든 동작은 인스턴스 로컬 상태만 변경한다.

T20에서 실제100행 메뉴가 텍스트 없이 렌더되는 문제를 확인했다. 단순 div 행으로 좁혀 native 아이콘 lifetime을 분리했고, 아이콘을 deferred renderer 안에서 생성하는 factory로 바꾸어 정상 렌더를 확인했다. HTTP환경/실행/탭목록/프로젝트/새터미널/터미널·파일 context 메뉴의 icon을 함께 전환했다. 공통 uiMenu는 eager icon을 거부한다. mock 검사는 factory가 실제 renderer 안에서 호출되는지 확인한다.

CU: End→Example100 선택·하단 스크롤, Home→PageDown→Enter→Home 뒤 상태 Selected example17, Esc로 취소. 실제 ToolMenu에서 Down 선택과 오른쪽 둥근 inset을 확인했다. Terminal context에서 아이콘과 선택 행을 확인했다. 설정에서 compact 해제/Apply 및 재체크/Apply가 셸 geometry를 바꾸는 것을 확인하고 복원했다.

46개JS 문법·생성물 drift·공통 계약·두 모드 native check·diff 공백 검사 통과. source/installed 일치 검사는 최종 배포와 함께 수행했다. 새 기능의 상세 계약과 이후 검증 목록은 COMPONENTS.md를 따른다.
