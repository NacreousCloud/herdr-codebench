# T09 Go LSP engine core

Implemented a standard-library-only Go executable in `engine/` (`go 1.23`, verified using Go 1.27.1). The engine owns real stdio LSP children; syntax coloring is lexical and does not invent language navigation results.

- HTTP binds IPv4 `127.0.0.1` (default 47822), requires a cryptographically generated token, rejects Origin headers and non-loopback Host headers, limits request bodies to 8 MiB, and preserves the existing JSON response envelope. State is written atomically at mode 0600 after listening. `--port`, `--state`, explicit `--config`, and link-time version stamping are supported.
- Existing server configuration and local field overrides select commands, roots, environment and initialization options. `{root}`, `{root_hash}`, `{cache}`, `{npm_root}` substitutions and usual language-server executable locations are supported. `/info` resolves configuration without starting a language server.
- The transport validates bounded Content-Length frames, multiplexes concurrent requests, handles cancellation, server-driven workspace/configuration requests, progress and diagnostics, and negotiates UTF-16 positions. Disk documents use didOpen and full/incremental didChange according to textDocumentSync; incremental updates replace the previous full UTF-16 range. Unsupported changes require explicit restart instead of retaining an uncertain document cache.
- Server instances are cached per language/root, with three entries maximum and least-recently-used eviction; ten-minute idle servers and the one-hour idle engine shut down. Failed processes require explicit retry. Shutdown requests precede exit/forced termination.
- File locations, LocationLinks, jar entries and JDT class-file contents become readable locations. Virtual sources are cached read-only; jar traversal and excessive entries are rejected. Definitions, references, hover, document/workspace symbols and diagnostics come from LSP. Spring and super navigation dispatch to the separately implemented modules.
- `/tokens` returns the established per-line UTF-16 `[length, category]` spans using a lightweight lexical scanner, including HTTP methods, headers, variables, JSON bodies and scripts. Unknown syntax returns JSON null; empty lists remain JSON arrays.

Verification:

1. `cd engine && go test -race ./...` — PASS, including all Spring/super tests present at the time of the final run.
2. `cd engine && go vet ./...` — PASS.
3. Core tests launch the test executable as a genuine fake-LSP subprocess. They cover frame bounds/partial streams, string-ID server requests, concurrent out-of-order responses, timeouts/cancellation, error codes, process restart/cache/eviction/idle behavior, document versions and UTF-16 incremental ranges, full/no-sync capabilities, progress/diagnostics, HTTP authentication/Origin/Host/body/route validation, null/array shapes, all configured language mappings/root modes/overrides, URI escaping, jar traversal, JDT caching, source/state permissions and ownership, and lexical span lengths.
4. Native CLI smoke: a separately built executable with `-X main.version=core-smoke` printed the embedded version, listened on an ephemeral localhost port, wrote private state, answered authenticated health, and exited cleanly on SIGTERM while removing its owned state — PASS.

The initial core verification uses a deterministic protocol fixture. Cross-platform builds and actual Herdr UI inspection are parent-task validation.

## Actual JVM server follow-up

The first actual JDT run failed before speaking LSP: its stdout contained `An error has occurred. See the log file`, and its process exited 13. Strict framing correctly rejected this non-protocol output. The installed JDT 1.63.0 Eclipse bundles require JavaSE 25; the inherited shell JAVA_HOME selected Corretto 21.0.9. The installed server's log identifies the unresolved JavaSE 25 requirement in `org.eclipse.core.filesystem` and `org.eclipse.core.resources`; this is a runtime mismatch, not a malformed Content-Length implementation.

Removed the engine's additional implicit SDKMAN JAVA_HOME fallback. An explicit inherited JAVA_HOME or per-server `env.JAVA_HOME` remains authoritative, and an unset value lets the installed launcher's own runtime selection work. New subprocess regression tests cover unset, explicit inherited and configured server runtimes. Full `go test -race ./...` passed again (4.994s); `go vet ./...` passed.

With only the owned smoke process's JAVA_HOME set to the verified Homebrew OpenJDK 27 runtime, actual JDT returned Parent/greet and Child/greet document symbols in 2.7 seconds. Actual Go to Super returned `Parent.java`, zero-based line 1, column 11, with preview `String greet();`, rather than the class declaration. The engine then shut down cleanly with exit 0 and removed its owned private state. Artifact: `/tmp/herdr-java-core-result.json`. The machine-specific runtime selection is not embedded in portable server configuration.

A separate direct Kotlin server launch reproduced initialization RPC -32803 at the canonical `/private/tmp` project root. Its bundled JBR is 25.0.4.1; its stack fails in native `FileWatcher.createWatcher` / `NativeIndexingFileSystemProvider.open`. This is an actual installed-server native watcher failure in that launch environment; no Go transport workaround was added and no successful Kotlin semantic result is claimed from this fixture. The parallel verification agent owns its detailed evidence and any supported server configuration follow-up.
