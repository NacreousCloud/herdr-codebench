# T12 — YAGNI/KISS/DRY 정리 및 커밋·푸시

- 실행: 구현·검증·설치·로컬 커밋·origin/idea-ux push까지 사용자 승인됨.
- 기존 idea/codebench 동작, UI/UX, 키맵, 사용자 설정·터미널·레이아웃을 보존한다. 취소된 동봉 엔진을 다시 넣지 않는다.
- YAGNI: 실제 런타임 참조가 없는 구 Python LSP 서버/대체 구현을 감사하고, Go 대체 동작의 근거가 있으면 제거한다. 과거 helper의 안전한 종료 식별자는 유지한다.
- KISS: 깊은 분기·같은 명령 처리·의미 없는 wrapper/임시 상태를 단순화한다. 새 프레임워크나 범용 추상화를 도입하지 않는다.
- DRY: 소스/리뷰의 실제 동일 로직과 상태/설정의 동일 액션을 기존 공통 함수로 합친다. 서로 다른 상태의 우연한 코드 모양은 억지로 합치지 않는다.

## 책임과 계약

- editor_layout: code.js/review.js/editor-model.js/editor-surface.js 및 직접 관련 검사. 에디터/리뷰 상태·거터·히트 테스트·탐색 보존.
- shift_audit: status.js/settings.js/lsp-setup.js 및 직접 관련 검사. 명령 라우팅·설정 CAS·비동기 세대/handle 정리 보존.
- go_lsp_core: 구 Python bridge/navigation와 그 전용 검사 사용 감사·제거, main.js/common.js의 구 bridge 주석만 변경 허용. Go API/바이너리/설정 계약 불변. 안전 종료 식별자 유지.
- parent: 문서 정리·통합·검증·앱 설치·전체 변경 검토·커밋·푸시. 별도 작성된 기존 UI WIP도 이번 사용자 요청에 따라 검토 후 함께 커밋한다. 민감 값·취소된 대용량 파일은 포함하지 않는다.
- 위임은 문서 기반 개발 스킬의 파일 범위 분할 규칙에 따른다. 기존 세션 설정을 계승하며 명확한 리팩터 범위를 사용한다.

## 검증

기존 19개 JS 회귀 검사, 생성 파일 동기화·check_system·diff --check, Go race/vet 및 여섯 바이너리 해시/host release smoke. 현재 권한에서 native check와 실제 UI 재확인. 필요 이상 테스트를 늘리거나 구조를 확장하지 않는다. 미실행/제약은 성공으로 표시하지 않는다. push 직전 staged diff와 파일 크기를 확인하고 force push하지 않는다.
