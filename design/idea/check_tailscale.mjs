import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  TailscaleModel,
  commandCandidates,
  createRunner,
  parseStatus,
  sanitizeError,
} from "../../mods/codenav/tailscale.js";

assert.deepEqual(parseStatus('{"BackendState":"Running"}'), { kind: "on", backend: "Running" });
assert.deepEqual(parseStatus('{"BackendState":"Stopped"}'), { kind: "off", backend: "Stopped" });
assert.deepEqual(parseStatus('{"BackendState":"Starting"}'), { kind: "busy", backend: "Starting" });
for (const state of ["NeedsLogin", "NeedsMachineAuth", "NoState"]) {
  assert.deepEqual(parseStatus(JSON.stringify({ BackendState: state })), { kind: "login", backend: state });
}
assert.deepEqual(parseStatus('{"BackendState":"FutureState"}'), {
  kind: "error",
  backend: "FutureState",
  error: "Unsupported Tailscale backend state: FutureState",
});
assert.deepEqual(parseStatus('{"BackendState":"toString"}'), {
  kind: "error",
  backend: "toString",
  error: "Unsupported Tailscale backend state: toString",
});
assert.throws(() => parseStatus("{"), SyntaxError);
assert.throws(() => parseStatus("{}"), /BackendState/);
assert.throws(() => parseStatus('{"BackendState":3}'), /BackendState/);
assert.throws(() => parseStatus('{"BackendState":""}'), /BackendState/);

const sanitized = sanitizeError("bad\u001b[31m red\u001b[0m\nnext\u0000 ".repeat(100));
assert.ok(sanitized.startsWith("bad red next bad red next"), "sanitized errors retain useful text");
assert.doesNotMatch(sanitized, /[\u0000-\u001f\u007f-\u009f]/, "sanitized errors contain no control characters");
assert.ok(sanitized.length <= 500, "sanitized errors are bounded");
assert.equal(sanitizeError(new Error("launch failed")), "launch failed");
assert.equal(sanitizeError("\u001b[31m\u001b[0m"), "Unknown error");

assert.deepEqual(commandCandidates("linux"), ["tailscale"]);
assert.deepEqual(commandCandidates("macos"), [
  "tailscale",
  "/usr/local/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
]);
assert.deepEqual(commandCandidates("windows"), [
  "tailscale.exe",
  "C:\\Program Files\\Tailscale\\tailscale.exe",
]);

const launches = [];
const launchCounts = new Map();
const runner = createRunner(async (command, args, options) => {
  launches.push({ command, args, options });
  const count = (launchCounts.get(command) ?? 0) + 1;
  launchCounts.set(command, count);
  if (command === "tailscale" && count === 1) throw new Error("not on PATH");
  if (command === "/usr/local/bin/tailscale" && count === 1) return { code: 1, stdout: "", stderr: "not logged in" };
  if (command === "/usr/local/bin/tailscale" && count === 2) return { code: 2, stdout: "", stderr: "still launched" };
  if (command === "/usr/local/bin/tailscale" && count === 3) throw new Error("binary was removed");
  return { code: 0, stdout: command, stderr: "" };
}, "macos");

assert.deepEqual(await runner(["status", "--json"]), { code: 1, stdout: "", stderr: "not logged in" });
assert.deepEqual(launches.map(call => call.command), ["tailscale", "/usr/local/bin/tailscale"]);
assert.deepEqual(await runner(["up"]), { code: 2, stdout: "", stderr: "still launched" });
assert.equal(launches.at(-1).command, "/usr/local/bin/tailscale", "a launched non-zero result remains cached");
assert.deepEqual(await runner(["status"]), { code: 0, stdout: "tailscale", stderr: "" });
assert.deepEqual(launches.slice(-2).map(call => call.command), [
  "/usr/local/bin/tailscale",
  "tailscale",
], "a rejected cached launch is invalidated and fallback resumes");
await runner(["down"]);
assert.equal(launches.at(-1).command, "tailscale", "the replacement launched candidate is cached");
for (const call of launches) assert.deepEqual(call.options, { on: null });
assert.deepEqual(launches[0].args, ["status", "--json"]);

let linuxLaunches = 0;
const linuxRunner = createRunner(async () => {
  linuxLaunches++;
  if (linuxLaunches > 1) throw new Error("cached binary was removed");
  return { code: 0, stdout: "", stderr: "" };
}, "linux");
await linuxRunner(["status"]);
await assert.rejects(linuxRunner(["status"]), /cached binary was removed/);

