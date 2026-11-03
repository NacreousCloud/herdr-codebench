# T21 툴 윈도우 설정 통합

별도 ToolSettings600×500 창을 제거하고 설정900×700의 창→툴 윈도우 본문에 위치/표시 표와 복원을 통합했다. 기존 툴바/우클릭/command 진입은 같은 settings windows 페이지로 연결한다. controls는 공통 버튼/checkbox를 사용한다.

Apply/OK에서 변경을 반영하고 Cancel/Esc는 draft를 버린다. 복원도 Apply까지 보류한다. 일반 Apply는 변경된 위치만 arrange에 전달하고, 표시 변경만 있으면 arrange를 호출하지 않는다. 알려지지 않은 tool key와 동시에 변경된 다른 설정을 보존한다.

검증: settings mock 계약(취소·부분 위치 적용·동시 수정 보존·표시만 적용·복원 보류), 공통 시스템 검사, generator drift, 변경JS 문법, herdr-app check mods/codenav 통과. 실제 CU에서 기존 툴바 버튼→통합 페이지 진입, 알림 표시 변경→Esc→재진입 시 취소, 표시 해제→Apply 후 stripe 아이콘 제거, 재체크→Apply 복원까지 확인했다. 프로젝트 패널·터미널 위치를 옮기는 실제 검증은 하지 않았으며 계약 검사로 확인했다.
