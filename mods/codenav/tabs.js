// The strip above the editor area: one tab per open file and per reviewed file,
// like VS Code's editor tabs, kept per space in shared "codenav.tabs". It also
// keeps the editor stack on the right child: the code view for source files,
// the activity editor for pictures, PDFs and edits, or the review.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { h_flex } from "gpui-base";
import { theme, shared, setShared, layout, run, nextCommand } from "herdr";
import { icon, iconButton, find, STACK, AREA, editorSpec, editorKey, setEditorSpec, wantedChild, showReview, basename } from "./common.js";

const KEY = "codenav.tabs";
const MAX = 20;
const fileId = (s) => `f:${s.on ?? ""}:${s.path}`;
const reviewId = (r) => `r:${r.rkey}:${r.path}`;

export default class Tabs {
  init(_p, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "review") showReview();
        cx.notify();
      }
    });
  }

  tabs() { return (shared(KEY) ?? {})[editorKey()] ?? []; }
  setTabs(list) {
    const all = { ...(shared(KEY) ?? {}) };
    all[editorKey()] = list.slice(-MAX);
    setShared(KEY, all);
  }
  current() { return shared("codenav.review.current") ?? null; }
  reviewing() { return shared("codenav.area") === "review"; }
  activeId() {
    if (this.reviewing()) { const r = this.current(); return r?.path ? reviewId(r) : null; }
    const s = editorSpec();
    return s ? fileId(s) : null;
  }

  // What the sidebar opened becomes a tab; opening a file while the review
  // shows goes back to the editor; the stack follows.
  route(cx) {
    const spec = editorSpec();
    const at = spec?.at ?? 0;
    if (this.lastAt !== undefined && at > this.lastAt && this.reviewing()) setShared("codenav.area", null);
    this.lastAt = at;
    const list = this.tabs(), ids = new Set(list.map((x) => x.id));
    const add = [];
    if (spec && !ids.has(fileId(spec))) add.push({ id: fileId(spec), type: "file", spec: { kind: "file", path: spec.path, root: spec.root, rel: spec.rel, on: spec.on ?? null } });
    const r = this.current();
    if (this.reviewing() && r?.path && !ids.has(reviewId(r))) add.push({ id: reviewId(r), type: "review", rkey: r.rkey, path: r.path });
    const sig = add.map((x) => x.id).join("|");
    if (add.length && this.adding !== sig) {
      this.adding = sig;
      cx.timer.after(0, () => { this.adding = null; this.setTabs([...this.tabs().filter((x) => !add.some((a) => a.id === x.id)), ...add]); });
    }
    const want = wantedChild(), now = find(layout(), STACK)?.active;
    if (want !== now && this.routing !== want) {
      this.routing = want;
      cx.timer.after(0, () => { this.routing = null; run("layout.select", { stack: STACK, child: want }); });
    }
  }

  open(tab) {
    if (tab.type === "file") {
      if (this.reviewing()) setShared("codenav.area", null);
      const cur = editorSpec();
      if (!cur || fileId(cur) !== tab.id) setEditorSpec(editorKey(), tab.spec);
      return;
    }
    const all = { ...(shared("codenav.reviews") ?? {}) };
    if (all[tab.rkey]?.selected !== tab.path) { all[tab.rkey] = { ...all[tab.rkey], selected: tab.path }; setShared("codenav.reviews", all); }
    showReview();
  }

  close(tab) {
    const list = this.tabs(), i = list.findIndex((x) => x.id === tab.id);
    const rest = list.filter((x) => x.id !== tab.id);
    this.setTabs(rest);
    if (this.activeId() !== tab.id) return;
    const next = rest[Math.min(i, rest.length - 1)];
    if (next) return this.open(next);
    // The last tab: the editor area goes away.
    setEditorSpec(editorKey(), null);
    if (this.reviewing()) setShared("codenav.area", null);
    run("layout.hide", { id: AREA });
  }

  render(cx) {
    this.route(cx);
    const t = theme(), spec = editorSpec(), active = this.activeId();
    const comments = new Map();
    for (const [rkey, st] of Object.entries(shared("codenav.reviews") ?? {}))
      for (const c of st.comments ?? []) comments.set(`${rkey}:${c.path}`, (comments.get(`${rkey}:${c.path}`) ?? 0) + 1);
    const tab = (x, i) => {
      const on = x.id === active;
      const name = x.type === "file" ? basename(x.spec.rel ?? x.spec.path) : basename(x.path);
      const count = x.type === "review" ? comments.get(`${x.rkey}:${x.path}`) ?? 0 : 0;
      return h_flex().id(`cn-tab-${i}`).h_full().flex_none().pl(10).pr(4).gap(6).items_center().text_size(12).cursor_pointer()
        .border_b(2).border_color(on ? t.accent : "#00000000").when(on, (e) => e.bg(t.background))
        .text_color(on ? t.foreground : t.muted).hover((e) => e.text_color(t.foreground))
        .tooltip(x.type === "file" ? x.spec.rel ?? x.spec.path : `${T("Review")} · ${x.path}`)
        .on_click(() => this.open(x))
        .child(icon(x.type === "file" ? "file-text" : "git-branch", 13).text_color(x.type === "review" ? t.accent : on ? t.foreground : t.muted))
        .child(div().max_w(180).truncate().child(name))
        .when(count > 0, (e) => e.child(div().px(5).h(15).flex().items_center().rounded(8).bg(t.accent).text_color(t.accent_foreground).text_size(10).font_bold().child(String(count))))
        .child(iconButton(`cn-tab-x-${i}`, "x", T("Close"), () => this.close(x), { size: 16, icon: 11 }));
    };
    const list = this.tabs();
    return h_flex().id("codenav-tabs").size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("cn-tabs-scroll").flex_1().min_w(0).h_full().overflow_x_scrollbar()
        .children(list.length ? list.map(tab) : [div().px(12).text_size(12).text_color(t.dim).child(T("Editor"))]))
      .when(Boolean(spec?.edit) && !this.reviewing(), (e) => e.child(iconButton("cn-tab-codeview", "eye", T("Back to the code view (language server help)"), () => {
        const { edit, ...rest } = spec;
        setEditorSpec(editorKey(), rest);
      })))
      .child(iconButton("cn-area-x", "x", T("Hide the editor area (Ctrl+Alt+E)"), () => run("layout.hide", { id: AREA })));
  }
}
