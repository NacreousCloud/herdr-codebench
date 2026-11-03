// The strip above the editor area: one tab per open file and per reviewed file,
// like VS Code's editor tabs, kept per space in shared "codenav.tabs". It also
// keeps the editor stack on the right child: the code view for source files,
// the activity editor for pictures, PDFs and edits, or the review.
// Right-click a tab for Close / Close Others / Close All; Cmd+W in the code
// view closes the shown tab.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared, setShared, layout, run, nextCommand, spaces, openOverlay, closeOverlay, props } from "herdr";
import { icon, iconButton, find, STACK, AREA, editorSpec, editorKey, setEditorSpec, wantedChild, showReview, basename } from "./common.js";

const KEY = "codenav.tabs";
const MAX = 20;
const fileId = (s) => `f:${s.on ?? ""}:${s.path}`;
const reviewId = (r) => `r:${r.rkey}:${r.path}`;

// -- the open tabs of the shown space ----------------------------------------------
const tabsNow = () => (shared(KEY) ?? {})[editorKey()] ?? [];
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
  if (!gone.has(active)) return;
  const next = rest.find((x, i) => i >= at) ?? rest[rest.length - 1];
  if (next) return openTab(next);
  setEditorSpec(editorKey(), null);
  if (reviewing()) setShared("codenav.area", null);
  run("layout.hide", { id: AREA });
}
export const closeTab = (id) => closeTabs([id ?? activeId()].filter(Boolean));
export const closeOthers = (id) => { const keep = tabsNow().find((x) => x.id === id); closeTabs(tabsNow().filter((x) => x.id !== id).map((x) => x.id)); if (keep) openTab(keep); };
export const closeAll = () => closeTabs(tabsNow().map((x) => x.id));

export default class Tabs {
  init(_p, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "review") showReview();
        else if (c === "close-tab") closeTab();
        cx.notify();
      }
    });
  }

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
      return h_flex().id(`cn-tab-${i}`).h_full().flex_none().pl(10).pr(4).gap(6).items_center().text_size(12).cursor_pointer()
        .border_b(2).border_color(on ? t.accent : "#00000000").when(on, (e) => e.bg(t.background))
        .text_color(on ? t.foreground : t.muted).hover((e) => e.text_color(t.foreground))
        .tooltip(x.type === "file" ? x.spec.rel ?? x.spec.path : `${T("Review")} · ${x.path}`)
        .on_mouse_down("left", () => openTab(x))
        .on_mouse_down("middle", (_e, cx) => { cx.stop_propagation(); closeTab(x.id); })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "codenav", props: { view: "tabmenu", id: x.id }, kind: "popup", width: 210, height: 112 });
        })
        .child(icon(x.type === "file" ? "file-text" : "git-branch", 13).text_color(x.type === "review" ? t.accent : on ? t.foreground : t.muted))
        .child(div().max_w(180).truncate().child(name))
        .when(count > 0, (e) => e.child(div().px(5).h(15).flex().items_center().rounded(8).bg(t.accent).text_color(t.accent_foreground).text_size(10).font_bold().child(String(count))))
        .child(iconButton(`cn-tab-x-${i}`, "x", T("Close (Cmd+W)"), () => closeTab(x.id), { size: 16, icon: 11 }));
    };
    const list = tabsNow();
    return h_flex().id("codenav-tabs").size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("cn-tabs-scroll").flex_1().min_w(0).h_full().overflow_x_scrollbar()
        .children(list.length ? list.map(tab) : [div().px(12).text_size(12).text_color(t.dim).child(T("Editor"))]))
      .when(Boolean(spec?.edit) && !reviewing(), (e) => e.child(iconButton("cn-tab-codeview", "eye", T("Back to the code view (language server help)"), () => {
        const { edit, ...rest } = spec;
        setEditorSpec(editorKey(), rest);
      })))
      .child(iconButton("cn-area-x", "x", T("Hide the editor area (Ctrl+Alt+E)"), () => run("layout.hide", { id: AREA })));
  }
}

// The right-click menu of a tab (a popup).
export class TabMenu {
  init() {}
  render() {
    const t = theme(), { id, overlay } = props() ?? {};
    const item = (key, label, action) => div().id(`cn-tm-${key}`).h(30).px(12).flex().items_center().rounded(5).text_size(12.5).cursor_pointer()
      .hover((e) => e.bg(t.hover))
      .on_click(() => { closeOverlay(overlay); action(); })
      .child(label);
    return v_flex().size_full().p(4).gap(2).bg(t.popover).text_color(t.foreground)
      .child(item("close", T("Close"), () => closeTab(id)))
      .child(item("others", T("Close Others"), () => closeOthers(id)))
      .child(item("all", T("Close All"), () => closeAll()));
  }
}
