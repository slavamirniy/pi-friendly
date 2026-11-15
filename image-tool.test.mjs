import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runImageTool} from './image-tool.mjs';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';

test('image tool sends size, saves the image and metadata, and supports edits',async t=>{
 const cwd=await mkdtemp(join(tmpdir(),'pi-image-'));
 t.after(()=>rm(cwd,{recursive:true,force:true}));
 const connection={baseURL:'https://router.example/v1',apiKey:'test'};
 const requests=[];
 const fake=async(url,opts)=>{
  requests.push({url:url.pathname,headers:opts.headers,body:opts.body});
  assert.equal(opts.headers.Authorization,'Bearer test');
  assert.equal(opts.headers['Idempotency-Key'],'test-request');
  assert.equal(opts.redirect,'error');
  if(opts.body instanceof FormData){
   assert.equal(opts.body.get('size'),'1536x1024');
   assert.equal(opts.body.get('model'),'gpt-image-2.5');
   assert.equal(Buffer.from(await opts.body.get('image').arrayBuffer()).toString('base64'),png);
  }else{
   const body=JSON.parse(opts.body);
   assert.equal(body.size,'2560x1440');
   assert.equal(body.model,'gpt-image-2.5');
   assert.equal(body.response_format,'b64_json');
  }
  return Response.json({data:[{b64_json:png}]});
 };
 const first=await runImageTool({prompt:'обложка',size:'2560x1440',idempotencyKey:'test-request',sessionId:'chat-1'},cwd,connection,undefined,fake);
 assert.equal(first.details.image.width,1);
 assert.equal(first.details.image.height,1);
 assert.equal(first.details.image.chatId,'chat-1');
 assert.match(first.details.file,/^generated[\/]chat-1[\/].+\.png$/);
 const second=await runImageTool({prompt:'измени',source:first.details.file,size:'1536x1024',idempotencyKey:'test-request',sessionId:'chat-1'},cwd,connection,undefined,fake);
 assert.notEqual(second.details.file,first.details.file);
 assert.deepEqual(requests.map(item=>item.url),['/v1/images/generations','/v1/images/edits']);
 const files=await readdir(join(cwd,'generated','chat-1'));
 assert.equal(files.filter(name=>name.endsWith('.png')).length,2);
 assert.equal(files.filter(name=>name.endsWith('.json')).length,2);
 const meta=JSON.parse(await readFile(join(cwd,second.details.file.replace(/\.(png|jpg)$/,'.json')),'utf8'));
 assert.equal(meta.source,first.details.file);
 assert.equal(meta.size,'1536x1024');
});

test('image tool rejects invalid size and reports insufficient quota',async t=>{
 const cwd=await mkdtemp(join(tmpdir(),'pi-image-'));
 t.after(()=>rm(cwd,{recursive:true,force:true}));
 const connection={baseURL:'https://router.example/v1',apiKey:'test'};
 await assert.rejects(runImageTool({prompt:'x',size:'100x100'},cwd,connection,undefined,async()=>Response.json({})),/размер/);
 await assert.rejects(runImageTool({prompt:'x'},cwd,connection,undefined,async()=>Response.json({error:{code:'insufficient_quota',message:'Мало кредитов'}},{status:402})),(error)=>{assert.equal(error.status,402);assert.equal(error.code,'insufficient_quota');return /Мало кредитов/.test(error.message);});
});

test('image tool sends only the first reference image',async t=>{
 const cwd=await mkdtemp(join(tmpdir(),'pi-image-'));
 t.after(()=>rm(cwd,{recursive:true,force:true}));
 const data=Buffer.from(png,'base64');
 await (await import('node:fs/promises')).writeFile(join(cwd,'a.png'),data);
 await (await import('node:fs/promises')).writeFile(join(cwd,'b.png'),data);
 let images=0;
 const fake=async(url,opts)=>{
  assert.equal(url.pathname,'/v1/images/edits');
  assert.equal(opts.body.getAll('image').length,1);
  images=opts.body.getAll('image').length;
  return Response.json({data:[{b64_json:png}]});
 };
 const result=await runImageTool({prompt:'совмести',sources:['a.png','b.png'],size:'1024x1024'},cwd,{baseURL:'https://router.example/v1',apiKey:'test'},undefined,fake);
 assert.equal(images,1);
 assert.deepEqual(result.details.image.sources,['a.png']);
});
