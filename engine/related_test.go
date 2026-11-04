package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func superTestJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func superTestFile(t *testing.T, root, name, source string) string {
	t.Helper()
	path := filepath.Join(root, name)
	if err := os.WriteFile(path, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func superTestRange(startLine, startCol, endLine, endCol int) superRange {
	return superRange{Start: superWirePosition{Line: startLine, Character: startCol}, End: superWirePosition{Line: endLine, Character: endCol}}
}

func superTestLocation(path string, line, col int) map[string]any {
	return map[string]any{"uri": toURI(path), "range": superTestRange(line, col, line, col+1)}
}

func superTestSymbol(name string, kind int, line, col, endLine int, children ...superSymbol) superSymbol {
	startCol := 0
	if superIsType(kind) && col > 6 {
		startCol = col - 6
	}
	rng, selected := superTestRange(line, startCol, endLine, 200), superTestRange(line, col, line, col+len(superMemberName(name)))
	return superSymbol{Name: name, Kind: kind, Range: &rng, SelectionRange: &selected, Children: children}
}

func superTestCallbacks(t *testing.T, path string, call func(context.Context, string, any) (json.RawMessage, error)) superCallbacks {
	t.Helper()
	engine := &Engine{cache: t.TempDir()}
	return superCallbacks{uri: toURI(path), call: call, read: os.ReadFile,
		open: func(_ context.Context, path string) (string, error) {
			if _, err := os.Stat(path); err != nil {
				return "", err
			}
			return toURI(path), nil
		},
		locations: func(ctx context.Context, raw json.RawMessage) ([]Location, error) {
			return engine.Locations(ctx, raw, nil)
		}}
}

func superTestPoint(source, word string) Position {
	index := strings.Index(source, word)
	prefix := source[:index]
	line := strings.Count(prefix, "\n")
	last := strings.LastIndex(prefix, "\n")
	return Position{Line: line, Col: utf16Len(prefix[last+1:])}
}

func TestSuperHeaderTypes(t *testing.T) {
	cases := []struct {
		name, source string
		expected     []string
	}{
		{"kotlin interfaces", "class Child : First, Second<Thing> {}", []string{"First", "Second"}},
		{"kotlin constructor", "/* 😀 */ class Child<T : Bound>(@Named(\"fake:Wrong, Another\") val dep: Item)\n : pkg.Base<T>(dep), Runnable, Contract<A, B> where T : Other {}", []string{"Base", "Runnable", "Contract"}},
		{"java parents", "public class Child<T extends Wrong> extends pkg.Base<T> implements One<A,B>, @Tag Two {}", []string{"Base", "One", "Two"}},
		{"java interface", "interface Child extends First, Second {}", []string{"First", "Second"}},
		{"java record", "record Child(String value) implements First, Second {}", []string{"First", "Second"}},
		{"comments and strings", "/* class Wrong extends Fake */\nclass Child(@A(\"extends Fake\") val x: String) : Actual {}", []string{"Actual"}},
		{"no parent", "class Child(val x: Thing) { fun method(): Wrong = value }", nil},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			refs := superHeaderTypes(test.source, superTestPoint(test.source, "Child"))
			var names []string
			for _, ref := range refs {
				names = append(names, ref.name)
				expected := superTestPoint(test.source, ref.name)
				if ref.pos != expected {
					t.Fatalf("%s position = %+v, want %+v", ref.name, ref.pos, expected)
				}
			}
			if !reflect.DeepEqual(names, test.expected) {
				t.Fatalf("parents = %v, want %v", names, test.expected)
			}
		})
	}
	source := "class Outer : First {\n class Inner : Second {\n  override fun answer() = 1\n }\n}"
	for _, owner := range []Position{superTestPoint(source, "Inner"), superTestPoint(source, "answer")} {
		refs := superHeaderTypes(source, owner)
		if len(refs) != 1 || refs[0].name != "Second" {
			t.Fatalf("nested owner %+v: %+v", owner, refs)
		}
	}
}

