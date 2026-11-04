# T09 — Go 엔진, LSP와 Spring 탐색, 진행 아이콘

사용자 추가 지시로 Python bridge 기본 경로를 독립 Go 엔진으로 교체한다. macOS/Linux/Windows × amd64/arm64 네이티브 바이너리와 source/version/SHA manifest를 저장소에 포함한다. 기존 editor/layout/keymap 데이터와 codebench를 보존한다. 별도 앱 본체나 IDE 프로세스를 수정하지 않는다.

## 계약

Go engine의 loopback API는 기존 {ok,result}/{ok:false,error}, zero-based UTF16 Location 계약을 유지한다. port47822, state ~/.cache/herdr-codenav/engine.json (0600), token/Host/Origin 확인, bounded body/timeouts. 기존 LSP methods + related/spring_markers/spring_project를 제공한다. 언어 서버는 기존 servers.json 설정의 외부 Java/Kotlin/TS/JS/Go/Swift/Rust 프로세스를 실제 LSP stdio로 관리한다. Go 엔진 바이너리는 언어 서버/SDK 바이너리를 포함한다고 주장하지 않는다.

Spring markers는 Go 파서 한 곳에서 생성한다. JS는 super marker와 병합해 표시하고 요청·후보 목록만 소유한다. bean 선언/주입 후보(qualifier/name/Primary/aliases와 다중 후보), 명시적 endpoint/path, application properties/YAML key 탐색을 구현한다. 조건/profile/동적 설정은 runtime 해결로 가장하지 않고 한계를 표시한다. 설정 값/환경변수/인증 파일을 수집하지 않는다.

Go super 이동은 실제 typeHierarchy/LSP definition을 이용한다. unsupported hierarchy는 header의 실제 parent identifier 위치로 fallback하고 여러 후보를 보존한다. 기존 Python with_previews 인자 버그도 수정·회귀 검증한다.

진행 아이콘은 설치된 IDEA의 Apache-2.0 process/step_1.svg 8-spoke 디자인과 AsyncProcessIcon 주기를 근거로 공통 native UI 컴포넌트로 만든다. UI JS 타이머를 추가하지 않고 실제 working 상태에만 native animation을 붙인다.

## 분담과 검증

- go_lsp_core high: engine core HTTP/LSP/config/token lexer 및 subprocess/HTTP/concurrency 검사. transport와 자원 회수 복잡성 때문에 high.
- editor_layout 기존 high: Go related/super와 fallback/overload/UTF16 회귀, 기존 Python hotfix.
- shift_audit 기존 high: 설치된 IDEA Spring 정적 근거, Go Spring scanner/index/candidate/config/endpoints와 fixture 회귀.
- parent: UI/launcher, build/install/manifest, canonical spinner, 단일 배치 적용과 통합 검토.

go test -race ./..., Go subprocess/HTTP contract tests, 기존 VM 전체/생성 검사, six-target cross builds/checksum 및 host --version/health/spring/live LSP smoke 검증. 비호스트 바이너리는 cross-build/해시 검증과 실제 실행 미확인을 구분한다. Postman api-engineer/api-testing 지침의 기존 요청 계약과 작은 local contract 검증 범위를 따른다. 토큰은 출력·커밋하지 않는다. Git에는 engine source/dist만 명시적으로 추가하고 기존 미커밋 UI 변경을 묶어 커밋하지 않는다.

권한 변경 후 parent의 REA binary_session/open_binary/inspect_artifact summary가 성공했다. Spring jar hash는 기존 정적 분석과 동일하며 실제 인벤토리 Evidence는 T09-rea-spring-inventory.json에 보존했다. 이전 차단 기록을 새 성공 근거와 구분한다.
