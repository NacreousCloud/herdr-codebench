# IntelliJ UI/UX 전면 정합

2026-11-03. 구현·설치·통합 검증 완료. 기준은 실제 IntelliJ IDEA의 Islands Dark / compact / UI13 / 사용자 macOS 키맵이다. 선정 계획은 [PARITY_PLAN](../../../design/idea/PARITY_PLAN.md), 최종 세부 분석은 [DETAIL_AUDIT](../../../design/idea/DETAIL_AUDIT.md)다.

| 단계 | 상태 | 근거 |
| --- | --- | --- |
| 분석·선정 | 완료 | 실제 IDEA Computer Use, T07/T08 설치 자원·키맵 감사 |
| 설계·공통 계약 | 완료 | canonical tokens/ui, 생성기, COMPONENTS, AGENTS |
| 구현 | 완료 | 셸·툴 창·activity·코드/리뷰·검색·메뉴·설정·실행 구성 |
| 통합 검토 | 완료 | 07-integration-review, T17–T20 |
| 최종 검증 | 완료(범위 명시) | generator/46개JS/system/native check 및 실제 CU |

기존 codebench 레이아웃 파일을 변경하지 않았고 idea의 사용자 배치를 템플릿으로 리셋하지 않았다. 섬 geometry만 좁게 마이그레이션했다. 설치된 모드와 저장소 소스가 일치한다.

미검증 경로와 플랫폼 차이는 07/08에 남긴다. 모든 IntelliJ IDE 기능과 픽셀의 완전 동등성을 뜻하지 않는다. 이후 작업은 공통 컴포넌트를 확장한 뒤 호출부를 옮기고 생성기·실제 앱 검증을 반복한다.
