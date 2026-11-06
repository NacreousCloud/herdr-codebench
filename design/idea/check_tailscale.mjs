import assert from "node:assert/strict";

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

console.log("PASS Tailscale parsing, runner, async state and authorization");
