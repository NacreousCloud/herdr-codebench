# herdr-codebench 인계

현재 작업과 검증 결과는 [진행 인덱스](docs/workflows/idea-simplify/00-progress.md)와 최신 T12 결과를 기준으로 확인한다. 브랜치는 `idea-ux`, 원격은 `fhdufhdu/herdr-codebench`다. 오래된 커밋 번호나 과거의 완료 표시보다 실제 코드와 최근 검사 결과를 우선한다.

## 구조

- `mods/codenav`: 소스/리뷰, 탭, 검색, 도구 창, 설정, LSP 설치 가이드.
- `mods/activity`: 네이티브 편집기와 파일 트리.
- `engine`: 작은 Go LSP/Spring 엔진. 여섯 플랫폼의 약 7MB 바이너리와 SHA-256 manifest는 `engine/dist`에 있다.
- `design/idea/ui.js`, `tokens.json`: 디자인 시스템 원본. 생성된 mod 사본은 직접 수정하지 않는다.
- `layouts/idea.json`과 `layouts/codebench.json`: 두 레이아웃 모두 지원한다.

UI를 변경하기 전에 `AGENTS.md`, `design/idea/PARITY_PLAN.md`, `design/idea/COMPONENTS.md`와 설치된 Herdr 타입/지침을 읽는다. 모드에는 DOM/Node API가 없다. 느린 작업은 cx.spawn, 애니메이션은 native builder를 사용한다. focus/scroll handle은 init에서 만들고 소유자가 해제한다.

## LSP

UI의 `lsp.js`는 Go 엔진을 요청 시 시작하고 소유 프로세스의 PID·실행 경로·버전을 확인한다. 서버 목록과 root 규칙은 `mods/codenav/bridge/servers.json`, 개인 override는 `~/.cache/herdr-codenav/servers.json`이다. 서버 프로세스의 생성/재사용/종료는 Go 엔진이 소유한다.

SDK·LSP를 바이너리에 동봉하는 T10은 사용자가 취소했다. 다시 추가하지 않는다. 하단 LSP → 언어 선택 → LLM용 안내 복사 → 설치 확인 → LSP 시작 흐름을 사용한다. 설치 명령을 자동 실행하거나 별도 stdio 서버를 띄워 놓지 않는다.

Spring 탐색은 Java/Kotlin 소스 기반 Bean·DI·엔드포인트·설정 키 탐색이다. IDEA와 같은 런타임 분석을 제공한다고 표현하지 않는다. 세부 지원 범위는 `engine/README.md`에 있다.

## 검증·설치

```sh
python3 design/idea/sync_ui.py --check
node --experimental-vm-modules design/idea/check_system.mjs
# design/idea/check_*.mjs도 변경 범위와 통합 검증에 사용한다.
cd engine
go test -race ./...
go vet ./...
cd ..
python3 engine/install.py --verify-only
python3 engine/check_release.py
```

모드를 일괄 복사해 HMR 횟수를 줄이고, `herdr-app check`와 실제 화면을 확인한다. CLI가 XPC/권한/시간 제한으로 실패하면 통과로 기록하지 않는다. 실제 UI와 모의 검사를 구분한다. 네이티브 런타임은 반복 HMR 뒤 메모리 한도에 이를 수 있으므로 불필요하게 전체 모드를 반복 설치하지 않는다.

사용자가 옮긴 패널·터미널·활성 상태·크기는 보존한다. `install.sh`는 기존 사용자 레이아웃을 덮어쓰지 않는다. 전체 배치 초기화나 앱 재시작은 필요성과 편집 버퍼 상태를 먼저 확인한다.

## Git

사용자가 커밋·푸시를 요청한 범위만 검토해서 보관한다. 강제 push나 전역 인증 계정 변경은 하지 않는다. GitHub에는 `chowooseong`과 `fhdufhdu` 계정이 함께 있으므로 저장소 접근 계정을 확인한다. 토큰을 출력하거나 Git URL/설정/문서에 넣지 않는다. credential helper 또는 자식 프로세스에 한정된 인증 환경을 사용한다.

비밀 파일 접근 제한은 설치 패키지의 공개 테스트 파일에도 적용된다. 우회하지 않는다. 취소된 동봉 payload, 다운로드, 스크린샷, 개인 런타임 state/token은 커밋하지 않는다.
