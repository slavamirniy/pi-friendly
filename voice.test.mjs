import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createVoiceService,appendDictation} from './voice.mjs';
import {platformAsset,download,hashFile} from './voice-setup.mjs';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
function fixture(){
 const child=new EventEmitter(),sent=[],states=[],texts=[],errors=[];
 child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.stdin.writable=true;child.stdin.write=s=>sent.push(JSON.parse(s));child.kill=()=>{child.killed=true;};
 const voice=createVoiceService({root:'unused',prepare:async()=>({python:'python',modelDir:'model'}),spawnWorker:()=>child,onState:s=>states.push(s),onText:(...s)=>texts.push(s),onError:s=>errors.push(s)});
 const event=data=>child.stdout.emit('data',Buffer.from(JSON.stringify(data)+'\n'));
 return {voice,child,sent,states,texts,errors,event};
}
test('voice requires a click to record, stops on second click and returns a draft without sending',async()=>{
 const h=fixture();await h.voice.start();h.event({type:'ready'});assert.equal(h.sent.length,0);
 h.voice.toggle('chat-a');const id=h.sent.at(-1).id;assert.equal(h.sent.at(-1).type,'start');
 h.event({type:'recording',id,seconds:61,level:.7});assert.equal(h.voice.state.seconds,61);
 h.voice.toggle('chat-a');assert.equal(h.sent.at(-1).type,'stop');
 h.event({type:'transcribing',id,percent:51});assert.equal(h.voice.state.percent,51);
 h.event({type:'text',id,text:'Привет, мир.'});assert.deepEqual(h.texts,[['Привет, мир.','chat-a']]);
 h.voice.dispose();assert.ok(h.child.killed);
});
test('session change cancels recording and ignores a late transcript',async()=>{
 const h=fixture();await h.voice.start();h.event({type:'ready'});h.voice.toggle('old');const id=h.sent.at(-1).id;
 h.voice.cancel();h.event({type:'text',id,text:'Не вставлять в новый чат'});assert.deepEqual(h.texts,[]);assert.equal(h.sent.at(-1).type,'cancel');h.voice.dispose();
});
test('permission error does not trap microphone and existing typed text survives dictation',async()=>{
 const h=fixture();await h.voice.start();h.event({type:'ready'});h.voice.toggle('a');h.event({type:'error',message:'Разрешите микрофон'});h.event({type:'ready'});
 assert.equal(h.voice.state.phase,'ready');assert.equal(h.errors[0],'Разрешите микрофон');
 assert.equal(appendDictation('Уже написал','ещё текст'),'Уже написал ещё текст');assert.equal(appendDictation('Текст\n','Продолжение'),'Текст\nПродолжение');h.voice.dispose();
});
test('supported platforms use pinned archives and unsupported architectures fail clearly',()=>{
 for(const [os,arch] of [['win32','x64'],['linux','x64'],['darwin','x64'],['darwin','arm64']])assert.match(platformAsset(os,arch)[1],/^[a-f0-9]{64}$/);
 assert.throws(()=>platformAsset('linux','ia32'),/Windows/);
});
test('download verifies checksum, reuses valid cache and repairs corrupt files',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pi-voice-test-'));t.after(async()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});});
 const old=globalThis.fetch,data=Buffer.from('model fixture'),sha=createHash('sha256').update(data).digest('hex');let count=0;
 globalThis.fetch=async()=>{count++;return new Response(data,{headers:{'content-length':String(data.length)}});};t.after(()=>{globalThis.fetch=old;});
 const path=join(dir,'model');await download('https://example.test/model',path,sha);assert.equal(await hashFile(path),sha);
 await download('https://example.test/model',path,sha);assert.equal(count,1);
 await writeFile(path,'bad');await download('https://example.test/model',path,sha);assert.equal(count,2);assert.equal(await readFile(path,'utf8'),'model fixture');
 await assert.rejects(download('https://example.test/model',join(dir,'bad'), '0'.repeat(64)),/Проверка/);
});

test('interrupted model download resumes from its saved byte offset',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pi-voice-resume-'));t.after(async()=>{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});});
 const path=join(dir,'model'),data=Buffer.from('abcdef'),sha=createHash('sha256').update(data).digest('hex');await writeFile(path+'.part','abc');
 const old=globalThis.fetch;t.after(()=>{globalThis.fetch=old;});
 globalThis.fetch=async(_url,options)=>{assert.equal(options.headers.Range,'bytes=3-');return new Response('def',{status:206,headers:{'content-range':'bytes 3-5/6','content-length':'3'}});};
 await download('https://example.test/model',path,sha);assert.equal(await readFile(path,'utf8'),'abcdef');
});

test('wave history follows real samples, stays bounded and resets for each recording',async()=>{
 const h=fixture();await h.voice.start();h.event({type:'ready'});h.voice.toggle('a');let id=h.sent.at(-1).id;
 for(let i=0;i<520;i++)h.event({type:'recording',id,level:i/520,seconds:52});
 assert.equal(h.voice.state.levels.length,512);assert.equal(h.voice.state.levels[0],8/520);assert.equal(h.voice.state.levels.at(-1),519/520);
 h.voice.toggle('a');h.event({type:'ready'});h.voice.toggle('a');id=h.sent.at(-1).id;
 h.event({type:'recording',id,level:.5,seconds:0});assert.deepEqual(h.voice.state.levels,[.5]);h.voice.dispose();
});