func TestSuperHierarchyPreservesOverloadsAndParents(t *testing.T) {
	root := t.TempDir()
	child := superTestFile(t, root, "Child.kt", "class Child : ParentA(), ParentB { override fun answer() = 1 }")
	parentA := superTestFile(t, root, "ParentA.kt", strings.Repeat("\n", 10)+"class ParentA {\n\n fun answer(value: Int) = 1\n fun answer(value: String) = 2\n class Nested { fun answer() = 3 }\n}\n")
	parentB := superTestFile(t, root, "ParentB.kt", "interface ParentB {\n\n fun answer(): Int\n}\n")
	first := superTestSymbol("ParentA", 5, 10, 6, 15,
		superTestSymbol("answer(Int)", 6, 12, 5, 12), superTestSymbol("answer(String)", 6, 13, 5, 13),
		superTestSymbol("Nested", 5, 14, 7, 14, superTestSymbol("answer", 6, 14, 20, 14)))
	first.Children[0].Detail, first.Children[1].Detail = "(value: Int): Int", "(value: String): Int"
	wrong := superTestSymbol("Wrong", 5, 0, 6, 4, superTestSymbol("answer", 6, 1, 5, 1))
	second := superTestSymbol("ParentB", 11, 0, 10, 3, superTestSymbol("answer", 6, 2, 5, 2))
	owner := Position{Line: 0, Col: 6}
	cb := superTestCallbacks(t, child, func(_ context.Context, method string, params any) (json.RawMessage, error) {
		switch method {
		case "textDocument/prepareTypeHierarchy":
			if !reflect.DeepEqual(params, superParams(toURI(child), owner)) {
				t.Fatalf("prepare params: %#v", params)
			}
			return superTestJSON(t, []any{map[string]any{"name": "Child", "data": map[string]string{"token": "opaque"}}}), nil
		case "typeHierarchy/supertypes":
			item := params.(map[string]any)["item"].(json.RawMessage)
			if !strings.Contains(string(item), "opaque") {
				t.Fatal("hierarchy item data was lost")
			}
			return superTestJSON(t, []any{superTestLocation(parentA, 10, 6), superTestLocation(parentB, 0, 10), superTestLocation(parentA, 10, 6)}), nil
		case "textDocument/documentSymbol":
			uri := params.(map[string]any)["textDocument"].(map[string]string)["uri"]
			if uri == toURI(parentA) {
				return superTestJSON(t, []superSymbol{wrong, first}), nil
			}
			if uri == toURI(parentB) {
				return superTestJSON(t, []superSymbol{second}), nil
			}
			t.Fatalf("wrong parent symbols URI %q", uri)
		default:
			t.Fatalf("unexpected LSP method %s", method)
		}
		return nil, nil
	})
	result, err := superNavigation(context.Background(), Request{Path: child, Kind: "super", Name: "answer", Line: 20, Col: 3, Owner: &owner}, cb)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 3 {
		t.Fatalf("expected three explicit candidates, got %+v", result)
	}
	if result[0].Path != parentA || result[0].Line != 12 || result[1].Line != 13 || result[2].Path != parentB {
		t.Fatalf("wrong overloads/parents: %+v", result)
	}
	if result[0].Detail == result[1].Detail {
		t.Fatal("overload signatures were collapsed")
	}
	previews := withPreviews(result)
	if !strings.Contains(previews[0].Text, "value: Int") || !strings.Contains(previews[1].Text, "value: String") {
		t.Fatalf("real previews missing: %+v", previews)
	}
}

