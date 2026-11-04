// Sessions: tmux sessions (and their windows) and the TCP ports programs listen
// on, on the focused terminal's machine. Refreshes every 5 s while shown.
//   tmux     — click: attach in a new terminal tab; chevron: its windows; right-click: attach / kill
//   ports    — click: open http://localhost:<port>; right-click: open / copy URL / open folder / kill
// Ports of programs started from a folder under the home folder (dev servers)
// come first; the rest (databases, system and app helpers) fold under "Other".
// The menu and the kill confirmation are overlays that post a request in shared
// "activity.sessop" and close; this view runs it (like the Git Graph's menu).
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared, props, openOverlay, closeOverlay, run, spaces } from "herdr";
import { sh, SEP } from "./io.js";
import { MOD, location, basename, iconButton, viewHeader, icon } from "./common.js";
import { popupSurface, uiSize } from "./idea-design.js";

export const SESS_OP = "activity.sessop";
const POLL = 5000;
// tmux prints control characters in formats as "_", so a printable separator.
const FS = "@@F@@";
const F = (text, vars) => T(text).replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ""));

// One round trip: tmux sessions, tmux windows, listening sockets, their
// processes' folders and command lines, the home folder.
const REFRESH = `F='@@F@@'; s='\\n@@HERDR-SEP@@\\n'
if command -v tmux >/dev/null 2>&1; then
  echo tmux
  tmux list-sessions -F "#{session_name}$F#{session_windows}$F#{session_attached}$F#{session_created}$F#{session_path}" 2>/dev/null
fi; printf "$s"
command -v tmux >/dev/null 2>&1 && tmux list-windows -a -F "#{session_name}$F#{window_index}$F#{window_name}$F#{window_active}$F#{pane_current_command}$F#{pane_current_path}" 2>/dev/null; printf "$s"
lsof -nP -iTCP -sTCP:LISTEN -Fpcn 2>/dev/null; printf "$s"
pids=$(lsof -nP -iTCP -sTCP:LISTEN -t 2>/dev/null | sort -u | tr '\\n' ',' | sed 's/,$//')
[ -n "$pids" ] && lsof -a -d cwd -p "$pids" -Fpn 2>/dev/null; printf "$s"
[ -n "$pids" ] && ps -o pid=,command= -p "$pids" 2>/dev/null; printf "$s"
printf '%s' "$HOME"`;

// ---- parsing (exported for checks)

export function parseTmux(sessionsText, windowsText) {
  const lines = sessionsText.split("\n");
  const installed = lines[0] === "tmux";
  const sessions = lines.slice(1).filter(Boolean).map((l) => {
    const [name, windows, attached, created, path] = l.split(FS);
    return { name, windows: Number(windows) || 0, attached: Number(attached) || 0, created: Number(created) || 0, path, list: [] };
  });
  for (const l of windowsText.split("\n").filter(Boolean)) {
    const [session, index, name, active, command, path] = l.split(FS);
    sessions.find((x) => x.name === session)?.list.push({ index, name, active: active === "1", command, path });
  }
  return { installed, sessions };
}

