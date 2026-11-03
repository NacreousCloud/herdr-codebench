# IntelliJ IDEA 디자인 시스템 (Islands Dark)

설치된 IntelliJ IDEA 2026.2.4와 이 컴퓨터의 IDE 설정에서 뽑은 값입니다. 숫자는 모두 `tokens.json`·`keymap.json`에 있고, `python3 design/idea/extract.py`로 다시 뽑을 수 있습니다.

- 테마: **Islands Dark** ← Dark(New UI) ← Darcula. 팔레트 이름(`gray-130` 등)은 실제 색으로 풀었습니다.
- 에디터 색 구성표: **Islands Dark** (맨 아래 부모 Darcula 기본값은 IDE 코드 안에 있어 빠졌습니다)
- 키맵: 사용자 키맵 **macOS 1 복사** ← Mac OS X 10.5+ ← 기본값
- 글꼴: 사용자 설정

## 1. 화면 구조: Islands

IntelliJ 2026의 기본 모양은 **창 바탕 위에 둥근 "섬"들이 떠 있는** 구조입니다.

| 요소 | 값 | 토큰 |
| --- | --- | --- |
| 창 바탕 (메인 툴바, 툴 윈도우 줄, 상태 표시줄) | `#26282C` | `MainWindow/MainToolbar/ToolWindow.Stripe/StatusBar.background` |
| 섬 바탕 (에디터, 툴 윈도우, 입력란) | `#191A1C` | `*.background`, `ToolWindow.background`, `EditorTabs.background` |
| 섬 둥글기 | 20px (compact 16) | `Island.arc` |
| 섬 사이 간격 | 6px (compact 4) — 섬 테두리를 창 바탕색으로 칠해 생기는 틈 | `Island.borderWidth`, `Island.borderColor` |
| 비활성 섬 | 투명도 0.56, 툴 윈도우는 0.2 | `Island.inactiveAlpha`, `Island.toolWindowAlpha` |
| 상태 표시줄 위 경계선 | 없음 | `StatusBar.topBorderWidth` = 0 |
| 팝업 바탕 | `#26282C` (창 바탕과 같은 층) | `Popup.background` |

## 2. 색 역할

| 역할 | 값 | 토큰 |
| --- | --- | --- |
| 기본 글자 | `#D1D3D9` | `*.foreground` (text-default) |
| 보조 글자 (단축키, 설명) | `#73767C` | `*.infoForeground`, `*.shortcutForeground` (text-secondary) |
| 비활성 글자 | `#4C4F56` | `*.disabledText` |
| 구분선 | `#33353B` | `*.separatorColor`, `Separator.separatorColor` |
| 테두리 | `#26282C` | `*.borderColor`, `Borders.color` |
| 호버 | `#FFFFFF17` (흰색 9%) | `*.hoverBackground` |
| 선택 (활성) | `#2A4371` | `*.selectionBackground` |
| 선택 (약하게: 탭 밑 배경 등) | `#233558` | `*.lightSelectionBackground`, `EditorTabs.underlinedTabBackground` |
| 선택 (비활성) | `#33353B` | `*.selectionInactiveBackground` |
| 강조 (밑줄, 기본 버튼) | `#3871E1` | `*.underlineColor`, `Button.default.startBackground` |
| 포커스 테두리 | `#3871E1`, 두께 2 | `*.focusColor`, `Component.focusWidth` |
| 링크·수정된 항목 | `#71A1FE` | `*.modifiedItemForeground` |
| 파일 상태 | 수정 `#70AEFF`, 추가 `#73BD79`, 버전 관리 안 됨 `#E88F89`, 무시됨 `#D69A6B`, 충돌 `#DE6A66`, 삭제 `#6F737A` | 에디터 구성표 `FILESTATUS_*` |

## 3. 에디터

