// Installation is a guide; only explicit Check/Start buttons contact the engine.
import { div } from "gpui-kit";
import { h_flex, v_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { focused, spaces, window, pickFolder, closeOverlay, openOverlay, run } from "herdr";
import { MenuController, IDEA, uiSize, uiColors, uiCaption, uiButton, uiInputBox, uiListRow, uiSettingsShell } from "./idea-design.js";
import { codeFont } from "./common.js";
import { T } from "./i18n.js";
import { lsp } from "./lsp.js";
import { INSTALL_LANGUAGES, installationGuide } from "./lsp-install-guide.js";

const pathText = value => typeof value === "string" ? value.trim() : "";
const errorText = error => String(error?.message ?? error ?? "");
const commandText = value => Array.isArray(value) ? value.join(" ") : String(value ?? "");

export const openLspSetup = (options = {}) => openOverlay({
  mod: "codenav", props: { view: "lsp-setup", ...options }, kind: "dialog", frame: "none", width: 900, height: 680,
});

export class LspSetup {
  init(p, cx) {
    this.overlay = p?.overlay;
    this.alive = true; this.generation = 0; this.busy = null; this.status = null; this.error = null; this.copied = null;
    this.language = INSTALL_LANGUAGES.some(entry => entry.id === p?.language) ? p.language : null;
    const context = focused(), space = spaces().find(item => item.id === context?.space || !context?.space && item.active);
    // The setup engine is local. A remote terminal's cwd is not a local root.
    this.root = pathText(p?.root) || (space?.machine ? "" : pathText(context?.cwd) || pathText(space?.folder));
    this.platform = window()?.platform;
    this.menu = new MenuController(cx, Math.max(0, INSTALL_LANGUAGES.findIndex(entry => entry.id === this.language)));
    this.menu.focus.focus();
  }

  release() {
    if (!this.alive) return;
    this.alive = false; ++this.generation;
    this.menu.release(); this.menu.focus.release();
  }
  dismiss() { this.release(); if (this.overlay) closeOverlay(this.overlay); }
  entry() { return INSTALL_LANGUAGES.find(entry => entry.id === this.language) ?? null; }
  invalidate() { ++this.generation; this.busy = null; this.status = null; this.error = null; this.copied = null; }

  select(id, cx) {
    if (!this.alive) return;
    const index = INSTALL_LANGUAGES.findIndex(entry => entry.id === id);
    if (index < 0) return;
    if (this.language === id) { this.menu.at = index; cx.notify(); return; }
    this.language = id; this.menu.at = index; this.invalidate(); cx.notify();
  }

  chooseRoot(cx) {
    if (!this.alive) return;
    // Invalidate before opening the native picker: an old request must not
    // update this screen while its project context is being changed.
    this.invalidate(); const generation = this.generation;
    this.busy = "folder"; cx.notify();
    cx.spawn(async taskCx => {
      let root, error;
      try { root = await pickFolder({ prompt: T("Choose a project folder for LSP") }); }
      catch (failure) { error = errorText(failure); }
      if (!this.alive || generation !== this.generation) return;
      if (root) this.root = root;
      this.busy = null; this.error = error ?? null; taskCx.notify();
    });
  }

  canRequest(method) {
    if (!this.alive || !this.entry() || !this.root || this.busy) return false;
    return method === "setup_status" || method === "setup_start" && Boolean(this.status?.installed) && !this.status.running;
  }

  request(method, cx) {
    if (!this.canRequest(method)) return;
    const entry = this.entry(), root = this.root;
    const generation = ++this.generation;
    this.busy = method; this.status = null; this.error = null; this.copied = null; cx.notify();
    cx.spawn(async taskCx => {
      let status, error;
      try {
        const result = await lsp(method, { lang: entry.languageId ?? entry.id, root }, ms => taskCx.sleep(ms));
        if (!result || typeof result.installed !== "boolean" || typeof result.running !== "boolean")
          throw new Error(T("The engine returned an invalid LSP setup result."));
        status = result;
        error = status.error ? errorText(status.error) : null;
      } catch (failure) { error = errorText(failure); }
      if (!this.alive || generation !== this.generation) return;
      this.busy = null; this.status = status ?? null; this.error = error;
      if (method === "setup_start" && status?.running && !error) run("codenav.retry-lsp");
      taskCx.notify();
    });
  }

  copy(id, value, cx) {
    try { cx.write_to_clipboard(value); this.copied = id; }
    catch (error) { this.error = errorText(error); }
    cx.notify();
  }

  guideText(guide) {
    return [
      T("Install the SDK and language server for this Herdr project using the official instructions below."),
      `${T("Language")}: ${this.entry()?.label ?? guide.title}`,
      `${T("Platform")}: ${this.platform ?? T("Unknown")}`,
      `${T("Project folder")}: ${this.root || T("Not selected")}`,
      guide.title, ...guide.requirements,
      ...guide.steps.flatMap(step => [step.title, step.detail, step.command, step.url].filter(Boolean)),
      ...guide.notes,
      T("Completion conditions"),
      T("Verify the required SDK version and the language server executable path after installation."),
      T("Do not leave an independent stdio language server running. Herdr manages the server process."),
      T("After installation, use Herdr Check Installation and Start LSP for this project. Report the actual result and any exact error; installation alone does not confirm initialization."),
    ].join("\n\n");
  }

  sidebar() {
    const rows = INSTALL_LANGUAGES.map(entry => ({ id: entry.id, label: entry.label, action: (_event, cx) => this.select(entry.id, cx) }));
    const rowHeight = Math.max(IDEA.rowHeight, uiSize() + 8);
    return v_flex().h_full().min_h(0).py(8)
      .child(uiCaption(T("1. Select a language")))
      .child(v_flex().id("lsp-setup-language-frame").flex_1().min_h(0).relative().track_focus(this.menu.focus)
        .on_key_down((event, cx) => this.menu.key(event, cx, rows, { closeOnActivate: false, onClose: () => this.dismiss() }))
        .child(v_virtual_list("lsp-setup-languages", rows.length, rowHeight, index => rows[index].id,
          range => rows.slice(range.start, range.end).map((row, offset) => uiListRow(`lsp-language-${row.id}`, row.label, {
            selected: this.menu.at === range.start + offset, focused: this.menu.focus.is_focused(),
            interactive: true,
          }))).size_full().track_scroll(this.menu.scroll)
          .on_item_click((id, cx) => { cx.stop_propagation(); this.select(id, cx); }))
        .child(Scrollbar.vertical("lsp-setup-languages").absolute().inset_0()));
  }

  guide(guide) {
    const c = uiColors();
    if (!guide) return uiCaption(T("Select a language to see SDK and language server installation instructions."));
    return v_flex().gap(12).flex_none().min_w(0)
      .child(div().font_semibold().child(guide.title))
      .children(guide.requirements.map(text => div().text_color(c.secondary).whitespace_normal().child(text)))
      .children(guide.steps.map((step, index) => {
        const id = `lsp-guide-${this.language}-${index}`;
        return v_flex().gap(6).flex_none().min_w(0)
          .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).font_semibold().child(`${index + 1}. ${step.title}`))
            .when(Boolean(step.command), el => el.child(uiButton(`${id}-copy`, T(this.copied === id ? "Copied" : "Copy Command"), (_e, cx) => this.copy(id, step.command, cx), { small: true })))
            .when(Boolean(step.url), el => el.child(uiButton(`${id}-docs`, T("Official Guide"), (_e, cx) => cx.open_url(step.url), { small: true }))))
          .child(div().text_color(c.secondary).whitespace_normal().child(step.detail))
          .when(Boolean(step.command), el => el.child(uiInputBox(v_flex().flex_1().min_w(0).py(4)
            .font_family(codeFont().family).text_size(uiSize(12)).overflow_x_scrollbar()
            .children(String(step.command).split("\n").map(line => div().flex_none().child(line || " "))), { mono: true })));
      }))
      .children(guide.notes.map(text => div().text_color(c.secondary).whitespace_normal().child(text)));
  }

  result() {
    const c = uiColors(), status = this.status;
    let message = T("3. Check installation, then start the language server.");
    if (this.busy === "setup_status") message = T("Checking installed tools…");
    else if (this.busy === "setup_start") message = T("Starting and initializing the language server…");
    else if (this.busy === "folder") message = T("Choosing a project folder…");
    else if (status?.running) message = T("LSP is running and initialized.");
    else if (status?.installed) message = T("Language server found. Start LSP to initialize it for this project.");
    else if (status) message = T("Language server not found. Follow the guide, then check again.");
    return v_flex().flex_none().gap(4).min_w(0).pt(8).border_t(1).border_color(c.separator)
      .child(div().whitespace_normal().child(message))
      .when(Boolean(status?.root && status.root !== this.root), el => el.child(div().text_size(uiSize(11)).text_color(c.secondary).truncate()
        .tooltip(status.root).child(`${T("Language server project")}: ${status.root}`)))
      .when(Boolean(status?.command), el => el.child(div().text_size(uiSize(11)).text_color(c.secondary).truncate()
        .tooltip(commandText(status.command)).child(commandText(status.command))))
      .when(Boolean(this.error), el => el.child(div().max_h(90).overflow_y_scrollbar().text_color(c.error).whitespace_normal().child(this.error)));
  }

  render() {
    const c = uiColors(), entry = this.entry(), guide = entry ? installationGuide(entry.id, this.platform) : null;
    const content = v_flex().h_full().min_h(0).gap(10).text_color(c.foreground)
      .child(div().font_semibold().text_size(uiSize()).child(T("2. Install SDK and language server")))
      .child(div().text_color(c.secondary).whitespace_normal().child(T("Run the guide commands in your own terminal. This dialog does not install software.")))
      .child(h_flex().gap(8).items_center().flex_none()
        .child(uiInputBox(div().flex_1().min_w(0).truncate().tooltip(this.root || T("Choose a project folder"))
          .child(this.root || T("Choose a project folder"))).flex_1().min_w(0))
        .child(uiButton("lsp-setup-folder", T("Choose Folder…"), (_event, cx) => this.chooseRoot(cx), { disabled: this.busy === "folder" })))
      .child(v_flex().id(`lsp-setup-guide-${this.language ?? "empty"}`).flex_1().min_h(0).min_w(0).overflow_y_scrollbar().pr(8).child(this.guide(guide)))
      .child(this.result());
    return uiSettingsShell("lsp-setup", {
      title: T("LSP Setup"), sidebar: this.sidebar(), content, width: 900, height: 680, sidebarWidth: 190,
      footer: [
        uiButton("lsp-setup-copy-guide", T(this.copied === "guide" ? "Copied" : "Copy Guide for LLM"), (_e, cx) => this.copy("guide", this.guideText(guide), cx), { disabled: !guide }),
        uiButton("lsp-setup-close", T("Close"), () => this.dismiss()),
        uiButton("lsp-setup-check", T("Check Installation"), (_e, cx) => this.request("setup_status", cx), { disabled: !this.canRequest("setup_status") }),
        uiButton("lsp-setup-start", T("Start LSP"), (_e, cx) => this.request("setup_start", cx), { primary: true, disabled: !this.canRequest("setup_start") }),
      ],
    }).on_key_down((event, cx) => {
      if (event.key === "escape") { cx.stop_propagation(); this.dismiss(); }
    });
  }
}

export default LspSetup;
