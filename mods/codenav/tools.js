// The idea layout's IntelliJ-style frame: tool windows on stripes (Project,
// Commit, Structure, Find, Terminal, Problems) that open and fold like
// IntelliJ's and move between the left, right and bottom sides, the main toolbar (project and branch widgets, Search
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
  project: { child: "view-files", icon: "folder", label: "Project", key: "⌘1" },
  commit: { child: "view-review", icon: "git-commit", label: "Commit", key: "⌘0" },
  structure: { child: "view-structure", icon: "layers", label: "Structure", key: "⌘7" },
  find: { child: "view-search", icon: "search", label: "Find", key: "⌘⇧F" },
  terminal: { child: "bottom-terminal", icon: "terminal", label: "Terminal", key: "⌥F12" },
  problems: { child: "bottom-problems", icon: "alert", label: "Problems", key: "⌘6" },
};
// The three places a tool window can be. Each stack keeps an empty child, so a
// side whose tools all moved away still has one.
export const SIDES = {
  left: { column: "sidebar", stack: "sidebar-views", empty: "left-empty", label: "Left" },
  right: { column: "tool-right", stack: "right-views", empty: "right-empty", label: "Right" },
  bottom: { column: "terminal-panel", stack: "bottom-stack", empty: "bottom-empty", label: "Bottom" },
};

// Which side a tool window is on now: the stack holding it.
export function sideOf(name) {
  const l = layout(), child = TOOLS[name]?.child;
  return Object.keys(SIDES).find((k) => (find(l, SIDES[k].stack)?.children ?? []).some((c) => c.id === child)) ?? null;
}
export const toolsOn = (side) => Object.keys(TOOLS).filter((n) => sideOf(n) === side);

export function toolOpen(name) {
  const side = SIDES[sideOf(name)], l = layout();
  return Boolean(side && find(l, side.column) && !find(l, side.column).hidden && find(l, side.stack)?.active === TOOLS[name].child);
}
// Like IntelliJ's stripe buttons and Cmd+1…: shows the tool window, or folds it when it is the one showing.
export function toggleTool(name, show = false) {
  const side = SIDES[sideOf(name)], l = layout();
  const column = side && find(l, side.column), stack = side && find(l, side.stack);
  if (!column || !stack) return;
  if (toolOpen(name) && !show) return run("layout.hide", { id: side.column });
  if (stack.active !== TOOLS[name].child) run("layout.select", { stack: side.stack, child: TOOLS[name].child });
  if (column.hidden) run("layout.show", { id: side.column });
}
// Puts tool windows on sides ({name: side}) in one layout edit. A moved one
// shows where it lands (with `show`); a side left with none folds.
export function arrange(want, show = false) {
  const tree = JSON.parse(JSON.stringify(layout()));
  const stack = (k) => find(tree, SIDES[k].stack), column = (k) => find(tree, SIDES[k].column);
  if (Object.keys(SIDES).some((k) => !stack(k) || !column(k))) return;
  let changed = false;
  for (const [name, to] of Object.entries(want)) {
    const from = sideOf(name), child = TOOLS[name]?.child;
    if (!from || !SIDES[to] || from === to) continue;
    const src = stack(from), node = src.children.find((c) => c.id === child);
    if (!node) continue;
    src.children = src.children.filter((c) => c.id !== child);
    if (src.active === child) src.active = src.children.find((c) => c.id !== SIDES[from].empty)?.id ?? SIDES[from].empty;
    stack(to).children = [...stack(to).children, node];
    if (show) { stack(to).active = child; column(to).hidden = false; }
    changed = true;
  }
  if (!changed) return;
  for (const k of Object.keys(SIDES)) if (stack(k).active === SIDES[k].empty) column(k).hidden = true;
  run("layout.set", { layout: tree });
}
export const moveTool = (name, to) => arrange({ [name]: to }, true);

