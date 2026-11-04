import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const context = vm.createContext({ console });
let store = { layout: "idea" }, sounds = [], native = [], muted = false;
const source = await readFile(new URL("./ui.js", import.meta.url), "utf8");
const mocks = { shared: key => store[key], setShared: (key,value) => store[key]=value,
  settings: () => ({ sounds: { enabled: !muted } }), playSound: value => sounds.push(value),
  notify: note => native.push(note), theme: () => ({}) };
const module = new vm.SourceTextModule(source, { context });
await module.link(async id => {
  if (id === "./idea-tokens.js") {
    const tokens = new vm.SourceTextModule(await readFile(new URL("../../mods/codenav/idea-tokens.js", import.meta.url), "utf8"), { context });
    return tokens;
  }
  const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].find(match=>match[2]===id)[1].split(",").map(x=>x.trim().split(/\s+as\s+/)[0]);
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name,mocks[name]??(()=>{})); }, { context });
});
await module.evaluate();
const { uiNotify, notificationPolicy } = module.namespace;
const id=uiNotify({title:"Saved",group:"codenav.files",dedupeKey:"saved:one"});
assert.equal(sounds.length,1); assert.equal(store["codenav.notifications"][0].id,id);assert.equal(store["codenav.noticeQueue"][0].id,id);
assert.equal(uiNotify({title:"Saved",group:"codenav.files",dedupeKey:"saved:one"}),id);assert.equal(sounds.length,1,"duplicated delivery doesn't replay sound");
uiNotify({title:"Agent finished",group:"herdr.agents"});assert.equal(sounds.length,1);assert.equal(store["codenav.noticeQueue"].length,1,"agent mirror doesn't duplicate native toast");
store["codenav.notificationPolicy"]={future:true,groups:{"codenav.files":{popup:false,log:false,sound:true}}};
const logs=store["codenav.notifications"].length;
uiNotify({title:"Files",group:"codenav.files"});assert.equal(store["codenav.notifications"].length,logs);assert.equal(store["codenav.noticeQueue"].length,1);assert.equal(sounds.length,2);
muted=true;uiNotify({title:"Muted",level:"error"});assert.equal(sounds.length,2,"global preference wins over group policy");
muted=false;uiNotify({title:"Silent",silent:true});assert.equal(sounds.length,2);
assert.equal(notificationPolicy("future.group").popup,true,"future groups inherit safe general defaults");
store.layout="codebench";uiNotify({title:"Native"});assert.equal(native.length,1,"other layouts retain native notifications");
console.log("PASS shared event IDs, log/popup/sound policy, global mute, explicit silent, dedupe and native fallback");
