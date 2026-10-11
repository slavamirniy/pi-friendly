import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {folderKey} from './projects.mjs';
import {clean} from './menu.mjs';
import {activityLabel} from './activity.mjs';
const key=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
import {publicMessage,publicMessages,mergeMessage,reconcileMessages,toolView,updateTool} from './web-messages.mjs';
export {publicMessage,publicMessages} from './web-messages.mjs';
export async function startWebServer({projects,listSessions,readSession,makeRpc,makeHostRpc,getHostStatuses=()=>[],models=()=>[],hostSession=()=>undefined,voice,port=0,onExit=()=>{},canExit=()=>true,getPreferredModel=()=>undefined,onModelSelected=()=>{},pickProjectFolder}){
 const token=randomBytes(32).toString('hex'),cookie='pf_'+randomBytes(6).toString('hex'),clients=new Set();
 let rpc,active,loading=false,navigating=false,disposed=false,allProjects=[],allSessions=[],generation=0,publishTimer,voiceOwned=false;
 let state={active:null,messages:[],busy:false,loading:false,error:null,notice:'',statuses:{},widgets:{},questions:[],voice:voice?.state||null,dictation:null};
 const snapshot=()=>({...state,statuses:{...state.statuses,...(active?.host?Object.fromEntries(getHostStatuses().map((s,i)=>['host-'+i,clean(s)])):{})},loading,active});
 const broadcast=()=>{clearTimeout(publishTimer);publishTimer=undefined;const data='data: '+JSON.stringify(snapshot())+'\n\n';for(const client of clients){if(client.writableLength>2*1024*1024){client.destroy();clients.delete(client);}else client.write(data);}};
 const changed=()=>{if(!publishTimer)publishTimer=setTimeout(broadcast,35);};
 const unsub=voice?.subscribe?.(event=>{if(event.type==='state'){state.voice=event.state;if(['ready','error'].includes(event.state.phase))voiceOwned=false;changed();}if(event.type==='text'&&event.context?.web){state.dictation={id:randomBytes(8).toString('hex'),text:event.text,chat:event.context.chat};voiceOwned=false;changed();}if(event.type==='error'&&voiceOwned){state.error=event.message;voiceOwned=false;changed();}});
 async function catalog(){allProjects=projects.list();const registered=new Set(allProjects.map(p=>folderKey(p.cwd)));allSessions=(await listSessions()).filter(s=>s.cwd&&registered.has(folderKey(s.cwd)));return allProjects.map(p=>({id:key(folderKey(p.cwd)),name:p.name,folder:p.cwd,chats:allSessions.filter(s=>folderKey(s.cwd)===folderKey(p.cwd)).sort((a,b)=>+new Date(b.modified)-+new Date(a.modified)).map(s=>({id:key(s.path),name:s.name||s.firstMessage?.slice(0,80)||'Новый разговор',modified:s.modified,count:s.messageCount||0,terminal:s.path===hostSession()}))}));}
 const ensureIdle=()=>{if(loading||navigating||state.busy||voiceOwned||!canExit())throw new Error('Сначала завершите запись или остановите ответ.');};
 function eventHandler(event,epoch){
  if(epoch!==generation||disposed)return;
  if(event.type==='agent_start'){state.busy=true;state.error=null;}
  if(event.type==='agent_end'){rpc?.request('get_messages').then(data=>{if(epoch===generation){state.messages=reconcileMessages(state.messages,publicMessages(data?.messages||[]));changed();}}).catch(()=>{});}
  if(event.type==='message_start'&&['user','assistant'].includes(event.message?.role))state.messages.push({...publicMessage(event.message),status:event.message.role==='assistant'?'streaming':'done'});
  if(event.type==='message_update'){
   const delta=event.assistantMessageEvent,index=state.messages.findLastIndex(m=>m.role==='assistant');
   if(index>=0){let last=state.messages[index];
    if(event.message)last=state.messages[index]=mergeMessage(last,{...publicMessage(event.message),status:'streaming'});
    else if(delta?.type==='text_delta')last.text+=delta.delta;
    else if(delta?.type==='thinking_delta')last.thinking=(last.thinking||'')+delta.delta;
    if(delta?.type==='toolcall_end'&&delta.toolCall&&!last.tools.some(t=>t.id===delta.toolCall.id))last.tools.push(toolView(delta.toolCall));
   }
  }
  if(event.type==='message_end'&&['user','assistant'].includes(event.message?.role)){const m=publicMessage(event.message);if(state.messages.at(-1)?.role===m.role)state.messages[state.messages.length-1]=mergeMessage(state.messages.at(-1),m,true);else state.messages.push(m);if(m.error)state.pendingError=m.error;}
  if(['tool_execution_start','tool_execution_update','tool_execution_end'].includes(event.type)){
   let found=false;
   for(const m of state.messages)m.tools=m.tools.map(tool=>{if(tool.id!==event.toolCallId)return tool;found=true;return updateTool(tool,event);});
   if(!found){let m=state.messages.findLast(m=>m.role==='assistant');if(!m){m=publicMessage({role:'assistant'});state.messages.push(m);}m.tools.push(updateTool(toolView({id:event.toolCallId,name:event.toolName,arguments:event.args}),event));}
  }
  if(event.type==='auto_retry_start'){state.busy=true;state.notice='';}
  if(event.type==='auto_retry_end'){state.notice='';if(!event.success){state.busy=false;state.error=event.finalError||'Не удалось восстановить подключение.';}}
  if(event.type==='agent_settled'){state.busy=false;const last=state.messages.findLast(m=>m.role==='assistant');state.error=last?.error||null;state.pendingError=null;state.notice='';}
  if(event.type==='agent_end')for(const m of state.messages)if(m.status==='streaming')m.status='done';
  if(event.type==='process_error'){state.busy=false;state.error=event.message;for(const m of state.messages){if(m.status==='streaming')m.status='stopped';for(const t of m.tools)if(t.status==='running')t.status='stopped';}}
  if(event.type==='extension_ui_request'){
   if(['select','confirm','input','editor'].includes(event.method)){state.questions.push({...event,expires:event.timeout?Date.now()+event.timeout:null});}
   if(event.method==='notify'){if(event.notifyType==='error'){if(state.busy)state.pendingError=clean(event.message);else state.error=clean(event.message);}else if(!state.busy)state.notice=clean(event.message);}
   if(event.method==='setStatus'){if(event.statusText)state.statuses[event.statusKey]=clean(event.statusText);else delete state.statuses[event.statusKey];}
   if(event.method==='setWidget'){if(event.widgetLines)state.widgets[event.widgetKey]=event.widgetLines.map(clean);else delete state.widgets[event.widgetKey];}
   if(event.method==='set_editor_text')state.dictation={id:event.id,text:event.text,chat:active?.id,replace:true};
  }
  changed();
 }
 async function openSession(session){
  loading=true;state.error=null;changed();const epoch=++generation;
  try{
   if(rpc)await rpc.dispose();rpc=undefined;
   const p=allProjects.find(p=>folderKey(p.cwd)===folderKey(session.cwd));if(!p||!projects.isProject(p.cwd))throw new Error('Выберите существующий проект.');
   projects.markOpened?.(p.cwd);
   active={id:key(session.path),projectId:key(folderKey(p.cwd)),projectName:p.name,name:session.name||session.firstMessage?.slice(0,80)||'Новый разговор',host:session.path===hostSession(),readOnly:session.path===hostSession()&&!makeHostRpc};
   state={...state,messages:publicMessages(readSession(session.path)),busy:false,error:null,notice:'',questions:[],statuses:{},widgets:{}};
   if(!active.readOnly){rpc=(session.path===hostSession()&&makeHostRpc?makeHostRpc:makeRpc)({cwd:p.cwd,path:session.path,onEvent:e=>eventHandler(e,epoch)});const [current,messages]=await Promise.all([rpc.request('get_state'),rpc.request('get_messages')]);active.model=current?.model?{id:current.model.id,provider:current.model.provider,name:current.model.name}:null;state.busy=Boolean(current?.isStreaming);const preferred=getPreferredModel();if(preferred&&!state.busy){await rpc.request('set_model',{provider:preferred.provider,modelId:preferred.id});active.model={id:preferred.id,provider:preferred.provider,name:preferred.name};}state.messages=publicMessages(messages?.messages||[]);}
  }catch(error){if(rpc)await rpc.dispose();rpc=undefined;state.error=error.message;throw error;}
  finally{loading=false;broadcast();}
 }
 async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw new Error('Слишком большое сообщение.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
 let origin;
 const server=createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   if(req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin){reply(403,{error:'Запрос с другого адреса запрещён.'});return;}
   const url=new URL(req.url,origin);
   const safeHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
   for(const [k,v]of Object.entries(safeHeaders))res.setHeader(k,v);
   if(req.method==='POST'&&url.pathname==='/api/auth'){
    const data=await body(req),supplied=Buffer.from(String(data.token||'')),expected=Buffer.from(token);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){reply(403,{error:'Откройте веб-интерфейс кнопкой в pi.'});return;}
    res.setHeader('Set-Cookie',`${cookie}=${token}; HttpOnly; SameSite=Strict; Path=/`);reply(200,{ok:true});return;
   }
   if(url.pathname.startsWith('/api/')){
    if(!(req.headers.cookie||'').split(';').some(v=>v.trim()===`${cookie}=${token}`)){reply(401,{error:'Откройте веб-интерфейс кнопкой в pi.'});return;}
    if(req.method==='GET'&&url.pathname==='/api/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: '+JSON.stringify(snapshot())+'\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
    if(req.method==='GET'&&url.pathname==='/api/catalog'){reply(200,{projects:await catalog()});return;}
    if(req.method==='GET'&&url.pathname==='/api/models'){reply(200,{models:models().map(m=>({id:m.id,name:m.name||m.id,provider:m.provider}))});return;}
    if(req.method!=='POST'){reply(404,{error:'Неизвестное действие.'});return;}
    const data=await body(req),action=url.pathname.slice(5);
    if(action==='attach-project'){ensureIdle();if(!pickProjectFolder)throw new Error('Выбор папки недоступен в этом режиме.');navigating=true;try{const path=await pickProjectFolder();if(!path){reply(200,{cancelled:true});return;}const p=projects.attach(path);projects.markOpened?.(p.cwd);reply(200,{project:key(folderKey(p.cwd)),projects:await catalog()});}finally{navigating=false;}return;}
    if(action==='open-project'){await catalog();const p=allProjects.find(p=>key(folderKey(p.cwd))===data.project);if(!p)throw new Error('Проект не найден.');projects.markOpened?.(p.cwd);reply(200,{ok:true});return;}
    if(action==='create-project'){ensureIdle();navigating=true;try{const p=projects.create(data.name);await catalog();const path=projects.createChat(p.cwd);await openSession({path,cwd:p.cwd});reply(200,snapshot());}finally{navigating=false;}return;}
    if(action==='new-chat'){ensureIdle();navigating=true;try{await catalog();const p=allProjects.find(p=>key(folderKey(p.cwd))===data.project);if(!p)throw new Error('Сначала выберите проект.');const path=projects.createChat(p.cwd);await openSession({path,cwd:p.cwd});reply(200,snapshot());}finally{navigating=false;}return;}
    if(action==='open'){ensureIdle();navigating=true;try{await catalog();const session=allSessions.find(s=>key(s.path)===data.id);if(!session)throw new Error('Разговор не найден. Обновите проекты.');await openSession(session);reply(200,snapshot());}finally{navigating=false;}return;}
    if(action==='voice'){
     if(!voice)throw new Error('Голос ещё не готов. Откройте интерфейс из pi.');
     if(!active||data.chat!==active.id)throw new Error('Сначала откройте чат.');
     if(voice.state.phase==='recording'&&voiceOwned)voice.toggle({web:true,chat:active.id});
     else if(voice.state.phase==='ready'&&!state.busy&&!loading){voiceOwned=true;voice.toggle({web:true,chat:active.id});}
     else if(voice.state.phase==='error'){await voice.start();}else throw new Error('Для голосового ввода дождитесь загрузки модели или завершения записи.');
     reply(200,{ok:true});return;
    }
    if(action==='close'){ensureIdle();if(!canExit())throw new Error('Сначала остановите текущую работу.');navigating=true;reply(200,{ok:true});setTimeout(async()=>{await close();await onExit();},50);return;}
    if(!rpc||!active||active.readOnly)throw new Error(active?.readOnly?'Этот чат открыт в консоли. Создайте новый чат в этом проекте.':'Сначала откройте чат в проекте.');
    if(data.chat!==active.id)throw new Error('Чат был переключён в другом окне. Проверьте текущий разговор.');
    if(action==='prompt'){
     if(state.busy||loading||navigating||voiceOwned)throw new Error('Сначала дождитесь завершения текущего действия.');
     const message=String(data.text||'').trim();if(!message)throw new Error('Введите сообщение.');
     state.busy=true;state.error=null;state.notice='';changed();const epoch=generation;
     try{
      await rpc.request('prompt',{message},300000);
      void rpc.request('get_state').then(current=>{if(epoch===generation&&typeof current?.isStreaming==='boolean'){state.busy=current.isStreaming;changed();}}).catch(()=>{});
      reply(200,{ok:true});
     }catch(error){if(epoch===generation){state.busy=false;state.error=error.message;changed();}throw error;}
     return;
    }
    if(action==='abort'){await rpc.request('abort');state.busy=false;for(const m of state.messages){if(m.status==='streaming')m.status='stopped';for(const t of m.tools)if(t.status==='running')t.status='stopped';}changed();reply(200,{ok:true});return;}
    if(action==='model'){ensureIdle();const model=models().find(m=>m.id===data.id&&m.provider===data.provider);if(!model)throw new Error('Модель недоступна.');await rpc.request('set_model',{provider:model.provider,modelId:model.id});onModelSelected(model);active.model={id:model.id,name:model.name,provider:model.provider};changed();reply(200,{ok:true});return;}
    if(action==='answer'){const q=state.questions.find(q=>q.id===data.id);if(!q)throw new Error('Запрос уже закрыт.');rpc.respond({id:q.id,...(data.cancelled?{cancelled:true}:q.method==='confirm'?{confirmed:data.confirmed===true}:{value:String(data.value||'')})});state.questions=state.questions.filter(q=>q!==q);changed();reply(200,{ok:true});return;}
    reply(404,{error:'Неизвестное действие.'});return;
   }
   const assets={'/':['web/index.html','text/html'],'/app.js':['web/app.js','text/javascript'],'/app.css':['web/app.css','text/css']},asset=assets[url.pathname];
   if(req.method!=='GET'||!asset){reply(404,{error:'Страница не найдена.'});return;}
   res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8'});res.end(await readFile(fileURLToPath(new URL(asset[0],import.meta.url))));
  }catch(error){if(!res.headersSent)reply(400,{error:error.message});else res.end();}
 });
 const heartbeat=setInterval(()=>{for(const res of clients)res.write(': heartbeat\n\n');state.questions=state.questions.filter(q=>!q.expires||q.expires>Date.now());},15000);heartbeat.unref();
 async function close(){if(disposed)return;disposed=true;generation++;unsub?.();if(voiceOwned)voice?.cancel();clearInterval(heartbeat);clearTimeout(publishTimer);for(const client of clients)client.end();clients.clear();server.close();server.closeIdleConnections?.();await rpc?.dispose();}
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
 return {url:origin+'/#'+token,origin,close,get closed(){return disposed;}};
}
