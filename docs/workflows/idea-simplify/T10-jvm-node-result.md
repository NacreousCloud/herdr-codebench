# T10 JVM and Node runtime sources

Implemented `engine/runtime_sources.py` and seven offline contract tests in
`engine/runtime_sources_test.py`. `runtime_sources(target)` returns independent,
JSON-serializable archive descriptors; `runtime_commands(target)` returns only
`commands`, `init` and `env` overrides. Canonical extensions, workspace markers and
root selection remain owned by the existing server configuration.

## Selected sources

| Package | Pinned version | Distribution / license | Targets |
| --- | --- | --- | --- |
| Microsoft OpenJDK | 25.0.5.0.2 | Native full JDK; GPL-2.0 with Classpath exception | All six |
| Eclipse JDT LS | 1.63.0, build 202610191322 | Portable server; EPL-2.0 | Five; Windows ARM64 unavailable |
| Kotlin-only Java runtime | Temurin 21.0.13+9; Liberica 21.0.13+11 on Windows ARM64 | Native JRE; GPL-2.0 with Classpath exception | All six |
| fwcd Kotlin Language Server | 1.3.13 | Portable JVM server; MIT | Archive available for all six; semantic/runtime compatibility still requires verification |
| Node.js | 26.13.0 | Native runtime; MIT and bundled third-party notices | All six |
| typescript-language-server | 6.0.3 | npm prebuilt bundle; Apache-2.0 and MIT portions | Portable package |
| TypeScript | 6.0.3 | Classic JavaScript tsserver; Apache-2.0 | Portable package |

