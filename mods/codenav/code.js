// The code view: a read-only, VS Code–like view of a source file with language
// server help. Click a name for its type and docs, Cmd+click (F12) to go to its
// definition, Shift+F12 for references, an outline of the file's symbols,
// diagnostics in the gutter and under the code (hover for the message), Cmd+F
// to find, Ctrl+- / Ctrl+Shift+- to go back and forward in the file's jumps,
// Cmd+[ / Cmd+] (and the header arrows) for the tabs shown before. "Edit" hands the file to the activity editor. Clicking a line
// number starts a comment (Shift+click for a range); comments join the
// repository's review comments (comments.js) and show inline. The gutter marks
// lines added, changed and removed since HEAD. Drag (or Shift+click) selects
// text; Cmd+C copies it, else the selected name, else the current line.
// Dragging over the line numbers comments on those lines. The rows are a
// Scroller's (scroller.js), so they take presses and drags.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { v_flex, h_flex, v_virtual_list, Scrollbar, TextView, InputState, Input } from "gpui-base";
import { readTextFile, watchFolder, theme, settings, run, exec, nextCommand, notify } from "herdr";
import { lsp } from "./lsp.js";
import { CommentBox, commentCard, commentHeight, commentsOf, repoKey } from "./comments.js";
import { Scroller } from "./scroller.js";
import { tabBack, tabForward, canStep } from "./tabs.js";
import {
  iconButton, button, editorKey, editorSpec, setEditorSpec, CHILD, STACK, hasArea, measureFont,
  syntaxColors, expandTabs, displayWidth, offsetAt, wordAt, tilde, sectionHeader, copyText,
} from "./common.js";

const ROW = 20;
const FONT = 13;
const PAD = 12;
const MAX_LINE = 2000;
const KIND = { class: "C", struct: "S", interface: "I", enum: "E", function: "ƒ", method: "m", constructor: "c", field: "f", property: "p", variable: "v", constant: "K", module: "M", namespace: "N", package: "P", "type parameter": "T", "enum member": "e" };

export default class CodeView {
  init(_p, cx) {
    this.lines = []; this.toks = null; this.diags = []; this.symbols = []; this.refs = null;
    this.cw = FONT * 0.6; this.outline = true;
    this.scroll = new Scroller();
    this.focus = cx.focus_handle();
    this.find = InputState.new({ placeholder: T("Find") });
    this.find.on("change", (_e, cx) => { this.findQuery = this.find.value(); this.findAt = -1; cx.notify(); });
    this.find.on("submit", (e, cx) => { this.findNext(e?.shift ? -1 : 1); cx.notify(); });
    this.sleep = (ms) => cx.sleep(ms);
    this.comment = new CommentBox();
    // pane.go gives this view the keyboard.
    cx.spawn(async (cx) => { for (;;) { if (await nextCommand() === "focus") this.focus.focus(); cx.notify(); } });
  }

  // Back / forward belong to the space whose editor this is.
  history() {
    const k = editorKey() ?? "";
    this.histories ??= {};
    return (this.histories[k] ??= { back: [], fwd: [] });
  }
  get back() { return this.history().back; }
  set back(v) { this.history().back = v; }
  get fwd() { return this.history().fwd; }
  set fwd(v) { this.history().fwd = v; }

