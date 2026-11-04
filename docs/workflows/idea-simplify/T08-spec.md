# T08 — 리뷰 도구 의미 정리와 전체 폭 하단 도구 창

- 리뷰: 소스 열기의 중복 등록/고정 버튼을 하나로 합친다. 이전/다음 변경은 실제 위/아래 아이콘, 전체 파일 context는 이름과 체크 상태가 있는 토글, 코멘트는 현재 행에만 유효한 동작으로 표현한다. 사용자 customization은 원본을 변경하지 않고 렌더 중 같은 action 중복만 제거한다. 삭제/빈/이진/로딩 상태의 불가능한 동작은 비활성화한다. 소스 열기 toolbar와 command는 같은 새 쪽 좌표/삭제 가드를 사용한다. codebench 기존 도구 모양은 유지한다.
- 하단 도구 창: 상위 좌/중/우 모든 content 열의 아래에 위치해 전체 폭을 차지하고 열면 모든 상위 열이 함께 줄어든다. 바깥 stripe와 status는 기존 위치를 유지한다. 마이그레이션은 idempotent, 사용자 크기/순서/active/hidden/터미널 payload 보존이 필수다.
- 분담: parent review.js/i18n/editor context 검사/통합, 기존 chrome 담당 islands/tool-layout/tool-windows/layout template 및 system/workspace 검사. 기존 high effort 유지: live layout 구조와 사용자 상태 보존 복잡성. 결과 문서는 각각 현재 명세와 T08-bottom-result에 기록한다.
- 검증: 실제 review renderer의 중복/아이콘/토글·삭제 가드·new-side 열기, layout 마이그레이션 전후 payload 및 반복 실행 무변경, 관련 전체 VM/check/sync, bounded native check, 배치 설치 후 실제 screenshot/status 확인. 기존 native XPC 제한과 실제 입력 미확인을 통과로 기록하지 않는다.
