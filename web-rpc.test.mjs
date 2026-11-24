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
test('RPC forwards subagent snapshots from stderr and drops malformed frames',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',0));const received=[];
 const rpc=createRpc({cli:'test',cwd:'.',path:'test',spawnProcess:()=>child,onEvent:e=>received.push(e)});
 try{
  const snapshot=[{id:'a',agent:'scout',status:'running',task:'Разведка',items:[],usage:{input:1}}];
  child.stderr.write('PI_FRIENDLY_SUBAGENTS '+JSON.stringify({type:'friendly_subagents',subagents:snapshot})+'\n');
  assert.equal(received.length,1);assert.equal(received[0].type,'friendly_subagents');assert.equal(received[0].subagents[0].agent,'scout');
  child.stderr.write('PI_FRIENDLY_SUBAGENTS invalid\nPI_FRIENDLY_SUBAGENTS {"type":"other","subagents":[]}\nPI_FRIENDLY_SUBAGENTS {"type":"friendly_subagents","subagents":"no"}\n');
  assert.equal(received.length,1);
  child.stderr.write('PI_FRIENDLY_SUBAGENTS {"type":"friendly_subagents","subagents":'+JSON.stringify(Array.from({length:30},(_,i)=>({id:String(i),agent:'scout',status:'running'})))+'}\n');
  assert.equal(received[1].subagents.length,24);
 }finally{await rpc.dispose();}
});
test('a huge RPC frame is dropped without killing the chat process',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
 let killed=false;child.kill=()=>{killed=true;queueMicrotask(()=>child.emit('close',0));};
 let written='';child.stdin.on('data',chunk=>written+=chunk);
 const rpc=createRpc({cli:'test',cwd:'.',path:'test',spawnProcess:()=>child,maxResponseBytes:1024});
 try{
  const huge=rpc.request('get_messages',{});
  const head='{"type":"response","id":"x","success":true,"data":{"messages":"';
  child.stdout.write(head);
  child.stdout.write('a'.repeat(4096));
  // The frame ends and a small unrelated frame follows in the same chunk.
  child.stdout.write('"}}\n{"type":"event","type":"keep"}\n');
  await assert.rejects(huge,/слишком большой/);
  assert.equal(killed,false);
  // The connection still works after the dropped frame.
  const next=rpc.request('get_state',{});
  const id=JSON.parse(written.trim().split('\n').at(-1)).id;
  child.stdout.write(JSON.stringify({type:'response',id,success:true,data:{ok:1}})+'\n');
  assert.deepEqual(await next,{ok:1});
 }finally{await rpc.dispose();}
});
test('RPC accepts frames sized for long chats without a 32 MB cliff',async()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',0));
 let written='';child.stdin.on('data',chunk=>written+=chunk);
 const rpc=createRpc({cli:'test',cwd:'.',path:'test',spawnProcess:()=>child});
 try{
  const request=rpc.request('get_messages',{});
  const id=JSON.parse(written.trim().split('\n').at(-1)).id;
  const text='я'.repeat(40*1024*1024/2);
  child.stdout.write(JSON.stringify({type:'response',id,success:true,data:{messages:[{role:'assistant',content:text}]}})+'\n');
  const data=await request;
  assert.equal(data.messages[0].content.length,text.length);
 }finally{await rpc.dispose();}
});
