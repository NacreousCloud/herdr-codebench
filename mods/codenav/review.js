// Branch review: what changed since the merge base with a chosen branch
// (committed, staged, unstaged and untracked work, or committed only), file by
// file. Click a line number to comment (drag over them, or Shift+click, for a range); comments are
// kept per repository and go to a terminal's input as one message: pasted for
// the person to edit and send, or sent with Enter.
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { Scroller } from "./scroller.js";
import { openEverywhere } from "./everywhere.js";
import { lsp } from "./lsp.js";
import { CommentBox, commentCard, commentHeight, commentsOf, repoKey, repoStore, saveRepo } from "./comments.js";
import { exec, hc, readTextFile, theme, settings, shared, setShared, run, notify, watchFolder, spaces } from "herdr";
import {
  icon, iconButton, button, sectionHeader, location, targets, setEditorSpec, editorKey, showEditor, showReview,
  expandTabs, basename, ext, colorize, syntaxColors, offsetAt, wordAt, openPath, measureFont, copyText, emptyEditor, doubleShift, codeFont, islandBottom
 } from "./common.js";

const SEP = "\n@@CODENAV@@\n";
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "core.quotePath=false"];
const G = READ.join(" ");
const MAX_ROWS = 20000;
// Where the line numbers end in a diff row (bar 3, two numbers 44, gaps 8).
const GUTTER = 111;
// Where a row's code starts (after both numbers and the +/- sign).
const TEXT_X = 135;

// Repository, branch, branches and the remote's default branch, in one round trip.
const REPO = `cd "$1" 2>/dev/null || { echo "No such folder: $1" >&2; exit 2; }
top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Not a git repository" >&2; exit 3; }
cd "$top" || exit 2
s='${SEP.replace(/\n/g, "\\n")}'
printf '%s' "$top"; printf "$s"
git ${G} rev-parse --abbrev-ref HEAD 2>/dev/null; printf "$s"
git ${G} for-each-ref --format='%(refname)%09%(refname:short)%09%(upstream:short)%09%(upstream:track,nobracket)' refs/heads refs/remotes 2>/dev/null; printf "$s"
git ${G} symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null; true`;

// Changed files against the merge base: $2 base, $3 the compared ref (a branch,
// HEAD for committed only), or empty for the working tree with untracked files.
const FILES = `cd "$1" || exit 2
s='${SEP.replace(/\n/g, "\\n")}'
mb=$(git ${G} merge-base "$2" "\${3:-HEAD}" 2>/dev/null) || { echo "No common history between $2 and \${3:-HEAD}" >&2; exit 5; }
printf '%s' "$mb"; printf "$s"
git ${G} diff --no-color --no-ext-diff --no-renames --name-status $mb \${3:+"$3"}; printf "$s"
git ${G} diff --no-color --no-ext-diff --no-renames --numstat $mb \${3:+"$3"}; printf "$s"
[ -n "$3" ] || git ${G} ls-files --others --exclude-standard; true`;

const LANG = { ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", py: "python", rs: "rust", go: "go", kt: "kotlin", kts: "kotlin", java: "java", swift: "swift", md: "md", json: "json", yml: "yaml", yaml: "yaml", sh: "sh" };

function diffRows(lines) {
  let old = 0, next = 0;
  const rows = [];
  for (const line of lines) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(line);
    if (m) { old = +m[1]; next = +m[2]; rows.push({ kind: "@", text: line, ctx: m[3].trim() }); continue; }
    const k = line[0];
    if (k === "-") rows.push({ kind: "-", a: old++, text: line.slice(1) });
    else if (k === "+") rows.push({ kind: "+", b: next++, text: line.slice(1) });
    else if (k === " ") rows.push({ kind: " ", a: old++, b: next++, text: line.slice(1) });
    else if (k === "\\") continue;
  }
  return rows;
}

// The line a diff row stands for: new side unless it was removed.
const sideOf = (r) => r.kind === "-" ? "old" : "new";
const lineOf = (r) => r.kind === "-" ? r.a : r.b;

export default class Review {
  init(p, cx) {
    // full: both halves (a tab of its own); side: the sidebar half (Explorer's
    // place); main: the diff half (the editor area). Halves share the repo's store.
    this.part = p?.part ?? "full";
    this.focus = cx.focus_handle();
    this.files = []; this.rows = []; this.branches = []; this.mode = "worktree"; this.full = false;
    this.scroll = new Scroller();
    this.filter = InputState.new({ placeholder: T("Filter branches") });
    this.filter.on("change", (_e, cx) => cx.notify());
    this.comment = new CommentBox();
    cx.timer.every(5000, (cx) => { if (this.on) this.refresh(cx, true); });
  }

  // -- repository ------------------------------------------------------------
  rkey() { return repoKey(this.on, this.root); }
  store() { return repoStore(this.rkey()); }
  comments() { return commentsOf(this.rkey()); }
  save(patch) { saveRepo(this.rkey(), patch); }

  sh(script, args) { return exec("sh", ["-c", script, "sh", ...args], { on: this.on }); }
  git(args) { return exec("git", [...READ, ...args], { cwd: this.root, on: this.on }); }

  // The compared side: a chosen branch, else the current checkout (HEAD when committed only).
  to() { return this.head ?? (this.mode === "head" ? "HEAD" : null); }
  headName() { return this.head ?? this.branch; }
  committedOnly() { return Boolean(this.head) || this.mode === "head"; }

