// Git Graph: every branch's commits as lanes, with the refs on them (HEAD, local
// and remote branches, tags, stashes, branches checked out in other worktrees).
// Follows the focused terminal's folder like the other sidebar views, so moving
// to a worktree's space shows that worktree's graph.
//   click        — the commit's details below the graph; a file opens its diff
//   right-click  — checkout, new branch / tag here, copy hash; stash apply / pop / drop
// The menu and dialogs are short-lived overlays: they post a request in shared
// "activity.graphop" and close; the graph view runs it (like the Explorer's file ops).
import { div } from "gpui-kit";
import { T } from "./i18n.js";
import { v_flex, h_flex, InputState, Input, v_virtual_list, Scrollbar } from "gpui-base";
import { exec, watchFolder, theme, shared, setShared, props, openOverlay, closeOverlay } from "herdr";
import { PathBuilder } from "gpui-kit";
import { sh, SEP } from "./io.js";
import { MOD, READ, location, locationKey, basename, openInEditor, iconButton, viewHeader, icon, statusColor, editorSpec } from "./common.js";
import { popupSurface, uiSize } from "./idea-design.js";
import { fileImage } from "./ficons/index.js";

export const GRAPH_OP = "activity.graphop";
const LIMIT = 400, ROW = 22, LANE = 12, MAX_LANES = 12;
const FS = "\x1f", RS = "\x1e";
// T with {name} values.
const F = (text, vars) => T(text).replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ""));

const G = READ.join(" ");
// One script, one round trip (also on a remote machine): top, branch, HEAD,
// tracked changes, remotes, worktrees, the git directory, stashes, log.
const REFRESH = `cd "$1" 2>/dev/null || { echo "No such folder: $1" >&2; exit 2; }
command -v git >/dev/null 2>&1 || { echo "git is not installed on this machine" >&2; exit 4; }
top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Not a git repository" >&2; exit 3; }
cd "$top" || exit 2
s='\\n@@HERDR-SEP@@\\n'
printf '%s' "$top"; printf "$s"
git ${G} rev-parse --abbrev-ref HEAD 2>/dev/null; printf "$s"
git ${G} rev-parse HEAD 2>/dev/null; printf "$s"
git ${G} status --porcelain=v1 --untracked-files=no 2>/dev/null | head -n 1000 | wc -l; printf "$s"
git ${G} remote 2>/dev/null; printf "$s"
git ${G} worktree list --porcelain 2>/dev/null; printf "$s"
git ${G} for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null; printf "$s"
(cd "$(git rev-parse --git-common-dir)" && pwd); printf "$s"
git ${G} stash list --format='%H%x1f%P%x1f%gd%x1f%s%x1f%an%x1f%ar%x1f%aI' 2>/dev/null; printf "$s"
git ${G} log --date-order -n ${LIMIT} --decorate-refs-exclude=refs/stash --exclude=refs/stash --all $(git stash list --format=%H 2>/dev/null) \\
  --format='%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%ar%x1f%aI%x1e' 2>/dev/null`;

// ---- parsing

function parseRefs(text, remotes) {
  const refs = [];
  for (const r of text.split(", ").map((x) => x.trim()).filter(Boolean)) {
    if (r === "HEAD") refs.push({ kind: "head", name: "HEAD" });
    else if (r.startsWith("HEAD -> ")) refs.push({ kind: "branch", name: r.slice(8), current: true });
    else if (r.startsWith("tag: ")) refs.push({ kind: "tag", name: r.slice(5) });
    else if (remotes.some((m) => r.startsWith(`${m}/`))) { if (!r.endsWith("/HEAD")) refs.push({ kind: "remote", name: r }); }
    else refs.push({ kind: "branch", name: r });
  }
  return refs;
}

function parseWorktrees(text, top) {
  // "worktree <path>\nHEAD <sha>\nbranch refs/heads/<name>\n\n" per worktree.
  const out = {};
  for (const block of text.split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1], branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (path && branch && path !== top) out[branch] = path;
  }
  return out;
}

