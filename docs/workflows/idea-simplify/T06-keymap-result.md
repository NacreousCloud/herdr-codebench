# T06 키맵 모델·터미널 경로 결과

## 구현 범위

- `mods/codenav/keymap-model.js`: `stageBindingEdits(bindings, edits)`는 미리보기용 bindings 배열, `applyBindingEdits(document, edits)`는 저장용 새 JSON 객체를 반환한다. 입력은 변경하지 않는다. edit는 `{section, chord, action, expected}`이며 `action:null`은 삭제, `expected:null`은 기존 값 없음이다. Add/Replace/Remove 모두 최초 expected와 최신 해당 action이 다르면 실패한다. 배치 전체를 먼저 검증한다. 실제 파일의 expected-text CAS와 재시도는 settings 호출자가 담당한다.
- 편집 가능한 section은 `layout:idea`, `mod:codenav`, `mod:activity`, `terminal`이다. 다른 section/알 수 없는 binding·JSON 값은 보존한다. 같은 의미의 chord를 한 배치에서 중복 편집하거나 이미 모호한 alias 두 개가 존재하면 실패한다. 명시적 terminal Add/Replace/Remove도 같은 expected-action 검사를 받으며 해당 terminal 편집이 layout에서 파생한 forwarding보다 우선한다.
- 알려진 registry 명령의 변경 시 해당 chord의 terminal bridge를 동기화한다. `codenav.key:<저장된 chord>`와 정확히 같은 기존 bridge만 소유한 것으로 취급한다. `keymapSection:'terminal'`인 등록된 direct terminal action은 layout 변경으로 덮어쓰지 않는다. 개인 terminal action과 겹치는 layout shortcut을 추가/변경하면 충돌로 실패하지만, layout shortcut 삭제는 개인 terminal action을 그대로 보존한다. 마지막 bridge 용도가 사라지면 owned bridge도 삭제한다. 같은 chord가 다른 등록된 레이아웃/모드에 남아 있으면 유지한다.
- `validateChord`는 빈 입력/제어문자/수식 키 단독/형식상 여러 key가 한 stroke에 들어간 입력을 거부한다. GPUI의 named-key 목록을 임의로 복제하지 않는다.
- `actions.js`의 `normalizeChord`는 GPUI가 지원하는 ASCII 대문자 별칭(`cmd-O`, `cmd-shift-O` → `cmd-shift-o`)과 modifier 순서를 비교에 반영한다. 키보드 배열에 따라 달라지는 문장부호/비ASCII 대문자 별칭은 추측하지 않는다. 유효 shortcut 표시·terminal 해석은 실제 현재 binding을 따른다.
- Status terminal 경로는 현재 문서의 owner(`codenav`/`activity`)에 맞는 section까지 고려한다. source/review/activity 액션은 capabilities를 확인한 뒤 실제 owning command로 전달한다. 사용할 수 없는 편집기 액션을 terminal text로 재전송하지 않는다. 유지된 공통 bridge와 개인 미등록 action이 겹치는 경우 `bindingForTerminalKey`로 실제 선언을 찾아 원래 native/mod command, `send:` 또는 `terminal` 동작을 유지한다. codebench의 terminal-files와 원 키 전달은 보존한다. literal minus와 multi-stroke 재전송도 각각 `ctrl+-`, 여러 hc keys 인자로 보존한다(`hc keys --help`의 `<KEYS>...` 계약 확인).
- Review의 기존 Find Usages는 별도 예외로 보존한다. 실제 stack이 review를 보이고 `wantedChild`의 현재 workspace/machine/root 검증을 통과한 local review일 때만 terminal `codenav.usages`를 Review owner로 전달한다. 문서는 `codenav.review.current`의 root/상대 경로에서 만든다. 숨겨진 소스 editor 문서로 판정하지 않는다. 실제 new-side 선택 단어와 LSP 가능 여부는 Review 자신의 consumer가 검증한다. 원격/숨김 review에는 예외를 적용하지 않는다.
- 설치 스크립트는 기존 기본값 병합·백업·개인 충돌 보존 정책을 유지하며, `cmd-O` 같은 동등한 기존 표기를 알아보고 다른 표기의 기본값을 추가해 개인 accelerator를 덮어쓰는 상황을 막는다. 기존 Cmd+Shift+O terminal bridge는 저장 chord와 payload가 GPUI ASCII alias 규칙으로 같은 경우에만 `codenav.terminal-files`로 마이그레이션한다. 개인 direct terminal action과 서로 다른 chord를 보내는 사용자 bridge는 보존한다. 기존 모든 mod의 Ctrl-letter 기본값을 terminal에 새로 선점하지 않는다. 명시적인 Settings 편집에만 모델의 bridge 동기화를 적용한다.

