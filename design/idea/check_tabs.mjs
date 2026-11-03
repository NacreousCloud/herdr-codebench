// node --experimental-vm-modules design/idea/check_tabs.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const context = vm.createContext({ console }), timers = [], calls = [];
let space = "a", store, tree, self;
const key = () => `@area:${space}`;
const find = (node, id) => node?.id === id ? node : (node?.children ?? []).map(n => find(n, id)).find(Boolean);
const shared = name => structuredClone(store[name]);
const editorSpec = () => shared("activity.editor")?.[key()] ?? null;
const setEditorSpec = (slot, spec) => { if (spec) store["activity.editor"][slot] = structuredClone(spec); else delete store["activity.editor"][slot]; };
const wantedChild = () => store["codenav.area"] === "review" ? "editor-review" : !editorSpec() || !editorSpec().path.endsWith(".png") ? "editor-code" : "editor-text";
const run = (name, args) => {
  calls.push([name, args]);
  if (name === "layout.hide" || name === "layout.show") find(tree, args.id).hidden = name === "layout.hide";
  if (name === "layout.select") find(tree, args.stack).active = args.child;
};
const source = await readFile(new URL("../../mods/codenav/tabs.js", import.meta.url), "utf8");
const values = {
  shared, setShared: (name, value) => { store[name] = structuredClone(value); }, layout: () => structuredClone(tree), run,
  spaces: () => ["a", "b"].map(id => ({ id, active: id === space })),
  find, STACK: "editor-stack", AREA: "editor-area", CHILD: { code: "editor-code", text: "editor-text", review: "editor-review" },
  editorSpec, editorKey: key, setEditorSpec, wantedChild, location: () => ({ cwd: "/repo", on: null }),
  isIdea: () => store.layout === "idea",
};
const module = new vm.SourceTextModule(source, { context });
await module.link(id => {
  const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].find(m => m[2] === id)[1].split(",").map(n => n.trim());
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, values[name] ?? (() => {})); }, { context });
});
await module.evaluate();
const { routeEditor, closeTab, closeAll } = module.namespace;
const cx = { timer: { after(_ms, action) { timers.push(action); } } };
const flush = () => { while (timers.length) timers.shift()(cx); };
const settle = () => { for (let i = 0; i < 10; i++) { routeEditor(self, cx); if (!timers.length) return; flush(); } assert.fail("routing did not settle"); };
const spec = path => ({ kind: "file", path: `/repo/${path}`, at: 1 });
const tab = path => ({ id: `f::/repo/${path}`, type: "file", spec: spec(path) });
function reset(paths = ["App.kt"]) {
  space = "a"; self = {}; timers.length = 0; calls.length = 0;
  store = { layout: "idea", "activity.editor": paths.length ? { [key()]: spec(paths[0]) } : {}, "codenav.tabs": { [key()]: paths.map(tab) } };
  tree = { id: "editor-area", children: [{ id: "editor-tabs" }, { id: "editor-stack", active: "editor-code" }] };
}
reset(); closeTab(); settle();
assert.equal(editorSpec(), null);
assert.equal(store["codenav.tabs"][key()].length, 0);
assert.equal(Boolean(tree.hidden), false, "IDEA keeps the empty editor island");
assert.equal(find(tree, "editor-tabs").hidden, true);
setEditorSpec(key(), spec("New.kt")); settle();
assert.equal(find(tree, "editor-tabs").hidden, false, "a hidden strip returns when the explorer opens a file");
assert.equal(store["codenav.tabs"][key()][0].id, tab("New.kt").id);

reset(); store["codenav.tabs"][key()] = [];
routeEditor(self, cx); closeTab(); flush(); settle();
assert.equal(store["codenav.tabs"][key()].length, 0, "a pending registration cannot resurrect the last closed file");

reset(); store["codenav.tabs"][key()] = [];
routeEditor(self, cx); closeAll(); flush(); settle();
assert.equal(editorSpec(), null, "Close All also closes a current file awaiting registration");
assert.equal(store["codenav.tabs"][key()].length, 0);

reset(); store["codenav.tabs"][key()] = [];
routeEditor(self, cx); space = "b"; store["codenav.tabs"][key()] = []; flush();
assert.equal(store["codenav.tabs"][key()].length, 0, "a pending registration stays in its own space");

reset(["App.kt", "Other.kt"]); closeTab(); settle();
assert.equal(editorSpec().path, "/repo/Other.kt", "closing the active file selects its neighbour");
closeAll(); settle(); assert.equal(editorSpec(), null);

reset([]); store["activity.editor"] = {}; store["codenav.area"] = "review";
store["codenav.review.current"] = { space: "a", rkey: ":/repo", path: "App.kt" };
store["codenav.tabs"][key()] = [{ id: "r::/repo:App.kt", type: "review", rkey: ":/repo", path: "App.kt" }];
closeAll(); settle(); assert.equal(store["codenav.tabs"][key()].length, 0); assert.equal(store["codenav.area"], null);

reset([]); store["codenav.area"] = "review";
store["codenav.review.current"] = { space: "a", rkey: ":/other", path: "Old.kt" };
settle();
assert.equal(store["codenav.tabs"][key()].length, 0, "a review from another repository is not added here");
assert.equal(find(tree, "editor-tabs").hidden, true, "stale review context does not leave an empty strip");

reset(); store.layout = "codebench"; closeTab();
assert.equal(tree.hidden, true, "codebench retains last-tab area hiding");
console.log("PASS last/close-all, empty island, hidden strip reopen, stale registration, space isolation, neighbour, review, codebench");