export function parse(stdout) {
  const [top, branch, head, dirty, remotes, worktrees, locals, gitDir, stashes, log] = stdout.split(SEP);
  const root = top.trim(), remoteList = remotes.split("\n").map((x) => x.trim()).filter(Boolean);
  const stash = new Map(), helpers = new Set();
  for (const line of stashes.split("\n").filter(Boolean)) {
    const [hash, parents, ref, subject, author, when, date] = line.split(FS);
    const ps = parents.split(" ").filter(Boolean);
    ps.slice(1).forEach((p) => helpers.add(p)); // the index and untracked-files commits
    stash.set(hash, { ref, subject, author, when, date, base: ps[0] ?? null });
  }
  const commits = [];
  for (const rec of log.split(RS)) {
    const line = rec.replace(/^\n/, "");
    if (!line.trim()) continue;
    const [hash, parents, deco, subject, author, when, date] = line.split(FS);
    if (helpers.has(hash) && !stash.has(hash)) continue;
    const st = stash.get(hash);
    commits.push({
      hash, subject, author, when, date,
      parents: st ? (st.base ? [st.base] : []) : parents.split(" ").filter(Boolean),
      refs: st ? [{ kind: "stash", name: st.ref }] : parseRefs(deco ?? "", remoteList),
      stash: st ? st.ref : null,
    });
  }
  return {
    root, branch: branch.trim() || null, head: head.trim() || null, dirty: Number(dirty.trim()) || 0,
    remotes: remoteList, worktrees: parseWorktrees(worktrees, root), locals: locals.split("\n").map((x) => x.trim()).filter(Boolean), gitDir: gitDir.trim() || null,
    stashes: stash.size, commits,
    // Every stash, also those older than the log's window.
    stashList: [...stash].map(([hash, st]) => ({ hash, ...st })),
  };
}

// ---- lanes
// Each lane holds the commit it waits for. A commit takes the lane waiting for
// it (or a free one); lanes also waiting for it end there; its first parent
// continues its lane, other parents join their lane or take a free one.
export function lanes(commits) {
  const known = new Set(commits.map((c) => c.hash));
  const lanes = [], rows = [];
  for (const c of commits) {
    let idx = lanes.indexOf(c.hash);
    if (idx < 0) { idx = lanes.indexOf(null); if (idx < 0) { idx = lanes.length; lanes.push(null); } }
    const before = lanes.slice(), segs = [];
    for (let j = 0; j < before.length; j++) if (before[j] === c.hash) { segs.push(["in", j, idx]); lanes[j] = null; }
    const ps = c.parents.filter((p) => known.has(p));
    if (ps[0]) { lanes[idx] = ps[0]; segs.push(["out", idx, idx]); }
    for (const p of ps.slice(1)) {
      let j = lanes.indexOf(p);
      if (j < 0) { j = lanes.findIndex((x, k) => x === null && k !== idx); if (j < 0) j = lanes.length; lanes[j] = p; }
      segs.push(["out", idx, j]);
    }
    for (let j = 0; j < before.length; j++) if (before[j] !== null && before[j] !== c.hash && lanes[j] === before[j]) segs.push(["pass", j, j]);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    rows.push({ c, idx, segs, width: Math.max(before.length, lanes.length, idx + 1) });
  }
  return rows;
}

const x = (j) => j * LANE + LANE / 2;
const palette = (t) => [t.ansi4, t.ansi2, t.ansi5, t.ansi3, t.ansi6, t.ansi1, t.ansi12, t.ansi10];

// The row's lines, one stroked path per color, built once and kept on the row.
function paths(row, t) {
  if (row.paths) return row.paths;
  const colors = palette(t), by = new Map(), mid = ROW / 2;
  const add = (lane, draw) => { const k = lane % colors.length; if (!by.has(k)) by.set(k, []); by.get(k).push(draw); };
  for (const [kind, a, b] of row.segs) {
    if (Math.max(a, b) >= MAX_LANES) continue;
    if (kind === "pass") add(a, (p) => p.move_to(x(a), 0).line_to(x(a), ROW));
    else if (kind === "in") add(a, (p) => a === b ? p.move_to(x(a), 0).line_to(x(a), mid) : p.move_to(x(a), 0).cubic_bezier_to(x(b), mid, x(a), mid, x(b), 0));
    else add(b, (p) => a === b ? p.move_to(x(a), mid).line_to(x(a), ROW) : p.move_to(x(a), mid).cubic_bezier_to(x(b), ROW, x(a), ROW, x(b), mid));
  }
  row.paths = [...by].map(([k, draws]) => [colors[k], draws.reduce((p, d) => d(p), PathBuilder.stroke(1.5)).build()]);
  return row.paths;
}

