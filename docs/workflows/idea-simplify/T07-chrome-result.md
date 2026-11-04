# T07 프레임·공통 편집기 chrome

## Stripe의 시각적 좌우 여백

`uiStripeButton`의 hit target 크기와 기존 selection 크기는 유지했다. 선택 fill과 아이콘만 `side`에 따라 인접 island 쪽으로 `IDEA.islandGap / 4` 이동한다. 왼쪽 stripe는 +, 오른쪽은 −이며 side 미지정은 기존 중앙 정렬이다. `tools.js`의 양쪽 Stripe가 실제 edge를 전달한다.

이 값은 별도 여백 상수가 아니다. `islands.js`의 island shell은 인접 면에 `IDEA.islandGap / 2` padding을 갖는다. stripe 안쪽에서는 그 shell inset까지 보이고 창 바깥쪽에는 해당 inset이 없으므로, fill을 inset의 절반만큼 이동하면 양쪽 보이는 여백이 같아진다. compact에서는 ±1, normal에서는 ±1.5 논리 px다. fill은 기존 hit target 안에 남는다. root/body gap, stripe 너비, panel padding/size/state, terminal 데이터는 변경하지 않았다.

첨부 crop의 관측 근거는 selection이 대략 x63–129, 바깥 edge가 x136, 이웃 island 끝이 x50이라는 점이다. 따라서 내부 여백은 약13, 외부는 약7 이미지 px였다. normal stripe 폭40 논리 px와 2x 이미지를 가정하면 실제 stripe 범위는 약 x56–136이며 component 자체의 여백은 이미 대칭이다. shell의 추가 inset 때문에 생기는 시각적 차이를 보정했다. 이 좌표 해석은 첨부 crop에 대한 추론이며 새 native render의 측정 완료를 뜻하지 않는다.

## 상단 toolbar 정렬과 island seam

- toolbar의 left/center/right group은 부모의 definite 전체 높이를 사용하고 세로 중앙 정렬한다. project/branch/run widget은 `IDEA.toolbarButtonSize`로 높이를 통일하고 label도 해당 높이 안에서 중앙 정렬한다. 기존 아이콘/아바타, width 제한, overflow 순서, 클릭과 메뉴 동작은 보존했다. 글꼴 baseline을 보정하는 임의 y offset은 추가하지 않았다.
- `IslandBottom`이 아래 보조 tool window의 존재에 따라 추가하던 `border_b(1)`을 제거했다. 공통 `uiIslandBottom()`의 surface와 아래 곡선만 사용한다. Notifications가 아래 있어도 위 island 바닥에 별도 밝은 선을 그리지 않는다. shell과 panel 간격은 그대로다.

## 편집기 담당과 공유한 canonical 계약

- `uiColors()`의 `lineAdded`, `lineModified`, `lineDeleted`는 IDEA의 `ADDED_LINES_COLOR`, `MODIFIED_LINES_COLOR`, `DELETED_LINES_COLOR`를 사용하고 theme ansi2/4/1로 fallback한다. codebench는 원래 theme 색을 사용한다.
- `herdr.editor.metrics.changeMarkerWidth=4`, `changeMarkerRadius=2`를 추가하고 `IDEA.editorChangeMarkerWidth/Radius`로 노출했다. 두 값은 요청한 screenshot 근사 선택이며 upstream/runtime 추출 값이라고 주장하지 않는다. gutter 배치의 실제 사용은 편집기 담당 범위다.
- `uiEditorFooter(children)`는 `IDEA.editorBreadcrumbHeight` 높이(22 compact/26 normal), editor 배경, semantic separator 위 경계, 오른쪽 정렬을 제공한다. children은 배열 또는 단일 element다. Markdown 기존 handler/상태의 이동은 편집기 담당이다. 새로운 Markdown 엔진이나 native footer API를 만들지 않았다.

## 검증과 남은 통합 작업

- `node --experimental-vm-modules design/idea/check_surfaces.mjs` 통과: 실제 toolbar group/label의 definite 중앙 정렬, 기존 customize/dispatch/overflow, 양쪽 stripe edge 전달, 모든 island foot의 border_b 부재와 기존 tool 상태 회귀.
- `node --experimental-vm-modules design/idea/check_system.mjs` 통과: canonical 색·marker metric·footer, compact/normal 양쪽 stripe의 mirrored offset와 계산상 가시 여백 대칭, hit target 내부 유지, 기존 layout 보존/idempotence 및 shared 상태/메뉴 회귀.
- 시스템 검사는 새 canonical token JSON을 직접 주입한다. 생성 전에도 원본 계약을 검증하며, 생성 사본 일치 검사는 부모의 `sync_ui.py --check` 단계와 구분한다.

담당 에이전트는 생성 파일 수정/생성, 설치, native check, 실제 UI 조작, commit을 실행하지 않았다. 부모의 배치 생성·설치 후 실제 screenshot에서 stripe와 toolbar 위치 및 Notifications 위 seam 부재를 확인해야 한다.
