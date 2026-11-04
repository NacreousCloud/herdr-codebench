# T10 Linux Swift source preparation

Downloaded the complete official Swift 6.4.2 Ubuntu 24.04 toolchain archives for amd64 and arm64. Verified each detached PGP signature before extracting or normalizing any payload. The isolated public verification keyring lives under `engine/.cache/swift-gpg`; no user GnuPG keyring/configuration was used.

The pinned signing fingerprint is `52BB7E3DE28A71BE22EC05FFEF80A866B47A981F`, the Swift 6.x release key listed on the publisher's [active signing keys page](https://www.swift.org/keys/active/). The publisher documents archive/signature verification in [Linux tarball installation](https://www.swift.org/install/linux/tarball/). Keys came from the documented HTTPS `all-keys.asc` endpoint; its HTTP gzip encoding was decoded before import.

| Target | Signed archive bytes | Verified SHA256 |
| --- | ---: | --- |
| linux-amd64 | 1,124,819,616 | `2e9ebec040ad459dd89a6d093a02d8314939135104850fae4d5c0f174fb3ba8c` |
| linux-arm64 | 1,109,582,328 | `307772afcc0b9501faa4797eb4197076facf5768593a0d8d2b83615c95b0040e` |

`engine/swift-lock.json` records these URL-to-SHA256 pins. Per-target `.cache/swift-linux-{amd64,arm64}-receipt.json` records signature status/output, publisher fingerprint, downloaded key-file hash, archive metadata, normalization and static architecture checks. The reproducible helper is `engine/swift_sources.py`.

Both full publisher toolchain trees are available at `engine/.cache/trees/linux-{amd64,arm64}/runtimes/swift`, preserving compiler/LSP binaries, matching runtime/resource libraries and `usr/share/swift/LICENSE.txt` with bundled notices. Static ELF headers match x86-64 (machine 62) and AArch64 (machine 183). The amd64 tree has 2,266 regular files totaling 3,704,817,074 bytes; arm64 has 2,250 totaling 3,666,070,216 bytes. These counts include the generated source verification marker and exclude symlinks.

The managed filesystem refused directory rename/rmdir operations on owned staging folders. Normalization therefore copied the verified tree into a fresh destination; completion metadata was written after the copy. Temporary file contents were removed, while directory removal remains subject to that environment restriction.

No Linux toolchain executable was run on this macOS host. These results establish official-source authenticity, complete extraction, retained notices and static architecture, not Linux LSP runtime behavior or dynamic-loader closure. No speculative pruning was applied. Full release packing and Linux-native smoke tests remain parent-task validation; the publisher's Linux system-library/platform prerequisites still apply.
