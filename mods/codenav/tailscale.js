const STATUS_KINDS = {
  Running: "on",
  Stopped: "off",
  Starting: "busy",
  NeedsLogin: "login",
  NeedsMachineAuth: "login",
  NoState: "login",
};

export function sanitizeError(value, limit = 500) {
  let text;
  if (typeof value === "string") text = value;
  else if (value && typeof value.message === "string") text = value.message;
  else {
    try { text = JSON.stringify(value); }
    catch { text = String(value ?? ""); }
  }
  text = String(text ?? "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gi, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) text = "Unknown error";
  const bounded = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 500;
  return text.slice(0, bounded);
}

export function parseStatus(stdout) {
  const status = JSON.parse(stdout);
  const backend = status?.BackendState;
  if (typeof backend !== "string" || backend.length === 0) {
    throw new Error("Tailscale status has no string BackendState");
  }
  if (Object.prototype.hasOwnProperty.call(STATUS_KINDS, backend)) {
    return { kind: STATUS_KINDS[backend], backend };
  }
  return {
    kind: "error",
    backend,
    error: sanitizeError(`Unsupported Tailscale backend state: ${backend}`),
  };
}

export function commandCandidates(platform) {
  if (platform === "linux") return ["tailscale"];
  if (platform === "macos") return [
    "tailscale",
    "/usr/local/bin/tailscale",
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  ];
  if (platform === "windows") return [
    "tailscale.exe",
    "C:\\Program Files\\Tailscale\\tailscale.exe",
  ];
  throw new Error(`Unsupported platform: ${platform}`);
}

export function createRunner(execFn, platform) {
  const candidates = commandCandidates(platform);
  let cached = null;

  return async function runTailscale(args = []) {
    const rejected = cached;
    let lastError;
    if (cached) {
      try { return await execFn(cached, args, { on: null }); }
      catch (error) {
        if (cached === rejected) cached = null;
        lastError = error;
      }
    }

    for (const command of candidates) {
      if (command === rejected) continue;
      try {
        const result = await execFn(command, args, { on: null });
        cached = command;
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}

export class TailscaleModel {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.observed = null;
    this.busy = null;
    this.pendingDisconnect = null;
    this.lastActionError = null;
    this.pollError = null;
    this.polling = null;
    this.generation = 0;
  }

  beginPoll() {
    if (this.busy || this.polling !== null) return null;
    this.polling = ++this.generation;
    return this.polling;
  }

  applyPoll(generation, observed) {
    if (generation === null || this.polling !== generation || this.generation !== generation) return false;
    this.polling = null;
    this.observed = observed;
    this.pollError = null;
    this.lastActionError = null;
    return true;
  }

  failPoll(generation, error) {
    if (generation === null || this.polling !== generation || this.generation !== generation) return false;
    this.polling = null;
    this.pollError = sanitizeError(error);
    return true;
  }

  beginAction(action) {
    this.expireDisconnect();
    if (this.busy || this.pendingDisconnect) return null;
    const generation = ++this.generation;
    this.polling = null;
    this.busy = { action, generation };
    return generation;
  }

  completeAction(generation) {
    if (!this.busy || this.busy.generation !== generation || this.generation !== generation) return false;
    this.busy = null;
    return true;
  }

  failAction(generation, error) {
    if (!this.completeAction(generation)) return false;
    this.lastActionError = sanitizeError(error);
    return true;
  }

  requestDisconnect(token, ttl = 60_000) {
    this.expireDisconnect();
    if (this.pendingDisconnect) return false;
    if (typeof token !== "string" || token.length === 0) throw new Error("A disconnect token is required");
    if (!Number.isFinite(ttl) || ttl < 0) throw new Error("A finite disconnect token lifetime is required");
    this.pendingDisconnect = { token, expiresAt: this.now() + ttl };
    return true;
  }

  consumeDisconnect(token) {
    const pending = this.pendingDisconnect;
    if (!pending) return { ok: false, reason: "missing" };
    if (this.now() >= pending.expiresAt) {
      this.pendingDisconnect = null;
      return { ok: false, reason: "expired" };
    }
    if (pending.token !== token) return { ok: false, reason: "mismatch" };
    this.pendingDisconnect = null;
    return { ok: true };
  }

  cancelDisconnect(token) {
    if (!this.pendingDisconnect) return false;
    if (this.now() >= this.pendingDisconnect.expiresAt) {
      this.pendingDisconnect = null;
      return false;
    }
    if (this.pendingDisconnect.token !== token) return false;
    this.pendingDisconnect = null;
    return true;
  }

  expireDisconnect() {
    if (!this.pendingDisconnect || this.now() < this.pendingDisconnect.expiresAt) return false;
    this.pendingDisconnect = null;
    return true;
  }

  view() {
    this.expireDisconnect();
    if (this.busy) return { kind: "busy", operation: this.busy.action };
    if (this.pendingDisconnect) return { kind: "busy", operation: "confirm" };
    if (this.lastActionError) return { kind: "error", error: this.lastActionError };
    if (this.pollError) return { kind: "error", error: this.pollError };
    if (this.observed) return this.observed;
    return { kind: "busy", operation: "checking" };
  }
}