// lsof -F: "p<pid>", "c<command>", "f<fd>", "n<address>" lines.
export function parsePorts(lsofText, cwdText, psText, home) {
  const cwd = {}, cmdline = {};
  let pid = null;
  for (const l of cwdText.split("\n")) {
    if (l[0] === "p") pid = l.slice(1);
    else if (l[0] === "n" && pid) cwd[pid] = l.slice(1);
  }
  for (const l of psText.split("\n")) {
    const m = l.match(/^\s*(\d+)\s+(.*)$/);
    if (m) cmdline[m[1]] = m[2];
  }
  const byKey = new Map();
  let command = "";
  pid = null;
  for (const l of lsofText.split("\n")) {
    if (l[0] === "p") pid = l.slice(1);
    else if (l[0] === "c") command = l.slice(1);
    else if (l[0] === "n" && pid) {
      const m = l.slice(1).match(/^(.*):(\d+)$/);
      if (!m) continue;
      const host = m[1], port = Number(m[2]), key = `${pid}:${port}`;
      const local = host === "127.0.0.1" || host === "[::1]" || host === "localhost";
      const p = byKey.get(key) ?? { pid, port, command, cmdline: cmdline[pid] ?? command, cwd: cwd[pid] ?? "", hosts: [], exposed: false };
      if (!p.hosts.includes(host)) p.hosts.push(host);
      if (!local) p.exposed = true;
      byKey.set(key, p);
    }
  }
  const ports = [...byKey.values()].sort((a, b) => a.port - b.port);
  // A dev server: started from a folder under home (not home itself, not app data).
  const dev = (p) => Boolean(home) && p.cwd.startsWith(`${home}/`) && !/^(Library|\.npm|\.cache|\.local\/share)(\/|$)/.test(p.cwd.slice(home.length + 1));
  for (const p of ports) p.dev = dev(p);
  return ports;
}

const tilde = (p, home) => home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
const shortWhen = (sec) => {
  const s = Math.max(0, Date.now() / 1000 - sec);
  for (const [n, u] of [[86400, "d"], [3600, "h"], [60, "m"]]) if (s >= n) return `${Math.floor(s / n)}${u}`;
  return "now";
};

// The Herdr space whose folder holds this one (the longest match).
function spaceOf(path) {
  if (!path) return null;
  // macOS folders are case-insensitive: a space may spell its folder differently.
  const lower = path.toLowerCase();
  let best = null, bestLen = 0;
  for (const s of spaces()) {
    const f = (s.folder ?? "").replace(/\/$/, "").toLowerCase();
    if (f && f.split("/").length > 3 && (lower === f || lower.startsWith(`${f}/`)) && f.length > bestLen) { best = s; bestLen = f.length; }
  }
  return best ? { name: best.name, len: bestLen } : null;
}

export default class Running {
  init(_props, cx) {
    this.data = null; this.error = null; this.open = { tmux: true, ports: true, other: false }; this.expanded = {};
    this.poll(cx);
  }
  release() { this.gone = true; }

  poll(cx) {
    if (this.gone) return;
    this.refresh(cx);
    cx.timer.after(POLL, (cx) => this.poll(cx));
  }

