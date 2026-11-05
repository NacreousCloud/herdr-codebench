// Canonical IntelliJ components; generate deployable copies with sync_ui.py.
import { div, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, v_virtual_list, VirtualListScrollHandle, Scrollbar, HoverCard, TextView } from "gpui-base";
import { shared, setShared, settings, theme, notify as nativeNotify, playSound, openOverlay, closeOverlay } from "herdr";
import { IDEA_TOKENS } from "./idea-tokens.js";

export const isIdea = () => shared("layout") === "idea";
export const isCompact = () => isIdea() && shared("codenav.appearance")?.compact !== false;
const density = (normal, compact) => isCompact() ? compact : normal;
const metric = (name, normal, compact = normal) => Number(isCompact()
  ? IDEA_TOKENS["ui.metrics"]?.[`${name}.compact`] ?? compact
  : IDEA_TOKENS["ui.metrics"]?.[name] ?? normal);
const editorMetrics = IDEA_TOKENS["herdr.editor.metrics"];
export const IDEA = Object.freeze({
  get islandRadius() { return metric("Island.arc", 20, 16) / 2; },
  get islandGap() { return metric("Island.borderWidth", 6, 4); },
  get popupRadius() { return 8; }, get dialogRadius() { return 12; },
  get controlRadius() { return metric("Component.arc", 8, 6) / 2; },
  get selectionRadius() { return 4; },
  get rowHeight() { return metric("List.rowHeight", 24, 22); },
  get inputHeight() { return density(28, 24); },
  get tabHeight() { return density(40, 32); },
  get tabFillHeight() { return density(28, 24); },
  get toolHeaderHeight() { return metric("ToolWindow.Header.height", 32, 31); },
  get toolbarHeight() { return density(40, 32); },
  get toolbarButtonSize() { return density(30, 26); },
  get iconSize() { return 16; }, get stripeIconSize() { return 16; },
  get stripeWidth() { return density(40, 32); },
  get stripeButtonWidth() { return density(37, 32); },
  get stripeButtonHeight() { return density(40, 32); },
  get statusHeight() { return 24; },
  get progressCycle() { return IDEA_TOKENS["herdr.progress"].cycleMs; },
  get editorBreadcrumbHeight() { return density(editorMetrics.breadcrumbHeight.normal, editorMetrics.breadcrumbHeight.compact); },
  get editorTextInset() { return density(editorMetrics.textInset.normal, editorMetrics.textInset.compact); },
  get editorGutterInset() { return editorMetrics.gutterInset; },
  get editorMarkerWidth() { return editorMetrics.markerWidth; },
  get editorChangeMarkerWidth() { return editorMetrics.changeMarkerWidth; },
  get editorChangeMarkerRadius() { return editorMetrics.changeMarkerRadius; },
});
export const uiSize = (base = 13) => isIdea() ? base * (Number(shared("codenav.appearance")?.uiSize) || 13) / 13 : base;
export const ideaUI = el => isIdea() ? el.font_family(shared("codenav.appearance")?.uiFont ?? settings().ui_font_family ?? IDEA_TOKENS.fonts?.fontFace ?? ".AppleSystemUIFont").text_size(uiSize()) : el;
export function uiColors() {
  const t = theme(), c = IDEA_TOKENS["ui.colors"] ?? {}, e = IDEA_TOKENS["editor.colors"] ?? {};
  const color = (name, fallback) => isIdea() ? c[name] ?? fallback : fallback;
  return {
    canvas: color("MainWindow.background", t.canvas ?? t.chrome),
    surface: color("ToolWindow.background", t.surface), popup: color("Popup.background", t.popover ?? t.surface),
    foreground: color("*.foreground", t.foreground), secondary: color("*.infoForeground", t.muted),
    disabled: color("*.disabledText", t.dim), border: color("Component.borderColor", t.input ?? t.border),
    separator: color("Separator.separatorColor", t.border), hover: color("*.hoverBackground", t.hover),
    selection: color("*.selectionBackground", t.selected), selectionInactive: color("*.selectionInactiveBackground", t.raised),
    selectionForeground: color("*.selectionForeground", t.foreground), tabSelected: color("EditorTabs.underlinedTabBackground", t.selected),
    focus: color("*.focusColor", t.accent), accent: color("Button.default.startBackground", t.accent),
    accentForeground: color("Button.default.foreground", t.solid_foreground ?? t.foreground), error: color("Component.errorFocusColor", t.ansi1),
    editor: isIdea() ? e.BACKGROUND ?? t.surface : t.surface,
    lineNumber: isIdea() ? e.LINE_NUMBERS_COLOR ?? t.dim : t.dim,
    currentLine: isIdea() ? e.CARET_ROW_COLOR ?? t.hover : t.hover,
    guide: isIdea() ? e.INDENT_GUIDE ?? t.border : t.border,
    lineAdded: isIdea() ? e.ADDED_LINES_COLOR ?? t.ansi2 : t.ansi2,
    lineModified: isIdea() ? e.MODIFIED_LINES_COLOR ?? t.ansi4 : t.ansi4,
    lineDeleted: isIdea() ? e.DELETED_LINES_COLOR ?? t.ansi1 : t.ansi1,
  };
}
// Source viewer, native editor and diff use the same category palette.
export function uiEditorSyntax() {
  const t = theme();
  return isIdea() ? {
    keyword: "#CF8E6D", type: "#BCBEC4", constant: "#C77DBB", builtin: "#CF8E6D", function: "#56A8F5",
    decorator: "#B3AE60", namespace: "#BCBEC4", property: "#C77DBB", escape: "#CF8E6D",
    string: "#6AAB73", number: "#2AACB8", comment: "#7A7E85", operator: "#BCBEC4", punctuation: "#BCBEC4",
  } : { keyword: t.ansi5, type: t.ansi3, constant: t.ansi6, builtin: t.ansi6, function: t.ansi4,
    decorator: t.ansi3, namespace: t.foreground, property: t.ansi6, escape: t.ansi3,
    string: t.ansi2, number: t.ansi3, comment: t.dim, operator: t.foreground, punctuation: t.foreground };
}
// Islands uses different editor colors for underlines and overview stripes.
// Neither is a debugger breakpoint or a generic control's error color.
export function uiDiagnosticColors(severity = 1) {
  const t = theme(), attrs = IDEA_TOKENS["editor.attributes"] ?? {};
  const name = severity === 1 ? "ERRORS_ATTRIBUTES" : severity === 2 ? "WARNING_ATTRIBUTES" : "INFO_ATTRIBUTES";
  const fallback = severity === 1 ? t.ansi1 : severity === 2 ? t.ansi3 : t.ansi4;
  return isIdea() ? {
    effect: attrs[name]?.EFFECT_COLOR ?? fallback,
    stripe: attrs[name]?.ERROR_STRIPE_COLOR ?? null,
    background: IDEA_TOKENS["editor.colors"]?.INFORMATION_HINT ?? uiColors().popup,
    border: IDEA_TOKENS["editor.colors"]?.HINT_BORDER ?? uiColors().border,
  } : { effect: fallback, stripe: fallback, background: uiColors().popup, border: uiColors().border };
}

