// The idea layout's IntelliJ-style frame: tool windows on stripes (left:
// Project, Commit, Structure, Find; bottom: Terminal, Problems) that open and
// fold like IntelliJ's, the main toolbar (project and branch widgets, Search
// Everywhere), the bottom tool window's header, Structure and Problems, the
// status bar's path, and the project and branch popups.
// The code view publishes what these show: shared "codenav.caret",
// "codenav.symbols" and "codenav.problems".
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, theme, layout, shared, setShared, spaces, panes, window, props, openOverlay, closeOverlay, exec, notify, pickFolder } from "herdr";
import { T } from "./i18n.js";
import { find, icon, iconButton, location, openPath, editorSpec, basename, tilde, sectionHeader } from "./common.js";
import { KIND, kindColor } from "./code.js";
import { openEverywhere } from "./everywhere.js";

export const TOOLS = {
  project: { side: "left", child: "view-files", icon: "folder", label: "Project", key: "⌘1" },
  commit: { side: "left", child: "view-review", icon: "git-commit", label: "Commit", key: "⌘0" },
  structure: { side: "left", child: "view-structure", icon: "layers", label: "Structure", key: "⌘7" },
  find: { side: "left", child: "view-search", icon: "search", label: "Find", key: "⌘⇧F" },
  terminal: { side: "bottom", child: "bottom-terminal", icon: "terminal", label: "Terminal", key: "⌥F12" },
  problems: { side: "bottom", child: "bottom-problems", icon: "alert", label: "Problems", key: "⌘6" },
};
const SIDES = { left: { column: "sidebar", stack: "sidebar-views" }, bottom: { column: "terminal-panel", stack: "bottom-stack" } };

export function toolOpen(name) {
  const tool = TOOLS[name], side = SIDES[tool.side], l = layout();
  return Boolean(find(l, side.column) && !find(l, side.column).hidden && find(l, side.stack)?.active === tool.child);
}
// Like IntelliJ's stripe buttons and Cmd+1…: shows the tool window, or folds it when it is the one showing.
export function toggleTool(name, show = false) {
  const tool = TOOLS[name], side = SIDES[tool.side], l = layout();
  const column = find(l, side.column), stack = find(l, side.stack);
  if (!column || !stack) return;
  if (toolOpen(name) && !show) return run("layout.hide", { id: side.column });
  if (stack.active !== tool.child) run("layout.select", { stack: side.stack, child: tool.child });
  if (column.hidden) run("layout.show", { id: side.column });
}
// Cmd+Shift+F12: every tool window away for the editor, or back as they were.
export function toggleAllTools() {
  const l = layout(), open = Object.values(SIDES).filter((s) => find(l, s.column) && !find(l, s.column).hidden).map((s) => s.column);
  if (open.length) { setShared("codenav.toolsHidden", open); for (const id of open) run("layout.hide", { id }); return; }
  for (const id of shared("codenav.toolsHidden") ?? ["sidebar"]) run("layout.show", { id });
}

const stopPress = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

// -- the stripe ----------------------------------------------------------------------------
export class Stripe {
  init() {}
  button(name, t) {
    const tool = TOOLS[name], on = toolOpen(name);
    return stopPress(div().id(`st-${name}`).size(30).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
      .bg(on ? t.selected : "#00000000").text_color(on ? t.foreground : t.muted).hover((s) => s.bg(on ? t.selected : t.hover).text_color(t.foreground))
      .tooltip(`${T(tool.label)}  ${tool.key}`)
      .on_click(() => toggleTool(name)))
      .child(icon(tool.icon, 17));
  }
  render() {
    const t = theme();
    const names = (side) => Object.keys(TOOLS).filter((n) => TOOLS[n].side === side && find(layout(), TOOLS[n].child));
    return v_flex().size_full().py(6).gap(4).items_center().bg(t.chrome).border_r(1).border_color(t.border)
      .children(names("left").map((n) => this.button(n, t)))
      .child(div().flex_1())
      .children(names("bottom").map((n) => this.button(n, t)));
  }
}

