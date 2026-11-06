# Tailscale Status Toggle Implementation Plan

> Scope update (2026-11-06): deliver the macOS status toggle, local install,
> verification, and personal-fork publication now. Task 2's Windows-installer
> prerequisite and Task 4's PowerShell installer are deferred and must not be
> executed in this delivery.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe local Tailscale ON/OFF control to Herdr Codebench and a Windows installer so the same personal fork can be installed on both machines.

**Architecture:** A dependency-free `tailscale.js` module owns CLI discovery, JSON classification, sanitization, generation-based async state, and disconnect authorization. `status.js` adapts that model to the existing Codebench status view, while a dedicated modal `tailscale-confirm.js` owns every confirmation exit path. The existing shell installer remains unchanged; a PowerShell installer mirrors it and reuses the Python key merger after that merger learns Herdr's typed command form.

**Tech Stack:** Herdr JavaScript mods, GPUI Kit, Node.js built-in assertions/tests, Python 3, Windows PowerShell 5.1+/PowerShell 7, Git.

---

## File map

- Create `mods/codenav/tailscale.js`: pure state, parsing, executable fallback, and authorization helpers.
- Create `mods/codenav/tailscale-confirm.js`: modal confirmation UI with confirm/cancel/escape/expiry cleanup.
- Modify `mods/codenav/status.js`: polling, actions, command handling, notifications, and status chip.
- Modify `mods/codenav/main.js`: register the Tailscale confirmation view.
- Create `design/idea/check_tailscale.mjs`: dependency-free and integration-contract regression tests.
- Modify `design/idea/install_keys.py`: validate string and typed-object Herdr actions.
- Modify `design/idea/check_shortcuts.mjs`: typed-action preservation and invalid-object tests.
- Create `install.ps1`: Windows equivalent of `install.sh`.
- Create `design/idea/check_install_ps1.mjs`: static contract checks usable without PowerShell on macOS.
- Modify `README.md`: document the toggle and Windows install/update flow.

### Task 1: Build and test the pure Tailscale model

**Files:**
- Create: `mods/codenav/tailscale.js`
- Create: `design/idea/check_tailscale.mjs`

- [ ] **Step 1: Write failing classification and sanitization tests**

Create `design/idea/check_tailscale.mjs` with Node strict assertions for:

```js
assert.deepEqual(parseStatus('{"BackendState":"Running"}'), { kind: 'on', backend: 'Running' });
assert.deepEqual(parseStatus('{"BackendState":"Stopped"}'), { kind: 'off', backend: 'Stopped' });
assert.deepEqual(parseStatus('{"BackendState":"Starting"}'), { kind: 'busy', backend: 'Starting' });
for (const state of ['NeedsLogin', 'NeedsMachineAuth', 'NoState']) {
  assert.deepEqual(parseStatus(JSON.stringify({ BackendState: state })), { kind: 'login', backend: state });
}
assert.throws(() => parseStatus('{'));
assert.throws(() => parseStatus('{}'));
assert.equal(sanitizeError('bad\u001b[31m\n'.repeat(200)).length <= 500, true);
```

- [ ] **Step 2: Write failing platform and runner tests**

Require exact candidate order for Linux, macOS, and Windows. Inject a fake
`exec` that rejects the first launch and returns `{code: 1}` from the second;
assert that fallback occurs only for the rejection, that the second candidate
is cached despite the non-zero result, and that all calls receive `{on: null}`.

- [ ] **Step 3: Write failing generation, error recovery, and token tests**

Exercise a pure `TailscaleModel`:

```js
const oldPoll = model.beginPoll();
const action = model.beginAction('up');
assert.equal(model.applyPoll(oldPoll, { kind: 'off' }), false);
model.failAction(action, 'timeout');
assert.equal(model.view().kind, 'error');
const recovery = model.beginPoll();
model.applyPoll(recovery, { kind: 'on', backend: 'Running' });
assert.equal(model.view().kind, 'on');
```

Also test one pending disconnect token at a time, wrong-token rejection,
confirm consumption exactly once, immediate revocation before any asynchronous
refresh, cancel revocation, and expiry notification state using an injected
clock.

- [ ] **Step 4: Run the new test and verify it fails**

Run:

```bash
node design/idea/check_tailscale.mjs
```

Expected: FAIL because `mods/codenav/tailscale.js` does not exist.

- [ ] **Step 5: Implement the minimal pure module**

Export:

```js
export function parseStatus(stdout) {}
export function commandCandidates(platform) {}
export function sanitizeError(value, limit = 500) {}
export function createRunner(execFn, platform) {}
export class TailscaleModel {}
```

`createRunner` must cache the first executable whose process launches, return
non-zero `ExecResult` objects unchanged, invalidate the cache only on a rejected
launch, and always pass `{on: null}`. `TailscaleModel` must keep observed state,
busy/pending state, and last action error separate; action generations supersede
poll generations and a successful authoritative poll clears the action error.

