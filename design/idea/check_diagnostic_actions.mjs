// Run: node --experimental-vm-modules design/idea/check_diagnostic_actions.mjs
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const context = vm.createContext({ console });
let space, paneList, terminalList, machineList, focus, clipboard, afterSleep;
const calls = [], notices = [], tasks = [];
const cx = {
  write_to_clipboard(text) { clipboard = text; calls.push(["clipboard", text]); },
  read_from_clipboard() { return clipboard; },
  spawn(task) { const pending = Promise.resolve().then(() => task(cx)); tasks.push(pending); return pending; },
  async sleep(ms) { assert.equal(ms, 150); afterSleep?.(); },
  notify() {},
};
const overrides = {
  spaces: () => space ? [space] : [], panes: () => paneList, terminals: () => terminalList,
  machines: () => machineList, focused: () => focus,
  targets: () => paneList.map(p => ({ terminal: p.terminal, pane: p.pane, agent: Boolean(p.status || p.program?.agent), name: p.title, tab: space?.tabs.find(t => t.id === p.tab), focused: p.focused })).filter(t => t.tab),
  run(command, args) {
    calls.push([command, args]);
    if (command === "pane.focus") {
      const pane = paneList.find(p => p.terminal === args.terminal);
      focus = { space: space.id, tab: pane.tab, terminal: args.terminal, pane: pane.pane, shown: null };
    }
  },
  uiNotify: note => notices.push(note),
  T: (text, args = {}) => text.replace(/\{(\w+)\}/g, (_, key) => args[key] ?? key),
};
const model = new vm.SourceTextModule(await readFile(new URL("../../mods/codenav/diagnostic-model.js", import.meta.url), "utf8"), { context });
await model.link(() => { throw Error("Pure model must not import host APIs"); });
await model.evaluate();
const source = await readFile(new URL("../../mods/codenav/diagnostic-actions.js", import.meta.url), "utf8");
const actions = new vm.SourceTextModule(source, { context });
await actions.link(id => {
  if (id === "./diagnostic-model.js") return model;
  const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter(match => match[2] === id).flatMap(match => match[1].split(",").map(name => name.trim()));
  return new vm.SyntheticModule(names, function () { names.forEach(name => { assert.ok(overrides[name], name); this.setExport(name, overrides[name]); }); }, { context });
});
await actions.evaluate();
const { diagnosticText, diagnosticKey } = model.namespace;
const { diagnosticTargets, copyDiagnostics, attachDiagnostics } = actions.namespace;
const reset = () => {
  space = { id: "one", active: true, machine: null, tabs: [{ id: "tab-one", active: true }] };
  paneList = [{ terminal: "ai", pane: "pane-ai", tab: "tab-one", title: "AI", status: "idle", program: { agent: true, shell: false } }];
  terminalList = [{ address: "ai", state: "live", status: "idle" }];
  machineList = [{ name: null, layout: "ready" }];
  focus = { space: "one", tab: "tab-one", terminal: null, pane: null, shown: null };
  clipboard = "original clipboard"; afterSleep = null; calls.length = 0; notices.length = 0;
};
const entries = [{ path: "/repo/한글 file.js", on: null, root: "/repo", diagnostic: {
  line: 4, col: 9, end_line: 7, end_col: 2, severity: "error", source: "typescript", code: 0,
  message: "First line\n  nested detail\r\n끝\n" + "x".repeat(200000),
} }];
const text = diagnosticText(entries);
assert.ok(text.includes("Machine: local\nPath: /repo/한글 file.js\nRoot: /repo\nLocation: 5:10–8:3"));
assert.ok(text.includes("Source: typescript\nCode: 0\nMessage:\n"));
assert.ok(text.endsWith(entries[0].diagnostic.message), "message bytes, indentation and all lines preserved");
assert.equal(diagnosticKey(entries[0]), diagnosticKey(JSON.parse(JSON.stringify(entries[0]))));
assert.notEqual(diagnosticKey(entries[0]), diagnosticKey({ ...entries[0], on: "remote" }));
assert.notEqual(diagnosticKey(entries[0]), diagnosticKey({ ...entries[0], diagnostic: { ...entries[0].diagnostic, end_col: 3 } }));
assert.equal(diagnosticText([entries[0], entries[0]]), `${text}\n\n${text}`, "all diagnostics preserved including duplicates");
assert.ok(diagnosticText([{ ...entries[0], on: "remote" }]).startsWith("Machine: remote"));