| 요소 | 값 |
| --- | --- |
| 바탕 / 글자 | `#191A1C` / `#BCBEC4` |
| 커서 줄 | `#1F2024` |
| 줄 번호 / 커서 줄의 줄 번호 | `#4B5059` / `#A1A3AB` |
| 커서 | `#CED0D6` |
| 들여쓰기 안내선·오른쪽 여백선 | `#323438` |
| 오류 / 경고 밑줄 | `#FA6675` / `#F2C55C` (물결, 스크롤바 표시 `#D64D5B` / `#C29E4A`) |

문법 색:

| 종류 | 색 |
| --- | --- |
| 키워드 | `#CF8E6D` |
| 문자열 | `#6AAB73` |
| 숫자 | `#2AACB8` |
| 줄 주석 | `#7A7E85` |
| 문서 주석 | `#5F826B` (기울임) |
| 함수 선언 | `#56A8F5` |
| 필드 | `#C77DBB` (정적 필드·상수는 기울임) |
| 애노테이션 | `#B3AE60` |

## 4. 글꼴

| 용도 | 값 |
| --- | --- |
| UI | `.AppleSystemUIFont` (SF Pro) 13 |
| 에디터 | Monoplex KR Nerd 14 |
| 툴 윈도우 제목 | UI 글꼴 그대로 (`ToolWindow.Header.font.size.offset` = 0) |

## 5. 크기·둥글기·여백

| 요소 | 값 |
| --- | --- |
| 컨트롤 둥글기 (입력란, 콤보) | 8 (compact 6) — `Component.arc` |
| 버튼 둥글기 | 8 — `Button.arc` |
| 배너 둥글기 | 12 (compact 8) |
| 목록·트리 줄 높이 | 24 (compact 22) |
| 표 줄 높이 / 표 머리줄 | 20 / 25 |
| 탭 높이 | 40 (compact 36) — `TabbedPane.tabHeight` |
| 에디터 탭 밑줄 | 높이 4, 둥글기 4 |
| 툴 윈도우 줄 버튼 | 37×40 (compact 32×32) — `StripeToolbar.Button.size` |
| 툴 윈도우 머리줄 높이 | compact 31 |
| 메인 툴바 버튼 | compact 26×26, 둥글기 8 |
| 실행 위젯 | 높이 26, 버튼 폭 26 (compact) |
| 메인 툴바 드롭다운 최대 폭 | 350 |
| 팝업 메뉴 구분선 | 높이 9, 선 1 |
| Search Everywhere | 머리줄 여백 2,4,0,9 / 아래 안내줄 8,12,8,12 |
| 액션 목록 아이콘 간격 | 6 |

## 6. UX: 상호작용 규칙

### 툴 윈도우

| 동작 | 키 |
| --- | --- |
| 프로젝트 / 커밋 / 구조 / 문제 | `⌘1` / `⌘0` / `⌘7` / `⌘6` |
| 터미널 | `⌥F12` |
| 열린 툴 윈도우 숨기기 | `⇧Esc` |
| 모든 툴 윈도우 숨기기 (에디터 최대화) | `⌃⇧F12` |
| 마지막 툴 윈도우로 이동 | `F12` |
| 에디터로 돌아가기 | `Esc` |

- 줄의 버튼은 누르면 열리고, 열린 것을 다시 누르면 접힙니다.
- 툴 윈도우는 왼쪽·오른쪽·아래에 둘 수 있고, 버튼을 끌거나 메뉴로 옮깁니다.

### 찾기와 이동

