// Review comments, kept per repository in shared "codenav.reviews":
// { ["<machine>:<root>"]: { base, head, mode, selected, editing, comments } }.
// The review and the code view both write them; the review sends them.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { shared, setShared } from "herdr";
import { T } from "./i18n.js";
import { IDEA, isIdea, uiSize, ideaUI } from "./idea-design.js";
import { icon, button, uiFontFamily } from "./common.js";

const KEY = "codenav.reviews";
export const repoKey = (on, root) => `${on ?? ""}:${root}`;
export const repoStore = (rkey) => (shared(KEY) ?? {})[rkey] ?? {};
export const commentsOf = (rkey) => repoStore(rkey).comments ?? [];
export function saveRepo(rkey, patch) {
  const all = { ...(shared(KEY) ?? {}) };
  all[rkey] = { ...all[rkey], ...patch };
  setShared(KEY, all);
}

const where = (c) => `${c.path}:${c.start}${c.end !== c.start ? `-${c.end}` : ""}`;
const linesLabel = (c) => c.end !== c.start ? T("lines {start}-{end} · click to edit", c) : T("line {start} · click to edit", c);

// A comment under the lines it covers; `prefix` says why it isn't (outdated...).
export function commentCard(t, c, { prefix = "", warn = false, pl = 16 } = {}) {
  return v_flex().w_full().pl(pl).pr(16).py(5).flex_none()
    .child(v_flex().max_w(760).px(10).py(6).gap(2).rounded(isIdea() ? IDEA.controlRadius : 6).border_1().border_color(t.accent + "66").bg(t.accent + "12")
      .font_family(uiFontFamily()).text_size(uiSize(12.5))
      .child(div().text_size(uiSize(11)).text_color(warn ? t.ansi3 : t.muted).child(`${prefix}${c.side === "old" ? T("removed ") : ""}${linesLabel(c)}`))
      .child(div().whitespace_normal().child(c.body)));
}
export const commentHeight = (c) => 34 + Math.min(12, c.body.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / (110 * 13 / uiSize()))), 0)) * uiSize(18);

// The comment being written: a draft { path, side, start, end, code, id? } and its box.
export class CommentBox {
  constructor() {
    this.draft = null;
    this.box = TextareaState.new({ placeholder: T("Leave a comment for the agent… (Cmd+Enter to save)"), rows: 3 });
    this.box.set_auto_grow(2, 10);
    this.box.on("focus", () => { this.typing = true; });
    this.box.on("blur", () => { this.typing = false; });
  }

  // A new comment keeps what was typed for the last new one.
  open(draft) {
    const keep = this.draft && !this.draft.id ? this.box.value() : "";
    this.draft = draft;
    this.box.set_value(keep);
    this.box.focus();
  }
  edit(c) { this.draft = { ...c }; this.box.set_value(c.body); this.box.focus(); }
  close() { this.draft = null; this.box.set_value(""); }

  save(rkey) {
    const c = this.draft;
    if (!c || !rkey) return;
    const body = this.box.value().trim();
    let list = commentsOf(rkey).filter((x) => x.id !== c.id);
    if (body) list = [...list, { ...c, id: c.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, body, at: Date.now() }];
    saveRepo(rkey, { comments: list });
    this.close();
  }
  remove(rkey, id) {
    saveRepo(rkey, { comments: commentsOf(rkey).filter((x) => x.id !== id) });
    if (this.draft?.id === id) this.close();
  }

  // Cmd+Enter saves and Escape closes while a comment is open; true when the key was used.
  key(e, rkey) {
    if (!this.draft) return false;
    if (e.keystroke === "cmd-enter" || e.keystroke === "ctrl-enter") this.save(rkey);
    else if (e.keystroke === "escape") this.close();
    else return false;
    return true;
  }

  panel(t, rkey, done, note) {
    const c = this.draft;
    if (!c) return null;
    return ideaUI(v_flex()).flex_none().p(10).gap(8).border_t(1).border_color(t.border).bg(isIdea() ? t.background : t.chrome)
      .child(h_flex().gap(8).items_center().text_size(uiSize(12))
        .child(icon("message", 13).text_color(t.accent))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted)
          .child(`${T(c.id ? "Edit comment on {where}" : "Comment on {where}", { where: where(c) })}${c.side === "old" ? T(" (removed)") : ""}${T("  ·  drag over line numbers for a range")}`)))
      .child(Textarea.new(this.box))
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().text_size(uiSize(11.5)).text_color(t.dim).child(note ?? ""))
        .when(Boolean(c.id), (e) => e.child(button("cb-del", T("Delete"), (_e, cx) => { this.remove(rkey, c.id); done(cx); })))
        .child(button("cb-cancel", T("Cancel"), (_e, cx) => { this.close(); done(cx); }, { tip: "Esc" }))
        .child(button("cb-save", c.id ? T("Update") : T("Add comment"), (_e, cx) => { this.save(rkey); done(cx); }, { solid: true, tip: "Cmd+Enter" })));
  }
}