  async refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    const on = location().on ?? null;
    try {
      const r = await sh(REFRESH, [], { on: on ?? undefined });
      const parts = r.stdout.split(SEP);
      const home = (parts[5] ?? "").trim();
      this.data = { on, home, tmux: parseTmux(parts[0] ?? "", parts[1] ?? ""), ports: parsePorts(parts[2] ?? "", parts[3] ?? "", parts[4] ?? "", home) };
      this.error = null;
    } catch (e) {
      this.error = String(e?.message ?? e);
    }
    this.loading = false;
    cx.notify();
  }

  // ---- actions

  attach(session, window, cx) {
    const target = window == null ? `=${session.name}` : `=${session.name}:${window.index}`;
    run("terminal.open", { argv: ["tmux", "attach-session", "-t", target], folder: (window?.path || session.path) ?? undefined, place: "tab", name: `tmux ${session.name}` });
  }
  browse(p, cx) { cx.open_url(`http://localhost:${p.port}`); }

  async act(argv, cx) {
    const on = this.data?.on ?? undefined;
    const r = await sh('"$@"', argv, { on }).catch((e) => ({ code: 1, stderr: String(e) }));
    this.note = r.code === 0 ? null : (r.stderr || r.stdout || "").trim().split("\n").pop();
    await this.refresh(cx);
  }

  takeRequest(cx) {
    const op = shared(SESS_OP);
    if (!op || op.seq === this.opSeen) return;
    this.opSeen = op.seq;
    if (Date.now() - (op.at ?? 0) > 15000 || (op.on ?? null) !== (this.data?.on ?? null)) return;
    cx.timer.after(0, (cx) => {
      const s = this.data?.tmux.sessions.find((x) => x.name === op.name);
      const p = this.data?.ports.find((x) => x.pid === op.pid && x.port === op.port);
      if (op.op === "attach" && s) this.attach(s, null, cx);
      else if (op.op === "kill-session") this.act(["tmux", "kill-session", "-t", `=${op.name}`], cx);
      else if (op.op === "browse" && p) this.browse(p, cx);
      else if (op.op === "kill-pid") this.act(["kill", op.pid], cx);
      else if (op.op === "kill-pid-force") this.act(["kill", "-9", op.pid], cx);
    });
  }

  menu(target) {
    const items = menuItems(target);
    openOverlay({ mod: MOD, kind: "popup", width: 300, height: items.reduce((h, it) => h + (it === "-" ? 9 : 28), 10), props: { view: "sessmenu", target } });
  }

  // ---- render

  render(cx) {
    this.takeRequest(cx);
    const t = theme(), d = this.data;
    const header = viewHeader("Sessions & Ports", [iconButton("ss-refresh", "refresh", T("Refresh"), (_e, cx) => this.refresh(cx))]);
    const root = v_flex().id("activity-sessions").size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(13).child(header);
    if (!d) return root.child(div().px(14).py(8).text_size(12).text_color(t.dim).child(this.error ?? T("Loading…")));
    const dev = d.ports.filter((p) => p.dev), other = d.ports.filter((p) => !p.dev);
    return root
      .when(Boolean(d.on), (el) => el.child(h_flex().h(20).px(14).gap(6).items_center().text_size(11).text_color(t.muted).child(icon("remote", 12)).child(d.on)))
      .when(Boolean(this.note), (el) => el.child(div().px(14).pb(4).text_size(11).whitespace_normal().text_color(t.ansi1).child(this.note)))
      .child(v_flex().id("ss-body").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
        .child(this.section("tmux", "tmux", d.tmux.sessions.length, t))
        .when(this.open.tmux, (el) => el.children(this.tmuxRows(d, t)))
        .child(this.section("ports", "Localhost", dev.length, t))
        .when(this.open.ports, (el) => el.children(dev.length ? dev.map((p) => this.portRow(p, d, t))
          : [this.empty(T("No dev servers listening"), t)]))
        .when(other.length > 0, (el) => el.child(this.section("other", "Other listening ports", other.length, t, 22)))
        .when(this.open.other, (el) => el.children(other.map((p) => this.portRow(p, d, t)))));
  }

  section(key, title, count, t, indent = 8) {
    const open = Boolean(this.open[key]);
    return h_flex().id(`ss-sec-${key}`).h(26).flex_none().pl(indent).pr(10).gap(4).items_center().cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.open[key] = !open; cx.notify(); })
      .child(icon(`chevron-${open ? "down" : "right"}`, 12).text_color(t.dim))
      .child(div().flex_1().text_size(11).font_semibold().child(T(title)))
      .child(div().px(6).rounded_full().bg(t.raised).text_size(10).text_color(t.muted).child(String(count)));
  }

  empty(text, t) { return div().pl(26).pr(10).py(3).text_size(11.5).text_color(t.dim).whitespace_normal().child(text); }

  tmuxRows(d, t) {
    if (!d.tmux.installed) return [this.empty(T("tmux is not installed on this machine"), t)];
    if (!d.tmux.sessions.length) return [this.empty(T("No tmux sessions running"), t)];
    const out = [];
    for (const s of d.tmux.sessions) {
      const open = Boolean(this.expanded[s.name]);
      out.push(h_flex().id(`ss-t-${s.name}`).h(24).flex_none().pl(14).pr(10).gap(6).items_center().cursor_pointer().hover((st) => st.bg(t.hover))
        .tooltip(`${tilde(s.path ?? "", d.home)} · ${T("click to attach")}`)
        .on_click((_e, cx) => this.attach(s, null, cx))
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu({ kind: "tmux", on: d.on, name: s.name, attached: s.attached }); })
        .child(div().id(`ss-tx-${s.name}`).size(16).flex_none().flex().items_center().justify_center().rounded(4).hover((st) => st.bg(t.raised))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); this.expanded[s.name] = !open; cx.notify(); })
          .child(icon(`chevron-${open ? "down" : "right"}`, 11).text_color(t.dim)))
        .child(icon("terminal", 13).text_color(s.attached ? t.ansi2 : t.muted))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).child(s.name))
        .child(div().flex_none().text_size(10.5).text_color(s.attached ? t.ansi2 : t.dim)
          .child(s.attached ? T("attached") : F("{n} windows", { n: s.windows })))
        .child(div().flex_none().w(28).text_size(10.5).text_color(t.dim).child(shortWhen(s.created))));
      if (open) for (const w of s.list) out.push(h_flex().id(`ss-w-${s.name}-${w.index}`).h(22).flex_none().pl(46).pr(10).gap(6).items_center()
        .cursor_pointer().hover((st) => st.bg(t.hover)).tooltip(tilde(w.path ?? "", d.home))
        .on_click((_e, cx) => this.attach(s, w, cx))
        .child(div().flex_none().text_size(10.5).text_color(w.active ? t.accent : t.dim).child(`${w.index}:`))
        .child(div().flex_1().min_w(0).truncate().text_size(12).child(w.name))
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child(w.command ?? "")));
    }
    return out;
  }

  portRow(p, d, t) {
    const space = spaceOf(p.cwd);
    const where = p.cwd ? (space ? `${space.name}${p.cwd.length > space.len ? ` · ${basename(p.cwd)}` : ""}` : tilde(p.cwd, d.home)) : "";
    const target = { kind: "port", on: d.on, pid: p.pid, port: p.port, command: p.command, cwd: p.cwd, exposed: p.exposed };
    return h_flex().id(`ss-p-${p.pid}-${p.port}`).h(24).flex_none().pl(14).pr(10).gap(6).items_center().cursor_pointer().hover((s) => s.bg(t.hover))
      .tooltip(`${p.cmdline}\n${p.hosts.join(", ")} · pid ${p.pid}${p.cwd ? `\n${tilde(p.cwd, d.home)}` : ""}`)
      .on_click((_e, cx) => this.browse(p, cx))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(target); })
      .child(div().size(7).mx(4).flex_none().rounded(4).bg(p.dev ? t.ansi2 : t.dim))
      .child(div().flex_none().w(44).text_size(12.5).font_semibold().text_color(p.dev ? t.foreground : t.muted).child(String(p.port)))
      .child(div().flex_none().max_w(90).truncate().text_size(11.5).text_color(t.muted).child(p.command))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(where))
      .when(p.exposed, (el) => el.child(div().flex_none().px(5).rounded(4).border_1().border_color(t.blocked).text_size(9.5).text_color(t.blocked)
        .tooltip(T("Listens on every network interface, not only this computer")).child(T("network"))));
  }
}

