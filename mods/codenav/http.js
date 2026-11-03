// IntelliJ's HTTP Client for .http files in the code view: a green ▶ beside each
// request, and above the file "Run All" and "Run with: <environment ▾>". Requests
// run with the ijhttp CLI in their own terminal tab ("▶ HTTP"), from a hidden
// copy beside the .http file (its scripts' relative paths keep working) that
// carries client.global over from earlier runs; the copy is removed after.
// Environments come from http-client.env.json and http-client.private.env.json,
// looked for from the file's folder up to the repository; the chosen one is kept per folder in shared "codenav.httpEnv".
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared, props, closeOverlay, openOverlay, readTextFile, exec } from "herdr";
import { T } from "./i18n.js";
import { basename } from "./common.js";
import { toolImage } from "./ideaicons.js";
import { runConfig } from "./run.js";

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

// A path nobody can guess, created fresh and private (only you can read it) in one
// step, with its text: it fails when anything, a link included, is there already.
async function freshPath(dir, ext, text = null) {
  const path = `${dir}/.codenav-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${ext}`;
  const make = text === null ? 'umask 077 && mkdir "$1"' : 'umask 077 && set -C && printf "%s" "$2" > "$1"';
  const r = await exec("sh", ["-c", make, "sh", path, text ?? ""]).catch(() => null);
  return r?.code === 0 ? path : null;
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
  const text = [...(req ? [] : lines.slice(0, reqs[0]?.start ?? 0)), ...reqs.flatMap((r, i) => withGlobals(lines.slice(r.start, r.end), saved, names, i === 0))].join("\n") + "\n";
  const tmp = await freshPath(dir, ".http", text), report = tmp && await freshPath(dir, "");
  if (!tmp || !report) { if (tmp) exec("rm", ["-f", tmp]).catch(() => {}); return; }
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
  return h_flex().h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border).bg(t.chrome).text_size(12.5)
    .child(btn("http-all", [toolImage("runAll", 16)], T("Run All Requests in File"),
      () => runHttp(view.shown.path, view.lines, h.envs, null, () => view.showTerminal())))
    .child(div().w(1).h(16).mx(4).bg(t.input))
    .child(div().text_color(t.muted).child(T("Run with:")))
    .child(btn("http-env", [div().text_color(t.foreground).child(env ?? T("No environment")), toolImage("chevronDown", 14)], T("Environment"),
      () => openOverlay({ mod: "codenav", props: { view: "httpenv", dir: dirOf(view.shown.path), names: h.envs.names }, kind: "popup", width: 220, height: Math.min(300, 50 + h.envs.names.length * 30) })))
    .child(div().flex_1())
    .child(div().text_size(11.5).text_color(t.dim).child(h.envs.pub ? basename(h.envs.pub) + (h.envs.priv ? ` + ${basename(h.envs.priv)}` : "") : T("No http-client.env.json")));
}

// The environment picker.
export class HttpEnvMenu {
  init() {}
  render() {
    const t = theme(), { dir, names, overlay } = props() ?? {};
    const cur = store()[dir] ?? names?.[0];
    return v_flex().size_full().p(4).gap(2).bg(t.popover).text_color(t.foreground)
      .children((names ?? []).map((n) => h_flex().id(`he-${n}`).h(28).px(10).gap(8).items_center().rounded(5).text_size(12.5).cursor_pointer()
        .hover((e) => e.bg(t.hover)).on_click(() => { closeOverlay(overlay); setShared("codenav.httpEnv", { ...store(), [dir]: n }); })
        .child(div().w(14).child(n === cur ? toolImage("show", 12) : div())).child(div().child(n))))
      .when(!names?.length, (e) => e.child(div().p(10).text_size(12).text_color(t.dim).child(T("No http-client.env.json"))));
  }
}
