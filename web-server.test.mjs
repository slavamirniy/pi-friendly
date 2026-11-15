import test from 'node:test';
import assert from 'node:assert/strict';
import {startWebServer,publicMessage} from './web-server.mjs';
async function fixture(t,{host=false,options={}}={}){
 const projectsList=[{cwd:process.cwd(),name:'Проект'}],sessions=[{cwd:process.cwd(),path:'/test/chat.jsonl',firstMessage:'Привет',modified:new Date().toISOString(),messageCount:2}];
 const conversation=options.messages||[{role:'user',content:'Привет'}];
 const calls=[];let emit;
 const projects={list:()=>projectsList,isProject:()=>true,create:name=>{if(!name?.trim())throw new Error('Введите название');const p={cwd:process.cwd()+'/new',name};projectsList.push(p);return p;},createChat:cwd=>{const s={cwd,path:'/test/new.jsonl'};sessions.push(s);return s.path;},attach:value=>{const p={cwd:value,name:'Attached'};projectsList.push(p);return p;}};
 const web=await startWebServer({projects,listSessions:async()=>sessions,readSession:()=>conversation,models:()=>[{id:'test',name:'Тест',provider:'local'}],hostSession:()=>host?sessions[0].path:undefined,makeRpc:options=>{calls.push(options);emit=options.onEvent;return{request:async(type,data)=>{calls.push({type,data});if(type==='get_state')return{model:{id:'test',provider:'local'}};if(type==='get_messages')return{messages:conversation};if(type==='prompt')emit({type:'agent_start'});},respond:data=>calls.push(data),dispose:async()=>calls.push('dispose')};},...options});
 t.after(()=>web.close());let cookie;
 const request=async(path,data,headers={})=>{const res=await fetch(web.origin+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});return{status:res.status,data:await res.json()};};
 const res=await fetch(web.origin+'/api/auth',{method:'POST',body:JSON.stringify({token:web.url.split('#')[1]})});cookie=res.headers.get('set-cookie').split(';')[0];
 const state=async()=>{const res=await fetch(web.origin+'/api/events',{headers:{cookie}});const reader=res.body.getReader();const {value}=await reader.read();await reader.cancel();return JSON.parse(new TextDecoder().decode(value).split('data: ')[1].split('\n')[0]);};
 return{web,request,calls,state,emit:e=>emit(e)};
}
test('local server requires authentication and rejects foreign origins',async t=>{
 const h=await fixture(t);assert.equal((await fetch(h.web.origin+'/api/catalog')).status,401);
 assert.equal((await h.request('catalog',undefined,{Origin:'https://example.com'})).status,403);
 assert.equal((await h.request('auth',{token:'wrong'})).status,403);
 assert.equal((await fetch(h.web.origin+'/../package.json')).status,404);
 assert.equal((await h.request('catalog')).data.projects.length,1);
});
test('project-specific session, streaming, extension UI and stop are connected',async t=>{
 const h=await fixture(t),catalog=(await h.request('catalog')).data.projects;
 assert.equal((await h.request('open',{id:catalog[0].chats[0].id})).status,200);const s=await h.state();assert.equal(h.calls[0].cwd,process.cwd());
 assert.equal((await h.request('prompt',{chat:'wrong',text:'нет'})).status,400);
 assert.equal((await h.request('prompt',{chat:s.active.id,text:'Привет'})).status,200);
 assert.equal((await h.request('new-chat',{project:catalog[0].id})).status,400);
 h.emit({type:'message_start',message:{role:'assistant',content:[]}});h.emit({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'Ответ'}});
 h.emit({type:'extension_ui_request',id:'q',method:'confirm',title:'Продолжить?'});
 h.emit({type:'extension_ui_request',method:'setStatus',statusKey:'quota',statusText:'Осталось 100'});
 const live=await h.state();assert.equal(live.messages.at(-1).text,'Ответ');assert.equal(live.questions[0].id,'q');assert.equal(live.statuses.quota,'Осталось 100');
 assert.equal((await h.request('answer',{chat:s.active.id,id:'q',confirmed:true})).status,200);
 assert.ok(h.calls.some(c=>c.id==='q'&&c.confirmed===true));assert.equal((await h.request('abort',{chat:s.active.id})).status,200);
});
test('terminal-owned chat stays read only; new project uses its own folder',async t=>{
 const h=await fixture(t,{host:true});const p=(await h.request('catalog')).data.projects[0];const opened=await h.request('open',{id:p.chats[0].id});assert.equal(opened.data.active.readOnly,true);assert.equal(h.calls.length,0);
 assert.equal((await h.request('prompt',{chat:opened.data.active.id,text:'нет'})).status,400);
 const created=await h.request('create-project',{name:'Новый'});assert.equal(created.status,200);assert.equal(h.calls[0].cwd,process.cwd()+'/new');assert.equal(created.data.active.projectName,'Новый');
});
test('public messages expose model thinking separately and keep hostile strings as data',()=>{
 const message=publicMessage({role:'assistant',content:[{type:'thinking',thinking:'hidden'},{type:'text',text:'<script>alert(1)</script>'}]});assert.equal(message.text,'<script>alert(1)</script>');assert.equal(message.thinking,'hidden');
});

