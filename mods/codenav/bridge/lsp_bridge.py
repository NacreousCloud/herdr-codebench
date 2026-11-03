#!/usr/bin/env python3
"""Keeps language servers running and answers short HTTP requests from the codenav mod.

Herdr mods can't hold a process open (exec is one-shot), so this bridge owns every
language server (stdio LSP) and the mod asks it one question at a time:

    POST http://127.0.0.1:47821/<method>   {"path": "/abs/file.go", "line": 0, "col": 4}

Lines and columns are 0-based UTF-16 offsets, as in LSP and JavaScript strings.
Every request carries X-Codenav-Token: the token the bridge writes at start to
~/.cache/herdr-codenav/bridge.json (mode 0600) with its port and pid.
Methods: health, status, tokens, info, hover, definition, references, symbols,
diagnostics. Servers are chosen by servers.json next to this file, which also
caps the Java servers' heap ("env", "--jvm-arg"). A server unused for 10 minutes
stops, at most 3 run at once, and the bridge stops itself after an hour without
requests; the mod starts it again.
"""
import argparse
import fnmatch
import hashlib
import hmac
import json
import secrets
import os
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "herdr-codenav")
REQUEST_TIMEOUT = 20
SERVER_IDLE = 10 * 60   # a server unused this long stops (memory back; it starts again on use)
MAX_SERVERS = 3         # more than this running: the least recently used one stops
BRIDGE_IDLE = 60 * 60

LANGUAGE_IDS = {
    "go": "go", "rs": "rust", "swift": "swift", "py": "python", "pyi": "python",
    "java": "java", "kt": "kotlin", "kts": "kotlin",
    "ts": "typescript", "mts": "typescript", "cts": "typescript", "tsx": "typescriptreact",
    "js": "javascript", "mjs": "javascript", "cjs": "javascript", "jsx": "javascriptreact",
}

SYMBOL_KINDS = {
    1: "file", 2: "module", 3: "namespace", 4: "package", 5: "class", 6: "method", 7: "property",
    8: "field", 9: "constructor", 10: "enum", 11: "interface", 12: "function", 13: "variable",
    14: "constant", 15: "string", 16: "number", 17: "boolean", 18: "array", 19: "object",
    20: "key", 21: "null", 22: "enum member", 23: "struct", 24: "event", 25: "operator",
    26: "type parameter",
}

last_request = time.time()


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, file=sys.stderr, flush=True)


def to_uri(path):
    return "file://" + quote(os.path.abspath(path))


def from_uri(uri):
    return unquote(urlparse(uri).path) if uri.startswith("file://") else uri


def utf16_len(text):
    return len(text.encode("utf-16-le")) // 2


def load_config():
    with open(os.path.join(HERE, "servers.json"), encoding="utf-8") as f:
        config = json.load(f)
    local = os.path.join(CACHE, "servers.json")
    if os.path.exists(local):
        with open(local, encoding="utf-8") as f:
            for name, entry in json.load(f).items():
                config[name] = {**config.get(name, {}), **entry}
    return config


def widen_path():
    """herdr-core may start the bridge with a short PATH: add the login shell's,
    then the usual install folders of language servers."""
    home = os.path.expanduser("~")
    parts = os.environ.get("PATH", "").split(os.pathsep)
    shell = os.environ.get("SHELL") or "/bin/zsh"
    try:
        out = subprocess.run([shell, "-lic", "printf '\\n%s' \"$PATH\""], capture_output=True, text=True, timeout=10).stdout
        parts += out.strip().split("\n")[-1].split(os.pathsep)
    except Exception:
        pass
    parts += [os.path.join(home, p) for p in ("go/bin", ".cargo/bin", ".local/bin", ".bun/bin", ".sdkman/candidates/java/current/bin", ".sdkman/candidates/kotlin/current/bin")]
    parts += ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
    nvm = os.path.join(home, ".nvm/versions/node")
    if os.path.isdir(nvm):
        parts += [os.path.join(nvm, v, "bin") for v in sorted(os.listdir(nvm), reverse=True)]
    seen = []
    for p in parts:
        if p and p not in seen:
            seen.append(p)
    os.environ["PATH"] = os.pathsep.join(seen)
    java = os.path.join(home, ".sdkman/candidates/java/current")
    if "JAVA_HOME" not in os.environ and os.path.isdir(java):
        os.environ["JAVA_HOME"] = java
    # Java servers (jdtls, kotlin-lsp) stay out of the macOS Dock and app switcher.
    headless = "-Djava.awt.headless=true -Dapple.awt.UIElement=true"
    if headless not in os.environ.get("JAVA_TOOL_OPTIONS", ""):
        os.environ["JAVA_TOOL_OPTIONS"] = (os.environ.get("JAVA_TOOL_OPTIONS", "") + " " + headless).strip()