// -- the main toolbar --------------------------------------------------------------------------
const avatarColors = ["#6e56cf", "#3574f0", "#2aacb8", "#5fb865", "#e0a84e", "#d9534f", "#c77dbb", "#8a8f98"];
function avatar(name, size = 20) {
  const letters = (name.replace(/^[~./]+/, "").match(/[A-Za-z0-9가-힣]+/g) ?? ["~"]).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "~";
  let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return div().size(size).flex_none().rounded(5).flex().items_center().justify_center().bg(avatarColors[h % avatarColors.length])
    .text_size(size * 0.45).font_bold().text_color("#ffffff").child(letters);
}

function widget(id, t, children, action) {
  return stopPress(h_flex().id(id).h(28).px(8).gap(6).flex_none().items_center().rounded(6).cursor_pointer()
    .hover((s) => s.bg(t.hover)).on_click(action))
    .children(children);
}

export class Toolbar {
  init() {}
  render() {
    const t = theme(), w = window(), space = spaces().find((s) => s.active);
    const mac = w?.platform === "macos" && !w?.fullscreen;
    return h_flex().size_full().pl(mac ? 80 : 10).pr(8).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(13)
      .child(widget("tb-project", t, [avatar(space?.name ?? "~"), div().font_semibold().text_color(t.foreground).max_w(220).truncate().child(space?.name ?? "~"),
        icon("chevron-down", 12).text_color(t.muted)],
        () => openOverlay({ mod: "codenav", props: { view: "projects" }, kind: "popup", width: 300, height: Math.min(460, 96 + spaces().length * 34) })))
      .when(Boolean(space?.branch), (el) => el.child(widget("tb-branch", t, [icon("git-branch", 14).text_color(t.muted),
        div().text_color(t.foreground).max_w(220).truncate().child(space.branch), icon("chevron-down", 12).text_color(t.muted)],
        () => openOverlay({ mod: "codenav", props: { view: "branches" }, kind: "popup", width: 320, height: 420 }))))
      .child(div().flex_1())
      .child(iconButton("tb-everywhere", "search", T("Search Everywhere (Double Shift)"), () => openEverywhere("all"), { size: 28, icon: 16 }))
      .child(iconButton("tb-settings", "settings", T("Settings"), () => run("app.settings"), { size: 28, icon: 16 }));
  }
}