let now = 1_000;
const model = new TailscaleModel(() => now);
assert.deepEqual(model.view(), { kind: "busy", operation: "checking" });
const initialPoll = model.beginPoll();
assert.equal(model.applyPoll(initialPoll, { kind: "off", backend: "Stopped" }), true);
assert.deepEqual(model.view(), { kind: "off", backend: "Stopped" });

const oldPoll = model.beginPoll();
const action = model.beginAction("up");
assert.equal(model.applyPoll(oldPoll, { kind: "on", backend: "Running" }), false, "an action supersedes an older poll");
assert.deepEqual(model.view(), { kind: "busy", operation: "up" });
assert.equal(model.failAction(action, "timeout\u001b[31m"), true);
assert.equal(model.lastActionError, "timeout");
assert.deepEqual(model.view(), { kind: "error", error: "timeout" });

const recovery = model.beginPoll();
assert.equal(model.applyPoll(recovery, { kind: "on", backend: "Running" }), true);
assert.equal(model.lastActionError, null, "an authoritative poll clears the action error");
assert.deepEqual(model.view(), { kind: "on", backend: "Running" });

const failedPoll = model.beginPoll();
assert.equal(model.failPoll(failedPoll, "status unavailable"), true);
assert.deepEqual(model.view(), { kind: "error", error: "status unavailable" });
const observedAgain = model.beginPoll();
model.applyPoll(observedAgain, { kind: "on", backend: "Running" });

const failedDown = model.beginAction("down");
model.failAction(failedDown, "permission denied");
assert.deepEqual(model.view(), { kind: "error", error: "permission denied" });
assert.equal(model.requestDisconnect("one-use", 60), true);
assert.equal(model.requestDisconnect("replacement", 60), false, "a pending token cannot be replaced");
assert.deepEqual(model.view(), { kind: "busy", operation: "confirm" }, "pending confirmation precedes an action error");
assert.deepEqual(model.consumeDisconnect("wrong"), { ok: false, reason: "mismatch" });
assert.equal(model.pendingDisconnect.token, "one-use", "a wrong token does not revoke the real token");

const consumed = model.consumeDisconnect("one-use");
assert.deepEqual(consumed, { ok: true });
assert.equal(model.pendingDisconnect, null, "the one-use token is consumed synchronously");
const refresh = Promise.resolve().then(() => assert.equal(model.pendingDisconnect, null, "async refresh starts after revocation"));
assert.deepEqual(model.consumeDisconnect("one-use"), { ok: false, reason: "missing" });
await refresh;
assert.deepEqual(model.view(), { kind: "error", error: "permission denied" }, "the action error precedes observed state");

assert.equal(model.requestDisconnect("cancel-me", 60), true);
assert.equal(model.cancelDisconnect("wrong"), false);
assert.equal(model.pendingDisconnect.token, "cancel-me");
assert.equal(model.cancelDisconnect("cancel-me"), true);
assert.equal(model.pendingDisconnect, null, "cancel revokes authorization");

assert.equal(model.requestDisconnect("expires", 60), true);
now += 60;
assert.deepEqual(model.consumeDisconnect("expires"), { ok: false, reason: "expired" });
assert.equal(model.pendingDisconnect, null, "expiry revokes authorization");

const retry = model.beginAction("down");
assert.deepEqual(model.view(), { kind: "busy", operation: "down" }, "an action precedes the action error");
assert.equal(model.completeAction(retry), true);
assert.deepEqual(model.view(), { kind: "error", error: "permission denied" }, "completion alone does not clear an action error");
const finalPoll = model.beginPoll();
model.applyPoll(finalPoll, { kind: "off", backend: "Stopped" });
assert.deepEqual(model.view(), { kind: "off", backend: "Stopped" });

const root = new URL("../../", import.meta.url);
const readUiSource = async path => {
  try { return await readFile(new URL(path, root), "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};
const [mainSource, statusSource, confirmSource] = await Promise.all([
  readUiSource("mods/codenav/main.js"),
  readUiSource("mods/codenav/status.js"),
  readUiSource("mods/codenav/tailscale-confirm.js"),
]);

assert.match(mainSource, /import TailscaleConfirm from "\.\/tailscale-confirm\.js";/,
  "main imports the dedicated Tailscale confirmation view");
assert.match(mainSource, /tailscaleconfirm:\s*TailscaleConfirm/,
  "main registers the tailscaleconfirm view key");

assert.match(statusSource, /import \{[^}]*\bexec\b[^}]*\bwindow\b[^}]*\} from "herdr";/s,
  "status imports local exec and window platform APIs");