widen_path()
CONFIG = load_config()


def language_of(path):
    ext = path.rsplit(".", 1)[-1].lower() if "." in os.path.basename(path) else ""
    for name, entry in CONFIG.items():
        if ext in entry.get("extensions", []):
            return name
    return None


def resolve_command(entry):
    for argv in entry.get("commands", []):
        exe = shutil.which(argv[0])
        if exe:
            return [exe, *argv[1:]]
    return None


def git_top(start):
    d = start
    while True:
        if os.path.exists(os.path.join(d, ".git")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def has_marker(d, markers):
    try:
        names = os.listdir(d)
    except OSError:
        return False
    return any(fnmatch.filter(names, m) for m in markers)


def find_root(path, entry):
    """The folder a server should open: nearest (or topmost) folder with a marker,
    looking no higher than the repository (or the home folder)."""
    start = os.path.dirname(os.path.abspath(path))
    stop = git_top(start) or os.path.expanduser("~")
    found, d = [], start
    while True:
        if has_marker(d, entry.get("markers", [])):
            found.append(d)
        if d == stop or os.path.dirname(d) == d:
            break
        d = os.path.dirname(d)
    if not found:
        return git_top(start) or start
    return found[-1] if entry.get("root") == "topmost" else found[0]


_npm_root = None


def npm_root():
    global _npm_root
    if _npm_root is None:
        try:
            _npm_root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=15).stdout.strip()
        except Exception:
            _npm_root = ""
    return _npm_root


def expand(value, root):
    """Fills {cache}, {root}, {root_hash} and {npm_root} in servers.json values."""
    if isinstance(value, str):
        for key, fn in (("{cache}", lambda: CACHE), ("{root_hash}", lambda: hashlib.sha1(root.encode()).hexdigest()[:12]),
                        ("{root}", lambda: root), ("{npm_root}", npm_root)):
            if key in value:
                value = value.replace(key, fn())
        return value
    if isinstance(value, list):
        return [expand(v, root) for v in value]
    if isinstance(value, dict):
        return {k: expand(v, root) for k, v in value.items()}
    return value