test('unchanged model avoids redundant RPC; explicit choice is persisted',async t=>{
 const saved=[];const h=await fixture(t,{options:{getPreferredModel:()=>({id:'test',provider:'local',name:'Тест'}),onModelSelected:m=>saved.push(m)}});
 const p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 assert.equal(h.calls.filter(c=>c.type==='set_model').length,0);
 const state=await h.state();await h.request('model',{chat:state.active.id,id:'test',provider:'local'});
 assert.equal(saved[0].id,'test');await h.request('new-chat',{project:p.id});
 assert.equal(h.calls.filter(c=>c.type==='set_model').length,1);
});
test('exit rejects an active host and calls shutdown only after disposal',async t=>{
 let idle=false,exit;const exited=new Promise(resolve=>exit=resolve);
 const h=await fixture(t,{options:{canExit:()=>idle,onExit:()=>exit()}});
 assert.equal((await h.request('close',{})).status,400);assert.equal(h.web.closed,false);
 idle=true;assert.equal((await h.request('close',{})).status,200);await exited;assert.equal(h.web.closed,true);
});
test('tool results and streamed drafts survive an empty final snapshot',async t=>{
 const h=await fixture(t),p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 h.emit({type:'message_start',message:{role:'assistant',content:[]}});
 h.emit({type:'message_update',assistantMessageEvent:{type:'thinking_delta',delta:'Проверю файлы'}});
 h.emit({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'Часть ответа'}});
 h.emit({type:'tool_execution_start',toolCallId:'x',toolName:'write',args:{path:'index.html'}});
 h.emit({type:'tool_execution_end',toolCallId:'x',toolName:'write',isError:true,result:{content:[{type:'text',text:'Ошибка записи'}]}});
 h.emit({type:'message_end',message:{role:'assistant',content:[],stopReason:'error',errorMessage:'Router error'}});
 assert.equal((await h.state()).error,null);h.emit({type:'agent_settled'});
 const state=await h.state(),last=state.messages.at(-1);assert.equal(last.text,'Часть ответа');assert.equal(last.thinking,'Проверю файлы');assert.equal(last.tools[0].status,'error');assert.equal(last.tools[0].output,'Ошибка записи');assert.equal(state.error,'Router error');
});

test('transient connection errors stay hidden through retry and disappear after success',async t=>{
 const h=await fixture(t),p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 h.emit({type:'agent_start'});h.emit({type:'message_start',message:{role:'assistant',content:[]}});
 h.emit({type:'message_end',message:{role:'assistant',content:[],errorMessage:'Connection failed',stopReason:'error'}});
 assert.equal((await h.state()).error,null);
 h.emit({type:'auto_retry_start',attempt:1,maxAttempts:3});assert.equal((await h.state()).busy,true);
 h.emit({type:'message_start',message:{role:'assistant',content:[]}});
 h.emit({type:'message_end',message:{role:'assistant',content:'Готово',stopReason:'stop'}});
 h.emit({type:'agent_settled'});assert.equal((await h.state()).error,null);assert.equal((await h.state()).busy,false);
});

test('folder dialog cancellation is harmless; selected folder is attached without creating chats',async t=>{
 let selected,attached;const project={name:'Existing',cwd:process.cwd()};
 const h=await fixture(t,{options:{pickProjectFolder:async()=>selected,projects:{list:()=>attached?[project]:[],isProject:()=>true,markOpened(){},attach:path=>{attached=path;return project;}}}});
 const cancel=await h.request('attach-project',{});assert.equal(cancel.data.cancelled,true);assert.equal(attached,undefined);
 selected=project.cwd;const result=await h.request('attach-project',{});assert.equal(result.status,200);assert.equal(attached,selected);assert.equal(result.data.projects[0].name,'Existing');assert.equal(h.calls.length,0);
});

test('web folder browser lists directories and attach-project accepts an explicit path',async t=>{
 const h=await fixture(t);
 const home=await h.request('browse-folders');
 assert.equal(home.status,200);assert.ok(home.data.entries.length>=0);assert.ok(home.data.path);
 const sub=await h.request('browse-folders?path='+encodeURIComponent(home.data.path));
 assert.equal(sub.status,200);
 const attached=await h.request('attach-project',{path:home.data.path});
 assert.equal(attached.status,200);assert.ok(attached.data.project);
});

