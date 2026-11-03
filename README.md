# herdr-codebench

[Herdr](https://herdr.dev)용 VS Code 스타일 레이아웃입니다. 소스 코드를 언어 서버(LSP)와 함께 탐색하고, 브랜치 diff에 줄 단위로 리뷰 코멘트를 남겨 에이전트 터미널로 보냅니다.

[yama-lei/herdr-editor-layout](https://github.com/yama-lei/herdr-editor-layout)의 workbench 레이아웃을 바탕으로 했습니다.

| 폴더 | 내용 |
| --- | --- |
| `layouts/codebench.json` | 레이아웃: 사이드바(스페이스·에이전트·탐색기·검색·리뷰), 편집기 영역(탭 줄 + 코드 뷰 / 편집기 / 리뷰 diff), 터미널 패널, 상태 표시줄 |
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
- Ctrl+- / Ctrl+Shift+- 뒤로 / 앞으로 (스페이스별 기록)
- ✎ 버튼으로 activity 편집기에서 편집하고, 탭 줄의 👁로 돌아옵니다
- 줄 번호 클릭으로 코멘트 시작, Shift+줄 번호 클릭으로 범위, 정보줄의 "코멘트" 버튼

### 브랜치 리뷰
활동 바의 말풍선 아이콘(Ctrl+Alt+5), 편집기 위 "리뷰" 탭, Ctrl+Alt+R로 엽니다.

- 왼쪽 base ← 오른쪽 비교 대상. 비교 대상의 기본값은 현재 체크아웃(작업 트리 포함)이고, 다른 브랜치를 고르면 커밋끼리 비교합니다
- 브랜치 목록은 로컬과 원격별로 묶고, 추적 upstream과 ↑↓를 보여줍니다. ⬇ 버튼은 `git fetch --all --prune`
- diff의 줄 번호 클릭으로 코멘트, Shift+클릭으로 범위, 코드 클릭 후 헤더의 "코멘트" 버튼
- 코멘트는 저장소별로 모이고(코드 뷰에서 남긴 것 포함), 한 메시지로 묶어 터미널에 보냅니다
  - **입력창에 붙여넣기**: 클립보드를 거쳐 입력창에 넣기만 합니다. Enter는 직접 누릅니다
  - **전송 ↵**: `hc send`로 입력하고 Enter까지 누릅니다

### 그 밖에
- **스페이스별 배치 기억**: 편집기 영역, 리뷰/편집기, 사이드바 탭, 터미널 패널, 크기
- **한국어**: 상태 표시줄 오른쪽 끝의 `EN` / `한국어` 칩, 또는 `herdr-app do codenav.lang:ko`
- **CLI로 파일 열기**: `herdr-app do codenav.open:/절대/경로/파일.kt:42`

## LSP

`mods/codenav/bridge/lsp_bridge.py`가 언어 서버를 켜 두고, mod는 `127.0.0.1:47821`로 짧게 묻습니다. herdr mod는 계속 켜져 있는 프로세스를 가질 수 없어서 이렇게 나눴습니다. bridge는 필요할 때 herdr-core 터미널(`codenav-lsp`, 화면에는 안 보임)로 저절로 켜지고, 1시간 동안 요청이 없으면 꺼집니다. 로그는 `~/.cache/herdr-codenav/`에 남습니다.

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
| Ctrl+Alt+1…5 | 스페이스 / 에이전트 / 탐색기 / 검색 / 리뷰 |
| Ctrl+Alt+R | 리뷰 열기 |
| Ctrl+\` | 터미널 패널 토글 |
| Ctrl+Alt+E | 편집기 영역 토글 |
| Ctrl+Shift+G | 현재 폴더를 VS Code로 열기 (open-vscode) |
| F12 / Shift+F12 / Cmd+F12 | 정의 / 참조 / 구현 (코드 뷰) |

## 원본 대비 변경 (`mods/activity`)

[yama-lei/herdr-editor-layout](https://github.com/yama-lei/herdr-editor-layout)의 activity mod(Apache-2.0)를 다음과 같이 고쳤습니다.

- 탐색기: 하위 폴더(`src` 등)를 펼치면 루트 목록이 보이던 버그 수정 (`files.js`의 새로고침 스크립트가 루트를 두 번 읽었음)
- 활동 바: 레이아웃에 있는 화면만 버튼으로 표시, 리뷰 버튼 추가 (`common.js`, `bar.js`)
- 한국어: 제목·툴팁·주요 안내 문구 번역 (`i18n.js`, 각 파일의 `T(...)`)

## 라이선스

Apache-2.0 (`LICENSE`). `mods/activity/ficons/`와 `mods/open-vscode/`는 각 폴더의 라이선스를 따릅니다.