func TestSuperHeaderFallbackResolvesEveryParentAndUTF16(t *testing.T) {
	for _, unsupported := range []string{"prepare", "supertypes", "empty"} {
		t.Run(unsupported, func(t *testing.T) {
			root := t.TempDir()
			source := "/* 😀 */ class Child : pkg.First(), Second {}"
			child := superTestFile(t, root, "Child.kt", source)
			first := superTestFile(t, root, "First.kt", "open class First {\n open fun answer() = 1\n}")
			second := superTestFile(t, root, "Second.kt", "interface Second {\n fun answer(): Int\n}")
			owner := superTestPoint(source, "Child")
			positions := []superWirePosition{}
			cb := superTestCallbacks(t, child, func(_ context.Context, method string, params any) (json.RawMessage, error) {
				switch method {
				case "textDocument/prepareTypeHierarchy":
					if unsupported == "prepare" {
						return nil, &RPCError{Code: -32601, Message: "not supported"}
					}
					if unsupported == "empty" {
						return json.RawMessage("null"), nil
					}
					return superTestJSON(t, []any{map[string]any{"name": "Child"}}), nil
				case "typeHierarchy/supertypes":
					return nil, &RPCError{Code: -32601, Message: "not supported"}
				case "textDocument/definition":
					p := params.(map[string]any)["position"].(superWirePosition)
					positions = append(positions, p)
					target := first
					if len(positions) == 2 {
						target = second
					}
					return superTestJSON(t, map[string]any{"targetUri": toURI(target), "targetSelectionRange": superTestRange(0, 11, 0, 16)}), nil
				case "textDocument/documentSymbol":
					return nil, &RPCError{Code: -32601, Message: "not supported"}
				default:
					t.Fatalf("unexpected method %s", method)
				}
				return nil, nil
			})
			result, err := superNavigation(context.Background(), Request{Path: child, Kind: "super", Name: "answer", Owner: &owner}, cb)
			if err != nil {
				t.Fatal(err)
			}
			if len(result) != 2 || result[0].Path != first || result[1].Path != second {
				t.Fatalf("wrong fallback candidates: %+v", result)
			}
			expected := []superWirePosition{}
			for _, word := range []string{"First", "Second"} {
				p := superTestPoint(source, word)
				expected = append(expected, superWirePosition{Line: p.Line, Character: p.Col})
			}
			if !reflect.DeepEqual(positions, expected) {
				t.Fatalf("UTF-16 positions %+v, want %+v", positions, expected)
			}
		})
	}
}

func TestSuperSourceFallbackIsScopedAndKeepsOverloads(t *testing.T) {
	source := "class Wrong { void answer() {} }\nclass Parent {\n String text = \"answer()\";\n int x = answer();\n Parent() {}\n void answer(int x) {}\n void answer(String x) {}\n class Nested { void answer() {} }\n}\n"
	result := superSourceMembers(source, Location{Path: "/resolved/Parent.java", Line: 1, Col: 6}, "answer")
	if len(result) != 2 || result[0].Line != 5 || result[1].Line != 6 {
		t.Fatalf("wrong scoped overloads: %+v", result)
	}
	constructor := "class answer { public answer() {} class Nested { void answer() {} } }"
	if result := superSourceMembers(constructor, Location{Path: "/resolved/answer.java", Line: 0, Col: 6}, "answer"); len(result) != 0 {
		t.Fatalf("constructor/class/nested declaration is not the requested member: %+v", result)
	}
	property := "open class Parent(val answer: Int) {\n val x = \"fun answer()\"\n}"
	result = superSourceMembers(property, Location{Path: "/resolved/Parent.kt", Line: 0, Col: 11}, "answer")
	if len(result) != 1 || result[0].Col != 22 {
		t.Fatalf("primary-constructor property: %+v", result)
	}
	local := "open class Parent(val seed: Int = run { val answer = 1; answer }) {}"
	if result := superSourceMembers(local, Location{Path: "/resolved/Parent.kt", Line: 0, Col: 11}, "answer"); len(result) != 0 {
		t.Fatalf("constructor-default local variable is not an inherited member: %+v", result)
	}
	extension := "class Parent {\n fun String.answer(value: Int) = 1\n fun previous() = helper.answer()\n val other = helper.<String>answer()\n}"
	result = superSourceMembers(extension, Location{Path: "/resolved/Parent.kt", Line: 0, Col: 6}, "answer")
	if len(result) != 1 || result[0].Line != 1 {
		t.Fatalf("member extension vs calls: %+v", result)
	}
	sameName := "class Parent { public Parent() {} public void Parent(int x) {} }"
	result = superSourceMembers(sameName, Location{Path: "/resolved/Parent.java", Line: 0, Col: 6}, "Parent")
	if len(result) != 1 || result[0].Col != strings.Index(sameName, "Parent(int") {
		t.Fatalf("named method vs constructor: %+v", result)
	}
}

