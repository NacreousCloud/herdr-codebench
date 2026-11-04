// Run: node --experimental-vm-modules design/idea/check_tree_navigation.mjs
// Exercise the real Files event methods, not a copy of their navigation logic.
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../mods/activity/files.js", import.meta.url), "utf8");
const context = vm.createContext({ console });
let idea = true;
const opened = [], focused = [], effects = [];
const builtElements = [], clipboardWrites = [], copiedPaths = [], nativeEditors = [];
const element = () => {
  const calls = [], children = [];
  const el = new Proxy({ calls, kids: children }, { get(target, name) {
    if (name in target) return target[name];
    if (name === "when") return (condition, apply) => condition ? apply(el) : el;
    if (name === "child") return child => { children.push(child); return el; };
    if (name === "children") return items => { children.push(...items); return el; };
    return (...args) => { calls.push([name, ...args]); return el; };
  } });
  builtElements.push(el); return el;
};
const listRows = new Map();
const overrides = {
  isIdea: () => idea,
  openInEditor: spec => opened.push(spec),
  div: element, h_flex: element, v_flex: element, ideaUI: el => el,
  uiColors: () => ({ guide: "guide", secondary: "secondary" }),
  uiListRow: (id, children, options = {}) => { const row = element().children(children); listRows.set(id, { row, options }); return row; },
  icon: element, iconButton: element, uiSize: (size = 13) => size, fileImage: element, toolImage: (name, size) => element().asset(name).size(size),
  IDEA_STATUS: {}, ideaName: name => name.replace(/\.kt$/, ""), T: text => text,
  locationKey: () => "tree", shared: () => null, theme: () => ({}),
  sameMachine: (a, b) => (a ?? null) === (b ?? null), home: () => "/Users/test",
  basename: path => path?.split("/").pop() ?? "", viewHeader: element,
  setShared: (key, value) => clipboardWrites.push([key, value]), copyFilesToSystem: paths => copiedPaths.push(paths),
  IDEA: { editorBreadcrumbHeight: 24 }, settings: () => ({ font_family: "Mono", font_size: 13 }),
  Editor: { new: state => { nativeEditors.push(state); return element(); } },
};
const module = new vm.SourceTextModule(source, { context });
await module.link(id => {
  const statements = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter(match => match[2] === id);
  const names = [...new Set(statements.flatMap(statement => statement[1].split(",").map(name => name.trim().split(/\s+as\s+/)[0])))];
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, overrides[name] ?? (() => { throw new Error(`Unexpected side effect: ${name}`); }));
  }, { context });
});
await module.evaluate();
const Files = module.namespace.default;
const rows = [
  { path: "docs", dir: true },
  { path: "docs/guide.md", dir: false },
  { path: "src", dir: true },
  { path: "src/main", dir: true },
  { path: "src/main/App.kt", dir: false },
  { path: "src/main/Service.kt", dir: false },
  { path: "src/Empty", dir: true },
  { path: "README.md", dir: false },
];
const cx = { notify() {}, stop_propagation() { effects.push("stop"); }, spawn() { effects.push("load"); } };
function view(path, folders = ["docs", "src", "src/main"]) {
  const v = new Files();
  v.context = { root: "/repo", on: null };
  v.sel = new Set(path ? [path] : []); v.anchor = path; v.focusPath = path;
  v.folders = new Set(folders); v.entries = new Map(folders.map(folder => [folder, []])); v.pending = new Set();
  v.focus = { focus() { focused.push(v.focusPath); } };
  rebuild(v);
  return v;
}
function rebuild(v) {
  v.flat = rows.filter(row => {
    const parts = row.path.split("/");
    return parts.slice(0, -1).every((_part, i) => v.folders.has(parts.slice(0, i + 1).join("/")));
  });
}
function key(v, key, modifiers = {}) { v.key({ key, modifiers }, cx); rebuild(v); }
function selected(v, ...paths) { assert.deepEqual([...v.sel], paths); }
function click(v, path, modifiers = {}) { v.click(rows.find(row => row.path === path), path, { modifiers }, cx); rebuild(v); }

let v = view("src/main/App.kt");
key(v, "left"); selected(v, "src/main");
assert.equal(v.focusPath, "src/main");
key(v, "left"); selected(v, "src/main");
assert.equal(v.folders.has("src/main"), false, "Left collapses an expanded folder before selecting its parent");
key(v, "left"); selected(v, "src");
assert.equal(v.folders.has("src"), true, "Left on a collapsed nested folder selects parent without collapsing parent");
key(v, "left"); selected(v, "src");
assert.equal(v.folders.has("src"), false);
key(v, "left"); selected(v, "src");

