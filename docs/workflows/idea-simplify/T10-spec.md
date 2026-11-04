> 2026-11-04 사용자 요청으로 취소됨. 동봉 배포하지 않으며 T11 설치 가이드로 전환했다. 아래 내용은 당시 조사 기록이다.

# T10 — 언어 서버와 실행 런타임의 바이너리 동봉

- 실행 모드: 전체 구현. T09의 Go 엔진·기존 UI 변경을 보존한다.
- 요구사항 R10: 별도 언어 서버/실행 런타임 설치 없이 플랫폼별 엔진 하나로 LSP를 시작한다.
- 프로젝트 빌드에 필요한 Xcode/macOS SDK, Windows SDK/MSVC, 프로젝트별 의존성은 실행 런타임과 구별한다. 제공하지 않는 항목을 동봉했다고 표시하지 않는다.

## 구조와 계약

`engine/runtimebundle/manifest.json`과 `payload.tar.gz`를 Go embed에 포함한다. 개발 소스에는 빈 thin manifest를 유지하고, 릴리스 빌더가 플랫폼별 압축 payload와 파일 인벤토리·출처·라이선스를 생성한 뒤 컴파일한다. 외부 payload 파일을 필요로 하지 않는다.

Manifest schema 1: target(`GOOS-GOARCH`), revision, archive, sha256, compressed_bytes, unpacked_bytes, commands(map language→기존 ServerConfig), files(path/size/mode/sha256/kind/link), packages(출처·버전·라이선스).

첫 실행은 `<cache>/runtimes/<revision>/<target>`에 압축 해제한다. 해시·경로·심볼릭 링크·크기 제한을 검증하고 비공개 임시 디렉터리를 원자적으로 게시한다. 캐시 재사용 전 파일 인벤토리를 검증하며 훼손 시 격리 후 재생성한다. `{runtime}`은 검증된 캐시 경로다.

`--bundle-info`는 내장 manifest를 출력한다. `--prepare-runtime --state PATH`는 추출·검증 후 root/target/revision/prepared를 JSON으로 출력한다. 기본 서버 설정도 내장한다. 기존 정식 설정과 동일한 필드는 동봉 명령으로 대체하고 사용자가 바꾼 필드와 cache/servers.json 오버라이드는 유지한다.

## 책임

- core 담당: bundle.go/tests, main.go/lsp.go, 내장 기본 설정. 동시성·무결성·설정 우선순위 때문에 기존 high 설정을 유지한다.
- JVM/Node 담당: runtime_sources.py/tests, 공식 버전·다운로드·라이선스 근거. 재배포와 ABI 조합 검증 때문에 기존 high 설정을 유지한다.
- native 담당: native_sources.py/tests, Go/Rust/Swift 플랫폼별 실제 자산·의존성 근거. 도구 체인 경계 때문에 기존 high 설정을 유지한다.
- parent: 획득·정규화·packaging, 빌드·설치·통합 검증 및 진행 문서. 다른 UI 변경은 수정하지 않는다.

## 검증/완료 기준

1. Go race/vet: 추출 경로 탈출·깨진 해시·링크·동시 추출·훼손 캐시·우선순위 검증.
2. 패키저: 원본 체크섬, 안전한 압축 해제, 재현 가능한 압축/인벤토리 검증.
3. 실제 host fat binary에서 깨끗한 cache와 PATH로 내장 명령 실행 및 실제 LSP 초기화 확인.
4. 여섯 타깃 빌드·해시 검증. 실제 실행하지 않은 타깃은 cross-build로만 기록한다.
5. 라이선스/플랫폼 의존성을 확인할 수 없는 자산은 제외 사유와 미완료 범위를 명시한다. 다운로드 계획이나 thin binary를 동봉 완료로 보고하지 않는다.
