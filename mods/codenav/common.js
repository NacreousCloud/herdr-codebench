// Shared helpers: the editor spec the workbench's views agree on (shared
// "activity.editor"), the editor area's stack, theme colors and small widgets.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, focused, run, shared, setShared, layout, theme, home } from "herdr";

export const MOD = "codenav";
export const icon = (name, size = 16) => svg(`mods/${MOD}/icons/${name}.svg`).size(size).flex_none();

// The codebench layout: an editor area (a column) holding the tab strip and a
// stack of the activity editor, our code view and our review view.
export const AREA = "editor-area";
export const STACK = "editor-stack";
export const CHILD = { text: "editor-text", code: "editor-code", review: "editor-review" };

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
export const hasArea = () => Boolean(find(layout(), STACK));

// Where the sidebar views look: the focused terminal's folder and its machine.
const last = {};
export function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane && pane.terminal === null) {
    if (last[space?.id]) return last[space.id];
    const term = panes().find((p) => p.tab === pane.tab && p.terminal && p.cwd);
    if (term) return { cwd: term.cwd, on: space?.machine ?? null, space: space?.id ?? null };
  }
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const loc = { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, space: space?.id ?? null };
  if (space) last[space.id] = loc;
  return loc;
}

// The same keys as the activity mod: per space in an editor area, else per tab.
export function editorKey() {
  if (find(layout(), AREA)) { const s = spaces().find((x) => x.active); return s ? `@area:${s.id}` : null; }
  return focused()?.tab ?? null;
}
export const editorSpec = (key = editorKey()) => (shared("activity.editor") ?? {})[key] ?? null;
export function setEditorSpec(key, spec) {
  const all = { ...(shared("activity.editor") ?? {}) };
  if (spec) all[key] = { ...spec, at: Date.now() }; else delete all[key];
  const live = new Set(spaces().flatMap((s) => [`@area:${s.id}`, ...s.tabs.map((t) => t.id)]));
  for (const k of Object.keys(all)) if (!live.has(k)) delete all[k];
  setShared("activity.editor", all);
}

// Files the activity editor shows better: pictures, PDFs, media, archives.
const VIEWER = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|avif|ico|pdf|mp3|mp4|m4a|wav|flac|ogg|mov|mkv|webm|avi|zip|gz|tgz|bz2|xz|7z|rar|tar|jar|war|class|so|dylib|dll|exe|bin|o|a|woff2?|ttf|otf|eot|sqlite|db|md|markdown|mdx)$/i;
export const isCode = (spec) => spec?.kind === "file" && !spec.edit && !VIEWER.test(spec.path ?? "");

// Which child of the editor stack should show now.
export function wantedChild() {
  if (shared("codenav.area") === "review") return CHILD.review;
  return isCode(editorSpec()) ? CHILD.code : CHILD.text;
}

export function showReview() {
  if (!hasArea()) return run("tab.new", { name: "Review", mod: MOD, props: { view: "review" } });
  setShared("codenav.area", "review");
  if (find(layout(), AREA)?.hidden) run("layout.show", { id: AREA });
  run("layout.select", { stack: STACK, child: CHILD.review });
}

export function showEditor() {
  if (shared("codenav.area")) setShared("codenav.area", null);
  run("layout.select", { stack: STACK, child: wantedChild() });
}

// Opens a local file in the editor area: "<absolute path>[:line[:col]]".
export function openPath(arg) {
  const m = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(arg.trim());
  if (!m?.[1]) return;
  const path = m[1], root = path.replace(/\/[^/]*$/, "");
  showEditor();
  setEditorSpec(editorKey(), { kind: "file", path, root, rel: basename(path), on: null, line: m[2] ? +m[2] : undefined, col: m[3] ? +m[3] - 1 : undefined });
  if (find(layout(), AREA)?.hidden) run("layout.show", { id: AREA });
}

export const tilde = (p) => { const h = home(); return p?.startsWith(h + "/") ? "~" + p.slice(h.length) : p; };
export const basename = (p) => (p ?? "").split("/").filter(Boolean).pop() ?? "";
export const ext = (p) => { const b = basename(p); return b.includes(".") ? b.split(".").pop().toLowerCase() : ""; };

