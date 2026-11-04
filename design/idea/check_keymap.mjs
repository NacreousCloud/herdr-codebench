// Run: node --experimental-vm-modules design/idea/check_keymap.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = vm.createContext({});
const actions = new vm.SourceTextModule(await readFile(new URL('../../mods/codenav/actions.js', import.meta.url), 'utf8'), { context });
await actions.link(() => { throw Error('registry must be pure'); }); await actions.evaluate();
const model = new vm.SourceTextModule(await readFile(new URL('../../mods/codenav/keymap-model.js', import.meta.url), 'utf8'), { context });
await model.link(name => { assert.equal(name, './actions.js'); return actions; }); await model.evaluate();
const { stageBindingEdits, applyBindingEdits, validateChord } = model.namespace;
const { normalizeChord, actionForTerminalKey } = actions.namespace;
const plain = value => JSON.parse(JSON.stringify(value));
const flat = document => Object.entries(document).flatMap(([section, bindings]) => Object.entries(bindings).map(([keys, action]) => ({ section, keys, action })));
const edit = (chord, action, expected = null, section = 'layout:idea') => ({ section, chord, action, expected });
const original = {
  'layout:idea': { 'cmd-shift-o': 'codenav.find-file', 'cmd-,': 'app.settings', 'cmd-j': 'personal.jump' },
  'layout:codebench': { 'cmd-shift-o': 'codenav.terminal-files' },
  'mod:codenav': { 'cmd-b': 'codenav.definition' },
  terminal: { 'cmd-shift-o': 'codenav.terminal-files', 'cmd-,': 'codenav.key:cmd-,', 'ctrl-x': 'personal.terminal' },
  'mod:future': { 'ctrl-q': 'future.action' },
};
const untouched = JSON.stringify(original);
let next = applyBindingEdits(original, [edit('cmd-alt-j', 'codenav.find-file')]);
assert.equal(next['layout:idea']['cmd-alt-j'], 'codenav.find-file');
assert.equal(next.terminal['cmd-alt-j'], 'codenav.key:cmd-alt-j');
assert.deepEqual(plain(stageBindingEdits(flat(original), [edit('cmd-alt-j', 'codenav.find-file')])), flat(next));
assert.equal(JSON.stringify(original), untouched, 'preview/save do not mutate the original');
next = applyBindingEdits(next, [edit('cmd-alt-j', 'codenav.find-class', 'codenav.find-file')]);
assert.equal(actionForTerminalKey('cmd-alt-j', flat(next)).command, 'codenav.find-class');
next = applyBindingEdits(next, [edit('cmd-alt-j', null, 'codenav.find-class')]);
assert.equal(next['layout:idea']['cmd-alt-j'], undefined); assert.equal(next.terminal['cmd-alt-j'], undefined);
assert.deepEqual(next['mod:future'], original['mod:future']);
assert.equal(next.terminal['ctrl-x'], 'personal.terminal');
assert.equal(next['layout:idea']['cmd-j'], 'personal.jump');
const removed = applyBindingEdits(original, [edit('cmd-shift-o', null, 'codenav.find-file')]);
assert.equal(removed.terminal['cmd-shift-o'], 'codenav.terminal-files', 'terminal-specific file action survives a layout deletion');
next = applyBindingEdits(original, [edit('cmd-shift-o', 'personal.jump', 'codenav.find-file')]);
assert.equal(next['layout:idea']['cmd-shift-o'], 'personal.jump');
assert.equal(next.terminal['cmd-shift-o'], 'codenav.terminal-files', 'terminal-specific action survives a layout reassignment');
next = applyBindingEdits(original, [edit('cmd-shift-o', 'codenav.find-class', 'codenav.find-file')]);
assert.equal(next.terminal['cmd-shift-o'], 'codenav.terminal-files', 'a layout change cannot replace an explicit terminal-scoped action');
next = applyBindingEdits(original, [edit('cmd-shift-o', null, 'codenav.terminal-files', 'terminal'), edit('cmd-alt-t', 'codenav.terminal-files', null, 'terminal')]);
assert.equal(next.terminal['cmd-shift-o'], undefined); assert.equal(next.terminal['cmd-alt-t'], 'codenav.terminal-files');
assert.equal(next['layout:idea']['cmd-shift-o'], 'codenav.find-file', 'terminal shortcut editing leaves the editor shortcut alone');
assert.deepEqual(plain(stageBindingEdits(flat(original), [edit('cmd-shift-o', null, 'codenav.terminal-files', 'terminal')])), flat(applyBindingEdits(original, [edit('cmd-shift-o', null, 'codenav.terminal-files', 'terminal')])));
next = applyBindingEdits(original, [edit('cmd-shift-o', 'personal.direct', 'codenav.terminal-files', 'terminal'), edit('cmd-shift-o', 'codenav.find-class', 'codenav.find-file')]);
assert.equal(next.terminal['cmd-shift-o'], 'personal.direct', 'an explicit expected terminal edit wins over derived synchronization');
next = applyBindingEdits(original, [edit('cmd-,', null, 'app.settings'), edit('cmd-alt-,', 'app.settings')]);
assert.equal(next.terminal['cmd-,'], undefined); assert.equal(next.terminal['cmd-alt-,'], 'codenav.key:cmd-alt-,');
next = applyBindingEdits(original, [edit('cmd-b', null, 'codenav.definition', 'mod:codenav')]);
assert.equal(next['mod:codenav']['cmd-b'], undefined);
next = applyBindingEdits(original, [edit('cmd-alt-b', 'codenav.definition', null, 'mod:codenav'), edit('cmd-alt-s', 'activity.save', null, 'mod:activity')]);
assert.equal(next.terminal['cmd-alt-b'], 'codenav.key:cmd-alt-b');
assert.equal(next.terminal['cmd-alt-s'], 'codenav.key:cmd-alt-s');
assert.equal(actionForTerminalKey('cmd-alt-b', flat(next), { layout: 'idea', mod: 'codenav' }).command, 'codenav.definition');
assert.equal(actionForTerminalKey('cmd-alt-s', flat(next), { layout: 'idea', mod: 'activity' }).command, 'activity.save');
assert.equal(actionForTerminalKey('cmd-alt-s', flat(next), { layout: 'idea', mod: 'codenav' }), null, 'mod-only keys follow the editor owner');
console.log('PASS atomic Add/Replace/Remove previews, terminal forwarder lifecycle, codebench and source/activity owners');

