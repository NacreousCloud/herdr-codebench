# T10 Go embedded runtime core

Implemented `engine/bundle.go`, fixture tests and integration with engine startup/configuration.

- Release builds embed `runtimebundle/manifest.json` and the payload with Go embed. Source development keeps a thin manifest. Default server configuration is embedded, so `--config` is optional.
- Schema 1 validates the target, revision, compressed SHA256/size, declared unpacked size, file inventory, executable locations and file permissions. Payload files are streamed from gzip/tar with limits on entries, total bytes and individual files. Absolute/traversal paths, devices, duplicate names and escaping links are refused. Internal relative symlinks and regular-file hardlinks are supported.
- A private staging directory is validated before atomic publication to `runtimes/<revision>/<target>`. Concurrent publishers validate the winning directory. Every reused cache is checked against embedded file hashes and link metadata; mutable completion markers cannot authenticate modified files. Corrupt caches are quarantined and recreated. Failed staging/quarantine directories are removed, including read-only directories.
- Bundled executables resolve through `{runtime}` before PATH defaults. Canonical default configuration is replaced with bundle commands/options; intentionally changed fields and private `servers.json` overrides remain authoritative. Environment substitution supports `{runtime}`, `{cache}`, `{root}`, `{root_hash}`, `{npm_root}`, `{pathsep}` and `{PATH}`. `/info` reports `bundled` and the runtime revision.
- `--bundle-info` prints embedded metadata without extraction; `--prepare-runtime --state PATH` validates/prepares runtimes and prints root/target/revision/prepared JSON.

Validation:

- `cd engine && go test -race ./...` — PASS (8.301s).
- `cd engine && go vet ./...` — PASS.
- Tests include four concurrent child processes, sixteen concurrent goroutines, valid cache reuse, corrupted files/forged markers, checksum/size/target rejection, archive traversal/absolute/device entries, safe and broken symlinks/hardlinks, parent-symlink rejection without outside writes, external/missing/non-executable commands, unexpected cache files, staging cleanup, default/personal/private configuration precedence and PATH environment expansion.
- A real copy of the Go test executable was extracted and used as an LSP subprocess with PATH empty; server initialization and bundled environment selection passed.
- Thin binary CLI smoke returned schema-1 bundle metadata and `prepared:false` without claiming runtimes were bundled.

Official payload acquisition, complete platform runtime closures, licensing, actual fat-binary language-server validation and release builds are separate parent-task work. Runtime-created caches must live outside the verified payload directory; unexpected regular files inside the runtime root invalidate it.
