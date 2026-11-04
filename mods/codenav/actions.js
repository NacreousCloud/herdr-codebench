// IDEA's action model, shared by menus, toolbars, Find Action and keymap UI.
// Pure metadata/presentation: no Herdr imports, native elements or execution.
// Consumers supply current context/bindings and dispatch the legacy command.
const define = (id, label, category, icon, options = {}) => Object.freeze({
  id: id.includes(".") ? id : `codenav.${id}`,
  command: id.includes(".") ? id : `codenav.${id}`,
  label, category, icon, owner: "status", defaultKeys: [], requires: [],
  ...options,
  defaultKeys: Object.freeze(options.defaultKeys ?? []),
  requires: Object.freeze(options.requires ?? []),
});
const source = { owner: "code", requires: ["source", "local"] };
export const ACTIONS = Object.freeze([
  define("find-all", "Search Everywhere", "Navigation", "search", { terminal: true, defaultKeys: ["cmd-shift-space"] }),
  define("find-class", "Go to Class", "Navigation", "class", { terminal: true, defaultKeys: ["cmd-o"], requires: ["project", "local"] }),
  define("find-file", "Go to File", "Navigation", "anyType", { terminal: true, defaultKeys: ["cmd-shift-o"], requires: ["project"] }),
  define("find-symbol", "Go to Symbol", "Navigation", "method", { terminal: true, defaultKeys: ["cmd-alt-o"], requires: ["project", "local"] }),
  define("find-action", "Find Action", "Navigation", "search", { terminal: true, defaultKeys: ["cmd-shift-a"] }),
  define("find-recent", "Recent Files", "Navigation", "anyType", { terminal: true, defaultKeys: ["cmd-e"] }),
  define("find-locations", "Recent Locations", "Navigation", "locate", { terminal: true, defaultKeys: ["cmd-shift-e"] }),
  define("goto-line", "Go to Line", "Navigation", "locate", { ...source, requires: ["source"], defaultKeys: ["cmd-l"] }),
  define("file-structure", "File Structure", "Navigation", "structure", { ...source, defaultKeys: ["cmd-f12"] }),
  define("definition", "Go to Declaration", "Navigation", "locate", { ...source, defaultKeys: ["cmd-b"] }),
  define("implementation", "Go to Implementation", "Navigation", "locate", { ...source, defaultKeys: ["cmd-alt-b"] }),
  define("type-definition", "Go to Type Declaration", "Navigation", "interface", source),
  define("super-declaration", "Go to Super Declaration", "Navigation", "interface", { ...source, defaultKeys: ["cmd-u"] }),
  define("usages", "Find Usages", "Navigation", "find", { ...source, defaultKeys: ["alt-f7"] }),
  define("nav-back", "Back", "Navigation", "locate", { defaultKeys: ["cmd-[", "cmd-alt-left"] }),
  define("nav-forward", "Forward", "Navigation", "locate", { defaultKeys: ["cmd-]", "cmd-alt-right"] }),
  define("close-tab", "Close", "Editor", "close", { requires: ["file"], defaultKeys: ["cmd-w"] }),
  define("tab-next", "Next Tab", "Editor", "chevronRight", { defaultKeys: ["cmd-shift-]"] }),
  define("tab-prev", "Previous Tab", "Editor", "chevronRight", { defaultKeys: ["cmd-shift-["] }),
  define("next-error", "Next Problem", "Editor", "problems", { ...source, requires: ["source"], defaultKeys: ["f2"] }),
  define("prev-error", "Previous Problem", "Editor", "problems", { ...source, requires: ["source"], defaultKeys: ["shift-f2"] }),
  define("rich-view", "Markdown Preview", "Editor", "markdown", { owner: "code", requires: ["source", "markdown"] }),
  define("activity.save", "Save", "Editor", "anyType", { owner: "activity", requires: ["editable"], defaultKeys: ["cmd-s"] }),
  define("activity.preview", "Markdown Editor Preview", "Editor", "markdown", { owner: "activity", requires: ["editable", "markdown"] }),
  ...[["project", "Project", "project", "cmd-1"], ["commit", "Commit", "commit", "cmd-0"],
    ["structure", "Structure", "structure", "cmd-7"], ["find", "Find", "find", "cmd-3"],
    ["terminal", "Terminal", "terminal", "alt-f12"], ["problems", "Problems", "problems", "cmd-6"],
    ["notifications", "Notifications", "notifications"], ["agents", "Agents", "services"]]
    .map(([name, label, icon, key]) => define(`tool-${name}`, label, "Tool Windows", icon, { defaultKeys: key ? [key] : [] })),
  define("hide-active", "Hide Active Tool Window", "Tool Windows", "hide", { defaultKeys: ["shift-escape"] }),
  define("hide-tools", "Hide All Tool Windows", "Tool Windows", "layout", { defaultKeys: ["cmd-shift-f12"] }),
  define("tool-last", "Jump to Last Tool Window", "Tool Windows", "layout", { defaultKeys: ["f12"] }),
  define("tool-reset", "Restore Tool Window Layout", "Tool Windows", "layout", { defaultKeys: ["shift-f12"] }),
  define("tool-settings", "Tool Window Settings…", "Tool Windows", "layout"),
  define("run", "Run", "Run", "runAction", { requires: ["runConfig"], defaultKeys: ["ctrl-r"] }),
  define("rerun", "Rerun", "Run", "rerunAction", { requires: ["runConfig"], defaultKeys: ["cmd-r"] }),
  define("stop", "Stop", "Run", "stopAction", { requires: ["running"], defaultKeys: ["cmd-f2"] }),
  define("run-choose", "Run Configurations", "Run", "run", { defaultKeys: ["ctrl-alt-r"] }),
  define("run-configs", "Edit Configurations…", "Run", "config"),
  define("new-terminal-menu", "New Terminal or Agent", "Tools", "terminal"),
  define("terminal-files", "Files in this terminal…", "Tools", "terminal", { requires: ["terminal"], keymapSection: "terminal", defaultKeys: ["cmd-shift-o"] }),
  define("show-terminal", "Show Terminal", "Tools", "terminal"),
  define("lsp-setup", "Language Server Setup", "Tools", "config", { terminal: true }),
  define("review", "Review Changes", "Version Control", "commit", { requires: ["project"] }),
  define("review-next-diff", "Next Difference", "Version Control", "chevronDown", { owner: "review", requires: ["review"] }),
  define("review-prev-diff", "Previous Difference", "Version Control", "chevronRight", { owner: "review", requires: ["review"] }),
  define("review-open-source", "Open Source", "Version Control", "anyType", { owner: "review", requires: ["review"] }),
  define("spring-beans", "Spring Beans", "Spring", "services", source),
  define("spring-endpoints", "Spring Endpoints", "Spring", "http", source),
  define("spring-properties", "Spring Configuration Keys", "Spring", "config", source),
  define("http-run-all", "Run All Requests in File", "HTTP Client", "runAll", { owner: "code", requires: ["source", "http", "local"] }),
  define("http-env", "HTTP Request Environment…", "HTTP Client", "http", { owner: "code", requires: ["source", "http", "local"] }),
  define("settings", "Mode Settings", "Appearance & Behavior", "settings", { terminal: true, defaultKeys: ["cmd-shift-,"] }),
  define("app.settings", "Herdr Settings", "Appearance & Behavior", "settings", { terminal: true, defaultKeys: ["cmd-,"] }),
  define("design-system", "UI Component Gallery", "Development", "layout"),
  define("lang", "Switch Interface Language", "Appearance & Behavior", "settings"),
  ...[["new-file", "New File…", "anyType"], ["new-folder", "New Folder…", "folder"],
    ["refresh", "Refresh", "refresh"], ["collapse", "Collapse folders", "collapseAll"]]
    .map(([name, label, icon]) => define(`activity.project-${name}`, label, "Project", icon, { owner: "activity", requires: ["project"] })),
  define("problems-errors-only", "Show Errors Only", "Problems", "problems", { toggle: "errorsOnly" }),
  define("problems-autoscroll", "Autoscroll to Source", "Problems", "locate", { toggle: "autoscroll" }),
  define("problems-group-source", "Group by Inspection", "Problems", "structure", { toggle: "groupSource" }),
  define("notifications-clear", "Clear All Notifications", "Notifications", "close"),
]);

