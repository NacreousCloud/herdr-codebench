// The strip above the editor area: one tab per open file and per reviewed file,
// like VS Code's editor tabs, kept per space in shared "codenav.tabs". It also
// keeps the editor stack on the right child: the code view for source files,
// the activity editor for pictures, PDFs and edits, or the review.
// Right-click a tab for Close / Close Others / Close All; Cmd+W in the code
// view closes the shown tab (the status item takes the command).
// Back / forward (Ctrl+- / Ctrl+Shift+-) walk the tabs shown before, per space: the
// last 10, skipping tabs closed since; the arrows at the strip's start do the same.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared, setShared, layout, run, spaces, openOverlay, closeOverlay, props } from "herdr";
import { icon, iconButton, find, STACK, AREA, editorSpec, editorKey, setEditorSpec, wantedChild, showReview, basename, location } from "./common.js";
import { ideaImage } from "./ideaicons.js";
import { IDEA, isIdea, uiSize, ideaUI, popupSurface, uiTab, uiMenu, uiPopupSize, MenuController } from "./idea-design.js";

const KEY = "codenav.tabs";
const MAX = 20;
const fileId = (s) => `f:${s.on ?? ""}:${s.path}`;
const reviewId = (r) => `r:${r.rkey}:${r.path}`;

// -- the open tabs of the shown space ----------------------------------------------
const tabsNow = () => (shared(KEY) ?? {})[editorKey()] ?? [];
// Reviews only belong to the repository currently shown by this space.
const visibleTabs = () => {
  const { cwd, on } = location();
  return tabsNow().filter((x) => {
    if (x.type !== "review") return true;
    const at = x.rkey.indexOf(":"), host = x.rkey.slice(0, at), root = x.rkey.slice(at + 1);
    return host === (on ?? "") && Boolean(cwd) && (cwd + "/").startsWith(root + "/");
  });
};
function setTabs(list) {
  const all = { ...(shared(KEY) ?? {}) };
  all[editorKey()] = list.slice(-MAX);
  setShared(KEY, all);
}
const reviewing = () => shared("codenav.area") === "review";
// The reviewed file, if it belongs to the shown space (each space has its own repository).
function current() {
  const r = shared("codenav.review.current");
  return r && r.space === spaces().find((s) => s.active)?.id ? r : null;
}
function activeId() {
  if (reviewing()) { const r = current(); return r?.path ? reviewId(r) : null; }
  const s = editorSpec();
  return s ? fileId(s) : null;
}

function openTab(tab) {
  if (tab.type === "file") {
    if (reviewing()) setShared("codenav.area", null);
    const cur = editorSpec();
    if (!cur || fileId(cur) !== tab.id) setEditorSpec(editorKey(), tab.spec);
    return;
  }
  const all = { ...(shared("codenav.reviews") ?? {}) };
  if (all[tab.rkey]?.selected !== tab.path) { all[tab.rkey] = { ...all[tab.rkey], selected: tab.path }; setShared("codenav.reviews", all); }
  showReview();
}

// Closes the tabs with these ids; when the shown one goes, its neighbour shows,
// and with none left the editor area goes away.
function closeTabs(ids) {
  const list = tabsNow(), gone = new Set(ids), active = activeId();
  const at = list.findIndex((x) => x.id === active);
  const rest = list.filter((x) => !gone.has(x.id));
  setTabs(rest);
  // The editor's file goes with its tab, or the strip would bring the tab back.
  const spec = editorSpec();
  if (spec && gone.has(fileId(spec))) setEditorSpec(editorKey(), null);
  if (!gone.has(active)) return;
  const next = rest.find((x, i) => i >= at) ?? rest[rest.length - 1];
  if (next) return openTab(next);
  setEditorSpec(editorKey(), null);
  if (reviewing()) setShared("codenav.area", null);
  run("layout.hide", { id: AREA });
}
// Cmd+Shift+] / Cmd+Shift+[ (and Ctrl+→ / Ctrl+←): the editor tab beside the shown one.
export function stepTab(dir) {
  const list = tabsNow(), at = list.findIndex((x) => x.id === activeId());
  if (list.length) openTab(list[(at + dir + list.length) % list.length]);
}
export const closeTab = (id) => closeTabs([id ?? activeId()].filter(Boolean));
const closeOthers = (id) => { const keep = tabsNow().find((x) => x.id === id); closeTabs(tabsNow().filter((x) => x.id !== id).map((x) => x.id)); if (keep) openTab(keep); };
const closeAll = () => closeTabs(tabsNow().map((x) => x.id));