const refColor = (r, t) => r.kind === "tag" ? t.ansi3 : r.kind === "stash" ? t.ansi5 : r.kind === "remote" ? t.dim : r.kind === "head" ? t.ansi1 : t.accent;

// ---- the view

export default class Graph {
  init(_p, cx) {
    this.rows = []; this.sel = null; this.detail = null; this.opSeen = shared(GRAPH_OP)?.seq ?? null;
    this.refresh(cx);
    // Remote repositories can't be watched: asked every 10 s; local ones are watched.
    cx.timer.every(10000, (cx) => { if (location().on) this.refresh(cx); });
  }

  watch(dir, cx) {
    if (this.on || !dir || this.watched === dir) return;
    this.watched = dir;
    cx.spawn(async (cx) => {
      try { while (this.watched === dir) { await watchFolder(dir); if (this.watched === dir) this.refresh(cx); } }
      catch { this.watched = null; }
    });
  }

  git(args, read = true) { return exec("git", read ? [...READ, ...args] : args, { cwd: this.root, on: this.on }); }

  refresh(cx) {
    if (this.loading) { this.again = true; return; }
    const { cwd, on } = location(), context = locationKey();
    if (context !== this.context) {
      this.context = context; this.root = null; this.rows = []; this.sel = null; this.detail = null;
      this.error = null; this.note = null; this.watched = null; this.info = null;
    }
    if (!cwd) return;
    this.loading = true; this.again = false;
    cx.spawn(async (cx) => {
      try {
        const r = await sh(REFRESH, [cwd], { on });
        if (locationKey() !== context) return;
        if (r.code !== 0) { this.root = null; this.rows = []; this.error = r.code === 3 ? "Not a git repository" : r.stderr.trim() || "Cannot read this folder"; return; }
        const info = parse(r.stdout);
        this.root = info.root; this.on = on; this.info = info; this.error = null;
        this.rows = lanes(info.commits);
        if (this.sel && !info.commits.some((c) => c.hash === this.sel) && !info.stashList.some((c) => c.hash === this.sel)) { this.sel = null; this.detail = null; }
        this.watch(info.gitDir, cx);
      } catch (e) { if (locationKey() === context) this.error = String(e); }
      finally {
        this.loading = false; cx.notify();
        // Changes while reading (a commit landing during the read) read again, after a breath.
        if (this.again) cx.timer.after(500, (cx) => this.refresh(cx));
      }
    });
  }

  select(hash, cx) {
    if (this.sel === hash) { this.sel = null; this.detail = null; cx.notify(); return; }
    this.sel = hash; this.detail = null;
    const seq = this.detailSeq = (this.detailSeq ?? 0) + 1;
    cx.spawn(async (cx) => {
      const r = await this.git(["show", "--no-color", "--diff-merges=first-parent", "--name-status", `--format=%H${FS}%an${FS}%ae${FS}%aI${FS}%P${FS}%B${RS}`, hash]).catch((e) => ({ code: 1, stderr: String(e) }));
      if (seq !== this.detailSeq) return;
      if (r.code !== 0) { this.detail = { error: (r.stderr || "git show failed").trim() }; cx.notify(); return; }
      const [head, rest = ""] = r.stdout.split(RS);
      const [full, author, email, date, parents, body] = head.split(FS);
      const files = rest.split("\n").filter(Boolean).map((l) => { const [status, ...p] = l.split("\t"); return { status: status[0], path: p[p.length - 1] }; }).filter((f) => f.path);
      this.detail = { hash: full, author, email, date, parents: parents.split(" ").filter(Boolean), body: (body ?? "").trim(), files };
      cx.notify();
    });
    cx.notify();
  }

