// Run: node --experimental-vm-modules design/idea/check_file_selection.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../mods/activity/files.js", import.meta.url), "utf8");
const context = vm.createContext({ console });
const store = {}, timers = [], tasks = [], reads = [];
const place = { cwd: "/repo", on: null, space: "one" };
const placeId = () => JSON.stringify(place);
let file = { path: "/repo/src/main/App.kt", on: null }, pendingRead;
const cx = { notify() {}, timer: { after(_delay, action) { timers.push(action); } }, spawn(action) { tasks.push(action(cx)); } };
const overrides = {
  shared: name => store[name], location: () => place, locationKey: placeId,
  editorSpec: () => file, sameMachine: (a, b) => (a ?? null) === (b ?? null),
  window: () => ({ platform: "macos" }), SEP: "separator",
  sh: async (_script, [path]) => { reads.push(path); return pendingRead ? pendingRead : { code: 0, stdout: "f\0App.kt\0" }; },
};
const module = new vm.SourceTextModule(source, { context });
await module.link(id => {
  const statements = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter(match => match[2] === id);
  const names = [...new Set(statements.flatMap(statement => statement[1].split(",").map(name => name.trim().split(/\s+as\s+/)[0])))];
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, overrides[name] ?? (() => {}));
  }, { context });
});
await module.evaluate();
const Files = module.namespace.default;
const view = new Files();
view.context = { ...place, key: placeId(), root: "/repo" };
view.entries = new Map([["", []]]); view.folders = new Set(); view.sel = new Set();
const flush = async () => { while (timers.length) timers.shift()(cx); await Promise.all(tasks.splice(0)); };

view.syncShownFile(cx); await flush();
assert.deepEqual([...view.sel], ["src/main/App.kt"]);
assert.deepEqual([...view.folders], ["src", "src/main"]);
assert.deepEqual(reads, ["/repo/src", "/repo/src/main"]);
view.sel = new Set(["src", "README.md"]);
view.syncShownFile(cx); await flush();
assert.equal(view.sel.size, 2, "ordinary redraws preserve manual multiselection");

file = { path: "/repo-other/App.kt", on: null };
view.syncShownFile(cx); await flush();
assert.equal(view.sel.size, 0, "a sibling directory is outside this project");
file = { path: "/repo/src/main/App.kt", on: "remote" };
view.syncShownFile(cx); await flush();
assert.equal(view.sel.size, 0, "matching paths on another machine are not selected");

let resolveRead;
pendingRead = new Promise(resolve => { resolveRead = resolve; });
file = { path: "/repo/old/File.kt" };
view.syncShownFile(cx); timers.shift()(cx);
file = { path: "/repo/README.md" };
view.syncShownFile(cx); timers.shift()(cx);
resolveRead({ code: 0, stdout: "f\0File.kt\0" });
await flush(); pendingRead = null;
assert.deepEqual([...view.sel], ["README.md"]);
assert.equal(view.entries.has("old"), false, "a stale directory load cannot replace the new tab selection");

store["codenav.area"] = "review";
store["codenav.review.current"] = { space: "one", rkey: ":/repo", path: "README.md" };
assert.equal(view.shownFile().path, "/repo/README.md");
store["codenav.review.current"].space = "two";
assert.equal(view.shownFile(), null, "reviews from another space are ignored");
console.log("PASS active file selection, parent expansion, multiselection, path/machine boundaries, stale loads, review scope");
