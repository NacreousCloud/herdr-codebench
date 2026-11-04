// Keeps the Mac awake (caffeinate -ims: no idle, disk or system sleep; the
// display may still sleep). Modes, in shared "codenav.caffeinate":
//   auto — while an agent is working (the default)
//   on   — always
//   off  — never
// The status bar shows ☕ and cycles the mode on click; `codenav.caffeinate[:auto|on|off]`.
// caffeinate waits on Herdr's process (-w), so it ends with the app even after a crash;
// its pid is kept in shared "codenav.caffeinate.pid" so a reloaded mod adopts or ends it.
import { exec, shared, setShared, agents } from "herdr";

const MODE = "codenav.caffeinate", PID = "codenav.caffeinate.pid";
export const MODES = ["auto", "on", "off"];
export const caffeinateMode = () => MODES.includes(shared(MODE)) ? shared(MODE) : "auto";
export function setCaffeinateMode(mode) { setShared(MODE, MODES.includes(mode) ? mode : MODES[(MODES.indexOf(caffeinateMode()) + 1) % MODES.length]); }
export const working = () => agents().filter((a) => a.status === "working").length;
export const wanted = () => caffeinateMode() === "on" || (caffeinateMode() === "auto" && working() > 0);
export const awake = () => Boolean(shared(PID));

// The exec's parent is Herdr; fall back to looking it up if that ever changes.
const START = `p=$PPID
case "$(ps -o comm= -p "$p" 2>/dev/null)" in *Herdr*) ;; *) p=$(pgrep -n -x Herdr || echo "$p") ;; esac
caffeinate -ims -w "$p" >/dev/null 2>&1 &
echo $!`;
// Only a caffeinate is ended: a stale pid may belong to something else by now.
const STOP = `ps -o comm= -p "$1" 2>/dev/null | grep -q caffeinate && kill "$1"; exit 0`;

export async function stopCaffeinate() {
  const pid = shared(PID);
  if (!pid) return;
  setShared(PID, null);
  await exec("sh", ["-c", STOP, "sh", String(pid)]).catch(() => {});
}

async function startCaffeinate() {
  const r = await exec("sh", ["-c", START]);
  const pid = Number(r.stdout.trim());
  if (!(pid > 0)) throw new Error(r.stderr || "caffeinate did not start");
  setShared(PID, pid);
}

// Called from the status bar's render: brings the process in line with the mode.
// One change at a time; a change asked for while one runs is checked after it.
export function syncCaffeinate(self, cx) {
  if (self.caffeinating) return;
  const want = wanted();
  if (self.caffeinated === undefined) {
    // First look from this copy: a pid from before a reload is checked, then adopted or ended.
    self.caffeinating = true;
    cx.spawn(async (cx) => {
      const pid = shared(PID);
      const alive = pid && (await exec("sh", ["-c", `ps -o comm= -p "${Number(pid)}" | grep -q caffeinate`]).catch(() => ({ code: 1 }))).code === 0;
      if (!alive && pid) setShared(PID, null);
      self.caffeinated = Boolean(alive); self.caffeinating = false; cx.notify();
    });
    return;
  }
  if (want === self.caffeinated) return;
  // A start that failed (no caffeinate here) isn't retried until the mode changes.
  const ask = `${caffeinateMode()}:${want}`;
  if (self.caffeinateFailed === ask) return;
  self.caffeinating = true;
  cx.spawn(async (cx) => {
    try { if (want) await startCaffeinate(); else await stopCaffeinate(); self.caffeinated = want; }
    catch { self.caffeinated = awake(); self.caffeinateFailed = ask; }
    finally { self.caffeinating = false; cx.notify(); }
  });
}
