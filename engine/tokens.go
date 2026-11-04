package main

import (
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Tokenization supplies colors only. Language meaning always comes from LSP.
type tokenSpan [2]any
type tokenLines [][]tokenSpan
type lexerState struct {
	quote  byte
	block  bool
	triple bool
}

var syntaxKeywords = wordSet("abstract actual alias and as assert async await be break by case catch chan class companion const constructor continue data debugger default defer del do dynamic elif else enum except expect export extends external fallthrough false final finally fn for from fun func function get global go goto if implements import in infix init inline instanceof interface internal is lateinit let match native new nil nonlocal null object of open operator or out override package pass private protected protocol public raise range readonly reified require return sealed select self set sizeof static struct super suspend switch synchronized tailrec then this throw throws trait transient true try type typealias typeof undefined union unless unsafe until use val var virtual void volatile when where while with yield")
var syntaxTypes = wordSet("any bool boolean byte char double error float float32 float64 int int8 int16 int32 int64 long never number short string uint uint8 uint16 uint32 uint64 uintptr unknown usize i8 i16 i32 i64 u8 u16 u32 u64 rune String Int Long Double Float Boolean Unit Any Nothing")
var syntaxBuiltins = wordSet("append cap close complex copy delete imag len make new panic print println real recover client request response crypto console JSON Math System")

func wordSet(words string) map[string]bool {
	out := map[string]bool{}
	for _, w := range strings.Fields(words) {
		out[w] = true
	}
	return out
}
func appendSpan(out *[]tokenSpan, text, category string) {
	n := utf16Len(text)
	if n == 0 {
		return
	}
	if len(*out) > 0 && (*out)[len(*out)-1][1] == category {
		(*out)[len(*out)-1][0] = (*out)[len(*out)-1][0].(int) + n
	} else {
		*out = append(*out, tokenSpan{n, category})
	}
}
func syntaxTokens(text, path string) any {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".http" || ext == ".rest" {
		return httpTokens(text)
	}
	if !strings.Contains("|.go|.rs|.swift|.py|.pyi|.java|.kt|.kts|.ts|.mts|.cts|.tsx|.js|.mjs|.cjs|.jsx|.json|.jsonc|.yaml|.yml|.toml|.properties|.sh|.bash|.zsh|.c|.h|.cpp|.hpp|.cs|.sql|.rb|.php|.css|.scss|.xml|.html|.htm|.gradle|", "|"+ext+"|") {
		return nil
	}
	out := tokenLines{}
	state := lexerState{}
	for _, line := range strings.Split(text, "\n") {
		out = append(out, lexLine(line, ext, &state))
	}
	return out
}
func identStart(r rune) bool { return unicode.IsLetter(r) || r == '_' || r == '$' }
func identPart(r rune) bool  { return identStart(r) || unicode.IsDigit(r) }
func lexLine(line, ext string, state *lexerState) []tokenSpan {
	out := []tokenSpan{}
	hashComment := ext == ".py" || ext == ".pyi" || ext == ".yaml" || ext == ".yml" || ext == ".toml" || ext == ".properties" || ext == ".sh" || ext == ".bash" || ext == ".zsh" || ext == ".rb"
	for i := 0; i < len(line); {
		start := i
		if state.block {
			if at := strings.Index(line[i:], "*/"); at >= 0 {
				i += at + 2
				state.block = false
			} else {
				i = len(line)
			}
			appendSpan(&out, line[start:i], "comment")
			continue
		}
		if state.quote != 0 {
			q := state.quote
			if state.triple {
				end := strings.Repeat(string(q), 3)
				if at := strings.Index(line[i:], end); at >= 0 {
					i += at + 3
					state.quote = 0
					state.triple = false
				} else {
					i = len(line)
				}
			} else {
				for i < len(line) {
					c := line[i]
					i++
					if c == '\\' && q != '`' && i < len(line) {
						_, n := utf8.DecodeRuneInString(line[i:])
						i += n
						continue
					}
					if c == q {
						state.quote = 0
						break
					}
				}
			}
			appendSpan(&out, line[start:i], "string")
			continue
		}
		rest := line[i:]
		if strings.HasPrefix(rest, "//") || (hashComment && line[i] == '#') || ((ext == ".sql") && strings.HasPrefix(rest, "--")) {
			appendSpan(&out, rest, "comment")
			break
		}
		if strings.HasPrefix(rest, "/*") {
			state.block = true
			i += 2
			if at := strings.Index(line[i:], "*/"); at >= 0 {
				i += at + 2
				state.block = false
			} else {
				i = len(line)
			}
			appendSpan(&out, line[start:i], "comment")
			continue
		}
		c := line[i]
		if c == '\'' || c == '"' || c == '`' {
			state.quote = c
			state.triple = (ext == ".py" || ext == ".pyi" || ext == ".kt" || ext == ".kts" || ext == ".java") && strings.HasPrefix(rest, strings.Repeat(string(c), 3))
			if state.triple {
				i += 3
			} else {
				i++
			}
			if state.triple {
				if at := strings.Index(line[i:], strings.Repeat(string(c), 3)); at >= 0 {
					i += at + 3
					state.quote = 0
					state.triple = false
				} else {
					i = len(line)
				}
			} else {
				for i < len(line) {
					x := line[i]
					i++
					if x == '\\' && c != '`' && i < len(line) {
						_, n := utf8.DecodeRuneInString(line[i:])
						i += n
						continue
					}
					if x == c {
						state.quote = 0
						break
					}
				}
			}
			category := "string"
			if ext == ".json" || ext == ".jsonc" {
				if strings.HasPrefix(strings.TrimSpace(line[i:]), ":") {
					category = "property"
				}
			}
			appendSpan(&out, line[start:i], category)
			continue
		}
		if c == '@' {
			i++
			for i < len(line) {
				r, n := utf8.DecodeRuneInString(line[i:])
				if !identPart(r) && r != '.' {
					break
				}
				i += n
			}
			appendSpan(&out, line[start:i], "decorator")
			continue
		}
		r, n := utf8.DecodeRuneInString(rest)
		if identStart(r) {
			i += n
			for i < len(line) {
				r, n = utf8.DecodeRuneInString(line[i:])
				if !identPart(r) {
					break
				}
				i += n
			}
			word := line[start:i]
			cat := ""
			if syntaxKeywords[word] {
				cat = "keyword"
			} else if syntaxTypes[word] {
				cat = "type"
			} else if syntaxBuiltins[word] {
				cat = "builtin"
			} else if strings.HasPrefix(strings.TrimSpace(line[i:]), "(") {
				cat = "function"
			}
			appendSpan(&out, word, cat)
			continue
		}
		if unicode.IsDigit(r) {
			i += n
			for i < len(line) {
				x := line[i]
				if !(x >= '0' && x <= '9' || x >= 'a' && x <= 'f' || x >= 'A' && x <= 'F' || x == 'x' || x == 'X' || x == 'o' || x == 'b' || x == '_' || x == '.') {
					break
				}
				i++
			}
			appendSpan(&out, line[start:i], "number")
			continue
		}
		i += n
		cat := ""
		if strings.ContainsRune("{}[](),;:.", r) {
			cat = "punctuation"
		} else if strings.ContainsRune("+-*/%=!<>|&^~?", r) {
			cat = "operator"
		}
		appendSpan(&out, line[start:i], cat)
	}
	// Ordinary quoted strings do not leak into the next line; raw/triple strings do.
	if state.quote != '`' && !state.triple {
		state.quote = 0
	}
	return out
}

var httpMethod = regexp.MustCompile(`^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|WEBSOCKET|GRPC|GRAPHQL)(\s+)(.*)$`)
var httpHeader = regexp.MustCompile(`^([A-Za-z0-9-]+)(\s*:)(.*)$`)
var httpVariable = regexp.MustCompile(`\{\{[^}]*\}\}|\sHTTP/[\d.]+`)

func httpPieces(line string) []tokenSpan {
	out := []tokenSpan{}
	at := 0
	for _, m := range httpVariable.FindAllStringIndex(line, -1) {
		appendSpan(&out, line[at:m[0]], "")
		cat := "constant"
		if !strings.HasPrefix(line[m[0]:m[1]], "{{") {
			cat = "keyword"
		}
		appendSpan(&out, line[m[0]:m[1]], cat)
		at = m[1]
	}
	appendSpan(&out, line[at:], "")
	return out
}
func httpTokens(text string) tokenLines {
	out := tokenLines{}
	state := "head"
	script := false
	jsState := lexerState{}
	for _, line := range strings.Split(text, "\n") {
		trim := strings.TrimSpace(line)
		spans := []tokenSpan{}
		switch {
		case script:
			if strings.Contains(line, "%}") {
				appendSpan(&spans, line, "punctuation")
				script = false
			} else {
				spans = lexLine(line, ".js", &jsState)
			}
		case strings.HasPrefix(trim, "###"):
			appendSpan(&spans, line, "decorator")
			state = "head"
		case strings.HasPrefix(trim, "#") || strings.HasPrefix(trim, "//"):
			appendSpan(&spans, line, "comment")
		case strings.HasPrefix(trim, "< {%") || strings.HasPrefix(trim, "> {%") || strings.HasPrefix(trim, "<{%") || strings.HasPrefix(trim, ">{%"):
			appendSpan(&spans, line, "punctuation")
			script = !strings.Contains(trim, "%}")
		case strings.HasPrefix(trim, "< ") || strings.HasPrefix(trim, ">> ") || strings.HasPrefix(trim, ">>! "):
			appendSpan(&spans, line, "string")
		default:
			if m := httpMethod.FindStringSubmatch(line); state == "head" && m != nil {
				appendSpan(&spans, m[1], "keyword")
				appendSpan(&spans, m[2], "")
				spans = append(spans, httpPieces(m[3])...)
				state = "headers"
			} else if state == "headers" && trim == "" {
				state = "body"
				appendSpan(&spans, line, "")
			} else if m := httpHeader.FindStringSubmatch(line); state == "headers" && m != nil {
				appendSpan(&spans, m[1], "property")
				appendSpan(&spans, m[2], "punctuation")
				spans = append(spans, httpPieces(m[3])...)
			} else if state == "body" {
				spans = lexLine(line, ".json", &lexerState{})
			} else {
				spans = httpPieces(line)
			}
		}
		out = append(out, spans)
	}
	return out
}
