# T09 설치된 IntelliJ Spring 기능의 정적 역공학 근거

조사일: 2026-11-04. 대상: `/Applications/IntelliJ IDEA.app`, 현재 `2026.2.4 / IU-262.11879.100`. IDEA나 Spring 프로젝트를 실행하지 않았다. Go 엔진 구현 전 기능 계약을 확인하는 읽기 전용 조사다.

후속 권한 변경 후 parent의 REA 호출이 성공했다. 동일 SHA의 `intellij.spring.jar`를 open/inspect한 실제 summary Evidence는 `ev_0a447663caa6905c4542485fcd0c66dd7d0fc594abb71c442b2df026b6aef32b`, retained parent는 `ev_8c9e8173b055b3a5f1ab3dab524498e00a51030db6e858e971cff87ee4d86769`다. 697 ZIP entry와 모순 없는 인벤토리를 확인했고 [원본 응답](T09-rea-spring-inventory.json)을 저장한 뒤 세션을 닫았다. 아래 차단 기록과 ‘새 Evidence 없음’은 최초 하위 조사 시점이며 현재 상태는 아니다. 기능별 bytecode 의미 근거는 여전히 아래 S09 정적 관측이다.

## REA 결과와 일반 정적 분석의 구분

`reverse-engineer-anything` skill과 blocker recovery 지침을 읽었다. 사용 가능한 실제 tool metadata를 조회하고 `mcp__rea__binary_session({})`를 호출했으나 클라이언트가 REA 실행 전에 다음 이유로 거부했다: `MCP tool call requires approval, but approval policy is never`. 사용자가 권한을 변경했다고 알린 뒤 한 번만 재시도했으며 결과가 같았다. REA 설정·engine 설치·승인 우회·중복 target session은 만들지 않았다. 따라서 **이번 Spring 조사에서 새 REA Evidence ID는 없다**.

기존 `docs/workflows/ide-platform/evidence/rea-session.json`은 다음을 보유한다.

- 성공한 `inspect_plist` Evidence: `ev_8b0fa4811f40735b491add73a7f1b7cefc04fba7a576ceddd84fda70b96e67fe`. 설치 앱의 위 버전 정보를 기록한다.
- 과거 `intellij.platform.ide.impl.jar` open은 성공했으나 inventory는 root artifact integrity mismatch로 실패했다. record-and-continue 재시도도 실패했다. 이 inventory를 Spring 구조의 성공 근거로 사용하지 않는다.

아래 `S09-*`는 **보고서 내부의 일반 shell 정적 관측 식별자**이며 REA Evidence ID가 아니다. Python `zipfile/hashlib/plistlib`와 기존 `/usr/bin/javap`(보고 버전21.0.9)을 사용했다. JVM class를 로드/실행하지 않고 패키지 멤버와 bytecode를 읽었다. 현재 Info.plist SHA-256은 `c8b430f17c31e0c53b01438a68f23181e0c76d5eb711fbf386524f9d381d7fad`다.

## 정확한 artifact 범위

경로는 `/Applications/IntelliJ IDEA.app/Contents/plugins/` 기준이다. SHA-256은 읽은 JAR 원본 바이트의 값이다. entries는 ZIP 멤버 수이며 전체 앱 기능 수가 아니다.