reset();
assert.equal(copyDiagnostics(entries, cx), true);
assert.equal(clipboard, text);
assert.equal(calls.length, 1, "copy uses only native clipboard, no subprocess or terminal command");
assert.equal(copyDiagnostics([], cx), false);
assert.equal(notices.at(-1).level, "error");
reset();
assert.equal(diagnosticTargets()[0].terminal, "ai");
paneList.push({ terminal: "shell", pane: "shell-pane", tab: "tab-one", title: "shell", program: { shell: true }, status: null });
assert.equal(diagnosticTargets().length, 1, "shell is never an attachment target");
paneList.push({ ...paneList[0], terminal: "second", pane: "second-pane" });
assert.equal(diagnosticTargets().length, 2, "UI coordinator receives both eligible AIs for explicit choice");
paneList[0].status = "blocked";
assert.equal(diagnosticTargets().length, 1);
paneList[2].status = "error";
assert.equal(diagnosticTargets().length, 0);
assert.equal(attachDiagnostics(entries, null, cx), false);
assert.equal(calls.length, 0, "no agent cannot overwrite clipboard/focus");

reset();
await attachDiagnostics(entries, diagnosticTargets()[0], cx);
assert.deepEqual(calls.map(call => call[0]), ["clipboard", "pane.focus", "terminal.paste"]);
assert.equal(clipboard, text);
assert.ok(calls.every(call => !/send|enter|keypress|exec/i.test(call[0])), "attachment never submits");

for (const [label, change] of [
  ["space", () => { space.id = "two"; }],
  ["machine", () => { space.machine = "remote"; }],
  ["removed target", () => { paneList = []; }],
  ["moved pane", () => { paneList[0].pane = "new-pane"; }],
  ["moved tab", () => { paneList[0].tab = "another-tab"; }],
  ["blocked target", () => { paneList[0].status = "blocked"; }],
  ["error target", () => { terminalList[0].status = "error"; }],
  ["exited target", () => { terminalList[0].state = "exited"; }],
  ["shell replacement", () => { paneList[0].program = { shell: true, agent: false }; }],
  ["offline machine", () => { machineList[0].layout = "unavailable"; }],
  ["terminal focus", () => { focus.terminal = "shell"; }],
  ["tab focus", () => { focus.tab = "another-tab"; }],
  ["replacement focus", () => { focus.shown = "shell"; }],
  ["clipboard", () => { clipboard = "user copied something else"; }],
]) {
  reset(); afterSleep = change;
  await attachDiagnostics(entries, diagnosticTargets()[0], cx);
  assert.equal(calls.some(call => call[0] === "terminal.paste"), false, `${label} change cancels paste`);
  assert.equal(notices.at(-1).level, "error", `${label} failure is visible`);
}
reset();
const staleTarget = diagnosticTargets()[0]; space.id = "two";
assert.equal(attachDiagnostics(entries, staleTarget, cx), false);
assert.equal(calls.length, 0);
reset();
assert.equal(attachDiagnostics([{ ...entries[0], on: "remote" }], diagnosticTargets()[0], cx), false);
assert.equal(calls.length, 0, "machine mismatch fails before clipboard/focus");
reset();
paneList[0].terminal = "remote/ai";
assert.equal(diagnosticTargets().length, 0, "terminal address machine must match current space");
reset();
space.machine = "remote"; paneList[0].terminal = "remote/ai";
terminalList[0].address = "remote/ai"; machineList = [{ name: "remote", layout: "ready" }];
await attachDiagnostics([{ ...entries[0], on: "remote" }], diagnosticTargets()[0], cx);
assert.equal(calls.at(-1)[0], "terminal.paste", "same-machine remote AI can receive draft paste");
assert.ok(clipboard.startsWith("Machine: remote"));
reset();
const pending = attachDiagnostics(entries, diagnosticTargets()[0], cx);
assert.equal(attachDiagnostics(entries, diagnosticTargets()[0], cx), false, "overlapping attachment blocked");
await pending;
assert.equal(calls.filter(call => call[0] === "terminal.paste").length, 1);
reset();
const task = attachDiagnostics(entries, diagnosticTargets()[0], cx);
space.id = "two";
await task;
assert.equal(calls.length, 0, "space change before async task starts cannot overwrite clipboard");
await Promise.all(tasks);
console.log("PASS diagnostic model fidelity, native copy, AI-only targeting, explicit multiple choice, no submit, stale workspace/machine/target/focus/clipboard and busy guards");