const byId = new Map(ACTIONS.map(action => [action.id, action]));
export const getAction = id => byId.get(id) ?? byId.get(`codenav.${id}`) ?? null;
export const listActions = context => context === undefined ? ACTIONS.slice() : ACTIONS.filter(action => actionPresentation(action, context).visible);

export function actionPresentation(actionOrId, context = {}) {
  const action = typeof actionOrId === "string" ? getAction(actionOrId) : actionOrId;
  if (!action) return { id: null, enabled: false, visible: false, selected: false, reason: "Unknown action" };
  const document = context.document ?? null;
  const path = document?.path ?? context.path ?? "";
  const machine = document?.on ?? context.workspace?.machine ?? context.on ?? null;
  const local = !machine;
  const capabilities = {
    project: Boolean(context.hasWorkspace || context.workspace || context.cwd || context.root),
    file: Boolean(path), source: Boolean(path && document?.kind === "file" && !document?.edit && context.area !== "review"
      && !/\.(png|jpe?g|gif|webp|avif|ico|bmp|svg|pdf|mp[34]|mov|wav|ogg|woff2?|ttf|zip|jar)$/i.test(path)),
    editable: Boolean(path && document?.edit), local,
    markdown: /\.(md|markdown|mdx)$/i.test(path), http: /\.(http|rest)$/i.test(path),
    terminal: Boolean(context.terminal), runConfig: Boolean(context.runConfig), running: Boolean(context.running),
    review: context.area === "review" || Boolean(context.review),
    ...(context.capabilities ?? {}),
  };
  const missing = action.requires.filter(capability => !capabilities[capability]);
  return { id: action.id, command: action.command, label: action.label, icon: action.icon,
    visible: context.layout === undefined || context.layout === "idea" || action.id === "app.settings",
    enabled: !missing.length, selected: Boolean(action.toggle && context.problemsOptions?.[action.toggle]),
    reason: missing.length ? `Requires ${missing.join(", ")}` : "" };
}

