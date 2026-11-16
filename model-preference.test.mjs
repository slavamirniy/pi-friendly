import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createModelPreference,installModelPreference} from './model-preference.mjs';
test('a harness or explicit launch keeps its model and the standalone UI preference',async()=>{
 const opus={id:'claude-opus-5.5',provider:'router'},deepseek={id:'deepseek-v4.1-flash',provider:'router'};
 for(const [mode,args,restore] of [['rpc',[],false],['json',[],false],['print',[],false],['tui',['--model',deepseek.id],false],['tui',['--provider=router'],false],['tui',[],true]]){
  const handlers={},saved=[],selected=[];
  const ctx={mode,hasUI:true,model:deepseek,modelRegistry:{getAvailable:()=>[opus,deepseek]}};
  installModelPreference({on:(key,fn)=>handlers[key]=fn,setModel:async m=>selected.push(m)},{resolve:()=>opus,save:m=>saved.push(m)},args);
  await handlers.session_start({reason:'startup'},ctx);
  await handlers.session_start({reason:'resume'},ctx);
  await handlers.model_select({source:'set',model:deepseek},ctx);
  assert.deepEqual(selected,restore?[opus]:[]);assert.deepEqual(saved,restore?[deepseek]:[]);
 }
});
test('model preference survives new sessions and gracefully skips unavailable models',t=>{
 const root=mkdtempSync(join(tmpdir(),'pi-model-test-'));t.after(()=>{assert.equal(dirname(realpathSync(root)),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});});
 const file=join(root,'model.json'),store=createModelPreference(file),model={id:'chosen',provider:'router',name:'Chosen'};
 assert.equal(store.resolve([model]),undefined);store.save(model);
 assert.deepEqual(createModelPreference(file).read(),{id:'chosen',provider:'router'});
 assert.equal(createModelPreference(file).resolve([model]),model);assert.equal(store.resolve([]),undefined);
 writeFileSync(file,'bad json');assert.equal(store.read(),undefined);
});
