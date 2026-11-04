// Run: node --experimental-vm-modules design/idea/check_settings.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as actionRegistry from '../../mods/codenav/actions.js';
import * as toolbarModel from '../../mods/codenav/toolbar-model.js';
import * as toolLayout from '../../mods/codenav/tool-layout.js';
import * as keymapModel from '../../mods/codenav/keymap-model.js';
const context=vm.createContext({ console });
const handlers=new Map(), changes=[], tasks=[];
let keyBindings=[];
let readPreference=()=>{throw Error('unexpected preference read')};
let writePreference=()=>{throw Error('unexpected preference write')};
const treeRows=[];
const sharedState={'codenav.toolSides':{project:'left',terminal:'bottom',future:'right'},'codenav.toolHidden':['future']};
const settings={font_family:'Mono',font_size:14};
const el=()=>{const proxy=new Proxy({}, {get:(_o,key)=>key==='when'?(condition,apply)=>condition?apply(proxy):proxy:(...args)=>proxy});return proxy};
const controls=(id,label,action,options={})=>{if(!options.disabled)handlers.set(id,action);return el();};
const exported=(name,values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:name});
const tools={TOOLS:{project:{idea:'project',label:'Project'},terminal:{idea:'terminal',label:'Terminal'}},SIDES:{left:{label:'Left'},right:{label:'Right'},bottom:{label:'Bottom'}},DEFAULT_SIDES:{project:'left',terminal:'bottom'},currentSides:()=>({...sharedState['codenav.toolSides']}),hiddenTools:()=>new Set(sharedState['codenav.toolHidden']),arrange:want=>changes.push(JSON.parse(JSON.stringify(want)))};
const mocks={
'gpui-kit':{div:el},'gpui-base':{v_flex:el,h_flex:el,v_virtual_list:(_id,count,_height,_key,render)=>{render({start:0,end:count});return el()},Scrollbar:{vertical:el},Input:{new:el},InputState:{new:()=>({set_value(v){this.v=v},value(){return this.v},on(){},focus(){},release(){}})}},
herdr:{shared:k=>sharedState[k],setShared:(k,v)=>{sharedState[k]=v},settings:()=>settings,keys:()=>keyBindings,theme:()=>({}),run(){},props:()=>({overlay:'test'}),closeOverlay(){},openOverlay(){},appHome:()=>'/fake',readTextFile:(...args)=>readPreference(...args),writeTextFile:(...args)=>writePreference(...args)},
'./idea-design.js':{uiSize:()=>13,IDEA:{iconSize:16,rowHeight:22},MenuController:class{constructor(cx){this.focus=cx.focus_handle();this.scroll={};}ensureVisible(index){this.visible=index}release(){}},uiInputBox:el,uiButton:controls,uiToolbar:el,uiColors:()=>({}),uiCaption:el,uiSettingsShell:el,uiTreeRow:(id,label,options)=>{treeRows.push({id,label,...options});return el()},uiIconButton:(id,graphic,action,opts)=>controls(id,'',action,opts),uiCheckbox:controls,NOTIFICATION_GROUPS:[{id:'codenav.general',label:'General',defaults:{popup:true,log:true,sound:true}},{id:'herdr.agents',label:'Agents',defaults:{popup:false,log:true,sound:false}}]},
'./lsp-setup.js':{openLspSetup(){}},
'./common.js':{icon:el,button:el,codeFont:()=>({family:'Mono',size:14})},'./i18n.js':{T:s=>s},'./tool-windows.js':tools,'./tool-layout.js':toolLayout,'./keymap-model.js':keymapModel,'./ideaicons.js':{toolImage:el},'./actions.js':actionRegistry,'./toolbar-model.js':toolbarModel};
const module=new vm.SourceTextModule(await readFile(new URL('../../mods/codenav/settings.js', import.meta.url),'utf8'),{context});
await module.link(id=>exported(id,mocks[id]));await module.evaluate();
const View=module.namespace.default,cx={focus_handle:()=>({focus(){},release(){}}),notify(){},stop_propagation(){},spawn(fn){tasks.push(fn(cx))}};
const selectTool=(v,name)=>{v.selectCustom(v.customRows().find(row=>row.id===`tool:${name}`),cx);v.toolbarsBody()};
const create=()=>{const v=new View();v.init({page:'windows'},cx);selectTool(v,'project');return v};
let view=create();
handlers.get('settings-tool-project-right')(null,cx);selectTool(view,'terminal');handlers.get('settings-tool-terminal-visible')(null,cx);
assert.equal(sharedState['codenav.toolSides'].project,'left','editing/cancel must not move tools');
assert.deepEqual(sharedState['codenav.toolHidden'],['future']);assert.equal(changes.length,0);
// Discard that view as Cancel does; no staged preference can leak.
view=create();handlers.get('settings-tool-project-right')(null,cx);
// A concurrent preference update for another tool must survive Apply.
sharedState['codenav.toolSides'].terminal='right';sharedState['codenav.toolHidden'].push('project');
view.apply(cx);await Promise.all(tasks.splice(0));
assert.deepEqual(changes,[{project:'right'}],'Apply only moves the edited tool');
assert.equal(sharedState['codenav.toolSides'].terminal,'right');assert.equal(sharedState['codenav.toolSides'].future,'right');
assert.deepEqual(sharedState['codenav.toolHidden'],['future','project'],'unchanged visibility preserves concurrent changes');
view=create();selectTool(view,'terminal');handlers.get('settings-tool-terminal-visible')(null,cx);view.apply(cx);await Promise.all(tasks.splice(0));
assert.deepEqual([...sharedState['codenav.toolHidden']],['future','project','terminal']);assert.equal(changes.length,1,'visibility changes do not move tools');
view=create();handlers.get('custom-restore')(null,cx);assert.equal(changes.length,1,'restore remains staged');view.apply(cx);await Promise.all(tasks.splice(0));
assert.deepEqual(changes[1],{project:'left',terminal:'bottom'});assert.equal(view.restoreToolLayout,false);
console.log('PASS staged/cancel, changed-tool-only Apply, concurrent preference preservation, visibility-only Apply, staged restore');
keyBindings=[{section:'layout:idea',keys:'cmd-shift-space',action:'codenav.find-all'}, {section:'terminal',keys:'cmd-shift-space',action:'codenav.key:cmd-shift-space'}];
view=create();view.keyQuery='cmd-shift-space';view.keymapBody();
assert.equal(view.bindings().filter(row=>row.action==='codenav.find-all').length,1,'terminal forwarding does not duplicate the editable action');
assert.equal(view.bindings().find(row=>row.action==='codenav.find-all').label,'Search Everywhere');
assert.equal(view.bindings().find(row=>row.action==='codenav.find-all').group,'Navigation');
assert.ok(view.bindings().some(row=>row.action==='codenav.notifications-clear'&&!row.chords.length),'unassigned registered actions are editable');
assert.ok(treeRows.some(row=>row.label==='Search Everywhere'&&row.shortcut==='⌘⇧Space'));
console.log('PASS Search Everywhere keymap label, navigation group, modifier sequence and search');

