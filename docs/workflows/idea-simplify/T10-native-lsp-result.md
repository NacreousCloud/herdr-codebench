# T10 staged native LSP verification

Ran real language servers from the verified `engine/.cache/trees/darwin-arm64` payload through the Go Engine APIs. The opt-in test is `engine/runtime_smoke_test.go`; ordinary source tests skip it unless `HERDR_STAGED_RUNTIME_SMOKE=1`.

The final run passed all four providers:

| Provider | Actual semantic evidence | Seconds |
| --- | --- | ---: |
| Kotlin fwcd + bundled Temurin JRE 21.0.13 | Initialized; `target`/`use` document symbols; definition resolved fixture `Sample.kt`, line 0, column 4 | 4.41 |
| JDT LS + bundled Microsoft JDK 25 | Initialized; `Sample`/`target(int)`/`use()` symbols; definition resolved fixture `Sample.java`, line 1, column 12 | 2.80 |
| gopls + bundled Go SDK | Initialized; `target`/`Use` symbols; definition resolved fixture `main.go`, line 1, column 5 | 0.28 |
| rust-analyzer + bundled Rust toolchain | Initialized; `target`/`main` symbols; definition resolved fixture `src/main.rs`, line 0, column 3 | 2.98 |

All positions are zero based. The test inherited an empty PATH. Java/Kotlin had an explicitly empty child PATH; Go/Rust used only the catalogue's bundled binary-directory PATH. Fixture projects, JDT configuration/workspace data, Go caches/GOPATH, Cargo/Rustup homes and XDG cache lived in a private temporary directory outside the payload. No user project, UI installation or personal configuration was changed. Every provider was required to return both a target symbol and the expected source definition.

The original Kotlin command using Microsoft JDK 25 failed before LSP initialization. Its bundled Kotlin compiler 2.1.0 threw `IllegalArgumentException: 25.0.5.0.2` in `com.intellij.util.lang.JavaVersion.parse`. The direct diagnostic is `.cache/t10-kotlin-jdk25-diagnostic.json`. A conventional existing JDK 21 proved the provider's semantic path worked; that was explicitly diagnostic rather than a bundled-runtime success. Its shutdown race logged PSI access after project disposal and needed owned-process termination; it did not indicate a SQLite runtime failure.

The final bundled Kotlin candidate came from the pinned official Temurin JRE 21.0.13 archive, SHA256 `225bab0a09491ef06835488cd942f5d2befa9a0410a2484f0c8bbcf7506ec09a`. Existing acquisition/unpack/merge helpers normalized it to the payload's `kotlin-java`; the catalogue then selected that absolute runtime for Kotlin. No Java-version property spoofing or system-PATH fallback was used.

Final command: `HERDR_STAGED_RUNTIME_SMOKE=1 go test -run '^TestRuntimeStagedSmoke$' -v -timeout 8m` — PASS (10.943s). Detailed semantic results are in `.cache/t10-native-lsp-smoke.json`.

This verifies the staged host payload and real providers through Engine. It does not replace complete embedded-fat-binary validation or claim native execution on the other five platform targets.
