// UI coordination only. The status view owns attachment tasks after a popup
// closes, so the picker/card's lifetime cannot cancel a draft paste midway.
import { openOverlay, closeOverlay, run, spaces } from "herdr";
import { T } from "./i18n.js";
import { uiNotify, MenuController, uiMenu, uiPopupSize } from "./idea-design.js";
import { toolImage } from "./ideaicons.js";
import { copyDiagnostics, attachDiagnostics, diagnosticTargets } from "./diagnostic-actions.js";

const matchingTargets = entries => diagnosticTargets().filter(target => entries.every(entry => (entry.on ?? null) === target.on));
const currentSpace = () => spaces().find(space => space.active)?.id;
export const canAttachDiagnostics = entries => Boolean(entries.length && matchingTargets(entries).length);

export function requestDiagnosticAttachment(entries, space = currentSpace(), target) {
  try { run(`codenav.attach-diagnostics:${JSON.stringify({ entries, space, target })}`); }
  catch (error) { uiNotify({ title: T("Could not attach diagnostics"), body: String(error.message ?? error), level: "error" }); }
}

export function diagnosticCardOptions(entries, { attachable = canAttachDiagnostics(entries), space = currentSpace() } = {}) {
  const first = entries[0];
  return {
    path: first ? `${first.on ? first.on + ":" : ""}${first.path}:${(first.diagnostic.line ?? 0) + 1}:${(first.diagnostic.col ?? 0) + 1}` : "",
    actions: [
      { id: "copy", label: T("Copy"), action: (_event, cx) => copyDiagnostics(entries, cx) },
      { id: "attach", label: T("Attach to AI"), disabled: !attachable, action: () => requestDiagnosticAttachment(entries, space) },
    ],
  };
}

export function handleDiagnosticAttachment({ entries, target, space }, cx) {
  if (space !== currentSpace()) {
    uiNotify({ title: T("The workspace changed. Choose an AI again."), level: "warning" }); return;
  }
  if (!Array.isArray(entries) || !entries.length) {
    uiNotify({ title: T("No diagnostics to copy or attach."), level: "warning" }); return;
  }
  if (target) return attachDiagnostics(entries, target, cx);
  const candidates = matchingTargets(entries);
  if (!candidates.length) {
    uiNotify({ title: T("No available AI in this workspace."), level: "warning" }); return;
  }
  if (candidates.length === 1) return attachDiagnostics(entries, candidates[0], cx);
  openOverlay({ mod: "codenav", props: { view: "diagnostic-targets", entries, space }, kind: "popup", frame: "none",
    ...uiPopupSize(candidates.length + 2, { width: 320, maxHeight: 360 }) });
}

export class DiagnosticTargets {
  init(props, cx) {
    this.entries = Array.isArray(props?.entries) ? props.entries : []; this.overlay = props?.overlay; this.space = props?.space;
    this.menu = new MenuController(cx, 2); this.menu.focus.focus();
  }
  release() { this.menu.release(); this.menu.focus.release(); }
  render(cx) {
    const candidates = this.space === currentSpace() ? matchingTargets(this.entries) : [];
    const rows = [{ id: "title", label: T("Attach diagnostics to AI"), disabled: true }, { separator: true },
      ...(candidates.length ? candidates.map(target => ({ id: target.terminal, label: target.name,
        icon: () => toolImage("services", 16), action: () => requestDiagnosticAttachment(this.entries, this.space, { ...target, tab: { id: target.tab.id } }) }))
        : [{ id: "unavailable", label: T("No available AI in this workspace."), disabled: true }])];
    return uiMenu("diagnostic-targets", rows, this.menu, cx, { width: 320, maxHeight: 360, onClose: () => closeOverlay(this.overlay) });
  }
}
