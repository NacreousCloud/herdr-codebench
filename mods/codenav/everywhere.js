// IntelliJ's pickers, as one dialog with modes:
//   all / classes / files / symbols / actions — Search Everywhere (Double Shift,
//     Cmd+O, Cmd+Shift+O, Cmd+Alt+O, Cmd+Shift+A); Tab moves between them
//   recent    — Recent Files (Cmd+E): the space's tabs, most recent first
//   structure — File Structure (Cmd+F12): the shown file's symbols
//   line      — Go to Line (Cmd+L): "line[:column]"
// Files come from git (or find) in the repository of the focused folder;
// classes and symbols from the language server's workspace/symbol.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, openOverlay, exec, run, commands, keys, shared, settings } from "herdr";
import { T } from "./i18n.js";
import { icon, location, openPath, editorSpec, editorKey, basename, tilde } from "./common.js";
import { lsp } from "./lsp.js";

const TABS = ["all", "classes", "files", "symbols", "actions"];
const LABEL = { all: "All", classes: "Classes", files: "Files", symbols: "Symbols", actions: "Actions", recent: "Recent Files", structure: "File Structure", line: "Go to Line" };
const SIZE = { line: [420, 110] };
const CLASSY = new Set(["class", "interface", "enum", "struct", "object"]);
const CODE = /\.(kt|kts|java|ts|tsx|js|jsx|mjs|py|rs|go|swift)$/;

export function openEverywhere(mode = "all", query = "") {
  const [width, height] = SIZE[mode] ?? [760, 500];
  openOverlay({ mod: "codenav", props: { view: "everywhere", mode, query }, kind: "dialog", width, height });
}

// A loose match, IntelliJ-like, on lowercased text and name: the name holding
// the query wins, then the query's letters in order (camel humps: "nose" finds NonceService).
function score(q, s, n) {
  if (!q) return 1;
  if (n === q) return 3000;
  if (n.startsWith(q)) return 2000 - n.length;
  if (n.includes(q)) return 1500 - n.length;
  let i = 0, streak = 0, total = 0;
  for (let k = 0; k < s.length && i < q.length; k++) {
    if (s[k] === q[i]) { i++; streak++; total += streak * 2; } else streak = 0;
  }
  return i === q.length ? total - s.length / 100 : -1;
}
const low = (x) => (x ?? "").toLowerCase();

export class Everywhere {
  init(_p, cx) {
    const p = props() ?? {};
    this.mode = p.mode ?? "all";
    this.at = 0; this.files = null; this.symbols = []; this.root = null; this.list = [];
    this.input = InputState.new({ placeholder: this.mode === "line" ? T("Line[:column]") : T("Type to search") });
    this.input.on("change", (_e, cx) => { this.querySymbols(cx); this.refresh(cx); });
    this.input.on("submit", (_e, cx) => this.pick(this.list[this.at], cx));
    if (p.query) this.input.set_value(p.query);
    this.input.focus();
    if (["all", "classes", "files", "symbols"].includes(this.mode)) this.loadFiles(cx);
    this.refresh(cx);
  }

  setMode(mode, cx) { this.mode = mode; this.querySymbols(cx); this.refresh(cx); }

  loadFiles(cx) {
    const { cwd, on } = location();
    this.on = on;
    cx.spawn(async (cx) => {
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
      this.root = top?.code === 0 ? top.stdout.trim() : cwd;
      let r = top?.code === 0 ? await exec("git", ["ls-files", "-co", "--exclude-standard"], { cwd: this.root, on }).catch(() => null) : null;
      if (r?.code !== 0) r = await exec("sh", ["-c", "find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' | head -20000 | sed 's|^./||'"], { cwd: this.root, on }).catch(() => null);
      const paths = (r?.stdout ?? "").split("\n").filter(Boolean).slice(0, 60000);
      // Lowercased once: matching runs on every keystroke.
      this.files = paths.map((f) => ({ f, s: low(f), n: low(basename(f)) }));
      this.querySymbols(cx);
      this.refresh(cx);
    });
  }

  // The language server answers per project; one of its files picks the server.
  querySymbols(cx) {
    if (!["all", "classes", "symbols"].includes(this.mode) || this.on) return;
    const q = this.input.value().trim(), seq = (this.seq = (this.seq ?? 0) + 1);
    if (q.length < 2) { this.symbols = []; return; }
    cx.timer.after(250, (cx) => cx.spawn(async (cx) => {
      if (seq !== this.seq || !this.root) return;
      const shown = editorSpec()?.path, first = this.files?.find((x) => CODE.test(x.f));
      const probe = shown?.startsWith(this.root + "/") && CODE.test(shown) ? shown : first ? `${this.root}/${first.f}` : null;
      if (!probe) return;
      this.symbolsBusy = true; cx.notify();
      const r = await lsp("workspace_symbols", { path: probe, query: q }, (ms) => cx.sleep(ms)).catch(() => []);
      if (seq !== this.seq) return;
      this.symbols = r; this.symbolsBusy = false;
      this.refresh(cx);
    }));
  }