| 동작 | 키 |
| --- | --- |
| Search Everywhere | `⇧` 두 번 |
| 클래스 / 파일 / 심볼 | `⌘O` / `⌘⇧O` / `⌘⌥O` |
| 액션 찾기 | `⌃⇧A` |
| 최근 파일 / 최근 위치 | `⌃E` / `⌃⇧E` |
| 파일 구조 팝업 | `⌃F12` |
| 줄로 이동 | `⌘L` |
| 파일에서 찾기 / 경로에서 찾기 | `⌘F` / `⌘⇧F` |
| 정의로 이동 | `⌘B`, `⌘`+클릭, 가운데 클릭 |
| 구현으로 이동 | `⌃⌥B`, `⌃⌥`+클릭 |
| 사용처 찾기 / 사용처 팝업 | `⌥F7` / `⌃⌥F7` |
| 뒤로 / 앞으로 | `⌘[` / `⌘]`, `⌘⌥←` / `⌘⌥→`, 마우스 4·5번 버튼 |
| 다음 오류 | `F2` |
| 문서 보기 | `F1`, `⌃J` |
| 빠른 수정 | `⌥Enter` |

### 에디터 탭

| 동작 | 키 |
| --- | --- |
| 탭 닫기 | `⌘W` |
| 다음 / 이전 탭 | `⌘⇧]` / `⌘⇧[`, `⌃→` / `⌃←` |

### 실행

| 동작 | 키 |
| --- | --- |
| 실행 / 디버그 | `⌃R` / `⌃D` |
| 다시 실행 | `⌘R` |
| 중지 | `⌃F2` |
| 실행 구성 고르기 | `⌃⌥R` |

## 7. `idea` 레이아웃에 적용한 것과 남은 차이

적용했습니다:

- 화면 구조: 창 바탕 `#26282C`(`canvas`) 위에 둥근 섬 `#191A1C`(`surface`, 반지름 10 = `Island.arc` 20의 절반), 섬 사이 6px, 구분선 없음
- 색 역할: 테마 `themes/idea.json` — 글자 `#D1D3D9` / `#9FA2A8` / `#73767C`, 선택 `#2A4371`, 컨트롤 테두리 `#40434A`, 강조 `#3871E1`; 호버는 흰색 9%(`#FFFFFF17`)
- 툴 윈도우 줄: 선택한 버튼은 강조색 배경(`ToolWindow.Button.selectedBackground`), 버튼 32px·둥글기 8
- 에디터 탭: 선택한 탭은 `#233558`(`EditorTabs.underlinedTabBackground`) 둥근 배경, 탭 줄 38px
- 메인 툴바·상태 표시줄·툴 윈도우 줄은 창 바탕, 경계선 없음
- UI 글꼴: 시스템 글꼴(`.AppleSystemUIFont`)
- 키맵: 사용자 키맵대로 — `⌃E`·`⌃⇧E` 최근 파일, `⌃⇧A` 액션 찾기, `⌃F12` 파일 구조, `⌃⌥B` 구현, `⌃⌥F7` 사용처, `F1`·`⌃J` 문서, `F12` 마지막 툴 윈도우, `⌃⇧F12` 모두 숨기기, `⌘⌥←/→` 뒤로·앞으로, `⌘⇧]/[`·`⌃→/←` 다음·이전 탭, `⌃R` 실행, `⌘R` 다시 실행, `⌃F2` 중지, `⌃⌥R` 실행 구성 고르기

남은 차이:

| 항목 | 이유 |
| --- | --- |
| 마우스 4·5번 버튼(뒤로/앞으로) | Herdr가 모드에 왼쪽·오른쪽·가운데 버튼만 넘깁니다 |
| `Esc`로 에디터에 돌아가기 | 모드가 다른 블록의 포커스를 옮길 수 없습니다 |
| 툴 윈도우 버튼 끌어서 옮기기 | 블록 사이로 끄는 동작을 받을 수 없어 오른쪽 클릭 메뉴로 옮깁니다 |
| 실행 `⌃R`, 문서 `⌃J` | 터미널 프로그램이 쓰는 키라 코드 뷰·탐색기에 포커스가 있을 때만 받습니다 |
| 선택된 툴 윈도우 아이콘의 흰색 변형 | IntelliJ는 선택 상태용 아이콘을 따로 씁니다. 여기서는 같은 아이콘을 강조색 위에 그립니다 |