  // Runs a writing git command, then refreshes.
  act(args, cx, label) {
    if (!this.root || this.busy) return;
    this.busy = label ?? true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        const r = await this.git(args, false);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
      } catch (e) { this.note = String(e.message ?? e); }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  // A commit of the graph, or a stash (shown below it even when older than the log).
  find(hash) {
    const c = this.info?.commits.find((x) => x.hash === hash);
    if (c) return c;
    const st = this.info?.stashList.find((x) => x.hash === hash);
    return st ? { hash, subject: st.subject, refs: [{ kind: "stash", name: st.ref }], stash: st.ref, parents: st.base ? [st.base] : [] } : null;
  }

  target(hash) {
    const c = this.find(hash);
    if (!c) return null;
    return { root: this.root, on: this.on ?? null, hash, subject: c.subject, refs: c.refs, stash: c.stash,
      dirty: this.info.dirty, branch: this.info.branch, worktrees: this.info.worktrees, head: this.info.head, locals: this.info.locals };
  }

  menu(hash) {
    const target = this.target(hash);
    if (target) openOverlay({ mod: MOD, kind: "popup", width: 340, height: menuItems(target).reduce((h, it) => h + (it === "-" ? 9 : 28), 10), props: { view: "graphmenu", target } });
  }

  // Runs what the menu and dialogs post (they close at once; this view stays).
  takeRequest(cx) {
    const op = shared(GRAPH_OP);
    if (!op || op.seq === this.opSeen) return;
    this.opSeen = op.seq;
    if (Date.now() - (op.at ?? 0) > 15000) return;
    const t = op.target;
    if (!this.root || t?.root !== this.root || (t.on ?? null) !== (this.on ?? null)) return;
    // Checkouts with uncommitted changes ask first (git still refuses if they'd be overwritten).
    if (op.op.startsWith("checkout") && t.dirty && !op.confirmed) return openPrompt("checkout", t, op);
    cx.timer.after(0, (cx) => {
      if (op.op === "checkout-branch") this.act(["switch", op.name], cx, "Checking out…");
      else if (op.op === "checkout-remote") this.act(["switch", "--track", op.name], cx, "Checking out…");
      else if (op.op === "checkout-commit") this.act(["switch", "--detach", t.hash], cx, "Checking out…");
      else if (op.op === "branch") this.act(op.checkout ? ["switch", "-c", op.name, t.hash] : ["branch", op.name, t.hash], cx);
      else if (op.op === "tag") this.act(["tag", op.name, t.hash], cx);
      else if (op.op === "stash-apply") this.act(["stash", "apply", t.stash], cx, "Applying…");
      else if (op.op === "stash-pop") this.act(["stash", "pop", t.stash], cx, "Applying…");
      else if (op.op === "stash-drop") this.act(["stash", "drop", t.stash], cx);
    });
  }