for (const helper of ["parseStatus", "createRunner", "sanitizeError", "TailscaleModel"]) {
  assert.match(statusSource, new RegExp(`\\b${helper}\\b`), `status uses the existing ${helper} API`);
}
assert.match(statusSource, /createRunner\(exec,\s*window\(\)\.platform\)/,
  "status initializes the shared runner with local exec and the current platform");
assert.doesNotMatch(statusSource, /exec\([^)]*tailscale/i,
  "status never bypasses the shared runner with a direct Tailscale exec");
assert.match(statusSource, /\["status",\s*"--json"\]/,
  "status polls the authoritative JSON status");
assert.match(statusSource, /cx\.timer\.every\(5_?000/,
  "status polls every five seconds");
assert.match(statusSource, /shared\("layout"\)\s*===\s*"codebench"/,
  "the Tailscale chip is Codebench-only");
assert.match(statusSource, /state\.backend\s*===\s*"Starting"[\s\S]*?Tailscale: Starting/,
  "the disabled Starting backend has an accurate full tooltip");
assert.match(statusSource, /view:\s*"tailscaleconfirm"[\s\S]*?modal:\s*true/,
  "the Running click opens a modal codenav confirmation view");
assert.match(statusSource, /tailscale-down:/,
  "status handles token-scoped disconnect commands");
assert.match(statusSource, /tailscale-cancel:/,
  "status handles token-scoped cancellation commands");
const downMethod = statusSource.slice(statusSource.indexOf("confirmTailscaleDown("), statusSource.indexOf("cancelTailscaleDown("));
assert.ok(downMethod.indexOf("consumeDisconnect(") >= 0 && downMethod.indexOf("consumeDisconnect(") < downMethod.indexOf("cx.spawn("),
  "disconnect authorization is consumed synchronously before async work starts");
assert.ok(downMethod.indexOf("readTailscaleStatus()") > downMethod.indexOf("cx.spawn("),
  "disconnect performs an authoritative refresh after consuming authorization");
assert.match(downMethod, /if \(observed\.backend !== "Running"\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?\["down"\]/,
  "disconnect returns without running down unless the fresh state is Running");
assert.match(statusSource, /\["up",\s*"--timeout=10s"\]/,
  "Stopped click uses the bounded direct up action");

assert.match(confirmSource, /this\.focus\s*=\s*cx\.focus_handle\(\);[\s\S]*?this\.focus\.focus\(\)/,
  "confirmation creates and focuses its own focus handle");
assert.match(confirmSource, /this\.done\s*=\s*false/,
  "confirmation owns a local completion guard");
assert.match(confirmSource, /if\s*\(this\.done\)\s*return/,
  "confirmation ignores duplicate completion paths");
assert.match(confirmSource, /run\(`codenav\.\$\{command\}:\$\{this\.token\}`\)/,
  "confirmation emits token-scoped codenav commands");
assert.match(confirmSource, /confirm\(\)\s*\{\s*this\.finish\("tailscale-down"\);\s*\}/,
  "Confirm selects the token-scoped down command");
assert.match(confirmSource, /cancel\(\)\s*\{\s*this\.finish\("tailscale-cancel"\);\s*\}/,
  "Cancel and Escape select the token-scoped cancel command");
assert.match(confirmSource, /e\.(?:key|keystroke)\s*===\s*"escape"[\s\S]*?cancel/,
  "Escape follows the cancellation path");
assert.match(confirmSource, /cx\.timer\.after\(60_?000,[\s\S]*?cancel[\s\S]*?notify/,
  "a 60-second Herdr timer cancels and notifies expiration");
assert.match(confirmSource, /closeOverlay\(/,
  "every completion path closes the confirmation overlay");
assert.equal([...confirmSource.matchAll(/closeOverlay\(/g)].length, 1,
  "the guarded completion funnel contains exactly one overlay close");

console.log("PASS Tailscale parsing, runner, async state, authorization and Codebench UI contracts");
