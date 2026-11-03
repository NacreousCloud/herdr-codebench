// The Explorer's file actions: its right-click menu (a popup) and the dialogs
// it opens (new file / folder, rename, delete). Both are short-lived overlays, so
// the work itself is done by the Explorer: they post a request in shared
// "activity.fileop" and close. Copy / cut put items in shared "activity.clip".
//
// target: { root, on, folder (absolute, where new things go), items: [{ path, rel, dir }] }
import { div } from "gpui-kit";
import { IDEA, isIdea, uiSize, ideaUI, popupSurface, MenuController, uiMenu, uiDialog, uiButton, uiInputBox } from "./idea-design.js";
import { T } from "./i18n.js";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, openOverlay, setShared, shared } from "herdr";
import { MOD, icon } from "./common.js";

export const OP = "activity.fileop";
export const CLIP = "activity.clip";

/** Asks the Explorer to do something. */
export const request = (op) => setShared(OP, { ...op, seq: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() });

const relOf = (target, path) => path === target.root ? "." : path.startsWith(target.root + "/") ? path.slice(target.root.length + 1) : path;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Opens a dialog for an action that needs a name or a confirmation. */
export function openDialog(mode, target) {
  openOverlay({ mod: MOD, kind: "dialog", width: isIdea() ? Math.round(440 * Math.max(1, uiSize() / 13)) : 440, height: Math.round((mode === "delete" ? 180 : 196) * (isIdea() ? Math.max(1, uiSize() / 13) : 1)), props: { view: "fileprompt", mode, target } });
}

// [label, icon, shortcut, action(cx)] or "-" for a line.
function items(target) {
  const list = target.items, one = list.length === 1 ? list[0] : null, remote = Boolean(target.on);
  const paths = list.length ? list.map((i) => i.path) : [target.folder];
  const clip = shared(CLIP);
  const out = [
    ["New File…", "file-plus", "", () => openDialog("new-file", target)],
    ["New Folder…", "folder-plus", "", () => openDialog("new-folder", target)],
    "-",
  ];
  if (one && !one.dir) out.push(["Open with System App", "external", "", () => request({ op: "open-ext", target })]);
  out.push(["Open in Terminal", "terminal", "", () => request({ op: "terminal", target })]);
  if (!remote) out.push(["Reveal in File Manager", "folder-open", "", () => request({ op: "reveal", target })]);
  if (remote) out.push([list.length ? `Download${list.length > 1 ? ` ${list.length} Items` : ""} to ~/Downloads` : "Download Folder to ~/Downloads", "download", "", () => request({ op: "download", target })]);
  out.push("-");
  if (list.length) {
    out.push(["Cut", "scissors", isIdea() ? "Cmd+X" : "Ctrl+X", () => request({ op: "cut", target })]);
    out.push(["Copy", "copy", isIdea() ? "Cmd+C" : "Ctrl+C", () => request({ op: "copy", target })]);
  }
  out.push([clip?.items?.length ? `Paste ${plural(clip.items.length, "Item")}${clip.cut ? " (Move)" : ""}` : "Paste", "clipboard", isIdea() ? "Cmd+V" : "Ctrl+V", () => request({ op: "paste", target })]);
  out.push("-");
  out.push(["Copy Path", "link", isIdea() ? "Cmd+Shift+C" : "Ctrl+Alt+C", (cx) => cx.write_to_clipboard(paths.join("\n"))]);
  out.push(["Copy Relative Path", "link", isIdea() ? "Cmd+Shift+Alt+C" : "Ctrl+Shift+Alt+C", (cx) => cx.write_to_clipboard(paths.map((p) => relOf(target, p)).join("\n"))]);
  if (list.length) {
    out.push("-");
    if (one) out.push(["Rename…", "pencil", isIdea() ? "⇧F6" : "F2", () => openDialog("rename", target)]);
    out.push([list.length > 1 ? `Delete ${list.length} Items` : "Delete", "trash", "Delete", () => openDialog("delete", target)]);
  }
  return out;
}

/** The popup's height for a target, so it opens at its size. */
export function menuHeight(target) {
  const height = items(target).reduce((h, it) => h + (it === "-" ? 9 : isIdea() ? Math.max(IDEA.rowHeight, uiSize() + 8) : 28), isIdea() ? 12 : 10);
  return isIdea() ? Math.min(400, height) : height;
}