- [ ] **Step 6: Run the test and verify it passes**

Run: `node design/idea/check_tailscale.mjs`

Expected: `PASS Tailscale parsing, runner, async state and authorization`.

- [ ] **Step 7: Commit**

```bash
git add mods/codenav/tailscale.js design/idea/check_tailscale.mjs
git commit -m "feat(codenav): add Tailscale state model"
```

### Task 2: Preserve typed commands during key installation

**Files:**
- Modify: `design/idea/check_shortcuts.mjs`
- Modify: `design/idea/install_keys.py`

- [ ] **Step 1: Add failing typed-action tests**

Extend the temporary target in `check_shortcuts.mjs` with:

```js
'ctrl-shift-r': { command: 'layout.resize', args: { id: 'sidebar', px: 240 } }
```

Assert installation succeeds, the object remains deeply equal, and no extra
backup appears on the second run. Add invalid fixtures for an empty command,
non-object `args`, and an object without `command`; each must fail without
changing the target.

- [ ] **Step 2: Run the shortcut test and verify it fails**

Run: `node design/idea/check_shortcuts.mjs`

Expected: FAIL with `Invalid key bindings` for the valid typed command.

- [ ] **Step 3: Implement action validation**

Add a focused helper to `install_keys.py`:

```python
def valid_action(action):
    return isinstance(action, str) or (
        isinstance(action, dict)
        and isinstance(action.get("command"), str)
        and bool(action["command"])
        and ("args" not in action or isinstance(action["args"], dict))
    )
```

Use it for source and target validation. Do not normalize, copy, or rewrite
existing action values except through the existing whole-document JSON write
when missing bindings are added.

- [ ] **Step 4: Run the shortcut test and verify it passes**

Run: `node design/idea/check_shortcuts.mjs`

Expected: both existing PASS lines plus typed-command coverage.

- [ ] **Step 5: Commit**

```bash
git add design/idea/install_keys.py design/idea/check_shortcuts.mjs
git commit -m "fix(installer): preserve typed key commands"
```

### Task 3: Integrate the status chip and safe modal confirmation

**Files:**
- Create: `mods/codenav/tailscale-confirm.js`
- Modify: `mods/codenav/status.js`
- Modify: `mods/codenav/main.js`
- Modify: `design/idea/check_tailscale.mjs`

- [ ] **Step 1: Add failing UI-contract tests**

Extend `check_tailscale.mjs` to read the three UI sources and require:

- `main.js` registers `tailscaleconfirm`.
- The ON click opens `codenav` with `{view: "tailscaleconfirm"}` and
  `modal: true`.
- The confirm view emits token-scoped down/cancel commands, handles Escape, and
  schedules expiry through `cx.timer.after`.
- Every status/action runner call comes from the pure runner, whose test already
  guarantees `{on: null}`.
- The chip is guarded by `shared("layout") === "codebench"`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node design/idea/check_tailscale.mjs`

Expected: FAIL because the view and status integration do not exist.

- [ ] **Step 3: Implement the modal confirmation view**

Follow the repository's existing dialog styling helpers. The view must:

- focus itself;
- stop duplicate completion with a local `done` flag;
- emit `codenav.tailscale-down:<token>` on Confirm;
- emit `codenav.tailscale-cancel:<token>` on Cancel or Escape;
- on 60-second expiry emit cancel, close itself, and notify that confirmation
  expired;
- close its overlay exactly once.

Register it in `mods/codenav/main.js` as `tailscaleconfirm`.

- [ ] **Step 4: Wire polling and command actions into Status**

Import `exec` and `window` from `herdr` plus the pure helpers. In `init`:

- create the runner and model;
- poll immediately and every 5000 ms;
- route `tailscale-down:<token>` and `tailscale-cancel:<token>` before the
  existing command cases;
- synchronously validate and consume a valid disconnect token before any
  asynchronous work, then re-poll and run `down` only when the authoritative
  result is still `Running`;
- run `up --timeout=10s` only from `Stopped`;
- coalesce timer refreshes while an action is busy;
- bound every error through `sanitizeError` and notify failures.

- [ ] **Step 5: Render the Codebench-only chip**

Add the chip before LSP using the existing theme and `uiSize` helpers:

- `● TS ON`, `○ TS OFF`, `◌ TS …`, `! TS LOGIN`, or `! TS`;
- full state/error in the tooltip;
- success/muted/warning/error colors;
- pointer and hover only when the current state permits an action;
- Running and Running-error clicks always call the modal confirmation flow;
- Stopped and Stopped-error clicks call `up` directly.

- [ ] **Step 6: Run focused and repository checks**

Run:

```bash
node design/idea/check_tailscale.mjs
python3 design/idea/sync_ui.py --check
node --experimental-vm-modules design/idea/check_system.mjs
herdr-app check mods/codenav
```

Expected: all PASS/check success. If `herdr-app check` repeats the known
LaunchServices hang, stop it, record that environment limitation, and require
the live-app status/screenshot check in Task 5.

- [ ] **Step 7: Commit**

```bash
git add mods/codenav/tailscale-confirm.js mods/codenav/tailscale.js mods/codenav/status.js mods/codenav/main.js design/idea/check_tailscale.mjs
git commit -m "feat(codenav): add local Tailscale toggle"
```

### Task 4: Add a parity Windows installer

**Files:**
- Create: `install.ps1`
- Create: `design/idea/check_install_ps1.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write the failing installer contract test**

