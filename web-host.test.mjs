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

test('host bridge exposes compaction-aware history, context usage and manual compaction',async()=>{
 const entries=[
  {type:'compaction',summary:'Краткий итог',tokensBefore:90000,firstKeptEntryId:'x',timestamp:3},
  {type:'message',message:{role:'user',content:'Новое'}},
 ];
 const events=[];
 const ctx={
  isIdle:()=>true,ui:{},
  sessionManager:{buildContextEntries:()=>entries,getBranch:()=>entries},
  modelRegistry:{getAvailable:()=>[]},abort:async()=>{},
  getContextUsage:()=>({tokens:45000,contextWindow:200000,percent:23}),
  compact:options=>options.onComplete({summary:'Итог',tokensBefore:90000,estimatedTokensAfter:30000}),
 };
 const bridge=createHostBridge({pi:{},ctx,observers:new Set(),onEvent:event=>events.push(event)});
 const messages=(await bridge.request('get_messages')).messages;
 assert.equal(messages[0].role,'compactionSummary');
 assert.equal(messages[0].summary,'Краткий итог');
 assert.equal(messages[1].content,'Новое');
 assert.deepEqual(await bridge.request('get_session_stats'),{contextUsage:{tokens:45000,contextWindow:200000,percent:23}});
 const result=await bridge.request('compact');
 assert.equal(result.tokensBefore,90000);
});
