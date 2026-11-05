import { spaces, panes, terminals, machines, focused, run } from "herdr";
import { targets } from "./common.js";
import { diagnosticText } from "./diagnostic-model.js";
import { uiNotify } from "./idea-design.js";
import { T } from "./i18n.js";

let attaching = false;
const currentSpace = () => spaces().find(space => space.active);
const terminalMachine = terminal => terminal.includes("/") ? terminal.slice(0, terminal.indexOf("/")) : null;
const fail = error => {
  uiNotify({ title: T("Could not attach diagnostics"), body: String(error.message ?? error), level: "error", group: "codenav.general" });
  return false;
};

// Keep common's user-facing names/order, but never offer a shell or blocked agent.
export function diagnosticTargets() {
  const space = currentSpace();
  if (!space || !machines().some(machine => (machine.name ?? null) === (space.machine ?? null) && machine.layout === "ready")) return [];
  const allPanes = panes(), allTerminals = terminals();
  return targets().filter(target => {
    const pane = allPanes.find(p => p.pane === target.pane && p.terminal === target.terminal);
    const terminal = allTerminals.find(t => t.address === target.terminal);
    return target.agent && pane && terminalMachine(target.terminal) === (space.machine ?? null)
      && space.tabs.some(tab => tab.id === pane.tab)
      && !pane.program?.shell && Boolean(pane.program?.agent || pane.status)
      && !["blocked", "error"].includes(pane.status)
      && (!terminal || terminal.state === "live")
      && !["blocked", "error"].includes(terminal?.status);
  }).map(target => ({ ...target, space: space.id, on: space.machine ?? null }));
}

function textFor(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error(T("No diagnostics to copy or attach."));
  if (entries.some(entry => !entry?.path || !entry.diagnostic)) throw new Error(T("Diagnostic context is missing."));
  return diagnosticText(entries);
}

export function copyDiagnostics(entries, cx) {
  try {
    cx.write_to_clipboard(textFor(entries));
    uiNotify({ title: T("Diagnostics copied"), level: "success", timeout: 3000, group: "codenav.general" });
    return true;
  } catch (error) {
    uiNotify({ title: T("Could not copy diagnostics"), body: String(error.message ?? error), level: "error", group: "codenav.general" });
    return false;
  }
}

function validate(entries, target, snapshot) {
  const space = currentSpace();
  if (!space || !snapshot || space.id !== snapshot.space || (space.machine ?? null) !== snapshot.on)
    throw new Error(T("The workspace changed. Choose an AI again."));
  if (entries.some(entry => (entry.on ?? null) !== snapshot.on))
    throw new Error(T("Diagnostics and AI must be on the same machine."));
  const live = diagnosticTargets().find(item => item.terminal === target?.terminal && item.pane === target.pane && item.tab.id === target.tab?.id);
  if (!live || target.space !== snapshot.space || (target.on ?? null) !== snapshot.on)
    throw new Error(T("The selected AI is unavailable. Choose an AI again."));
}

export function attachDiagnostics(entries, target, cx) {
  if (attaching) return fail(new Error(T("A diagnostic attachment is already in progress.")));
  try {
    const text = textFor(entries);
    const space = currentSpace();
    const snapshot = space ? { space: space.id, on: space.machine ?? null } : null;
    validate(entries, target, snapshot);
    // Snapshot mutable caller data before yielding to the host.
    const selection = { ...target, tab: { id: target.tab.id } };
    const entryMachines = entries.map(entry => ({ on: entry.on ?? null }));
    attaching = true;
    return cx.spawn(async taskCx => {
      try {
        validate(entryMachines, selection, snapshot);
        taskCx.write_to_clipboard(text);
        run("pane.focus", { terminal: selection.terminal });
        await taskCx.sleep(150);
        validate(entryMachines, selection, snapshot);
        const focus = focused();
        if (!focus || focus.space !== snapshot.space || focus.tab !== selection.tab.id
          || focus.terminal !== selection.terminal || (focus.shown && focus.shown !== selection.terminal))
          throw new Error(T("Focus changed before attachment. Choose the AI again."));
        if (taskCx.read_from_clipboard() !== text)
          throw new Error(T("The clipboard changed before attachment. Try again."));
        // Native paste is focus-based; keep final checks and dispatch synchronous.
        // Never run hc send, a keypress, or an Enter/submit command here.
        run("terminal.paste");
        uiNotify({ title: T("Diagnostics pasted to {name}", { name: selection.name }), body: T("Review the AI input before sending."), level: "success", timeout: 3000, group: "codenav.general" });
      } catch (error) { fail(error); }
      finally { attaching = false; taskCx.notify(); }
    });
  } catch (error) { attaching = false; return fail(error); }
}
