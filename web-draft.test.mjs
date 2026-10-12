import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');
function fixture(api){
 const nodes={draft:{value:'Мой вопрос'},composer:{}},storage=new Map();let pending;
 const context={performance:{now:()=>0},clockBase:0,clockAt:0,clockRequest:undefined,billingUI:{update(){}},$:id=>nodes[id],state:{active:{id:'chat'},messages:[]},api,store:(id,text)=>storage.set(id,text),saved:id=>storage.get(id)||'',autoGrow(){},showError(){},renderStatus(){},task:fn=>{pending=fn();},renderMessages(){},renderRoute(){},lastChat:'chat',dictationId:undefined};
 runInNewContext(source.slice(source.indexOf("$('composer').onsubmit="),source.indexOf("$('mic').onclick=")),context);
 return {nodes,storage,context,submit(){nodes.composer.onsubmit({preventDefault(){}});return pending;}};
}
test('sending clears the persisted draft before the response; later typing survives',async()=>{
 let finish;const h=fixture(()=>new Promise(r=>finish=r));const pending=h.submit();
 assert.equal(h.nodes.draft.value,'');assert.equal(h.storage.get('chat'),'');
 h.nodes.draft.value='Следующий вопрос';h.storage.set('chat','Следующий вопрос');finish({});await pending;
 assert.equal(h.nodes.draft.value,'Следующий вопрос');assert.equal(h.storage.get('chat'),'Следующий вопрос');
});
test('rejected send restores draft in its original chat',async()=>{
 const h=fixture(async()=>{throw new Error('Rejected');});await assert.rejects(h.submit(),/Rejected/);
 assert.equal(h.nodes.draft.value,'Мой вопрос');assert.equal(h.storage.get('chat'),'Мой вопрос');
});
test('reload does not replay already consumed dictation',()=>{
 const h=fixture(()=>{});h.nodes.draft.value='';h.context.state={active:{id:'chat'},messages:[]};
 runInNewContext(source.slice(source.indexOf('function applyState('),source.indexOf('function autoGrow(')),h.context);
 const snapshot={active:{id:'chat'},messages:[],dictation:{id:'voice-1',chat:'chat',text:'Голосовой вопрос'}};
 h.context.applyState(snapshot);assert.equal(h.nodes.draft.value,'Голосовой вопрос');
 h.nodes.draft.value='';h.storage.set('chat','');h.context.dictationId=undefined;
 h.context.applyState(snapshot);assert.equal(h.nodes.draft.value,'');
});