  row(r, t, colors) {
    const c = r.c, info = this.info, head = c.hash === info.head, w = Math.min(r.width, MAX_LANES) * LANE + 4;
    const dot = colors[r.idx % colors.length];
    const graph = div().relative().w(w).h(ROW).flex_none().overflow_hidden()
      .children(paths(r, t).map(([color, path]) => window.paint_path(path, color).absolute().top(0).left(0).size_full()))
      .when(r.idx < MAX_LANES, (el) => el.child(div().absolute().left(x(r.idx) - (head ? 5 : 4)).top(ROW / 2 - (head ? 5 : 4)).size(head ? 10 : 8).rounded(c.stash ? 2 : 999)
        .when(head, (e) => e.bg(t.chrome).border_2().border_color(dot)).when(!head, (e) => e.bg(c.stash ? t.chrome : dot).when(Boolean(c.stash), (e) => e.border_2().border_color(t.ansi5)))));
    // The current branch and tags first; at most two, the rest as "+N" (all of them are in the details).
    const order = { head: 0, branch: 1, tag: 2, stash: 2, remote: 3 };
    const refs = [...c.refs].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || order[a.kind] - order[b.kind]);
    const badges = refs.slice(0, 2).map((ref) => {
      const color = refColor(ref, t), wt = ref.kind === "branch" && info.worktrees[ref.name];
      return h_flex().flex_none().max_w(96).h(16).px(5).gap(3).items_center().rounded(4).border_1().border_color(color)
        .when(ref.current, (e) => e.bg(color).text_color(t.accent_foreground)).when(!ref.current, (e) => e.text_color(color))
        .text_size(10.5).font_medium()
        .when(ref.kind === "tag", (e) => e.child("🏷")).when(ref.kind === "stash", (e) => e.child("≡")).when(Boolean(wt), (e) => e.child("⎇"))
        .child(div().min_w(0).truncate().child(ref.name));
    });
    return h_flex().w_full().h(ROW).pr(8).gap(6).items_center().text_size(12)
      .when(this.sel === c.hash, (e) => e.bg(t.selected))
      .child(graph)
      .children(badges)
      .when(refs.length > 2, (e) => e.child(div().flex_none().text_size(10).text_color(t.dim).child(`+${refs.length - 2}`)))
      .child(div().flex_1().min_w(0).truncate().text_color(c.stash ? t.muted : t.foreground).when(head, (e) => e.font_semibold()).child(c.stash ? c.subject.replace(/^(WIP on|On) [^:]+: /, "") : c.subject))
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child(shortWhen(c.date)));
  }

  details(t) {
    const d = this.detail, c = this.find(this.sel);
    if (!c) return null;
    const body = !d ? [div().px(12).py(6).text_size(12).text_color(t.dim).child(T("Loading…"))]
      : d.error ? [div().px(12).py(6).text_size(12).text_color(t.ansi1).child(d.error)]
      : [
        div().px(12).pt(6).text_size(12.5).font_semibold().child(d.body.split("\n")[0] || c.subject),
        // The message's body, its first lines (the whole message is a click away: copy, or git show).
        ...(() => {
          const more = d.body.split("\n").slice(1).join("\n").trim().split("\n").filter((l) => l.trim()), shown = more.slice(0, 3);
          return shown.length ? [div().px(12).pt(4).text_size(11.5).text_color(t.muted).whitespace_normal().child(shown.join("\n") + (more.length > 3 ? " …" : ""))] : [];
        })(),
        div().px(12).pt(6).text_size(11).text_color(t.dim).child(`${d.author} · ${d.date.slice(0, 16).replace("T", " ")}`).tooltip(d.email),
        div().px(12).pb(4).text_size(11).text_color(t.dim).child(`${d.hash.slice(0, 10)}${d.parents.length ? ` ← ${d.parents.map((p) => p.slice(0, 7)).join(", ")}` : ""}`),
        ...(c.refs.length ? [h_flex().px(12).pb(4).gap(4).flex_wrap().children(c.refs.map((ref) => div().text_size(10.5).text_color(refColor(ref, t)).child(ref.kind === "tag" ? `tag ${ref.name}` : ref.name)))] : []),
        div().px(12).pt(2).pb(2).text_size(10.5).font_semibold().text_color(t.muted).child(F("{n} files changed", { n: d.files.length })),
        ...d.files.slice(0, 300).map((f) => this.fileRow(f, d.hash, t)),
      ];
    return v_flex().flex_none().h(240).border_t(1).border_color(t.border).bg(t.chrome)
      .child(h_flex().h(26).flex_none().pl(12).pr(6).items_center().gap(6)
        .child(icon("commit", 12).text_color(t.dim))
        .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(t.muted).child(c.stash ? c.stash : c.hash.slice(0, 8)))
        .child(iconButton("gg-copy", "copy", T("Copy hash"), (_e, cx) => cx.write_to_clipboard(c.hash), { size: 20 }))
        .child(iconButton("gg-close", "x", T("Close"), (_e, cx) => { this.sel = null; this.detail = null; cx.notify(); }, { size: 20 })))
      .child(v_flex().id("gg-detail").flex_1().min_h(0).overflow_y_scrollbar().pb(6).children(body));
  }

  fileRow(f, hash, t) {
    const parts = f.path.split("/"), name = parts.pop(), spec = editorSpec();
    const selected = spec?.kind === "diff" && spec.commit === hash && spec.rel === f.path;
    return h_flex().id(`gg-f-${f.path}`).h(22).flex_none().pl(18).pr(8).gap(6).items_center().cursor_pointer()
      .when(selected, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
      .on_click(() => openInEditor({ kind: "diff", commit: hash, path: `${this.root}/${f.path}`, root: this.root, rel: f.path, on: this.on }))
      .child(fileImage(f.path, false, false, 14))
      .child(h_flex().flex_1().min_w(0).gap(6).items_baseline()
        .child(div().flex_none().max_w(160).truncate().text_size(12).text_color(f.status === "D" ? t.dim : statusColor(f.status, t)).when(f.status === "D", (el) => el.line_through()).child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(parts.join("/"))))
      .child(div().w(12).text_size(11).text_color(statusColor(f.status, t)).child(f.status));
  }

  render(cx) {
    if (locationKey() !== this.context) this.refresh(cx);
    this.takeRequest(cx);
    const t = theme(), info = this.info;
    const header = viewHeader("Git Graph", this.root ? [
      iconButton("gg-fetch", "download", T("Fetch all remotes"), (_e, cx) => this.act(["fetch", "--all", "--prune", "--tags"], cx, "Fetching…")),
      iconButton("gg-refresh", "refresh", T("Refresh"), (_e, cx) => this.refresh(cx)),
    ] : []);
    if (!this.root) {
      return v_flex().id("activity-graph").size_full().bg(t.chrome).text_color(t.foreground).text_size(13).child(header)
        .child(div().px(14).py(8).text_size(12).text_color(t.dim).child(T(this.error || (this.loading ? "Loading…" : "Focus a terminal inside a git repository"))));
    }
    const colors = palette(t), rows = this.rows;
    const where = `${basename(this.root)} · ${info.branch === "HEAD" ? T("detached") : info.branch ?? "?"}`;
    const extra = [info.dirty ? F("{n} changed", { n: info.dirty >= 1000 ? "1000+" : info.dirty }) : null, info.stashes ? F("{n} stashes", { n: info.stashes }) : null].filter(Boolean).join(" · ");
    return v_flex().id("activity-graph").size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(13)
      .child(header)
      .child(h_flex().h(22).flex_none().px(14).gap(6).items_center().text_size(11).text_color(t.muted).tooltip(this.root)
        .child(icon("git-branch", 12))
        .child(div().flex_1().min_w(0).truncate().child(where))
        .when(Boolean(extra), (el) => el.child(div().flex_none().text_color(info.dirty ? t.blocked : t.dim).child(extra))))
      .when(Boolean(this.busy || this.note), (el) => el.child(div().px(14).pb(4).text_size(11).whitespace_normal()
        .text_color(this.note ? t.ansi1 : t.dim).child(this.note ?? (typeof this.busy === "string" ? T(this.busy) : T("Working…")))))
      .child(div().flex_1().min_h(0).relative()
        .child(rows.length
          ? v_virtual_list("gg-list", rows.length, ROW, (i) => rows[i].c.hash, (range) => rows.slice(range.start, range.end).map((r) => this.row(r, t, colors))).size_full()
            .on_item_click((hash, cx) => this.select(hash, cx))
            .on_item_secondary_click((hash, _e, _cx) => this.menu(hash))
          : div().px(14).py(8).text_size(12).text_color(t.dim).child(T(this.loading ? "Loading…" : "No commits yet")))
        .child(Scrollbar.vertical("gg-list").viewport_from_layout().absolute().inset_0()))
      .when(rows.length >= LIMIT, (el) => el.child(div().flex_none().px(14).py(2).text_size(10.5).text_color(t.dim).child(F("Showing the latest {n} commits", { n: LIMIT }))))
      .children([this.stashSection(t), this.details(t)].filter(Boolean));
  }

  stashSection(t) {
    const list = this.info?.stashList ?? [];
    if (!list.length) return null;
    const open = Boolean(this.stashOpen);
    return v_flex().flex_none().border_t(1).border_color(t.border)
      .child(h_flex().id("gg-stashes").h(24).flex_none().pl(8).pr(10).gap(4).items_center().cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.stashOpen = !open; cx.notify(); })
        .child(icon(`chevron-${open ? "down" : "right"}`, 12).text_color(t.dim))
        .child(div().flex_1().text_size(11).font_semibold().child(T("Stashes")))
        .child(div().px(6).rounded_full().bg(t.raised).text_size(10).text_color(t.muted).child(String(list.length))))
      .when(open, (el) => el.child(v_flex().id("gg-stash-list").max_h(150).overflow_y_scrollbar().pb(4)
        .children(list.map((st) => h_flex().id(`gg-st-${st.hash}`).h(22).flex_none().pl(22).pr(10).gap(6).items_center().cursor_pointer()
          .when(this.sel === st.hash, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
          .tooltip(`${st.ref} · ${st.author} · ${st.when}`)
          .on_click((_e, cx) => this.select(st.hash, cx))
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(st.hash); })
          .child(div().flex_none().text_size(10.5).text_color(t.ansi5).child(st.ref))
          .child(div().flex_1().min_w(0).truncate().text_size(12).child(st.subject.replace(/^(WIP on|On) [^:]+: /, "")))
          .child(div().flex_none().text_size(10.5).text_color(t.dim).child(shortWhen(st.date)))))));
  }
}

