// node --experimental-vm-modules design/idea/check_lsp_install_guide.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../mods/codenav/lsp-install-guide.js", import.meta.url), "utf8");
// The real module evaluates without Herdr, network, process or filesystem APIs.
const module = new vm.SourceTextModule(source, { context: vm.createContext({}) });
await module.link(() => assert.fail("The installation guide must remain a pure model"));
await module.evaluate();
const { INSTALL_LANGUAGES: languages, installationGuide } = module.namespace;
assert.equal(languages.length, 7);
assert.deepEqual(Array.from(languages, item => item.id), ["java", "kotlin", "typescript", "javascript", "go", "swift", "rust"]);
assert.equal(new Set(languages.map(item => item.id)).size, 7);
assert.ok(Object.isFrozen(languages));
const config = JSON.parse(await readFile(new URL("../../mods/codenav/bridge/servers.json", import.meta.url), "utf8"));
for (const item of languages) {
  assert.ok(item.label && item.extension && item.languageId);
  assert.ok(Object.isFrozen(item));
  assert.ok(config[item.languageId]?.extensions.includes(item.extension), `${item.id} must map to the real engine language and extension`);
}
assert.equal(languages.find(item => item.id === "javascript").languageId, "typescript");
assert.equal(languages.find(item => item.id === "typescript").languageId, "typescript");

const officialHosts = new Set(["learn.microsoft.com", "github.com", "formulae.brew.sh", "nodejs.org", "go.dev", "www.swift.org", "rust-lang.org", "rust-analyzer.github.io"]);
for (const platform of ["macos", "linux", "windows"]) {
  for (const language of languages) {
    const guide = installationGuide(language.id, platform);
    assert.ok(guide.title.includes(language.label));
    assert.ok(Array.isArray(guide.requirements) && guide.requirements.length);
    assert.ok(Array.isArray(guide.notes) && guide.notes.length);
    assert.ok(guide.requirements.every(item => typeof item === "string" && item.length));
    assert.ok(guide.notes.every(item => typeof item === "string" && item.length));
    assert.ok(Array.isArray(guide.steps) && guide.steps.length >= 3);
    assert.ok(guide.steps.some(step => step.title.includes("SDK 버전")), "Every SDK has a visible version check");
    assert.ok(guide.steps.some(step => step.url), "Every guide has an official installation source");
    for (const step of guide.steps) {
      assert.ok(typeof step.title === "string" && step.title);
      assert.ok(typeof step.detail === "string" && step.detail);
      if (step.url) {
        const url = new URL(step.url);
        assert.equal(url.protocol, "https:");
        assert.ok(officialHosts.has(url.hostname), `Unexpected guide source: ${step.url}`);
      }
      if (step.command) {
        assert.equal(typeof step.command, "string");
        assert.doesNotMatch(step.command, /(?:curl|wget)[^\n]*\|\s*(?:sh|bash)|sudo\b|--force\b|rm\s+-rf|Invoke-Expression|\biex\b/i);
        if (platform !== "macos") assert.doesNotMatch(step.command, /\b(?:brew|xcrun)\b/);
        if (platform === "windows") assert.doesNotMatch(step.command, /command -v|\bwhich\b/);
      }
    }
    assert.ok(guide.notes.some(note => note.includes("자동 실행되지 않습니다")));
    assert.ok(guide.notes.some(note => note.includes("LSP 시작")));
  }
}

const commands = (id, platform) => installationGuide(id, platform).steps.map(step => step.command ?? "").join("\n");
assert.match(commands("java", "macos"), /brew install jdtls/);
assert.match(commands("kotlin", "macos"), /brew install JetBrains\/utils\/kotlin-lsp/);
assert.match(commands("java", "windows"), /Get-Command jdtls/);
assert.match(commands("swift", "macos"), /xcrun --find sourcekit-lsp/);
assert.match(commands("rust", "linux"), /rustup component add rust-analyzer/);
assert.match(commands("rust", "linux"), /rustup component add rust-src/);
for (const id of ["typescript", "javascript"]) {
  assert.match(commands(id, "windows"), /typescript@6 typescript-language-server@6/);
  assert.match(commands(id, "linux"), /node --version\nnpm --version/);
}
assert.match(commands("go", "windows"), /go install golang.org\/x\/tools\/gopls@latest/);
assert.equal(JSON.stringify(installationGuide("kotlin", "darwin")), JSON.stringify(installationGuide("kotlin", "macos")));
assert.equal(JSON.stringify(installationGuide("java", "win32")), JSON.stringify(installationGuide("java", "windows")));
assert.equal(installationGuide("python", "linux"), null);
assert.equal(installationGuide("", "linux"), null);
const unknown = installationGuide("java", "freebsd");
assert.ok(unknown.notes.some(note => note.includes("운영체제를 확인")));
assert.doesNotMatch(commands("java", "freebsd"), /brew|Get-Command|command -v/);

const original = JSON.stringify(installationGuide("java", "linux"));
const changed = installationGuide("java", "linux");
changed.requirements.push("mutation");
changed.steps[0].detail = "mutation";
changed.notes.length = 0;
assert.equal(JSON.stringify(installationGuide("java", "linux")), original, "UI edits cannot contaminate another guide render");
console.log("LSP installation guide: 7 languages × 3 platforms, engine mappings, copy-only commands and isolated data passed");