class LspServer:
    def __init__(self, lang, root, argv, init=None, env=None):
        self.lang, self.root, self.argv, self.init = lang, root, argv, init or {}
        self.lock = threading.Lock()
        self.next_id = 0
        self.pending = {}
        self.docs = {}          # uri -> {"version", "mtime", "text"}
        self.diagnostics = {}   # uri -> [diagnostic]
        self.progress = {}      # token -> title
        self.state = "starting"
        self.error = None
        self.capabilities = {}
        self.used = time.time()
        os.makedirs(CACHE, exist_ok=True)
        self.stderr = open(os.path.join(CACHE, f"{lang}-{hashlib.sha1(root.encode()).hexdigest()[:10]}.log"), "ab")
        self.proc = subprocess.Popen(argv, cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.stderr,
                                     env={**os.environ, **(env or {})})
        threading.Thread(target=self.read_loop, daemon=True).start()
        threading.Thread(target=self.initialize, daemon=True).start()

    # -- wire ---------------------------------------------------------------
    def send(self, message):
        body = json.dumps(message).encode("utf-8")
        with self.lock:
            self.proc.stdin.write(b"Content-Length: %d\r\n\r\n" % len(body) + body)
            self.proc.stdin.flush()

    def read_loop(self):
        out = self.proc.stdout
        try:
            while True:
                length = None
                while True:
                    line = out.readline()
                    if not line:
                        raise EOFError
                    line = line.strip()
                    if not line:
                        break
                    if line.lower().startswith(b"content-length:"):
                        length = int(line.split(b":", 1)[1])
                if length is None:
                    continue
                self.dispatch(json.loads(out.read(length)))
        except Exception as e:  # the server exited or wrote garbage
            self.state = "stopped"
            self.error = self.error or f"{os.path.basename(self.argv[0])} exited ({e.__class__.__name__})"
            for waiter in list(self.pending.values()):
                waiter["error"] = self.error
                waiter["event"].set()

    def dispatch(self, msg):
        if "id" in msg and ("result" in msg or "error" in msg) and "method" not in msg:
            waiter = self.pending.pop(msg["id"], None)
            if waiter:
                waiter["result"] = msg.get("result")
                if "error" in msg:
                    waiter["error"] = msg["error"].get("message", "error")
                waiter["event"].set()
            return
        method = msg.get("method")
        params = msg.get("params") or {}
        if "id" in msg:  # a request from the server
            result = None
            if method == "workspace/configuration":
                result = [None for _ in params.get("items", [])]
            elif method == "workspace/workspaceFolders":
                result = [{"uri": to_uri(self.root), "name": os.path.basename(self.root)}]
            self.send({"jsonrpc": "2.0", "id": msg["id"], "result": result})
        elif method == "textDocument/publishDiagnostics":
            self.diagnostics[params["uri"]] = params.get("diagnostics", [])
        elif method == "$/progress":
            value = params.get("value") or {}
            if value.get("kind") == "begin":
                self.progress[str(params.get("token"))] = value.get("title") or "working"
            elif value.get("kind") == "end":
                self.progress.pop(str(params.get("token")), None)

    def request(self, method, params, timeout=REQUEST_TIMEOUT):
        if self.state == "stopped":
            raise RuntimeError(self.error or "server stopped")
        self.next_id += 1
        rid = self.next_id
        waiter = {"event": threading.Event(), "result": None, "error": None}
        self.pending[rid] = waiter
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        if not waiter["event"].wait(timeout):
            self.pending.pop(rid, None)
            self.send({"jsonrpc": "2.0", "method": "$/cancelRequest", "params": {"id": rid}})
            raise TimeoutError(f"{self.lang} server did not answer {method} in {timeout}s (still indexing?)")
        if waiter["error"]:
            raise RuntimeError(waiter["error"])
        return waiter["result"]

    def notify(self, method, params):
        self.send({"jsonrpc": "2.0", "method": method, "params": params})

    # -- lifecycle ------------------------------------------------------------
    def initialize(self):
        try:
            result = self.request("initialize", {
                "processId": os.getpid(),
                "rootUri": to_uri(self.root),
                "rootPath": self.root,
                "workspaceFolders": [{"uri": to_uri(self.root), "name": os.path.basename(self.root)}],
                "capabilities": {
                    "general": {"positionEncodings": ["utf-16"]},
                    "window": {"workDoneProgress": True},
                    "workspace": {"configuration": True, "workspaceFolders": True, "symbol": {}},
                    "textDocument": {
                        "synchronization": {"didSave": False, "dynamicRegistration": False},
                        "hover": {"contentFormat": ["markdown", "plaintext"]},
                        "definition": {"linkSupport": True},
                        "typeDefinition": {"linkSupport": True},
                        "implementation": {"linkSupport": True},
                        "references": {},
                        "documentSymbol": {"hierarchicalDocumentSymbolSupport": True},
                        "publishDiagnostics": {"relatedInformation": False},
                    },
                },
                "initializationOptions": self.init,
            }, timeout=120)
            self.capabilities = (result or {}).get("capabilities", {})
            self.notify("initialized", {})
            self.state = "ready"
            log("ready", self.lang, self.root)
        except Exception as e:
            self.state = "stopped"
            self.error = f"initialize failed: {e}"
            log(self.error)

    def wait_ready(self, timeout=60):
        end = time.time() + timeout
        while self.state == "starting" and time.time() < end:
            time.sleep(0.05)
        if self.state != "ready":
            raise RuntimeError(self.error or f"{self.lang} server is still starting")

    def open(self, path):
        """Makes sure the server has the file's current text from disk."""
        self.used = time.time()
        uri = to_uri(path)
        mtime = os.path.getmtime(path)
        doc = self.docs.get(uri)
        if doc and doc["mtime"] == mtime:
            return uri
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        if doc is None:
            self.docs[uri] = {"version": 1, "mtime": mtime}
            ext = path.rsplit(".", 1)[-1].lower()
            self.notify("textDocument/didOpen", {"textDocument": {
                "uri": uri, "languageId": LANGUAGE_IDS.get(ext, self.lang), "version": 1, "text": text}})
        else:
            doc["version"] += 1
            doc["mtime"] = mtime
            self.notify("textDocument/didChange", {
                "textDocument": {"uri": uri, "version": doc["version"]},
                "contentChanges": [{"text": text}]})
        return uri

    def stop(self):
        try:
            self.request("shutdown", None, timeout=3)
            self.notify("exit", None)
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(3)
        except Exception:
            self.proc.kill()
        self.state = "stopped"


