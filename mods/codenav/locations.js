// Recent Locations stores coordinates and symbol names, never source text.
// Status calls this during render; all shared writes happen in the timer.
import { shared, setShared } from "herdr";
import { editorSpec, editorKey } from "./common.js";

const KEY = "codenav.locations", QUIET = 500, COALESCE = 2000, LIMIT = 100;

function currentLocation() {
  const key = editorKey(), spec = editorSpec(), caret = shared("codenav.caret");
  if (!key || spec?.kind !== "file" || !caret || caret.path !== spec.path) return null;
  const on = spec.on ?? null;
  if (Object.hasOwn(caret, "on") && (caret.on ?? null) !== on) return null;
  if (!Number.isInteger(caret.line) || caret.line < 0 || !Number.isInteger(caret.col) || caret.col < 0) return null;
  const scope = Array.isArray(caret.scope) ? caret.scope.filter((s) => typeof s === "string").slice(-20) : [];
  return { key, value: { path: spec.path, on, line: caret.line, col: caret.col, scope } };
}
const identity = (entry) => entry && JSON.stringify([entry.key, entry.value]);
const sameFile = (a, b) => a.path === b.path && (a.on ?? null) === (b.on ?? null);

export function recordLocation(self, cx) {
  const entry = currentLocation(), id = identity(entry);
  if (!entry) { self.locationPending = null; self.locationObserved = null; return; }
  if (id !== self.locationObserved) {
    self.locationObserved = id;
    self.locationPending = entry;
    self.locationChanged = Date.now();
  }
  if (!self.locationPending || self.locationTimer) return;
  self.locationTimer = true;
  cx.timer.after(QUIET, (cx) => {
    self.locationTimer = false;
    const pending = self.locationPending;
    // Recheck both project and caret after the delay; never save a stale view.
    if (!pending || identity(currentLocation()) !== identity(pending)) { self.locationPending = null; return; }
    if (Date.now() - self.locationChanged < QUIET) { recordLocation(self, cx); return; }
    self.locationPending = null;
    const all = shared(KEY) ?? {}, previous = Array.isArray(all[pending.key]) ? all[pending.key] : [];
    const value = { ...pending.value, at: Date.now() };
    let list = previous.filter((p) => !(sameFile(p, value) && p.line === value.line));
    // Nearby caret movement in the same file updates the most recent stop.
    if (list[0] && sameFile(list[0], value) && value.at - list[0].at < COALESCE) list = list.slice(1);
    setShared(KEY, { ...all, [pending.key]: [value, ...list].slice(0, LIMIT) });
  });
}
