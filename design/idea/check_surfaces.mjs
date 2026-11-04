// Run: node --experimental-vm-modules design/idea/check_surfaces.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as registry from "../../mods/codenav/actions.js";
import * as model from "../../mods/codenav/toolbar-model.js";

const groups = { test: { items: [{ id: "a", kind: "action", action: "a" }, { id: "b", kind: "action", action: "b" }] } };
const initial = { schemaVersion: 1, future: 42, groups: { unknown: { future: true } } };
const edited = model.customizeGroup(initial, "test", [groups.test.items[1], { id: "custom", kind: "separator" }], groups);
assert.deepEqual(model.groupItems("test", edited, groups).map(item => item.id), ["b", "custom"]);
const updated = { test: { items: [...groups.test.items, { id: "new-default", kind: "action", action: "new" }] } };
assert.ok(model.groupItems("test", edited, updated).some(item => item.id === "new-default"), "a new default remains available after a user customization");
assert.equal(edited.future, 42); assert.equal(edited.groups.unknown.future, true);
const iconChanged = model.customizeGroup(initial, "test", [{ ...groups.test.items[0], icon: "terminal" }, groups.test.items[1]], groups);
assert.equal(model.groupItems("test", iconChanged, groups)[0].icon, "terminal", "default occurrence icon override survives delta application");
assert.throws(() => model.customizeGroup(initial, "test", [groups.test.items[0], groups.test.items[0]], groups), /Duplicate/);
const futureItem = { id: "future", kind: "extension", data: { keep: true } };
const futureDoc = { groups: { test: { added: [futureItem] } } };
assert.ok(model.customizeGroup(futureDoc, "test", model.groupItems("test", futureDoc, groups), groups).groups.test.added.some(item => item.id === "future"));
assert.equal(model.restoreKnownGroups(edited, groups).groups.unknown.future, true);

const source = await readFile(new URL("../../mods/codenav/tools.js", import.meta.url), "utf8");
const context = vm.createContext({ console, Date, Math });
const store = { layout: "idea" }, buttons = [], menus = [], opened = [], dispatched = [];
let activeFile = { path: "/repo/App.kt", on: null }, cx, layoutTree;
function element(type = "div") {
  const state = { type, nodes: [], calls: [] };
  const proxy = new Proxy(state, { get(target, name) {
    if (name in target) return target[name];
    return (...args) => {
      if (name === "id") target.id = args[0];
      else if (name === "child") target.nodes.push(args[0]);
      else if (name === "children") target.nodes.push(...args[0]);
      else if (name === "when") { if (args[0]) args[1](proxy); }
      else target.calls.push([name, ...args]);
      return proxy;
    };
  } });
  return proxy;
}
const button = (id, graphic, action, options = {}) => { buttons.push({ id, graphic, action, ...options }); return element("button").id(id); };
const nodes=root=>[root,...(root.nodes??[]).filter(node=>node&&typeof node==='object').flatMap(nodes)];
const overrides = {
  ...registry, ...model,
  div: element, image: element, svg: element, v_flex: element, h_flex: element,
  shared: key => store[key], setShared: (key, value) => { store[key] = value; },
  layout: () => layoutTree,
  theme: () => ({}), window: () => ({ platform: "linux" }),
  spaces: () => [{ id: "one", active: true, name: "Repo", folder: "/repo", branch: "main", tabs: [] }], panes: () => [], focused: () => ({ terminal: "t1" }),
  runStore: () => ({ configs: [], selected: 0 }), isRunning: () => false,
  props: () => ({}), keys: () => [{ section: "layout:idea", keys: "cmd-shift-o", action: "codenav.find-file" }],
  run: (command, args) => dispatched.push([command, args]),
  find: () => null, editorSpec: () => activeFile, editorKey: () => "one", basename: path => path.split("/").pop(), tilde: path => path,
  editorSnapshot: key => {
    const value = store[key];
    return value && activeFile && value.path === activeFile.path && (value.on ?? null) === (activeFile.on ?? null)
      && (!value.space || value.space === "one") ? value : null;
  },
  T: value => value, icon: element, iconButton: button, toolImage: element, ideaImage: element, symbolImage: element,
  IDEA: { iconSize: 16, toolbarButtonSize: 26, rowHeight: 22, stripeWidth: 32 },
  ideaUI: el => el, uiColors: () => ({}), uiSize: () => 13,
  uiIconButton: button, uiStripeButton: button, uiToolHeader: element, uiIslandBottom: element,
  uiSpinner: factory => factory().spin(1000),
  uiSeparator: element,
  uiListRow: (id, children, opts) => element("row").id(id).children(children), uiTreeRow: element, uiNoticeCard: element,
  openPath: (path, on) => opened.push({ path, on }),
  MenuController: class { constructor() { this.focus = { focus() {} }; } release() {} },
  uiMenu: (_id, rows) => { menus.push(rows); return element("menu"); },
};
async function linkRuntime(source) {
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(async id => {
    if (["./tool-windows.js", "./layout-tree.js", "./tool-layout.js"].includes(id))
      return linkRuntime(await readFile(new URL(`../../mods/codenav/${id.slice(2)}`, import.meta.url), "utf8"));
  const names = [...new Set([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter(match => match[2] === id).flatMap(match => match[1].split(",").map(name => name.trim().split(/\s+as\s+/)[0])))];
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, overrides[name] ?? (() => {})); }, { context });
  });
  return mod;
}
const mod = await linkRuntime(source);
await mod.evaluate();
const { Toolbar, ToolHeader, Problems } = mod.namespace;
const toolbar = new Toolbar(); toolbar.init(); toolbar.width = 1600;
const toolbarTree = toolbar.render(), toolbarNodes = nodes(toolbarTree);
for (const side of ['left', 'center', 'right']) {
  const group = toolbarNodes.find(node=>node.id===`tb-group-${side}`);
  assert.ok(group.calls.some(([name])=>name==='h_full'));
  assert.ok(group.calls.some(([name])=>name==='items_center'));
}
for (const id of ['tb-project','tb-branch','tb-run-add']) {
  const widget = toolbarNodes.find(node=>node.id===id);
  assert.equal(widget.calls.find(([name])=>name==='h')[1],26,`${id} shares the toolbar control height`);
  assert.ok(nodes(widget).some(node=>node!==widget&&node.calls.some(([name])=>name==='h_full')&&node.calls.some(([name])=>name==='items_center')),`${id} text has a definite centered line box`);
}
assert.ok(buttons.some(item => item.id === "tb-search.action"));
store["codenav.customization"] = model.customizeGroup({}, "MainToolbar.right", [
  { id: "custom.goto", kind: "action", action: "codenav.find-file", icon: "terminal" },
], registry.ACTION_GROUPS);
buttons.length = 0; toolbar.render();
assert.ok(!buttons.some(item => item.id === "tb-search.action"), "the real toolbar stops rendering removed occurrences");
const goto = buttons.find(item => item.id === "tb-custom.goto");
assert.match(goto.tip, /⌘⇧O/); goto.action(); assert.equal(dispatched.at(-1)[0], "codenav.find-file");
toolbar.width = 180; buttons.length = 0; toolbar.render();
assert.ok(buttons.some(item => item.id === "tb-overflow"), "narrow window retains a reachable overflow menu");

