package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var version = "dev"

const engineName = "herdr-codebench-go"
const maxBody = 8 << 20

type engineState struct {
	PID     int    `json:"pid"`
	Port    int    `json:"port"`
	Token   string `json:"token"`
	Engine  string `json:"engine"`
	Version string `json:"version"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "herdr-engine:", err)
		os.Exit(1)
	}
}
func run() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	port := flag.Int("port", 47822, "localhost HTTP port (0 chooses an available port)")
	statePath := flag.String("state", filepath.Join(home, ".cache", "herdr-codenav", "engine.json"), "private engine state file")
	configPath := flag.String("config", "", "language server configuration JSON (required)")
	showVersion := flag.Bool("version", false, "print engine version")
	flag.Parse()
	if *showVersion {
		fmt.Printf("%s %s %s/%s\n", engineName, version, runtime.GOOS, runtime.GOARCH)
		return nil
	}
	if *port < 0 || *port > 65535 {
		return errors.New("port must be between 0 and 65535")
	}
	if *configPath == "" {
		return errors.New("--config is required")
	}
	e, err := NewEngine(*configPath, filepath.Dir(*statePath))
	if err != nil {
		return err
	}
	defer e.Close()
	listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(*port)))
	if err != nil {
		return err
	}
	defer listener.Close()
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		return err
	}
	token := hex.EncodeToString(secret)
	state := engineState{os.Getpid(), listener.Addr().(*net.TCPAddr).Port, token, engineName, version}
	if err = writeState(*statePath, state); err != nil {
		return err
	}
	defer removeOwnedState(*statePath, token)
	server := &http.Server{Handler: e.Handler(token), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 130 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if e.reap(now) {
					cancel()
					return
				}
			}
		}
	}()
	go func() {
		<-ctx.Done()
		timeout, done := context.WithTimeout(context.Background(), 3*time.Second)
		defer done()
		_ = server.Shutdown(timeout)
	}()
	err = server.Serve(listener)
	cancel()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
func writeState(path string, state engineState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	b, err := json.Marshal(state)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".engine-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err != nil {
		f.Close()
		return err
	}
	if _, err = f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}
func removeOwnedState(path, token string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var state engineState
	if json.Unmarshal(b, &state) == nil && state.Token == token && state.PID == os.Getpid() {
		_ = os.Remove(path)
	}
}
func loopbackHost(host string) bool {
	name := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		name = h
	}
	name = strings.Trim(name, "[]")
	if strings.EqualFold(name, "localhost") {
		return true
	}
	ip := net.ParseIP(name)
	return ip != nil && ip.IsLoopback()
}
func envelope(w http.ResponseWriter, status int, result any, err error) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	var body any
	if err != nil {
		body = map[string]any{"ok": false, "error": err.Error()}
	} else {
		body = map[string]any{"ok": true, "result": result}
	}
	_ = json.NewEncoder(w).Encode(body)
}
func (e *Engine) Handler(token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.Header.Values("Origin")) > 0 || !loopbackHost(r.Host) {
			envelope(w, http.StatusForbidden, nil, errors.New("local requests only"))
			return
		}
		supplied := r.Header.Get("X-Codenav-Token")
		if token == "" || subtle.ConstantTimeCompare([]byte(supplied), []byte(token)) != 1 {
			envelope(w, http.StatusUnauthorized, nil, errors.New("invalid engine token"))
			return
		}
		if r.Method != "POST" {
			envelope(w, http.StatusMethodNotAllowed, nil, errors.New("POST required"))
			return
		}
		route := strings.Trim(r.URL.Path, "/")
		if !knownRoute(route) {
			envelope(w, http.StatusNotFound, nil, errors.New("unknown engine endpoint"))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		defer r.Body.Close()
		var req Request
		decoder := json.NewDecoder(r.Body)
		if err := decoder.Decode(&req); err != nil {
			status := http.StatusBadRequest
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				status = http.StatusRequestEntityTooLarge
			}
			envelope(w, status, nil, fmt.Errorf("invalid request: %w", err))
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			status := http.StatusBadRequest
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				status = http.StatusRequestEntityTooLarge
			}
			envelope(w, status, nil, errors.New("request must contain one JSON object"))
			return
		}
		if req.Line < 0 || req.Col < 0 {
			envelope(w, http.StatusBadRequest, nil, errors.New("line and col must be nonnegative"))
			return
		}
		e.mu.Lock()
		e.lastRequest = time.Now()
		e.mu.Unlock()
		ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
		defer cancel()
		result, err := e.dispatch(ctx, route, req)
		envelope(w, http.StatusOK, result, err)
	})
}
func knownRoute(route string) bool {
	switch route {
	case "health", "status", "setup_status", "setup_start", "tokens", "info", "hover", "definition", "references", "symbols", "diagnostics", "workspace_symbols", "related", "spring_markers", "spring_project":
		return true
	}
	return false
}
func (e *Engine) status() []any {
	e.mu.Lock()
	all := make([]*LSPServer, 0, len(e.servers))
	for _, s := range e.servers {
		all = append(all, s)
	}
	e.mu.Unlock()
	out := []any{}
	for _, s := range all {
		s.mu.Lock()
		out = append(out, map[string]any{"lang": s.lang, "root": s.Root, "state": s.state, "error": s.err, "busy": lspBusy(s.progress), "command": filepath.Base(s.argv[0])})
		s.mu.Unlock()
	}
	return out
}
func lspBusy(progress map[string]string) []string {
	out := []string{}
	for _, title := range progress {
		out = append(out, title)
	}
	return out
}
func (e *Engine) info(path string) any {
	lang, c := e.language(path)
	library := e.library(path)
	if lang == "" || library {
		return map[string]any{"lang": nil, "library": library}
	}
	root := findRoot(path, c)
	argv, err := e.command(c, root)
	command := ""
	if err == nil {
		command = filepath.Base(argv[0])
	} else {
		names := []string{}
		for _, a := range c.Commands {
			if len(a) > 0 {
				names = append(names, a[0])
			}
		}
		command = strings.Join(names, " or ")
	}
	state := "not started"
	busy := []string{}
	e.mu.Lock()
	s := e.servers[lang+"\x00"+root]
	e.mu.Unlock()
	if s != nil {
		s.mu.Lock()
		state = s.state
		busy = lspBusy(s.progress)
		s.mu.Unlock()
	}
	return map[string]any{"lang": lang, "root": root, "installed": err == nil, "command": command, "state": state, "busy": busy}
}
func (e *Engine) dispatch(ctx context.Context, route string, req Request) (any, error) {
	switch route {
	case "health":
		return map[string]any{"pid": os.Getpid(), "started": e.started.Unix(), "engine": engineName, "version": version}, nil
	case "status":
		return e.status(), nil
	case "setup_status":
		return e.setupStatus(req)
	case "setup_start":
		return e.setupStart(ctx, req)
	case "info":
		if req.Path == "" {
			return nil, errors.New("path is required")
		}
		return e.info(req.Path), nil
	case "tokens":
		text := req.Text
		if text == nil {
			b, err := os.ReadFile(req.Path)
			if err != nil {
				return nil, err
			}
			v := strings.ToValidUTF8(string(b), "�")
			text = &v
		}
		return syntaxTokens(*text, req.Path), nil
	case "related":
		return related(ctx, e, req)
	case "spring_markers":
		return springMarkers(req)
	case "spring_project":
		return springProject(req)
	}
	srv, err := e.Server(ctx, req.Path, req.Retry)
	if err != nil {
		return nil, err
	}
	uri, err := srv.Open(ctx, req.Path)
	if err != nil {
		return nil, err
	}
	params := map[string]any{"textDocument": map[string]any{"uri": uri}, "position": map[string]any{"line": req.Line, "character": req.Col}}
	switch route {
	case "hover":
		raw, err := srv.Call(ctx, "textDocument/hover", params)
		if err != nil {
			return nil, err
		}
		var result struct {
			Contents any `json:"contents"`
		}
		if string(raw) != "null" {
			if err = json.Unmarshal(raw, &result); err != nil {
				return nil, err
			}
		}
		return map[string]any{"markdown": lspMarkup(result.Contents)}, nil
	case "definition", "references":
		method := "textDocument/definition"
		if route == "references" {
			method = "textDocument/references"
			params["context"] = map[string]any{"includeDeclaration": true}
		} else {
			switch req.Kind {
			case "type", "typeDefinition":
				method = "textDocument/typeDefinition"
			case "implementation":
				method = "textDocument/implementation"
			}
		}
		raw, err := srv.Call(ctx, method, params)
		if err != nil {
			return nil, err
		}
		locs, err := e.Locations(ctx, raw, srv)
		if route == "references" && len(locs) > 500 {
			locs = locs[:500]
		}
		return withPreviews(locs), err
	case "symbols":
		raw, err := srv.Call(ctx, "textDocument/documentSymbol", map[string]any{"textDocument": map[string]any{"uri": uri}})
		if err != nil {
			return nil, err
		}
		var items []lspSymbol
		if err = json.Unmarshal(raw, &items); err != nil {
			return nil, err
		}
		out := []any{}
		flattenLSPSymbols(items, 0, &out)
		return out, nil
	case "diagnostics":
		srv.mu.Lock()
		items := append([]json.RawMessage{}, srv.diagnostics[uri]...)
		busy := lspBusy(srv.progress)
		srv.mu.Unlock()
		out := []any{}
		for _, raw := range items {
			var d struct {
				Range    lspRange `json:"range"`
				Severity int      `json:"severity"`
				Message  string   `json:"message"`
				Source   string   `json:"source"`
				Code     any      `json:"code"`
			}
			if json.Unmarshal(raw, &d) != nil {
				continue
			}
			if d.Severity == 0 {
				d.Severity = 1
			}
			code := ""
			if d.Code != nil {
				code = fmt.Sprint(d.Code)
			}
			out = append(out, map[string]any{"line": d.Range.Start.Line, "col": d.Range.Start.Character, "end_line": d.Range.End.Line, "end_col": d.Range.End.Character, "severity": d.Severity, "message": d.Message, "source": d.Source, "code": code})
		}
		return map[string]any{"items": out, "busy": busy}, nil
	case "workspace_symbols":
		raw, err := srv.Call(ctx, "workspace/symbol", map[string]any{"query": req.Query})
		if err != nil {
			return nil, err
		}
		var items []lspSymbol
		if err = json.Unmarshal(raw, &items); err != nil {
			return nil, err
		}
		out := []any{}
		if len(items) > 300 {
			items = items[:300]
		}
		for _, s := range items {
			if s.Location.URI == "" {
				continue
			}
			path, err := e.materialize(ctx, s.Location.URI, srv)
			if err != nil {
				return nil, err
			}
			out = append(out, map[string]any{"name": s.Name, "kind": lspKind(s.Kind), "container": s.Container, "path": path, "line": s.Location.Range.Start.Line, "col": s.Location.Range.Start.Character})
		}
		return out, nil
	}
	return nil, errors.New("unknown engine endpoint")
}

type lspPosition struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}
type lspRange struct {
	Start lspPosition `json:"start"`
	End   lspPosition `json:"end"`
}
type lspSymbol struct {
	Name      string    `json:"name"`
	Detail    string    `json:"detail"`
	Container string    `json:"containerName"`
	Kind      int       `json:"kind"`
	Range     lspRange  `json:"range"`
	Selection *lspRange `json:"selectionRange"`
	Location  struct {
		URI   string   `json:"uri"`
		Range lspRange `json:"range"`
	} `json:"location"`
	Children []lspSymbol `json:"children"`
}

func lspKind(kind int) string {
	names := []string{"symbol", "file", "module", "namespace", "package", "class", "method", "property", "field", "constructor", "enum", "interface", "function", "variable", "constant", "string", "number", "boolean", "array", "object", "key", "null", "enum member", "struct", "event", "operator", "type parameter"}
	if kind >= 1 && kind < len(names) {
		return names[kind]
	}
	return "symbol"
}
func flattenLSPSymbols(items []lspSymbol, depth int, out *[]any) {
	for _, s := range items {
		r := s.Range
		if s.Location.URI != "" {
			r = s.Location.Range
		}
		sel := r
		if s.Selection != nil {
			sel = *s.Selection
		}
		detail := s.Detail
		if detail == "" {
			detail = s.Container
		}
		*out = append(*out, map[string]any{"name": s.Name, "detail": detail, "kind": lspKind(s.Kind), "depth": depth, "line": sel.Start.Line, "col": sel.Start.Character, "start": r.Start.Line, "end": r.End.Line})
		flattenLSPSymbols(s.Children, depth+1, out)
	}
}
func lspMarkup(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case []any:
		out := []string{}
		for _, i := range x {
			if s := lspMarkup(i); s != "" {
				out = append(out, s)
			}
		}
		return strings.Join(out, "\n\n")
	case map[string]any:
		value, _ := x["value"].(string)
		if lang, ok := x["language"].(string); ok {
			return "```" + lang + "\n" + value + "\n```"
		}
		return value
	}
	return ""
}
