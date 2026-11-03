// Per-space layout: Herdr keeps one layout state for every space, so this
// remembers how each space left the window (editor area open or not, review
// or editor, sidebar view, terminal panel, sizes, editor above or beside the
// terminal) and puts it back when the space shows again. Kept in shared
// "codenav.spaces".
import { spaces, layout, shared, setShared, run } from "herdr";
import { find, AREA, STACK, CHILD, editorSpec, wantedChild, splitDir, setSplit } from "./common.js";

const KEY = "codenav.spaces";
const SIDEBAR = "sidebar-views";
const PANEL = "terminal-panel";

function snapshot() {
  const l = layout();
  const node = (id) => find(l, id);
  return {
    area: !node(AREA)?.hidden,
    panel: !node(PANEL)?.hidden,
    sidebar: node(SIDEBAR)?.active ?? null,
    review: shared("codenav.area") === "review",
    areaWeight: node(AREA)?.size?.weight ?? null,
    panelWeight: node(PANEL)?.size?.weight ?? null,
    split: splitDir(),
  };
}

function apply(s) {
  const l = layout();
  const node = (id) => find(l, id);
  // A space seen for the first time: the editor area shows only if it has a file open.
  s = s ?? { area: Boolean(editorSpec()), panel: true, review: false };
  if (Boolean(shared("codenav.area") === "review") !== Boolean(s.review)) setShared("codenav.area", s.review ? "review" : null);
  const show = (id, on) => { if (node(id) && Boolean(node(id).hidden) === Boolean(on)) run(on ? "layout.show" : "layout.hide", { id }); };
  show(AREA, s.area);
  show(PANEL, s.panel || !s.area);
  if (s.sidebar && node(SIDEBAR) && node(SIDEBAR).active !== s.sidebar) run("layout.select", { stack: SIDEBAR, child: s.sidebar });
  if (s.areaWeight && node(AREA)?.size?.weight !== s.areaWeight) run("layout.resize", { id: AREA, weight: s.areaWeight });
  if (s.panelWeight && node(PANEL)?.size?.weight !== s.panelWeight) run("layout.resize", { id: PANEL, weight: s.panelWeight });
  const want = s.review ? CHILD.review : wantedChild();
  if (node(STACK) && node(STACK).active !== want) run("layout.select", { stack: STACK, child: want });
  // Last: it replaces the tree, so it takes everything above with it.
  if (s.split && s.split !== splitDir()) setSplit(s.split);
}

// Called on every render of an always-shown copy: notices the space switch,
// saves the old space's layout and restores the new one's.
export function followSpace(self, cx) {
  if (!find(layout(), STACK)) return;
  const space = spaces().find((s) => s.active)?.id ?? null;
  if (space === self.memorySpace) {
    // Keep the shown space's entry current, so a restart or a closed space loses nothing.
    if (space) self.memoryLast = snapshot();
    return;
  }
  const prev = self.memorySpace, last = self.memoryLast;
  self.memorySpace = space;
  if (prev === undefined) return; // the first render: nothing to restore yet
  cx.timer.after(0, () => {
    const all = { ...(shared(KEY) ?? {}) };
    if (prev && last) all[prev] = last;
    const live = new Set(spaces().map((s) => s.id));
    for (const k of Object.keys(all)) if (!live.has(k)) delete all[k];
    setShared(KEY, all);
    apply(space ? all[space] : null);
    self.memoryLast = snapshot();
  });
}
