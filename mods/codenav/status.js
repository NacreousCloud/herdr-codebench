// A status-bar item: language servers the bridge is running, and the language.
// Always on screen, so it also takes the mod's commands: `review`, `lang[:ko|en]`,
// `terminal-files` (the focused terminal's paths), `close-tab` (Cmd+W),
// `tab-back` / `tab-forward` (Ctrl+- / Ctrl+Shift+-), the idea layout's
// `tool-<name>`, `move-<name>:<left|right|bottom>`, `tool-settings`, `tool-reset`, `hide-tools`, `hide-active`, `run-configs`, `find-<all|class|file|symbol|action|recent>[:query]`,
// `nav-back` / `nav-forward`, and
// `open:<absolute path>[:line]` (herdr-app do codenav.open:/repo/src/a.go:42).
import { div } from "gpui-kit";
import { T, lang, setLang } from "./i18n.js";
import { h_flex } from "gpui-base";
import { theme, nextCommand, focused, run, shared, setShared, agents } from "herdr";
import { showTerminalFiles } from "./termfiles.js";
import { closeTab, tabBack, tabForward } from "./tabs.js";
import { toggleTool, toggleAllTools, hideActiveTool, moveTool, arrange, savedSides, openToolSettings, TOOLS } from "./tools.js";
import { openEverywhere } from "./everywhere.js";
import { restartPending, openRunConfigs } from "./run.js";
import { showReview, openPath } from "./common.js";
import { followSpace } from "./memory.js";
import { peek } from "./lsp.js";

// Keys bound in keys.json's terminal section (programs in Kitty keyboard mode
// would get them otherwise): what each does in the shown layout.
const TERM_KEYS = {
  // Cmd+Shift+O in a terminal: the files it names; elsewhere (layout:idea) Go to File.
  idea: { "cmd-shift-o": "terminal-files", "cmd-o": "find-class", "cmd-alt-o": "find-symbol", "cmd-shift-a": "find-action", "cmd-e": "find-recent" },
  codebench: { "cmd-shift-o": "terminal-files" },
};
function termKey(key) {
  const c = TERM_KEYS[shared("layout")]?.[key];
  if (c === "terminal-files") showTerminalFiles(focused()?.terminal);
  else if (c?.startsWith("find-")) openEverywhere({ "find-file": "files", "find-class": "classes", "find-symbol": "symbols", "find-action": "actions", "find-recent": "recent" }[c]);
}

// Herdr's agent notifications, kept for the Notifications tool window: an agent
// that finished while you weren't looking ("done") or waits for you ("blocked").
function recordAgents(self, cx) {
  const now = {};
  const add = [];
  for (const a of agents()) {
    now[a.address] = a.status;
    const was = self.agentStatus?.[a.address];
    if (self.agentStatus && was !== a.status && (a.status === "done" || a.status === "blocked")) {
      const name = a.program?.name ?? a.app ?? a.title;
      add.push({ at: Date.now(), level: a.status, terminal: a.address, space: a.space,
        title: a.status === "blocked" ? T("{name} needs you", { name }) : T("{name} finished", { name }), where: `${a.space_name} / ${a.tab_name}` });
    }
  }
  self.agentStatus = now;
  if (add.length) cx.timer.after(0, () => setShared("codenav.notifications", [...add, ...(shared("codenav.notifications") ?? [])].slice(0, 100)));
}

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
        // The idea layout: Cmd+[ / Cmd+] go back and forward, but stay agent.prev / agent.next in a terminal.
        else if (c === "nav-back") focused()?.terminal ? run("agent.prev") : tabBack();
        else if (c === "nav-forward") focused()?.terminal ? run("agent.next") : tabForward();
        else if (c.startsWith("tool-") && TOOLS[c.slice(5)]) toggleTool(c.slice(5));
        else if (c === "hide-tools") toggleAllTools();
        else if (c === "hide-active") hideActiveTool();
        else if (c === "run-configs") openRunConfigs();
        else if (c === "show-terminal") toggleTool("terminal", true);
        else if (c === "run-restart") restartPending(() => toggleTool("terminal", true));
        else if (c.startsWith("key:")) termKey(c.slice(4));
        else if (c.startsWith("move-")) { const [name, side] = c.slice(5).split(":"); if (TOOLS[name]) moveTool(name, side); }
        else if (c === "tool-settings") openToolSettings();
        else if (c === "tool-reset") arrange(savedSides());
        else if (c.startsWith("find-")) {
          const [kind, ...query] = c.slice(5).split(":");
          openEverywhere({ all: "all", class: "classes", file: "files", symbol: "symbols", action: "actions", recent: "recent" }[kind] ?? "all", query.join(":"));
        }
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
    recordAgents(this, cx);
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