servers = {}
servers_lock = threading.Lock()
failed = {}  # (lang, root) -> error: not started again until a request asks to retry


def is_library(path):
    return os.path.abspath(path).startswith(os.path.join(CACHE, "sources") + os.sep)


def server_for(path, retry=False):
    if is_library(path):
        raise LookupError("library source: read-only, no language server")
    lang = language_of(path)
    if not lang:
        raise LookupError("no language server for this file type")
    entry = CONFIG[lang]
    root = find_root(path, entry)
    key = (lang, root)
    with servers_lock:
        srv = servers.get(key)
        if srv and srv.state == "stopped":
            failed[key] = srv.error or "server stopped"
            servers.pop(key, None)
            srv = None
        if srv is None and key in failed and not retry:
            raise RuntimeError(f"{failed[key]} (not restarted; retry from the code view)")
        if srv is None:
            failed.pop(key, None)
            argv = resolve_command(entry)
            if not argv:
                names = " or ".join(c[0] for c in entry.get("commands", []))
                raise LookupError(f"{lang}: {names} is not installed")
            argv = expand(argv, root)
            # Room for it: the least recently used servers stop.
            live = sorted((s for s in servers.values() if s.state != "stopped"), key=lambda s: s.used)
            for old in live[:max(0, len(live) - MAX_SERVERS + 1)]:
                log("stop (limit)", old.lang, old.root)
                servers.pop((old.lang, old.root), None)
                threading.Thread(target=old.stop, daemon=True).start()
            log("start", lang, root, argv)
            srv = servers[key] = LspServer(lang, root, argv, expand(entry.get("init", {}), root), expand(entry.get("env", {}), root))
    try:
        srv.wait_ready()
    except Exception as e:
        failed[key] = str(e)
        raise
    return srv


# -- results -------------------------------------------------------------------
def markup(contents):
    if contents is None:
        return ""
    if isinstance(contents, str):
        return contents
    if isinstance(contents, list):
        return "\n\n".join(filter(None, (markup(c) for c in contents)))
    if "kind" in contents:
        return contents.get("value", "")
    if "language" in contents:
        return f"```{contents['language']}\n{contents.get('value', '')}\n```"
    return contents.get("value", "")


