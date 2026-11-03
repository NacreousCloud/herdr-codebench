// Client of bridge/lsp_bridge.py: the bridge keeps the language servers running,
// this asks it one short question at a time over localhost.
import { hc, exec, appHome } from "herdr";

export const PORT = 47821;
const URL = `http://127.0.0.1:${PORT}`;
const SCRIPT = () => `${appHome()}/mods/codenav/bridge/lsp_bridge.py`;

let starting = null;

async function post(method, body) {
  const r = await fetch(`${URL}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
}

async function alive() {
  try { await post("health"); return true; } catch { return false; }
}

// A python3 with pygments (syntax colors) if there is one; PATHs differ between shells.
const FIND_PYTHON = 'for p in python3 /usr/local/bin/python3 /opt/homebrew/bin/python3 /usr/bin/python3; do "$p" -c "import pygments" 2>/dev/null && { command -v "$p"; exit 0; }; done; command -v python3';
async function python() {
  const r = await exec("sh", ["-c", FIND_PYTHON]).catch(() => null);
  return r?.stdout.trim().split("\n").pop() || "python3";
}

// Starts the bridge in a herdr-core terminal without Herdr labels, so it stays
// out of the window and outlives it.
export function ensureBridge(sleep) {
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
