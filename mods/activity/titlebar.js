// The workbench's title bar, like VS Code's: a command center in the middle
// (opens the palette), layout toggles on the right, and the window buttons
// where the system draws none. The block is a window_drag block.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { h_flex } from "gpui-base";
import { run, theme, layout, window, spaces } from "herdr";
import { find, AREA, iconButton, icon, location, basename, editorSpec, showView } from "./common.js";

// The editor area and the terminal panel share "work-body": a column stacks
// them, a row puts them side by side (layouts that have one).
const BODY = "work-body";
const toggles = (side, tools) => [
  tools ? { id: "tools", icon: "layout-sidebar", tip: "Toggle Primary Side Bar (Option+2)" } : { id: "sidebar", icon: "layout-sidebar", tip: "Toggle Primary Side Bar (Ctrl+Shift+B)" },
  { id: AREA, icon: side ? "layout-editor-left" : "layout-editor", tip: "Toggle Editor Area (Option+3)" },
  { id: "terminal-panel", icon: side ? "layout-panel-right" : "layout-panel", tip: "Toggle Terminal Panel (Option+4)" },
];

function setSplit(dir) {
  const tree = JSON.parse(JSON.stringify(layout()));
  const body = find(tree, BODY);
  if (!body || body.type === dir) return;
  body.type = dir;
  run("layout.set", { layout: tree });
}

export default class Titlebar {
  init() {}

  render() {
    const t = theme(), root = layout(), w = window();
    const body = find(root, BODY), side = body?.type === "row";
    const space = spaces().find((s) => s.active);
    const spec = editorSpec(), folder = basename(location().cwd);
    const center = [spec?.rel ?? (spec ? basename(spec.path) : null), folder, space?.name].filter(Boolean);
    const toggle = (x) => {
      const node = find(root, x.id), on = node && !node.hidden;
      return iconButton(`tb-${x.id}`, x.icon, x.tip, () => run("layout.toggle", { id: x.id }),
        { size: 26, icon: 15, color: on ? t.foreground : t.dim });
    };
    const winButton = (id, name, action) => iconButton(`win-${id}`, name, "", action, { size: 28, icon: 14 });
    const on = location().on;
    return h_flex().size_full().min_w(0).pl(10).pr(6).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      // Like VS Code's remote indicator: where the focused terminal runs.
      .child(h_flex().id("remote-chip").h(24).px(8).gap(5).flex_none().items_center().rounded(5).text_size(11.5).cursor_pointer()
        .bg(on ? t.accent : "#00000000").text_color(on ? t.solid_foreground ?? t.background : t.dim)
        .hover((s) => s.opacity(0.85)).tooltip(on ? `SSH: ${on} (open Remote Explorer)` : "Open a folder on a remote machine")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => find(layout(), "view-herdr") ? showView("view-herdr") : run("layout.show", { id: "sidebar" }))
        .child(icon("remote", 13))
        .when(Boolean(on), (el) => el.child(div().child(`SSH: ${on}`))))
      .child(div().flex_1())
      .child(h_flex().id("command-center").w(420).max_w_full().h(26).px(10).gap(6).items_center().justify_center()
        .rounded(6).border_1().border_color(t.border).bg(t.background).text_size(12).text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(T("Command Palette"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("app.palette"))
        .child(icon("search", 13))
        .child(div().min_w(0).truncate().child(center.join(" — ") || "Herdr")))
      .child(div().flex_1())
      .children(toggles(side, Boolean(find(root, "tools"))).map(toggle))
      .when(Boolean(body), (el) => el
        .child(div().w(1).h(16).mx(4).flex_none().bg(t.border))
        .child(iconButton("tb-split", side ? "split-rows" : "split-columns", side ? "Editor above the terminal" : "Editor beside the terminal",
          () => setSplit(side ? "column" : "row"), { size: 26, icon: 15, color: t.foreground })))
      .when(Boolean(w?.buttons), (el) => el.child(div().w(8))
        .child(winButton("min", "minus", () => run("window.minimize")))
        .child(winButton("max", "square", () => run("window.maximize")))
        .child(winButton("close", "x", () => run("window.close"))));
  }
}
