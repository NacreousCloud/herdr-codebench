# Herdr Codebench Go engine

Standalone, standard-library-only Go engine for the Herdr `idea` and `codebench`
layouts. It manages external language servers and source-based Spring navigation.
It does not execute a Spring application or embed IntelliJ code.

## Install a prebuilt engine

The repository includes `dist/{darwin,linux,windows}-{amd64,arm64}/herdr-engine`
(`.exe` on Windows). `dist/manifest.json` records the source digest, build Go
version and every binary's SHA-256/size.

```sh
python3 engine/install.py --verify-only
python3 engine/install.py
```

The installer verifies the host artifact and installs it under
`~/.config/herdr-app/data/codebench-engine`, outside the UI mod reload tree.
`--app-home PATH` or `HERDR_APP_HOME` selects another Herdr home. Existing engine
files are backed up. No Go compiler is required to use the prebuilt executable.
On Windows with a running old executable, stop only the owned engine helper
before installing an update if the OS refuses its replacement.

The repository's `install.sh` installs the engine and mods together. Herdr starts
the host executable lazily as the named `codenav-engine` helper; it verifies the
installed version and process identity. The old exact Python helper is retired
after Go is healthy. Workspace terminals are preserved.

## LSP support and prerequisites

`mods/codenav/bridge/servers.json` defines command candidates for Java (JDT LS),
Kotlin, TypeScript/JavaScript, Go, Swift, Rust and Python. These are actual external
LSP programs, installed separately with their SDK/toolchains. Cross-compiling this
engine does not bundle those servers or establish that every toolchain runs on
every OS. `/info` reports availability without starting a language server.

Click **LSP** in the status bar, use Find Action → **Language Server Setup**, or
open Settings → Tools → Language Servers. The guide asks for Java, Kotlin,
TypeScript, JavaScript, Go, Swift or Rust, shows the current OS's SDK/LSP install
steps with copyable commands and official documentation, checks executable
discovery, then starts the real server for the chosen project. Install commands
are guidance and are not executed automatically. JavaScript and TypeScript use
the same TypeScript language server.

The engine owns each stdio language-server process. Do not launch another stdio
server manually in a terminal; use **Start LSP** after installing its executable.
The readiness result requires a successful LSP initialize exchange. Discovering
an executable alone does not establish that the SDK, project or server works.

The engine supports hover, definition/type/implementation, references,
document/workspace symbols, diagnostics and super declarations. Positions and
token spans use zero-based UTF-16. Syntax colors use a lightweight lexical scanner;
semantic navigation always comes from LSP. Three server/root instances at most
are retained; idle servers stop after ten minutes and the idle engine after an
hour. Repeated failed startup requires explicit retry.

Per-language overrides can be placed in `~/.cache/herdr-codenav/servers.json`.
They merge fields with the repository configuration. `env` values apply only to
the language-server subprocess. The JVM running JDT may need a newer Java runtime
than the project's Java target: the installed JDT1.63 tested here requires Java25,
and passed using a host-local JDK27 override. Portable configuration contains no
machine-specific JDK paths. Kotlin's native watcher can be unavailable in a
sandboxed process even when the Herdr/core-launched server works.

## Spring features

Java/Kotlin source indexing provides:

- Bean declarations, stereotype names, `@Bean` aliases/factory types and reverse
  navigation to injection sites.
- Typed constructor/field injection candidates, qualifiers, by-name `@Resource`,
  `@Primary`, basic interface/supertype matching and explicit ambiguity.
- Constant Spring MVC endpoint method/path locations.
- `@Value` references to application properties/YAML key declarations. Values
  are omitted from the results.

Use Find Action → **Spring Beans**, **Spring Endpoints**, or **Spring Configuration
Keys**. Source gutters distinguish bean/injection/config navigation. Multiple
candidates remain a chooser. The index skips build/generated `bin` mirrors,
hidden/vendor directories, symlinks and secret file types, caps2,000 files/16MiB,
and caches bounded source results. Unsaved text can be supplied explicitly.

This is static source navigation: runtime profiles/conditions, composed
annotations, dynamic paths, exact generic arguments and full Boot metadata
completion are not resolved. Conditional candidates remain labeled. No endpoint
requests are sent and no project code is executed by the Spring index.

## Build and verify

```sh
cd engine
go test -race ./...
go vet ./...
cd ..
python3 engine/build.py
python3 engine/check_release.py
```

Builds use `CGO_ENABLED=0`, `-trimpath`, no VCS stamp, stripped symbols and an empty
build ID. The version includes the Go/config source digest. `--target OS-ARCH`
supports a focused rebuild; only matching-version artifacts are merged into the
manifest. All six binaries are cross-built and checksum-verified; execution
verification is performed on the host architecture only.

## Local request contract

Direct use:

```sh
./engine/dist/darwin-arm64/herdr-engine --port 47822 \
  --config ./mods/codenav/bridge/servers.json
```

Replace the executable path with the host build. The default private state file is
`~/.cache/herdr-codenav/engine.json` (0600); it contains PID/port/version and the
random token. Do not commit or log this state file. Requests are JSON POSTs to
`http://127.0.0.1:47822/METHOD` with `X-Codenav-Token` from that file. Responses
are `{ "ok": true, "result": ... }` or `{ "ok": false, "error": "..." }`.

Methods: `health`, `status`, `setup_status`, `setup_start`, `tokens`, `info`, `hover`, `definition`, `references`,
`symbols`, `diagnostics`, `workspace_symbols`, `related`, `spring_markers`,
`spring_project`. Source requests use `{path,line,col}`; `related` adds
`kind:"super"` and optional `{owner:{line,col},name}`, or Spring marker fields.
`spring_project` uses `{path,root,kind:"beans"|"endpoints"|"properties",query?}`.
Location records contain `path,line,col,end_line,end_col` and optional
`name,detail,text,external`.

The listener binds IPv4 loopback only, rejects browser Origin/non-loopback Host,
requires a token, bounds request/frame sizes and cleans up its owned state and
child servers on shutdown. The engine does not change project-file permissions
or global environment settings.

Setup requests use `{lang,root}`: `lang` is a configured engine language ID and
`root` is the absolute existing project folder (optional for `setup_status`).
The response is `{lang,installed,command,root,running,error}` inside the existing
envelope. `installed` means executable discovery; only `running` confirms actual
initialization. Status never starts a language server. Start does not create or
open a synthetic file; it applies the normal workspace-root rules and returns
the server's actual root. Explicit user overrides remain authoritative.
