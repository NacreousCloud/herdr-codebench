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

Add a compact chip to the existing `codenav` status view:

- `● Tailscale ON` in the success color when `BackendState` is `Running`.
- `○ Tailscale OFF` in the muted color for stopped states.
- `◌ Tailscale …` while checking or changing state.
- `! Tailscale` in the error color when the CLI is unavailable, its output is
  invalid, or a command fails. The tooltip contains the actionable error.

Clicking ON opens Herdr's existing confirmation dialog. Confirming runs
`tailscale down`. Clicking OFF runs `tailscale up` directly. The chip ignores
additional clicks while an operation is in progress.

## Runtime design

Keep the feature in `mods/codenav/status.js` instead of adding another mod and
layout block. This reuses the existing status view, command loop, confirmation
overlay, theme, notifications, and polling lifecycle.

The status view polls `tailscale status --json` on initialization and every five
seconds. It refreshes immediately after `up` or `down`. JSON parsing is isolated
from rendering so malformed output becomes an error state rather than breaking
the status mod.

The command runner first tries `tailscale`, then platform installation paths
that commonly are not present in GUI application PATHs:

- macOS app bundle CLI locations.
- `C:\Program Files\Tailscale\tailscale.exe` on Windows.

Once a candidate works, cache it for later polls and actions. A non-zero command
result is treated as an operation error; stderr is shown through a Herdr error
notification and the chip tooltip.

## Command flow

1. `Status.init` starts the initial status refresh and five-second timer.
2. A click while ON stores a pending disconnect marker and opens `confirm` with
   command `codenav.tailscale-down`.
3. The existing `nextCommand` loop receives that command and runs `down`.
4. A click while OFF runs `up` directly.
5. Both operations set a busy state, execute once, refresh status, notify the
   view, and report failures without changing unrelated status functionality.

## Distribution

`NacreousCloud/herdr-codebench` is the source of truth. The existing
`install.sh` remains the macOS/Linux installer. Add `install.ps1` for Windows to
copy the repository's mods, layouts, theme, and key bindings into
`%USERPROFILE%\.config\herdr-app`, validate installed mods when
`herdr-app` is available, and preserve user-owned files using the same merge
intent as the shell installer.

The Mac installs from the local checkout. The Windows machine clones or pulls
the personal fork and runs `install.ps1`; its own Herdr instance then controls
the Windows Tailscale client locally.

## Verification

- Unit-test Tailscale JSON state parsing and command-candidate fallback where
  the repository's test tooling permits.
- Run `herdr-app check` for the modified `codenav` mod.
- Install to the Mac config and inspect `herdr-app status` and a screenshot.
- Verify ON status locally without disconnecting during automated checks.
- Validate `install.ps1` syntax and document the Windows install command; the
  final live Windows toggle check is performed after pulling on that machine.

