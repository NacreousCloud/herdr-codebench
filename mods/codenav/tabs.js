// The strip above the editor area: the open file and Review, like editor tabs.
// It also keeps the editor stack on the right child: the code view for source
// files, the activity editor for pictures, PDFs and edits, or the review.
import { div } from "gpui-kit";
import { T, lang, setLang } from "./i18n.js";
import { h_flex } from "gpui-base";
import { theme, shared, setShared, layout, run, nextCommand } from "herdr";
import { icon, iconButton, find, STACK, AREA, editorSpec, editorKey, setEditorSpec, wantedChild, showReview, showEditor, basename, location } from "./common.js";

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

  // Opening a file while the review shows goes back to the editor.
  route(cx) {
    const spec = editorSpec();
    const at = spec?.at ?? 0;
    if (this.lastAt !== undefined && at > this.lastAt && shared("codenav.area") === "review") setShared("codenav.area", null);
    this.lastAt = at;
    const want = wantedChild(), now = find(layout(), STACK)?.active;
    if (want !== now && this.routing !== want) {
      this.routing = want;
      cx.timer.after(0, () => { this.routing = null; run("layout.select", { stack: STACK, child: want }); });
    }
  }

  render(cx) {
    this.route(cx);
    const t = theme(), spec = editorSpec(), review = shared("codenav.area") === "review";
    const { cwd, on } = location();
    const repo = Object.entries(shared("codenav.reviews") ?? {}).find(([k]) => k.startsWith(`${on ?? ""}:`) && cwd && (cwd + "/").startsWith(k.slice(k.indexOf(":") + 1) + "/"));
    const count = repo?.[1]?.comments?.length ?? 0;
    const tab = (id, label, active, action, extra) => h_flex().id(id).h_full().px(12).gap(6).items_center().text_size(12).cursor_pointer()
      .border_b(2).border_color(active ? t.accent : "#00000000")
      .text_color(active ? t.foreground : t.muted).hover((e) => e.text_color(t.foreground))
      .on_click((_e, cx) => action(cx))
      .child(label).children(extra ?? []);
    return h_flex().id("codenav-tabs").size_full().pl(4).pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(tab("cn-tab-file", h_flex().gap(6).items_center().child(icon("file-text", 13)).child(spec ? basename(spec.rel ?? spec.path) : T("Editor")), !review, () => showEditor(),
        spec ? [iconButton("cn-tab-file-x", "x", T("Close file"), () => { setEditorSpec(editorKey(), null); if (!review) run("layout.hide", { id: AREA }); }, { size: 16, icon: 11 })] : []))
      .child(tab("cn-tab-review", h_flex().gap(6).items_center().child(icon("git-branch", 13)).child(T("Review")), review, () => showReview(),
        count ? [div().px(5).h(16).flex().items_center().rounded(8).bg(t.accent).text_color(t.accent_foreground).text_size(10.5).font_bold().child(String(count))] : []))
      .child(div().flex_1())
      .when(Boolean(spec?.edit) && !review, (e) => e.child(iconButton("cn-tab-codeview", "eye", T("Back to the code view (language server help)"), () => {
        const { edit, ...rest } = spec;
        setEditorSpec(editorKey(), rest);
      })))
      .child(iconButton("cn-area-x", "x", T("Hide the editor area (Ctrl+Alt+E)"), () => run("layout.hide", { id: AREA })));
  }
}