const diagnostics = [{ severity: 2, line: 2, col: 1, source: "compiler", message: "warning" }, { severity: 1, line: 7, col: 3, source: "lint", message: "error" }];
store["codenav.problems"] = { path: "/repo/App.kt", on: null, space: "one", items: diagnostics };
const problems = new Problems();
cx = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {}, is_focused: () => true, release() {} }) };
problems.init({}, cx);
let rows = problems.data().rows;
problems.select(rows[0], cx); assert.equal(opened.length, 0, "selecting a problem preserves the current editor when autoscroll is off");
problems.key({ key: "enter" }, cx); assert.equal(opened.at(-1).path, "/repo/App.kt:3:2");
store["codenav.problemsOptions"] = { autoscroll: true, errorsOnly: true };
rows = problems.data().rows; assert.equal(rows.length, 1);
problems.select(rows[0], cx); assert.equal(opened.at(-1).path, "/repo/App.kt:8:4");
activeFile = { path: "/repo/App.kt", on: "other-machine" };
assert.equal(problems.data().rows.length, 0, "same path from a different machine is not this file's diagnostics");
problems.release();
console.log("PASS customization deltas, future/default preservation, actual toolbar rendering/dispatch/overflow, Problems selection/activation/autoscroll/filter/machine scope");

layoutTree={id:'root',children:[
  {id:'sidebar-views',children:[{id:'view-files'}]}, {id:'left2-views',children:[{id:'view-structure'}]},
  {id:'right-views',children:[{id:'view-review'}]}, {id:'right2-views',children:[{id:'view-search'}]},
  {id:'bottom-stack',children:[{id:'bottom-terminal'}]},
]};
const left=new mod.namespace.Stripe();left.init({side:'left'});
for (const edge of ['left','right']) {
  const stripe=new mod.namespace.Stripe();stripe.init({side:edge});
  const first=buttons.length;
  const rendered=stripe.render(cx), all=nodes(rendered);
  assert.ok(buttons.slice(first).filter(button=>button.id.startsWith('st-')).every(button=>button.side===edge),'both stripe sides declare their mirrored shell-facing fill alignment');
  assert.ok(all.some(node=>node.id===`stripe-${edge}-slots`),'upper and lower tool groups have a separator on each edge');
  assert.ok(!all.some(node=>node.calls.some(call=>['on_mouse_move','on_mouse_up'].includes(call[0]))),'tool stripes cannot start or finish a drag');
}
store['codenav.toolHidden']=['structure'];
assert.ok(!nodes(left.render(cx)).some(node=>node.id==='stripe-left-slots'),'hidden lower groups leave no orphan separator');
store['codenav.toolHidden']=[];
for (const side of ['left','right','left2','right2','bottom','editor']) {
  const bottom=new mod.namespace.IslandBottom();bottom.init({side});
  assert.ok(!nodes(bottom.render()).some(node=>node.calls.some(([name])=>name==='border_b')),'island foot never adds a bright seam above a neighboring island');
}
assert.doesNotMatch(source,/\b(?:beginDrag|takeDrag|advanceDrag|dragState|cancelDrag)\b/,'stripes no longer depend on a drag subsystem');
const projects=new mod.namespace.Projects();projects.init({},cx);projects.render(cx);
menus.at(-1).find(row=>row.id==='pj-open').action();
assert.equal(dispatched.at(-1)[0],'codenav.open-folder','closing project menu delegates picker work to the persistent view');
console.log('PASS drag removal, upper/lower separators on both edges, hidden groups and folder action routing');
const toolHeader=new mod.namespace.ToolHeader();
for(const status of ['working','idle','done','blocked']){
 const tab=toolHeader.tab({id:'agent-tab',name:'Task',status,active:false},{});
 const rotating=nodes(tab).filter(node=>node.calls.some(([name])=>name==='spin'));
 assert.equal(rotating.length,status==='working'?1:0,'only actual working state animates');
 if(rotating.length)assert.equal(rotating[0].type,'mods/codenav/idea-icons/progress.svg');
}