| 식별자 | JAR | bytes / entries | SHA-256 |
| --- | --- | --- | --- |
| S09-A | `Spring/lib/spring.jar` | 112654 / 3 | `b4443feea787afe17284dde4b13a3d13e68eb686a487de162ec083671463aeb1` |
| S09-B | `Spring/lib/modules/intellij.spring.jar` | 2560537 / 697 | `76989f72cb6bffc77b7c59d6a45ed658485cecf34fd74de03cc71bb45bdf22b0` |
| S09-C | `Spring/lib/modules/intellij.spring.core.jar` | 3475381 / 619 | `398e93d0f994a1c76b740b28cbfd924340bdb8e3337cf33e6095cc194132c726` |
| S09-D | `Spring/lib/modules/intellij.spring.core.analysis.services.jar` | 1122649 / 155 | `f2e3c1eb89996064918b03a9cdeaff7e79340a65aa40ae1d729c497043837ae0` |
| S09-E | `Spring/lib/modules/intellij.spring.core.analysis.jvm.jar` | 1178143 / 215 | `ed4f6cafda8f2444509098503464a4b09210e7e84c8ecb5eaddff183202bca71` |
| S09-F | `spring-mvc-impl/lib/spring-mvc-impl.jar` | 2846965 / 581 | `6997db296a4fe5be79dea1820782df9da43f840051ce1b06b47ff6975e909c91` |
| S09-G | `spring-boot-plugin/lib/spring-boot-plugin.jar` | 66900 / 3 | `23d77e688cb1b4d6d2439777ee9e3f9dc51a6d9155036d7b20538e24acf3735f` |
| S09-H | `spring-boot-plugin/lib/modules/intellij.spring.boot.core.jar` | 1485938 / 242 | `fda13fa37bfa343096be00466a612aeb47d44860ef7368547181703bb8e8e9c6` |

## Bean 선언·주입 navigation

S09-A의 `META-INF/plugin.xml` lines97–99는 UAST `SpringBeanAnnotator`, `SpringAutowiredAnnotator`, `SpringPropertiesAnnotator`를 등록한다. 구현은 S09-C의 `com.intellij.spring.ide.gutter` package다. 단순 annotation 색칠만이 아니라 별도 declaration/injection/property marker entrypoint가 있다.

S09-C `SpringBeanAnnotator`의 실제 method inventory에는 `annotateClass`, `annotateMethod`, `addSpringBeanGutterIcon`, `addShowInSpringViewGutterIcon`, `addMethodTypesGutterIcon`이 있다. `SpringAutowiredAnnotator`는 `annotateField`, `processAnnotatedMethod`, `getKotlinPrimaryConstructor`, `isKotlinPrimaryConstructor`, `annotateByNameAutowiredMethod`, `addConstructorArgsGutterIcon`을 갖는다. Kotlin 주생성자를 별도로 다룬다는 것은 관측이며 전체 Kotlin/Spring semantic parity를 확인한 것은 아니다.

`SpringAutowiredAnnotator.getNavigateToAutowiredCandidatesBuilder(PsiElement,Supplier,Function)` bytecode offsets27–30은 `SpringApiIcons.Gutter.ShowAutowiredCandidates`로 builder를 만들고,35–71에서 popup/empty/tooltip 문구를 지정하며,82–93에서 지연 계산한 **target collection**을 전달한다. S09-D `messages/SpringBundle.properties`의 해당 값은 후보 선택 popup과 후보 없음 상태를 명시한다. 따라서 후보가 여러 개일 때 임의 첫 선언으로 이동하는 방식은 이 UI 계약과 다르다. “참조 선언으로 이동”과 “주입 후보 보기”를 구분하는 근거다.

### Bean 이름과 @Bean

S09-B의 다음 실제 bytecode를 확인했다.

- `SpringStereotypeElement.getBeanName`: offsets21–34에서 annotation에 명시된 빈 이름이 비어 있지 않으면 반환하고,35–39에서 부모 기본 이름으로 fallback한다.
- `JamPsiClassSpringBean.getBeanName`: offsets19–26에서 class name을 `StringUtil.decapitalize`에 전달한다. 직접 만든 첫 글자 소문자 규칙의 모든 edge case까지 동일하다고 주장하지 않는다.
- `ContextJavaBean.getBeanNameAttributeValue`: offsets0–18에서 `name` attribute 목록이 있으면 사용하고 없으면 `value` 목록을 사용한다.
- `ContextJavaBean.getBeanName`: offsets0–30에서 첫 명시 이름을 사용하고 없으면 부모 이름으로 fallback한다. `SpringJavaBean`은 `JamPsiMethodSpringBean`을 상속하며 후자의 `getBeanName` offsets0–9는 `PsiMethod.getName`이다.
- `ContextJavaBean.getAliases`는 이름 목록과 alias 배열을 제공한다. 단일 이름 문자열만 저장하는 모델로는 다중 bean 이름/alias를 보존할 수 없다.

