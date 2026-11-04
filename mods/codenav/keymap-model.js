// Pure, atomic keymap edits. The caller owns reading/writing the latest file
// with writeTextFile's expected-text compare-and-swap.
import { getAction, normalizeChord } from "./actions.js";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const editable = section => ["layout:idea", "mod:codenav", "mod:activity", "terminal"].includes(section);
const managed = (section, action) => section !== "terminal" && Boolean(getAction(action))
  && (section === "global" || section.startsWith("layout:") || ["mod:codenav", "mod:activity"].includes(section));

// GPUI accepts arbitrary named keys and multi-stroke sequences. Do not invent a
// second key-name allowlist; reject malformed/modifier-only input before saving.
export function validateChord(value) {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Enter a valid shortcut.");
  const chord = normalizeChord(value);
  for (const stroke of chord.split(" ")) {
    const key = stroke.replace(/^(?:(?:cmd|ctrl|alt|shift|fn)-)+/, "");
    if (!key || /^(cmd|ctrl|control|alt|shift|fn|function|meta|super|win)$/i.test(key)
      || (key !== "-" && /[-\s]/.test(key))) throw new Error("Enter a key together with its modifiers.");
  }
  return chord;
}

function entries(document, section, chord) {
  const value = document[section];
  if (value === undefined) return [];
  if (!object(value)) throw new Error(`Invalid key binding section: ${section}`);
  return Object.entries(value).filter(([key]) => normalizeChord(key) === chord);
}

function single(document, section, chord) {
  const found = entries(document, section, chord);
  if (found.length > 1) throw new Error(`Shortcut has conflicting aliases: ${section}: ${chord}`);
  return found[0] ?? null;
}

function needsForwarder(document, chord) {
  return Object.entries(document).some(([section, bindings]) => object(bindings)
    && Object.entries(bindings).some(([key, action]) => normalizeChord(key) === chord && managed(section, action)));
}

export function applyBindingEdits(document, edits = []) {
  if (!object(document)) throw new Error("Invalid key bindings file.");
  if (!Array.isArray(edits)) throw new Error("Invalid shortcut edits.");
  // Copy only edited sections below; unknown sections and future values survive.
  const result = { ...document }, checked = [], seen = new Set(), forward = new Set();
  for (const edit of edits) {
    if (!edit || !editable(edit.section) || !own(edit, "expected")
      || !(edit.expected === null || typeof edit.expected === "string")
      || !(edit.action === null || typeof edit.action === "string" && edit.action.trim())) throw new Error("Invalid shortcut edit.");
    const chord = validateChord(edit.chord), id = JSON.stringify([edit.section, chord]);
    if (seen.has(id)) throw new Error(`Duplicate shortcut edit: ${edit.section}: ${chord}`);
    seen.add(id);
    const current = single(document, edit.section, chord);
    if ((current?.[1] ?? null) !== edit.expected) throw new Error(`Shortcut changed since editing began: ${edit.section}: ${chord}`);
    checked.push({ ...edit, chord, previousKey: current?.[0] });
    if (managed(edit.section, edit.expected) || managed(edit.section, edit.action)) forward.add(chord);
  }
  for (const edit of checked) {
    const section = { ...(result[edit.section] ?? {}) };
    if (edit.previousKey !== undefined) delete section[edit.previousKey];
    if (edit.action !== null) section[edit.previousKey ?? edit.chord] = edit.action;
    result[edit.section] = section;
  }
  for (const chord of forward) {
    // An explicit terminal edit in this batch has its own expected-action CAS.
    // Its user's chosen direct value wins over derived layout forwarding.
    if (seen.has(JSON.stringify(["terminal", chord]))) continue;
    const existing = single(document, "terminal", chord);
    // Only the exact bridge we own can be replaced/deleted. A personal terminal
    // action is never silently overwritten by changing an IDEA shortcut.
    if (existing && existing[1] !== `codenav.key:${existing[0]}`) {
      if (getAction(existing[1])?.keymapSection === "terminal") continue;
      // Removing a layout shortcut does not take ownership of a personal
      // terminal binding. Adding/replacing one still reports that conflict.
      const claiming = checked.some(edit => edit.chord === chord && edit.action !== null && managed(edit.section, edit.action));
      if (!claiming) continue;
      throw new Error(`Terminal shortcut is already assigned: ${existing[0]}`);
    }
    const terminal = { ...(result.terminal ?? {}) };
    if (existing) delete terminal[existing[0]];
    if (needsForwarder(result, chord)) {
      const key = existing?.[0] ?? chord;
      terminal[key] = `codenav.key:${key}`;
    }
    if (Object.keys(terminal).length || own(result, "terminal")) result.terminal = terminal;
  }
  return result;
}

export function stageBindingEdits(bindings = [], edits = []) {
  const document = {};
  for (const binding of bindings) {
    if (typeof binding.section !== "string" || typeof binding.keys !== "string" || typeof binding.action !== "string") throw new Error("Invalid key binding.");
    document[binding.section] = { ...(document[binding.section] ?? {}), [binding.keys]: binding.action };
  }
  return Object.entries(applyBindingEdits(document, edits)).flatMap(([section, values]) =>
    Object.entries(values).map(([keys, action]) => ({ section, keys, action })));
}