// ---- the right-click menu

const request = (op) => setShared(SESS_OP, { ...op, seq: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() });

function menuItems(target) {
  if (target.kind === "tmux") return [
    ["Attach in a new tab", "terminal", () => request({ op: "attach", on: target.on, name: target.name })],
    ["Copy session name", "copy", (cx) => cx.write_to_clipboard(target.name)],
    "-",
    ["Kill session…", "trash", () => openSessPrompt({ ...target, op: "kill-session" })],
  ];
  const url = `http://localhost:${target.port}`;
  return [
    ["Open in browser", "external", () => request({ op: "browse", on: target.on, pid: target.pid, port: target.port })],
    ["Copy URL", "copy", (cx) => cx.write_to_clipboard(url)],
    ["Copy PID", "clipboard", (cx) => cx.write_to_clipboard(String(target.pid))],
    ...(target.cwd && !target.on ? [["Open a terminal in its folder", "folder-open", () => run("terminal.open", { folder: target.cwd, place: "tab" })]] : []),
    "-",
    ["Stop process…", "trash", () => openSessPrompt({ ...target, op: "kill-pid" })],
  ];
}

export class SessMenu {
  init(p, cx) { this.target = p.target; this.at = -1; this.h = cx.focus_handle(); this.h.focus(); }
  release() { this.h?.release(); }
  choose(it, cx) { if (!it[2]) return; closeOverlay(props()?.overlay); it[2](cx); }
  render(cx) {
    const t = theme(), list = menuItems(this.target), real = list.filter((x) => x !== "-" && x[2]);
    return popupSurface(v_flex().id("sess-menu").track_focus(this.h).size_full().p(5).bg(t.popover).text_color(t.foreground).text_size(uiSize(12.5)))
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % real.length;
        else if (e.key === "up") this.at = (this.at + real.length - 1) % real.length;
        else if (e.key === "enter" && real[this.at]) return this.choose(real[this.at], cx);
        else if (e.key === "escape") return closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => it === "-" ? div().mx(6).my(4).h(1).flex_none().bg(t.border)
        : h_flex().id(`sm-${i}`).h(28).flex_none().px(8).gap(9).rounded(6).items_center()
          .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.choose(it, cx))
          .when(real.indexOf(it) === this.at, (el) => el.bg(t.selected))
          .child(icon(it[1], 14).text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().child(T(it[0])))));
  }
}