// "17h", "6d", "3w" from an ISO date (git's own "%ar" is long, and localized).
const shortWhen = (iso) => {
  const sec = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  for (const [n, u] of [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]]) if (sec >= n) return `${Math.floor(sec / n)}${u}`;
  return "now";
};

// ---- the right-click menu

const request = (op) => setShared(GRAPH_OP, { ...op, seq: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() });

// [label, icon, action(cx)] or "-" for a line.
function menuItems(target) {
  const out = [];
  if (target.stash) {
    out.push([`Apply ${target.stash}`, "check", () => request({ op: "stash-apply", target })]);
    out.push([`Pop ${target.stash}`, "arrow-up", () => request({ op: "stash-pop", target })]);
    out.push([`Drop ${target.stash}…`, "trash", () => openPrompt("drop", target)]);
    out.push("-");
  } else {
    const locals = target.refs.filter((r) => r.kind === "branch" && !r.current);
    const localNames = new Set(target.locals ?? []);
    for (const r of locals) {
      const wt = target.worktrees[r.name];
      out.push([wt ? `${r.name} (in worktree ${basename(wt)})` : `Checkout ${r.name}`, "git-branch", wt ? null : () => request({ op: "checkout-branch", target, name: r.name })]);
    }
    for (const r of target.refs.filter((r) => r.kind === "remote")) {
      const local = r.name.slice(r.name.indexOf("/") + 1);
      if (!localNames.has(local)) out.push([`Checkout ${r.name} as ${local}`, "download", () => request({ op: "checkout-remote", target, name: r.name })]);
    }
    if (target.hash !== target.head) out.push(["Checkout this commit (detached)", "commit", () => request({ op: "checkout-commit", target })]);
    if (out.length) out.push("-");
    out.push(["Create Branch Here…", "git-branch", () => openPrompt("branch", target)]);
    out.push(["Create Tag Here…", "plus", () => openPrompt("tag", target)]);
    out.push("-");
  }
  out.push(["Copy Commit Hash", "copy", (cx) => cx.write_to_clipboard(target.hash)]);
  out.push(["Copy Subject", "clipboard", (cx) => cx.write_to_clipboard(target.subject)]);
  return out;
}