// The default sides (Settings → tool windows), kept in shared "codenav.toolSides".
export const DEFAULT_SIDES = { project: "left", commit: "left", structure: "left", find: "left", terminal: "bottom", problems: "bottom" };
export const savedSides = () => ({ ...DEFAULT_SIDES, ...(shared("codenav.toolSides") ?? {}) });
export const openToolSettings = () => openOverlay({ mod: "codenav", props: { view: "toolsettings" }, kind: "dialog", width: 440, height: 360 });

// Cmd+Shift+F12: every tool window away for the editor, or back as they were.
export function toggleAllTools() {
  const l = layout(), open = Object.values(SIDES).filter((s) => find(l, s.column) && !find(l, s.column).hidden).map((s) => s.column);
  if (open.length) { setShared("codenav.toolsHidden", open); for (const id of open) run("layout.hide", { id }); return; }
  for (const id of shared("codenav.toolsHidden") ?? ["sidebar"]) run("layout.show", { id });
}

const stopPress = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

// -- the stripes: the left one holds the left tools, then the bottom ones; the right one the right tools.
// Right-click a button to move its tool window to another side.
export class Stripe {
  init(p) { this.edge = p?.side === "right" ? "right" : "left"; }
  button(name, t) {
    const tool = TOOLS[name], on = toolOpen(name);
    return stopPress(div().id(`st-${name}`).size(30).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
      .bg(on ? t.selected : "#00000000").text_color(on ? t.foreground : t.muted).hover((s) => s.bg(on ? t.selected : t.hover).text_color(t.foreground))
      .tooltip(`${T(tool.label)}  ${tool.key}`)
      .on_click(() => toggleTool(name))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "codenav", props: { view: "toolmenu", name }, kind: "popup", width: 220, height: 180 });
      }))
      .child(icon(tool.icon, 17));
  }
  render() {
    const t = theme(), top = toolsOn(this.edge), bottom = this.edge === "left" ? toolsOn("bottom") : [];
    return v_flex().size_full().py(6).gap(4).items_center().bg(t.chrome).when(this.edge === "left", (e) => e.border_r(1)).when(this.edge === "right", (e) => e.border_l(1)).border_color(t.border)
      .children(top.map((n) => this.button(n, t)))
      .child(div().flex_1())
      .children(bottom.map((n) => this.button(n, t)));
  }
}

// A stripe button's right-click menu: move to another side, or hide.
export class ToolMenu {
  init() {}
  render() {
    const t = theme(), { name, overlay } = props() ?? {}, side = sideOf(name);
    const item = (id, label, action) => div().id(`tm-${id}`).h(30).px(12).flex().items_center().rounded(5).text_size(12.5).cursor_pointer()
      .hover((e) => e.bg(t.hover)).on_click(() => { closeOverlay(overlay); action(); }).child(label);
    return v_flex().size_full().p(4).gap(2).bg(t.popover).text_color(t.foreground)
      .children(Object.keys(SIDES).filter((k) => k !== side).map((k) => item(k, T(`Move to ${SIDES[k].label}`), () => moveTool(name, k))))
      .when(toolOpen(name), (e) => e.child(item("hide", T("Hide"), () => toggleTool(name))))
      .child(div().h(1).my(2).bg(t.border))
      .child(item("settings", T("Tool Window Settings…"), () => openToolSettings()));
  }
}

