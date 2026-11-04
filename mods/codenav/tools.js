// The idea layout's IntelliJ-style frame: tool windows on stripes (Project,
// Commit, Structure, Find, Terminal, Problems) that open and fold like
// IntelliJ's and move between the left, right and bottom sides, the main toolbar (project widget, current branch, Search
// Everywhere), the bottom tool window's header, Structure and Problems, the
// status bar's path, and the project popup.
// The code view publishes what these show: shared "codenav.caret",
// "codenav.symbols" and "codenav.problems".
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, theme, layout, shared, setShared, spaces, panes, window, props, openOverlay, closeOverlay, keys, focused } from "herdr";
import { uiNotify as notify } from "./idea-design.js";
import { T } from "./i18n.js";
import { find, icon, iconButton, openPath, editorSpec, editorKey, basename, tilde, editorSnapshot as forShown } from "./common.js";


import { runStore, isRunning, runConfig, stopConfig, openRunConfigs } from "./run.js";
import { ideaImage, symbolImage, toolImage } from "./ideaicons.js";
import { IDEA, uiSize, ideaUI, uiIconButton, uiStripeButton, uiToolHeader, uiIslandBottom, MenuController, uiMenu, uiColors, uiNoticeCard, uiTreeRow, uiListRow, uiSeparator, uiSpinner } from "./idea-design.js";
import { ensureIdeaIslands } from "./islands.js";
import { openIdeaSettings } from "./settings.js";
import { ACTION_GROUPS, getAction, actionPresentation, effectiveShortcuts, formatShortcut } from "./actions.js";
import { groupItems } from "./toolbar-model.js";

import { TOOLS, SIDES, sideOf, toolsOn, toolOpen, hiddenTools, hideSlot, setToolHidden, toggleTool, moveTool, savedSides } from "./tool-windows.js";

const stopPress = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

// -- the stripes: the left one holds the left tools, then the bottom ones; the right one the right tools.
// Right-click a button to move its tool window to another side.
export class Stripe {
  init(p) {
    this.edge = p?.side === "right" ? "right" : "left";
  }
  button(name, t) {
    const tool = TOOLS[name], on = toolOpen(name);
    return uiStripeButton(`st-${name}`, toolImage(tool.idea, IDEA.stripeIconSize, on), () => toggleTool(name),
      { active: on, side: this.edge, tip: `${T(tool.label)}  ${tool.key}` })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "codenav", props: { view: "toolmenu", name }, kind: "popup", frame: "none", width: 240, height: 260 });
      });
  }
  // Every side shows its header (the same one, wherever the side is).
  syncBars(cx) {
    const l = layout();
    for (const k of Object.keys(SIDES)) {
      const bar = find(l, SIDES[k].bar);
      if (!bar?.hidden || this.syncing?.[k]) continue;
      this.syncing = { ...this.syncing, [k]: true };
      cx.timer.after(0, () => { this.syncing = { ...this.syncing, [k]: false }; run("layout.show", { id: SIDES[k].bar }); });
    }
  }
  // Tool windows added after the layout was arranged join their default side once.
  addMissing(cx) {
    const l = layout(), sides = savedSides();
    const missing = Object.keys(TOOLS).filter((n) => !sideOf(n) && find(l, SIDES[sides[n] ?? "bottom"]?.stack));
    const chrome = JSON.parse(JSON.stringify(l));
    const edges = ensureIdeaIslands(chrome);
    if ((!missing.length && !edges) || this.adding) return;
    this.adding = true;
    cx.timer.after(0, () => {
      this.adding = false;
      const tree = JSON.parse(JSON.stringify(layout()));
      for (const n of missing) {
        const stack = find(tree, SIDES[sides[n] ?? "bottom"].stack);
        if (stack && !stack.children.some((c) => c.id === TOOLS[n].child))
          stack.children = [...stack.children, { id: TOOLS[n].child, type: "block", content: TOOLS[n].content ?? { mod: "codenav", props: { view: n } } }];
      }
      ensureIdeaIslands(tree);
      run("layout.set", { layout: tree });
    });
  }
  render(cx) {
    if (this.edge === "left") { this.syncBars(cx); this.addMissing(cx); }
    const t = theme(), hidden = hiddenTools(), shown = (side) => toolsOn(side).filter((n) => !hidden.has(n));
    const upper = shown(this.edge), lower = shown(`${this.edge}2`), bottom = this.edge === "left" ? shown("bottom") : [];
    const separator = group => uiSeparator().id(`stripe-${this.edge}-${group}`).w(IDEA.stripeWidth - 12).mx(0).my(4);
    return ideaUI(v_flex()).id(`stripe-${this.edge}`).size_full().py(2).gap(2).items_center().bg(t.canvas)
      .children(upper.map((n) => this.button(n, t)))
      .when(upper.length > 0 && lower.length > 0, el => el.child(separator("slots")))
      .children(lower.map((n) => this.button(n, t)))
      .child(div().flex_1())
      .when(bottom.length > 0 && upper.length + lower.length > 0, el => el.child(separator("bottom")))
      .children(bottom.map((n) => this.button(n, t)));
  }
}

