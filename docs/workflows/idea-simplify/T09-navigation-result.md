# T09 navigation 결과 — Go to Super preview callback 오류 수정

## 원인과 수정

`lsp_bridge.py`의 실제 helper 계약은 `with_previews(locs)`다. `navigation.related()`의 super 경로와 Spring 경로가 모두 `with_previews(targets, server)`처럼 인자를 두 개 전달해 `with_previews() takes 1 positional argument but 2 were given`이 발생했다.

- 두 호출부를 실제 helper 계약에 맞게 한 인자로 수정했다.
- 같은 함수의 다른 주입 helper인 `server_for(path,retry)`, `position(req)`, `locations(result,server)`, `to_uri(path)`도 실제 bridge 정의와 대조했다. 추가 signature 불일치는 없었다.
- `prepareTypeHierarchy`가 성공해도 `typeHierarchy/supertypes`를 지원하지 않는 서버에서는 기존 definition fallback을 사용할 수 있게 했다. 준비 단계 미지원/빈 결과와 동일하게 처리하며 대상 경로를 만들어 내지 않는다.

`lsp_bridge.py`, 소스 에디터/marker 모델/JS LSP 호출부는 수정하지 않았다. 기존 부모 클래스 내 멤버 찾기와 Spring 구현체/@Bean 후보 정책은 유지한다. Spring의 profile/condition/qualifier/container 정확성은 이 변경의 검증 범위가 아니다.

## 회귀 검사

새 `design/idea/check_navigation.py`는 실제 `navigation.py`를 실행하고, bridge의 실제 `position`, URI 변환, `locations`, `materialize`, `with_previews` 함수 정의를 AST로 읽어 실행한다. helper 구현을 테스트에 복사하지 않는다. bridge 전체 import의 PATH/config 초기화, HTTP 서버, 언어 서버 실행은 피한다. LSP 응답만 fake server로 제공하고 임시 파일의 실제 텍스트 preview를 확인한다.

`python3 design/idea/check_navigation.py` — 종료 코드 0, 6개 테스트 통과:

- type hierarchy의 부모에서 실제 같은 이름 멤버를 찾아 위치와 preview 반환.
- hierarchy가 비었거나 prepare가 미지원이거나 supertypes가 미지원인 세 경우 모두 definition fallback 사용. supplementary Unicode 문자가 앞에 있는 타입 위치의 UTF-16 좌표도 확인.
- 부모 선언을 해석하지 못하면 후보를 지어내지 않고 빈 결과 유지.
- 기존 Spring 경로의 실제 구현체와 올바른 타입의 `@Bean` 후보를 유지하고 중복/다른 타입/비-Bean 후보를 제외. 실제 preview와 implementation 요청 좌표 확인.
- optional implementation/workspace symbol 메서드가 미지원이어도 이미 해석한 타입 definition과 preview 유지.
- Spring LSP 후보가 없으면 빈 결과 유지.

설치·앱/bridge/LSP 실행·커밋은 수행하지 않았다. 실제 사용자 서버와 화면의 Go to Super/선택 결과는 부모 통합 단계에서 확인해야 한다. fake LSP 검사를 실제 Spring container 분석이나 모든 JVM 서버 지원으로 확대 해석하지 않는다.

## T09 Go engine 후속 — Super 탐색

사용자가 Go engine과 다중 OS binary를 명시한 후 `engine/related.go`와 `engine/related_test.go`에 Go super 탐색을 구현했다. 기존 Python hotfix와 검사는 유지한다. Go process/HTTP/LSP transport·Spring 분석·binary build와 UI 통합은 다른 담당이 소유한다.

`related(ctx,e,req)`는 `kind == "super"`만 처리하고 나머지 요청은 `springRelated()`에 위임한다. Engine의 실제 Server/Open/Call/Locations와 `withPreviews([]Location)` 계약을 사용한다. 작은 내부 callback 조립은 같은 알고리즘을 fake LSP 응답과 실제 Engine location/preview helper로 검증하기 위한 경계다. 별도 서버/상태/분석 framework는 추가하지 않았다.

### 실제 대상 결정

- owner의 실제 UTF-16 위치에서 `prepareTypeHierarchy`를 요청하고, 서버가 돌려준 opaque item/data를 보존한 채 `typeHierarchy/supertypes`에 전달한다. 반환된 직접 부모들을 모두 유지한다.
- hierarchy가 비었거나 해당 메서드가 RPC `-32601` 미지원이면 Java `extends`/`implements`와 Kotlin `:` header의 실제 타입 식별자들을 찾는다. 다중 부모·qualified 이름·generic/constructor 구간·주석/문자열을 구별하고 각 타입 식별자 위치에서 LSP definition을 요청한다. 타입 이름으로 파일 경로를 생성하지 않는다.
- 해석된 부모의 실제 URI로 `documentSymbol`을 요청한다. materialized library source도 원래 library URI를 보존한다. 정확한 parent selection 위치를 우선하여 같은 줄의 coarse nested range가 다른 타입으로 탐색을 빼앗지 못하게 한다.
- 해당 부모 타입 범위의 같은 이름 method/function/property/field symbol만 후보로 만든다. constructor·형제/중첩 타입의 같은 이름 멤버는 선택하지 않는다. 같은 이름 overload와 여러 부모는 각 위치/이름/detail을 보존해 명시적인 chooser 후보로 반환한다. 첫 번째 이름을 임의로 고르지 않는다.
- documentSymbol이 미지원/비어 있거나 flat 결과로 부모 범위를 정할 수 없으면 실제 resolved source의 부모 class 범위만 token 기반으로 확인한다. comment/string·호출식·constructor·nested class/local 변수와 선언을 구별하고 같은 이름 선언들을 모두 유지한다. primary-constructor property, member extension과 Java의 class와 같은 이름을 가진 실제 return-type method도 구별한다. 이 fallback은 signature resolution을 수행했다고 표시하지 않는다.
- hierarchy나 symbols의 실제 disconnect/timeout/JSON 오류는 빈 결과로 숨기지 않고 호출자에게 반환한다. 부모/멤버를 해석하지 못한 경우 class 선언이나 엉뚱한 첫 이름으로 대체하지 않는다.

이는 직접 부모와 그 멤버의 탐색이다. 모든 transitive JVM 상속/제네릭 override 호환성을 자체 compiler처럼 판정하는 구현은 아니다. 드문 Java/Kotlin 문법은 conservative source fallback에서 후보를 놓칠 수 있으며, 동작한 것처럼 가짜 경로/정답 하나를 만들지 않는다.

### Go 검사

다음 명령은 `engine/`에서 종료 코드 0이다.

- `go test ./...`
- `go test -race -run TestSuper -v ./...` — 7개 top-level 테스트와 table/subtest 통과. Java/Kotlin header, 다중 부모, UTF-16, opaque hierarchy 데이터, 모든 overload 보존, 정확한 parent symbol scope, source 선언/호출/constructor/중첩/지역 변수 구별, method-not-found fallback 세 경우, 실제 operational error 보존, library URI 보존을 검사한다. transport/process를 시작하지 않고 callback LSP 응답을 제공하며 실제 Engine Locations/preview와 임시 파일을 사용한다.

기존 `python3 design/idea/check_navigation.py` 6개 검사와 관련 파일의 `git diff --check`도 재통과했다. Go 소스는 부모의 다중 OS build 전에 freeze했다. 이 담당은 binary build/release·설치·LSP/app 실행·커밋을 수행하지 않았다. 실제 binary 아키텍처·real LSP·Spring jar/IDEA 동작 증거와 UI 검증은 부모 통합 보고서에서 별도로 확인한다.
