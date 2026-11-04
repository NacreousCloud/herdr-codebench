# T10 native runtime sources and macOS SourceKit payload

Completed 2026-11-04. Scope: official Go/Rust/Swift acquisition metadata and a reproducible, tested macOS Swift runtime subset. No IDE installation, Apple SDK redistribution, package installer execution, binary thinning or re-signing.

## Catalogue and acquisition

`engine/native_sources.py` exports `native_sources(goos, goarch)` (also accepts `"linux-arm64"` or a tuple) and `native_plan()`. Every result is independent mutable data. Descriptors include exact version, URL, archive checksum or explicitly different checksum type, archive format/prefix, destination, required files, licensing, provenance and outstanding constraints. Importing or querying metadata has no network or installation side effects.

| Component | Pinned release | Official provenance | Result |
| --- | --- | --- | --- |
| Go SDK | 1.27.3 | [Go release metadata](https://go.dev/dl/?mode=json&include=all) | Six official archives SHA256-verified and cached |
| gopls | v0.24.0 | [Module metadata](https://proxy.golang.org/golang.org/x/tools/gopls/@v/v0.24.0.info), [checksum database](https://sum.golang.org/lookup/golang.org/x/tools/gopls@v0.24.0) | Pinned source-build descriptor; core agent owns builds |
| Rust compiler, Cargo, host std, rust-src, rust-analyzer | 1.99.1, 2026-10-15 | [Official component manifest](https://static.rust-lang.org/dist/channel-rust-1.99.1.toml) | All six platforms acquired; all 30 target/component prefixes and required paths validated |
| Swift / SourceKit-LSP | 6.4.2 | [Official release catalogue](https://www.swift.org/api/v1/install/releases.json) | macOS signed package extracted and runtime tested; other hosts need their documented acquisition/extraction work |

The gopls module checksum is `h1:nPO/LffYa4sP62Ueuema5PPnZPGaZjGl+vZGvbTek4g=` and revision is `1f9922d1dcc5836d5c5bcb552c8fed230f885372`. This is a Go module-tree checksum, **not** a ZIP SHA256. Its module requires Go 1.27.0 or later. Cross builds use an isolated GOPATH, GOOS/GOARCH, CGO_ENABLED=0 and GOTOOLCHAIN=local; do not set GOBIN for cross installation.

| Target | Go SDK compressed bytes | Swift official artifact | Swift compressed bytes | Local Swift validation |
| --- | ---: | --- | ---: | --- |
| darwin-amd64 | 71,697,771 | Universal macOS PKG | 1,591,283,484 | x86_64 slice confirmed; not executed |
| darwin-arm64 | 68,196,737 | Same universal PKG | Same artifact | Compiler, SwiftPM, execution and semantic LSP passed |
| linux-amd64 | 70,588,678 | Ubuntu 24.04 TAR.GZ | 1,124,819,616 | Native loader validation pending |
| linux-arm64 | 67,076,044 | Ubuntu 24.04 aarch64 TAR.GZ | 1,109,582,328 | Native loader validation pending |
| windows-amd64 | 79,010,309 | Windows 10 EXE/Burn installer | 2,098,337,696 | Native MSI extraction/loader validation pending |
| windows-arm64 | 75,113,075 | Windows 10 ARM64 EXE/Burn installer | 1,625,671,688 | Real official asset exists; native extraction pending |

All exact per-archive SHA256 values and URLs are in the catalogue rather than duplicated here. The 31 unique Go/Rust archives use the parent acquirer's `<sha256(url)[:12]>-<basename>` cache names. Every downloaded archive was SHA256 checked. Rust extraction merged the five official components without executing `install.sh`; evidence is `engine/.cache/native-acquisition.json` (30 target/component records). Parent now owns subsequent Go/Rust normalization. A failed early Go unpack is partial and must not be accepted merely because its directory exists. Permission-denied SDK defaults/source credential fixtures must stay omitted and recorded; extracted Go trees are not claimed to be verbatim full SDK copies.

## Runtime boundaries and licenses

Go/gopls need the Go compiler, tools and standard source because gopls invokes Go package commands. Cgo still needs the platform C toolchain. Rust-analyzer needs matched rustc, Cargo, host std, rust-src and the proc-macro helper for normal project analysis; build scripts and proc macros can require a platform linker/C SDK. This is why shipping only analyzer executables is insufficient. See [gopls](https://go.dev/gopls/), [rust-analyzer installation](https://rust-analyzer.github.io/book/installation.html) and [configuration](https://rust-analyzer.github.io/book/configuration.html).

Go/gopls use BSD-3-Clause; Rust uses MIT OR Apache-2.0 plus its component third-party notices; Swift uses Apache-2.0 with Swift runtime exception and bundled notices. Preserve shipped LICENSE/COPYRIGHT/NOTICE files and linked gopls dependency licenses. The catalogue links each upstream license. The normalized Rust trees retain component notices separately.

Swift's platform SDK remains external: Xcode/CLT SDK on macOS; compatible system libraries/headers on Linux; MSVC/Windows SDK and VC runtime on Windows. Ubuntu 24.04 assets are not a promise of arbitrary Linux compatibility. Official requirements: [macOS](https://www.swift.org/install/macos/), [Ubuntu](https://www.swift.org/install/linux/ubuntu/24_04/), [Windows](https://www.swift.org/install/windows/manual/). No Apple CLT/Xcode runtime artifacts were copied.

## Verified macOS Swift assembly

Official package URL:
`https://download.swift.org/swift-6.4.2-release/xcode/swift-6.4.2-RELEASE/swift-6.4.2-RELEASE-osx.pkg`

SHA256: `0a7d8489900d21dbf5f0187cb570e646a4c0226d0ddef2cbde8c7f54dfe79736`.

`pkgutil --check-signature` verified **Developer ID Installer: Swift Open Source (V9AUD2URP3)**, Apple distribution chain, trusted timestamp **2026-10-28 06:00:23 UTC**. Extraction used `pkgutil --expand-full`, never installer scripts. Both x86_64 and arm64 executable slices remain unchanged.

Final source tree: `engine/.cache/swift-runtime/runtimes/swift`. It has **1,172 regular files, 2,625,938,514 bytes**, plus internal relative symlinks. The immutable assembly receipt at `engine/.cache/swift-receipt.json` includes package provenance, signature output, architecture slices, the exact omission list, all retained file SHA256 values/link targets, and native test results. Retained files/links were compared to the expanded signed payload; only `Info.plist`, already removed by an unsuccessful cache cleanup, was compared against the original full payload copy instead. The receipt states this distinction.

Retained: sourcekit-lsp, Swift driver/frontend, SwiftPM and its manifest/plugin API, clang/clangd, compiler support dylibs, SourceKit/IndexStore frameworks/plugins, macOS/host Swift resources, formatting and shipped licenses. `SWIFT_MACOS_OMIT` lists exact omitted paths: LLDB/developer integration, standalone debugger/wasm/linker utilities, non-macOS and embedded platform resources, static Swift resources and unrelated documentation. The original signed package remains intact. A pruned bundle's original resource seal is **not** asserted valid; executable bytes are unchanged and individually hashed.

Release 6.4.2 searches `usr/lib/libsourcekitd.dylib` before its XPC `sourcekitd.framework`. The relocated XPC service failed under this environment with `Service is invalid`. The final subset adds only this relative loader alias:

```text
usr/lib/libsourcekitd.dylib -> sourcekitdInProc.framework/sourcekitdInProc
```

This selects the matching included in-process implementation without modifying a Mach-O. Evidence: [release Toolchain.swift](https://github.com/swiftlang/sourcekit-lsp/blob/swift-6.4.2-RELEASE/Sources/ToolchainRegistry/Toolchain.swift). `SOURCEKIT_TOOLCHAIN_PATH` must name **`<runtime>/runtimes/swift`**, not its `usr` directory. The parent must repack both macOS payloads after incorporating this alias.

Reproducible assembly / verified cache reuse:

```sh
python3 engine/native_sources.py --prepare-swift-macos
# Optional already-downloaded official package or fresh cache:
python3 engine/native_sources.py --prepare-swift-macos --package PATH --cache FRESH_CACHE
```

`prepare_swift_macos()` acquires through `acquire_runtime`, checks the pinned SHA and publisher signature, expands, copies the exact subset, adds the relative alias, and saves its inventory. It returns an existing subset only when its pinned provenance, inventory and alias match; changed/unreceipted destinations are refused. Extraction caches are left for explicit owner cleanup, because this environment rejects removal of some ordinary publisher directories. No active target is clobbered.

## Native checks and remaining limits

- `python3 -m unittest native_sources_test.py` in `engine`: **8 tests passed**. Covers all six records, checksums versus module h1, explicit Swift gaps, exact-path subset filtering, byte/link preservation, cache inventory changes and loader alias refusal rules.
- Bundled `swift --version`: **6.4.2**. Bundled SwiftPM manifest evaluation, compilation and execution: **passed**, printed `hello bundled Swift`.
- Actual bundled SourceKit-LSP initialize, definition (`Greeter` reference to source line 0 / UTF-16 column 7), hover (`func greet() -> String`) and clean shutdown: **passed, exit 0**, no stderr. Evidence: `engine/.cache/swift-native-smoke.json`, `engine/.cache/swift-lsp-smoke-final.json`.
- The fixture used the external Xcode SDK path without copying it. Nested SwiftPM sandbox creation is denied in this agent environment; the test used SwiftPM `--disable-sandbox` and documented `initializationOptions.swiftPM.disableSandbox=true`. This is a test-environment option, not a global product setting. [Release configuration documentation](https://github.com/swiftlang/sourcekit-lsp/blob/swift-6.4.2-RELEASE/Documentation/Configuration%20File.md) explicitly supports it for nested sandboxes.
- x86_64 macOS execution, Linux native loader/dependency checks, and Windows Burn/MSI extraction are not claimed complete. Windows hashes are pinned from [Microsoft's official WinGet manifest](https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/s/Swift/Toolchain/6.4.2/Swift.Toolchain.installer.yaml). Linux Swift requires detached PGP verification followed by a recorded full archive SHA; nonexistent `.sha256` URLs returned error bodies and were rejected as checksum evidence. The full six-platform catalogue therefore remains explicitly not ready for unattended complete Swift bundling.
- `vtool -show-build` reports SourceKit-LSP's minimum macOS **14.0** for both slices (frontend 13.0). Do not advertise the bundled Swift server on older macOS; this inspection is not a native test on every supported OS version.