// ---- kill confirmation

export function openSessPrompt(target) {
  openOverlay({ mod: MOD, kind: "dialog", width: 420, height: 170, props: { view: "sessprompt", target } });
}

export class SessPrompt {
  init(p, cx) { this.target = p.target; this.h = cx.focus_handle(); this.h.focus(); }
  release() { this.h?.release(); }
  submit(force) {
    const g = this.target;
    request(g.kind === "tmux" ? { op: "kill-session", on: g.on, name: g.name } : { op: force ? "kill-pid-force" : "kill-pid", on: g.on, pid: g.pid, port: g.port });
    closeOverlay(props()?.overlay);
  }
  render(cx) {
    const t = theme(), g = this.target;
    const title = g.kind === "tmux" ? T("Kill tmux Session") : T("Stop Process");
    const sub = g.kind === "tmux"
      ? F("Kill \"{s}\" and every program running in its windows?", { s: g.name })
      : F("Stop {c} (pid {p}) listening on port {n}?", { c: g.command, p: g.pid, n: g.port });
    const button = (id, text, kind, action) => h_flex().id(id).h(30).px(14).items_center().rounded(7)
      .border_1().border_color(kind === "danger" ? t.ansi1 : t.input).bg(kind === "danger" ? t.ansi1 : t.raised)
      .text_color(kind ? t.solid_foreground : t.foreground).text_size(uiSize(12.5)).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    const buttons = [button("sp-cancel", T("Cancel"), null, () => closeOverlay(props()?.overlay))];
    if (g.kind === "port") buttons.push(button("sp-force", T("Force Quit"), null, () => this.submit(true)));
    buttons.push(button("sp-ok", g.kind === "tmux" ? T("Kill") : T("Stop"), "danger", () => this.submit(false)));
    return popupSurface(v_flex().id("sess-prompt").track_focus(this.h).size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground), true)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
        else if (e.key === "enter") { this.submit(false); cx.stop_propagation(); }
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(uiSize(15)).font_semibold().child(title)).child(div().text_size(uiSize(11)).text_color(t.dim).child("Esc")))
      .child(div().text_size(uiSize(12)).text_color(t.dim).whitespace_normal().child(sub))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end().children(buttons));
  }
}