`JamPsiMethodSpringBean.class` 멤버 SHA-256: `d504db689b969df44b2c98eab1dd73c1b0e335d0fc34cc07b48b74182edbbd97`.

### Qualifier·Primary·후보 집합

S09-D `com.intellij.spring.core.analysis.services.SpringAutowireUtil`:

- `getAutowiredBeansFor` offsets27–50: resource annotation이 있고 member이면 resource 경로를 선택한다.51–69: effective qualifier가 있으면 qualified 경로를 선택한다.70–79: 나머지는 by-type 경로다.
- `getQualifiedAutowiredBeans` offsets27–33: qualifier 기반 pointer 집합을 찾은 뒤 주입 type으로 filter한다. qualifier 문자열만 같다고 type을 무시하지 않는다.
- `getByTypeAutowiredBeans` offsets18–45: 주입 위치 이름을 얻고 iterable 후보를 먼저 구한다. iterable 집합이 비어 있으면 type+injection-name으로 검색한다.
- `getPrimaryBeans` offsets84–118: 유효한 pointer의 `CommonSpringBean.isPrimary()`를 확인하며, primary와 주입 이름이 함께 맞으면 singleton을 반환한다.128–178은 primary 집합과 이름 일치 집합을 구분하고 primary 집합이 비었을 때 이름 집합으로 fallback한다. 호출자가 주는 이름이 null인 경우도 따로 처리한다. 이 helper 하나를 Spring 전체 runtime 우선순위 규칙이라고 일반화하지 않는다.
- `excludeAutowireCandidates`는 후보가 여러 개일 때 위 선호 집합을 계산하며, 선호 집합이 없으면 원 후보를 다시 검사한다. 무후보/다후보를 항상 한 개로 바꾸지는 않는다.

S09-B `JamPsiMemberSpringBean.isPrimary` offsets7–12는 `org.springframework.context.annotation.Primary`와 `MetaAnnotationUtil.isMetaAnnotated`를 사용한다. 실제 IDEA는 직접 `@Primary`뿐 아니라 meta-annotation도 고려한다. qualifier의 다른 구현 entrypoint로 `SpringQualifierComparator`, `SpringUastQualifierReference`, `USpringQualifier`가 패키지에 존재한다. 사용자 정의 composed qualifier의 전체 해석은 이번 범위에서 확인하지 않았다.

## Controller endpoint

S09-F의 `META-INF/plugin.xml` line133은 `RequestMappingServiceImpl`을 등록하고,175/179는 related-item/요청 mapping line marker를 등록한다. 실제 클래스는 `SpringMvcRequestMappingRelatedItemLineMarkerProvider`, `SpringMvcRequestMappingLineMarkerProvider`다.

S09-F `RequestMappingUtil.getAllRequestMethods` offsets0–18은 method-local method 값과 class mapping 유무를 읽는다.20–54는 class-level과 local method 값을 `LinkedHashSet`으로 모아 반환한다. `getUrlPathContext`는 offsets9–18에서 `SpringMvcUrlPathSpecification`에 실제 PSI member를 전달한다. 별도 `SpringControllerEndpointsProvider`와 `SpringMvcControllersEndpointsProvider`도 패키지에 있다. 이 관측만으로 모든 mapping 상속·동적 경로·버전 조건을 해석했다고 주장하지 않는다.

## Properties / configuration metadata

S09-G `META-INF/plugin.xml` line236은 `ConfigurationPropertyRelatedItemLineMarkerProvider`를 등록한다. S09-H의 `SpringBootConfigurationMetadataLoader`는 metadata 파일별 config key를 수집한다. `SpringBootConfigurationMetadataParser`의 bytecode에는 다음 실제 JSON field 접근과 선언 탐색 method가 있다.

