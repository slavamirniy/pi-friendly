import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createProjectStore} from './projects.mjs';
import {createRpc} from './web-rpc.mjs';
const packageDir=process.argv[2];if(!packageDir)throw new Error('Pass installed pi directory');
const {SessionManager}=await import(pathToFileURL(join(packageDir,'dist/core/session-manager.js')));
const root=await mkdtemp(join(tmpdir(),'pi-friendly-web-smoke-'));
const projects=createProjectStore({root:join(root,'projects'),registry:join(root,'registry.jsonl'),sessionDir:join(root,'sessions'),SessionManager});
const project=projects.create('Проверка веба'),path=projects.createChat(project.cwd);
const events=[];let finished;
const completion=new Promise(resolve=>{finished=resolve;});
const rpc=createRpc({cli:join(packageDir,'dist/bundle/cli.js'),cwd:project.cwd,path,onEvent:event=>{events.push(event);if(event.type==='agent_end'||event.type==='process_error')finished();if(event.type==='extension_ui_request'&&['confirm','select','input','editor'].includes(event.method))rpc.respond({id:event.id,cancelled:true});}});
try{
 const state=await rpc.request('get_state');assert.ok(state.sessionId);assert.deepEqual((await rpc.request('get_messages')).messages,[]);
 console.log('PASS: real pi RPC starts with isolated project and session.');
 if(process.argv.includes('--prompt')){
  await rpc.request('prompt',{message:'Тест интерфейса. Создай только в текущей рабочей папке файл web-smoke.txt с одной строкой PI_WEB_OK. Используй инструмент записи файла. Затем ответь кратко: готово.'});
  let timeout;try{await Promise.race([completion,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Response timed out')),120000);})]);}finally{clearTimeout(timeout);}
  assert.equal((await readFile(join(project.cwd,'web-smoke.txt'),'utf8')).trim(),'PI_WEB_OK');
  const messages=(await rpc.request('get_messages')).messages;assert.ok(messages.some(m=>m.role==='assistant'));assert.ok(events.some(e=>e.type==='message_update'));
  assert.equal(SessionManager.open(path).getCwd(),project.cwd);
  console.log('PASS: live model streamed, wrote file in correct project, and saved its history.');
 }
 console.log('Test files: '+root);
}finally{await rpc.dispose();}
