package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Installed describes executable discovery only. Running is true only after a
// real language-server initialize request has completed successfully.
type SetupLanguageStatus struct {
	Language  string `json:"lang"`
	Installed bool   `json:"installed"`
	Command   string `json:"command"`
	Root      string `json:"root"`
	Running   bool   `json:"running"`
	Error     string `json:"error"`
}

func (e *Engine) setupSelection(req Request, requireRoot bool) (string, ServerConfig, string, string, error) {
	lang := strings.ToLower(strings.TrimSpace(req.Lang))
	if lang == "" {
		return "", ServerConfig{}, "", "", errors.New("select a language")
	}
	entry, ok := e.config[lang]
	if !ok {
		return lang, ServerConfig{}, "", "", fmt.Errorf("unknown language %q", lang)
	}
	if req.Root == "" {
		if requireRoot {
			return lang, entry, "", "", errors.New("project root is required")
		}
		return lang, entry, "", "", nil
	}
	if !filepath.IsAbs(req.Root) {
		return lang, entry, "", "", errors.New("project root must be an absolute directory path")
	}
	root := filepath.Clean(req.Root)
	info, err := os.Stat(root)
	if err != nil {
		return lang, entry, "", "", fmt.Errorf("project root: %w", err)
	}
	if !info.IsDir() {
		return lang, entry, "", "", errors.New("project root is not a directory")
	}
	if len(entry.Extensions) == 0 {
		return lang, entry, "", "", errors.New("language configuration has no file extension")
	}
	ext := strings.TrimPrefix(entry.Extensions[0], ".")
	if ext == "" || strings.ContainsAny(ext, "/\\:\x00") {
		return lang, entry, "", "", errors.New("language configuration has an invalid file extension")
	}
	// Root detection uses the normal server rules. This path is never created
	// or opened, so setup can initialize a workspace without modifying it.
	fakePath := filepath.Join(root, "__herdr_lsp_setup__."+ext)
	if selected, _ := e.language(fakePath); selected != lang {
		return lang, entry, "", "", fmt.Errorf("language file extension selects %q instead of %q", selected, lang)
	}
	return lang, entry, findRoot(fakePath, entry), fakePath, nil
}

func (e *Engine) setupStatus(req Request) (SetupLanguageStatus, error) {
	lang, entry, root, _, err := e.setupSelection(req, false)
	status := SetupLanguageStatus{Language: lang, Root: root}
	if err != nil {
		status.Error = err.Error()
		return status, err
	}
	argv, commandErr := e.command(entry, root)
	if commandErr == nil {
		status.Installed = true
		status.Command = argv[0]
	} else {
		commands := []string{}
		for _, candidate := range entry.Commands {
			if len(candidate) > 0 {
				commands = append(commands, candidate[0])
			}
		}
		status.Command = strings.Join(commands, " or ")
		status.Error = commandErr.Error()
	}
	if root == "" {
		return status, nil
	}
	key := lang + "\x00" + root
	e.mu.Lock()
	server := e.servers[key]
	failed := e.failed[key]
	e.mu.Unlock()
	if server != nil {
		server.mu.Lock()
		status.Running = server.state == "ready"
		serverError := server.err
		server.mu.Unlock()
		if status.Error == "" {
			status.Error = serverError
		}
	} else if status.Error == "" {
		status.Error = failed
	}
	return status, nil
}

func (e *Engine) setupStart(ctx context.Context, req Request) (SetupLanguageStatus, error) {
	lang, _, root, path, err := e.setupSelection(req, true)
	status := SetupLanguageStatus{Language: lang, Root: root}
	if err != nil {
		status.Error = err.Error()
		return status, err
	}
	server, startErr := e.Server(ctx, path, true)
	status, statusErr := e.setupStatus(req)
	if startErr != nil {
		status.Running = false
		status.Error = startErr.Error()
		return status, startErr
	}
	if statusErr != nil {
		return status, statusErr
	}
	status.Root = server.Root
	server.mu.Lock()
	status.Running = server.state == "ready"
	serverError := server.err
	server.mu.Unlock()
	if !status.Running {
		if serverError == "" {
			serverError = "language server did not finish initializing"
		}
		status.Error = serverError
		return status, errors.New(serverError)
	}
	status.Error = ""
	return status, nil
}
