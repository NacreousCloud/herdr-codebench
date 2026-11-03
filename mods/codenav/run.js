// Run configurations, as IntelliJ's run widget (the idea layout's toolbar, top
// right): a named command per project, run in its own terminal tab ("▶ name")
// of the space; running again uses that tab, asking first when something
// still runs there.
// Kept in shared "codenav.run" by project folder: { configs: [{name, command,
// folder}], selected }. runmenu is the widget's popup, runconfigs the editor.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, shared, setShared, spaces, panes, run, props, closeOverlay, openOverlay, hc, exec } from "herdr";
import { T } from "./i18n.js";
import { tilde, icon, codeFont, uiFontFamily } from "./common.js";
import { toolImage } from "./ideaicons.js";

const KEY = "codenav.run";
const project = () => { const s = spaces().find((x) => x.active); return s ? `${s.machine ?? ""}:${s.folder}` : null; };
export const runStore = () => (shared(KEY) ?? {})[project()] ?? { configs: [], selected: 0 };
function saveRun(patch) {
  const k = project();
  if (!k) return;
  setShared(KEY, { ...(shared(KEY) ?? {}), [k]: { ...runStore(), ...patch } });
}
export const tabName = (c) => `▶ ${c.name}`;
export const configTab = (c) => c && spaces().find((s) => s.active)?.tabs.find((t) => t.name === tabName(c));
const tabTerminal = (tab) => tab && panes().find((p) => p.tab === tab.id && p.terminal);
// Something other than the shell runs in the configuration's tab.
export const isRunning = (c) => { const p = tabTerminal(configTab(c)); return Boolean(p && p.program && !p.program.shell); };
export const openRunConfigs = () => openOverlay({ mod: "codenav", props: { view: "runconfigs" }, kind: "dialog", width: 880, height: 580 });

// "A=1; B=two words" before the command, through env, so a compound command gets them too.
const quote = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
function withEnv(c) {
  const vars = (c.env ?? "").split(/[;\n]/).map((x) => x.trim()).filter((x) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x));
  if (!vars.length) return c.command;
  return `env ${vars.map((v) => { const i = v.indexOf("="); return `${v.slice(0, i)}=${quote(v.slice(i + 1))}`; }).join(" ")} sh -c ${quote(c.command)}`;
}

const pause = (sec) => exec("sleep", [String(sec)]).catch(() => {});

// Runs a configuration in its tab: made the first time (a shell in the folder),
// reused after; something still running there asks before it is stopped.
export function runConfig(c, after) {
  if (!c?.command) return openRunConfigs();
  if (isRunning(c)) {
    setShared("codenav.runPending", c);
    return openOverlay({ mod: "confirm", kind: "dialog", width: 420, height: 170,
      props: { title: T("'{name}' is still running", { name: c.name }), detail: T("Stop it and run it again?"), command: { name: "codenav.run-restart" } } });
  }
  start(c, after);
}
// The confirmation's answer: stop what runs, then run again.
export async function restartPending(after) {
  const c = shared("codenav.runPending");
  if (!c) return;
  setShared("codenav.runPending", null);
  await stopConfig(c);
  start(c, after);
}
async function start(c, after) {
  let tab = configTab(c);
  if (!tab) {
    run("tab.new", { name: tabName(c), folder: c.folder || spaces().find((s) => s.active)?.folder });
    for (let i = 0; i < 30 && !tabTerminal(tab = configTab(c)); i++) await pause(0.15);
  } else run("tab.select", { id: tab.id });
  const term = tabTerminal(tab)?.terminal;
  if (!term) return;
  after?.();
  await hc(["send", term, withEnv(c)]).catch(() => {});
}
// Stops what runs in the configuration's tab (Ctrl+C, twice if it lingers); the tab stays.
export async function stopConfig(c) {
  const term = tabTerminal(configTab(c))?.terminal;
  if (!term) return;
  await hc(["interrupt", term]).catch(() => {});
  for (let i = 0; i < 10 && isRunning(c); i++) await pause(0.2);
  if (isRunning(c)) { await hc(["keys", term, "ctrl+c"]).catch(() => {}); await pause(0.5); }
}

