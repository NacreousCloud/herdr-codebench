// IntelliJ's HTTP Client for .http files in the code view: a green ▶ beside each
// request, and above the file "Run All" and "Run with: <environment ▾>". Requests
// run with the ijhttp CLI in their own terminal tab ("▶ HTTP"), from a hidden
// copy beside the .http file (its scripts' relative paths keep working) that
// carries client.global over from earlier runs; the copy is removed after.
// Environments come from http-client.env.json and http-client.private.env.json,
// looked for from the file's folder up to the repository; the chosen one is kept per folder in shared "codenav.httpEnv".
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared, setShared, props, closeOverlay, openOverlay, readTextFile, writeTextFile, exec, run } from "herdr";
import { T } from "./i18n.js";
import { IDEA, isIdea, uiSize, ideaUI, MenuController, uiMenu, uiNotify, uiIconButton } from "./idea-design.js";
import { basename } from "./common.js";
import { toolImage } from "./ideaicons.js";
import { runConfig } from "./run.js";
import { ACTION_GROUPS, getAction, actionPresentation } from "./actions.js";
import { groupItems } from "./toolbar-model.js";

const METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT|WEBSOCKET|GRPC|GRAPHQL)\s+\S/;
export const isHttp = (path) => /\.(http|rest)$/i.test(path ?? "");
const dirOf = (p) => p.replace(/\/[^/]*$/, "");

