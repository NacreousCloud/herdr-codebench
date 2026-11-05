# T14 diagnostic model/actions result

Owned files: `mods/codenav/diagnostic-model.js`, `mods/codenav/diagnostic-actions.js`, `design/idea/check_diagnostic_actions.mjs`, this result. Existing T13 changes and other agents' UI files were preserved. No installation, application restart, real AI interaction, commit or push was performed by this task.

## Contract and implementation

- `diagnosticText(entries)` formats every entry in caller order, including duplicates. Each block contains machine (`local` when `on` is null), full path, optional root, one-based start/end coordinates converted from the existing zero-based diagnostic contract, severity, source/code when supplied, and the complete original message. Multiline content, indentation, CRLF, Unicode and long messages are preserved without a size limit or subprocess arguments.
- `diagnosticKey(entry)` is a stable JSON identity over machine/path, range, severity, source/code and full message.
- `diagnosticTargets()` retains `common.targets()` terminal/name/order and adds `space` and `on` snapshots. It requires an active space on a ready machine, an actual agent pane in that space, a terminal address on that machine, and excludes shells, blocked/error targets and known non-live terminals. The target picker must retain the full object.
- The UI coordinator uses one eligible-target snapshot to attach directly for one AI or show the explicit picker for multiple AIs. T15 removed the original `defaultDiagnosticTarget()` helper to avoid reading the same inventory again.
- `copyDiagnostics(entries,cx)` writes through native `cx.write_to_clipboard`, returns a boolean and reports failures through `uiNotify`.
- `attachDiagnostics(entries,target,cx)` validates before clipboard changes, snapshots caller data, then spawns an owned task. The task rechecks context, writes the complete text, requests `pane.focus`, waits with native `taskCx.sleep(150)`, rechecks workspace/machine/target pane+tab+state, actual focused terminal/tab/space and any shown terminal replacement, checks exact clipboard text, and dispatches `terminal.paste`. It never sends Enter, keypresses, `hc send`, shell commands, or an AI message. Concurrent attachments are rejected. Failures are visible through `uiNotify`; it does not overwrite the clipboard again after a cancellation, preserving any newer user copy.

## Validation

`node --experimental-vm-modules design/idea/check_diagnostic_actions.mjs` passes. The test loads the real action handlers through VM modules and mocks only imported host/common/notification functions. It covers a 200,000-character multiline Unicode payload, ranges/source/code fidelity, duplicates/all-entry preservation, native copy only, no AI, shell exclusion, blocked/error/non-live targets, explicit multiple-AI choice, same-machine remote success, mismatched machine/address, stale target/space/machine/pane/tab, offline machine, changed focus/replacement/clipboard, changes before the async task starts, busy overlap prevention, and absence of any submit action.

App check, generated component validation and actual UI inspection belong to the parent integration task. This helper task makes no claim about rendered selection, picker placement or real AI draft behavior.

## Runtime evidence and limit

Installed `~/.config/herdr-app/gpui-kit.d.ts` exposes native clipboard read/write (lines 345–348), task spawn plus native sleep (lines 378–387), and an `AsyncContext` valid across awaits (lines 390–411). Installed `herdr.d.ts` documents `pane.focus {terminal}` (line 58), focus-based `terminal.paste` with no terminal argument (line 63), and `focused()` actual terminal focus plus shown replacement (lines 219–227). The `run` API returns null (line 79), with no completion receipt for a paste command.

The host has no atomic target-and-paste API, clipboard revision token or AI composer/draft API. Exact text comparison detects different clipboard text, but cannot detect an intervening clipboard write of identical text. Checks and paste dispatch execute synchronously after the wait, minimizing the focus race; the mod cannot guarantee host focus is unchanged between final JS observation and native paste execution, prove that an agent terminal currently displays its composer, or acknowledge that native paste reached a draft. The success notification therefore reports paste dispatch and asks the user to review the AI input. Removing these remaining host limitations requires a native targeted paste/composer API; no such API was invented here.
