// View-state and interaction regression checks. Native paint/IPC are not tested.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = name => fs.readFileSync(new URL(`../../mods/codenav/${name}`, import.meta.url), "utf8");
let context = { space: "local", cwd: "/project" };
let spaceList = [{ id: "local", folder: "/fallback", machine: null }];
const calls = [], pending = [], opened = [], runs = [], picked = [], clipboard = [], tasks = [];
let released = 0;
const focus = () => ({ focus() {}, is_focused() { return true; }, release() { released++; } });
const cx = {
  focus_handle: focus, notify() {}, stop_propagation() {}, sleep: async () => {},
  spawn(fn) { tasks.push(fn(cx)); }, write_to_clipboard(value) { clipboard.push(value); }, open_url() {},
};

function element(key = "") {
  const data = { elementId: key, nodes: [], attrs: {} };
  const proxy = new Proxy(data, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "then") return undefined;
      return (...args) => {
        if (key === "child") target.nodes.push(args[0]);
        else if (key === "children") target.nodes.push(...args[0]);
        else if (key === "when") { if (args[0]) args[1](proxy); }
        else target.attrs[key] = args;
        return proxy;
      };
    },
  });
  return proxy;
}
const text = node => typeof node === "string" ? node : (node.nodes ?? []).map(text).join("\n");
const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
});
class Menu {
  constructor() { this.focus = focus(); this.scroll = {}; this.at = 0; }
  release() { released++; }
  key() {}
}

const guide = new vm.SourceTextModule(source("lsp-install-guide.js"));
await guide.link(() => { throw Error("The guide model must remain pure"); });
await guide.evaluate();
const dependencies = {
  "gpui-kit": synthetic({ div: () => element() }),
  "gpui-base": synthetic({
    h_flex: () => element(), v_flex: () => element(),
    v_virtual_list: (id, count, _height, _key, render) => element(id).children(render({ start: 0, end: count })),
    Scrollbar: { vertical: id => element(id) },
  }),
  herdr: synthetic({
    focused: () => context, spaces: () => spaceList, window: () => ({ platform: "macos" }),
    pickFolder: () => new Promise(resolve => picked.push(resolve)), closeOverlay() {},
    openOverlay: props => opened.push(props), run: name => runs.push(name),
  }),
  "./idea-design.js": synthetic({
    MenuController: Menu, IDEA: { rowHeight: 22 }, uiSize: (size = 13) => size, uiColors: () => ({}),
    uiCaption: value => element().child(value), uiInputBox: child => element().child(child),
    uiListRow: (id, value) => element(id).child(value),
    uiButton: (id, label, action, options = {}) => Object.assign(element(id), { label, action: options.disabled ? null : action, options }),
    uiSettingsShell: (id, props) => Object.assign(element(id), { props }),
  }),
  "./common.js": synthetic({ codeFont: () => ({ family: "monospace" }) }),
  "./i18n.js": synthetic({ T: value => value }),
  "./lsp.js": synthetic({ lsp: (method, body) => {
    calls.push({ method, body });
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  } }),
  "./lsp-install-guide.js": guide,
};
const module = new vm.SourceTextModule(source("lsp-setup.js"));
await module.link(name => dependencies[name]);
await module.evaluate();
const { LspSetup, openLspSetup } = module.namespace;
const button = (view, id) => view.render().props.footer.find(item => item.elementId === id);

const view = new LspSetup();
view.init({ overlay: "test" }, cx);
assert.equal(view.render().props.width, 900);
assert.equal(view.render().props.height, 680);
assert.equal(button(view, "lsp-setup-check").options.disabled, true);
view.select("javascript", cx);
view.request("setup_status", cx);
assert.equal(JSON.stringify(calls[0]), JSON.stringify({ method: "setup_status", body: { lang: "typescript", root: "/project" } }));
view.select("go", cx);
pending.shift().resolve({ installed: true, running: true });
await tasks.shift();
assert.equal(view.status, null, "A previous language result cannot replace current state");
assert.equal(runs.length, 0, "A stale result cannot trigger editor retry");
view.request("setup_start", cx);
assert.equal(calls.length, 1, "Start requires an actual installed check");
view.request("setup_status", cx);
pending.shift().resolve({ installed: true, running: false });
await tasks.shift();
view.request("setup_start", cx);
view.request("setup_start", cx);
assert.equal(calls.length, 3, "Pending start cannot be duplicated");
pending.shift().resolve({ installed: true, running: true, command: ["gopls"], root: "/canonical/project" });
await tasks.shift();
assert.equal(view.status.running, true);
assert.equal(runs[0], "codenav.retry-lsp");
assert.equal(button(view, "lsp-setup-start").options.disabled, true, "Ready server is not restarted");
assert.match(text(view.result()), /Language server project: \/canonical\/project/);
assert.equal(view.root, "/project", "Backend root is displayed without silently changing the chosen root");

const handoff = view.guideText(guide.namespace.installationGuide("go", "macos"));
assert.match(handoff, /Language: Go/);
assert.match(handoff, /Platform: macos/);
assert.match(handoff, /Project folder: \/project/);
assert.match(handoff, /SDK version and the language server executable path/);
assert.match(handoff, /Do not leave an independent stdio language server running/);
assert.match(handoff, /Herdr Check Installation and Start LSP/);
assert.match(handoff, /actual result and any exact error/);
assert.match(handoff, /https:\/\//, "Official links remain in the handoff");
assert.equal(button(view, "lsp-setup-copy-guide").label, "Copy Guide for LLM");
view.copy("guide", handoff, cx);
assert.equal(clipboard[0], handoff);

view.chooseRoot(cx);
view.select("rust", cx);
picked.shift()("/stale");
await tasks.shift();
assert.equal(view.root, "/project", "Stale folder picker cannot change a newer context");
view.request("setup_status", cx);
view.release();
pending.shift().resolve({ installed: true, running: true });
await tasks.shift();
assert.equal(view.status, null, "Released view ignores pending results");
assert.equal(released, 2, "The focused language menu and its scroll owner are released");

context = { space: "remote", cwd: "/remote/path" };
spaceList = [{ id: "remote", folder: "/remote/root", machine: "remote" }];
const remote = new LspSetup();
remote.init({}, cx);
assert.equal(remote.root, "");
remote.request("setup_status", cx);
assert.equal(calls.length, 4, "A remote cwd is not submitted to the local setup engine");
remote.chooseRoot(cx);
picked.shift()("/local/project");
await tasks.shift();
assert.equal(remote.root, "/local/project");
remote.select("java", cx);
remote.request("setup_status", cx);
pending.shift().reject(new Error("missing SDK"));
await tasks.shift();
assert.equal(remote.error, "missing SDK");
assert.equal(remote.status, null);
remote.copy("guide", "LLM installation instructions", cx);
assert.equal(remote.error, "missing SDK", "Copying the guide does not hide the actual setup failure");
remote.request("setup_status", cx);
pending.shift().resolve({ installed: true });
await tasks.shift();
assert.equal(remote.status, null, "Malformed backend result cannot unlock Start");
assert.match(remote.error, /invalid LSP setup result/);
remote.dismiss();
assert.equal(remote.alive, false);
openLspSetup({ language: "java" });
assert.equal(opened[0].props.view, "lsp-setup");
assert.equal(opened[0].props.language, "java");
console.log("PASS LSP setup bounds, prerequisites, request races, lifecycle, local roots, LLM handoff, effective project and real backend result semantics (native UI/IPC not tested)");