// Each request: the line of its method, and its block (from its ### to the next).
export function httpRequests(lines) {
  const out = [];
  let start = 0, seen = false;
  lines.forEach((l, i) => {
    if (/^###/.test(l)) { start = i; seen = false; }
    else if (!seen && METHOD.test(l)) { out.push({ line: i, start }); seen = true; }
  });
  return out.map((r) => {
    const next = lines.findIndex((l, i) => i > r.line && /^###/.test(l));
    return { ...r, end: next === -1 ? lines.length : next };
  });
}

// The environment files nearest the .http file, and the names in them.
export async function httpEnvs(path, root) {
  let dir = dirOf(path);
  const files = {};
  for (;;) {
    for (const [k, name] of [["pub", "http-client.env.json"], ["priv", "http-client.private.env.json"]]) {
      if (files[k]) continue;
      const text = await readTextFile(`${dir}/${name}`).catch(() => null);
      if (text !== null) files[k] = { path: `${dir}/${name}`, text };
    }
    if (files.pub || !root || dir === root || !dir.startsWith(root) || !dir.includes("/")) break;
    dir = dirOf(dir);
  }
  const names = new Set();
  for (const f of [files.pub, files.priv]) {
    // Names go into a command typed into the terminal: none with control characters.
    try { for (const k of Object.keys(JSON.parse(f?.text ?? "{}"))) if (k !== "$shared" && !CONTROL.test(k)) names.add(k); } catch {}
  }
  return { pub: files.pub?.path ?? null, priv: files.priv?.path ?? null, names: [...names] };
}

const store = () => shared("codenav.httpEnv") ?? {};
export const chosenEnv = (path, envs) => { const e = store()[dirOf(path)]; return envs.names.includes(e) ? e : envs.names[0] ?? null; };
const CONTROL = /[\u0000-\u001f\u007f]/;
const sq = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;

// client.global, kept between runs as IntelliJ keeps it: in memory only (they can be
// keys), by folder, until Herdr restarts. Each run starts by setting the values kept
// before, and its response handlers name a passing test after the globals the file's
// scripts set (ijhttp shows no client.log), read back from the run's JUnit report.
const MARK = "@@CODENAV-GLOBALS ";
const kept = new Map();
// A JS literal that can't end the {% %} block it is written into.
const literal = (v) => JSON.stringify(v).replace(/%/g, "\\u0025");
const globalNames = (lines) => [...new Set([...lines.join("\n").matchAll(/client\.global\.set\(\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]))];

// One request's block with the saved globals set first and the named ones logged after.
function withGlobals(block, saved, names, first) {
  const out = [...block], method = out.findIndex((l) => METHOD.test(l));
  if (method === -1) return out;
  const sets = first ? Object.entries(saved).map(([k, v]) => `client.global.set(${literal(k)}, ${literal(v)});`) : [];
  let at = method;
  if (sets.length) {
    const pre = out.findIndex((l, i) => i < method && /^<\s*\{%/.test(l));
    if (pre === -1) { out.splice(method, 0, "< {%", ...sets, "%}"); at = method + sets.length + 2; }
    else out.splice(pre + 1, 0, ...sets), at = method + sets.length;
  }
  if (names.length) {
    const log = `client.test(${literal(MARK)} + JSON.stringify({ ${names.map((n) => `${literal(n)}: client.global.get(${literal(n)})`).join(", ")} }), function () {});`;
    const post = out.findIndex((l, i) => i > at && /^>\s*\{%/.test(l));
    const close = post === -1 ? -1 : out.findIndex((l, i) => i >= post && /%\}\s*$/.test(l));
    if (close === -1) out.push("", "> {%", log, "%}");
    else if (close === post) out[close] = out[close].replace(/%\}\s*$/, `; ${log} %}`);
    else out.splice(close, 0, log);
  }
  return out;
}

const fresh = (dir, ext) => `${dir}/.codenav-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${ext}`;
const sh = (script, ...args) => exec("sh", ["-c", script, "sh", ...args]).then((r) => r.code === 0).catch(() => false);

// The run's copy beside the .http file, private and with nothing in argv: written
// inside a fresh 0700 folder (the run's report folder), made 0600 there, then moved
// beside the file without replacing anything (a link included) already there.
async function privateCopy(dir, text) {
  const report = fresh(dir, ""), staged = `${report}/request.http`, copy = fresh(dir, ".http");
  if (!await sh('umask 077 && mkdir "$1"', report)) return null;
  const ok = await writeTextFile(staged, text, null).then(() => true).catch(() => false)
    && await sh('chmod 600 "$1"', staged)
    && await sh('[ ! -e "$2" ] && [ ! -L "$2" ] && mv -n "$1" "$2" && [ -f "$2" ] && [ ! -e "$1" ]', staged, copy);
  if (!ok) { await exec("rm", ["-rf", report]).catch(() => {}); return null; }
  return { copy, report };
}

// Runs one request (req) or the whole file.
export async function runHttp(path, lines, envs, req, after) {
  const dir = dirOf(path), env = chosenEnv(path, envs);
  if ([path, envs.pub, envs.priv, env].some((x) => x && CONTROL.test(x))) return;
  const opts = ["ijhttp", "-L", "VERBOSE", "--no-progress", ...(env ? ["-e", sq(env)] : []), ...(envs.pub ? ["-v", sq(envs.pub)] : []), ...(envs.priv ? ["-p", sq(envs.priv)] : [])].join(" ");
  // An earlier build kept globals in shared state (on disk): drop them.
  if (shared("codenav.httpGlobals")) setShared("codenav.httpGlobals", null);
  const saved = kept.get(dir) ?? {}, names = globalNames(lines);
  const reqs = req ? [req] : httpRequests(lines);
  if (!reqs.length) { uiNotify({ group: "codenav.http", title: T("No HTTP requests in this file"), level: "warning" }); return; }
  const text = [...(req ? [] : lines.slice(0, reqs[0]?.start ?? 0)), ...reqs.flatMap((r, i) => withGlobals(lines.slice(r.start, r.end), saved, names, i === 0))].join("\n") + "\n";
  const made = await privateCopy(dir, text);
  if (!made) { uiNotify({ group: "codenav.http", title: T("Could not prepare HTTP request"), body: T("Check that the request folder is writable."), level: "error" }); return; }
  const { copy: tmp, report } = made;
  // The copy holds kept values: gone when the run ends, even by Ctrl+C.
  runConfig({ name: "HTTP", command: `(trap ${sq(`rm -f ${sq(tmp)}`)} EXIT INT TERM; ${opts} -r ${sq(report)} ${sq(tmp)})`, folder: dir }, after);
  // The run's report, once written: the globals it ended with.
  const unxml = (x) => x.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (let i = 0; i < 900; i++) {
    await exec("sleep", ["1"]).catch(() => {});
    const out = await readTextFile(`${report}/report.xml`).catch(() => null);
    if (out === null) continue;
    // Only the names the file's scripts set, and only plain values.
    const found = {};
    for (const m of out.matchAll(/name="@@CODENAV-GLOBALS ([^"]*)"/g)) {
      let got; try { got = JSON.parse(unxml(m[1])); } catch { continue; }
      for (const n of names) if (Object.hasOwn(got ?? {}, n) && ["string", "number", "boolean"].includes(typeof got[n])) found[n] = got[n];
    }
    if (Object.keys(found).length) kept.set(dir, { ...saved, ...found });
    break;
  }
  await exec("rm", ["-rf", report]).catch(() => {});
}

// Above the file: Run All, and the environment.
export function httpBar(t, view, cx) {
  const h = view.http;
  if (!h) return null;
  const env = chosenEnv(view.shown.path, h.envs);
  const btn = (id, children, tip, action) => h_flex().id(id).h(26).px(7).gap(6).flex_none().items_center().rounded(5).cursor_pointer()
    .hover((s) => s.bg(t.hover)).tooltip(tip).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => action()).children(children);
  const defaultActions = [
    btn("http-all", [toolImage("runAll", 16)], T("Run All Requests in File"), () => runHttp(view.shown.path, view.lines, h.envs, null, () => view.showTerminal())),
    div().w(1).h(16).mx(4).bg(t.input),
  ];
  const toolbarItems = isIdea() ? groupItems("HTTP.toolbar", shared("codenav.customization") ?? {}, ACTION_GROUPS).map(item => {
    if (item.kind === "separator") return div().w(1).h(16).mx(4).bg(t.input);
    const action = getAction(item.action);
    if (!action) return div();
    const presentation = actionPresentation(action, { layout: "idea", document: view.shown, hasWorkspace: true });
    return uiIconButton(`http-custom-${item.id}`, toolImage(item.icon ?? action.icon, 16), () => run(action.command),
      { tip: T(action.label), disabled: !presentation.enabled, active: presentation.selected });
  }) : defaultActions;
  return h_flex().h(isIdea() ? IDEA.toolHeaderHeight : 34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border).bg(isIdea() ? t.surface : t.chrome).text_size(uiSize(12.5))
    .when(isIdea(), (e) => ideaUI(e))
    .children(toolbarItems)
    .child(div().text_color(t.muted).child(T("Run with:")))
    .child(btn("http-env", [div().text_color(t.foreground).child(env ?? T("No environment")), toolImage("chevronDown", 14)], T("Environment"),
      () => openOverlay({ mod: "codenav", props: { view: "httpenv", dir: dirOf(view.shown.path), names: h.envs.names }, kind: "popup", width: 220, height: Math.min(300, 50 + h.envs.names.length * 30) })))
    .child(div().flex_1())
    .child(div().text_size(uiSize(11.5)).text_color(t.dim).child(h.envs.pub ? basename(h.envs.pub) + (h.envs.priv ? ` + ${basename(h.envs.priv)}` : "") : T("No http-client.env.json")));
}

// The environment picker.
export class HttpEnvMenu {
  init(_p, cx) {
    const { dir, names = [] } = props() ?? {};
    this.menu = new MenuController(cx, Math.max(0, names.indexOf(store()[dir] ?? names[0])));
    this.menu.focus.focus();
  }
  release() { this.menu.release(); }
  render(cx) {
    const { dir, names = [], overlay } = props() ?? {}, cur = store()[dir] ?? names[0];
    const rows = names.map((n, i) => ({ id: `he-${i}`, label: n, icon: () => n === cur ? toolImage("show", 12) : div().w(12),
      action: () => setShared("codenav.httpEnv", { ...store(), [dir]: n }) }));
    if (!rows.length) rows.push({ id: "he-empty", label: T("No http-client.env.json"), disabled: true });
    return uiMenu("http-env-menu", rows, this.menu, cx, { width: 220, maxHeight: 300, onClose: () => closeOverlay(overlay) });
  }
}