// Syntax categories (bridge/lsp_bridge.py `tokens`) to theme colors.
export function syntaxColors(t) {
  return {
    keyword: t.ansi5, type: t.ansi3, constant: t.ansi6, builtin: t.ansi6, function: t.ansi4,
    decorator: t.ansi3, namespace: t.ansi4, property: t.ansi12 ?? t.ansi4, escape: t.ansi6,
    string: t.ansi2, number: t.ansi1, comment: t.dim, operator: t.muted, punctuation: t.muted,
  };
}

// A small square icon button.
export function iconButton(id, name, tip, action, opts = {}) {
  const t = theme();
  return div().id(id).size(opts.size ?? 22).flex_none().flex().items_center().justify_center().rounded(5)
    .text_color(opts.color ?? t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
    .tooltip(tip)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
    .child(icon(name, opts.icon ?? 14));
}

// A text button; `solid` for the main action.
export function button(id, label, action, opts = {}) {
  const t = theme();
  return div().id(id).flex_none().h(24).px(10).flex().items_center().rounded(5).text_size(12).cursor_pointer()
    .when(Boolean(opts.solid), (e) => e.bg(t.solid).text_color(t.solid_foreground))
    .when(!opts.solid, (e) => e.border_1().border_color(t.border).text_color(t.foreground).hover((s) => s.bg(t.hover)))
    .when(Boolean(opts.tip), (e) => e.tooltip(opts.tip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); })
    .child(label);
}

export function sectionHeader(title, actions = []) {
  const t = theme();
  return h_flex().h(30).flex_none().pl(12).pr(6).gap(2).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(t.muted).child(title.toUpperCase()))
    .children(actions);
}

// Display columns of a line: tabs to the next multiple of 4, wide (CJK) glyphs as 2.
export const TAB = 4;
const wide = (c) => c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6));
export function expandTabs(text, startCol = 0) {
  if (!text.includes("\t")) return text;
  let out = "", col = startCol;
  for (const ch of text) {
    if (ch === "\t") { const n = TAB - (col % TAB); out += " ".repeat(n); col += n; }
    else { out += ch; col += wide(ch.codePointAt(0)) ? 2 : 1; }
  }
  return out;
}
export function displayWidth(text) {
  let col = 0;
  for (const ch of text) col += ch === "\t" ? TAB - (col % TAB) : wide(ch.codePointAt(0)) ? 2 : 1;
  return col;
}
// The UTF-16 offset in `text` under display column `target`.
export function offsetAt(text, target) {
  let col = 0, i = 0;
  for (const ch of text) {
    const w = ch === "\t" ? TAB - (col % TAB) : wide(ch.codePointAt(0)) ? 2 : 1;
    if (target < col + w) return i;
    col += w; i += ch.length;
  }
  return text.length;
}

// The identifier around a UTF-16 offset, or null.
export function wordAt(text, offset) {
  const isWord = (c) => /[\p{L}\p{N}_$]/u.test(c);
  if (offset >= text.length || !isWord(text[offset])) {
    if (offset > 0 && isWord(text[offset - 1])) offset -= 1; else return null;
  }
  let s = offset, e = offset;
  while (s > 0 && isWord(text[s - 1])) s--;
  while (e < text.length && isWord(text[e])) e++;
  return { start: s, end: e, word: text.slice(s, e) };
}

// Terminals of the shown space, agents first: where a review can be sent.
export function targets() {
  const space = spaces().find((s) => s.active);
  if (!space) return [];
  const tabs = new Map(space.tabs.map((t) => [t.id, t]));
  return panes().filter((p) => p.terminal && tabs.has(p.tab))
    .map((p) => ({ terminal: p.terminal, pane: p.pane, agent: Boolean(p.status || p.program?.agent), name: p.program?.name ?? p.title, tab: tabs.get(p.tab), active: tabs.get(p.tab).active, focused: p.focused }))
    .sort((a, b) => (b.agent - a.agent) || (b.active - a.active) || (b.focused - a.focused));
}
