# herdr-codebench

[Herdr](https://herdr.dev)용 VS Code 스타일 레이아웃입니다. 소스 코드를 언어 서버(LSP)와 함께 탐색하고, 브랜치 diff에 줄 단위로 리뷰 코멘트를 남겨 에이전트 터미널로 보냅니다.

[yama-lei/herdr-editor-layout](https://github.com/yama-lei/herdr-editor-layout)의 workbench 레이아웃을 바탕으로 했습니다.

| 폴더 | 내용 |
| --- | --- |
| `layouts/codebench.json` | 레이아웃: 맨 왼쪽 스페이스 목록, 그 옆 사이드바(탐색기·검색·리뷰, 스페이스를 옮겨도 그대로), 편집기 영역(탭 줄 + 코드 뷰 / 편집기 / 리뷰 diff), 터미널 패널, 상태 표시줄 |
| `mods/codenav/` | 이 레포의 mod: 코드 뷰, 브랜치 리뷰, LSP bridge, 스페이스별 배치 기억, 한국어 |
| `mods/activity/` | yama-lei의 activity mod 수정본 (아래 "원본 대비 변경") |
| `mods/open-vscode/` | [CacaoRick/herdr-open-vscode](https://github.com/CacaoRick/herdr-open-vscode), 그대로 |

## 기능

### 코드 뷰
탐색기나 검색에서 소스 파일을 열면 나옵니다. 그림, PDF, 마크다운은 기존 activity 편집기와 뷰어가 엽니다.

- 문법 색상(pygments), 줄 번호, 브레드크럼, 아웃라인, Cmd+F 찾기
- 이름 클릭: 같은 이름 강조, 정보줄에 타입·문서(hover)와 그 줄의 진단
- Cmd+클릭 / F12 정의로 이동, Shift+F12 참조, Cmd+F12 구현, 타입 정의
- jar 안의 라이브러리 소스(Kotlin)와 jdtls 클래스 파일도 읽기 전용으로 엽니다
- Ctrl+- / Ctrl+Shift+- (탭 줄 왼쪽의 ‹ › 버튼): 전에 보던 탭으로 뒤로 / 앞으로. 스페이스별로 최근 10개를 기억하고, 닫은 탭은 건너뜁니다
- Alt+← / Alt+→ 파일 안에서 정의로 이동한 위치를 뒤로 / 앞으로
- LSP 진단(오류·경고)은 밑줄이나 줄 번호 옆 점에 마우스를 올리면 내용이 보입니다
- ✎ 버튼으로 activity 편집기에서 편집하고, 탭 줄의 👁로 돌아옵니다
- 코멘트: 줄 번호를 클릭하거나 드래그(Shift+클릭으로도 범위), 또는 텍스트를 드래그로 선택하고 정보줄의 "코멘트"(선택한 부분을 그대로 인용)
- 스크롤: 휠·트랙패드로 상하좌우, Shift+휠로 좌우, 오른쪽·아래 스크롤바
- 텍스트 선택: 드래그하거나 Shift+클릭으로 넓힙니다. 복사(Cmd+C 또는 정보줄 "복사")는 선택한 텍스트, 없으면 선택한 이름, 그것도 없으면 현재 줄

### 브랜치 리뷰
활동 바의 말풍선 아이콘(Ctrl+Alt+5), 편집기 위 "리뷰" 탭, Ctrl+Alt+R로 엽니다.

- 왼쪽 base ← 오른쪽 비교 대상. 비교 대상의 기본값은 현재 체크아웃(작업 트리 포함)이고, 다른 브랜치를 고르면 커밋끼리 비교합니다
- 브랜치 목록은 로컬과 원격별로 묶고, 추적 upstream과 ↑↓를 보여줍니다. ⬇ 버튼은 `git fetch --all --prune`
- diff의 줄 번호 클릭으로 코멘트, 줄 번호를 드래그(또는 Shift+클릭)하면 범위, 코드 클릭 후 헤더의 "코멘트" 버튼
- 코멘트는 저장소별로 모이고(코드 뷰에서 남긴 것 포함), 한 메시지로 묶어 터미널에 보냅니다
  - **입력창에 붙여넣기**: 클립보드를 거쳐 입력창에 넣기만 합니다. Enter는 직접 누릅니다
  - **전송 ↵**: `hc send`로 입력하고 Enter까지 누릅니다

### 터미널의 파일을 코드 뷰로
Herdr는 터미널 링크의 Cmd+클릭을 macOS 기본 앱으로 넘기고 이를 가로챌 방법이 없어서, 대신 두 가지를 둡니다.

- **터미널 우클릭 → "선택한 경로를 코드 뷰에서 열기"**: 경로를 선택하고 고르면 그 줄로 엽니다. 이 레이아웃의 터미널 우클릭 메뉴는 codenav가 그리며, Herdr 기본 메뉴의 터미널 항목(분할, 확대, 우클릭 전달, 닫기)도 함께 있습니다. 선택 내용을 읽으려고 클립보드를 씁니다.
- **Cmd+Shift+O → "이 터미널의 파일"**: 화면과 최근 출력(800줄)에 나온 경로를 최근 것부터 모아 보여줍니다.
- 둘 다 `a.kt:42:5`, `a.kt(42,5)`, `a.kt#L42`, `file://…`, `~/…` 형식을 읽고, 상대 경로는 터미널 폴더 → 저장소 루트 → 끝부분이 같은 저장소 파일(에이전트가 줄여 쓴 경로) 순서로 찾습니다.

### 그 밖에
- **탐색기**: 폴더 안에 폴더 하나만 있으면 한 번에 끝까지 열립니다 (src/main → …/clientauth)
- **탭**: 연 파일마다, 리뷰한 파일마다 탭이 생깁니다(스페이스별, 최대 20개). 마지막 탭을 닫으면 편집기 영역이 숨겨집니다
- **위아래 / 좌우 배치**: 제목 표시줄 오른쪽 끝 버튼으로 편집기와 터미널을 위아래 또는 좌우로 놓습니다. 편집기·패널 토글 아이콘도 배치를 따라 바뀝니다
- **pane 헤더**: 터미널 pane에 마우스를 올리면 나오는 헤더의 분할·확대·닫기 버튼 (codenav가 그림)
- **스페이스별 배치 기억**: 편집기 영역, 리뷰/편집기, 터미널 패널, 크기, 위아래/좌우 배치
- **한국어**: 상태 표시줄 오른쪽 끝의 `EN` / `한국어` 칩, 또는 `herdr-app do codenav.lang:ko`
- **CLI로 파일 열기**: `herdr-app do codenav.open:/절대/경로/파일.kt:42`

## LSP

`mods/codenav/bridge/lsp_bridge.py`가 언어 서버를 켜 두고, mod는 `127.0.0.1:47821`로 짧게 묻습니다. herdr mod는 계속 켜져 있는 프로세스를 가질 수 없어서 이렇게 나눴습니다. bridge는 필요할 때 herdr-core 터미널(`codenav-lsp`, 화면에는 안 보임)로 저절로 켜지고, 1시간 동안 요청이 없으면 꺼집니다. 로그는 `~/.cache/herdr-codenav/`에 남습니다.

- bridge는 켜질 때마다 무작위 토큰을 `~/.cache/herdr-codenav/bridge.json`(권한 0600)에 쓰고, 그 토큰이 없는 요청과 브라우저발 요청(Origin 헤더, 다른 Host)은 거부합니다.
- Java 기반 서버(jdtls, kotlin-lsp)는 `java.awt.headless`, `apple.awt.UIElement` 옵션으로 띄워 macOS 독에 나타나지 않습니다.
- 메모리: Java 기반 서버는 힙 시작 64MB·상한 1GB로 띄우고, 쉬는 동안 G1 주기 GC로 메모리를 돌려줍니다(kotlin-lsp는 `IJ_JAVA_OPTIONS`, jdtls는 `--jvm-arg`, `servers.json`에서 조정). 10분 동안 쓰지 않은 서버는 내리고, 동시에 최대 3개까지만 띄웁니다. 대형 프로젝트에서 힙이 모자라면 `-Xmx` 값을 올리세요.

| 언어 | 서버 | 설치 |
| --- | --- | --- |
| Kotlin | kotlin-lsp | `brew install --cask kotlin-lsp` (macOS가 막으면 아래 참고) |
| Java | jdtls | `brew install jdtls` |
| TypeScript / JavaScript | `tsc --lsp` (TypeScript 7), 없으면 typescript-language-server | `npm i -g typescript` |
| Python | basedpyright / pyright / pylsp | `npm i -g pyright` |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |
| Rust | rust-analyzer | `rustup component add rust-analyzer` |
| Swift | sourcekit-lsp | Xcode에 포함 |

- 서버 목록과 프로젝트 루트를 찾는 기준은 `bridge/servers.json`에 있습니다. `~/.cache/herdr-codenav/servers.json`에 같은 형식으로 쓰면 덮어씁니다.
- 문법 색상에는 python3의 `pygments`가 필요합니다(`pip3 install pygments`).
- kotlin-lsp 내부의 `intellij-server`는 JetBrains 서명은 있지만 공증되지 않아 macOS가 실행을 막을 수 있습니다. 서명을 확인한 뒤 그 설치 폴더에서만 격리 표시를 지우면 됩니다: `xattr -dr com.apple.quarantine /opt/homebrew/Caskroom/kotlin-lsp/<버전>`
- 원격(ssh) 스페이스에서는 문법 색상과 보기만 되고, LSP는 이 컴퓨터에서만 돕니다.

## 설치

```sh
./install.sh                                    # mods/와 layouts/를 ~/.config/herdr-app에 복사
herdr-app do layout.switch --name codebench     # 또는 Cmd+Shift+L
```

`keys.json`은 `~/.config/herdr-app/keys.json`에 한 번 합쳐 넣습니다.

| 키 | 동작 |
| --- | --- |
| Ctrl+Alt+1 | 스페이스 목록 열기/닫기 |
| Ctrl+Alt+2…4 | 탐색기 / 검색 / 리뷰 |
| Ctrl+Alt+R | 리뷰 열기 |
| Cmd+Shift+O | 포커스된 터미널에 나온 파일 목록 |
| Cmd+W | 코드 뷰에서 현재 탭 닫기 |
| Ctrl+- / Ctrl+Shift+- | 이전 / 다음 탭 (탭 이동 기록) |
| Ctrl+\` | 터미널 패널 토글 |
| Ctrl+Alt+E | 편집기 영역 토글 |
| Ctrl+Shift+G | 현재 폴더를 VS Code로 열기 (open-vscode) |
| F12 / Shift+F12 / Cmd+F12 | 정의 / 참조 / 구현 (코드 뷰) |

## 원본 대비 변경 (`mods/activity`)

[yama-lei/herdr-editor-layout](https://github.com/yama-lei/herdr-editor-layout)의 activity mod(Apache-2.0)를 다음과 같이 고쳤습니다.

- 탐색기: 하위 폴더(`src` 등)를 펼치면 루트 목록이 보이던 버그 수정 (`files.js`의 새로고침 스크립트가 루트를 두 번 읽었음)
- 활동 바: 레이아웃에 있는 화면만 버튼으로 표시, 리뷰 버튼 추가 (`common.js`, `bar.js`)
- 제목 표시줄: 위아래/좌우 전환 버튼, 배치에 따라 바뀌는 편집기·패널 아이콘 (`titlebar.js`, `icons/`)
- 한국어: 제목·툴팁·주요 안내 문구 번역 (`i18n.js`, 각 파일의 `T(...)`)

## 라이선스

Apache-2.0 (`LICENSE`). `mods/activity/ficons/`와 `mods/open-vscode/`는 각 폴더의 라이선스를 따릅니다.