def materialize(uri, srv=None):
    """A path the code view can read: file URIs as they are; sources inside a jar
    (jar:///x.jar!/a/B.kt) and jdtls class files (jdt://...) copied into the cache."""
    if uri.startswith("file://"):
        return from_uri(uri)
    out_dir = os.path.join(CACHE, "sources", hashlib.sha1(uri.encode()).hexdigest()[:16])
    if uri.startswith("jar:"):
        jar, _, entry = unquote(uri[len("jar:"):].lstrip("/")).partition("!/")
        jar = "/" + jar.lstrip("/")
        target = os.path.realpath(os.path.join(out_dir, entry))
        # An entry naming a place outside the cache folder (absolute, "..") is refused.
        if os.path.isabs(entry) or not target.startswith(os.path.realpath(out_dir) + os.sep):
            raise ValueError(f"unsafe path in jar: {entry}")
        if not os.path.exists(target):
            import zipfile
            with zipfile.ZipFile(jar) as z:
                data = z.read(entry)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "wb") as f:
                f.write(data)
        return target
    if uri.startswith("jdt://") and srv:
        name = unquote(urlparse(uri).path).split("/")[-1].replace(".class", ".java") or "Class.java"
        target = os.path.join(out_dir, name)
        if not os.path.exists(target):
            text = srv.request("java/classFileContents", {"uri": uri}) or ""
            os.makedirs(out_dir, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                f.write(text)
        return target
    return from_uri(uri)


def locations(result, srv=None):
    if not result:
        return []
    if isinstance(result, dict):
        result = [result]
    out = []
    for loc in result:
        uri = loc.get("targetUri") or loc.get("uri")
        rng = loc.get("targetSelectionRange") or loc.get("range") or loc.get("targetRange")
        if not uri or not rng:
            continue
        try:
            path = materialize(uri, srv)
        except Exception as e:
            log("cannot open", uri, e)
            continue
        out.append({"path": path, "external": not uri.startswith("file://"), "line": rng["start"]["line"], "col": rng["start"]["character"],
                    "end_line": rng["end"]["line"], "end_col": rng["end"]["character"]})
    return out


def with_previews(locs):
    files = {}
    for loc in locs:
        lines = files.get(loc["path"])
        if lines is None:
            try:
                with open(loc["path"], encoding="utf-8", errors="replace") as f:
                    lines = f.read().split("\n")
            except OSError:
                lines = []
            files[loc["path"]] = lines
        loc["text"] = lines[loc["line"]].strip()[:240] if loc["line"] < len(lines) else ""
    return locs


def flatten_symbols(items, depth=0, out=None):
    out = [] if out is None else out
    for s in items or []:
        if "location" in s:  # SymbolInformation
            rng = s["location"]["range"]
            sel = rng
        else:
            rng = s["range"]
            sel = s.get("selectionRange", rng)
        out.append({"name": s.get("name", ""), "detail": s.get("detail") or s.get("containerName") or "",
                    "kind": SYMBOL_KINDS.get(s.get("kind"), "symbol"), "depth": depth,
                    "line": sel["start"]["line"], "col": sel["start"]["character"],
                    "start": rng["start"]["line"], "end": rng["end"]["line"]})
        flatten_symbols(s.get("children"), depth + 1, out)
    return out


def tokens(text, path):
    """Syntax colors per line: [[utf16_length, category], ...] with pygments, or None."""
    try:
        from pygments.lexers import get_lexer_for_filename
        from pygments.util import ClassNotFound
        from pygments import token as T
    except ImportError:
        return None
    try:
        lexer = get_lexer_for_filename(path, stripnl=False, ensurenl=False)
    except ClassNotFound:
        return None
    order = [
        (T.Comment, "comment"), (T.Keyword.Type, "type"), (T.Keyword.Constant, "constant"), (T.Keyword, "keyword"),
        (T.Name.Builtin, "builtin"), (T.Name.Function, "function"), (T.Name.Class, "type"),
        (T.Name.Decorator, "decorator"), (T.Name.Constant, "constant"), (T.Name.Namespace, "namespace"),
        (T.Name.Tag, "keyword"), (T.Name.Attribute, "property"), (T.String.Escape, "escape"),
        (T.String, "string"), (T.Number, "number"), (T.Operator.Word, "keyword"), (T.Operator, "operator"),
        (T.Punctuation, "punctuation"), (T.Generic.Inserted, "string"), (T.Generic.Deleted, "number"),
        (T.Generic.Heading, "keyword"),
    ]
    cache = {}

    def category(tt):
        if tt not in cache:
            cache[tt] = next((name for base, name in order if tt in base), "")
        return cache[tt]

    lines, current = [], []
    for tt, value in lexer.get_tokens(text):
        cat = category(tt)
        parts = value.split("\n")
        for i, part in enumerate(parts):
            if i > 0:
                lines.append(current)
                current = []
            if part:
                n = utf16_len(part)
                if current and current[-1][1] == cat:
                    current[-1][0] += n
                else:
                    current.append([n, cat])
    lines.append(current)
    return lines


# -- methods ---------------------------------------------------------------------
def position(req):
    return {"line": int(req["line"]), "character": int(req["col"])}


def m_health(req):
    return {"pid": os.getpid(), "started": STARTED}


def m_status(req):
    return [{"lang": s.lang, "root": s.root, "state": s.state, "error": s.error,
             "busy": list(s.progress.values()), "command": os.path.basename(s.argv[0])}
            for s in list(servers.values())]


def m_tokens(req):
    text = req.get("text")
    if text is None:
        with open(req["path"], encoding="utf-8", errors="replace") as f:
            text = f.read()
    return tokens(text, req["path"])


def m_info(req):
    """Which server a file would use, without starting it."""
    lang = language_of(req["path"])
    if not lang or is_library(req["path"]):
        return {"lang": None, "library": is_library(req["path"])}
    entry = CONFIG[lang]
    argv = resolve_command(entry)
    root = find_root(req["path"], entry)
    srv = servers.get((lang, root))
    return {"lang": lang, "root": root, "installed": bool(argv),
            "command": os.path.basename(argv[0]) if argv else " or ".join(c[0] for c in entry.get("commands", [])),
            "state": srv.state if srv else "not started", "busy": list(srv.progress.values()) if srv else []}


def m_hover(req):
    srv = server_for(req["path"], bool(req.get("retry")))
    uri = srv.open(req["path"])
    result = srv.request("textDocument/hover", {"textDocument": {"uri": uri}, "position": position(req)})
    return {"markdown": markup((result or {}).get("contents"))}


def m_definition(req):
    srv = server_for(req["path"], bool(req.get("retry")))
    uri = srv.open(req["path"])
    method = {"type": "textDocument/typeDefinition", "implementation": "textDocument/implementation"}.get(
        req.get("kind"), "textDocument/definition")
    return with_previews(locations(srv.request(method, {"textDocument": {"uri": uri}, "position": position(req)}), srv))


def m_references(req):
    srv = server_for(req["path"], bool(req.get("retry")))
    uri = srv.open(req["path"])
    result = srv.request("textDocument/references", {
        "textDocument": {"uri": uri}, "position": position(req), "context": {"includeDeclaration": True}}, timeout=60)
    return with_previews(locations(result, srv))[:500]


def m_symbols(req):
    srv = server_for(req["path"], bool(req.get("retry")))
    uri = srv.open(req["path"])
    return flatten_symbols(srv.request("textDocument/documentSymbol", {"textDocument": {"uri": uri}}))


def m_diagnostics(req):
    srv = server_for(req["path"], bool(req.get("retry")))
    uri = srv.open(req["path"])
    out = []
    for d in srv.diagnostics.get(uri, []):
        r = d["range"]
        out.append({"line": r["start"]["line"], "col": r["start"]["character"],
                    "end_line": r["end"]["line"], "end_col": r["end"]["character"],
                    "severity": d.get("severity", 1), "message": d.get("message", ""),
                    "source": d.get("source") or ""})
    return {"items": out, "busy": list(srv.progress.values())}

def m_workspace_symbols(req):
    """Symbols across the project of req["path"] whose names match req["query"] (Search Everywhere)."""
    srv = server_for(req["path"], bool(req.get("retry")))
    srv.open(req["path"])
    result = srv.request("workspace/symbol", {"query": req.get("query", "")}, timeout=20) or []
    out = []
    for s in result[:300]:
        loc = s.get("location") or {}
        uri, rng = loc.get("uri"), loc.get("range")
        if not uri:
            continue
        try:
            path = materialize(uri, srv)
        except Exception:
            continue
        start = (rng or {}).get("start", {"line": 0, "character": 0})
        out.append({"name": s.get("name", ""), "kind": SYMBOL_KINDS.get(s.get("kind"), "symbol"),
                    "container": s.get("containerName") or "", "path": path,
                    "line": start["line"], "col": start["character"]})
    return out


METHODS = {name[2:]: fn for name, fn in globals().items() if name.startswith("m_")}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        """Only the codenav mod: it sends the token from the bridge file. Browsers
        (an Origin header, or a Host that isn't this address) are refused."""
        host = self.headers.get("Host", "")
        if self.headers.get("Origin") or host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            return False
        return hmac.compare_digest(self.headers.get("X-Codenav-Token", ""), TOKEN)

    def handle_method(self, req):
        global last_request
        if not self.allowed():
            return self.reply(403, {"ok": False, "error": "forbidden"})
        last_request = time.time()
        fn = METHODS.get(self.path.strip("/").split("?")[0])
        if not fn:
            return self.reply(404, {"ok": False, "error": "unknown method"})
        try:
            self.reply(200, {"ok": True, "result": fn(req)})
        except Exception as e:
            self.reply(200, {"ok": False, "error": str(e) or e.__class__.__name__})

    def do_GET(self):
        self.handle_method({})

    def do_POST(self):
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self.reply(415, {"ok": False, "error": "application/json only"})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.reply(400, {"ok": False, "error": "bad json"})
        self.handle_method(req)


def reaper(httpd):
    while True:
        time.sleep(30)
        now = time.time()
        for key, srv in list(servers.items()):
            if srv.state == "stopped" or now - srv.used > SERVER_IDLE:
                log("stop", srv.lang, srv.root)
                servers.pop(key, None)
                threading.Thread(target=srv.stop, daemon=True).start()
        if now - last_request > BRIDGE_IDLE:
            log("idle, exiting")
            for srv in list(servers.values()):
                srv.stop()
            httpd.shutdown()
            return


STARTED = time.time()

STATE = os.path.join(CACHE, "bridge.json")
PORT = 47821
TOKEN = ""


def write_state():
    """The port, a fresh token and this process, readable by this user only."""
    os.makedirs(CACHE, exist_ok=True)
    fd = os.open(STATE + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"port": PORT, "token": TOKEN, "pid": os.getpid()}, f)
    os.replace(STATE + ".tmp", STATE)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=47821)
    args = ap.parse_args()
    PORT = args.port
    TOKEN = secrets.token_hex(24)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    write_state()
    httpd.daemon_threads = True
    threading.Thread(target=reaper, args=(httpd,), daemon=True).start()
    log("listening on", args.port)
    httpd.serve_forever()
