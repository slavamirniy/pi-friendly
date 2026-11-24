import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
// pi sends one JSON message per line, so a whole chat history (get_messages) arrives as a
// single line. Long chats with big tool outputs easily reach tens of megabytes, so the cap
// must be generous, configurable and must never tear the child down: killing the process
// left the user with an unopenable chat. An oversized line is dropped and the connection
// stays usable.
export const DEFAULT_MAX_RESPONSE_BYTES=Number(process.env.PI_FRIENDLY_MAX_RESPONSE_BYTES)>0?Number(process.env.PI_FRIENDLY_MAX_RESPONSE_BYTES):256*1024*1024;
const tooLarge=limit=>new Error(`Ответ pi слишком большой (больше ${Math.max(1,Math.round(limit/1024/1024))} МБ).`);
// The installed pi CLI owns credentials, tools, extensions and project cwd.
export function createRpc({cli,cwd,path,model,onEvent=()=>{},spawnProcess=spawn,maxResponseBytes=DEFAULT_MAX_RESPONSE_BYTES}={}){
 const args=[cli,'--mode','rpc','--session',path];
 if(model?.id&&model?.provider)args.push('--provider',model.provider,'--model',model.id);
 const child=spawnProcess(process.execPath,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PI_FRIENDLY_WEB_CHILD:'1'}});
 const limit=Number.isFinite(maxResponseBytes)&&maxResponseBytes>0?maxResponseBytes:DEFAULT_MAX_RESPONSE_BYTES;
 const pending=new Map();let buffer='',stderr='',stderrBuffer='',closed=false,skipping=false;
 const fail=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
  // Discard the rest of a line that already exceeded the cap instead of buffering it.
  if(skipping){const end=chunk.indexOf('\n');if(end<0)return;skipping=false;chunk=chunk.slice(end+1);if(!chunk)return;}
  buffer+=chunk;
  let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let event;try{event=JSON.parse(line);}catch{continue;}
   if(event.type==='response'&&pending.has(event.id)){const p=pending.get(event.id);pending.delete(event.id);clearTimeout(p.timer);event.success?p.resolve(event.data):p.reject(new Error(event.error||'pi не выполнил действие.'));}
   else onEvent(event);
  }
  if(buffer.length>limit){buffer='';skipping=true;fail(tooLarge(limit));}
 });
 child.stderr.setEncoding('utf8');
 child.stderr.on('data',chunk=>{
  stderrBuffer+=chunk;
  if(stderrBuffer.length>65536){stderr=(stderr+stderrBuffer.slice(-1200)).slice(-1200);stderrBuffer='';return;}
  let i;while((i=stderrBuffer.indexOf('\n'))>=0){const line=stderrBuffer.slice(0,i).replace(/\r$/,'');stderrBuffer=stderrBuffer.slice(i+1);
   if(line.startsWith('PI_FRIENDLY_SUBAGENTS ')){
    try{const event=JSON.parse(line.slice('PI_FRIENDLY_SUBAGENTS '.length));if(event.type==='friendly_subagents'&&Array.isArray(event.subagents))onEvent({type:'friendly_subagents',subagents:event.subagents.slice(0,24)});}catch{}continue;
   }
   if(line.startsWith('PI_FRIENDLY_PROGRESS ')){
    try{const event=JSON.parse(line.slice('PI_FRIENDLY_PROGRESS '.length));if(event.type!=='friendly_router_progress')continue;const p=event.progress;
     if(p===null){onEvent({type:event.type,progress:null});continue;}
     if(!p||!['waiting','generating','retrying','streaming','completed','failed','cancelled'].includes(p.state)||typeof p.requestId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(p.requestId))continue;
     const number=n=>Number.isSafeInteger(n)&&n>=0?n:undefined;
     onEvent({type:event.type,progress:{requestId:p.requestId,state:p.state,preview:typeof p.preview==='string'?Array.from(p.preview).slice(-100).join(''):'',elapsedMs:number(p.elapsedMs),quota:number(p.quota),estimated:p.estimated!==false,available:number(p.available),attempt:number(p.attempt)}});
    }catch{}continue;
   }
   stderr=(stderr+line+'\n').slice(-1200);
  }
 });
 child.stdin.on('error',error=>fail(error));child.on('error',error=>{fail(error);onEvent({type:'process_error',message:error.message});});
 child.on('close',code=>{const wasClosed=closed;closed=true;fail(new Error('Процесс pi завершился. '+stderr));if(!wasClosed)onEvent({type:'process_error',message:`pi завершился (${code}). Откройте чат повторно.`});});
 return {
 request(type,data={},timeout=60000){if(closed)return Promise.reject(new Error('Соединение с pi закрыто.'));const id=randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('pi не ответил вовремя. Попробуйте открыть чат ещё раз.'));},timeout);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({...data,type,id})+'\n');});},
 respond(data){if(!closed)child.stdin.write(JSON.stringify({...data,type:'extension_ui_response'})+'\n');},
 async dispose(){if(closed)return;closed=true;fail(new Error('Чат закрыт.'));child.stdin.end();child.kill();await Promise.race([new Promise(resolve=>child.once('close',resolve)),new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},2000);timer.unref?.();})]);}
 };
}
