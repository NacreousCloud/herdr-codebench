package main

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxFrame = 32 << 20

type Position struct {
	Line int `json:"line"`
	Col  int `json:"col"`
}
type Request struct {
	Path      string    `json:"path"`
	Kind      string    `json:"kind"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Qualifier string    `json:"qualifier"`
	Key       string    `json:"key"`
	Query     string    `json:"query"`
	Root      string    `json:"root"`
	Line      int       `json:"line"`
	Col       int       `json:"col"`
	Owner     *Position `json:"owner,omitempty"`
	Text      *string   `json:"text,omitempty"`
	Retry     bool      `json:"retry"`
}
type Location struct {
	Path     string `json:"path"`
	Line     int    `json:"line"`
	Col      int    `json:"col"`
	EndLine  int    `json:"end_line"`
	EndCol   int    `json:"end_col"`
	Text     string `json:"text,omitempty"`
	Name     string `json:"name,omitempty"`
	Detail   string `json:"detail,omitempty"`
	External bool   `json:"external,omitempty"`
}
type ServerConfig struct {
	Extensions []string          `json:"extensions"`
	Markers    []string          `json:"markers"`
	Root       string            `json:"root"`
	Commands   [][]string        `json:"commands"`
	Init       any               `json:"init"`
	Env        map[string]string `json:"env"`
}
type Engine struct {
	mu          sync.Mutex
	config      map[string]ServerConfig
	servers     map[string]*LSPServer
	failed      map[string]string
	cache       string
	started     time.Time
	lastRequest time.Time
	closed      bool
}

func NewEngine(configPath, cache string) (*Engine, error) {
	var err error
	cache, err = filepath.Abs(cache)
	if err != nil {
		return nil, err
	}
	configPath, err = filepath.Abs(configPath)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("read server configuration: %w", err)
	}
	cfg := map[string]ServerConfig{}
	if err = json.Unmarshal(b, &cfg); err != nil {
		return nil, fmt.Errorf("server configuration: %w", err)
	}
	// Local entries override fields, matching the previous bridge's configuration.
	override := filepath.Join(cache, "servers.json")
	if filepath.Clean(override) != filepath.Clean(configPath) {
		if b, err = os.ReadFile(override); err == nil {
			var base, patch map[string]map[string]json.RawMessage
			original, _ := os.ReadFile(configPath)
			_ = json.Unmarshal(original, &base)
			if err = json.Unmarshal(b, &patch); err != nil {
				return nil, fmt.Errorf("local server configuration: %w", err)
			}
			for k, v := range patch {
				if base[k] == nil {
					base[k] = map[string]json.RawMessage{}
				}
				for f, x := range v {
					base[k][f] = x
				}
			}
			merged, _ := json.Marshal(base)
			if err = json.Unmarshal(merged, &cfg); err != nil {
				return nil, err
			}
		} else if !os.IsNotExist(err) {
			return nil, err
		}
	}
	now := time.Now()
	return &Engine{config: cfg, servers: map[string]*LSPServer{}, failed: map[string]string{}, cache: cache, started: now, lastRequest: now}, nil
}
func (e *Engine) language(path string) (string, ServerConfig) {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	names := make([]string, 0, len(e.config))
	for k := range e.config {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, k := range names {
		c := e.config[k]
		for _, x := range c.Extensions {
			if ext == strings.ToLower(x) {
				return k, c
			}
		}
	}
	return "", ServerConfig{}
}
func isWithin(path, root string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
func (e *Engine) library(path string) bool {
	p, _ := filepath.Abs(path)
	return isWithin(p, filepath.Join(e.cache, "sources"))
}
func findRoot(path string, cfg ServerConfig) string {
	start, _ := filepath.Abs(filepath.Dir(path))
	git := ""
	home, _ := os.UserHomeDir()
	for d := start; ; d = filepath.Dir(d) {
		if _, err := os.Stat(filepath.Join(d, ".git")); err == nil {
			git = d
			break
		}
		if filepath.Dir(d) == d {
			break
		}
	}
	stop := git
	if stop == "" && isWithin(start, home) {
		stop = home
	}
	found := []string{}
	for d := start; ; d = filepath.Dir(d) {
		matched := false
		for _, m := range cfg.Markers {
			ms, _ := filepath.Glob(filepath.Join(d, m))
			if len(ms) > 0 {
				matched = true
				break
			}
		}
		if matched {
			found = append(found, d)
		}
		if d == stop || filepath.Dir(d) == d {
			break
		}
	}
	if len(found) > 0 {
		if cfg.Root == "topmost" {
			return found[len(found)-1]
		}
		return found[0]
	}
	if git != "" {
		return git
	}
	return start
}
func pathDirectories() []string {
	home, _ := os.UserHomeDir()
	out := filepath.SplitList(os.Getenv("PATH"))
	for _, p := range []string{"go/bin", ".cargo/bin", ".local/bin", ".bun/bin", ".sdkman/candidates/java/current/bin", ".sdkman/candidates/kotlin/current/bin"} {
		out = append(out, filepath.Join(home, filepath.FromSlash(p)))
	}
	if runtime.GOOS != "windows" {
		out = append(out, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin")
	}
	nodes, _ := filepath.Glob(filepath.Join(home, ".nvm", "versions", "node", "*", "bin"))
	sort.Sort(sort.Reverse(sort.StringSlice(nodes)))
	return append(out, nodes...)
}
func lookCommand(name string) (string, error) {
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	for _, dir := range pathDirectories() {
		p := filepath.Join(dir, name)
		candidates := []string{p}
		if runtime.GOOS == "windows" && filepath.Ext(p) == "" {
			candidates = append(candidates, p+".exe", p+".cmd", p+".bat")
		}
		for _, x := range candidates {
			if f, err := os.Stat(x); err == nil && !f.IsDir() && (runtime.GOOS == "windows" || f.Mode()&0111 != 0) {
				return x, nil
			}
		}
	}
	return "", exec.ErrNotFound
}
func (e *Engine) expand(value any, root string) any {
	switch v := value.(type) {
	case string:
		hash := sha1.Sum([]byte(root))
		v = strings.NewReplacer("{cache}", e.cache, "{root}", root, "{root_hash}", hex.EncodeToString(hash[:])[:12]).Replace(v)
		if strings.Contains(v, "{npm_root}") {
			npm := ""
			if exe, err := lookCommand("npm"); err == nil {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				out, _ := exec.CommandContext(ctx, exe, "root", "-g").Output()
				npm = strings.TrimSpace(string(out))
			}
			v = strings.ReplaceAll(v, "{npm_root}", npm)
		}
		return v
	case []any:
		out := make([]any, len(v))
		for i, x := range v {
			out[i] = e.expand(x, root)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for k, x := range v {
			out[k] = e.expand(x, root)
		}
		return out
	default:
		return v
	}
}
func (e *Engine) command(c ServerConfig, root string) ([]string, error) {
	names := []string{}
	for _, argv := range c.Commands {
		if len(argv) == 0 {
			continue
		}
		names = append(names, argv[0])
		name := e.expand(argv[0], root).(string)
		exe, err := lookCommand(name)
		if err != nil {
			continue
		}
		out := []string{exe}
		for _, a := range argv[1:] {
			out = append(out, e.expand(a, root).(string))
		}
		return out, nil
	}
	return nil, fmt.Errorf("language server not installed: %s", strings.Join(names, " or "))
}
func (e *Engine) Server(ctx context.Context, path string, retry bool) (*LSPServer, error) {
	if path == "" {
		return nil, errors.New("path is required")
	}
	if e.library(path) {
		return nil, errors.New("library source is read-only")
	}
	lang, cfg := e.language(path)
	if lang == "" {
		return nil, errors.New("no language server for this file type")
	}
	root := findRoot(path, cfg)
	key := lang + "\x00" + root
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return nil, errors.New("engine stopped")
	}
	s := e.servers[key]
	if s != nil && s.stopped() {
		e.failed[key] = s.errorText()
		delete(e.servers, key)
		s = nil
	}
	if s == nil {
		if err := e.failed[key]; err != "" && !retry {
			e.mu.Unlock()
			return nil, fmt.Errorf("%s (retry to restart)", err)
		}
		argv, err := e.command(cfg, root)
		if err != nil {
			e.mu.Unlock()
			return nil, err
		}
		if len(e.servers) >= 3 {
			var oldestKey string
			var oldest *LSPServer
			for k, x := range e.servers {
				if oldest == nil || x.usedAt().Before(oldest.usedAt()) {
					oldestKey = k
					oldest = x
				}
			}
			delete(e.servers, oldestKey)
			go oldest.Stop()
		}
		env := map[string]string{}
		for k, v := range cfg.Env {
			env[k] = e.expand(v, root).(string)
		}
		s, err = startLSP(lang, root, argv, e.expand(cfg.Init, root), env)
		if err != nil {
			e.failed[key] = err.Error()
			e.mu.Unlock()
			return nil, err
		}
		delete(e.failed, key)
		e.servers[key] = s
	}
	s.touch()
	e.mu.Unlock()
	select {
	case <-s.ready:
		if s.stopped() {
			return nil, errors.New(s.errorText())
		}
		return s, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-s.done:
		return nil, errors.New(s.errorText())
	}
}
func (e *Engine) Close() {
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return
	}
	e.closed = true
	all := []*LSPServer{}
	for _, s := range e.servers {
		all = append(all, s)
	}
	e.servers = map[string]*LSPServer{}
	e.mu.Unlock()
	var wg sync.WaitGroup
	for _, s := range all {
		wg.Add(1)
		go func(s *LSPServer) { defer wg.Done(); s.Stop() }(s)
	}
	wg.Wait()
}
func (e *Engine) reap(now time.Time) bool {
	e.mu.Lock()
	old := []*LSPServer{}
	for k, s := range e.servers {
		if now.Sub(s.usedAt()) > 10*time.Minute {
			delete(e.servers, k)
			old = append(old, s)
		}
	}
	idle := now.Sub(e.lastRequest) > time.Hour
	e.mu.Unlock()
	for _, s := range old {
		go s.Stop()
	}
	return idle
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *RPCError) Error() string { return fmt.Sprintf("LSP %d: %s", e.Code, e.Message) }

type rpcReply struct {
	result json.RawMessage
	err    error
}
type outbound struct {
	body []byte
	ack  chan error
}
type document struct {
	text    string
	version int
}
type LSPServer struct {
	Root         string
	lang         string
	argv         []string
	init         any
	proc         *exec.Cmd
	stdin        io.WriteCloser
	stdout       io.ReadCloser
	mu           sync.Mutex
	pending      map[int64]chan rpcReply
	next         int64
	docs         map[string]document
	diagnostics  map[string][]json.RawMessage
	progress     map[string]string
	capabilities map[string]json.RawMessage
	used         time.Time
	state        string
	err          string
	ready        chan struct{}
	done         chan struct{}
	outgoing     chan outbound
	stopOnce     sync.Once
	failOnce     sync.Once
	docMu        sync.Mutex
}

func startLSP(lang, root string, argv []string, init any, env map[string]string) (*LSPServer, error) {
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Dir = root
	vars := map[string]string{}
	for _, v := range os.Environ() {
		if k, x, ok := strings.Cut(v, "="); ok {
			vars[k] = x
		}
	}
	vars["PATH"] = strings.Join(pathDirectories(), string(os.PathListSeparator))
	// Respect an explicit JAVA_HOME, otherwise let the server's own launcher
	// choose its compatible runtime. A machine's SDKMAN default can be older
	// than the installed JDT/Kotlin server's runtime requirement.
	vars["JAVA_TOOL_OPTIONS"] = strings.TrimSpace(vars["JAVA_TOOL_OPTIONS"] + " -Djava.awt.headless=true -Dapple.awt.UIElement=true")
	for k, v := range env {
		vars[k] = v
	}
	for k, v := range vars {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	// Avoid logging source text or server credentials; stderr is deliberately discarded.
	cmd.Stderr = io.Discard
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		in.Close()
		return nil, err
	}
	if err = cmd.Start(); err != nil {
		in.Close()
		out.Close()
		return nil, err
	}
	s := &LSPServer{Root: root, lang: lang, argv: argv, init: init, proc: cmd, stdin: in, stdout: out, pending: map[int64]chan rpcReply{}, docs: map[string]document{}, diagnostics: map[string][]json.RawMessage{}, progress: map[string]string{}, capabilities: map[string]json.RawMessage{}, used: time.Now(), state: "starting", ready: make(chan struct{}), done: make(chan struct{}), outgoing: make(chan outbound, 64)}
	go s.writeLoop()
	go s.readLoop()
	go func() {
		err := cmd.Wait()
		if err != nil {
			s.fail(fmt.Errorf("%s exited: %w", lang, err))
		} else {
			s.fail(errors.New(lang + " server exited"))
		}
	}()
	go s.initialize()
	return s, nil
}
func (s *LSPServer) touch()            { s.mu.Lock(); s.used = time.Now(); s.mu.Unlock() }
func (s *LSPServer) usedAt() time.Time { s.mu.Lock(); defer s.mu.Unlock(); return s.used }
func (s *LSPServer) stopped() bool     { s.mu.Lock(); defer s.mu.Unlock(); return s.state == "stopped" }
func (s *LSPServer) errorText() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != "" {
		return s.err
	}
	return "language server stopped"
}
func (s *LSPServer) fail(err error) {
	s.failOnce.Do(func() {
		s.mu.Lock()
		s.state = "stopped"
		s.err = err.Error()
		s.mu.Unlock()
		close(s.done)
		s.stdin.Close()
		s.stdout.Close()
		_ = s.proc.Process.Kill()
	})
}
func readFrame(r *bufio.Reader) ([]byte, error) {
	length := -1
	headerBytes := 0
	for {
		bytes, err := r.ReadSlice('\n')
		if err != nil {
			if errors.Is(err, bufio.ErrBufferFull) {
				return nil, errors.New("LSP header too large")
			}
			return nil, err
		}
		line := string(bytes)
		headerBytes += len(line)
		if headerBytes > 8192 {
			return nil, errors.New("LSP header too large")
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		k, v, ok := strings.Cut(line, ":")
		if !ok {
			return nil, errors.New("invalid LSP header")
		}
		if strings.EqualFold(k, "Content-Length") {
			n, err := strconv.Atoi(strings.TrimSpace(v))
			if err != nil || n < 0 || n > maxFrame {
				return nil, errors.New("invalid LSP Content-Length")
			}
			if length >= 0 {
				return nil, errors.New("duplicate LSP Content-Length")
			}
			length = n
		}
	}
	if length < 0 {
		return nil, errors.New("missing LSP Content-Length")
	}
	body := make([]byte, length)
	_, err := io.ReadFull(r, body)
	return body, err
}
func (s *LSPServer) writeLoop() {
	for {
		select {
		case <-s.done:
			return
		case o := <-s.outgoing:
			_, err := fmt.Fprintf(s.stdin, "Content-Length: %d\r\n\r\n", len(o.body))
			if err == nil {
				_, err = s.stdin.Write(o.body)
			}
			o.ack <- err
			if err != nil {
				s.fail(fmt.Errorf("LSP write: %w", err))
				return
			}
		}
	}
}
func (s *LSPServer) send(ctx context.Context, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if len(body) > maxFrame {
		return errors.New("LSP message too large")
	}
	o := outbound{body: body, ack: make(chan error, 1)}
	select {
	case s.outgoing <- o:
	case <-s.done:
		return errors.New(s.errorText())
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-o.ack:
		return err
	case <-s.done:
		return errors.New(s.errorText())
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (s *LSPServer) Notify(ctx context.Context, method string, params any) error {
	return s.send(ctx, map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
}
func (s *LSPServer) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
	}
	s.touch()
	s.mu.Lock()
	s.next++
	id := s.next
	ch := make(chan rpcReply, 1)
	s.pending[id] = ch
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.pending, id); s.mu.Unlock() }()
	if err := s.send(ctx, map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}); err != nil {
		return nil, err
	}
	select {
	case reply := <-ch:
		return reply.result, reply.err
	case <-s.done:
		return nil, errors.New(s.errorText())
	case <-ctx.Done():
		go func() {
			c, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			_ = s.Notify(c, "$/cancelRequest", map[string]any{"id": id})
		}()
		return nil, ctx.Err()
	}
}
func (s *LSPServer) readLoop() {
	r := bufio.NewReader(s.stdout)
	for {
		b, err := readFrame(r)
		if err != nil {
			s.fail(fmt.Errorf("LSP transport: %w", err))
			return
		}
		var msg struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
			Result json.RawMessage `json:"result"`
			Error  *RPCError       `json:"error"`
		}
		if err = json.Unmarshal(b, &msg); err != nil {
			s.fail(fmt.Errorf("invalid LSP JSON: %w", err))
			return
		}
		if msg.Method == "" && len(msg.ID) > 0 {
			var id int64
			if json.Unmarshal(msg.ID, &id) == nil {
				s.mu.Lock()
				ch := s.pending[id]
				delete(s.pending, id)
				s.mu.Unlock()
				if ch != nil {
					var rpcErr error
					if msg.Error != nil {
						rpcErr = msg.Error
					}
					ch <- rpcReply{msg.Result, rpcErr}
				}
			}
			continue
		}
		if len(msg.ID) > 0 {
			go s.serverRequest(msg.ID, msg.Method, msg.Params)
			continue
		}
		var p struct {
			URI         string            `json:"uri"`
			Diagnostics []json.RawMessage `json:"diagnostics"`
			Token       json.RawMessage   `json:"token"`
			Value       struct {
				Kind  string `json:"kind"`
				Title string `json:"title"`
			} `json:"value"`
		}
		_ = json.Unmarshal(msg.Params, &p)
		s.mu.Lock()
		switch msg.Method {
		case "textDocument/publishDiagnostics":
			s.diagnostics[p.URI] = p.Diagnostics
		case "$/progress":
			if p.Value.Kind == "begin" {
				s.progress[string(p.Token)] = p.Value.Title
			} else if p.Value.Kind == "end" {
				delete(s.progress, string(p.Token))
			}
		}
		s.mu.Unlock()
	}
}
func (s *LSPServer) serverRequest(id json.RawMessage, method string, params json.RawMessage) {
	var result any
	var rpcErr *RPCError
	switch method {
	case "workspace/workspaceFolders":
		result = []any{map[string]any{"uri": toURI(s.Root), "name": filepath.Base(s.Root)}}
	case "workspace/configuration":
		var p struct {
			Items []struct {
				Section string `json:"section"`
			} `json:"items"`
		}
		_ = json.Unmarshal(params, &p)
		items := make([]any, len(p.Items))
		for i, item := range p.Items {
			v := s.init
			for _, part := range strings.Split(item.Section, ".") {
				if part == "" {
					continue
				}
				obj, ok := v.(map[string]any)
				if !ok {
					v = nil
					break
				}
				v = obj[part]
			}
			items[i] = v
		}
		result = items
	case "window/workDoneProgress/create", "client/registerCapability", "client/unregisterCapability", "window/showMessageRequest":
		result = nil
	case "workspace/applyEdit":
		result = map[string]any{"applied": false, "failureReason": "read-only navigation client"}
	default:
		rpcErr = &RPCError{-32601, "client method not supported"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	msg := map[string]any{"jsonrpc": "2.0", "id": id}
	if rpcErr != nil {
		msg["error"] = rpcErr
	} else {
		msg["result"] = result
	}
	_ = s.send(ctx, msg)
}
func (s *LSPServer) initialize() {
	defer close(s.ready)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	caps := map[string]any{"general": map[string]any{"positionEncodings": []string{"utf-16"}}, "window": map[string]any{"workDoneProgress": true}, "workspace": map[string]any{"configuration": true, "workspaceFolders": true, "symbol": map[string]any{}}, "textDocument": map[string]any{"synchronization": map[string]any{"dynamicRegistration": false, "didSave": false}, "hover": map[string]any{"contentFormat": []string{"markdown", "plaintext"}}, "definition": map[string]any{"linkSupport": true}, "typeDefinition": map[string]any{"linkSupport": true}, "implementation": map[string]any{"linkSupport": true}, "references": map[string]any{}, "documentSymbol": map[string]any{"hierarchicalDocumentSymbolSupport": true}, "publishDiagnostics": map[string]any{"relatedInformation": false}, "typeHierarchy": map[string]any{"dynamicRegistration": false}}}
	raw, err := s.Call(ctx, "initialize", map[string]any{"processId": os.Getpid(), "rootUri": toURI(s.Root), "rootPath": s.Root, "workspaceFolders": []any{map[string]any{"uri": toURI(s.Root), "name": filepath.Base(s.Root)}}, "capabilities": caps, "initializationOptions": s.init})
	if err != nil {
		s.fail(fmt.Errorf("initialize: %w", err))
		return
	}
	var result struct {
		Capabilities map[string]json.RawMessage `json:"capabilities"`
	}
	if err = json.Unmarshal(raw, &result); err != nil {
		s.fail(err)
		return
	}
	var encoding string
	_ = json.Unmarshal(result.Capabilities["positionEncoding"], &encoding)
	if encoding != "" && encoding != "utf-16" {
		s.fail(fmt.Errorf("unsupported LSP position encoding %s", encoding))
		return
	}
	s.mu.Lock()
	s.capabilities = result.Capabilities
	s.mu.Unlock()
	if err = s.Notify(ctx, "initialized", map[string]any{}); err != nil {
		s.fail(err)
		return
	}
	s.mu.Lock()
	if s.state != "stopped" {
		s.state = "ready"
	}
	s.mu.Unlock()
}
func utf16Len(text string) int {
	n := 0
	for _, r := range text {
		n++
		if r > 0xffff {
			n++
		}
	}
	return n
}
func endPosition(text string) map[string]int {
	lines := strings.Split(text, "\n")
	return map[string]int{"line": len(lines) - 1, "character": utf16Len(lines[len(lines)-1])}
}
func languageID(path, lang string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".tsx":
		return "typescriptreact"
	case ".jsx":
		return "javascriptreact"
	case ".js", ".mjs", ".cjs":
		return "javascript"
	}
	return lang
}
func (s *LSPServer) syncOptions() (bool, int) {
	s.mu.Lock()
	raw := append(json.RawMessage(nil), s.capabilities["textDocumentSync"]...)
	s.mu.Unlock()
	if len(raw) == 0 || string(raw) == "null" {
		return false, 0
	}
	var kind int
	if json.Unmarshal(raw, &kind) == nil {
		return kind != 0, kind
	}
	var options struct {
		OpenClose bool `json:"openClose"`
		Change    int  `json:"change"`
	}
	_ = json.Unmarshal(raw, &options)
	return options.OpenClose, options.Change
}
func (s *LSPServer) Open(ctx context.Context, path string) (string, error) {
	select {
	case <-s.ready:
	case <-ctx.Done():
		return "", ctx.Err()
	case <-s.done:
		return "", errors.New(s.errorText())
	}
	s.touch()
	s.docMu.Lock()
	defer s.docMu.Unlock()
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	text := strings.ToValidUTF8(string(b), "�")
	uri := toURI(path)
	doc, exists := s.docs[uri]
	if exists && doc.text == text {
		return uri, nil
	}
	version := doc.version + 1
	openClose, syncKind := s.syncOptions()
	if !exists {
		if openClose {
			err = s.Notify(ctx, "textDocument/didOpen", map[string]any{"textDocument": map[string]any{"uri": uri, "languageId": languageID(path, s.lang), "version": version, "text": text}})
		}
	} else {
		if syncKind == 0 {
			err := errors.New("language server does not support document changes; retry to restart")
			s.fail(err)
			return "", err
		}
		change := map[string]any{"text": text}
		if syncKind == 2 {
			change["range"] = map[string]any{"start": map[string]int{"line": 0, "character": 0}, "end": endPosition(doc.text)}
		}
		err = s.Notify(ctx, "textDocument/didChange", map[string]any{"textDocument": map[string]any{"uri": uri, "version": version}, "contentChanges": []any{change}})
	}
	if err == nil {
		s.docs[uri] = document{text, version}
	} else {
		// A cancelled write can have reached the child already. Discard the
		// process instead of keeping an uncertain document/version cache.
		s.fail(fmt.Errorf("document synchronization: %w", err))
	}
	return uri, err
}
func (s *LSPServer) Stop() {
	s.stopOnce.Do(func() {
		if !s.stopped() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_, _ = s.Call(ctx, "shutdown", nil)
			cancel()
			ctx, cancel = context.WithTimeout(context.Background(), time.Second)
			_ = s.Notify(ctx, "exit", nil)
			cancel()
			select {
			case <-s.done:
			case <-time.After(250 * time.Millisecond):
			}
		}
		s.fail(errors.New("language server stopped"))
	})
}
func toURI(path string) string {
	p, _ := filepath.Abs(path)
	p = filepath.ToSlash(p)
	if runtime.GOOS == "windows" {
		if strings.HasPrefix(p, "//") {
			parts := strings.SplitN(strings.TrimPrefix(p, "//"), "/", 2)
			u := url.URL{Scheme: "file", Host: parts[0]}
			if len(parts) > 1 {
				u.Path = "/" + parts[1]
			}
			return u.String()
		}
		p = "/" + p
	}
	return (&url.URL{Scheme: "file", Path: p}).String()
}
func fromURI(uri string) (string, error) {
	u, err := url.Parse(uri)
	if err != nil {
		return "", err
	}
	if u.Scheme != "file" {
		return "", fmt.Errorf("unsupported source URI scheme %q", u.Scheme)
	}
	p := u.Path
	if u.Host != "" && u.Host != "localhost" {
		if runtime.GOOS != "windows" {
			return "", errors.New("remote file URI not supported")
		}
		p = "//" + u.Host + p
	} else if runtime.GOOS == "windows" && len(p) > 2 && p[0] == '/' && p[2] == ':' {
		p = p[1:]
	}
	return filepath.FromSlash(p), nil
}
func (e *Engine) materialize(ctx context.Context, uri string, s *LSPServer) (string, error) {
	if strings.HasPrefix(uri, "file:") {
		return fromURI(uri)
	}
	h := sha1.Sum([]byte(uri))
	dir := filepath.Join(e.cache, "sources", hex.EncodeToString(h[:])[:16])
	name := ""
	var data []byte
	if strings.HasPrefix(uri, "jar:") {
		archive, entry, ok := strings.Cut(strings.TrimPrefix(uri, "jar:"), "!/")
		if !ok {
			return "", errors.New("invalid jar URI")
		}
		entry, err := url.PathUnescape(entry)
		if err != nil {
			return "", err
		}
		entry = filepath.FromSlash(entry)
		if filepath.IsAbs(entry) || strings.Contains(entry, "\\") || !isWithin(filepath.Join(dir, entry), dir) || entry == "." {
			return "", errors.New("unsafe jar entry")
		}
		name = entry
		path := ""
		if strings.HasPrefix(archive, "file:") {
			path, err = fromURI(archive)
		} else {
			path, err = url.PathUnescape(archive)
		}
		if err != nil {
			return "", err
		}
		if runtime.GOOS == "windows" {
			candidate := strings.TrimLeft(path, "/")
			if len(candidate) > 1 && candidate[1] == ':' {
				path = candidate
			}
		}
		z, err := zip.OpenReader(path)
		if err != nil {
			return "", err
		}
		defer z.Close()
		for _, f := range z.File {
			if f.Name == filepath.ToSlash(entry) {
				if f.UncompressedSize64 > maxFrame {
					return "", errors.New("source archive entry too large")
				}
				r, err := f.Open()
				if err != nil {
					return "", err
				}
				data, err = io.ReadAll(io.LimitReader(r, maxFrame+1))
				r.Close()
				if err != nil {
					return "", err
				}
				break
			}
		}
		if data == nil {
			return "", errors.New("source entry not found")
		}
	} else if strings.HasPrefix(uri, "jdt:") && s != nil {
		u, err := url.Parse(uri)
		if err != nil {
			return "", err
		}
		name = strings.TrimSuffix(filepath.Base(u.Path), ".class") + ".java"
		if name == ".java" || name == "..java" {
			name = "Class.java"
		}
		target := filepath.Join(dir, name)
		if _, err = os.Stat(target); err == nil {
			return target, nil
		}
		raw, err := s.Call(ctx, "java/classFileContents", map[string]any{"uri": uri})
		if err != nil {
			return "", err
		}
		var text string
		if err = json.Unmarshal(raw, &text); err != nil {
			return "", err
		}
		data = []byte(text)
	} else {
		return "", fmt.Errorf("unsupported source URI")
	}
	if len(data) > maxFrame {
		return "", errors.New("source too large")
	}
	target := filepath.Join(dir, name)
	if _, err := os.Stat(target); err == nil {
		return target, nil
	}
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(filepath.Dir(target), ".source-*")
	if err != nil {
		return "", err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if _, err = f.Write(data); err != nil {
		f.Close()
		return "", err
	}
	if err = f.Chmod(0444); err != nil {
		f.Close()
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	if err = os.Rename(tmp, target); err != nil {
		if _, statErr := os.Stat(target); statErr != nil {
			return "", err
		}
	}
	return target, nil
}
func (e *Engine) Locations(ctx context.Context, raw json.RawMessage, s *LSPServer) ([]Location, error) {
	out := []Location{}
	if len(raw) == 0 || string(raw) == "null" {
		return out, nil
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		var item map[string]json.RawMessage
		if err = json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		items = []json.RawMessage{raw}
	}
	type wirePosition struct {
		Line      int `json:"line"`
		Character int `json:"character"`
	}
	type wireRange struct {
		Start wirePosition `json:"start"`
		End   wirePosition `json:"end"`
	}
	for _, b := range items {
		var item struct {
			URI                  string     `json:"uri"`
			TargetURI            string     `json:"targetUri"`
			Range                *wireRange `json:"range"`
			TargetSelectionRange *wireRange `json:"targetSelectionRange"`
			TargetRange          *wireRange `json:"targetRange"`
		}
		if err := json.Unmarshal(b, &item); err != nil {
			return nil, err
		}
		uri := item.URI
		r := item.Range
		if item.TargetURI != "" {
			uri = item.TargetURI
		}
		if item.TargetSelectionRange != nil {
			r = item.TargetSelectionRange
		} else if r == nil {
			r = item.TargetRange
		}
		if uri == "" || r == nil {
			continue
		}
		path, err := e.materialize(ctx, uri, s)
		if err != nil {
			return nil, err
		}
		out = append(out, Location{Path: path, Line: r.Start.Line, Col: r.Start.Character, EndLine: r.End.Line, EndCol: r.End.Character, External: !strings.HasPrefix(uri, "file:")})
	}
	return out, nil
}
func withPreviews(locs []Location) []Location {
	files := map[string][]string{}
	for i := range locs {
		l := &locs[i]
		lines, ok := files[l.Path]
		if !ok {
			b, _ := os.ReadFile(l.Path)
			lines = strings.Split(string(b), "\n")
			files[l.Path] = lines
		}
		if l.Line >= 0 && l.Line < len(lines) {
			r := []rune(strings.TrimSpace(lines[l.Line]))
			if len(r) > 240 {
				r = r[:240]
			}
			l.Text = string(r)
		}
	}
	return locs
}