// A separate native path preserves syntax colors, line height and hit testing.
// Offset keeps the wave continuous across syntax-token boundaries.
export function uiDiagnosticUnderline(element, { width, offset = 0, severity = 1 }) {
  const length = Math.max(3, width), y = x => 0.5 + Math.abs(((x + offset) % 4) - 2);
  const path = PathBuilder.stroke(1).move_to(0, y(0));
  for (let x = 2 - offset % 2; x < length; x += 2) path.line_to(x, y(x));
  path.line_to(length, y(length));
  return element.relative().child(window.paint_path(path.build(), uiDiagnosticColors(severity).effect)
    .absolute().left(0).bottom(0).w(length).h(3));
}

export function uiDiagnosticLabel(diagnostic, { summary = false } = {}) {
  const message = String(diagnostic.message ?? "");
  const body = summary ? message.split(/\r\n|[\n\r\u2028\u2029]/u).find(line => line.trim()) ?? "" : message;
  const label = `${diagnostic.source ? diagnostic.source + " - " : ""}${diagnostic.code !== undefined && diagnostic.code !== null && diagnostic.code !== "" ? diagnostic.code + ": " : ""}${body}`;
  return summary ? label.replace(/\s+/gu, " ").trim() : label;
}

// Plain diagnostic text can contain type syntax or Markdown; escape it before
// using the native selectable rich-text view rather than interpreting it.
export function uiSelectableText(id, text) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const html = String(text).replace(/[&<>"']/g, character => entities[character]).replace(/\r\n|[\n\r\u2028\u2029]/gu, "<br>");
  // Keep native text focus/selection inside the label. A Problems row also
  // handles mouse-down/click; letting those bubble can focus the list or open
  // a file while the user is selecting diagnostic text.
  return TextView.html(id, html).selectable(true).scrollable(false)
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click((_event, cx) => cx.stop_propagation());
}

export function uiDiagnosticCard(id, diagnostics, { path = "", actions = [] } = {}) {
  const c = uiColors(), hint = uiDiagnosticColors();
  const messages = diagnostics.map(d => uiDiagnosticLabel(d));
  const rows = messages.reduce((count, message) => count + message.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 65)), 0), 0);
  const footer = path || actions.length ? Math.max(32, IDEA.inputHeight + 8, uiSize(12) + 16) : 0;
  const height = Math.min(320, 20 + rows * Math.max(18, uiSize() + 5) + Math.max(0, messages.length - 1) * 8 + footer);
  return ideaUI(v_flex()).id(id).role("tooltip").w(560).h(Math.max(38, height)).overflow_hidden()
    .bg(hint.background).text_color(c.foreground).border_1().border_color(hint.border).rounded(6)
    .child(v_flex().flex_1().min_h(0).px(12).py(10).gap(8).overflow_y_scrollbar().children(messages.map((message, index) =>
      uiSelectableText(`${id}-message-${index}`, message).flex_none().w_full().whitespace_normal().text_size(uiSize()))))
    .when(Boolean(footer), el => el.child(h_flex().flex_none().h(footer).px(10).gap(6).items_center().border_t(1).border_color(hint.border)
      .child(div().flex_1().min_w(0).text_size(uiSize(12)).text_color(c.secondary).overflow_hidden()
        .child(uiSelectableText(`${id}-path`, path).w_full().truncate().whitespace_nowrap()))
      .children(actions.map(action => uiButton(`${id}-${action.id}`, action.label, (event, cx) => { cx.stop_propagation(); action.action?.(event, cx); }, { small: true, disabled: action.disabled })))));
}

