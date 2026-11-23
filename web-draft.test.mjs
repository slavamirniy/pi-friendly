import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./web/app.js',import.meta.url),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));

function sendFixture(api){
  const nodes={draft:{value:'Мой вопрос'}};
  const storage=new Map();
  const hints=[];
  const context={
    onboarding:{submitted(){},dictated(){}},
    $:id=>nodes[id],
    state:{active:{id:'chat'},busy:false},
    store:(id,text)=>storage.set(id,text),
    saved:id=>storage.get(id)||'',
    autoGrow(){},
    renderStatus(){},
    showError(){},
    showHint:(text,error)=>hints.push([text,error]),
    beginTask(){},
    endTask(){},
    canQueue:()=>true,
    attachments:[],
    buildOutgoingText:(text)=>String(text||'').trim(),
    renderAttachments(){},
    api,
  };
  runInNewContext(between('function sendMessage(','function abortGeneration('),context);
  return {nodes,storage,hints,context,send:(text='Мой вопрос')=>context.sendMessage(text)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('sending clears the persisted draft before the response; later typing survives',async()=>{
  let finish;
  const h=sendFixture(()=>new Promise((resolve,reject)=>{finish={resolve,reject};}));
  h.send();
  assert.equal(h.nodes.draft.value,'');
  assert.equal(h.storage.get('chat'),'');
  h.nodes.draft.value='Следующий вопрос';
  h.storage.set('chat','Следующий вопрос');
  finish.resolve({});
  await tick();
  assert.equal(h.nodes.draft.value,'Следующий вопрос');
  assert.equal(h.storage.get('chat'),'Следующий вопрос');
});

test('rejected send restores draft in its original chat',async()=>{
  const h=sendFixture(async()=>{throw new Error('Rejected');});
  h.send();
  await tick();
  await tick();
  assert.equal(h.nodes.draft.value,'Мой вопрос');
  assert.equal(h.storage.get('chat'),'Мой вопрос');
  assert.ok(h.hints.some(([text,error])=>error&&/Rejected/.test(text)));
});

test('reload does not replay already consumed dictation',()=>{
  const nodes={draft:{value:''}},storage=new Map();
  const context={
    onboarding:{submitted(){},dictated(){}},projectCreationInFlight:false,
    performance:{now:()=>0},clockBase:0,clockAt:0,clockRequest:undefined,
    billingUI:{update(){}},$:id=>nodes[id],
    state:{active:{id:'chat'},messages:[]},
    page:'projects',lastChat:'chat',dictationId:undefined,pendingOpenId:null,
    store:(id,text)=>storage.set(id,text),saved:id=>storage.get(id)||'',
    autoGrow(){},showError(){},renderStatus(){},renderMessages(){},renderRoute(){},renderBranches(){},
    renderWindowChrome(){},clearDone(){},playDoneChime(){},markDone(){},
    projectOf:()=>undefined,
  };
  runInNewContext(between('function applyState(','function autoGrow('),context);
  const snapshot={active:{id:'chat'},messages:[],dictation:{id:'voice-1',chat:'chat',text:'Голосовой вопрос'}};
  context.applyState(snapshot);
  assert.equal(nodes.draft.value,'Голосовой вопрос');
  nodes.draft.value='';
  storage.set('chat','');
  context.dictationId=undefined;
  context.applyState(snapshot);
  assert.equal(nodes.draft.value,'');
});
