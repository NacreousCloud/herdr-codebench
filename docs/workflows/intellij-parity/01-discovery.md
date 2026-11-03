# 현황 분석

기준: design/idea/tokens.json, keymap.json, DESIGN.md, 설치된 IntelliJ IDEA 2026.2 사용자 설정. 구현은 GPUI JavaScript로 DOM·CSS가 없다. 실제 API는 ~/.config/herdr-app/gpui-kit.d.ts와 herdr.d.ts다.

확인한 차이: 크기와 글꼴이 화면마다 하드코딩되어 있고 팝업 외곽 배경은 사각형이다. activity 에디터·미디어 뷰어와 에디터의 빈 상태·오류·정보·개요 패널은 단순한 부모 radius만으로 곡선 안에 갇히지 않는다. 이전 Agents 모서리 검증은 전체 모서리의 검증이 아니다. 기본 툴바의 설정은 Herdr 기본 설정으로 열린다.

레이아웃의 radius는 자식 배경을 클리핑하지 않는다. overflow_hidden도 둥근 마스크로 단정하지 않는다. 섬의 가장자리에는 자식이 덮지 않는 실제 마감 블록을 사용한다. layout.set 중첩 16 제한을 지킨다. 기본 Herdr 모드는 직접 수정하지 않는다.

기존 배치, 터미널, 언어 서버, 실행 구성, HTTP 보안 처리와 codebench는 보존한다. CLI 호출과 핫 리로드를 모아서 수행한다. 사용자가 앱을 함께 쓰므로 임시 UI 상태 변경은 최소화하고 복구한다.
