# T09 실제 Go engine/LSP smoke — 실행 문맥을 구분한 결과

2026-11-04. 설치된 darwin-arm64 Go engine을 임시 포트·state/cache·fixture로 실행해 실제 LSP를 확인했다. 모든 요청은 기존 HTTP envelope를 사용했고 인증 token/headers는 출력하거나 결과 문서에 저장하지 않았다. 사용자 helper/config/의존성은 변경하지 않았다.

## 실행 파일·임시 환경

- 초기 실행 파일: `engine/dist/darwin-arm64/herdr-engine`.
- 초기 SHA-256: `482a05cfb37a10971759ad86c45589b0d85dfdaf37dd1a45272766c16c161609`.
- config: 저장소의 `mods/codenav/bridge/servers.json`을 그대로 사용했다.
- `--port 0 --state <fresh TMP>/engine.json --config <absolute repo config>`로 시작했다. fixture와 재현 script는 `/tmp/herdr-go-live-vNOaXA/`에 있다.
- gopls와 Java/Kotlin 요청을 최대 세 작업으로 병렬 실행했다. JVM 요청 제한은 각각 80초였으며 실제 초기 결과는 약 2초 안에 끝났다. Spring 의존성이 없는 Parent interface/Child override 파일을 만들었다.
- [초기 관찰 결과](/tmp/herdr-go-live-vNOaXA/observed-result.json), [임시 smoke script](/tmp/herdr-go-live-vNOaXA/smoke.py). 관찰 결과는 tool에 출력된 실제 JSON 결과를 보존한 것이며, 아래 cleanup probe 예외 때문에 원래 script가 자동 저장하지 못했다는 점을 명시했다.

## 설치 인식과 실제 동작

`/info`의 `installed`는 해당 명령을 찾았다는 뜻이다. 전체 언어의 실제 초기화/분석 성공을 뜻하지 않는다.

| 언어 | installed | 선택한 명령 | 이 작업의 실제 요청 |
| --- | --- | --- | --- |
| Go | true | gopls | symbols·definition 성공 |
| Rust | true | rust-analyzer | 설치 인식만 확인 |
| Swift | true | sourcekit-lsp | 설치 인식만 확인 |
| TypeScript/JavaScript | true | tsc | 설치 인식만 확인; 실제 기본 검증은 Go를 선택 |
| Python | true | pyright-langserver | 설치 인식만 확인 |
| Java | true | jdtls | 초기 inherited JDK 21 실패; core가 JDK 27 임시 override로 실제 symbols·super 성공 |
| Kotlin | true | kotlin-lsp | Codex subprocess initialize 오류; 실제 Herdr 문맥의 성공은 별도 확인 |

실제 gopls `/symbols`가 fixture의 `target`, `Use` 두 symbol을 반환했다(0.33초). `Use`에서 `target`을 선택한 `/definition`은 같은 임시 파일의 정확한 선언 줄(0-based line 2)을 반환했다. 이 기본 심볼/정의 탐색은 fake LSP 검사가 아니다.

## Codex subprocess의 JVM 실패와 진단

Java의 첫 `/symbols`는 약 1.56초에 `LSP transport: invalid LSP header`로 실패했다. 이 때문에 그 초기 fixture 실행의 Java super 요청까지 성공했다고 판정하지 않는다. Core 담당에게 실제 `/opt/homebrew/bin/jdtls` 1.63.0, config JVM args와 fixture root를 전달했다. 이 subprocess의 `JAVA_HOME`은 SDKMAN Java 21을 가리켰다. 이 문서의 초기 실패를 실제 Go super 알고리즘의 오답으로 분류하지 않는다.

Core 담당의 후속 실제 stdout/manifest/log 검사는 JDT 1.63.0의 JavaSE 25 요구와 inherited Corretto 21.0.9의 불일치를 확인했다. 서버가 LSP frame 대신 startup 오류 문장을 stdout에 쓰고 exit 13으로 종료한 것이므로 strict framing의 거절 자체는 정상이다. Engine의 추가 implicit SDKMAN fallback은 제거하고 명시된 사용자/per-server `JAVA_HOME`은 계속 존중한다.

