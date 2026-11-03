// Code navigation and branch review for Herdr. One mod, several views, chosen
// by the block's props: { view: "code" | "review" | "tabs" | "status" | ... }.
//   code      — source view with language-server help (bridge/lsp_bridge.py)
//   review    — diff against a base branch, line comments, sent to a terminal
//   tabs      — the editor area's strip; keeps its stack on the right child
//   status    — status-bar item: running language servers, language
//   tabmenu   — a tab's right-click popup: Close / Close Others / Close All
//   termfiles — the paths named in a terminal, to open in the code view
//   termmenu  — the terminal right-click menu (the layout's "terminal_menu"),
//               opened by Herdr with props { tab: "pane", target }
//   panehead  — a terminal pane's header: split / zoom / close
//   the idea layout (tools.js, everywhere.js): stripe, toolmenu, toolsettings, toolempty, toolheader, toolbar,
//   structure, problems, crumbs, projects, everywhere
import { View, div } from "gpui-kit";
import { props as herdrProps } from "herdr";
import CodeView from "./code.js";
import Review from "./review.js";
import Tabs, { TabMenu } from "./tabs.js";
import Status from "./status.js";
import { TermMenu, TermFiles } from "./termfiles.js";
import PaneHead from "./panehead.js";
import { Stripe, ToolMenu, ToolSettings, ToolEmpty, ToolHeader, Notifications, Toolbar, Structure, Problems, Crumbs, Projects } from "./tools.js";
import { Everywhere } from "./everywhere.js";
import { RunMenu, RunConfigs } from "./run.js";
import { HttpEnvMenu } from "./http.js";

const VIEWS = { code: CodeView, review: Review, tabs: Tabs, status: Status, tabmenu: TabMenu, termfiles: TermFiles, termmenu: TermMenu, panehead: PaneHead,
  stripe: Stripe, notifications: Notifications, toolmenu: ToolMenu, toolsettings: ToolSettings, toolempty: ToolEmpty, toolheader: ToolHeader, toolbar: Toolbar, structure: Structure, problems: Problems, crumbs: Crumbs,
  projects: Projects, everywhere: Everywhere, runmenu: RunMenu, runconfigs: RunConfigs, httpenv: HttpEnvMenu };

export default class CodeNav extends View {
  init(initProps, cx) {
    const p = { ...(initProps ?? {}), ...(herdrProps() ?? {}) };
    this.view = p.view ?? (p.tab === "pane" && p.target ? "termmenu" : "review");
    const Impl = VIEWS[this.view] ?? null;
    this.impl = Impl ? new Impl() : null;
    this.impl?.init(p, cx);
  }
  render(cx) {
    return this.impl ? this.impl.render(cx) : div().p(12).child(`codenav: unknown view "${this.view}"`);
  }
  async close() { this.impl?.release?.(); }
}