## Cmd+Shift+O의 포커스별 검색 동작

사용자가 의도한 terminal 동작은 프로젝트의 Go to File이 아니라 기존 **Files in this terminal**이었다. 부모가 실제 한 번의 입력 후 제한 trace에서 `key:cmd-shift-o → codenav.find-file`, focusedTerminal=true를 확인했다. 키 수신 자체의 실패가 아니라 포커스별 검색 대상의 잘못된 선언이었다.

`keys.json`은 `layout:idea`의 `cmd-shift-o → codenav.find-file`을 유지하고, 더 구체적인 `terminal` section을 `cmd-shift-o → codenav.terminal-files`로 바꾼다. 따라서 source/editor에서는 프로젝트 파일 검색, terminal에서는 해당 terminal에 나타난 경로 검색이 IDEA/codebench 모두에 적용된다. Status의 기존 direct terminal-files consumer가 실행한다. `terminal-files` metadata도 `keymapSection:'terminal'`, `defaultKeys:['cmd-shift-o']`로 명시하여 부모 Settings UI에서 일반 Go to File과 별도로 편집한다.

읽기 전용으로 기존 `/tmp/herdr-shift-source-20261103` snapshot을 조사했다. 실행 중 설치본과의 binary 일치를 검증한 것은 아니다.

- `vendor/gpui-pre/src/platform/keystroke.rs:235`는 ASCII 대문자를 Shift+소문자로 parse한다. `vendor/gpui-pre-macos/src/events.rs:536`은 ASCII 소문자에 Shift flag를 유지한다. 따라서 이 snapshot에는 일반 US Cmd+Shift+O를 위해 `cmd-O` 기본값을 중복 설치해야 한다는 근거가 없다.
- `src/mods.rs:882`는 copy마다 새 channel을 만들고 `:668`은 shown matching copy 각각에 broadcast한다. `:1087`의 nextCommand는 그 copy의 receiver만 사용한다. 서로 다른 visible code/review/status copy가 하나의 전역 queue를 경쟁한다는 가설은 이 snapshot과 맞지 않는다.
- `vendor/gpui-pre/src/window.rs:6028` binding 해석 뒤 `:6078`에서 action을 dispatch하고, handled면 return한다. raw key handler는 그 뒤 경로다. `src/terminal.rs:1472`는 send 외 ShellAction을 root로 전파한다. Kitty 관련 분기는 `:937` 이후 key byte 인코딩에 있다. 이 snapshot에는 `prefer_terminal` branch가 없다.

진단용 임시 Status trace는 원인 확인 후 소스에서 전부 제거했다. 일반 typing/raw key 감시는 추가하지 않았다. 이전 trace의 persisted shared 값 정리는 부모가 담당한다.

## 검증

다음 검사 통과:

- `node --experimental-vm-modules design/idea/check_keymap.mjs`: Add/Replace/Remove, 순수 미리보기, direct terminal 편집/CAS, terminal bridge 추가/제거/유지, 등록된 direct terminal action 보존, 개인 terminal 추가 충돌/삭제 보존, expected action 변경/삭제 경쟁, 무관 동시 변경 보존, unknown JSON 보존, ASCII alias와 모호한 alias 충돌, 잘못된 입력 검증.
- `node --experimental-vm-modules design/idea/check_actions.mjs`: registry/effective keymap/Find Action, owner 및 alias 동등성, editor Go to File과 IDEA/codebench terminal Files in this terminal의 서로 다른 유효 binding.
- `node design/idea/check_shortcuts.mjs`: 실제 Status 소비 경로, direct terminal 파일 검색 및 일반 forwarding 사용자 재할당, alias payload, source/review/activity owner와 capability guard, codebench 원 키 전달, installer backup/permission/idempotence/개인 alias 보존/기존 bridge의 제한적 direct migration.
- 담당 파일 `git diff --check`.

담당 에이전트는 설치, native check, 실제 UI 검증, commit을 실행하지 않았다. 부모의 실제 trace 관찰과 사용자 의도 확인을 구현 근거로 사용했으며, 수정 후 실제 UI 왕복은 부모 통합 검증과 구분한다.
