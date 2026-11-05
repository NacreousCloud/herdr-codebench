# T14 — Problems 목록 겹침, 복사·선택·AI 첨부

실행: 구현/검증/앱 적용. 이전 T13 미커밋 변경을 유지한다.

- 목록의 고정 높이 행에는 첫 줄 요약만 넣고 clip한다. 원래 여러 줄 메시지는 보존하고 카드/상세에서 모두 읽는다.
- 진단 카드와 Problems에서 복사 버튼과 실제 텍스트 드래그 선택을 지원한다. 드래그는 텍스트 선택으로 해석한다. 파일 DnD를 되살리지 않는다.
- 개별/현재 표시 범위 전체의 AI 첨부는 명시적 클릭으로 현재 작업공간 AI 입력창에 텍스트를 붙여 넣는다. 사용자가 전송 전 검토할 수 있다. shell을 대상 기본값으로 삼거나 Enter를 보내지 않는다. AI가 여럿이면 대상 선택을 제공한다.
- 경로(머신 포함), 실제 줄/열, 진단 출처·코드·전체 메시지가 복사/첨부에서 유지된다. 전체는 현재 File/Project 범위와 필터 결과를 의미하며, 알려진 진단을 조용히 일부 잘라 보내지 않는다.
- 공유 header는 TOOLS/actions registry를 통하고 command가 실제 Problems owner에 도착한다. 텍스트 선택이 행의 기본 선택/자동 이동과 싸우지 않아야 한다.

## 계약/소유

parent: canonical ui.js 및 생성물, 카드/팝업/source/Problems UI, registry/command routing/i18n/갤러리와 관련 검사/통합.
diagnostic_actions (기본 모델 계승, medium): diagnostic-actions.js + diagnostic-model.js + check_diagnostic_actions.mjs + T14-actions-result.md만 소유.

entries = [{ path, on, root?, diagnostic: {line,col,end_line,end_col,severity,source,code,message} }].
model: diagnosticText(entries) 전체 문맥 포맷, diagnosticKey(entry) 안정 ID.
actions: diagnosticTargets(), copyDiagnostics(entries,cx), attachDiagnostics(entries,target,cx). T15에서 중복 조회하던 defaultDiagnosticTarget을 제거했고 UI coordinator가 후보 snapshot 하나로 단일/다중 선택을 결정한다. target은 targets()와 동일한 terminal/name을 가지며 stale/다른 space/머신/blocked 대상 검증 필수. 첨부는 clipboard→pane.focus→cx.sleep→focus/clipboard 재검증→terminal.paste의 기존 host 기능을 사용하고 submit하지 않는다.

위임은 문서 기반 개발 스킬에 따라 범위와 계약을 먼저 고정했다. 실제 AI 세션에 테스트 메시지를 보내지 않는다. 복사/첨부는 fixture와 실제 handler/host 호출 mock으로 검증하고 화면은 app shot으로 확인한다.