export class IslandBottom {
  init(p) { this.side = p.side; }
  render() { return uiIslandBottom().size_full(); }
}

// A stripe button's right-click menu: move to another side, or hide.
export class ToolMenu {
  init(_p, cx) { this.menu = new MenuController(cx); this.menu.focus.focus(); }
  release() { this.menu.release(); }
  render(cx) {
    const { name, overlay, group, items } = props() ?? {}, side = sideOf(name);
    if (group) return uiMenu("group-menu", actionMenuRows(items ?? groupItems(group, shared("codenav.customization"), ACTION_GROUPS)), this.menu, cx,
      { width: 280, maxHeight: 400, onClose: () => closeOverlay(overlay) });
    const headerGroup = TOOLS[name]?.headerGroup;
    const entries = [...(headerGroup ? [...actionMenuRows(groupItems(headerGroup, shared("codenav.customization"), ACTION_GROUPS), name), { separator: true }] : []),
      ...Object.keys(SIDES).filter((k) => k !== side).map((k) => ({ id: k, label: T(`Move to ${SIDES[k].label}`), action: () => moveTool(name, k) }))];
    if (toolOpen(name)) entries.push({ id: "hide", label: T("Hide"), action: () => toggleTool(name) });
    entries.push({ id: "remove", label: T("Remove from Stripe"), action: () => { if (toolOpen(name)) toggleTool(name); setToolHidden(name, true); } }, { separator: true },
      ...actionMenuRows(groupItems("ToolWindow.context", shared("codenav.customization"), ACTION_GROUPS), name));
    return uiMenu("tool-menu", entries, this.menu, cx,
      { width: 240, maxHeight: 260, onClose: () => closeOverlay(overlay) });
  }
}

