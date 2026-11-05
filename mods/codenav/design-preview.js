// Developer gallery. All actions affect this view's local example state only.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { props, openOverlay, closeOverlay } from "herdr";
import {
  IDEA, isCompact, uiSize, uiColors, ideaUI, uiButton, uiIconButton,
  uiInputBox, uiListRow, uiSeparator, uiCaption, uiToolbar, uiToolHeader,
  uiTab, uiPopupSize, uiDialog, uiIslandBottom, MenuController, uiMenu,
  uiCheckbox, uiStripeButton, uiTreeRow, uiSettingsShell, uiEditorFooter, uiSpinner,
  uiDiagnosticUnderline, uiDiagnosticTooltip, uiDiagnosticCard,
} from "./idea-design.js";
import { toolImage } from "./ideaicons.js";

export default class DesignPreview {
  init(p, cx) {
    this.variant = p?.variant ?? props()?.variant;
    this.focus = cx.focus_handle();
    this.status = "Ready — examples change local state only";
    this.selected = 1; this.tab = 0; this.clicks = 0;
    this.checked = false; this.stripe = 0; this.expanded = true; this.treeSelected = 0; this.settingsCategory = 0;
    this.sampleWidth = p?.sampleWidth ?? 640; this.sampleHeight = p?.sampleHeight ?? 420;
    if (this.variant === "menu") {
      this.menu = new MenuController(cx, 3);
      this.menu.focus.focus();
      this.status = "Choose an example; Escape closes";
      return;
    }
    this.inputs = ["Editable example", "Focused border example", "Invalid example", "const answer = 42;"].map(value => {
      const input = InputState.new({ placeholder: "Type an example" });
      input.set_value(value);
      input.on("change", (_event, eventCx) => { this.status = "Input changed locally"; eventCx.notify(); });
      return input;
    });
    this.focus.focus();
  }
  release() { this.menu?.release(); }
  update(message, cx) { this.status = message; cx.notify(); }
  openMenu() {
    openOverlay({ mod: "codenav", props: { view: "designpreview", variant: "menu" }, kind: "popup", frame: "none", ...uiPopupSize(100, { width: 320, maxHeight: 360 }) });
  }
  openSettingsSample() {
    openOverlay({ mod: "codenav", props: { view: "designpreview", variant: "settings", sampleWidth: 640, sampleHeight: 420 }, kind: "dialog", frame: "none", width: 640, height: 420 });
  }
  renderSettingsSample(close) {
    const c = uiColors();
    const sidebar = v_flex().id("preview-settings-sidebar").size_full().min_h(0).overflow_y_scrollbar().py(8)
      .children(["Appearance sample", "Editor sample"].map((label, i) => uiTreeRow(`preview-category-${i}`, label, {
        selected: this.settingsCategory === i, onClick: (_e, cx) => { this.settingsCategory = i; this.update(`${label} — local only`, cx); },
      })));
    const content = v_flex().id("preview-settings-content").size_full().min_h(0).overflow_y_scrollbar().gap(10)
      .child(uiCaption(this.settingsCategory === 0 ? "Appearance sample — no personal settings are written" : "Editor sample — no personal settings are written"))
      .child(uiCheckbox("preview-settings-checkbox", "Example preference", (_e, cx) => { this.checked = !this.checked; this.update("Example preference changed locally", cx); }, { checked: this.checked }))
      .child(uiInputBox(Input.new(this.inputs[0])))
      .child(uiCheckbox("preview-settings-disabled", "Unavailable preference", () => {}, { checked: true, disabled: true }))
      .child(uiSeparator()).child(uiCaption(this.status));
    return uiSettingsShell("preview-settings-shell", {
      title: "Settings shell — developer sample", sidebar, content,
      width: this.sampleWidth, height: this.sampleHeight, sidebarWidth: 145,
      footer: [uiButton("preview-settings-cancel", "Cancel", close), uiButton("preview-settings-apply", "Apply example", (_e, cx) => this.update("Apply example clicked — local state only", cx)), uiButton("preview-settings-close", "Close", close, { primary: true })],
    }).track_focus(this.focus).on_key_down((event, cx) => { if ((event.key ?? event.keystroke) === "escape") { close(); cx.stop_propagation(); } });
  }
  render(cx) {
    const close = () => closeOverlay(props()?.overlay);
    if (this.variant === "settings") return this.renderSettingsSample(close);
    if (this.variant === "menu") {
      const rows = [
        { id: "status", label: this.status, disabled: true },
        { id: "disabled", label: "Unavailable example", disabled: true },
        { separator: true },
        ...Array.from({ length: 100 }, (_, i) => ({ id: `example-${i}`, label: `Example ${String(i + 1).padStart(3, "0")}`,
          icon: () => toolImage("project", 16), disabled: i === 4 || i === 49,
          shortcut: i < 9 ? String(i + 1) : undefined,
          action: (_event, eventCx) => this.update(`Selected example ${i + 1} — local only`, eventCx) })),
      ];
      return uiMenu("design-preview-menu", rows, this.menu, cx, { width: 320, maxHeight: 360, closeOnActivate: false, onClose: close });
    }
    const c = uiColors();
    const label = text => ideaUI(div()).flex_1().min_w(0).truncate().text_color(c.foreground).child(text);
    const caption = text => uiCaption(text);
    const section = (title, children) => v_flex().flex_none().gap(4).child(caption(title)).children(children);
    const sampleInput = (index, options, title) => v_flex().flex_1().min_w(0).gap(4)
      .child(caption(title)).child(uiInputBox(Input.new(this.inputs[index]), options));
    const rows = ["Normal row", "Selected row", "Inactive selected row", "Disabled row", "Indented row"];
    const colors = Object.entries(c), swatchRows = [];
    for (let i = 0; i < colors.length; i += 4) {
      swatchRows.push(h_flex().flex_none().gap(6).children(colors.slice(i, i + 4).map(([name, value]) => h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().size(16).flex_none().rounded(3).border_1().border_color(c.border).bg(value))
        .child(div().flex_1().min_w(0).truncate().text_size(uiSize(11)).text_color(c.secondary).child(`${name} ${value}`)))));
    }
    const body = v_flex().id("design-preview-body").flex_1().min_h(0).overflow_y_scrollbar().gap(10).pb(8)
      .child(section("Typography and active density", [
        h_flex().flex_none().gap(12).items_center().children([11, 13, 16].map(size => ideaUI(div()).text_size(uiSize(size)).child(`UI ${size} · Aa 가나다 0123`))),
        caption(`${isCompact() ? "Compact" : "Normal"} · UI ${uiSize()} · row ${IDEA.rowHeight} · input ${IDEA.inputHeight} · tab ${IDEA.tabHeight}/${IDEA.tabFillHeight} · island ${IDEA.islandRadius}`),
      ]))
      .child(section("Editor diagnostics — hover the wave, no breakpoint dots", [
        ...[[1, "Type mismatch", "Type 'string' is not assignable to type 'number'."], [2, "Unused declaration", "The declaration is never used."]].map(([severity, label, message]) =>
          uiDiagnosticTooltip(`preview-diagnostic-${severity}`, uiDiagnosticUnderline(div().flex_none().font_family("Menlo").text_size(13).child(label),
            { width: label.length * 7.8, severity }), [{ severity, source: "ts", code: severity === 1 ? "2322" : "6133", message }], { path: "src/example.ts" })),
        uiDiagnosticCard("preview-diagnostic-card", [{ severity: 2, source: "detekt", code: "LongParameterList", message: "The constructor has too many parameters. The current threshold is set to 7." }], { path: "src/main/kotlin/PlaylistService.kt", actions: [
          { id: "copy", label: "Copy example", action: (_event, eventCx) => this.update("Copy clicked — local example only", eventCx) },
          { id: "attach", label: "Attach to AI", disabled: true },
        ] }),
      ]))
      .child(uiSeparator())
      .child(section("Buttons and icon buttons", [
        h_flex().flex_none().gap(8).items_center()
          .child(uiButton("preview-button", "Normal", (_e, eventCx) => this.update(`Button clicked ${++this.clicks} time(s)`, eventCx)))
          .child(uiButton("preview-primary", "Primary", (_e, eventCx) => this.update("Primary action — local only", eventCx), { primary: true }))
          .child(uiButton("preview-disabled", "Disabled", () => {}, { disabled: true }))
          .child(uiIconButton("preview-icon", toolImage("settings", 16), (_e, eventCx) => this.update("Icon action — local only", eventCx), { tip: "Normal icon" }))
          .child(uiIconButton("preview-icon-active", toolImage("search", 16), (_e, eventCx) => this.update("Active icon — local only", eventCx), { tip: "Active icon", active: true }))
          .child(uiIconButton("preview-icon-disabled", toolImage("add", 16), () => {}, { tip: "Disabled icon", disabled: true })),
      ]))
      .child(section("Inputs: explicit component state examples", [
        h_flex().flex_none().gap(10).child(sampleInput(0, {}, "Normal")).child(sampleInput(1, { focused: true }, "Focused")),
        h_flex().flex_none().gap(10).child(sampleInput(2, { error: true }, "Error")).child(sampleInput(3, { mono: true }, "Monospace")),
      ]))
      .child(section("Checkbox and stripe buttons: local state only", [
        h_flex().gap(8).items_center().children([uiSpinner(() => svg("mods/codenav/idea-icons/progress.svg")), caption("Working — native animation, 1000 ms cycle")]),
        h_flex().flex_none().gap(16).items_center()
          .child(uiCheckbox("preview-checkbox", "Toggle example", (_e, eventCx) => { this.checked = !this.checked; this.update(`Checkbox ${this.checked ? "checked" : "unchecked"}`, eventCx); }, { checked: this.checked }))
          .child(uiCheckbox("preview-checkbox-disabled", "Disabled", () => {}, { checked: true, disabled: true })),
        h_flex().flex_none().gap(8).items_center().children(["project", "terminal"].map((name, i) => uiStripeButton(`preview-stripe-${i}`, toolImage(name, 16, this.stripe === i), (_e, eventCx) => {
          this.stripe = this.stripe === i ? -1 : i; this.update(`Stripe ${name} ${this.stripe === i ? "active" : "inactive"} — local only`, eventCx);
        }, { active: this.stripe === i, tip: `${name} — sample`, side: i === 0 ? "left" : "right" }))),
      ]))
      .child(section("Tree rows and settings shell", [
        uiTreeRow("preview-tree-parent", "Example folder", { expanded: this.expanded, graphic: toolImage("project", 16), selected: this.treeSelected === 0,
          onClick: (_e, eventCx) => { this.expanded = !this.expanded; this.treeSelected = 0; this.update(`Tree ${this.expanded ? "expanded" : "collapsed"}`, eventCx); } }),
        ...(this.expanded ? [uiTreeRow("preview-tree-child", "Example child", { depth: 1, selected: this.treeSelected === 1, shortcut: "Child",
          onClick: (_e, eventCx) => { this.treeSelected = 1; this.update("Tree child selected — local only", eventCx); } }),
        uiTreeRow("preview-tree-disabled", "Unavailable child", { depth: 1, disabled: true })] : []),
        uiButton("preview-settings-sample", "Open settings shell sample…", () => this.openSettingsSample()),
      ]))
      .child(section("Rows: select any enabled example", rows.map((text, i) => uiListRow(`preview-row-${i}`, [toolImage("project", 16), label(text)], {
        selected: i === 2 || this.selected === i, focused: i !== 2, disabled: i === 3, indent: i === 4 ? 22 : 0,
        onClick: (_e, eventCx) => { this.selected = i; this.update(`Row ${i + 1} selected`, eventCx); },
      }))))
      .child(section("Tabs and toolbar", [
        h_flex().flex_none().children(["First.js", "Second.js", "Inactive.js"].map((title, i) => uiTab(`preview-tab-${i}`, title, {
          selected: this.tab === i || i === 2, active: i !== 2, closeIcon: toolImage("close", 12),
          onSelect: (_e, eventCx) => { this.tab = i; this.update(`Tab ${title} selected`, eventCx); },
          onClose: (_e, eventCx) => this.update(`Close ${title} requested — example retained`, eventCx),
        }))),
        uiToolbar("preview-toolbar", [uiIconButton("preview-toolbar-add", toolImage("add", 16), (_e, eventCx) => this.update("Toolbar action — local only", eventCx)), uiButton("preview-menu", "Open 100-row menu…", () => this.openMenu(), { small: true })]),
        uiToolHeader("preview-tool-header", "Tool window header", { actions: [uiIconButton("preview-header-settings", toolImage("settings", 16), (_e, eventCx) => this.update("Header action — local only", eventCx))] }),
        uiIslandBottom(),
        uiEditorFooter(uiIconButton("preview-markdown-mode", toolImage("markdown", 12), (_e, eventCx) => this.update("Markdown footer mode — local example only", eventCx), { size: 20, tip: "Markdown preview — lower editor control" })),
      ]))
      .child(section("Semantic colors from uiColors()", swatchRows))
      .child(section("Empty / loading / failure composition examples", [
        caption("No results — empty state sample"), caption("Searching… — loading state sample"),
        h_flex().flex_none().gap(8).items_center().child(caption("Example failure")).child(uiButton("preview-retry", "Retry", (_e, eventCx) => this.update("Retry requested — no external work", eventCx), { small: true })),
      ]));
    return uiDialog("design-preview", { title: "IntelliJ common component gallery", body,
      footer: [div().flex_1().min_w(0).truncate().text_size(uiSize(11)).text_color(c.secondary).child(this.status), uiButton("preview-close", "Close", close)] })
      .h(680).track_focus(this.focus).on_key_down((event, eventCx) => { if ((event.key ?? event.keystroke) === "escape") { close(); eventCx.stop_propagation(); } });
  }
}
