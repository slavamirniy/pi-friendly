import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurface,messageText,chatMessages} from './surface.mjs';
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const rendering={truncate:(s,w)=>s.slice(0,w),measure:s=>strip(s).length};
function fixture(w=100,h=30){
 const calls=[];const tui={terminal:{columns:w,rows:h},requestRender(){}};
 const data={scheme:'light',statuses:['Осталось 993 тыс.'],live:{role:'assistant',timestamp:1,content:[{type:'thinking',thinking:'PRIVATE THOUGHT'},{type:'text',text:'Привет! Чем могу помочь?'}]}};
 const ctx={isIdle:()=>true,model:{name:'Kimi K3'},sessionManager:{getBranch:()=>[]}};
 const actions=Object.fromEntries(['newChat','history','model','commands','theme','technical','more','submit','errorDetails'].map(k=>[k,()=>calls.push(k)]));
 const delegate={getText:()=>'',render:width=>['─'.repeat(width),'','─'.repeat(width)]};
 const surface=createSurface({tui,delegate,rendering,ctx,actions,state:()=>data});
 return{surface,tui,data,calls,ctx,delegate};
}
test('light chat hides thinking, shows answer and quota, commands button is absent',()=>{
 const h=fixture();const rows=h.surface.render(100).map(strip);const text=rows.join('\n');
 assert.ok(text.includes('Привет!'));assert.ok(text.includes('Осталось 993 тыс.'));assert.ok(!text.includes('PRIVATE THOUGHT'));assert.ok(!text.includes('Частые команды'));
 assert.ok(!text.includes('Команды'));
 assert.match(h.surface.render(100)[0],/48;2;255;255;255/);
});
test('all rendered rows fit viewport, sidebar targets do not overlap at short heights',()=>{
 for(const width of [44,60,80,100,140])for(const height of [12,16,24,35]){
  const h=fixture(width,height);const rows=h.surface.render(width);assert.equal(rows.length,height);assert.ok(rows.every(r=>strip(r).length===width),`${width}x${height}`);
 }
});
test('dark theme, tool progress and errors remain readable',()=>{
 const h=fixture();h.data.scheme='dark';h.data.widgets=[['Генерация · 12 с']];h.data.live.errorMessage='Connection failed';
 const text=h.surface.render(100).map(strip).join('\n');assert.ok(text.includes('Генерация · 12 с'));assert.ok(text.includes('Не удалось связаться с сервисом'));assert.ok(!text.includes('Connection failed'));assert.match(h.surface.render(100)[0],/48;2;26;29;33/);
});
test('live assistant replaces matching saved message instead of duplicating it',()=>{
 const old={role:'assistant',timestamp:1,content:[{type:'text',text:'old'}]};const live={...old,content:[{type:'text',text:'new'}]};
 assert.deepEqual(chatMessages({sessionManager:{getBranch:()=>[{type:'message',message:old}]}},live),[live]);
 assert.equal(messageText({content:[{type:'thinking',thinking:'hidden'},{type:'image'}]}),'[Прикреплено изображение]');
});

test('errors stay visible over progress and open technical details',()=>{
 const h=fixture();h.data.error={raw:'HTTP 429 too many requests'};h.data.widgets=[['Progress is running']];
 const rows=h.surface.render(100).map(strip);assert.ok(rows.join('\n').includes('Слишком много запросов'));
 const y=rows.findIndex(r=>r.includes('Подробнее'));h.surface.onMouse(`\x1b[<0;30;${y+1}M`);assert.deepEqual(h.calls,['errorDetails']);
 for(const w of [44,60,100])for(const height of [12,20,30]){const f=fixture(w,height);f.data.error={raw:'HTTP 503 unavailable'};const r=f.surface.render(w).map(strip);assert.equal(r.length,height);assert.ok(r.every(l=>l.length===w));assert.ok(r.join('\n').includes('Подробнее'));}
});
test('three-row send target is usable without the bottom activity panel',()=>{
 for(const delta of [-1,0,1]){const h=fixture();h.delegate.getText=()=> 'Привет';const rows=h.surface.render(100).map(strip);const y=rows.findIndex(r=>r.includes('Отправить'));const x=rows[y].indexOf('Отправить');h.surface.onMouse(`\x1b[<0;${x+1};${y+1+delta}M`);assert.deepEqual(h.calls,['submit']);}
 const h=fixture();h.data.running=true;h.data.started=Date.now()-12000;h.data.steps=[{label:'Создаю файл · index.html',status:'done'},{label:'Проверяю сборку',status:'running'}];
 const text=h.surface.render(100).map(strip).join('\n');assert.ok(!text.includes('✓ Создаю файл'));assert.ok(!text.includes('Проверяю сборку'));assert.ok(!text.includes('Работаю ·'));
});

test('saved file actions survive reload, failures stay distinct and assistant headings do not repeat',()=>{
 const h=fixture(140,40);h.data.live=undefined;
 const messages=[
  {role:'assistant',content:[{type:'text',text:'Общие стили:'},{type:'toolCall',id:'w',name:'write',arguments:{path:'src/styles.css',content:'a\nb\n'}}]},
  {role:'toolResult',toolCallId:'w',toolName:'write',isError:false,content:[{type:'text',text:'raw tool response'}]},
  {role:'assistant',content:[{type:'toolCall',id:'e',name:'edit',arguments:{path:'src/app.js'}}]},
  {role:'toolResult',toolCallId:'e',toolName:'edit',isError:true,content:[{type:'text',text:'raw failure'}]},
  {role:'assistant',content:[{type:'thinking',thinking:'hidden'}]},
 ];
 h.ctx.sessionManager.getBranch=()=>messages.map(message=>({type:'message',message}));
 const text=h.surface.render(140).map(strip).join('\n');
 assert.ok(text.includes('✓ Файл записан · src/styles.css · строк: 2'));
 assert.ok(text.includes('! Обновляю файл · src/app.js'));assert.equal(text.match(/Помощник/g)?.length,1);
 assert.ok(!text.includes('raw tool response'));assert.ok(!text.includes('raw failure'));assert.ok(!text.includes('hidden'));
});
test('wide windows use available chat width and pending writes are not marked successful',()=>{
 const h=fixture(160,40);h.data.live={role:'assistant',content:[{type:'text',text:'Обновляю страницу'},{type:'toolCall',id:'pending',name:'write',arguments:{path:'index.html',content:'hello'}}]};
 const rows=h.surface.render(160).map(strip),row=rows.find(r=>r.includes('Обновляю страницу'));
 assert.ok(row.indexOf('Обновляю страницу')<35);assert.ok(rows.join('\n').includes('· Создаю файл · index.html'));assert.ok(!rows.join('\n').includes('✓ Файл записан'));
});