test('bundled router preview crosses RPC independently of model text and resets between requests',async t=>{
 const h=await fixture(t),p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 h.emit({type:'agent_start'});h.emit({type:'friendly_router_progress',progress:{state:'generating',preview:'Подготовка',quota:123,available:877}});
 assert.equal((await h.state()).routerProgress.preview,'Подготовка');
 h.emit({type:'friendly_router_progress',progress:{state:'retrying',preview:'Новый фрагмент',quota:0}});assert.equal((await h.state()).routerProgress.preview,'Новый фрагмент');
 h.emit({type:'agent_start'});assert.equal((await h.state()).routerProgress,null);
});


test('web entry and its local module dependencies are served as JavaScript',async t=>{
 const h=await fixture(t),queue=['/app.js'],seen=new Set();
 while(queue.length){
  const path=queue.shift();if(seen.has(path))continue;seen.add(path);
  const res=await fetch(h.web.origin+path);
  assert.equal(res.status,200,path);assert.match(res.headers.get('content-type'),/javascript/,path);
  const code=await res.text();assert.ok(code.length>0,path);
  for(const match of code.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))queue.push(new URL(match[1],h.web.origin+path).pathname);
 }
 assert.ok(seen.has('/message-versions.js'));
});

test('messages sent while the agent runs are queued as follow-ups',async t=>{
 const h=await fixture(t),p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 const state=await h.state();
 assert.equal((await h.request('prompt',{chat:state.active.id,text:'Первый'})).status,200);
 assert.equal((await h.state()).busy,true);
 const queued=await h.request('prompt',{chat:state.active.id,text:'После ответа'});
 assert.equal(queued.status,200);assert.equal(queued.data.queued,true);
 const payload=h.calls.filter(c=>c.type==='prompt').at(-1);
 assert.equal(payload.data.message,'После ответа');assert.equal(payload.data.streamingBehavior,'followUp');
 h.emit({type:'queue_update',steering:[],followUp:['После ответа']});
 assert.deepEqual((await h.state()).queue.followUp,['После ответа']);
 h.emit({type:'queue_update',steering:[],followUp:[]});
 assert.deepEqual((await h.state()).queue.followUp,[]);
});

function customRpc(handler){
 return options=>{
  const emit=options.onEvent;
  return {
   request:async(type,data={})=>handler({type,data,emit}),
   respond(){},
   dispose:async()=>{},
  };
 };
}

test('clear-queue returns pending texts and empties the visible queue',async t=>{
 let emit;
 const h=await fixture(t,{options:{makeRpc:customRpc(({type,emit:onEvent})=>{
  emit=onEvent;
  if(type==='get_state')return{model:{id:'test',provider:'local'},isStreaming:true};
  if(type==='get_messages')return{messages:[{role:'user',content:'Привет'}]};
  if(type==='prompt'){emit({type:'agent_start'});return{};}
  if(type==='clear_queue')return{followUp:['Очередь'],steering:[]};
  return{};
 })}});
 const p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 const state=await h.state();
 emit({type:'agent_start'});emit({type:'queue_update',steering:[],followUp:['Очередь']});
 const cleared=await h.request('clear-queue',{chat:state.active.id});
 assert.equal(cleared.status,200);assert.deepEqual(cleared.data.followUp,['Очередь']);
 assert.deepEqual((await h.state()).queue.followUp,[]);
});

test('forking the first user message creates a real empty chat and sends the edited text',async t=>{
 const calls=[];
 const h=await fixture(t,{options:{makeRpc:customRpc(({type,data,emit})=>{
  calls.push({type,data});
  if(type==='get_state')return{model:{id:'test',provider:'local'},isStreaming:false,sessionFile:'/test/new.jsonl'};
  if(type==='get_messages')return{messages:[{role:'user',content:'Привет'}]};
  if(type==='get_fork_messages')return{messages:[{entryId:'entry-1',text:'Привет'}]};
  if(type==='fork')return{};
  if(type==='prompt'){emit({type:'agent_start'});return{};}
  if(type==='clear_queue')return{steering:[],followUp:[]};
  return{};
 })}});
 const p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 const before=await h.state();
 const result=await h.request('fork',{chat:before.active.id,index:0,text:'Исправлено'});
 assert.equal(result.status,200);
 assert.equal(calls.some(c=>c.type==='fork'),false);
 assert.equal(calls.find(c=>c.type==='prompt').data.message,'Исправлено');
 assert.match(result.data.active.name,/Чат/);
 assert.equal(result.data.busy,true);
});

