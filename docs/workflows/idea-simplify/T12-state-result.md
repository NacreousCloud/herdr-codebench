# T12 status/settings/LSP state cleanup

Status: ready for parent review and batched integration. Scope: `status.js`, `settings.js`, `lsp-setup.js` and their existing checks. Inherited high setting retained; no delegation, installation, restart, Go edits or Git mutations performed.

## Changes

- Status direct commands and terminal-bound actions share one small opener for terminal files, settings, LSP setup and searches. The repeated search-kind table and duplicate LSP branch are gone. Search queries retain embedded colons and the existing unknown-kind fallback. Source/review/activity ownership, capability guards, personal terminal actions and codebench terminal input replay remain in their existing path.
- Settings no longer maintains the assignment-only `windowTool` field or a second name for `formatShortcut`. Unused theme arguments were removed; Add computes its candidates once. The settings module was not split. Draft state, keymap edits, expected-value CAS, preflight validation and post-await latest-state merges are retained: those repeated validations protect concurrent changes rather than duplicate work accidentally.
- LSP setup uses one eligibility predicate for rendered Check/Start buttons and their request handler. A folder-picker completion applies behind one generation guard. The root focus handle was never focused; only the language menu now owns a focus handle, while the root Escape handler still receives events on that descendant's path. The unused `close` forwarding method was removed; the owning main view calls idempotent `release` directly. Clipboard handling stays shared because it owns copy feedback and preserves setup errors. Request/folder generations and backend readiness checks remain explicit.

## Validation

Passed:

- `node --experimental-vm-modules design/idea/check_shortcuts.mjs`: real Status consumer, physical key aliases, terminal reassignment/replay, editor/review/activity owners, installer conflict preservation. Added assertions for shared settings/LSP opening, search modes, colon queries and fallback behavior.
- `node --experimental-vm-modules design/idea/check_settings.mjs`: drafts/Cancel, concurrent preference CAS and conflict handling, shortcut mutations/terminal bridges, notification/customization drafts, tool ordering, unknown-field preservation and handle cleanup.
- `node --experimental-vm-modules design/idea/check_lsp_setup.mjs`: prerequisite checks, duplicate requests, stale selection/folder/close results, actual readiness/error handling, local roots, LLM handoff and effective project display. Cleanup assertion reflects the remaining menu focus and scroll owners.
- `node --experimental-vm-modules design/idea/check_actions.mjs`: contextual registry, keymap behavior and actual Find Action execution guards.

These are logic/view-state checks, not a native paint or IPC claim. Parent owns the full regression set, batched app installation, current-permission native/UI verification and commit/push. No required native check is represented as completed by this subtask.