// The widget's popup: pick a configuration, or edit them.
export class RunMenu {
  init() {}
  render() {
    const t = theme(), { overlay } = props() ?? {}, st = runStore();
    const item = (id, children, action) => h_flex().id(`rm-${id}`).h(30).px(10).gap(8).items_center().rounded(5).text_size(12.5).cursor_pointer()
      .hover((e) => e.bg(t.hover)).on_click(() => { closeOverlay(overlay); action(); }).children(children);
    return v_flex().size_full().p(4).gap(2).bg(t.popover).text_color(t.foreground)
      .children(st.configs.map((c, i) => item(`c${i}`, [toolImage("run", 14), div().flex_1().min_w(0).truncate().when(i === st.selected, (e) => e.font_semibold()).child(c.name),
        div().flex_none().max_w(180).truncate().text_size(11).text_color(t.dim).child(c.command)], () => saveRun({ selected: i }))))
      .when(st.configs.length > 0, (e) => e.child(div().h(1).my(2).bg(t.border)))
      .child(item("edit", [toolImage("settings", 14), div().child(T("Edit Configurations…"))], () => openRunConfigs()));
  }
}

// The editor, laid out as IntelliJ's Run/Debug Configurations: the project's
// configurations as a tree on the left (one kind: shell commands), the chosen
// one's fields on the right, Run / Cancel / Apply / OK below.
const FIELDS = ["name", "command", "folder", "env"];
export class RunConfigs {
  init() {
    const st = runStore();
    this.configs = st.configs.map((c) => ({ ...c }));
    this.saved = JSON.stringify(this.configs);
    this.at = Math.min(st.selected ?? 0, Math.max(this.configs.length - 1, 0));
    this.inputs = {
      name: InputState.new({ placeholder: T("Name") }),
      command: InputState.new({ placeholder: "./gradlew bootRun" }),
      folder: InputState.new({ placeholder: T("The project's folder") }),
      env: InputState.new({ placeholder: "SPRING_PROFILES_ACTIVE=local; PORT=8080" }),
    };
    for (const f of FIELDS) this.inputs[f].on("change", (_e, cx) => { if (this.configs[this.at]) { this.configs[this.at][f] = this.inputs[f].value(); cx.notify(); } });
    this.load();
  }
  load() {
    const c = this.configs[this.at] ?? {};
    for (const f of FIELDS) this.inputs[f].set_value(c[f] ?? "");
  }
  add(copy) {
    const base = copy && this.configs[this.at] ? { ...this.configs[this.at], name: T("{name} (copy)", { name: this.configs[this.at].name }) }
      : { name: T("Unnamed"), command: "", folder: "", env: "" };
    this.configs.push(base); this.at = this.configs.length - 1; this.load(); this.inputs.name.focus();
  }
  apply() {
    const configs = this.configs.filter((c) => c.name?.trim() || c.command?.trim());
    saveRun({ configs, selected: Math.min(this.at, Math.max(configs.length - 1, 0)) });
    this.saved = JSON.stringify(this.configs);
  }

