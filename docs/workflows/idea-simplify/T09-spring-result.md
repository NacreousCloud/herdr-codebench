# T09 Go Spring 기능 구현 결과

설치된 IDEA의 정적 근거는 `T09-spring-evidence.md`에 분리했다. 이번 구현은 그 class를 실행하거나 복사하지 않고, workspace의 Java/Kotlin source를 읽는 독립 Go index와 navigation을 추가한다. 담당 파일은 `engine/spring.go`, `engine/spring_test.go`다. Go core/LSP, HTTP route와 JS 연결, binary 빌드·배포는 다른 담당 범위다.

## 공개 계약과 실제 기능

- `springMarkers(Request) ([]SpringMarker,error)`: `Text`가 있으면 미저장 내용을 사용하고 없으면 source 파일을 읽는다. 위치는 0-based UTF-16 column이다. marker의 `kind`는 `spring-bean`, `spring`, `spring-property`다. `line/col/name/type/qualifier/key/title/owner`를 제공한다.
- `springRelated(ctx,*Engine,Request) ([]Location,error)`: `spring`은 주입 지점→bean 후보, `spring-bean`은 bean 선언→해당 후보를 사용하는 injection 지점, `spring-property`는 `@Value` key→실제 application config key 선언으로 이동한다. Spring source index는 LSP process를 시작하지 않는다. 무후보는 빈 배열, 다후보는 배열 전체를 유지한다.
- `springProject(Request) (any,error)`: `Kind=beans`(기본), `endpoints`, `properties`; 실제 source/key 위치 목록을 반환하며 `Query`는 이름/detail을 필터한다.

### Bean과 DI

`@Service`, `@Component`, `@Repository`, `@Configuration`, `@Controller`, `@RestController` class와 `@Bean` factory method를 index한다. stereotype의 명시적 이름과 기본 이름, factory의 `name`/`value`와 여러 alias, factory 반환 type, 직접 `@Qualifier`/`@Primary`를 보존한다. 명시적 `@Bean` scalar factory 선언도 목록/marker에 남는다.

Java field/constructor/method의 `@Autowired`, `@Inject`, `@Resource`, bean의 단일 Java constructor와 Kotlin primary constructor parameter를 다룬다. primitive/scalar constructor/config field를 일반 bean injection으로 표시하지 않으며, `@Value`는 별도 config marker다. `@Resource(name=...)`, resource의 암묵적 field name, `@Qualifier`와 bean alias를 사용한다. qualifiers는 type 일치 후보를 먼저 좁히는 데 사용한다.

type은 package/명시 import를 구분하고, index된 class의 implements/extends 관계를 따라 interface→bean implementation을 찾는다. 같은 simple name의 다른 package bean을 무조건 섞지 않는다. 일반 단일 주입에서는 primary 후보, 이름 일치 후보를 선호하되 복수 결과를 그대로 둔다. List/Set/Collection/Iterable/Map 및 Provider/ObjectProvider/ObjectFactory/Optional/Lazy 같은 wrapper는 element type으로 source 후보를 모으고 primary 하나로 강제 축소하지 않는다. generic argument의 정확한 assignability까지 확인한 것은 아니므로 후보는 항상 static source candidate로 표시한다.

직접 `@Profile`/`@Conditional*`가 붙은 선언은 runtime 활성 여부를 평가하지 않고 후보 detail에 남긴다. conditional 후보가 섞이면 primary/name에 의한 단일 확정을 강요하지 않는다.

### Endpoint와 config

명시된 class/method의 `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping` 문자열 path와 method를 합쳐 source 위치를 반환한다. 상수 변수·문자열 덧셈 같은 dynamic expression은 추측한 route를 만들지 않고 생략한다. endpoint를 호출하거나 서버 실행 성공으로 표시하지 않는다.

`@Value("${key:default}")`의 literal key를 읽어 `application*.properties`, `application*.yaml/yml`의 key 선언으로 연결한다. YAML은 명시적 nested map과 document 구분을 지원한다. block scalar 안의 `fake: text`는 key로 해석하지 않는다. config 응답의 Name/Text에는 key만 넣고 실제 property 값이나 default 값을 반환하지 않는다.