export function uiDiagnosticTooltip(id, trigger, diagnostics, options = {}) {
  return HoverCard.new(id).open_delay(500).close_delay(150).anchor("bottom_left")
    .trigger(trigger).content(uiDiagnosticCard(`${id}-card`, diagnostics, options));
}
export function popupSurface(el, dialog = false) {
  if (!isIdea()) return el;
  const c = uiColors();
  return ideaUI(el).bg(dialog ? c.surface : c.popup).rounded(dialog ? IDEA.dialogRadius : IDEA.popupRadius)
    .overflow_hidden().border_1().border_color(c.border);
}
export function uiButton(id, label, action, { primary = false, disabled = false, small = false } = {}) {
  const c = uiColors();
  let el = ideaUI(h_flex()).id(id).h(Math.max(IDEA.inputHeight, uiSize() + 10)).flex_none().px(small ? 8 : 12)
    .items_center().justify_center().rounded(4).border_1().border_color(primary ? c.accent : c.border)
    .bg(primary ? c.accent : c.surface).text_color(disabled ? c.disabled : primary ? c.accentForeground : c.foreground).child(label);
  if (!disabled) el = el.cursor_pointer().hover(s => s.bg(primary ? c.accent : c.hover)).on_click(action);
  return el;
}
export function uiIconButton(id, graphic, action, { tip = "", active = false, disabled = false, size = IDEA.toolbarButtonSize } = {}) {
  const c = uiColors();
  let el = h_flex().id(id).size(size).flex_none().items_center().justify_center().rounded(4)
    .text_color(disabled ? c.disabled : c.foreground).bg(active ? c.selection : "#00000000").child(graphic);
  if (tip) el = el.tooltip(tip);
  if (!disabled) el = el.cursor_pointer().hover(s => s.bg(c.hover)).on_click((event, cx) => { cx.stop_propagation(); action?.(event, cx); });
  return el;
}
// A fresh SVG factory keeps native elements owned by their current row. GPUI
// rotates only while drawn; no JavaScript timers or redraw loop are needed.
export function uiSpinner(graphic, { size = 16, tip = "" } = {}) {
  let el = graphic().size(size).flex_none().text_color(uiColors().secondary).spin(IDEA.progressCycle);
  if (tip) el = el.tooltip(tip);
  return el;
}
export function uiInputBox(input, { focused = false, error = false, mono = false } = {}) {
  const c = uiColors();
  let el = ideaUI(h_flex()).min_h(Math.max(IDEA.inputHeight, uiSize() + 8)).items_center().px(6).rounded(IDEA.controlRadius)
    .bg(c.surface).border(focused || error ? 2 : 1).border_color(error ? c.error : focused ? c.focus : c.border).child(input);
  if (mono) el = el.font_family(IDEA_TOKENS.fonts?.FONT_FAMILY ?? "monospace");
  return el;
}
export function uiListRow(id, children, { selected = false, focused = true, disabled = false, onClick, interactive = Boolean(onClick), indent = 0 } = {}) {
  const c = uiColors();
  let el = ideaUI(h_flex()).id(id).aria_selected(selected).h(Math.max(IDEA.rowHeight, uiSize() + 8)).flex_none().min_w(0).items_center().gap(6)
    .pl(8 + indent).pr(8).rounded(IDEA.selectionRadius).bg(selected ? focused ? c.selection : c.selectionInactive : "#00000000")
    .text_color(disabled ? c.disabled : selected ? c.selectionForeground : c.foreground).children(Array.isArray(children) ? children : [children]);
  if (!disabled && interactive) el = el.cursor_pointer().hover(s => s.bg(selected ? c.selection : c.hover));
  if (!disabled && onClick) el = el.on_click(onClick);
  return el;
}
export const uiSeparator = () => div().h(1).my(4).mx(6).flex_none().bg(uiColors().separator);
export const uiCaption = text => ideaUI(div()).px(8).py(4).flex_none().text_size(uiSize(11)).text_color(uiColors().secondary).child(text);