// An empty child for each tool window stack: a side showing it has nothing to show, so it folds.
export class ToolEmpty {
  init(p) { this.side = SIDES[p?.side]; }
  render(cx) {
    const column = this.side && find(layout(), this.side.column);
    if (column && !column.hidden && find(layout(), this.side.stack)?.active === this.side.empty && !this.folding) {
      this.folding = true;
      cx.timer.after(0, () => { this.folding = false; hideSlot(this.side); });
    }
    return uiIslandBottom().size_full();
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
  return stopPress(h_flex().id(id).h(IDEA.toolbarButtonSize).px(8).gap(6).flex_none().items_center().rounded(6).cursor_pointer()
    .hover((s) => s.bg(t.hover)).on_click(action))
    .children(children);
}

const toolbarLabel = (text, color, max = 220) => h_flex().h_full().min_w(0).max_w(max).items_center().text_color(color)
  .child(div().truncate().child(text));

// A toolbar button drawn with an IntelliJ icon.
function ideaButton(id, name, tip, action) {
  return stopPress(uiIconButton(id, toolImage(name, IDEA.iconSize), action, { tip }));
}

// IntelliJ's run widget: the configuration (▾ picks or edits), run (rerun while it runs), stop, more.
function runWidget(t) {
  const st = runStore(), c = st.configs[st.selected] ?? st.configs[0], running = isRunning(c);
  const showTerminal = () => toggleTool("terminal", true);
  const menu = () => openOverlay({ mod: "codenav", props: { view: "runmenu" }, kind: "popup", width: 320, height: Math.min(360, 60 + st.configs.length * 32) });
  if (!c) return widget("tb-run-add", t, [toolImage("runAction", 16), toolbarLabel(T("Add Configuration…"), t.muted)], () => openRunConfigs());
  return h_flex().h(IDEA.toolbarButtonSize).flex_none().gap(2).items_center()
    .child(widget("tb-run-config", t, [toolImage("run", 15), toolbarLabel(c.name, t.foreground, 200), icon("chevron-down", 12).text_color(t.muted)], menu))
    .child(ideaButton("tb-run", running ? "rerunAction" : "runAction", running ? T("Rerun '{name}'", { name: c.name }) : T("Run '{name}'", { name: c.name }), () => runConfig(c, showTerminal)))
    .when(running, (e) => e.child(ideaButton("tb-stop", "stopAction", T("Stop '{name}'", { name: c.name }), () => stopConfig(c))))
    .child(ideaButton("tb-run-more", "moreVertical", T("More"), menu));
}

function actionContext() {
  const st = runStore(), config = st.configs[st.selected] ?? st.configs[0];
  return { layout: shared("layout") ?? "idea", workspace: spaces().find(s => s.active), document: editorSpec(), area: shared("codenav.area"),
    terminal: focused()?.terminal, runConfig: Boolean(config), running: isRunning(config), problemsOptions: shared("codenav.problemsOptions") ?? {} };
}
function dispatchAction(action, tool) {
  if (action.id === "codenav.hide-active" && tool) { if (toolOpen(tool)) toggleTool(tool); return; }
  run(action.command);
}
function actionButton(item, prefix, context = actionContext()) {
  const action = getAction(item.action), presentation = actionPresentation(action, context);
  if (!presentation.visible) return null;
  const shortcut = effectiveShortcuts(action.id, keys(), { layout: "idea", mod: context.document?.edit ? "activity" : "codenav" }).map(formatShortcut).join(", ");
  return uiIconButton(`${prefix}-${item.id}`, toolImage(item.icon ?? presentation.icon, IDEA.iconSize), () => {
    if (actionPresentation(action, actionContext()).enabled) dispatchAction(action);
  }, { tip: `${T(presentation.label)}${shortcut ? ` (${shortcut})` : ""}${presentation.reason ? ` · ${presentation.reason}` : ""}`, active: presentation.selected, disabled: !presentation.enabled });
}
function widgetAction(name) {
  if (name === "project") return () => openOverlay({ mod: "codenav", props: { view: "projects" }, kind: "popup", frame: "none", width: 480, height: Math.min(400, 43 + spaces().length * IDEA.rowHeight) });
  if (name === "run") return () => openOverlay({ mod: "codenav", props: { view: "runmenu" }, kind: "popup", frame: "none", width: 320, height: 360 });
  return null;
}
function actionMenuRows(items, tool, context = props()?.context ?? actionContext()) {
  return items.flatMap(item => {
    if (item.kind === "separator") return [{ separator: true }];
    if (item.kind === "widget") {
      const action = widgetAction(item.widget);
      return [{ id: item.id, label: T(item.widget === "run" ? "Run Configurations" : item.widget === "project" ? "Project" : "Branch"), disabled: !action, action }];
    }
    const action = getAction(item.action), presentation = actionPresentation(action, context);
    if (!presentation.visible) return [];
    return [{ id: item.id, label: `${presentation.selected ? "✓ " : ""}${T(presentation.label)}`, disabled: !presentation.enabled,
      icon: () => toolImage(item.icon ?? action.icon, 16), shortcut: effectiveShortcuts(action.id, keys(), { layout: "idea", mod: "codenav" }).map(formatShortcut).join(", "),
      action: () => dispatchAction(action, tool) }];
  });
}

export class Toolbar {
  init() {}
  item(item, t, space, context) {
    if (item.kind === "separator") return div().w(1).h(18).mx(5).flex_none().bg(uiColors().separator);
    if (item.kind === "action") return actionButton(item, "tb", context);
    if (item.kind !== "widget") return null;
    if (item.widget === "run") return runWidget(t);
    if (item.widget === "project") return widget("tb-project", t, [avatar(space?.name ?? "~"), toolbarLabel(space?.name ?? "~", t.foreground).font_semibold(), icon("chevron-down", 12).text_color(t.muted)], widgetAction("project"));
    if (item.widget === "branch" && space?.branch) return h_flex().id("tb-branch").h(IDEA.toolbarButtonSize).px(8).gap(6).flex_none().items_center()
      .child(icon("git-branch", 14).text_color(t.muted)).child(toolbarLabel(space.branch, t.foreground));
    return null;
  }
  render() {
    const t = theme(), w = window(), space = spaces().find((s) => s.active), context = actionContext();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const sections = Object.fromEntries(["left", "center", "right"].map(side => [side, groupItems(`MainToolbar.${side}`, shared("codenav.customization"), ACTION_GROUPS)
      .filter(item => item.kind !== "action" || actionPresentation(item.action, context).visible)
      .filter(item => item.kind !== "widget" || item.widget !== "branch" || Boolean(space?.branch))]));
    const estimate = item => item.kind === "widget" ? item.widget === "project" ? 180 : item.widget === "branch" ? 160 : 270 : item.kind === "separator" ? 12 : IDEA.toolbarButtonSize + 4;
    const overflow = [];
    let need = Object.values(sections).flat().reduce((sum, item) => sum + estimate(item), 0) + (mac ? 110 : 40);
    const available = this.width ?? 1400;
    for (const side of ["right", "left", "center"]) while (need > available && sections[side].length) {
      const item = sections[side].pop(); overflow.unshift(item); need -= estimate(item); if (overflow.length === 1) need += IDEA.toolbarButtonSize;
    }
    const group = side => h_flex().id(`tb-group-${side}`).h_full().min_w(0).gap(4).items_center()
      .when(side !== "center", el => el.flex_1())
      .when(side === "right", el => el.justify_end())
      .children(sections[side].map(item => this.item(item, t, space, context)).filter(Boolean));
    return ideaUI(h_flex()).size_full().pl(mac ? 80 : 10).pr(8).gap(4).items_center().bg(t.canvas).text_size(uiSize())
      .on_size_change((size, cx) => { if (this.width !== size.width) { this.width = size.width; cx.notify(); } })
      .on_mouse_down("right", (_event, cx) => { cx.stop_propagation(); openIdeaSettings("toolbars"); })
      .child(group("left")).child(group("center")).child(group("right"))
      .when(Boolean(overflow.length), el => el.child(uiIconButton("tb-overflow", toolImage("moreVertical", 16), () => openOverlay({ mod: "codenav", props: { view: "toolmenu", group: "MainToolbar.overflow", items: overflow, context: actionContext() }, kind: "popup", frame: "none", width: 280, height: Math.min(400, overflow.length * IDEA.rowHeight + 14) }), { tip: T("More") })));
  }
}

// -- a side's header, the same on every side: the tool window's name, what it adds (the
// terminal's tabs, Problems' and Notifications' summaries), then hide.
export class ToolHeader {
  init(p) { this.side = SIDES[p?.side] ? p.side : "bottom"; }
  tab(c, t) {
    const lead = panes().find((p) => p.tab === c.id && p.program?.agent)?.program ?? panes().find((p) => p.tab === c.id)?.program;
    const name = /^\d+$/.test(c.name) && lead?.name ? lead.name : c.name;
    return stopPress(h_flex().id(`th-t-${c.id}`).h(24).px(8).gap(6).flex_none().items_center().rounded(4).text_size(uiSize()).cursor_pointer()
      .bg(c.active ? "#233558" : "#00000000").text_color(c.active ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click(() => run("tab.select", { id: c.id })))
      .child(lead?.icon ? (lead.tint ? svg(lead.icon).size(12).text_color(t.muted) : image(lead.icon).size(12)) : icon("terminal", 12))
      .child(div().max_w(150).truncate().child(name))
      .when(c.status === "working", (el) => el.child(shared("layout") === "idea"
        ? uiSpinner(() => svg("mods/codenav/idea-icons/progress.svg"), { size: 12, tip: T("Working…") })
        : svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(c.status === "blocked" || c.status === "done", (el) => el.child(div().size(6).rounded(3).bg(t[c.status])))
      .when(c.active, (el) => el.child(iconButton(`th-x-${c.id}`, "x", T("Close tab"), () => run("tab.close", { id: c.id }), { size: 16, icon: 10 })));
  }
  render() {
    const t = theme(), side = SIDES[this.side];
    const active = toolsOn(this.side).find((n) => find(layout(), side.stack)?.active === TOOLS[n].child);
    const tabs = spaces().find((s) => s.active)?.tabs ?? [];
    // The island's top: its own rounded corners (the block's radius doesn't clip it).
    const content = h_flex().flex_1().min_w(0).gap(8).items_center()
      .when(Boolean(active), (e) => e.child(stopPress(div().id(`th-title-${this.side}`).flex_none().text_size(uiSize()).font_semibold().text_color(t.foreground)
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "codenav", props: { view: "toolmenu", name: active }, kind: "popup", frame: "none", width: 240, height: 260 }); })
        .child(T(TOOLS[active].label)))))
      .child(h_flex().id(`th-tabs-${this.side}`).flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_scrollbar()
        .when(active === "terminal", (e) => e.children(tabs.map((c) => this.tab(c, t)))
          .child(iconButton(`th-new-${this.side}`, "plus", T("New Terminal or Agent"), () => openOverlay({ mod: "codenav", props: { view: "newterminal" }, kind: "popup", frame: "none", width: 300, height: 400 }))))
        .when(active === "problems", (e) => e.child(problemsSummary(t)))
        );
    const actions = TOOLS[active]?.headerGroup
      ? groupItems(TOOLS[active].headerGroup, shared("codenav.customization"), ACTION_GROUPS).map(item => item.kind === "separator" ? div().w(1).h(16).mx(3).bg(uiColors().separator) : item.kind === "action" ? actionButton(item, `th-${active}`) : null).filter(Boolean)
      : (TOOLS[active]?.headerActions ?? []).map(a => iconButton(`th-${active}-${a.id}`, a.icon, T(a.label), () => run(a.command)));
    actions.push(uiIconButton(`th-menu-${this.side}`, toolImage("moreVertical", 16), () => openOverlay({ mod: "codenav", props: { view: "toolmenu", name: active }, kind: "popup", frame: "none", width: 240, height: 260 })));
    actions.push(iconButton(`th-hide-${this.side}`, "minus", T("Hide (Shift+Esc)"), () => hideSlot(side)));
    return uiToolHeader(`tool-header-${this.side}`, "", { content, actions }).size_full().min_w(0).rounded_t(IDEA.islandRadius);
  }
}