v = view("src/main", ["src"]);
v.entries.set("src/main", []);
key(v, "right"); selected(v, "src/main");
assert.equal(v.folders.has("src/main"), true, "Right first expands the selected closed folder");
key(v, "right"); selected(v, "src/main/App.kt");
key(v, "right"); selected(v, "src/main/App.kt");
v = view("src/Empty"); v.folders.add("src/Empty");
key(v, "right"); selected(v, "src/Empty");
assert.equal(opened.length, 0, "Arrow navigation never opens a file");

v = view("src/main");
key(v, "down", { shift: true }); selected(v, "src/main", "src/main/App.kt");
key(v, "down", { shift: true }); selected(v, "src/main", "src/main/App.kt", "src/main/Service.kt");
assert.equal(v.anchor, "src/main", "Extending a range keeps the initial anchor");
assert.equal(v.focusPath, "src/main/Service.kt", "The moving cursor is separate from the range anchor");
key(v, "up", { shift: true }); selected(v, "src/main", "src/main/App.kt");
key(v, "up", { shift: true }); selected(v, "src/main");
key(v, "up", { shift: true }); selected(v, "src", "src/main");
key(v, "down"); selected(v, "src/main");
assert.equal(v.anchor, "src/main", "Plain arrow collapses range at its moving cursor, not the old anchor");
key(v, "end", { shift: true }); selected(v, "src/main", "src/main/App.kt", "src/main/Service.kt", "src/Empty", "README.md");
key(v, "home", { shift: true }); selected(v, "docs", "docs/guide.md", "src", "src/main");
assert.equal(v.anchor, "src/main");
key(v, "end"); selected(v, "README.md");
assert.equal(v.focusPath, "README.md");
assert.equal(focused.at(-1), "README.md", "Normal arrows keep keyboard focus on the tree with the selected row cursor");

v = view("src/main/App.kt");
click(v, "README.md", { platform: true }); selected(v, "src/main/App.kt", "README.md");
assert.equal(v.focusPath, "README.md");
click(v, "README.md", { platform: true }); selected(v, "src/main/App.kt");
assert.equal(opened.length, 0, "Cmd-toggle does not open files");
click(v, "src/main/App.kt");
assert.equal(opened.at(-1).path, "/repo/src/main/App.kt", "Plain file click retains the existing open behavior");
click(v, "README.md", { shift: true }); selected(v, "src/main/App.kt", "src/main/Service.kt", "src/Empty", "README.md");
assert.equal(v.anchor, "src/main/App.kt");
assert.equal(v.focusPath, "README.md");
key(v, "up", { shift: true }); selected(v, "src/main/App.kt", "src/main/Service.kt", "src/Empty");
v = view("src", ["src"]); v.entries.set("docs", []);
click(v, "docs"); selected(v, "docs");
assert.equal(v.folders.has("docs"), true, "click expands the selected folder");
click(v, "docs");
assert.equal(v.folders.has("docs"), false, "click collapses the selected folder");

v = view("src/main/App.kt", ["src"]);
assert.equal(v.treeCursor(), "src/main", "Hidden cursor falls back to its nearest visible parent");
key(v, "down"); selected(v, "src/Empty");
v = view(null);
key(v, "down"); selected(v, "docs");
v = view(null); v.flat = [];
v.key({ key: "down", modifiers: { shift: true } }, cx); selected(v);

idea = false;
v = view("src/main");
key(v, "right"); selected(v, "src/main");
key(v, "down", { shift: true }); selected(v, "src/main/App.kt");
key(v, "up", { shift: true }); selected(v, "src/main");
console.log("PASS IDEA tree hierarchy, stable Shift ranges, focused cursor, Cmd selection, click/open, folder toggles, stale cursor, empty tree, codebench behavior");

// Presentation changes keep the same real row handlers and flattened paths.
idea = true; listRows.clear();
v = view("src/App.kt", ["src"]);
Object.assign(v, { context: { key: "tree", root: "/Users/test/project/demo", on: null },
  entries: new Map([["", [{ name: "src", dir: true }, { name: "README.md", dir: false }]], ["src", [{ name: "App.kt", dir: false }]]]),
  marks: {}, dirty: new Set(), cut: new Set(), syncShownFile() {}, takeRequest() {}, shownFile: () => null });