  refresh(cx, quiet = false) {
    const { cwd, on } = location();
    const context = `${on ?? ""}:${cwd}`;
    if (!cwd || this.loading) return;
    // The focused folder moves often (an agent's commands): what shows stays
    // until the answer names another repository, so nothing blinks.
    this.context = context;
    this.loading = true; if (!quiet && !this.root) cx.notify();
    const clear = () => {
      Object.assign(this, { root: null, repoKey: null, branch: null, base: null, head: null, refs: [], branches: [], mergeBase: null,
        files: [], rows: [], selected: null, cur: null, anchor: null, picking: null, error: null, note: null });
      this.comment.close();
    };
    cx.spawn(async (cx) => {
      try {
        const r = await this.sh(REPO, [cwd]);
        // Not a repository: nothing of the last one may show here.
        this.notRepo = r.code === 3;
        if (r.code !== 0) { clear(); this.error = r.code === 3 ? T("Not a git repository") : r.stderr.trim() || T("Cannot read this folder"); return; }
        const [top, branch, refs, originHead] = r.stdout.split(SEP);
        const repoKey = `${on ?? ""}:${top.trim()}`;
        if (repoKey !== this.repoKey) { clear(); this.repoKey = repoKey; }
        this.root = top.trim(); this.on = on; this.branch = branch.trim();
        // Local branches (with what they track), then each remote's branches.
        this.refs = refs.split("\n").filter(Boolean).map((l) => {
          const [full, name, upstream, track] = l.split("\t");
          const remote = full.startsWith("refs/remotes/") ? full.split("/")[2] : null;
          return { name, remote, upstream: upstream || null, track: track || "" };
        }).filter((r) => r.name && !r.name.endsWith("/HEAD") && r.name !== r.remote);
        this.branches = this.refs.map((r) => r.name);
        const has = (b) => this.branches.includes(b);
        this.mode = this.store().mode ?? "worktree";
        this.selected = this.store().selected ?? null;
        this.head = has(this.store().head) && this.store().head !== this.branch ? this.store().head : null;
        this.base = [this.store().base, originHead.trim(), "origin/main", "main", "origin/master", "master", "origin/develop", "develop"].find((b) => b && has(b) && b !== this.headName())
          ?? this.branches.find((b) => b !== this.headName()) ?? null;
        this.error = this.base ? null : T("No other branch to compare with");
        if (this.base) await this.loadFiles(cx);
        this.watch(cx);
      } catch (e) { this.error = String(e.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async loadFiles(cx) {
    const r = await this.sh(FILES, [this.root, this.base, this.to() ?? ""]);
    if (r.code !== 0) { this.error = r.stderr.trim(); this.files = []; return; }
    const [mb, names, nums, untracked] = r.stdout.split(SEP);
    this.mergeBase = mb.trim();
    const stats = new Map();
    for (const l of nums.split("\n").filter(Boolean)) { const [a, d, ...p] = l.split("\t"); stats.set(p.join("\t"), { add: a === "-" ? null : +a, del: d === "-" ? null : +d }); }
    const files = names.split("\n").filter(Boolean).map((l) => { const [st, ...p] = l.split("\t"); const path = p.join("\t"); return { path, status: st[0], ...(stats.get(path) ?? {}) }; });
    for (const p of (untracked ?? "").split("\n").filter(Boolean)) files.push({ path: p, status: "U", untracked: true, add: null, del: 0 });
    files.sort((a, b) => a.path.localeCompare(b.path));
    const before = JSON.stringify(this.files);
    this.files = files;
    this.error = null;
    if (!this.selected || !files.some((f) => f.path === this.selected)) this.selected = files[0]?.path ?? null;
    if (JSON.stringify(files) !== before || !this.rows.length) await this.loadDiff(cx);
  }

  async loadDiff(cx) {
    const file = this.files.find((f) => f.path === this.selected);
    const seq = (this.diffSeq = (this.diffSeq ?? 0) + 1);
    if (!file) { this.rows = []; return; }
    let lines;
    if (file.untracked) {
      const text = await readTextFile(`${this.root}/${file.path}`, { on: this.on }).catch(() => null);
      if (text === null || text.includes("\0")) lines = [];
      else { const body = text.replace(/\n$/, "").split("\n"); lines = [`@@ -0,0 +1,${body.length} @@ new file`, ...body.map((l) => `+${l}`)]; }
    } else {
      const r = await this.git(["diff", "--no-color", "--no-ext-diff", "--no-renames", `-U${this.full ? 100000 : 3}`, this.mergeBase, ...(this.to() ? [this.to()] : []), "--", file.path]);
      lines = r.stdout.split("\n");
      const first = lines.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [] : lines.slice(first);
    }
    if (seq !== this.diffSeq) return;
    this.rows = diffRows(lines.slice(0, MAX_ROWS));
    this.binary = !this.rows.length;
    this.width = Math.max(400, ...this.rows.slice(0, 5000).map((r) => expandTabs(r.text).length * 7.8 + 120));
    this.lspSel = null; this.newToks = null; this.oldToks = null;
    // The new side is the file on disk only against the working tree, on this computer.
    this.lspOk = !this.on && !this.to() && file.status !== "D";
    cx.notify();
    if (!this.binary) this.loadColors(file, seq, cx);
  }

  // Syntax colors: the new side from the file as it is, removed lines from the merge base.
  loadColors(file, seq, cx) {
    const abs = `${this.root}/${file.path}`, sleep = (ms) => cx.sleep(ms);
    cx.spawn(async (cx) => {
      const colors = async (text) => lsp("tokens", text === undefined ? { path: abs } : { path: abs, text }, sleep).catch(() => null);
      if (file.status !== "D") {
        const toks = this.on ? await colors(await readTextFile(abs, { on: this.on }).catch(() => "") ?? "") : await colors();
        if (seq !== this.diffSeq) return;
        this.newToks = toks; cx.notify();
      }
      if (!file.untracked && file.status !== "A") {
        const r = await this.git(["show", `${this.mergeBase}:${file.path}`]).catch(() => null);
        if (r?.code !== 0 || seq !== this.diffSeq) return;
        this.oldToks = await colors(r.stdout);
        if (seq === this.diffSeq) cx.notify();
      }
    });
  }

  // -- language server on the new side ---------------------------------------------
  absPath() { return `${this.root}/${this.selected}`; }

  pickWord(item, x, mods, cx) {
    const r = item.r;
    if (!this.lspOk || r.b === undefined || x < TEXT_X) { this.lspSel = null; return; }
    const col = offsetAt(r.text, Math.max(0, Math.floor((x - TEXT_X) / (this.cw ?? codeFont().size * 0.6))));
    const w = wordAt(r.text, col);
    if (!w) { this.lspSel = null; return; }
    this.lspSel = { i: item.i, line: r.b - 1, col: w.start, word: w.word, hover: null, refs: null };
    if (mods?.platform || mods?.control) this.lspDefinition(cx);
    else this.lspHover(cx);
  }

  lspArgs() { return { path: this.absPath(), line: this.lspSel.line, col: this.lspSel.col }; }

  lspHover(cx) {
    const sel = this.lspSel;
    cx.spawn(async (cx) => {
      const r = await lsp("hover", this.lspArgs(), (ms) => cx.sleep(ms)).catch((e) => ({ error: String(e.message ?? e) }));
      if (this.lspSel === sel) { sel.hover = r; cx.notify(); }
    });
  }

  // The definition opens in the code view.
  lspDefinition(cx) {
    const sel = this.lspSel;
    sel.note = T("Looking for the definition…"); cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await lsp("definition", this.lspArgs(), (ms) => cx.sleep(ms));
        if (this.lspSel !== sel) return;
        if (!r.length) sel.note = T("No {kind} found for {word}", { kind: T("definition"), word: sel.word });
        else openPath(`${r[0].path}:${r[0].line + 1}:${r[0].col + 1}`);
      } catch (e) { sel.note = String(e.message ?? e); }
      cx.notify();
    });
  }

  lspReferences(cx) {
    const sel = this.lspSel;
    sel.refs = []; sel.note = T("Searching…"); cx.notify();
    cx.spawn(async (cx) => {
      try {
        const items = await lsp("references", this.lspArgs(), (ms) => cx.sleep(ms));
        if (this.lspSel !== sel) return;
        sel.refs = items; sel.note = T("{n} references to {word}", { n: items.length, word: sel.word });
      } catch (e) { sel.note = String(e.message ?? e); }
      cx.notify();
    });
  }

  lspPanel(t) {
    const sel = this.lspSel;
    if (!sel) return null;
    const where = (p) => p.startsWith(this.root + "/") ? p.slice(this.root.length + 1) : p;
    const md = sel.hover?.markdown;
    return v_flex().flex_none().max_h(240).border_t(1).border_color(t.border).bg(t.chrome)
      .child(h_flex().h(30).flex_none().px(10).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(sel.note ?? `${sel.word} · ${T("Ln {line}, Col {col}", { line: sel.line + 1, col: sel.col + 1 })}`))
        .child(button("rv-l-def", T("Definition"), (_e, cx) => this.lspDefinition(cx), { tip: T("F12 or Cmd+click") }))
        .child(button("rv-l-refs", T("References"), (_e, cx) => this.lspReferences(cx)))
        .child(iconButton("rv-l-x", "x", T("Close (Esc)"), (_e, cx) => { this.lspSel = null; cx.notify(); })))
      .child(div().id("rv-l-body").flex_1().min_h(0).overflow_y_scrollbar().px(12).pb(8)
        .when(Boolean(sel.refs?.length), (e) => e.children(sel.refs.slice(0, 200).map((it, k) =>
          h_flex().id(`rv-l-r-${k}`).h(22).gap(10).items_center().text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click(() => openPath(`${it.path}:${it.line + 1}:${it.col + 1}`))
            .child(div().flex_none().max_w(360).truncate().text_color(t.muted).child(`${where(it.path)}:${it.line + 1}`))
            .child(div().flex_1().min_w(0).truncate().font_family(codeFont().family).child(it.text ?? "")))))
        .when(!sel.refs?.length && Boolean(md), (e) => e.child(TextView.markdown("rv-l-hover", md).selectable().text_size(12.5)))
        .when(!sel.refs?.length && Boolean(sel.hover?.error), (e) => e.child(div().text_size(12).text_color(t.dim).child(sel.hover.error))));
  }

  watch(cx) {
    if (this.on || this.watched === this.root) return;
    const root = (this.watched = this.root);
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          const changed = await watchFolder(root);
          if (this.watched !== root) break;
          if (changed.some((p) => !p.includes("/.git/") || /\/\.git\/(HEAD|refs\/)/.test(p))) this.refresh(cx, true);
        }
      } catch { if (this.watched === root) this.watched = null; }
    });
  }

  select(path, cx) {
    if (this.store().selected !== path) this.save({ selected: path });
    if (this.part === "side") showReview();
    if (this.selected === path) return;
    this.selected = path; this.rows = []; this.anchor = null; this.cur = null;
    if (this.comment.draft && this.comment.draft.path !== path) this.comment.close();
    this.scroll.setTop(0);
    cx.spawn(async (cx) => { await this.loadDiff(cx); cx.notify(); });
  }

  // Updates the remote branches; the list and the diff follow.
  fetch(cx) {
    if (this.fetching || !this.root) return;
    this.fetching = true; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("git", ["fetch", "--all", "--prune", "--quiet"], { cwd: this.root, on: this.on });
        this.note = r.code === 0 ? null : (r.stderr || r.stdout).trim();
      } catch (e) { this.note = String(e.message ?? e); }
      finally { this.fetching = false; this.refresh(cx, true); cx.notify(); }
    });
  }

  pick(side, cx) {
    this.picking = this.picking === side ? null : side;
    this.filter.set_value("");
    if (this.picking) this.filter.focus();
    cx.notify();
  }

  // Choosing the branch the other side has swaps the two sides.
  setHead(head, cx) {
    const base = head && head === this.base ? this.headName() : this.base;
    this.setSides(base, head, cx);
  }

  setBase(base, cx) {
    const head = base === this.headName() ? this.base : this.head;
    this.setSides(base, head, cx);
  }

  swap(cx) { this.setSides(this.headName(), this.base, cx); }

  // head: a branch, or null for the current checkout (the working tree).
  setSides(base, head, cx) {
    this.base = base; this.head = head && head !== this.branch ? head : null;
    this.picking = null; this.selected = null; this.rows = [];
    this.save({ base, head: this.head });
    cx.spawn(async (cx) => { this.loading = true; try { await this.loadFiles(cx); } finally { this.loading = false; cx.notify(); } });
  }

  setMode(mode, cx) {
    if (this.mode === mode) return;
    this.mode = mode; this.rows = [];
    this.save({ mode });
    cx.spawn(async (cx) => { this.loading = true; try { await this.loadFiles(cx); } finally { this.loading = false; cx.notify(); } });
  }

  // The other half changed the base, the compared branch, the mode or the file.
  syncStore(cx) {
    if (!this.root || this.loading || this.syncing) return;
    const st = this.store();
    const want = { base: st.base ?? this.base, head: st.head ?? null, mode: st.mode ?? "worktree" };
    if (want.base !== this.base || want.head !== this.head || want.mode !== this.mode) {
      Object.assign(this, want); this.rows = []; this.selected = st.selected ?? null; this.syncing = true;
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => { this.loading = true; try { await this.loadFiles(cx); } finally { this.loading = false; this.syncing = false; cx.notify(); } }));
    } else if (st.selected && st.selected !== this.selected && this.files.some((f) => f.path === st.selected)) {
      this.selected = st.selected; this.rows = []; this.anchor = null; this.syncing = true;
      if (this.comment.draft && this.comment.draft.path !== st.selected) this.comment.close();
      cx.timer.after(0, (cx) => cx.spawn(async (cx) => { try { this.scroll.setTop(0); await this.loadDiff(cx); } finally { this.syncing = false; cx.notify(); } }));
    } else if (this.part !== "side" && st.editing) {
      const c = this.comments().find((x) => x.id === st.editing);
      cx.timer.after(0, (cx) => { this.save({ editing: null }); if (c && c.path === this.selected) { this.comment.edit(c); cx.notify(); } });
    }
  }

  // -- comments ----------------------------------------------------------------
  // Rows shown: the diff, with each comment after the last line it covers.
  view() {
    const path = this.selected, comments = this.comments().filter((c) => c.path === path);
    const out = [];
    const after = new Map();
    for (const c of comments) {
      const key = `${c.side}:${c.end}`;
      if (!after.has(key)) after.set(key, []);
      after.get(key).push(c);
    }
    this.rows.forEach((r, i) => {
      out.push({ type: "row", i, r });
      if (r.kind === "@") return;
      for (const c of after.get(`${sideOf(r)}:${lineOf(r)}`) ?? []) out.push({ type: "comment", c });
      after.delete(`${sideOf(r)}:${lineOf(r)}`);
    });
    // Comments whose lines are no longer in the diff.
    for (const list of after.values()) for (const c of list) out.push({ type: "comment", c, stale: true });
    return out;
  }

  // A click on a row: on its line numbers it starts a comment (Shift extends the
  // last one); on the code it only selects the row, for the Comment button.
  pressRow(item, e, cx) {
    if (item.type === "comment") { this.comment.edit(item.c); cx.notify(); return; }
    if (item.r.kind === "@") return;
    const x = e.local_position?.x ?? 0, mods = e.modifiers ?? {};
    if (x >= GUTTER) { this.cur = item.i; this.pickWord(item, x, mods, cx); cx.notify(); return; }
    if (!(mods.shift && this.anchor !== null && this.anchor !== undefined && this.anchorPath === this.selected)) { this.anchor = item.i; this.anchorPath = this.selected; }
    this.selectRows(this.anchor, item.i, cx);
    this.gutterDrag = { to: item.i };
  }
  dragRow(item, cx) {
    const g = this.gutterDrag;
    if (!g || item.type !== "row" || item.r.kind === "@" || g.to === item.i) return;
    g.to = item.i;
    this.selectRows(this.anchor, item.i, cx);
  }

  // Comments on the rows from i to j of the diff: the new side's lines when the
  // range has any, else the removed lines; the code quoted is every row in it.
  selectRows(i, j, cx) {
    const lo = Math.min(i, j), hi = Math.max(i, j);
    const rows = this.rows.slice(lo, hi + 1).filter((x) => x.kind !== "@");
    if (!rows.length) return;
    const fresh = rows.filter((x) => x.b !== undefined);
    const side = fresh.length ? "new" : "old";
    const lines = fresh.length ? fresh.map((x) => x.b) : rows.map((x) => x.a);
    const code = rows.map((x) => `${x.kind === " " ? " " : x.kind} ${x.text}`);
    this.comment.open({ path: this.selected, side, start: Math.min(...lines), end: Math.max(...lines), code, rows: [lo, hi] });
    cx.notify();
  }

  message() {
    const list = [...this.comments()].sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start);
    const head = T("Code review of {head} against {base}{committed}. Please address these comments:", { head: this.headName(), base: this.base, committed: this.committedOnly() ? T(" (committed changes)") : "" });
    const items = list.map((c, i) => {
      const where = `${c.path}:${c.start}${c.end !== c.start ? `-${c.end}` : ""}${c.side === "old" ? T(" (removed lines)") : ""}`;
      const code = (c.code ?? []).slice(0, 30);
      return [`${i + 1}. ${where}`, ...(code.length ? ["```" + (LANG[ext(c.path)] ?? ""), ...code, "```"] : []), c.body].join("\n");
    });
    return [head, "", items.join("\n\n")].join("\n");
  }

  target() {
    const list = targets();
    if (!list.length) return null;
    const pinned = this.targetTerminal && list.find((x) => x.terminal === this.targetTerminal);
    return pinned ?? list[0];
  }

  cycleTarget() {
    const list = targets();
    if (!list.length) return;
    const cur = this.target();
    const i = list.findIndex((x) => x.terminal === cur?.terminal);
    this.targetTerminal = list[(i + 1) % list.length].terminal;
  }

  // paste: into the terminal's input without Enter (through the clipboard); send: with Enter; copy: clipboard only.
  deliver(how, cx) {
    const comments = this.comments();
    const to = this.target();
    if (!comments.length) { this.note = T("No comments yet: click a line number in the diff to comment."); return cx.notify(); }
    if (how !== "copy" && !to) { this.note = T("No terminal in this space to send to."); return cx.notify(); }
    const text = this.message();
    cx.spawn(async (cx) => {
      try {
        if (how === "send") {
          const r = await hc(["send", to.terminal, text]);
          if (r.code !== 0) throw new Error(r.stderr.trim() || "hc send failed");
        } else {
          await copyText(text);
          // Focus lands on the next frame; pasting at once would go to this view.
          if (how === "paste") { run("pane.focus", { terminal: to.terminal }); await exec("sleep", ["0.15"]); run("terminal.paste"); }
        }
        this.note = null;
        notify({ title: how === "copy" ? T("Review copied") : T(how === "send" ? "Review sent to {name}" : "Review pasted to {name}", { name: to.name }), body: T("{n} comments", { n: comments.length }), level: "success", timeout: 3000 });
        if (clearAfterSend() && how !== "copy") this.save({ comments: [] });
      } catch (e) { this.note = String(e.message ?? e); }
      cx.notify();
    });
  }

  openFile(path, line) {
    showEditor();
    setEditorSpec(editorKey(), { kind: "file", path: `${this.root}/${path}`, root: this.root, rel: path, on: this.on, line });
  }

  // -- drawing --------------------------------------------------------------------
  sidebar(t) {
    const comments = this.comments();
    const count = new Map();
    for (const c of comments) count.set(c.path, (count.get(c.path) ?? 0) + 1);
    const adds = this.files.reduce((n, f) => n + (f.add ?? 0), 0), dels = this.files.reduce((n, f) => n + (f.del ?? 0), 0);
    const to = this.target();
    const q = this.filter.value().toLowerCase();
    const side = this.part === "side";
    // Not a repository (or not read yet): only why, nothing from another one.
    if (!this.root) return v_flex().when(side, (e) => e.size_full()).when(!side, (e) => e.w(300).flex_none().h_full().border_r(1).border_color(t.border)).bg(t.chrome)
      .child(sectionHeader(T("Review"), [iconButton("rv-refresh", "refresh", T("Refresh"), (_e, cx) => this.refresh(cx))]))
      .child(div().px(12).py(4).text_size(12).text_color(t.dim).child(this.error ?? T("Loading…")));
    return v_flex().when(side, (e) => e.size_full()).when(!side, (e) => e.w(300).flex_none().h_full().border_r(1).border_color(t.border)).bg(t.chrome)
      .child(sectionHeader(T("Review"), [
        iconButton("rv-refresh", "refresh", T("Refresh"), (_e, cx) => this.refresh(cx)),
        side ? iconButton("rv-show", "eye", T("Show the diff"), () => showReview()) : iconButton("rv-close", "x", T("Back to the editor"), () => showEditor()),
      ]))
      .child(v_flex().px(12).pb(8).gap(6).flex_none()
        .child(h_flex().gap(4).items_center().text_size(12)
          .child(refButton("rv-base", this.base ?? T("choose…"), T("Base branch"), this.picking === "base", (cx) => this.pick("base", cx), t))
          .child(div().id("rv-swap").flex_none().px(3).rounded(4).text_color(t.dim).cursor_pointer()
            .hover((e) => e.bg(t.hover).text_color(t.foreground)).tooltip(T("Swap the two sides"))
            .on_click((_e, cx) => this.swap(cx)).child("⇄"))
          .child(refButton("rv-head", this.head ?? this.branch ?? "…", this.head ? T("Compared branch") : T("Current checkout: click to compare another branch"), this.picking === "head", (cx) => this.pick("head", cx), t)))
        .when(Boolean(this.picking), (e) => {
          const side = this.picking;
          const chosen = side === "head" ? this.head : this.base;
          const fits = (r) => r.name.toLowerCase().includes(q);
          // Groups: local branches, then one per remote, in git's order.
          const groups = [{ title: T("Local"), refs: (this.refs ?? []).filter((r) => !r.remote && fits(r)) }];
          for (const r of this.refs ?? []) {
            if (!r.remote || !fits(r)) continue;
            let g = groups.find((x) => x.remote === r.remote);
            if (!g) groups.push((g = { title: r.remote, remote: r.remote, refs: [] }));
            g.refs.push(r);
          }
          const row = (id, ref, label, extra) => h_flex().id(id).h(24).px(8).gap(6).items_center().text_size(12).cursor_pointer()
            .when(ref === chosen, (e) => e.bg(t.selected)).hover((e) => e.bg(t.hover))
            .on_click((_e, cx) => side === "head" ? this.setHead(ref, cx) : this.setBase(ref, cx))
            .child(div().flex_1().min_w(0).truncate().when(ref === null, (e) => e.text_color(t.muted)).child(label))
            .children(extra ?? []);
          const rows = [];
          if (side === "head") rows.push(row("rv-b-cur", null, T("Current checkout · {branch}", { branch: this.branch })));
          let n = 0;
          for (const g of groups) {
            if (!g.refs.length) continue;
            rows.push(div().h(22).px(8).flex().items_center().text_size(10.5).font_semibold().text_color(t.dim).child(g.title.toUpperCase()));
            for (const r of g.refs.slice(0, 300)) {
              const label = r.remote ? r.name.slice(r.remote.length + 1) : r.name;
              rows.push(row(`rv-b-${n++}`, r.name, label, [
                r.upstream ? div().flex_none().max_w(120).truncate().text_size(10.5).text_color(t.dim).child(`→ ${r.upstream}`) : null,
                r.track ? div().flex_none().text_size(10.5).text_color(/gone/.test(r.track) ? t.ansi1 : t.ansi3).child(trackMark(r.track)) : null,
              ].filter(Boolean)));
            }
          }
          return e.child(v_flex().gap(4)
            .child(h_flex().gap(6).items_center()
              .child(div().flex_1().text_size(11).text_color(t.muted).child(side === "head" ? T("Compare (right side)") : T("Base (left side)")))
              .child(iconButton("rv-fetch", "download", this.fetching ? T("Fetching…") : T("Fetch all remotes (git fetch --all --prune)"), (_e, cx) => this.fetch(cx), { color: this.fetching ? t.accent : undefined })))
            .child(Input.new(this.filter))
            .child(div().id("rv-branches").max_h(280).overflow_y_scrollbar().rounded(5).border_1().border_color(t.border).bg(t.background)
              .children(rows)));
        })
        .child(h_flex().gap(4)
          .when(!this.head, (e) => e
            .child(segment("rv-m-wt", T("Working tree"), T("Committed, staged, unstaged and untracked changes"), this.mode === "worktree", (_e, cx) => this.setMode("worktree", cx), t))
            .child(segment("rv-m-head", T("Committed"), T("Commits only (merge base..HEAD)"), this.mode === "head", (_e, cx) => this.setMode("head", cx), t)))
          .when(Boolean(this.head), (e) => e.child(div().text_size(11.5).text_color(t.dim).child(T("Committed changes on {head} · ", { head: this.head })))
            .child(div().id("rv-head-reset").text_size(11.5).text_color(t.accent).cursor_pointer().on_click((_e, cx) => this.setHead(null, cx)).child(T("back to current checkout")))))
        .child(div().text_size(11.5).text_color(t.dim).child(this.loading && !this.files.length ? "Loading…"
          : `${T("{n} files · +{add} −{del}", { n: this.files.length, add: adds, del: dels })}${this.mergeBase ? T(" · base {sha}", { sha: this.mergeBase.slice(0, 7) }) : ""}`)))
      .when(side && Boolean(this.error), (e) => e.child(div().px(12).pb(8).text_size(12).text_color(t.dim).child(this.error)))
      .child(div().id("rv-files").flex_1().min_h(0).overflow_y_scrollbar()
        .children(this.files.map((f, i) => {
          const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
          return h_flex().id(`rv-f-${i}`).h(24).px(12).gap(6).items_center().text_size(12).cursor_pointer()
            .when(f.path === this.selected, (e) => e.bg(t.selected)).hover((e) => e.bg(t.hover))
            .on_click((_e, cx) => this.select(f.path, cx))
            .child(div().w(12).flex_none().font_bold().text_size(11).text_color(statusColor(f.status, t)).child(f.status))
            .child(div().flex_none().max_w(150).truncate().child(basename(f.path)))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(dir))
            .when(count.has(f.path), (e) => e.child(h_flex().gap(2).items_center().text_size(11).text_color(t.accent).child(icon("message", 11)).child(String(count.get(f.path)))))
            .child(div().flex_none().text_size(11).text_color(t.ansi2).child(f.add === null ? "" : `+${f.add}`))
            .child(div().flex_none().text_size(11).text_color(t.ansi1).child(f.del ? `−${f.del}` : ""));
        })))
      .child(v_flex().flex_none().max_h(260).border_t(1).border_color(t.border)
        .child(sectionHeader(T("Comments ({n})", { n: comments.length }), comments.length ? [iconButton("rv-clear", "trash", T("Delete all comments"), (_e, cx) => { this.save({ comments: [] }); this.comment.close(); cx.notify(); })] : []))
        .child(div().id("rv-comments").flex_1().min_h(0).overflow_y_scrollbar()
          .when(!comments.length, (e) => e.child(div().px(12).pb(8).text_size(11.5).text_color(t.dim).child(T("Click a line number in the diff to comment; drag over them for a range."))))
          .children([...comments].sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start).map((c, i) =>
            h_flex().id(`rv-c-${i}`).px(12).py(4).gap(6).items_start().text_size(12).cursor_pointer().hover((e) => e.bg(t.hover))
              // On press: the delete button stops its press, so deleting doesn't open the comment.
              .on_mouse_down("left", (_e, cx) => { this.select(c.path, cx); if (this.part === "side") this.save({ editing: c.id }); else { this.comment.edit(c); cx.notify(); } })
              .child(v_flex().flex_1().min_w(0)
                .child(div().truncate().text_size(11).text_color(t.muted).child(`${basename(c.path)}:${c.start}${c.end !== c.start ? `-${c.end}` : ""}`))
                .child(div().truncate().child(c.body.split("\n")[0])))
              .child(iconButton(`rv-cdel-${i}`, "x", T("Delete"), (_e, cx) => { this.comment.remove(this.rkey(), c.id); cx.notify(); }, { size: 18, icon: 12 }))))))
      .child(v_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(h_flex().id("rv-target").h(26).px(8).gap(6).items_center().rounded(5).border_1().border_color(t.border).text_size(12).cursor_pointer()
          .hover((e) => e.bg(t.hover)).tooltip(T("Where the review goes: click for the next terminal in this space"))
          .on_click((_e, cx) => { this.cycleTarget(); cx.notify(); })
          .child(icon("terminal", 13).text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().child(to ? `${to.name} · ${to.tab.name}` : T("No terminal in this space")))
          .child(icon("chevron-right", 12).text_color(t.muted)))
        .child(h_flex().gap(6)
          .child(button("rv-paste", T("Paste to input"), (_e, cx) => this.deliver("paste", cx), { solid: true, tip: T("Puts the review in the terminal's input (uses the clipboard); you press Enter") }))
          .child(button("rv-send", T("Send ↵"), (_e, cx) => this.deliver("send", cx), { tip: T("Types it and presses Enter (hc send)") }))
          .child(iconButton("rv-copy", "copy", T("Copy the review"), (_e, cx) => this.deliver("copy", cx))))
        .child(h_flex().id("rv-clear-after").gap(6).items_center().text_size(11.5).text_color(t.muted).cursor_pointer()
          .on_click(() => setShared("codenav.clearAfterSend", !clearAfterSend()))
          .child(div().size(12).rounded(3).border_1().border_color(t.border).flex().items_center().justify_center()
            .when(clearAfterSend(), (e) => e.bg(t.accent).child(icon("check", 10).text_color(t.accent_foreground))))
          .child(T("Clear comments after sending")))
        .when(Boolean(this.note), (e) => e.child(div().text_size(11.5).text_color(t.ansi1).child(this.note))));
  }

  diff(t) {
    const font = codeFont().family;
    const items = this.view();
    const rowH = codeFont().row;
    const sizes = items.map((it) => it.type === "comment" ? commentHeight(it.c) : it.r.kind === "@" ? rowH + 6 : rowH);
    const c = this.comment.draft;
    const inRange = (it) => {
      const r = it.r;
      if (r.kind === "@") return false;
      if (!c || c.path !== this.selected) return false;
      if (c.rows) return it.i >= c.rows[0] && it.i <= c.rows[1];
      return sideOf(r) === c.side && lineOf(r) >= c.start && lineOf(r) <= c.end;
    };
    const file = this.files.find((f) => f.path === this.selected);
    const header = h_flex().h(34).flex_none().pl(12).pr(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.chrome)
      .child(icon("file-text", 14).text_color(t.muted))
      .child(div().flex_none().max_w(420).truncate().font_semibold().child(this.selected ?? T("No changes")))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim)
        .child(file ? `${T({ A: "Added", M: "Modified", D: "Deleted", U: "Untracked", T: "Type changed" }[file.status] ?? file.status)} · ${this.base}…${this.to() ?? T("working tree")}` : ""))
      .when(Number.isInteger(this.cur) && this.rows[this.cur] && this.rows[this.cur].kind !== "@", (e) => e.child(
        button("rv-comment", T("Comment"), (_e, cx) => this.selectRows(this.cur, this.cur, cx), { tip: T("Comment on the selected line (or drag over line numbers)") })))
      .child(iconButton("rv-full", "eye", this.full ? T("Show changes only") : T("Show the whole file"), (_e, cx) => { this.full = !this.full; cx.spawn(async (cx) => { await this.loadDiff(cx); cx.notify(); }); }, { color: this.full ? t.accent : undefined }))
      .when(Boolean(file) && file.status !== "D", (e) => e.child(iconButton("rv-open", "external", T("Open the file"), () => this.openFile(this.selected, c?.start ?? lineOf(this.rows.find((r) => r.kind === "+") ?? {}) ?? 1))));
    const measure = measureFont(this, font, codeFont().size);
    let body;
    if (this.error) body = div().p(16).text_color(t.dim).child(this.error);
    else if (!this.selected) body = div().p(16).text_color(t.dim).child(this.loading ? T("Loading…") : T("No changes against {base}.", { base: this.base ?? "" }));
    else if (this.binary) body = div().p(16).text_color(t.dim).child(T("No text diff (binary, empty, or only a mode change)."));
    else {
      this.scroll.setHeights(sizes);
      body = div().flex_1().min_h(0).flex().font_family(font).text_size(codeFont().size)
        .child(this.scroll.view("rv-diff", t, this.width ?? 400, (k) => {
          const it = items[k];
          return this.item(it, t, inRange).id(it.type === "comment" ? `rv-c-${it.c.id}` : `rv-r-${it.i}`)
            .on_mouse_down("left", (e, cx) => this.pressRow(it, e, cx))
            .on_mouse_move((_e, cx) => this.dragRow(it, cx));
        }, () => { this.gutterDrag = null; }));
    }
    return v_flex().flex_1().min_w(0).h_full().bg(t.background)
      .child(header)
      .child(measure)
      .child(body)
      .child(this.comment.panel(t, this.rkey(), (cx) => { this.anchor = null; cx.notify(); }) ?? this.lspPanel(t) ?? div());
  }

  item(it, t, inRange) {
    if (it.type === "comment") {
      const file = it.c.kind === "file";
      return commentCard(t, it.c, { prefix: it.stale ? (file ? T("File comment · ") : T("Outdated · ")) : "", warn: it.stale && !file });
    }
    const r = it.r;
    if (r.kind === "@") return h_flex().w_full().h(26).px(12).gap(8).flex_none().items_center().bg(t.raised).text_color(t.dim)
      .child(div().flex_none().child(r.text.replace(/@@(.*)@@.*/, "@@$1@@"))).child(div().text_color(t.muted).child(r.ctx ?? ""));
    const num = (n) => div().w(44).flex_none().text_right().text_color(t.dim).cursor_pointer().child(n === undefined ? "" : String(n));
    const colors = syntaxColors(t);
    const picked = inRange(it);
    return h_flex().w_full().h(codeFont().row).flex_none().gap(8).whitespace_nowrap()
      .when(r.kind === "+", (e) => e.bg(t.ansi2 + "1f")).when(r.kind === "-", (e) => e.bg(t.ansi1 + "1f"))
      .when(it.i === this.cur && !picked, (e) => e.bg(t.hover))
      .when(picked, (e) => e.bg(t.accent + "33"))
      .child(div().w(3).h_full().flex_none().when(picked, (e) => e.bg(t.accent)))
      .child(num(r.a)).child(num(r.b))
      .child(div().w(12).flex_none().text_color(r.kind === "+" ? t.ansi2 : r.kind === "-" ? t.ansi1 : t.dim).child(r.kind === " " ? "" : r.kind))
      .child(h_flex().flex_none().children(colorize(r.text, r.b !== undefined ? this.newToks?.[r.b - 1] : this.oldToks?.[r.a - 1], colors)));
  }

  render(cx) {
    const t = theme();
    const { cwd, on } = location();
    if (`${on ?? ""}:${cwd}` !== this.context && !this.loading) cx.timer.after(0, (cx) => this.refresh(cx, Boolean(this.root)));
    else this.syncStore(cx);
    // The diff half tells the tab strip which file it shows (a tab per reviewed file).
    const space = spaces().find((s) => s.active)?.id ?? null;
    const now = this.root && this.selected ? { rkey: this.rkey(), path: this.selected, space } : null;
    const cur = shared("codenav.review.current");
    if (this.part !== "side" && now && (cur?.rkey !== now.rkey || cur?.path !== now.path || cur?.space !== now.space) && this.publishing !== now.path) {
      this.publishing = now.path;
      cx.timer.after(0, () => { this.publishing = null; setShared("codenav.review.current", now); });
    }
    // Outside a repository the diff half has nothing to review: the editor's empty state.
    if (this.part === "main" && this.notRepo) {
      return div().id("codenav-review").size_full().bg(t.background).text_color(t.foreground)
        .track_focus(this.focus).on_mouse_down("left", () => this.focus.focus())
        .on_modifiers_changed((this.shiftTaps ??= doubleShift(this, () => openEverywhere("all"))))
        .child(emptyEditor(t));
    }
    return islandBottom(h_flex().id("codenav-review").size_full().min_h(0).bg(t.background)).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => {
        if (this.comment.key(e, this.rkey())) this.anchor = null;
        else if (e.keystroke === "escape" && this.lspSel) this.lspSel = null;
        else return;
        cx.notify(); cx.stop_propagation();
      })
      .when(this.part !== "main", (e) => e.child(this.sidebar(t)))
      .when(this.part !== "side", (e) => e.child(this.diff(t)));
  }
}