  sync(cx) {
    const spec = editorSpec();
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
        if (!keepView) { this.comment.close(); this.selection = null; this.scroll.setTop(0); this.reveal(spec.line, spec.col); }
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
    setEditorSpec(editorKey(), { kind: "file", path, root, rel, on: spec?.on ?? null, line, col });
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
  rkey() { return this.repo ? repoKey(this.shown?.on, this.repo) : null; }
  rel() { const p = this.shown?.path ?? ""; return this.repo && p.startsWith(this.repo + "/") ? p.slice(this.repo.length + 1) : null; }
  fileComments() { const rel = this.rel(); return rel ? commentsOf(this.rkey()).filter((c) => c.path === rel && c.side !== "old") : []; }

  // Lines and the comments under them, as the list shows them.
  // Kept until the file's lines or its comments change: renders come often.
  items() {
    const comments = this.fileComments();
    const key = JSON.stringify(comments.map((c) => [c.id, c.end, c.body]));
    if (this.itemsCache?.lines === this.lines && this.itemsCache.key === key) return this.itemsCache.items;
    const after = new Map();
    for (const c of comments) {
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
    this.scroll.setHeights(items.map((it) => it.c ? commentHeight(it.c) : ROW));
    this.itemIndex = index;
    this.itemsCache = { lines: this.lines, key, items };
    return items;
  }

  scrollTo(line, how) { this.scroll.scrollTo(this.itemIndex?.[line] ?? line, how); }

  // Lines from..to (0-based) get a comment box.
  commentLines(from, to, cx, quote) {
    if (!this.rel()) { this.note = T("Comments need a file inside a git repository"); cx.notify(); return; }
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const code = (quote ?? this.lines.slice(lo, hi + 1)).slice(0, 30).map((l) => `  ${l}`);
    this.comment.open({ path: this.rel(), side: "new", start: lo + 1, end: hi + 1, code, kind: "file" });
    cx.notify();
  }
  // The selected text's lines, quoting just the selected part; else the name's line.
  commentSelection(cx) {
    const r = this.span();
    if (r) this.commentLines(r[0].line, r[1].line, cx, this.selectedText().split("\n"));
    else if (this.sel) this.commentLines(this.sel.line, this.sel.line, cx);
  }

  // -- pointer on the code ----------------------------------------------------------------
  pointAt(line, x) {
    const text = this.lines[line] ?? "";
    return { line, col: offsetAt(text, Math.max(0, Math.floor((x - this.gutter() - PAD) / this.cw))) };
  }
  // The selection from its earlier end to its later one, or null when empty.
  span() {
    const r = this.selection;
    if (!r) return null;
    const [a, b] = r.a.line < r.b.line || (r.a.line === r.b.line && r.a.col <= r.b.col) ? [r.a, r.b] : [r.b, r.a];
    return a.line === b.line && a.col === b.col ? null : [a, b];
  }

  press(line, e, cx) {
    const x = e.local_position?.x ?? 0, mods = e.modifiers ?? {};
    this.focus.focus();
    // The line numbers start a comment; Shift extends it from the last one.
    if (x < this.gutter()) {
      if (!(mods.shift && this.commentAnchor !== undefined)) this.commentAnchor = line;
      this.commentLines(this.commentAnchor, line, cx);
      this.gutterDrag = { to: line };
      return;
    }
    const p = this.pointAt(line, x);
    if (mods.shift && (this.selection || this.sel)) {
      this.selection = { a: this.selection?.a ?? { line: this.sel.line, col: this.sel.col }, b: p };
      cx.notify();
      return;
    }
    this.dragging = { a: p, x, mods, moved: false };
  }

  dragTo(line, e, cx) {
    const g = this.gutterDrag;
    if (g && g.to !== line) { g.to = line; this.commentLines(this.commentAnchor, line, cx); return; }
    const d = this.dragging;
    if (!d) return;
    const p = this.pointAt(line, e.local_position?.x ?? 0), b = this.selection?.b;
    if (!d.moved && p.line === d.a.line && p.col === d.a.col) return;
    if (d.moved && b && b.line === p.line && b.col === p.col) return;
    d.moved = true;
    this.selection = { a: d.a, b: p };
    cx.notify();
  }

  // Without a drag the press was a click: the name under it, its definition with Cmd.
  release(line, cx) {
    const d = this.dragging;
    this.dragging = null; this.gutterDrag = null;
    if (!d || d.moved) return;
    this.selection = null;
    this.pick(line, d.x, cx);
    if (d.mods.platform || d.mods.control) this.definition(cx);
    else this.hoverAt(cx);
    cx.notify();
  }

  selectedText() {
    const r = this.span();
    return r ? this.lines.slice(r[0].line, r[1].line + 1).map((l, k, all) =>
      l.slice(k === 0 ? r[0].col : 0, k === all.length - 1 ? r[1].col : l.length)).join("\n") : null;
  }

  // What Cmd+C takes: the selected text, else the selected name, else the current line.
  copy() {
    const r = this.span(), sel = this.sel;
    if (!r && !sel) return;
    const text = r ? this.selectedText() : sel.word?.trim() ? sel.word : this.lines[sel.line] ?? "";
    const what = r ? T("the selection") : sel.word?.trim() ? sel.word : T("the line");
    copyText(text).then(() => notify({ title: T("Copied {what}", { what }), level: "success", timeout: 1500 }))
      .catch((e) => notify({ title: String(e.message ?? e), level: "error", timeout: 3000 }));
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
    setEditorSpec(editorKey(), { ...s, edit: true, line: (this.sel?.line ?? 0) + 1 });
    if (hasArea()) run("layout.select", { stack: STACK, child: CHILD.text });
  }

  openInVscode() {
    const s = this.shown;
    if (!s || s.on) return run("mod.open", { name: "open-vscode" });
    exec("code", ["-g", `${s.path}:${(this.sel?.line ?? 0) + 1}:${(this.sel?.col ?? 0) + 1}`]).catch(() => {});
  }

  keyDown(e, cx) {
    const k = e.keystroke;
    if (this.comment.typing || this.finding && k !== "escape") {
      // Typing a comment (or a search): only its own keys.
      if (!(this.comment.typing && this.comment.key(e, this.rkey()))) return;
      if (!this.comment.draft) this.focus.focus();
      cx.stop_propagation(); cx.notify(); return;
    }
    if (k === "f12" || k === "cmd-b") this.definition(cx);
    else if (k === "shift-f12" || k === "alt-shift-f12") this.references(cx);
    else if (k === "cmd-f12") this.definition(cx, "implementation");
    else if (k === "cmd-f" || k === "ctrl-f") { this.finding = true; this.find.focus(); }
    else if (k === "cmd-shift-o") this.outline = !this.outline;
    else if (k === "cmd-c" || k === "ctrl-c") this.copy();
    else if (k === "cmd-[") tabBack();
    else if (k === "cmd-]") tabForward();
    else if (k === "ctrl--" || k === "alt-left") this.goBack(cx);
    else if (k === "ctrl-shift--" || k === "ctrl-_" || k === "alt-right") this.goForward(cx);
    else if (k === "escape") { this.refs = null; this.hover = null; this.selection = null; this.finding = false; this.focus.focus(); }
    else if (k === "pageup" || k === "pagedown") this.scroll.page(k === "pageup" ? -1 : 1);
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
    // Blank selections mark nothing (every space would light up).
    const word = this.sel?.word?.trim() ? this.sel.word : null;
    if (word) {
      const isWord = /^[\p{L}\p{N}_$]+$/u.test(word);
      for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
        const before = text[at - 1], after = text[at + word.length];
        if (isWord && ((before && /[\p{L}\p{N}_$]/u.test(before)) || (after && /[\p{L}\p{N}_$]/u.test(after)))) continue;
        marks.push([at, at + word.length, this.sel.line === i && at === this.sel.start ? "sel" : "use"]);
        cuts.add(at); cuts.add(at + word.length);
      }
    }
    const span = this.span();
    if (span && span[0].line <= i && i <= span[1].line) {
      const a = i === span[0].line ? Math.min(span[0].col, text.length) : 0, b = i === span[1].line ? Math.min(span[1].col, text.length) : text.length;
      if (b > a) { marks.push([a, b, "range"]); cuts.add(a); cuts.add(b); }
    }
    const diags = this.diags.filter((d) => d.line <= i && i <= d.end_line);
    for (const d of diags) {
      const s = d.line === i ? Math.min(d.col, text.length) : 0, e = d.end_line === i ? Math.min(d.end_col, text.length) : text.length;
      marks.push([s, Math.max(e, s), d.severity === 1 ? "error" : "warning", d]);
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
      const problems = [];
      for (const [s, e, kind, d] of marks) {
        if (s > a || e < b) continue;
        if (d) problems.push(d);
        if (kind === "range") el = el.bg(t.selection);
        else if (kind === "sel") el = el.bg(t.accent + "55").rounded(2);
        else if (kind === "use") el = el.bg(t.selection + "66").rounded(2);
        else el = el.border_b(1).border_color(kind === "error" ? t.ansi1 : t.ansi3);
      }
      if (problems.length) el = el.id(`cn-d-${i}-${a}`).tooltip(problemText(problems));
      children.push(el);
    }
    const worst = diags.length ? Math.min(...diags.map((d) => d.severity ?? 1)) : 0;
    const current = this.sel?.line === i;
    const c = this.comment.draft, picked = c && c.path === this.rel() && i + 1 >= c.start && i + 1 <= c.end;
    return h_flex().h(ROW).w_full().flex_none().whitespace_nowrap()
      .when(current, (e) => e.bg(t.hover))
      .when(this.flash === i && !current, (e) => e.bg(t.accent + "22"))
      .when(Boolean(picked), (e) => e.bg(t.accent + "33"))
      .child(h_flex().w(this.gutter()).h_full().flex_none().items_center().pr(12).cursor_pointer()
        .child(this.changeMark(i, t))
        .child(div().w(3).h_full().flex_none().when(Boolean(picked) || this.commented?.has(i + 1), (e) => e.bg(picked ? t.accent : t.accent + "88")))
        .child(div().w(18).flex_none().flex().justify_center()
          .when(worst > 0, (e) => e.id(`cn-dg-${i}`).tooltip(problemText(diags)).child(div().size(7).rounded_full().bg(worst === 1 ? t.ansi1 : worst === 2 ? t.ansi3 : t.ansi4))))
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
      .child(iconButton("cn-back", "chevron-left", T("Previous tab (Cmd+[)"), () => tabBack(), { color: canStep(-1) ? t.muted : t.dim }))
      .child(iconButton("cn-fwd", "chevron-right", T("Next tab (Cmd+])"), () => tabForward(), { color: canStep(1) ? t.muted : t.dim }))
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
    const sel = this.sel, r = this.span();
    if (!sel && !r && !this.note) return null;
    const diags = sel ? this.diags.filter((d) => d.line <= sel.line && sel.line <= d.end_line) : [];
    const md = this.hover?.markdown;
    const can = this.lspReady() && sel?.word;
    return v_flex().flex_none().max_h(220).border_t(1).border_color(t.border).bg(t.chrome)
      .child(h_flex().h(30).flex_none().px(10).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted)
          .child(this.note ?? (r ? T("Lines {from}-{to} selected", { from: r[0].line + 1, to: r[1].line + 1 })
            : sel ? `${sel.word?.trim() ? `${sel.word} · ` : ""}${T("Ln {line}, Col {col}", { line: sel.line + 1, col: sel.col + 1 })}` : "")))
        .when(Boolean(can) && !r, (e) => e.children([
          button("cn-a-def", T("Definition"), (_e, cx) => this.definition(cx), { tip: T("F12 or Cmd+click") }),
          button("cn-a-type", T("Type"), (_e, cx) => this.definition(cx, "typeDefinition"), { tip: T("Go to type definition") }),
          button("cn-a-impl", T("Implementations"), (_e, cx) => this.definition(cx, "implementation"), { tip: "Cmd+F12" }),
          button("cn-a-refs", T("References"), (_e, cx) => this.references(cx), { tip: "Shift+F12" }),
        ]))
        .when(Boolean(sel || r), (e) => e.child(button("cn-a-copy", T("Copy"), () => this.copy(), { tip: "Cmd+C" })))
        .when(Boolean(sel || r) && Boolean(this.rel()), (e) => e.child(button("cn-a-comment", T("Comment"), (_e, cx) => this.commentSelection(cx), { tip: T("Comment on the selected lines (or drag over their line numbers)") })))
        .child(iconButton("cn-info-x", "x", T("Close (Esc)"), (_e, cx) => { this.sel = null; this.selection = null; this.hover = null; this.note = null; cx.notify(); })))
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
    // Counted again only when the query or the file changes.
    if (this.findCount?.q !== q || this.findCount.lines !== this.lines)
      this.findCount = { q, lines: this.lines, n: q ? this.lines.reduce((n, l) => n + (l.split(q).length - 1), 0) : 0 };
    const count = this.findCount.n;
    return h_flex().h(34).flex_none().px(8).gap(6).items_center().border_b(1).border_color(t.border).bg(t.chrome)
      .child(div().w(260).child(Input.new(this.find)))
      .child(div().text_size(12).text_color(t.dim).child(q ? T("{n} found", { n: count }) : ""))
      .child(iconButton("cn-find-prev", "arrow-up", T("Previous (Shift+Enter)"), (_e, cx) => { this.findNext(-1); cx.notify(); }))
      .child(iconButton("cn-find-next", "arrow-down", T("Next (Enter)"), (_e, cx) => { this.findNext(1); cx.notify(); }))
      .child(div().flex_1())
      .child(iconButton("cn-find-x", "x", T("Close (Esc)"), (_e, cx) => { this.finding = false; this.focus.focus(); cx.notify(); }));
  }