export class FileMenu {
  init(p, cx) {
    this.target = p.target; this.at = isIdea() ? 0 : -1;
    if (isIdea()) {
      this.menu = new MenuController(cx);
      this.menu.focus.focus();
      cx.timer.after(0, () => this.menu.focus.focus());
      return;
    }
    this.h = cx.focus_handle(); this.h.focus();
    if (isIdea()) cx.timer.after(0, () => this.h.focus());
  }

  release() { this.menu?.release(); this.h?.release(); }

  choose(it, cx) {
    closeOverlay(props()?.overlay);
    it[3](cx);
  }

  render(cx) {
    const t = theme(), list = items(this.target), real = list.filter((x) => x !== "-");
    if (this.menu) return uiMenu("file-menu", list.map((it, i) => it === "-" ? { separator: true } : {
      id: `fm-${i}`, label: T(it[0]), icon: () => icon(it[1], IDEA.iconSize).text_color(t.muted), shortcut: it[2],
      disabled: it[0].startsWith("Paste") && !shared(CLIP)?.items?.length,
      action: (_event, eventCx) => it[3](eventCx),
    }), this.menu, cx, { width: 270, maxHeight: 400, onClose: () => closeOverlay(props()?.overlay) });
    return popupSurface(v_flex().id("file-menu").track_focus(this.h).size_full().p(5).bg(t.popover).text_color(t.foreground).text_size(uiSize(12.5)))
      .on_mouse_down("left", () => { if (isIdea()) this.h.focus(); })
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % real.length;
        else if (e.key === "up") this.at = (this.at + real.length - 1) % real.length;
        else if (e.key === "enter" && real[this.at]) { if (isIdea()) cx.stop_propagation(); return this.choose(real[this.at], cx); }
        else if (e.key === "escape") { if (isIdea()) cx.stop_propagation(); return closeOverlay(props()?.overlay); }
        else return;
        if (isIdea()) cx.stop_propagation();
        cx.notify();
      })
      .children(list.map((it, i) => it === "-" ? div().mx(6).my(4).h(1).flex_none().bg(t.border)
        : h_flex().id(`fm-${i}`).h(isIdea() ? IDEA.rowHeight : 28).flex_none().px(8).gap(isIdea() ? 6 : 9).rounded(isIdea() ? IDEA.selectionRadius : 6).items_center().cursor_pointer()
          .when(real.indexOf(it) === this.at, (el) => el.bg(t.selected)).when(!isIdea() || real.indexOf(it) !== this.at, (el) => el.hover((s) => s.bg(t.hover)))
          .on_click((_e, cx) => this.choose(it, cx))
          .child(icon(it[1], isIdea() ? IDEA.iconSize : 14).text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().child(isIdea() ? T(it[0]) : it[0]))
          .child(div().flex_none().text_size(uiSize(11)).text_color(t.dim).child(it[2]))));
  }
}

// New file / new folder / rename (a name) and delete (a confirmation).
export class FilePrompt {
  init(p, cx) {
    this.mode = p.mode; this.target = p.target; this.error = null;
    const one = this.target.items[0];
    if (this.mode !== "delete") {
      const value = this.mode === "rename" ? one.path.split("/").pop() : "";
      this.input = InputState.new({ value, placeholder: this.mode === "new-folder" ? "folder name" : "file name (a/b.txt makes folders too)" });
      if (value) {
        const dot = one.dir ? -1 : value.lastIndexOf(".");
        this.input.set_selected_range({ start: 0, end: dot > 0 ? dot : value.length });
      }
      this.input.on("submit", () => this.submit());
      this.input.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      this.input.focus();
      cx.timer.after(300, () => this.input.focus());
    }
    this.h = cx.focus_handle();
    if (this.mode === "delete") this.h.focus();
  }