// -- Structure and Problems -------------------------------------------------------------------
const jump = (path, line, col = 0) => openPath(`${path}:${line + 1}:${col + 1}`);

export class Structure {
  init() { this.collapsed = new Set(); }
  render() {
    const t = theme(), syms = forShown("codenav.symbols"), caret = forShown("codenav.caret"), items = syms?.items ?? [];
    let hiddenDepth = Infinity;
    return ideaUI(v_flex()).size_full().bg(t.surface).text_color(t.foreground)
      .child(!syms || !items.length ? div().px(12).py(4).text_color(t.dim).child(T(!editorSpec() ? "Open a file to see its structure." : !syms ? "Waiting for the language server…" : "No structure for this file."))
        : v_flex().id("tw-structure").flex_1().min_h(0).overflow_y_scrollbar().pb(8).children(items.slice(0, 1500).flatMap((s, i) => {
          if (s.depth > hiddenDepth) return [];
          hiddenDepth = Infinity;
          const key = `${s.start}:${s.col}:${s.name}`, parent = items[i + 1]?.depth > s.depth, collapsed = this.collapsed.has(key);
          if (collapsed) hiddenDepth = s.depth;
          return [uiTreeRow(`tw-s-${i}`, s.name, { depth: s.depth, expanded: parent ? !collapsed : undefined,
            selected: Boolean(caret && s.line === caret.line), graphic: symbolImage(s.kind, syms.path, 15),
            onClick: (_event, cx) => { if (parent) { collapsed ? this.collapsed.delete(key) : this.collapsed.add(key); cx.notify(); } jump(syms.path, s.line, s.col); },
          }).tooltip(s.detail || s.name).child(div().min_w(0).truncate().text_color(t.dim).child(s.detail || ""))];
        })));
  }
}

