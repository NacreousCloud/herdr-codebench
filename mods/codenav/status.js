// A status-bar item: language servers the bridge is running, and the language.
// Always on screen, so it also takes the mod's commands: `review`, `lang[:ko|en]`,
// `terminal-files` (the focused terminal's paths), `close-tab` (Cmd+W),
// `tab-back` / `tab-forward` (Ctrl+- / Ctrl+Shift+-), the idea layout's
// `tool-<name>`, `move-<name>:<left|right|bottom>`, `tool-settings`, `tool-reset`, `hide-tools`, `hide-active`, `run-configs`, `find-<all|class|file|symbol|action|recent>[:query]`,
// `nav-back` / `nav-forward`, and
// `open:<absolute path>[:line]` (herdr-app do codenav.open:/repo/src/a.go:42).
import { div } from "gpui-kit";
import { randomUUID } from "crypto";
import { T, lang, setLang } from "./i18n.js";
import { h_flex } from "gpui-base";
import { theme, nextCommand, focused, run, shared, setShared, agents, openOverlay, hc, layout, notify, exec, window } from "herdr";
import { showTerminalFiles } from "./termfiles.js";
import { closeTab, tabBack, tabForward, stepTab, routeEditor } from "./tabs.js";
import { toggleTool, toggleAllTools, hideActiveTool, moveTool, arrange, savedSides, openToolSettings, TOOLS } from "./tools.js";
import { openEverywhere } from "./everywhere.js";
import { restartPending, openRunConfigs, runStore, runConfig, stopConfig } from "./run.js";
import { showReview, openPath, find } from "./common.js";
import { followSpace } from "./memory.js";
import { peek } from "./lsp.js";
import { isIdea, uiSize, ideaUI } from "./idea-design.js";
import { openIdeaSettings } from "./settings.js";
import { recordLocation } from "./locations.js";
import { syncCaffeinate, stopCaffeinate, caffeinateMode, setCaffeinateMode, awake, working } from "./caffeinate.js";
import { parseStatus, createRunner, sanitizeError, TailscaleModel } from "./tailscale.js";

// Keys bound in keys.json's terminal section (programs in Kitty keyboard mode
// would get them otherwise): what each does in the shown layout.
const TERM_KEYS = {
  idea: { "cmd-shift-o": "find-file", "cmd-o": "find-class", "cmd-alt-o": "find-symbol", "cmd-shift-a": "find-action", "cmd-e": "find-recent", "cmd-shift-e": "find-locations", "cmd-,": "settings" },
  codebench: { "cmd-shift-o": "terminal-files", "cmd-o": "find-class", "cmd-alt-o": "find-symbol", "cmd-shift-a": "find-action", "cmd-e": "find-recent", "cmd-shift-e": "find-locations" },
};
// Search Everywhere on Shift pressed and released twice within this many ms
// (shared "codenav.doubleShiftMs"). Each bare Shift release arrives as
// `shift-tap`: a single "shift" binding is dispatched at once, where GPUI's
// "shift shift" sequence would wait for the second Shift without a time limit.
const DOUBLE_SHIFT_MS = 200;
function shiftTap(self, now = Date.now()) {
  if (!["idea", "codebench"].includes(shared("layout"))) return false;
  const gap = Number(shared("codenav.doubleShiftMs")) || DOUBLE_SHIFT_MS;
  if (self.lastShift != null && now - self.lastShift <= gap) { self.lastShift = null; openEverywhere("all"); return true; }
  self.lastShift = now;
  return false;
}