export class GraphMenu {
  init(p, cx) { this.target = p.target; this.at = -1; this.h = cx.focus_handle(); this.h.focus(); }
  release() { this.h?.release(); }
  choose(it, cx) { if (!it[2]) return; closeOverlay(props()?.overlay); it[2](cx); }
  render(cx) {
    const t = theme(), list = menuItems(this.target), real = list.filter((x) => x !== "-" && x[2]);
    return popupSurface(v_flex().id("graph-menu").track_focus(this.h).size_full().p(5).bg(t.popover).text_color(t.foreground).text_size(uiSize(12.5)))
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % real.length;
        else if (e.key === "up") this.at = (this.at + real.length - 1) % real.length;
        else if (e.key === "enter" && real[this.at]) return this.choose(real[this.at], cx);
        else if (e.key === "escape") return closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(list.map((it, i) => it === "-" ? div().mx(6).my(4).h(1).flex_none().bg(t.border)
        : h_flex().id(`gm-${i}`).h(28).flex_none().px(8).gap(9).rounded(6).items_center()
          .when(Boolean(it[2]), (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.choose(it, cx)))
          .when(!it[2], (el) => el.text_color(t.dim))
          .when(real.indexOf(it) === this.at, (el) => el.bg(t.selected))
          .child(icon(it[1], 14).text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().child(T(it[0])))));
  }
}