export class Problems {
  init(_props, cx) { this.selected = null; this.focus = cx.focus_handle(); }
  release() { this.focus?.release(); }
  data() {
    const p = forShown("codenav.problems"), scope = shared("codenav.problemsScope") ?? "file", spec = editorSpec(), options = shared("codenav.problemsOptions") ?? {};
    const all = Object.values(shared("codenav.problemFiles") ?? {}).filter(file => file.space === editorKey() && (file.on ?? null) === (spec?.on ?? null));
    const files = (scope === "project" ? all : p ? [p] : []).map(file => ({ ...file, items: file.items.filter(item => !options.errorsOnly || item.severity === 1) })).filter(file => file.items.length);
    return { p, scope, options, files, rows: files.flatMap(file => file.items.map(diagnostic => ({ file, diagnostic, id: JSON.stringify([file.on ?? null, file.path, diagnostic.line, diagnostic.col, diagnostic.source, diagnostic.code, diagnostic.message]) }))) };
  }
  activate(row) {
    if (row) openPath(`${row.file.path}:${row.diagnostic.line + 1}:${row.diagnostic.col + 1}`, row.file.on);
  }
  select(row, cx, activate = false) {
    this.selected = row.id;
    if (activate || this.data().options.autoscroll) this.activate(row);
    cx.notify();
  }
  key(event, cx) {
    const rows = this.data().rows, at = rows.findIndex(row => row.id === this.selected);
    const index = event.key === "down" ? Math.min(rows.length - 1, at + 1) : event.key === "up" ? Math.max(0, at < 0 ? rows.length - 1 : at - 1) : event.key === "home" ? 0 : event.key === "end" ? rows.length - 1 : null;
    if (index !== null) { if (rows[index]) this.select(rows[index], cx); }
    else if (event.key === "enter") this.activate(rows[at]);
    else return;
    cx.stop_propagation();
  }
  render() {
    const t = theme(), { p, scope, options, files, rows } = this.data();
    const renderRow = (row, indent) => {
      const d = row.diagnostic;
      return uiListRow(`problem-${row.id}`, [
        icon(d.severity === 1 ? "x" : "alert", 14).text_color(d.severity === 1 ? t.ansi1 : d.severity === 2 ? t.ansi3 : t.muted),
        div().flex_1().min_w(0).truncate().child(`${d.source ? d.source + " - " : ""}${d.code ? d.code + ": " : ""}${d.message}`),
        div().flex_none().text_color(t.dim).child(`:${d.line + 1}`),
      ], { indent, selected: this.selected === row.id, focused: this.focus.is_focused(), onClick: (event, cx) => this.select(row, cx, event.click_count > 1) }).tooltip(d.message);
    };
    return ideaUI(v_flex()).size_full().min_h(0).bg(t.surface).text_color(t.foreground)
      .track_focus(this.focus).on_mouse_down("left", () => this.focus.focus()).on_key_down((event, cx) => this.key(event, cx))
      .child(h_flex().flex_none().h(26).px(6).gap(4).items_center()
        .child(div().flex_1().text_size(uiSize(11)).text_color(t.dim).child(scope === "project" ? T("Diagnostics from opened files") : T("Current file")))
        .child(div().text_size(uiSize(11)).text_color(t.dim).child(`${rows.length} ${T("Problems")}`)))
      .child(v_flex().id("tw-problems").flex_1().min_h(0).overflow_y_scrollbar().children(files.length ? files.flatMap(file => [
        uiListRow(`problem-file-${file.path}`, [ideaImage(file.path, false, 16), div().flex_none().child(basename(file.path)), div().min_w(0).flex_1().truncate().text_color(t.dim).child(tilde(file.path)), div().flex_none().text_color(t.dim).child(String(file.items.length))], { interactive: false }),
        ...(options.groupSource ? [...new Set(file.items.map(item => item.source || T("Other")))].flatMap(source => [
          uiListRow(`problem-source-${file.path}-${source}`, [source], { indent: 20, interactive: false }),
          ...rows.filter(row => row.file.path === file.path && (row.diagnostic.source || T("Other")) === source).map(row => renderRow(row, 36)),
        ]) : rows.filter(row => row.file.path === file.path).map(row => renderRow(row, 24))),
      ]) : [div().px(12).py(8).text_color(t.dim).child(T(options.errorsOnly ? "No errors in this scope." : scope === "project" ? "No problems in opened files." : p ? "No problems in this file." : "Open a file to see its problems."))]));
  }
}

