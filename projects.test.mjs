import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createProjectStore,validateProjectName,projectCatalog,folderKey} from './projects.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'pi-projects-test-'));t.after(()=>{assert.equal(dirname(realpathSync(root)),realpathSync(tmpdir()));rmSync(root,{recursive:true,force:true});});return root;}
const manager={create(cwd,dir){const file=join(dir,randomUUID()+'.jsonl');return{getSessionFile:()=>file,getHeader:()=>({type:'session',version:3,id:randomUUID(),cwd,timestamp:new Date().toISOString()})};}};
test('projects have distinct folders; duplicate names never reuse or overwrite files',t=>{
 const temp=fixture(t),store=createProjectStore({root:join(temp,'projects'),registry:join(temp,'registry.jsonl'),SessionManager:manager,sessionDir:temp});
 const a=store.create('Пекарня'),b=store.create('Пекарня');assert.notEqual(a.cwd,b.cwd);
 writeFileSync(join(a.cwd,'site.txt'),'A');assert.deepEqual(readdirSync(b.cwd),[]);
 const a1=store.createChat(a.cwd),a2=store.createChat(a.cwd),b1=store.createChat(b.cwd);
 assert.notEqual(a1,a2);assert.equal(JSON.parse(readFileSync(a1)).cwd,a.cwd);assert.equal(JSON.parse(readFileSync(a2)).cwd,a.cwd);assert.equal(JSON.parse(readFileSync(b1)).cwd,b.cwd);
 assert.equal(store.list().length,2);assert.equal(store.attach(a.cwd).cwd,a.cwd);assert.equal(store.list().length,2);
});
test('unsafe names cannot escape the project root and missing folders are not recreated',t=>{
 for(const name of ['../outside','a/b','a\\b','CON','..','bad.','a:b',''])assert.throws(()=>validateProjectName(name),undefined,name);
 const temp=fixture(t),store=createProjectStore({root:join(temp,'projects'),registry:join(temp,'registry.jsonl'),SessionManager:manager});
 assert.throws(()=>store.attach(join(temp,'missing')));assert.throws(()=>store.createChat(join(temp,'missing')));
 assert.deepEqual(readdirSync(temp),[]);
});
test('catalog preserves empty projects and exposes all chats directly in their project',()=>{
 const root=tmpdir(),a=join(root,'A'),b=join(root,'B');const catalog=projectCatalog([{cwd:a,path:'old',modified:'2020-01-01'},{cwd:a,path:'new',modified:'2026-01-01'}],[{cwd:b,name:'Empty'}],a);
 assert.equal(folderKey(catalog[0].cwd),folderKey(a));assert.deepEqual(catalog[0].chats.map(c=>c.path),['new','old']);assert.equal(catalog[1].chats.length,0);
});

test('only registered project folders can start a chat, never the launch folder',t=>{
 const temp=fixture(t),store=createProjectStore({root:join(temp,'projects'),registry:join(temp,'registry.jsonl'),SessionManager:manager,sessionDir:temp});
 const project=store.create('Сайт');
 assert.equal(store.isProject(temp),false);assert.equal(store.isProject(store.root),false);assert.equal(store.isProject(project.cwd),true);
 assert.throws(()=>store.createChat(temp),/проект/);assert.throws(()=>store.createChat(store.root),/проект/);
 assert.ok(store.createChat(project.cwd));
});
