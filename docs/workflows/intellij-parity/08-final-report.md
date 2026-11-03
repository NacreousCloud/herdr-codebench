# 최종 결과

실제 IntelliJ Islands compact를 기준으로 Herdr idea 모드를 공통 디자인 시스템으로 재구성해 설치했다. compact 아이콘16/hit32/fill28, 섬 radius8/간격4/외곽gap0, 단일 툴 헤더, 선택 탭, 검색·최근 파일·메뉴, 설정 카테고리/키맵 트리, 실행 구성에 적용했다. macOS 키맵 상속의 Ctrl/Meta 경계를 교정했다.

새 UI는 design/idea/ui.js와 tokens.json을 기준으로 작성하고 sync_ui.py로 각 모드에 생성한다. AGENTS.md/COMPONENTS.md와 실제 컴포넌트 갤러리가 사용 규칙과 상태 예제를 제공한다. 설치기는 생성물 drift를 검사한다.

검사와 실제 CU 확인은 [통합 검토](07-integration-review.md)에 기록했다. 특히100행 메뉴 native icon 수명 문제는 실제 재현·교정·재검증했다. 설정 Apply로 normal/compact가 전환되는 것을 확인하고 compact13 상태로 복원했다. 모든 IDE 기능과 픽셀의 동등성을 주장하지 않으며 미실행 경로·플랫폼 차이를 해당 문서에 명시했다.
