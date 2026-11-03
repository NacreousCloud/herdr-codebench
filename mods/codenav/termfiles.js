// Files named in a terminal, opened in the code view: the terminal's right-click
// menu ("Open in code view" for the selected path, plus Herdr's own pane items)
// and a picker of the paths in its screen and recent output (Cmd+Shift+O).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, terminals, panes, exec, hc, notify } from "herdr";
import { T } from "./i18n.js";
import { openPath, tilde, basename } from "./common.js";

// "src/a.kt:42:5", "src/a.kt(42,5)", "src/a.kt#L42", "file:///x/a.kt", "~/a.kt", "./a.kt".
const PATH = /(?:file:\/\/)?(?:~|\.{1,2})?\/?(?:[\w.@+-]+\/)*[\w.@+-]+\.[A-Za-z][\w]{0,9}(?:(?::\d+(?::\d+)?)|(?:\(\d+(?:,\d+)?\))|(?:#L\d+))?/g;

function parsePath(raw) {
  let s = raw.trim().replace(/^[`'"(<\[]+|[`'">\],.;:]+$/g, "").replace(/^file:\/\//, "");
  // A closing parenthesis stays only as "(line,col)".
  if (s.endsWith(")") && !/\(\d+(?:,\d+)?\)$/.test(s)) s = s.slice(0, -1);
  try { s = decodeURIComponent(s); } catch {}
  const m = /^(.*?)(?::(\d+)(?::(\d+))?|\((\d+)(?:,(\d+))?\)|#L(\d+))?$/.exec(s);
  if (!m?.[1]) return null;
  return { path: m[1], line: +(m[2] ?? m[4] ?? m[6] ?? 0) || null, col: +(m[3] ?? m[5] ?? 0) || null };
}

// Every path-looking word in some text, last ones first, without repeats.
function pathsIn(text) {
  const seen = new Set(), out = [];
  // Web addresses aren't files.
  const found = [...text.replace(/\b[a-z][\w+.-]*:\/\/(?!\/)\S+/gi, " ").matchAll(PATH)].map((m) => m[0]).reverse();
  for (const raw of found) {
    const p = parsePath(raw);
    if (!p || /^\d+(\.\d+)+$/.test(p.path)) continue;
    const key = `${p.path}:${p.line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(p);
  }
  return out;
}

// Where a terminal is: its live folder, its machine, its repository and that machine's home.
async function placeOf(terminal) {
  const pane = panes().find((p) => p.terminal === terminal);
  const on = terminal?.includes("/") ? terminal.split("/")[0] : null;
  const cwd = pane?.cwd ?? terminals().find((t) => t.address === terminal)?.cwd ?? null;
  const top = cwd ? await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null) : null;
  const home = await exec("sh", ["-c", 'printf %s "$HOME"'], { on }).catch(() => null);
  return { cwd, on, repo: top?.code === 0 ? top.stdout.trim() : null, home: home?.stdout ?? "" };
}

// The candidates that are files there, as absolute paths (one round trip).
const EXISTING = 'for p in "$@"; do [ -f "$p" ] && printf "%s\\n" "$p"; done; true';
async function resolve(list, place) {
  const home = place.home;
  const tries = list.map((p) => {
    if (p.path.startsWith("/")) return [p.path];
    if (p.path.startsWith("~/")) return [`${home}${p.path.slice(1)}`];
    const rel = p.path.replace(/^\.\//, "");
    return [place.cwd && `${place.cwd}/${rel}`, place.repo && `${place.repo}/${rel}`].filter(Boolean);
  });
  const flat = [...new Set(tries.flat())].slice(0, 600);
  if (!flat.length) return [];
  const r = await exec("sh", ["-c", EXISTING, "sh", ...flat], { on: place.on }).catch(() => null);
  const ok = new Set((r?.stdout ?? "").split("\n").filter(Boolean));
  // Shortened paths ("controller/FooTest.kt", as agents print them): the
  // repository's one file ending that way.
  let tracked = null;
  if (place.repo && list.some((p, i) => !tries[i].some((x) => ok.has(x)) && !p.path.startsWith("/") && !p.path.startsWith("~"))) {
    const g = await exec("git", ["--no-optional-locks", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: place.repo, on: place.on }).catch(() => null);
    tracked = g?.code === 0 ? g.stdout.split("\0").filter(Boolean) : null;
  }
  const bySuffix = (p) => {
    if (!tracked || p.path.startsWith("/") || p.path.startsWith("~")) return null;
    const rel = p.path.replace(/^\.\//, ""), hits = tracked.filter((f) => f === rel || f.endsWith("/" + rel));
    return hits.length === 1 ? `${place.repo}/${hits[0]}` : null;
  };
  const out = [], seen = new Set();
  list.forEach((p, i) => {
    const abs = tries[i].find((x) => ok.has(x)) ?? bySuffix(p);
    if (!abs) return;
    const key = `${abs}:${p.line ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key); out.push({ ...p, abs });
  });
  return out;
}

const openAt = (f, on) => openPath(`${f.abs}${f.line ? `:${f.line}${f.col ? `:${f.col}` : ""}` : ""}`, on);

export function showTerminalFiles(terminal) {
  if (!terminal) return;
  openOverlay({ mod: "codenav", props: { view: "termfiles", terminal }, kind: "dialog", width: 620, height: 460 });
}

// Copies the terminal's selection and opens the path in it.
async function openSelection(target, sleep) {
  run("pane.focus", { pane: target.pane });
  const before = await exec("pbpaste").catch(() => null);
  run("terminal.copy");
  await sleep(120);
  const after = await exec("pbpaste").catch(() => null);
  const text = (after?.stdout ?? "").trim();
  const place = await placeOf(target.terminal);
  const found = text && text.length < 2000 ? await resolve(pathsIn(text).slice(0, 5).concat(parsePath(text) ? [parsePath(text)] : []), place) : [];
  if (!found.length) {
    notify({ title: T("Select a file path first"), body: before?.stdout === after?.stdout ? T("Nothing new was selected in the terminal") : text.slice(0, 80), level: "warning", timeout: 3000 });
    return;
  }
  openAt(found[0], place.on);
}

// -- the terminal's right-click menu ----------------------------------------------
export class TermMenu {
  init(_p, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  // An item is [label, icon, action(sleep), key hint]; null draws a separator.
  items() {
    const tg = props()?.target ?? {};
    const all = terminals();
    const term = all.find((t) => t.address === tg.terminal);
    const parent = term?.parent && all.find((t) => t.address === term.parent);
    const toProgram = term?.labels?.["herdr.right-click"] === "program";
    return [
      [T("Open selected path in code view"), "file-text", (sleep) => openSelection(tg, sleep)],
      [T("Files in this terminal…"), "search", () => showTerminalFiles(tg.terminal), "cmd-shift-o"],
      null,
      [T("Split right"), "panel-right", () => run("pane.split", { direction: "right", pane: tg.pane })],
      [T("Split down"), "panel-right", () => run("pane.split", { direction: "down", pane: tg.pane })],
      [T("Zoom"), "square", () => run("pane.zoom", { pane: tg.pane })],
      ...(term ? [toProgram
        ? [T("Use Herdr right-click menu"), "terminal", () => run("terminal.right_click", { terminal: term.address, to: "menu" })]
        : [T("Send right-clicks to pane"), "terminal", () => run("terminal.right_click", { terminal: term.address, to: "program" })]] : []),
      ...(parent ? [[`${T("Send back to")} ${parent.name || parent.address}`, "terminal", () => run("terminal.park", { terminal: term.address })]] : []),
      null,
      [T("Close pane"), "x", () => run("pane.close", { pane: tg.pane })],
    ];
  }

  // The popup closes once the item is done: closing it first would cancel
  // work that waits (copying the selection).
  choose(it, cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try { await it[2]((ms) => cx.sleep(ms)); }
      finally { closeOverlay(props()?.overlay); }
    });
  }

  render(cx) {
    const t = theme(), list = this.items(), real = list.filter(Boolean);
    return v_flex().id("cn-termmenu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % real.length;
        else if (e.key === "up") this.at = (this.at + real.length - 1) % real.length;
        else if (e.key === "enter") this.choose(real[this.at], cx);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => !it ? div().mx(7).my(4).h(1).bg(t.border)
        : h_flex().id(`cn-tm-${i}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .when(real.indexOf(it) === this.at, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.choose(it, cx))
          .child(svg(`mods/workspace-chrome/${it[1]}.svg`).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().child(it[0]))
          .child(div().text_size(11).text_color(t.dim).child(it[3] ?? ""))));
  }
}

// -- the picker of files named in a terminal ----------------------------------------
export class TermFiles {
  init(_p, cx) {
    this.files = null; this.at = 0;
    this.filter = InputState.new({ placeholder: T("Filter files") });
    this.filter.on("change", (_e, cx) => { this.at = 0; cx.notify(); });
    this.filter.on("submit", (_e, cx) => { const f = this.shown()[this.at]; if (f) this.open(f); });
    this.filter.focus();
    const terminal = props()?.terminal;
    cx.spawn(async (cx) => {
      try {
        const place = await placeOf(terminal);
        this.place = place;
        const r = await hc(["read", terminal, "--lines", "800"]);
        this.files = await resolve(pathsIn(r.stdout ?? "").slice(0, 400), place);
      } catch (e) { this.error = String(e.message ?? e); this.files = []; }
      cx.notify();
    });
  }

  shown() {
    const q = this.filter.value().toLowerCase();
    return (this.files ?? []).filter((f) => !q || f.abs.toLowerCase().includes(q)).slice(0, 200);
  }

  open(f) {
    closeOverlay(props()?.overlay);
    openAt(f, this.place?.on ?? null);
  }

  render(cx) {
    const t = theme(), list = this.shown();
    const where = (abs) => this.place?.repo && abs.startsWith(this.place.repo + "/") ? abs.slice(this.place.repo.length + 1) : tilde(abs);
    return v_flex().id("cn-termfiles").size_full().p(10).gap(8).bg(t.popover).text_color(t.foreground).text_size(12.5)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = Math.min(this.at + 1, list.length - 1);
        else if (e.key === "up") this.at = Math.max(this.at - 1, 0);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation(); cx.notify();
      })
      .child(h_flex().gap(8).items_center()
        .child(div().flex_none().font_semibold().child(T("Files in this terminal")))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(this.place?.cwd ? tilde(this.place.cwd) : "")))
      .child(Input.new(this.filter))
      .child(div().id("cn-tf-list").flex_1().min_h(0).overflow_y_scrollbar()
        .when(this.files === null, (e) => e.child(div().p(8).text_color(t.dim).child(T("Loading…"))))
        .when(this.files !== null && !list.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error ?? T("No file paths in this terminal's output"))))
        .children(list.map((f, i) => h_flex().id(`cn-tf-${i}`).h(28).px(8).gap(8).items_center().rounded(5).cursor_pointer()
          .when(i === this.at, (e) => e.bg(t.selected)).hover((e) => e.bg(t.hover))
          .on_click(() => this.open(f))
          .child(div().flex_none().max_w(220).truncate().font_semibold().child(basename(f.abs)))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(where(f.abs)))
          .when(Boolean(f.line), (e) => e.child(div().flex_none().text_size(11.5).text_color(t.accent).child(`:${f.line}`))))))
      .child(div().text_size(11).text_color(t.dim).child(T("Newest first · Enter opens · Esc closes")));
  }
}