  // The results for the mode and the query, worked out off the render (a large
  // repository's files in slices, so no single step runs long), then shown.
  refresh(cx) {
    const seq = (this.rseq = (this.rseq ?? 0) + 1);
    cx.spawn(async (cx) => {
      const list = await this.compute(cx, () => seq !== this.rseq);
      if (list === null || seq !== this.rseq) return;
      this.list = list;
      this.at = Math.max(0, list.findIndex((x) => x.kind !== "head"));
      cx.notify();
    });
  }

  // [{kind: "head"|"file"|"symbol"|"action"|"line", title, sub, ...}], or null when overtaken.
  async compute(cx, stale) {
    const q = low(this.input.value().trim()), mode = this.mode;
    if (mode === "line") {
      const m = /^(\d+)(?::(\d+))?$/.exec(q), spec = editorSpec();
      return m && spec ? [{ kind: "line", title: T("Go to line {l}", { l: m[1] }), path: spec.path, line: +m[1], col: m[2] ? +m[2] : 1 }] : [];
    }
    if (mode === "recent") {
      const h = (shared("codenav.history") ?? {})[editorKey()]?.list ?? [];
      const tabs = (shared("codenav.tabs") ?? {})[editorKey()] ?? [];
      const order = [...h.map((x) => x.id).reverse(), ...tabs.map((x) => x.id).reverse()];
      const seen = new Set(), list = [];
      for (const id of order) { const tab = tabs.find((x) => x.id === id); if (tab?.type === "file" && !seen.has(id)) { seen.add(id); list.push(tab.spec); } }
      return list.map((s) => ({ kind: "file", title: basename(s.path), sub: s.rel ?? tilde(s.path), path: s.path, s: score(q, low(s.rel ?? s.path), low(basename(s.path))) }))
        .filter((x) => x.s >= 0).slice(0, 50);
    }
    if (mode === "structure") {
      const syms = shared("codenav.symbols"), spec = editorSpec();
      if (!syms || syms.path !== spec?.path) return [];
      return syms.items.map((s) => ({ kind: "symbol", title: s.name, sub: s.detail ?? "", symKind: s.kind, depth: q ? 0 : s.depth, path: syms.path, line: s.line, col: s.col, s: score(q, low(s.name), low(s.name)) }))
        .filter((x) => x.s >= 0).sort((a, b) => q ? b.s - a.s : 0).slice(0, 300);
    }
    let files = [];
    if (q && (mode === "files" || mode === "all")) {
      const hits = [], all = this.files ?? [];
      for (let i = 0; i < all.length; i += 2000) {
        for (const x of all.slice(i, i + 2000)) { const sc = score(q, x.s, x.n); if (sc >= 0) hits.push([sc, x.f]); }
        await cx.sleep(0);
        if (stale()) return null;
      }
      files = hits.sort((a, b) => b[0] - a[0]).slice(0, mode === "all" ? 8 : 100)
        .map(([, f]) => ({ kind: "file", title: basename(f), sub: f.includes("/") ? f.replace(/\/[^/]*$/, "") : "", path: `${this.root}/${f}` }));
    }
    const syms = (classes) => this.symbols.filter((s) => !classes || CLASSY.has(s.kind)).slice(0, mode === "all" ? 8 : 100)
      .map((s) => ({ kind: "symbol", title: s.name, sub: `${s.container ? `${s.container} · ` : ""}${this.root && s.path.startsWith(this.root + "/") ? s.path.slice(this.root.length + 1) : tilde(s.path)}`, symKind: s.kind, path: s.path, line: s.line, col: s.col }));
    // Actions match on their name; the description only by the whole query.
    const actions = () => {
      if (!q && mode !== "actions") return [];
      const bound = new Map(keys().map((k) => [k.action, k.keys]));
      return commands().filter((c) => !c.args.some((a) => a.required))
        .map((c) => ({ c, s: Math.max(score(q, low(c.name), low(c.name)), q && low(c.about).includes(q) ? 100 : -1) }))
        .filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, mode === "all" ? 5 : 100)
        .map(({ c }) => ({ kind: "action", title: c.name, sub: c.about, key: bound.get(c.name), name: c.name }));
    };
    if (mode === "files") return files;
    if (mode === "classes") return syms(true);
    if (mode === "symbols") return syms(false);
    if (mode === "actions") return actions();
    const out = [];
    const groups = [["Classes", syms(true)], ["Files", files], ["Symbols", syms(false).filter((x) => !CLASSY.has(x.symKind))], ["Actions", actions()]];
    for (const [head, list] of groups) if (list.length) out.push({ kind: "head", title: T(head) }, ...list);
    return out;
  }

  pick(r, cx) {
    if (!r || r.kind === "head") return;
    closeOverlay(props()?.overlay);
    if (r.kind === "file") openPath(r.path, this.on ?? null);
    else if (r.kind === "symbol" || r.kind === "line") openPath(`${r.path}:${(r.line ?? 0) + (r.kind === "line" ? 0 : 1)}:${(r.col ?? 0) + (r.kind === "line" ? 0 : 1)}`, this.on ?? null);
    else if (r.kind === "action") run(r.name);
  }

  move(list, dir) {
    let i = this.at;
    do { i = Math.min(Math.max(i + dir, 0), list.length - 1); } while (list[i]?.kind === "head" && i > 0 && i < list.length - 1);
    if (list[i]?.kind === "head") i = list.findIndex((x) => x.kind !== "head");
    this.at = Math.max(i, 0);
  }

  render(cx) {
    const t = theme(), list = this.list;
    const tabbed = TABS.includes(this.mode);
    const row = (r, i) => {
      if (r.kind === "head") return div().px(12).pt(8).pb(2).text_size(11).font_semibold().text_color(t.dim).child(r.title);
      const on = i === this.at;
      return h_flex().id(`ev-${i}`).h(28).px(12).gap(8).flex_none().items_center().rounded(5).cursor_pointer()
        .bg(on ? t.selected : "#00000000").hover((s) => s.bg(on ? t.selected : t.hover))
        .when(r.depth > 0, (e) => e.pl(12 + r.depth * 14))
        .on_click((_e, cx) => this.pick(r, cx))
        .child(r.kind === "file" ? icon("file-text", 14).text_color(t.muted) : r.kind === "action" ? icon("settings", 13).text_color(t.muted)
          : r.kind === "line" ? icon("arrow-down", 13).text_color(t.muted)
          : div().w(14).flex_none().text_center().text_size(11).font_bold().text_color(t.ansi3).child((r.symKind ?? "?")[0].toUpperCase()))
        .child(div().flex_none().max_w(320).truncate().text_color(t.foreground).child(r.title))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(r.sub ?? ""))
        .when(Boolean(r.key), (e) => e.child(div().flex_none().text_size(11).text_color(t.muted).child(r.key)));
    };
    const busy = (this.files === null && tabbed && this.mode !== "actions") || this.symbolsBusy;
    return v_flex().id("cn-everywhere").size_full().p(8).gap(6).bg(t.popover).text_color(t.foreground).text_size(13)
      .font_family(settings().ui_font ?? "Geist")
      .on_key_down((e, cx) => {
        if (e.key === "down") this.move(list, 1);
        else if (e.key === "up") this.move(list, -1);
        else if (e.key === "tab" && tabbed) this.setMode(TABS[(TABS.indexOf(this.mode) + (e.modifiers?.shift ? TABS.length - 1 : 1)) % TABS.length], cx);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation(); cx.notify();
      })
      .child(h_flex().h(24).gap(2).items_center()
        .when(tabbed, (e) => e.children(TABS.map((m) => div().id(`ev-tab-${m}`).px(8).py(2).rounded(5).text_size(12).cursor_pointer()
          .bg(m === this.mode ? t.hover : "#00000000").text_color(m === this.mode ? t.foreground : t.muted)
          .on_click((_e, cx) => { this.setMode(m, cx); this.input.focus(); }).child(T(LABEL[m])))))
        .when(!tabbed, (e) => e.child(div().px(4).text_size(12).font_semibold().text_color(t.muted).child(T(LABEL[this.mode]))))
        .child(div().flex_1())
        .when(busy, (e) => e.child(div().text_size(11).text_color(t.dim).child(T("Searching…")))))
      .child(Input.new(this.input))
      .when(this.mode !== "line", (e) => e.child(div().id("ev-list").flex_1().min_h(0).overflow_y_scrollbar()
        .children(list.length ? list.map(row) : [div().px(12).py(8).text_size(12).text_color(t.dim)
          .child(this.mode === "structure" && !shared("codenav.symbols") ? T("Waiting for the language server…") : T("Nothing found"))])))
      .when(this.mode === "line" && list.length > 0, (e) => e.child(div().text_size(11.5).text_color(t.dim).child(T("Enter to go"))));
  }
}
