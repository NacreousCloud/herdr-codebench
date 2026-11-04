// IntelliJ-style settings for the idea layout. Personal Herdr settings are
// changed with the same optimistic file writes as Herdr's own settings view.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState, v_virtual_list, Scrollbar } from "gpui-base";
import { shared, setShared, settings, keys, theme, run, props, closeOverlay, openOverlay, appHome, readTextFile, writeTextFile } from "herdr";
import { uiSize, IDEA, uiInputBox, uiButton, uiToolbar, uiColors, uiCaption, uiSettingsShell, uiTreeRow, uiIconButton, uiCheckbox, MenuController, NOTIFICATION_GROUPS } from "./idea-design.js";
import { icon, button, codeFont } from "./common.js";
import { T } from "./i18n.js";
import { openLspSetup } from "./lsp-setup.js";

import { TOOLS, SIDES, currentSides, DEFAULT_SIDES, hiddenTools, arrange } from "./tool-windows.js";
import { orderedTools } from "./tool-layout.js";
import { toolImage } from "./ideaicons.js";
import { ACTION_GROUPS, listActions, getAction, formatShortcut, normalizeChord } from "./actions.js";
import { stageBindingEdits, applyBindingEdits, validateChord } from "./keymap-model.js";
import { groupItems, customizeGroup, restoreGroup, restoreKnownGroups, mergeCustomization } from "./toolbar-model.js";
const copy = value => JSON.parse(JSON.stringify(value ?? {}));

// Re-read on a rejected optimistic write so unrelated concurrent edits survive.
// Parse/domain errors stay outside the retry; only writes can be retried.
async function updateJsonFile(path, update) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await readTextFile(path), document = raw ? JSON.parse(raw) : {};
    const next = update(document) ?? document;
    try { await writeTextFile(path, JSON.stringify(next, null, 2) + "\n", raw); return next; }
    catch (error) { if (attempt === 2) throw error; }
  }
}

export const openIdeaSettings = (page = "appearance") => openOverlay({
  mod: "codenav", props: { view: "settings", page }, kind: "dialog", frame: "none", width: 900, height: 700,
});

const PAGES = [
  ["appearance", "Appearance & Behavior", "Appearance"],
  ["toolbars", "Appearance & Behavior", "Menus and Toolbars"],
  ["notifications", "Appearance & Behavior", "Notifications"],
  ["editor", "Editor", "Font"],
  ["terminal", "Tools", "Terminal"],
  ["lsp", "Tools", "Language Servers"],
  ["keymap", "Keymap", "Keymap"],
];
const actionLabel = action => T(getAction(action)?.label ?? action.replace(/^[^.]+\./, "").replace(/-/g, " "));
const bindingGroup = action => getAction(action)?.category ?? "Other";
const editableSection = section => ["layout:idea", "mod:codenav", "mod:activity", "terminal"].includes(section);

export default class IdeaSettings {
  init(p, cx) {
    this.page = p?.page === "windows" ? "toolbars" : PAGES.some(([id]) => id === p?.page) ? p.page : "appearance";
    const s = settings(), a = shared("codenav.appearance") ?? {};
    this.draft = {
      uiFont: a.uiFont ?? s.ui_font_family ?? ".AppleSystemUIFont", uiSize: a.uiSize ?? 13,
      editorFont: a.editorFont ?? codeFont().family, editorSize: a.editorSize ?? codeFont().size,
      terminalFont: s.font_family ?? "JetBrains Mono", terminalSize: s.font_size ?? 14, compact: a.compact !== false,
      toolSides: currentSides(), toolHidden: [...hiddenTools()],
    };
    this.savedRawToolOrder = copy(shared("codenav.toolOrder"));
    this.draft.toolOrder = Object.fromEntries(Object.keys(SIDES).map(side => [side, orderedTools(Object.keys(TOOLS).filter(name => this.draft.toolSides[name] === side), this.savedRawToolOrder[side])]));
    this.toolSide = "left";
    this.saved = JSON.stringify(this.draft);
    this.savedToolSides = { ...this.draft.toolSides };
    this.customization = copy(shared("codenav.customization"));
    this.savedCustomization = copy(this.customization);
    this.notificationPolicy = copy(shared("codenav.notificationPolicy"));
    this.savedNotificationPolicy = copy(this.notificationPolicy);
    this.toolbarGroup = "MainToolbar.left"; this.toolbarItem = null; this.addingAction = false; this.addSelection = null;
    this.customSelected = p?.page === "windows" ? "tools" : "group:MainToolbar.left";
    this.customCollapsed = new Set(["headers", "group:ToolWindow.context", "group:Editor.context", "group:HTTP.toolbar", "group:Review.toolbar"]);
    this.customMenu = new MenuController(cx);
    this.customSearch = InputState.new({ placeholder: T("Search menus, toolbars and tool windows") }); this.customQuery = "";
    this.customSearch.on("change", (_e, cx) => {
      this.customQuery = this.customSearch.value().trim().toLowerCase();
      const rows = this.customRows();
      if (!rows.some(row => row.id === this.customSelected)) this.selectCustom(rows[0], cx, false, false);
      this.customMenu.ensureVisible(0); cx.notify();
    });
    this.focus = cx.focus_handle(); this.focus.focus();
    this.shortcutFocus = cx.focus_handle();
    this.bindingBase = keys();
    this.pendingBindings = []; this.collapsed = new Set(["Tool Windows", "Navigation", "Editor", "Run", "Appearance & Behavior", "Other"]); this.sidebarCollapsed = new Set();
    this.inputs = {};
    for (const field of ["uiFont", "editorFont", "terminalFont"]) {
      const input = InputState.new(); input.set_value(this.draft[field]);
      input.on("change", (_e, cx) => { this.draft[field] = input.value(); this.error = null; cx.notify(); });
      input.on("submit", (_e, cx) => this.apply(cx, true));
      this.inputs[field] = input;
    }
    this.search = InputState.new({ placeholder: T("Search settings") });
    this.query = "";
    this.search.on("change", (_e, cx) => { this.query = this.search.value().trim().toLowerCase(); cx.notify(); });
    this.keySearch = InputState.new({ placeholder: T("Search actions or shortcuts") }); this.keyQuery = "";
    this.keySearch.on("change", (_e, cx) => { this.keyQuery = this.keySearch.value().trim().toLowerCase(); cx.notify(); });
    this.actionSearch = InputState.new({ placeholder: T("Search actions or widgets") }); this.actionQuery = "";
    this.actionSearch.on("change", (_e, cx) => { this.actionQuery = this.actionSearch.value().trim().toLowerCase(); cx.notify(); });
    this.actionSearch.on("submit", (_e, cx) => this.addToolbarItem(cx));
    this.shortcutInput = InputState.new({ placeholder: "cmd-shift-o" });
    this.shortcutInput.on("change", (_e, cx) => { this.newShortcut = this.shortcutInput.value(); this.error = null; cx.notify(); });
    this.shortcutInput.on("submit", (_e, cx) => this.stageShortcut(cx));
  }