for (const failed of [edit('cmd-shift-o', 'codenav.find-class'), edit('cmd-shift-o', null, 'codenav.find-class'), edit('cmd-z', 'codenav.find-class', 'codenav.find-file')])
  assert.throws(() => applyBindingEdits(original, [failed]), /changed since editing began/);
const concurrent = { ...original, 'layout:idea': { ...original['layout:idea'], 'cmd-alt-p': 'personal.concurrent' } };
next = applyBindingEdits(concurrent, [edit('cmd-shift-o', 'codenav.find-class', 'codenav.find-file')]);
assert.equal(next['layout:idea']['cmd-alt-p'], 'personal.concurrent');
assert.throws(() => applyBindingEdits({ ...original, terminal: { ...original.terminal, 'cmd-shift-o': 'personal.terminal' } }, [edit('cmd-shift-o', 'codenav.find-class', 'codenav.find-file')]), /Terminal shortcut is already assigned/);
next = applyBindingEdits({ ...original, terminal: { ...original.terminal, 'cmd-shift-o': 'personal.terminal' } }, [edit('cmd-shift-o', null, 'codenav.find-file')]);
assert.equal(next.terminal['cmd-shift-o'], 'personal.terminal', 'removing a layout action preserves a personal terminal action without a false conflict');
assert.throws(() => applyBindingEdits(original, [edit('cmd-shift-o', null, 'codenav.key:cmd-shift-o', 'terminal')]), /changed since editing began/);
assert.throws(() => applyBindingEdits({ ...original, terminal: { ...original.terminal, 'cmd-alt-j': 'send:hi' } }, [edit('cmd-alt-j', 'codenav.find-file')]), /Terminal shortcut is already assigned/);
assert.throws(() => applyBindingEdits(original, [edit('cmd-z', 'codenav.find-file'), edit('cmd-shift-o', null, 'wrong')]), /changed since editing began/);
assert.equal(JSON.stringify(original), untouched, 'failed batches leave every section intact');
assert.throws(() => applyBindingEdits(original, [{ section: 'layout:idea', chord: 'cmd-z', action: 'codenav.find-file' }]), /Invalid shortcut edit/);
assert.throws(() => applyBindingEdits(original, [edit('cmd-z', 'codenav.find-file'), edit('cmd-z', null)]), /Duplicate shortcut edit/);
const future = { ...original, future: { opaque: { keep: true } }, metadata: 42 };
assert.deepEqual(plain(applyBindingEdits(future, [edit('cmd-z', 'codenav.find-file')]).future), future.future);
assert.equal(applyBindingEdits(future, [edit('cmd-z', 'codenav.find-file')]).metadata, 42);
console.log('PASS expected-action conflicts, unrelated concurrent changes, personal terminal conflicts and unknown JSON preservation');

assert.equal(normalizeChord('cmd-O'), 'cmd-shift-o');
assert.equal(normalizeChord('cmd-shift-O'), 'cmd-shift-o');
assert.equal(normalizeChord('SHIFT-cmd-o'), 'cmd-shift-o');
assert.equal(normalizeChord('ctrl--'), 'ctrl--');
assert.equal(normalizeChord('cmd-Ö'), 'cmd-Ö', 'do not guess layout-specific case/shift aliases');
assert.equal(validateChord('ctrl-k  ctrl-s'), 'ctrl-k ctrl-s');
for (const invalid of ['', ' ', 'shift', 'shift shift', 'cmd-', 'cmd-control', 'cmd-a\nctrl-b', 'cmd-a\u0000']) assert.throws(() => validateChord(invalid));
next = applyBindingEdits({ 'layout:idea': { 'cmd-O': 'codenav.find-file' }, terminal: { 'cmd-O': 'codenav.key:cmd-O' } }, [edit('cmd-shift-o', 'codenav.find-class', 'codenav.find-file')]);
assert.equal(next['layout:idea']['cmd-O'], 'codenav.find-class', 'editing preserves a saved alias spelling');
assert.equal(actionForTerminalKey('cmd-shift-O', flat(next)).command, 'codenav.find-class');
assert.throws(() => applyBindingEdits({ 'layout:idea': { 'cmd-O': 'codenav.find-file', 'cmd-shift-o': 'personal.action' } }, [edit('cmd-O', null, 'codenav.find-file')]), /conflicting aliases/);
console.log('PASS GPUI ASCII shifted-letter equivalence, layout-dependent characters, input validation and ambiguous alias conflict');