sharedState['codenav.customization']={schemaVersion:1,future:{keep:true},groups:{'future.group':{future:true}}};
const original=JSON.stringify(sharedState['codenav.customization']);
view=create();view.toolbarGroup='MainToolbar.right';view.toolbarItem='search.action';
view.editToolbar('remove',cx);
assert.ok(!view.toolbarItems().some(item=>item.id==='search.action'));
assert.equal(JSON.stringify(sharedState['codenav.customization']),original,'toolbar edits and Cancel remain local to the draft');
view=create();view.toolbarGroup='MainToolbar.right';view.toolbarItem='search.action';
const searchAt=view.toolbarItems().findIndex(item=>item.id==='search.action');
view.addSelection='codenav.find-file';view.addToolbarItem(cx);
const added=view.toolbarItem;
assert.equal(view.toolbarItems()[searchAt+1].action,'codenav.find-file','new action is inserted after the selected item');
view.editToolbar('up',cx);
assert.equal(view.toolbarItems()[searchAt].id,added);
view.editToolbar('separator',cx);
assert.equal(view.toolbarItems()[searchAt+1].kind,'separator');
view.toolbarItem=added;view.setToolbarIcon('terminal',cx);
sharedState['codenav.customization'].groups['header.Project']={added:[{id:'future.action',kind:'action',action:'future.command'}],futureOption:42};
view.apply(cx);await Promise.all(tasks.splice(0));
assert.ok(!view.error);
assert.deepEqual(sharedState['codenav.customization'].future,{keep:true});
assert.equal(sharedState['codenav.customization'].groups['header.Project'].futureOption,42,'unrelated concurrent group survives Apply');
assert.equal(toolbarModel.groupItems('MainToolbar.right',sharedState['codenav.customization'],actionRegistry.ACTION_GROUPS).find(item=>item.id===added).icon,'terminal');
view=create();view.toolbarGroup='MainToolbar.right';view.editToolbar('restore',cx);
view.apply(cx);await Promise.all(tasks.splice(0));
assert.equal(sharedState['codenav.customization'].groups['MainToolbar.right'],undefined,'Restore removes only that group override');
assert.equal(sharedState['codenav.customization'].groups['future.group'].future,true);
view=create();view.toolbarGroup='MainToolbar.right';view.toolbarItem='search.action';view.editToolbar('remove',cx);
sharedState['codenav.customization'].groups['MainToolbar.right']={futureConcurrent:true};
view.apply(cx);await Promise.all(tasks.splice(0));
assert.match(view.error,/changed in another window/,'same-group concurrent changes are rejected');
assert.equal(sharedState['codenav.customization'].groups['MainToolbar.right'].futureConcurrent,true);
console.log('PASS toolbar draft/Cancel, add/reorder/separator/icon, Apply merge, scoped restore, unknown preservation and concurrent conflict');