- `getGroups`: `groups`, `name`, `type`.
- `processKeys`: `properties`, `name`, `type`, `sourceType`.
- `getValueAsString`: `defaultValue`; `getDescription`: `description`.
- `getDeprecation`: `deprecation`, `reason`, `level`, `replacement`, `deprecated`.
- `getItemHints`와 helpers: `hints`, `providers`, `parameters`, `values`, `value`.
- `getDeclarationElement`, `findPropertyNavigationTarget`, `isKeyMatchedByNameAnnotation`: metadata→source 선언 연결. 마지막 method는 `org.springframework.boot.context.properties.bind.Name`의 `value`를 확인한다.

S09-H의 `SpringBootApplicationMetaConfigKeyManagerImpl`에는 `spring-configuration-metadata.json` 상수가 있고, `SpringBootAdditionalConfigModificationTracker`에는 기본 및 `additional-spring-configuration-metadata.json` 두 이름이 모두 있다. source 분석과 metadata 기반 기능은 같은 것으로 취급하면 안 된다. YAML/Properties의 실제 사용 지점 reference 연결과 relaxed binding의 전체 규칙은 이번에 검증하지 않았다.

## Go 엔진에서 우선 구현할 작은 계약

다음은 위 artifact 관측에 근거한 **Herdr 구현 제안**이다. IDEA class를 이식하거나 동일한 전체 semantic engine을 확보했다는 뜻은 아니다.

1. Bean 선언 index: 지원하는 Java/Kotlin source의 stereotype 선언과 `@Bean` factory method에 위치·반환 type·명시 이름·기본 이름·alias·직접 qualifier/primary를 보존한다. annotation 근처 gutter에서 실제 선언/빈 목록으로 이동한다. resolved FQN과 short-name 추정의 신뢰도를 구분한다.
2. 주입 후보 navigation: constructor/field/method injection에서 type으로 후보를 좁히고 명시 qualifier/bean alias와 primary를 지원한다. 단일 확정 후보만 즉시 이동하고 다후보는 이름/type/path 목록, 무후보는 정확한 빈 상태를 표시한다. Collection/Optional/Provider 및 composed annotation을 구현하지 않았다면 해당 해석을 완성된 DI resolution이라고 표시하지 않는다. 확인한 후보만 반환하고 임의 첫 검색 결과를 성공으로 선택하지 않는다.
3. 이후 endpoint: 명시된 class/method mapping과 HTTP method를 index하고 source로 이동한다. 실행 중 서비스나 endpoint 호출 성공을 만들지 않는다.
4. 이후 config: workspace/의존 artifact에서 실제 metadata JSON을 찾은 경우에만 key/type/description/default/deprecation/hint를 제시하고 확인 가능한 sourceType 선언으로 연결한다. metadata가 없을 때 일반 문자열 검색 결과를 타입이 확인된 설정 선언으로 가장하지 않는다.

부모의 현재 Go/LSP 구현은 위 1–2를 먼저 검증하는 것이 적합하다. 이번 조사는 engine 구현이나 동작 테스트를 수행하지 않았다. Spring profile/condition/scan scope/XML/정확한 generics·상속·meta-annotation·runtime actuator는 별도 범위이며 unresolved다.

## 재현 명령 예

```sh
javap -p -c -classpath '/Applications/IntelliJ IDEA.app/Contents/plugins/Spring/lib/modules/intellij.spring.core.jar' com.intellij.spring.ide.gutter.SpringAutowiredAnnotator
javap -p -c -classpath '/Applications/IntelliJ IDEA.app/Contents/plugins/Spring/lib/modules/intellij.spring.core.analysis.services.jar' com.intellij.spring.core.analysis.services.SpringAutowireUtil
javap -p -c -classpath '/Applications/IntelliJ IDEA.app/Contents/plugins/Spring/lib/modules/intellij.spring.jar' com.intellij.spring.model.jam.javaConfig.ContextJavaBean
```

대상 JAR의 class/resource만 읽었다. IDEA script, application launch, 설정 쓰기, network/install, native app mod, 구현 파일 변경은 수행하지 않았다. REA policy blocker가 남아 있으며, 위 Spring bytecode 관측을 새 REA Evidence로 보고하지 않는다.
