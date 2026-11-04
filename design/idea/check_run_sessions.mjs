// Run: node --experimental-vm-modules design/idea/check_run_sessions.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../../mods/codenav/run.js", import.meta.url), "utf8");
const context = vm.createContext({ console, Date, Math });
const store = {}, sends = [], commands = [], notices = [];
let space = { id: "one", active: true, folder: "/repo", tabs: [{ id: "t1", name: "▶ App" }] };
let panes = [{ tab: "t1", terminal: "term1", program: { shell: true } }];
const overrides = {
  shared: key => store[key], setShared: (key, value) => { store[key] = value; },
  spaces: () => [space], panes: () => panes, isIdea: () => true,
  run: (name, args) => { commands.push([name, args]); if (name === "tab.new") { space.tabs.push({ id: "new-tab", name: args.name }); panes.push({ tab: "new-tab", terminal: "new-terminal", program: { shell: true } }); } },
  hc: async args => { sends.push(args); return { code: 0 }; },
  uiNotify: note => notices.push(note), T: text => text, openOverlay: () => "confirm",
  InputState: { new: () => ({ set_value() {}, on() {}, focus() {} }) },
};
const mod = new vm.SourceTextModule(source, { context });
await mod.link(id => {
  const names = [...new Set([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter(match => match[2] === id).flatMap(match => match[1].split(",").map(name => name.trim().split(/\s+as\s+/)[0])))];
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, overrides[name] ?? (() => {})); }, { context });
});
await mod.evaluate();
const api = mod.namespace;
const legacy = { name: "App", command: "echo app", futureField: 42 };
store["codenav.run"] = { ":/repo": { configs: [legacy], selected: 0, future: true } };
assert.equal(api.configTab(legacy).id, "t1", "unique pre-ID configuration adopts its existing terminal");
const config = new api.RunConfigs();
config.init({}, { focus_handle: () => ({ focus() {} }) });
const id = config.configs[0].id;
assert.ok(id); assert.equal(store["codenav.run"][":/repo"].configs[0].id, undefined, "opening/cancelling configuration UI does not persist migration");
config.configs[0].name = "Renamed"; config.apply();
const saved = api.runStore().configs[0];
assert.equal(saved.futureField, 42); assert.equal(api.runStore().future, true);
assert.equal(api.configTab(saved).id, "t1", "renaming a migrated configuration keeps its pre-existing terminal");
await api.runConfig(saved);
assert.equal(sends.at(-1)[1], "term1");
const firstSession = store["codenav.runSessions"][":/repo@one"][id];
assert.equal(firstSession.tab, "t1"); assert.equal(firstSession.terminal, "term1");
space.tabs[0].name = "user renamed terminal";
assert.equal(api.configTab(saved).id, "t1", "terminal attachment uses ID after adoption, not its display name");
await api.runConfig(saved);
assert.notEqual(store["codenav.runSessions"][":/repo@one"][id].executionId, firstSession.executionId);
const fresh = { id: "fresh", name: "App", command: "echo fresh" };
space.tabs[0].name = "▶ App";
assert.equal(api.configTab(fresh), null, "a new same-name configuration cannot capture another configuration's terminal");
await api.runConfig(fresh);
assert.equal(sends.at(-1)[1], "new-terminal");
assert.equal(store["codenav.runSessions"][":/repo@one"].fresh.tab, "new-tab");
config.add(true); assert.notEqual(config.configs.at(-1).id, id); assert.equal(config.configs.at(-1).legacyTabName, undefined);

panes[0].program.shell = false;
api.runConfig(saved);
assert.equal(store["codenav.runPending"].space, "one");
const sent = sends.length;
space = { id: "two", active: true, folder: "/repo", tabs: [] };
await api.restartPending();
assert.equal(sends.length, sent, "restart confirmation cannot send into the previous workspace after switching spaces");
assert.equal(notices.at(-1).title, "Run cancelled");
assert.equal(api.configTab(saved), null);
console.log("PASS run configuration IDs, staged migration, rename/copy, native terminal preservation, execution sessions, same-name isolation and workspace guards");