  render() {
    const t = theme(), { overlay } = props() ?? {}, c = this.configs[this.at], dirty = JSON.stringify(this.configs) !== this.saved;
    const space = spaces().find((s) => s.active), mono = codeFont().family;
    const tool = (id, name, tip, action, enabled = true) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(5)
      .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { action(); cx.notify(); }))
      .when(!enabled, (e) => e.opacity(0.35)).tooltip(tip).child(toolImage(name, 16));
    const box = (child, mono_) => div().h(30).px(9).flex().items_center().rounded(4).border_1().border_color(t.input).bg(t.background)
      .when(Boolean(mono_), (e) => e.font_family(mono)).child(child);
    const row = (label, field, hint) => v_flex().gap(5)
      .child(h_flex().gap(12).items_center()
        .child(div().w(104).flex_none().text_color(t.foreground).child(label))
        .child(div().flex_1().min_w(0).child(field)))
      .when(Boolean(hint), (e) => e.child(div().pl(116).text_size(12).text_color(t.dim).child(hint)));
    const button = (id, children, action, kind) => h_flex().id(id).h(30).px(16).gap(7).flex_none().items_center().justify_center().rounded(5).text_size(13).cursor_pointer()
      .when(kind === "solid", (e) => e.bg(t.solid).text_color(t.solid_foreground).hover((s) => s.opacity(0.9)))
      .when(kind !== "solid", (e) => e.border_1().border_color(t.input).text_color(kind === "off" ? t.dim : t.foreground).when(kind !== "off", (x) => x.hover((s) => s.bg(t.hover))))
      .on_click((_e, cx) => { if (kind !== "off") action(cx); }).children(children);
    const done = () => closeOverlay(overlay);

    // the tree
    const left = v_flex().w(270).flex_none().h_full().border_r(1).border_color(t.border)
      .child(h_flex().h(36).flex_none().px(8).gap(2).items_center()
        .child(tool("rc-add", "add", T("Add New Configuration"), () => this.add(false)))
        .child(tool("rc-remove", "remove", T("Remove Configuration"), () => { this.configs.splice(this.at, 1); this.at = Math.max(0, this.at - 1); this.load(); }, Boolean(c)))
        .child(tool("rc-copy", "copy", T("Copy Configuration"), () => this.add(true), Boolean(c))))
      .child(div().h(1).flex_none().bg(t.border))
      .child(div().id("rc-tree").flex_1().min_h(0).py(4).overflow_y_scrollbar()
        .child(h_flex().h(28).px(10).gap(6).items_center()
          .child(icon(this.configs.length ? "chevron-down" : "chevron-right", 12).text_color(t.muted))
          .child(toolImage("terminal", 16))
          .child(div().font_semibold().child(T("Shell Command"))))
        .children(this.configs.map((x, i) => h_flex().id(`rc-${i}`).h(28).pl(36).pr(10).gap(7).items_center().cursor_pointer()
          .bg(i === this.at ? t.selected : "#00000000").hover((e) => e.bg(i === this.at ? t.selected : t.hover))
          .on_click((_e, cx) => { this.at = i; this.load(); cx.notify(); })
          .child(toolImage("runAction", 15))
          .child(div().flex_1().min_w(0).truncate().child(x.name?.trim() || T("Unnamed"))))))
      .child(div().px(14).py(12).text_size(12).text_color(t.dim).child(T("Saved per project")));

    // the fields
    const right = !c ? v_flex().flex_1().items_center().justify_center().gap(12)
        .child(div().text_color(t.dim).child(T("No run configurations yet.")))
        .child(button("rc-first", [toolImage("add", 14), div().child(T("Add New Configuration"))], (cx) => { this.add(false); cx.notify(); }))
      : v_flex().flex_1().min_w(0).px(22).py(18).gap(16)
        .child(row(T("Name:"), box(Input.new(this.inputs.name))))
        .child(row(T("Run on:"), box(h_flex().gap(8).items_center().child(toolImage(space?.machine ? "terminal" : "homeFolder", 15))
          .child(div().child(space?.machine ?? T("Local machine")))),
          T("Runs in this project's own terminal tab; running it again reuses the tab.")))
        .child(div().h(1).bg(t.border))
        .child(row(T("Command:"), box(Input.new(this.inputs.command), true), T("Run by the shell as typed, e.g. ./gradlew bootRun or npm run dev")))
        .child(row(T("Working directory:"), box(Input.new(this.inputs.folder), true), tilde(c.folder || space?.folder || "")))
        .child(row(T("Environment:"), box(Input.new(this.inputs.env), true), T("KEY=value pairs separated by ;")));

    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(13).font_family(uiFontFamily())
      .child(h_flex().h(44).flex_none().px(18).items_center().border_b(1).border_color(t.border)
        .child(div().text_size(13.5).font_semibold().child(T("Run/Debug Configurations"))))
      .child(h_flex().flex_1().min_h(0).child(left).child(right))
      .child(h_flex().h(58).flex_none().px(18).gap(10).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1())
        .child(button("rc-run", [toolImage("runAction", 15), div().child(T("Run"))], () => { this.apply(); done(); runConfig(this.configs[this.at]); }, c?.command ? null : "off"))
        .child(button("rc-cancel", [div().child(T("Cancel"))], () => done()))
        .child(button("rc-apply", [div().child(T("Apply"))], (cx) => { this.apply(); cx.notify(); }, dirty ? null : "off"))
        .child(button("rc-ok", [div().child(T("OK"))], () => { this.apply(); done(); }, "solid")));
  }
}
