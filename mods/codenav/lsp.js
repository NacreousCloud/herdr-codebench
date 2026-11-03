// Client of bridge/lsp_bridge.py: the bridge keeps the language servers running,
// this asks it one short question at a time over localhost. Each request carries
// the token the bridge wrote to its state file (readable by this user only), and
// the bridge's answer to "health" must name the pid from that file.
import { hc, exec, appHome, home, readTextFile } from "herdr";

const PORT = 47821;
const URL = `http://127.0.0.1:${PORT}`;
const SCRIPT = () => `${appHome()}/mods/codenav/bridge/lsp_bridge.py`;
const STATE = () => `${home()}/.cache/herdr-codenav/bridge.json`;

let starting = null;
let state = null;

async function readState() {
  const text = await readTextFile(STATE()).catch(() => null);
  try { state = text ? JSON.parse(text) : null; } catch { state = null; }
  return state;
}

async function post(method, body) {
  if (!state) await readState();
  if (!state?.token) throw new Error("connect: no bridge");
  const r = await fetch(`${URL}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Codenav-Token": state.token },
    body: JSON.stringify(body ?? {}),
  });
  if (r.status === 403) { state = null; throw new Error("connect: bridge token changed"); }
  const data = await r.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
}

// Ours: it knows the token and is the process the state file names.
async function alive() {
  try {
    await readState();
    const h = await post("health");
    return h?.pid === state?.pid;
  } catch { return false; }
}

// A python3 with pygments (syntax colors) if there is one; PATHs differ between shells.
const FIND_PYTHON = 'for p in python3 /usr/local/bin/python3 /opt/homebrew/bin/python3 /usr/bin/python3; do "$p" -c "import pygments" 2>/dev/null && { command -v "$p"; exit 0; }; done; command -v python3';
async function python() {
  const r = await exec("sh", ["-c", FIND_PYTHON]).catch(() => null);
  return r?.stdout.trim().split("\n").pop() || "python3";
}

// Starts the bridge in a herdr-core terminal without Herdr labels, so it stays
// out of the window and outlives it.
function ensureBridge(sleep) {
  if (!starting) {
    starting = (async () => {
      if (await alive()) return true;
      await hc(["run", "--bg", "--no-parent", "--name", "codenav-lsp", "--", await python(), "-I", SCRIPT(), "--port", String(PORT)]).catch(() => null);
      for (let i = 0; i < 40; i++) {
        await sleep(150);
        if (await alive()) return true;
      }
      return false;
    })().finally(() => { starting = null; });
  }
  return starting;
}

export async function lsp(method, body, sleep) {
  try { return await post(method, body); }
  catch (e) {
    if (!/fetch|connect|refused|network/i.test(String(e.message ?? e))) throw e;
    if (!(await ensureBridge(sleep))) throw new Error("LSP bridge did not start (python3 needed)");
    return post(method, body);
  }
}

// Asks a running bridge only; never starts one (null when none answers).
export async function peek(method) {
  try { return await post(method); } catch { return null; }
}
