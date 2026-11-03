// IntelliJ-style settings for the idea layout. Personal Herdr settings are
// changed with the same optimistic file writes as Herdr's own settings view.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState } from "gpui-base";
import { shared, setShared, settings, keys, theme, run, props, closeOverlay, openOverlay, appHome, readTextFile, writeTextFile } from "herdr";
import { uiSize, IDEA, uiInputBox, uiButton, uiToolbar, uiColors, uiCaption, uiSettingsShell, uiTreeRow, uiIconButton, uiCheckbox } from "./idea-design.js";
import { icon, button, codeFont } from "./common.js";
import { T } from "./i18n.js";

import { TOOLS, SIDES, savedSides, hiddenTools, arrange } from "./tools.js";
import { toolImage } from "./ideaicons.js";

export const openIdeaSettings = (page = "appearance") => openOverlay({
  mod: "codenav", props: { view: "settings", page }, kind: "dialog", frame: "none", width: 900, height: 700,
});

const PAGES = [
  ["appearance", "Appearance & Behavior", "Appearance"],
  ["editor", "Editor", "Font"],
  ["terminal", "Tools", "Terminal"],
  ["keymap", "Keymap", "Keymap"],
  ["windows", "Window", "Tool Windows"],
];
const ACTION_NAMES = {
  "tool-project": "Project", "tool-commit": "Commit", "tool-structure": "Structure", "tool-find": "Find", "tool-terminal": "Terminal", "tool-problems": "Problems",
  "find-all": "Search Everywhere", "find-class": "Go to Class", "find-file": "Go to File", "find-symbol": "Go to Symbol", "find-action": "Find Action", "find-recent": "Recent Files", "find-locations": "Recent Locations",
  "nav-back": "Back", "nav-forward": "Forward", "hide-active": "Hide Active Tool Window", "hide-tools": "Hide All Tool Windows", "tool-last": "Jump to Last Tool Window", "tool-reset": "Restore Tool Window Layout",
  "run": "Run", "rerun": "Rerun", "run-choose": "Run Configurations", "stop": "Stop", "settings": "Settings", "close-tab": "Close", "tab-next": "Next Tab", "tab-prev": "Previous Tab", "tab-back": "Back", "tab-forward": "Forward", "definition": "Go to Declaration", "next-error": "Next Problem", "prev-error": "Previous Problem",
};
const actionLabel = (action) => T(ACTION_NAMES[action.replace(/^codenav\./, "")] ?? action.replace(/^[^.]+\./, "").replace(/-/g, " "));
// Display the effective Herdr binding verbatim; never globally remap Ctrl to Cmd.
const shortcutLabel = key => key.split(" ").map(chord => chord.split("-").map(part => ({ cmd: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", escape: "Esc", enter: "↵", up: "↑", down: "↓", left: "←", right: "→" })[part] ?? (part.length === 1 ? part.toUpperCase() : part)).join("")).join(" ");
const bindingGroup = action => {
  const name = action.replace(/^[^.]+\./, "");
  if (/^(tool-|hide-)/.test(name)) return "Tool Windows";
  if (/^(find-|nav-)/.test(name)) return "Navigation";
  if (/^(run|rerun|stop)/.test(name)) return "Run";
  if (name === "settings") return "Appearance & Behavior";
  if (/^(tab-|close|definition|implementation|next-error|prev-error|save)/.test(name)) return "Editor";
  return "Other";
};
const editableSection = section => ["layout:idea", "mod:codenav", "mod:activity"].includes(section);

export default class IdeaSettings {
  init(p, cx) {
    this.page = PAGES.some(([id]) => id === p?.page) ? p.page : "appearance";
    const s = settings(), a = shared("codenav.appearance") ?? {};
    this.draft = {
      uiFont: a.uiFont ?? s.ui_font_family ?? ".AppleSystemUIFont", uiSize: a.uiSize ?? 13,
      editorFont: a.editorFont ?? codeFont().family, editorSize: a.editorSize ?? codeFont().size,
      terminalFont: s.font_family ?? "JetBrains Mono", terminalSize: s.font_size ?? 14, compact: a.compact !== false,
      toolSides: savedSides(), toolHidden: [...hiddenTools()],
    };
    this.saved = JSON.stringify(this.draft);
    this.savedToolSides = { ...this.draft.toolSides };
    this.focus = cx.focus_handle(); this.focus.focus();
    this.shortcutFocus = cx.focus_handle();
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
  }

  bindings() {
    const rows = new Map();
    for (const binding of [...keys().filter(k => editableSection(k.section)), ...this.pendingBindings.map(p => ({ section: p.section, keys: p.chord, action: p.action }))]) {
      const id = `${binding.section}:${binding.action}`;
      const row = rows.get(id) ?? { id, action: binding.action, section: binding.section, label: actionLabel(binding.action), chords: [], group: bindingGroup(binding.action) };
      if (!row.chords.includes(binding.keys)) row.chords.push(binding.keys);
      rows.set(id, row);
    }
    return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  beginShortcut(cx) { this.capturing = true; this.newShortcut = ""; this.error = null; this.shortcutFocus.focus(); cx.notify(); }
  captureShortcut(event, cx) {
    cx.stop_propagation();
    if (event.key === "escape") { this.capturing = false; this.focus.focus(); cx.notify(); return; }
    if (["shift", "control", "alt", "cmd", "meta", "fn"].includes(event.key)) return;
    this.newShortcut = event.keystroke ?? event.key; cx.notify();
  }
  stageShortcut(cx) {
    const row = this.bindings().find(r => r.id === this.selectedBinding), chord = this.newShortcut;
    if (!row || !chord) return;
    const existing = [...keys(), ...this.pendingBindings.map(p => ({ section: p.section, keys: p.chord, action: p.action }))]
      .find(k => k.section === row.section && k.keys === chord);
    if (existing && existing.action !== row.action) { this.error = T("This shortcut is already assigned."); cx.notify(); return; }
    if (!existing) this.pendingBindings.push({ section: row.section, chord, action: row.action });
    this.capturing = false; this.focus.focus(); cx.notify();
  }
  async saveShortcuts() {
    if (!this.pendingBindings.length) return;
    const path = `${appHome()}/keys.json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await readTextFile(path), document = raw ? JSON.parse(raw) : {};
      if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error(T("Invalid key bindings file."));
      for (const entry of this.pendingBindings) {
        if (!editableSection(entry.section)) throw new Error(T("Unsupported key binding section."));
        const section = document[entry.section] ?? {};
        if (typeof section !== "object" || Array.isArray(section)) throw new Error(T("Invalid key binding section."));
        const existing = section[entry.chord];
        if (existing !== undefined && existing !== entry.action) throw new Error(T("This shortcut is already assigned."));
        document[entry.section] = { ...section, [entry.chord]: entry.action };
      }
      try { await writeTextFile(path, JSON.stringify(document, null, 2) + "\n", raw); this.pendingBindings = []; return; }
      catch (error) { if (attempt === 2) throw error; }
    }
  }

  apply(cx, close = false) {
    if (this.saving) return;
    if (["uiFont", "editorFont", "terminalFont"].some((f) => !this.draft[f].trim())) {
      this.error = T("Enter a font family."); cx.notify(); return;
    }
    this.saving = true; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const d = { ...this.draft, toolSides: { ...this.draft.toolSides }, toolHidden: [...this.draft.toolHidden] }, s = settings();
        const restoreToolLayout = this.restoreToolLayout;
        await this.saveShortcuts();
        if (d.terminalFont !== s.font_family || d.terminalSize !== s.font_size) {
          const path = `${appHome()}/settings.json`;
          for (let i = 0; i < 3; i++) {
            const raw = await readTextFile(path), person = raw ? JSON.parse(raw) : {};
            person.font = d.terminalFont.trim(); person.font_size = d.terminalSize;
            try { await writeTextFile(path, JSON.stringify(person, null, 2) + "\n", raw); break; }
            catch (e) { if (i === 2) throw e; }
          }
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
        .child(this.step(`${sizeKey}-minus`, "−", () => { this.draft[sizeKey] = Math.max(sizeKey === "uiSize" ? 9 : 8, this.draft[sizeKey] - 1); }, t))
        .child(div().w(28).text_center().child(String(this.draft[sizeKey])))
        .child(this.step(`${sizeKey}-plus`, "+", () => { this.draft[sizeKey] = Math.min(sizeKey === "uiSize" ? 24 : 36, this.draft[sizeKey] + 1); }, t)));
  }
  step(id, label, action, t) {
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
    if (this.page === "windows") return this.toolWindowsBody();
    return this.keymapBody(t);
  }

  toolWindowsBody() {
    const c = uiColors();
    const positions = Object.keys(SIDES);
    return v_flex().gap(14)
      .child(uiCaption(T("Choose which tool windows appear and where they open.")))
      .child(v_flex().border_1().border_color(c.separator).rounded(4).overflow_hidden()
        .child(h_flex().h(28).flex_none().px(10).gap(12).items_center().border_b(1).border_color(c.separator).text_color(c.secondary)
          .child(div().flex_1().child(T("Tool Window")))
          .child(div().w(170).child(T("Default position")))
          .child(div().w(120).child(T("Visibility"))))
        .children(Object.entries(TOOLS).map(([name, tool]) => h_flex().h(34).flex_none().px(10).gap(12).items_center()
          .child(h_flex().flex_1().min_w(0).gap(8).items_center().child(toolImage(tool.idea, IDEA.iconSize)).child(div().truncate().child(T(tool.label))))
          .child(h_flex().w(170).gap(4).children(positions.map(side => uiButton(`settings-tool-${name}-${side}`, T(SIDES[side].label), (_e, cx) => {
            this.draft.toolSides = { ...this.draft.toolSides, [name]: side }; cx.notify();
          }, { small: true, primary: this.draft.toolSides[name] === side, disabled: this.saving }))))
          .child(uiCheckbox(`settings-tool-${name}-visible`, T("Show on Stripe"), (_e, cx) => {
            const hidden = new Set(this.draft.toolHidden);
            hidden.has(name) ? hidden.delete(name) : hidden.add(name);
            this.draft.toolHidden = [...hidden]; cx.notify();
          }, { checked: !this.draft.toolHidden.includes(name), disabled: this.saving }).w(120)))))
      .child(h_flex().child(uiButton("settings-tool-restore", T("Restore Tool Window Layout"), (_e, cx) => {
        this.restoreToolLayout = true; cx.notify();
      }, { disabled: this.saving })))
      .child(uiCaption(T("Changes take effect with Apply. Other tool window positions are kept.")));
  }

  keymapBody(t) {
    const c = uiColors(), all = this.bindings();
    const rows = all.filter(row => !this.keyQuery || `${row.label} ${row.action} ${row.chords.join(" ")} ${row.chords.map(shortcutLabel).join(" ")}`.toLowerCase().includes(this.keyQuery));
    const groups = [...new Set(rows.map(row => row.group))];
    const tree = groups.flatMap(group => {
      const expanded = Boolean(this.keyQuery) || !this.collapsed.has(group);
      const head = uiTreeRow(`keymap-group-${group}`, T(group), { expanded, graphic: icon("folder", 14), onClick: (_e, cx) => {
        this.collapsed.has(group) ? this.collapsed.delete(group) : this.collapsed.add(group); cx.notify();
      } });
      return [head, ...(expanded ? rows.filter(row => row.group === group).map(row => uiTreeRow(`keymap-action-${row.id}`, row.label, {
        depth: 1, selected: this.selectedBinding === row.id, shortcut: row.chords.map(shortcutLabel).join(", "),
        onClick: (_e, cx) => { this.selectedBinding = row.id; this.capturing = false; cx.notify(); },
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
        .child(uiIconButton("keymap-edit", icon("pencil", 14), (_e, cx) => this.beginShortcut(cx), { tip: T("Add Shortcut…"), disabled: !selected || this.saving }))
        .child(div().flex_1())
        .child(uiInputBox(h_flex().w_full().min_w(0).gap(6).items_center().child(icon("search", 14)).child(Input.new(this.keySearch).text_size(uiSize()))).w(300)))
      .child(v_flex().id("settings-keymap-tree").flex_1().min_h(0).border_1().border_color(c.separator).overflow_y_scrollbar().py(3)
        .children(tree.length ? tree : [uiCaption(T("No matching shortcuts"))]))
      .when(Boolean(this.capturing && selected), el => el.child(v_flex().flex_none().gap(6)
        .child(div().text_color(c.secondary).child(`${T("Add Shortcut…")} · ${selected?.label ?? ""}`))
        .child(h_flex().gap(8).items_center()
          .child(uiInputBox(div().flex_1().child(this.newShortcut ? shortcutLabel(this.newShortcut) : T("Press a shortcut")), { focused: true })
            .w(260).track_focus(this.shortcutFocus).on_key_down((event, cx) => this.captureShortcut(event, cx)))
          .child(uiButton("keymap-shortcut-add", T("Add"), (_e, cx) => this.stageShortcut(cx), { disabled: !this.newShortcut || this.saving }))
          .child(uiButton("keymap-shortcut-cancel", T("Cancel"), (_e, cx) => { this.capturing = false; this.focus.focus(); cx.notify(); })))))
      .child(div().flex_none().text_size(uiSize(11)).text_color(c.secondary)
        .child(this.pendingBindings.length ? T("Shortcut changes will be saved with Apply.") : T("Select an action to add a shortcut. Existing shortcuts are kept.")));
  }

  sidebar() {
    const c = uiColors(), result = [];
    for (const [id, group, label] of PAGES.filter(page => !this.query || page.join(" ").toLowerCase().includes(this.query) || T(page[1]).includes(this.query) || T(page[2]).includes(this.query))) {
      if (id === "keymap") {
        result.push(uiTreeRow("settings-page-keymap", T("Keymap"), { selected: this.page === id, onClick: (_e, cx) => { this.page = id; cx.notify(); } }));
        continue;
      }
      const expanded = !this.sidebarCollapsed.has(id) || Boolean(this.query);
      result.push(uiTreeRow(`settings-group-${id}`, T(group), { expanded, onClick: (_e, cx) => {
        this.sidebarCollapsed.has(id) ? this.sidebarCollapsed.delete(id) : this.sidebarCollapsed.add(id); cx.notify();
      } }));
      if (expanded) result.push(uiTreeRow(`settings-page-${id}`, T(label), { depth: 1, selected: this.page === id,
        onClick: (_e, cx) => { this.page = id; cx.notify(); } }));
    }
    return v_flex().h_full().min_h(0).gap(8).text_color(c.foreground)
      .child(uiInputBox(h_flex().min_w(0).gap(4).items_center().child(icon("search", 13)).child(Input.new(this.search).text_size(uiSize()))).mx(8).mt(8).flex_none())
      .child(v_flex().id("settings-tree").flex_1().min_h(0).overflow_y_scrollbar().children(result));
  }

  render() {
    const t = theme(), c = uiColors(), current = PAGES.find(([id]) => id === this.page);
    const dirty = JSON.stringify(this.draft) !== this.saved || Boolean(this.pendingBindings.length) || Boolean(this.restoreToolLayout);
    const content = v_flex().h_full().min_h(0).gap(18).text_color(c.foreground)
      .child(div().flex_none().h(24).font_semibold().text_size(uiSize()).child(T(this.page === "keymap" ? "Keymap" : current[2])))
      .child(v_flex().id("settings-body").flex_1().min_h(0)
        .when(this.page !== "keymap", el => el.overflow_y_scrollbar())
        .child(this.body(t)))
      .when(Boolean(this.error), el => el.child(div().flex_none().text_color(c.error).child(this.error)));
    const footer = [
      uiButton("settings-cancel", T("Cancel"), () => closeOverlay(props().overlay), { disabled: this.saving }),
      uiButton("settings-apply", T("Apply"), (_e, cx) => this.apply(cx), { disabled: !dirty || this.saving }),
      uiButton("settings-ok", T(this.saving ? "Saving…" : "OK"), (_e, cx) => this.apply(cx, true), { primary: true, disabled: this.saving }),
    ];
    return uiSettingsShell("idea-settings", { title: T("Settings"), sidebar: this.sidebar(), content, footer, width: 900, height: 700, sidebarWidth: 145 })
      .track_focus(this.focus).on_key_down((event, cx) => {
        if (event.key === "escape") { if (!this.saving) closeOverlay(props().overlay); cx.stop_propagation(); }
      });
  }
}