// Settings → where each tool window goes by default: saved, then applied now;
// "Reset" puts them back where the defaults say.
export class ToolSettings {
  init() { this.sides = savedSides(); }
  render() {
    const t = theme(), { overlay } = props() ?? {};
    const choice = (name, k) => div().id(`ts-${name}-${k}`).px(10).py(3).rounded(5).text_size(12).cursor_pointer()
      .bg(this.sides[name] === k ? t.solid : t.hover).text_color(this.sides[name] === k ? t.solid_foreground : t.muted)
      .on_click((_e, cx) => { this.sides = { ...this.sides, [name]: k }; cx.notify(); }).child(T(SIDES[k].label));
    return v_flex().size_full().p(14).gap(10).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(div().font_semibold().child(T("Tool Windows")))
      .child(div().text_size(12).text_color(t.dim).child(T("Where each tool window goes by default. Right-click a stripe button to move one for now.")))
      .child(v_flex().gap(6).children(Object.keys(TOOLS).map((name) => h_flex().gap(8).items_center()
        .child(icon(TOOLS[name].icon, 14).text_color(t.muted))
        .child(div().w(110).child(T(TOOLS[name].label)))
        .child(h_flex().gap(4).children(Object.keys(SIDES).map((k) => choice(name, k)))))))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end()
        .child(div().id("ts-cancel").px(12).py(5).rounded(5).border_1().border_color(t.input).cursor_pointer().text_size(12)
          .on_click(() => closeOverlay(overlay)).child(T("Cancel")))
        .child(div().id("ts-save").px(12).py(5).rounded(5).bg(t.solid).text_color(t.solid_foreground).cursor_pointer().text_size(12)
          .on_click(() => { setShared("codenav.toolSides", this.sides); closeOverlay(overlay); arrange(this.sides); })
          .child(T("Save and Apply"))));
  }
}

// An empty child for each tool window stack.
export class ToolEmpty {
  init() {}
  render() { return div().size_full().bg(theme().chrome); }
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
      .child(iconButton("tb-tools", "panel-bottom", T("Tool Window Settings…"), () => openToolSettings(), { size: 28, icon: 16 }))
      .child(iconButton("tb-settings", "settings", T("Settings"), () => run("app.settings"), { size: 28, icon: 16 }));
  }
}

// -- a side's header: its tool windows as tabs (the terminal's own tabs when it shows), then hide.
export class ToolHeader {
  init(p) { this.side = SIDES[p?.side] ? p.side : "bottom"; }
  tab(c, t) {
    const lead = panes().find((p) => p.tab === c.id && p.program?.agent)?.program ?? panes().find((p) => p.tab === c.id)?.program;
    const name = /^\d+$/.test(c.name) && lead?.name ? lead.name : c.name;
    return stopPress(h_flex().id(`th-t-${c.id}`).h(24).px(7).gap(5).flex_none().items_center().rounded(5).text_size(12).cursor_pointer()
      .bg(c.active ? t.hover : "#00000000").text_color(c.active ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click(() => run("tab.select", { id: c.id })))
      .child(lead?.icon ? (lead.tint ? svg(lead.icon).size(12).text_color(t.muted) : image(lead.icon).size(12)) : icon("terminal", 12))
      .child(div().max_w(150).truncate().child(name))
      .when(c.status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(c.status === "blocked" || c.status === "done", (el) => el.child(div().size(6).rounded(3).bg(t[c.status])))
      .when(c.active, (el) => el.child(iconButton(`th-x-${c.id}`, "x", T("Close tab"), () => run("tab.close", { id: c.id }), { size: 16, icon: 10 })));
  }
  render() {
    const t = theme(), side = SIDES[this.side], names = toolsOn(this.side);
    const active = names.find((n) => find(layout(), side.stack)?.active === TOOLS[n].child);
    const tabs = spaces().find((s) => s.active)?.tabs ?? [];
    const title = (name) => stopPress(div().id(`th-${name}`).flex_none().px(6).py(3).rounded(5).text_size(12).font_semibold().cursor_pointer()
      .text_color(name === active ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click(() => toggleTool(name, true))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "codenav", props: { view: "toolmenu", name }, kind: "popup", width: 220, height: 180 }); })
      .child(T(TOOLS[name].label)));
    return h_flex().size_full().min_w(0).pl(8).pr(6).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .children(names.map(title))
      .when(active === "terminal", (e) => e.child(div().w(1).h(14).mx(4).flex_none().bg(t.input))
        .child(h_flex().id(`th-tabs-${this.side}`).flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_scrollbar()
          .children(tabs.map((c) => this.tab(c, t)))
          .child(iconButton(`th-new-${this.side}`, "plus", T("New Terminal or Agent"), () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))))
      .when(active !== "terminal", (e) => e.child(div().flex_1()))
      .child(iconButton(`th-hide-${this.side}`, "minus", T("Hide"), () => run("layout.hide", { id: side.column })));
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
