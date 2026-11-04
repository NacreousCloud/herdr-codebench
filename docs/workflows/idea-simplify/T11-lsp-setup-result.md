# T11 native LSP setup view

Status: implementation ready for parent integration and actual UI review. Scope: `mods/codenav/lsp-setup.js`, authorized repeatable regression `design/idea/check_lsp_setup.mjs`, plus this result. Existing inherited high reasoning setting retained for asynchronous context and lifecycle coordination; no subagents spawned.

## Implemented contract

- Named/default `LspSetup` implementation with `init`, `render`, idempotent `release` and `close`. Parent's existing implementation wrapper can instantiate it and call `release` on close.
- `openLspSetup(options = {})` opens the codenav `view: "lsp-setup"` native dialog, frame none, 900×680. Parent owns main routing and command entrypoints.
- Seven-language keyboard/scroll picker consumes the pure `INSTALL_LANGUAGES` and `installationGuide` model. TypeScript and JavaScript send the shared backend language ID `typescript` while retaining distinct guides.
- Guide requirements, steps, commands, official links and notes use local canonical semantic components. Per-command and full-guide copy use documented `cx.write_to_clipboard`; official links use documented `cx.open_url`. No installer command is executed by this view.
- Follow-up LLM installation flow: **Copy Guide for LLM** copies the chosen language, platform and project folder with the official instructions/commands. Completion instructions require SDK version and server executable-path validation, no independently left-running stdio server, and Herdr Check Installation/Start LSP with actual results/errors reported. Backend `status.root` is shown separately when it differs from the chosen folder.
- Root comes from explicit props, otherwise local focused terminal cwd or local space folder. A remote space's cwd/folder is never implicitly submitted to the local engine. Missing context stays empty until native `pickFolder` supplies a local project.
- Check calls `lsp("setup_status", {lang, root}, sleep)` and displays actual discovery/readiness/error results. Start requires a successful current-context `installed: true` check, calls `setup_start`, and only displays initialized success for backend `running: true`. Successful initialization signals `codenav.retry-lsp` for parent/editor integration. The dialog remains open to review results.
- Loading/error states remain visible. Language/root changes and release invalidate request generations; outdated checks, starts, failures and native folder-picker results cannot replace current view state. Starting is not duplicated while pending. Closing invalidates local work; it does not claim to kill an already requested backend process.
- Focus and virtual scrolling handles are created in init and released once. Uses `MenuController` for language keyboard selection and scrolling. The guide has definite flex bounds and its own native overflow area; footer actions remain outside that scrolling region. IDEA/codebench semantic fallback comes from the generated local design module.

## Validation

- `node --check mods/codenav/lsp-setup.js`: passed.
- `node --experimental-vm-modules design/idea/check_lsp_setup.mjs`: passed for 900×680 bounds, disabled actions without selection/root, required installation check, TypeScript/JavaScript backend identity, stale selection/root/folder/close result guards, duplicate pending requests, actual running result, retry signal, clipboard calls, remote root exclusion, errors, malformed backend response refusal, overlay contract and handle cleanup. Follow-up checks cover LLM context/completion instructions and differing effective project roots. Backend/native bindings are stubbed; this is not a native LSP, IPC or paint claim.
- `python3 design/idea/sync_ui.py --check`: passed; generated files unchanged.
- `node --experimental-vm-modules design/idea/check_system.mjs`: passed.
- `herdr-app check mods/codenav`: attempted; platform XPC connection errors left the native check waiting. No successful native check is claimed. A TERM attempt for this exact owned check PID 66692 was denied by the OS; parent was notified to stop it from its available context. No further native check was started.

Parent still owns batched installation, main/command routing, translation additions and actual 900×680 UI inspection. No live mod/layout installation or T10 cleanup was performed by this task.
