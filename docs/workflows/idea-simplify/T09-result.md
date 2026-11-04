# T09 통합 결과

Go engine version `0.1.0-36516d926918`을 구현·설치했다. 엔진 source/빌드·설치·검증 도구/6개 binary/manifest/launcher를 로컬 Git commit `54d8beb`에 남겼다. 기존 UI 작업의 미커밋 상태는 별도로 보존했다.

## 적용 내용

- [Go core](T09-go-core-result.md): 실제 stdio LSP child·request multiplex/cancel·document sync·diagnostics·symbols/hover/definition/references·bounded server cache/idle teardown. 기존 config의 Java/Kotlin/TS/JS/Go/Swift/Rust/Python을 연결한다. syntax는 Go lexical scanner이며 완전한 semantic coloring/completion UI로 주장하지 않는다.
- [상위 이동](T09-navigation-result.md): 기존 Python 두 with_previews 호출의 인자 오류 수정 및 Go super 구현. 실제 LSP type hierarchy/definition/symbol scope와 여러 parent/overload 후보를 보존한다.
- [Spring](T09-spring-result.md): 별도 Go parser/index에서 bean/DI/qualifier/Primary/aliases/역방향 주입 위치, 정적 MVC endpoint, properties/YAML key 위치를 제공한다. UI는 Go marker를 받아 gutter에 표시하고 Find Action의 Spring Beans/Endpoints/Configuration Keys 결과 목록을 연다. generated bin/main 미러가 실제 후보로 중복되는 문제를 실프로젝트에서 발견해 회귀와 함께 제외했다.
- Spring profile/condition/composed annotation/dynamic endpoint/정확한 generic argument/Boot metadata completion은 런타임 Spring 모델과 동일하다고 주장하지 않는다. 여러 정적 후보는 chooser에 남기고 조건 미평가를 표시한다. 설정 값/credentials/.env는 수집하지 않는다.
- 진행 아이콘: 설치된 IDEA intellij.platform.ide.jar의 Apache-2.0 process/step_1.svg를 추출했다(SHA `21ee8fabb338c78ffa6b212316fbd6d86afaa7fbe1feb49754790aa5a2e14ebc`). AsyncProcessIcon initializer에서125ms×8=1000ms를 확인했다. 공통 uiSpinner를 toolbar/agent working 상태와 갤러리에 적용했다. native 연속 회전을 사용하고 IDEA의 이산 프레임까지 같다고 주장하지 않는다.

## 배포 및 Git

dist에는 darwin/linux/windows × amd64/arm64 6개 binary가 있다. 각각 약6.9~7.8MB이며 manifest에 source SHA/build Go version/size/sha256을 기록했다. `python3 engine/check_release.py`가 source 일치와6개 checksum을 확인한다. macOS arm64 host binary만 직접 실행 검증했고 다른5개는 cross-build 및 해시 검사다.

실제 앱의 binary/manifest는 `~/.config/herdr-app/data/codebench-engine`에 설치해 mod watcher 밖에 둔다. Go engine은 hc의 정확한 `codenav-engine` helper로 실행하며 상태 PID/version/token을 확인한다. 이전 정확한 Python helper는 Go health 확인 후 종료했다. 업데이트는 같은 실행 경로/PID의 owned helper만 선택하고401/network 후 manifest/state를 다시 읽는다. engine/launcher/설치 코드는 별도 커밋이며 Spring UI와 공통 디자인 등 기존 idea-ux UI 미커밋 작업은 현재 working tree에 있다. 원격 push는 수행하지 않았다.

로컬 JVM 보정: 설치 JDT1.63의 manifest는 JavaSE25를 요구하지만 inherited JAVA_HOME은21이었다. JVM process 전용 `~/.cache/herdr-codenav/servers.json`의 java.env.JAVA_HOME에 확인된 host JDK27을 추가했다. 기존 설정·env를 병합/보존하고 전역/프로젝트 Java target은 바꾸지 않았다. 백업은 `~/.config/herdr-app/data/native-ide-backups/idea-t09-20261104-150311`에 있다. 배포 binary/config에는 이 절대 경로가 포함되지 않는다.

## 검증

- Go 전체 race tests 및 vet 통과. 실제 fake-LSP subprocess로 framing/server requests/concurrency/cancel/cache/lifecycle/sync/URI/library materialization을 검증하고 Spring/super fixtures를 검사했다.
- JS VM17개 전체, Python navigation6개, 생성 check와 diff check 통과. native Go client tests는 single startup/host selection/401 reconnect/version+PID ownership/legacy retirement/passive polling을 검증한다.
- 실제 release executable smoke로 version, private0600 state, HTTP authentication, Spring DI/config value omission 및 owned shutdown을 확인했다.
- [실제 LSP](T09-live-lsp-result.md): gopls symbols+definition, JDT symbols+super(JDK27), Herdr/core에서 실행한 Kotlin super가 성공했다. Codex가 직접 시작한 Kotlin의 native watcher 실패는 실제 Herdr 성공과 구분한다.
- [실프로젝트 HTTP 기록](T09-live-engine.json): InfraErrorCode.code → BaseError.kt26행, M3u8Service의5개 주입+1개 bean marker, playlistService → source PlaylistService.kt 단일 후보. 실제 프로젝트 index는 bean71개/endpoint18개/config key244개다. 값이나 token은 기록하지 않았다.
- 실제 Herdr screenshots에서 Go engine 연결, source view, 작업 중 IDEA spinner 및 Spring 목록 진입/로딩을 확인했다. 사용자가 여러 space를 조작하는 동안 목록 완료 화면은 고정하지 못했고, 결과 내용은 실제 HTTP/VM으로 검증했다. 이미지는 사용자 terminal이 포함돼 저장소에 넣지 않는다. 최종 runtime errors=[]다.

## 실행 환경 제약

반복 HMR 중 native mod runtime의 out-of-memory 오류가 발생했다. metadata에서 저장하지 않은 buffer가 없음을 확인한 뒤 app.quit/relaunch로 창 runtime만 복구했다. core terminals는 유지했고 실제 Go helper가 정상 실행 중이다. 초기 mod 내부 engine 설치 위치는 data 경로로 옮겼으며 old 경로에는 빈 directory만 남는다(디렉터리 제거가 환경에서 거부됨).

`herdr-app check mods/codenav`, `mods/activity`는 기존 XPC/LaunchServices 환경 때문에 각5초 timeout이며 통과로 기록하지 않는다. Postman api-engineer/api-testing의 기존 local request 계약·작은 실제 HTTP 검증 절차를 적용했다. 설치된 Postman CLI는 `status` subcommand를 지원하지 않아 해당 상태 확인은 실행 실패로 남긴다. Postman collection이나 외부 workspace에 업로드하지 않았다.

REA는 마지막 권한 변경 후 Spring JAR inventory까지 성공했다. 세부 기능 의미는 설치 bytecode 정적 관측, 인벤토리는 실제 REA Evidence이며 둘을 혼동하지 않는다.
