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
assert.equal(bindings['layout:codebench']['cmd-alt-1'],'codenav.fold-spaces','the always-mounted status view owns the spaces shortcut');
const foldStart=source.indexOf('function foldSpaces()'),foldEnd=source.indexOf('async function termKey',foldStart);
assert.ok(foldStart>=0&&foldEnd>foldStart,'status view defines the spaces fold action');
const foldedRuns=[],foldedStore={'sidebar.width':346};
let foldedLayout={id:'root',children:[{id:'sidebar',hidden:true,size:{px:346}}]};
const foldedContext=vm.createContext({
  layout:()=>foldedLayout,find:(node,id)=>node.id===id?node:(node.children??[]).map(child=>foldedContext.find(child,id)).find(Boolean),
  run:(name,args)=>foldedRuns.push([name,args]),shared:key=>foldedStore[key],setShared:(key,value)=>{foldedStore[key]=value},
  window:()=>({platform:'macos'}),
});
vm.runInContext(source.slice(foldStart,foldEnd)+';globalThis.foldSpaces=foldSpaces;',foldedContext);
foldedContext.foldSpaces();
assert.equal(JSON.stringify(foldedRuns.pop()),JSON.stringify(['layout.show',{id:'sidebar'}]),'a hidden spaces column comes back even when optional tools are absent');
foldedLayout.children[0]={id:'sidebar',size:{px:346}};foldedContext.foldSpaces();
assert.equal(JSON.stringify(foldedRuns.pop()),JSON.stringify(['layout.resize',{id:'sidebar',px:76}]));
foldedLayout.children[0].size.px=76;foldedContext.foldSpaces();
assert.equal(JSON.stringify(foldedRuns.pop()),JSON.stringify(['layout.resize',{id:'sidebar',px:346}]));
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
  const original=JSON.stringify({
    global:{'cmd-t':'tab.new'},
    'layout:idea':{'cmd-o':'personal.action'},
    'layout:codebench':{'cmd-alt-1':'activity.fold-spaces','cmd-alt-2':'personal.panel'},
  },null,2);
  await writeFile(target,original,{mode:0o600});
  const installer=fileURLToPath(new URL('./install_keys.py',import.meta.url));
  const install=()=>spawnSync('python3',[installer,sourcePath,target],{encoding:'utf8'});
  let result=install();assert.equal(result.status,0,result.stderr);
  let installed=JSON.parse(await readFile(target,'utf8'));
  assert.equal(installed.global['cmd-t'],'tab.new');
  assert.equal(installed['layout:idea']['cmd-o'],'personal.action','existing shortcuts win');
  assert.equal(installed['layout:codebench']['cmd-alt-1'],'codenav.fold-spaces','the retired default migrates to the always-mounted command owner');
  assert.equal(installed['layout:codebench']['cmd-alt-2'],'personal.panel','unrelated custom shortcuts still win');
  assert.ok(result.stdout.includes('Migrated 1 key binding'));
  assert.equal(installed['layout:idea'].shift,'codenav.shift-tap');
  assert.equal(installed.terminal.shift,'codenav.shift-tap');
  assert.ok(result.stdout.includes('Kept your existing shortcut: layout:idea: cmd-o'));
  assert.equal((await stat(target)).mode&0o777,0o600);
  let backups=(await readdir(directory)).filter(name=>name.startsWith('keys.json.backup-'));
  assert.equal(backups.length,1);assert.equal(await readFile(join(directory,backups[0]),'utf8'),original);
  const first=await readFile(target,'utf8');result=install();assert.equal(result.status,0,result.stderr);
  assert.equal(await readFile(target,'utf8'),first);assert.equal((await readdir(directory)).filter(name=>name.startsWith('keys.json.backup-')).length,1);
  await writeFile(target,'invalid json');result=install();assert.notEqual(result.status,0);assert.equal(await readFile(target,'utf8'),'invalid json');
  await rm(target);result=install();assert.notEqual(result.status,0);assert.ok(result.stderr.includes('Start Herdr once'));
  console.log('PASS portable install, conflict preservation, backup, permissions, idempotence and invalid/missing-file protection');
} finally { await rm(directory,{recursive:true,force:true}); }