  submit() {
    const { target, mode } = this;
    if (mode === "delete") {
      request({ op: "delete", target });
      return closeOverlay(props()?.overlay);
    }
    const name = this.input.value().trim().replace(/\/+$/, "");
    if (!name || name === "." || name === ".." || name.startsWith("/") || name.split("/").includes("..")) { this.error = "Enter a name inside this folder"; return; }
    if (mode === "rename") {
      const from = target.items[0].path, to = `${from.replace(/\/[^/]*$/, "")}/${name}`;
      if (to !== from) request({ op: "rename", target, to });
    } else request({ op: "new", target, path: `${target.folder}/${name}`, dir: mode === "new-folder" });
    closeOverlay(props()?.overlay);
  }

  render(cx) {
    const t = theme(), { mode, target } = this, list = target.items;
    const where = target.on ? `${target.on}:` : "";
    const title = mode === "new-file" ? "New File" : mode === "new-folder" ? "New Folder" : mode === "rename" ? "Rename" : "Delete";
    const button = (id, text, kind, action) => h_flex().id(id).h(isIdea() ? IDEA.inputHeight : 30).px(14).items_center().rounded(isIdea() ? IDEA.controlRadius : 7)
      .border_1().border_color(kind ? (kind === "danger" ? t.ansi1 : t.solid) : t.input).bg(kind === "danger" ? t.ansi1 : kind ? t.solid : t.raised)
      .text_color(kind ? t.solid_foreground : t.foreground).text_size(uiSize(12.5)).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    const sub = mode === "delete"
      ? (target.on ? `Permanently delete ${list.length === 1 ? `"${list[0].path.split("/").pop()}"` : plural(list.length, "item")} on ${target.on}? This can't be undone.`
        : `Move ${list.length === 1 ? `"${list[0].path.split("/").pop()}"` : plural(list.length, "item")} to the Trash?`)
      : `in ${where}${relOf(target, mode === "rename" ? list[0].path.replace(/\/[^/]*$/, "") : target.folder)}`;
    if (isIdea()) {
      const body = v_flex().gap(8).min_h(0)
        .child(div().text_size(uiSize(12)).text_color(t.dim).child(sub))
        .when(mode !== "delete", el => el.child(uiInputBox(Input.new(this.input).w_full(), { focused: true, error: Boolean(this.error) })))
        .when(Boolean(this.error), el => el.child(div().text_size(uiSize(11.5)).text_color(t.ansi1).child(this.error)));
      return uiDialog("file-prompt", { title: T(title), body, footer: [
        uiButton("fp-cancel", T("Cancel"), () => closeOverlay(props()?.overlay)),
        uiButton("fp-ok", T(mode === "delete" ? (target.on ? "Delete" : "Move to Trash") : mode === "rename" ? "Rename" : "Create"), () => this.submit(), { primary: true }),
      ] }).h(mode === "delete" ? 180 : 196).track_focus(this.h).on_key_down((e, eventCx) => {
        if (e.key === "escape") { closeOverlay(props()?.overlay); eventCx.stop_propagation(); }
        else if (e.key === "enter" && mode === "delete") { this.submit(); eventCx.stop_propagation(); }
      });
    }
    return popupSurface(v_flex().id("file-prompt").track_focus(this.h).size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground), true)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
        else if (e.key === "enter" && mode === "delete") { this.submit(); cx.stop_propagation(); }
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(uiSize(15)).font_semibold().child(isIdea() ? T(title) : title)).child(div().text_size(uiSize(11)).text_color(t.dim).child("Esc")))
      .child(div().text_size(uiSize(12)).text_color(t.dim).child(sub))
      .when(mode !== "delete", (el) => el.child(ideaUI(Input.new(this.input)).h(isIdea() ? IDEA.inputHeight : 34).px(10).rounded(isIdea() ? IDEA.controlRadius : 8).border_1().border_color(this.error ? t.ansi1 : t.accent).bg(t.background).text_size(uiSize(12.8)).text_color(t.foreground)))
      .when(Boolean(this.error), (el) => el.child(div().text_size(uiSize(11.5)).text_color(t.ansi1).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end()
        .child(button("fp-cancel", T("Cancel"), null, () => closeOverlay(props()?.overlay)))
        .child(button("fp-ok", mode === "delete" ? (target.on ? "Delete" : "Move to Trash") : mode === "rename" ? "Rename" : "Create", mode === "delete" ? "danger" : "solid", () => this.submit())));
  }
}