// ---- dialogs: a name (branch, tag) or a confirmation (drop a stash, checkout with changes)

export function openPrompt(mode, target, op = null) {
  openOverlay({ mod: MOD, kind: "dialog", width: 440, height: mode === "branch" || mode === "tag" ? 196 : 170, props: { view: "graphprompt", mode, target, op } });
}

export class GraphPrompt {
  init(p, cx) {
    this.mode = p.mode; this.target = p.target; this.op = p.op; this.error = null;
    if (this.mode === "branch" || this.mode === "tag") {
      this.input = InputState.new({ placeholder: this.mode === "tag" ? "v1.2.3" : "feature/name" });
      this.input.on("submit", () => this.submit(false));
      this.input.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      this.input.focus();
      cx.timer.after(300, () => this.input.focus());
    }
    this.h = cx.focus_handle();
    if (!this.input) this.h.focus();
  }
  release() { this.h?.release(); }

  submit(checkout) {
    const { mode, target } = this;
    if (mode === "drop") request({ op: "stash-drop", target });
    else if (mode === "checkout") request({ ...this.op, confirmed: true });
    else {
      const name = this.input.value().trim();
      // git check-ref-format's rules, the common ones; git has the final word.
      if (!name || /[\s~^:?*\[\\]|\.\.|@\{|^[-/.]|[/.]$|\.lock$|\/\//.test(name)) { this.error = T("Not a valid name"); return; }
      request({ op: mode, target, name, checkout });
    }
    closeOverlay(props()?.overlay);
  }

  render(cx) {
    const t = theme(), { mode, target } = this, short = target.hash.slice(0, 8);
    const title = { branch: "Create Branch", tag: "Create Tag", drop: "Drop Stash", checkout: "Checkout with Changes" }[mode];
    const sub = mode === "drop" ? F("Drop {s}? This can't be undone.", { s: target.stash })
      : mode === "checkout" ? F("{n} tracked files have uncommitted changes. Checkout anyway? Git refuses if they would be overwritten.", { n: target.dirty })
      : F("at {h} · {s}", { h: short, s: target.subject });
    const button = (id, text, kind, action) => h_flex().id(id).h(30).px(14).items_center().rounded(7)
      .border_1().border_color(kind === "danger" ? t.ansi1 : kind ? t.solid : t.input).bg(kind === "danger" ? t.ansi1 : kind ? t.solid : t.raised)
      .text_color(kind ? t.solid_foreground : t.foreground).text_size(uiSize(12.5)).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    const buttons = [button("gp-cancel", T("Cancel"), null, () => closeOverlay(props()?.overlay))];
    if (mode === "branch") buttons.push(button("gp-create", T("Create"), null, () => this.submit(false)), button("gp-switch", T("Create & Checkout"), "solid", () => this.submit(true)));
    else if (mode === "tag") buttons.push(button("gp-create", T("Create"), "solid", () => this.submit(false)));
    else buttons.push(button("gp-ok", T(mode === "drop" ? "Drop" : "Checkout"), mode === "drop" ? "danger" : "solid", () => this.submit(false)));
    return popupSurface(v_flex().id("graph-prompt").track_focus(this.h).size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground), true)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
        else if (e.key === "enter" && !this.input) { this.submit(false); cx.stop_propagation(); }
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(uiSize(15)).font_semibold().child(T(title))).child(div().text_size(uiSize(11)).text_color(t.dim).child("Esc")))
      .child(div().text_size(uiSize(12)).text_color(t.dim).whitespace_normal().child(sub))
      .when(Boolean(this.input), (el) => el.child(Input.new(this.input).h(34).px(10).rounded(8).border_1().border_color(this.error ? t.ansi1 : t.accent).bg(t.background).text_size(uiSize(12.8)).text_color(t.foreground)))
      .when(Boolean(this.error), (el) => el.child(div().text_size(uiSize(11.5)).text_color(t.ansi1).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end().children(buttons));
  }
}
