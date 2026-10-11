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