// "ahead 2, behind 1" as arrows.
const trackMark = (track) => /gone/.test(track) ? "gone"
  : track.replace(/ahead (\d+)/, "↑$1").replace(/behind (\d+)/, "↓$1").replace(", ", " ");

// "Clear comments after sending": on unless turned off (shared, so both halves agree).
const clearAfterSend = () => shared("codenav.clearAfterSend") !== false;

function refButton(id, label, tip, open, action, t) {
  return h_flex().id(id).flex_1().min_w(0).h(24).px(6).gap(4).items_center().rounded(5).border_1().cursor_pointer()
    .border_color(open ? t.accent : t.border).hover((e) => e.bg(t.hover)).tooltip(tip)
    .on_click((_e, cx) => action(cx))
    .child(icon("git-branch", 12).text_color(t.muted))
    .child(div().flex_1().min_w(0).truncate().child(label))
    .child(icon("chevron-down", 12).text_color(t.muted));
}

function segment(id, label, tip, on, action, t) {
  return div().id(id).flex_1().h(24).flex().items_center().justify_center().rounded(5).text_size(11.5).cursor_pointer().tooltip(tip)
    .when(on, (e) => e.bg(t.selected).text_color(t.foreground).font_semibold())
    .when(!on, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover)))
    .on_click((e, cx) => action(e, cx))
    .child(label);
}

const statusColor = (s, t) => s === "A" || s === "U" ? t.ansi2 : s === "D" ? t.ansi1 : s === "R" ? t.ansi4 : t.ansi3;
