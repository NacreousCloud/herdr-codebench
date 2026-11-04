# T12 legacy Python LSP removal

Removed the unused alternate implementation and its dedicated test:

- `mods/codenav/bridge/lsp_bridge.py`
- `mods/codenav/bridge/navigation.py`
- `design/idea/check_navigation.py`

Updated only the obsolete bridge comments in `main.js` and `common.js`. Preserved their existing unrelated changes, `bridge/servers.json`, the shared Go client and all production Go sources/binaries.

## Runtime reference audit

Both layouts open the same codenav source/review views, which import `./lsp.js`. Status imports that client's passive polling API. The client launches the installed Go executable and passes only `bridge/servers.json` as configuration; it has no Python fallback. `install.sh`, the engine installer, release builder and release checker do not launch either removed module. The Python navigation file was imported only by the removed Python bridge, while the removed AST test loaded those two Python files directly.

The only remaining nonhistorical references to the old script path are intentional: `lsp.js` identifies an already-running old helper by its exact argv/path and isolated-Python flag before retiring it; `check_engine_client.mjs` verifies that ownership rule. Both remain unchanged. Archived T09 evidence still names its historical implementation.

The normal installer uses rsync without deleting destination-only files, so repository removal alone does not remove an old installed copy. Such copies have no launch path in the current client. This task did not modify the installed application, restart services or change the installer.

## Existing Go replacement evidence

- `TestURIsMaterializationAndState` covers escaped file URIs, LocationLinks, actual source previews, jar extraction/traversal rejection, read-only library sources and JDT class-file caching.
- `TestSuperHierarchyPreservesOverloadsAndParents` covers hierarchy selection, owner coordinates, deduplication, multiple parents/overloads and previews. `TestSuperHeaderFallbackResolvesEveryParentAndUTF16` covers empty/unsupported hierarchy methods and UTF-16 source fallback. Scoped-member and library-URI tests additionally prevent guessed or unrelated targets.
- Added one missing direct regression, `TestSuperWithoutResolvedParentStaysEmpty`: empty/null/unsupported hierarchy plus a declaration without parents must return JSON `[]` and issue no invented follow-up navigation requests.
- The current Go Spring implementation is a source index, rather than the removed optional-LSP-method fallback. Existing Spring tests cover explicit implementation/factory candidates, type/import checks, aliases/qualifiers, ambiguity and unmatched candidates. The old Python-only interface fallback was not reintroduced or treated as the current contract.

## Validation

- `cd engine && go test -race ./...` — PASS (5.556s).
- `cd engine && go vet ./...` — PASS.
- `node --experimental-vm-modules design/idea/check_engine_client.mjs` — PASS, including exact old-helper retirement, preservation of unrelated Python processes, no Python fallback, Go host selection and error handling.
- Scoped `git diff --check` — PASS.
- Current production Go source digest still matches `engine/dist/manifest.json`; the added `_test.go` regression does not change the release source digest.

No API/protocol/configuration/binary changes, installation, process restart, commit or push were performed by this task.