  release() {
    for (const input of [...Object.values(this.inputs), this.search, this.keySearch, this.actionSearch, this.shortcutInput, this.customSearch]) input?.release?.();
    this.customMenu.release(); this.customMenu.focus.release();
    this.focus.release(); this.shortcutFocus.release();
  }

  bindings() {
    const rows = new Map();
    for (const action of listActions()) {
      const section = action.keymapSection ?? (action.owner === "activity" ? "mod:activity" : "layout:idea"), id = `${section}:${action.id}`;
      rows.set(id, { id, action: action.id, section, label: T(action.label), chords: [], group: action.category });
    }
    for (const binding of stageBindingEdits(this.bindingBase, this.pendingBindings).filter(k => editableSection(k.section)
      && !(k.section === "terminal" && k.action.startsWith("codenav.key:") && normalizeChord(k.action.slice(12)) === normalizeChord(k.keys)))) {
      const id = `${binding.section}:${binding.action}`;
      const row = rows.get(id) ?? { id, action: binding.action, section: binding.section, label: actionLabel(binding.action), chords: [], group: bindingGroup(binding.action) };
      if (!row.chords.includes(binding.keys)) row.chords.push(binding.keys);
      rows.set(id, row);
    }
    return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  beginShortcut(cx, mode = "add") {
    const row = this.bindings().find(item => item.id === this.selectedBinding);
    if (!row || mode === "replace" && !row.chords.includes(this.selectedChord)) return;
    this.capturing = true; this.shortcutMode = mode; this.replacingChord = mode === "replace" ? this.selectedChord : null;
    this.newShortcut = ""; this.shortcutInput.set_value(""); this.shortcutInput.focus(); this.error = null; cx.notify();
  }
  captureShortcut(event, cx) {
    cx.stop_propagation();
    if (event.key === "escape") { this.capturing = false; this.focus.focus(); cx.notify(); return; }
    if (["shift", "control", "alt", "cmd", "meta", "fn"].includes(event.key)) return;
    this.newShortcut = normalizeChord(event.keystroke ?? event.key); this.shortcutInput.set_value(this.newShortcut); cx.notify();
  }
  editBindings(edits, cx) {
    try {
      let pending = this.pendingBindings.slice();
      for (const edit of edits) {
        const chord = validateChord(edit.chord), previous = pending.find(item => item.section === edit.section && item.chord === chord);
        const expected = previous?.expected ?? this.bindingBase.find(item => item.section === edit.section && normalizeChord(item.keys) === chord)?.action ?? null;
        pending = pending.filter(item => item.section !== edit.section || item.chord !== chord);
        if (edit.action !== expected) pending.push({ ...edit, chord, expected });
      }
      stageBindingEdits(this.bindingBase, pending);
      this.pendingBindings = pending; this.error = null; return true;
    } catch (error) { this.error = String(error.message ?? error); cx.notify(); return false; }
  }
  stageShortcut(cx) {
    const row = this.bindings().find(r => r.id === this.selectedBinding), chord = this.newShortcut;
    if (!row || !chord) return;
    const normalized = normalizeChord(chord), existing = stageBindingEdits(this.bindingBase, this.pendingBindings).find(item => item.section === row.section && normalizeChord(item.keys) === normalized);
    if (existing && existing.action !== row.action) { this.error = T("This shortcut is already assigned."); cx.notify(); return; }
    const edits = this.replacingChord && normalizeChord(this.replacingChord) !== normalized ? [{ section: row.section, chord: this.replacingChord, action: null }] : [];
    edits.push({ section: row.section, chord, action: row.action });
    if (!this.editBindings(edits, cx)) return;
    this.selectedChord = normalized;
    this.capturing = false; this.focus.focus(); cx.notify();
  }
  removeShortcut(cx) {
    const row = this.bindings().find(item => item.id === this.selectedBinding);
    if (row && this.selectedChord && this.editBindings([{ section: row.section, chord: this.selectedChord, action: null }], cx)) {
      this.selectedChord = null; this.capturing = false; cx.notify();
    }
  }
  async saveShortcuts() {
    if (!this.pendingBindings.length) return;
    const document = await updateJsonFile(`${appHome()}/keys.json`, latest => applyBindingEdits(latest, this.pendingBindings));
    this.bindingBase = Object.entries(document).flatMap(([section, bindings]) => Object.entries(bindings).map(([keys, action]) => ({ section, keys, action })));
    this.pendingBindings = [];
  }

  apply(cx, close = false) {
    if (this.saving) return;
    if (["uiFont", "editorFont", "terminalFont"].some((f) => !this.draft[f].trim())) {
      this.error = T("Enter a font family."); cx.notify(); return;
    }
    this.saving = true; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const d = copy(this.draft), s = settings();
        const restoreToolLayout = this.restoreToolLayout;
        const custom = copy(this.customization), policy = copy(this.notificationPolicy);
        // Validate conflicts before changing other preferences. Only edited groups
        // are merged, preserving future fields and concurrent unrelated groups.
        mergeCustomization(this.savedCustomization, custom, shared("codenav.customization") ?? {});
        mergeCustomization(this.savedNotificationPolicy, policy, shared("codenav.notificationPolicy") ?? {});
        this.mergedToolOrder(d);
        await this.saveShortcuts();
        if (d.terminalFont !== s.font_family || d.terminalSize !== s.font_size) {
          await updateJsonFile(`${appHome()}/settings.json`, person => {
            person.font = d.terminalFont.trim(); person.font_size = d.terminalSize;
          });
        }
        setShared("codenav.appearance", { ...(shared("codenav.appearance") ?? {}),
          uiFont: d.uiFont.trim(), uiSize: d.uiSize, editorFont: d.editorFont.trim(), editorSize: d.editorSize, compact: d.compact });
        const moved = Object.fromEntries(Object.entries(d.toolSides).filter(([name, side]) => TOOLS[name] && SIDES[side] && (restoreToolLayout || side !== this.savedToolSides[name])));
        if (Object.keys(moved).length) {
          setShared("codenav.toolSides", { ...(shared("codenav.toolSides") ?? {}), ...moved });
          arrange(moved);
        }
        const previous = JSON.parse(this.saved);
        if (JSON.stringify(d.toolHidden) !== JSON.stringify(previous.toolHidden)) {
          const hidden = new Set(hiddenTools());
          for (const name of Object.keys(TOOLS)) {
            if (d.toolHidden.includes(name) === previous.toolHidden.includes(name)) continue;
            d.toolHidden.includes(name) ? hidden.add(name) : hidden.delete(name);
          }
          setShared("codenav.toolHidden", [...hidden]);
        }
        this.savedToolSides = { ...d.toolSides };
        const toolOrder = this.mergedToolOrder(d);
        if (JSON.stringify(toolOrder) !== JSON.stringify(shared("codenav.toolOrder") ?? {})) setShared("codenav.toolOrder", toolOrder);
        this.savedRawToolOrder = copy(toolOrder);
        const customization = mergeCustomization(this.savedCustomization, custom, shared("codenav.customization") ?? {});
        const notificationPolicy = mergeCustomization(this.savedNotificationPolicy, policy, shared("codenav.notificationPolicy") ?? {});
        if (JSON.stringify(custom) !== JSON.stringify(this.savedCustomization)) setShared("codenav.customization", customization);
        if (JSON.stringify(policy) !== JSON.stringify(this.savedNotificationPolicy)) setShared("codenav.notificationPolicy", notificationPolicy);
        this.customization = copy(customization); this.savedCustomization = copy(customization);
        this.notificationPolicy = copy(notificationPolicy); this.savedNotificationPolicy = copy(notificationPolicy);
        this.restoreToolLayout = false;
        this.saved = JSON.stringify(d);
        if (close) closeOverlay(props().overlay);
      } catch (e) { this.error = String(e); }
      this.saving = false; cx.notify();
    });
  }

  field(name, sizeKey, t) {
    return h_flex().gap(10).items_center()
      .child(uiInputBox(Input.new(this.inputs[name]).text_size(uiSize()), { error: Boolean(this.error) }).w(300))
      .child(div().text_color(t.muted).child(T("Size:")))
      .child(h_flex().h(IDEA.inputHeight).items_center().rounded(IDEA.controlRadius).border_1().border_color(t.input)
        .child(this.step(`${sizeKey}-minus`, "−", () => { this.draft[sizeKey] = Math.max(sizeKey === "uiSize" ? 9 : 8, this.draft[sizeKey] - 1); }))
        .child(div().w(28).text_center().child(String(this.draft[sizeKey])))
        .child(this.step(`${sizeKey}-plus`, "+", () => { this.draft[sizeKey] = Math.min(sizeKey === "uiSize" ? 24 : 36, this.draft[sizeKey] + 1); })));
  }
  step(id, label, action) {
    return uiButton(`settings-${id}`, label, (_e, cx) => { action(); cx.notify(); }, { small: true, disabled: this.saving }).w(26).px(0);
  }
  label(text, child, t) {
    return v_flex().gap(8).child(div().text_color(t.foreground).child(T(text))).child(child);
  }
  preview(t, editor = false, terminal = false) {
    const family = this.draft[editor ? "editorFont" : terminal ? "terminalFont" : "uiFont"];
    const size = this.draft[editor ? "editorSize" : terminal ? "terminalSize" : "uiSize"];
    return v_flex().mt(12).p(16).gap(8).min_h(130).rounded(4).border_1().border_color(t.input).bg(t.background)
      .font_family(family).text_size(size).text_color(editor || terminal ? "#BCBEC4" : t.foreground)
      .child(editor ? "class Application {" : terminal ? "~/project  main" : T("Project"))
      .child(editor ? '    val message = "Hello, world!"' : terminal ? "$ ./gradlew test" : "  src / main / kotlin")
      .child(editor ? "}" : terminal ? "BUILD SUCCESSFUL" : T("Search Everywhere"));
  }

  body(t) {
    if (this.page === "appearance") return v_flex().gap(20)
      .child(this.label("Theme:", div().h(28).px(10).flex().items_center().rounded(4).border_1().border_color(t.input).child("Islands Dark"), t))
      .child(this.label("Interface font:", this.field("uiFont", "uiSize", t), t))
      .child(uiCheckbox("settings-compact", T("Compact mode"), (_e, cx) => { this.draft.compact = !this.draft.compact; cx.notify(); },
        { checked: this.draft.compact, disabled: this.saving }))
      .child(this.label("Zoom:", uiToolbar("settings-zoom", [
        button("settings-zoom-out", "−", () => run("app.zoom_out")),
        div().w(50).text_center().child(`${Math.round((Number(settings().zoom) || 1) * 100)}%`),
        button("settings-zoom-in", "+", () => run("app.zoom_in")),
        button("settings-zoom-reset", T("Reset"), () => run("app.zoom_reset")),
      ]), t))
      .child(this.preview(t));
    if (this.page === "editor" || this.page === "terminal") {
      const editor = this.page === "editor";
      return v_flex().gap(18)
        .child(this.label("Font:", this.field(editor ? "editorFont" : "terminalFont", editor ? "editorSize" : "terminalSize", t), t))
        .child(this.preview(t, editor, !editor));
    }
    if (this.page === "lsp") return v_flex().gap(12)
      .child(uiCaption(T("Choose a language, install its SDK and language server, then check and start it.")))
      .child(uiButton("settings-lsp-setup", T("Open Installation Guide"), () => openLspSetup()));
    if (this.page === "toolbars") return this.toolbarsBody();
    if (this.page === "notifications") return this.notificationsBody();
    return this.keymapBody();
  }

  windowTools(side = this.toolSide) {
    return orderedTools(Object.keys(TOOLS).filter(name => this.draft.toolSides[name] === side), this.draft.toolOrder[side]);
  }
  moveWindowTool(name, to, cx) {
    if (!TOOLS[name] || !SIDES[to] || this.saving) return;
    this.draft.toolSides[name] = to;
    for (const side of Object.keys(SIDES)) this.draft.toolOrder[side] = this.draft.toolOrder[side].filter(item => item !== name);
    this.draft.toolOrder[to].push(name);
    this.toolSide = to; cx.notify();
  }
  reorderWindowTool(name, direction, cx) {
    const items = this.windowTools(), at = items.indexOf(name), to = at + direction;
    if (this.saving || at < 0 || to < 0 || to >= items.length) return;
    [items[at], items[to]] = [items[to], items[at]];
    this.draft.toolOrder[this.toolSide] = items; cx.notify();
  }
  mergedToolOrder(draft) {
    const before = JSON.parse(this.saved).toolOrder, edited = copy(this.savedRawToolOrder);
    for (const side of Object.keys(SIDES)) {
      if (JSON.stringify(before[side]) === JSON.stringify(draft.toolOrder[side])) continue;
      const future = (this.savedRawToolOrder[side] ?? []).filter(name => !TOOLS[name]);
      edited[side] = [...draft.toolOrder[side], ...future];
    }
    return mergeCustomization({ groups: this.savedRawToolOrder }, { groups: edited }, { groups: shared("codenav.toolOrder") ?? {} }).groups;
  }
  restoreWindowTools(cx) {
    this.draft.toolSides = { ...this.draft.toolSides, ...DEFAULT_SIDES };
    this.draft.toolOrder = Object.fromEntries(Object.keys(SIDES).map(side => [side, Object.keys(TOOLS).filter(name => DEFAULT_SIDES[name] === side)]));
    this.draft.toolHidden = this.draft.toolHidden.filter(name => !TOOLS[name]);
    this.restoreToolLayout = true; cx.notify();
  }

  toolbarItems(id = this.toolbarGroup) { return groupItems(id, this.customization, ACTION_GROUPS); }
  setToolbarItems(items, id = this.toolbarGroup) {
    this.customization = customizeGroup(this.customization, id, items, ACTION_GROUPS);
  }
  toolbarItemLabel(item) {
    if (item.kind === "separator") return T("Separator");
    if (item.kind === "widget") return T({ project: "Project Widget", branch: "Branch Widget", run: "Run Widget", filename: "Current File" }[item.widget] ?? item.widget);
    if (item.kind !== "action") return item.label ?? item.id;
    return actionLabel(item.action);
  }
  editToolbar(op, cx) {
    const items = this.toolbarItems(), at = items.findIndex(item => item.id === this.toolbarItem);
    if (op === "restore") { this.customization = restoreGroup(this.customization, this.toolbarGroup); this.toolbarItem = null; }
    else if (op === "restore-all") { this.customization = restoreKnownGroups(this.customization, ACTION_GROUPS); this.toolbarItem = null; }
    else if (op === "separator") {
      this.itemSequence = (this.itemSequence ?? 0) + 1;
      const item = { id: `user.separator.${Date.now()}.${this.itemSequence}`, kind: "separator" };
      items.splice(at < 0 ? items.length : at + 1, 0, item); this.setToolbarItems(items); this.toolbarItem = item.id;
    } else if (at >= 0) {
      if (op === "remove") { items.splice(at, 1); this.toolbarItem = items[Math.min(at, items.length - 1)]?.id ?? null; }
      else if (op === "up" && at > 0) [items[at - 1], items[at]] = [items[at], items[at - 1]];
      else if (op === "down" && at < items.length - 1) [items[at + 1], items[at]] = [items[at], items[at + 1]];
      this.setToolbarItems(items);
    }
    this.error = null; cx.notify();
  }
  addCandidates() {
    const widgets = Object.values(ACTION_GROUPS).flatMap(group => group.items).filter(item => item.kind === "widget");
    const seen = new Set();
    const choices = [...widgets.filter(item => this.toolbarGroup.startsWith("MainToolbar.") && !seen.has(item.widget) && seen.add(item.widget)).map(item => ({ key: `widget:${item.widget}`, kind: "widget", widget: item.widget, label: this.toolbarItemLabel(item), category: "Widgets" })),
      ...listActions().map(action => ({ key: action.id, kind: "action", action: action.id, label: T(action.label), category: action.category }))];
    return choices.filter(choice => !this.actionQuery || `${choice.label} ${choice.key} ${choice.category}`.toLowerCase().includes(this.actionQuery));
  }
  addToolbarItem(cx) {
    const candidates = this.addCandidates(), choice = candidates.find(item => item.key === this.addSelection) ?? candidates[0];
    if (!choice || this.saving) return;
    const items = this.toolbarItems(), at = items.findIndex(item => item.id === this.toolbarItem);
    this.itemSequence = (this.itemSequence ?? 0) + 1;
    const item = { id: `user.${choice.kind}.${Date.now()}.${this.itemSequence}`, kind: choice.kind, ...(choice.kind === "widget" ? { widget: choice.widget } : { action: choice.action }) };
    items.splice(at < 0 ? items.length : at + 1, 0, item); this.setToolbarItems(items);
    this.toolbarItem = item.id; this.addingAction = false; this.addSelection = null;
    this.customCollapsed.delete(`group:${this.toolbarGroup}`);
    this.customSelected = `item:${this.toolbarGroup}/${item.id}`; this.revealCustom(); cx.notify();
  }
  moveToolbarItem(to, cx) {
    const items = this.toolbarItems(), item = items.find(row => row.id === this.toolbarItem);
    if (!item || to === this.toolbarGroup) return;
    this.setToolbarItems(items.filter(row => row.id !== item.id));
    const target = this.toolbarItems(to);
    const moved = target.some(row => row.id === item.id) ? { ...item, id: `user.move.${Date.now()}` } : item;
    this.setToolbarItems([...target, moved], to);
    this.toolbarGroup = to; this.toolbarItem = moved.id; cx.notify();
  }
  setToolbarIcon(name, cx) {
    this.setToolbarItems(this.toolbarItems().map(item => item.id === this.toolbarItem ? { ...item, icon: name } : item));
    this.iconPalette = false; cx.notify();
  }
  customTree() {
    const group = (id, label) => ({ id: `group:${id}`, kind: "group", group: id, label: T(label),
      children: this.toolbarItems(id).map(item => ({ id: `item:${id}/${item.id}`, kind: "item", group: id, item, label: this.toolbarItemLabel(item) })) });
    return [
      { id: "main", kind: "root", label: T("Main Toolbar"), children: ["left", "center", "right"].map(side =>
        group(`MainToolbar.${side}`, { left: "Left", center: "Center", right: "Right" }[side])) },
      { id: "tools", kind: "root", label: T("Tool Windows"), children: Object.entries(SIDES).map(([side, info]) => ({
        id: `side:${side}`, kind: "side", side, label: T(info.label), children: this.windowTools(side).map(name => ({
          id: `tool:${name}`, kind: "tool", side, name, label: T(TOOLS[name].label),
        })),
      })) },
      { id: "headers", kind: "root", label: T("Tool Window Headers"), children: Object.entries(ACTION_GROUPS)
        .filter(([id, info]) => id.startsWith("header.") && info.customizable !== false).map(([id]) => group(id, id.slice(7))) },
      ...Object.entries(ACTION_GROUPS).filter(([id, info]) => !id.startsWith("MainToolbar.") && !id.startsWith("header.") && info.customizable !== false)
        .map(([id, info]) => group(id, info.label)),
    ];
  }
  customRows() {
    const query = this.customQuery;
    const visit = (nodes, depth = 0, parent = null, ancestorMatch = false) => nodes.flatMap(node => {
      const matches = ancestorMatch || Boolean(query && `${node.label} ${node.id} ${node.item?.action ?? ""}`.toLowerCase().includes(query));
      const expanded = Boolean(query) || !this.customCollapsed.has(node.id);
      const children = node.children && expanded ? visit(node.children, depth + 1, node.id, matches) : [];
      return query && !matches && !children.length ? [] : [{ ...node, depth, parent, expanded: node.children ? expanded : undefined }, ...children];
    });
    return visit(this.customTree());
  }
  selectCustom(node, cx, toggle = false, focus = true) {
    if (!node) return;
    this.customSelected = node.id; this.addingAction = false; this.iconPalette = false;
    if (node.group) { this.toolbarGroup = node.group; this.toolbarItem = node.item?.id ?? null; }
    if (node.side) this.toolSide = node.side;
    if (toggle && node.children) this.customCollapsed.has(node.id) ? this.customCollapsed.delete(node.id) : this.customCollapsed.add(node.id);
    if (focus) this.customMenu.focus.focus();
    this.revealCustom(); cx.notify();
  }
  revealCustom() {
    this.customMenu.ensureVisible(this.customRows().findIndex(row => row.id === this.customSelected));
  }
  customKey(event, cx) {
    const rows = this.customRows(), at = Math.max(0, rows.findIndex(row => row.id === this.customSelected)), current = rows[at];
    const key = event.keystroke ?? event.key;
    let next;
    if (key === "up") next = Math.max(0, at - 1);
    else if (key === "down") next = Math.min(rows.length - 1, at + 1);
    else if (key === "home") next = 0;
    else if (key === "end") next = rows.length - 1;
    else if (key === "pageup") next = Math.max(0, at - 12);
    else if (key === "pagedown") next = Math.min(rows.length - 1, at + 12);
    else if (key === "right" && current?.children) {
      if (!current.expanded) this.customCollapsed.delete(current.id);
      else next = Math.min(rows.length - 1, at + 1);
    } else if (key === "left" && current) {
      if (current.children && current.expanded) this.customCollapsed.add(current.id);
      else next = rows.findIndex(row => row.id === current.parent);
    } else if (key === "enter" && current?.children) this.customCollapsed.has(current.id) ? this.customCollapsed.delete(current.id) : this.customCollapsed.add(current.id);
    else if (key === "space" && current?.kind === "tool") this.toggleWindowTool(current.name, cx);
    else return;
    cx.stop_propagation();
    if (next >= 0 && rows[next]) this.selectCustom(rows[next], cx);
    else cx.notify();
  }
  toggleWindowTool(name, cx) {
    if (this.saving || !TOOLS[name]) return;
    const hidden = new Set(this.draft.toolHidden);
    hidden.has(name) ? hidden.delete(name) : hidden.add(name);
    this.draft.toolHidden = [...hidden]; cx.notify();
  }
  editCustom(op, cx) {
    if (this.saving) return;
    const selected = this.customRows().find(row => row.id === this.customSelected);
    if (op === "restore-all") { this.editToolbar("restore-all", cx); this.restoreWindowTools(cx); return; }
    if (!selected) return;
    if (op === "restore") {
      if (selected.kind === "tool" || selected.kind === "side" || selected.id === "tools") this.restoreWindowTools(cx);
      else if (selected.group) { this.editToolbar("restore", cx); this.customSelected = `group:${selected.group}`; }
      else for (const node of this.customTree().find(node => node.id === selected.id)?.children ?? [])
        if (node.group) this.customization = restoreGroup(this.customization, node.group);
    } else if (selected.kind === "tool") {
      if (op === "up" || op === "down") this.reorderWindowTool(selected.name, op === "up" ? -1 : 1, cx);
      if (op === "remove" && !this.draft.toolHidden.includes(selected.name)) this.toggleWindowTool(selected.name, cx);
    } else if (selected.group) {
      this.editToolbar(op, cx);
      this.customSelected = this.toolbarItem ? `item:${this.toolbarGroup}/${this.toolbarItem}` : `group:${this.toolbarGroup}`;
    }
    this.revealCustom(); cx.notify();
  }
  toolbarsBody() {
    const c = uiColors(), rows = this.customRows(), selected = rows.find(row => row.id === this.customSelected);
    const isTool = selected?.kind === "tool", isItem = selected?.kind === "item", editable = Boolean(selected?.group);
    const items = isTool ? this.windowTools(selected.side) : editable ? this.toolbarItems(selected.group) : [];
    const at = isTool ? items.indexOf(selected.name) : isItem ? items.findIndex(item => item.id === selected.item.id) : -1;
    const control = (id, graphic, tip, action, disabled = false) => uiIconButton(`custom-${id}`, icon(graphic, 14), action, { tip: T(tip), disabled: this.saving || disabled });
    const rowHeight = Math.max(IDEA.rowHeight, uiSize() + 8);
    const renderRow = node => uiTreeRow(`custom-node-${node.id}`, node.label, {
      depth: node.depth, expanded: node.expanded, selected: this.customSelected === node.id,
      graphic: node.kind === "tool" ? toolImage(TOOLS[node.name].idea, IDEA.iconSize)
        : node.item ? node.item.kind === "action" ? toolImage(node.item.icon ?? getAction(node.item.action)?.icon ?? "settings", 16)
          : icon(node.item.kind === "separator" ? "minus" : "columns-2", 14) : undefined,
      shortcut: node.kind === "tool" && this.draft.toolHidden.includes(node.name) ? T("Hidden") : undefined,
    }).h(rowHeight);
    return v_flex().h_full().min_h(0).gap(8)
      .child(h_flex().h(30).flex_none().gap(4).items_center()
        .child(uiButton("custom-add", T("Add…"), (_e, cx) => { this.addingAction = true; this.addSelection = null; cx.notify(); }, { small: true, disabled: this.saving || !editable }))
        .child(control("icon", "pencil", "Change Icon", (_e, cx) => { this.iconPalette = !this.iconPalette; cx.notify(); }, !isItem || selected.item.kind !== "action"))
        .child(control("up", "chevron-up", "Move Up", (_e, cx) => this.editCustom("up", cx), at <= 0))
        .child(control("down", "chevron-down", "Move Down", (_e, cx) => this.editCustom("down", cx), at < 0 || at === items.length - 1))
        .child(control("remove", "x", isTool ? "Hide Tool Window" : "Remove", (_e, cx) => this.editCustom("remove", cx), !isItem && (!isTool || this.draft.toolHidden.includes(selected.name))))
        .child(control("restore", "undo", isTool || selected?.kind === "side" || selected?.id === "tools" ? "Restore Tool Window Layout" : "Restore Group", (_e, cx) => this.editCustom("restore", cx), !selected))
        .child(div().flex_1())
        .child(uiInputBox(h_flex().min_w(0).w_full().items_center().gap(6).child(icon("search", 14)).child(Input.new(this.customSearch).text_size(uiSize()))).w(245)))
      .when(Boolean(this.iconPalette && isItem && selected.item.kind === "action"), el => el.child(h_flex().gap(5).flex_none().children(["search", "settings", "project", "terminal", "structure", "problems", "runAction", "commit"].map(name =>
        uiIconButton(`custom-icon-${name}`, toolImage(name, 16), (_e, cx) => this.setToolbarIcon(name, cx), { tip: name, disabled: this.saving })))))
      .child(v_flex().id("custom-tree-frame").flex_1().min_h(0).border_1().border_color(c.separator).relative()
        .track_focus(this.customMenu.focus).on_key_down((event, cx) => this.customKey(event, cx))
        .child(v_virtual_list("custom-tree", rows.length, rowHeight, i => rows[i].id,
          range => rows.slice(range.start, range.end).map(renderRow)).size_full().track_scroll(this.customMenu.scroll)
          .on_item_click((id, cx) => { cx.stop_propagation(); this.selectCustom(rows.find(node => node.id === id), cx, true); }))
        .child(Scrollbar.vertical("custom-tree").absolute().inset_0())
        .when(!rows.length, el => el.child(uiCaption(T("No matching items")).absolute().top(8).left(8))))
      .when(Boolean(isTool), el => el.child(h_flex().flex_none().flex_wrap().gap(4).items_center()
        .child(uiCheckbox(`settings-tool-${selected.name}-visible`, T("Show on Stripe"), (_e, cx) => this.toggleWindowTool(selected.name, cx), { checked: !this.draft.toolHidden.includes(selected.name), disabled: this.saving }))
        .child(uiCaption(T("Move to:"))).children(Object.entries(SIDES).map(([side, info]) => uiButton(`settings-tool-${selected.name}-${side}`, T(info.label), (_e, cx) => {
          this.moveWindowTool(selected.name, side, cx); this.customCollapsed.delete(`side:${side}`); this.revealCustom();
        }, { small: true, disabled: this.saving || side === selected.side })))))
      .when(Boolean(isItem && selected.group.startsWith("MainToolbar.")), el => el.child(h_flex().flex_none().gap(4).items_center()
        .child(uiCaption(T("Move to:"))).children(["left", "center", "right"].map(side => uiButton(`custom-move-${side}`, T(side === "left" ? "Left" : side === "center" ? "Center" : "Right"), (_e, cx) => {
          this.moveToolbarItem(`MainToolbar.${side}`, cx); this.customSelected = `item:${this.toolbarGroup}/${this.toolbarItem}`;
          this.customCollapsed.delete(`group:${this.toolbarGroup}`); this.revealCustom();
        }, { small: true, disabled: this.saving || selected.group === `MainToolbar.${side}` })))))
      .when(this.addingAction && editable, el => el.child(v_flex().h(210).flex_none().gap(6).border_t(1).border_color(c.separator).pt(6)
        .child(uiInputBox(h_flex().w_full().gap(6).items_center().child(icon("search", 14)).child(Input.new(this.actionSearch).text_size(uiSize()))))
        .child(v_flex().id("custom-add-actions").flex_1().min_h(0).overflow_y_scrollbar().children(this.addCandidates().map(choice => uiTreeRow(`custom-add-${choice.key}`, choice.label, {
          selected: choice.key === this.addSelection, shortcut: T(choice.category), onClick: (_e, cx) => { this.addSelection = choice.key; cx.notify(); },
        }))))
        .child(h_flex().gap(6).justify_end().children([
          uiButton("custom-separator", T("Add Separator"), (_e, cx) => { this.editCustom("separator", cx); this.addingAction = false; cx.notify(); }, { disabled: this.saving }),
          uiButton("custom-add-cancel", T("Cancel"), (_e, cx) => { this.addingAction = false; cx.notify(); }),
          uiButton("custom-add-confirm", T("Add"), (_e, cx) => this.addToolbarItem(cx), { primary: true, disabled: this.saving || !this.addCandidates().length }),
        ]))))
      .child(h_flex().flex_none().gap(8).items_center()
        .child(uiButton("custom-restore-all", T("Restore All"), (_e, cx) => this.editCustom("restore-all", cx), { small: true, disabled: this.saving }))
        .child(uiCaption(T("Changes take effect with Apply."))));
  }

  notificationsBody() {
    const c = uiColors();
    return v_flex().gap(12)
      .child(uiCaption(T("Choose how each notification group appears. Herdr sound preferences also apply.")))
      .child(v_flex().border_1().border_color(c.separator).rounded(4).overflow_hidden()
        .child(h_flex().h(28).px(10).gap(8).items_center().text_color(c.secondary)
          .child(div().flex_1().child(T("Notification Group"))).children(["Popup", "Timeline", "Sound"].map(label => div().w(85).child(T(label)))))
        .children(NOTIFICATION_GROUPS.map(group => {
          const policy = { ...group.defaults, ...(this.notificationPolicy.groups?.[group.id] ?? {}) };
          return h_flex().h(34).px(10).gap(8).items_center().child(div().flex_1().child(T(group.label)))
            .children(["popup", "log", "sound"].map(field => uiCheckbox(`notify-policy-${group.id}-${field}`, "", (_e, cx) => {
              this.notificationPolicy.groups = { ...(this.notificationPolicy.groups ?? {}), [group.id]: { ...(this.notificationPolicy.groups?.[group.id] ?? {}), [field]: !policy[field] } }; cx.notify();
            }, { checked: policy[field], disabled: this.saving }).w(85)));
        })))
      .child(uiButton("notify-policy-restore", T("Restore Defaults"), (_e, cx) => {
        this.notificationPolicy = restoreKnownGroups(this.notificationPolicy, Object.fromEntries(NOTIFICATION_GROUPS.map(group => [group.id, {}]))); cx.notify();
      }, { disabled: this.saving }))
      .child(uiCaption(T("Herdr agent notifications keep their native notification path. These options control the mode timeline and additional popups.")));
  }

  // Display effective Herdr bindings verbatim; never globally remap Ctrl to Cmd.
  keymapBody() {
    const c = uiColors(), all = this.bindings();
    const rows = all.filter(row => !this.keyQuery || `${row.label} ${row.action} ${row.chords.join(" ")} ${row.chords.map(formatShortcut).join(" ")}`.toLowerCase().includes(this.keyQuery));
    const groups = [...new Set(rows.map(row => row.group))];
    const tree = groups.flatMap(group => {
      const expanded = Boolean(this.keyQuery) || !this.collapsed.has(group);
      const head = uiTreeRow(`keymap-group-${group}`, T(group), { expanded, graphic: icon("folder", 14), onClick: (_e, cx) => {
        this.collapsed.has(group) ? this.collapsed.delete(group) : this.collapsed.add(group); cx.notify();
      } });
      return [head, ...(expanded ? rows.filter(row => row.group === group).map(row => uiTreeRow(`keymap-action-${row.id}`, row.label, {
        depth: 1, selected: this.selectedBinding === row.id, shortcut: row.chords.map(formatShortcut).join(", "),
        onClick: (_e, cx) => { this.selectedBinding = row.id; this.selectedChord = row.chords[0] ?? null; this.capturing = false; cx.notify(); },
      }).tooltip(`${row.section} · ${row.action}`)) : [])];
    });
    const selected = all.find(row => row.id === this.selectedBinding);
    return v_flex().h_full().min_h(0).gap(10)
      .child(h_flex().h(28).flex_none().items_center().gap(12)
        .child(div().w(194).h(24).px(8).flex().items_center().rounded(3).border_1().border_color(c.border).child("macOS 1 복사"))
        .child(div().text_color(c.secondary).child(T("macOS keymap based"))))
      .child(h_flex().h(32).flex_none().items_center().gap(4).border_t(1).border_color(c.separator).pt(5)
        .child(uiIconButton("keymap-expand", icon("chevron-down", 14), (_e, cx) => { this.collapsed.clear(); cx.notify(); }, { tip: T("Expand All") }))
        .child(uiIconButton("keymap-collapse", icon("collapse", 14), (_e, cx) => { this.collapsed = new Set(all.map(row => row.group)); cx.notify(); }, { tip: T("Collapse All") }))
        .child(uiIconButton("keymap-edit", icon("plus", 14), (_e, cx) => this.beginShortcut(cx), { tip: T("Add Shortcut…"), disabled: !selected || this.saving }))
        .child(uiIconButton("keymap-replace", icon("pencil", 14), (_e, cx) => this.beginShortcut(cx, "replace"), { tip: T("Change Shortcut…"), disabled: !selected?.chords.includes(this.selectedChord) || this.saving }))
        .child(uiIconButton("keymap-remove", icon("minus", 14), (_e, cx) => this.removeShortcut(cx), { tip: T("Remove Shortcut"), disabled: !selected?.chords.includes(this.selectedChord) || this.saving }))
        .child(div().flex_1())
        .child(uiInputBox(h_flex().w_full().min_w(0).gap(6).items_center().child(icon("search", 14)).child(Input.new(this.keySearch).text_size(uiSize()))).w(300)))
      .child(v_flex().id("settings-keymap-tree").flex_1().min_h(0).border_1().border_color(c.separator).overflow_y_scrollbar().py(3)
        .children(tree.length ? tree : [uiCaption(T("No matching shortcuts"))]))
      .when(Boolean(selected), el => el.child(v_flex().flex_none().max_h(110).id("keymap-assigned-shortcuts").overflow_y_scrollbar()
        .child(uiCaption(selected?.label ?? ""))
        .children(selected?.chords.length ? selected.chords.map((chord, index) => uiTreeRow(`keymap-chord-${index}`, formatShortcut(chord), {
          selected: chord === this.selectedChord, onClick: (_e, cx) => { this.selectedChord = chord; cx.notify(); },
        })) : [uiCaption(T("No shortcut assigned"))])))
      .when(Boolean(this.capturing && selected), el => el.child(v_flex().flex_none().gap(6)
        .child(div().text_color(c.secondary).child(`${T(this.shortcutMode === "replace" ? "Change Shortcut…" : "Add Shortcut…")} · ${selected?.label ?? ""}`))
        .child(uiCaption(T("Type a shortcut such as cmd-shift-o, or record it.")))
        .child(h_flex().gap(8).items_center()
          .child(uiInputBox(Input.new(this.shortcutInput).text_size(uiSize())).w(210))
          .child(uiButton("keymap-record", T("Record Shortcut"), (_e, cx) => { this.shortcutFocus.focus(); cx.notify(); }, { disabled: this.saving })
            .track_focus(this.shortcutFocus).on_key_down((event, cx) => this.captureShortcut(event, cx)))
          .child(uiButton("keymap-shortcut-add", T(this.shortcutMode === "replace" ? "Change" : "Add"), (_e, cx) => this.stageShortcut(cx), { disabled: !this.newShortcut || this.saving }))
          .child(uiButton("keymap-shortcut-cancel", T("Cancel"), (_e, cx) => { this.capturing = false; this.focus.focus(); cx.notify(); })))))
      .child(div().flex_none().text_size(uiSize(11)).text_color(c.secondary)
        .child(this.pendingBindings.length ? T("Shortcut changes will be saved with Apply.") : T("Select an action to add, change or remove a shortcut.")));
  }

  sidebar() {
    const c = uiColors(), result = [];
    const pages = PAGES.filter(page => !this.query || page.join(" ").toLowerCase().includes(this.query) || T(page[1]).includes(this.query) || T(page[2]).includes(this.query)
      || page[0] === "toolbars" && `Tool Windows ${T("Tool Windows")}`.toLowerCase().includes(this.query));
    for (const group of [...new Set(pages.map(page => page[1]))]) {
      if (group === "Keymap") {
        result.push(uiTreeRow("settings-page-keymap", T("Keymap"), { selected: this.page === "keymap", onClick: (_e, cx) => { this.page = "keymap"; cx.notify(); } }));
        continue;
      }
      const expanded = !this.sidebarCollapsed.has(group) || Boolean(this.query);
      result.push(uiTreeRow(`settings-group-${group}`, T(group), { expanded, onClick: (_e, cx) => {
        this.sidebarCollapsed.has(group) ? this.sidebarCollapsed.delete(group) : this.sidebarCollapsed.add(group); cx.notify();
      } }));
      if (expanded) for (const [id, , label] of pages.filter(page => page[1] === group)) result.push(uiTreeRow(`settings-page-${id}`, T(label), { depth: 1, selected: this.page === id,
        onClick: (_e, cx) => { this.page = id; cx.notify(); } }));
    }
    return v_flex().h_full().min_h(0).gap(8).text_color(c.foreground)
      .child(uiInputBox(h_flex().min_w(0).gap(4).items_center().child(icon("search", 13)).child(Input.new(this.search).text_size(uiSize()))).mx(8).mt(8).flex_none())
      .child(v_flex().id("settings-tree").flex_1().min_h(0).overflow_y_scrollbar().children(result));
  }

  render() {
    const t = theme(), c = uiColors(), current = PAGES.find(([id]) => id === this.page);
    const dirty = JSON.stringify(this.draft) !== this.saved || Boolean(this.pendingBindings.length) || Boolean(this.restoreToolLayout)
      || JSON.stringify(this.customization) !== JSON.stringify(this.savedCustomization) || JSON.stringify(this.notificationPolicy) !== JSON.stringify(this.savedNotificationPolicy);
    const content = v_flex().h_full().min_h(0).gap(18).text_color(c.foreground)
      .child(div().flex_none().h(24).font_semibold().text_size(uiSize()).child(T(this.page === "keymap" ? "Keymap" : current[2])))
      .child(v_flex().id("settings-body").flex_1().min_h(0)
        .when(!["keymap", "toolbars"].includes(this.page), el => el.overflow_y_scrollbar())
        .child(this.body(t)))
      .when(Boolean(this.error), el => el.child(div().flex_none().text_color(c.error).child(this.error)));
    const footer = [
      uiButton("settings-cancel", T("Cancel"), () => closeOverlay(props().overlay), { disabled: this.saving }),
      uiButton("settings-apply", T("Apply"), (_e, cx) => this.apply(cx), { disabled: !dirty || this.saving }),
      uiButton("settings-ok", T(this.saving ? "Saving…" : "OK"), (_e, cx) => this.apply(cx, true), { primary: true, disabled: this.saving }),
    ];
    return uiSettingsShell("idea-settings", { title: T("Settings"), sidebar: this.sidebar(), content, footer, width: 900, height: 700, sidebarWidth: 145 })
      .track_focus(this.focus).on_key_down((event, cx) => {
        if (event.key === "escape") {
          if (this.capturing) { this.capturing = false; this.focus.focus(); cx.notify(); }
          else if (this.addingAction) { this.addingAction = false; cx.notify(); }
          else if (!this.saving) closeOverlay(props().overlay);
          cx.stop_propagation();
        }
      });
  }
}