  // An item on screen: a line that takes presses and drags, or a comment under it.
  item(it, t, colors) {
    if (it.c) return commentCard(t, it.c, { pl: this.gutter() + PAD }).id(`cn-c-${it.c.id}`).cursor_pointer()
      .on_mouse_down("left", (_e, cx) => { this.comment.edit(it.c); cx.notify(); });
    const i = it.line;
    return this.row(i, t, colors).id(`cn-l-${i}`).cursor_text()
      .on_mouse_down("left", (e, cx) => this.press(i, e, cx))
      .on_mouse_move((e, cx) => this.dragTo(i, e, cx))
      .on_mouse_up("left", (_e, cx) => this.release(i, cx))
      .on_mouse_down("right", (e, cx) => { this.pick(i, e.local_position?.x ?? 0, cx); this.hoverAt(cx); cx.notify(); });
  }

  render(cx) {
    this.sync(cx);
    const t = theme(), s = this.shown, font = settings().font_family ?? "JetBrains Mono";
    const colors = syntaxColors(t);
    const measure = measureFont(this, font, FONT);
    let body;
    if (!s) body = div().p(16).text_color(t.dim).child(T("Open a file from the Explorer or Search view."));
    else if (this.error) body = v_flex().p(16).gap(10).text_color(t.dim).child(this.error)
      .child(h_flex().child(button("cn-astext", T("Open in the editor"), () => this.edit(), { tip: T("The activity editor and viewers") })));
    else if (this.loading && !this.lines.length) body = div().p(16).text_color(t.dim).child(T("Loading…"));
    const items = this.items();
    this.commented = new Set(this.fileComments().flatMap((c) => Array.from({ length: c.end - c.start + 1 }, (_, k) => c.start + k)));
    if (s && !this.error && !(this.loading && !this.lines.length)) body = h_flex().flex_1().min_h(0)
      .child(v_flex().flex_1().min_w(0).h_full()
        .child(div().flex_1().min_h(0).flex().font_family(font).text_size(FONT).bg(t.background)
          .child(this.scroll.view("cn-view", t, this.gutter() + PAD + this.width * this.cw + 40, (k) => this.item(items[k], t, colors),
            () => { this.dragging = null; this.gutterDrag = null; })))
        .child(this.comment.panel(t, this.rkey(), (cx) => cx.notify(), T("Comments go to the Review list, sent to the agent together")) ?? this.refsPanel(t) ?? this.infoBar(t) ?? div()))
      .child(this.outlinePanel(t) ?? div());
    return v_flex().id("codenav-code").size_full().min_h(0).relative().bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.focus).on_key_down((e, cx) => this.keyDown(e, cx))
      .child(measure)
      .child(this.header(t))
      .child(this.findBar(t) ?? div())
      .child(body);
  }
}

// What a hover over a problem says: each message with its kind and source.
function problemText(diags) {
  return diags.map((d) => `${d.severity === 1 ? T("Error") : d.severity === 2 ? T("Warning") : T("Info")}: ${d.message}${d.source ? `  (${d.source})` : ""}`).join("\n");
}

function chip(label, color, tip, action) {
  return div().id(`cn-chip-${label}`).flex_none().h(20).px(7).flex().items_center().rounded(10).text_size(11)
    .border_1().border_color(color + "66").text_color(color).bg(color + "14").tooltip(tip)
    .when(Boolean(action), (e) => e.cursor_pointer().on_click((_e, cx) => action(cx)))
    .child(label);
}

function kindColor(kind, t) {
  if (kind === "class" || kind === "struct" || kind === "interface" || kind === "enum") return t.ansi3;
  if (kind === "function" || kind === "method" || kind === "constructor") return t.ansi5;
  if (kind === "constant" || kind === "enum member") return t.ansi6;
  return t.ansi4;
}