// -- where the space's tabs have been: shared "codenav.history" ----------------------------
const HISTORY = 10;
const historyNow = () => (shared("codenav.history") ?? {})[editorKey()] ?? { list: [], at: -1 };
function setHistory(h) { setShared("codenav.history", { ...(shared("codenav.history") ?? {}), [editorKey()]: h }); }
// A tab that shows becomes the newest place, dropping the places ahead of it.
function noteShown(tab) {
  const h = historyNow();
  if (h.list[h.at]?.id === tab.id) return false;
  if (h.going && Date.now() - h.going < 1500) return false;
  const list = [...h.list.slice(0, h.at + 1).filter((x) => x.id !== tab.id), tab].slice(-HISTORY);
  setHistory({ list, at: list.length - 1 });
  return true;
}
// The nearest place that way whose tab is still open, or -1.
function nextOpen(h, dir) {
  const open = new Set(tabsNow().map((x) => x.id));
  for (let i = h.at + dir; i >= 0 && i < h.list.length; i += dir) if (open.has(h.list[i].id)) return i;
  return -1;
}
function step(dir) {
  const h = historyNow(), i = nextOpen(h, dir);
  if (i < 0) return;
  // Until it shows (a review tab takes a moment), what shows isn't a new place.
  setHistory({ ...h, at: i, going: Date.now() });
  openTab(h.list[i]);
}
export const tabBack = () => step(-1);
export const tabForward = () => step(1);
export const canStep = (dir) => nextOpen(historyNow(), dir) >= 0;

export default class Tabs {
  init() {}

  // What the sidebar opened becomes a tab; opening a file while the review
  // shows goes back to the editor; the stack follows.
  route(cx) {
    const spec = editorSpec();
    const at = spec?.at ?? 0;
    if (this.lastAt !== undefined && at > this.lastAt && reviewing()) setShared("codenav.area", null);
    this.lastAt = at;
    const ids = new Set(tabsNow().map((x) => x.id));
    const add = [];
    if (spec && !ids.has(fileId(spec))) add.push({ id: fileId(spec), type: "file", spec: { kind: "file", path: spec.path, root: spec.root, rel: spec.rel, on: spec.on ?? null } });
    const r = current();
    if (reviewing() && r?.path && !ids.has(reviewId(r))) add.push({ id: reviewId(r), type: "review", rkey: r.rkey, path: r.path });
    const sig = add.map((x) => x.id).join("|");
    if (add.length && this.adding !== sig) {
      this.adding = sig;
      cx.timer.after(0, () => { this.adding = null; setTabs([...tabsNow().filter((x) => !add.some((a) => a.id === x.id)), ...add]); });
    }
    const shown = tabsNow().find((x) => x.id === activeId());
    const h = historyNow();
    if (shown && h.list[h.at]?.id !== shown.id && this.noting !== shown.id && !(h.going && Date.now() - h.going < 1500)) {
      this.noting = shown.id;
      cx.timer.after(0, () => { this.noting = null; noteShown(shown); });
    }
    const want = wantedChild(), now = find(layout(), STACK)?.active;
    if (want !== now && this.routing !== want) {
      this.routing = want;
      cx.timer.after(0, () => { this.routing = null; run("layout.select", { stack: STACK, child: want }); });
    }
  }

