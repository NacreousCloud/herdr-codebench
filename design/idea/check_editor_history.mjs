// node --experimental-vm-modules design/idea/check_editor_history.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const context = vm.createContext({ console });
const source = await readFile(new URL("../../mods/codenav/editor-history.js", import.meta.url), "utf8");
const model = new vm.SourceTextModule(source, { context });
await model.link(() => { throw Error("History model must stay independent of runtime APIs"); });
await model.evaluate();
const { recentFileTabs, visitFile, tabAfterClose } = model.namespace;
const tab = (path, on = null, extra = {}) => ({ id: `f:${on ?? ""}:${path}`, type: "file", spec: { kind: "file", path, on, ...extra } });
const a = tab("/repo/A.kt", null, { edit: true, at: 12 }), b = tab("/repo/B.kt"), remote = tab("/repo/A.kt", "remote");
const list = recentFileTabs([], [a, b], []);
assert.deepEqual(Array.from(list, x => x.id), [b.id, a.id], "closed navigation snapshots seed MRU without open tabs");
assert.equal(list[1].spec.edit, undefined, "MRU never restores an editing session or stale handle");
assert.equal(list[1].spec.at, undefined);
const visited = visitFile(list, a);
assert.deepEqual(Array.from(visited, x => x.id), [a.id, b.id]);
assert.equal(recentFileTabs([a, remote, a]).length, 2, "same path on different machines has a distinct identity");
assert.equal(recentFileTabs(Array.from({ length: 150 }, (_, i) => tab(`/repo/${i}.kt`))).length, 100);
assert.equal(tabAfterClose([a, b, remote], a.id, new Set([a.id]), [b.id, remote.id], true).id, b.id);
assert.equal(tabAfterClose([a, b, remote], a.id, new Set([b.id]), [remote.id], true).id, a.id);
assert.equal(tabAfterClose([a], a.id, new Set([a.id]), [], true), null);

// Exercise the real RecentFiles data method, including workspace and edited filters.
let workspace = "a";
const state = { "codenav.tabs": { a: [] }, "codenav.history": { a: { list: [a, b] } },
  "codenav.recentFiles": { a: [remote, b, a], other: [tab("/elsewhere/Secret.kt")] },
  "codenav.editedFiles": { a: [a.spec.path] } };
const recentSource = await readFile(new URL("../../mods/codenav/recent.js", import.meta.url), "utf8");
const exports = { shared: name => state[name], editorKey: () => workspace };
const recentModule = new vm.SourceTextModule(recentSource, { context });
await recentModule.link(id => {
  if (id === "./editor-history.js") return model;
  const names = [...recentSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].find(m => m[2] === id)[1].split(",").map(n => n.trim());
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, exports[name] ?? (() => {})); }, { context });
});
await recentModule.evaluate();
const view = new recentModule.namespace.default(); view.input = { value: () => "" };
assert.deepEqual(Array.from(view.files(), x => x.id), [remote.id, b.id, a.id], "Recent Files includes closed files");
view.input = { value: () => "B.kt" };
assert.deepEqual(Array.from(view.files(), x => x.id), [b.id], "path/name filter works for closed files");
workspace = "empty"; view.input = { value: () => "" };
assert.equal(view.files().length, 0, "another workspace does not inherit this MRU");
console.log("PASS independent MRU, closed-file snapshots/filter, machine IDs, limit, edit-state stripping, selection policy and workspace isolation");