// -- Notifications: what Herdr tells you about agents (finished, waiting for you), kept in shared
// "codenav.notifications" by the status item (status.js), newest first; click to go there.
const ago = (at) => { const s = Math.max(0, Math.round((Date.now() - at) / 1000)); return s < 60 ? T("just now") : s < 3600 ? T("{n} min ago", { n: Math.floor(s / 60) }) : s < 86400 ? T("{n} h ago", { n: Math.floor(s / 3600) }) : new Date(at).toLocaleDateString(); };
export class Notifications {
  init(_props, cx) { cx.timer.every(60000, cx => cx.notify()); }
  render() {
    const t = theme(), list = shared("codenav.notifications") ?? [];
    return ideaUI(v_flex()).size_full().min_h(0).bg(t.surface).text_color(t.foreground)
      .child(h_flex().flex_none().h(32).px(14).items_center().text_color(t.dim)
        .child(div().flex_1().child(T("Timeline")))
        .child(div().id("notifications-clear").text_color(t.accent).cursor_pointer().on_click(() => run("codenav.notifications-clear")).child(T("Clear all"))))
      .child(v_flex().id("tw-notifications").flex_1().min_h(0).overflow_y_scrollbar().px(7).gap(10).pb(8)
        .children(list.length ? list.map((note, i) => uiNoticeCard(`notification-${note.id ?? i}`, { title: note.title, body: note.body || note.where }, {
          graphic: div().mt(2).size(14).rounded_full().bg(note.level === "error" || note.level === "blocked" ? t.ansi1 : note.level === "warning" ? t.ansi3 : "#6587F5").flex().items_center().justify_center().text_color("#FFFFFF").text_size(11).child(note.level === "error" ? "!" : "i"),
          trailing: div().flex_none().text_size(uiSize(11)).text_color(t.dim).child(ago(note.at)),
          onClick: () => { if (note.action?.name) run(note.action.name, note.action.args ?? {}); else { if (note.space) run("space.select", { id: note.space }); if (note.terminal) run("agent.focus", { terminal: note.terminal }); } },
        })) : [div().px(7).text_color(t.dim).child(T("No notifications yet. Agents that finish or wait for you show here."))]));
  }
}