이후 core 담당이 소유한 임시 smoke process에만 Homebrew OpenJDK 27을 지정했을 때 실제 JDT Parent/greet·Child/greet symbols가 2.7초에 반환되었다. 실제 Go to Super도 `Parent.java`의 0-based line 1, col 11과 `String greet();` preview를 반환했다. Engine은 exit 0으로 정리되고 private state를 제거했다. [Core 실제 검사 설명](T09-go-core-result.md), [token/header 없는 JDT 결과 JSON](/tmp/herdr-java-core-result.json). 이 검사는 사용자 서버 config나 이식 가능한 binary에 해당 기계의 JDK 경로를 고정하지 않았다. 명시적 inherited JDK 21을 유지하는 실행 문맥까지 자동으로 고쳐졌다고 주장하지 않는다.

Kotlin 첫 `/symbols`는 약 1.91초에 initialize RPC `-32803`으로 실패했다. 별도 owned Kotlin stdio subprocess에서 root를 `/private/tmp`의 canonical 경로로 바꿔 재현했으며, 동일하게 약 2.28초에 실패했다. 따라서 `/tmp` symlink만의 문제는 아니다.

직접 잡은 token-free 진단은 bundled JetBrains JBR 25 사용과 `com.jetbrains.analyzer.filewatcher.FileWatcher.createWatcher(Native Method)`의 `FileWatcherException` → `NativeIndexingFileSystemProvider.open` 초기화 실패를 보여 준다. [실제 진단 JSON](/tmp/herdr-kotlin-direct-WjcS1f/result.json), [stderr](/tmp/herdr-kotlin-direct-WjcS1f/stderr.log). bundled properties/VM options에서 지원되는 polling 전환은 확인하지 못했으며, 임의의 JVM flag·대체 서버 설치로 성공을 꾸미지 않았다. 같은 유형의 macOS native watcher 실패는 [Kotlin LSP 공식 저장소 issue #154](https://github.com/Kotlin/kotlin-lsp/issues/154)에 보고되어 있다. 정확히 어떤 host 권한/OS 조건이 native watcher를 막았는지는 이 검사로 확정하지 않는다.

### 실제 Herdr/hc 문맥에서는 Kotlin 성공

위 Codex subprocess 실패를 Kotlin 지원 불가로 일반화하면 안 된다. 주 에이전트는 실제 Herdr/hc가 시작한 Go helper의 인증된 `/status`에서 Kotlin `ready`를 확인했다. 같은 helper의 실제 프로젝트 `InfraErrorCode.kt`에 `kind:super`, `name:code`, `line:6`, `col:17`, `owner:{line:5,col:11}`를 전달한 `/related`가 약 0.04초에 `ok:true`와 실제 `BaseError.kt`의 0-based line 26을 반환했다.

이 성공은 주 에이전트가 확인한 실제 사용자 실행 문맥의 근거이며, headers/token을 제외한 [parent의 실제 요청/응답 JSON](T09-live-engine.json)에 기록되어 있다. 이 담당은 그 사용자 helper를 중단하거나 추가 server로 교체하지 않았다. Codex subprocess 환경에서 native watcher가 실패한 결과와 실제 Herdr 실행의 성공을 별개의 사실로 유지한다. 같은 artifact의 Spring 분석 수치는 별도 담당이 generated source 제외를 교정하며 갱신하므로 이 문서에서 고정 수치로 재인용하지 않는다.

## 정리와 범위

- Owned 임시 Go engine은 SIGTERM 후 `Popen.wait()`가 완료되었고 private state가 제거된 것을 별도로 확인했다. 마지막 `killpg(pid,0)` 존재 확인만 sandbox의 EPERM으로 거부되어 원래 script의 자동 결과 저장이 중단되었다. 그룹 탐색/권한 우회/무관 process 종료는 시도하지 않았다. 재현 script는 직접 owned process wait를 정리 경계로 사용하도록 수정했다.
- Owned 직접 Kotlin 진단 process는 LSP shutdown/exit 후 exit code 0으로 끝났다. 이 작업은 사용자 helper를 종료하지 않았다.
- 임시 인증 token은 공개/문서화하지 않았다. 설치·실제 프로젝트 수정·서버 config 변경·의존성 설치는 하지 않았다.
- 이 보고서의 성공 판정은 실제 gopls 심볼/정의, core가 JDK 27 임시 실행에서 확인한 실제 JDT symbols/super와 parent가 확인한 실제 Herdr Kotlin super다. 나머지 언어의 설치 인식, unit/fake LSP 검사, 다중 OS cross-build는 실제 분석 요청 통과와 구분한다. 최종 binary 재생성 근거는 parent 통합 결과에서 확인한다.
