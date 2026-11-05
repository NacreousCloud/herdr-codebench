import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const calls = [], notices = [], overlays = [], copied = [], attached = [];
let available = [], released = 0, activeSpace = "one", nativeLookups = 0, targetLookups = 0;
const context = vm.createContext({ console });
const statusCx = { owner: "persistent-status" }, popupCx = { owner: "temporary-popup" };
const values = {
  run: command => calls.push(command), openOverlay: options => overlays.push(options), closeOverlay: id => calls.push(["close", id]),
  spaces: () => { nativeLookups++; return [{ id: activeSpace, active: true }]; },
  T: text => text, uiNotify: note => notices.push(note), toolImage: () => ({ native: true }),
  diagnosticTargets: () => { nativeLookups++; targetLookups++; return available; },
  copyDiagnostics: (entries, cx) => copied.push({ entries, cx }), attachDiagnostics: (entries, target, cx) => attached.push({ entries, target, cx }),
  MenuController: class { constructor() { this.focus = { focus() {}, release() { released++; } }; } release() { released++; } },
  uiPopupSize: () => ({ width: 320, height: 180 }), uiMenu: (id, rows, menu, cx, options) => ({ id, rows, menu, cx, options }),
};
const source = await readFile(new URL("../../mods/codenav/diagnostics.js", import.meta.url), "utf8");
const module = new vm.SourceTextModule(source, { context });
await module.link(id => {
  const names = [...new Set([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter(match => match[2] === id).flatMap(match => match[1].split(",").map(name => name.trim())))];
  return new vm.SyntheticModule(names, function () { for (const name of names) { assert.ok(values[name], name); this.setExport(name, values[name]); } }, { context });
});
await module.evaluate();
const { diagnosticCardOptions, handleDiagnosticAttachment, requestDiagnosticAttachment, DiagnosticTargets } = module.namespace;
const entry = { path: "/repo/Example.ts", on: null, diagnostic: { line: 2, col: 3, code: 2769, message: "No overload matches this call.\n  Nested explanation <T>" } };
const target = id => ({ terminal: id, pane: `pane-${id}`, name: id, tab: { id: `tab-${id}`, name: "AI tab" }, space: "one", on: null });
available = [target("ai-one")];
const card = diagnosticCardOptions([entry]);
const lookups = nativeLookups;
diagnosticCardOptions([entry], { attachable: true, space: "one" });
assert.equal(nativeLookups, lookups, "rendered diagnostic spans reuse the frame's native target snapshot");
assert.equal(card.path, "/repo/Example.ts:3:4");
card.actions[0].action({}, popupCx); assert.equal(copied[0].entries[0].diagnostic.message, entry.diagnostic.message);
card.actions[1].action({}, popupCx);
assert.equal(attached.length, 0, "closing a card cannot cancel work because the card never owns attachment tasks");
const command = calls.at(-1); assert.ok(command.startsWith("codenav.attach-diagnostics:"));
let beforeTargets = targetLookups;
handleDiagnosticAttachment(JSON.parse(command.slice("codenav.attach-diagnostics:".length)), statusCx);
assert.equal(targetLookups, beforeTargets + 1, "one candidate snapshot decides direct attachment");
assert.equal(attached.at(-1).cx, statusCx);
assert.equal(attached.at(-1).target.terminal, "ai-one");
available.push(target("ai-two"));
beforeTargets = targetLookups;
handleDiagnosticAttachment({ entries: [entry], space: "one" }, statusCx);
assert.equal(targetLookups, beforeTargets + 1, "one candidate snapshot decides and sizes the picker");
assert.equal(overlays.at(-1).props.view, "diagnostic-targets");
const chooser = new DiagnosticTargets(); chooser.init({ entries: [entry], overlay: "picker", space: "one" }, {});
const menu = chooser.render(popupCx);
assert.ok(menu.rows.slice(2).every(row => typeof row.icon === "function"), "deferred rows construct their native icons on demand");
menu.options.onClose(); menu.rows[3].action();
const selected = JSON.parse(calls.at(-1).slice("codenav.attach-diagnostics:".length));
assert.equal(selected.target.space, "one"); assert.equal(selected.target.on, null);
assert.deepEqual(Object.keys(selected.target.tab), ["id"]);
handleDiagnosticAttachment(selected, statusCx);
assert.equal(attached.at(-1).target.terminal, "ai-two"); assert.equal(attached.at(-1).cx, statusCx);
chooser.release(); assert.equal(released, 2);
available = [];
assert.equal(diagnosticCardOptions([entry]).actions[1].disabled, true);
handleDiagnosticAttachment({ entries: [entry], space: "one" }, statusCx); assert.equal(notices.at(-1).title, "No available AI in this workspace.");
handleDiagnosticAttachment({ entries: [], space: "one" }, statusCx); assert.equal(notices.at(-1).title, "No diagnostics to copy or attach.");
activeSpace = "another";
const before = attached.length;
handleDiagnosticAttachment(selected, statusCx);
assert.equal(attached.length, before, "changing workspace while choosing an AI cancels the original attachment");
assert.equal(notices.at(-1).title, "The workspace changed. Choose an AI again.");
requestDiagnosticAttachment([entry]); assert.equal(JSON.parse(calls.at(-1).slice("codenav.attach-diagnostics:".length)).entries[0].diagnostic.message, entry.diagnostic.message);
console.log("PASS diagnostic card copy/attach, full payload, persistent attachment owner, explicit AI chooser, deferred icons and unavailable states");