Create `check_install_ps1.mjs` to read `install.ps1` and assert the script
contains and uses:

- PowerShell 5.1-compatible syntax and `$ErrorActionPreference = 'Stop'`;
- `HERDR_APP_HOME` and `HERDR_LAYOUT_RESET`;
- Python resolution in `py -3`, `python3`, `python` order;
- `sync_ui.py --check` and `install_keys.py` calls;
- all five machine-owned exclusions;
- reparse-point removal without following the target;
- existing JSON layout preservation unless reset is `1`;
- theme overwrite and per-mod `herdr-app check`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node design/idea/check_install_ps1.mjs`

Expected: FAIL because `install.ps1` does not exist.

- [ ] **Step 3: Implement `install.ps1`**

Use small functions with one responsibility:

```powershell
function Resolve-Python { ... }
function Remove-ReparsePoint([string] $Path) { ... }
function Copy-Mod([IO.DirectoryInfo] $Source, [string] $Destination) { ... }
```

Use `Get-ChildItem`, `Copy-Item`, and exact relative-path exclusions rather than
`robocopy` exit-code semantics. Require `herdr-app` and Python before changing
the destination. Reuse `install_keys.py` so conflict preservation and backups
stay identical across platforms.

- [ ] **Step 4: Document Windows installation and updates**

Add README commands:

```powershell
git clone --branch dev https://github.com/NacreousCloud/herdr-codebench.git
cd herdr-codebench
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Document `git pull` plus rerunning the installer, `HERDR_LAYOUT_RESET=1`, the
Python 3 requirement, and that each Herdr controls only its own local Tailscale.

- [ ] **Step 5: Run static and existing installer checks**

Run:

```bash
node design/idea/check_install_ps1.mjs
node design/idea/check_shortcuts.mjs
```

Expected: PASS. Record that PowerShell parsing and a dry install remain required
on the target Windows machine because `pwsh` is unavailable on this Mac.

- [ ] **Step 6: Commit**

```bash
git add install.ps1 design/idea/check_install_ps1.mjs README.md
git commit -m "feat(installer): support Windows deployment"
```

### Task 5: Verify, install locally, and prepare remote delivery

**Files:**
- Modify only if a verification failure requires a scoped fix.

- [ ] **Step 1: Run the complete automated suite**

Run all commands:

```bash
python3 design/idea/sync_ui.py --check
node --experimental-vm-modules design/idea/check_system.mjs
node --experimental-vm-modules design/idea/check_settings.mjs
node --experimental-vm-modules design/idea/check_tabs.mjs
node --experimental-vm-modules design/idea/check_file_selection.mjs
node design/idea/check_shortcuts.mjs
node design/idea/check_tailscale.mjs
node design/idea/check_install_ps1.mjs
```

Expected: every command exits 0 with PASS/check output.

- [ ] **Step 2: Re-run the Herdr mod check**

Run: `herdr-app check mods/codenav`

Expected: success. If the previously observed LaunchServices hang persists,
capture it as an environment limitation rather than claiming this check passed.

- [ ] **Step 3: Install into the Mac Herdr config**

Run `./install.sh` only after the source checks pass. If the embedded
`herdr-app check` hits the known hang before installation completes, stop and
use a scoped copy of only the already-validated changed mod files; do not reset
the user's layout or keys.

- [ ] **Step 4: Inspect the running app without disconnecting**

Run:

```bash
herdr-app status
herdr-app shot /tmp/herdr-tailscale-toggle.png
tailscale status --json
```

Confirm the status chip is visible in Codebench, reports ON, has no Herdr errors,
and do not exercise `down` automatically because that would sever active remote
sessions. Visually inspect the screenshot.

- [ ] **Step 5: Review the branch and publish with the personal account**

Run `git diff dev...HEAD`, `git status --short`, and a final review. Verify the
GitHub identity as `NacreousCloud` for the repository operation, then push the
feature branch to the personal `fork` remote. Integration into `dev` follows the
finishing-branch workflow; do not touch `company-fork`.

- [ ] **Step 6: Provide the Windows handoff**

Give the exact pull/install/PowerShell validation commands. Windows deployment
is complete only after that machine reports a successful `herdr-app check`,
shows the local status chip, and confirms OFF→ON locally.