v.focus.is_focused = () => true;
v.render(cx);
assert.ok([...listRows.entries()].filter(([id]) => id.startsWith("file-")).every(([_id, { row }]) => !row.calls.some(([name, button]) => name === "on_mouse_down" && button === "left")), "IDEA file rows no longer start a drag on press");
assert.deepEqual(Array.from(v.flat, row => row.path), ["src", "src/App.kt", "README.md"], "presentation retains the real tree order and paths");
assert.equal(listRows.get("file-src").options.indent, 14, "top-level children sit beneath the project root");
assert.equal(listRows.get("file-src/App.kt").options.indent, 28, "nested children retain 14px hierarchy steps");
assert.equal(listRows.get("file-src/App.kt").row.kids.filter(child => child?.calls?.some(call => call[0] === "absolute")).length, 2, "guides follow actual ancestor levels");
const rootRow = listRows.get("files-project-root").row;
assert.equal(rootRow.kids[1].calls.find(call => call[0] === "asset")[1], "module");
assert.equal(rootRow.kids[2].kids[0], "demo");
assert.equal(rootRow.kids[3].kids[0], "~/project/demo", "local root path uses the home abbreviation beside the project name");
v.context.on = "remote"; v.render(cx);
assert.equal(listRows.get("files-project-root").row.kids[3].kids[0], "remote:/Users/test/project/demo", "remote paths never use the local home abbreviation");
idea = false; listRows.clear(); v.render(cx);
assert.equal(listRows.size, 0, "codebench preserves its existing root and file row branch");
console.log("PASS project root name/path, local/remote path labels, real hierarchy indentation/guides and codebench presentation branch");

assert.ok(builtElements.every(el => !el.calls.some(([name]) => ["on_drop", "on_mouse_move"].includes(name))), "Project renders neither file drop receivers nor drag movement handlers in either layout");
assert.ok(builtElements.filter(el => el.calls.some(([name, id]) => name === "id" && id.startsWith("file-"))).every(el => !el.calls.some(([name, button]) => name === "on_mouse_down" && button === "left")), "codebench file rows no longer start a drag on press");
assert.equal(typeof Files.prototype.drop, "undefined", "the desktop-copy drop entry point is removed");
const target = { root: "/repo", folder: "/repo", items: [{ path: "/repo/App.kt" }], on: null };
v.perform({ op: "copy", target }, cx);
assert.equal(clipboardWrites.at(-1)[1].cut, false);
assert.deepEqual(Array.from(copiedPaths.at(-1)), ["/repo/App.kt"], "file context Copy still reaches the system clipboard");
v.perform({ op: "cut", target: { ...target, on: "remote" } }, cx);
assert.equal(clipboardWrites.at(-1)[1].items[0].on, "remote");
assert.equal(clipboardWrites.at(-1)[1].cut, true, "remote context Cut keeps its machine and clipboard semantics");
assert.equal(copiedPaths.length, 1, "remote files are not sent to the local system clipboard");

const editorSource = await readFile(new URL("../../mods/activity/editor.js", import.meta.url), "utf8");
assert.doesNotMatch(source + editorSource, /\b(?:beginDrag|advanceDrag|dragState|takeDrag)\b/, "activity file views have no removed drag API dependency");
const editorModule = new vm.SourceTextModule(editorSource, { context });
await editorModule.link(id => {
  const statements = [...editorSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter(match => match[2] === id);
  const names = [...new Set(statements.flatMap(statement => statement[1].split(",").map(name => name.trim().split(/\s+as\s+/)[0])))];
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, overrides[name] ?? (() => { throw new Error(`Unexpected editor side effect: ${name}`); })); }, { context });
});
await editorModule.evaluate();
const native = new editorModule.namespace.default(), buffer = { value: () => "editable text" };
Object.assign(native, { sync() {}, closeRequest: () => null, shown: { kind: "file", path: "/repo/App.kt", rel: "App.kt" }, slot: true, code: buffer, mdMode: "edit" });
for (const layout of [true, false]) {
  idea = layout; const before = builtElements.length; native.render(cx);
  assert.equal(nativeEditors.at(-1), buffer, "native text editing still receives the existing buffer");
  assert.ok(builtElements.slice(before).every(el => !el.calls.some(([name]) => ["on_drop", "on_mouse_move", "on_mouse_up"].includes(name))), "native editor registers no file drag or drop interception");
}
console.log("PASS file drag/drop receivers and API dependencies removed, context clipboard/machine guards and native editing buffer preserved");