func TestSuperScopedSymbolsNeverJumpToClassOrNestedMethod(t *testing.T) {
	root := t.TempDir()
	child := superTestFile(t, root, "Child.kt", "class Child : Parent() {}")
	parent := superTestFile(t, root, "Parent.kt", "class Parent { class Nested { fun answer() = 1 } }")
	parentSymbol := superTestSymbol("Parent", 5, 0, 6, 0, superTestSymbol("Parent", 9, 0, 6, 0), superTestSymbol("Nested", 5, 0, 21, 0, superTestSymbol("answer", 6, 0, 34, 0)))
	parentSymbol.Children[1].Range.Start.Character = 0 // Some providers give coarse whole-line ranges.
	cb := superTestCallbacks(t, child, func(_ context.Context, method string, _ any) (json.RawMessage, error) {
		switch method {
		case "textDocument/prepareTypeHierarchy":
			return superTestJSON(t, []any{map[string]any{"name": "Child"}}), nil
		case "typeHierarchy/supertypes":
			return superTestJSON(t, []any{superTestLocation(parent, 0, 6)}), nil
		case "textDocument/documentSymbol":
			return superTestJSON(t, []superSymbol{parentSymbol}), nil
		default:
			t.Fatalf("unexpected method %s", method)
		}
		return nil, nil
	})
	result, err := superNavigation(context.Background(), Request{Path: child, Name: "answer"}, cb)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 0 {
		t.Fatalf("must not choose unrelated nested answer: %+v", result)
	}
}

func TestSuperOperationalErrorsAreNotHiddenAsEmptyNavigation(t *testing.T) {
	root := t.TempDir()
	child := superTestFile(t, root, "Child.kt", "class Child : Parent() {}")
	parent := superTestFile(t, root, "Parent.kt", "class Parent {}")
	for _, failure := range []string{"textDocument/prepareTypeHierarchy", "typeHierarchy/supertypes", "textDocument/documentSymbol"} {
		t.Run(failure, func(t *testing.T) {
			problem := fmt.Errorf("server disconnected")
			cb := superTestCallbacks(t, child, func(_ context.Context, method string, _ any) (json.RawMessage, error) {
				if method == failure {
					return nil, problem
				}
				if method == "textDocument/prepareTypeHierarchy" {
					return superTestJSON(t, []any{map[string]any{"name": "Child"}}), nil
				}
				if method == "typeHierarchy/supertypes" {
					return superTestJSON(t, []any{superTestLocation(parent, 0, 6)}), nil
				}
				t.Fatalf("unexpected method %s", method)
				return nil, nil
			})
			_, err := superNavigation(context.Background(), Request{Path: child, Name: "answer"}, cb)
			if !errors.Is(err, problem) {
				t.Fatalf("lost real server error: %v", err)
			}
		})
	}
}

func TestSuperRetainsOriginalLibraryURI(t *testing.T) {
	root := t.TempDir()
	child := superTestFile(t, root, "Child.java", "class Child extends Parent {}")
	parent := superTestFile(t, root, "Parent.java", "class Parent { void answer() {} }")
	uri := "jdt://contents/library/Parent.class"
	cb := superTestCallbacks(t, child, func(_ context.Context, method string, params any) (json.RawMessage, error) {
		switch method {
		case "textDocument/prepareTypeHierarchy":
			return superTestJSON(t, []any{map[string]any{"name": "Child"}}), nil
		case "typeHierarchy/supertypes":
			return superTestJSON(t, []any{map[string]any{"uri": uri, "selectionRange": superTestRange(0, 6, 0, 12)}}), nil
		case "textDocument/documentSymbol":
			if params.(map[string]any)["textDocument"].(map[string]string)["uri"] != uri {
				t.Fatal("materialized path replaced the actual library URI")
			}
			return superTestJSON(t, []superSymbol{superTestSymbol("Parent", 5, 0, 6, 0, superTestSymbol("answer", 6, 0, 20, 0))}), nil
		default:
			t.Fatalf("unexpected method %s", method)
		}
		return nil, nil
	})
	cb.locations = func(context.Context, json.RawMessage) ([]Location, error) {
		return []Location{{Path: parent, Line: 0, Col: 6, External: true}}, nil
	}
	cb.open = func(context.Context, string) (string, error) {
		t.Fatal("library parent must use its original URI, not reopen a guessed URI")
		return "", nil
	}
	result, err := superNavigation(context.Background(), Request{Path: child, Name: "answer"}, cb)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 1 || !result[0].External || result[0].Path != parent {
		t.Fatalf("lost materialized real target: %+v", result)
	}
}
