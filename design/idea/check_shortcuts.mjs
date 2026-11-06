// Run: node design/idea/check_shortcuts.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const bindings=JSON.parse(await readFile(new URL('../../keys.json',import.meta.url),'utf8'));
// Double Shift: one "shift" binding per tap (dispatched at once); codenav times the pair.
for (const section of ['layout:idea','layout:codebench','terminal']) assert.equal(bindings[section].shift,'codenav.shift-tap',section);
assert.equal(bindings.global.shift,undefined,'other layouts keep their own search behavior');
assert.ok(Object.values(bindings).every(s=>!('shift shift' in s)),'no GPUI shift sequence: it waits for the second Shift without a time limit');
const source=await readFile(new URL('../../mods/codenav/status.js',import.meta.url),'utf8');
const start=source.indexOf('const TERM_KEYS ='), end=source.indexOf('// Herdr\'s agent notifications',start);
assert.ok(start>=0 && end>start);
let layout='idea';const opened=[],sent=[];
const store={};
const context=vm.createContext({shared:key=>key==='layout'?layout:store[key],openEverywhere:mode=>opened.push(mode),
  focused:()=>({terminal:'test'}),hc:async args=>{sent.push(args);return {code:0}},
  notify(){throw Error('unexpected failure')},run(){throw Error('unexpected command')},T:s=>s});
vm.runInContext(source.slice(start,end)+';globalThis.termKey=termKey;globalThis.shiftTap=shiftTap;',context);
let taps={};
assert.equal(context.shiftTap(taps,1000),false);assert.equal(context.shiftTap(taps,1150),true);assert.deepEqual(opened,['all'],'two taps 150 ms apart open search');
assert.equal(context.shiftTap(taps,2000),false);assert.equal(context.shiftTap(taps,2300),false);assert.equal(opened.length,1,'300 ms apart is two single taps');
assert.equal(context.shiftTap(taps,2450),true);assert.equal(opened.length,2,'the slow tap starts a new pair');
store['codenav.doubleShiftMs']=400;taps={};context.shiftTap(taps,0);assert.equal(context.shiftTap(taps,350),true,'the interval is adjustable');delete store['codenav.doubleShiftMs'];
await context.termKey('cmd-shift-o');assert.deepEqual(opened.at(-1),'files');
const before=opened.length;
layout='codebench';taps={};context.shiftTap(taps,0);assert.equal(context.shiftTap(taps,100),true);assert.equal(opened.length,before+1);assert.equal(sent.length,0);
layout='main';taps={};context.shiftTap(taps,0);assert.equal(context.shiftTap(taps,100),false,'other layouts ignore Shift taps');
await context.termKey('ctrl-e');assert.deepEqual(Array.from(sent[0]),['keys','test','ctrl+e']);
console.log('PASS double Shift timing (200 ms, adjustable), terminal routing and other-layout/terminal-input preservation');

const directory=await mkdtemp(join(tmpdir(),'herdr-shortcut-install-'));
try {
  const sourcePath=join(directory,'defaults.json'), target=join(directory,'keys.json');
  await writeFile(sourcePath,JSON.stringify(bindings));
  const typedAction={command:'layout.resize',args:{id:'sidebar',px:240}};
  const original=JSON.stringify({global:{'cmd-t':'tab.new'},'layout:idea':{'cmd-o':'personal.action','ctrl-shift-r':typedAction}},null,2);
  await writeFile(target,original,{mode:0o600});
  const installer=fileURLToPath(new URL('./install_keys.py',import.meta.url));
  const install=()=>spawnSync('python3',[installer,sourcePath,target],{encoding:'utf8'});
  let result=install();assert.equal(result.status,0,result.stderr);
  let installed=JSON.parse(await readFile(target,'utf8'));
  assert.equal(installed.global['cmd-t'],'tab.new');
  assert.equal(installed['layout:idea']['cmd-o'],'personal.action','existing shortcuts win');
  assert.deepEqual(installed['layout:idea']['ctrl-shift-r'],typedAction,'typed shortcuts remain unchanged');
  assert.equal(installed['layout:idea'].shift,'codenav.shift-tap');
  assert.equal(installed.terminal.shift,'codenav.shift-tap');
  assert.ok(result.stdout.includes('Kept your existing shortcut: layout:idea: cmd-o'));
  assert.equal((await stat(target)).mode&0o777,0o600);
  let backups=(await readdir(directory)).filter(name=>name.startsWith('keys.json.backup-'));
  assert.equal(backups.length,1);assert.equal(await readFile(join(directory,backups[0]),'utf8'),original);
  const first=await readFile(target,'utf8');result=install();assert.equal(result.status,0,result.stderr);
  assert.equal(await readFile(target,'utf8'),first);assert.equal((await readdir(directory)).filter(name=>name.startsWith('keys.json.backup-')).length,1);
  const invalidActions=[
    ['empty command',{command:''}],
    ['non-object args',{command:'layout.resize',args:'sidebar'}],
    ['missing command',{args:{id:'sidebar'}}],
  ];
  for (const [label,action] of invalidActions) {
    const invalidSource=JSON.parse(JSON.stringify(bindings));
    invalidSource.global['ctrl-alt-i']=action;
    await writeFile(sourcePath,JSON.stringify(invalidSource));
    await writeFile(target,first);
    const beforeInvalid=await readFile(target);
    result=install();assert.notEqual(result.status,0,label);assert.ok(result.stderr.includes('Invalid key bindings'),label);
    assert.deepEqual(await readFile(target),beforeInvalid,`${label} must not change the target`);
  }
  await writeFile(sourcePath,JSON.stringify(bindings));
  await writeFile(target,'invalid json');result=install();assert.notEqual(result.status,0);assert.equal(await readFile(target,'utf8'),'invalid json');
  await rm(target);result=install();assert.notEqual(result.status,0);assert.ok(result.stderr.includes('Start Herdr once'));
  console.log('PASS portable install, conflict preservation, backup, permissions, idempotence and invalid/missing-file protection');
} finally { await rm(directory,{recursive:true,force:true}); }