export const NOTIFICATION_GROUPS = [
  { id: "codenav.general", label: "General", defaults: { popup: true, log: true, sound: true } },
  { id: "codenav.files", label: "File Operations", defaults: { popup: true, log: true, sound: true } },
  { id: "codenav.run", label: "Run", defaults: { popup: true, log: true, sound: true } },
  { id: "codenav.review", label: "Version Control", defaults: { popup: true, log: true, sound: true } },
  { id: "codenav.http", label: "HTTP Client", defaults: { popup: true, log: true, sound: true } },
  { id: "herdr.agents", label: "Agents", defaults: { popup: false, log: true, sound: false } },
];
export function notificationPolicy(group) {
  const defaults = NOTIFICATION_GROUPS.find(item => item.id === group)?.defaults ?? NOTIFICATION_GROUPS[0].defaults;
  return { ...defaults, ...(shared("codenav.notificationPolicy")?.groups?.[group] ?? {}) };
}
export function uiNotify(note) {
  if (!isIdea()) return nativeNotify(note);
  const group = note.group ?? "codenav.general", policy = notificationPolicy(group), now = Date.now();
  const recent = [...(shared("codenav.notifications") ?? []), ...(shared("codenav.noticeQueue") ?? [])];
  if (note.dedupeKey) {
    const duplicate = recent.find(item => item.group === group && item.dedupeKey === note.dedupeKey && now - item.at < 2000);
    if (duplicate) return duplicate.id;
  }
  const item = { ...note, group, id: `${now}-${Math.random()}`, at: now };
  if (policy.sound && settings().sounds?.enabled !== false && note.silent !== true) playSound(note.level === "error" || note.level === "warning" || note.level === "blocked" ? "blocked" : "done");
  if (policy.log) setShared("codenav.notifications", [item, ...(shared("codenav.notifications") ?? [])].slice(0, 100));
  if (policy.popup) setShared("codenav.noticeQueue", [...(shared("codenav.noticeQueue") ?? []), item].slice(-3));
  return item.id;
}
export function uiNoticeCard(id, note, { graphic, trailing, onClick } = {}) {
  const c = uiColors();
  return ideaUI(h_flex()).id(id).min_h(42).p(10).gap(8).items_start().rounded(7)
    .bg(isIdea() ? "#212325" : c.popup).text_color(c.foreground)
    .when(Boolean(onClick), el => el.cursor_pointer().on_click(onClick))
    .child(graphic ?? div().mt(3).size(12).rounded_full().bg(c.accent))
    .child(v_flex().flex_1().min_w(0).gap(10)
      .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).child(note.title ?? "")).child(trailing ?? div()))
      .when(Boolean(note.body), el => el.child(div().child(note.body)))) ;
}
export function uiEmptyEditor(hints, footer) {
  const c = uiColors();
  return ideaUI(h_flex()).size_full().items_center().justify_center().bg(c.editor)
    .child(v_flex().id("empty-editor-hints").flex_none().gap(12).text_size(uiSize()).text_color(c.secondary)
      .children(hints.map(([label, shortcut]) => h_flex().gap(24).items_center()
        .child(div().flex_1().child(label)).child(div().flex_none().child(shortcut))))
      .when(Boolean(footer), el => el.child(div().mt(8).text_size(uiSize(12)).text_color(c.disabled).child(footer))));
}
export const uiToolbar = (id, children) => ideaUI(h_flex()).id(id).h(Math.max(IDEA.toolbarHeight, uiSize() + 12)).flex_none().items_center().gap(4).px(4).children(children);
export function uiToolHeader(id, title, { actions = [], content } = {}) {
  return ideaUI(h_flex()).id(id).h(Math.max(IDEA.toolHeaderHeight, uiSize() + 12)).flex_none().items_center().px(8).gap(4)
    .bg(uiColors().surface).text_color(uiColors().foreground).child(content ?? div().flex_1().min_w(0).truncate().child(title)).children(actions);
}
export function uiTab(id, children, { selected = false, active = true, onSelect, onClose, closeIcon, tip } = {}) {
  const c = uiColors();
  let fill = h_flex().h(Math.max(IDEA.tabFillHeight, uiSize() + 8)).items_center().gap(6).px(8).rounded(4)
    .bg(selected ? active ? c.tabSelected : c.selectionInactive : "#00000000").hover(s => s.bg(selected ? c.tabSelected : c.hover))
    .children(Array.isArray(children) ? children : [children]);
  if (onClose && closeIcon) fill = fill.child(uiIconButton(`${id}-close`, closeIcon, onClose, { size: 18, tip: "Close" }));
  let el = ideaUI(h_flex()).id(id).aria_selected(selected).h(Math.max(IDEA.tabHeight, uiSize() + 16)).flex_none().px(2).items_center().text_color(c.foreground).child(fill);
  if (onSelect) el = el.cursor_pointer().on_click(onSelect);
  if (onClose) el = el.on_mouse_down("middle", (event, cx) => { cx.stop_propagation(); onClose(event, cx); });
  if (tip) el = el.tooltip(tip);
  return el;
}
// Normal elements retain close/context/middle-click handlers. Keep their
// measured widths so changing the active file also reveals its whole tab.
export class TabViewport {
  constructor() { this.widths = new Map(); this.width = 0; this.offset = 0; }
  place(ids, active) {
    const live = new Set(ids);
    for (const id of this.widths.keys()) if (!live.has(id)) this.widths.delete(id);
    const widths = ids.map(id => this.widths.get(id) ?? 184);
    this.total = widths.reduce((sum, width) => sum + width, 0);
    const signature = JSON.stringify([ids, widths, this.width, active]);
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, this.total - this.width)));
    if (signature !== this.signature && this.width > 0) {
      const at = ids.indexOf(active), left = widths.slice(0, at).reduce((sum, width) => sum + width, 0);
      if (at >= 0) {
        if (left < this.offset || widths[at] > this.width) this.offset = left;
        else if (left + widths[at] > this.offset + this.width) this.offset = left + widths[at] - this.width;
      }
    }
    this.signature = signature;
    return this.offset;
  }
  scroll(delta) {
    this.offset = Math.max(0, Math.min(this.offset - delta, Math.max(0, this.total - this.width)));
  }
}
export function uiTabStrip(id, items, active, viewport) {
  const offset = viewport.place(items.map(item => item.id), active);
  return h_flex().id(id).flex_1().min_w(0).h_full().overflow_hidden()
    .on_size_change((size, cx) => {
      if (Math.abs(size.width - viewport.width) > 0.5) { viewport.width = size.width; cx.notify(); }
    })
    .on_scroll_wheel((event, cx) => {
      const delta = Number(event.delta?.x) || Number(event.delta?.y) || 0;
      viewport.scroll(delta); cx.stop_propagation(); cx.notify();
    })
    .child(h_flex().w(viewport.total).flex_none().h_full().ml(-offset)
      .children(items.map(item => item.content.on_size_change((size, cx) => {
        if (Math.abs(size.width - (viewport.widths.get(item.id) ?? 0)) > 0.5) { viewport.widths.set(item.id, size.width); cx.notify(); }
      }))));
}
export function uiPopupSize(rowCount, { width = 320, maxHeight = 400, extraHeight = 14 } = {}) {
  return { width, height: Math.min(maxHeight, Math.max(0, rowCount) * Math.max(IDEA.rowHeight, uiSize() + 8) + extraHeight) };
}
const selectable = row => row && !row.separator && !row.disabled;
export class MenuController {
  constructor(cx, selected = 0) {
    this.focus = cx.focus_handle(); this.scroll = VirtualListScrollHandle.new(); this.at = selected; this.released = false;
    if (selected > 0) this.scroll.scroll_to_item(selected, "center");
  }
  release() { if (!this.released) { this.scroll.release(); this.released = true; } }
  ensureVisible(index = this.at) { if (index >= 0 && !this.released) this.scroll.scroll_to_item(index, "center"); }
  normalize(rows) {
    if (!selectable(rows[this.at])) {
      const after = rows.findIndex((r, i) => i >= this.at && selectable(r));
      this.at = after >= 0 ? after : rows.findIndex(selectable);
    }
    return this.at;
  }
  select(index, rows, cx) {
    if (!selectable(rows[index])) return;
    this.at = index; this.ensureVisible(index); cx.notify();
  }
  activate(rows, event, cx, onClose) {
    const row = rows[this.at];
    if (!selectable(row)) return;
    onClose?.(event, cx); row.action?.(event, cx);
  }
  key(event, cx, rows, { onClose, pageSize = 10, closeOnActivate = true } = {}) {
    this.normalize(rows);
    const key = event.keystroke ?? event.key;
    const choices = rows.map((r, i) => selectable(r) ? i : -1).filter(i => i >= 0);
    const current = choices.indexOf(this.at);
    let next;
    if (key === "escape") { cx.stop_propagation(); onClose?.(event, cx); return true; }
    const dismiss = closeOnActivate ? onClose : undefined;
    if (key === "enter") { cx.stop_propagation(); this.activate(rows, event, cx, dismiss); return true; }
    if (/^[1-9]$/.test(key)) {
      const explicit = rows.findIndex(row => selectable(row) && row.shortcut === key);
      const index = explicit >= 0 ? explicit : rows.some(row => /^[1-9]$/.test(row.shortcut ?? "")) ? undefined : choices[Number(key) - 1];
      if (index !== undefined) { this.at = index; cx.stop_propagation(); this.activate(rows, event, cx, dismiss); return true; }
      return false;
    }
    if (key === "down") next = Math.min(choices.length - 1, current + 1);
    else if (key === "up") next = Math.max(0, current - 1);
    else if (key === "home") next = 0;
    else if (key === "end") next = choices.length - 1;
    else if (key === "pageup") next = Math.max(0, current - pageSize);
    else if (key === "pagedown") next = Math.min(choices.length - 1, current + pageSize);
    else return false;
    cx.stop_propagation();
    if (choices[next] !== undefined) this.select(choices[next], rows, cx);
    return true;
  }
}
export function uiMenu(id, rows, controller, cx, { width = 320, maxHeight = 400, onClose, closeOnActivate = true } = {}) {
  if (rows.some(row => row.icon && typeof row.icon !== "function")) throw new Error("uiMenu icons must be factories: icon: () => graphic()");
  controller.normalize(rows);
  const rowHeight = Math.max(IDEA.rowHeight, uiSize() + 8), heights = rows.map(r => r.separator ? 9 : rowHeight);
  const listHeight = Math.min(Math.max(rowHeight, maxHeight - 14), Math.max(rowHeight, heights.reduce((a, b) => a + b, 0)));
  const listWidth = Math.max(1, width - 14); // padding 6 + border 1 on each side
  const listId = `${id}-list`;
  const rowKey = i => String(rows[i].id ?? `${id}-separator-${i}`);
  return popupSurface(v_flex()).id(id).w(width).h(listHeight + 14).items_stretch().flex_none().p(6).track_focus(controller.focus)
    .on_key_down((event, eventCx) => controller.key(event, eventCx, rows, { onClose, closeOnActivate, pageSize: Math.max(1, Math.floor(listHeight / rowHeight)) }))
    .child(v_flex().w(listWidth).h(listHeight).flex_none().relative()
      .child(v_virtual_list(listId, rows.length, heights, rowKey,
        range => rows.slice(range.start, range.end).map((r, n) => {
          const index = range.start + n;
          if (r.separator) return div().h(9).flex_none().child(uiSeparator());
          return uiListRow(`${id}-${r.id ?? index}`, [
            ...(r.icon ? [r.icon()] : []), div().flex_1().min_w(0).truncate().child(r.label),
            ...(r.shortcut ? [div().flex_none().max_w(180).truncate().text_size(uiSize(11)).text_color(uiColors().secondary).child(r.shortcut)] : []),
          ], { selected: index === controller.at, disabled: r.disabled, interactive: true }).w(listWidth);
        })).size_full().track_scroll(controller.scroll).on_item_click((key, eventCx) => {
          const index = rows.findIndex((_row, i) => rowKey(i) === key);
          if (!selectable(rows[index])) return;
          eventCx.stop_propagation();
          controller.at = index;
          // Virtual-list clicks supply a stable key and context, no ClickEvent.
          controller.activate(rows, undefined, eventCx, closeOnActivate ? onClose : undefined);
        }))
      .child(Scrollbar.vertical(listId).absolute().inset_0()));
}
export function uiTreeRow(id, label, { depth = 0, selected = false, expanded, graphic, shortcut, onClick, disabled = false } = {}) {
  const c = uiColors();
  return uiListRow(id, [
    div().w(12).flex_none().text_color(c.secondary).child(expanded === undefined ? "" : expanded ? "⌄" : "›"),
    ...(graphic ? [graphic] : []), div().flex_1().min_w(0).truncate().child(label),
    ...(shortcut ? [div().flex_none().max_w(220).truncate().text_color(c.secondary).child(shortcut)] : []),
  ], { selected, disabled, onClick, indent: depth * 14 }).rounded(0);
}
export function uiSettingsShell(id, { title, sidebar, content, footer = [], width = 900, height = 700, sidebarWidth = 145 }) {
  const c = uiColors();
  return popupSurface(v_flex(), true).id(id).w(width).h(height).min_h(0).bg(c.surface)
    .child(h_flex().h(28).flex_none().px(16).items_center().text_color(c.secondary).child(title))
    .child(h_flex().flex_1().min_h(0).items_stretch()
      .child(v_flex().w(sidebarWidth).h_full().flex_none().min_h(0).border_r(1).border_color(c.separator).child(sidebar))
      .child(v_flex().flex_1().h_full().min_w(0).min_h(0).px(16).py(12).child(content)))
    .child(h_flex().h(46).flex_none().border_t(1).border_color(c.separator).px(14).items_center().justify_end().gap(8).children(footer));
}
export function uiDialog(id, { title, body, footer }) {
  // An auto-sized overlay has no definite parent height for h_full().
  // Callers may override this explicit default via .h(theirDialogHeight).
  return popupSurface(v_flex(), true).id(id).w_full().h(360).min_h(0)
    .child(uiCaption(title)).child(v_flex().flex_1().min_h(0).px(12).child(body))
    .child(h_flex().flex_none().items_center().justify_end().gap(8).p(12).children(Array.isArray(footer) ? footer : footer ? [footer] : []));
}
export const uiIslandBottom = () => div().h(IDEA.islandRadius).flex_none().bg(uiColors().surface).rounded_b(IDEA.islandRadius);