  render(cx) {
    this.route(cx);
    const t = theme(), spec = editorSpec(), active = activeId();
    const comments = new Map();
    for (const [rkey, st] of Object.entries(shared("codenav.reviews") ?? {}))
      for (const c of st.comments ?? []) comments.set(`${rkey}:${c.path}`, (comments.get(`${rkey}:${c.path}`) ?? 0) + 1);
    const tab = (x, i) => {
      const on = x.id === active;
      const name = x.type === "file" ? basename(x.spec.rel ?? x.spec.path) : basename(x.path);
      const count = x.type === "review" ? comments.get(`${x.rkey}:${x.path}`) ?? 0 : 0;
      // Opens on press: the close button stops its press, so closing never reopens the tab.
      const idea = shared("layout") === "idea";
      if (idea) return uiTab(`cn-tab-${x.id}`, [
        x.type === "file" ? ideaImage(x.spec.path, false, IDEA.iconSize) : icon("git-branch", IDEA.iconSize).text_color(t.accent),
        div().max_w(180).truncate().when(on, el => el.font_semibold()).child(name),
        ...(count > 0 ? [div().px(5).h(15).flex().items_center().rounded(8).bg(t.accent).text_color(t.accent_foreground).text_size(10).font_bold().child(String(count))] : []),
      ], { selected: on, onSelect: () => openTab(x), onClose: () => closeTab(x.id), closeIcon: icon("x", 11),
        tip: x.type === "file" ? x.spec.rel ?? x.spec.path : `${T("Review")} · ${x.path}` })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "codenav", props: { view: "tabmenu", id: x.id }, kind: "popup", frame: "none", ...uiPopupSize(3, { width: 210 }) });
        });
      return h_flex().id(`cn-tab-${i}`).flex_none().pl(12).pr(6).gap(6).items_center().text_size(12).cursor_pointer()
        .h_full().border_b(2).border_color(on ? t.accent : "#00000000").when(on, el => el.bg(t.background))
        .text_color(on ? t.foreground : t.muted).hover((e) => e.text_color(t.foreground))
        .tooltip(x.type === "file" ? x.spec.rel ?? x.spec.path : `${T("Review")} · ${x.path}`)
        .on_mouse_down("left", () => openTab(x))
        .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); closeTab(x.id); })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "codenav", props: { view: "tabmenu", id: x.id }, kind: "popup", width: 210, height: 112 });
        })
        .child(x.type === "file" && shared("layout") === "idea" ? ideaImage(x.spec.path, false, 14)
          : icon(x.type === "file" ? "file-text" : "git-branch", 13).text_color(x.type === "review" ? t.accent : on ? t.foreground : t.muted))
        .child(div().max_w(180).truncate().child(name))
        .when(count > 0, (e) => e.child(div().px(5).h(15).flex().items_center().rounded(8).bg(t.accent).text_color(t.accent_foreground).text_size(10).font_bold().child(String(count))))
        .child(iconButton(`cn-tab-x-${i}`, "x", T("Close (Cmd+W)"), () => closeTab(x.id), { size: 16, icon: 11 }));
    };
    const list = visibleTabs();
    const ideaLook = shared("layout") === "idea";
    return ideaUI(h_flex()).id("codenav-tabs").size_full().pr(6).items_center().bg(t.chrome).when(!ideaLook, (e) => e.border_b(1).border_color(t.border)).when(ideaLook, (e) => e.pl(4).rounded_t(IDEA.islandRadius))
      .child(h_flex().flex_none().h_full().px(4).gap(2).items_center().when(!ideaLook, (e) => e.border_r(1).border_color(t.border))
        .child(iconButton("cn-tabs-back", "chevron-left", T(ideaLook ? "Back (Cmd+[)" : "Previous tab (Ctrl+-)"), () => ideaLook ? run("codenav.nav-back") : tabBack(), { color: ideaLook || canStep(-1) ? t.muted : t.dim }))
        .child(iconButton("cn-tabs-fwd", "chevron-right", T(ideaLook ? "Forward (Cmd+])" : "Next tab (Ctrl+Shift+-)"), () => ideaLook ? run("codenav.nav-forward") : tabForward(), { color: ideaLook || canStep(1) ? t.muted : t.dim })))
      .child(h_flex().id("cn-tabs-scroll").flex_1().min_w(0).h_full().overflow_x_scrollbar()
        .children(list.length ? list.map(tab) : [div().px(12).text_size(12).text_color(t.dim).child(T("Editor"))]))
      .when(Boolean(spec?.edit) && !reviewing(), (e) => e.child(iconButton("cn-tab-codeview", "eye", T("Back to the code view (language server help)"), () => {
        const { edit, ...rest } = spec;
        setEditorSpec(editorKey(), rest);
      })))
      .when(!ideaLook, (e) => e.child(iconButton("cn-area-x", "x", T("Hide the editor area (Ctrl+Alt+E)"), () => run("layout.hide", { id: AREA }))))
      .when(ideaLook, (e) => e.child(iconButton("cn-tabs-list", "chevron-down", T("Open Tabs"), () => openOverlay({ mod: "codenav", props: { view: "tablist" }, kind: "popup", frame: "none", ...uiPopupSize(Math.max(1, list.length), { width: 360, maxHeight: 360 }) }))));
  }
}

