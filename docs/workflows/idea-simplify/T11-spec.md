# T11 — 언어 선택부터 LSP 시작까지 설치 가이드

- 실행 모드: 전체 구현. 사용자 요청으로 T10 런타임 동봉·대용량 배포를 취소한다.
- 요구사항: Herdr에서 Java/Kotlin/TypeScript/JavaScript/Go/Swift/Rust 선택 → 해당 OS의 SDK·언어 서버 설치 안내 → 설치 확인 → 실제 LSP 시작.
- 기존 약 7MB Go 엔진·Spring·UI와 사용자 서버 설정을 유지한다. 설치 명령은 복사 가능한 안내로 제공하며 자동 실행하지 않는다. 엔진이 서버를 직접 소유하므로 사용자가 stdio 서버를 별도 터미널에서 실행하도록 안내하지 않는다.

## 구조·계약

- `lsp-install-guide.js`: 순수 OS별 안내 모델. INSTALL_LANGUAGES `{id,label,extension,languageId?}`, installationGuide(id,platform) `{title,requirements,steps:[{title,detail,command?,url?}],notes}`. JS/TS 선택은 공유 엔진 ID typescript로 연결한다.
- `lsp-setup.js`: 명확한 크기의 다이얼로그, 언어 선택·폴더 선택·설치 명령 복사·상태 확인·서버 시작. 공통 IDEA 컴포넌트와 키보드/scroll handle 수명 규칙을 따른다. 선택 변경/닫기 후 늦은 응답은 버린다.
- `setup_status`, `setup_start`: 기존 인증된 JSON POST envelope 재사용. 요청 `{lang,root}`. 응답 `{lang,installed,command,root,running,error?}`. installed는 실행파일 감지이며 SDK 정상 동작 판정과 구별한다. status는 서버를 켜지 않는다.
- start는 실제 존재하는 절대 프로젝트 디렉터리와 지원 언어를 검증하고, 가상 파일명으로 root를 결정해 기존 LSP transport의 initialize 성공 후 running=true를 반환한다. 가상 파일은 생성하지 않는다. 실제 파일을 didOpen하는 기능은 기존 편집기에 남긴다.

## 담당

- 안내 모델: editor_layout, medium에 해당하는 작업이나 기존 high 세션 설정을 계승; 플랫폼 도구·공식 문서 검증 포함.
- 네이티브 UI: shift_audit, 기존 high 세션 계승; focus/async state·공통 디자인 계약.
- Go API: go_lsp_core, 기존 high 세션 계승; 프로세스 소유권·실제 초기화·부작용 검증.
- parent: 취소된 T10 변경/생성물 정리, 엔진 route·view/진입점 연결, 빌드·검증·배치 설치 및 실제 화면.

## 검증

Go race/vet, 지원/미지원 언어·미설치·잘못된 폴더·status 무부작용·실제 초기화 fixture, 안내 모델의 7언어×3OS와 공유ID, 선택 변경/닫기 후 async 응답 및 버튼 동작 VM 검사. sync_ui --check·공통 시스템·기존 JS 회귀, 여섯 작은 엔진 빌드/체크섬/host API smoke, 실제 가이드 화면·오류/준비 상태. native CLI check 실패는 성공으로 기록하지 않는다.
