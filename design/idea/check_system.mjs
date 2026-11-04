// Contract checks for the shared system. GPUI layout still needs an app check.
// node --experimental-vm-modules design/idea/check_system.mjs
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);
const canonicalTokens = JSON.parse(await readFile(new URL("design/idea/tokens.json", root), "utf8"));
const store = { layout: "idea" };
const context = vm.createContext({ console });
let inItemRenderer = false;
const builtElements = [];
class Element {
  constructor() {
    this.calls = [];
    const proxy = new Proxy(this, { get: (object, name) => name in object ? object[name] : (...args) => {
      assert.ok(!inItemRenderer || !String(name).startsWith("on_"), `handler ${String(name)} registered inside virtual renderer`);
      object.calls.push([name, ...args]); return proxy;
    } });
    builtElements.push(proxy);
    return proxy;
  }
}
const element = () => new Element();
const virtualList = (id, count, sizes, getKey, render) => {
  const list = element();
  assert.equal(Array.isArray(sizes) ? sizes.length : count, count);
  inItemRenderer = true;
  try { render({ start: 0, end: count }); } finally { inItemRenderer = false; }
  list.calls.push(["virtual_list", id, count, getKey]);
  return list;
};
const scrolls = [];
const synthetic = (id, values) => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value);
}, { context, identifier: id });
const mocks = {
  "gpui-kit": synthetic("gpui-kit", { div: element, image: element }),
  "gpui-base": synthetic("gpui-base", { h_flex: element, v_flex: element, v_virtual_list: virtualList,
    Scrollbar: { vertical: element }, VirtualListScrollHandle: { new: () => ({ scroll_to_item: (...args) => scrolls.push(args), release() {} }) } }),
  herdr: synthetic("herdr", { shared: key => store[key], setShared: (key,value) => { store[key] = value; }, notify: () => {}, playSound: () => {}, openOverlay: () => "ghost", closeOverlay: () => {}, settings: () => ({}), theme: () => ({ foreground: "#fff", surface: "#111", ansi2: "#2", ansi4: "#4", ansi1: "#1" }) }),
  "./idea-tokens.js": synthetic("canonical-tokens", { IDEA_TOKENS: canonicalTokens }),
};
const modules = new Map();
async function load(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const module = new vm.SourceTextModule(await readFile(url, "utf8"), { context, identifier: url.href });
  modules.set(url.href, module);
  await module.link((id, parent) => mocks[id] ?? load(new URL(id === "./idea-tokens.js" && parent.identifier.endsWith("/ui.js") ? "../../mods/codenav/idea-tokens.js" : id, parent.identifier)));
  await module.evaluate();
  return module;
}
const ui = (await load(new URL("design/idea/ui.js", root))).namespace;
assert.equal(ui.IDEA.rowHeight, 22);
assert.equal(ui.IDEA.islandRadius, 8);
assert.equal(ui.uiColors().surface, "#191A1C");
assert.equal(ui.IDEA.editorChangeMarkerWidth, 4);
assert.equal(ui.IDEA.editorChangeMarkerRadius, 2);
assert.equal(ui.uiColors().lineAdded, canonicalTokens['editor.colors'].ADDED_LINES_COLOR);
assert.equal(ui.uiColors().lineModified, canonicalTokens['editor.colors'].MODIFIED_LINES_COLOR);
assert.equal(ui.uiColors().lineDeleted, canonicalTokens['editor.colors'].DELETED_LINES_COLOR);
store["codenav.appearance"] = { compact: false, uiSize: 16 };
assert.equal(ui.IDEA.rowHeight, 24);
assert.equal(ui.IDEA.islandRadius, 10);
assert.equal(ui.uiSize(), 16);
store.layout = "codebench";
assert.equal(ui.isCompact(), false);
assert.equal(ui.uiSize(), 13);
assert.equal(ui.uiColors().surface, "#111");
assert.deepEqual([ui.uiColors().lineAdded, ui.uiColors().lineModified, ui.uiColors().lineDeleted], ['#2', '#4', '#1']);
store.layout = "idea";
delete store["codenav.appearance"];

const viewport = new ui.TabViewport();
viewport.width = 350;
for (const id of ["a", "b", "c", "d"]) viewport.widths.set(id, 180);
assert.equal(viewport.place(["a", "b", "c", "d"], "d"), 370, "the last active tab is fully revealed");
assert.equal(viewport.place(["a", "b", "c", "d"], "a"), 0, "switching back reveals the first tab");
viewport.scroll(-150);
assert.equal(viewport.place(["a", "b", "c", "d"], "a"), 150, "ordinary redraw preserves manual scrolling");
viewport.width = 200;
assert.equal(viewport.place(["a", "b", "c", "d"], "d"), 520, "resizing keeps the active tab visible");
assert.equal(viewport.place(["a"], "a"), 0, "closing tabs clamps the offset");

