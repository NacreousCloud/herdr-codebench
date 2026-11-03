// The code view: a read-only, VS Code–like view of a source file with language
// server help. Click a name for its type and docs, Cmd+click (F12) to go to its
// definition, Shift+F12 for references, an outline of the file's symbols,
// diagnostics in the gutter, Cmd+F to find, Ctrl+- / Ctrl+Shift+- to go back
// and forward. "Edit" hands the file to the activity editor. Clicking a line
// number starts a comment (Shift+click for a range); comments join the
// repository's review comments (shared "codenav.reviews") and show inline.
import { div } from "gpui-kit";
import { T, lang, setLang } from "./i18n.js";
import { v_flex, h_flex, v_virtual_list, VirtualListScrollHandle, Scrollbar, TextView, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { readTextFile, watchFolder, theme, settings, shared, setShared, props, run, exec, nextCommand } from "herdr";
import { lsp } from "./lsp.js";
import {
  icon, iconButton, editorKey, setEditorSpec, CHILD, STACK, AREA, hasArea, find, showReview,
  syntaxColors, expandTabs, displayWidth, offsetAt, wordAt, tilde, basename, sectionHeader,
} from "./common.js";

const ROW = 20;
const FONT = 13;
const PAD = 12;
const MAX_LINE = 2000;
const KIND = { class: "C", struct: "S", interface: "I", enum: "E", function: "ƒ", method: "m", constructor: "c", field: "f", property: "p", variable: "v", constant: "K", module: "M", namespace: "N", package: "P", "type parameter": "T", "enum member": "e" };
const SEVERITY = ["", "error", "warning", "info", "hint"];

export default class CodeView {
  init(p, cx) {
    this.slot = Boolean(p?.slot); this.tab = p?.tab ?? null;
    this.lines = []; this.toks = null; this.diags = []; this.symbols = []; this.refs = null;
    this.cw = FONT * 0.6; this.outline = true;
    this.scroll = VirtualListScrollHandle.new();
    this.focus = cx.focus_handle();
    this.find = InputState.new({ placeholder: T("Find") });
    this.find.on("change", (_e, cx) => { this.findQuery = this.find.value(); this.findAt = -1; cx.notify(); });
    this.find.on("submit", (e, cx) => { this.findNext(e?.shift ? -1 : 1); cx.notify(); });
    this.sleep = (ms) => cx.sleep(ms);
    this.box = TextareaState.new({ placeholder: T("Leave a comment for the agent… (Cmd+Enter to save)"), rows: 3 });
    this.box.set_auto_grow(2, 8);
    this.box.on("submit", (e, cx) => { if (e?.secondary) this.saveComment(cx); });
    this.box.on("focus", () => { this.typing = true; });
    this.box.on("blur", () => { this.typing = false; });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.focus.focus();
        else if (c === "review") showReview();
        else if (c === "back") this.goBack(cx);
        else if (c === "forward") this.goForward(cx);
        else if (c === "definition") this.definition(cx);
        else if (c === "references") this.references(cx);
        else if (c === "outline") this.outline = !this.outline;
        cx.notify();
      }
    });
  }

  key() { return this.slot ? editorKey() : this.tab; }
  spec() { return (shared("activity.editor") ?? {})[this.key()] ?? (this.slot ? null : props()?.spec ?? null); }

  // Back / forward belong to the space (or tab) whose editor this is.
  history() {
    const k = this.key() ?? "";
    this.histories ??= {};
    return (this.histories[k] ??= { back: [], fwd: [] });
  }
  get back() { return this.history().back; }
  set back(v) { this.history().back = v; }
  get fwd() { return this.history().fwd; }
  set fwd(v) { this.history().fwd = v; }

  sync(cx) {
    const spec = this.spec();
    const k = spec ? `${spec.path}\u0000${spec.on ?? ""}\u0000${spec.at ?? ""}` : null;
    if (k === this.loadedKey) return;
    this.loadedKey = k;
    const same = spec && this.shown && spec.path === this.shown.path && spec.on === this.shown.on;
    this.shown = spec;
    if (!spec) { this.lines = []; return; }
    if (same && this.lines.length) { this.reveal(spec.line, spec.col); return; }
    // Deferred: render must not start work that notifies before its first await.
    cx.timer.after(0, (cx) => this.load(spec, cx));
  }

  load(spec, cx, keepView = false) {
    const seq = (this.seq = (this.seq ?? 0) + 1);
    const alive = () => seq === this.seq;
    if (!keepView) { this.sel = null; this.hover = null; this.refs = null; this.symbols = []; this.diags = []; this.toks = null; this.info = null; }
    this.error = null; this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(spec.path, { on: spec.on }).catch(() => null);
        if (!alive()) return;
        if (text === null) { this.error = T("This file can't be read as text (missing, or over 1 MB)."); return; }
        if (text.includes("\0")) { this.error = T("A binary file."); return; }
        this.text = text;
        this.lines = text.split("\n");
        this.width = Math.max(...this.lines.slice(0, 20000).map((l) => displayWidth(l.length > MAX_LINE ? l.slice(0, MAX_LINE) : l)), 40);
        if (!keepView) { this.composer = null; this.reveal(spec.line, spec.col); }
        this.loading = false; cx.notify();
        this.watch(spec, cx);
        // The repository the file is in: its review comments are kept there.
        const dir = spec.path.replace(/\/[^/]*$/, "");
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dir, on: spec.on }).catch(() => null);
        if (!alive()) return;
        this.repo = top?.code === 0 ? top.stdout.trim() : null;
        await this.loadChanges(spec, alive);
        cx.notify();
        // Colors first (fast), then the language server.
        const toks = await lsp("tokens", spec.on ? { path: spec.path, text } : { path: spec.path }, this.sleep).catch(() => null);
        if (!alive()) return;
        this.toks = toks; cx.notify();
        if (spec.on) { this.info = { lang: null, remote: true }; return; }
        this.info = await lsp("info", { path: spec.path }, this.sleep).catch((e) => ({ error: String(e.message ?? e) }));
        if (!alive() || !this.info?.lang || !this.info.installed) return;
        cx.notify();
        const retry = this.retry; this.retry = false;
        const symbols = await lsp("symbols", { path: spec.path, retry }, this.sleep).catch((e) => { this.lspError = String(e.message ?? e); return null; });
        if (!alive()) return;
        if (symbols) { this.symbols = symbols; this.lspError = null; }
        this.info = await lsp("info", { path: spec.path }, this.sleep).catch(() => this.info);
        cx.notify();
        // Diagnostics arrive when the server has looked; ask a few times.
        for (const wait of [300, 1500, 4000, 8000]) {
          await cx.sleep(wait);
          if (!alive()) return;
          await this.loadDiagnostics(cx);
        }
      } catch (e) { if (alive()) this.error = String(e.message ?? e); }
      finally { if (alive()) { this.loading = false; cx.notify(); } }
    });
  }

  async loadDiagnostics(cx) {
    const s = this.shown;
    if (!s || s.on || !this.info?.installed) return;
    const r = await lsp("diagnostics", { path: s.path }, this.sleep).catch(() => null);
    if (r && s === this.shown) { this.diags = r.items; this.busy = r.busy; cx.notify(); }
  }

  // Reloads when the file changes on disk (local files).
  watch(spec, cx) {
    if (spec.on) return;
    const dir = spec.path.replace(/\/[^/]*$/, ""), key = spec.path;
    if (this.watched === key) return;
    this.watched = key;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === key) {
          const changed = await watchFolder(dir);
          if (this.watched !== key || !changed.includes(spec.path) && !changed.includes(dir)) continue;
          const text = await readTextFile(spec.path).catch(() => null);
          if (this.watched === key && text !== null && text !== this.text && this.shown?.path === key) this.load(this.shown, cx, true);
        }
      } catch { if (this.watched === key) this.watched = null; }
    });
  }

  // Scrolls to a 1-based line (as in specs) and selects the name at col.
  reveal(line, col) {
    if (!line) return;
    const i = Math.min(Math.max(line - 1, 0), Math.max(this.lines.length - 1, 0));
    this.items();
    this.scrollTo(i, "center");
    const w = col !== undefined ? wordAt(this.lines[i] ?? "", col) : null;
    this.sel = { line: i, col: col ?? 0, ...(w ?? { start: 0, end: 0, word: null }) };
    this.flash = i;
  }

  here() { const s = this.shown; return s ? { spec: s, line: (this.sel?.line ?? 0) + 1, col: this.sel?.col } : null; }

  // Opens a location: in this view when it's the same file, else as the editor's file.
  open(loc, cx) {
    const cur = this.here();
    if (cur) { this.back.push(cur); this.fwd = []; }
    this.goTo({ path: loc.path, line: loc.line + 1, col: loc.col }, cx);
  }

  goTo({ spec, path, line, col }, cx) {
    const s = this.shown;
    path = path ?? spec.path;
    if (s && path === s.path && !spec?.on === !s.on) { this.reveal(line, col); this.hoverAt(cx); cx.notify(); return; }
    const root = spec?.root ?? (s?.root && path.startsWith(s.root + "/") ? s.root : path.replace(/\/[^/]*$/, ""));
    const rel = path.startsWith(root + "/") ? path.slice(root.length + 1) : tilde(path);
    setEditorSpec(this.key(), { kind: "file", path, root, rel, on: spec?.on ?? null, line, col });
  }

  goBack(cx) { const to = this.back.pop(); if (!to) return; const cur = this.here(); if (cur) this.fwd.push(cur); this.goTo(to, cx); }
  goForward(cx) { const to = this.fwd.pop(); if (!to) return; const cur = this.here(); if (cur) this.back.push(cur); this.goTo(to, cx); }

  // A press on the code: the row comes from the list, the column from where the pointer was.
  pick(line, x, cx) {
    const text = this.lines[line] ?? "";
    const col = offsetAt(text, Math.max(0, Math.floor((x - this.gutter() - PAD) / this.cw)));
    const w = wordAt(text, col);
    this.sel = { line, col: w ? w.start : col, ...(w ?? { start: col, end: col, word: null }) };
    this.flash = null;
    return this.sel;
  }

  // What changed since the last commit, by line of the file as it is now:
  // "add" (new lines), "mod" (changed lines), "del" (lines removed just below).
  async loadChanges(spec, alive) {
    this.changes = new Map();
    const rel = this.rel();
    if (!rel) return;
    const r = await exec("git", ["--no-optional-locks", "diff", "-U0", "--no-color", "--no-ext-diff", "HEAD", "--", rel], { cwd: this.repo, on: spec.on }).catch(() => null);
    if (!alive() || r?.code !== 0) return;
    const changes = new Map();
    for (const m of r.stdout.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      const removed = m[1] === undefined ? 1 : +m[1], start = +m[2], added = m[3] === undefined ? 1 : +m[3];
      if (added === 0) changes.set(Math.max(start - 1, 0), "del");
      else for (let k = 0; k < added; k++) changes.set(start - 1 + k, k < removed ? "mod" : "add");
    }
    this.changes = changes;
  }

  // -- comments ------------------------------------------------------------------
  rkey() { return this.repo ? `${this.shown?.on ?? ""}:${this.repo}` : null; }
  rel() { const p = this.shown?.path ?? ""; return this.repo && p.startsWith(this.repo + "/") ? p.slice(this.repo.length + 1) : null; }
  store() { return (shared("codenav.reviews") ?? {})[this.rkey()] ?? {}; }
  fileComments() { const rel = this.rel(); return rel ? (this.store().comments ?? []).filter((c) => c.path === rel && c.side !== "old") : []; }
  saveStore(comments) {
    const all = { ...(shared("codenav.reviews") ?? {}) };
    all[this.rkey()] = { ...this.store(), comments };
    setShared("codenav.reviews", all);
  }

  // Lines and the comments under them, as the list shows them.
  items() {
    const after = new Map();
    for (const c of this.fileComments()) {
      const at = Math.min(Math.max(c.end - 1, 0), Math.max(this.lines.length - 1, 0));
      if (!after.has(at)) after.set(at, []);
      after.get(at).push(c);
    }
    const items = [], index = [];
    this.lines.forEach((_, i) => {
      index[i] = items.length;
      items.push({ line: i });
      for (const c of after.get(i) ?? []) items.push({ c });
    });
    this.itemIndex = index;
    return items;
  }
  scrollTo(line, how) { this.scroll.scroll_to_item(this.itemIndex?.[line] ?? line, how); }

  // Lines from..to (0-based) get a comment box.
  commentLines(from, to, cx) {
    if (!this.rel()) { this.note = T("Comments need a file inside a git repository"); cx.notify(); return; }
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const keep = this.composer && !this.composer.id ? this.box.value() : "";
    this.composer = { path: this.rel(), side: "new", start: lo + 1, end: hi + 1, code: this.lines.slice(lo, hi + 1).slice(0, 30).map((l) => `  ${l}`), kind: "file" };
    this.box.set_value(keep);
    this.box.focus();
    cx.notify();
  }

  editComment(c, cx) {
    this.composer = { ...c };
    this.box.set_value(c.body);
    this.box.focus();
    cx.notify();
  }

  saveComment(cx) {
    const c = this.composer;
    if (!c || !this.rkey()) return;
    const body = this.box.value().trim();
    let list = (this.store().comments ?? []).filter((x) => x.id !== c.id);
    if (body) list = [...list, { ...c, id: c.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, body, at: Date.now() }];
    this.saveStore(list);
    this.composer = null; this.box.set_value("");
    cx.notify();
  }

  deleteComment(id, cx) {
    this.saveStore((this.store().comments ?? []).filter((x) => x.id !== id));
    this.composer = null; this.box.set_value("");
    cx.notify();
  }

  click(line, cx) {
    const press = this.press ?? { x: 0, mods: {} };
    this.focus.focus();
    // The line numbers start a comment; Shift extends it from the last one.
    if (press.x < this.gutter()) {
      if (press.mods.shift && this.commentAnchor !== undefined) this.commentLines(this.commentAnchor, line, cx);
      else { this.commentAnchor = line; this.commentLines(line, line, cx); }
      return;
    }
    this.pick(line, press.x, cx);
    if (press.mods.platform || press.mods.control) this.definition(cx);
    else this.hoverAt(cx);
    cx.notify();
  }

  posArgs() { return { path: this.shown.path, line: this.sel.line, col: this.sel.col }; }
  lspReady() { return this.shown && !this.shown.on && this.info?.installed && this.sel; }

  hoverAt(cx) {
    this.hover = null;
    if (!this.lspReady() || !this.sel.word) return;
    const sel = this.sel;
    cx.spawn(async (cx) => {
      const r = await lsp("hover", this.posArgs(), this.sleep).catch((e) => ({ error: String(e.message ?? e) }));
      if (this.sel === sel) { this.hover = r; cx.notify(); }
    });
  }

  definition(cx, kind = "definition") {
    if (!this.lspReady()) return;
    const sel = this.sel;
    this.note = T("Looking for the definition…"); cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await lsp("definition", { ...this.posArgs(), kind }, this.sleep);
        if (this.sel !== sel) return;
        this.note = null;
        if (!r.length) this.note = T("No {kind} found for {word}", { kind: T(kind), word: sel.word ?? "" });
        else if (r.length === 1) this.open(r[0], cx);
        else this.refs = { title: T("{n} results for {word}", { n: r.length, word: sel.word }), items: r };
      } catch (e) { this.note = String(e.message ?? e); }
      cx.notify();
    });
  }

  references(cx) {
    if (!this.lspReady()) return;
    const sel = this.sel;
    this.refs = { title: T("References to {word}", { word: sel.word ?? "…" }), items: null };
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const items = await lsp("references", this.posArgs(), this.sleep);
        this.refs = { title: T("{n} references to {word}", { n: items.length, word: sel.word }), items };
      } catch (e) { this.refs = { title: T("References"), items: [], error: String(e.message ?? e) }; }
      cx.notify();
    });
  }

  findNext(dir) {
    const q = this.findQuery;
    if (!q) return;
    const hits = [];
    this.lines.forEach((l, i) => { if (l.includes(q)) hits.push(i); });
    if (!hits.length) return;
    const from = this.sel?.line ?? -1;
    const next = dir > 0 ? hits.find((i) => i > from) ?? hits[0] : [...hits].reverse().find((i) => i < from) ?? hits[hits.length - 1];
    const col = this.lines[next].indexOf(q);
    this.sel = { line: next, col, start: col, end: col + q.length, word: q };
    this.scrollTo(next, "center");
  }

  edit() {
    const s = this.shown;
    if (!s) return;
    setEditorSpec(this.key(), { ...s, edit: true, line: (this.sel?.line ?? 0) + 1 });
    if (hasArea()) run("layout.select", { stack: STACK, child: CHILD.text });
  }

  closeFile() {
    setEditorSpec(this.key(), null);
    if (hasArea()) run("layout.hide", { id: AREA });
  }

  openInVscode() {
    const s = this.shown;
    if (!s || s.on) return run("mod.open", { name: "open-vscode" });
    exec("code", ["-g", `${s.path}:${(this.sel?.line ?? 0) + 1}:${(this.sel?.col ?? 0) + 1}`]).catch(() => {});
  }

  keyDown(e, cx) {
    const k = e.keystroke;
    if (this.typing || this.finding && k !== "escape") {
      // Typing a comment (or a search): only its own keys.
      if (this.typing && (k === "cmd-enter" || k === "ctrl-enter")) this.saveComment(cx);
      else if (this.typing && k === "escape") { this.composer = null; this.focus.focus(); }
      else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (k === "f12" || k === "cmd-b") this.definition(cx);
    else if (k === "shift-f12" || k === "alt-shift-f12") this.references(cx);
    else if (k === "cmd-f12") this.definition(cx, "implementation");
    else if (k === "cmd-f" || k === "ctrl-f") { this.finding = true; this.find.focus(); }
    else if (k === "cmd-shift-o") this.outline = !this.outline;
    else if (k === "ctrl--" || k === "alt-left") this.goBack(cx);
    else if (k === "ctrl-shift--" || k === "ctrl-_" || k === "alt-right") this.goForward(cx);
    else if (k === "escape") { this.refs = null; this.hover = null; this.finding = false; this.focus.focus(); }
    else if (k === "up" || k === "down") {
      const line = Math.min(Math.max((this.sel?.line ?? 0) + (k === "up" ? -1 : 1), 0), this.lines.length - 1);
      this.sel = { line, col: 0, start: 0, end: 0, word: null };
      this.scrollTo(line);
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  gutter() { return 25 + Math.max(3, String(this.lines.length).length) * this.cw + 12; }

  // The change mark at the gutter's edge, as VS Code draws it.
  changeMark(i, t) {
    const c = this.changes?.get(i);
    const mark = div().w(3).h_full().flex_none().mr(1);
    if (c === "add") return mark.bg(t.ansi2);
    if (c === "mod") return mark.bg(t.ansi4);
    if (c === "del") return mark.flex().flex_col().justify_end().child(div().w(4).h(5).bg(t.ansi1).rounded(1));
    return mark;
  }

  // A comment under the lines it covers.
  commentRow(c, t) {
    return v_flex().w_full().pl(this.gutter() + PAD).pr(16).py(4).flex_none()
      .child(v_flex().max_w(760).px(10).py(6).gap(2).rounded(6).border_1().border_color(t.accent + "66").bg(t.accent + "12")
        .font_family(settings().ui_font ?? "Geist").text_size(12.5)
        .child(div().text_size(11).text_color(t.muted).child(c.end !== c.start ? T("lines {start}-{end} · click to edit", c) : T("line {start} · click to edit", c)))
        .child(div().whitespace_normal().child(c.body)));
  }
  commentHeight(c) {
    return 34 + Math.min(12, c.body.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 100)), 0)) * 18;
  }

  composerPanel(t) {
    const c = this.composer;
    if (!c) return null;
    const where = `${c.path}:${c.start}${c.end !== c.start ? `-${c.end}` : ""}`;
    return v_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border).bg(t.chrome)
      .child(h_flex().gap(8).items_center().text_size(12)
        .child(icon("message", 13).text_color(t.accent))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted)
          .child(`${T(c.id ? "Edit comment on {where}" : "Comment on {where}", { where })}${T("  ·  Shift+click a line number for a range")}`)))
      .child(Textarea.new(this.box))
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().text_size(11.5).text_color(t.dim).child(T("Comments go to the Review list, sent to the agent together")))
        .when(Boolean(c.id), (e) => e.child(pill("cn-c-del", T("Delete"), T("Delete"), (_e, cx) => this.deleteComment(c.id, cx), t)))
        .child(pill("cn-c-cancel", T("Cancel"), "Esc", (_e, cx) => { this.composer = null; this.box.set_value(""); cx.notify(); }, t))
        .child(pill("cn-c-save", c.id ? T("Update") : T("Add comment"), "Cmd+Enter", (_e, cx) => this.saveComment(cx), t)));
  }

  // The symbols whose range holds a line, outermost first.
  scope(line) {
    return this.symbols.filter((s) => s.start <= line && line <= s.end && KIND[s.kind] && s.kind !== "variable" && s.kind !== "field");
  }

  // One line: token colors, the selected name's other uses, find hits and diagnostics.
  row(i, t, colors) {
    let text = this.lines[i] ?? "";
    if (text.length > MAX_LINE) text = text.slice(0, MAX_LINE);
    const toks = this.toks?.[i];
    const cuts = new Set([0, text.length]);
    const spans = [];
    if (toks) { let o = 0; for (const [n, cat] of toks) { spans.push([o, o + n, cat]); o += n; cuts.add(Math.min(o, text.length)); } }
    const marks = [];
    const word = this.sel?.word;
    if (word) {
      const isWord = /^[\p{L}\p{N}_$]+$/u.test(word);
      for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
        const before = text[at - 1], after = text[at + word.length];
        if (isWord && ((before && /[\p{L}\p{N}_$]/u.test(before)) || (after && /[\p{L}\p{N}_$]/u.test(after)))) continue;
        marks.push([at, at + word.length, this.sel.line === i && at === this.sel.start ? "sel" : "use"]);
        cuts.add(at); cuts.add(at + word.length);
      }
    }
    const diags = this.diags.filter((d) => d.line <= i && i <= d.end_line);
    for (const d of diags) {
      const s = d.line === i ? Math.min(d.col, text.length) : 0, e = d.end_line === i ? Math.min(d.end_col, text.length) : text.length;
      marks.push([s, Math.max(e, s), d.severity === 1 ? "error" : "warning"]);
      cuts.add(s); cuts.add(Math.max(e, s));
    }
    const points = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
    const children = [];
    let col = 0;
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      if (a === b) continue;
      const piece = expandTabs(text.slice(a, b), col);
      col += displayWidth(text.slice(a, b));
      const cat = spans.find((s) => s[0] <= a && a < s[1])?.[2];
      let el = div().flex_none().child(piece);
      if (cat && colors[cat]) el = el.text_color(colors[cat]);
      for (const [s, e, kind] of marks) {
        if (s > a || e < b) continue;
        if (kind === "sel") el = el.bg(t.accent + "55").rounded(2);
        else if (kind === "use") el = el.bg(t.selection + "66").rounded(2);
        else el = el.border_b(1).border_color(kind === "error" ? t.ansi1 : t.ansi3);
      }
      children.push(el);
    }
    const worst = diags.length ? Math.min(...diags.map((d) => d.severity ?? 1)) : 0;
    const current = this.sel?.line === i;
    const c = this.composer, picked = c && c.path === this.rel() && i + 1 >= c.start && i + 1 <= c.end;
    return h_flex().h(ROW).w_full().flex_none().whitespace_nowrap()
      .when(current, (e) => e.bg(t.hover))
      .when(this.flash === i && !current, (e) => e.bg(t.accent + "22"))
      .when(Boolean(picked), (e) => e.bg(t.accent + "33"))
      .child(h_flex().w(this.gutter()).h_full().flex_none().items_center().pr(12).cursor_pointer()
        .child(this.changeMark(i, t))
        .child(div().w(3).h_full().flex_none().when(Boolean(picked) || this.commented?.has(i + 1), (e) => e.bg(picked ? t.accent : t.accent + "88")))
        .child(div().w(18).flex_none().flex().justify_center()
          .when(worst > 0, (e) => e.child(div().size(7).rounded_full().bg(worst === 1 ? t.ansi1 : worst === 2 ? t.ansi3 : t.ansi4))))
        .child(div().flex_1().text_right().text_color(current ? t.foreground : t.dim).child(String(i + 1))))
      .child(h_flex().pl(PAD).h_full().items_center().flex_none().children(children.length ? children : [div().child(" ")]));
  }

  header(t) {
    const s = this.shown;
    const crumbs = (s?.rel ?? tilde(s?.path ?? "")).split("/").filter(Boolean);
    const scope = this.sel ? this.scope(this.sel.line) : [];
    const sep = () => div().flex_none().text_color(t.dim).child("›");
    const info = this.info;
    const retry = (cx) => { this.lspError = null; this.retry = true; this.load(this.shown, cx, true); };
    const lspChip = !s ? null : s.on ? chip(T("remote · no LSP"), t.dim, T("Language servers run on this computer only"))
      : !info ? null
      : info.error ? chip(T("LSP off"), t.ansi1, T("{error} · click to retry", { error: info.error }), retry)
      : !info.lang ? (info.library ? chip(T("library source · read-only"), t.dim, T("library source · read-only")) : null)
      : !info.installed ? chip(T("{lang}: install {command}", info), t.ansi3, T("No language server for {lang}: install {command}, then click to retry", info), retry)
      : this.lspError ? chip(`${info.command} ⚠`, t.ansi3, T("{error} · click to retry", { error: this.lspError }), retry)
      : chip(`${info.command}${(info.busy?.length || this.busy?.length) ? T(" · indexing") : info.state === "ready" ? "" : ` · ${info.state}`}`,
        info.state === "ready" ? t.ansi2 : t.ansi3, `${info.lang} · ${tilde(info.root)}${info.busy?.length ? ` · ${info.busy.join(", ")}` : ""}`);
    const errors = this.diags.filter((d) => d.severity === 1).length, warnings = this.diags.filter((d) => d.severity === 2).length;
    return h_flex().h(34).flex_none().pl(8).pr(6).gap(4).items_center().border_b(1).border_color(t.border).bg(t.chrome)
      .child(iconButton("cn-back", "chevron-left", T("Back (Ctrl+-)"), (_e, cx) => this.goBack(cx), { color: this.back.length ? t.muted : t.dim }))
      .child(iconButton("cn-fwd", "chevron-right", T("Forward (Ctrl+Shift+-)"), (_e, cx) => this.goForward(cx), { color: this.fwd.length ? t.muted : t.dim }))
      .child(h_flex().flex_1().min_w(0).gap(5).items_center().overflow_hidden().text_size(12).text_color(t.muted)
        .children(crumbs.flatMap((c, i) => [i ? sep() : null, div().flex_none().when(i === crumbs.length - 1, (e) => e.text_color(t.foreground).font_semibold()).child(c)]).filter(Boolean))
        .children(scope.flatMap((sym, i) => [sep(), div().id(`cn-crumb-${i}`).flex_none().cursor_pointer().hover((e) => e.text_color(t.foreground))
          .on_click((_e, cx) => { this.reveal(sym.line + 1, sym.col); cx.notify(); }).child(`${KIND[sym.kind] ?? ""} ${sym.name}`)])))
      .when(errors + warnings > 0, (e) => e.child(chip(`${errors ? `✕ ${errors}` : ""}${errors && warnings ? "  " : ""}${warnings ? `⚠ ${warnings}` : ""}`, errors ? t.ansi1 : t.ansi3, T("Problems in this file"))))
      .when(Boolean(lspChip), (e) => e.child(lspChip))
      .child(iconButton("cn-find", "search", T("Find (Cmd+F)"), (_e, cx) => { this.finding = !this.finding; if (this.finding) this.find.focus(); else this.focus.focus(); cx.notify(); }, { color: this.finding ? t.accent : undefined }))
      .child(iconButton("cn-outline", "layers", T("Outline (Cmd+Shift+O)"), (_e, cx) => { this.outline = !this.outline; cx.notify(); }, { color: this.outline ? t.accent : undefined }))
      .child(iconButton("cn-edit", "pencil", T("Edit this file"), () => this.edit()))
      .child(iconButton("cn-vscode", "vscode", T("Open in VS Code"), () => this.openInVscode()));
  }

  // What the selected name is, problems on its line, and what can be done with it.
  infoBar(t) {
    const sel = this.sel;
    if (!sel && !this.note) return null;
    const diags = sel ? this.diags.filter((d) => d.line <= sel.line && sel.line <= d.end_line) : [];
    const md = this.hover?.markdown;
    const can = this.lspReady() && sel?.word;
    if (!md && !diags.length && !this.note && !can && !this.hover?.error && !(sel && this.rel())) return null;
    return v_flex().flex_none().max_h(220).border_t(1).border_color(t.border).bg(t.chrome)
      .child(h_flex().h(30).flex_none().px(10).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted)
          .child(this.note ?? (sel ? `${sel.word ? `${sel.word} · ` : ""}${T("Ln {line}, Col {col}", { line: sel.line + 1, col: sel.col + 1 })}` : "")))
        .when(Boolean(can), (e) => e.children([
          pill("cn-a-def", T("Definition"), T("F12 or Cmd+click"), (_e, cx) => this.definition(cx), t),
          pill("cn-a-type", T("Type"), T("Go to type definition"), (_e, cx) => this.definition(cx, "typeDefinition"), t),
          pill("cn-a-impl", T("Implementations"), "Cmd+F12", (_e, cx) => this.definition(cx, "implementation"), t),
          pill("cn-a-refs", T("References"), "Shift+F12", (_e, cx) => this.references(cx), t),
        ]))
        .when(Boolean(sel) && Boolean(this.rel()), (e) => e.child(pill("cn-a-comment", T("Comment"), T("Comment on this line (or click its line number)"), (_e, cx) => this.commentLines(sel.line, sel.line, cx), t)))
        .child(iconButton("cn-info-x", "x", T("Close (Esc)"), (_e, cx) => { this.sel = null; this.hover = null; this.note = null; cx.notify(); })))
      .when(diags.length > 0 || Boolean(md) || Boolean(this.hover?.error), (e) => e.child(div().id("cn-info").flex_1().min_h(0).overflow_y_scrollbar().px(12).pb(10)
        .children(diags.map((d, i) => h_flex().gap(6).items_start().py(2).text_size(12)
          .child(div().flex_none().text_color(d.severity === 1 ? t.ansi1 : t.ansi3).child(d.severity === 1 ? "✕" : "⚠"))
          .child(div().flex_1().min_w(0).child(`${d.message}${d.source ? `  (${d.source})` : ""}`))))
        .when(Boolean(md), (e) => e.child(TextView.markdown("cn-hover", md).selectable().text_size(12.5)))
        .when(Boolean(this.hover?.error), (e) => e.child(div().text_size(12).text_color(t.dim).child(this.hover.error)))));
  }

  refsPanel(t) {
    const r = this.refs;
    if (!r) return null;
    const items = r.items ?? [];
    const root = this.shown?.root;
    const where = (p) => root && p.startsWith(root + "/") ? p.slice(root.length + 1) : tilde(p);
    return v_flex().flex_none().h(220).border_t(1).border_color(t.border).bg(t.chrome)
      .child(sectionHeader(r.title, [iconButton("cn-refs-x", "x", T("Close (Esc)"), (_e, cx) => { this.refs = null; cx.notify(); })]))
      .child(r.items === null ? div().px(12).text_size(12).text_color(t.dim).child(T("Searching…"))
        : r.error ? div().px(12).text_size(12).text_color(t.ansi1).child(r.error)
        : div().flex_1().min_h(0).relative()
          .child(v_virtual_list("cn-refs", items.length, 22, (i) => String(i), (range) => items.slice(range.start, range.end).map((it) =>
            h_flex().h(22).w_full().px(12).gap(10).items_center().text_size(12).whitespace_nowrap()
              .child(div().flex_none().max_w(360).truncate().text_color(t.muted).child(`${where(it.path)}:${it.line + 1}`))
              .child(div().flex_1().min_w(0).truncate().font_family(settings().font_family ?? "JetBrains Mono").child(it.text ?? ""))))
            .size_full().on_item_click((k, cx) => { const it = items[+k]; if (it) this.open(it, cx); cx.notify(); }))
          .child(Scrollbar.vertical("cn-refs").absolute().inset_0()));
  }

  outlinePanel(t) {
    if (!this.outline || !this.symbols.length) return null;
    const current = this.sel ? this.scope(this.sel.line).pop() : null;
    return v_flex().w(240).flex_none().h_full().border_l(1).border_color(t.border).bg(t.chrome)
      .child(sectionHeader(T("Outline")))
      .child(div().id("cn-outline-list").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
        .children(this.symbols.filter((s) => s.kind !== "variable" || s.depth === 0).slice(0, 2000).map((s, i) =>
          h_flex().id(`cn-sym-${i}`).h(22).pl(10 + s.depth * 12).pr(8).gap(6).items_center().text_size(12).cursor_pointer()
            .when(current === s, (e) => e.bg(t.selected))
            .hover((e) => e.bg(t.hover))
            .on_click((_e, cx) => { const cur = this.here(); if (cur) this.back.push(cur); this.reveal(s.line + 1, s.col); this.hoverAt(cx); cx.notify(); })
            .child(div().w(14).flex_none().text_center().text_size(11).font_bold().text_color(kindColor(s.kind, t)).child(KIND[s.kind] ?? "·"))
            .child(div().flex_none().max_w(150).truncate().child(s.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(s.detail ?? "")))));
  }

  findBar(t) {
    if (!this.finding) return null;
    const q = this.findQuery ?? "";
    const count = q ? this.lines.reduce((n, l) => n + (l.split(q).length - 1), 0) : 0;
    return h_flex().h(34).flex_none().px(8).gap(6).items_center().border_b(1).border_color(t.border).bg(t.chrome)
      .child(div().w(260).child(Input.new(this.find)))
      .child(div().text_size(12).text_color(t.dim).child(q ? T("{n} found", { n: count }) : ""))
      .child(iconButton("cn-find-prev", "arrow-up", T("Previous (Shift+Enter)"), (_e, cx) => { this.findNext(-1); cx.notify(); }))
      .child(iconButton("cn-find-next", "arrow-down", T("Next (Enter)"), (_e, cx) => { this.findNext(1); cx.notify(); }))
      .child(div().flex_1())
      .child(iconButton("cn-find-x", "x", T("Close (Esc)"), (_e, cx) => { this.finding = false; this.focus.focus(); cx.notify(); }));
  }

  render(cx) {
    this.sync(cx);
    const t = theme(), s = this.shown, font = settings().font_family ?? "JetBrains Mono";
    const colors = syntaxColors(t);
    // The code font's advance, measured: columns come from where the pointer was.
    const measure = div().absolute().top(-100).left(0).font_family(font).text_size(FONT).whitespace_nowrap()
      .on_size_change((size, cx) => { const cw = size.width / 100; if (cw > 1 && Math.abs(cw - this.cw) > 0.01) { this.cw = cw; cx.notify(); } })
      .child("0".repeat(100));
    let body;
    if (!s) body = div().p(16).text_color(t.dim).child(T("Open a file from the Explorer or Search view."));
    else if (this.error) body = v_flex().p(16).gap(10).text_color(t.dim).child(this.error)
      .child(h_flex().child(pill("cn-astext", T("Open in the editor"), T("The activity editor and viewers"), () => this.edit(), t)));
    else if (this.loading && !this.lines.length) body = div().p(16).text_color(t.dim).child(T("Loading…"));
    const items = this.items();
    this.commented = new Set(this.fileComments().flatMap((c) => Array.from({ length: c.end - c.start + 1 }, (_, k) => c.start + k)));
    if (s && !this.error && !(this.loading && !this.lines.length)) body = h_flex().flex_1().min_h(0)
      .child(v_flex().flex_1().min_w(0).h_full()
        .child(div().flex_1().min_h(0).relative().font_family(font).text_size(FONT).bg(t.background)
          .child(div().id("cn-x").size_full().overflow_x_scrollbar()
            .child(div().id("cn-wide").min_w(this.gutter() + PAD + this.width * this.cw + 40).w_full().h_full()
              .on_mouse_down("left", (e, _cx) => { this.press = { x: e.local_position?.x ?? 0, mods: e.modifiers ?? {} }; })
              .child(v_virtual_list("cn-lines", items.length, items.map((it) => it.c ? this.commentHeight(it.c) : ROW),
                (i) => items[i].c ? `c:${items[i].c.id}` : String(items[i].line), (range) => {
                  const out = [];
                  for (let i = range.start; i < range.end; i++) out.push(items[i].c ? this.commentRow(items[i].c, t) : this.row(items[i].line, t, colors));
                  return out;
                }).size_full().track_scroll(this.scroll)
                .on_item_click((k, cx) => {
                  if (!k.startsWith("c:")) return this.click(+k, cx);
                  const c = this.fileComments().find((x) => x.id === k.slice(2));
                  if (c) this.editComment(c, cx);
                })
                .on_item_secondary_click((k, e, cx) => { if (k.startsWith("c:")) return; this.pick(+k, e.local_position?.x ?? 0, cx); this.hoverAt(cx); cx.notify(); }))))
          .child(Scrollbar.vertical("cn-lines").absolute().inset_0()))
        .child(this.composerPanel(t) ?? this.refsPanel(t) ?? this.infoBar(t) ?? div()))
      .child(this.outlinePanel(t) ?? div());
    return v_flex().id("codenav-code").size_full().min_h(0).relative().bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.focus).on_key_down((e, cx) => this.keyDown(e, cx))
      .child(measure)
      .child(this.header(t))
      .child(this.findBar(t) ?? div())
      .child(body);
  }
}

function chip(label, color, tip, action) {
  return div().id(`cn-chip-${label}`).flex_none().h(20).px(7).flex().items_center().rounded(10).text_size(11)
    .border_1().border_color(color + "66").text_color(color).bg(color + "14").tooltip(tip)
    .when(Boolean(action), (e) => e.cursor_pointer().on_click((_e, cx) => action(cx)))
    .child(label);
}

function pill(id, label, tip, action, t) {
  return div().id(id).flex_none().h(22).px(8).flex().items_center().rounded(5).text_size(11.5).cursor_pointer()
    .border_1().border_color(t.border).hover((e) => e.bg(t.hover)).tooltip(tip)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
    .child(label);
}

function kindColor(kind, t) {
  if (kind === "class" || kind === "struct" || kind === "interface" || kind === "enum") return t.ansi3;
  if (kind === "function" || kind === "method" || kind === "constructor") return t.ansi5;
  if (kind === "constant" || kind === "enum member") return t.ansi6;
  return t.ansi4;
}
