// Canonical IntelliJ components; generate deployable copies with sync_ui.py.
import { div } from "gpui-kit";
import { h_flex, v_flex, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { shared, settings, theme } from "herdr";
import { IDEA_TOKENS } from "./idea-tokens.js";

export const isIdea = () => shared("layout") === "idea";
export const isCompact = () => isIdea() && shared("codenav.appearance")?.compact !== false;
const density = (normal, compact) => isCompact() ? compact : normal;
const metric = (name, normal, compact = normal) => Number(isCompact()
  ? IDEA_TOKENS["ui.metrics"]?.[`${name}.compact`] ?? compact
  : IDEA_TOKENS["ui.metrics"]?.[name] ?? normal);
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
  };
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

// Keep the stripe's hit area separate from its inset selection fill. The fill
// must never reach the window edge, even at compact density.
export function uiStripeButton(id, graphic, action, { active = false, tip = "" } = {}) {
  const c = uiColors(), inset = 2;
  const fill = h_flex().w(IDEA.stripeButtonWidth - inset * 2).h(IDEA.stripeButtonHeight - inset * 2)
    .items_center().justify_center().rounded(6).bg(active ? c.accent : "#00000000")
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
    .child(div().child(label));
  if (!disabled) checkbox = checkbox.cursor_pointer().on_click(action);
  return checkbox;
}
