# T11 — 언어별 설치·시작 가이드 통합 결과

- 상태: 구현·설치·실제 Go 초기화 확인. 네이티브 CLI check 제약으로 검토 대기.
- 최종 사용자 결정: SDK/LSP 동봉 취소. 설치는 LLM이 수행할 수 있게 언어·OS·프로젝트·공식 설치 명령·확인 방법·완료 조건을 복사한다.
- 작은 엔진 버전: `0.1.0-8049c1ec7054`, 플랫폼별 6.95–7.77MB. 엔진/API/기본 서버 설정만 로컬 커밋 `6be5d9b`; 기존 idea-ux UI 미커밋 작업은 보존했다. 원격 push는 하지 않았다.

## 적용

하단 LSP 클릭 → Java/Kotlin/TypeScript/JavaScript/Go/Swift/Rust 선택 → LLM용 안내 복사 → SDK·서버 설치 → 프로젝트 폴더의 설치 확인 → LSP 시작.

- 설치 명령은 자동 실행하지 않는다. stdio 서버를 별도 터미널에서 계속 띄워 두지 않도록 안내한다.
- SDK 요구사항·복사 명령·공식 링크는 OS별 모델에서 관리한다. JavaScript와 TypeScript는 같은 typescript 엔진 ID를 사용한다.
- `setup_status`는 실행 파일만 감지하고 서버를 켜지 않는다. `setup_start`는 기존 Go LSP transport로 실제 initialize 응답을 받아야 running=true다. 가상 소스 파일을 생성하거나 didOpen하지 않는다.
- 상태 변경/닫기 이후 늦은 응답을 버리고, 최신 설치 확인 전 시작을 막는다. 복사 동작은 기존 오류를 지우지 않는다.
- 기본 TypeScript 후보에서 classic compiler의 잘못된 `tsc --lsp` 자동 선택을 제거하고 설치 안내의 typescript-language-server를 우선한다. 사용자 overrides는 유지한다.
- 설정의 도구 → 언어 서버와 액션 metadata에도 연결했다. 실제 진입 검증은 하단 LSP에서 수행했다.

## 검증 근거

| 검사 | 결과 |
| --- | --- |
| Go `go test -race ./...`, `go vet ./...` | parent 재실행 통과, race 5.972s. 미설치·잘못된 root·언어 충돌·status 무부작용·인증 HTTP handler·실제 stdio initialize fixture 포함 |
| `design/idea/check_*.mjs` | 19/19 통과. 신규 7언어×3OS 안내 모델 및 LLM handoff/선택·폴더·닫기 race/버튼 선행 조건 포함 |
| sync_ui --check / check_system / diff --check | 통과 |
| 여섯 타깃 build / install.py --verify-only | 통과. 비 host 다섯 타깃은 cross-build/hash 검증이며 native 실행은 하지 않음 |
| 설치 | host 엔진과 9개 가이드/client 파일 배치 설치, 저장소와 설치된 mod 파일 byte 일치 |
| 실제 Herdr GUI | 하단 LSP로 다이얼로그 열림, 키보드로 Go 선택, SDK/gopls 명령 표시, 설치 확인에서 사용자 설치 gopls 감지, 시작에서 “언어 서버가 초기화되어 실행 중입니다.” 표시 확인 |
| 네이티브 CLI check | XPC 제약으로 미통과. 기존 check PID의 종료 시도도 OS가 거부함; 성공으로 기록하지 않음 |
| `engine/check_release.py` | 현 root 실행 권한에서 localhost bind가 EPERM이어서 미통과. 실제 앱이 시작한 엔진의 setup_status/setup_start는 GUI 왕복으로 별도 확인 |
| Postman CLI | `postman status`가 unknown command. Postman collection 검증을 수행했다고 주장하지 않음 |

GUI 확인 중 앱 변경 감지·포커스 불확실성 때문에 자동 승인 검토가 텍스트 붙여넣기를 거부했다. 새 앱 상태에 다시 연결한 뒤 텍스트 입력 없이 하단 LSP를 클릭하는 경로로 실제 화면 및 서버 시작을 검증했다. 기존 핸들로 거부된 동작을 우회 실행하지 않았다.

LLM용 복사 내용/오류 보존은 반복 가능한 VM 검사로 확인했다. 실제 클립보드 내용을 읽거나 외부 LLM에 전송하지 않았다. 공식 문서 링크 열기와 모든 언어의 설치를 이 작업에서 실제 수행한 것으로 기록하지 않는다.

## 취소된 T10 정리

런타임 embed 코드·다운로드/조립 도구·LFS 설정을 제거하고 기존 작은 엔진 기반으로 복구했다. 작업 중 생성한 대용량 payload·SDK·대응 소스·임시 도구·컴파일 캐시를 정리했다. `engine/dist`는 여섯 작은 바이너리 약 42MB이며 원래 설치된 사용자 SDK와 프로젝트 파일은 제거하지 않았다. T10 문서는 취소 이력이다.

## 남은 검증

네이티브 CLI check 전체 통과, Windows/Linux 실제 실행, 실제 모든 언어 설치 및 SDK/프로젝트별 LSP 초기화. 기존 UI WIP 전체를 이 엔진 커밋에 포함하지 않았다.
