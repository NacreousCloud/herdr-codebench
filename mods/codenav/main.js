// Code navigation and branch review for Herdr. One mod, several views, chosen
// by the block's props: { view: "code" | "review" | "tabs" | "status" }.
//   code   — source view with language-server help (bridge/lsp_bridge.py)
//   review — diff against a base branch, line comments, sent to a terminal
//   tabs   — the editor area's strip; keeps its stack on the right child
//   status — status-bar item: running language servers, Review button
import { View, div } from "gpui-kit";
import { props as herdrProps } from "herdr";
import CodeView from "./code.js";
import Review from "./review.js";
import Tabs from "./tabs.js";
import Status from "./status.js";

const VIEWS = { code: CodeView, review: Review, tabs: Tabs, status: Status };

export default class CodeNav extends View {
  init(initProps, cx) {
    const p = { ...(initProps ?? {}), ...(herdrProps() ?? {}) };
    this.view = p.view ?? "review";
    const Impl = VIEWS[this.view] ?? null;
    this.impl = Impl ? new Impl() : null;
    this.impl?.init(p, cx);
  }
  render(cx) {
    return this.impl ? this.impl.render(cx) : div().p(12).child(`codenav: unknown view "${this.view}"`);
  }
  async close() { this.impl?.release?.(); }
}