// -- the bottom tool window's header ----------------------------------------------------------
export class BottomBar {
  init() {}
  tab(c, t) {
    const lead = panes().find((p) => p.tab === c.id && p.program?.agent)?.program ?? panes().find((p) => p.tab === c.id)?.program;
    const name = /^\d+$/.test(c.name) && lead?.name ? lead.name : c.name;
    return stopPress(h_flex().id(`bb-t-${c.id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(5).text_size(12).cursor_pointer()
      .bg(c.active ? t.hover : "#00000000").text_color(c.active ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click(() => run("tab.select", { id: c.id })))
      .child(lead?.icon ? (lead.tint ? svg(lead.icon).size(12).text_color(t.muted) : image(lead.icon).size(12)) : icon("terminal", 12))
      .child(div().max_w(150).truncate().child(name))
      .when(c.status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(c.status === "blocked" || c.status === "done", (el) => el.child(div().size(6).rounded(3).bg(t[c.status])))
      .when(c.active, (el) => el.child(iconButton(`bb-x-${c.id}`, "x", T("Close tab"), () => run("tab.close", { id: c.id }), { size: 16, icon: 10 })));
  }
  render() {
    const t = theme(), terminal = toolOpen("terminal") || !toolOpen("problems");
    const tabs = spaces().find((s) => s.active)?.tabs ?? [];
    const title = (name) => stopPress(div().id(`bb-${name}`).flex_none().px(6).py(3).rounded(5).text_size(12).font_semibold().cursor_pointer()
      .text_color(toolOpen(name) || (name === "terminal" && terminal) ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click(() => toggleTool(name, true)).child(T(TOOLS[name].label)));
    return h_flex().size_full().min_w(0).pl(8).pr(6).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(title("terminal")).child(title("problems"))
      .child(div().w(1).h(14).mx(4).flex_none().bg(t.input))
      .child(h_flex().id("bb-tabs").flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_scrollbar()
        .when(terminal, (el) => el.children(tabs.map((c) => this.tab(c, t)))
          .child(iconButton("bb-new", "plus", T("New Terminal or Agent"), () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))))
      .child(iconButton("bb-hide", "minus", T("Hide (Shift+Esc)"), () => run("layout.hide", { id: "terminal-panel" })));
  }
}

// -- Structure and Problems -------------------------------------------------------------------
const forShown = (key) => { const v = shared(key), s = editorSpec(); return v && s && v.path === s.path ? v : null; };
const jump = (path, line, col = 0) => openPath(`${path}:${line + 1}:${col + 1}`);

export class Structure {
  init() {}
  render() {
    const t = theme(), syms = forShown("codenav.symbols"), caret = forShown("codenav.caret");
    const items = (syms?.items ?? []).filter((s) => s.kind !== "variable" || s.depth === 0);
    const current = caret ? [...items].reverse().find((s) => s.start <= caret.line && caret.line <= s.end && s.kind !== "variable") : null;
    return v_flex().size_full().bg(t.chrome).text_color(t.foreground)
      .child(sectionHeader(T("Structure")))
      .child(!syms || !items.length ? div().px(12).text_size(12).text_color(t.dim)
        .child(!editorSpec() ? T("Open a file to see its structure.") : !syms ? T("Waiting for the language server…") : T("No structure for this file."))
        : div().id("tw-structure").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
          .children(items.slice(0, 1500).map((s, i) => h_flex().id(`tw-s-${i}`).h(22).pl(10 + s.depth * 14).pr(8).gap(6).items_center().text_size(12.5).cursor_pointer()
            .when(current === s, (e) => e.bg(t.selected)).hover((e) => e.bg(t.hover))
            .on_click(() => jump(syms.path, s.line, s.col))
            .child(div().w(14).flex_none().text_center().text_size(11).font_bold().text_color(kindColor(s.kind, t)).child(KIND[s.kind] ?? "·"))
            .child(div().flex_none().max_w(200).truncate().child(s.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(s.detail ?? "")))));
  }
}

export class Problems {
  init() {}
  render() {
    const t = theme(), p = forShown("codenav.problems"), items = p?.items ?? [];
    const errors = items.filter((d) => d.severity === 1).length;
    return v_flex().size_full().bg(t.background).text_color(t.foreground)
      .child(h_flex().h(28).flex_none().px(12).gap(8).items_center().text_size(12).text_color(t.muted)
        .child(div().child(p ? `${basename(p.path)}` : T("Current file")))
        .child(div().text_color(errors ? t.ansi1 : t.dim).child(T("{e} errors, {w} warnings", { e: errors, w: items.length - errors }))))
      .child(!items.length ? div().px(12).text_size(12).text_color(t.dim).child(p ? T("No problems in this file.") : T("Open a file to see its problems."))
        : div().id("tw-problems").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
          .children(items.map((d, i) => h_flex().id(`tw-p-${i}`).min_h(24).px(12).gap(8).items_center().text_size(12.5).cursor_pointer()
            .hover((e) => e.bg(t.hover)).on_click(() => jump(p.path, d.line, d.col))
            .child(icon(d.severity === 1 ? "x" : "alert", 13).text_color(d.severity === 1 ? t.ansi1 : t.ansi3))
            .child(div().flex_1().min_w(0).truncate().child(d.message))
            .child(div().flex_none().text_size(11).text_color(t.dim).child(`${d.source ? `${d.source} · ` : ""}:${d.line + 1}`)))));
  }
}

// -- the status bar's path: folders › file › symbols, then Ln:Col ----------------------------
export class Crumbs {
  init() {}
  render() {
    const t = theme(), s = editorSpec(), caret = forShown("codenav.caret");
    const parts = s ? [...(s.rel ?? tilde(s.path)).split("/").filter(Boolean), ...(caret?.scope ?? [])] : [];
    return h_flex().size_full().min_w(0).px(10).gap(5).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(12).text_color(t.muted)
      .child(h_flex().flex_1().min_w(0).gap(5).items_center().overflow_hidden()
        .children(parts.flatMap((p, i) => [i ? div().flex_none().text_color(t.dim).child("›") : null, div().flex_none().max_w(220).truncate()
          .when(i === parts.length - 1, (e) => e.text_color(t.foreground)).child(p)]).filter(Boolean)))
      .when(Boolean(caret), (e) => e.child(div().flex_none().child(`${caret.line + 1}:${caret.col + 1}`)).child(div().flex_none().child("UTF-8")));
  }
}

// -- popups ------------------------------------------------------------------------------------
const popupRow = (id, t, children, action) => h_flex().id(id).h(30).px(10).gap(8).flex_none().items_center().rounded(5).text_size(13).cursor_pointer()
  .hover((s) => s.bg(t.hover)).on_click(action).children(children);

export class Projects {
  init() {}
  render() {
    const t = theme(), { overlay } = props() ?? {};
    const done = () => closeOverlay(overlay);
    return v_flex().size_full().p(6).gap(2).bg(t.popover).text_color(t.foreground)
      .child(div().px(10).py(4).text_size(11).font_semibold().text_color(t.muted).child(T("Projects")))
      .child(div().id("pj-list").max_h(360).overflow_y_scrollbar()
        .children(spaces().map((s) => popupRow(`pj-${s.id}`, t, [avatar(s.name, 18),
          div().flex_none().max_w(150).truncate().when(s.active, (e) => e.font_semibold()).child(s.name),
          div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(s.machine ? `${s.machine}:${s.folder ?? ""}` : tilde(s.folder ?? "")),
          s.active ? icon("check", 13).text_color(t.accent) : null].filter(Boolean),
        () => { done(); run("space.select", { id: s.id }); }))))
      .child(div().h(1).my(2).bg(t.border))
      .child(popupRow("pj-open", t, [icon("folder", 14).text_color(t.muted), div().child(T("Open Folder…"))], () => {
        done();
        pickFolder({ prompt: T("Open Folder…") }).then((folder) => { if (folder) run("space.new", { folder }); }).catch(() => {});
      }));
  }
}

export class Branches {
  init(_p, cx) {
    this.local = []; this.remote = []; this.current = null;
    const { cwd, on } = location();
    this.where = { cwd, on };
    cx.spawn(async (cx) => {
      const r = await exec("git", ["for-each-ref", "--format=%(HEAD)%(refname)", "refs/heads", "refs/remotes"], { cwd, on }).catch(() => null);
      for (const line of (r?.code === 0 ? r.stdout : "").split("\n").filter(Boolean)) {
        const head = line[0] === "*", ref = line.slice(1);
        if (ref.startsWith("refs/heads/")) { const b = ref.slice(11); this.local.push(b); if (head) this.current = b; }
        else if (!ref.endsWith("/HEAD")) this.remote.push(ref.slice(13));
      }
      cx.notify();
    });
  }
  checkout(args, label) {
    const { cwd, on } = this.where;
    exec("git", ["checkout", ...args], { cwd, on }).then((r) => {
      if (r.code !== 0) notify({ title: T("Checkout failed"), body: (r.stderr || r.stdout).trim().slice(0, 300), level: "error", timeout: 6000 });
      else notify({ title: T("Checked out {b}", { b: label }), level: "success", timeout: 2500 });
    }).catch(() => {});
  }
  render() {
    const t = theme(), { overlay } = props() ?? {};
    const pick = (fn) => () => { closeOverlay(overlay); fn(); };
    const head = (s) => div().px(10).pt(6).pb(2).text_size(11).font_semibold().text_color(t.muted).child(s);
    return v_flex().size_full().p(6).bg(t.popover).text_color(t.foreground)
      .child(div().id("br-list").max_h(400).overflow_y_scrollbar()
        .child(head(T("Local")))
        .children(this.local.map((b) => popupRow(`br-l-${b}`, t, [icon("git-branch", 13).text_color(b === this.current ? t.accent : t.muted),
          div().flex_1().min_w(0).truncate().when(b === this.current, (e) => e.font_semibold()).child(b)],
          b === this.current ? () => {} : pick(() => this.checkout([b], b)))))
        .when(this.remote.length > 0, (e) => e.child(head(T("Remote"))))
        .children(this.remote.map((b) => popupRow(`br-r-${b}`, t, [icon("git-branch", 13).text_color(t.dim), div().flex_1().min_w(0).truncate().child(b)],
          pick(() => this.local.includes(b.replace(/^[^/]+\//, "")) ? this.checkout([b.replace(/^[^/]+\//, "")], b) : this.checkout(["--track", b], b))))));
  }
}