test('forking a later user message asks pi to create a branched session',async t=>{
 const calls=[];
 const conversation=[
  {role:'user',content:[{type:'text',text:'Первый'}],timestamp:1},
  {role:'assistant',content:[{type:'text',text:'Ответ'}],timestamp:2,stopReason:'stop'},
  {role:'user',content:[{type:'text',text:'Второй'}],timestamp:3},
 ];
 const h=await fixture(t,{options:{
  readSession:()=>conversation,
  makeRpc:customRpc(({type,data,emit})=>{
   calls.push({type,data});
   if(type==='get_state')return{model:{id:'test',provider:'local'},isStreaming:false,sessionFile:'/test/branch.jsonl'};
   if(type==='get_messages')return{messages:conversation};
   if(type==='get_fork_messages')return{messages:[{entryId:'entry-1',text:'Первый'},{entryId:'entry-2',text:'Второй'}]};
   if(type==='fork')return{};
   if(type==='prompt'){emit({type:'agent_start'});return{};}
   if(type==='clear_queue')return{steering:[],followUp:[]};
   return{};
  })}});
 const p=(await h.request('catalog')).data.projects[0];await h.request('open',{id:p.chats[0].id});
 const before=await h.state();
 const result=await h.request('fork',{chat:before.active.id,index:2,text:'Исправлено'});
 assert.equal(result.status,200);
 assert.equal(calls.find(c=>c.type==='fork').data.entryId,'entry-2');
 assert.equal(calls.find(c=>c.type==='prompt').data.message,'Исправлено');
 assert.match(result.data.active.name,/Чат/);
 assert.equal(result.data.busy,true);
});

const tick=()=>new Promise(resolve=>setTimeout(resolve,30));

test('the first prompt gives a new chat a clean AI title',async t=>{
 const seen=[];
 const h=await fixture(t,{options:{
  readSession:()=>[],messages:[],
  generateTitle:async(text,signal)=>{seen.push({text,signal});return '```\nНазвание: Сайт пекарни.\n```';},
 }});
 const p=(await h.request('catalog')).data.projects[0];
 const created=await h.request('new-chat',{project:p.id});
 const chat=created.data.active.id;
 assert.equal((await h.request('prompt',{chat,text:'Сделай сайт пекарни'})).status,200);
 await tick();
 assert.equal(seen.length,1);assert.equal(seen[0].text,'Сделай сайт пекарни');
 const state=await h.state();
 assert.equal(state.active.name,'Сайт пекарни');assert.equal(state.active.named,true);
 assert.ok(h.calls.some(c=>c.type==='set_session_name'&&c.data.name==='Сайт пекарни'));
});

test('a refused or broken title falls back to the first message',async t=>{
 for(const generateTitle of [
  async()=>'Извините, я не могу придумать название',
  async()=>{throw new Error('router down');},
  async()=>'https://example.com',
 ]){
  const h=await fixture(t,{options:{readSession:()=>[],messages:[],generateTitle}});
  const p=(await h.request('catalog')).data.projects[0];
  const created=await h.request('new-chat',{project:p.id});
  await h.request('prompt',{chat:created.data.active.id,text:'Сделай сайт пекарни'});
  await tick();
  const state=await h.state();
  assert.equal(state.active.name,'Сделай сайт пекарни');assert.equal(state.active.named,true);
  await h.web.close();
 }
});

test('slash commands do not trigger a title',async t=>{
 const seen=[];
 const h=await fixture(t,{options:{readSession:()=>[],messages:[],generateTitle:async text=>{seen.push(text);return 'Не должно использоваться';}}});
 const p=(await h.request('catalog')).data.projects[0];
 const created=await h.request('new-chat',{project:p.id});
 await h.request('prompt',{chat:created.data.active.id,text:'/help'});
 await tick();
 assert.deepEqual(seen,[]);
 const state=await h.state();
 assert.equal(state.active.name,'Новый чат');assert.equal(state.active.named,false);
});

test('an explicitly named chat keeps its name',async t=>{
 const seen=[];
 const sessions=[{cwd:process.cwd(),path:'/test/named.jsonl',name:'Уже назван',firstMessage:'Привет',modified:new Date().toISOString(),messageCount:2}];
 const h=await fixture(t,{options:{listSessions:async()=>sessions,generateTitle:async text=>{seen.push(text);return 'Другое';}}});
 const p=(await h.request('catalog')).data.projects[0];
 const opened=await h.request('open',{id:p.chats[0].id});
 await h.request('prompt',{chat:opened.data.active.id,text:'Измени что-нибудь'});
 await tick();
 assert.deepEqual(seen,[]);
 assert.equal((await h.state()).active.name,'Уже назван');
});