async function termKey(key) {
  const c = TERM_KEYS[shared("layout")]?.[key];
  if (c === "terminal-files") showTerminalFiles(focused()?.terminal);
  else if (c === "settings") openIdeaSettings();
  else if (c?.startsWith("find-")) openEverywhere({ "find-all": "all", "find-file": "files", "find-class": "classes", "find-symbol": "symbols", "find-action": "actions", "find-recent": "recent", "find-locations": "locations" }[c]);
  // Forward keys that only idea claims, preserving terminal input in the other
  // layouts. hc encodes named keys for the program's negotiated keyboard mode.
  else if (key === "cmd-,") run("app.settings");
  else if (focused()?.terminal) {
    try {
      const r = await hc(["keys", focused().terminal, key.replace(/-/g, "+")]);
      if (r.code) notify({ title: T("Could not send key"), body: r.stderr || key, level: "error" });
    } catch (e) { notify({ title: T("Could not send key"), body: String(e), level: "error" }); }
  }
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

const CAFFEINATE_TIP = {
  auto: "Keep awake: while an agent is working (click: always)",
  on: "Keep awake: always (click: off)",
  off: "Keep awake: off (click: while an agent is working)",
};

export default class Status {
  async runTailscale(args) {
    const result = await this.tailscaleRunner(args);
    if (result.code !== 0) {
      throw new Error(result.stderr?.trim() || result.stdout?.trim() || `tailscale ${args.join(" ")} exited with code ${result.code}`);
    }
    return result;
  }

  async readTailscaleStatus() {
    return parseStatus((await this.runTailscale(["status", "--json"])).stdout);
  }

  pollTailscale(cx, fromTimer = false) {
    if (this.tailscale.busy) {
      if (fromTimer) this.tailscalePollPending = true;
      return;
    }
    const generation = this.tailscale.beginPoll();
    if (generation === null) return;
    cx.spawn(async (cx) => {
      try {
        const observed = await this.readTailscaleStatus();
        if (this.tailscale.applyPoll(generation, observed)) cx.notify();
      } catch (error) {
        if (this.tailscale.failPoll(generation, sanitizeError(error))) cx.notify();
      }
    });
  }

  finishTailscaleAction(cx, refresh) {
    const deferred = this.tailscalePollPending;
    this.tailscalePollPending = false;
    if (refresh || deferred) this.pollTailscale(cx);
  }

  failTailscaleAction(generation, action, error, cx) {
    const message = sanitizeError(error);
    if (this.tailscale.failAction(generation, message)) {
      notify({
        title: action === "down" ? "Could not disconnect Tailscale" : "Could not connect Tailscale",
        body: message,
        level: "error",
      });
      cx.notify();
    }
    this.finishTailscaleAction(cx, false);
  }

  startTailscaleUp(cx) {
    const generation = this.tailscale.beginAction("up");
    if (generation === null) return;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.runTailscale(["up", "--timeout=10s"]);
        if (this.tailscale.completeAction(generation)) {
          cx.notify();
          this.finishTailscaleAction(cx, true);
        }
      } catch (error) {
        this.failTailscaleAction(generation, "up", error, cx);
      }
    });
  }

  openTailscaleConfirmation(cx) {
    const token = randomUUID();
    if (!this.tailscale.requestDisconnect(token, 60_000)) return;
    cx.notify();
    openOverlay({
      mod: "codenav",
      props: { view: "tailscaleconfirm", token },
      kind: "dialog",
      modal: true,
      width: 420,
      height: 190,
    });
  }

  tailscaleClick(cx) {
    if (this.tailscale.busy || this.tailscale.pendingDisconnect) return;
    const state = this.tailscale.view();
    if (state.kind === "error" && !this.tailscale.lastActionError) {
      this.pollTailscale(cx);
      return;
    }
    if (this.tailscale.observed?.backend === "Running") this.openTailscaleConfirmation(cx);
    else if (this.tailscale.observed?.backend === "Stopped") this.startTailscaleUp(cx);
  }

  applyCheckedTailscaleStatus(generation, observed, cx) {
    if (!this.tailscale.completeAction(generation)) return;
    const poll = this.tailscale.beginPoll();
    if (poll !== null) this.tailscale.applyPoll(poll, observed);
    this.tailscalePollPending = false;
    cx.notify();
  }

  confirmTailscaleDown(token, cx) {
    const authorization = this.tailscale.consumeDisconnect(token);
    if (!authorization.ok) {
      notify({
        title: "Tailscale disconnect not authorized",
        body: authorization.reason === "expired" ? "The disconnect confirmation expired. Try again." : "The disconnect confirmation is no longer valid. Try again.",
        level: "warning",
      });
      return;
    }
    const generation = this.tailscale.beginAction("down");
    if (generation === null) return;
    cx.spawn(async (cx) => {
      try {
        const observed = await this.readTailscaleStatus();
        if (observed.backend !== "Running") {
          this.applyCheckedTailscaleStatus(generation, observed, cx);
          return;
        }
        await this.runTailscale(["down"]);
        if (this.tailscale.completeAction(generation)) {
          cx.notify();
          this.finishTailscaleAction(cx, true);
        }
      } catch (error) {
        this.failTailscaleAction(generation, "down", error, cx);
      }
    });
  }

  cancelTailscaleDown(token) {
    const pending = this.tailscale.pendingDisconnect;
    if (!this.tailscale.cancelDisconnect(token) && pending && pending.token !== token) {
      notify({ title: "Tailscale confirmation was not cancelled", body: "The confirmation token did not match.", level: "warning" });
    }
  }

  tailscaleChip(t) {
    const state = this.tailscale.view();
    const observed = this.tailscale.observed;
    const stable = ["Running", "Stopped"].includes(observed?.backend);
    const statusRetry = state.kind === "error" && !this.tailscale.lastActionError;
    const actionRetry = state.kind === "error" && Boolean(this.tailscale.lastActionError) && stable;
    const interactive = !this.tailscale.busy && !this.tailscale.pendingDisconnect
      && (statusRetry || actionRetry || ["on", "off"].includes(state.kind));
    let label, color, tip;
    if (state.kind === "on") {
      label = "● TS ON"; color = t.ansi2; tip = "Tailscale: Running\nClick to disconnect.";
    } else if (state.kind === "off") {
      label = "○ TS OFF"; color = t.muted; tip = "Tailscale: Stopped\nClick to connect.";
    } else if (state.kind === "busy") {
      label = "◌ TS …"; color = t.ansi3;
      tip = state.backend === "Starting" ? "Tailscale: Starting"
        : state.operation === "confirm" ? "Tailscale: waiting for disconnect confirmation"
          : state.operation === "checking" ? "Tailscale: checking local status"
            : `Tailscale: ${state.operation === "up" ? "connecting" : "disconnecting"}`;
    } else if (state.kind === "login") {
      label = "! TS LOGIN"; color = t.ansi3;
      tip = `Tailscale: ${state.backend}\nOpen the native Tailscale client to sign in or approve this machine.`;
    } else {
      label = "! TS"; color = t.ansi1;
      tip = `Tailscale error: ${sanitizeError(state.error)}`;
      if (statusRetry) tip += "\nClick to retry status.";
      else if (actionRetry) tip += `\nLast known state: ${observed.backend}. Click to retry.`;
    }
    let chip = h_flex().id("cn-st-tailscale").h(20).px(6).items_center().rounded(4).flex_none()
      .text_size(uiSize(10.5)).text_color(color).tooltip(tip).child(label);
    if (interactive) chip = chip.cursor_pointer().hover((e) => e.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.tailscaleClick(cx));
    return chip;
  }

  caffeinateChip(t) {
    const mode = caffeinateMode(), on = awake();
    const state = on ? T("Mac stays awake") : T("Mac may sleep");
    const n = working();
    return h_flex().id("cn-st-caffeinate").px(6).h(20).gap(3).items_center().rounded(4).cursor_pointer()
      .hover((e) => e.bg(t.hover).text_color(t.foreground))
      .tooltip(`${T(CAFFEINATE_TIP[mode])}\n${state}${mode === "auto" && n ? ` · ${T("{n} agents working", { n })}` : ""}`)
      .on_click((_e, cx) => { setCaffeinateMode(); cx.notify(); })
      .child(div().text_color(on ? t.ansi3 : t.dim).child("☕"))
      .when(mode !== "auto", (e) => e.child(div().text_size(uiSize(10.5)).text_color(on ? t.ansi3 : t.dim).child(mode === "on" ? T("Always") : T("Off"))));
  }


  init(_p, cx) {
    this.servers = [];
    this.tailscale = new TailscaleModel();
    this.tailscaleRunner = createRunner(exec, window().platform);
    this.tailscalePollPending = false;
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c.startsWith("tailscale-down:")) this.confirmTailscaleDown(c.slice("tailscale-down:".length), cx);
        else if (c.startsWith("tailscale-cancel:")) this.cancelTailscaleDown(c.slice("tailscale-cancel:".length));
        else if (c === "shift-tap") { shiftTap(this); continue; }
        else if (c === "review") showReview();
        else if (c.startsWith("open:")) openPath(c.slice(5));
        else if (c === "terminal-files") showTerminalFiles(focused()?.terminal);
        else if (c === "close-tab") closeTab();
        else if (c === "tab-back") tabBack();
        else if (c === "tab-forward") tabForward();
        // IntelliJ's navigation uses locations, including while a terminal has focus.
        else if (c === "nav-back" || c === "nav-forward") {
          const forward = c === "nav-forward";
          if (isIdea() && find(layout(), "editor-stack")?.active === "editor-code") run(forward ? "codenav.editor-forward" : "codenav.editor-back");
          else if (!isIdea() && focused()?.terminal) run(forward ? "agent.next" : "agent.prev");
          else forward ? tabForward() : tabBack();
        }
        else if (c.startsWith("tool-") && TOOLS[c.slice(5)]) toggleTool(c.slice(5));
        else if (c === "hide-tools") toggleAllTools();
        else if (c === "hide-active") hideActiveTool();
        else if (c === "tool-last") { const last = shared("codenav.lastTool"); if (last) toggleTool(last, true); }
        else if (c === "tab-next" || c === "tab-prev") focused()?.terminal ? run(c === "tab-next" ? "tab.next" : "tab.prev") : stepTab(c === "tab-next" ? 1 : -1);
        else if (c === "run" || c === "rerun") { const st = runStore(); runConfig(st.configs[st.selected] ?? st.configs[0], () => toggleTool("terminal", true)); }
        else if (c === "stop") { const st = runStore(); stopConfig(st.configs[st.selected] ?? st.configs[0]); }
        else if (c === "run-choose") openOverlay({ mod: "codenav", props: { view: "runmenu" }, kind: "popup", width: 320, height: 240 });
        else if (c === "run-configs") openRunConfigs();
        else if (c === "settings") openIdeaSettings();
        else if (c === "design-system") openOverlay({ mod: "codenav", props: { view: "designpreview" }, kind: "dialog", frame: "none", width: 820, height: 680 });
        else if (c.startsWith("settings:")) openIdeaSettings(c.slice(9));
        else if (c === "new-terminal-menu") openOverlay({ mod: "codenav", props: { view: "newterminal" }, kind: "popup", frame: "none", width: 300, height: 400 });
        else if (c === "show-terminal") toggleTool("terminal", true);
        else if (c === "run-restart") restartPending(() => toggleTool("terminal", true));
        else if (c.startsWith("key:")) await termKey(c.slice(4));
        else if (c.startsWith("move-")) { const [name, side] = c.slice(5).split(":"); if (TOOLS[name]) moveTool(name, side); }
        else if (c === "tool-settings") openToolSettings();
        else if (c === "tool-reset") arrange(savedSides());
        else if (c.startsWith("find-")) {
          const [kind, ...query] = c.slice(5).split(":");
          openEverywhere({ all: "all", class: "classes", file: "files", symbol: "symbols", action: "actions", recent: "recent", locations: "locations" }[kind] ?? "all", query.join(":"));
        }
        else if (c === "caffeinate") setCaffeinateMode();
        else if (c.startsWith("caffeinate:")) setCaffeinateMode(c.slice(11));
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
    this.pollTailscale(cx);
    cx.timer.every(5_000, (cx) => this.pollTailscale(cx, true));
  }

  // The layout is going (switched away, closed): the Mac may sleep again.
  release() { stopCaffeinate(); }

  render(cx) {
    syncCaffeinate(this, cx);
    recordAgents(this, cx);
    followSpace(this, cx);
    routeEditor(this, cx);
    if (isIdea() || shared("layout") === "codebench") recordLocation(this, cx);
    const t = theme();
    const servers = this.servers ?? [];
    const busy = servers.some((s) => s.busy?.length || s.state === "starting");
    const tip = this.servers === null ? T("LSP bridge not running (starts when a source file opens)")
      : servers.length ? servers.map((s) => `${s.command} · ${s.state}${s.busy?.length ? ` (${s.busy.join(", ")})` : ""} · ${s.root}`).join("\n") : T("No language server running");
    return ideaUI(h_flex()).id("codenav-status").size_full().pl(8).pr(14).gap(10).items_center().justify_end().bg(isIdea() ? t.canvas : t.chrome).when(!isIdea(), (e) => e.border_t(1).border_color(t.border)).text_size(uiSize(12)).text_color(t.muted)
      .when(shared("layout") === "codebench", (e) => e.child(this.tailscaleChip(t)))
      .child(h_flex().id("cn-st-lsp").gap(5).items_center().tooltip(tip)
        .child(div().size(7).rounded_full().bg(this.servers === null ? t.dim : busy ? t.ansi3 : servers.length ? t.ansi2 : t.dim))
        .child(servers.length ? servers.map((s) => s.command).filter((v, i, a) => a.indexOf(v) === i).join(" · ") : "LSP"))
      .child(this.caffeinateChip(t))
      .child(div().id("cn-st-lang").px(6).h(20).flex().items_center().rounded(4).cursor_pointer().hover((e) => e.bg(t.hover).text_color(t.foreground))
        .tooltip(T("Language: English (click for 한국어)"))
        .on_click(() => setLang(lang() === "ko" ? "en" : "ko"))
        .child(lang() === "ko" ? "한국어" : "EN"));
  }
}
