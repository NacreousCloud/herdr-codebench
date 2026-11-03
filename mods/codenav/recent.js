// IntelliJ Recent Files: tool windows and the current editor space's file history.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { shared, props, closeOverlay, theme } from "herdr";
import { T } from "./i18n.js";
import { IDEA, uiSize, popupSurface, uiInputBox, uiListRow, uiSeparator, uiCheckbox } from "./idea-design.js";
import { editorKey, openPath, basename, tilde, icon } from "./common.js";
import { ideaImage, toolImage } from "./ideaicons.js";
import { TOOLS, toggleTool } from "./tools.js";
import { openEverywhere } from "./everywhere.js";

export default class RecentFiles {
  init(_p, cx) {
    this.focus = cx.focus_handle();
    this.fileScroll = VirtualListScrollHandle.new();
    this.toolScroll = VirtualListScrollHandle.new();
    this.column = "files"; this.fileAt = 0; this.toolAt = 0; this.onlyEdited = false;
    this.input = InputState.new({ placeholder: T("Type to filter") });
    this.input.on("change", (_e, cx) => { this.fileAt = 0; this.toolAt = 0; this.visible(); cx.notify(); });
    this.input.on("submit", () => this.choose());
    if (props()?.query) this.input.set_value(props().query);
    this.input.focus();
  }
  release() { this.fileScroll.release(); this.toolScroll.release(); }
  files() {
    const key = editorKey(), tabs = (shared("codenav.tabs") ?? {})[key] ?? [];
    const history = (shared("codenav.history") ?? {})[key]?.list ?? [];
    const order = [...history.map(x => x.id).reverse(), ...tabs.map(x => x.id).reverse()];
    const edited = new Set((shared("codenav.editedFiles") ?? {})[key] ?? []);
    const seen = new Set(), out = [], q = this.input.value().trim().toLowerCase();
    for (const id of order) {
      const tab = tabs.find(x => x.id === id), spec = tab?.spec;
      if (tab?.type !== "file" || typeof spec?.path !== "string" || seen.has(id)) continue;
      seen.add(id);
      if (this.onlyEdited && !edited.has(spec.path)) continue;
      if (q && !`${spec.path} ${spec.rel ?? ""}`.toLowerCase().includes(q)) continue;
      out.push({ id, ...spec });
    }
    return out;
  }
  tools() {
    const q = this.input.value().trim().toLowerCase();
    // Read TOOLS only at runtime: tools.js imports everywhere.js as well.
    return Object.entries(TOOLS).filter(([, t]) => !q || T(t.label).toLowerCase().includes(q));
  }
  visible() {
    this.fileScroll.scroll_to_item(this.fileAt, "center");
    this.toolScroll.scroll_to_item(this.toolAt, "center");
  }
  choose() {
    if (this.column === "tools") {
      const tool = this.tools()[this.toolAt];
      if (!tool) return;
      closeOverlay(props()?.overlay); toggleTool(tool[0], true);
    } else {
      const file = this.files()[this.fileAt];
      if (!file) return;
      closeOverlay(props()?.overlay); openPath(file.path, file.on ?? null);
    }
  }
  render(cx) {
    const t = theme(), files = this.files(), tools = this.tools(), rowHeight = Math.max(IDEA.rowHeight, uiSize() + 8);
    this.fileAt = Math.max(0, Math.min(this.fileAt, files.length - 1));
    this.toolAt = Math.max(0, Math.min(this.toolAt, tools.length - 1));
    const selected = this.column === "files" ? files[this.fileAt] : null;
    const locations = () => { closeOverlay(props()?.overlay); openEverywhere("locations"); };
    return popupSurface(v_flex()).id("cn-recent").w(500).h(520).items_stretch().text_color(t.foreground).text_size(uiSize()).track_focus(this.focus)
      .on_key_down((event, eventCx) => {
        const key = event.key ?? event.keystroke;
        if (key === "escape") closeOverlay(props()?.overlay);
        else if (key === "left") this.column = "tools";
        else if (key === "right") this.column = "files";
        else if (key === "tab") this.column = this.column === "files" ? "tools" : "files";
        else if (["up", "down", "home", "end", "pageup", "pagedown"].includes(key)) {
          const field = this.column === "files" ? "fileAt" : "toolAt", count = this.column === "files" ? files.length : tools.length;
          const delta = key === "up" ? -1 : key === "down" ? 1 : key === "pageup" ? -10 : 10;
          this[field] = key === "home" ? 0 : key === "end" ? Math.max(0, count - 1) : Math.max(0, Math.min(count - 1, this[field] + delta));
        } else if (key === "enter") this.choose();
        else return;
        this.visible(); eventCx.stop_propagation(); eventCx.notify();
      })
      .child(h_flex().h(32).flex_none().px(12).gap(8).items_center()
        .child(div().flex_1().font_semibold().child(T("Recent Files")))
        .child(uiCheckbox("recent-edited", T("Only Edited"), (_e, eventCx) => {
          this.onlyEdited = !this.onlyEdited; this.fileAt = 0; this.visible(); this.input.focus(); eventCx.notify();
        }, { checked: this.onlyEdited })))
      .child(uiInputBox(Input.new(this.input), { focused: true }).mx(8).flex_none())
      .child(uiSeparator())
      .child(h_flex().flex_1().min_h(0).items_stretch()
        .child(v_flex().w(200).h_full().flex_none().min_h(0).relative().border_r(1).border_color(t.border)
          .child(v_virtual_list("recent-tools", tools.length, rowHeight, i => tools[i][0], range => tools.slice(range.start, range.end).map(([name, tool], n) => {
            const i = range.start + n;
            return uiListRow(`recent-tool-${name}`, [toolImage(tool.idea, 16), div().flex_1().min_w(0).truncate().child(T(tool.label)), div().text_size(uiSize(11)).text_color(t.dim).child(tool.key)],
              { selected: i === this.toolAt, focused: this.column === "tools", interactive: true }).mx(4);
          })).size_full().track_scroll(this.toolScroll).on_item_click((key) => {
            const index = tools.findIndex(([name]) => name === key); if (index < 0) return;
            this.column = "tools"; this.toolAt = index; this.choose();
          }))
          .child(Scrollbar.vertical("recent-tools").absolute().inset_0()))
        .child(v_flex().flex_1().h_full().min_w(0).min_h(0).relative()
          .when(Boolean(files.length), el => el.child(v_virtual_list("recent-files", files.length, rowHeight, i => String(files[i].id), range => files.slice(range.start, range.end).map((file, n) => {
            const i = range.start + n;
            return uiListRow(`recent-file-${i}`, [ideaImage(file.path, false, 16), div().flex_1().min_w(0).truncate().child(basename(file.path))],
              { selected: i === this.fileAt, focused: this.column === "files", interactive: true }).mx(4);
          })).size_full().track_scroll(this.fileScroll).on_item_click((key) => {
            const index = files.findIndex(file => String(file.id) === key); if (index < 0) return;
            this.column = "files"; this.fileAt = index; this.choose();
          })).child(Scrollbar.vertical("recent-files").absolute().inset_0()))
          .when(!files.length, el => el.child(div().px(12).py(10).text_color(t.dim).child(T(this.onlyEdited ? "No edited files" : "No recent files"))))))
      .child(h_flex().h(28).flex_none().px(10).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(uiSize(11)).text_color(t.dim).child(selected ? `${selected.on ? `${selected.on}: ` : ""}${tilde(selected.path)}` : ""))
        .child(div().id("recent-locations").flex_none().text_size(uiSize(11)).text_color(t.accent).cursor_pointer().on_click(locations).child(T("Recent Locations"))));
  }
}