// Editor-local modes (such as Markdown preview) share the editor's lower chrome.
export const uiEditorFooter = children => ideaUI(h_flex()).w_full().h(IDEA.editorBreadcrumbHeight).flex_none()
  .px(8).gap(6).items_center().justify_end().bg(uiColors().editor).border_t(1).border_color(uiColors().separator)
  .children(Array.isArray(children) ? children : children ? [children] : []);

// Keep the stripe's hit area separate from its inset selection fill. The fill
// must never reach the window edge, even at compact density.
export function uiStripeButton(id, graphic, action, { active = false, tip = "", side } = {}) {
  const c = uiColors(), inset = 2;
  // The adjoining island contributes half its gap on the inside of a stripe.
  // Move only the fill/icon by half that inset, keeping the hit target fixed:
  // both visible margins then include the same share of the shell's spacing.
  const offset = (side === "left" ? 1 : side === "right" ? -1 : 0) * IDEA.islandGap / 4;
  const fill = h_flex().w(IDEA.stripeButtonWidth - inset * 2).h(IDEA.stripeButtonHeight - inset * 2)
    .relative().left(offset).items_center().justify_center().rounded(6).bg(active ? c.accent : "#00000000")
    .hover(s => s.bg(active ? c.accent : c.hover)).child(graphic);
  let button = h_flex().id(id).w(IDEA.stripeButtonWidth).h(IDEA.stripeButtonHeight).flex_none()
    .items_center().justify_center().cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((event, cx) => { cx.stop_propagation(); action(event, cx); }).child(fill);
  if (tip) button = button.tooltip(tip);
  return button;
}

export function uiCheckbox(id, label, action, { checked = false, disabled = false } = {}) {
  const c = uiColors();
  let checkbox = ideaUI(h_flex()).id(id).min_h(Math.max(IDEA.rowHeight, uiSize() + 8)).flex_none().gap(7).items_center()
    .text_color(disabled ? c.disabled : c.foreground)
    .child(h_flex().size(14).flex_none().items_center().justify_center().rounded(3).border_1()
      .border_color(disabled ? c.disabled : checked ? c.accent : c.border).bg(checked ? c.accent : c.surface)
      .text_size(12).text_color(c.accentForeground).child(checked ? "✓" : ""))
    .child(div().min_w(0).truncate().child(label));
  if (!disabled) checkbox = checkbox.cursor_pointer().on_click(action);
  return checkbox;
}
