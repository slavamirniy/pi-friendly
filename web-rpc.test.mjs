import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRpc} from './web-rpc.mjs';
test('RPC receives framed router progress from stderr across UTF-8 chunks',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',0));const received=[];
 const rpc=createRpc({cli:'test',cwd:'.',path:'test',spawnProcess:()=>child,onEvent:e=>received.push(e)});
 try{
  const raw=Buffer.from('PI_FRIENDLY_PROGRESS '+JSON.stringify({type:'friendly_router_progress',progress:{requestId:'request-123',state:'generating',preview:'Проверяю текст',elapsedMs:17000,quota:42,available:58,secret:'must-not-leak'}})+'\n');
  for(let i=0;i<raw.length;i+=3)child.stderr.write(raw.subarray(i,i+3));
  assert.equal(received.length,1);assert.equal(received[0].progress.preview,'Проверяю текст');assert.equal(received[0].progress.elapsedMs,17000);assert.equal(received[0].progress.quota,42);assert.ok(!JSON.stringify(received).includes('must-not-leak'));
  child.stderr.write('diagnostic line\nPI_FRIENDLY_PROGRESS invalid\nPI_FRIENDLY_PROGRESS {"type":"other"}\n');assert.equal(received.length,1);
  child.stderr.write('PI_FRIENDLY_PROGRESS {"type":"friendly_router_progress","progress":null}\n');assert.equal(received[1].progress,null);
 }finally{await rpc.dispose();}
});
