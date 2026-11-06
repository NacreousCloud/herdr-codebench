# Tailscale Status Toggle Design

## Goal

Expose the local machine's Tailscale connection state in Herdr's Codebench
status bar and let the user connect or disconnect without leaving Herdr.
Installing the same repository on macOS and Windows must provide the same
control on each machine.

## Scope and safety boundary

- The control operates only on the machine running the current Herdr app.
- It does not execute against a selected remote Herdr machine. Disconnecting a
  remote machine from another host could strand it with no path to reconnect.
- Disconnecting requires confirmation because active Herdr/SSH sessions can be
  interrupted immediately.
- Connecting does not require confirmation.

## UI

Add a compact chip to the existing `codenav` status view when the active layout
is Codebench. Idea does not show the chip. Codebench's status block remains at
its existing 260 px width, so the visible copy is deliberately short and the
tooltip carries the full state:

- `● TS ON` in the success color when `BackendState` is `Running`.
- `○ TS OFF` in the muted color when `BackendState` is `Stopped`.
- `◌ TS …` while checking, starting, or changing state.
- `! TS LOGIN` when authentication or machine approval is required. Clicking is
  disabled and the tooltip directs the user to the native Tailscale client.
- `! TS` in the error color when the CLI is unavailable, its output is invalid,
  or a command fails. The tooltip contains a bounded, sanitized error.

Clicking ON opens Herdr's existing confirmation dialog. Confirming runs
`tailscale down`. Clicking OFF runs `tailscale up --timeout=10s` directly. The
chip ignores additional clicks while an operation is in progress. `NeedsLogin`,
`NeedsMachineAuth`, `NoState`, unknown states, and transitional states do not
run `up` or `down`; their tooltips describe the recovery action.

## Runtime design

Keep the feature in `mods/codenav/status.js` instead of adding another mod and
layout block. This reuses the existing status view, command loop, confirmation
overlay, theme, notifications, and polling lifecycle.

The status view polls `tailscale status --json` on initialization and every five
seconds. It refreshes immediately after `up` or `down`. JSON parsing and backend
state classification live in a dependency-free helper module so malformed or
schema-invalid output becomes an error state rather than breaking the status
mod.

Observed backend state, operation state, and the last action error are separate.
Only one poll or action can run at a time. Starting an action increments a
generation counter so any older poll result is discarded. Timer ticks that
arrive during an action are coalesced into the post-action refresh. This prevents
a stale poll from overwriting busy, error, or newly observed state.

The command runner uses `window().platform` and first tries the PATH command,
then exact installation paths that commonly are not present in GUI application
PATHs:

- Linux: `tailscale`.
- macOS: `tailscale`, `/usr/local/bin/tailscale`, then
  `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
- Windows: `tailscale.exe`, then
  `C:\Program Files\Tailscale\tailscale.exe`.

All calls explicitly use `exec(command, args, { on: null })` so the CLI always
runs on the machine hosting this Herdr window. Fall through to another candidate
only when `exec` rejects because the process cannot start. A launched process is
cached even when it returns a non-zero exit code, because that result is a real
Tailscale error rather than evidence that the binary is missing. Invalidate the
cache only if a later launch rejects. Error text is stripped of control
characters and capped at 500 characters before entering a tooltip or
notification.

## Command flow

1. `Status.init` starts the initial status refresh and five-second timer.
2. A click while ON creates a random, one-use token with a 15-second expiry and
   opens `confirm` with command `codenav.tailscale-down:<token>`.
3. The existing `nextCommand` loop accepts the command only when the token
   matches and is unexpired, clears it before any asynchronous work, refreshes
   status, and runs `down` only if the fresh state is still `Running`. Cancelling
   leaves no reusable authority after the short expiry, and a command without
   the unpredictable token cannot disconnect Tailscale.
4. A click while OFF runs `up --timeout=10s` directly.
5. Both operations set a busy state, execute once, refresh status, notify the
   view, and report failures without changing unrelated status functionality.

## Distribution

`NacreousCloud/herdr-codebench` is the source of truth. The existing
`install.sh` remains the macOS/Linux installer. Add `install.ps1`, compatible
with Windows PowerShell 5.1 and PowerShell 7, with behavior equivalent to the
shell installer:

- Honor `HERDR_APP_HOME`, defaulting to
  `%USERPROFILE%\.config\herdr-app`.
- Honor `HERDR_LAYOUT_RESET=1`; otherwise preserve existing JSON layouts while
  copying missing layouts and non-JSON layout files.
- Replace a destination mod or layout path only when it is a symlink, junction,
  or other reparse point; do not recursively follow it.
- Copy mod files recursively while preserving machine-owned `gpui-kit.d.ts`,
  `jsconfig.json`, `hosts.json`, `.cache`, and `__pycache__` entries.
- Run `herdr-app check` for every installed mod and fail if the CLI is missing or
  validation fails.
- Overwrite repository-owned theme files, matching `install.sh`.
- Use `design/idea/install_keys.py` to add only missing keys, preserve conflicts,
  and create timestamped backups before changes.

The Windows installer requires Python 3. It resolves `py -3`, `python3`, then
`python`, and fails with an actionable message when none is available. It runs
`design/idea/sync_ui.py --check` before copying, exactly like `install.sh`.

The Mac installs from the local checkout. The Windows machine clones or pulls
the personal fork and runs `install.ps1`; its own Herdr instance then controls
the Windows Tailscale client locally.

## Verification

- Add Node built-in tests for every recognized backend state, malformed and
  schema-invalid JSON, platform candidate lists, launch rejection versus
  non-zero fallback, stale generation rejection, and error sanitization.
- Run `herdr-app check` for the modified `codenav` mod.
- Run `python3 design/idea/sync_ui.py --check` and
  `node --experimental-vm-modules design/idea/check_system.mjs`.
- Install to the Mac config and inspect `herdr-app status` and a screenshot.
- Verify ON status locally without disconnecting during automated checks.
- Review `install.ps1` statically on macOS, where `pwsh` is unavailable. Require
  a PowerShell parse plus a dry install/check on the target Windows machine
  before calling Windows deployment verified.