sharedState['codenav.notificationPolicy']={future:7,groups:{'future.group':{sound:false}}};
view=create();view.notificationsBody();handlers.get('notify-policy-codenav.general-sound')(null,cx);
assert.equal(sharedState['codenav.notificationPolicy'].groups['codenav.general'],undefined,'notification policy is staged');
view.apply(cx);await Promise.all(tasks.splice(0));
assert.equal(sharedState['codenav.notificationPolicy'].groups['codenav.general'].sound,false);
assert.equal(sharedState['codenav.notificationPolicy'].future,7);
view=create();view.notificationsBody();handlers.get('notify-policy-restore')(null,cx);view.apply(cx);await Promise.all(tasks.splice(0));
assert.equal(sharedState['codenav.notificationPolicy'].groups['codenav.general'],undefined);
assert.equal(sharedState['codenav.notificationPolicy'].groups['future.group'].sound,false);
console.log('PASS notification group draft/Apply/default restore and future fields');

// Exercise both real save paths: retries must transform a fresh snapshot and
// retain staged shortcuts when validation or every write fails.
let raw=JSON.stringify({future:{keep:true}}), attempts=0, reads=0;
readPreference=async()=>{reads++;return raw};
writePreference=async(path,text,expected)=>{
  assert.equal(path,'/fake/keys.json'); assert.equal(expected,raw);
  if (++attempts===1) {raw=JSON.stringify({future:{keep:true},'mod:activity':{'cmd-p':'activity.preview'}});throw Error('stale snapshot')}
  raw=text;
};
view=create();view.pendingBindings=[{section:'layout:idea',chord:'cmd-k',action:'codenav.find-file',expected:null}];
await view.saveShortcuts();
assert.equal(attempts,2);assert.equal(reads,2);assert.equal(view.pendingBindings.length,0);
assert.equal(JSON.parse(raw)['mod:activity']['cmd-p'],'activity.preview');assert.equal(JSON.parse(raw).future.keep,true);
assert.equal(JSON.parse(raw)['layout:idea']['cmd-k'],'codenav.find-file');
attempts=0;writePreference=async()=>{attempts++;throw Error('write rejected')};
view.pendingBindings=[{section:'layout:idea',chord:'cmd-j',action:'codenav.find-class',expected:null}];
await assert.rejects(view.saveShortcuts(),/write rejected/);assert.equal(attempts,3);assert.equal(view.pendingBindings.length,1);
raw='{broken';attempts=0;reads=0;
await assert.rejects(view.saveShortcuts());assert.equal(reads,1);assert.equal(attempts,0);assert.equal(view.pendingBindings.length,1);
raw=JSON.stringify({'layout:idea':{'cmd-j':'other.action'}});reads=0;
await assert.rejects(view.saveShortcuts(),/changed since editing/);assert.equal(reads,1);assert.equal(attempts,0);