// The right-click menu of a tab (a popup).
export class TabMenu {
  init(_p, cx) { this.menu = new MenuController(cx); this.menu.focus.focus(); }
  release() { this.menu.release(); }
  render(cx) {
    const t = theme(), { id, overlay } = props() ?? {};
    const actions = [() => closeTab(id), () => closeOthers(id), () => closeAll()];
    const rows = ["Close", "Close Others", "Close All"].map((label, i) => ({ id: String(i), label: T(label), action: actions[i] }));
    if (isIdea()) return uiMenu("cn-tabmenu", rows, this.menu, cx, { width: 210, onClose: () => closeOverlay(overlay) });
    const choose = (i) => { closeOverlay(overlay); actions[i]?.(); };
    const item = (key, label, i) => div().id(`cn-tm-${key}`).h(isIdea() ? IDEA.rowHeight : 30).px(12).flex().items_center().rounded(isIdea() ? IDEA.selectionRadius : 5).text_size(isIdea() ? uiSize() : 12.5).cursor_pointer()
      .when(i === this.menu.at, (e) => e.bg(t.selected))
      .hover((e) => e.bg(t.hover))
      .on_click(() => choose(i))
      .child(label);
    return popupSurface(v_flex()).size_full().p(4).gap(2).bg(t.popover).text_color(t.foreground)
      .track_focus(this.menu.focus).on_key_down((event, eventCx) => this.menu.key(event, eventCx, rows, { onClose: () => closeOverlay(overlay) }))
      .child(item("close", T("Close"), 0))
      .child(item("others", T("Close Others"), 1))
      .child(item("all", T("Close All"), 2));
  }
}

export class TabList {
  init(_p, cx) { this.menu = new MenuController(cx, Math.max(0, visibleTabs().findIndex(x => x.id === activeId()))); this.menu.focus.focus(); }
  release() { this.menu.release(); }
  render(cx) {
    const t = theme(), tabs = visibleTabs(), done = (x) => { closeOverlay(props().overlay); if (x) openTab(x); };
    const rows = tabs.map(x => {
      const path = x.type === "file" ? x.spec.path : x.path;
      return { id: x.id, label: basename(path), icon: () => ideaImage(path, false, IDEA.iconSize), shortcut: path, action: () => openTab(x) };
    });
    this.menu.normalize(rows);
    if (isIdea()) return uiMenu("cn-tablist", rows, this.menu, cx, { width: 360, maxHeight: 360, onClose: () => closeOverlay(props().overlay) });
    return popupSurface(v_flex()).size_full().p(4).text_color(t.foreground).track_focus(this.menu.focus)
      .on_key_down((event, eventCx) => this.menu.key(event, eventCx, rows, { onClose: () => closeOverlay(props().overlay) }))
      .child(v_flex().id("cn-tablist").flex_1().min_h(0).overflow_y_scrollbar()
        .children(tabs.map((x, i) => {
          const path = x.type === "file" ? x.spec.path : x.path;
          return h_flex().id(`cn-tablist-${i}`).h(IDEA.rowHeight).px(8).gap(6).items_center().rounded(4).cursor_pointer()
            .bg(i === this.menu.at ? t.selected : "#00000000").hover((e) => e.bg(t.hover)).on_click(() => done(x))
            .child(ideaImage(path, false, 16)).child(div().flex_1().truncate().child(basename(path))).tooltip(path);
        })));
  }
}
