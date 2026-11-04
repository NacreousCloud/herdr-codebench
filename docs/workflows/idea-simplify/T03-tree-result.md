# T03 Project 트리 결과

## 변경 범위

`mods/activity/files.js`의 IDEA 표시만 수정했다.

- 프로젝트 루트는 기존 IntelliJ `module` 아이콘, 굵은 프로젝트명, 보조색 경로를 같은 행에 표시한다. 로컬 홈 하위 경로는 `~/…`로 줄인다. 원격 경로는 머신명을 포함한 원래 절대 경로를 유지한다.
- 실제 루트 아래 자식은 14px 더 들어가며 기존 단계별 14px 들여쓰기를 유지한다. 실제 조상 깊이에 맞춰 공통 `guide` 색으로 가는 세로선을 표시한다.
- 폴더 펼침 표시는 기존 IntelliJ chevron 자산을 사용한다. 파일·폴더 아이콘은 기존 `fileImage`를 유지하므로 이미 구현된 source/test/resource/excluded/package 경로 역할이 적용된다. 새 폴더나 빌드 모델을 추측하지 않는다.
- 기존 공통 `uiListRow`의 compact 22px 행, 16px 파일 아이콘, 선택·비활성 선택을 유지한다. codebench는 기존 행/루트 분기를 사용한다.

파일 열기/생성/이름 변경/삭제, 머신 경계, 선택·범위·키보드, 폴더 상태, 드래그 핸들러는 변경하지 않았다. 생성 디자인 파일·공통 디자인 원본·아이콘 레지스트리는 변경하지 않았다. 설치/커밋은 수행하지 않았다.

## 근거 및 검증

사용자 Image4 `/var/folders/pd/b2x6km0n1595w41vbl3_8jgh0000gn/T/codex-clipboard-s6rVrQ.png`를 직접 확인했다. 프로젝트명 옆 경로, 계층 안내선, 기존 New UI 폴더·패키지 역할을 기준으로 삼았다.

종료 코드 0:

- `node --experimental-vm-modules design/idea/check_tree_navigation.mjs`: 기존 계층 탐색·Shift 범위·Cmd 선택·실제 클릭 열기·활성 드래그·빈 트리·codebench 회귀 통과. 실제 render에 대한 프로젝트명/경로, 로컬 홈 축약과 원격 비축약, 실제 계층 깊이·안내선 수, codebench 표시 분기 검사도 통과.
- `node --experimental-vm-modules design/idea/check_file_selection.mjs`: 현재 파일 선택·부모 펼침·다중 선택·경로/머신 경계·늦은 비동기 응답·리뷰 범위 통과.
- `git diff --check -- mods/activity/files.js design/idea/check_tree_navigation.mjs`: 통과.

`herdr-app check mods/activity`는 실행했으나 macOS `com.apple.hiservices-xpcservice`의 Connection Invalid 로그 이후 종료되지 않았다. 세션 `53676`의 해당 실행만 Ctrl-C로 종료했으며 종료 코드 130이었다. 이 실행은 통과로 집계하지 않는다. 배치 설치 후 네이티브 검사와 실제 화면 비교는 주 에이전트의 통합 검증으로 남긴다. VM 검사는 Retina 픽셀·실제 글자 잘림·GPUI 레이아웃을 보증하지 않는다.
