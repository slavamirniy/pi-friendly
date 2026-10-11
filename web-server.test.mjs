import test from 'node:test';
import assert from 'node:assert/strict';
import {startWebServer,publicMessage} from './web-server.mjs';
async function fixture(t,{host=false}={}){
 const projectsList=[{cwd:process.cwd(),name:'Проект'}],sessions=[{cwd:process.cwd(),path:'/test/chat.jsonl',firstMessage:'Привет',modified:new Date().toISOString(),messageCount:2}];
 const calls=[];let emit;
 const projects={list:()=>projectsList,isProject:()=>true,create:name=>{if(!name?.trim())throw new Error('Введите название');const p={cwd:process.cwd()+'/new',name};projectsList.push(p);return p;},createChat:cwd=>{const s={cwd,path:'/test/new.jsonl'};sessions.push(s);return s.path;}};
 const web=await startWebServer({projects,listSessions:async()=>sessions,readSession:()=>[{role:'user',content:'Привет'}],models:()=>[{id:'test',name:'Тест',provider:'local'}],hostSession:()=>host?sessions[0].path:undefined,makeRpc:options=>{calls.push(options);emit=options.onEvent;return{request:async(type,data)=>{calls.push({type,data});if(type==='get_state')return{model:{id:'test',provider:'local'}};if(type==='get_messages')return{messages:[{role:'user',content:'Привет'}]};if(type==='prompt')emit({type:'agent_start'});},respond:data=>calls.push(data),dispose:async()=>calls.push('dispose')};}});
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
test('public messages omit reasoning and render hostile strings as data',()=>{
 const message=publicMessage({role:'assistant',content:[{type:'thinking',thinking:'hidden'},{type:'text',text:'<script>alert(1)</script>'}]});assert.equal(message.text,'<script>alert(1)</script>');assert.ok(!JSON.stringify(message).includes('hidden'));
});
