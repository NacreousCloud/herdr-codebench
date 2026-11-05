# Herdr Codebench UI development

The `idea` layout follows the installed IntelliJ Islands design system. Read
`design/idea/PARITY_PLAN.md` and `design/idea/COMPONENTS.md` before adding UI.
`codebench` is a separate supported layout; preserve its behavior.

- Apply YAGNI, KISS and DRY to every change: implement current requirements,
  prefer the simplest clear solution, and reuse existing shared behavior.
  Remove unused code and meaningful duplication without adding speculative
  abstractions or changing unrelated behavior.
- Canonical values live in `design/idea/tokens.json`; canonical components and
  keyboard behavior live in `design/idea/ui.js`. Never edit generated
  `mods/*/idea-design.js` or `idea-tokens.js` directly.
- Import the local generated module. Use its semantic colors and components
  for buttons, inputs, rows, tabs, menus, headers and dialogs. Extend the common
  component and examples when a new state is needed, then migrate callers.
- Use `MenuController` for selection, disabled rows, keyboard navigation and
  scrolling. Create focus and scroll handles in `init`, release owned handles.
  Menu icons must be factories (`icon: () => graphic()`); eager native icons cannot be reused in deferred rows. Give overlays definite bounds; an auto-sized flex list can collapse to zero.
- A tool window gets one shared header. Declare `TOOLS[name].headerActions`
  with `{id, icon, label, command}` instead of adding another title/action row
  inside its body. Commands must reach the real owning view.
- The island shell owns corners and spacing. Change `islands.js` for chrome;
  do not add root/body gaps or extra stripe/status gutters. Layout migrations
  must preserve panel sizes, order, active/hidden state and terminal data.
- Read the installed `~/.config/herdr-app/AGENTS.md`, `gpui-kit.d.ts` and
  `herdr.d.ts` for the current runtime. There is no DOM or Node API in mods.
- Generate with `python3 design/idea/sync_ui.py`; run its `--check` plus
  `node --experimental-vm-modules design/idea/check_system.mjs`. For new mods,
  generate both files with `--mod NAME` and include that target in validation.
- Run `herdr-app check` for changed mods and inspect the actual UI before
  reporting completion. Check `codenav.design-system` for shared states and
  long-menu keyboard behavior. Batch installs to limit HMR runtime churn.
- Keymap inheritance has a macOS Ctrl/Meta boundary. Use the effective
  `design/idea/keymap.json`; never replace every Ctrl shortcut with Cmd.