let chosen = 0, closed = 0, notifications = 0;
const cx = { focus_handle: () => ({ focus() {} }), notify: () => notifications++, stop_propagation() {} };
const menu = new ui.MenuController(cx);
const rows = [{ disabled: true }, { separator: true }, { id: "a", shortcut: "1", action: () => chosen++ }, { disabled: true }, { id: "b", shortcut: "2", action: () => chosen += 10 }];
const key = k => menu.key({ key: k }, cx, rows, { onClose: () => closed++ });
key("down"); assert.equal(menu.at, 4);
key("up"); assert.equal(menu.at, 2);
key("end"); assert.equal(menu.at, 4);
key("home"); assert.equal(menu.at, 2);
key("2"); assert.equal(chosen, 10); assert.equal(closed, 1);
key("escape"); assert.equal(closed, 2);
assert.ok(scrolls.length >= 4);
const empty = new ui.MenuController(cx);
empty.key({ key: "down" }, cx, [], {});
assert.equal(empty.at, -1);
empty.key({ key: "enter" }, cx, [], {});
// The GPUI bridge executes item renderers in layout, where handlers throw.
rows[4].icon = () => { assert.ok(inItemRenderer, "native icons must be created inside the deferred row renderer"); return element(); };
assert.throws(() => ui.uiMenu("invalid-icon", [{ icon: element() }], menu, cx), /icons must be factories/);
ui.uiMenu("contract-menu", rows, menu, cx, { onClose: () => closed++ });
const menuList = builtElements.find(el => el.calls.some(call => call[0] === "virtual_list" && call[1] === "contract-menu-list"));
const itemClick = menuList.calls.find(call => call[0] === "on_item_click")[1];
const beforeClick = chosen;
itemClick("b", cx);
assert.equal(chosen, beforeClick + 10, "item click activates the stable row identity");
itemClick("contract-menu-separator-1", cx);
assert.equal(chosen, beforeClick + 10, "separator is not actionable");
menu.release(); menu.release(); empty.release();