const item = (id, action) => Object.freeze({ id, kind: "action", action });
const widget = (id, name) => Object.freeze({ id, kind: "widget", widget: name });
const group = (label, items) => Object.freeze({ label, items: Object.freeze(items) });
export const ACTION_GROUPS = Object.freeze({
  "MainToolbar.left": group("Main Toolbar / Left", [widget("project.widget", "project"), widget("branch.widget", "branch")]),
  "MainToolbar.center": group("Main Toolbar / Center", []),
  "MainToolbar.right": group("Main Toolbar / Right", [widget("run.widget", "run"), item("search.action", "codenav.find-all"), item("tools.action", "codenav.tool-settings"), item("settings.action", "codenav.settings")]),
  "header.Project": group("Tool Windows / Project Header", [item("new-file.action", "activity.project-new-file"), item("new-folder.action", "activity.project-new-folder"), item("refresh.action", "activity.project-refresh"), item("collapse.action", "activity.project-collapse")]),
  "header.Problems": group("Tool Windows / Problems Header", [item("errors-only.action", "codenav.problems-errors-only"), item("autoscroll.action", "codenav.problems-autoscroll"), item("group-source.action", "codenav.problems-group-source")]),
  "header.Notifications": group("Tool Windows / Notifications Header", [item("clear.action", "codenav.notifications-clear")]),
  "ToolWindow.context": group("Tool Windows / Context Menu", [item("tool-settings.action", "codenav.tool-settings"), item("hide-active.action", "codenav.hide-active")]),
  "Editor.context": group("Editor / Context Menu", [item("definition.action", "codenav.definition"), item("implementation.action", "codenav.implementation"), item("type-definition.action", "codenav.type-definition"), item("super.action", "codenav.super-declaration"), item("usages.action", "codenav.usages"), item("structure.action", "codenav.file-structure")]),
  "HTTP.toolbar": group("HTTP Client / Toolbar", [item("run-all.action", "codenav.http-run-all"), item("environment.action", "codenav.http-env")]),
  "Review.toolbar": group("Version Control / Review Toolbar", [item("previous-diff.action", "codenav.review-prev-diff"), item("next-diff.action", "codenav.review-next-diff"), item("open-source.action", "codenav.review-open-source")]),
});

