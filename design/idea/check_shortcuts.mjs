// Run: node design/idea/check_shortcuts.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const bindings=JSON.parse(await readFile(new URL('../../keys.json',import.meta.url),'utf8'));
assert.equal(bindings['layout:idea']['shift shift'],'codenav.find-all');
assert.equal(bindings.terminal['shift shift'],'codenav.key:shift shift');
assert.equal(bindings.global['shift shift'],undefined,'other layouts keep their own search behavior');
const source=await readFile(new URL('../../mods/codenav/status.js',import.meta.url),'utf8');
const start=source.indexOf('const TERM_KEYS ='), end=source.indexOf('// Herdr\'s agent notifications',start);
assert.ok(start>=0 && end>start);
let layout='idea';const opened=[],sent=[];
const context=vm.createContext({shared:()=>layout,openEverywhere:mode=>opened.push(mode),
  focused:()=>({terminal:'test'}),hc:async args=>{sent.push(args);return {code:0}},
  notify(){throw Error('unexpected failure')},run(){throw Error('unexpected command')},T:s=>s});
vm.runInContext(source.slice(start,end)+';globalThis.termKey=termKey;',context);
await context.termKey('shift shift');assert.deepEqual(opened,['all']);assert.equal(sent.length,0);
await context.termKey('cmd-shift-o');assert.deepEqual(opened,['all','files']);
layout='codebench';await context.termKey('shift shift');assert.equal(opened.length,2);assert.equal(sent.length,0);
await context.termKey('ctrl-e');assert.deepEqual(Array.from(sent[0]),['keys','test','ctrl+e']);
console.log('PASS native sequence bindings, terminal routing and other-layout/terminal-input preservation');

const directory=await mkdtemp(join(tmpdir(),'herdr-shortcut-install-'));
try {
  const sourcePath=join(directory,'defaults.json'), target=join(directory,'keys.json');
  await writeFile(sourcePath,JSON.stringify(bindings));
  const original=JSON.stringify({global:{'cmd-t':'tab.new'},'layout:idea':{'cmd-o':'personal.action'}},null,2);
  await writeFile(target,original,{mode:0o600});
  const installer=fileURLToPath(new URL('./install_keys.py',import.meta.url));
  const install=()=>spawnSync('python3',[installer,sourcePath,target],{encoding:'utf8'});
  let result=install();assert.equal(result.status,0,result.stderr);
  let installed=JSON.parse(await readFile(target,'utf8'));
  assert.equal(installed.global['cmd-t'],'tab.new');
  assert.equal(installed['layout:idea']['cmd-o'],'personal.action','existing shortcuts win');
  assert.equal(installed['layout:idea']['shift shift'],'codenav.find-all');
  assert.equal(installed.terminal['shift shift'],'codenav.key:shift shift');
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
