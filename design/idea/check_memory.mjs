// Per-space sizing must follow the full-width bottom divider, without changing
// codebench's independent editor/terminal split restoration.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {find} from '../../mods/codenav/layout-tree.js';
const context=vm.createContext({console});
let idea=true, active='a', queued=[], calls=[], state={}, tree;
const reset=()=>{
 tree={id:'root',children:[{id:'idea-upper',size:{weight:7}},
  {id:'editor-area',size:{weight:2},hidden:false},
  {id:'terminal-panel',size:{weight:3},hidden:false},
  {id:'editor-stack',active:'editor-code'}]};
 queued=[];calls=[];state={};active='a';
};
const overrides={find,AREA:'editor-area',STACK:'editor-stack',CHILD:{code:'editor-code',review:'editor-review'},
 spaces:()=>[{id:'a',active:active==='a'},{id:'b',active:active==='b'}],layout:()=>tree,
 shared:k=>state[k],setShared:(k,v)=>{state[k]=v},run:(name,args)=>calls.push({name,...args}),
 isIdea:()=>idea,editorSpec:()=>null,wantedChild:()=> 'editor-code',splitDir:()=> 'column',setSplit:dir=>calls.push({name:'split',dir})};
const source=await readFile(new URL('../../mods/codenav/memory.js',import.meta.url),'utf8');
const mod=new vm.SourceTextModule(source,{context});
await mod.link(id=>{
 const names=[...new Set([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter(m=>m[2]===id).flatMap(m=>m[1].split(',').map(s=>s.trim())))];
 return new vm.SyntheticModule(names,function(){for(const n of names)this.setExport(n,overrides[n])},{context});
});await mod.evaluate();
const follow=mod.namespace.followSpace,cx={timer:{after(_time,fn){queued.push(fn)}}};
for(idea of [true,false]){
 reset();const self={};follow(self,cx);follow(self,cx);
 assert.equal(self.memoryLast.areaWeight,idea?7:2);
 state['codenav.spaces']={b:{area:true,panel:true,review:false,areaWeight:5,panelWeight:4,split:'row'}};
 active='b';follow(self,cx);queued.splice(0).forEach(fn=>fn());
 assert.equal(state['codenav.spaces'].a.areaWeight,idea?7:2,'old workspace captures the correct divider');
 assert.ok(calls.some(c=>c.name==='layout.resize'&&c.id===(idea?'idea-upper':'editor-area')&&c.weight===5));
 assert.equal(calls.some(c=>c.name==='split'),!idea,'IDEA never reintroduces a saved side-by-side terminal split');
}
idea=true;reset();tree.children=tree.children.filter(n=>n.id!=='idea-upper');
const legacy={};follow(legacy,cx);follow(legacy,cx);assert.equal(legacy.memoryLast.areaWeight,2,'legacy pre-migration fallback');
console.log('PASS full-width upper divider memory, workspace preservation, legacy fallback and codebench split restoration');
