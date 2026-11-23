import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMessage,publicMessages,mergeMessage,reconcileMessages,updateTool,toolView} from './web-messages.mjs';
test('short or empty snapshots cannot erase a streamed reply; replacements are labelled separately',()=>{
 const old=publicMessage({role:'assistant',content:'Уже полученный текст'});
 assert.equal(mergeMessage(old,publicMessage({role:'assistant',content:''})).text,old.text);
 assert.equal(mergeMessage(old,publicMessage({role:'assistant',content:'Уже'})).text,old.text);
 const final=mergeMessage(old,publicMessage({role:'assistant',content:'Новый ответ'}),true);
 assert.equal(final.text,'Новый ответ');assert.equal(final.versions[0].text,old.text);
 const erased=mergeMessage(old,publicMessage({role:'assistant',content:[],stopReason:'error',errorMessage:'Router error'}),true);
 assert.equal(erased.text,old.text);assert.equal(erased.status,'error');assert.equal(erased.retained,true);
 assert.equal(reconcileMessages([old],[])[0].text,old.text);
});
test('tool progress, output and errors survive message snapshots and session history',()=>{
 const start=updateTool(toolView({id:'x',name:'write',arguments:{path:'index.html'}}),{type:'tool_execution_start'});
 const end=updateTool(start,{type:'tool_execution_end',isError:true,result:{content:[{type:'text',text:'Permission denied'}]}});
 const merged=mergeMessage({role:'assistant',tools:[end]},publicMessage({role:'assistant',content:[{type:'toolCall',id:'x',name:'write',arguments:{path:'index.html'}}]}));
 assert.equal(merged.tools[0].status,'error');assert.equal(merged.tools[0].output,'Permission denied');
 const history=publicMessages([{role:'assistant',content:[{type:'toolCall',id:'x',name:'edit',arguments:{path:'style.css'}}]},{role:'toolResult',toolCallId:'x',isError:false,content:[{type:'text',text:'Changed'}]}]);
 assert.equal(history[0].tools[0].status,'done');assert.equal(history[0].tools[0].path,'style.css');
});

test('compaction summaries survive session history and stay separate from answers',()=>{
 const messages=publicMessages([
  {role:'compactionSummary',summary:'## Goal\nСделать сайт',tokensBefore:120000,timestamp:7},
  {role:'branchSummary',summary:'Ветка про дизайн',timestamp:8},
  {role:'user',content:'Продолжай'},
  {role:'assistant',content:[{type:'text',text:'Хорошо'}]},
 ]);
 assert.equal(messages.length,4);
 assert.equal(messages[0].role,'summary');assert.equal(messages[0].kind,'compaction');
 assert.equal(messages[0].text,'## Goal\nСделать сайт');assert.equal(messages[0].tokensBefore,120000);
 assert.equal(messages[1].kind,'branch');assert.equal(messages[1].text,'Ветка про дизайн');
 assert.equal(messages[2].role,'user');assert.equal(messages[3].role,'assistant');
 assert.equal(publicMessage({role:'compactionSummary',summary:'',timestamp:1}).text,'');
});

test('replaceMessages drops history that compaction removed while keeping matching entries',async()=>{
 const {replaceMessages}=await import('./web-messages.mjs');
 const previous=[
  {role:'user',text:'Старое',timestamp:1},
  {role:'assistant',text:'Старый ответ',timestamp:2},
  {role:'assistant',text:'Достроенный',timestamp:3,status:'streaming',tools:[{id:'t'}]},
 ];
 const next=[
  {role:'summary',text:'Кратко',timestamp:10},
  {role:'assistant',text:'Достроенный',timestamp:3,tools:[{id:'t',status:'done'}]},
 ];
 const merged=replaceMessages(previous,next);
 assert.equal(merged.length,2);
 assert.equal(merged[0].role,'summary');
 assert.equal(merged[1].tools[0].status,'done');
 assert.ok(!merged.some((message)=>message.text==='Старый ответ'));
});
