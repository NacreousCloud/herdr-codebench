package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func spFixture(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	files["pom.xml"] = "<project/>"
	for name, text := range files {
		p := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}
func spRequest(root, file, name, typ string) Request {
	return Request{Root: root, Path: filepath.Join(root, file), Name: name, Type: typ, Kind: "spring"}
}
func spRelatedTest(t *testing.T, r Request) []Location {
	t.Helper()
	got, err := springRelated(context.Background(), nil, r)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestSpringBeansInjectionAndAliases(t *testing.T) {
	root := spFixture(t, map[string]string{
		"api/Api.java":       "package api;\npublic interface Api {}",
		"impl/Fast.java":     "package impl;\nimport api.Api;\n@Service(\"fast\")\npublic class Fast implements Api {}",
		"impl/Slow.java":     "package impl;\nimport api.Api;\n@Primary\n@Service\npublic class Slow implements Api {}",
		"other/Api.java":     "package other;\n@Service\npublic class Api {}",
		"use/Factories.java": "package use;\nimport api.Api;\n@Configuration\nclass Factories {\n @Bean(name={\"factory\",\"alias\"})\n Api makeApi() { return null; }\n}",
		"use/Use.java":       "package use;\nimport api.Api;\nimport java.util.List;\n@Service\nclass Use {\n @Autowired private Api plain;\n @Autowired @Qualifier(\"fast\") private Api fast;\n @Autowired @Qualifier(\"alias\") private Api factory;\n @Autowired private List<Api> all;\n @Resource(name=\"fast\") private Api resource;\n @Autowired private String scalar;\n @Inject Use(@Qualifier(\"fast\") Api constructor) {}\n}",
		"use/KUse.kt":        "package use\nimport api.Api\n@Service\nclass KUse(private val api: Api?, @Qualifier(\"fast\") val chosen: Api, val count: Int)\n",
	})
	for _, tc := range []struct{ name, want string }{{"plain", "Slow.java"}, {"fast", "Fast.java"}, {"factory", "Factories.java"}, {"resource", "Fast.java"}, {"constructor", "Fast.java"}} {
		got := spRelatedTest(t, spRequest(root, "use/Use.java", tc.name, "Api"))
		if len(got) != 1 || !strings.HasSuffix(got[0].Path, tc.want) {
			t.Fatalf("%s candidates: %+v", tc.name, got)
		}
	}
	all := spRelatedTest(t, spRequest(root, "use/Use.java", "all", "List<Api>"))
	if len(all) != 3 {
		t.Fatalf("collection must retain all typed candidates, got %+v", all)
	}
	chosen := spRelatedTest(t, spRequest(root, "use/KUse.kt", "chosen", "Api"))
	if len(chosen) != 1 || !strings.HasSuffix(chosen[0].Path, "Fast.java") {
		t.Fatalf("Kotlin constructor qualifier: %+v", chosen)
	}
	markers, err := springMarkers(Request{Path: filepath.Join(root, "use/Use.java")})
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range markers {
		if m.Name == "scalar" {
			t.Fatal("scalar config field became a bean injection")
		}
	}
	fastMarkers, err := springMarkers(Request{Path: filepath.Join(root, "impl/Fast.java")})
	if err != nil || len(fastMarkers) != 1 {
		t.Fatalf("bean markers %+v %v", fastMarkers, err)
	}
	r := spRequest(root, "impl/Fast.java", "fast", "")
	r.Kind = "spring-bean"
	r.Line = fastMarkers[0].Line
	uses := spRelatedTest(t, r)
	if len(uses) < 3 {
		t.Fatalf("bean declaration must navigate to injection uses: %+v", uses)
	}
}

func TestSpringAmbiguityImportsAndConditions(t *testing.T) {
	root := spFixture(t, map[string]string{
		"a/Api.java":   "package a;\ninterface Api {}",
		"b/Api.java":   "package b;\n@Service class Api {}",
		"a/One.java":   "package a;\n@Service class One implements Api {}",
		"a/Two.java":   "package a;\n@Service class Two implements Api {}",
		"use/Use.java": "package use;\nimport a.Api;\nclass Use {\n @Autowired Api repo;\n}",
	})
	r := spRequest(root, "use/Use.java", "repo", "Api")
	if got := spRelatedTest(t, r); len(got) != 2 {
		t.Fatalf("ambiguous interface keeps both implementations, not b.Api: %+v", got)
	}
	text := "package a;\n@Primary @Profile(\"dev\") @Service class One implements Api {}"
	if err := os.WriteFile(filepath.Join(root, "a/One.java"), []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
	got := spRelatedTest(t, r)
	if len(got) != 2 {
		t.Fatalf("conditional primary is not runtime certainty: %+v", got)
	}
	missing := r
	missing.Qualifier = "absent"
	missing.Name = "notAParsedInjection"
	if got := spRelatedTest(t, missing); len(got) != 0 {
		t.Fatalf("unmatched qualifier must not fall back: %+v", got)
	}
}

func TestSpringValuesYAMLAndEndpoints(t *testing.T) {
	root := spFixture(t, map[string]string{
		"web/Controller.kt":            "package web\n@RestController\n@RequestMapping(\"/api\")\nclass Controller {\n @Value(\"${app.database.url:jdbc:default}\") lateinit var url: String\n @GetMapping(\"/items\")\n fun items(): String { return \"ok\" }\n @PostMapping(path=\"/items\")\n fun add(): String { return \"ok\" }\n}",
		"application.properties":       "app.database.url=DO_NOT_RETURN_SECRET\nother.key: ANOTHER_VALUE\n",
		"application-dev.yaml":         "app:\n  database:\n    url: DO_NOT_RETURN_YAML_SECRET\n",
		"application-credentials.yaml": "app:\n  secret: DO_NOT_READ\n",
	})
	r := spRequest(root, "web/Controller.kt", "url", "String")
	markers, err := springMarkers(r)
	if err != nil {
		t.Fatal(err)
	}
	var property *SpringMarker
	for i := range markers {
		if markers[i].Kind == "spring-property" {
			property = &markers[i]
		}
	}
	if property == nil || property.Key != "app.database.url" {
		t.Fatalf("property markers %+v", markers)
	}
	r.Kind = "spring-property"
	r.Key = property.Key
	got := spRelatedTest(t, r)
	if len(got) != 2 {
		t.Fatalf("properties/YAML key declarations: %+v", got)
	}
	b, _ := json.Marshal(got)
	if strings.Contains(string(b), "DO_NOT_RETURN") {
		t.Fatalf("property values leaked: %s", b)
	}
	result, err := springProject(Request{Root: root, Kind: "endpoints"})
	if err != nil {
		t.Fatal(err)
	}
	endpoints := result.([]Location)
	if len(endpoints) != 2 || !strings.Contains(endpoints[0].Detail, "GET /api/items") || !strings.Contains(endpoints[1].Detail, "POST /api/items") {
		t.Fatalf("controller endpoints: %+v", endpoints)
	}
	result, err = springProject(Request{Root: root, Kind: "properties", Query: "database.url"})
	if err != nil || len(result.([]Location)) != 2 {
		t.Fatalf("property search %+v %v", result, err)
	}
}

func TestSpringLexicalSafetyAndUnsavedUTF16(t *testing.T) {
	source := "package sample\n// @Service class Commented\nval fake = \"@Autowired Api nope\"\n@Service class Unicode {\n val note = \"😀\"; @Autowired val repo: Api\n}\n"
	markers, err := springMarkers(Request{Path: "Unicode.kt", Text: &source})
	if err != nil {
		t.Fatal(err)
	}
	if len(markers) != 2 {
		t.Fatalf("comments and strings must not create markers: %+v", markers)
	}
	for _, m := range markers {
		if m.Kind == "spring" {
			line := strings.Split(source, "\n")[m.Line]
			want := spWidth(line[:strings.Index(line, "repo")])
			if m.Col != want {
				t.Fatalf("UTF16 col got %d want %d", m.Col, want)
			}
		}
	}
	falseAnnotation := "import other.Service\n@Service class Nope {}"
	got, err := springMarkers(Request{Path: "Nope.kt", Text: &falseAnnotation})
	if err != nil || len(got) != 0 {
		t.Fatalf("unrelated imported annotation created Spring bean %+v %v", got, err)
	}
	root := spFixture(t, map[string]string{"Api.java": "interface Api {}", "Bean.java": "@Service class Bean implements Api {}", "Use.java": "class Use { @Autowired Api repo; }"})
	r := spRequest(root, "Use.java", "repo", "Api")
	if len(spRelatedTest(t, r)) != 1 {
		t.Fatal("initial bean")
	}
	edited := "class Use { @Autowired @Qualifier(\"missing\") Api repo; }"
	r.Text = &edited
	if got := spRelatedTest(t, r); len(got) != 0 {
		t.Fatalf("unsaved source was not used: %+v", got)
	}
	r.Text = nil
	if len(spRelatedTest(t, r)) != 1 {
		t.Fatal("unsaved override contaminated cached disk index")
	}
}

func TestSpringBoundedPathsAndCacheRefresh(t *testing.T) {
	root := spFixture(t, map[string]string{"Use.java": "class Use {}", "A.java": "@Service class A {}", "build/Bad.java": "@Service class Bad {}", "vendor/Bad.java": "@Service class Bad {}", ".env": "password=do-not-read", "credentials/Bad.java": "@Service class Bad {}"})
	result, err := springProject(Request{Root: root})
	if err != nil || len(result.([]Location)) != 1 {
		t.Fatalf("excluded build/vendor/secret paths %+v %v", result, err)
	}
	outside := spFixture(t, map[string]string{"Outside.java": "@Service class Outside {}"})
	if _, err := springProject(Request{Root: root, Path: filepath.Join(outside, "Outside.java")}); err == nil {
		t.Fatal("outside-root path accepted")
	}
	if err := os.Symlink(filepath.Join(outside, "Outside.java"), filepath.Join(root, "Linked.java")); err != nil {
		t.Fatal(err)
	}
	result, err = springProject(Request{Root: root})
	if err != nil || len(result.([]Location)) != 1 {
		t.Fatalf("symlink outside scanned %+v %v", result, err)
	}
	if err := os.WriteFile(filepath.Join(root, "B.java"), []byte("@Service class B {}"), 0600); err != nil {
		t.Fatal(err)
	}
	result, err = springProject(Request{Root: root})
	if err != nil || len(result.([]Location)) != 2 {
		t.Fatalf("stat signature failed to refresh cache %+v %v", result, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := springRelated(ctx, nil, spRequest(root, "Use.java", "", "")); err == nil {
		t.Fatal("cancelled scan did not stop")
	}
}

func TestSpringFactoryQualifierInheritanceProvidersAndResourceName(t *testing.T) {
	root := spFixture(t, map[string]string{
		"a/Api.java":       "package a;\ninterface Api {}",
		"a/Base.java":      "package a;\nclass Base {}",
		"a/Impl.java":      "package a;\n@Service(\"fast\") class Impl extends Base implements Api {}",
		"a/Preferred.java": "package a;\n@Primary @Service class Preferred implements Api {}",
		"a/Config.java":    "package a;\n@Configuration class Config {\n @Bean(value={\"made\",\"otherName\"}) @Qualifier(\"special\") Api make() { return null; }\n @Bean String textBean() { return \"text\"; }\n}",
		"a/Use.java":       "package a;\nclass Use {\n @Resource Api fast;\n @Autowired @Qualifier(\"special\") Api special;\n @Autowired Provider<Api> deferred;\n @Autowired List<Api> all;\n}",
	})
	for _, tc := range []struct{ name, want string }{{"fast", "Impl.java"}, {"special", "Config.java"}} {
		got := spRelatedTest(t, spRequest(root, "a/Use.java", tc.name, "Api"))
		if len(got) != 1 || !strings.HasSuffix(got[0].Path, tc.want) {
			t.Fatalf("%s: %+v", tc.name, got)
		}
	}
	for _, name := range []string{"deferred", "all"} {
		got := spRelatedTest(t, spRequest(root, "a/Use.java", name, ""))
		if len(got) != 3 {
			t.Fatalf("%s erased wrappers must preserve candidate ambiguity: %+v", name, got)
		}
	}
	markers, err := springMarkers(Request{Path: filepath.Join(root, "a/Config.java")})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, m := range markers {
		if m.Name == "textBean" {
			found = true
		}
	}
	if !found {
		t.Fatal("explicit @Bean scalar factory declaration was dropped")
	}
}

func TestSpringDynamicRoutesAndYAMLBlockValuesExcluded(t *testing.T) {
	root := spFixture(t, map[string]string{
		"Web.java":         "@RestController @RequestMapping(PREFIX) class Web {\n @GetMapping(\"/a\") String a(){ return \"\"; }\n}",
		"Other.java":       "@RestController class Other {\n @GetMapping(\"/a\" + SUFFIX) String a(){ return \"\"; }\n}",
		"application.yaml": "app:\n  message: |\n    fake: not-a-key\n  database:\n    url: hidden-value\n---\nother:\n  key: hidden-value\n",
	})
	got, err := springProject(Request{Root: root, Kind: "endpoints"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.([]Location)) != 0 {
		t.Fatalf("dynamic route fabricated: %+v", got)
	}
	keys, err := springProject(Request{Root: root, Kind: "properties"})
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range keys.([]Location) {
		if strings.Contains(l.Name, "fake") || strings.Contains(l.Text, "hidden-value") {
			t.Fatalf("YAML scalar content was interpreted as configuration: %+v", l)
		}
	}
	r := spRequest(root, "Web.java", "", "")
	r.Path = filepath.Join(root, "../outside.java")
	if _, err := spLoad(context.Background(), r); err == nil {
		t.Fatal("invalid source path accepted")
	}
}

func TestSpringGeneratedBinMirrorsExcluded(t *testing.T) {
	root := spFixture(t, map[string]string{
		"src/main/kotlin/app/PlaylistService.kt":    "package app\n@Service class PlaylistService {}",
		"src/main/kotlin/app/M3u8Service.kt":        "package app\n@Service class M3u8Service(val playlistService: PlaylistService)",
		"src/main/resources/application.properties": "playlist.mode=SOURCE_VALUE\n",
		"bin/main/app/PlaylistService.kt":           "package app\n@Service class PlaylistService {}",
		"bin/main/app/M3u8Service.kt":               "package app\n@Service class M3u8Service(val playlistService: PlaylistService)",
		"bin/main/application.properties":           "playlist.mode=GENERATED_VALUE\n",
		"bin/main/application.yaml":                 "generated:\n  duplicate: GENERATED_VALUE\n",
	})
	got := spRelatedTest(t, spRequest(root, "src/main/kotlin/app/M3u8Service.kt", "playlistService", "PlaylistService"))
	if len(got) != 1 || !strings.Contains(filepath.ToSlash(got[0].Path), "/src/main/kotlin/") {
		t.Fatalf("generated bin mirror became a false ambiguous bean: %+v", got)
	}
	beans, err := springProject(Request{Root: root, Kind: "beans"})
	if err != nil || len(beans.([]Location)) != 2 {
		t.Fatalf("generated bean list duplicates: %+v %v", beans, err)
	}
	keys, err := springProject(Request{Root: root, Kind: "properties"})
	if err != nil || len(keys.([]Location)) != 1 || keys.([]Location)[0].Name != "playlist.mode" {
		t.Fatalf("generated config mirrors leaked into key list: %+v %v", keys, err)
	}
}