// The header lines of Problems and Notifications.
function problemsSummary(t) {
  const p = forShown("codenav.problems"), scope = shared("codenav.problemsScope") ?? "file";
  return h_flex().gap(6).items_center().children([["file", `${T("File")}  ${p?.items?.length ?? 0}`], ["project", T("Project Errors")]].map(([id, label]) =>
    uiListRow(`problem-scope-${id}`, [label], { selected: scope === id, onClick: () => setShared("codenav.problemsScope", id) }).flex_none()));
}
// -- the status bar's path: folders › file › symbols, then Ln:Col ----------------------------
export class Crumbs {
  init() {}
  render() {
    const t = theme(), s = editorSpec(), caret = forShown("codenav.caret");
    const parts = s ? [...(s.rel ?? tilde(s.path)).split("/").filter(Boolean), ...(caret?.scope ?? [])] : [];
    return ideaUI(h_flex()).size_full().min_w(0).px(10).gap(5).items_center().bg(t.canvas).text_size(uiSize(12)).text_color(t.muted)
      .child(h_flex().flex_1().min_w(0).gap(5).items_center().overflow_hidden()
        .children(parts.flatMap((p, i) => [i ? div().flex_none().text_color(t.dim).child("›") : null, div().flex_none().max_w(220).truncate()
          .when(i === parts.length - 1, (e) => e.text_color(t.foreground)).child(p)]).filter(Boolean)))
      .when(Boolean(caret) && shared("layout") !== "idea", (e) => e.child(div().flex_none().child(`${caret.line + 1}:${caret.col + 1}`)).child(div().flex_none().child("LF")).child(div().flex_none().child("UTF-8")));
  }
}

// -- popups ------------------------------------------------------------------------------------
export class Projects {
  init(_p, cx) { this.menu = new MenuController(cx, Math.max(0, spaces().findIndex((s) => s.active))); this.menu.focus.focus(); }
  release() { this.menu.release(); }
  render(cx) {
    const t = theme(), { overlay } = props() ?? {}, list = spaces();
    const done = () => closeOverlay(overlay);
    // The persistent status view owns the asynchronous picker after this menu closes.
    const openFolder = () => run("codenav.open-folder");
    const rows = list.map(s => ({ id: `pj-${s.id}`, label: s.name, icon: () => avatar(s.name, 18),
      shortcut: s.machine ? `${s.machine}:${s.folder ?? ""}` : tilde(s.folder ?? ""), action: () => run("space.select", { id: s.id }) }));
    rows.push({ separator: true }, { id: "pj-open", label: T("Open Folder…"), icon: () => icon("folder", 14).text_color(t.muted), action: openFolder });
    return uiMenu("project-menu", rows, this.menu, cx, { width: 480, maxHeight: 400, onClose: done });
  }
}