## source 읽기·cache 범위

- explicit `Root`가 있으면 실제 source 경로를 포함해야 한다. 없으면 해당 source에서 위로 올라가 가까운 Maven/Gradle/git marker로 root를 선택한다. 따라서 일반 nested build module은 가까운 root로 제한된다.
- source는 `.java/.kt/.kts`, config는 위 application 이름/확장자만 읽는다. hidden/credential/secret 경로, build/target/out/bin/dist, vendor/node_modules/cache와 symlink를 제외한다. `.env`, 임의 JSON/credential 파일, binary를 source로 읽지 않는다. 실제 통합에서 발견한 `bin/main`의 Kotlin/resource mirror도 제외하여 원본 bean과 생성 복사본이 가짜 다후보가 되지 않게 했다.
- 한 파일1MiB, 프로젝트2000개 파일/16MiB, directory entry20000개로 제한한다. 한도를 넘으면 완전한 결과인 척 부분 배열을 반환하지 않고 오류를 낸다. 관련 navigation의 context 취소도 확인한다.
- root별 파일 path/mtime/size signature로 index를 재사용하며 최대5초 후 다시 읽는다. root cache는 최대4개다. 미저장 Text override는 별도 index를 만들어 디스크 cache를 오염시키지 않는다.
- tokenizer는 comment, quoted string, Kotlin raw string과 UTF-16 위치를 구분한다. 주석/문자열 안의 `@Service`/`@Autowired` 텍스트는 선언 marker가 되지 않는다.

## 확인한 검증

`cd engine && go test ./...` 및 `go test -race ./...` 통과. 담당 파일 `git diff --check` 통과.

여덟 Spring fixture group에서 다음 결과를 검증한다.

1. stereotype/@Bean aliases/반환 type, qualifier·primary·resource·Inject constructor, Kotlin nullable primary constructor, bean 선언에서 실제 injection 사용으로 역방향 이동.
2. interface implementation의 다후보 유지, 다른 package의 같은 simple name 제외, conditional primary 보존, 없는 qualifier에 대한 잘못된 fallback 방지.
3. properties와 nested YAML의 동일 key 위치, property/default 값 미반환, GET/POST class-prefix endpoint, 프로젝트 검색.
4. 주석/문자열 false positive 방지, unrelated imported annotation 제외, emoji 앞 UTF-16 column, 미저장 Text 반영과 cache 격리.
5. build/vendor/credential/.env/symlink 제외, root 밖 path 거부, stat signature 갱신과 취소.
6. extends+implements, factory qualifier와 value aliases, 암묵 resource name, provider/list 다후보, scalar `@Bean` 선언.
7. dynamic class/method route의 가짜 endpoint 방지, YAML block scalar 내용 미해석.
8. `bin/main`의 source/config mirror를 제외하고 실제 `src/main` bean 한 개와 config key 한 개만 반환하는 회귀.

## 명시적인 제약

컴파일러·Spring runtime 전체 모델은 아니다. composed/meta annotation, wildcard import type ambiguity, typealias, 정확한 generic argument·variance, XML bean, component-scan 경계, profile/condition 실행, 의존 JAR의 bean class, runtime actuator는 해석하지 않는다. source의 명시 package/import/선언에 근거한 후보 탐색이다. config는 기본 literal key 범위이며 quoted/복잡한 YAML, relaxed binding 전체 규칙, 의존 JAR configuration metadata completion은 구현하지 않았다. `@Value` 문자열에 여러 placeholder가 있으면 첫 literal key만 marker에 사용한다.

엔진 API와 JS gutter/chooser의 실제 앱 왕복, platform별 실행 binary, 배포·commit은 부모 통합 단계에서 검증한다. 담당 에이전트는 binary build, 설치, app/native 수정 또는 commit을 수행하지 않았다. 부모에게 전달한 source freeze 이후 semantic Go 변경은 없다.
