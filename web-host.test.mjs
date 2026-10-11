import test from 'node:test';import assert from 'node:assert/strict';import {createHostBridge} from './web-host.mjs';
test('host bridge sends through pi and restores extension dialogs on close',async()=>{
 const events=[],sent=[],observers=new Set(),original=async()=>false;
 const ctx={isIdle:()=>true,ui:{confirm:original,setStatus(){}},sessionManager:{getBranch:()=>[]},modelRegistry:{getAvailable:()=>[]},abort:async()=>{}};
 const bridge=createHostBridge({pi:{sendUserMessage:s=>sent.push(s)},ctx,observers,onEvent:e=>events.push(e)});
 await bridge.request('prompt',{message:'Привет'});assert.deepEqual(sent,['Привет']);
 const result=ctx.ui.confirm('Продолжить?','Текст');assert.equal(events[0].method,'confirm');bridge.respond({id:events[0].id,confirmed:true});assert.equal(await result,true);
 ctx.ui.setStatus('quota','Осталось 100');assert.equal(events.at(-1).statusText,'Осталось 100');
 const pending=ctx.ui.confirm('Ещё?');await bridge.dispose();assert.equal(await pending,false);assert.equal(ctx.ui.confirm,original);assert.equal(observers.size,0);
});