raw=JSON.stringify({future:{keep:true}});attempts=0;reads=0;
writePreference=async(path,text,expected)=>{
  assert.equal(path,'/fake/settings.json');assert.equal(expected,raw);
  if (++attempts===1) {raw=JSON.stringify({future:{keep:true},zoom:1.25});throw Error('stale snapshot')}
  raw=text;
};
view=create();view.draft.terminalFont='Updated Mono';view.apply(cx);await Promise.all(tasks.splice(0));
assert.ok(!view.error,view.error);assert.equal(attempts,2);assert.equal(reads,2);
assert.equal(JSON.parse(raw).font,'Updated Mono');assert.equal(JSON.parse(raw).zoom,1.25);assert.equal(JSON.parse(raw).future.keep,true);
console.log('PASS preference CAS retries, latest unrelated fields, bounded failure, parse/domain failure and pending shortcut preservation');

sharedState['codenav.toolSides']={project:'left',terminal:'left',future:'right'};
sharedState['codenav.toolOrder']={left:['future-tool','project','terminal'],futureSide:['future-tool']};
view=create();view.reorderWindowTool('terminal',-1,cx);
assert.deepEqual(Array.from(view.windowTools()),['terminal','project']);
assert.equal(sharedState['codenav.toolOrder'].left[1],'project','reorder and Cancel remain staged');
sharedState['codenav.toolOrder'].right=['future-concurrent'];
const layoutChanges=changes.length;view.apply(cx);await Promise.all(tasks.splice(0));
assert.ok(!view.error,view.error);assert.equal(changes.length,layoutChanges,'reordering does not move panels');
assert.deepEqual(Array.from(sharedState['codenav.toolOrder'].left),['terminal','project','future-tool']);
assert.deepEqual(sharedState['codenav.toolOrder'].right,['future-concurrent']);
assert.deepEqual(sharedState['codenav.toolOrder'].futureSide,['future-tool']);
view=create();view.reorderWindowTool('terminal',1,cx);
sharedState['codenav.toolOrder'].left=['future-other','project','terminal'];
view.apply(cx);await Promise.all(tasks.splice(0));assert.match(view.error,/changed in another window/);
assert.deepEqual(sharedState['codenav.toolOrder'].left,['future-other','project','terminal']);
console.log('PASS position groups, staged order, no layout churn, future items/sides and unrelated concurrent order preservation, same-group conflict');

keyBindings=[{section:'layout:idea',keys:'cmd-b',action:'codenav.definition'},{section:'terminal',keys:'cmd-b',action:'codenav.key:cmd-b'}];
raw=JSON.stringify({'layout:idea':{'cmd-b':'codenav.definition'},terminal:{'cmd-b':'codenav.key:cmd-b'},future:{keep:'yes'}});
writePreference=async(path,text,expected)=>{assert.equal(path,'/fake/keys.json');assert.equal(expected,raw);raw=text};
view=create();view.selectedBinding='layout:idea:codenav.definition';view.selectedChord='cmd-b';
view.beginShortcut(cx,'replace');view.newShortcut='cmd-shift-d';view.stageShortcut(cx);
assert.equal(view.error,null);assert.deepEqual(Array.from(view.bindings().find(row=>row.id===view.selectedBinding).chords),['cmd-shift-d']);
assert.equal(JSON.parse(raw)['layout:idea']['cmd-b'],'codenav.definition','replacement is staged until Apply');
await view.saveShortcuts();
assert.equal(JSON.parse(raw)['layout:idea']['cmd-b'],undefined);assert.equal(JSON.parse(raw).terminal['cmd-b'],undefined);
assert.equal(JSON.parse(raw).terminal['cmd-shift-d'],'codenav.key:cmd-shift-d');assert.equal(JSON.parse(raw).future.keep,'yes');
view.removeShortcut(cx);assert.equal(view.pendingBindings.length,1);await view.saveShortcuts();
assert.equal(JSON.parse(raw)['layout:idea']['cmd-shift-d'],undefined);assert.equal(JSON.parse(raw).terminal['cmd-shift-d'],undefined);
view.beginShortcut(cx);view.newShortcut='cmd-O';view.stageShortcut(cx);await view.saveShortcuts();
assert.equal(JSON.parse(raw)['layout:idea']['cmd-shift-o'],'codenav.definition','new shortcut is normalized and added');
assert.equal(JSON.parse(raw).terminal['cmd-shift-o'],'codenav.key:cmd-shift-o');
console.log('PASS real Settings add/replace/remove, draft isolation, normalized entry and atomic terminal bridge save');

