# 태스크

| ID | 요구사항 | 범위 | 명세 |
| --- | --- | --- | --- |
| T01 | R01–R06 | 공통·레이아웃·셸·툴 윈도우·탭·설정 | tasks/T01-spec.md |
| T02 | R01–R03,R05 | activity 탐색·검색·편집 | tasks/T02-spec.md |
| T03 | R02,R04,R05 | 검색·실행·HTTP·메뉴 | tasks/T03-spec.md |
| T04 | R01–R03,R05 | 코드·리뷰·코멘트 | tasks/T04-spec.md |

공통 계약 후 독립 파일에서 병렬 구현한다. 설치·화면 조작·커밋·푸시는 root만 한다.

## 후속 감사·교정 결과

| ID | 범위 | 결과 |
| --- | --- | --- |
| T05–T06 | 초기 교정·통합 근거 | results/T05-result.md, T06-result.md |
| T07–T08 | 설치 자원 compact와 macOS 키맵 감사 | results/T07-artifact-audit.md, T08-keymap-runtime-audit.md |
| T09–T10 | 공통 시스템·키맵 추출 교정 | results/T09-system-result.md, T10-keymap-result.md |
| T11–T13 | popup/recent·키맵·공통 컴포넌트 채택 | results/T11-popup-components.md, T12-keymap-result.md, T13-components-result.md |
| T14–T16 | 갤러리·실행 구성·activity 확장 | results/T14-component-gallery.md, T15-run-configurations.md, T16-activity-components-result.md |
| T17–T18 | 통합 검토·설정 참조 재구성 | results/T17-integration-review.md, T18-settings-reference-result.md |
| T19–T20 | 갤러리 상태 확장·CU에서 발견한 최종 교정 | results/T20-final-runtime-validation.md |

최종 상태와 실제 확인 범위는00-progress/07-integration-review를 따른다. 초기 결과 문서의 후속 확인 요청은 통합 검토로 대조한다.
