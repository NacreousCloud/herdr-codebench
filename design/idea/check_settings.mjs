// Run: node --experimental-vm-modules design/idea/check_settings.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context=vm.createContext({ console });
const handlers=new Map(), changes=[], tasks=[];
let keyBindings=[];
const treeRows=[];
const sharedState={'codenav.toolSides':{project:'left',terminal:'bottom',future:'right'},'codenav.toolHidden':['future']};
const settings={font_family:'Mono',font_size:14};
const el=()=>new Proxy({}, {get:(_o,key)=> (...args)=> {if(key==='on_click'){} return el();}});
const controls=(id,label,action,options={})=>{if(!options.disabled)handlers.set(id,action);return el();};
const exported=(name,values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:name});
const tools={TOOLS:{project:{idea:'project',label:'Project'},terminal:{idea:'terminal',label:'Terminal'}},SIDES:{left:{label:'Left'},right:{label:'Right'},bottom:{label:'Bottom'}},savedSides:()=>({...sharedState['codenav.toolSides']}),hiddenTools:()=>new Set(sharedState['codenav.toolHidden']),arrange:want=>changes.push(JSON.parse(JSON.stringify(want)))};
const mocks={
'gpui-kit':{div:el},'gpui-base':{v_flex:el,h_flex:el,Input:{new:el},InputState:{new:()=>({set_value(v){this.v=v},value(){return this.v},on(){}})}},
herdr:{shared:k=>sharedState[k],setShared:(k,v)=>{sharedState[k]=v},settings:()=>settings,keys:()=>keyBindings,theme:()=>({}),run(){},props:()=>({overlay:'test'}),closeOverlay(){},openOverlay(){},appHome:()=>'/fake',readTextFile(){throw Error('unexpected file write')},writeTextFile(){throw Error('unexpected file write')}},
'./idea-design.js':{uiSize:()=>13,IDEA:{iconSize:16},uiInputBox:el,uiButton:controls,uiToolbar:el,uiColors:()=>({}),uiCaption:el,uiSettingsShell:el,uiTreeRow:(id,label,options)=>{treeRows.push({id,label,...options});return el()},uiIconButton:el,uiCheckbox:controls},
'./common.js':{icon:el,button:el,codeFont:()=>({family:'Mono',size:14})},'./i18n.js':{T:s=>s},'./tools.js':tools,'./ideaicons.js':{toolImage:el}};
const module=new vm.SourceTextModule(await readFile(new URL('../../mods/codenav/settings.js', import.meta.url),'utf8'),{context});
await module.link(id=>exported(id,mocks[id]));await module.evaluate();
const View=module.namespace.default,cx={focus_handle:()=>({focus(){}}),notify(){},spawn(fn){tasks.push(fn(cx))}};
const create=()=>{const v=new View();v.init({page:'windows'},cx);v.toolWindowsBody();return v};
let view=create();
handlers.get('settings-tool-project-right')(null,cx);handlers.get('settings-tool-terminal-visible')(null,cx);
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
view=create();handlers.get('settings-tool-terminal-visible')(null,cx);view.apply(cx);await Promise.all(tasks.splice(0));
assert.deepEqual([...sharedState['codenav.toolHidden']],['future','project','terminal']);assert.equal(changes.length,1,'visibility changes do not move tools');
view=create();handlers.get('settings-tool-restore')(null,cx);assert.equal(changes.length,1,'restore remains staged');view.apply(cx);await Promise.all(tasks.splice(0));
assert.deepEqual(changes[1],{project:'right',terminal:'right'});assert.equal(view.restoreToolLayout,false);
console.log('PASS staged/cancel, changed-tool-only Apply, concurrent preference preservation, visibility-only Apply, staged restore');
keyBindings=[{section:'layout:idea',keys:'shift shift',action:'codenav.find-all'}, {section:'terminal',keys:'shift shift',action:'codenav.key:shift shift'}];
view=create();view.keyQuery='shift shift';view.keymapBody({});
assert.equal(view.bindings().length,1,'terminal forwarding does not duplicate the editable action');
assert.equal(view.bindings()[0].label,'Search Everywhere');
assert.equal(view.bindings()[0].group,'Navigation');
assert.equal(treeRows.find(row=>row.label==='Search Everywhere').shortcut,'⇧ ⇧');
console.log('PASS Search Everywhere keymap label, navigation group, modifier sequence and search');