keyBindings=[{section:'layout:idea',keys:'cmd-shift-o',action:'codenav.find-file'},{section:'terminal',keys:'cmd-shift-o',action:'codenav.terminal-files'}];
raw=JSON.stringify({'layout:idea':{'cmd-shift-o':'codenav.find-file'},terminal:{'cmd-shift-o':'codenav.terminal-files'}});
view=create();view.selectedBinding='terminal:codenav.terminal-files';view.selectedChord='cmd-shift-o';
assert.deepEqual(Array.from(view.bindings().find(row=>row.id===view.selectedBinding).chords),['cmd-shift-o'],'terminal-specific action is editable separately from editor Go to File');
view.beginShortcut(cx,'replace');view.newShortcut='cmd-shift-i';view.stageShortcut(cx);await view.saveShortcuts();
assert.equal(JSON.parse(raw)['layout:idea']['cmd-shift-o'],'codenav.find-file');
assert.equal(JSON.parse(raw).terminal['cmd-shift-i'],'codenav.terminal-files');
assert.equal(JSON.parse(raw).terminal['cmd-shift-o'],undefined);
console.log('PASS terminal-specific shortcut edit preserves editor shortcut');

// The former Tool Windows entry lands in the single customization tree.
view=create();assert.equal(view.page,'toolbars');
assert.ok(view.customRows().some(row=>row.id==='main'));
assert.ok(view.customRows().some(row=>row.id==='tools'));
assert.ok(view.customRows().some(row=>row.id==='tool:terminal'&&row.parent==='side:left'));
view.selectCustom(view.customRows().find(row=>row.id==='side:left'),cx,true);
assert.ok(!view.customRows().some(row=>row.id==='tool:terminal'));
view.customKey({key:'right'},cx);
assert.ok(view.customRows().some(row=>row.id==='tool:terminal'));
view.customKey({key:'right'},cx);assert.equal(view.customSelected,'tool:project');
view.customKey({key:'down'},cx);assert.equal(view.customSelected,'tool:terminal');
const beforeHidden=sharedState['codenav.toolHidden'].slice();
view.customKey({key:'space'},cx);assert.ok(view.draft.toolHidden.includes('terminal'));
assert.deepEqual(sharedState['codenav.toolHidden'],beforeHidden,'tree keyboard visibility remains a local draft');
view.customKey({key:'left'},cx);assert.equal(view.customSelected,'side:left');
view.customKey({key:'end'},cx);assert.equal(view.customSelected,view.customRows().at(-1).id);
assert.equal(view.customMenu.visible,view.customRows().length-1,'keyboard reveals the selected last row');
view.customQuery='review toolbar';
assert.ok(view.customRows().some(row=>row.id==='item:Review.toolbar/next-diff.action'),'search expands a collapsed matching group');
assert.ok(!view.customRows().some(row=>row.id==='tool:project'));
view.customQuery='no matches at all';assert.equal(view.customRows().length,0);view.customKey({key:'down'},cx);
view.customQuery='';view.selectCustom(view.customRows().find(row=>row.id==='group:MainToolbar.right'),cx);
view.addSelection='codenav.find-file';view.addToolbarItem(cx);
assert.equal(view.customSelected,`item:MainToolbar.right/${view.toolbarItem}`,'adding selects and reveals the actual inserted tree row');
const removedId=view.customSelected;view.editCustom('remove',cx);
assert.ok(!view.customRows().some(row=>row.id===removedId));
assert.ok(view.customRows().some(row=>row.id===view.customSelected),'removal leaves a real selected row');
view.release();
console.log('PASS unified tree routing, disclosure, search, keyboard/reveal, draft visibility, add/remove selection and handle release');
