// A status-bar item: language servers the bridge is running, and the language.
// Always on screen, so it also takes the mod's commands: `review`, `lang[:ko|en]`,
// `terminal-files` (the focused terminal's paths), `close-tab` (Cmd+W),
// `tab-back` / `tab-forward` (Ctrl+- / Ctrl+Shift+-) and
// `open:<absolute path>[:line]` (herdr-app do codenav.open:/repo/src/a.go:42).
import { div } from "gpui-kit";
import { T, lang, setLang } from "./i18n.js";
import { h_flex } from "gpui-base";
import { theme, nextCommand, focused } from "herdr";
import { showTerminalFiles } from "./termfiles.js";
import { closeTab, tabBack, tabForward } from "./tabs.js";
import { showReview, openPath } from "./common.js";
import { followSpace } from "./memory.js";
import { peek } from "./lsp.js";

export default class Status {
  init(_p, cx) {
    this.servers = [];
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "review") showReview();
        else if (c.startsWith("open:")) openPath(c.slice(5));
        else if (c === "terminal-files") showTerminalFiles(focused()?.terminal);
        else if (c === "close-tab") closeTab();
        else if (c === "tab-back") tabBack();
        else if (c === "tab-forward") tabForward();
        else if (c === "lang") setLang(lang() === "ko" ? "en" : "ko");
        else if (c.startsWith("lang:")) setLang(c.slice(5));
        cx.notify();
      }
    });
    const poll = async (cx) => {
      // Only asks a bridge that is already running; never starts one.
      const next = await peek("status");
      if (JSON.stringify(next) !== JSON.stringify(this.servers)) { this.servers = next; cx.notify(); }
    };
    cx.timer.after(500, (cx) => poll(cx));
    cx.timer.every(4000, (cx) => poll(cx));
  }

  render(cx) {
    followSpace(this, cx);
    const t = theme();
    const servers = this.servers ?? [];
    const busy = servers.some((s) => s.busy?.length || s.state === "starting");
    const tip = this.servers === null ? T("LSP bridge not running (starts when a source file opens)")
      : servers.length ? servers.map((s) => `${s.command} · ${s.state}${s.busy?.length ? ` (${s.busy.join(", ")})` : ""} · ${s.root}`).join("\n") : T("No language server running");
    return h_flex().id("codenav-status").size_full().pl(8).pr(14).gap(10).items_center().justify_end().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(h_flex().id("cn-st-lsp").gap(5).items_center().tooltip(tip)
        .child(div().size(7).rounded_full().bg(this.servers === null ? t.dim : busy ? t.ansi3 : servers.length ? t.ansi2 : t.dim))
        .child(servers.length ? servers.map((s) => s.command).filter((v, i, a) => a.indexOf(v) === i).join(" · ") : "LSP"))
      .child(div().id("cn-st-lang").px(6).h(20).flex().items_center().rounded(4).cursor_pointer().hover((e) => e.bg(t.hover).text_color(t.foreground))
        .tooltip(T("Language: English (click for 한국어)"))
        .on_click(() => setLang(lang() === "ko" ? "en" : "ko"))
        .child(lang() === "ko" ? "한국어" : "EN"));
  }
}