export function formatShortcut(value = "") {
  const names = { cmd: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", escape: "Esc", enter: "↵", up: "↑", down: "↓", left: "←", right: "→", space: "Space" };
  return normalizeChord(value).split(" ").map(stroke => {
    // '-' is itself a valid key, e.g. Ctrl+- (ctrl--).
    const parts = stroke.endsWith("--") ? [...stroke.slice(0, -2).split("-"), "-"] : stroke.split("-");
    return parts.map(part => names[part] ?? part.toUpperCase()).join("");
  }).join(" ");
}

const keyRank = (section, context) => section === "global" ? 0
  : section === `layout:${context.layout ?? "idea"}` ? 1
  : context.mod && section === `mod:${context.mod}` ? 2
  : context.terminal && section === "terminal" ? 3 : -1;

// Effective declared bindings for a concrete focus context. Defaults are metadata,
// never a fallback after the user removes/reassigns a shortcut.
export function effectiveShortcuts(id, bindings = [], context = {}) {
  const wanted = getAction(id)?.command ?? id;
  const winners = new Map();
  for (const binding of bindings) {
    const rank = keyRank(binding.section, context);
    if (rank < 0) continue;
    const chord = normalizeChord(binding.keys);
    if (rank >= (winners.get(chord)?.rank ?? -1)) winners.set(chord, { ...binding, rank });
  }
  return [...winners.values()].filter(binding => {
    let command = binding.action;
    if (binding.section === "terminal" && command.startsWith("codenav.key:") && normalizeChord(command.slice(12)) === normalizeChord(binding.keys))
      command = actionForTerminalKey(binding.keys, bindings, context)?.command;
    return command === wanted;
  }).map(binding => binding.keys);
}

export const actionShortcut = (id, bindings = [], context = {}) => effectiveShortcuts(id, bindings, context).map(formatShortcut).join(" / ");

// GPUI's Keystroke parser treats an ASCII uppercase key as Shift + lowercase.
// Keep that equivalence in our comparisons too (including manually entered keys).
// Punctuation and non-ASCII keys depend on the keyboard layout; leave them alone.
export function normalizeChord(value = "") {
  return String(value).trim().split(/ +/).map(stroke => {
    const modifiers = new Set();
    let key = stroke;
    for (;;) {
      const match = /^(cmd|ctrl|alt|shift|fn|super|win)-/i.exec(key);
      if (!match) break;
      modifiers.add(/^(super|win)$/i.test(match[1]) ? "cmd" : match[1].toLowerCase());
      key = key.slice(match[0].length);
    }
    if (/^[A-Z]$/.test(key)) modifiers.add("shift");
    key = key.replace(/[A-Z]/g, letter => letter.toLowerCase());
    return [...["cmd", "ctrl", "alt", "shift", "fn"].filter(name => modifiers.has(name)), key].join("-");
  }).join(" ");
}

// Terminal interception routes through the very same declared IDEA keymap.
// It must not turn a user reassignment into the old hard-coded action.
export function bindingForTerminalKey(key, bindings = [], context = {}) {
  if ((context.layout ?? "idea") !== "idea") return null;
  const chord = normalizeChord(key);
  let winner = null, rank = -1;
  for (const binding of bindings) {
    if (binding.section === "terminal" || normalizeChord(binding.keys) !== chord) continue;
    const candidate = keyRank(binding.section, { ...context, terminal: false });
    if (candidate >= 0 && candidate >= rank) { winner = binding; rank = candidate; }
  }
  return winner;
}

export function actionForTerminalKey(key, bindings = [], context = {}) {
  return getAction(bindingForTerminalKey(key, bindings, context)?.action) ?? null;
}