The six target names are `darwin-amd64`, `darwin-arm64`, `linux-amd64`,
`linux-arm64`, `windows-amd64`, and `windows-arm64`. Unknown names fail rather than
substituting the host architecture. Microsoft publishes a native JDK for each of
these OS/architecture pairs. The full JDK supplies the runtime and compiler tools;
this catalogue does not claim to contain a reduced JRE. Its versioned URLs and
SHA-256 pins came from the official download table and sidecars.
[Microsoft downloads](https://learn.microsoft.com/en-us/java/openjdk/download),
[pinned source/license](https://github.com/microsoft/openjdk-jdk25u/tree/release/jdk-25.0.5.0.2_1).

JDT's pinned product configuration includes native Linux/macOS ARM64 and x86_64,
and Windows x86_64. It does not include a Windows ARM64 configuration. That target
has an explicit unavailable JDT descriptor and no Java command override; it does
not silently run an x64 server. Its Java runtime remains available for Kotlin.
[Pinned JDT product matrix](https://github.com/eclipse-jdtls/eclipse.jdt.ls/blob/v1.63.0/org.eclipse.jdt.ls.product/pom.xml),
[JDT archive checksum](https://download.eclipse.org/jdtls/milestones/1.63.0/jdt-language-server-1.63.0-202610191322.tar.gz.sha256),
[JDT license](https://github.com/eclipse-jdtls/eclipse.jdt.ls/blob/v1.63.0/LICENSE).

Node artifacts are native for all six targets; Linux archives target glibc.
The TypeScript pair deliberately uses classic TypeScript 6.0.3, which contains
`lib/tsserver.js`, matching the language server's pinned development dependency.
TypeScript's newer native API distribution cannot be substituted without changing
the provider. The npm packages supply published SHA-512 integrity values; both are
checked during acquisition. No npm or npx invocation is needed at runtime.
[Node release checksums](https://nodejs.org/download/release/v26.13.0/SHASUMS256.txt),
[Node license and notices](https://github.com/nodejs/node/blob/v26.13.0/LICENSE),
[language-server package metadata](https://registry.npmjs.org/typescript-language-server/6.0.3),
[language-server license](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.3/LICENSE),
[TypeScript package metadata](https://registry.npmjs.org/typescript/6.0.3),
[TypeScript license](https://github.com/microsoft/TypeScript/blob/v6.0.3/LICENSE.txt).

## Kotlin provider decision and limits

Official JetBrains `kotlin-lsp` 263.7084.0 publishes standalone assets for all six
targets with bundled JBR. Its repository explicitly describes proprietary
Air/Fleet components. The repository's Apache license alone does not establish the
redistribution terms of every component in those standalone binaries. The
catalogue therefore records that provider as excluded pending a separate check of
the binary distribution terms; it does not assert that redistribution is
categorically prohibited. No IntelliJ proprietary code was copied.
[Official project status](https://github.com/Kotlin/kotlin-lsp#project-status),
[official standalone release](https://github.com/Kotlin/kotlin-lsp/releases/tag/kotlin-lsp/v263.7084.0).

The selected alternative is fwcd's MIT-licensed Kotlin Language Server 1.3.13.
This changes the provider from the official Kotlin server previously used on the
host. It is not IDEA-equivalent: its older compiler APIs and build integration can
regress modern Kotlin semantics. Its README documents Maven/Gradle classpath
discovery; a bundled JVM does not bundle arbitrary project dependencies or project
build tooling. This source catalogue and download verification do not establish
successful Kotlin analysis on all six target systems. Preserve the included
transitive compiler/JAR notices as well as the top-level MIT license.
[Pinned fwcd README](https://github.com/fwcd/kotlin-language-server/blob/1.3.13/README.md),
[pinned fwcd license](https://github.com/fwcd/kotlin-language-server/blob/1.3.13/LICENSE.txt),
[server main class/build](https://github.com/fwcd/kotlin-language-server/blob/1.3.13/server/build.gradle.kts).

The fwcd GitHub release metadata supplies no published asset digest. Its
`server.zip` was acquired over verified HTTPS and its initial SHA-256 was recorded
in `engine/runtime-lock.json`:
`4fe7d71d087b307c7869036171bd9d8c6a4284cd7c25b89098b0a24eb2d9b6d2`.
This is an acquisition pin, not an invented upstream checksum. The descriptor
keeps `requires_pin: true` so a missing lock cannot masquerade as verified input.

## Assembly and launch contract

Descriptors include exact archive roots and normalized destinations. Microsoft
macOS roots strip through `Contents/Home`; other JDKs strip the versioned root.
Node strips its target-specific versioned root, npm strips `package/`, fwcd strips
`server/`, and JDT uses the archive root. Bounded archive-header reads verified the
JDK and fwcd prefixes before bulk acquisition.

Java invokes `{runtime}/java/bin/java` and Kotlin invokes the separate
`{runtime}/kotlin-java/bin/java` (or `java.exe`) directly. JDT
uses the pinned Equinox launcher JAR, the native product configuration, and
per-workspace writable `{cache}` configuration/data directories. No Python JDT
launcher is needed. Kotlin invokes `org.javacs.kt.MainKt` with the JVM's library
classpath wildcard. TypeScript invokes the bundled Node executable and bundled
`cli.mjs`, with an explicit bundled tsserver path. Commands do not require shell
wrappers, host Java/Node, npm, or startup downloads.

The catalogue records license/source links and reminds assembly to retain
licenses, third-party notices and Java corresponding-source information. It does
not replace those distribution files with a short SPDX label. Parent-owned
assembly is responsible for carrying these files into the distributed tree.

Inspection of the downloaded JDK confirmed `legal/java.base/LICENSE`,
`ADDITIONAL_LICENSE_INFO`, `ASSEMBLY_EXCEPTION`, component-specific notices and
`lib/src.zip`. Preserve the entire `legal/` tree. The Classpath exception concerns
combining independent modules; GPLv2's executable-distribution source provisions
still apply to the JDK. `src.zip` contains Java library sources and should not be
presented as the complete JDK source/build tree. Microsoft's official source link
for this release resolved to immutable commit
`fff88c64340dd864d5886648b66670c1370fbc65`; the descriptor includes both that commit
and its [source archive](https://github.com/microsoft/openjdk-jdk25u/archive/fff88c64340dd864d5886648b66670c1370fbc65.tar.gz).
That archive was acquired into
`engine/dist/sources/openjdk25-fff88c64340d.tar.gz` (119,808,848 bytes), with initial
acquisition SHA-256
`6d7b2e70ef9a49715bd74e977a93d8c7d184d14e863ab17e4168e2e8c79cf778`.
Its adjacent `.tar.gz.json` receipt records the exact URL, commit and checksum
provenance. Parent integration owns LFS staging and publication of this source
alongside the binaries and preserved license files.
[Pinned JDK license](https://github.com/microsoft/openjdk-jdk25u/blob/fff88c64340dd864d5886648b66670c1370fbc65/LICENSE),
[additional licensing information](https://github.com/microsoft/openjdk-jdk25u/blob/fff88c64340dd864d5886648b66670c1370fbc65/ADDITIONAL_LICENSE_INFO).

## Verification

`python3 engine/runtime_sources_test.py`: **7 passed**. Tests cover exact target
matrix, unsupported-target failure, unique and safe destinations, checksum or
explicit initial-pin requirements, native archive mapping/prefixes, the Windows
ARM64 Java gap, portable launch paths/cache use, command-only overrides, and
independent returned data. All six pinned license URLs were fetched successfully
and read; the language-server license was corrected to include its MIT portions.

Acquisition uses normal TLS verification, no package scripts, and the shared cache
convention `engine/.cache/downloads/<sha256(url)[:12]>-<basename>`. Each completed
artifact is checked against its published SHA-256 or npm SHA-512 integrity and
its SHA-256 is retained in `runtime-lock.json`; fwcd uses the initial acquisition
pin described above. Full archive extraction, per-platform execution, engine
embedding and native UI checks belong to the parent integration evidence.

Acquisition completed for all **22 unique runtime artifacts**, including the six
JDKs, six Kotlin-only JREs, six Node archives and four shared language-server/compiler archives. Each
passed its expected checksum/integrity check. Full archive listing confirmed the
JDT launcher/configuration paths, Kotlin's `server/` root and bundled JAR layout,
and both npm entry points. Kotlin includes `licenseReport.html`; TypeScript
includes its third-party notices. No dependency install scripts were run.

At the parent's request, official Git LFS **3.8.1 darwin-arm64** was separately
downloaded into `engine/.cache/tools/`. Its release ZIP matched official SHA-256
`0ba10e897e0496412cd86eacaed4ed554c97ddc29bc5c709d28faa5eaaa2222c`.
The executable is `engine/.cache/tools/git-lfs`, with adjacent provenance JSON;
only `git-lfs version` was run. No global installation, Git filter configuration
or repository staging was performed here.
[Official Git LFS release](https://github.com/git-lfs/git-lfs/releases/tag/v3.8.1).

## Assembly review and bundled TypeScript smoke

Added `engine/assemble_runtime_test.py` using small, isolated temporary archives
and trees. Against the initial assembler/packager it reproduced six defects:
nonempty interrupted extraction caches were reused; obsolete target files leaked
into a new payload; a stale destination symlink overwrote an outside sentinel
before late rejection; nonexistent executables could be advertised; same-size
source mutations produced false inventory hashes; and manifest serialization
failure replaced the previous archive without its matching manifest. These
findings and the tests were handed to the parent, who owns the implementation
fixes. After the parent's source fixes, `python3 engine/assemble_runtime_test.py`
reports **6 passed**. No assembler, acquisition or packager source was changed here.

An actual stdio LSP smoke used the normalized host tree's Node 26.13.0,
typescript-language-server 6.0.3 and TypeScript 6.0.3. Initialization passed with
the exact catalogue `tsserver.path=.../lib/tsserver.js` and
`fallbackPath=.../lib`; the server advertised `definitionProvider: true`.
A temporary TypeScript fixture's `hello(1)` call resolved to its declaration at
zero-based line 0, characters 9–14. No protocol errors or stderr were observed;
`shutdown`/`exit` completed with process exit 0. The owned temporary fixture was
removed. This verifies the host JavaScript/TypeScript provider's initialization
and actual navigation, without claiming execution on the other five targets.

## Kotlin-specific Java 21 compatibility correction

The real fwcd smoke exposed a runtime incompatibility: its embedded IntelliJ
`JavaVersion.parse` rejects the Microsoft runtime's five-component
`java.version=25.0.5.0.2`. A separate conventional-version Java 21 runtime fixes
the actual initialization/symbol/definition path in the core agent's diagnostic;
JDT still needs its existing newer Java runtime. Kotlin therefore has its own
`kotlin-java` package, executable path and `JAVA_HOME`, with no shared-JVM change.

Five targets use official Temurin **21.0.13+9** JREs. The official release has no
Windows ARM64 artifact, so that target uses BellSoft Liberica **21.0.13+11**'s
native ARM64 JRE. BellSoft was chosen for that fallback because the matching full
source archive is directly downloadable with a published checksum. All six
downloaded runtime `release` files were inspected: each reports exactly
`JAVA_VERSION="21.0.13"`, and native architecture metadata matches its target.
Archive roots and `lib/modules`/Java launch paths were checked. This avoids both
architecture emulation and the same five-component version trap in some newer
vendor CPU builds.
[Official Temurin release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9),
[official Liberica release](https://github.com/bell-sw/Liberica/releases/tag/21.0.13%2B11),
[Liberica licensing](https://bell-sw.com/liberica_eula/),
[OpenJDK GPLv2 with Classpath exception](https://openjdk.org/legal/gplv2+ce.html).

All six JRE archives passed official GitHub release asset SHA-256 digests and are
in the shared download cache. Two matching source archives and provenance
receipts accompany the distribution under `engine/dist/sources/`:

| Source archive | Bytes | SHA-256 |
| --- | ---: | --- |
| `temurin21-21.0.13+9-sources.tar.gz` | 115,231,532 | `b5232c9980d8a0f0459676c084c41c6e2c771ed9e785890b03c6a438406ad1ca` |
| `liberica21-21.0.13+11-sources-full.tar.gz` | 183,586,085 | `db3845e9d7773d8b0ea6376e40d29e5eab1f034f5f5b256012f6c5d9781b3893` |

These pins are published upstream asset digests, checked after download. Preserve
their associated runtime `legal/` trees and notices, and publish the source
archives alongside the corresponding binaries. Parent integration owns final
repacking and the exact newly bundled Java 21 Kotlin smoke. The diagnostic using
existing conventional Java 21 passed real symbols/definition but the provider
needed bounded termination after shutdown; it is not evidence of clean shutdown
or execution on all target systems.
