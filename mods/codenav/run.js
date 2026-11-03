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
import { tilde } from "./common.js";
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
export const openRunConfigs = () => openOverlay({ mod: "codenav", props: { view: "runconfigs" }, kind: "dialog", width: 720, height: 420 });

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
  await hc(["send", term, c.command]).catch(() => {});
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

// The editor: the project's configurations on the left, the chosen one's name, command and folder on the right.
export class RunConfigs {
  init() {
    const st = runStore();
    this.configs = st.configs.map((c) => ({ ...c }));
    this.at = Math.min(st.selected ?? 0, Math.max(this.configs.length - 1, 0));
    this.name = InputState.new({ placeholder: T("Name") });
    this.command = InputState.new({ placeholder: T("Command, e.g. ./gradlew bootRun") });
    this.folder = InputState.new({ placeholder: T("Folder (default: the project's)") });
    for (const [field, input] of [["name", this.name], ["command", this.command], ["folder", this.folder]])
      input.on("change", (_e, cx) => { if (this.configs[this.at]) { this.configs[this.at][field] = input.value(); cx.notify(); } });
    this.load();
  }
  load() {
    const c = this.configs[this.at] ?? { name: "", command: "", folder: "" };
    this.name.set_value(c.name ?? ""); this.command.set_value(c.command ?? ""); this.folder.set_value(c.folder ?? "");
  }
  render() {
    const t = theme(), { overlay } = props() ?? {};
    const btn = (id, label, action, solid) => div().id(id).px(12).py(5).rounded(5).text_size(12).cursor_pointer()
      .when(Boolean(solid), (e) => e.bg(t.solid).text_color(t.solid_foreground)).when(!solid, (e) => e.border_1().border_color(t.input).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => action(cx)).child(label);
    const field = (label, input) => v_flex().gap(4).child(div().text_size(12).text_color(t.muted).child(label))
      .child(div().px(8).py(4).rounded(5).border_1().border_color(t.input).bg(t.background).child(Input.new(input)));
    return v_flex().size_full().bg(t.popover).text_color(t.foreground).text_size(13)
      .child(h_flex().h(40).flex_none().px(14).items_center().font_semibold().child(T("Run Configurations")))
      .child(h_flex().flex_1().min_h(0).border_t(1).border_b(1).border_color(t.border)
        .child(v_flex().w(220).flex_none().h_full().border_r(1).border_color(t.border)
          .child(h_flex().h(32).flex_none().px(6).gap(2).items_center()
            .child(btn("rc-add", "+", (cx) => { this.configs.push({ name: T("New configuration"), command: "", folder: "" }); this.at = this.configs.length - 1; this.load(); cx.notify(); }))
            .child(btn("rc-del", "−", (cx) => { this.configs.splice(this.at, 1); this.at = Math.max(0, this.at - 1); this.load(); cx.notify(); })))
          .child(div().id("rc-list").flex_1().min_h(0).overflow_y_scrollbar()
            .children(this.configs.map((c, i) => h_flex().id(`rc-${i}`).h(28).mx(4).px(8).gap(8).items_center().rounded(4).cursor_pointer()
              .bg(i === this.at ? t.selected : "#00000000").hover((e) => e.bg(i === this.at ? t.selected : t.hover))
              .on_click((_e, cx) => { this.at = i; this.load(); cx.notify(); })
              .child(toolImage("run", 14)).child(div().flex_1().min_w(0).truncate().child(c.name || T("Unnamed")))))))
        .child(v_flex().flex_1().min_w(0).p(14).gap(12)
          .when(!this.configs.length, (e) => e.child(div().text_size(12.5).text_color(t.dim).child(T("No configurations yet. Add one with +."))))
          .when(this.configs.length > 0, (e) => e.child(field(T("Name"), this.name)).child(field(T("Command"), this.command))
            .child(field(T("Folder"), this.folder))
            .child(div().text_size(11.5).text_color(t.dim).child(T("Runs in a new terminal tab of this project ({folder}).", { folder: tilde(spaces().find((s) => s.active)?.folder ?? "") }))))))
      .child(h_flex().h(48).flex_none().px(14).gap(8).items_center().justify_end()
        .child(btn("rc-cancel", T("Cancel"), () => closeOverlay(overlay)))
        .child(btn("rc-save", T("OK"), () => {
          const configs = this.configs.filter((c) => c.name?.trim() || c.command?.trim());
          saveRun({ configs, selected: Math.min(this.at, Math.max(configs.length - 1, 0)) });
          closeOverlay(overlay);
        }, true)));
  }
}