// Geometry migrations must preserve user arrangement and terminal payloads.
const { find } = (await load(new URL("mods/codenav/layout-tree.js", root))).namespace;
const first = { id: "duplicate" }, second = { id: "duplicate" };
const lookupTree = { id: "root", children: [{ id: "branch", children: [first] }, second] };
assert.equal(find(lookupTree, "root"), lookupTree, "the current node wins before its children");
assert.equal(find(lookupTree, "duplicate"), first, "depth-first lookup returns the first match, not a later sibling");
assert.equal(find(lookupTree, "missing"), null);
assert.equal(find(null, "missing"), null);
assert.equal(find({ id: "leaf" }, "missing"), null, "leaves need no children array");
const shortCircuit = { id: "root", children: [first, { get id() { assert.fail("a later branch must not be visited after a match"); } }] };
assert.equal(find(shortCircuit, "duplicate"), first);
const islands = (await load(new URL("mods/codenav/islands.js", root))).namespace;
const tree = JSON.parse(await readFile(new URL("layouts/idea.json", root), "utf8"));
const collect = (node, map = new Map()) => { map.set(node.id, node); for (const child of node.children ?? []) collect(child, map); return map; };
const before = collect(structuredClone(tree));
assert.ok(islands.ensureIdeaIslands(tree) || before.get("root").gap === 0);
assert.equal(islands.ensureIdeaIslands(tree), false, "migration is idempotent");
const after = collect(tree);
for (const [id, previous] of before) {
  const next = after.get(id); assert.ok(next, id);
  for (const key of ["active", "hidden", "type"]) assert.deepEqual(next[key], previous[key], `${id}.${key}`);
  if (!id.startsWith("island-") && !["editor-tabs", "left-bar", "right-bar", "bottom-bar", "main-toolbar", "status-row", "stripe", "stripe-right"].includes(id)) assert.deepEqual(next.size, previous.size, `${id}.size`);
  if (previous.children) {
    const mainId = id === "sidebar" ? "left-main" : "right-main";
    const holder = ["sidebar", "tool-right"].includes(id) && !previous.children.some(child=>child.id===mainId) ? after.get(mainId) : next;
    assert.deepEqual(holder.children.filter(n => !n.id.startsWith("island-")).map(n => n.id), previous.children.filter(n => !n.id.startsWith("island-")).map(n => n.id), `${id}.children`);
  }
}
for (const id of ["root", "body", "idea-content", "idea-upper", "work-body"]) assert.equal(after.get(id).gap, 0);
assert.deepEqual(Array.from(after.get('body').children,node=>node.id),['stripe','idea-content','stripe-right']);
assert.deepEqual(Array.from(after.get('idea-content').children,node=>node.id),['idea-upper','terminal-panel']);
assert.deepEqual(Array.from(after.get('idea-upper').children,node=>node.id),['sidebar','work-body','tool-right']);
for (const id of ['idea-content','idea-upper']) assert.deepEqual(Array.from(after.get(id).padding),[0,0]);
for (const id of ["left-main", "left-aux", "right-main", "right-aux", "terminal-panel", "editor-area"]) assert.deepEqual(Array.from(after.get(id).padding), [2, 2]);
for (const id of ["sidebar", "tool-right"]) assert.deepEqual(Array.from(after.get(id).padding), [0,0]);
for (const built of builtElements.filter(el => el.calls.some(([name]) => name === "virtual_list"))) {
  assert.ok(built.calls.some(([name]) => name === "size_full") || ["w", "h"].every(axis => built.calls.some(([name, value]) => name === axis && Number.isFinite(value) && value > 0)), "virtual lists need definite width and height");
}
const stripe = ui.uiStripeButton("stripe", element(), () => {}, { active: true });
let spinnerFactories = 0;
const makeSpinner = () => { spinnerFactories++; return element(); };
const progress = ui.uiSpinner(makeSpinner, { size: 12 });
assert.equal(spinnerFactories, 1, 'each spinner obtains its own native SVG');
assert.equal(progress.calls.find(([name]) => name === 'spin')[1], 1000, 'IDEA eight125ms frames share a1000ms native cycle');
assert.equal(progress.calls.find(([name]) => name === 'text_color')[1], ui.uiColors().secondary, 'working indicator uses neutral IDEA chrome color');
assert.equal(stripe.calls.find(([name]) => name === "w")[1], 32);
const fill = stripe.calls.find(([name]) => name === "child")[1];
assert.equal(fill.calls.find(([name]) => name === "w")[1], 28, "selection remains inside the hit area");
for (const compact of [true, false]) {
  store['codenav.appearance'] = { compact };
  for (const side of ['left', 'right']) {
    const button = ui.uiStripeButton(`stripe-${side}`, element(), () => {}, { active: true, side });
    const inside = button.calls.find(([name]) => name === 'child')[1];
    const width = button.calls.find(([name]) => name === 'w')[1], fillWidth = inside.calls.find(([name]) => name === 'w')[1];
    const offset = inside.calls.find(([name]) => name === 'left')[1];
    assert.equal(width, ui.IDEA.stripeButtonWidth, 'hit width remains the existing density size');
    assert.equal(offset, (side === 'left' ? 1 : -1) * ui.IDEA.islandGap / 4);
    const start = (ui.IDEA.stripeWidth - fillWidth) / 2 + offset;
    const end = ui.IDEA.stripeWidth - start - fillWidth;
    const outer = side === 'left' ? start : end;
    const inner = (side === 'left' ? end : start) + ui.IDEA.islandGap / 2;
    assert.equal(inner, outer, 'visible inner shell+stripe margin matches outer stripe margin');
    assert.ok(Math.abs(offset) <= (width - fillWidth) / 2, 'fill remains inside the unchanged hit target');
  }
  const footer = ui.uiEditorFooter([element()]);
  assert.equal(footer.calls.find(([name]) => name === 'h')[1], ui.IDEA.editorBreadcrumbHeight);
  assert.equal(footer.calls.find(([name]) => name === 'bg')[1], ui.uiColors().editor);
  assert.ok(footer.calls.some(([name]) => name === 'justify_end'));
}
delete store['codenav.appearance'];
const disabledCheckbox = ui.uiCheckbox("disabled", "Disabled", () => assert.fail("disabled"), { disabled: true });
assert.ok(!disabledCheckbox.calls.some(([name]) => name === "on_click"));
console.log("PASS shared density, semantic colors, deferred menu icons, keyboard/scroll, stripe inset, layout preservation/idempotence");

// Optional explicit migration uses the same function as the live shell.
// No flag means read-only. Pass source and installed idea.json together.
if (process.argv[2] === "--migrate-layout") {
  for (const path of process.argv.slice(3)) {
    const current = JSON.parse(await readFile(path, "utf8"));
    assert.equal(current.theme, "idea", "only the idea layout may be migrated");
    if (islands.ensureIdeaIslands(current)) await writeFile(path, JSON.stringify(current, null, 2) + "\n");
    console.log(`Migrated chrome: ${path}`);
  }
}
