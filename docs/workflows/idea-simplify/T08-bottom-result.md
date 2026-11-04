# T08 전체 폭 하단 도구 창

## 최종 구조

IDEA의 `terminal-panel`을 중앙 editor 안쪽에서 꺼내 양쪽 tool island까지 포함하는 content column의 하단으로 이동했다.

```text
root
  main-toolbar
  body (row)
    stripe
    idea-content (column)
      idea-upper (row)
        sidebar (left-main + left-aux)
        work-body
          editor-area
        tool-right (right-main + right-aux)
      terminal-panel
    stripe-right
  status-row
```

하단 창을 열면 `idea-upper`와 `terminal-panel`이 높이를 나눈다. 따라서 left main/lower, 중앙 editor, right main/lower가 함께 위로 줄고, 하단 창은 두 바깥 stripe 안쪽의 전체 content 폭을 사용한다. toolbar/stripe/status의 위치나 크기를 변경하지 않는다. codebench는 기존 구조를 유지한다.

## 안전한 마이그레이션

`tool-layout.js`의 순수 `ensureBottomSpan(tree)`가 기존 노드를 재구성하지 않고 그대로 reparent한다. `ensureIdeaIslands`가 이 함수를 호출하므로, 현재 항상 표시되는 left Stripe의 기존 `addMissing` 경로에서 새 JS가 로드된 뒤 최신 layout을 다시 읽어 `run('layout.set', {layout:tree})` 한 번으로 적용한다. 설치된 layout JSON을 저장소 기본값으로 덮어쓸 필요가 없다.

- 새 wrapper는 `idea-content`와 `idea-upper` 두 개다. 이미 존재하면 재마이그레이션하지 않는다.
- body의 기존 stripe 사이 node 순서를 `idea-upper`에 그대로 옮긴다. 알 수 없는 중간 body child도 유지한다.
- 기존 `work-body`의 원래 editor-area/terminal-panel 두 자식 구조에만 적용한다. 추가 center child나 알 수 없는 wrapper 구조는 파괴하거나 추측하지 않고 그대로 둔다.
- 모든 기존 node의 id, size/min/max, active/hidden, tool child 순서, content, unknown 필드와 객체 정체성을 보존한다. 실제 terminal이 right stack으로 이동해 있는 경우도 그대로다.
- `idea-upper.size/min/max`는 기존 editor-area의 높이 값을 복사한다. 따라서 기존 editor/bottom 높이 비율과 fixed px도 처음 적용할 때 유지한다. 원래 editor-area와 work-body의 필드는 유지되며 side width도 변하지 않는다.
- body의 기존 horizontal resizable/divider 정책은 idea-upper에, work-body의 기존 vertical 정책은 idea-content에 복사한다. 새 wrapper에는 추가 gap/padding을 만들지 않는다.
- 부모는 `memory.js`에서 IDEA의 areaWeight 저장/복원 대상을 `idea-upper`로 바꾸고 legacy editor-area fallback을 유지했다. IDEA의 이전 가로 split 복원은 적용하지 않으며 codebench의 기존 split/크기 저장은 보존한다. 이는 부모 소유 변경이다.

저장소의 `layouts/idea.json`에는 같은 새 기본 구조를 적용했다. 담당 에이전트는 설치된 layout, `.state` 또는 shared 메모리를 쓰지 않았다.

## 검증

다음 검사 통과:

- `node --experimental-vm-modules design/idea/check_workspace.mjs`: 새 shell parent/order, legacy 재배치, 두 번 적용한 동일 결과, unfamiliar shape 안전 보존, codebench 무변경. 사용자 형태의 width335/910, editor/bottom weight3.80496/1.19504, left-main/lower weight와 Notifications active/hidden, hidden Problems bottom, right에 놓인 terminal content, unknown body neighbor, 기존 모든 node의 동일 identity/필드/child order를 확인한다. 기존 도구 side 이동·저장 order·terminal 보존 회귀도 통과했다.
- `node --experimental-vm-modules design/idea/check_system.mjs`: full-width bottom parent 구조와 새 wrapper의 zero gap/padding, 기존 shared UI/layout 보존/idempotence.
- `node --experimental-vm-modules design/idea/check_surfaces.mjs`: Stripe의 기존 migration 호출/도구 UI/overflow 등 회귀.

담당 에이전트는 설치, 실제 app command, native check, UI 조작 또는 commit을 실행하지 않았다. 부모가 현재 설치본 JS를 배치 적용한 뒤 기존 Stripe 경로로 마이그레이션하고, Problems 등 bottom tool을 실제 열어 양쪽 island까지 폭이 이어지고 위 패널들이 함께 줄어드는 화면을 확인한다. `.state`/개인 tool 배치와 terminal 데이터의 실제 유지도 이 통합 단계에서 별도로 확인해야 한다.
